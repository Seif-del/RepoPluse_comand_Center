'use strict';

// execution/db.js
// PostgreSQL connection pool. Shared by all execution modules.
// Instantiated once on first import via Node's module cache.
// Never create additional pool instances elsewhere in the codebase.

const { Pool }  = require('pg');
const config    = require('../config');
const logger    = require('./logger');

if (!config.databaseUrl) {
  const msg = 'DATABASE_URL is not configured. Set DATABASE_URL in .env and restart the server.';
  logger.error(msg);
  throw new Error(msg);
}

// Parse the database name from the URL so startup logs and error messages
// identify the exact database being targeted — catching name mismatches early.
let _dbName = '(unknown)';
try {
  _dbName = new URL(config.databaseUrl).pathname.replace(/^\//, '') || '(unknown)';
} catch (_) {}

logger.info({ database: _dbName }, 'PostgreSQL pool initialising — verify this database exists');

const pool = new Pool({
  connectionString:        config.databaseUrl,
  max:                     10,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err, database: _dbName }, `Unexpected PostgreSQL pool error on database "${_dbName}"`);
});

module.exports = pool;
