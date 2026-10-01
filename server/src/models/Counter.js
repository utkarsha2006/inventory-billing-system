import mongoose from 'mongoose';

const { Schema } = mongoose;

const counterSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    key: { type: String, required: true }, // "INV:2025-26", "CN:2025-26"
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

counterSchema.index({ shopId: 1, key: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);