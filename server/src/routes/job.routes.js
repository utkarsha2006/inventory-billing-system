import { Router } from 'express';
import * as ctrl from '../controllers/alert.controller.js';
import { cronAuth } from '../middleware/cronAuth.js';

const router = Router();

// For an external scheduler (Render Cron Job, GitHub Actions, cron-job.org) when the web
// service can sleep. Send the header:  x-cron-secret: <CRON_SECRET>
router.post('/low-stock-alerts', cronAuth, ctrl.runJob);

export default router;