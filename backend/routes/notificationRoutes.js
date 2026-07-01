'use strict';

const express      = require('express');
const authenticate = require('../middleware/authenticate');
const { getNotifications }     = require('../../execution/notifications/getNotifications');
const { markNotificationRead } = require('../../execution/notifications/markNotificationRead');

const router = express.Router();

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    res.json(await getNotifications({ db: req.app.locals.db, userId: req.user.userId }));
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const { userId } = req.user;
    const notifId   = parseInt(req.params.id, 10);

    if (!Number.isInteger(notifId) || notifId <= 0) {
      return res.status(400).json({ error: 'Invalid notification id.' });
    }

    const rowCount = await markNotificationRead({ db: req.app.locals.db, userId, notifId });

    if (rowCount === 0) {
      return res.status(404).json({ error: 'Notification not found.' });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
