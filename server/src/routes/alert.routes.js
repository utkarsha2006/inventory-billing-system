import { Router } from 'express';
import { z } from 'zod';
import * as ctrl from '../controllers/alert.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const query = z.object({ expiryDays: z.coerce.number().int().min(1).max(365).default(30) });

// Powers the dashboard warning banner. Any role that can see products can see this.
router.get('/', authenticate, can('product:read'), validate({ query }), ctrl.summary);

export default router;