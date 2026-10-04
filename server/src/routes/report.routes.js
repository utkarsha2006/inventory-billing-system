import { Router } from 'express';
import * as ctrl from '../controllers/report.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { reportQuery, topProductsQuery, profitQuery, stockValuationQuery } from '../validators/report.validators.js';

const router = Router();
router.use(authenticate);

router.get('/sales/daily', can('report:read'), validate({ query: reportQuery }), ctrl.salesDaily);
router.get('/sales/monthly', can('report:read'), validate({ query: reportQuery }), ctrl.salesMonthly);
router.get('/top-products', can('report:read'), validate({ query: topProductsQuery }), ctrl.topProducts);

// Cost and margin data: gated by the cost permission, not just the report permission.
router.get('/profit', can('cost:view'), validate({ query: profitQuery }), ctrl.profit);
router.get('/stock-valuation', can('cost:view'), validate({ query: stockValuationQuery }), ctrl.stockValuation);

router.get('/gst/gstr1', can('report:read'), validate({ query: reportQuery }), ctrl.gstr1);
router.get('/gst/gstr3b', can('report:read'), validate({ query: reportQuery }), ctrl.gstr3b);
router.get('/gst/hsn-summary', can('report:read'), validate({ query: reportQuery }), ctrl.hsnSummary);

export default router;