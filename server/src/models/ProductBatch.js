import mongoose from 'mongoose';

const { Schema } = mongoose;

const intField = (extra = {}) => ({
  type: Number,
  min: 0,
  validate: { validator: Number.isInteger, message: '{PATH} must be an integer' },
  ...extra,
});

const productBatchSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchNo: { type: String, required: true, trim: true },
    expiryDate: { type: Date, required: true }, // stored as UTC midnight of the printed date
    initialQtyMilli: intField({ default: 0 }),
    qtyRemainingMilli: intField({ default: 0 }),
    purchasePricePaise: intField({ default: 0 }),
    purchaseId: { type: Schema.Types.ObjectId, ref: 'Purchase' }, // set in Phase 6
  },
  { timestamps: true, versionKey: false }
);

productBatchSchema.index({ shopId: 1, productId: 1, batchNo: 1 }, { unique: true });
productBatchSchema.index({ shopId: 1, productId: 1, expiryDate: 1 }); // FEFO picking
productBatchSchema.index({ shopId: 1, expiryDate: 1 }); // expiry alerts

export const ProductBatch = mongoose.model('ProductBatch', productBatchSchema);