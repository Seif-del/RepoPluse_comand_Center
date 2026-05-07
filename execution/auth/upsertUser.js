'use strict';

/**
 * Inserts a new user or updates an existing one matched by github_id.
 *
 * On insert:  writes all fields including role = defaultRole.
 * On conflict: updates github_username, email, access_token_enc, updated_at, and clears deleted_at.
 *              Role is intentionally NOT overwritten — the stored role is preserved.
 *
 * @param {object}        params
 * @param {object}        params.db              - pg pool instance (must expose .query)
 * @param {string|number} params.githubId        - GitHub numeric user ID
 * @param {string}        params.githubUsername  - GitHub login handle
 * @param {string|null}   params.email           - Primary email from GitHub; null if hidden
 * @param {string}        params.defaultRole     - Role assigned on first insert
 * @param {string|null}   params.accessTokenEnc  - AES-256-GCM encrypted access token (iv:tag:data hex)
 * @param {Date}          params.now             - Current timestamp
 * @returns {Promise<{ userId, githubId, githubUsername, email, role, createdAt, deletedAt }>}
 * @throws {Error} code INVALID_DB              — db missing or has no .query method
 * @throws {Error} code INVALID_GITHUB_ID       — githubId not a non-empty string or finite number
 * @throws {Error} code INVALID_GITHUB_USERNAME — githubUsername not a non-empty string
 * @throws {Error} code INVALID_EMAIL           — email not null and not a non-empty string
 * @throws {Error} code INVALID_DEFAULT_ROLE    — defaultRole not a non-empty string
 * @throws {Error} code INVALID_NOW             — now not a valid Date object
 */
async function upsertUser({ db, githubId, githubUsername, email, defaultRole, accessTokenEnc = null, now } = {}) {
  if (db == null || typeof db.query !== 'function') {
    const err = new Error('db must be a valid database pool');
    err.code = 'INVALID_DB';
    throw err;
  }

  const isValidGithubId =
    (typeof githubId === 'string'  && githubId.trim().length > 0) ||
    (typeof githubId === 'number'  && Number.isFinite(githubId));
  if (!isValidGithubId) {
    const err = new Error('githubId must be a non-empty string or finite number');
    err.code = 'INVALID_GITHUB_ID';
    throw err;
  }

  if (typeof githubUsername !== 'string' || githubUsername.trim().length === 0) {
    const err = new Error('githubUsername must be a non-empty string');
    err.code = 'INVALID_GITHUB_USERNAME';
    throw err;
  }

  if (email !== null && (typeof email !== 'string' || email.trim().length === 0)) {
    const err = new Error('email must be null or a non-empty string');
    err.code = 'INVALID_EMAIL';
    throw err;
  }

  if (typeof defaultRole !== 'string' || defaultRole.trim().length === 0) {
    const err = new Error('defaultRole must be a non-empty string');
    err.code = 'INVALID_DEFAULT_ROLE';
    throw err;
  }

  if (!(now instanceof Date) || isNaN(now.getTime())) {
    const err = new Error('now must be a valid Date object');
    err.code = 'INVALID_NOW';
    throw err;
  }

  const result = await db.query(
    `INSERT INTO users
       (github_id, github_username, email, role, access_token_enc, created_at, updated_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $6, NULL)
     ON CONFLICT (github_id) DO UPDATE SET
       github_username  = EXCLUDED.github_username,
       email            = EXCLUDED.email,
       access_token_enc = EXCLUDED.access_token_enc,
       updated_at       = EXCLUDED.updated_at,
       deleted_at       = NULL
     RETURNING *`,
    [githubId, githubUsername, email, defaultRole, accessTokenEnc, now]
  );

  const row = result.rows[0];

  return {
    userId:         row.id,
    githubId:       row.github_id,
    githubUsername: row.github_username,
    email:          row.email,
    role:           row.role,
    createdAt:      row.created_at,
    deletedAt:      row.deleted_at,
  };
}

module.exports = { upsertUser };
