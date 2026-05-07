'use strict';

// execution/db.js
// PostgreSQL connection pool. Shared by all execution modules.
// Instantiated once on first import via Node's module cache.
// Never create additional pool instances elsewhere in the codebase.
//
// Install the driver before use: npm install pg
// Then uncomment the pool block below and remove the stub.

// const { Pool } = require('pg');
// const config = require('../config');
//
// const pool = new Pool({
//   connectionString: config.databaseUrl || process.env.DATABASE_URL,
//   max: 10,
//   idleTimeoutMillis: 30_000,
//   connectionTimeoutMillis: 5_000,
// });
//
// pool.on('error', (err) => {
//   require('./logger').error({ err }, 'Unexpected PostgreSQL pool error');
// });

// Phase 1 stub — replace with the pool above once pg is installed.
const pool = {
  query: async () => {
    throw new Error('Database pool not initialized. Install pg and configure DATABASE_URL.');
  },
};

module.exports = pool;
