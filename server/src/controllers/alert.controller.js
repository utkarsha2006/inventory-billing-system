import { asyncHandler } from '../utils/asyncHandler.js';
import { collectShopAlerts } from '../services/alert.service.js';
import { runLowStockAlerts } from '../jobs/lowStockAlert.job.js';

export const summary = asyncHandler(async (req, res) => {
  const data = await collectShopAlerts(req.user.shopId, { expiryDays: req.query.expiryDays });
  res.json({ success: true, data });
});

export const runJob = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await runLowStockAlerts() });
});