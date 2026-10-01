import mongoose from 'mongoose';
import { GST_REGISTRATION_TYPES } from '../config/constants.js';

const { Schema } = mongoose;

const shopSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    gstin: { type: String, uppercase: true, trim: true },
    gstRegistrationType: {
      type: String,
      enum: GST_REGISTRATION_TYPES,
      default: 'UNREGISTERED',
    },
    stateCode: { type: String, required: true }, // e.g. "27"
    address: { line1: String, line2: String, city: String, pincode: String },
    phone: String,
    email: { type: String, lowercase: true, trim: true },
    invoiceSettings: {
      prefix: { type: String, default: 'INV', uppercase: true, trim: true },
      footerNote: { type: String, default: 'Thank you for shopping with us!' },
      defaultPriceInclusive: { type: Boolean, default: true },
      thermalWidthMm: { type: Number, enum: [58, 80], default: 80 },
    },
  },
  { timestamps: true, versionKey: false }
);

// One shop per owner today. Dropping this index is the only change needed
// (plus a Membership collection) to allow multi-shop later.
shopSchema.index({ ownerId: 1 }, { unique: true });
shopSchema.index({ gstin: 1 }, { unique: true, partialFilterExpression: { gstin: { $type: 'string' } } });

export const Shop = mongoose.model('Shop', shopSchema);