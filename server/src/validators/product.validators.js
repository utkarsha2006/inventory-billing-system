import { z } from 'zod';
import {
  UNITS,
  GST_RATES,
  MANUAL_ADJUSTMENT_TYPES,
  STOCK_MOVEMENT_TYPES,
} from '../config/constants.js';
import { normalizeBarcode } from '../utils/barcode.js';
import { hasMaxThreeDecimals, qtyProblem } from '../utils/quantity.js';
import {
  objectId,
  optional,
  paginationQuery,
  emptyToUndefined,
  blankToNull,
} from './common.validators.js';

const MAX_PAISE = 1_000_000_000; // ₹1 crore per unit
const MAX_QTY = 9_999_999;

const paise = z.number().int('Amount must be in whole paise').min(0).max(MAX_PAISE);
const qty = z.number().min(0).max(MAX_QTY).refine(hasMaxThreeDecimals, 'At most 3 decimal places');

export const barcodeSchema = z
  .string()
  .trim()
  .min(4, 'Barcode is too short')
  .max(48)
  .regex(/^[A-Za-z0-9._\-\/]+$/, 'Barcode contains invalid characters')
  .transform(normalizeBarcode);

const skuSchema = z
  .string()
  .trim()
  .min(1, 'SKU is required')
  .max(40)
  .regex(/^[A-Za-z0-9._\-\/]+$/, 'SKU may contain letters, digits and . _ - /')
  .transform((s) => s.toUpperCase());

const hsnSchema = z
  .string()
  .trim()
  .regex(/^(\d{4}|\d{6}|\d{8})$/, 'HSN must be 4, 6 or 8 digits');

const gstRateSchema = z
  .number()
  .refine((r) => GST_RATES.includes(r), `GST rate must be one of ${GST_RATES.join(', ')}`);

const categorySchema = z.string().trim().min(1).max(60);

export const createProductSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    sku: skuSchema,
    barcode: optional(barcodeSchema),
    hsnCode: optional(hsnSchema),
    category: z.preprocess(emptyToUndefined, categorySchema.default('General')),
    unit: z.enum(UNITS),
    purchasePricePaise: paise.default(0),
    sellingPricePaise: paise.min(1, 'Selling price is required'),
    mrpPaise: optional(paise),
    priceIncludesGst: z.boolean().default(true),
    gstRate: gstRateSchema,
    openingStock: qty.default(0),
    reorderLevel: qty.default(0),
    trackBatches: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (!UNITS.includes(v.unit)) return;
    const add = (path, message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });

    for (const key of ['openingStock', 'reorderLevel']) {
      const problem = qtyProblem(v.unit, v[key]);
      if (problem) add(key, problem);
    }
    if (v.trackBatches && v.openingStock > 0) {
      add('openingStock', 'For batch-tracked products, add stock as a batch after creating the product');
    }
  });

// unit, trackBatches and openingStock are intentionally not editable.
export const updateProductSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    sku: skuSchema,
    barcode: z.preprocess(blankToNull, barcodeSchema.nullable()), // null clears it
    hsnCode: z.preprocess(blankToNull, hsnSchema.nullable()),
    category: categorySchema,
    purchasePricePaise: paise,
    sellingPricePaise: paise.min(1),
    mrpPaise: paise.nullable(),
    priceIncludesGst: z.boolean(),
    gstRate: gstRateSchema,
    reorderLevel: qty,
    isActive: z.boolean(),
  })
  .partial()
  .strict()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field to update');

const boolFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => v === 'true');

export const listProductsQuery = paginationQuery.extend({
  q: optional(z.string().trim().max(60)),
  category: optional(z.string().trim().max(60)),
  lowStock: boolFlag,
  includeInactive: boolFlag,
});

export const barcodeParam = z.object({ code: barcodeSchema });

export const stockAdjustmentSchema = z
  .object({
    type: z.enum(MANUAL_ADJUSTMENT_TYPES),
    qtyChange: z
      .number()
      .refine((v) => v !== 0, 'qtyChange cannot be zero')
      .refine((v) => Math.abs(v) <= MAX_QTY, 'Quantity is too large')
      .refine(hasMaxThreeDecimals, 'At most 3 decimal places'),
    reason: z.string().trim().min(3, 'Please give a reason').max(200),
    batchId: optional(objectId),
  })
  .superRefine((v, ctx) => {
    const add = (message) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['qtyChange'], message });
    if ((v.type === 'DAMAGE' || v.type === 'EXPIRED') && v.qtyChange > 0) {
      add(`${v.type} must reduce stock (use a negative quantity)`);
    }
    if (v.type === 'OPENING' && v.qtyChange < 0) {
      add('OPENING must add stock (use a positive quantity)');
    }
  });

const ymd = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

export const movementsQuery = paginationQuery.extend({
  type: z.enum(STOCK_MOVEMENT_TYPES).optional(),
  from: ymd.optional(),
  to: ymd.optional(),
});

export const receiveBatchSchema = z.object({
  batchNo: z.string().trim().min(1, 'Batch number is required').max(40),
  expiryDate: ymd.transform((s) => new Date(`${s}T00:00:00.000Z`)),
  qty: z.number().positive().max(MAX_QTY).refine(hasMaxThreeDecimals, 'At most 3 decimal places'),
  purchasePricePaise: optional(paise),
});

export const batchesQuery = z.object({ includeEmpty: boolFlag });