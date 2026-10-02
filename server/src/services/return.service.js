import mongoose from 'mongoose';
import { Invoice, Customer, CreditNote } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { financialYearOf, formatInvoiceNo, section34Cutoff } from '../utils/financialYear.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { assertQtyForUnit, fromMilli, toMilli } from '../utils/quantity.js';
import { allocateAcrossPicks, creditLineFor, summarizeCredit } from '../utils/returns.js';
import { withTransaction } from '../utils/transaction.js';
import { applyStockChange } from './stock.service.js';
import { ensureCounter, nextSequence } from './counter.service.js';

const IST = '+05:30';

export async function createReturn(user, invoiceId, input) {
  const { shopId, id: userId } = user;

  // Idempotent replay (double tap, network retry).
  const earlier = await CreditNote.findOne({ shopId, clientRequestId: input.clientRequestId });
  if (earlier) {
    if (String(earlier.invoiceId) !== String(invoiceId)) {
      throw ApiError.conflict('clientRequestId was already used for a different return');
    }
    return { creditNote: earlier, replay: true };
  }

  const now = new Date();
  const financialYear = financialYearOf(now);
  const counterKey = `CN:${financialYear}`;
  await ensureCounter(shopId, counterKey); // before the transaction, as for invoices
  const creditNoteId = new mongoose.Types.ObjectId();

  try {
    const creditNote = await withTransaction(async (session) => {
      const invoice = await Invoice.findOne({ _id: invoiceId, shopId }).session(session).lean();
      if (!invoice) throw ApiError.notFound('Invoice not found');
      if (invoice.status !== 'COMPLETED') throw ApiError.conflict('Only completed invoices can be returned');

      // ---- 1. Work out what is being returned (pure maths on the invoice snapshot) ----
      const itemsById = new Map(invoice.items.map((i) => [String(i._id), i]));
      const entries = input.items.map((entry) => {
        const item = itemsById.get(entry.invoiceItemId);
        if (!item) {
          throw ApiError.badRequest('An item does not belong to this invoice', [
            { path: 'items', message: `Unknown invoiceItemId ${entry.invoiceItemId}` },
          ]);
        }
        assertQtyForUnit(item.unit, entry.qty, `${item.name} qty`);

        const qtyMilli = toMilli(entry.qty);
        const already = item.returnedQtyMilli ?? 0;
        if (already + qtyMilli > item.qtyMilli) {
          throw ApiError.conflict(`${item.name}: only ${fromMilli(item.qtyMilli - already)} ${item.unit ?? ''} left to return`);
        }
        return { item, entry, qtyMilli, already, part: creditLineFor(item, already, qtyMilli) };
      });

      const docLines = entries.map(({ item, entry, qtyMilli, part }) => ({
        invoiceItemId: item._id,
        productId: item.productId,
        name: item.name,
        sku: item.sku,
        hsnCode: item.hsnCode,
        unit: item.unit,
        qtyMilli,
        unitPricePaise: item.unitPricePaise,
        priceIncludesGst: item.priceIncludesGst,
        gstRate: item.gstRate,
        ...part,
        costPaise: entry.restock ? part.costPaise : 0, // goods that don't come back stay a cost
        restock: entry.restock,
      }));
      const { totals, taxSummary } = summarizeCredit(docLines);

      // ---- 2. Money: cancel unpaid credit first, then refund the rest ----
      const adjusted = Math.min(invoice.balanceDuePaise, totals.grandTotalPaise);
      const refundPaise = totals.grandTotalPaise - adjusted;
      if (input.refundMode === 'CREDIT_ADJUST' && refundPaise > 0 && !invoice.customerId) {
        throw ApiError.badRequest('Store credit needs a saved customer. Choose CASH, UPI or CARD for walk-in sales.');
      }

      // ---- 3. Number, then writes ----
      const seq = await nextSequence(session, shopId, counterKey);
      const creditNoteNo = formatInvoiceNo('CN', financialYear, seq);

      // Guarded counter per line. It checks nobody returned the same goods meanwhile, and because every
      // return writes the same invoice document, two simultaneous returns conflict and one retries.
      for (const { item, qtyMilli, already } of entries) {
        const result = await Invoice.updateOne(
          {
            _id: invoice._id,
            shopId,
            items: { $elemMatch: { _id: item._id, returnedQtyMilli: already === 0 ? { $in: [0, null] } : already } },
          },
          { $inc: { 'items.$.returnedQtyMilli': qtyMilli } },
          { session }
        );
        if (result.modifiedCount !== 1) throw ApiError.conflict('This invoice was just changed by another return. Please retry.');
      }

      // Put goods back, in productId order. Batch products go to the batches they were sold from.
      const restockOrder = [...entries].sort((a, b) => String(a.item.productId).localeCompare(String(b.item.productId)));
      for (const { item, entry, qtyMilli, already } of restockOrder) {
        if (!entry.restock) continue;
        const base = {
          shopId,
          productId: item.productId,
          type: 'SALE_RETURN',
          reason: `Return against ${invoice.invoiceNo} (${creditNoteNo})`,
          refType: 'CreditNote',
          refId: creditNoteId,
          performedBy: userId,
          allowInactive: true, // the product may have been deactivated since the sale
        };
        if (item.batches?.length) {
          for (const piece of allocateAcrossPicks(item.batches, already, qtyMilli)) {
            await applyStockChange(session, { ...base, batchId: piece.batchId, deltaMilli: piece.qtyMilli });
          }
        } else {
          await applyStockChange(session, { ...base, deltaMilli: qtyMilli });
        }
      }

      if (adjusted > 0) {
        const newBalance = invoice.balanceDuePaise - adjusted;
        const result = await Invoice.updateOne(
          { _id: invoice._id, shopId, balanceDuePaise: invoice.balanceDuePaise },
          {
            $inc: { balanceDuePaise: -adjusted },
            $set: { paymentStatus: newBalance === 0 ? 'PAID' : newBalance === invoice.totals.grandTotalPaise ? 'UNPAID' : 'PARTIAL' },
          },
          { session }
        );
        if (result.modifiedCount !== 1) throw ApiError.conflict('The invoice balance changed. Please retry.');
      }

      const customerDelta = adjusted + (input.refundMode === 'CREDIT_ADJUST' ? refundPaise : 0);
      if (invoice.customerId && customerDelta > 0) {
        // A negative balance means the shop owes the customer: store credit.
        await Customer.updateOne({ _id: invoice.customerId, shopId }, { $inc: { outstandingPaise: -customerDelta } }, { session });
      }

      const [created] = await CreditNote.create(
        [
          {
            _id: creditNoteId,
            shopId,
            creditNoteNo,
            financialYear,
            seq,
            creditNoteDate: now,
            clientRequestId: input.clientRequestId,
            invoiceId: invoice._id,
            invoiceNo: invoice.invoiceNo,
            originalInvoiceDate: invoice.invoiceDate,
            originalDocumentType: invoice.documentType,
            invoiceType: invoice.invoiceType,
            customerId: invoice.customerId,
            customerSnapshot: invoice.customerSnapshot,
            shopSnapshot: invoice.shopSnapshot,
            placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
            supplyType: invoice.supplyType,
            items: docLines,
            totals,
            taxSummary,
            adjustedAgainstDuePaise: adjusted,
            refundPaise,
            refundMode: input.refundMode,
            reason: input.reason,
            taxReductionBarred: now > section34Cutoff(invoice.financialYear),
            createdBy: userId,
          },
        ],
        { session }
      );
      return created;
    });

    return { creditNote, replay: false };
  } catch (err) {
    // Two identical requests raced: the loser hits the unique index and gets the winner's note.
    if (err.code === 11000 && err.keyPattern?.clientRequestId) {
      const winner = await CreditNote.findOne({ shopId, clientRequestId: input.clientRequestId });
      if (winner) return { creditNote: winner, replay: true };
    }
    throw err;
  }
}

export async function getCreditNote(shopId, id) {
  const note = await CreditNote.findOne({ _id: id, shopId });
  if (!note) throw ApiError.notFound('Credit note not found');
  return note;
}

export async function listCreditNotes(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId };
  if (query.invoiceId) filter.invoiceId = query.invoiceId;
  if (query.from || query.to) {
    filter.creditNoteDate = {};
    if (query.from) filter.creditNoteDate.$gte = new Date(`${query.from}T00:00:00.000${IST}`);
    if (query.to) filter.creditNoteDate.$lte = new Date(`${query.to}T23:59:59.999${IST}`);
  }
  const [items, total] = await Promise.all([
    CreditNote.find(filter).select('-items -taxSummary -shopSnapshot').sort({ creditNoteDate: -1 }).skip(skip).limit(limit).lean(),
    CreditNote.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}