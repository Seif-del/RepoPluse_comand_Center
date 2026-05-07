'use strict';

const { Pool } = require('pg');

const SAFE_PATTERNS = ['test', 'local', 'localhost'];

/**
 * Checks that integration tests are opted in and pointed at a safe database.
 *
 * Returns the database URL string when:
 *   - process.env.TEST_INTEGRATION === 'true'
 *   - The resolved URL contains 'test', 'local', or 'localhost'
 *
 * Returns false when TEST_INTEGRATION is not 'true' — callers wrap all tests
 * in describe.skip so they are reported as skipped, not failing.
 *
 * Throws a clear error when TEST_INTEGRATION=true but the URL does not match
 * any safe pattern, to prevent accidental writes to a production database.
 *
 * Resolution order: TEST_DATABASE_URL → DATABASE_URL → '' (empty = unsafe).
 *
 * @returns {string|false}
 */
function requireIntegrationEnv() {
  if (process.env.TEST_INTEGRATION !== 'true') {
    return false;
  }

  const url    = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const isSafe = SAFE_PATTERNS.some((p) => url.toLowerCase().includes(p));

  if (!isSafe) {
    throw new Error(
      'INTEGRATION SAFETY BLOCK: The resolved database URL does not contain ' +
      '"test", "local", or "localhost".\n' +
      `  URL: "${url}"\n` +
      '  Set TEST_DATABASE_URL to a safe test database URL (e.g. postgres://...@localhost/repopulse_test)\n' +
      '  before running integration tests.',
    );
  }

  return url;
}

/**
 * Creates a pg.Pool from the given connectionString.
 * Pool size is kept small (max 3) to avoid exhausting test DB connection limits.
 *
 * @param {string} connectionString
 * @returns {import('pg').Pool}
 */
function createTestPool(connectionString) {
  return new Pool({
    connectionString,
    max:                     3,
    idleTimeoutMillis:       10_000,
    connectionTimeoutMillis: 5_000,
  });
}

/**
 * Truncates only the Phase 1 auth tables and resets their serial sequences.
 * Listing both tables in one TRUNCATE statement lets PostgreSQL resolve the
 * sessions→users FK without requiring a specific ordering.
 * CASCADE is a safeguard in case future migrations add FK references to these
 * tables — it prevents the TRUNCATE from failing without silently deleting
 * unintended data (there are none in Phase 1).
 *
 * Only call after requireIntegrationEnv() has confirmed the URL is safe.
 *
 * @param {import('pg').Pool} pool
 */
async function resetAuthTables(pool) {
  await pool.query('TRUNCATE sessions, users RESTART IDENTITY CASCADE');
}

/**
 * Truncates the audit_logs table and resets its serial sequence.
 * audit_logs has no FK references to other tables and no FKs from other tables,
 * so it can be truncated independently without CASCADE.
 *
 * Only call after requireIntegrationEnv() has confirmed the URL is safe.
 *
 * @param {import('pg').Pool} pool
 */
async function resetAuditTables(pool) {
  await pool.query('TRUNCATE audit_logs RESTART IDENTITY');
}

/**
 * Ends all connections in the pool and releases resources.
 *
 * @param {import('pg').Pool} pool
 */
async function closeTestPool(pool) {
  await pool.end();
}

module.exports = {
  requireIntegrationEnv,
  createTestPool,
  resetAuthTables,
  resetAuditTables,
  closeTestPool,
};
