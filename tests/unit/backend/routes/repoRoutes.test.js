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
jest.mock('../../../../execution/risk/detectEngineeringVolatility');
jest.mock('../../../../execution/risk/scoreRepositoryMaturity');
jest.mock('../../../../execution/risk/getRepositoryMaturityTrend');
jest.mock('../../../../execution/github/fetchRepositoryFiles');
jest.mock('../../../../execution/architecture/buildRepositoryArchitectureSnapshot');
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
const { scorePullRequestHealth }        = require('../../../../execution/risk/scorePullRequestHealth');
const { detectEngineeringVolatility }   = require('../../../../execution/risk/detectEngineeringVolatility');
const { scoreRepositoryMaturity }       = require('../../../../execution/risk/scoreRepositoryMaturity');
const { getRepositoryMaturityTrend }    = require('../../../../execution/risk/getRepositoryMaturityTrend');
const { fetchRepositoryFiles }               = require('../../../../execution/github/fetchRepositoryFiles');
const { buildRepositoryArchitectureSnapshot } = require('../../../../execution/architecture/buildRepositoryArchitectureSnapshot');

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
const getPrHealthHandler                = extractHandler(router, 'GET',  '/:id/pr-health');
const getEngineeringVolatilityHandler   = extractHandler(router, 'GET',  '/:id/engineering-volatility');
const getMaturityHandler                = extractHandler(router, 'GET',  '/:id/maturity');
const getMaturityTrendHandler           = extractHandler(router, 'GET',  '/:id/maturity-trend');
const getArchitectureHandler            = extractHandler(router, 'GET',  '/:id/architecture');
const postRegisterHandler               = extractHandler(router, 'POST', '/register');
const postSyncHandler                   = extractHandler(router, 'POST', '/sync');

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

// ── GET /:id/engineering-volatility ──────────────────────────────────────────

describe('repoRoutes GET /:id/engineering-volatility', () => {
  const MOCK_VOLATILITY_RESULT = {
    volatilityLevel:  'medium',
    volatilityScore:  25,
    signals:          ['anomaly_recurrence'],
    reasons:          ["'score_spike' recurred 2 times"],
    confidenceLevel:  'medium',
  };

  const MOCK_PR_HEALTH_SCORE = {
    score:           0,
    label:           'none',
    reasons:         [],
    signals:         [],
    confidenceLevel: 'high',
  };

  const MOCK_PR_ROW_EV = {
    openPrCount:          0,
    mergedPrCount30d:     0,
    stalePrCount:         0,
    avgMergeLatencyHours: null,
    failedCheckPrCount:   0,
    avgPrSize:            null,
    throughput30d:        null,
    abandonedPrCount:     0,
    oldestOpenPrAgeDays:  null,
    prTelemetryStatus:    'none',
  };

  beforeEach(() => {
    detectEngineeringVolatility.mockReset();
    detectEngineeringVolatility.mockReturnValue(MOCK_VOLATILITY_RESULT);
    scorePullRequestHealth.mockReset();
    scorePullRequestHealth.mockReturnValue(MOCK_PR_HEALTH_SCORE);
  });

  function makeVolatilityDb({ riskRows = [], metricsRows = [], prRows = [] } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM risk_scores'))     return { rows: riskRows };
        if (sql.includes('FROM repo_metrics'))    return { rows: metricsRows };
        if (sql.includes('FROM repo_pr_metrics')) return { rows: prRows };
        return { rows: [] };
      }),
    };
  }

  it('returns 200 with detectEngineeringVolatility result on success', async () => {
    const db  = makeVolatilityDb({ riskRows: [{ score: 45, label: 'monitor' }] });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_VOLATILITY_RESULT);
  });

  it('returns 400 for a non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('risk_scores SQL scopes to req.user.userId', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const riskCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(riskCall[0]).toMatch(/r\.user_id/);
    expect(riskCall[1]).toContain(MOCK_USER.userId);
  });

  it('repo_metrics SQL scopes to req.user.userId', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_metrics'));
    expect(metricsCall[0]).toMatch(/r\.user_id/);
    expect(metricsCall[1]).toContain(MOCK_USER.userId);
  });

  it('risk_scores SQL filters active repos', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const riskCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(riskCall[0]).toContain('is_active');
  });

  it('repo_metrics SQL filters active repos', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_metrics'));
    expect(metricsCall[0]).toContain('is_active');
  });

  it('repo_pr_metrics SQL filters active repos', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const prCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_pr_metrics'));
    expect(prCall[0]).toContain('is_active');
  });

  it('passes riskHistory rows from DB directly to detectEngineeringVolatility', async () => {
    const riskRows = [{ score: 70, label: 'critical' }, { score: 45, label: 'monitor' }];
    const db  = makeVolatilityDb({ riskRows });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(detectEngineeringVolatility).toHaveBeenCalledWith(
      expect.objectContaining({ riskHistory: riskRows })
    );
  });

  it('passes metricsHistory rows from DB directly to detectEngineeringVolatility', async () => {
    const metricsRows = [{ ciStatus: 'passing' }, { ciStatus: 'failing' }];
    const db  = makeVolatilityDb({ metricsRows });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(detectEngineeringVolatility).toHaveBeenCalledWith(
      expect.objectContaining({ metricsHistory: metricsRows })
    );
  });

  it('calls scorePullRequestHealth once per repo_pr_metrics row', async () => {
    const prRows = [MOCK_PR_ROW_EV, MOCK_PR_ROW_EV, MOCK_PR_ROW_EV];
    const db  = makeVolatilityDb({ prRows });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledTimes(prRows.length);
  });

  it('passes prHealthHistory (mapped through scorePullRequestHealth) to detectEngineeringVolatility', async () => {
    const prRows = [MOCK_PR_ROW_EV];
    const db  = makeVolatilityDb({ prRows });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(detectEngineeringVolatility).toHaveBeenCalledWith(
      expect.objectContaining({ prHealthHistory: [MOCK_PR_HEALTH_SCORE] })
    );
  });

  it('calls detectEngineeringVolatility with anomalyHistory: [] (v1 behaviour)', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(detectEngineeringVolatility).toHaveBeenCalledWith(
      expect.objectContaining({ anomalyHistory: [] })
    );
  });

  it('returns helper result when all histories are empty (no-data → low volatility)', async () => {
    const LOW_RESULT = { volatilityLevel: 'low', volatilityScore: 0, signals: [], reasons: [], confidenceLevel: 'low' };
    detectEngineeringVolatility.mockReturnValue(LOW_RESULT);
    const db  = makeVolatilityDb({ riskRows: [], metricsRows: [], prRows: [] });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(LOW_RESULT);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes empty prHealthHistory when repo_pr_metrics returns no rows', async () => {
    const db  = makeVolatilityDb({ prRows: [] });
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(detectEngineeringVolatility).toHaveBeenCalledWith(
      expect.objectContaining({ prHealthHistory: [] })
    );
  });

  it('forwards DB error to next', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('response shape has volatilityLevel, volatilityScore, signals, reasons, confidenceLevel', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('volatilityLevel');
    expect(body).toHaveProperty('volatilityScore');
    expect(body).toHaveProperty('signals');
    expect(body).toHaveProperty('reasons');
    expect(body).toHaveProperty('confidenceLevel');
  });

  it('risk_scores query uses LIMIT 10', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const riskCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(riskCall[0]).toContain('LIMIT 10');
  });

  it('repo_metrics query uses LIMIT 10', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_metrics'));
    expect(metricsCall[0]).toContain('LIMIT 10');
  });

  it('repo_pr_metrics query uses LIMIT 10', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '9' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    const prCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_pr_metrics'));
    expect(prCall[0]).toContain('LIMIT 10');
  });

  it('all three queries include the parsed repoId in their params', async () => {
    const db  = makeVolatilityDb();
    const req = makeReq({ params: { id: '42' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getEngineeringVolatilityHandler(req, res, next);
    for (const [, params] of db.query.mock.calls) {
      expect(params).toContain(42);
    }
  });
});

// ── GET /:id/maturity ─────────────────────────────────────────────────────────

describe('repoRoutes GET /:id/maturity', () => {
  const MOCK_MATURITY = {
    maturityScore:   72,
    maturityLevel:   'developing',
    dimensions: {
      ciMaturity:          20,
      releaseMaturity:     10,
      contributorMaturity: 20,
      activityMaturity:    10,
      prWorkflowMaturity:  6,
      telemetryMaturity:   6,
    },
    gaps:            ['No releases in the last 90 days'],
    recommendations: ['Review release cadence — no tagged release in over 90 days'],
    confidenceLevel: 'high',
  };

  const MOCK_METRICS_ROW = {
    lastSyncedAt:      '2026-05-20T12:00:00.000Z',
    ciStatus:          'passing',
    commits7d:         5,
    lastPushAt:        '2026-05-24T10:00:00.000Z',
    releaseStatus:     'stale',
    contributorStatus: 'healthy',
  };

  const MOCK_PR_ROW    = { prTelemetryStatus: 'active' };
  const MOCK_COUNT_ROW = { snapshotCount: 8 };

  beforeEach(() => {
    scoreRepositoryMaturity.mockReturnValue(MOCK_MATURITY);
  });

  // Dispatches all three queries based on SQL content:
  //   - FROM repo_pr_metrics  → PR row
  //   - FROM risk_scores      → count row
  //   - default               → main repo+metrics query (FROM repositories r LEFT JOIN LATERAL)
  function makeMaturityDb({
    metricsRows = [MOCK_METRICS_ROW],
    prRows      = [MOCK_PR_ROW],
    countRows   = [MOCK_COUNT_ROW],
  } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM repo_pr_metrics')) return { rows: prRows };
        if (sql.includes('FROM risk_scores'))     return { rows: countRows };
        return { rows: metricsRows };
      }),
    };
  }

  it('returns 200 with the scoreRepositoryMaturity result on success', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_MATURITY);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('returns 400 for a non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 404 when repo is not found, inactive, or not owned by user', async () => {
    const db  = makeMaturityDb({ metricsRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('main SQL query scopes to r.user_id', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const mainCall = db.query.mock.calls.find(c => c[0].includes('last_synced_at'));
    expect(mainCall[0]).toMatch(/r\.user_id/);
    expect(mainCall[1]).toContain(MOCK_USER.userId);
  });

  it('main SQL query filters r.is_active = true', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const mainCall = db.query.mock.calls.find(c => c[0].includes('last_synced_at'));
    expect(mainCall[0]).toContain('is_active');
  });

  it('main SQL query loads latest repo_metrics (snapshot_at DESC, LIMIT 1)', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const mainCall = db.query.mock.calls.find(c => c[0].includes('last_synced_at'));
    expect(mainCall[0]).toContain('snapshot_at DESC');
    expect(mainCall[0]).toContain('LIMIT 1');
  });

  it('PR query loads latest repo_pr_metrics (snapshot_at DESC, LIMIT 1)', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const prCall = db.query.mock.calls.find(c => c[0].includes('FROM repo_pr_metrics'));
    expect(prCall[0]).toContain('snapshot_at DESC');
    expect(prCall[0]).toContain('LIMIT 1');
  });

  it('risk_scores count query is used for snapshotCount', async () => {
    const db  = makeMaturityDb({ countRows: [{ snapshotCount: 12 }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const countCall = db.query.mock.calls.find(c => c[0].includes('FROM risk_scores'));
    expect(countCall[0]).toMatch(/COUNT/i);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotCount: 12 })
    );
  });

  it('null ciStatus in metrics row normalises to "unknown"', async () => {
    const db  = makeMaturityDb({ metricsRows: [{ ...MOCK_METRICS_ROW, ciStatus: null }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'unknown' })
    );
  });

  it('null releaseStatus and contributorStatus normalise to "unknown"', async () => {
    const db  = makeMaturityDb({
      metricsRows: [{ ...MOCK_METRICS_ROW, releaseStatus: null, contributorStatus: null }],
    });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ releaseStatus: 'unknown', contributorStatus: 'unknown' })
    );
  });

  it('null commits7d remains null (not coerced to 0)', async () => {
    const db  = makeMaturityDb({ metricsRows: [{ ...MOCK_METRICS_ROW, commits7d: null }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ commits7d: null })
    );
  });

  it('prTelemetryStatus defaults to "unknown" when no repo_pr_metrics row exists', async () => {
    const db  = makeMaturityDb({ prRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ prTelemetryStatus: 'unknown' })
    );
  });

  it('snapshotCount defaults to 0 when risk_scores count query returns empty', async () => {
    const db  = makeMaturityDb({ countRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotCount: 0 })
    );
  });

  it('scoreRepositoryMaturity called with fully normalised telemetry from all three queries', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({
        ciStatus:                  MOCK_METRICS_ROW.ciStatus,
        releaseStatus:             MOCK_METRICS_ROW.releaseStatus,
        contributorStatus:         MOCK_METRICS_ROW.contributorStatus,
        commits7d:                 MOCK_METRICS_ROW.commits7d,
        prTelemetryStatus:         MOCK_PR_ROW.prTelemetryStatus,
        dependencyTelemetryStatus: 'unknown',
        snapshotCount:             MOCK_COUNT_ROW.snapshotCount,
        lastSyncedAt:              MOCK_METRICS_ROW.lastSyncedAt,
      })
    );
  });

  it('all three queries include the parsed repoId in their params', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '42' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    for (const [, params] of db.query.mock.calls) {
      expect(params).toContain(42);
    }
  });

  it('forwards DB error to next', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('response shape has maturityScore, maturityLevel, dimensions, gaps, recommendations, confidenceLevel', async () => {
    const db  = makeMaturityDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('maturityScore');
    expect(body).toHaveProperty('maturityLevel');
    expect(body).toHaveProperty('dimensions');
    expect(body).toHaveProperty('gaps');
    expect(body).toHaveProperty('recommendations');
    expect(body).toHaveProperty('confidenceLevel');
  });
});

// ── GET /:id/maturity-trend ───────────────────────────────────────────────────

describe('repoRoutes GET /:id/maturity-trend', () => {
  const MOCK_METRICS_ROW = {
    repoSyncedAt:      '2026-05-20T12:00:00.000Z',
    snapshotAt:        '2026-05-24T10:00:00.000Z',
    ciStatus:          'passing',
    commits7d:         5,
    lastPushAt:        '2026-05-24T09:00:00.000Z',
    releaseStatus:     'stale',
    contributorStatus: 'healthy',
  };

  const MOCK_PR_ROW    = { prTelemetryStatus: 'active' };
  const MOCK_COUNT_ROW = { snapshotCount: 8 };

  const MOCK_MATURITY = {
    maturityScore:   72,
    maturityLevel:   'developing',
    dimensions: {
      ciMaturity:          20,
      releaseMaturity:     10,
      contributorMaturity: 20,
      activityMaturity:    10,
      prWorkflowMaturity:  6,
      telemetryMaturity:   6,
    },
    gaps:            [],
    recommendations: [],
    confidenceLevel: 'medium',
  };

  const MOCK_TREND = {
    trend:           'improving',
    delta:           15,
    latestScore:     72,
    oldestScore:     57,
    confidenceLevel: 'low',
    summary:         'Repository maturity is improving (+15 points over 2 snapshots, current score 72).',
    dimensionDeltas: {
      ciMaturity: 5, releaseMaturity: 2, contributorMaturity: 0,
      activityMaturity: 5, prWorkflowMaturity: 2, telemetryMaturity: 1,
    },
    recurringGaps:   [],
    resolvedGaps:    [],
    emergingGaps:    [],
  };

  beforeEach(() => {
    scoreRepositoryMaturity.mockClear();
    getRepositoryMaturityTrend.mockClear();
    scoreRepositoryMaturity.mockReturnValue(MOCK_MATURITY);
    getRepositoryMaturityTrend.mockReturnValue(MOCK_TREND);
  });

  // Dispatches all three queries based on SQL content:
  //   - FROM repo_pr_metrics  → PR row
  //   - FROM risk_scores      → count row
  //   - default               → metrics history (FROM repositories r LEFT JOIN repo_metrics m)
  function makeTrendDb({
    metricsRows = [MOCK_METRICS_ROW],
    prRows      = [MOCK_PR_ROW],
    countRows   = [MOCK_COUNT_ROW],
  } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('FROM repo_pr_metrics')) return { rows: prRows };
        if (sql.includes('FROM risk_scores'))     return { rows: countRows };
        return { rows: metricsRows };
      }),
    };
  }

  it('returns 200 with trend and history on success', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('trend');
    expect(body).toHaveProperty('history');
  });

  it('returns 400 for a non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 404 when repo is not found, inactive, or not owned by user', async () => {
    const db  = makeTrendDb({ metricsRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('metrics SQL query scopes to r.user_id', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('repo_metrics'));
    expect(metricsCall[0]).toMatch(/r\.user_id/);
    expect(metricsCall[1]).toContain(MOCK_USER.userId);
  });

  it('metrics SQL query filters r.is_active = true', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('repo_metrics'));
    expect(metricsCall[0]).toContain('is_active');
  });

  it('metrics SQL query is ordered newest-first and limited to 10', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('repo_metrics'));
    expect(metricsCall[0]).toContain('snapshot_at DESC');
    expect(metricsCall[0]).toContain('LIMIT 10');
  });

  it('returns unknown trend with empty history when repo has no metrics yet', async () => {
    const db  = makeTrendDb({ metricsRows: [{ ...MOCK_METRICS_ROW, snapshotAt: null }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(getRepositoryMaturityTrend).toHaveBeenCalledWith([]);
    const body = res.json.mock.calls[0][0];
    expect(body.history).toEqual([]);
  });

  it('scoreRepositoryMaturity called once per metrics row', async () => {
    const rows = [
      MOCK_METRICS_ROW,
      { ...MOCK_METRICS_ROW, snapshotAt: '2026-05-10T10:00:00.000Z' },
    ];
    const db  = makeTrendDb({ metricsRows: rows });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledTimes(rows.length);
  });

  it('getRepositoryMaturityTrend called with array of scored snapshots including snapshotAt', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(getRepositoryMaturityTrend).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          maturityScore: MOCK_MATURITY.maturityScore,
          snapshotAt:    MOCK_METRICS_ROW.snapshotAt,
        }),
      ])
    );
  });

  it('history items contain snapshotAt, maturityScore, maturityLevel, confidenceLevel, dimensions', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.history).toHaveLength(1);
    const item = body.history[0];
    expect(item).toHaveProperty('snapshotAt');
    expect(item).toHaveProperty('maturityScore');
    expect(item).toHaveProperty('maturityLevel');
    expect(item).toHaveProperty('confidenceLevel');
    expect(item).toHaveProperty('dimensions');
  });

  it('null ciStatus in metrics row normalises to "unknown" before scoring', async () => {
    const db  = makeTrendDb({ metricsRows: [{ ...MOCK_METRICS_ROW, ciStatus: null }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'unknown' })
    );
  });

  it('null commits7d remains null (not coerced to 0)', async () => {
    const db  = makeTrendDb({ metricsRows: [{ ...MOCK_METRICS_ROW, commits7d: null }] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ commits7d: null })
    );
  });

  it('prTelemetryStatus defaults to "unknown" when no repo_pr_metrics row exists', async () => {
    const db  = makeTrendDb({ prRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ prTelemetryStatus: 'unknown' })
    );
  });

  it('response shape includes all trend fields plus history', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('trend');
    expect(body).toHaveProperty('delta');
    expect(body).toHaveProperty('latestScore');
    expect(body).toHaveProperty('oldestScore');
    expect(body).toHaveProperty('confidenceLevel');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('dimensionDeltas');
    expect(body).toHaveProperty('recurringGaps');
    expect(body).toHaveProperty('resolvedGaps');
    expect(body).toHaveProperty('emergingGaps');
    expect(body).toHaveProperty('history');
  });

  it('all three queries include the parsed repoId in their params', async () => {
    const db  = makeTrendDb();
    const req = makeReq({ params: { id: '42' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    for (const [, params] of db.query.mock.calls) {
      expect(params).toContain(42);
    }
  });

  it('forwards DB error to next', async () => {
    const db  = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getMaturityTrendHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── GET /:id/architecture ─────────────────────────────────────────────────────

describe('repoRoutes GET /:id/architecture', () => {
  const MOCK_REPO_ROW = { id: 7, fullName: 'owner/repo' };

  const MOCK_SNAPSHOT = {
    repoId:                   7,
    repoName:                 'owner/repo',
    defaultBranch:            'main',
    snapshotAt:               '2026-05-26T00:00:00.000Z',
    architectureHealthScore:  80,
    architectureHealthLevel:  'watch',
    confidenceLevel:          'high',
    summary:                  'Architecture structure is mostly coherent.',
    inventory:                {},
    dependencyGraph:          {},
    routeApiStructure:        {},
    apiLinkage:               {},
    boundaryVerification:     {},
    implementationCompleteness: {},
    topFindings:              [],
    recommendations:          [],
    metrics:                  {},
  };

  const MOCK_FILES = [
    { path: 'src/index.js', content: 'console.log("hi");', sizeBytes: 18, language: 'javascript', lastModified: null },
  ];

  // Two-query dispatch: repo ownership check, then token lookup
  function makeArchitectureDb({
    repoRows  = [MOCK_REPO_ROW],
    tokenRows = [{ access_token_enc: 'enc_token' }],
  } = {}) {
    return {
      query: jest.fn(async (sql) => {
        if (sql.includes('access_token_enc')) return { rows: tokenRows };
        return { rows: repoRows };
      }),
    };
  }

  beforeEach(() => {
    decrypt.mockReturnValue('raw_token');
    fetchRepositoryFiles.mockResolvedValue(MOCK_FILES);
    buildRepositoryArchitectureSnapshot.mockReturnValue(MOCK_SNAPSHOT);
  });

  it('returns 400 for a non-numeric id', async () => {
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 404 when repo is not found or not owned by user', async () => {
    const db  = makeArchitectureDb({ repoRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('repo query includes repoId and userId as params', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '42' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    const repoCall = db.query.mock.calls.find(c => !c[0].includes('access_token_enc'));
    expect(repoCall[1]).toContain(42);
    expect(repoCall[1]).toContain(MOCK_USER.userId);
  });

  it('repo query filters by is_active = true', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    const repoCall = db.query.mock.calls.find(c => !c[0].includes('access_token_enc'));
    expect(repoCall[0]).toContain('is_active');
  });

  it('returns unknown snapshot with _warning when tokenEncryptionKey is absent', async () => {
    const db     = makeArchitectureDb();
    const config = {};
    const req    = makeReq({ params: { id: '7' }, app: { locals: { db, config, fetchFn: jest.fn() } } });
    const res    = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('_warning');
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ files: [] })
    );
  });

  it('returns unknown snapshot with _warning when no access_token_enc in users row', async () => {
    const db  = makeArchitectureDb({ tokenRows: [] });
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('_warning');
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ files: [] })
    );
  });

  it('returns unknown snapshot with _warning when fetchFn is null', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: null } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('_warning');
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ files: [] })
    );
  });

  it('calls fetchRepositoryFiles with accessToken, fullName, branch, and fetchFn', async () => {
    const db      = makeArchitectureDb();
    const fetchFn = jest.fn();
    const req     = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn } } });
    const res     = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(fetchRepositoryFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        accessToken: 'raw_token',
        fullName:    MOCK_REPO_ROW.fullName,
        branch:      'main',
        fetchFn,
      })
    );
  });

  it('passes files from fetchRepositoryFiles to buildRepositoryArchitectureSnapshot', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ files: MOCK_FILES })
    );
  });

  it('calls buildRepositoryArchitectureSnapshot with repoId, repoName, and defaultBranch', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        repoId:        7,
        repoName:      MOCK_REPO_ROW.fullName,
        defaultBranch: 'main',
      })
    );
  });

  it('returns 502 when fetchRepositoryFiles throws TREE_FETCH_FAILED', async () => {
    const fetchErr = new Error('tree fail');
    fetchErr.code  = 'TREE_FETCH_FAILED';
    fetchRepositoryFiles.mockRejectedValue(fetchErr);
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('returns 502 when fetchRepositoryFiles throws any other error', async () => {
    fetchRepositoryFiles.mockRejectedValue(new Error('network error'));
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
  });

  it('response shape has architectureHealthScore, architectureHealthLevel, confidenceLevel, summary, metrics', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('architectureHealthScore');
    expect(body).toHaveProperty('architectureHealthLevel');
    expect(body).toHaveProperty('confidenceLevel');
    expect(body).toHaveProperty('summary');
    expect(body).toHaveProperty('metrics');
  });

  it('access token is not present in the response body', async () => {
    const db  = makeArchitectureDb();
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(JSON.stringify(body)).not.toContain('raw_token');
    expect(JSON.stringify(body)).not.toContain('enc_token');
  });

  it('forwards DB error to next', async () => {
    const db  = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ params: { id: '7' }, app: { locals: { db, config: MOCK_CONFIG, fetchFn: jest.fn() } } });
    const res = makeRes();
    await getArchitectureHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
