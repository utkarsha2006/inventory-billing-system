import { Product, ProductBatch, StockMovement } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { withTransaction } from '../utils/transaction.js';
import { assertQtyForUnit, toMilli, fromMilli } from '../utils/quantity.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';

const IST = '+05:30';

/**
 * THE single place where stock changes. Sales (Phase 4), purchases and returns (Phase 6)
 * all go through here.
 *
 * Atomically changes Product.stockMilli (and one batch, if given) and appends a ledger row.
 * MUST be called inside a transaction: pass `session`. If anything throws,
 * the whole transaction (including the $inc) rolls back.
 */
export async function applyStockChange(
  session,
  { shopId, productId, deltaMilli, type, reason, refType, refId, batchId, performedBy }
) {
  if (!Number.isInteger(deltaMilli) || deltaMilli === 0) {
    throw new Error('deltaMilli must be a non-zero integer'); // programmer error, not a 4xx
  }

  // The guard lives IN the update filter, so check and change are one atomic operation.
  // Two cashiers selling the last unit: exactly one matches; the other gets null.
  const filter = { _id: productId, shopId, isActive: true };
  if (deltaMilli < 0) filter.stockMilli = { $gte: -deltaMilli };

  const product = await Product.findOneAndUpdate(
    filter,
    { $inc: { stockMilli: deltaMilli } },
    { new: true, session }
  );

  if (!product) {
    const existing = await Product.findOne({ _id: productId, shopId }).session(session).lean();
    if (!existing || (!existing.isActive && !allowInactive)) throw ApiError.notFound('Product not found or inactive');
    throw ApiError.conflict(
      `Insufficient stock for "${existing.name}": ${fromMilli(existing.stockMilli)} ${existing.unit} available`
    );
  }

  // Invariant: sum(batches) == product stock, so batch products must always name a batch.
  if (product.trackBatches && !batchId) {
    throw ApiError.badRequest(`"${product.name}" is batch-tracked: batchId is required`);
  }
  if (!product.trackBatches && batchId) {
    throw ApiError.badRequest(`"${product.name}" does not track batches`);
  }

  let batch = null;
  if (batchId) {
    const batchFilter = { _id: batchId, shopId, productId };
    if (deltaMilli < 0) batchFilter.qtyRemainingMilli = { $gte: -deltaMilli };
    batch = await ProductBatch.findOneAndUpdate(
      batchFilter,
      { $inc: { qtyRemainingMilli: deltaMilli } },
      { new: true, session }
    );
    if (!batch) throw ApiError.conflict('Batch not found or has insufficient stock');
  }

  const [movement] = await StockMovement.create(
    [
      {
        shopId,
        productId,
        batchId,
        type,
        qtyChangeMilli: deltaMilli,
        qtyBeforeMilli: product.stockMilli - deltaMilli, // derived from the post-update value
        qtyAfterMilli: product.stockMilli,
        reason,
        refType,
        refId,
        performedBy,
      },
    ],
    { session }
  );

  return { product, batch, movement };
}

// Adds stock into a batch, creating the batch if it doesn't exist. Reused by purchases in Phase 6.
export async function receiveIntoBatch(
  session,
  { shopId, product, batchNo, expiryDate, qtyMilli, purchasePricePaise, type, reason, refType, refId, performedBy, purchaseId}
) {
  const batch = await ProductBatch.findOneAndUpdate(
    { shopId, productId: product._id, batchNo },
    {
      $inc: { initialQtyMilli: qtyMilli },
      $setOnInsert: {
        expiryDate,
        purchasePricePaise: purchasePricePaise ?? product.purchasePricePaise,
        qtyRemainingMilli: 0, // applyStockChange adds the quantity below
        ...(purchaseId && { purchaseId }),
      },
    },
    { upsert: true, new: true, session }
  );

  if (batch.expiryDate.getTime() !== expiryDate.getTime()) {
    throw ApiError.conflict(`Batch ${batchNo} already exists with a different expiry date`);
  }

  return applyStockChange(session, {
    shopId,
    productId: product._id,
    batchId: batch._id,
    deltaMilli: qtyMilli,
    type,
    reason,
    refType,
    refId,
    performedBy,
    allowInactive: false,
  });
}

export async function adjustStock(shopId, userId, productId, { type, qtyChange, reason, batchId }) {
  const product = await Product.findOne({ _id: productId, shopId, isActive: true }).lean();
  if (!product) throw ApiError.notFound('Product not found');
  assertQtyForUnit(product.unit, Math.abs(qtyChange), 'qtyChange');

  return withTransaction((session) =>
    applyStockChange(session, {
      shopId,
      productId: product._id,
      deltaMilli: toMilli(qtyChange),
      type,
      reason,
      batchId,
      performedBy: userId,
    })
  );
}

export async function receiveBatch(shopId, userId, productId, input) {
  const product = await Product.findOne({ _id: productId, shopId, isActive: true }).lean();
  if (!product) throw ApiError.notFound('Product not found');
  if (!product.trackBatches) throw ApiError.badRequest('This product does not track batches');
  assertQtyForUnit(product.unit, input.qty, 'qty');

  return withTransaction((session) =>
    receiveIntoBatch(session, {
      shopId,
      product,
      batchNo: input.batchNo,
      expiryDate: input.expiryDate,
      qtyMilli: toMilli(input.qty),
      purchasePricePaise: input.purchasePricePaise,
      type: 'ADJUSTMENT',
      reason: `Batch ${input.batchNo} added manually`,
      performedBy: userId,
    })
  );
}

export async function listBatches(shopId, productId, { includeEmpty = false } = {}) {
  if (!(await Product.exists({ _id: productId, shopId }))) throw ApiError.notFound('Product not found');
  const filter = { _id: productId, shopId };
  if (!allowInactive) filter.isActive = true; // returns may restock a product deactivated since the sale
  if (deltaMilli < 0) filter.stockMilli = { $gte: -deltaMilli };
  if (!includeEmpty) filter.qtyRemainingMilli = { $gt: 0 };
  return ProductBatch.find(filter).sort({ expiryDate: 1 }).lean(); // earliest expiry first
}

export async function listMovements(shopId, productId, query) {
  if (!(await Product.exists({ _id: productId, shopId }))) throw ApiError.notFound('Product not found');

  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId, productId };
  if (query.type) filter.type = query.type;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(`${query.from}T00:00:00.000${IST}`);
    if (query.to) filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999${IST}`);
  }

  const [items, total] = await Promise.all([
    StockMovement.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('performedBy', 'name role')
      .lean(),
    StockMovement.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}