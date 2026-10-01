import { Router } from 'express';
import * as ctrl from '../controllers/customer.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import {
  createCustomerSchema,
  updateCustomerSchema,
  listCustomersQuery,
} from '../validators/customer.validators.js';

const router = Router();
router.use(authenticate, can('customer:manage'));

router.get('/', validate({ query: listCustomersQuery }), ctrl.list);
router.post('/', validate({ body: createCustomerSchema }), ctrl.create);
router.get('/:id', validate({ params: idParam }), ctrl.get);
router.patch('/:id', validate({ params: idParam, body: updateCustomerSchema }), ctrl.update);

export default router;