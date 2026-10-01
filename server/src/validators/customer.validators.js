import { z } from 'zod';
import { STATE_CODES } from '../config/constants.js';
import { isValidGstin } from '../utils/gstin.js';
import { optional, phoneSchema, blankToNull, paginationQuery } from './common.validators.js';

export const stateCodeSchema = z.string().refine((c) => c in STATE_CODES, 'Invalid GST state code');

const gstinField = z
  .string()
  .trim()
  .toUpperCase()
  .refine(isValidGstin, 'Invalid GSTIN (format or check digit)');

// A GSTIN's first two digits ARE the state, so derive it rather than trust a second field.
const deriveState = (v) => (v.gstin ? { ...v, stateCode: v.gstin.slice(0, 2) } : v);

// Used for saved customers and for the one-off customer typed in at the POS.
export const inlineCustomerSchema = z
  .object({
    name: z.string().trim().min(1, 'Customer name is required').max(100),
    phone: optional(phoneSchema),
    gstin: optional(gstinField),
    stateCode: optional(stateCodeSchema),
    address: optional(z.string().trim().max(200)),
  })
  .transform(deriveState);

export const createCustomerSchema = inlineCustomerSchema;

export const updateCustomerSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    phone: z.preprocess(blankToNull, phoneSchema.nullable()),
    gstin: z.preprocess(blankToNull, gstinField.nullable()),
    stateCode: z.preprocess(blankToNull, stateCodeSchema.nullable()),
    address: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const listCustomersQuery = paginationQuery.extend({
  q: optional(z.string().trim().max(60)),
});