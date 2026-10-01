import { Shop } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { gstProfileIssues } from '../utils/gstin.js';

export async function getShop(shopId) {
  const shop = await Shop.findById(shopId);
  if (!shop) throw ApiError.notFound('Shop not found');
  return shop;
}

export async function updateShop(shopId, patch) {
  const shop = await getShop(shopId);
  const { gstin, address, invoiceSettings, ...rest } = patch;

  shop.set(rest);
  // Set nested fields individually so a partial patch merges instead of replacing.
  for (const [k, v] of Object.entries(address ?? {})) shop.set(`address.${k}`, v);
  for (const [k, v] of Object.entries(invoiceSettings ?? {})) shop.set(`invoiceSettings.${k}`, v);
  if (gstin !== undefined) shop.gstin = gstin === null ? undefined : gstin;

  // Re-validate the merged result: e.g. changing stateCode alone must not orphan the GSTIN.
  const issues = gstProfileIssues({
    gstin: shop.gstin,
    gstRegistrationType: shop.gstRegistrationType,
    stateCode: shop.stateCode,
  });
  if (issues.length) throw ApiError.badRequest('Validation failed', issues);

  await shop.save();
  return shop;
}