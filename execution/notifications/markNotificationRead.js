'use strict';

/**
 * Marks one notification as READ, scoped to a specific user.
 *
 * Ownership is enforced in the WHERE clause (id = $1 AND user_id = $2) so a
 * user cannot mark another user's notification as read. Returns rowCount so
 * the caller can distinguish "found and updated" (1) from "not found or not
 * owned" (0) without an additional SELECT.
 *
 * @param {{ db: object, userId: number, notifId: number }} params
 * @param {object} params.db      - node-pg Pool or Client with .query()
 * @param {number} params.userId  - authenticated user id
 * @param {number} params.notifId - notification id to mark as read
 * @returns {Promise<number>} rowCount — 0 means not found or not owned by user
 */
async function markNotificationRead({ db, userId, notifId }) {
  const result = await db.query(
    `UPDATE notifications
     SET status = 'READ', read_at = NOW()
     WHERE id = $1 AND user_id = $2`,
    [notifId, userId]
  );
  return result.rowCount;
}

module.exports = { markNotificationRead };
