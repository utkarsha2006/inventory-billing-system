import { Supplier } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { gstProfileIssues } from '../utils/gstin.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';

export const createSupplier = (shopId, input) => Supplier.create({ ...input, shopId });

export async function listSuppliers(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId, isActive: true };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { phone: rx }, { gstin: rx }];
  }
  const [items, total] = await Promise.all([
    Supplier.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

export async function getSupplier(shopId, id) {
  const supplier = await Supplier.findOne({ _id: id, shopId });
  if (!supplier) throw ApiError.notFound('Supplier not found');
  return supplier;
}

export async function updateSupplier(shopId, id, patch) {
  const supplier = await getSupplier(shopId, id);
  for (const [key, value] of Object.entries(patch)) supplier.set(key, value === null ? undefined : value);

  if (patch.gstin && !patch.stateCode) supplier.stateCode = patch.gstin.slice(0, 2);
  if (patch.gstin && !patch.gstRegistrationType && supplier.gstRegistrationType === 'UNREGISTERED') {
    supplier.gstRegistrationType = 'REGULAR';
  }

  // Re-validate the merged result, as in the shop settings.
  const issues = gstProfileIssues({
    gstin: supplier.gstin,
    gstRegistrationType: supplier.gstRegistrationType,
    stateCode: supplier.stateCode,
  });
  if (issues.length) throw ApiError.badRequest('Validation failed', issues);

  await supplier.save();
  return supplier;
}