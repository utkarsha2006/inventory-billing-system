import { z } from 'zod';
import { GST_RATES, PURCHASE_PAYMENT_MODES } from '../config/constants.js';
import { hasMaxThreeDecimals } from '../utils/quantity.js';
import { objectId, optional, paginationQuery, ymd } from './common.validators.js';

const paise = z.number().int('Amount must be in whole paise').min(0).max(1_000_000_000);

const itemSchema = z.object({
  productId: objectId,
  qty: z.number().positive().max(9_999_999).refine(hasMaxThreeDecimals, 'At most 3 decimal places'),
  unitCostPaise: paise,
  discountPaise: paise.default(0),
  // Override only when the supplier's invoice shows a different rate than the product's.
  gstRate: optional(z.number().refine((r) => GST_RATES.includes(r), `GST rate must be one of ${GST_RATES.join(', ')}`)),
  batchNo: optional(z.string().trim().min(1).max(40)),
  expiryDate: optional(ymd.transform((s) => new Date(`${s}T00:00:00.000Z`))),
});

export const purchasePaymentSchema = z.object({
  mode: z.enum(PURCHASE_PAYMENT_MODES),
  amountPaise: paise.min(1),
  reference: optional(z.string().trim().max(60)),
});

export const createPurchaseSchema = z.object({
  supplierId: objectId,
  supplierInvoiceNo: z.string().trim().min(1, 'Supplier invoice number is required').max(40),
  purchaseDate: ymd,
  pricesIncludeGst: z.boolean().default(false),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(100),
  supplierInvoiceTotalPaise: optional(paise.min(1)), // the printed grand total, used to reconcile
  payments: z.array(purchasePaymentSchema).max(4).default([]),
  notes: optional(z.string().trim().max(200)),
});

export const listPurchasesQuery = paginationQuery.extend({
  supplierId: optional(objectId),
  from: ymd.optional(),
  to: ymd.optional(),
  paymentStatus: z.enum(['PAID', 'PARTIAL', 'UNPAID']).optional(),
});