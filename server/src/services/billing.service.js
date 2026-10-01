import mongoose from 'mongoose';
import { Shop, Product, ProductBatch, Customer, Invoice } from '../models/index.js';
import { hasPermission } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { financialYearOf, formatInvoiceNo, istYmd } from '../utils/financialYear.js';
import { computeInvoiceAmounts, resolvePlaceOfSupply, resolveSupplyType } from '../utils/gst.js';
import { mulDiv } from '../utils/money.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { assertQtyForUnit, toMilli } from '../utils/quantity.js';
import { withTransaction } from '../utils/transaction.js';
import { applyStockChange } from './stock.service.js';
import { ensureCounter, nextSequence } from './counter.service.js';

const IST = '+05:30';

// ---------------------------------------------------------------------------
// Draft: validates the cart and runs the pure calculation. No writes.
// Shared by /invoices/preview and POST /invoices so the two can never disagree.
// ---------------------------------------------------------------------------
async function buildDraft({ shopId, role }, input) {
  const shop = await Shop.findById(shopId).lean();
  if (!shop) throw ApiError.notFound('Shop not found');

  const taxable = shop.gstRegistrationType === 'REGULAR';
  const documentType = taxable ? 'TAX_INVOICE' : 'BILL_OF_SUPPLY';

  let customer = null;
  let snapshot = {};
  if (input.customerId) {
    customer = await Customer.findOne({ _id: input.customerId, shopId, isActive: true }).lean();
    if (!customer) throw ApiError.notFound('Customer not found');
    snapshot = {
      name: customer.name,
      phone: customer.phone,
      gstin: customer.gstin,
      stateCode: customer.stateCode,
      address: customer.address,
    };
  } else if (input.customer) {
    snapshot = { ...input.customer };
  }

  const placeOfSupplyStateCode = resolvePlaceOfSupply({
    shopStateCode: shop.stateCode,
    explicitStateCode: input.placeOfSupplyStateCode,
    customerGstin: snapshot.gstin,
    customerStateCode: snapshot.stateCode,
  });
  const supplyType = resolveSupplyType(shop.stateCode, placeOfSupplyStateCode);

  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids }, shopId, isActive: true }).lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw ApiError.badRequest(
      'Some products were not found or are inactive',
      missing.map((id) => ({ path: 'items', message: `Product ${id} not found or inactive` }))
    );
  }

  const canOverridePrice = hasPermission(role, 'invoice:override-price');

  const lines = input.items.map((item, idx) => {
    const product = byId.get(item.productId);
    const label = `Item ${idx + 1} (${product.name})`;
    assertQtyForUnit(product.unit, item.qty, `${label} qty`);

    const unitPricePaise = item.unitPricePaise ?? product.sellingPricePaise;
    if (unitPricePaise !== product.sellingPricePaise && !canOverridePrice) {
      throw ApiError.forbidden(`${label}: you are not allowed to change the selling price`);
    }

    // Bill of Supply shops charge no tax: the price is final.
    const gstRate = taxable ? product.gstRate : 0;
    const priceIncludesGst = taxable ? product.priceIncludesGst : false;

    // Selling above MRP (tax-inclusive) is illegal for packaged goods.
    if (product.mrpPaise != null) {
      const perUnitInclusive = priceIncludesGst ? unitPricePaise : mulDiv(unitPricePaise, 100 + gstRate, 100);
      if (perUnitInclusive > product.mrpPaise) {
        throw ApiError.badRequest(`${label}: price including tax exceeds the MRP`);
      }
    }

    return {
      product,
      qtyMilli: toMilli(item.qty),
      unitPricePaise,
      priceIncludesGst,
      discountPaise: item.discountPaise,
      gstRate,
      hsnCode: product.hsnCode,
    };
  });

  const amounts = computeInvoiceAmounts({
    lines,
    billDiscountPaise: input.billDiscountPaise,
    supplyType,
  });

  const items = lines.map((l, i) => {
    const { taxPaise, ...computed } = amounts.lines[i];
    return {
      productId: l.product._id,
      name: l.product.name,
      sku: l.product.sku,
      hsnCode: l.product.hsnCode,
      unit: l.product.unit,
      qtyMilli: l.qtyMilli,
      unitPricePaise: l.unitPricePaise,
      priceIncludesGst: l.priceIncludesGst,
      ...computed,
    };
  });

  return {
    shop,
    customer,
    customerSnapshot: snapshot,
    documentType,
    invoiceType: snapshot.gstin ? 'B2B' : 'B2C',
    placeOfSupplyStateCode,
    supplyType,
    items,
    products: byId,
    totals: amounts.totals,
    taxSummary: amounts.taxSummary,
  };
}

export async function previewInvoice(user, input) {
  const draft = await buildDraft(user, input);
  return {
    documentType: draft.documentType,
    invoiceType: draft.invoiceType,
    placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
    supplyType: draft.supplyType,
    customerSnapshot: draft.customerSnapshot,
    items: draft.items,
    totals: draft.totals,
    taxSummary: draft.taxSummary,
  };
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
function normalizePayments(payments, grandTotalPaise, customer) {
  const list = payments.map((p) => ({ ...p }));

  // Convenience for the common case: one payment mode, amount = the whole bill.
  if (list.length === 1 && list[0].amountPaise == null) list[0].amountPaise = grandTotalPaise;
  if (list.some((p) => p.amountPaise == null)) {
    throw ApiError.badRequest('amountPaise is required for every payment when using several modes');
  }

  const paid = list.reduce((a, p) => a + p.amountPaise, 0);
  if (paid !== grandTotalPaise) {
    throw ApiError.badRequest(`Payments (${paid} paise) must add up to the invoice total (${grandTotalPaise} paise)`, [
      { path: 'payments', message: 'Payments do not match the invoice total', grandTotalPaise },
    ]);
  }

  const creditPaise = list.filter((p) => p.mode === 'CREDIT').reduce((a, p) => a + p.amountPaise, 0);
  if (creditPaise > 0 && !customer) {
    throw ApiError.badRequest('Credit sales need a saved customer (send customerId)');
  }

  return { list, balanceDuePaise: creditPaise, amountPaidPaise: grandTotalPaise - creditPaise };
}

const paymentStatusOf = (grandTotalPaise, balanceDuePaise) => {
  if (balanceDuePaise === 0) return 'PAID';
  return balanceDuePaise === grandTotalPaise ? 'UNPAID' : 'PARTIAL';
};

// ---------------------------------------------------------------------------
// Stock deduction (inside the transaction)
// ---------------------------------------------------------------------------
async function allocateFefo(session, { shopId, product, qtyMilli, today }) {
  // Earliest expiry first; never sell an already-expired batch.
  const batches = await ProductBatch.find({
    shopId,
    productId: product._id,
    qtyRemainingMilli: { $gt: 0 },
    expiryDate: { $gte: today },
  })
    .sort({ expiryDate: 1, createdAt: 1 })
    .session(session)
    .lean();

  let remaining = qtyMilli;
  const picks = [];
  for (const batch of batches) {
    if (remaining === 0) break;
    const take = Math.min(remaining, batch.qtyRemainingMilli);
    picks.push({ batch, take });
    remaining -= take;
  }
  if (remaining > 0) throw ApiError.conflict(`Insufficient unexpired stock for "${product.name}"`);
  return picks;
}

async function deductLine(session, ctx, item, product) {
  const base = {
    shopId: ctx.shopId,
    productId: product._id,
    type: 'SALE',
    reason: `Invoice ${ctx.invoiceNo}`,
    refType: 'Invoice',
    refId: ctx.invoiceId,
    performedBy: ctx.userId,
  };

  if (!product.trackBatches) {
    await applyStockChange(session, { ...base, deltaMilli: -item.qtyMilli });
    return { batches: [], costPaise: mulDiv(item.qtyMilli, product.purchasePricePaise, 1000) };
  }

  const picks = await allocateFefo(session, { shopId: ctx.shopId, product, qtyMilli: item.qtyMilli, today: ctx.today });
  const batches = [];
  let costPaise = 0;
  for (const { batch, take } of picks) {
    await applyStockChange(session, { ...base, batchId: batch._id, deltaMilli: -take });
    const cost = mulDiv(take, batch.purchasePricePaise, 1000);
    costPaise += cost;
    batches.push({
      batchId: batch._id,
      batchNo: batch.batchNo,
      expiryDate: batch.expiryDate,
      qtyMilli: take,
      costPaise: cost,
    });
  }
  return { batches, costPaise };
}

// ---------------------------------------------------------------------------
// Create invoice
// ---------------------------------------------------------------------------
export async function createInvoice(user, input) {
  const { shopId, id: userId } = user;

  // Idempotent replay: a double-tap or a network retry returns the original invoice.
  const existing = await Invoice.findOne({ shopId, clientRequestId: input.clientRequestId });
  if (existing) return { invoice: existing, replay: true };

  const draft = await buildDraft(user, input);
  const payments = normalizePayments(input.payments, draft.totals.grandTotalPaise, draft.customer);

  const now = new Date();
  const financialYear = financialYearOf(now);
  const counterKey = `INV:${financialYear}`;
  await ensureCounter(shopId, counterKey);

  const invoiceId = new mongoose.Types.ObjectId();
  const today = new Date(`${istYmd(now)}T00:00:00.000Z`); // expiry dates are stored as UTC midnight
  const { shop } = draft;

  try {
    const invoice = await withTransaction(async (session) => {
      // 1. Number first: if anything below fails, the whole transaction (and this increment) rolls back.
      const seq = await nextSequence(session, shopId, counterKey);
      const invoiceNo = formatInvoiceNo(shop.invoiceSettings?.prefix || 'INV', financialYear, seq);

      // 2. Deduct stock, always in productId order so concurrent bills collide predictably.
      const order = draft.items.map((_, i) => i).sort((a, b) =>
        String(draft.items[a].productId).localeCompare(String(draft.items[b].productId))
      );
      const items = new Array(draft.items.length);
      for (const i of order) {
        const item = draft.items[i];
        const product = draft.products.get(String(item.productId));
        const { batches, costPaise } = await deductLine(session, { shopId, userId, invoiceId, invoiceNo, today }, item, product);
        items[i] = { ...item, batches, costPaise };
      }

      // 3. Credit sale: add to the customer's outstanding balance.
      if (payments.balanceDuePaise > 0) {
        await Customer.updateOne(
          { _id: draft.customer._id, shopId },
          { $inc: { outstandingPaise: payments.balanceDuePaise } },
          { session }
        );
      }

      // 4. The invoice itself.
      const [created] = await Invoice.create(
        [
          {
            _id: invoiceId,
            shopId,
            invoiceNo,
            financialYear,
            seq,
            invoiceDate: now,
            clientRequestId: input.clientRequestId,
            documentType: draft.documentType,
            invoiceType: draft.invoiceType,
            customerId: draft.customer?._id,
            customerSnapshot: draft.customerSnapshot,
            shopSnapshot: {
              name: shop.name,
              legalName: shop.legalName,
              gstin: shop.gstin,
              stateCode: shop.stateCode,
              address: shop.address,
              phone: shop.phone,
              email: shop.email,
              footerNote: shop.invoiceSettings?.footerNote,
            },
            placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
            supplyType: draft.supplyType,
            items,
            totals: draft.totals,
            taxSummary: draft.taxSummary,
            payments: payments.list.map((p) => ({ ...p, receivedAt: now, receivedBy: userId })),
            amountPaidPaise: payments.amountPaidPaise,
            balanceDuePaise: payments.balanceDuePaise,
            paymentStatus: paymentStatusOf(draft.totals.grandTotalPaise, payments.balanceDuePaise),
            notes: input.notes,
            createdBy: userId,
          },
        ],
        { session }
      );
      return created;
    });
    return { invoice, replay: false };
  } catch (err) {
    // Two identical requests raced: the loser hits the unique index. Return the winner's invoice.
    if (err.code === 11000 && err.keyPattern?.clientRequestId) {
      const winner = await Invoice.findOne({ shopId, clientRequestId: input.clientRequestId });
      if (winner) return { invoice: winner, replay: true };
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Read and settle
// ---------------------------------------------------------------------------
export async function getInvoice(shopId, id) {
  const invoice = await Invoice.findOne({ _id: id, shopId });
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

export async function listInvoices(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId };
  if (query.customerId) filter.customerId = query.customerId;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.q) filter.invoiceNo = new RegExp(escapeRegex(query.q), 'i');
  if (query.from || query.to) {
    filter.invoiceDate = {};
    if (query.from) filter.invoiceDate.$gte = new Date(`${query.from}T00:00:00.000${IST}`);
    if (query.to) filter.invoiceDate.$lte = new Date(`${query.to}T23:59:59.999${IST}`);
  }

  const [items, total] = await Promise.all([
    Invoice.find(filter)
      .select('-items -taxSummary -shopSnapshot') // list view: summaries only
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Invoice.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

// Settle (part of) a credit balance.
export async function recordPayment(shopId, userId, invoiceId, { mode, amountPaise, reference }) {
  return withTransaction(async (session) => {
    // The guard (balanceDue >= amount) is in the filter, so two simultaneous receipts can't overpay.
    const invoice = await Invoice.findOneAndUpdate(
      { _id: invoiceId, shopId, status: 'COMPLETED', balanceDuePaise: { $gte: amountPaise } },
      {
        $inc: { amountPaidPaise: amountPaise, balanceDuePaise: -amountPaise },
        $push: { payments: { mode, amountPaise, reference, receivedAt: new Date(), receivedBy: userId } },
      },
      { new: true, session }
    );

    if (!invoice) {
      const current = await Invoice.findOne({ _id: invoiceId, shopId }).session(session).lean();
      if (!current) throw ApiError.notFound('Invoice not found');
      throw ApiError.conflict(`Amount exceeds the balance due (${current.balanceDuePaise} paise)`);
    }

    invoice.paymentStatus = invoice.balanceDuePaise === 0 ? 'PAID' : 'PARTIAL';
    await invoice.save({ session });

    if (invoice.customerId) {
      await Customer.updateOne(
        { _id: invoice.customerId, shopId },
        { $inc: { outstandingPaise: -amountPaise } },
        { session }
      );
    }
    return invoice;
  });
}