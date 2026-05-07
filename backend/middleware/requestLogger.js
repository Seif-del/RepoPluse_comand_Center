'use strict';

// backend/middleware/requestLogger.js
// Assigns a unique correlation ID to each incoming request and logs it.
// The correlation ID is attached to req.correlationId and sent back in the
// X-Correlation-Id response header so it can be traced across systems.
// All downstream code that logs should include req.correlationId.

const { randomUUID } = require('crypto');
// const logger = require('../../execution/logger');

function requestLogger(req, res, next) {
  req.correlationId = randomUUID();
  res.setHeader('X-Correlation-Id', req.correlationId);

  // Phase 1: structured logging wired once execution/logger.js has pino installed.
  // logger.info({ correlationId: req.correlationId, method: req.method, url: req.url }, 'Request received');

  next();
}

module.exports = requestLogger;
