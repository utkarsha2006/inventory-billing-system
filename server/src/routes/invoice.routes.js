import { Router } from 'express';
import * as ctrl from '../controllers/invoice.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  previewInvoiceSchema,
  createInvoiceSchema,
  settlementSchema,
  listInvoicesQuery,
  pdfQuery,
} from '../validators/invoice.validators.js';
import * as returns from '../controllers/return.controller.js';
import { createReturnSchema } from '../validators/return.validators.js';

const router = Router();
router.use(authenticate);

router.post('/preview', can('invoice:create'), validate({ body: previewInvoiceSchema }), ctrl.preview);
router.post('/', can('invoice:create'), validate({ body: createInvoiceSchema }), ctrl.create);
router.get('/', can('invoice:read'), validate({ query: listInvoicesQuery }), ctrl.list);
router.get('/:id', can('invoice:read'), validate({ params: idParam }), ctrl.get);
router.get('/:id/pdf', can('invoice:read'), validate({ params: idParam, query: pdfQuery }), ctrl.pdf);
router.post(
  '/:id/payments',
  can('invoice:create'),
  validate({ params: idParam, body: settlementSchema }),
  ctrl.addPayment
);
router.post(
  '/:id/returns',
  can('return:create'),
  validate({ params: idParam, body: createReturnSchema }),
  returns.create
);
// Phase 5: GET /:id/pdf   Phase 6: POST /:id/returns


export default router;