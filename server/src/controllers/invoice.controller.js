import { asyncHandler } from '../utils/asyncHandler.js';
import * as billing from '../services/billing.service.js';
import { presentInvoice } from '../services/presenters.js';

export const preview = asyncHandler(async (req, res) => {
  const data = await billing.previewInvoice(req.user, req.body);
  res.json({ success: true, data: presentInvoice(data, req.user.role) });
});

export const create = asyncHandler(async (req, res) => {
  const { invoice, replay } = await billing.createInvoice(req.user, req.body);
  res.status(replay ? 200 : 201).json({
    success: true,
    data: presentInvoice(invoice, req.user.role),
    ...(replay && { meta: { idempotentReplay: true } }),
  });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await billing.listInvoices(req.user.shopId, req.query);
  res.json({ success: true, data: items, meta });
});

export const get = asyncHandler(async (req, res) => {
  const invoice = await billing.getInvoice(req.user.shopId, req.params.id);
  res.json({ success: true, data: presentInvoice(invoice, req.user.role) });
});

export const addPayment = asyncHandler(async (req, res) => {
  const invoice = await billing.recordPayment(req.user.shopId, req.user.id, req.params.id, req.body);
  res.status(201).json({ success: true, data: presentInvoice(invoice, req.user.role) });
});