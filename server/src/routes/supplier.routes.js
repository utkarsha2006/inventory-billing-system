import { Router } from 'express';
import * as ctrl from '../controllers/supplier.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validators/common.validators.js';
import { createSupplierSchema, updateSupplierSchema, listSuppliersQuery } from '../validators/supplier.validators.js';

const router = Router();
router.use(authenticate, can('supplier:manage'));

router.get('/', validate({ query: listSuppliersQuery }), ctrl.list);
router.post('/', validate({ body: createSupplierSchema }), ctrl.create);
router.get('/:id', validate({ params: idParam }), ctrl.get);
router.patch('/:id', validate({ params: idParam, body: updateSupplierSchema }), ctrl.update);

export default router;