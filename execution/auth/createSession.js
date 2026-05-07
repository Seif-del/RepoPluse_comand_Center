'use strict';

const { hashToken } = require('./hashToken');

/**
 * Inserts a new session row for the given user.
 * Stores only the SHA-256 hash of rawToken — the plaintext is never persisted.
 *
 * @param {object} params
 * @param {object} params.db                 - pg pool instance (must expose .query)
 * @param {string} params.userId             - User ID (non-empty string)
 * @param {string} params.rawToken           - Plaintext token (hashed before storage)
 * @param {Date}   params.now                - Timestamp for created_at / last_active_at
 * @param {number} params.sessionExpiryHours - Session lifetime in hours (positive finite)
 * @returns {Promise<object>} The inserted sessions row returned by RETURNING *
 * @throws {Error} code INVALID_DB                  — db is missing or has no .query method
 * @throws {Error} code INVALID_USER_ID             — userId is not a non-empty string
 * @throws {Error} code INVALID_RAW_TOKEN           — rawToken is not a non-empty string
 * @throws {Error} code INVALID_NOW                 — now is not a valid Date
 * @throws {Error} code INVALID_SESSION_EXPIRY_HOURS — sessionExpiryHours is not a positive number
 */
async function createSession({ db, userId, rawToken, now, sessionExpiryHours } = {}) {
  if (db == null || typeof db.query !== 'function') {
    const err = new Error('db must be a valid database pool');
    err.code = 'INVALID_DB';
    throw err;
  }

  if (typeof userId !== 'string' || userId.trim().length === 0) {
    const err = new Error('userId must be a non-empty string');
    err.code = 'INVALID_USER_ID';
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

  if (typeof sessionExpiryHours !== 'number' || !(sessionExpiryHours > 0)) {
    const err = new Error('sessionExpiryHours must be a positive number');
    err.code = 'INVALID_SESSION_EXPIRY_HOURS';
    throw err;
  }

  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + sessionExpiryHours * 60 * 60 * 1000);

  const result = await db.query(
    `INSERT INTO sessions (user_id, token_hash, created_at, last_active_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [userId, tokenHash, now, now, expiresAt]
  );

  return result.rows[0];
}

module.exports = { createSession };
