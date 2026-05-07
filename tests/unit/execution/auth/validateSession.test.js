'use strict';

const { validateSession } = require('../../../../execution/auth/validateSession');
const { hashToken }       = require('../../../../execution/auth/hashToken');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const RAW_TOKEN           = 'test-raw-session-token';
const EXPECTED_HASH       = hashToken(RAW_TOKEN);
const NOW                 = new Date('2024-06-01T12:00:00.000Z');
const FUTURE              = new Date(NOW.getTime() + 24 * 60 * 60 * 1000); // 24h ahead
const PAST                = new Date(NOW.getTime() - 1);                    // 1ms in the past
const EXACT_NOW           = new Date(NOW.getTime());                        // expires_at === now
const SESSION_EXPIRY_HOURS = 24;
// Rolling expiry: validateSession extends expires_at to now + sessionExpiryHours.
const REFRESHED_EXPIRY    = new Date(NOW.getTime() + SESSION_EXPIRY_HOURS * 60 * 60 * 1000);

const ACTIVE_ROW = {
  id:              7,
  expires_at:      FUTURE,
  user_id:         42,
  role:            'project_manager',
  github_username: 'pm-user',
  deleted_at:      null,
};

const mockDb = { query: jest.fn() };

// Configure mockDb for a happy-path call (SELECT then UPDATE).
function setupSuccess(rowOverride = {}) {
  mockDb.query
    .mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, ...rowOverride }] }) // SELECT
    .mockResolvedValueOnce({ rows: [] });                                  // UPDATE
}

function validArgs(overrides = {}) {
  return {
    db:                 mockDb,
    rawToken:           RAW_TOKEN,
    now:                NOW,
    sessionExpiryHours: SESSION_EXPIRY_HOURS,
    ...overrides,
  };
}

beforeEach(() => jest.resetAllMocks());

// ── Success path ──────────────────────────────────────────────────────────────

describe('validateSession — success', () => {
  beforeEach(() => setupSuccess());

  it('returns the normalized session context', async () => {
    const ctx = await validateSession(validArgs());
    expect(ctx).toEqual({
      sessionId:      ACTIVE_ROW.id,
      userId:         ACTIVE_ROW.user_id,
      role:           ACTIVE_ROW.role,
      githubUsername: ACTIVE_ROW.github_username,
      expiresAt:      REFRESHED_EXPIRY,
    });
  });

  it('calls db.query exactly twice (SELECT then UPDATE)', async () => {
    await validateSession(validArgs());
    expect(mockDb.query).toHaveBeenCalledTimes(2);
  });

  it('uses the SHA-256 hash of rawToken in the SELECT query', async () => {
    await validateSession(validArgs());
    const [, selectParams] = mockDb.query.mock.calls[0];
    expect(selectParams[0]).toBe(EXPECTED_HASH);
  });

  it('never passes the plaintext rawToken to db.query', async () => {
    await validateSession(validArgs());
    for (const [sql, params] of mockDb.query.mock.calls) {
      expect(sql).not.toContain(RAW_TOKEN);
      if (params) {
        for (const p of params) expect(p).not.toBe(RAW_TOKEN);
      }
    }
  });

  it('issues an UPDATE setting last_active_at to now', async () => {
    await validateSession(validArgs());
    const [updateSql, updateParams] = mockDb.query.mock.calls[1];
    expect(updateSql).toMatch(/UPDATE sessions SET last_active_at/i);
    expect(updateParams[0]).toBe(NOW);
  });

  it('UPDATE query also refreshes expires_at', async () => {
    await validateSession(validArgs());
    const [updateSql] = mockDb.query.mock.calls[1];
    expect(updateSql).toMatch(/expires_at/i);
  });

  it('second UPDATE parameter is the refreshed expires_at (now + sessionExpiryHours)', async () => {
    await validateSession(validArgs());
    const [, updateParams] = mockDb.query.mock.calls[1];
    expect(updateParams[1]).toEqual(REFRESHED_EXPIRY);
  });

  it('UPDATE targets the correct session id', async () => {
    await validateSession(validArgs());
    const [, updateParams] = mockDb.query.mock.calls[1];
    expect(updateParams[2]).toBe(ACTIVE_ROW.id);
  });

  it('returned expiresAt is the refreshed value (now + sessionExpiryHours)', async () => {
    const ctx = await validateSession(validArgs());
    expect(ctx.expiresAt).toEqual(REFRESHED_EXPIRY);
  });

  it('returned expiresAt differs from the stored expires_at when they are different', async () => {
    // Use a stored expires_at that differs from the refreshed value to prove
    // the return value comes from the computed refresh, not the DB row.
    const storedExpiry = new Date(NOW.getTime() + 48 * 60 * 60 * 1000); // 48h stored
    setupSuccess({ expires_at: storedExpiry });
    const ctx = await validateSession(validArgs({ sessionExpiryHours: 6 }));
    const expectedRefresh = new Date(NOW.getTime() + 6 * 60 * 60 * 1000);
    expect(ctx.expiresAt).toEqual(expectedRefresh);
    expect(ctx.expiresAt).not.toEqual(storedExpiry);
  });

  it('sessionExpiryHours of 1 produces a 1-hour refresh window', async () => {
    setupSuccess();
    const ctx = await validateSession(validArgs({ sessionExpiryHours: 1 }));
    const expectedRefresh = new Date(NOW.getTime() + 1 * 60 * 60 * 1000);
    expect(ctx.expiresAt).toEqual(expectedRefresh);
  });
});

// ── UNAUTHORIZED — no matching session ───────────────────────────────────────

describe('validateSession — UNAUTHORIZED: no matching session', () => {
  it('throws UNAUTHORIZED when no row is returned', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    await expect(validateSession(validArgs())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
      message: 'Unauthorized',
    });
  });

  it('does not call UPDATE when SELECT returns no row', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [] });
    try { await validateSession(validArgs()); } catch (_) {}
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

// ── UNAUTHORIZED — expired session ───────────────────────────────────────────

describe('validateSession — UNAUTHORIZED: expired session', () => {
  it('throws UNAUTHORIZED when expires_at is before now', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, expires_at: PAST }] });
    await expect(validateSession(validArgs())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('throws UNAUTHORIZED when expires_at equals now exactly', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, expires_at: EXACT_NOW }] });
    await expect(validateSession(validArgs())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('does not call UPDATE when session is expired (expiry is not refreshed)', async () => {
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, expires_at: PAST }] });
    try { await validateSession(validArgs()); } catch (_) {}
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

// ── UNAUTHORIZED — soft-deleted user ─────────────────────────────────────────

describe('validateSession — UNAUTHORIZED: soft-deleted user', () => {
  it('throws UNAUTHORIZED when deleted_at is a Date', async () => {
    const deletedAt = new Date('2024-05-01T00:00:00.000Z');
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, deleted_at: deletedAt }] });
    await expect(validateSession(validArgs())).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('does not call UPDATE when user is soft-deleted (expiry is not refreshed)', async () => {
    const deletedAt = new Date('2024-05-01T00:00:00.000Z');
    mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, deleted_at: deletedAt }] });
    try { await validateSession(validArgs()); } catch (_) {}
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

// ── All UNAUTHORIZED cases share the same message ────────────────────────────

describe('validateSession — UNAUTHORIZED error message is identical for all rejection reasons', () => {
  async function unauthorizedMessage(mockSetup) {
    mockSetup();
    let caught;
    try { await validateSession(validArgs()); } catch (err) { caught = err; }
    return caught.message;
  }

  it('no-session message equals expired message', async () => {
    const noSession = await unauthorizedMessage(() =>
      mockDb.query.mockResolvedValueOnce({ rows: [] })
    );
    const expired = await unauthorizedMessage(() =>
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, expires_at: PAST }] })
    );
    expect(noSession).toBe(expired);
  });

  it('expired message equals soft-deleted message', async () => {
    const expired = await unauthorizedMessage(() =>
      mockDb.query.mockResolvedValueOnce({ rows: [{ ...ACTIVE_ROW, expires_at: PAST }] })
    );
    const deleted = await unauthorizedMessage(() =>
      mockDb.query.mockResolvedValueOnce({
        rows: [{ ...ACTIVE_ROW, deleted_at: new Date('2024-01-01') }],
      })
    );
    expect(expired).toBe(deleted);
  });
});

// ── INVALID_DB ────────────────────────────────────────────────────────────────

describe('validateSession — INVALID_DB', () => {
  const cases = [
    ['null',                    null],
    ['undefined',               undefined],
    ['object without .query',   { noQuery: true }],
    ['a string',                'not-a-db'],
    ['a number',                99],
  ];

  cases.forEach(([label, db]) => {
    it(`throws INVALID_DB when db is ${label}`, async () => {
      await expect(validateSession(validArgs({ db }))).rejects.toMatchObject({
        code: 'INVALID_DB',
        message: 'db must be a valid database pool',
      });
    });

    it(`does not call db.query when db is ${label}`, async () => {
      try { await validateSession(validArgs({ db })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_RAW_TOKEN ─────────────────────────────────────────────────────────

describe('validateSession — INVALID_RAW_TOKEN', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a number',        42],
    ['an empty string', ''],
    ['whitespace-only', '   '],
  ];

  cases.forEach(([label, rawToken]) => {
    it(`throws INVALID_RAW_TOKEN when rawToken is ${label}`, async () => {
      await expect(validateSession(validArgs({ rawToken }))).rejects.toMatchObject({
        code: 'INVALID_RAW_TOKEN',
        message: 'rawToken must be a non-empty string',
      });
    });

    it(`does not call db.query when rawToken is ${label}`, async () => {
      try { await validateSession(validArgs({ rawToken })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_NOW ───────────────────────────────────────────────────────────────

describe('validateSession — INVALID_NOW', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a string',        '2024-01-01'],
    ['a raw number',    Date.now()],
    ['an invalid Date', new Date('not-a-date')],
  ];

  cases.forEach(([label, now]) => {
    it(`throws INVALID_NOW when now is ${label}`, async () => {
      await expect(validateSession(validArgs({ now }))).rejects.toMatchObject({
        code: 'INVALID_NOW',
        message: 'now must be a valid Date object',
      });
    });

    it(`does not call db.query when now is ${label}`, async () => {
      try { await validateSession(validArgs({ now })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_SESSION_EXPIRY_HOURS ──────────────────────────────────────────────

describe('validateSession — INVALID_SESSION_EXPIRY_HOURS', () => {
  const cases = [
    ['null',           null],
    ['undefined',      undefined],
    ['zero',           0],
    ['negative',       -1],
    ['NaN',            NaN],
    ['a non-numeric string', 'not-a-number'],
  ];

  cases.forEach(([label, sessionExpiryHours]) => {
    it(`throws INVALID_SESSION_EXPIRY_HOURS when sessionExpiryHours is ${label}`, async () => {
      await expect(validateSession(validArgs({ sessionExpiryHours }))).rejects.toMatchObject({
        code: 'INVALID_SESSION_EXPIRY_HOURS',
        message: 'sessionExpiryHours must be a positive number',
      });
    });

    it(`does not call db.query when sessionExpiryHours is ${label}`, async () => {
      try { await validateSession(validArgs({ sessionExpiryHours })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── Called with no arguments ──────────────────────────────────────────────────

describe('validateSession — called with no arguments', () => {
  it('throws INVALID_DB when called with no argument', async () => {
    await expect(validateSession()).rejects.toMatchObject({ code: 'INVALID_DB' });
  });
});

// ── Validation ordering ───────────────────────────────────────────────────────

describe('validateSession — validation ordering', () => {
  it('throws INVALID_DB (not INVALID_RAW_TOKEN) when both are invalid', async () => {
    let caught;
    try { await validateSession({ db: null, rawToken: null }); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_DB');
  });

  it('throws INVALID_RAW_TOKEN (not INVALID_NOW) when both are invalid', async () => {
    let caught;
    try { await validateSession(validArgs({ rawToken: '', now: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_RAW_TOKEN');
  });

  it('throws INVALID_NOW (not INVALID_SESSION_EXPIRY_HOURS) when both are invalid', async () => {
    let caught;
    try {
      await validateSession(validArgs({ now: null, sessionExpiryHours: 0 }));
    } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_NOW');
  });

  it('throws INVALID_SESSION_EXPIRY_HOURS (not UNAUTHORIZED) when expiry hours is invalid', async () => {
    let caught;
    try { await validateSession(validArgs({ sessionExpiryHours: 0 })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_SESSION_EXPIRY_HOURS');
    expect(mockDb.query).not.toHaveBeenCalled();
  });
});

// ── DB error propagation ──────────────────────────────────────────────────────

describe('validateSession — database error propagation', () => {
  it('propagates errors thrown by the SELECT query', async () => {
    const dbErr = new Error('connection lost');
    mockDb.query.mockRejectedValueOnce(dbErr);
    await expect(validateSession(validArgs())).rejects.toBe(dbErr);
  });

  it('propagates errors thrown by the UPDATE query', async () => {
    const dbErr = new Error('deadlock detected');
    mockDb.query
      .mockResolvedValueOnce({ rows: [ACTIVE_ROW] }) // SELECT succeeds
      .mockRejectedValueOnce(dbErr);                 // UPDATE fails
    await expect(validateSession(validArgs())).rejects.toBe(dbErr);
  });

  it('does not swallow the original SELECT error object', async () => {
    const dbErr = new Error('timeout');
    mockDb.query.mockRejectedValueOnce(dbErr);
    let caught;
    try { await validateSession(validArgs()); } catch (err) { caught = err; }
    expect(caught).toBe(dbErr);
  });
});
