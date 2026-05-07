'use strict';

const { invalidateSession } = require('../../../../execution/auth/invalidateSession');

function makeDb(overrides = {}) {
  return {
    query: jest.fn().mockResolvedValue({ rowCount: 1 }),
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Happy path ─────────────────────────────────────────────────────────────────

describe('invalidateSession — happy path', () => {
  it('returns { invalidated: true } when rowCount is 1', async () => {
    const db     = makeDb();
    const result = await invalidateSession({ db, sessionId: 'abc-123' });
    expect(result).toEqual({ invalidated: true });
  });

  it('returns { invalidated: false } when rowCount is 0', async () => {
    const db     = makeDb({ query: jest.fn().mockResolvedValue({ rowCount: 0 }) });
    const result = await invalidateSession({ db, sessionId: 'abc-123' });
    expect(result).toEqual({ invalidated: false });
  });

  it('does not throw when the session row is not found', async () => {
    const db = makeDb({ query: jest.fn().mockResolvedValue({ rowCount: 0 }) });
    await expect(invalidateSession({ db, sessionId: 'nonexistent' })).resolves.toBeDefined();
  });

  it('executes a DELETE FROM sessions WHERE id = $1 query', async () => {
    const db = makeDb();
    await invalidateSession({ db, sessionId: 'abc-123' });
    const [sql] = db.query.mock.calls[0];
    expect(sql).toMatch(/DELETE\s+FROM\s+sessions\s+WHERE\s+id\s*=\s*\$1/i);
  });

  it('passes sessionId as the parameterized $1 argument (never interpolated)', async () => {
    const db = makeDb();
    await invalidateSession({ db, sessionId: 'target-session' });
    const [, params] = db.query.mock.calls[0];
    expect(params[0]).toBe('target-session');
  });

  it('calls db.query exactly once', async () => {
    const db = makeDb();
    await invalidateSession({ db, sessionId: 'abc-123' });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

// ── INVALID_DB ─────────────────────────────────────────────────────────────────

describe('invalidateSession — INVALID_DB', () => {
  async function expectInvalidDb(args) {
    await expect(invalidateSession(args)).rejects.toMatchObject({
      message: 'db must be a valid database pool',
      code:    'INVALID_DB',
    });
  }

  it('throws INVALID_DB when db is null', async () => {
    await expectInvalidDb({ db: null, sessionId: 'abc' });
  });

  it('throws INVALID_DB when db is undefined', async () => {
    await expectInvalidDb({ db: undefined, sessionId: 'abc' });
  });

  it('throws INVALID_DB when db has no query method', async () => {
    await expectInvalidDb({ db: {}, sessionId: 'abc' });
  });

  it('throws INVALID_DB when db.query is not a function', async () => {
    await expectInvalidDb({ db: { query: 'not-a-function' }, sessionId: 'abc' });
  });

  it('does not call db.query when db is invalid', async () => {
    const db = makeDb();
    await expect(invalidateSession({ db: null, sessionId: 'abc' })).rejects.toBeDefined();
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── INVALID_SESSION_ID ────────────────────────────────────────────────────────

describe('invalidateSession — INVALID_SESSION_ID', () => {
  async function expectInvalidSessionId(args) {
    await expect(invalidateSession(args)).rejects.toMatchObject({
      message: 'sessionId must be a non-empty string',
      code:    'INVALID_SESSION_ID',
    });
  }

  it('throws INVALID_SESSION_ID when sessionId is an empty string', async () => {
    await expectInvalidSessionId({ db: makeDb(), sessionId: '' });
  });

  it('throws INVALID_SESSION_ID when sessionId is whitespace-only', async () => {
    await expectInvalidSessionId({ db: makeDb(), sessionId: '   ' });
  });

  it('throws INVALID_SESSION_ID when sessionId is null', async () => {
    await expectInvalidSessionId({ db: makeDb(), sessionId: null });
  });

  it('throws INVALID_SESSION_ID when sessionId is a number', async () => {
    await expectInvalidSessionId({ db: makeDb(), sessionId: 42 });
  });

  it('throws INVALID_SESSION_ID when sessionId is undefined', async () => {
    await expectInvalidSessionId({ db: makeDb(), sessionId: undefined });
  });

  it('does not call db.query when sessionId is invalid', async () => {
    const db = makeDb();
    await expect(invalidateSession({ db, sessionId: '' })).rejects.toBeDefined();
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── DB error propagation ──────────────────────────────────────────────────────

describe('invalidateSession — DB error propagation', () => {
  it('propagates db.query rejection by identity', async () => {
    const dbError = new Error('connection timeout');
    const db      = makeDb({ query: jest.fn().mockRejectedValue(dbError) });
    await expect(invalidateSession({ db, sessionId: 'abc-123' })).rejects.toBe(dbError);
  });
});
