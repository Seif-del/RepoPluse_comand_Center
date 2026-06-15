'use strict';

// Set env var before any require() so config/paths.js picks it up.
process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

const { sendSlackAlert } = require('../../../../services/notifications/slackNotifier');

const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-13T00:00:00.000Z',
};

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterEach(() => {
  delete global.fetch;
});

describe('sendSlackAlert — request body', () => {
  it('sends a JSON body with a top-level text field', async () => {
    await sendSlackAlert(CRITICAL_WORSENING);
    const [, options] = global.fetch.mock.calls[0];
    expect(() => JSON.parse(options.body)).not.toThrow();
    const payload = JSON.parse(options.body);
    expect(payload).toHaveProperty('text');
    expect(typeof payload.text).toBe('string');
  });

  it('includes alertState and trend values in the Slack message text', async () => {
    await sendSlackAlert(CRITICAL_WORSENING);
    const [, options] = global.fetch.mock.calls[0];
    const { text } = JSON.parse(options.body);
    expect(text).toContain(CRITICAL_WORSENING.alertState);
    expect(text).toContain(CRITICAL_WORSENING.trend);
  });
});
