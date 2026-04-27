// Set env vars BEFORE any require() so config/paths.js picks them up.
process.env.ENABLE_PROACTIVE_ALERTS = 'true';
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.ALERT_EMAIL_TO = 'oncall@example.com';
process.env.ALERT_EMAIL_FROM = 'repopulse@example.com';
process.env.SMTP_USER = 'repopulse@example.com';
process.env.SMTP_PASS = 'secret';

const mockSendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

const { sendAlert, _sent } = require('../services/notifications/sendAlert');
const { sendSlackAlert } = require('../services/notifications/slackNotifier');
const { sendEmailAlert } = require('../services/notifications/emailNotifier');

const CRITICAL_WORSENING = {
  alertState: 'Critical',
  trend: 'Worsening',
  riskScore: 80,
  atRiskProjects: 8,
  totalProjects: 10,
  lastUpdated: new Date().toISOString(),
};

const NORMAL_STABLE = {
  alertState: 'Normal',
  trend: 'Stable',
  riskScore: 10,
  atRiskProjects: 1,
  totalProjects: 10,
  lastUpdated: new Date().toISOString(),
};

beforeEach(() => {
  _sent.clear();
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete global.fetch;
});

describe('sendSlackAlert', () => {
  it('calls fetch with the configured webhook URL', async () => {
    await sendSlackAlert(CRITICAL_WORSENING);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://hooks.slack.com/test',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('skips fetch when SLACK_WEBHOOK_URL is empty', async () => {
    const paths = require('../config/paths');
    const original = paths.SLACK_WEBHOOK_URL;
    Object.defineProperty(paths, 'SLACK_WEBHOOK_URL', { value: '', configurable: true });

    await sendSlackAlert(CRITICAL_WORSENING);
    expect(global.fetch).not.toHaveBeenCalled();

    Object.defineProperty(paths, 'SLACK_WEBHOOK_URL', { value: original, configurable: true });
  });

  it('throws when webhook returns a non-ok status', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 400 });
    await expect(sendSlackAlert(CRITICAL_WORSENING)).rejects.toThrow('400');
  });
});

describe('sendEmailAlert', () => {
  beforeEach(() => {
    mockSendMail.mockClear();
  });

  it('skips when SMTP_HOST is not configured', async () => {
    const paths = require('../config/paths');
    const original = paths.SMTP_HOST;
    Object.defineProperty(paths, 'SMTP_HOST', { value: '', configurable: true });

    await sendEmailAlert(CRITICAL_WORSENING);
    expect(mockSendMail).not.toHaveBeenCalled();

    Object.defineProperty(paths, 'SMTP_HOST', { value: original, configurable: true });
  });

  it('skips when ALERT_EMAIL_TO is not configured', async () => {
    const paths = require('../config/paths');
    const original = paths.ALERT_EMAIL_TO;
    Object.defineProperty(paths, 'ALERT_EMAIL_TO', { value: '', configurable: true });

    await sendEmailAlert(CRITICAL_WORSENING);
    expect(mockSendMail).not.toHaveBeenCalled();

    Object.defineProperty(paths, 'ALERT_EMAIL_TO', { value: original, configurable: true });
  });
});

describe('sendAlert — orchestration and dedup', () => {
  it('does not call fetch for a Normal/Stable snapshot', async () => {
    await sendAlert(NORMAL_STABLE);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls fetch for a Critical/Worsening snapshot', async () => {
    await sendAlert(CRITICAL_WORSENING);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('does not call fetch a second time for the same alertState:trend pair', async () => {
    await sendAlert(CRITICAL_WORSENING);
    await sendAlert(CRITICAL_WORSENING);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends again after _sent is cleared (simulates state reset)', async () => {
    await sendAlert(CRITICAL_WORSENING);
    _sent.clear();
    await sendAlert(CRITICAL_WORSENING);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('continues with email even when Slack fetch throws', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network error'));
    // Should not throw — failures are isolated
    await expect(sendAlert(CRITICAL_WORSENING)).resolves.not.toThrow();
  });
});
