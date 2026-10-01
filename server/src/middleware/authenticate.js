import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Missing access token');

  let payload;
  try {
    payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
  } catch (err) {
    throw ApiError.unauthorized(
      err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token'
    );
  }

  // One indexed lookup per request so that role changes and deactivation
  // take effect immediately, not after the 15-minute token expiry.
  const user = await User.findById(payload.sub).select('shopId role isActive').lean();
  if (!user || !user.isActive) throw ApiError.unauthorized('Account is disabled or no longer exists');

  req.user = { id: String(user._id), shopId: String(user.shopId), role: user.role };
  next();
});