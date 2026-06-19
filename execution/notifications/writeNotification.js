'use strict';

/**
 * Writes one in-app notification row to the notifications table for a given user.
 *
 * Called by services/notifications/sendAlert when shouldAlert() returns true.
 * The caller (sendAlert) fans out across all active users; this function handles
 * exactly one user_id per call.
 *
 * Deduplication is enforced at two layers:
 *   1. Process-lifetime: the _sent Set in sendAlert.js prevents re-firing within
 *      a single process run.
 *   2. Persistent: ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL
 *      DO NOTHING infers the partial unique index and silently no-ops a duplicate
 *      insert across process restarts. The partial-index inference form is used
 *      (not a named constraint target) because PostgreSQL only allows
 *      ON CONFLICT ON CONSTRAINT with unique constraints, not partial unique indexes.
 *
 * Returns the inserted row object, or null when a duplicate dedupe_key already
 * exists for this user (ON CONFLICT fired — the alert was already recorded).
 *
 * Priority mapping (applied before any shouldAlert guard in the caller):
 *   alertState === 'Critical'  →  'CRITICAL'
 *   trend === 'Worsening'      →  'HIGH'      (when alertState is not Critical)
 *   otherwise                  →  'MEDIUM'
 *
 * @param {{ db: object, userId: number, summary: object }} params
 * @param {object} params.db      - node-pg Pool or Client with .query()
 * @param {number} params.userId  - integer FK to users.id
 * @param {object} params.summary - alert snapshot from appendSummarySnapshot()
 * @returns {Promise<object|null>}
 */
async function writeNotification({ db, userId, summary }) {
  if (!db)      throw new Error('[writeNotification] db is required');
  if (!userId)  throw new Error('[writeNotification] userId is required');
  if (!summary) throw new Error('[writeNotification] summary is required');

  const { alertState, trend, riskScore, atRiskProjects, totalProjects } = summary;

  const priority   = _derivePriority(alertState, trend);
  const dedupe_key = `${alertState}:${trend}`;
  const title      = `[RepoPulse] ${alertState} Alert — ${trend} trend`;
  const body       = [
    'RepoPulse has detected an alert condition.',
    '',
    `Alert State : ${alertState}`,
    `Trend       : ${trend}`,
    `Risk Score  : ${riskScore}%`,
    `At Risk     : ${atRiskProjects} / ${totalProjects} repos`,
  ].join('\n');

  const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const result = await db.query(
    `INSERT INTO notifications
       (user_id, type, priority, title, body, status, dedupe_key, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'CREATED', $6, $7)
     ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id, user_id, type, priority, title, status, dedupe_key, created_at, expires_at`,
    [userId, 'portfolio_alert', priority, title, body, dedupe_key, expiresAt]
  );

  return result.rows[0] || null;
}

function _derivePriority(alertState, trend) {
  if (alertState === 'Critical') return 'CRITICAL';
  if (trend === 'Worsening')     return 'HIGH';
  return 'MEDIUM';
}

module.exports = { writeNotification };
