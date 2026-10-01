import mongoose from 'mongoose';

const { Schema } = mongoose;

const customerSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    stateCode: { type: String },
    address: { type: String, trim: true },
    outstandingPaise: { type: Number, default: 0, validate: Number.isInteger }, // credit balance owed to the shop
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

customerSchema.index({ shopId: 1, phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });
customerSchema.index({ shopId: 1, name: 1 });

export const Customer = mongoose.model('Customer', customerSchema);