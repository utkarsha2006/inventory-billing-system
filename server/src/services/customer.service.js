import { Customer } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { escapeRegex } from '../utils/escapeRegex.js';
import { parsePagination, paginationMeta } from '../utils/pagination.js';

export const createCustomer = (shopId, input) => Customer.create({ ...input, shopId });

export async function listCustomers(shopId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { shopId, isActive: true };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  const [items, total] = await Promise.all([
    Customer.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta({ page, limit, total }) };
}

export async function getCustomer(shopId, id) {
  const customer = await Customer.findOne({ _id: id, shopId });
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

export async function updateCustomer(shopId, id, patch) {
  const customer = await getCustomer(shopId, id);
  for (const [key, value] of Object.entries(patch)) customer.set(key, value === null ? undefined : value);
  if (patch.gstin) customer.stateCode = patch.gstin.slice(0, 2);
  await customer.save();
  return customer;
}