import { z } from 'zod';
import { optional, ymd } from './common.validators.js';

const output = {
  format: z.enum(['json', 'csv', 'xlsx']).default('json'),
  table: optional(z.string().trim().max(30)), // CSV is one table per file; Excel has them all
};

const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const reportQuery = z.object({ from: ymd.optional(), to: ymd.optional(), ...output });

export const topProductsQuery = reportQuery.extend({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  sortBy: z.enum(['revenue', 'qty']).default('revenue'),
});

export const profitQuery = reportQuery.extend({
  groupBy: z.enum(['day', 'month', 'product']).default('day'),
  limit: z.coerce.number().int().min(1).max(500).default(50), // product grouping only
});

export const stockValuationQuery = z.object({
  category: optional(z.string().trim().max(60)),
  includeZero: boolFlag,
  ...output,
});