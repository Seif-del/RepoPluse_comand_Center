'use strict';

jest.mock('../../../../execution/logger', () => ({
  error: jest.fn(),
  warn:  jest.fn(),
  info:  jest.fn(),
  debug: jest.fn(),
}));

const { logEvent } = require('../../../../execution/audit/logEvent');
const logger        = require('../../../../execution/logger');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const NOW      = new Date('2024-07-01T09:00:00.000Z');
const MOCK_ROW = { id: 1, actor_id: '42', action: 'user.login',
                   resource_type: 'user', resource_id: '42',
                   metadata: {}, created_at: NOW };

const mockDb = { query: jest.fn() };

function validArgs(overrides = {}) {
  return {
    db:           mockDb,
    actorId:      '42',
    action:       'user.login',
    resourceType: 'user',
    resourceId:   '42',
    now:          NOW,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue({ rows: [MOCK_ROW] });
});

// ── Success path ──────────────────────────────────────────────────────────────

describe('logEvent — success', () => {
  it('returns the inserted row from db.query RETURNING *', async () => {
    const row = await logEvent(validArgs());
    expect(row).toEqual(MOCK_ROW);
  });

  it('calls db.query exactly once', async () => {
    await logEvent(validArgs());
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  it('SQL contains INSERT INTO audit_logs', async () => {
    await logEvent(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/INSERT INTO audit_logs/i);
  });

  it('SQL contains RETURNING *', async () => {
    await logEvent(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/RETURNING \*/i);
  });

  it('SQL never contains UPDATE', async () => {
    await logEvent(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).not.toMatch(/UPDATE/i);
  });

  it('SQL never contains DELETE', async () => {
    await logEvent(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).not.toMatch(/DELETE/i);
  });

  it('passes actorId as the first query parameter', async () => {
    await logEvent(validArgs({ actorId: '99' }));
    expect(mockDb.query.mock.calls[0][1][0]).toBe('99');
  });

  it('passes action as the second query parameter', async () => {
    await logEvent(validArgs({ action: 'repo.linked' }));
    expect(mockDb.query.mock.calls[0][1][1]).toBe('repo.linked');
  });

  it('passes resourceType as the third query parameter', async () => {
    await logEvent(validArgs({ resourceType: 'repository' }));
    expect(mockDb.query.mock.calls[0][1][2]).toBe('repository');
  });

  it('passes resourceId as the fourth query parameter', async () => {
    await logEvent(validArgs({ resourceId: '77' }));
    expect(mockDb.query.mock.calls[0][1][3]).toBe('77');
  });

  it('passes metadata as the fifth query parameter', async () => {
    const meta = { previousRole: 'intern', newRole: 'project_manager' };
    await logEvent(validArgs({ metadata: meta }));
    expect(mockDb.query.mock.calls[0][1][4]).toBe(meta);
  });

  it('passes now as the sixth query parameter', async () => {
    await logEvent(validArgs());
    expect(mockDb.query.mock.calls[0][1][5]).toBe(NOW);
  });

  it('defaults metadata to {} when not provided', async () => {
    await logEvent(validArgs());  // no metadata key in validArgs default
    expect(mockDb.query.mock.calls[0][1][4]).toEqual({});
  });

  it('defaults metadata to {} when explicitly passed as undefined', async () => {
    await logEvent(validArgs({ metadata: undefined }));
    expect(mockDb.query.mock.calls[0][1][4]).toEqual({});
  });

  it('accepts an explicit empty metadata object', async () => {
    await logEvent(validArgs({ metadata: {} }));
    expect(mockDb.query.mock.calls[0][1][4]).toEqual({});
  });

  it('accepts a metadata object with content', async () => {
    const meta = { reason: 'test-alert', severity: 'high' };
    await logEvent(validArgs({ metadata: meta }));
    expect(mockDb.query.mock.calls[0][1][4]).toEqual(meta);
  });

  it("accepts actorId of '0' for system-initiated events", async () => {
    await expect(logEvent(validArgs({ actorId: '0' }))).resolves.toBeDefined();
  });
});

// ── INVALID_DB ────────────────────────────────────────────────────────────────

describe('logEvent — INVALID_DB', () => {
  const cases = [
    ['null',                    null],
    ['undefined',               undefined],
    ['object without .query',   { notQuery: true }],
    ['a string',                'pool'],
    ['a number',                1],
  ];

  cases.forEach(([label, db]) => {
    it(`throws INVALID_DB when db is ${label}`, async () => {
      await expect(logEvent(validArgs({ db }))).rejects.toMatchObject({
        code: 'INVALID_DB', message: 'db must be a valid database pool',
      });
    });

    it(`does not call db.query when db is ${label}`, async () => {
      try { await logEvent(validArgs({ db })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_ACTOR_ID ──────────────────────────────────────────────────────────

describe('logEvent — INVALID_ACTOR_ID', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a number',        42],
    ['an empty string', ''],
    ['whitespace-only', '   '],
  ];

  cases.forEach(([label, actorId]) => {
    it(`throws INVALID_ACTOR_ID when actorId is ${label}`, async () => {
      await expect(logEvent(validArgs({ actorId }))).rejects.toMatchObject({
        code: 'INVALID_ACTOR_ID', message: 'actorId must be a non-empty string',
      });
    });

    it(`does not call db.query when actorId is ${label}`, async () => {
      try { await logEvent(validArgs({ actorId })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_ACTION ────────────────────────────────────────────────────────────

describe('logEvent — INVALID_ACTION', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a number',        0],
    ['an empty string', ''],
    ['whitespace-only', '\t'],
  ];

  cases.forEach(([label, action]) => {
    it(`throws INVALID_ACTION when action is ${label}`, async () => {
      await expect(logEvent(validArgs({ action }))).rejects.toMatchObject({
        code: 'INVALID_ACTION', message: 'action must be a non-empty string',
      });
    });

    it(`does not call db.query when action is ${label}`, async () => {
      try { await logEvent(validArgs({ action })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_RESOURCE_TYPE ─────────────────────────────────────────────────────

describe('logEvent — INVALID_RESOURCE_TYPE', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a boolean',       true],
    ['an empty string', ''],
    ['whitespace-only', '  '],
  ];

  cases.forEach(([label, resourceType]) => {
    it(`throws INVALID_RESOURCE_TYPE when resourceType is ${label}`, async () => {
      await expect(logEvent(validArgs({ resourceType }))).rejects.toMatchObject({
        code: 'INVALID_RESOURCE_TYPE', message: 'resourceType must be a non-empty string',
      });
    });

    it(`does not call db.query when resourceType is ${label}`, async () => {
      try { await logEvent(validArgs({ resourceType })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_RESOURCE_ID ───────────────────────────────────────────────────────

describe('logEvent — INVALID_RESOURCE_ID', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a number',        99],
    ['an empty string', ''],
    ['whitespace-only', '\n'],
  ];

  cases.forEach(([label, resourceId]) => {
    it(`throws INVALID_RESOURCE_ID when resourceId is ${label}`, async () => {
      await expect(logEvent(validArgs({ resourceId }))).rejects.toMatchObject({
        code: 'INVALID_RESOURCE_ID', message: 'resourceId must be a non-empty string',
      });
    });

    it(`does not call db.query when resourceId is ${label}`, async () => {
      try { await logEvent(validArgs({ resourceId })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_METADATA ──────────────────────────────────────────────────────────
// Three distinct branches in the guard: typeof !== 'object', === null, Array.isArray

describe('logEvent — INVALID_METADATA', () => {
  it('throws INVALID_METADATA when metadata is a string (typeof branch)', async () => {
    await expect(logEvent(validArgs({ metadata: 'notes' }))).rejects.toMatchObject({
      code: 'INVALID_METADATA', message: 'metadata must be a plain object',
    });
  });

  it('throws INVALID_METADATA when metadata is a number (typeof branch)', async () => {
    await expect(logEvent(validArgs({ metadata: 42 }))).rejects.toMatchObject({
      code: 'INVALID_METADATA',
    });
  });

  it('throws INVALID_METADATA when metadata is null (null branch)', async () => {
    await expect(logEvent(validArgs({ metadata: null }))).rejects.toMatchObject({
      code: 'INVALID_METADATA',
    });
  });

  it('throws INVALID_METADATA when metadata is an array (Array.isArray branch)', async () => {
    await expect(logEvent(validArgs({ metadata: ['a', 'b'] }))).rejects.toMatchObject({
      code: 'INVALID_METADATA',
    });
  });

  it('throws INVALID_METADATA when metadata is an empty array', async () => {
    await expect(logEvent(validArgs({ metadata: [] }))).rejects.toMatchObject({
      code: 'INVALID_METADATA',
    });
  });

  const invalidCases = ['string', null, [], 42];
  invalidCases.forEach((metadata) => {
    it(`does not call db.query when metadata is ${JSON.stringify(metadata)}`, async () => {
      try { await logEvent(validArgs({ metadata })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_NOW ───────────────────────────────────────────────────────────────

describe('logEvent — INVALID_NOW', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a string',        '2024-01-01'],
    ['a raw timestamp', Date.now()],
    ['an invalid Date', new Date('not-a-date')],
  ];

  cases.forEach(([label, now]) => {
    it(`throws INVALID_NOW when now is ${label}`, async () => {
      await expect(logEvent(validArgs({ now }))).rejects.toMatchObject({
        code: 'INVALID_NOW', message: 'now must be a valid Date object',
      });
    });

    it(`does not call db.query when now is ${label}`, async () => {
      try { await logEvent(validArgs({ now })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── Validation ordering ───────────────────────────────────────────────────────

describe('logEvent — validation is ordered db → actorId → action → … → now', () => {
  it('throws INVALID_DB (not INVALID_ACTOR_ID) when both are invalid', async () => {
    let caught;
    try { await logEvent({ db: null, actorId: null }); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_DB');
  });

  it('throws INVALID_ACTOR_ID (not INVALID_ACTION) when both are invalid', async () => {
    let caught;
    try { await logEvent(validArgs({ actorId: '', action: '' })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_ACTOR_ID');
  });

  it('throws INVALID_ACTION (not INVALID_RESOURCE_TYPE) when both are invalid', async () => {
    let caught;
    try { await logEvent(validArgs({ action: '', resourceType: '' })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_ACTION');
  });

  it('throws INVALID_RESOURCE_TYPE (not INVALID_RESOURCE_ID) when both are invalid', async () => {
    let caught;
    try { await logEvent(validArgs({ resourceType: '', resourceId: '' })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_RESOURCE_TYPE');
  });
});

// ── Called with no arguments ──────────────────────────────────────────────────

describe('logEvent — called with no arguments', () => {
  it('throws INVALID_DB when called with no argument', async () => {
    await expect(logEvent()).rejects.toMatchObject({ code: 'INVALID_DB' });
  });

  it('throws INVALID_DB when called with an empty object', async () => {
    await expect(logEvent({})).rejects.toMatchObject({ code: 'INVALID_DB' });
  });
});

// ── DB insert failure — fire-and-forget contract ──────────────────────────────

describe('logEvent — DB insert failure resolves to null (fire-and-forget)', () => {
  beforeEach(() => {
    mockDb.query.mockRejectedValue(new Error('connection refused'));
  });

  it('resolves to null when db.query rejects', async () => {
    const result = await logEvent(validArgs());
    expect(result).toBeNull();
  });

  it('does not throw or reject when db.query rejects', async () => {
    await expect(logEvent(validArgs())).resolves.toBeNull();
  });

  it('calls logger.error exactly once on DB failure', async () => {
    await logEvent(validArgs());
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logger.error receives action in the context object', async () => {
    await logEvent(validArgs({ action: 'user.login' }));
    expect(logger.error.mock.calls[0][0]).toMatchObject({ action: 'user.login' });
  });

  it('logger.error receives resourceType in the context object', async () => {
    await logEvent(validArgs({ resourceType: 'session' }));
    expect(logger.error.mock.calls[0][0]).toMatchObject({ resourceType: 'session' });
  });

  it('logger.error receives resourceId in the context object', async () => {
    await logEvent(validArgs({ resourceId: 'r-99' }));
    expect(logger.error.mock.calls[0][0]).toMatchObject({ resourceId: 'r-99' });
  });

  it('logger.error context includes errorMessage from the DB error', async () => {
    mockDb.query.mockRejectedValue(new Error('unique_violation'));
    await logEvent(validArgs());
    expect(logger.error.mock.calls[0][0].errorMessage).toBe('unique_violation');
  });

  it('logger.error context includes errorCode when the DB error has a code', async () => {
    const dbErr = new Error('db err');
    dbErr.code  = 'SQLITE_BUSY';
    mockDb.query.mockRejectedValue(dbErr);
    await logEvent(validArgs());
    expect(logger.error.mock.calls[0][0].errorCode).toBe('SQLITE_BUSY');
  });

  it('logger.error context does NOT contain metadata', async () => {
    const meta = { previousRole: 'intern', newRole: 'project_manager', secret: 'tok' };
    await logEvent(validArgs({ metadata: meta }));
    expect(logger.error.mock.calls[0][0]).not.toHaveProperty('metadata');
  });

  it('logger.error context does NOT contain actorId', async () => {
    await logEvent(validArgs({ actorId: '42' }));
    expect(logger.error.mock.calls[0][0]).not.toHaveProperty('actorId');
  });

  it('logger.error is called with a descriptive message string as second argument', async () => {
    await logEvent(validArgs());
    expect(typeof logger.error.mock.calls[0][1]).toBe('string');
    expect(logger.error.mock.calls[0][1].length).toBeGreaterThan(0);
  });
});

// ── logger.error unavailable (typeof guard branch) ────────────────────────────

describe('logEvent — logger.error guard', () => {
  it('still resolves to null when logger.error is not a function', async () => {
    const saved    = logger.error;
    logger.error   = null;
    mockDb.query.mockRejectedValue(new Error('db down'));
    try {
      const result = await logEvent(validArgs());
      expect(result).toBeNull();
    } finally {
      logger.error = saved;
    }
  });
});
