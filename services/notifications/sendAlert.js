'use strict';

const { shouldAlert } = require('./alertDecision');
const { sendSlackAlert } = require('./slackNotifier');
const { sendEmailAlert } = require('./emailNotifier');
const { writeNotification } = require('../../execution/notifications/writeNotification');
const { ENABLE_PROACTIVE_ALERTS } = require('../../config/paths');

// Process-lifetime dedup: key = "<alertState>:<trend>"
// Prevents repeated notifications for the same ongoing condition.
// Exported so tests can call _sent.clear() in beforeEach.
const _sent = new Set();

/**
 * Evaluates a snapshot and dispatches Slack + email + in-app notifications if warranted.
 * Guards: ENABLE_PROACTIVE_ALERTS must be "true", shouldAlert must return true,
 * and the same alertState:trend pair must not have been sent this process lifetime.
 *
 * Each channel failure is isolated — a Slack failure does not suppress email or in-app
 * writes, and an in-app write failure does not suppress either delivery channel.
 *
 * When db is provided, one notification row is written per active user via writeNotification.
 * When db is absent, in-app persistence is silently skipped.
 *
 * @param {{ alertState: string, trend: string, riskScore: number, atRiskProjects: number, totalProjects: number }} summary
 * @param {{ db?: object }} [options]
 */
async function sendAlert(summary, { db } = {}) {
  if (ENABLE_PROACTIVE_ALERTS !== true) {
    console.log('[sendAlert] Proactive alerts disabled (ENABLE_PROACTIVE_ALERTS != "true"). Skipping.');
    return;
  }
  if (!shouldAlert(summary)) {
    console.log(`[sendAlert] shouldAlert=false — alertState: ${summary.alertState}, trend: ${summary.trend}. No alert sent.`);
    return;
  }

  const key = `${summary.alertState}:${summary.trend}`;
  if (_sent.has(key)) {
    console.log(`[sendAlert] Duplicate suppressed — already alerted for "${key}" this session.`);
    return;
  }
  _sent.add(key);

  console.log(`[sendAlert] Firing alert — ${key}, riskScore: ${summary.riskScore}%, atRisk: ${summary.atRiskProjects}/${summary.totalProjects}`);

  const inAppWrites = db
    ? _writeInAppNotifications(db, summary).catch(err => console.error('[sendAlert] In-app notifications failed:', err.message))
    : Promise.resolve();

  await Promise.allSettled([
    sendSlackAlert(summary).catch(err => console.error('[sendAlert] Slack failed:', err.message)),
    sendEmailAlert(summary).catch(err => console.error('[sendAlert] Email failed:', err.message)),
    inAppWrites,
  ]);
}

async function _writeInAppNotifications(db, summary) {
  const result = await db.query('SELECT id FROM users WHERE deleted_at IS NULL');
  await Promise.all(
    result.rows.map(({ id }) => writeNotification({ db, userId: id, summary }))
  );
}

module.exports = { sendAlert, _sent };
