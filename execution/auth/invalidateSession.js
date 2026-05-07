'use strict';

async function invalidateSession({ db, sessionId } = {}) {
  if (db == null || typeof db.query !== 'function') {
    const err = new Error('db must be a valid database pool');
    err.code = 'INVALID_DB';
    throw err;
  }

  if (typeof sessionId !== 'string' || sessionId.trim().length === 0) {
    const err = new Error('sessionId must be a non-empty string');
    err.code = 'INVALID_SESSION_ID';
    throw err;
  }

  const result = await db.query(
    'DELETE FROM sessions WHERE id = $1',
    [sessionId],
  );

  return { invalidated: result.rowCount === 1 };
}

module.exports = { invalidateSession };
