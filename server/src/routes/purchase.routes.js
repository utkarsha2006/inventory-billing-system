import { Router } from 'express';
import * as ctrl from '../controllers/purchase.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { createPurchaseSchema, purchasePaymentSchema, listPurchasesQuery } from '../validators/purchase.validators.js';

const router = Router();
router.use(authenticate);

router.get('/', can('purchase:read'), validate({ query: listPurchasesQuery }), ctrl.list);
router.post('/', can('purchase:write'), validate({ body: createPurchaseSchema }), ctrl.create);
router.get('/:id', can('purchase:read'), validate({ params: idParam }), ctrl.get);
router.post(
  '/:id/payments',
  can('purchase:write'),
  validate({ params: idParam, body: purchasePaymentSchema }),
  ctrl.addPayment
);

export default router;