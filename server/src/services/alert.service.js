import { Product, ProductBatch } from '../models/index.js';
import { istYmd } from '../utils/financialYear.js';
import { fromMilli } from '../utils/quantity.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Shared by the dashboard endpoint and the daily email.
export async function collectShopAlerts(shopId, { expiryDays = 30, limit = 100, now = new Date() } = {}) {
  const today = new Date(`${istYmd(now)}T00:00:00.000Z`); // expiry dates are stored as UTC midnight
  const horizon = new Date(today.getTime() + expiryDays * DAY_MS);

  const lowFilter = { shopId, isActive: true, $expr: { $lte: ['$stockMilli', '$reorderMilli'] } };
  const expiryFilter = { shopId, qtyRemainingMilli: { $gt: 0 }, expiryDate: { $lte: horizon } };

  const [lowStock, lowStockCount, outOfStockCount, expiring, expiringCount] = await Promise.all([
    Product.find(lowFilter).sort({ stockMilli: 1, name: 1 }).limit(limit).select('name sku unit stockMilli reorderMilli').lean(),
    Product.countDocuments(lowFilter),
    Product.countDocuments({ shopId, isActive: true, stockMilli: { $lte: 0 } }),
    ProductBatch.find(expiryFilter).sort({ expiryDate: 1 }).limit(limit).populate('productId', 'name unit').lean(),
    ProductBatch.countDocuments(expiryFilter),
  ]);

  return {
    expiryDays,
    lowStockCount,
    outOfStockCount,
    expiringCount,
    hasAlerts: lowStockCount > 0 || expiringCount > 0,
    lowStock: lowStock.map((p) => ({
      productId: p._id,
      name: p.name,
      sku: p.sku,
      unit: p.unit,
      stockQty: fromMilli(p.stockMilli),
      reorderLevel: fromMilli(p.reorderMilli),
    })),
    expiring: expiring
      .filter((b) => b.productId)
      .map((b) => ({
        productId: b.productId._id,
        name: b.productId.name,
        unit: b.productId.unit,
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        qtyRemaining: fromMilli(b.qtyRemainingMilli),
        expired: b.expiryDate < today,
      })),
  };
}