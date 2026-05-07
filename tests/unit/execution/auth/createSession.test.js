'use strict';

const { createSession } = require('../../../../execution/auth/createSession');
const { hashToken }     = require('../../../../execution/auth/hashToken');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const RAW_TOKEN    = 'plaintext-session-token-abc123';
const NOW          = new Date('2024-06-01T12:00:00.000Z');
const EXPIRY_HOURS = 24;
const USER_ID      = '42';
const EXPECTED_HASH = hashToken(RAW_TOKEN);
const EXPECTED_EXPIRES = new Date(NOW.getTime() + EXPIRY_HOURS * 60 * 60 * 1000);

const MOCK_ROW = {
  id: 1,
  user_id: 42,
  token_hash: EXPECTED_HASH,
  created_at: NOW,
  last_active_at: NOW,
  expires_at: EXPECTED_EXPIRES,
};

const mockDb = { query: jest.fn() };

function validArgs(overrides = {}) {
  return {
    db: mockDb,
    userId: USER_ID,
    rawToken: RAW_TOKEN,
    now: NOW,
    sessionExpiryHours: EXPIRY_HOURS,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue({ rows: [MOCK_ROW] });
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('createSession — success', () => {
  it('returns the row object from db.query RETURNING *', async () => {
    const row = await createSession(validArgs());
    expect(row).toEqual(MOCK_ROW);
  });

  it('calls db.query exactly once', async () => {
    await createSession(validArgs());
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  it('passes the SHA-256 hash of rawToken as the second query parameter', async () => {
    await createSession(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[1]).toBe(EXPECTED_HASH);
  });

  it('never passes the plaintext rawToken to db.query', async () => {
    await createSession(validArgs());
    const [sql, params] = mockDb.query.mock.calls[0];
    expect(sql).not.toContain(RAW_TOKEN);
    for (const param of params) {
      expect(param).not.toBe(RAW_TOKEN);
    }
  });

  it('sets created_at to the provided now value', async () => {
    await createSession(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[2]).toBe(NOW);
  });

  it('sets last_active_at to the provided now value', async () => {
    await createSession(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[3]).toBe(NOW);
  });

  it('sets expires_at to now + sessionExpiryHours in milliseconds', async () => {
    await createSession(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[4]).toEqual(EXPECTED_EXPIRES);
  });

  it('computes expires_at correctly for a non-default expiry', async () => {
    const customNow    = new Date('2024-01-15T08:00:00.000Z');
    const customExpiry = 48;
    const expected     = new Date(customNow.getTime() + 48 * 60 * 60 * 1000);

    await createSession(validArgs({ now: customNow, sessionExpiryHours: customExpiry }));

    const params = mockDb.query.mock.calls[0][1];
    expect(params[4]).toEqual(expected);
  });

  it('passes userId as the first query parameter', async () => {
    await createSession(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[0]).toBe(USER_ID);
  });

  it('executes an INSERT … RETURNING * statement', async () => {
    await createSession(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/INSERT INTO sessions/i);
    expect(sql).toMatch(/RETURNING \*/i);
  });
});

// ── db validation ─────────────────────────────────────────────────────────────

describe('createSession — INVALID_DB', () => {
  const cases = [
    ['null',                   null],
    ['undefined',              undefined],
    ['an object without query', { notQuery: true }],
    ['a string',               'not-a-db'],
    ['a number',               42],
  ];

  cases.forEach(([label, db]) => {
    it(`throws with code INVALID_DB when db is ${label}`, async () => {
      await expect(createSession(validArgs({ db }))).rejects.toMatchObject({
        code: 'INVALID_DB',
        message: 'db must be a valid database pool',
      });
    });

    it(`does not call db.query when db is ${label}`, async () => {
      try { await createSession(validArgs({ db })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── userId validation ─────────────────────────────────────────────────────────

describe('createSession — INVALID_USER_ID', () => {
  const cases = [
    ['null',               null],
    ['undefined',          undefined],
    ['a number',           7],
    ['an empty string',    ''],
    ['whitespace-only',    '   '],
  ];

  cases.forEach(([label, userId]) => {
    it(`throws with code INVALID_USER_ID when userId is ${label}`, async () => {
      await expect(createSession(validArgs({ userId }))).rejects.toMatchObject({
        code: 'INVALID_USER_ID',
        message: 'userId must be a non-empty string',
      });
    });

    it(`does not call db.query when userId is ${label}`, async () => {
      try { await createSession(validArgs({ userId })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── rawToken validation ───────────────────────────────────────────────────────

describe('createSession — INVALID_RAW_TOKEN', () => {
  const cases = [
    ['null',             null],
    ['undefined',        undefined],
    ['a number',         123],
    ['an empty string',  ''],
    ['whitespace-only',  '\t\n'],
  ];

  cases.forEach(([label, rawToken]) => {
    it(`throws with code INVALID_RAW_TOKEN when rawToken is ${label}`, async () => {
      await expect(createSession(validArgs({ rawToken }))).rejects.toMatchObject({
        code: 'INVALID_RAW_TOKEN',
        message: 'rawToken must be a non-empty string',
      });
    });

    it(`does not call db.query when rawToken is ${label}`, async () => {
      try { await createSession(validArgs({ rawToken })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── now validation ────────────────────────────────────────────────────────────

describe('createSession — INVALID_NOW', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a string',        '2024-01-01'],
    ['a number',        Date.now()],
    ['an invalid Date', new Date('not-a-date')],
  ];

  cases.forEach(([label, now]) => {
    it(`throws with code INVALID_NOW when now is ${label}`, async () => {
      await expect(createSession(validArgs({ now }))).rejects.toMatchObject({
        code: 'INVALID_NOW',
        message: 'now must be a valid Date object',
      });
    });

    it(`does not call db.query when now is ${label}`, async () => {
      try { await createSession(validArgs({ now })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── sessionExpiryHours validation ─────────────────────────────────────────────

describe('createSession — INVALID_SESSION_EXPIRY_HOURS', () => {
  const cases = [
    ['null',       null],
    ['undefined',  undefined],
    ['a string',   '24'],
    ['zero',       0],
    ['negative',   -1],
    ['NaN',        NaN],
  ];

  cases.forEach(([label, sessionExpiryHours]) => {
    it(`throws with code INVALID_SESSION_EXPIRY_HOURS when sessionExpiryHours is ${label}`, async () => {
      await expect(createSession(validArgs({ sessionExpiryHours }))).rejects.toMatchObject({
        code: 'INVALID_SESSION_EXPIRY_HOURS',
        message: 'sessionExpiryHours must be a positive number',
      });
    });

    it(`does not call db.query when sessionExpiryHours is ${label}`, async () => {
      try { await createSession(validArgs({ sessionExpiryHours })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── Called with no arguments ──────────────────────────────────────────────────

describe('createSession — called with no arguments', () => {
  it('throws INVALID_DB when called with no argument at all', async () => {
    await expect(createSession()).rejects.toMatchObject({ code: 'INVALID_DB' });
  });
});

// ── DB error propagation ──────────────────────────────────────────────────────

describe('createSession — database errors', () => {
  it('propagates errors thrown by db.query', async () => {
    const dbErr = new Error('connection refused');
    mockDb.query.mockRejectedValue(dbErr);
    await expect(createSession(validArgs())).rejects.toThrow('connection refused');
  });

  it('does not swallow the original db error', async () => {
    const dbErr = new Error('unique constraint violation');
    mockDb.query.mockRejectedValue(dbErr);
    await expect(createSession(validArgs())).rejects.toBe(dbErr);
  });
});
