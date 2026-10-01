import { env } from '../config/env.js';
import { REFRESH_COOKIE } from '../config/constants.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as authService from '../services/auth.service.js';

const isProd = env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true, // JS can't read it, which limits the damage from XSS
  secure: isProd,
  // Vercel (frontend) and Render (backend) are different sites, so prod needs SameSite=None.
  sameSite: isProd ? 'none' : 'lax',
  path: '/api/v1/auth', // browser only sends it to auth routes
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
};
const { maxAge: _ignored, ...clearOptions } = cookieOptions;

const meta = (req) => ({ userAgent: req.get('user-agent'), ip: req.ip });

export const registerShop = asyncHandler(async (req, res) => {
  const { user, shop, accessToken, refreshToken } = await authService.registerShop(req.body, meta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.status(201).json({ success: true, data: { user, shop, accessToken } });
});

export const login = asyncHandler(async (req, res) => {
  const { user, accessToken, refreshToken } = await authService.login(req.body, meta(req));
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
  res.json({ success: true, data: { user, accessToken } });
});

export const refresh = asyncHandler(async (req, res) => {
  try {
    const { user, accessToken, refreshToken } = await authService.refresh(
      req.cookies[REFRESH_COOKIE],
      meta(req)
    );
    res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions);
    res.json({ success: true, data: { user, accessToken } });
  } catch (err) {
    res.clearCookie(REFRESH_COOKIE, clearOptions);
    throw err;
  }
});

export const logout = asyncHandler(async (req, res) => {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  res.json({ success: true, data: null });
});

export const me = asyncHandler(async (req, res) => {
  const data = await authService.getProfile(req.user.id);
  res.json({ success: true, data });
});

export const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user.id, req.body);
  res.clearCookie(REFRESH_COOKIE, clearOptions);
  res.json({ success: true, data: null });
});