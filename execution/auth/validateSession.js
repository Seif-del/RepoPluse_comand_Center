'use strict';

const { hashToken } = require('./hashToken');

/**
 * Validates a raw session token from an incoming request.
 * Hashes the token, looks it up in sessions, checks expiry and user state,
 * refreshes both last_active_at and expires_at (rolling inactivity window),
 * and returns the normalized session context with the new expiry time.
 * All rejection reasons use the same error message — no information is leaked.
 *
 * @param {object} params
 * @param {object} params.db                  - pg pool instance (must expose .query)
 * @param {string} params.rawToken            - Plaintext token from the client (never stored)
 * @param {Date}   params.now                 - Current timestamp used for expiry comparison
 * @param {number} params.sessionExpiryHours  - Positive number of hours to extend the session
 * @returns {Promise<{ sessionId, userId, role, githubUsername, expiresAt }>}
 *          expiresAt is the refreshed expiry (now + sessionExpiryHours), not the stored value.
 * @throws {Error} code INVALID_DB                   — db is missing or has no .query method
 * @throws {Error} code INVALID_RAW_TOKEN            — rawToken is not a non-empty string
 * @throws {Error} code INVALID_NOW                  — now is not a valid Date object
 * @throws {Error} code INVALID_SESSION_EXPIRY_HOURS — sessionExpiryHours is not a positive number
 * @throws {Error} code UNAUTHORIZED                 — token not found, expired, or user deleted
 */
async function validateSession({ db, rawToken, now, sessionExpiryHours } = {}) {
  if (db == null || typeof db.query !== 'function') {
    const err = new Error('db must be a valid database pool');
    err.code = 'INVALID_DB';
    throw err;
  }

  if (typeof rawToken !== 'string' || rawToken.trim().length === 0) {
    const err = new Error('rawToken must be a non-empty string');
    err.code = 'INVALID_RAW_TOKEN';
    throw err;
  }

  if (!(now instanceof Date) || isNaN(now.getTime())) {
    const err = new Error('now must be a valid Date object');
    err.code = 'INVALID_NOW';
    throw err;
  }

  if (!(sessionExpiryHours > 0)) {
    const err = new Error('sessionExpiryHours must be a positive number');
    err.code = 'INVALID_SESSION_EXPIRY_HOURS';
    throw err;
  }

  function unauthorized() {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    return err;
  }

  const tokenHash = hashToken(rawToken);

  const selectResult = await db.query(
    `SELECT s.id, s.expires_at,
            u.id AS user_id, u.role, u.github_username, u.deleted_at
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1`,
    [tokenHash]
  );

  const row = selectResult.rows[0];

  if (!row)                   throw unauthorized();
  if (row.expires_at <= now)  throw unauthorized();
  if (row.deleted_at != null) throw unauthorized();

  const refreshedExpiresAt = new Date(
    now.getTime() + sessionExpiryHours * 60 * 60 * 1000
  );

  await db.query(
    'UPDATE sessions SET last_active_at = $1, expires_at = $2 WHERE id = $3',
    [now, refreshedExpiresAt, row.id]
  );

  return {
    sessionId:      row.id,
    userId:         row.user_id,
    role:           row.role,
    githubUsername: row.github_username,
    expiresAt:      refreshedExpiresAt,
  };
}

module.exports = { validateSession };
