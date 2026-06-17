'use strict';

const { writeNotification } = require('../../../../execution/notifications/writeNotification');

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-16T00:00:00.000Z',
};

const HIGH_WORSENING = {
  alertState:     'High',
  trend:          'Worsening',
  riskScore:      65,
  atRiskProjects: 5,
  totalProjects:  10,
  lastUpdated:    '2026-06-16T00:00:00.000Z',
};

const NORMAL_STABLE = {
  alertState:     'Normal',
  trend:          'Stable',
  riskScore:      20,
  atRiskProjects: 1,
  totalProjects:  10,
  lastUpdated:    '2026-06-16T00:00:00.000Z',
};

function makeDb(rows = [{ id: 1, status: 'CREATED', priority: 'CRITICAL' }]) {
  return { query: jest.fn().mockResolvedValue({ rows, rowCount: rows.length }) };
}

// ─── Guards ───────────────────────────────────────────────────────────────────

describe('writeNotification — guards', () => {
  it('throws when db is not provided', async () => {
    await expect(writeNotification({ userId: 1, summary: CRITICAL_WORSENING }))
      .rejects.toThrow(/db is required/i);
  });

  it('throws when db is null', async () => {
    await expect(writeNotification({ db: null, userId: 1, summary: CRITICAL_WORSENING }))
      .rejects.toThrow(/db is required/i);
  });

  it('throws when userId is not provided', async () => {
    const db = makeDb();
    await expect(writeNotification({ db, summary: CRITICAL_WORSENING }))
      .rejects.toThrow(/userId is required/i);
  });

  it('throws when userId is 0 (falsy)', async () => {
    const db = makeDb();
    await expect(writeNotification({ db, userId: 0, summary: CRITICAL_WORSENING }))
      .rejects.toThrow(/userId is required/i);
  });

  it('throws when summary is not provided', async () => {
    const db = makeDb();
    await expect(writeNotification({ db, userId: 1 }))
      .rejects.toThrow(/summary is required/i);
  });

  it('throws when summary is null', async () => {
    const db = makeDb();
    await expect(writeNotification({ db, userId: 1, summary: null }))
      .rejects.toThrow(/summary is required/i);
  });
});

// ─── DB call ──────────────────────────────────────────────────────────────────

describe('writeNotification — DB call', () => {
  it('calls db.query exactly once', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('issues an INSERT INTO notifications statement', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [sql] = db.query.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ').toUpperCase()).toContain('INSERT INTO NOTIFICATIONS');
  });

  it('uses ON CONFLICT DO NOTHING', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [sql] = db.query.mock.calls[0];
    const flat = sql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain('ON CONFLICT');
    expect(flat).toContain('DO NOTHING');
  });

  it('includes RETURNING clause', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [sql] = db.query.mock.calls[0];
    expect(sql.toUpperCase()).toContain('RETURNING');
  });

  it('passes userId as the first parameter', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 42, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe(42);
  });

  it('passes type "portfolio_alert" as a parameter', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('portfolio_alert');
  });
});

// ─── Priority mapping ─────────────────────────────────────────────────────────

describe('writeNotification — priority mapping', () => {
  it('maps alertState Critical → CRITICAL regardless of trend', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('CRITICAL');
  });

  it('maps alertState Critical + Stable trend → CRITICAL (Critical wins)', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: { ...CRITICAL_WORSENING, trend: 'Stable' } });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('CRITICAL');
    expect(params).not.toContain('HIGH');
  });

  it('maps non-critical alertState + Worsening trend → HIGH', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: HIGH_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('HIGH');
    expect(params).not.toContain('CRITICAL');
  });

  it('maps Normal/Stable → MEDIUM', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: NORMAL_STABLE });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('MEDIUM');
    expect(params).not.toContain('CRITICAL');
    expect(params).not.toContain('HIGH');
  });
});

// ─── dedupe_key ───────────────────────────────────────────────────────────────

describe('writeNotification — dedupe_key', () => {
  it('sets dedupe_key to alertState:trend format', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('Critical:Worsening');
  });

  it('dedupe_key reflects both alertState and trend', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: HIGH_WORSENING });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('High:Worsening');
  });

  it('dedupe_key uses the colon separator', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: NORMAL_STABLE });
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain('Normal:Stable');
  });
});

// ─── expires_at ───────────────────────────────────────────────────────────────

describe('writeNotification — expires_at', () => {
  it('passes a Date instance as expires_at', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    const expiresAt = params.find(p => p instanceof Date);
    expect(expiresAt).toBeInstanceOf(Date);
  });

  it('sets expires_at approximately 90 days from now', async () => {
    const db = makeDb();
    const before = Date.now();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const after = Date.now();
    const [, params] = db.query.mock.calls[0];
    const expiresAt = params.find(p => p instanceof Date);
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + ninetyDaysMs);
    expect(expiresAt.getTime()).toBeLessThanOrEqual(after  + ninetyDaysMs + 1000);
  });
});

// ─── title and body content ───────────────────────────────────────────────────

describe('writeNotification — title and body', () => {
  it('title contains [RepoPulse]', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    const title = params.find(p => typeof p === 'string' && p.includes('[RepoPulse]'));
    expect(title).toBeDefined();
  });

  it('title contains alertState and trend', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    const title = params.find(p => typeof p === 'string' && p.includes('[RepoPulse]'));
    expect(title).toContain('Critical');
    expect(title).toContain('Worsening');
  });

  it('body contains alertState, trend, riskScore, and at-risk count', async () => {
    const db = makeDb();
    await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    const [, params] = db.query.mock.calls[0];
    const body = params.find(p => typeof p === 'string' && p.includes('Alert State'));
    expect(body).toBeDefined();
    expect(body).toContain('Critical');
    expect(body).toContain('Worsening');
    expect(body).toContain('80%');
    expect(body).toContain('8 / 10');
  });
});

// ─── Return value ─────────────────────────────────────────────────────────────

describe('writeNotification — return value', () => {
  it('returns the inserted row when INSERT succeeds', async () => {
    const row = { id: 7, status: 'CREATED', priority: 'CRITICAL', dedupe_key: 'Critical:Worsening' };
    const db = makeDb([row]);
    const result = await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    expect(result).toBe(row);
  });

  it('returns null when ON CONFLICT fires (zero rows returned)', async () => {
    const db = makeDb([]);
    const result = await writeNotification({ db, userId: 1, summary: CRITICAL_WORSENING });
    expect(result).toBeNull();
  });

  it('different userId + same dedupe_key returns the row (different users are independent)', async () => {
    const rowA = { id: 1, user_id: 1, dedupe_key: 'Critical:Worsening' };
    const rowB = { id: 2, user_id: 2, dedupe_key: 'Critical:Worsening' };
    const dbA = makeDb([rowA]);
    const dbB = makeDb([rowB]);
    const resultA = await writeNotification({ db: dbA, userId: 1, summary: CRITICAL_WORSENING });
    const resultB = await writeNotification({ db: dbB, userId: 2, summary: CRITICAL_WORSENING });
    expect(resultA).toBe(rowA);
    expect(resultB).toBe(rowB);
  });
});
