import { Router } from 'express';
import * as ctrl from '../controllers/return.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { pdfQuery } from '../validators/invoice.validators.js';
import { listCreditNotesQuery } from '../validators/return.validators.js';

const router = Router();
router.use(authenticate, can('return:read'));

router.get('/', validate({ query: listCreditNotesQuery }), ctrl.list);
router.get('/:id', validate({ params: idParam }), ctrl.get);
router.get('/:id/pdf', validate({ params: idParam, query: pdfQuery }), ctrl.pdf);

export default router;