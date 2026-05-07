'use strict';

const { upsertUser } = require('../../../../execution/auth/upsertUser');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const GITHUB_ID       = 12345;
const GITHUB_USERNAME = 'octocat';
const EMAIL           = 'octocat@github.com';
const DEFAULT_ROLE    = 'intern';
const NOW             = new Date('2024-06-01T12:00:00.000Z');

const MOCK_ROW = {
  id:              1,
  github_id:       GITHUB_ID,
  github_username: GITHUB_USERNAME,
  email:           EMAIL,
  role:            DEFAULT_ROLE,
  created_at:      NOW,
  updated_at:      NOW,
  deleted_at:      null,
};

const mockDb = { query: jest.fn() };

function validArgs(overrides = {}) {
  return {
    db:             mockDb,
    githubId:       GITHUB_ID,
    githubUsername: GITHUB_USERNAME,
    email:          EMAIL,
    defaultRole:    DEFAULT_ROLE,
    now:            NOW,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.query.mockResolvedValue({ rows: [MOCK_ROW] });
});

// ── Success: normalized return shape ─────────────────────────────────────────

describe('upsertUser — success: normalized return shape', () => {
  it('returns userId from row.id', async () => {
    const result = await upsertUser(validArgs());
    expect(result.userId).toBe(MOCK_ROW.id);
  });

  it('returns githubId from row.github_id', async () => {
    const result = await upsertUser(validArgs());
    expect(result.githubId).toBe(MOCK_ROW.github_id);
  });

  it('returns githubUsername from row.github_username', async () => {
    const result = await upsertUser(validArgs());
    expect(result.githubUsername).toBe(MOCK_ROW.github_username);
  });

  it('returns email from row.email', async () => {
    const result = await upsertUser(validArgs());
    expect(result.email).toBe(MOCK_ROW.email);
  });

  it('returns role from row.role', async () => {
    const result = await upsertUser(validArgs());
    expect(result.role).toBe(MOCK_ROW.role);
  });

  it('returns createdAt from row.created_at', async () => {
    const result = await upsertUser(validArgs());
    expect(result.createdAt).toBe(MOCK_ROW.created_at);
  });

  it('returns deletedAt from row.deleted_at', async () => {
    const result = await upsertUser(validArgs());
    expect(result.deletedAt).toBe(MOCK_ROW.deleted_at);
  });

  it('returns exactly seven keys', async () => {
    const result = await upsertUser(validArgs());
    expect(Object.keys(result).sort()).toEqual(
      ['createdAt', 'deletedAt', 'email', 'githubId', 'githubUsername', 'role', 'userId']
    );
  });
});

// ── Success: db.query call shape ──────────────────────────────────────────────

describe('upsertUser — success: db.query call shape', () => {
  it('calls db.query exactly once', async () => {
    await upsertUser(validArgs());
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });

  it('SQL is an INSERT INTO users statement', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/INSERT INTO users/i);
  });

  it('SQL uses ON CONFLICT (github_id)', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/ON CONFLICT\s*\(\s*github_id\s*\)/i);
  });

  it('SQL has a DO UPDATE SET clause', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/DO UPDATE\s+SET/i);
  });

  it('SQL uses RETURNING *', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/RETURNING \*/i);
  });

  it('passes githubId as the first query parameter', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[0]).toBe(GITHUB_ID);
  });

  it('passes githubUsername as the second query parameter', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[1]).toBe(GITHUB_USERNAME);
  });

  it('passes email as the third query parameter', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[2]).toBe(EMAIL);
  });

  it('passes defaultRole as the fourth query parameter', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[3]).toBe(DEFAULT_ROLE);
  });

  it('passes now as the sixth query parameter (used for created_at and updated_at)', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[5]).toBe(NOW);
  });

  it('query has exactly six parameters (includes accessTokenEnc)', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params).toHaveLength(6);
  });

  it('passes null accessTokenEnc as the fifth parameter when omitted', async () => {
    await upsertUser(validArgs());
    const params = mockDb.query.mock.calls[0][1];
    expect(params[4]).toBeNull();
  });
});

// ── Success: role is never overwritten on conflict ────────────────────────────

describe('upsertUser — success: existing role is preserved on conflict', () => {
  it('SQL does not set role = EXCLUDED.role in the DO UPDATE clause', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).not.toMatch(/role\s*=\s*EXCLUDED\.role/i);
  });

  it('SQL does not mention role anywhere in the DO UPDATE SET block', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    // Split on DO UPDATE SET and inspect only the update block
    const updateBlock = sql.split(/DO UPDATE\s+SET/i)[1];
    expect(updateBlock).not.toMatch(/\brole\b/i);
  });

  it('returns the role from the DB row, not defaultRole, when the DB has a different role', async () => {
    const existingRole = 'project_manager';
    mockDb.query.mockResolvedValue({
      rows: [{ ...MOCK_ROW, role: existingRole }],
    });
    const result = await upsertUser(validArgs({ defaultRole: 'intern' }));
    expect(result.role).toBe(existingRole);
    expect(result.role).not.toBe('intern');
  });
});

// ── Success: soft-deleted user is restored ────────────────────────────────────

describe('upsertUser — success: soft-deleted user is restored', () => {
  it('SQL sets deleted_at = NULL in the DO UPDATE clause', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    expect(sql).toMatch(/deleted_at\s*=\s*NULL/i);
  });

  it('returns deletedAt = null when the DB row has deleted_at = null', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ ...MOCK_ROW, deleted_at: null }],
    });
    const result = await upsertUser(validArgs());
    expect(result.deletedAt).toBeNull();
  });

  it('still calls db.query once whether the user was soft-deleted or not', async () => {
    await upsertUser(validArgs());
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

// ── Success: new user insert ──────────────────────────────────────────────────

describe('upsertUser — success: new user insert', () => {
  it('returns the row returned by RETURNING * as the normalized object', async () => {
    const result = await upsertUser(validArgs());
    expect(result).toMatchObject({
      userId:         MOCK_ROW.id,
      githubId:       MOCK_ROW.github_id,
      githubUsername: MOCK_ROW.github_username,
      email:          MOCK_ROW.email,
      role:           MOCK_ROW.role,
      createdAt:      MOCK_ROW.created_at,
      deletedAt:      MOCK_ROW.deleted_at,
    });
  });

  it('SQL inserts deleted_at as NULL for new users', async () => {
    await upsertUser(validArgs());
    const sql = mockDb.query.mock.calls[0][0];
    // The VALUES clause sets deleted_at to the literal NULL
    expect(sql).toMatch(/VALUES\s*\(.*NULL.*\)/is);
  });
});

// ── Success: githubId as string ───────────────────────────────────────────────

describe('upsertUser — success: githubId as string', () => {
  it('accepts githubId as a numeric string', async () => {
    const result = await upsertUser(validArgs({ githubId: '12345' }));
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(result.userId).toBe(MOCK_ROW.id);
  });

  it('passes the string githubId as the first query parameter', async () => {
    await upsertUser(validArgs({ githubId: '99999' }));
    const params = mockDb.query.mock.calls[0][1];
    expect(params[0]).toBe('99999');
  });
});

// ── Success: githubId as number ───────────────────────────────────────────────

describe('upsertUser — success: githubId as number', () => {
  it('accepts githubId as a positive integer', async () => {
    const result = await upsertUser(validArgs({ githubId: 42 }));
    expect(mockDb.query).toHaveBeenCalledTimes(1);
    expect(result.userId).toBe(MOCK_ROW.id);
  });

  it('passes the numeric githubId as the first query parameter', async () => {
    await upsertUser(validArgs({ githubId: 42 }));
    const params = mockDb.query.mock.calls[0][1];
    expect(params[0]).toBe(42);
  });

  it('accepts githubId of 1 (smallest positive integer)', async () => {
    await upsertUser(validArgs({ githubId: 1 }));
    expect(mockDb.query).toHaveBeenCalledTimes(1);
  });
});

// ── Success: email null ───────────────────────────────────────────────────────

describe('upsertUser — success: email = null', () => {
  it('accepts null email without throwing', async () => {
    await expect(upsertUser(validArgs({ email: null }))).resolves.toBeDefined();
  });

  it('passes null as the third query parameter when email is null', async () => {
    await upsertUser(validArgs({ email: null }));
    const params = mockDb.query.mock.calls[0][1];
    expect(params[2]).toBeNull();
  });

  it('returns null for email in the normalized object when DB row has null email', async () => {
    mockDb.query.mockResolvedValue({
      rows: [{ ...MOCK_ROW, email: null }],
    });
    const result = await upsertUser(validArgs({ email: null }));
    expect(result.email).toBeNull();
  });
});

// ── INVALID_DB ────────────────────────────────────────────────────────────────

describe('upsertUser — INVALID_DB', () => {
  const cases = [
    ['null',                    null],
    ['undefined',               undefined],
    ['object without .query',   { notQuery: true }],
    ['a string',                'not-a-db'],
    ['a number',                42],
  ];

  cases.forEach(([label, db]) => {
    it(`throws INVALID_DB when db is ${label}`, async () => {
      await expect(upsertUser(validArgs({ db }))).rejects.toMatchObject({
        code:    'INVALID_DB',
        message: 'db must be a valid database pool',
      });
    });

    it(`does not call db.query when db is ${label}`, async () => {
      try { await upsertUser(validArgs({ db })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── INVALID_GITHUB_ID ─────────────────────────────────────────────────────────

describe('upsertUser — INVALID_GITHUB_ID', () => {
  // typeof !== 'string' and typeof !== 'number' (both left sides false, right side false)
  const nonStringNonNumberCases = [
    ['null',      null],
    ['undefined', undefined],
    ['an object', { id: 1 }],
    ['a boolean', true],
  ];

  nonStringNonNumberCases.forEach(([label, githubId]) => {
    it(`throws INVALID_GITHUB_ID when githubId is ${label}`, async () => {
      await expect(upsertUser(validArgs({ githubId }))).rejects.toMatchObject({
        code:    'INVALID_GITHUB_ID',
        message: 'githubId must be a non-empty string or finite number',
      });
    });

    it(`does not call db.query when githubId is ${label}`, async () => {
      try { await upsertUser(validArgs({ githubId })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  // String IS provided, but fails the non-empty check (right side of string &&)
  it('throws INVALID_GITHUB_ID when githubId is an empty string', async () => {
    await expect(upsertUser(validArgs({ githubId: '' }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_ID',
    });
  });

  it('throws INVALID_GITHUB_ID when githubId is whitespace-only', async () => {
    await expect(upsertUser(validArgs({ githubId: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_ID',
    });
  });

  // Number IS provided, but fails Number.isFinite (right side of number &&)
  it('throws INVALID_GITHUB_ID when githubId is NaN', async () => {
    await expect(upsertUser(validArgs({ githubId: NaN }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_ID',
    });
  });

  it('throws INVALID_GITHUB_ID when githubId is Infinity', async () => {
    await expect(upsertUser(validArgs({ githubId: Infinity }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_ID',
    });
  });
});

// ── INVALID_GITHUB_USERNAME ───────────────────────────────────────────────────

describe('upsertUser — INVALID_GITHUB_USERNAME', () => {
  // typeof !== 'string' (left side of ||)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  7],
  ];

  nonStringCases.forEach(([label, githubUsername]) => {
    it(`throws INVALID_GITHUB_USERNAME when githubUsername is ${label}`, async () => {
      await expect(upsertUser(validArgs({ githubUsername }))).rejects.toMatchObject({
        code:    'INVALID_GITHUB_USERNAME',
        message: 'githubUsername must be a non-empty string',
      });
    });

    it(`does not call db.query when githubUsername is ${label}`, async () => {
      try { await upsertUser(validArgs({ githubUsername })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  // IS a string but empty (right side of ||)
  it('throws INVALID_GITHUB_USERNAME when githubUsername is an empty string', async () => {
    await expect(upsertUser(validArgs({ githubUsername: '' }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_USERNAME',
    });
  });

  it('throws INVALID_GITHUB_USERNAME when githubUsername is whitespace-only', async () => {
    await expect(upsertUser(validArgs({ githubUsername: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_GITHUB_USERNAME',
    });
  });
});

// ── INVALID_EMAIL ─────────────────────────────────────────────────────────────

describe('upsertUser — INVALID_EMAIL', () => {
  // email !== null (left side of outer &&) is true, and typeof email !== 'string' (inner left) is true
  const nonStringNonNullCases = [
    ['undefined', undefined],
    ['a number',  0],
    ['a boolean', false],
    ['an object', {}],
  ];

  nonStringNonNullCases.forEach(([label, email]) => {
    it(`throws INVALID_EMAIL when email is ${label}`, async () => {
      await expect(upsertUser(validArgs({ email }))).rejects.toMatchObject({
        code:    'INVALID_EMAIL',
        message: 'email must be null or a non-empty string',
      });
    });

    it(`does not call db.query when email is ${label}`, async () => {
      try { await upsertUser(validArgs({ email })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  // email IS a string but fails the non-empty check (inner right side)
  it('throws INVALID_EMAIL when email is an empty string', async () => {
    await expect(upsertUser(validArgs({ email: '' }))).rejects.toMatchObject({
      code: 'INVALID_EMAIL',
    });
  });

  it('throws INVALID_EMAIL when email is whitespace-only', async () => {
    await expect(upsertUser(validArgs({ email: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_EMAIL',
    });
  });
});

// ── INVALID_DEFAULT_ROLE ──────────────────────────────────────────────────────

describe('upsertUser — INVALID_DEFAULT_ROLE', () => {
  // typeof !== 'string' (left side)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  3],
  ];

  nonStringCases.forEach(([label, defaultRole]) => {
    it(`throws INVALID_DEFAULT_ROLE when defaultRole is ${label}`, async () => {
      await expect(upsertUser(validArgs({ defaultRole }))).rejects.toMatchObject({
        code:    'INVALID_DEFAULT_ROLE',
        message: 'defaultRole must be a non-empty string',
      });
    });

    it(`does not call db.query when defaultRole is ${label}`, async () => {
      try { await upsertUser(validArgs({ defaultRole })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });

  // IS a string but empty (right side)
  it('throws INVALID_DEFAULT_ROLE when defaultRole is an empty string', async () => {
    await expect(upsertUser(validArgs({ defaultRole: '' }))).rejects.toMatchObject({
      code: 'INVALID_DEFAULT_ROLE',
    });
  });

  it('throws INVALID_DEFAULT_ROLE when defaultRole is whitespace-only', async () => {
    await expect(upsertUser(validArgs({ defaultRole: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_DEFAULT_ROLE',
    });
  });
});

// ── INVALID_NOW ───────────────────────────────────────────────────────────────

describe('upsertUser — INVALID_NOW', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a string',        '2024-01-01'],
    ['a raw number',    Date.now()],
    ['an invalid Date', new Date('not-a-date')],
  ];

  cases.forEach(([label, now]) => {
    it(`throws INVALID_NOW when now is ${label}`, async () => {
      await expect(upsertUser(validArgs({ now }))).rejects.toMatchObject({
        code:    'INVALID_NOW',
        message: 'now must be a valid Date object',
      });
    });

    it(`does not call db.query when now is ${label}`, async () => {
      try { await upsertUser(validArgs({ now })); } catch (_) {}
      expect(mockDb.query).not.toHaveBeenCalled();
    });
  });
});

// ── Validation ordering ───────────────────────────────────────────────────────

describe('upsertUser — validation ordering', () => {
  it('throws INVALID_DB before INVALID_GITHUB_ID when both are invalid', async () => {
    let caught;
    try { await upsertUser(validArgs({ db: null, githubId: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_DB');
  });

  it('throws INVALID_GITHUB_ID before INVALID_GITHUB_USERNAME when both are invalid', async () => {
    let caught;
    try { await upsertUser(validArgs({ githubId: null, githubUsername: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_GITHUB_ID');
  });

  it('throws INVALID_GITHUB_USERNAME before INVALID_EMAIL when both are invalid', async () => {
    let caught;
    try { await upsertUser(validArgs({ githubUsername: null, email: 42 })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_GITHUB_USERNAME');
  });

  it('throws INVALID_EMAIL before INVALID_DEFAULT_ROLE when both are invalid', async () => {
    let caught;
    try { await upsertUser(validArgs({ email: 42, defaultRole: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_EMAIL');
  });

  it('throws INVALID_DEFAULT_ROLE before INVALID_NOW when both are invalid', async () => {
    let caught;
    try { await upsertUser(validArgs({ defaultRole: null, now: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_DEFAULT_ROLE');
  });

  it('throws INVALID_DB when called with no arguments', async () => {
    await expect(upsertUser()).rejects.toMatchObject({ code: 'INVALID_DB' });
  });
});

// ── DB error propagation ──────────────────────────────────────────────────────

describe('upsertUser — database error propagation', () => {
  it('propagates errors thrown by db.query', async () => {
    const dbErr = new Error('connection refused');
    mockDb.query.mockRejectedValue(dbErr);
    await expect(upsertUser(validArgs())).rejects.toThrow('connection refused');
  });

  it('does not swallow the original db error object', async () => {
    const dbErr = new Error('unique constraint violation');
    mockDb.query.mockRejectedValue(dbErr);
    await expect(upsertUser(validArgs())).rejects.toBe(dbErr);
  });
});
