'use strict';

// Integration tests: SMTP delivery via Mailhog sandbox (FR-008).
//
// Opt-in only — self-skip when TEST_INTEGRATION is not set.
// Run (single file, no coverage):
//   $env:TEST_INTEGRATION = "true"; npx jest tests/integration/notifications.smtp.integration.test.js --no-coverage
//
// Requires Mailhog running on localhost:1025 (SMTP) and localhost:8025 (REST API).
// Start with: .\mailhog.exe  (no Docker needed — standalone binary)
//
// No real email is sent. No Slack calls are made.
// SMTP_USER and SMTP_PASS are intentionally absent — Mailhog accepts
// unauthenticated connections; emailNotifier sets auth: undefined when both are empty.

// ─── Sandbox env vars ─────────────────────────────────────────────────────────
// MUST be set before any require() that loads config/paths.js.
// config/paths.js evaluates process.env.* as module-level constants on first load.
// sendAlert.js requires config/paths.js at its own top level, so all vars must
// be present before the require() calls below execute.
if (process.env.TEST_INTEGRATION === 'true') {
  process.env.ENABLE_PROACTIVE_ALERTS = 'true';
  process.env.SMTP_HOST               = process.env.SMTP_HOST        || 'localhost';
  process.env.SMTP_PORT               = process.env.SMTP_PORT        || '1025';
  process.env.ALERT_EMAIL_FROM        = process.env.ALERT_EMAIL_FROM || 'repopulse@test.local';
  process.env.ALERT_EMAIL_TO          = process.env.ALERT_EMAIL_TO   || 'oncall@test.local';
}

const { sendEmailAlert }   = require('../../services/notifications/emailNotifier');
const { sendAlert, _sent } = require('../../services/notifications/sendAlert');

// ─── Opt-in guard ─────────────────────────────────────────────────────────────
const RUN          = process.env.TEST_INTEGRATION === 'true';
const describeSmtp = RUN ? describe : describe.skip;

// ─── Mailhog REST helpers ─────────────────────────────────────────────────────
const MAILHOG = 'http://localhost:8025';

async function clearInbox() {
  await fetch(`${MAILHOG}/api/v1/messages`, { method: 'DELETE' });
}

async function getInbox() {
  const res = await fetch(`${MAILHOG}/api/v2/messages`);
  return res.json(); // { total, count, start, items: [...] }
}

// Decodes RFC 2047 encoded-word headers (Q encoding, UTF-8 charset).
// Nodemailer encodes subjects that contain non-ASCII characters (e.g. the em dash —).
// Mailhog stores the raw MIME header value, so assertions must decode before comparing.
// Algorithm: collapse whitespace between adjacent encoded words, then decode each word.
function rfc2047Decode(header) {
  const collapsed = header.replace(/\?=\s+=\?/g, '?==?');
  return collapsed.replace(
    /=\?UTF-8\?Q\?([^?]+)\?=/gi,
    (_, encoded) => {
      const bytes = encoded
        .replace(/_/g, '\x20')
        .replace(/=([0-9A-F]{2})/gi, (__, h) => String.fromCharCode(parseInt(h, 16)));
      return Buffer.from(bytes, 'latin1').toString('utf8');
    }
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────
const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-15T00:00:00.000Z',
};

const NORMAL_STABLE = {
  alertState:     'Normal',
  trend:          'Stable',
  riskScore:      15,
  atRiskProjects: 1,
  totalProjects:  10,
  lastUpdated:    '2026-06-15T00:00:00.000Z',
};

// ─── sendEmailAlert — direct SMTP delivery ────────────────────────────────────

describeSmtp('Integration: sendEmailAlert — direct SMTP delivery via Mailhog', () => {
  beforeEach(async () => {
    _sent.clear();
    await clearInbox();
  });

  it('captures exactly one message in Mailhog', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { total } = await getInbox();
    expect(total).toBe(1);
  });

  it('delivers to the correct recipient and sender', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { items } = await getInbox();
    const msg  = items[0];
    const to   = `${msg.To[0].Mailbox}@${msg.To[0].Domain}`;
    const from = `${msg.From.Mailbox}@${msg.From.Domain}`;
    expect(to).toBe('oncall@test.local');
    expect(from).toBe('repopulse@test.local');
  });

  it('subject contains [RepoPulse], alertState, and trend', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { items } = await getInbox();
    // Decode RFC 2047 before asserting — nodemailer encodes subjects containing
    // non-ASCII characters (the em dash in the subject template) as quoted-printable.
    const subject = rfc2047Decode(items[0].Content.Headers['Subject'][0]);
    expect(subject).toContain('[RepoPulse]');
    expect(subject).toContain('Critical');
    expect(subject).toContain('Worsening');
  });

  it('body contains alertState, trend, risk score, and at-risk count', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { items } = await getInbox();
    const body      = items[0].Content.Body;
    expect(body).toContain('Critical');
    expect(body).toContain('Worsening');
    expect(body).toContain('80%');
    expect(body).toContain('8 / 10');
  });
});

// ─── sendAlert — orchestration layer ─────────────────────────────────────────

describeSmtp('Integration: sendAlert — orchestration and dedup via Mailhog', () => {
  beforeEach(async () => {
    _sent.clear();
    await clearInbox();
  });

  it('delivers one email for a Critical/Worsening snapshot', async () => {
    await sendAlert(CRITICAL_WORSENING);
    const { total } = await getInbox();
    expect(total).toBe(1);
  });

  it('deduplicates: second identical alert does not send another email', async () => {
    await sendAlert(CRITICAL_WORSENING);
    await sendAlert(CRITICAL_WORSENING);
    const { total } = await getInbox();
    expect(total).toBe(1);
  });

  it('sends no email for a Normal/Stable snapshot', async () => {
    await sendAlert(NORMAL_STABLE);
    const { total } = await getInbox();
    expect(total).toBe(0);
  });
});
