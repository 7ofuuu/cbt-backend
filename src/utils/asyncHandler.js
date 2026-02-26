/**
 * Async handler wrapper to eliminate try/catch boilerplate in controllers.
 * Wraps an async route handler and forwards any errors to Express error handler.
 *
 * Usage:
 *   const { asyncHandler } = require('../utils/asyncHandler');
 *   router.get('/path', asyncHandler(async (req, res) => { ... }));
 *
 * Or in controller:
 *   module.exports = { myHandler: asyncHandler(async (req, res) => { ... }) };
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Custom application error class for structured error handling.
 * Throw this in services/controllers to return specific HTTP status codes.
 *
 * Usage:
 *   throw new AppError('Resource not found', 404);
 */
class AppError extends Error {
  constructor(message, statusCode = 500, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Global error handler middleware.
 * Place at the end of middleware chain: app.use(errorHandler);
 */
const errorHandler = (err, req, res, _next) => {
  // Prisma unique constraint violation
  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: 'Data sudah ada (duplikat)',
    });
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'Data tidak ditemukan',
    });
  }

  // Operational errors thrown by AppError
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Unknown/unexpected errors
  console.error('Unexpected error:', err);
  res.status(500).json({
    success: false,
    error: 'Terjadi kesalahan internal',
  });
};

module.exports = { asyncHandler, AppError, errorHandler };
