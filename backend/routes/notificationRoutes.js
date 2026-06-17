'use strict';

const express      = require('express');
const authenticate = require('../middleware/authenticate');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const db = req.app.locals.db;

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

    res.json({
      notifications: listResult.rows,
      unreadCount:   parseInt(countResult.rows[0].unread_count, 10),
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const notifId   = parseInt(req.params.id, 10);
    const db        = req.app.locals.db;

    if (!Number.isInteger(notifId) || notifId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id.' });
    }

    const result = await db.query(
      `UPDATE notifications
       SET status = 'READ', read_at = NOW()
       WHERE id = $1 AND user_id = $2`,
      [notifId, userId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
