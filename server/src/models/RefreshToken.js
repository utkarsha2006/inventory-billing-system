import mongoose from 'mongoose';

const { Schema } = mongoose;

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    shopId: { type: Schema.Types.ObjectId, ref: 'Shop', required: true },
    tokenHash: { type: String, required: true }, // sha256 of the raw token
    family: { type: String, required: true }, // one family per login session
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: Schema.Types.ObjectId, ref: 'RefreshToken' },
    userAgent: String,
    ip: String,
  },
  { timestamps: true, versionKey: false }
);

refreshTokenSchema.index({ tokenHash: 1 }, { unique: true });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL cleanup
refreshTokenSchema.index({ userId: 1, family: 1 });

export const RefreshToken = mongoose.model('RefreshToken', refreshTokenSchema);