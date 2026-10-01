import mongoose from 'mongoose';
import { PAYMENT_MODES } from '../config/constants.js';

const { Schema } = mongoose;

const intReq = () => ({
  type: Number,
  required: true,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
});

const batchPickSchema = new Schema(
  {
    batchId: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
    batchNo: String,
    expiryDate: Date,
    qtyMilli: intReq(),
    costPaise: intReq(),
  },
  { _id: false }
);

// Everything is a snapshot: later product edits must never alter an issued invoice.
const itemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  sku: String,
  hsnCode: String,
  unit: String,
  qtyMilli: intReq(),
  unitPricePaise: intReq(),
  priceIncludesGst: { type: Boolean, required: true },
  grossPaise: intReq(),
  discountPaise: intReq(),
  billDiscountSharePaise: intReq(),
  taxablePaise: intReq(),
  gstRate: { type: Number, required: true },
  cgstPaise: intReq(),
  sgstPaise: intReq(),
  igstPaise: intReq(),
  lineTotalPaise: intReq(),
  costPaise: intReq(), // total cost of goods for this line (profit = taxable - cost)
  batches: [batchPickSchema],
});

const paymentSchema = new Schema(
  {
    mode: { type: String, enum: PAYMENT_MODES, required: true },
    amountPaise: intReq(),
    reference: String,
    receivedAt: { type: Date, default: Date.now },
    receivedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const totalsSchema = new Schema(
  {
    subtotalPaise: intReq(),
    itemDiscountPaise: intReq(),
    billDiscountPaise: intReq(),
    taxablePaise: intReq(),
    cgstPaise: intReq(),
    sgstPaise: intReq(),
    igstPaise: intReq(),
    roundOffPaise: intReq(),
    grandTotalPaise: intReq(),
  },
  { _id: false }
);

const taxSummarySchema = new Schema(
  {
    hsnCode: { type: String, default: '' },
    gstRate: Number,
    taxablePaise: Number,
    cgstPaise: Number,
    sgstPaise: Number,
    igstPaise: Number,
  },
  { _id: false }
);

const partySnapshot = {
  name: String,
  phone: String,
  gstin: String,
  stateCode: String,
  address: String,
};

const invoiceSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    invoiceNo: { type: String, required: true },
    financialYear: { type: String, required: true },
    seq: { type: Number, required: true },
    invoiceDate: { type: Date, required: true },
    clientRequestId: { type: String, required: true },

    documentType: { type: String, enum: ['TAX_INVOICE', 'BILL_OF_SUPPLY'], required: true },
    invoiceType: { type: String, enum: ['B2B', 'B2C'], required: true },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: { type: new Schema(partySnapshot, { _id: false }) },
    shopSnapshot: {
      type: new Schema(
        {
          name: String,
          legalName: String,
          gstin: String,
          stateCode: String,
          address: { line1: String, line2: String, city: String, pincode: String },
          phone: String,
          email: String,
          footerNote: String,
          gstRegistrationType: String,
        },
        { _id: false }
      ),
    },

    placeOfSupplyStateCode: { type: String, required: true },
    supplyType: { type: String, enum: ['INTRA', 'INTER'], required: true },

    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    taxSummary: [taxSummarySchema],

    payments: [paymentSchema],
    amountPaidPaise: intReq(),
    balanceDuePaise: intReq(),
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'UNPAID'], required: true },

    status: { type: String, enum: ['COMPLETED', 'CANCELLED'], default: 'COMPLETED' },
    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

// Invoices are legal documents: never deleted. Corrections are credit notes (Phase 6).
invoiceSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('Invoices cannot be deleted');
});

invoiceSchema.index({ shopId: 1, invoiceNo: 1 }, { unique: true });
invoiceSchema.index({ shopId: 1, financialYear: 1, seq: 1 }, { unique: true });
invoiceSchema.index({ shopId: 1, clientRequestId: 1 }, { unique: true });
invoiceSchema.index({ shopId: 1, invoiceDate: -1 });
invoiceSchema.index({ shopId: 1, customerId: 1, invoiceDate: -1 });
invoiceSchema.index({ shopId: 1, invoiceType: 1, invoiceDate: 1 }); // GSTR-1 queries

export const Invoice = mongoose.model('Invoice', invoiceSchema);