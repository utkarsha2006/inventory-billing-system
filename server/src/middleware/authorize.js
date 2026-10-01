import { PERMISSIONS, hasPermission } from '../config/permissions.js';
import { ApiError } from '../utils/ApiError.js';

const deny = () => ApiError.forbidden('You do not have permission to perform this action');

// authorize('OWNER', 'MANAGER'): coarse, role-based
export const authorize = (...roles) => (req, _res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(deny());

// can('product:write'): preferred, permission-based
export const can = (permission) => {
  if (!PERMISSIONS[permission]) throw new Error(`Unknown permission: ${permission}`); // fail at boot
  return (req, _res, next) =>
    req.user && hasPermission(req.user.role, permission) ? next() : next(deny());
};