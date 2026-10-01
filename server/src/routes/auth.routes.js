import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validate } from '../middleware/validate.js';
import {
  registerShopSchema,
  loginSchema,
  changePasswordSchema,
} from '../validators/auth.validators.js';

const router = Router();

router.post('/register-shop', authLimiter, validate({ body: registerShopSchema }), ctrl.registerShop);
router.post('/login', authLimiter, validate({ body: loginSchema }), ctrl.login);
router.post('/refresh', ctrl.refresh);
router.post('/logout', ctrl.logout);
router.get('/me', authenticate, ctrl.me);
router.patch(
  '/change-password',
  authenticate,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword
);

export default router;