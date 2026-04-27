const { Module } = require('module');
const path = require('path');

function requireNodemailer() {
  try {
    return require('nodemailer');
  } catch (_) {
    // Fall back to resolving from backend/node_modules at runtime
    const backendPkg = path.join(__dirname, '../../backend/package.json');
    const req = Module.createRequire(backendPkg);
    return req('nodemailer');
  }
}

/**
 * Sends an email notification for a RepoPulse alert snapshot.
 * Silently skips when SMTP_HOST or ALERT_EMAIL_TO is not configured.
 *
 * @param {{ alertState: string, trend: string, riskScore: number, atRiskProjects: number, totalProjects: number }} summary
 */
async function sendEmailAlert(summary) {
  const { ALERT_EMAIL_TO, ALERT_EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = require('../../config/paths');
  if (!SMTP_HOST || !ALERT_EMAIL_TO) return;

  const nodemailer = requireNodemailer();

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: SMTP_USER && SMTP_PASS ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
  });

  const subject = `[RepoPulse] ${summary.alertState} — ${summary.trend}`;
  const text = [
    `RepoPulse has detected an alert condition.`,
    ``,
    `Alert State : ${summary.alertState}`,
    `Trend       : ${summary.trend}`,
    `Risk Score  : ${summary.riskScore}%`,
    `At Risk     : ${summary.atRiskProjects} / ${summary.totalProjects} repos`,
    `Recorded at : ${summary.lastUpdated}`,
  ].join('\n');

  await transporter.sendMail({
    from: ALERT_EMAIL_FROM || SMTP_USER,
    to: ALERT_EMAIL_TO,
    subject,
    text,
  });
}

module.exports = { sendEmailAlert };
