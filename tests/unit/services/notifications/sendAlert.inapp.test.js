'use strict';

jest.mock('../../../../config/paths', () => ({ ENABLE_PROACTIVE_ALERTS: true }));
jest.mock('../../../../services/notifications/alertDecision', () => ({ shouldAlert: jest.fn().mockReturnValue(true) }));
jest.mock('../../../../services/notifications/slackNotifier',  () => ({ sendSlackAlert: jest.fn().mockResolvedValue() }));
jest.mock('../../../../services/notifications/emailNotifier',  () => ({ sendEmailAlert: jest.fn().mockResolvedValue() }));
jest.mock('../../../../execution/notifications/writeNotification', () => ({ writeNotification: jest.fn() }));

const { sendAlert, _sent } = require('../../../../services/notifications/sendAlert');
const { writeNotification }  = require('../../../../execution/notifications/writeNotification');
const { sendSlackAlert }     = require('../../../../services/notifications/slackNotifier');
const { sendEmailAlert }     = require('../../../../services/notifications/emailNotifier');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
};

function makeDb(userIds = [1, 2]) {
  return {
    query: jest.fn().mockResolvedValue({ rows: userIds.map(id => ({ id })), rowCount: userIds.length }),
  };
}

beforeEach(() => {
  _sent.clear();
  jest.clearAllMocks();
  writeNotification.mockResolvedValue({ id: 1, status: 'CREATED' });
});

// ─── db provided: user query and per-user writeNotification calls ──────────────

describe('sendAlert — in-app wiring (db provided)', () => {
  it('queries active users with the correct SQL', async () => {
    const db = makeDb([1]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(db.query).toHaveBeenCalledWith('SELECT id FROM users WHERE deleted_at IS NULL');
  });

  it('calls writeNotification once per active user', async () => {
    const db = makeDb([1, 2, 3]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(writeNotification).toHaveBeenCalledTimes(3);
  });

  it('passes db, userId, and summary to each writeNotification call', async () => {
    const db = makeDb([42]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(writeNotification).toHaveBeenCalledWith({ db, userId: 42, summary: CRITICAL_WORSENING });
  });

  it('calls writeNotification for each user id returned by the query', async () => {
    const db = makeDb([7, 8]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(writeNotification).toHaveBeenCalledWith({ db, userId: 7, summary: CRITICAL_WORSENING });
    expect(writeNotification).toHaveBeenCalledWith({ db, userId: 8, summary: CRITICAL_WORSENING });
  });

  it('does not call writeNotification when no active users exist', async () => {
    const db = makeDb([]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(writeNotification).not.toHaveBeenCalled();
  });
});

// ─── db absent: persistence silently skipped ──────────────────────────────────

describe('sendAlert — in-app wiring (db absent)', () => {
  it('does not call writeNotification when called with no second argument', async () => {
    await sendAlert(CRITICAL_WORSENING);
    expect(writeNotification).not.toHaveBeenCalled();
  });

  it('does not throw when called with no second argument', async () => {
    await expect(sendAlert(CRITICAL_WORSENING)).resolves.toBeUndefined();
  });

  it('does not call writeNotification when db is null', async () => {
    await sendAlert(CRITICAL_WORSENING, { db: null });
    expect(writeNotification).not.toHaveBeenCalled();
  });

  it('does not call writeNotification when db is undefined', async () => {
    await sendAlert(CRITICAL_WORSENING, { db: undefined });
    expect(writeNotification).not.toHaveBeenCalled();
  });
});

// ─── failure isolation ────────────────────────────────────────────────────────

describe('sendAlert — in-app failure isolation', () => {
  it('writeNotification rejection does not throw from sendAlert', async () => {
    writeNotification.mockRejectedValue(new Error('DB write error'));
    const db = makeDb([1]);
    await expect(sendAlert(CRITICAL_WORSENING, { db })).resolves.toBeUndefined();
  });

  it('writeNotification failure still allows email to be called', async () => {
    writeNotification.mockRejectedValue(new Error('DB write error'));
    const db = makeDb([1]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(sendEmailAlert).toHaveBeenCalled();
  });

  it('writeNotification failure still allows Slack to be called', async () => {
    writeNotification.mockRejectedValue(new Error('DB write error'));
    const db = makeDb([1]);
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(sendSlackAlert).toHaveBeenCalled();
  });

  it('db.query failure does not throw from sendAlert', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB query failed')) };
    await expect(sendAlert(CRITICAL_WORSENING, { db })).resolves.toBeUndefined();
  });

  it('db.query failure still allows email and Slack to be called', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB query failed')) };
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(sendEmailAlert).toHaveBeenCalled();
    expect(sendSlackAlert).toHaveBeenCalled();
  });
});

// ─── dedup behavior preserved ─────────────────────────────────────────────────

describe('sendAlert — dedup behavior preserved', () => {
  it('does not call writeNotification on a duplicate alertState:trend key', async () => {
    const db = makeDb([1]);
    await sendAlert(CRITICAL_WORSENING, { db });
    jest.clearAllMocks();
    await sendAlert(CRITICAL_WORSENING, { db }); // same key — deduped
    expect(writeNotification).not.toHaveBeenCalled();
  });

  it('calls writeNotification again after _sent is cleared', async () => {
    const db = makeDb([1]);
    await sendAlert(CRITICAL_WORSENING, { db });
    _sent.clear();
    jest.clearAllMocks();
    writeNotification.mockResolvedValue({ id: 2, status: 'CREATED' });
    await sendAlert(CRITICAL_WORSENING, { db });
    expect(writeNotification).toHaveBeenCalledTimes(1);
  });
});
