import mongoose from 'mongoose';
import { PURCHASE_PAYMENT_MODES } from '../config/constants.js';

const { Schema } = mongoose;

const intReq = () => ({
  type: Number,
  required: true,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
});

const itemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  hsnCode: String,
  unit: String,
  qtyMilli: intReq(),
  unitCostPaise: intReq(), // as printed on the supplier's invoice
  priceIncludesGst: { type: Boolean, required: true },
  grossPaise: intReq(),
  discountPaise: intReq(),
  taxablePaise: intReq(),
  gstRate: { type: Number, required: true },
  cgstPaise: intReq(),
  sgstPaise: intReq(),
  igstPaise: intReq(),
  lineTotalPaise: intReq(),
  costBasisPaise: intReq(), // what goes into inventory cost (excludes GST only if ITC is claimable)
  batchNo: String,
  expiryDate: Date,
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

const paymentSchema = new Schema(
  {
    mode: { type: String, enum: PURCHASE_PAYMENT_MODES, required: true },
    amountPaise: intReq(),
    reference: String,
    paidAt: { type: Date, default: Date.now },
    paidBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const purchaseSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    supplierId: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierSnapshot: {
      type: new Schema({ name: String, gstin: String, stateCode: String, gstRegistrationType: String }, { _id: false }),
    },
    supplierInvoiceNo: { type: String, required: true, trim: true, uppercase: true },
    purchaseDate: { type: Date, required: true }, // midnight IST of the supplier invoice date

    supplyType: { type: String, enum: ['INTRA', 'INTER'], required: true },
    itcEligible: { type: Boolean, required: true }, // drives "input tax" in GSTR-3B (Phase 7)
    pricesIncludeGst: { type: Boolean, default: false },

    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    totals: { type: totalsSchema, required: true },
    taxSummary: [
      new Schema(
        { hsnCode: String, gstRate: Number, taxablePaise: Number, cgstPaise: Number, sgstPaise: Number, igstPaise: Number },
        { _id: false }
      ),
    ],

    payments: [paymentSchema],
    amountPaidPaise: intReq(),
    balanceDuePaise: intReq(),
    paymentStatus: { type: String, enum: ['PAID', 'PARTIAL', 'UNPAID'], required: true },

    notes: String,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, versionKey: false }
);

purchaseSchema.index({ shopId: 1, supplierId: 1, supplierInvoiceNo: 1 }, { unique: true }); // no double entry
purchaseSchema.index({ shopId: 1, purchaseDate: -1 });

export const Purchase = mongoose.model('Purchase', purchaseSchema);