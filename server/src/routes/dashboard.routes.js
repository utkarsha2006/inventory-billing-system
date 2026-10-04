import { Router } from 'express';
import * as ctrl from '../controllers/report.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { can } from '../middleware/authorize.js';

const router = Router();

router.get('/summary', authenticate, can('report:read'), ctrl.dashboard);

export default router;