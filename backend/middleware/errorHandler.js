'use strict';

// backend/middleware/errorHandler.js
// Global Express error handler. MUST be the last middleware registered in server.js.
// Maps known error codes to HTTP status codes.
// Never exposes stack traces or internal error details to the client in production.
// All 5xx errors are logged with their correlation ID for debugging.

// const logger = require('../../execution/logger');

// Known application error codes and their HTTP status mappings.
// Execution modules should set err.code to one of these values when throwing.
const STATUS_MAP = {
  UNAUTHORIZED:     401,
  FORBIDDEN:        403,
  NOT_FOUND:        404,
  VALIDATION_ERROR: 422,
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = STATUS_MAP[err.code] || 500;
  const message = status < 500 ? err.message : 'Internal server error';

  if (status >= 500) {
    // Phase 1: replace console.error with structured logger once pino is installed.
    console.error({ correlationId: req.correlationId, err }, 'Unhandled error');
  }

  res.status(status).json({
    ok: false,
    error: message,
    correlationId: req.correlationId,
  });
}

module.exports = errorHandler;
