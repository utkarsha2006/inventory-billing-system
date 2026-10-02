import { z } from 'zod';
import { REFUND_MODES } from '../config/constants.js';
import { hasMaxThreeDecimals } from '../utils/quantity.js';
import { objectId, optional, paginationQuery, ymd } from './common.validators.js';

export const createReturnSchema = z.object({
  clientRequestId: z
    .string()
    .trim()
    .min(8)
    .max(64)
    .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - and _ only'),
  items: z
    .array(
      z.object({
        invoiceItemId: objectId,
        qty: z.number().positive().max(9_999_999).refine(hasMaxThreeDecimals, 'At most 3 decimal places'),
        restock: z.boolean().default(true), // false for damaged goods: they don't go back on the shelf
      })
    )
    .min(1, 'Select at least one item')
    .max(100)
    .refine((items) => new Set(items.map((i) => i.invoiceItemId)).size === items.length, 'An item appears twice'),
  refundMode: z.enum(REFUND_MODES),
  reason: z.string().trim().min(3, 'Please give a reason').max(200),
});

export const listCreditNotesQuery = paginationQuery.extend({
  from: ymd.optional(),
  to: ymd.optional(),
  invoiceId: optional(objectId),
});