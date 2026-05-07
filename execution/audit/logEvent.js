'use strict';

const logger = require('../logger');

/**
 * Appends one immutable row to audit_logs.
 * This is the only function in the codebase that writes to audit_logs.
 * No UPDATE or DELETE operations are exposed anywhere in this module.
 *
 * @param {object} params
 * @param {object} params.db           - pg pool instance (must expose .query)
 * @param {string} params.actorId      - ID of the acting user ('0' for system events)
 * @param {string} params.action       - Past-tense event string (e.g. 'user.login')
 * @param {string} params.resourceType - Entity category (e.g. 'user', 'session')
 * @param {string} params.resourceId   - Identifier of the affected entity
 * @param {object} [params.metadata]   - Optional key-value context; defaults to {}
 * @param {Date}   params.now          - Timestamp to store as created_at
 * @returns {Promise<object>} The inserted audit_logs row (RETURNING *)
 * @throws {Error} code INVALID_DB            — db is missing or has no .query method
 * @throws {Error} code INVALID_ACTOR_ID      — actorId is not a non-empty string
 * @throws {Error} code INVALID_ACTION        — action is not a non-empty string
 * @throws {Error} code INVALID_RESOURCE_TYPE — resourceType is not a non-empty string
 * @throws {Error} code INVALID_RESOURCE_ID   — resourceId is not a non-empty string
 * @throws {Error} code INVALID_METADATA      — metadata is not a plain object
 * @throws {Error} code INVALID_NOW           — now is not a valid Date object
 */
async function logEvent({
  db,
  actorId,
  action,
  resourceType,
  resourceId,
  metadata = {},
  now,
} = {}) {
  if (db == null || typeof db.query !== 'function') {
    const err = new Error('db must be a valid database pool');
    err.code = 'INVALID_DB';
    throw err;
  }

  if (typeof actorId !== 'string' || actorId.trim().length === 0) {
    const err = new Error('actorId must be a non-empty string');
    err.code = 'INVALID_ACTOR_ID';
    throw err;
  }

  if (typeof action !== 'string' || action.trim().length === 0) {
    const err = new Error('action must be a non-empty string');
    err.code = 'INVALID_ACTION';
    throw err;
  }

  if (typeof resourceType !== 'string' || resourceType.trim().length === 0) {
    const err = new Error('resourceType must be a non-empty string');
    err.code = 'INVALID_RESOURCE_TYPE';
    throw err;
  }

  if (typeof resourceId !== 'string' || resourceId.trim().length === 0) {
    const err = new Error('resourceId must be a non-empty string');
    err.code = 'INVALID_RESOURCE_ID';
    throw err;
  }

  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    const err = new Error('metadata must be a plain object');
    err.code = 'INVALID_METADATA';
    throw err;
  }

  if (!(now instanceof Date) || isNaN(now.getTime())) {
    const err = new Error('now must be a valid Date object');
    err.code = 'INVALID_NOW';
    throw err;
  }

  try {
    const result = await db.query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [actorId, action, resourceType, resourceId, metadata, now]
    );
    return result.rows[0];
  } catch (err) {
    if (typeof logger.error === 'function') {
      logger.error(
        { action, resourceType, resourceId, errorCode: err.code, errorMessage: err.message },
        'audit log write failed'
      );
    }
    return null;
  }
}

module.exports = { logEvent };
