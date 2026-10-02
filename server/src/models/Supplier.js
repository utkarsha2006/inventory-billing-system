import mongoose from 'mongoose';
import { GST_REGISTRATION_TYPES } from '../config/constants.js';

const { Schema } = mongoose;

const supplierSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true, trim: true },
    gstin: { type: String, uppercase: true, trim: true },
    gstRegistrationType: { type: String, enum: GST_REGISTRATION_TYPES, default: 'UNREGISTERED' },
    stateCode: { type: String, required: true }, // decides CGST+SGST vs IGST on purchases
    phone: { type: String, trim: true },
    address: { type: String, trim: true },
    outstandingPaise: { type: Number, default: 0, validate: Number.isInteger }, // what the shop owes the supplier
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, versionKey: false }
);

supplierSchema.index({ shopId: 1, name: 1 });
supplierSchema.index({ shopId: 1, gstin: 1 }, { unique: true, partialFilterExpression: { gstin: { $type: 'string' } } });

export const Supplier = mongoose.model('Supplier', supplierSchema);