import { asyncHandler } from '../utils/asyncHandler.js';
import * as customers from '../services/customer.service.js';

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await customers.createCustomer(req.user.shopId, req.body) });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await customers.listCustomers(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await customers.getCustomer(req.user.shopId, req.params.id) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({
    success: true,
    data: await customers.updateCustomer(req.user.shopId, req.params.id, req.body),
  });
});