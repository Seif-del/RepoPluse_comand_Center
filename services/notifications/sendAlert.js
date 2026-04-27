const { shouldAlert } = require('./alertDecision');
const { sendSlackAlert } = require('./slackNotifier');
const { sendEmailAlert } = require('./emailNotifier');
const { ENABLE_PROACTIVE_ALERTS } = require('../../config/paths');

// Process-lifetime dedup: key = "<alertState>:<trend>"
// Prevents repeated notifications for the same ongoing condition.
// Exported so tests can call _sent.clear() in beforeEach.
const _sent = new Set();

/**
 * Evaluates a snapshot and sends Slack + email notifications if warranted.
 * Guards: ENABLE_PROACTIVE_ALERTS must be "true", shouldAlert must return true,
 * and the same alertState:trend pair must not have been sent this process lifetime.
 *
 * Each notifier failure is isolated — a Slack failure does not suppress email.
 *
 * @param {{ alertState: string, trend: string, riskScore: number, atRiskProjects: number, totalProjects: number }} summary
 */
async function sendAlert(summary) {
  if (ENABLE_PROACTIVE_ALERTS !== true) return;
  if (!shouldAlert(summary)) return;

  const key = `${summary.alertState}:${summary.trend}`;
  if (_sent.has(key)) return;
  _sent.add(key);

  await Promise.allSettled([
    sendSlackAlert(summary).catch(err => console.error('[sendAlert] Slack failed:', err.message)),
    sendEmailAlert(summary).catch(err => console.error('[sendAlert] Email failed:', err.message)),
  ]);
}

module.exports = { sendAlert, _sent };
