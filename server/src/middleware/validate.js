import { ApiError } from '../utils/ApiError.js';

// validate({ body: schema, query: schema, params: schema })
// Replaces req.* with the parsed output: coerced, trimmed, defaulted, unknown keys stripped.
export const validate = (schemas) => (req, _res, next) => {
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      return next(ApiError.badRequest('Validation failed', details));
    }
    req[key] = result.data;
  }
  next();
};