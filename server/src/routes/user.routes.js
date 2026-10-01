import { Router } from 'express';
import * as ctrl from '../controllers/user.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { idParam, paginationQuery } from '../validators/common.validators.js';
import {
  createUserSchema,
  updateUserSchema,
  resetPasswordSchema,
} from '../validators/user.validators.js';

const router = Router();

router.use(authenticate, can('user:manage')); // Owner only, for every route below

router.get('/', validate({ query: paginationQuery }), ctrl.list);
router.post('/', validate({ body: createUserSchema }), ctrl.create);
router.patch('/:id', validate({ params: idParam, body: updateUserSchema }), ctrl.update);
router.post(
  '/:id/reset-password',
  validate({ params: idParam, body: resetPasswordSchema }),
  ctrl.resetPassword
);

export default router;