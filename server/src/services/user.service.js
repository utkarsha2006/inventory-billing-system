import bcrypt from 'bcrypt';
import { env } from '../config/env.js';
import { ROLES } from '../config/constants.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';
import { revokeAllForUser } from './auth.service.js';

export async function listUsers(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const [items, total] = await Promise.all([
    User.find({ shopId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments({ shopId }),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

export async function createUser(shopId, { password, ...rest }) {
  if (await User.exists({ email: rest.email })) {
    throw ApiError.conflict('An account with this email already exists');
  }
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  return User.create({ ...rest, passwordHash, shopId });
}

async function findManageableUser(shopId, id) {
  const user = await User.findOne({ _id: id, shopId }); // shopId scoping = tenant isolation
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === ROLES.OWNER) {
    throw ApiError.forbidden('The owner account cannot be modified here');
  }
  return user;
}

export async function updateUser(shopId, id, patch) {
  const user = await findManageableUser(shopId, id);
  Object.assign(user, patch); // patch is whitelisted by the strict Zod schema
  await user.save();
  if (patch.isActive === false) await revokeAllForUser(user._id);
  return user;
}

export async function resetPassword(shopId, id, newPassword) {
  const user = await findManageableUser(shopId, id);
  user.passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS);
  await user.save();
  await revokeAllForUser(user._id);
}