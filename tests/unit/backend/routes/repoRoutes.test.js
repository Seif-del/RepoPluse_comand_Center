'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/crypto/encryptToken');
jest.mock('../../../../execution/github/syncUserRepos');
jest.mock('../../../../execution/github/parseGithubUrl');
jest.mock('../../../../execution/github/fetchRepo');
jest.mock('../../../../execution/risk/getRepoRiskFactors');
jest.mock('../../../../execution/risk/getAttentionQueue');
jest.mock('../../../../execution/risk/getTrendIndicator');
jest.mock('../../../../execution/risk/buildOperationalEvents');
jest.mock('../../../../execution/risk/getEscalationSignals');
jest.mock('../../../../execution/risk/getOperationalForecast');
jest.mock('../../../../execution/risk/scorePullRequestHealth');
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => next());
jest.mock('../../../../backend/middleware/authorize',     () => () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const router                 = require('../../../../backend/routes/repoRoutes');
const { decrypt }            = require('../../../../execution/crypto/encryptToken');
const { syncUserRepos }      = require('../../../../execution/github/syncUserRepos');
const { parseGithubUrl }     = require('../../../../execution/github/parseGithubUrl');
const { fetchRepo }          = require('../../../../execution/github/fetchRepo');
const { getRepoRiskFactors }    = require('../../../../execution/risk/getRepoRiskFactors');
const { getAttentionQueue }      = require('../../../../execution/risk/getAttentionQueue');
const { getTrendIndicator }      = require('../../../../execution/risk/getTrendIndicator');
const { buildOperationalEvents } = require('../../../../execution/risk/buildOperationalEvents');
const { getEscalationSignals }    = require('../../../../execution/risk/getEscalationSignals');
const { getOperationalForecast }  = require('../../../../execution/risk/getOperationalForecast');
const { scorePullRequestHealth }  = require('../../../../execution/risk/scorePullRequestHealth');

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

const getReposHandler        = extractHandler(router, 'GET',  '/');
const getAttentionHandler    = extractHandler(router, 'GET',  '/attention');
const getSummaryHandler      = extractHandler(router, 'GET',  '/summary');
const getMetricsHandler      = extractHandler(router, 'GET',  '/:id/metrics');
const getRiskHandler         = extractHandler(router, 'GET',  '/:id/risk');
const getEventsHandler       = extractHandler(router, 'GET',  '/:id/events');
const getEscalationHandler   = extractHandler(router, 'GET',  '/:id/escalation');
const getForecastHandler     = extractHandler(router, 'GET',  '/:id/forecast');
const getPrHealthHandler     = extractHandler(router, 'GET',  '/:id/pr-health');
const postRegisterHandler    = extractHandler(router, 'POST', '/register');
const postSyncHandler        = extractHandler(router, 'POST', '/sync');

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
    getTrendIndicator.mockReturnValue({ direction: 'stable', delta: 0, label: 'Operationally stable' });
    buildOperationalEvents.mockReturnValue([]);
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

  it('enriches each repo with trendIndicator', async () => {
    const rows = [{ id: 1, fullName: 'o/r', score: 80, prevScore: 50, label: 'critical', factors: [] }];
    const db = makeDb({ rows });
    const trendIndicator = { direction: 'worsening', delta: 30, label: 'Risk increasing' };
    getTrendIndicator.mockReturnValue(trendIndicator);
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    const { repos } = res.json.mock.calls[0][0];
    expect(repos[0].trendIndicator).toEqual(trendIndicator);
  });

  it('calls getTrendIndicator with currentScore and previousScore from db row', async () => {
    const rows = [{ id: 1, fullName: 'o/r', score: 60, prevScore: 40, label: 'at-risk', factors: [] }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    expect(getTrendIndicator).toHaveBeenCalledWith({ currentScore: 60, previousScore: 40 });
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db err'); }) };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getReposHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── GET /attention ────────────────────────────────────────────────────────────

describe('repoRoutes GET /attention', () => {
  const MOCK_QUEUE = [
    { repoId: 1, name: 'o/r', attentionLevel: 'high', attentionScore: 40, reasons: ['CI pipeline is failing'] },
  ];

  beforeEach(() => {
    getAttentionQueue.mockReturnValue(MOCK_QUEUE);
  });

  it('returns attention array from getAttentionQueue', async () => {
    const rows = [{ id: 1, fullName: 'o/r', score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: null }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ attention: MOCK_QUEUE });
  });

  it('passes enriched repos (with derived trajectory) to getAttentionQueue', async () => {
    const rows = [{ id: 2, fullName: 'o/b', score: null, ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown', lastSyncedAt: null, label: null, trend: null, recentLabels: [] }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 2, trajectory: 'unknown' }),
      ])
    );
  });

  it('derives trajectory=escalating from critical+worsening label/trend', async () => {
    const rows = [{ id: 3, fullName: 'o/c', score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: null, label: 'critical', trend: 'worsening', recentLabels: [] }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 3, trajectory: 'escalating', escalationLevel: 'critical' }),
      ])
    );
  });

  it('derives persistentRisk=true when 3 recent labels are all at-risk/critical', async () => {
    const rows = [{ id: 4, fullName: 'o/d', score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: null, label: 'at-risk', trend: 'stable', recentLabels: ['at-risk', 'critical', 'at-risk'] }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 4, persistentRisk: true }),
      ])
    );
  });

  it('SQL query selects label and trend for trajectory derivation', async () => {
    const db = makeDb({ rows: [] });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('label');
    expect(sql).toContain('trend');
  });

  it('SQL query includes recentLabels array subquery', async () => {
    const db = makeDb({ rows: [] });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('recentLabels');
    expect(sql).toContain('LIMIT  3');
  });

  it('SQL query projects rs.factors in the outer SELECT for noRecentCommits derivation', async () => {
    const db = makeDb({ rows: [] });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    // rs.factors must appear in the outer SELECT projection — not only inside the
    // LATERAL subquery — so that r.factors is defined when the route maps noRecentCommits.
    expect(sql).toMatch(/rs\.factors/);
  });

  it('derives noRecentCommits=true when factors contain the no-commits string', async () => {
    const rows = [{
      id: 5, fullName: 'o/e', score: 8, label: 'healthy', trend: 'stable',
      ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      lastSyncedAt: null, recentLabels: [],
      factors: ['No commits in the last 7 days'],
    }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 5, noRecentCommits: true }),
      ])
    );
  });

  it('derives noRecentCommits=false when factors do not contain the no-commits string', async () => {
    const rows = [{
      id: 6, fullName: 'o/f', score: 10, label: 'healthy', trend: 'stable',
      ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      lastSyncedAt: null, recentLabels: [],
      factors: ['High bus-factor risk: one contributor dominates'],
    }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 6, noRecentCommits: false }),
      ])
    );
  });

  it('derives noRecentCommits=false when factors is null/missing', async () => {
    const rows = [{
      id: 7, fullName: 'o/g', score: null, label: null, trend: null,
      ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown',
      lastSyncedAt: null, recentLabels: [],
      factors: null,
    }];
    const db = makeDb({ rows });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 7, noRecentCommits: false }),
      ])
    );
  });

  it('returns empty attention array when no repos', async () => {
    getAttentionQueue.mockReturnValue([]);
    const db = makeDb({ rows: [] });
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ attention: [] });
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getAttentionHandler(req, res, next);
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

// ── GET /:id/events ───────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/events', () => {
  const MOCK_EVENTS = [
    {
      type:        'ci_failure_detected',
      severity:    'critical',
      title:       'CI pipeline failure detected',
      description: 'CI status changed from passing to failing.',
      timestamp:   '2026-05-12T13:00:00.000Z',
    },
  ];

  beforeEach(() => {
    buildOperationalEvents.mockReturnValue(MOCK_EVENTS);
    getTrendIndicator.mockReturnValue({ direction: 'stable', delta: 0, label: 'Operationally stable' });
  });

  function makeEventsDb({ riskRows = [], metricsRows = [] } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM risk_scores'))  return { rows: riskRows };
        if (sql.includes('FROM repo_metrics')) return { rows: metricsRows };
        return { rows: [] };
      }),
    };
  }

  it('returns events array from buildOperationalEvents', async () => {
    const db  = makeEventsDb({ riskRows: [{ score: 50 }], metricsRows: [{ ciStatus: 'failing' }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ events: MOCK_EVENTS });
  });

  it('returns empty events array when no history exists', async () => {
    buildOperationalEvents.mockReturnValue([]);
    const db  = makeEventsDb({ riskRows: [], metricsRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ events: [] });
  });

  it('passes current and previous risk scores to buildOperationalEvents', async () => {
    const riskRows    = [{ score: 80, snapshotAt: '2026-05-12T13:00:00.000Z' }, { score: 50, snapshotAt: '2026-05-10T10:00:00.000Z' }];
    const metricsRows = [{ ciStatus: 'failing', snapshotAt: '2026-05-12T13:00:00.000Z' }];
    const db  = makeEventsDb({ riskRows, metricsRows });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(buildOperationalEvents).toHaveBeenCalledWith(expect.objectContaining({
      currentRiskScore:  riskRows[0],
      previousRiskScore: riskRows[1],
    }));
  });

  it('passes current and previous metrics to buildOperationalEvents', async () => {
    const metricsRows = [
      { ciStatus: 'failing',  snapshotAt: '2026-05-12T13:00:00.000Z' },
      { ciStatus: 'passing',  snapshotAt: '2026-05-10T10:00:00.000Z' },
    ];
    const db  = makeEventsDb({ riskRows: [{ score: 50 }], metricsRows });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(buildOperationalEvents).toHaveBeenCalledWith(expect.objectContaining({
      currentMetrics:  metricsRows[0],
      previousMetrics: metricsRows[1],
    }));
  });

  it('passes null for missing previous rows', async () => {
    const db  = makeEventsDb({ riskRows: [{ score: 50 }], metricsRows: [{ ciStatus: 'passing' }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(buildOperationalEvents).toHaveBeenCalledWith(expect.objectContaining({
      previousRiskScore: null,
      previousMetrics:   null,
    }));
  });

  it('returns 400 for non-numeric id', async () => {
    const req = makeReq({ params: { id: 'bad' } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEventsHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
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

// ── GET /:id/escalation ───────────────────────────────────────────────────────

describe('repoRoutes GET /:id/escalation', () => {
  const MOCK_ESCALATION = {
    volatilityLevel: 'high',
    escalationLevel: 'critical',
    persistentRisk:  true,
    signals:         ['Risk score worsened in 3 consecutive snapshots'],
  };

  beforeEach(() => {
    getEscalationSignals.mockReturnValue(MOCK_ESCALATION);
    buildOperationalEvents.mockReturnValue([]);
  });

  function makeEscalationDb({ riskRows = [], metricsRows = [] } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM risk_scores'))  return { rows: riskRows };
        if (sql.includes('FROM repo_metrics')) return { rows: metricsRows };
        return { rows: [] };
      }),
    };
  }

  it('returns escalation object from getEscalationSignals', async () => {
    const db  = makeEscalationDb({ riskRows: [{ score: 80, label: 'critical', snapshotAt: '2026-05-12T12:00:00Z' }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_ESCALATION);
  });

  it('returns 400 for non-numeric id', async () => {
    const req = makeReq({ params: { id: 'bad' } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('calls getEscalationSignals with riskHistory and metricsHistory from db', async () => {
    const riskRows    = [{ score: 80, label: 'critical', snapshotAt: '2026-05-12T12:00:00Z' }];
    const metricsRows = [{ ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'healthy', snapshotAt: '2026-05-12T12:00:00Z' }];
    const db  = makeEscalationDb({ riskRows, metricsRows });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(getEscalationSignals).toHaveBeenCalledWith(expect.objectContaining({
      riskHistory:    riskRows,
      metricsHistory: metricsRows,
    }));
  });

  it('passes an events array to getEscalationSignals', async () => {
    const riskRows    = [{ score: 80, snapshotAt: '2026-05-12T12:00:00Z' }, { score: 60, snapshotAt: '2026-05-11T12:00:00Z' }];
    const metricsRows = [{ ciStatus: 'failing', snapshotAt: '2026-05-12T12:00:00Z' }];
    const db  = makeEscalationDb({ riskRows, metricsRows });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(getEscalationSignals).toHaveBeenCalledWith(expect.objectContaining({
      events: expect.any(Array),
    }));
  });

  it('returns low/none defaults when db returns empty history', async () => {
    const DEFAULT = { volatilityLevel: 'low', escalationLevel: 'none', persistentRisk: false, signals: [] };
    getEscalationSignals.mockReturnValue(DEFAULT);
    const db  = makeEscalationDb({ riskRows: [], metricsRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(DEFAULT);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('queries risk_scores with LIMIT 10', async () => {
    const db  = makeEscalationDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    const riskCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(riskCall[0]).toContain('LIMIT 10');
  });

  it('queries repo_metrics with LIMIT 10', async () => {
    const db  = makeEscalationDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEscalationHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_metrics'));
    expect(metricsCall[0]).toContain('LIMIT 10');
  });
});

// ── GET /:id/forecast ────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/forecast', () => {
  const MOCK_FORECAST = {
    trajectory:    'deteriorating',
    forecastLevel: 'high',
    confidence:    'medium',
    projectedRisk: 'Continued decline expected if unaddressed',
    signals:       ['Repository at elevated risk for 3+ consecutive snapshots'],
  };

  const MOCK_ESCALATION = {
    volatilityLevel: 'low',
    escalationLevel: 'high',
    persistentRisk:  true,
    signals:         [],
  };

  beforeEach(() => {
    getEscalationSignals.mockReturnValue(MOCK_ESCALATION);
    getOperationalForecast.mockReturnValue(MOCK_FORECAST);
    buildOperationalEvents.mockReturnValue([]);
  });

  function makeForecastDb({ riskRows = [], metricsRows = [] } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM risk_scores'))  return { rows: riskRows };
        if (sql.includes('FROM repo_metrics')) return { rows: metricsRows };
        return { rows: [] };
      }),
    };
  }

  it('returns forecast object from getOperationalForecast', async () => {
    const db  = makeForecastDb({ riskRows: [{ score: 70, label: 'critical', snapshotAt: '2026-05-12T12:00:00Z' }] });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_FORECAST);
  });

  it('returns 400 for non-numeric id', async () => {
    const req = makeReq({ params: { id: 'xyz' } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('calls getEscalationSignals with riskHistory and metricsHistory', async () => {
    const riskRows    = [{ score: 80, label: 'critical', snapshotAt: '2026-05-12T12:00:00Z' }];
    const metricsRows = [{ ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'healthy', snapshotAt: '2026-05-12T12:00:00Z' }];
    const db  = makeForecastDb({ riskRows, metricsRows });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(getEscalationSignals).toHaveBeenCalledWith(expect.objectContaining({
      riskHistory:    riskRows,
      metricsHistory: metricsRows,
    }));
  });

  it('calls getOperationalForecast with riskHistory, escalation, and events', async () => {
    const riskRows = [{ score: 70, label: 'critical', snapshotAt: '2026-05-12T12:00:00Z' }];
    const db  = makeForecastDb({ riskRows });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(getOperationalForecast).toHaveBeenCalledWith(expect.objectContaining({
      riskHistory: riskRows,
      escalation:  MOCK_ESCALATION,
      events:      expect.any(Array),
    }));
  });

  it('returns unknown forecast when db returns empty history', async () => {
    const UNKNOWN_FORECAST = { trajectory: 'unknown', forecastLevel: 'unknown', confidence: 'low', projectedRisk: 'Insufficient history to forecast trajectory', signals: [] };
    getOperationalForecast.mockReturnValue(UNKNOWN_FORECAST);
    const db  = makeForecastDb({ riskRows: [], metricsRows: [] });
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(UNKNOWN_FORECAST);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('queries risk_scores with LIMIT 10', async () => {
    const db  = makeForecastDb();
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const riskCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(riskCall[0]).toContain('LIMIT 10');
  });

  it('queries repo_metrics with LIMIT 10', async () => {
    const db  = makeForecastDb();
    const req = makeReq({ params: { id: '5' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_metrics'));
    expect(metricsCall[0]).toContain('LIMIT 10');
  });
});

// ── GET /:id/pr-health ────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/pr-health', () => {
  const MOCK_PR_SCORE = {
    score:           35,
    label:           'monitor',
    reasons:         ['1 pull request open for more than 30 days'],
    signals:         ['abandoned_prs'],
    confidenceLevel: 'high',
  };

  const MOCK_UNKNOWN_SCORE = {
    score:           0,
    label:           'unknown',
    reasons:         [],
    signals:         [],
    confidenceLevel: 'low',
  };

  const MOCK_PR_ROW = {
    openPrCount:          3,
    mergedPrCount30d:     5,
    stalePrCount:         1,
    avgMergeLatencyHours: 24.5,
    failedCheckPrCount:   0,
    avgPrSize:            120,
    throughput30d:        1.2,
    abandonedPrCount:     1,
    oldestOpenPrAgeDays:  35.0,
    prTelemetryStatus:    'active',
  };

  beforeEach(() => {
    scorePullRequestHealth.mockReturnValue(MOCK_PR_SCORE);
  });

  function makePrHealthDb(rows = [MOCK_PR_ROW]) {
    return { query: jest.fn(async () => ({ rows })) };
  }

  it('returns 200 with the scorePullRequestHealth result on success', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_PR_SCORE);
  });

  it('returns 400 for a non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns unknown score (200) when no PR telemetry row exists', async () => {
    scorePullRequestHealth.mockReturnValue(MOCK_UNKNOWN_SCORE);
    const db  = makePrHealthDb([]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_UNKNOWN_SCORE);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls scorePullRequestHealth with { prTelemetryStatus: "unknown" } when no row exists', async () => {
    const db  = makePrHealthDb([]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledWith({ prTelemetryStatus: 'unknown' });
  });

  it('calls scorePullRequestHealth with normalised telemetry fields from the DB row', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledWith(expect.objectContaining({
      openPrCount:          MOCK_PR_ROW.openPrCount,
      mergedPrCount30d:     MOCK_PR_ROW.mergedPrCount30d,
      stalePrCount:         MOCK_PR_ROW.stalePrCount,
      failedCheckPrCount:   MOCK_PR_ROW.failedCheckPrCount,
      avgPrSize:            MOCK_PR_ROW.avgPrSize,
      abandonedPrCount:     MOCK_PR_ROW.abandonedPrCount,
      prTelemetryStatus:    MOCK_PR_ROW.prTelemetryStatus,
    }));
  });

  it('parses numeric (string) DB columns to numbers before calling scorer', async () => {
    const rowWithStringNumerics = {
      ...MOCK_PR_ROW,
      avgMergeLatencyHours: '24.5',
      throughput30d:        '1.2',
      oldestOpenPrAgeDays:  '35.0',
    };
    const db  = makePrHealthDb([rowWithStringNumerics]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledWith(expect.objectContaining({
      avgMergeLatencyHours: 24.5,
      throughput30d:        1.2,
      oldestOpenPrAgeDays:  35.0,
    }));
  });

  it('maps null numeric columns to null rather than NaN', async () => {
    const rowWithNulls = {
      ...MOCK_PR_ROW,
      avgMergeLatencyHours: null,
      throughput30d:        null,
      oldestOpenPrAgeDays:  null,
    };
    const db  = makePrHealthDb([rowWithNulls]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledWith(expect.objectContaining({
      avgMergeLatencyHours: null,
      throughput30d:        null,
      oldestOpenPrAgeDays:  null,
    }));
  });

  it('SQL query scopes by req.user.userId', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('r.user_id');
    expect(params).toContain(MOCK_USER.userId);
  });

  it('SQL query filters by repo_id from the route param', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '42' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    const [, params] = db.query.mock.calls[0];
    expect(params).toContain(42);
  });

  it('SQL query filters active repos (is_active = true)', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_active');
  });

  it('SQL query orders by snapshot_at DESC and limits to 1 row', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('snapshot_at DESC');
    expect(sql).toContain('LIMIT 1');
  });

  it('calls next with the error when the DB query throws', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('response shape contains score, label, reasons, signals, confidenceLevel', async () => {
    const db  = makePrHealthDb([MOCK_PR_ROW]);
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getPrHealthHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('score');
    expect(body).toHaveProperty('label');
    expect(body).toHaveProperty('reasons');
    expect(body).toHaveProperty('signals');
    expect(body).toHaveProperty('confidenceLevel');
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
