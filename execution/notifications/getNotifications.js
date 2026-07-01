'use strict';

/**
 * Returns the 20 most recent notifications for a user, plus their unread count.
 *
 * Both queries run concurrently via Promise.all. The count query always returns
 * exactly one row (SELECT COUNT(*)), so countResult.rows[0] is always defined.
 * The string value from COUNT(*) is converted to an integer before returning.
 *
 * @param {{ db: object, userId: number }} params
 * @param {object} params.db     - node-pg Pool or Client with .query()
 * @param {number} params.userId - authenticated user id
 * @returns {Promise<{ notifications: object[], unreadCount: number }>}
 */
async function getNotifications({ db, userId }) {
  const [listResult, countResult] = await Promise.all([
    db.query(
      `SELECT id, type, priority, title, body, status, dedupe_key,
              created_at, sent_at, read_at, expires_at
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [userId]
    ),
    db.query(
      `SELECT COUNT(*) AS unread_count
       FROM notifications
       WHERE user_id = $1
         AND status NOT IN ('READ', 'EXPIRED')`,
      [userId]
    ),
  ]);

  return {
    notifications: listResult.rows,
    unreadCount:   parseInt(countResult.rows[0].unread_count, 10),
  };
}

module.exports = { getNotifications };
