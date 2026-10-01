import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = 500;
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError) {
    ({ status, message, details } = err);
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || {}).filter((k) => k !== 'shopId');
    message = `Duplicate value for: ${fields.join(', ') || 'a unique field'}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  if (status >= 500) console.error(err);

  res.status(status).json({
    success: false,
    error: {
      message,
      ...(details && { details }),
      ...(env.NODE_ENV === 'development' && status >= 500 && { stack: err.stack }),
    },
  });
}