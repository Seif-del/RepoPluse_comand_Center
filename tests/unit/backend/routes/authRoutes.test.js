'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/audit/logEvent');
jest.mock('../../../../execution/auth/exchangeOAuthCode');
jest.mock('../../../../execution/auth/upsertUser');
jest.mock('../../../../execution/auth/createSession');
jest.mock('../../../../execution/auth/invalidateSession');

// randomBytes returns a fixed 32-byte buffer so the derived token is deterministic.
// The hex representation of Buffer.from('cafebabe'.repeat(8), 'hex') is 'cafebabe'.repeat(8).
jest.mock('crypto', () => ({
  ...jest.requireActual('crypto'),
  randomBytes: jest.fn(() =>
    Buffer.from(
      'cafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe',
      'hex'
    )
  ),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const router                    = require('../../../../backend/routes/authRoutes');
const { logEvent }              = require('../../../../execution/audit/logEvent');
const { exchangeOAuthCode }     = require('../../../../execution/auth/exchangeOAuthCode');
const { upsertUser }            = require('../../../../execution/auth/upsertUser');
const { createSession }         = require('../../../../execution/auth/createSession');
const { invalidateSession }     = require('../../../../execution/auth/invalidateSession');
const crypto                    = require('crypto');

// ── Handler extraction ────────────────────────────────────────────────────────

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

// The deterministic raw token produced by the mocked crypto.randomBytes(32).toString('hex').
const MOCK_RAW_TOKEN = 'cafebabe'.repeat(8);

const MOCK_GITHUB_CONFIG = {
  clientId:     'gh-client-id',
  clientSecret: 'gh-client-secret',
  callbackUrl:  'http://localhost:3000/auth/callback',
  scopes:       ['read:user', 'user:email'],
};

const MOCK_APP_CONFIG = {
  github:               MOCK_GITHUB_CONFIG,
  sessionExpiryHours:   24,
  defaultUserRole:      'intern',
  postLoginRedirectPath: '/dashboard',
};

const MOCK_OAUTH_RESULT = {
  accessToken:    'gho_test_access_token',
  githubId:       12345,
  githubUsername: 'octocat',
  email:          'octocat@github.com',
};

const MOCK_USER = {
  userId:         'u-42',
  githubId:       12345,
  githubUsername: 'octocat',
  email:          'octocat@github.com',
  role:           'intern',
  createdAt:      new Date('2024-01-01T00:00:00.000Z'),
  deletedAt:      null,
};

// createSession returns the raw DB row — id (not sessionId) is the session PK.
const MOCK_SESSION = {
  id:             's-99',
  user_id:        'u-42',
  token_hash:     'abcd'.repeat(16),
  created_at:     new Date('2024-01-01T00:00:00.000Z'),
  last_active_at: new Date('2024-01-01T00:00:00.000Z'),
  expires_at:     new Date('2024-01-02T00:00:00.000Z'),
};

const mockDb      = {};
const mockFetchFn = jest.fn();

function makeReq(overrides = {}) {
  return {
    query: {},
    app:   {
      locals: {
        db:      mockDb,
        config:  MOCK_APP_CONFIG,
        fetchFn: mockFetchFn,
      },
    },
    ...overrides,
  };
}

function makeRes() {
  return {
    redirect:    jest.fn(),
    clearCookie: jest.fn(),
    cookie:      jest.fn(),
    status:      jest.fn().mockReturnThis(),
    end:         jest.fn(),
    json:        jest.fn(),
    send:        jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  logEvent.mockResolvedValue({});
  exchangeOAuthCode.mockResolvedValue(MOCK_OAUTH_RESULT);
  upsertUser.mockResolvedValue(MOCK_USER);
  createSession.mockResolvedValue(MOCK_SESSION);
  invalidateSession.mockResolvedValue({ invalidated: true });
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

// ── GET /callback — INVALID_OAUTH_CODE ───────────────────────────────────────

describe('GET /callback — INVALID_OAUTH_CODE', () => {
  it('calls next with INVALID_OAUTH_CODE when code is absent', async () => {
    const next = jest.fn();
    await callbackHandler(makeReq(), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
    expect(err.message).toBe('OAuth callback code is required');
  });

  it('calls next with INVALID_OAUTH_CODE when code is empty string', async () => {
    const next = jest.fn();
    await callbackHandler(makeReq({ query: { code: '' } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
  });

  it('calls next with INVALID_OAUTH_CODE when query object is absent', async () => {
    const next = jest.fn();
    await callbackHandler(makeReq({ query: null }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CODE');
  });
});

// ── GET /callback — INVALID_OAUTH_CONFIG (callback-specific config check) ─────

describe('GET /callback — INVALID_OAUTH_CONFIG', () => {
  async function expectCallbackInvalidConfig(req) {
    const next = jest.fn();
    await callbackHandler(req, makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('INVALID_OAUTH_CONFIG');
    expect(err.message).toBe('OAuth configuration is invalid');
    return err;
  }

  // !github (left-most OR sub-condition)
  it('calls next with INVALID_OAUTH_CONFIG when config is null', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = null;
    await expectCallbackInvalidConfig(req);
  });

  it('calls next with INVALID_OAUTH_CONFIG when github sub-config is absent', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = { sessionExpiryHours: 24, defaultUserRole: 'intern' };
    await expectCallbackInvalidConfig(req);
  });

  // !github.clientId (second OR sub-condition)
  it('calls next with INVALID_OAUTH_CONFIG when clientId is missing', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = {
      ...MOCK_APP_CONFIG,
      github: { clientSecret: 'sec', callbackUrl: 'http://cb' },
    };
    await expectCallbackInvalidConfig(req);
  });

  // !github.clientSecret (third OR sub-condition)
  it('calls next with INVALID_OAUTH_CONFIG when clientSecret is missing', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = {
      ...MOCK_APP_CONFIG,
      github: { clientId: 'id', callbackUrl: 'http://cb' },
    };
    await expectCallbackInvalidConfig(req);
  });

  // !github.callbackUrl (fourth OR sub-condition)
  it('calls next with INVALID_OAUTH_CONFIG when callbackUrl is missing', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = {
      ...MOCK_APP_CONFIG,
      github: { clientId: 'id', clientSecret: 'sec' },
    };
    await expectCallbackInvalidConfig(req);
  });

  // !appConfig.sessionExpiryHours (fifth OR sub-condition)
  it('calls next with INVALID_OAUTH_CONFIG when sessionExpiryHours is missing', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = {
      github:          MOCK_GITHUB_CONFIG,
      defaultUserRole: 'intern',
    };
    await expectCallbackInvalidConfig(req);
  });

  // !appConfig.defaultUserRole (sixth OR sub-condition — last term)
  it('calls next with INVALID_OAUTH_CONFIG when defaultUserRole is missing', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = {
      github:             MOCK_GITHUB_CONFIG,
      sessionExpiryHours: 24,
    };
    await expectCallbackInvalidConfig(req);
  });

  it('does not call exchangeOAuthCode when config is invalid', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = null;
    await callbackHandler(req, makeRes(), jest.fn());
    expect(exchangeOAuthCode).not.toHaveBeenCalled();
  });

  it('does not call res.redirect when config is invalid', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = null;
    const res = makeRes();
    await callbackHandler(req, res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ── GET /callback — FETCH_NOT_AVAILABLE ───────────────────────────────────────

describe('GET /callback — FETCH_NOT_AVAILABLE', () => {
  it('calls next with FETCH_NOT_AVAILABLE when fetchFn and global fetch are both absent', async () => {
    const savedFetch = globalThis.fetch;
    delete globalThis.fetch;
    try {
      const req = makeReq({ query: { code: 'abc' } });
      delete req.app.locals.fetchFn;
      const next = jest.fn();
      await callbackHandler(req, makeRes(), next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0].code).toBe('FETCH_NOT_AVAILABLE');
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('does not call exchangeOAuthCode when fetchFn is unavailable', async () => {
    const savedFetch = globalThis.fetch;
    delete globalThis.fetch;
    try {
      const req = makeReq({ query: { code: 'abc' } });
      delete req.app.locals.fetchFn;
      await callbackHandler(req, makeRes(), jest.fn());
      expect(exchangeOAuthCode).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = savedFetch;
    }
  });

  it('uses globalThis.fetch when req.app.locals.fetchFn is absent but global fetch is available', async () => {
    // Node 18+ always has globalThis.fetch; this test documents the fallback path.
    const req = makeReq({ query: { code: 'abc' } });
    delete req.app.locals.fetchFn;
    await callbackHandler(req, makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].fetchFn).toBe(globalThis.fetch);
  });
});

// ── GET /callback — success: execution module call arguments ──────────────────

describe('GET /callback — success: execution module arguments', () => {
  function makeCallbackReq() {
    return makeReq({ query: { code: 'gh_code_abc123' } });
  }

  it('calls exchangeOAuthCode with the authorization code', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].code).toBe('gh_code_abc123');
  });

  it('calls exchangeOAuthCode with clientId from config', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].clientId).toBe(MOCK_GITHUB_CONFIG.clientId);
  });

  it('calls exchangeOAuthCode with clientSecret from config', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].clientSecret).toBe(MOCK_GITHUB_CONFIG.clientSecret);
  });

  it('calls exchangeOAuthCode with callbackUrl from config', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].callbackUrl).toBe(MOCK_GITHUB_CONFIG.callbackUrl);
  });

  it('calls exchangeOAuthCode with fetchFn from req.app.locals', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(exchangeOAuthCode.mock.calls[0][0].fetchFn).toBe(mockFetchFn);
  });

  it('calls upsertUser with githubId from oauth result', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].githubId).toBe(MOCK_OAUTH_RESULT.githubId);
  });

  it('calls upsertUser with githubUsername from oauth result', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].githubUsername).toBe(MOCK_OAUTH_RESULT.githubUsername);
  });

  it('calls upsertUser with email from oauth result', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].email).toBe(MOCK_OAUTH_RESULT.email);
  });

  it('calls upsertUser with defaultRole from config', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].defaultRole).toBe(MOCK_APP_CONFIG.defaultUserRole);
  });

  it('calls upsertUser with db from req.app.locals', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].db).toBe(mockDb);
  });

  it('calls upsertUser with a Date instance for now', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].now).toBeInstanceOf(Date);
  });

  it('calls createSession with the generated rawToken', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(createSession.mock.calls[0][0].rawToken).toBe(MOCK_RAW_TOKEN);
  });

  it('calls createSession with userId from upserted user', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(createSession.mock.calls[0][0].userId).toBe(MOCK_USER.userId);
  });

  it('calls createSession with sessionExpiryHours from config', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(createSession.mock.calls[0][0].sessionExpiryHours).toBe(MOCK_APP_CONFIG.sessionExpiryHours);
  });

  it('calls createSession with db from req.app.locals', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(createSession.mock.calls[0][0].db).toBe(mockDb);
  });

  it('calls crypto.randomBytes with 32 to generate the raw token', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(crypto.randomBytes).toHaveBeenCalledWith(32);
  });

  it('upsertUser and createSession receive the same now instance', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(upsertUser.mock.calls[0][0].now).toBe(createSession.mock.calls[0][0].now);
  });

  it('createSession and logEvent receive the same now instance', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    expect(createSession.mock.calls[0][0].now).toBe(logEvent.mock.calls[0][0].now);
  });
});

// ── GET /callback — success: session cookie ───────────────────────────────────

describe('GET /callback — success: session cookie', () => {
  function makeCallbackReq() {
    return makeReq({ query: { code: 'gh_code_abc123' } });
  }

  it('sets the session_token cookie', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(res.cookie.mock.calls[0][0]).toBe('session_token');
  });

  it('cookie value equals the generated rawToken', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    expect(res.cookie.mock.calls[0][1]).toBe(MOCK_RAW_TOKEN);
  });

  it('cookie has httpOnly: true', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    expect(res.cookie.mock.calls[0][2].httpOnly).toBe(true);
  });

  it('cookie has sameSite: lax', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    expect(res.cookie.mock.calls[0][2].sameSite).toBe('lax');
  });

  it('cookie has secure: false for local Phase 2 config', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    expect(res.cookie.mock.calls[0][2].secure).toBe(false);
  });
});

// ── GET /callback — success: logEvent audit ───────────────────────────────────

describe('GET /callback — success: logEvent', () => {
  function makeCallbackReq() {
    return makeReq({ query: { code: 'gh_code_abc123' } });
  }

  it('calls logEvent once', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve(); // drain microtask queue
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it('logEvent action is user.login', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].action).toBe('user.login');
  });

  it('logEvent resourceType is session', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].resourceType).toBe('session');
  });

  it('logEvent resourceId is session.id from the created session row', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].resourceId).toBe(MOCK_SESSION.id);
  });

  it('logEvent actorId is user.userId', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].actorId).toBe(MOCK_USER.userId);
  });

  it('logEvent metadata contains githubUsername', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].metadata).toEqual(
      { githubUsername: MOCK_USER.githubUsername }
    );
  });

  it('logEvent receives db from req.app.locals', async () => {
    await callbackHandler(makeCallbackReq(), makeRes(), jest.fn());
    await Promise.resolve();
    expect(logEvent.mock.calls[0][0].db).toBe(mockDb);
  });

  it('logEvent rejection does not block the redirect (fire-and-forget)', async () => {
    logEvent.mockRejectedValueOnce(new Error('db error'));
    const res  = makeRes();
    const next = jest.fn();
    await callbackHandler(makeCallbackReq(), res, next);
    await Promise.resolve(); // drain rejection handler
    expect(res.redirect).toHaveBeenCalledTimes(1);
  });

  it('next() is not called when logEvent rejects (fire-and-forget)', async () => {
    logEvent.mockRejectedValueOnce(new Error('db error'));
    const next = jest.fn();
    await callbackHandler(makeCallbackReq(), makeRes(), next);
    await Promise.resolve();
    expect(next).not.toHaveBeenCalled();
  });
});

// ── GET /callback — success: redirect ────────────────────────────────────────

describe('GET /callback — success: redirect', () => {
  it('redirects to postLoginRedirectPath from config', async () => {
    const res = makeRes();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith(MOCK_APP_CONFIG.postLoginRedirectPath);
  });

  it('redirects to /dashboard when postLoginRedirectPath is absent', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = { ...MOCK_APP_CONFIG, postLoginRedirectPath: undefined };
    const res = makeRes();
    await callbackHandler(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('redirects to a custom path when config provides one', async () => {
    const req = makeReq({ query: { code: 'abc' } });
    req.app.locals.config = { ...MOCK_APP_CONFIG, postLoginRedirectPath: '/home' };
    const res = makeRes();
    await callbackHandler(req, res, jest.fn());
    expect(res.redirect).toHaveBeenCalledWith('/home');
  });

  it('does not call next() on successful callback', async () => {
    const next = jest.fn();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), next);
    expect(next).not.toHaveBeenCalled();
  });
});

// ── GET /callback — exchangeOAuthCode error propagation ───────────────────────

describe('GET /callback — exchangeOAuthCode error propagation', () => {
  it('passes the exact exchangeOAuthCode error to next() by identity', async () => {
    const oauthErr = new Error('invalid_grant');
    exchangeOAuthCode.mockRejectedValueOnce(oauthErr);
    const next = jest.fn();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(oauthErr);
  });

  it('does not call upsertUser when exchangeOAuthCode throws', async () => {
    exchangeOAuthCode.mockRejectedValueOnce(new Error('fail'));
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), jest.fn());
    expect(upsertUser).not.toHaveBeenCalled();
  });

  it('does not call createSession when exchangeOAuthCode throws', async () => {
    exchangeOAuthCode.mockRejectedValueOnce(new Error('fail'));
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), jest.fn());
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not call res.redirect when exchangeOAuthCode throws', async () => {
    exchangeOAuthCode.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ── GET /callback — upsertUser error propagation ──────────────────────────────

describe('GET /callback — upsertUser error propagation', () => {
  it('passes the exact upsertUser error to next() by identity', async () => {
    const dbErr = new Error('unique violation');
    upsertUser.mockRejectedValueOnce(dbErr);
    const next = jest.fn();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(dbErr);
  });

  it('does not call createSession when upsertUser throws', async () => {
    upsertUser.mockRejectedValueOnce(new Error('fail'));
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), jest.fn());
    expect(createSession).not.toHaveBeenCalled();
  });

  it('does not call res.redirect when upsertUser throws', async () => {
    upsertUser.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ── GET /callback — createSession error propagation ───────────────────────────

describe('GET /callback — createSession error propagation', () => {
  it('passes the exact createSession error to next() by identity', async () => {
    const dbErr = new Error('connection lost');
    createSession.mockRejectedValueOnce(dbErr);
    const next = jest.fn();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(dbErr);
  });

  it('does not set cookie when createSession throws', async () => {
    createSession.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), res, jest.fn());
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('does not call res.redirect when createSession throws', async () => {
    createSession.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await callbackHandler(makeReq({ query: { code: 'abc' } }), res, jest.fn());
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

// ── GET /callback — security ──────────────────────────────────────────────────

describe('GET /callback — security', () => {
  function makeCallbackReq() {
    return makeReq({ query: { code: 'gh_code_abc123' } });
  }

  it('rawToken is not sent in any res.json call', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    for (const call of res.json.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(MOCK_RAW_TOKEN);
    }
  });

  it('rawToken is not sent in any res.send call', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    for (const call of res.send.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(MOCK_RAW_TOKEN);
    }
  });

  it('redirect target does not contain rawToken', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    const redirectArg = res.redirect.mock.calls[0][0];
    expect(redirectArg).not.toContain(MOCK_RAW_TOKEN);
  });

  it('redirect target does not contain the OAuth accessToken', async () => {
    const res = makeRes();
    await callbackHandler(makeCallbackReq(), res, jest.fn());
    const redirectArg = res.redirect.mock.calls[0][0];
    expect(redirectArg).not.toContain(MOCK_OAUTH_RESULT.accessToken);
  });

  it('clientSecret is not included in any error passed to next()', async () => {
    exchangeOAuthCode.mockRejectedValueOnce(new Error('fail'));
    const next = jest.fn();
    await callbackHandler(makeCallbackReq(), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(JSON.stringify(err)).not.toContain(MOCK_GITHUB_CONFIG.clientSecret);
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

  it('calls invalidateSession once', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(invalidateSession).toHaveBeenCalledTimes(1);
  });

  it('calls invalidateSession with db from req.app.locals', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(invalidateSession.mock.calls[0][0].db).toBe(mockDb);
  });

  it('calls invalidateSession with sessionId from req.session.sessionId', async () => {
    await logoutHandler(makeLogoutReq(), makeRes(), jest.fn());
    expect(invalidateSession.mock.calls[0][0].sessionId).toBe('sess-99');
  });

  it('returns 204 even when invalidateSession resolves { invalidated: false }', async () => {
    invalidateSession.mockResolvedValueOnce({ invalidated: false });
    const res = makeRes();
    await logoutHandler(makeLogoutReq(), res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('logEvent is fire-and-forget — rejection does not call next()', async () => {
    logEvent.mockRejectedValueOnce(new Error('db gone'));
    const next = jest.fn();
    await logoutHandler(makeLogoutReq(), makeRes(), next);
    await Promise.resolve(); // drain .catch handler
    expect(next).not.toHaveBeenCalled();
  });

  it('logEvent is fire-and-forget — rejection still returns 204', async () => {
    logEvent.mockRejectedValueOnce(new Error('db gone'));
    const res = makeRes();
    await logoutHandler(makeLogoutReq(), res, jest.fn());
    await Promise.resolve();
    expect(res.status).toHaveBeenCalledWith(204);
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

// ── POST /logout — invalidateSession error propagation ───────────────────────

describe('POST /logout — invalidateSession error propagation', () => {
  it('passes the exact invalidateSession error to next() by identity', async () => {
    const sessionErr = new Error('db connection lost');
    invalidateSession.mockRejectedValueOnce(sessionErr);

    const next = jest.fn();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      makeRes(), next
    );
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(sessionErr);
  });

  it('does not call res.status when invalidateSession throws', async () => {
    invalidateSession.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      res, jest.fn()
    );
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not clear the cookie when invalidateSession throws', async () => {
    invalidateSession.mockRejectedValueOnce(new Error('fail'));
    const res = makeRes();
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      res, jest.fn()
    );
    expect(res.clearCookie).not.toHaveBeenCalled();
  });

  it('does not call logEvent when invalidateSession throws', async () => {
    invalidateSession.mockRejectedValueOnce(new Error('fail'));
    await logoutHandler(
      makeReq({ user: { userId: 'u-1' }, session: { sessionId: 's-1' } }),
      makeRes(), jest.fn()
    );
    expect(logEvent).not.toHaveBeenCalled();
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
