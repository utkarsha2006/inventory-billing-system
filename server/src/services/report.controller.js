import { asyncHandler } from '../utils/asyncHandler.js';
import * as reports from '../services/report.service.js';
import * as gst from '../services/gstReport.service.js';
import { sendReport } from '../services/export.service.js';

const serve = (name, build) =>
  asyncHandler(async (req, res) => {
    const report = await build(req.user.shopId, req.query);
    await sendReport(res, report, { format: req.query.format, table: req.query.table }, name);
  });

export const salesDaily = serve('sales-daily', (shopId, q) => reports.salesReport(shopId, q, 'day'));
export const salesMonthly = serve('sales-monthly', (shopId, q) => reports.salesReport(shopId, q, 'month'));
export const topProducts = serve('top-products', reports.topProductsReport);
export const profit = serve('profit', reports.profitReport);
export const stockValuation = serve('stock-valuation', reports.stockValuationReport);
export const gstr1 = serve('gstr1', gst.gstr1Report);
export const gstr3b = serve('gstr3b', gst.gstr3bReport);
export const hsnSummary = serve('hsn-summary', gst.hsnSummaryReport);

export const dashboard = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await reports.dashboardSummary(req.user.shopId) });
});