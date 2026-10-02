import { Router } from 'express';
import authRoutes from './auth.routes.js';
import shopRoutes from './shop.routes.js';
import userRoutes from './user.routes.js';
import productRoutes from './product.routes.js';
import customerRoutes from './customer.routes.js';
import invoiceRoutes from './invoice.routes.js';
import supplierRoutes from './supplier.routes.js';
import purchaseRoutes from './purchase.routes.js';
import creditNoteRoutes from './creditNote.routes.js';
import alertRoutes from './alert.routes.js';
import jobRoutes from './job.routes.js';

const router = Router();

router.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));
router.use('/auth', authRoutes);
router.use('/shop', shopRoutes);
router.use('/users', userRoutes);
router.use('/products', productRoutes);
router.use('/customers', customerRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/credit-notes', creditNoteRoutes);
router.use('/alerts', alertRoutes);
router.use('/jobs', jobRoutes);
// Phase 7: reports and dashboard

export default router;