import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';
import { Shop, User, RefreshToken } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', env.BCRYPT_ROUNDS);

const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user._id), shopId: String(user.shopId), role: user.role },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL }
  );

async function issueRefreshToken(user, family, meta) {
  const token = jwt.sign(
    { sub: String(user._id), family, jti: crypto.randomUUID() }, // jti keeps every token unique
    env.JWT_REFRESH_SECRET,
    { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` }
  );
  const doc = await RefreshToken.create({
    userId: user._id,
    shopId: user.shopId,
    tokenHash: sha256(token), // only the hash is stored
    family,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    userAgent: meta.userAgent?.slice(0, 255),
    ip: meta.ip,
  });
  return { token, doc };
}

async function createSession(user, meta, family = crypto.randomUUID()) {
  const accessToken = signAccessToken(user);
  const { token: refreshToken, doc } = await issueRefreshToken(user, family, meta);
  return { accessToken, refreshToken, refreshDocId: doc._id };
}

const revokeFamily = (family) =>
  RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });

export const revokeAllForUser = (userId) =>
  RefreshToken.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

export async function registerShop({ shop, owner }, meta) {
  if (await User.exists({ email: owner.email })) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(owner.password, env.BCRYPT_ROUNDS);

  // Shop.ownerId and User.shopId reference each other, so pre-generate both ids.
  const userId = new mongoose.Types.ObjectId();
  const shopId = new mongoose.Types.ObjectId();

  // Shop + owner are created atomically: never a shop without an owner or vice versa.
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Shop.create([{ ...shop, _id: shopId, ownerId: userId }], { session });
      await User.create(
        [
          {
            _id: userId,
            shopId,
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            passwordHash,
            role: ROLES.OWNER,
          },
        ],
        { session }
      );
    });
  } finally {
    await session.endSession();
  }

  const [user, shopDoc] = await Promise.all([User.findById(userId), Shop.findById(shopId)]);
  const tokens = await createSession(user, meta);
  return { user, shop: shopDoc, ...tokens };
}

export async function login({ email, password }, meta) {
  const user = await User.findOne({ email }).select('+passwordHash');
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || !passwordOk || !user.isActive) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  await User.updateOne({ _id: user._id }, { lastLoginAt: new Date() });
  const tokens = await createSession(user, meta);
  return { user, ...tokens };
}

export async function refresh(rawToken, meta) {
  if (!rawToken) throw ApiError.unauthorized('Missing refresh token');

  try {
    jwt.verify(rawToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const tokenHash = sha256(rawToken);

  // Atomic "claim": only one concurrent request can flip revokedAt from null.
  const stored = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  if (!stored) {
    // A valid, signed token that is unknown or already used was replayed.
    // Assume theft and kill the whole session family.
    const replayed = await RefreshToken.findOne({ tokenHash });
    if (replayed) await revokeFamily(replayed.family);
    throw ApiError.unauthorized('Invalid refresh token');
  }

  const user = await User.findById(stored.userId);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is disabled');

  const session = await createSession(user, meta, stored.family);
  await RefreshToken.updateOne({ _id: stored._id }, { replacedBy: session.refreshDocId });
  return { user, ...session };
}

export async function logout(rawToken) {
  if (!rawToken) return;
  const stored = await RefreshToken.findOne({ tokenHash: sha256(rawToken) });
  if (stored) await revokeFamily(stored.family);
}

export async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  const shop = await Shop.findById(user.shopId);
  return { user, shop };
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User not found');

  // 400, not 401: a 401 would make the client's refresh interceptor think the session expired.
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await user.save();
  await revokeAllForUser(user._id); // sign out every device
}