import { z } from 'zod';
import { PAYMENT_MODES } from '../config/constants.js';
import { hasMaxThreeDecimals } from '../utils/quantity.js';
import { objectId, optional, paginationQuery, ymd } from './common.validators.js';
import { inlineCustomerSchema, stateCodeSchema } from './customer.validators.js';

const paise = z.number().int('Amount must be in whole paise').min(0).max(1_000_000_000);

const itemSchema = z.object({
  productId: objectId,
  qty: z.number().positive().max(9_999_999).refine(hasMaxThreeDecimals, 'At most 3 decimal places'),
  unitPricePaise: paise.min(1).optional(), // override; Owner/Manager only
  discountPaise: paise.default(0), // flat amount, same terms as the price (inclusive/exclusive)
});

const invoiceBase = {
  customerId: optional(objectId),
  customer: inlineCustomerSchema.optional(),
  placeOfSupplyStateCode: optional(stateCodeSchema),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(100),
  billDiscountPaise: paise.default(0),
  notes: optional(z.string().trim().max(200)),
};

const customerRule = [
  (v) => !(v.customerId && v.customer),
  { message: 'Send either customerId or customer, not both', path: ['customer'] },
];

export const previewInvoiceSchema = z.object(invoiceBase).refine(...customerRule);

const paymentSchema = z.object({
  mode: z.enum(PAYMENT_MODES),
  amountPaise: paise.min(1).optional(), // may be omitted only when there is a single payment
  reference: optional(z.string().trim().max(60)),
});

export const createInvoiceSchema = z
  .object({
    ...invoiceBase,
    clientRequestId: z
      .string()
      .trim()
      .min(8)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/, 'Use letters, digits, - and _ only'),
    payments: z.array(paymentSchema).min(1, 'Add a payment').max(4),
  })
  .refine(...customerRule);

export const settlementSchema = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD']),
  amountPaise: paise.min(1),
  reference: optional(z.string().trim().max(60)),
});

export const listInvoicesQuery = paginationQuery.extend({
  from: ymd.optional(),
  to: ymd.optional(),
  customerId: optional(objectId),
  paymentStatus: z.enum(['PAID', 'PARTIAL', 'UNPAID']).optional(),
  q: optional(z.string().trim().max(40)),
});