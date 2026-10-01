import { Router } from 'express';
import authRoutes from './auth.routes.js';
import shopRoutes from './shop.routes.js';
import userRoutes from './user.routes.js';
import productRoutes from './product.routes.js';
import customerRoutes from './customer.routes.js';
import invoiceRoutes from './invoice.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.use('/auth', authRoutes);
router.use('/shop', shopRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/customers', customerRoutes);
router.use('/invoices', invoiceRoutes);
// Phase 6+: purchases, credit notes. Phase 7: reports

export default router;