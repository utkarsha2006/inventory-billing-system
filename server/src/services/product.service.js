import { Product, StockMovement } from '../models/index.js';
import { hasPermission } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { assertQtyForUnit, toMilli } from '../utils/quantity.js';
import { withTransaction } from '../utils/transaction.js';

export async function createProduct(shopId, userId, input) {
  const { openingStock, reorderLevel, ...fields } = input;
  const openingMilli = toMilli(openingStock);

  return withTransaction(async (session) => {
    const [product] = await Product.create(
      [
        {
          ...fields,
          shopId,
          createdBy: userId,
          stockMilli: openingMilli,
          reorderMilli: toMilli(reorderLevel),
        },
      ],
      { session }
    );

    if (openingMilli > 0) {
      await StockMovement.create(
        [
          {
            shopId,
            productId: product._id,
            type: 'OPENING',
            qtyChangeMilli: openingMilli,
            qtyBeforeMilli: 0,
            qtyAfterMilli: openingMilli,
            reason: 'Opening stock',
            performedBy: userId,
          },
        ],
        { session }
      );
    }
    return product;
  });
}

export async function listProducts(shopId, query, role) {
  const { page, limit, skip } = parsePagination(query);
  const { q, category, lowStock, includeInactive } = query;

  const filter = { shopId };
  // Only staff who can edit products may see deactivated ones.
  if (!(includeInactive && hasPermission(role, 'product:write'))) filter.isActive = true;
  if (category) filter.category = category;
  if (lowStock) filter.$expr = { $lte: ['$stockMilli', '$reorderMilli'] };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { sku: rx }, { barcode: rx }];
  }

  const [items, total] = await Promise.all([
    Product.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

export async function getProduct(shopId, id) {
  const product = await Product.findOne({ _id: id, shopId }); // shopId scoping = tenant isolation
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

// Includes inactive products so the caller can distinguish "unknown" from "deactivated".
export const findByBarcode = (shopId, barcode) => Product.findOne({ shopId, barcode });

export async function updateProduct(shopId, id, patch) {
  const product = await getProduct(shopId, id);
  const { reorderLevel, ...rest } = patch;

  if (reorderLevel !== undefined) {
    assertQtyForUnit(product.unit, reorderLevel, 'reorderLevel');
    product.reorderMilli = toMilli(reorderLevel);
  }
  // null means "clear the field". Setting undefined makes Mongoose $unset it.
  for (const [key, value] of Object.entries(rest)) product.set(key, value === null ? undefined : value);

  // save() sends only the modified paths, so a concurrent stock change is never overwritten.
  await product.save();
  return product;
}

export async function deactivateProduct(shopId, id) {
  const product = await Product.findOneAndUpdate(
    { _id: id, shopId },
    { isActive: false },
    { new: true }
  );
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

export async function listCategories(shopId) {
  const categories = await Product.distinct('category', { shopId, isActive: true });
  return categories.sort((a, b) => a.localeCompare(b));
}