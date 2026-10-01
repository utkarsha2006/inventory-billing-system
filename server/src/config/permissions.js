import { ROLES } from './constants.js';

const { OWNER, MANAGER, CASHIER } = ROLES;
const ALL = [OWNER, MANAGER, CASHIER];
const STAFF = [OWNER, MANAGER];

// Single source of truth for "who can do what". Routes reference permission names,
// never role names, so changing policy is a one-line edit here.
export const PERMISSIONS = Object.freeze({
  'customer:manage': ALL,
  'invoice:override-price': STAFF,
  'shop:manage': [OWNER],
  'user:manage': [OWNER],
  'product:read': ALL,
  'product:write': STAFF,
  'stock:adjust': STAFF,
  'stock:read': STAFF,
  'supplier:manage': STAFF,
  'purchase:write': STAFF,
  'invoice:create': ALL,
  'invoice:read': ALL,
  'return:create': STAFF,
  'report:read': STAFF,
  'cost:view': STAFF, // purchase price / profit visibility
});

export const hasPermission = (role, permission) =>
  PERMISSIONS[permission]?.includes(role) ?? false;

// change this line from `const` to `export const`:
export const emptyToUndefined = (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v);

// add below it:
export const blankToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);