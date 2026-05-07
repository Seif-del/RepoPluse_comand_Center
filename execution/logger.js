'use strict';

// execution/logger.js
// Structured logger for all application code.
// Every log entry should include a correlationId when one is available.
// Use logger.info / logger.warn / logger.error — never console.log in production paths.
//
// Install pino before going to production: npm install pino
// Then uncomment the pino block below and remove the console fallback.

// const pino = require('pino');
// const config = require('../config');
//
// module.exports = pino({ level: config.logLevel });

// Phase 1 stub — console fallback until pino is installed.
// Matches the pino method signatures used throughout the codebase
// so the swap-out is a one-line change in this file only.
const logger = {
  info:  (obj, msg) => console.log('[INFO]',  msg !== undefined ? msg : obj, msg !== undefined ? obj : ''),
  warn:  (obj, msg) => console.warn('[WARN]',  msg !== undefined ? msg : obj, msg !== undefined ? obj : ''),
  error: (obj, msg) => console.error('[ERROR]', msg !== undefined ? msg : obj, msg !== undefined ? obj : ''),
  debug: (obj, msg) => console.debug('[DEBUG]', msg !== undefined ? msg : obj, msg !== undefined ? obj : ''),
};

module.exports = logger;
