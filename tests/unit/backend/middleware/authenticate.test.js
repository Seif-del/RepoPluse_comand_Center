'use strict';

jest.mock('../../../../execution/auth/validateSession');

const authenticate              = require('../../../../backend/middleware/authenticate');
const { validateSession }       = require('../../../../execution/auth/validateSession');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const MOCK_SESSION = {
  sessionId:      'sess-1',
  expiresAt:      new Date('2099-01-01T00:00:00.000Z'),
  userId:         'user-42',
  role:           'project_manager',
  githubUsername: 'seifi',
};

const mockDb = {};

function makeReq(overrides = {}) {
  return {
    headers:     {},
    cookies:     {},
    app:         { locals: { db: mockDb, config: { sessionExpiryHours: 24 } } },
    ...overrides,
  };
}

function makeRes() {
  return {
    json:   jest.fn(),
    send:   jest.fn(),
    status: jest.fn().mockReturnThis(),
    end:    jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  validateSession.mockResolvedValue(MOCK_SESSION);
});

// ── Success — Bearer token ────────────────────────────────────────────────────

describe('authenticate — Bearer token success', () => {
  it('calls validateSession with the extracted token', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession).toHaveBeenCalledTimes(1);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('tok123');
  });

  it('passes req.app.locals.db as the db argument', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].db).toBe(mockDb);
  });

  it('passes a Date instance as the now argument', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].now).toBeInstanceOf(Date);
  });

  it('sets req.session with sessionId and expiresAt', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(req.session).toEqual({
      sessionId: MOCK_SESSION.sessionId,
      expiresAt: MOCK_SESSION.expiresAt,
    });
  });

  it('sets req.user with userId, role, and githubUsername', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(req.user).toEqual({
      userId:         MOCK_SESSION.userId,
      role:           MOCK_SESSION.role,
      githubUsername: MOCK_SESSION.githubUsername,
    });
  });

  it('calls next() with no arguments on success', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('does not call any res method on success', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const res  = makeRes();
    await authenticate(req, res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── Success — cookie token ────────────────────────────────────────────────────

describe('authenticate — cookie token success', () => {
  it('calls validateSession with the cookie token when no Authorization header', async () => {
    const req  = makeReq({ cookies: { session_token: 'cookie-tok' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession).toHaveBeenCalledTimes(1);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('cookie-tok');
  });

  it('sets req.session correctly via cookie path', async () => {
    const req  = makeReq({ cookies: { session_token: 'cookie-tok' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(req.session).toEqual({
      sessionId: MOCK_SESSION.sessionId,
      expiresAt: MOCK_SESSION.expiresAt,
    });
  });

  it('sets req.user correctly via cookie path', async () => {
    const req  = makeReq({ cookies: { session_token: 'cookie-tok' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(req.user).toEqual({
      userId:         MOCK_SESSION.userId,
      role:           MOCK_SESSION.role,
      githubUsername: MOCK_SESSION.githubUsername,
    });
  });

  it('calls next() with no arguments via cookie path', async () => {
    const req  = makeReq({ cookies: { session_token: 'cookie-tok' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });
});

// ── Token source priority ─────────────────────────────────────────────────────

describe('authenticate — Authorization header takes priority over cookie', () => {
  it('uses the Bearer token, not the cookie, when both are present', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer header-tok' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('header-tok');
  });

  it('does not pass the cookie token when a valid Bearer token is present', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer header-tok' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).not.toBe('cookie-tok');
  });
});

// ── Missing token ─────────────────────────────────────────────────────────────

describe('authenticate — missing token', () => {
  it('calls next(err) with UNAUTHORIZED when no header and no cookie', async () => {
    const req  = makeReq();
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('does not call validateSession when token is absent', async () => {
    await authenticate(makeReq(), makeRes(), jest.fn());
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('calls next(err) when cookies object is absent entirely', async () => {
    const req  = makeReq({ cookies: undefined });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('calls next(err) when cookies object is present but has no session_token', async () => {
    const req  = makeReq({ cookies: { other_cookie: 'value' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('does not call any res method when token is missing', async () => {
    const res = makeRes();
    await authenticate(makeReq(), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── Malformed Authorization header ───────────────────────────────────────────

describe('authenticate — malformed Authorization header falls back to cookie', () => {
  it('falls back to cookie when scheme is not Bearer', async () => {
    const req = makeReq({
      headers: { authorization: 'Basic dXNlcjpwYXNz' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('cookie-tok');
  });

  it('treats non-Bearer header as missing when no cookie exists', async () => {
    const req  = makeReq({ headers: { authorization: 'Basic dXNlcjpwYXNz' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('UNAUTHORIZED');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('falls back to cookie when Bearer has no token part (single word)', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('cookie-tok');
  });

  it('treats single-word Bearer as missing when no cookie exists', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('UNAUTHORIZED');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('falls back to cookie when Bearer token part is empty string', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer ' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('cookie-tok');
  });

  it('treats empty Bearer token as missing when no cookie exists', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer ' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('UNAUTHORIZED');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('falls back to cookie when header has three parts (extra segment)', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer tok extra' },
      cookies: { session_token: 'cookie-tok' },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].rawToken).toBe('cookie-tok');
  });
});

// ── Error propagation ─────────────────────────────────────────────────────────

describe('authenticate — validateSession error propagation', () => {
  it('calls next(err) with the exact error thrown by validateSession', async () => {
    const sessionErr  = new Error('Unauthorized');
    sessionErr.code   = 'UNAUTHORIZED';
    validateSession.mockRejectedValue(sessionErr);

    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(sessionErr);
  });

  it('does not swallow arbitrary errors from validateSession', async () => {
    const dbErr = new Error('connection refused');
    validateSession.mockRejectedValue(dbErr);

    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(dbErr);
  });

  it('does not set req.session or req.user when validateSession throws', async () => {
    validateSession.mockRejectedValue(new Error('Unauthorized'));

    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.session).toBeUndefined();
    expect(req.user).toBeUndefined();
  });

  it('does not call any res method when validateSession throws', async () => {
    validateSession.mockRejectedValue(new Error('Unauthorized'));

    const res  = makeRes();
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    await authenticate(req, res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── sessionExpiryHours passthrough ───────────────────────────────────────────

describe('authenticate — sessionExpiryHours passthrough', () => {
  it('passes sessionExpiryHours from req.app.locals.config to validateSession', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok123' } });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].sessionExpiryHours).toBe(24);
  });

  it('passes a custom sessionExpiryHours value through exactly', async () => {
    const req = makeReq({
      headers: { authorization: 'Bearer tok123' },
      app:     { locals: { db: mockDb, config: { sessionExpiryHours: 8 } } },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(validateSession.mock.calls[0][0].sessionExpiryHours).toBe(8);
  });

  it('propagates INVALID_SESSION_EXPIRY_HOURS error by identity when sessionExpiryHours is absent', async () => {
    const expiryErr  = new Error('sessionExpiryHours must be a positive number');
    expiryErr.code   = 'INVALID_SESSION_EXPIRY_HOURS';
    validateSession.mockRejectedValue(expiryErr);

    const req = makeReq({
      headers: { authorization: 'Bearer tok123' },
      app:     { locals: { db: mockDb, config: {} } },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(expiryErr);
  });

  it('propagates error by identity when config is null', async () => {
    const expiryErr  = new Error('sessionExpiryHours must be a positive number');
    expiryErr.code   = 'INVALID_SESSION_EXPIRY_HOURS';
    validateSession.mockRejectedValue(expiryErr);

    const req = makeReq({
      headers: { authorization: 'Bearer tok123' },
      app:     { locals: { db: mockDb, config: null } },
    });
    const next = jest.fn();
    await authenticate(req, makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(expiryErr);
  });
});

// ── req.session and req.user shapes ──────────────────────────────────────────

describe('authenticate — output shape', () => {
  it('req.session has exactly sessionId and expiresAt (no extra keys)', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(Object.keys(req.session).sort()).toEqual(['expiresAt', 'sessionId']);
  });

  it('req.user has exactly userId, role, and githubUsername (no extra keys)', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(Object.keys(req.user).sort()).toEqual(['githubUsername', 'role', 'userId']);
  });

  it('req.session.sessionId matches session.sessionId', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.session.sessionId).toBe(MOCK_SESSION.sessionId);
  });

  it('req.session.expiresAt matches session.expiresAt', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.session.expiresAt).toBe(MOCK_SESSION.expiresAt);
  });

  it('req.user.userId matches session.userId', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.user.userId).toBe(MOCK_SESSION.userId);
  });

  it('req.user.role matches session.role', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.user.role).toBe(MOCK_SESSION.role);
  });

  it('req.user.githubUsername matches session.githubUsername', async () => {
    const req  = makeReq({ headers: { authorization: 'Bearer tok' } });
    await authenticate(req, makeRes(), jest.fn());
    expect(req.user.githubUsername).toBe(MOCK_SESSION.githubUsername);
  });
});
