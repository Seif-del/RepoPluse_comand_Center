/**
 * Sends a Slack notification for a RepoPulse alert snapshot.
 * Silently skips when SLACK_WEBHOOK_URL is not configured.
 *
 * @param {{ alertState: string, trend: string, riskScore: number, atRiskProjects: number, totalProjects: number }} summary
 */
async function sendSlackAlert(summary) {
  const { SLACK_WEBHOOK_URL } = require('../../config/paths');
  if (!SLACK_WEBHOOK_URL) {
    console.log('[sendSlackAlert] SLACK_WEBHOOK_URL not configured — Slack notification skipped.');
    return;
  }

  const text = [
    `*RepoPulse Alert*`,
    `• Alert State: *${summary.alertState}*`,
    `• Trend: *${summary.trend}*`,
    `• Risk Score: ${summary.riskScore}%`,
    `• At Risk: ${summary.atRiskProjects} / ${summary.totalProjects} repos`,
  ].join('\n');

  const res = await fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}`);
  }
  console.log('[sendSlackAlert] Slack notification sent successfully.');
}

module.exports = { sendSlackAlert };
