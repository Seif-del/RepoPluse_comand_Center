'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/crypto/encryptToken');
jest.mock('../../../../execution/github/syncUserRepos');
jest.mock('../../../../execution/github/parseGithubUrl');
jest.mock('../../../../execution/github/fetchRepo');
jest.mock('../../../../execution/risk/getRepoRiskFactors');
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => next());
jest.mock('../../../../backend/middleware/authorize',     () => () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const router                 = require('../../../../backend/routes/repoRoutes');
const { decrypt }            = require('../../../../execution/crypto/encryptToken');
const { syncUserRepos }      = require('../../../../execution/github/syncUserRepos');
const { parseGithubUrl }     = require('../../../../execution/github/parseGithubUrl');
const { fetchRepo }          = require('../../../../execution/github/fetchRepo');
const { getRepoRiskFactors } = require('../../../../execution/risk/getRepoRiskFactors');

// ── Handler extraction ────────────────────────────────────────────────────────

function extractHandler(r, method, path) {
  for (const layer of r.stack) {
    if (
      layer.route &&
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()]
    ) {
      const handlers = layer.route.stack;
      return handlers[handlers.length - 1].handle;
    }
  }
  throw new Error(`Handler not found: ${method} ${path}`);
}

const getReposHandler    = extractHandler(router, 'GET',  '/');
const getSummaryHandler  = extractHandler(router, 'GET',  '/summary');
const getMetricsHandler  = extractHandler(router, 'GET',  '/:id/metrics');
const getRiskHandler     = extractHandler(router, 'GET',  '/:id/risk');
const postRegisterHandler = extractHandler(router, 'POST', '/register');
const postSyncHandler    = extractHandler(router, 'POST', '/sync');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const MOCK_USER = { userId: 1 };
const MOCK_CONFIG = { tokenEncryptionKey: 'test-key' };

function makeReq(overrides = {}) {
  return {
    user:   MOCK_USER,
    params: {},
    body:   {},
    app: {
      locals: {
        db:      makeDb(),
        config:  MOCK_CONFIG,
        fetchFn: jest.fn(),
      },
    },
    ...overrides,
  };
}

function makeRes() {
  const res = {
    status: jest.fn(),
    json:   jest.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

const next = jest.fn();

function makeDb(queryResult = { rows: [] }) {
  return { query: jest.fn(async () => queryResult) };
}

// ── GET / ────────────────────────────────────────────────────────────────────

describe('repoRoutes GET /', () => {
  beforeEach(() => {
    getRepoRiskFactors.mockReturnValue({ hasMetrics: true, triggered: [], notMeasured: [], allClear: true });
  });

  it('returns repos array from db', async () => {
    const rows = [{ id: 1, fullName: 'o/r', score: 10, label: 'healthy', factors: [] }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ repos: expect.any(Array) }));
  });

  it('enriches each repo with explanation', async () => {
    const rows = [{ id: 1, fullName: 'o/r', score: 10, label: 'healthy', factors: [] }];
    const db = makeDb({ rows });
    const explanation = { hasMetrics: true, triggered: [], notMeasured: [], allClear: true };
    getRepoRiskFactors.mockReturnValue(explanation);
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    const { repos } = res.json.mock.calls[0][0];
    expect(repos[0].explanation).toEqual(explanation);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db err'); }) };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── GET /summary ─────────────────────────────────────────────────────────────

describe('repoRoutes GET /summary', () => {
  it('returns summary row from db', async () => {
    const row = { totalRepos: 3, healthy: 2, atRisk: 1, critical: 0, avgScore: 20 };
    const db = makeDb({ rows: [row] });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getSummaryHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(row);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('oops'); }) };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getSummaryHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── GET /:id/metrics ──────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/metrics', () => {
  it('returns metrics row when found', async () => {
    const row = { commits7d: 5, openPrs: 1, stalePrs: 0, openIssues: 3 };
    const db = makeDb({ rows: [row] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMetricsHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(row);
  });

  it('returns 404 when no metrics found', async () => {
    const db = makeDb({ rows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMetricsHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 400 for non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getMetricsHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── GET /:id/risk ─────────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/risk', () => {
  it('returns current and previous risk scores', async () => {
    const rows = [{ score: 30, label: 'at-risk' }, { score: 20, label: 'healthy' }];
    const db = makeDb({ rows });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getRiskHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ current: rows[0], previous: rows[1] });
  });

  it('returns previous: null when only one score exists', async () => {
    const rows = [{ score: 30, label: 'at-risk' }];
    const db = makeDb({ rows });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getRiskHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ current: rows[0], previous: null });
  });

  it('returns 404 when no risk scores found', async () => {
    const db = makeDb({ rows: [] });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getRiskHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('returns 400 for non-numeric id', async () => {
    const req = makeReq({ params: { id: 'bad' } });
    const res = makeRes();
    await getRiskHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

// ── POST /register ────────────────────────────────────────────────────────────

describe('repoRoutes POST /register', () => {
  beforeEach(() => {
    parseGithubUrl.mockReturnValue({ owner: 'o', repo: 'r', fullName: 'o/r' });
    fetchRepo.mockResolvedValue({ githubRepoId: 42, fullName: 'o/r' });
    decrypt.mockReturnValue('gho_decrypted_token');
  });

  function makeRegisterReq(body = { url: 'https://github.com/o/r' }) {
    const db = {
      query: jest.fn(async (sql) => {
        if (sql.includes('SELECT access_token_enc')) return { rows: [{ access_token_enc: 'enc' }] };
        if (sql.includes('INSERT INTO repositories')) {
          return { rows: [{ id: 1, fullName: 'o/r', linkedAt: new Date() }] };
        }
        return { rows: [] };
      }),
    };
    return makeReq({ body, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
  }

  it('returns 201 with repo data on success', async () => {
    const req = makeRegisterReq();
    const res = makeRes();
    await postRegisterHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: true }));
  });

  it('returns 503 when tokenEncryptionKey is missing', async () => {
    const req = makeRegisterReq();
    req.app.locals.config = {};
    const res = makeRes();
    await postRegisterHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 400 when parseGithubUrl throws VALIDATION_ERROR', async () => {
    const err = new Error('bad url');
    err.code = 'VALIDATION_ERROR';
    parseGithubUrl.mockImplementation(() => { throw err; });
    const req = makeRegisterReq({ url: 'not-a-url' });
    const res = makeRes();
    await postRegisterHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ ok: false }));
  });

  it('returns 422 when no stored access token', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    const req = makeReq({
      body: { url: 'https://github.com/o/r' },
      app:  { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } },
    });
    const res = makeRes();
    await postRegisterHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('returns 404 when fetchRepo throws REPO_NOT_FOUND', async () => {
    const err = new Error('not found');
    err.code = 'REPO_NOT_FOUND';
    fetchRepo.mockRejectedValue(err);
    const req = makeRegisterReq();
    const res = makeRes();
    await postRegisterHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ── POST /sync ────────────────────────────────────────────────────────────────

describe('repoRoutes POST /sync', () => {
  beforeEach(() => {
    decrypt.mockReturnValue('gho_token');
    syncUserRepos.mockResolvedValue({ synced: 3, errors: [] });
  });

  function makeSyncReq() {
    const db = {
      query: jest.fn(async () => ({ rows: [{ access_token_enc: 'enc' }] })),
    };
    return makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
  }

  it('returns 202 with queued: true', async () => {
    const req = makeSyncReq();
    const res = makeRes();
    await postSyncHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ queued: true }));
  });

  it('returns 503 when tokenEncryptionKey is missing', async () => {
    const req = makeSyncReq();
    req.app.locals.config = {};
    const res = makeRes();
    await postSyncHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(503);
  });

  it('returns 422 when no stored access token', async () => {
    const db = { query: jest.fn(async () => ({ rows: [] })) };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await postSyncHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(422);
  });

  it('returns 503 when no fetchFn available', async () => {
    const db = {
      query: jest.fn(async () => ({ rows: [{ access_token_enc: 'enc' }] })),
    };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG } } });
    const res = makeRes();
    const origFetch = globalThis.fetch;
    try {
      globalThis.fetch = undefined;
      await postSyncHandler(req, res, next);
    } finally {
      globalThis.fetch = origFetch;
    }
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
