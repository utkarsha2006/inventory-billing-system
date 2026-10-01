import { hasPermission } from '../config/permissions.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import * as productService from '../services/product.service.js';
import { presentProduct } from '../services/presenters.js';

export const create = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(req.user.shopId, req.user.id, req.body);
  res.status(201).json({ success: true, data: presentProduct(product, req.user.role) });
});

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await productService.listProducts(req.user.shopId, req.query, req.user.role);
  res.json({ success: true, data: items.map((p) => presentProduct(p, req.user.role)), meta });
});

export const lowStock = asyncHandler(async (req, res) => {
  const { items, meta } = await productService.listProducts(
    req.user.shopId,
    { ...req.query, lowStock: true },
    req.user.role
  );
  res.json({ success: true, data: items.map((p) => presentProduct(p, req.user.role)), meta });
});

export const categories = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await productService.listCategories(req.user.shopId) });
});

export const get = asyncHandler(async (req, res) => {
  const product = await productService.getProduct(req.user.shopId, req.params.id);
  res.json({ success: true, data: presentProduct(product, req.user.role) });
});

// Scanner lookup. Not found is a 404 with a structured payload so the UI can offer "Add this product".
export const byBarcode = asyncHandler(async (req, res) => {
  const { shopId, role } = req.user;
  const product = await productService.findByBarcode(shopId, req.params.code);

  if (!product || !product.isActive) {
    return res.status(404).json({
      success: false,
      error: { message: 'No active product found for this barcode' },
      data: {
        found: false,
        barcode: req.params.code,
        ...(product && {
          inactive: true, // barcode exists on a deactivated product
          ...(hasPermission(role, 'product:write') && { productId: product._id }),
        }),
      },
    });
  }
  res.json({ success: true, data: { found: true, product: presentProduct(product, role) } });
});

export const update = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.user.shopId, req.params.id, req.body);
  res.json({ success: true, data: presentProduct(product, req.user.role) });
});

export const remove = asyncHandler(async (req, res) => {
  const product = await productService.deactivateProduct(req.user.shopId, req.params.id);
  res.json({ success: true, data: presentProduct(product, req.user.role) });
});