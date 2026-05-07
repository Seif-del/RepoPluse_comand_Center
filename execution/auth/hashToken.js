'use strict';

const { createHash } = require('crypto');

/**
 * Hashes a plaintext session token with SHA-256.
 * Raw tokens are never stored — only the returned digest is persisted.
 *
 * @param {string} rawToken - Plaintext session token (non-empty, non-whitespace)
 * @returns {string} 64-character lowercase SHA-256 hex digest
 * @throws {TypeError}  code INVALID_TOKEN_TYPE — rawToken is not a string
 * @throws {Error}      code EMPTY_TOKEN        — rawToken is empty or whitespace-only
 */
function hashToken(rawToken) {
  if (typeof rawToken !== 'string') {
    const err = new TypeError('rawToken must be a string');
    err.code = 'INVALID_TOKEN_TYPE';
    throw err;
  }
  if (rawToken.trim().length === 0) {
    const err = new Error('rawToken must not be empty');
    err.code = 'EMPTY_TOKEN';
    throw err;
  }
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

module.exports = { hashToken };
