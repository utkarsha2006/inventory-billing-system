import { asyncHandler } from '../utils/asyncHandler.js';
import * as suppliers from '../services/supplier.service.js';

export const create = asyncHandler(async (req, res) => {
  res.status(201).json({ success: true, data: await suppliers.createSupplier(req.user.shopId, req.body) });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await suppliers.listSuppliers(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await suppliers.getSupplier(req.user.shopId, req.params.id) });
});

export const update = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await suppliers.updateSupplier(req.user.shopId, req.params.id, req.body) });
});