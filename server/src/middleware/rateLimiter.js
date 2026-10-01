import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: (_req, _res, next) =>
    next(new ApiError(429, 'Too many requests, please try again later.')),
};

export const apiLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 300 });

// Brute-force protection for login and registration.
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 10 });