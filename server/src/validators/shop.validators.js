import { z } from 'zod';
import { GST_REGISTRATION_TYPES, STATE_CODES } from '../config/constants.js';
import { GSTIN_REGEX } from '../utils/gstin.js';
import { optional, phoneSchema, emailSchema } from './common.validators.js';

const gstinSchema = z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Invalid GSTIN format');

export const shopFields = {
  name: z.string().trim().min(2, 'Shop name is required').max(100),
  legalName: optional(z.string().trim().max(150)),
  gstRegistrationType: z.enum(GST_REGISTRATION_TYPES),
  gstin: optional(gstinSchema),
  stateCode: z.string().refine((c) => c in STATE_CODES, 'Invalid GST state code'),
  address: z
    .object({
      line1: optional(z.string().trim().max(120)),
      line2: optional(z.string().trim().max(120)),
      city: optional(z.string().trim().max(60)),
      pincode: optional(z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits')),
    })
    .optional(),
  phone: optional(phoneSchema),
  email: optional(emailSchema),
};

export const updateShopSchema = z
  .object({
    ...shopFields,
    gstin: z.preprocess(
      (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
      gstinSchema.nullable().optional() // null clears the GSTIN
    ),
    invoiceSettings: z
      .object({
        prefix: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{1,3}$/, '1-3 letters/digits'),
        footerNote: z.string().trim().max(200),
        defaultPriceInclusive: z.boolean(),
        thermalWidthMm: z.union([z.literal(58), z.literal(80)]),
      })
      .partial(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');