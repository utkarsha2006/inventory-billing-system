import { asyncHandler } from '../utils/asyncHandler.js';
import * as userService from '../services/user.service.js';

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.listUsers(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const create = asyncHandler(async (req, res) => {
  const user = await userService.createUser(req.user.shopId, req.body);
  res.status(201).json({ success: true, data: user });
});

export const update = asyncHandler(async (req, res) => {
  const user = await userService.updateUser(req.user.shopId, req.params.id, req.body);
  res.json({ success: true, data: user });
});

export const resetPassword = asyncHandler(async (req, res) => {
  await userService.resetPassword(req.user.shopId, req.params.id, req.body.newPassword);
  res.json({ success: true, data: null });
});