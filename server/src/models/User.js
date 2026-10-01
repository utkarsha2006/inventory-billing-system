import mongoose from 'mongoose';
import { ROLE_LIST } from '../config/constants.js';

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLE_LIST, required: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        delete ret.passwordHash;
        return ret;
      },
    },
  }
);

userSchema.index({ email: 1 }, { unique: true }); // global: login needs no shop selector
userSchema.index({ shopId: 1, role: 1 });

export const User = mongoose.model('User', userSchema);