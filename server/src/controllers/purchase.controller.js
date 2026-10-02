import { asyncHandler } from '../utils/asyncHandler.js';
import * as purchases from '../services/purchase.service.js';
import { presentPurchase } from '../services/presenters.js';

export const create = asyncHandler(async (req, res) => {
  const purchase = await purchases.createPurchase(req.user, req.body);
  res.status(201).json({ success: true, data: presentPurchase(purchase) });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await purchases.listPurchases(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: presentPurchase(await purchases.getPurchase(req.user.shopId, req.params.id)) });
});

export const addPayment = asyncHandler(async (req, res) => {
  const purchase = await purchases.recordPurchasePayment(req.user.shopId, req.user.id, req.params.id, req.body);
  res.status(201).json({ success: true, data: presentPurchase(purchase) });
});