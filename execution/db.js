'use strict';

// execution/db.js
// PostgreSQL connection pool. Shared by all execution modules.
// Instantiated once on first import via Node's module cache.
// Never create additional pool instances elsewhere in the codebase.

const { Pool }  = require('pg');
const config    = require('../config');
const logger    = require('./logger');

const pool = new Pool({
  connectionString:      config.databaseUrl,
  max:                   10,
  idleTimeoutMillis:     30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected PostgreSQL pool error');
});

module.exports = pool;
