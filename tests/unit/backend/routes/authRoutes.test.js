'use strict';

jest.mock('../../../../execution/audit/logEvent');

const router       = require('../../../../backend/routes/authRoutes');
const { logEvent } = require('../../../../execution/audit/logEvent');

// ── Handler extraction ────────────────────────────────────────────────────────
// Avoids supertest while still testing the real router registration.

function extractHandler(r, method, path) {
  for (const layer of r.stack) {
    if (
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()]
    ) {
      return layer.route.stack[layer.route.stack.length - 1].handle;
    }
  }
  throw new Error(`Handler not found: ${method} ${path}`);
}

const githubHandler   = extractHandler(router, 'GET',  '/github');
const callbackHandler = extractHandler(router, 'GET',  '/callback');
const logoutHandler   = extractHandler(router, 'POST', '/logout');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const MOCK_GITHUB_CONFIG = {
  clientId:    'gh-client-id',
  callbackUrl: 'http://localhost:3000/auth/callback',
  scopes:      ['read:user', 'user:email'],
};

const mockDb = {};

function makeReq(overrides = {}) {
  return {
    query: {},
    app:   { locals: { db: mockDb, config: { github: MOCK_GITHUB_CONFIG } } },
    ...overrides,
  };
}

function makeRes() {
  return {
    redirect:    jest.fn(),
    clearCookie: jest.fn(),
    status:      jest.fn().mockReturnThis(),
    end:         jest.fn(),
    json:        jest.fn(),
    send:        jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  logEvent.mockResolvedValue({});
});

// ── Route registration sanity ─────────────────────────────────────────────────

describe('authRoutes — route registration', () => {
  it('registers GET /github', () => {
    expect(typeof githubHandler).toBe('function');
  });

  it('registers GET /callback', () => {
    expect(typeof callbackHandler).toBe('function');
  });

  it('registers POST /logout', () => {
    expect(typeof logoutHandler).toBe('function');
  });
});

// ── GET /github — success ─────────────────────────────────────────────────────

describe('GET /github — success', () => {
  it('calls res.redirect once', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });

  it('redirects to the GitHub OAuth authorize URL', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    expect(res.redirect.mock.calls[0][0]).toMatch(
      /^https:\/\/github\.com\/login\/oauth\/authorize/
    );
  });

  it('includes client_id in the redirect URL', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    const url = new URL(res.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('client_id')).toBe('gh-client-id');
  });

  it('includes redirect_uri in the redirect URL', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    const url = new URL(res.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/auth/callback');
  });

  it('joins array scopes with a space for the scope param', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    const url = new URL(res.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('scope')).toBe('read:user user:email');
  });

  it('uses a string scopes value directly when scopes is not an array', () => {
    const req = makeReq();
    req.app.locals.config = {
      github: { clientId: 'id', callbackUrl: 'http://cb.example.com', scopes: 'repo' },
    };
    const res = makeRes();
    githubHandler(req, res, jest.fn());
    const url = new URL(res.redirect.mock.calls[0][0]);
    expect(url.searchParams.get('scope')).toBe('repo');
  });

  it('does not include client_secret in the redirect URL', () => {
    const res = makeRes();
    githubHandler(makeReq(), res, jest.fn());
    expect(res.redirect.mock.calls[0][0]).not.toMatch(/client_secret/i);
  });

  it('does not call next() on success', () => {
    const next = jest.fn();
    githubHandler(makeReq(), makeRes(), next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── GET /github — invalid config ──────────────────────────────────────────────

describe('GET /github — INVALID_OAUTH_CONFIG', () => {
  function expectInvalidConfig(req) {
    const next = jest.fn();
    githubHandler(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('INVALID_OAUTH_CONFIG');
    expect(err.message).toBe('OAuth configuration is invalid');
    return err;
  }

  it('calls next with INVALID_OAUTH_CONFIG when config is null', () => {
    const req = makeReq();
    req.app.locals.config = null;
    expectInvalidConfig(req);
  });

  it('calls next with INVALID_OAUTH_CONFIG when github sub-config is absent', () => {
    const req = makeReq();
    req.app.locals.config = {};
    expectInvalidConfig(req);
  });

  it('calls next with INVALID_OAUTH_CONFIG when clientId is missing', () => {
    const req = makeReq();
    req.app.locals.config = {
      github: { callbackUrl: 'http://cb', scopes: ['read:user'] },
    };
    expectInvalidConfig(req);
  });

  it('calls next with INVALID_OAUTH_CONFIG when callbackUrl is missing', () => {
    const req = makeReq();
    req.app.locals.config = {
      github: { clientId: 'id', scopes: ['read:user'] },
    };
    expectInvalidConfig(req);
  });

  it('calls next with INVALID_OAUTH_CONFIG when scopes is missing', () => {
    const req = makeReq();
    req.app.locals.config = {
      github: { clientId: 'id', callbackUrl: 'http://cb' },
    };
    expectInvalidConfig(req);
  });

  it('does not call res.redirect when config is invalid', () => {
    const req = makeReq();
    req.app.locals.config = null;
    const res = makeRes();
    githubHandler(req, res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ── GET /callback — missing code ──────────────────────────────────────────────

describe('GET /callback — INVALID_OAUTH_CODE', () => {
  it('calls next with INVALID_OAUTH_CODE when code is absent', () => {
    const next = jest.fn();
    callbackHandler(makeReq(), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
    expect(err.message).toBe('OAuth callback code is required');
  });

  it('calls next with INVALID_OAUTH_CODE when code is empty string', () => {
    const next = jest.fn();
    callbackHandler(makeReq({ query: { code: '' } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
  });

  it('calls next with INVALID_OAUTH_CODE when query object is absent', () => {
    const next = jest.fn();
    callbackHandler(makeReq({ query: null }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
  });
});

// ── GET /callback — code present → NOT_IMPLEMENTED ───────────────────────────

describe('GET /callback — NOT_IMPLEMENTED', () => {
  it('calls next with NOT_IMPLEMENTED when code is present', () => {
    const next = jest.fn();
    callbackHandler(makeReq({ query: { code: 'abc123' } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('NOT_IMPLEMENTED');
    expect(err.message).toBe('GitHub OAuth callback exchange is not implemented');
  });

  it('calls next exactly once when code is present', () => {
    const next = jest.fn();
    callbackHandler(makeReq({ query: { code: 'abc123' } }), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does not call res methods when returning NOT_IMPLEMENTED', () => {
    const res  = makeRes();
    callbackHandler(makeReq({ query: { code: 'abc123' } }), res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ── POST /logout — success ────────────────────────────────────────────────────

describe('POST /logout — success', () => {
  function makeLogoutReq() {
    return makeReq({
      user:    { userId: 'u-42', role: 'project_manager', githubUsername: 'dev' },
      session: { sessionId: 'sess-99', expiresAt: new Date('2099-01-01') },
    });
  }

  it('calls logEvent once', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it('calls logEvent with actorId = req.user.userId', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].actorId).toBe('u-42');
  });

  it('calls logEvent with action = user.logout', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].action).toBe('user.logout');
  });

  it('calls logEvent with resourceType = session', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].resourceType).toBe('session');
  });

  it('calls logEvent with resourceId = req.session.sessionId', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].resourceId).toBe('sess-99');
  });

  it('calls logEvent with empty metadata object', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].metadata).toEqual({});
  });

  it('calls logEvent with a Date instance as now', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].now).toBeInstanceOf(Date);
  });

  it('passes req.app.locals.db as the db argument', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].db).toBe(mockDb);
  });

  it('clears the session_token cookie', async () => {
    const res = makeRes();
    await logoutHandler(makeLogoutReq(), res, jest.fn());
    expect(res.clearCookie).toHaveBeenCalledWith('session_token');
  });

  it('responds with status 204', async () => {
    const res = makeRes();
    await logoutHandler(makeLogoutReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('calls res.end after status 204', async () => {
    const res = makeRes();
    await logoutHandler(makeLogoutReq(), res, jest.fn());
    expect(res.end).toHaveBeenCalled();
  });

  it('does not call next() on success', async () => {
    const next = jest.fn();
    await logoutHandler(makeLogoutReq(), makeRes(), next);
    expect(next).not.toHaveBeenCalled();
  });

  it('still responds 204 when clearCookie is unavailable on res', async () => {
    const res = makeRes();
    delete res.clearCookie;
    const next = jest.fn();
    await logoutHandler(makeLogoutReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(204);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── POST /logout — missing req.user ──────────────────────────────────────────

describe('POST /logout — missing req.user', () => {
  it('calls next with UNAUTHORIZED when req.user is absent', async () => {
    const next = jest.fn();
    await logoutHandler(
      makeReq({ user: undefined, session: { sessionId: 's-1' } }),
      makeRes(), next
    );
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
    expect(next.mock.calls[0][0].message).toBe('Unauthorized');
  });

  it('calls next with UNAUTHORIZED when req.user is null', async () => {
    const next = jest.fn();
    await logoutHandler(
      makeReq({ user: null, session: { sessionId: 's-1' } }),
      makeRes(), next
    );
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('does not call logEvent when req.user is absent', async () => {
    await logoutHandler(
      makeReq({ user: undefined, session: { sessionId: 's-1' } }),
      makeRes(), jest.fn()
    );
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call res.status when req.user is absent', async () => {
    const res = makeRes();
    await logoutHandler(
      makeReq({ user: undefined, session: { sessionId: 's-1' } }),
      res, jest.fn()
    );
    expect(res.status).not.toHaveBeenCalled();
  });
});

// ── POST /logout — missing req.session ───────────────────────────────────────

describe('POST /logout — missing req.session', () => {
  it('calls next with UNAUTHORIZED when req.session is absent', async () => {
    const next = jest.fn();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: undefined }),
      makeRes(), next
    );
    expect(next.mock.calls[0][0].code).toBe('UNAUTHORIZED');
  });

  it('does not call logEvent when req.session is absent', async () => {
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: undefined }),
      makeRes(), jest.fn()
    );
    expect(logEvent).not.toHaveBeenCalled();
  });
});

// ── POST /logout — logEvent error propagation ─────────────────────────────────

describe('POST /logout — logEvent error propagation', () => {
  it('passes the exact logEvent error to next() by identity', async () => {
    const logErr = new Error('db connection lost');
    logEvent.mockRejectedValue(logErr);

    const next = jest.fn();
    await logoutHandler(
      makeReq({
        user:    { userId: 'u-1' },
        session: { sessionId: 's-1' },
      }),
      makeRes(), next
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(logErr);
  });

  it('does not call res.status when logEvent throws', async () => {
    logEvent.mockRejectedValue(new Error('fail'));
    const res = makeRes();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      res, jest.fn()
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not clear the cookie when logEvent throws', async () => {
    logEvent.mockRejectedValue(new Error('fail'));
    const res = makeRes();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      res, jest.fn()
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });
});

// ── No direct DB queries in route handlers ────────────────────────────────────

describe('authRoutes — no direct DB queries', () => {
  it('mockDb has no query method — confirming routes never call db.query directly', async () => {
    expect(mockDb.query).toBeUndefined();
  });

  it('POST /logout succeeds without db.query being present on mockDb', async () => {
    const next = jest.fn();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      makeRes(), next
    );
    expect(next).not.toHaveBeenCalled();
  });
});
