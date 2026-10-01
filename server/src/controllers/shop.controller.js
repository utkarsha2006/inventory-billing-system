import { asyncHandler } from '../utils/asyncHandler.js';
import * as shopService from '../services/shop.service.js';

export const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await shopService.getShop(req.user.shopId) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await shopService.updateShop(req.user.shopId, req.body) });
});