import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const digest = (v) => crypto.createHash('sha256').update(String(v)).digest(); // equal length for timingSafeEqual

export function cronAuth(req, _res, next) {
  if (!env.CRON_SECRET) return next(ApiError.notFound('Not found')); // endpoint is disabled unless configured
  const provided = req.get('x-cron-secret') || '';
  return crypto.timingSafeEqual(digest(provided), digest(env.CRON_SECRET))
    ? next()
    : next(ApiError.unauthorized('Invalid cron secret'));
}