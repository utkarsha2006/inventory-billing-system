import { Router } from 'express';
import * as ctrl from '../controllers/shop.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { updateShopSchema } from '../validators/shop.validators.js';

const router = Router();

router.use(authenticate);
router.get('/', ctrl.get); // every role needs shop name/GSTIN for the POS and invoices
router.patch('/', can('shop:manage'), validate({ body: updateShopSchema }), ctrl.update);

export default router;