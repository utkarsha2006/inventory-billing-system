import mongoose from 'mongoose';
import { STOCK_MOVEMENT_TYPES } from '../config/constants.js';

const { Schema } = mongoose;

const stockMovementSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'ProductBatch' },
    type: { type: String, enum: STOCK_MOVEMENT_TYPES, required: true },
    qtyChangeMilli: { type: Number, required: true }, // signed
    qtyBeforeMilli: { type: Number, required: true },
    qtyAfterMilli: { type: Number, required: true },
    reason: { type: String, trim: true },
    refType: { type: String, enum: ['Invoice', 'Purchase', 'CreditNote'] },
    refId: { type: Schema.Types.ObjectId },
    performedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false }
);

// Append-only ledger: corrections are new rows, never edits.
const blocked = [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'findOneAndReplace',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
];
stockMovementSchema.pre(blocked, function () {
  throw new Error('StockMovement is append-only');
});
stockMovementSchema.pre('save', function () {
  if (!this.isNew) throw new Error('StockMovement is append-only');
});

stockMovementSchema.index({ shopId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ shopId: 1, createdAt: -1 });
stockMovementSchema.index({ shopId: 1, refType: 1, refId: 1 });

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);