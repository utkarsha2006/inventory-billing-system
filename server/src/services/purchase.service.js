import mongoose from 'mongoose';
import { Shop, Product, Supplier, Purchase } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { istYmd } from '../utils/financialYear.js';
import { computeInvoiceAmounts, resolveSupplyType } from '../utils/gst.js';
import { mulDiv, weightedAverage } from '../utils/money.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { assertQtyForUnit, toMilli } from '../utils/quantity.js';
import { withTransaction } from '../utils/transaction.js';
import { applyStockChange, receiveIntoBatch } from './stock.service.js';

const IST = '+05:30';
const paymentStatusOf = (grand, balance) => (balance === 0 ? 'PAID' : balance === grand ? 'UNPAID' : 'PARTIAL');

export async function createPurchase(user, input) {
  const { shopId, id: userId } = user;

  if (input.purchaseDate > istYmd()) throw ApiError.badRequest('Purchase date cannot be in the future');

  const [shop, supplier] = await Promise.all([
    Shop.findById(shopId).lean(),
    Supplier.findOne({ _id: input.supplierId, shopId, isActive: true }).lean(),
  ]);
  if (!shop) throw ApiError.notFound('Shop not found');
  if (!supplier) throw ApiError.notFound('Supplier not found');

  const supplierInvoiceNo = input.supplierInvoiceNo.toUpperCase();
  if (await Purchase.exists({ shopId, supplierId: supplier._id, supplierInvoiceNo })) {
    throw ApiError.conflict(`Purchase ${supplierInvoiceNo} from ${supplier.name} is already recorded`);
  }

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

  // Only a REGULAR supplier may charge GST. Composition and unregistered suppliers issue bills
  // of supply, so any tax is forced to zero. ITC is claimable only if the buyer is REGULAR too.
  const supplierCharges = supplier.gstRegistrationType === 'REGULAR';
  const itcEligible = supplierCharges && shop.gstRegistrationType === 'REGULAR';
  const supplyType = resolveSupplyType(shop.stateCode, supplier.stateCode);

  const lines = input.items.map((item, idx) => {
    const product = byId.get(item.productId);
    const label = `Item ${idx + 1} (${product.name})`;
    assertQtyForUnit(product.unit, item.qty, `${label} qty`);

    if (product.trackBatches) {
      if (!item.batchNo || !item.expiryDate) throw ApiError.badRequest(`${label}: batchNo and expiryDate are required`);
    } else if (item.batchNo || item.expiryDate) {
      throw ApiError.badRequest(`${label}: this product does not track batches`);
    }

    return {
      product,
      item,
      qtyMilli: toMilli(item.qty),
      unitPricePaise: item.unitCostPaise,
      priceIncludesGst: supplierCharges && input.pricesIncludeGst,
      discountPaise: item.discountPaise,
      gstRate: supplierCharges ? (item.gstRate ?? product.gstRate) : 0,
      hsnCode: product.hsnCode,
    };
  });

  const amounts = computeInvoiceAmounts({ lines, billDiscountPaise: 0, supplyType });
  let { totals } = amounts;

  // Reconcile with the printed total: small differences become the round-off, large ones are a typo.
  if (input.supplierInvoiceTotalPaise != null) {
    const raw = totals.grandTotalPaise - totals.roundOffPaise;
    const roundOffPaise = input.supplierInvoiceTotalPaise - raw;
    if (Math.abs(roundOffPaise) > 100) {
      throw ApiError.badRequest('The items do not add up to the supplier invoice total', [
        {
          path: 'supplierInvoiceTotalPaise',
          message: `Calculated total is ${raw} paise but the supplier invoice says ${input.supplierInvoiceTotalPaise}`,
        },
      ]);
    }
    totals = { ...totals, roundOffPaise, grandTotalPaise: input.supplierInvoiceTotalPaise };
  }

  const paidPaise = input.payments.reduce((a, p) => a + p.amountPaise, 0);
  if (paidPaise > totals.grandTotalPaise) throw ApiError.badRequest('Payments exceed the purchase total');
  const balanceDuePaise = totals.grandTotalPaise - paidPaise;

  const items = lines.map((l, i) => {
    const a = amounts.lines[i];
    return {
      productId: l.product._id,
      name: l.product.name,
      hsnCode: l.product.hsnCode,
      unit: l.product.unit,
      qtyMilli: l.qtyMilli,
      unitCostPaise: l.unitPricePaise,
      priceIncludesGst: l.priceIncludesGst,
      grossPaise: a.grossPaise,
      discountPaise: a.discountPaise,
      taxablePaise: a.taxablePaise,
      gstRate: a.gstRate,
      cgstPaise: a.cgstPaise,
      sgstPaise: a.sgstPaise,
      igstPaise: a.igstPaise,
      lineTotalPaise: a.lineTotalPaise,
      // If the GST can't be claimed back, it is part of what the goods really cost.
      costBasisPaise: itcEligible ? a.taxablePaise : a.lineTotalPaise,
      batchNo: l.item.batchNo,
      expiryDate: l.item.expiryDate,
    };
  });

  const purchaseId = new mongoose.Types.ObjectId();

  return withTransaction(async (session) => {
    // Stock in, always in productId order so concurrent writers collide predictably.
    const order = items.map((_, i) => i).sort((a, b) => String(items[a].productId).localeCompare(String(items[b].productId)));

    for (const i of order) {
      const row = items[i];
      const product = byId.get(String(row.productId));
      const unitCost = mulDiv(row.costBasisPaise, 1000, row.qtyMilli);
      const base = {
        shopId,
        type: 'PURCHASE',
        reason: `Purchase ${supplierInvoiceNo} from ${supplier.name}`,
        refType: 'Purchase',
        refId: purchaseId,
        performedBy: userId,
      };

      if (product.trackBatches) {
        await receiveIntoBatch(session, {
          ...base,
          product,
          batchNo: row.batchNo,
          expiryDate: row.expiryDate,
          qtyMilli: row.qtyMilli,
          purchasePricePaise: unitCost,
          purchaseId,
        });
        // The batch carries its own cost; the product keeps the latest cost as a default.
        await Product.updateOne({ _id: product._id, shopId }, { $set: { purchasePricePaise: unitCost } }, { session });
      } else {
        const { product: after, movement } = await applyStockChange(session, {
          ...base,
          productId: product._id,
          deltaMilli: row.qtyMilli,
        });
        // Weighted-average cost. Reading `after` inside the transaction means a concurrent
        // purchase of the same product conflicts and retries rather than overwriting.
        const average = weightedAverage(Math.max(movement.qtyBeforeMilli, 0), after.purchasePricePaise, row.qtyMilli, unitCost);
        await Product.updateOne({ _id: product._id, shopId }, { $set: { purchasePricePaise: average } }, { session });
      }
    }

    if (balanceDuePaise > 0) {
      await Supplier.updateOne({ _id: supplier._id, shopId }, { $inc: { outstandingPaise: balanceDuePaise } }, { session });
    }

    const [created] = await Purchase.create(
      [
        {
          _id: purchaseId,
          shopId,
          supplierId: supplier._id,
          supplierSnapshot: {
            name: supplier.name,
            gstin: supplier.gstin,
            stateCode: supplier.stateCode,
            gstRegistrationType: supplier.gstRegistrationType,
          },
          supplierInvoiceNo,
          purchaseDate: new Date(`${input.purchaseDate}T00:00:00.000${IST}`),
          supplyType,
          itcEligible,
          pricesIncludeGst: supplierCharges && input.pricesIncludeGst,
          items,
          totals,
          taxSummary: amounts.taxSummary,
          payments: input.payments.map((p) => ({ ...p, paidAt: new Date(), paidBy: userId })),
          amountPaidPaise: paidPaise,
          balanceDuePaise,
          paymentStatus: paymentStatusOf(totals.grandTotalPaise, balanceDuePaise),
          notes: input.notes,
          createdBy: userId,
        },
      ],
      { session }
    );
    return created;
  });
}

export async function getPurchase(shopId, id) {
  const purchase = await Purchase.findOne({ _id: id, shopId });
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return purchase;
}

export async function listPurchases(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId };
  if (query.supplierId) filter.supplierId = query.supplierId;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.from || query.to) {
    filter.purchaseDate = {};
    if (query.from) filter.purchaseDate.$gte = new Date(`${query.from}T00:00:00.000${IST}`);
    if (query.to) filter.purchaseDate.$lte = new Date(`${query.to}T23:59:59.999${IST}`);
  }
  const [items, total] = await Promise.all([
    Purchase.find(filter).select('-items -taxSummary').sort({ purchaseDate: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
    Purchase.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

// Pay the supplier (part of) what we owe.
export async function recordPurchasePayment(shopId, userId, purchaseId, { mode, amountPaise, reference }) {
  return withTransaction(async (session) => {
    // The guard (balanceDue >= amount) is in the filter, so two simultaneous payments can't overpay.
    const purchase = await Purchase.findOneAndUpdate(
      { _id: purchaseId, shopId, balanceDuePaise: { $gte: amountPaise } },
      {
        $inc: { amountPaidPaise: amountPaise, balanceDuePaise: -amountPaise },
        $push: { payments: { mode, amountPaise, reference, paidAt: new Date(), paidBy: userId } },
      },
      { new: true, session }
    );

    if (!purchase) {
      const current = await Purchase.findOne({ _id: purchaseId, shopId }).session(session).lean();
      if (!current) throw ApiError.notFound('Purchase not found');
      throw ApiError.conflict(`Amount exceeds the balance due (${current.balanceDuePaise} paise)`);
    }

    purchase.paymentStatus = purchase.balanceDuePaise === 0 ? 'PAID' : 'PARTIAL';
    await purchase.save({ session });
    await Supplier.updateOne({ _id: purchase.supplierId, shopId }, { $inc: { outstandingPaise: -amountPaise } }, { session });
    return purchase;
  });
}