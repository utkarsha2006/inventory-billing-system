import mongoose from 'mongoose';
import { REFUND_MODES } from '../config/constants.js';

const { Schema } = mongoose;

const intReq = () => ({
  type: Number,
  required: true,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
});

const itemSchema = new Schema({
  invoiceItemId: { type: Schema.Types.ObjectId, required: true },
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  sku: String,
  hsnCode: String,
  unit: String,
  qtyMilli: intReq(), // quantity returned in this credit note
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
  costPaise: intReq(), // cost of goods put back on the shelf (0 if not restocked)
  restock: { type: Boolean, required: true },
});

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

const creditNoteSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    creditNoteNo: { type: String, required: true }, // CN/2025-26/0001
    financialYear: { type: String, required: true },
    seq: { type: Number, required: true },
    creditNoteDate: { type: Date, required: true },
    clientRequestId: { type: String, required: true },

    // Rule 53 requires the original invoice reference on a credit note.
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNo: { type: String, required: true },
    originalInvoiceDate: { type: Date, required: true },
    originalDocumentType: { type: String, enum: ['TAX_INVOICE', 'BILL_OF_SUPPLY'], required: true },
    invoiceType: { type: String, enum: ['B2B', 'B2C'], required: true },

    customerId: { type: Schema.Types.ObjectId, ref: 'Customer' },
    customerSnapshot: {
      type: new Schema({ name: String, phone: String, gstin: String, stateCode: String, address: String }, { _id: false }),
    },
    shopSnapshot: {
      type: new Schema(
        {
          name: String,
          legalName: String,
          gstin: String,
          gstRegistrationType: String,
          stateCode: String,
          address: { line1: String, line2: String, city: String, pincode: String },
          phone: String,
          email: String,
          footerNote: String,
        },
        { _id: false }
      ),
    },
    placeOfSupplyStateCode: { type: String, required: true },
    supplyType: { type: String, enum: ['INTRA', 'INTER'], required: true },

    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    taxSummary: [
      new Schema(
        { hsnCode: String, gstRate: Number, taxablePaise: Number, cgstPaise: Number, sgstPaise: Number, igstPaise: Number },
        { _id: false }
      ),
    ],

    adjustedAgainstDuePaise: intReq(), // used to cancel an unpaid credit balance
    refundPaise: intReq(), // paid out (or kept as store credit)
    refundMode: { type: String, enum: REFUND_MODES, required: true },
    reason: { type: String, required: true },

    // Past 30 Nov following the original invoice's FY, GST cannot be reduced from output tax (Section 34).
    taxReductionBarred: { type: Boolean, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

creditNoteSchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function () {
  throw new Error('Credit notes cannot be deleted');
});

creditNoteSchema.index({ shopId: 1, creditNoteNo: 1 }, { unique: true });
creditNoteSchema.index({ shopId: 1, financialYear: 1, seq: 1 }, { unique: true });
creditNoteSchema.index({ shopId: 1, clientRequestId: 1 }, { unique: true });
creditNoteSchema.index({ shopId: 1, invoiceId: 1 });
creditNoteSchema.index({ shopId: 1, creditNoteDate: -1 });

export const CreditNote = mongoose.model('CreditNote', creditNoteSchema);