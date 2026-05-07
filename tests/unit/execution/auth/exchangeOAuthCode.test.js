'use strict';

const { exchangeOAuthCode } = require('../../../../execution/auth/exchangeOAuthCode');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const CODE          = 'gh_code_abc123';
const CLIENT_ID     = 'gh-client-id-xyz';
const CLIENT_SECRET = 'gh-client-secret-supersecret999';
const CALLBACK_URL  = 'http://localhost:3000/auth/callback';
const ACCESS_TOKEN  = 'gho_test_access_token_abc123';

const MOCK_PROFILE = {
  id:    12345,
  login: 'octocat',
  email: 'octocat@github.com',
};

const mockFetchFn = jest.fn();

function makeTokenRes(body = { access_token: ACCESS_TOKEN }, ok = true) {
  return { ok, json: jest.fn().mockResolvedValue(body) };
}

function makeProfileRes(body = MOCK_PROFILE, ok = true) {
  return { ok, json: jest.fn().mockResolvedValue(body) };
}

function setupHappyPath(profileBody = MOCK_PROFILE) {
  mockFetchFn
    .mockResolvedValueOnce(makeTokenRes())
    .mockResolvedValueOnce(makeProfileRes(profileBody));
}

function validArgs(overrides = {}) {
  return {
    code:         CODE,
    clientId:     CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    callbackUrl:  CALLBACK_URL,
    fetchFn:      mockFetchFn,
    ...overrides,
  };
}

// resetAllMocks clears mock.calls AND the mockResolvedValueOnce queue — preventing
// state leakage between tests that use different response setups.
beforeEach(() => jest.resetAllMocks());

// ── Success path: return shape ────────────────────────────────────────────────

describe('exchangeOAuthCode — success: return shape', () => {
  beforeEach(() => setupHappyPath());

  it('returns accessToken from the token endpoint response', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(result.accessToken).toBe(ACCESS_TOKEN);
  });

  it('returns githubId from profile.id', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(result.githubId).toBe(MOCK_PROFILE.id);
  });

  it('returns githubUsername from profile.login', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(result.githubUsername).toBe(MOCK_PROFILE.login);
  });

  it('returns email when profile.email is present', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(result.email).toBe(MOCK_PROFILE.email);
  });

  it('returns exactly four keys: accessToken, githubId, githubUsername, email', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(Object.keys(result).sort()).toEqual(
      ['accessToken', 'email', 'githubId', 'githubUsername']
    );
  });
});

// Separate describe so each test sets up its own full mock chain (no shared beforeEach).
describe('exchangeOAuthCode — success: email normalization', () => {
  it('returns null for email when profile.email is null', async () => {
    setupHappyPath({ ...MOCK_PROFILE, email: null });
    const result = await exchangeOAuthCode(validArgs());
    expect(result.email).toBeNull();
  });

  it('returns null for email when profile.email is undefined (not in response)', async () => {
    setupHappyPath({ id: MOCK_PROFILE.id, login: MOCK_PROFILE.login });
    const result = await exchangeOAuthCode(validArgs());
    expect(result.email).toBeNull();
  });
});

// ── Success path: token endpoint request shape ────────────────────────────────

describe('exchangeOAuthCode — success: token endpoint request shape', () => {
  beforeEach(() => setupHappyPath());

  it('calls fetchFn exactly twice', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn).toHaveBeenCalledTimes(2);
  });

  it('first call targets the GitHub token endpoint URL', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][0]).toBe('https://github.com/login/oauth/access_token');
  });

  it('token request uses POST method', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][1].method).toBe('POST');
  });

  it('token request includes Accept: application/json header', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][1].headers['Accept']).toBe('application/json');
  });

  it('token request includes Content-Type: application/json header', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
  });

  it('token request body contains client_id = clientId', async () => {
    await exchangeOAuthCode(validArgs());
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.client_id).toBe(CLIENT_ID);
  });

  it('token request body contains client_secret = clientSecret', async () => {
    await exchangeOAuthCode(validArgs());
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.client_secret).toBe(CLIENT_SECRET);
  });

  it('token request body contains code', async () => {
    await exchangeOAuthCode(validArgs());
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.code).toBe(CODE);
  });

  it('token request body contains redirect_uri = callbackUrl', async () => {
    await exchangeOAuthCode(validArgs());
    const body = JSON.parse(mockFetchFn.mock.calls[0][1].body);
    expect(body.redirect_uri).toBe(CALLBACK_URL);
  });
});

// ── Success path: profile endpoint request shape ──────────────────────────────

describe('exchangeOAuthCode — success: profile endpoint request shape', () => {
  beforeEach(() => setupHappyPath());

  it('second call targets the GitHub user profile URL', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[1][0]).toBe('https://api.github.com/user');
  });

  it('profile request includes Authorization: Bearer <accessToken>', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[1][1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('profile request includes Accept: application/vnd.github+json', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[1][1].headers['Accept']).toBe('application/vnd.github+json');
  });

  it('profile request does not include a body', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[1][1].body).toBeUndefined();
  });
});

// ── INVALID_OAUTH_CODE ────────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_OAUTH_CODE', () => {
  // typeof code !== 'string' branch (left side of ||)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  42],
    ['an object', {}],
  ];

  nonStringCases.forEach(([label, code]) => {
    it(`throws INVALID_OAUTH_CODE when code is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ code }))).rejects.toMatchObject({
        code:    'INVALID_OAUTH_CODE',
        message: 'code must be a non-empty string',
      });
    });
  });

  // code.trim().length === 0 branch (right side — code IS a string)
  it('throws INVALID_OAUTH_CODE when code is an empty string', async () => {
    await expect(exchangeOAuthCode(validArgs({ code: '' }))).rejects.toMatchObject({
      code: 'INVALID_OAUTH_CODE',
    });
  });

  it('throws INVALID_OAUTH_CODE when code is whitespace-only', async () => {
    await expect(exchangeOAuthCode(validArgs({ code: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_OAUTH_CODE',
    });
  });

  it('does not call fetchFn when code is invalid', async () => {
    try { await exchangeOAuthCode(validArgs({ code: null })); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_CLIENT_ID ─────────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_CLIENT_ID', () => {
  // typeof clientId !== 'string' branch (left side)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  7],
  ];

  nonStringCases.forEach(([label, clientId]) => {
    it(`throws INVALID_CLIENT_ID when clientId is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ clientId }))).rejects.toMatchObject({
        code:    'INVALID_CLIENT_ID',
        message: 'clientId must be a non-empty string',
      });
    });
  });

  // clientId.trim().length === 0 branch (right side)
  it('throws INVALID_CLIENT_ID when clientId is an empty string', async () => {
    await expect(exchangeOAuthCode(validArgs({ clientId: '' }))).rejects.toMatchObject({
      code: 'INVALID_CLIENT_ID',
    });
  });

  it('throws INVALID_CLIENT_ID when clientId is whitespace-only', async () => {
    await expect(exchangeOAuthCode(validArgs({ clientId: '   ' }))).rejects.toMatchObject({
      code: 'INVALID_CLIENT_ID',
    });
  });

  it('does not call fetchFn when clientId is invalid', async () => {
    try { await exchangeOAuthCode(validArgs({ clientId: null })); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_CLIENT_SECRET ─────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_CLIENT_SECRET', () => {
  // typeof clientSecret !== 'string' branch (left side)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  99],
  ];

  nonStringCases.forEach(([label, clientSecret]) => {
    it(`throws INVALID_CLIENT_SECRET when clientSecret is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ clientSecret }))).rejects.toMatchObject({
        code:    'INVALID_CLIENT_SECRET',
        message: 'clientSecret must be a non-empty string',
      });
    });
  });

  // clientSecret.trim().length === 0 branch (right side)
  it('throws INVALID_CLIENT_SECRET when clientSecret is an empty string', async () => {
    await expect(exchangeOAuthCode(validArgs({ clientSecret: '' }))).rejects.toMatchObject({
      code: 'INVALID_CLIENT_SECRET',
    });
  });

  it('throws INVALID_CLIENT_SECRET when clientSecret is whitespace-only', async () => {
    await expect(exchangeOAuthCode(validArgs({ clientSecret: '\t' }))).rejects.toMatchObject({
      code: 'INVALID_CLIENT_SECRET',
    });
  });

  it('does not call fetchFn when clientSecret is invalid', async () => {
    try { await exchangeOAuthCode(validArgs({ clientSecret: null })); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_CALLBACK_URL ──────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_CALLBACK_URL', () => {
  // typeof callbackUrl !== 'string' branch (left side)
  const nonStringCases = [
    ['null',      null],
    ['undefined', undefined],
    ['a number',  8080],
  ];

  nonStringCases.forEach(([label, callbackUrl]) => {
    it(`throws INVALID_CALLBACK_URL when callbackUrl is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ callbackUrl }))).rejects.toMatchObject({
        code:    'INVALID_CALLBACK_URL',
        message: 'callbackUrl must start with http:// or https://',
      });
    });
  });

  // regex fails branch (right side — callbackUrl IS a string)
  const invalidUrlCases = [
    ['an empty string',    ''],
    ['a plain string',     'not-a-url'],
    ['an ftp URL',         'ftp://example.com/callback'],
    ['URL without scheme', '//example.com/callback'],
    ['whitespace-only',    '   '],
  ];

  invalidUrlCases.forEach(([label, callbackUrl]) => {
    it(`throws INVALID_CALLBACK_URL when callbackUrl is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ callbackUrl }))).rejects.toMatchObject({
        code: 'INVALID_CALLBACK_URL',
      });
    });
  });

  it('accepts callbackUrl starting with http://', async () => {
    setupHappyPath();
    const result = await exchangeOAuthCode(validArgs({ callbackUrl: 'http://localhost/cb' }));
    expect(result.accessToken).toBe(ACCESS_TOKEN);
  });

  it('accepts callbackUrl starting with https://', async () => {
    setupHappyPath();
    const result = await exchangeOAuthCode(validArgs({ callbackUrl: 'https://app.example.com/callback' }));
    expect(result.accessToken).toBe(ACCESS_TOKEN);
  });

  it('does not call fetchFn when callbackUrl is invalid', async () => {
    try { await exchangeOAuthCode(validArgs({ callbackUrl: null })); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_FETCH_FN ──────────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_FETCH_FN', () => {
  const cases = [
    ['null',      null],
    ['undefined', undefined],
    ['a string',  'fetch'],
    ['an object', {}],
    ['a number',  1],
  ];

  cases.forEach(([label, fetchFn]) => {
    it(`throws INVALID_FETCH_FN when fetchFn is ${label}`, async () => {
      await expect(exchangeOAuthCode(validArgs({ fetchFn }))).rejects.toMatchObject({
        code:    'INVALID_FETCH_FN',
        message: 'fetchFn must be a function',
      });
    });
  });
});

// ── Validation ordering ───────────────────────────────────────────────────────

describe('exchangeOAuthCode — validation ordering', () => {
  it('throws INVALID_OAUTH_CODE before INVALID_CLIENT_ID when both are invalid', async () => {
    let caught;
    try { await exchangeOAuthCode(validArgs({ code: null, clientId: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_OAUTH_CODE');
  });

  it('throws INVALID_CLIENT_ID before INVALID_CLIENT_SECRET when both are invalid', async () => {
    let caught;
    try { await exchangeOAuthCode(validArgs({ clientId: null, clientSecret: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_CLIENT_ID');
  });

  it('throws INVALID_CLIENT_SECRET before INVALID_CALLBACK_URL when both are invalid', async () => {
    let caught;
    try { await exchangeOAuthCode(validArgs({ clientSecret: null, callbackUrl: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_CLIENT_SECRET');
  });

  it('throws INVALID_CALLBACK_URL before INVALID_FETCH_FN when both are invalid', async () => {
    let caught;
    try { await exchangeOAuthCode(validArgs({ callbackUrl: null, fetchFn: null })); } catch (e) { caught = e; }
    expect(caught.code).toBe('INVALID_CALLBACK_URL');
  });

  it('throws INVALID_OAUTH_CODE when called with no arguments', async () => {
    await expect(exchangeOAuthCode()).rejects.toMatchObject({ code: 'INVALID_OAUTH_CODE' });
  });
});

// ── OAUTH_TOKEN_EXCHANGE_FAILED — non-OK HTTP response ────────────────────────

describe('exchangeOAuthCode — OAUTH_TOKEN_EXCHANGE_FAILED: token endpoint non-OK', () => {
  it('throws when token endpoint returns HTTP 401', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn() });
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code:    'OAUTH_TOKEN_EXCHANGE_FAILED',
      message: 'GitHub token exchange failed',
    });
  });

  it('throws when token endpoint returns HTTP 500', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: false, status: 500, json: jest.fn() });
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  it('does not make the profile request when the token endpoint fails', async () => {
    mockFetchFn.mockResolvedValueOnce({ ok: false, status: 400, json: jest.fn() });
    try { await exchangeOAuthCode(validArgs()); } catch (_) {}
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it('does not call json() on the non-OK token response', async () => {
    const jsonFn = jest.fn();
    mockFetchFn.mockResolvedValueOnce({ ok: false, status: 400, json: jsonFn });
    try { await exchangeOAuthCode(validArgs()); } catch (_) {}
    expect(jsonFn).not.toHaveBeenCalled();
  });
});

// ── OAUTH_TOKEN_EXCHANGE_FAILED — missing access_token ───────────────────────

describe('exchangeOAuthCode — OAUTH_TOKEN_EXCHANGE_FAILED: missing access_token', () => {
  // typeof access_token !== 'string' (left side of ||)
  it('throws when token response has no access_token field', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ error: 'bad_verification_code' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  it('throws when access_token is null', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ access_token: null }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  it('throws when access_token is a number (typeof !== "string")', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ access_token: 12345 }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  // access_token IS a string but empty (right side of ||)
  it('throws when access_token is an empty string', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ access_token: '' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  it('throws when access_token is whitespace-only', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ access_token: '   ' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'OAUTH_TOKEN_EXCHANGE_FAILED',
    });
  });

  it('does not make the profile request when access_token is missing', async () => {
    mockFetchFn.mockResolvedValueOnce(makeTokenRes({ error: 'bad_verification_code' }));
    try { await exchangeOAuthCode(validArgs()); } catch (_) {}
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });
});

// ── GITHUB_PROFILE_FETCH_FAILED ───────────────────────────────────────────────

describe('exchangeOAuthCode — GITHUB_PROFILE_FETCH_FAILED', () => {
  it('throws when profile endpoint returns HTTP 401', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce({ ok: false, status: 401, json: jest.fn() });
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code:    'GITHUB_PROFILE_FETCH_FAILED',
      message: 'GitHub profile fetch failed',
    });
  });

  it('throws when profile endpoint returns HTTP 403', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce({ ok: false, status: 403, json: jest.fn() });
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'GITHUB_PROFILE_FETCH_FAILED',
    });
  });

  it('throws when profile endpoint returns HTTP 500', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce({ ok: false, status: 500, json: jest.fn() });
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'GITHUB_PROFILE_FETCH_FAILED',
    });
  });

  it('does not call json() on the non-OK profile response', async () => {
    const jsonFn = jest.fn();
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce({ ok: false, status: 401, json: jsonFn });
    try { await exchangeOAuthCode(validArgs()); } catch (_) {}
    expect(jsonFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_GITHUB_PROFILE ────────────────────────────────────────────────────

describe('exchangeOAuthCode — INVALID_GITHUB_PROFILE', () => {
  // !profile branch (left side of ||)
  it('throws when profile response is null', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce(makeProfileRes(null));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code:    'INVALID_GITHUB_PROFILE',
      message: 'GitHub profile is invalid',
    });
  });

  // !profile.id branch (middle — profile is truthy, id is missing/falsy)
  it('throws when profile is missing id', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce(makeProfileRes({ login: 'octocat' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'INVALID_GITHUB_PROFILE',
    });
  });

  it('throws when profile.id is 0 (falsy)', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce(makeProfileRes({ id: 0, login: 'octocat' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'INVALID_GITHUB_PROFILE',
    });
  });

  // !profile.login branch (right side — id is present, login is missing/falsy)
  it('throws when profile is missing login', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce(makeProfileRes({ id: 12345 }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'INVALID_GITHUB_PROFILE',
    });
  });

  it('throws when profile.login is an empty string (falsy)', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockResolvedValueOnce(makeProfileRes({ id: 12345, login: '' }));
    await expect(exchangeOAuthCode(validArgs())).rejects.toMatchObject({
      code: 'INVALID_GITHUB_PROFILE',
    });
  });
});

// ── Security: clientSecret never exposed ─────────────────────────────────────

describe('exchangeOAuthCode — security: clientSecret never returned', () => {
  beforeEach(() => setupHappyPath());

  it('return value does not contain clientSecret as a property value', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(Object.values(result)).not.toContain(CLIENT_SECRET);
  });

  it('return value serialized to JSON does not contain clientSecret', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(JSON.stringify(result)).not.toContain(CLIENT_SECRET);
  });

  it('clientSecret does not appear in either fetchFn call URL', async () => {
    await exchangeOAuthCode(validArgs());
    for (const call of mockFetchFn.mock.calls) {
      expect(call[0]).not.toContain(CLIENT_SECRET);
    }
  });
});

// ── Security: accessToken placement ──────────────────────────────────────────

describe('exchangeOAuthCode — security: accessToken placement', () => {
  beforeEach(() => setupHappyPath());

  it('accessToken appears in the return value', async () => {
    const result = await exchangeOAuthCode(validArgs());
    expect(result.accessToken).toBe(ACCESS_TOKEN);
  });

  it('accessToken appears as Bearer token in the profile Authorization header', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[1][1].headers['Authorization']).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it('accessToken does not appear in the token exchange request URL', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][0]).not.toContain(ACCESS_TOKEN);
  });

  it('accessToken does not appear in the token exchange request body (not yet obtained)', async () => {
    await exchangeOAuthCode(validArgs());
    expect(mockFetchFn.mock.calls[0][1].body).not.toContain(ACCESS_TOKEN);
  });
});

// ── No DB / config / env access ───────────────────────────────────────────────

describe('exchangeOAuthCode — isolation: no DB, config, or env access', () => {
  beforeEach(() => setupHappyPath());

  it('function accepts no db parameter and succeeds without one', async () => {
    const args = validArgs();
    expect(args).not.toHaveProperty('db');
    const result = await exchangeOAuthCode(args);
    expect(result.accessToken).toBe(ACCESS_TOKEN);
  });

  it('succeeds with only fetchFn mocked — no other external dependencies required', async () => {
    const result = await exchangeOAuthCode({
      code:         CODE,
      clientId:     CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      callbackUrl:  CALLBACK_URL,
      fetchFn:      mockFetchFn,
    });
    expect(result.githubId).toBe(MOCK_PROFILE.id);
  });
});

// ── fetchFn error propagation ─────────────────────────────────────────────────

describe('exchangeOAuthCode — fetchFn error propagation', () => {
  it('propagates a network error thrown by the token fetchFn call', async () => {
    const netErr = new Error('ECONNREFUSED');
    mockFetchFn.mockRejectedValueOnce(netErr);
    await expect(exchangeOAuthCode(validArgs())).rejects.toBe(netErr);
  });

  it('propagates a network error thrown by the profile fetchFn call', async () => {
    const netErr = new Error('ETIMEDOUT');
    mockFetchFn
      .mockResolvedValueOnce(makeTokenRes())
      .mockRejectedValueOnce(netErr);
    await expect(exchangeOAuthCode(validArgs())).rejects.toBe(netErr);
  });
});
