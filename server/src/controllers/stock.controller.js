import { asyncHandler } from '../utils/asyncHandler.js';
import * as stockService from '../services/stock.service.js';
import { presentProduct, presentBatch, presentMovement } from '../services/presenters.js';

export const adjust = asyncHandler(async (req, res) => {
  const { product, batch, movement } = await stockService.adjustStock(
    req.user.shopId,
    req.user.id,
    req.params.id,
    req.body
  );
  res.status(201).json({
    success: true,
    data: {
      product: presentProduct(product, req.user.role),
      batch: batch && presentBatch(batch, req.user.role),
      movement: presentMovement(movement),
    },
  });
});

export const movements = asyncHandler(async (req, res) => {
  const { items, meta } = await stockService.listMovements(req.user.shopId, req.params.id, req.query);
  res.json({ success: true, data: items.map(presentMovement), meta });
});

export const receiveBatch = asyncHandler(async (req, res) => {
  const { product, batch } = await stockService.receiveBatch(
    req.user.shopId,
    req.user.id,
    req.params.id,
    req.body
  );
  res.status(201).json({
    success: true,
    data: {
      product: presentProduct(product, req.user.role),
      batch: presentBatch(batch, req.user.role),
    },
  });
});

export const batches = asyncHandler(async (req, res) => {
  const items = await stockService.listBatches(req.user.shopId, req.params.id, req.query);
  res.json({ success: true, data: items.map((b) => presentBatch(b, req.user.role)) });
});