import { z } from 'zod';
import { GST_REGISTRATION_TYPES } from '../config/constants.js';
import { gstProfileIssues } from '../utils/gstin.js';
import { optional, phoneSchema, blankToNull, paginationQuery } from './common.validators.js';
import { stateCodeSchema } from './customer.validators.js';

// Format and check digit are verified by gstProfileIssues below.
const gstin = z.string().trim().toUpperCase().length(15, 'GSTIN must be 15 characters');

export const createSupplierSchema = z
  .object({
    name: z.string().trim().min(1, 'Supplier name is required').max(120),
    gstRegistrationType: z.enum(GST_REGISTRATION_TYPES).optional(),
    gstin: optional(gstin),
    stateCode: optional(stateCodeSchema),
    phone: optional(phoneSchema),
    address: optional(z.string().trim().max(200)),
  })
  .transform((v) => ({
    ...v,
    gstRegistrationType: v.gstRegistrationType ?? (v.gstin ? 'REGULAR' : 'UNREGISTERED'),
    stateCode: v.stateCode ?? v.gstin?.slice(0, 2), // a GSTIN's first two digits ARE the state
  }))
  .superRefine((v, ctx) => {
    const add = (path, message) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    if (!v.stateCode) add('stateCode', 'State is required for suppliers without a GSTIN');
    for (const issue of gstProfileIssues(v)) add(issue.path, issue.message);
  });

export const updateSupplierSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    gstRegistrationType: z.enum(GST_REGISTRATION_TYPES),
    gstin: z.preprocess(blankToNull, gstin.nullable()),
    stateCode: stateCodeSchema,
    phone: z.preprocess(blankToNull, phoneSchema.nullable()),
    address: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

export const listSuppliersQuery = paginationQuery.extend({ q: optional(z.string().trim().max(60)) });