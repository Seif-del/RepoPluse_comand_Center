'use strict';

// Set env vars before any require() so config/paths.js picks them up.
process.env.SMTP_HOST      = 'smtp.example.com';
process.env.SMTP_PORT      = '587';
process.env.SMTP_USER      = 'repopulse@example.com';
process.env.SMTP_PASS      = 'secret';
process.env.ALERT_EMAIL_FROM = 'repopulse@example.com';
process.env.ALERT_EMAIL_TO   = 'oncall@example.com';

const mockSendMail = jest.fn().mockResolvedValue({});
jest.mock('nodemailer', () => ({
  createTransport: () => ({ sendMail: mockSendMail }),
}));

const { sendEmailAlert } = require('../../../../services/notifications/emailNotifier');

const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-13T00:00:00.000Z',
};

beforeEach(() => {
  mockSendMail.mockClear();
});

describe('sendEmailAlert — positive send path', () => {
  it('calls sendMail when SMTP_HOST and ALERT_EMAIL_TO are both configured', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    expect(mockSendMail).toHaveBeenCalledTimes(1);
  });

  it('passes from, to, subject, and text to sendMail', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from:    expect.any(String),
        to:      'oncall@example.com',
        subject: expect.any(String),
        text:    expect.any(String),
      })
    );
  });

  it('includes alertState and trend in the subject', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { subject } = mockSendMail.mock.calls[0][0];
    expect(subject).toContain(CRITICAL_WORSENING.alertState);
    expect(subject).toContain(CRITICAL_WORSENING.trend);
  });

  it('includes alertState and trend values in the email body text', async () => {
    await sendEmailAlert(CRITICAL_WORSENING);
    const { text } = mockSendMail.mock.calls[0][0];
    expect(text).toContain(CRITICAL_WORSENING.alertState);
    expect(text).toContain(CRITICAL_WORSENING.trend);
  });
});
