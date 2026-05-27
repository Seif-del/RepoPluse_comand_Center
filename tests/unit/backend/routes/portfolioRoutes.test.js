'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/risk/getPortfolioForecast');
jest.mock('../../../../execution/risk/getAttentionQueue');
jest.mock('../../../../execution/risk/buildExecutiveSummary');
jest.mock('../../../../execution/risk/getPortfolioHistory');
jest.mock('../../../../execution/risk/getOperationalChanges');
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => next());
jest.mock('../../../../execution/risk/detectOperationalAnomalies');
jest.mock('../../../../execution/risk/clusterOperationalAnomalies');
jest.mock('../../../../execution/risk/buildTelemetryCoverageSummary');
jest.mock('../../../../execution/risk/buildBehavioralStabilityIndex');
jest.mock('../../../../execution/risk/scorePullRequestHealth');
jest.mock('../../../../execution/risk/scoreRepositoryMaturity');
jest.mock('../../../../execution/risk/buildPortfolioMaturityIndex');
jest.mock('../../../../execution/architecture/buildPortfolioArchitectureIntelligence');

// ── Imports ───────────────────────────────────────────────────────────────────

const router                      = require('../../../../backend/routes/portfolioRoutes');
const { getPortfolioForecast }    = require('../../../../execution/risk/getPortfolioForecast');
const { getAttentionQueue }       = require('../../../../execution/risk/getAttentionQueue');
const { buildExecutiveSummary }   = require('../../../../execution/risk/buildExecutiveSummary');
const { buildPortfolioHistory }   = require('../../../../execution/risk/getPortfolioHistory');
const { getOperationalChanges }      = require('../../../../execution/risk/getOperationalChanges');
const { detectOperationalAnomalies }  = require('../../../../execution/risk/detectOperationalAnomalies');
const { clusterOperationalAnomalies }        = require('../../../../execution/risk/clusterOperationalAnomalies');
const { buildTelemetryCoverageSummary }      = require('../../../../execution/risk/buildTelemetryCoverageSummary');
const { buildBehavioralStabilityIndex }      = require('../../../../execution/risk/buildBehavioralStabilityIndex');
const { scorePullRequestHealth }             = require('../../../../execution/risk/scorePullRequestHealth');
const { scoreRepositoryMaturity }            = require('../../../../execution/risk/scoreRepositoryMaturity');
const { buildPortfolioMaturityIndex }        = require('../../../../execution/risk/buildPortfolioMaturityIndex');
const { buildPortfolioArchitectureIntelligence } = require('../../../../execution/architecture/buildPortfolioArchitectureIntelligence');

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

const getForecastHandler       = extractHandler(router, 'GET', '/forecast');
const getExecSummaryHandler    = extractHandler(router, 'GET', '/executive-summary');
const getHistoryHandler        = extractHandler(router, 'GET', '/history');
const getChangesHandler           = extractHandler(router, 'GET', '/changes');
const getAnomaliesHandler         = extractHandler(router, 'GET', '/anomalies');
const getAnomalyClustersHandler      = extractHandler(router, 'GET', '/anomaly-clusters');
const getTelemetryCoverageHandler       = extractHandler(router, 'GET', '/telemetry-coverage');
const getBehavioralStabilityHandler     = extractHandler(router, 'GET', '/behavioral-stability');
const getPortfolioMaturityHandler            = extractHandler(router, 'GET', '/maturity');
const getPortfolioArchitectureHandler        = extractHandler(router, 'GET', '/architecture');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const MOCK_USER   = { userId: 1 };
const MOCK_RESULT = {
  portfolioTrajectory: 'deteriorating',
  portfolioRiskLevel:  'high',
  summary:             '3 repositories are deteriorating — operational decline is spreading.',
  counts:              { escalating: 0, deteriorating: 3, volatile: 0, recovering: 1, stable: 4, unknown: 0 },
  signals:             ['3 repositories are deteriorating'],
};

function makeReq(overrides = {}) {
  return {
    user:   MOCK_USER,
    params: {},
    body:   {},
    app: {
      locals: {
        db: makeDb(),
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

function makeDb(rows = []) {
  return { query: jest.fn(async () => ({ rows })) };
}

// ── GET /forecast ─────────────────────────────────────────────────────────────

describe('portfolioRoutes GET /forecast', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPortfolioForecast.mockReturnValue(MOCK_RESULT);
  });

  it('returns the forecast object from getPortfolioForecast', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_RESULT);
  });

  it('calls getPortfolioForecast with an array of repo summaries', async () => {
    const rows = [
      { repoId: 1, label: 'critical', trend: 'worsening', recentLabels: ['critical', 'critical', 'critical'] },
      { repoId: 2, label: 'healthy',  trend: 'stable',    recentLabels: ['healthy'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(getPortfolioForecast).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ repoId: 1, trajectory: 'escalating' }),
        expect.objectContaining({ repoId: 2, trajectory: 'stable' }),
      ])
    );
  });

  it('passes empty array when no active repos exist', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(getPortfolioForecast).toHaveBeenCalledWith([]);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('SQL query targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL query filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL query fetches up to 3 recent risk labels for persistentRisk derivation', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('LIMIT  3');
  });

  // ── Trajectory derivation ────────────────────────────────────────────────────

  it('derives trajectory=escalating for critical+worsening label/trend', async () => {
    const rows = [
      { repoId: 1, label: 'critical', trend: 'worsening', recentLabels: [] },
      { repoId: 2, label: 'critical', trend: 'worsening', recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg.every(r => r.trajectory === 'escalating')).toBe(true);
  });

  it('derives trajectory=deteriorating for at-risk+worsening', async () => {
    const rows = [
      { repoId: 1, label: 'at-risk', trend: 'worsening', recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].trajectory).toBe('deteriorating');
  });

  it('derives trajectory=recovering for improving trend', async () => {
    const rows = [
      { repoId: 1, label: 'healthy', trend: 'improving', recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].trajectory).toBe('recovering');
  });

  it('derives trajectory=stable for stable trend', async () => {
    const rows = [
      { repoId: 1, label: 'healthy', trend: 'stable', recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].trajectory).toBe('stable');
  });

  it('derives trajectory=unknown when label or trend is missing', async () => {
    const rows = [
      { repoId: 1, label: null, trend: null, recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].trajectory).toBe('unknown');
  });

  it('derives persistentRisk=true when 3 recent labels are all at-risk/critical', async () => {
    const rows = [
      { repoId: 1, label: 'at-risk', trend: 'stable', recentLabels: ['at-risk', 'critical', 'at-risk'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].persistentRisk).toBe(true);
  });

  it('derives persistentRisk=false when fewer than 3 recent labels', async () => {
    const rows = [
      { repoId: 1, label: 'at-risk', trend: 'stable', recentLabels: ['at-risk', 'critical'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].persistentRisk).toBe(false);
  });

  it('derives persistentRisk=false when any of 3 recent labels is healthy', async () => {
    const rows = [
      { repoId: 1, label: 'at-risk', trend: 'stable', recentLabels: ['at-risk', 'healthy', 'at-risk'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getForecastHandler(req, res, next);
    const arg = getPortfolioForecast.mock.calls[0][0];
    expect(arg[0].persistentRisk).toBe(false);
  });
});

// ── GET /executive-summary ────────────────────────────────────────────────────

const MOCK_EXEC_SUMMARY = {
  severity:        'high',
  headline:        'Operational instability increasing',
  summary:         'CI failures continue to elevate operational risk across the portfolio.',
  themes:          ['CI instability affecting 2 repositories'],
  recommendations: ['Stabilize failing CI pipelines'],
};

describe('portfolioRoutes GET /executive-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getPortfolioForecast.mockReturnValue({
      portfolioTrajectory: 'deteriorating',
      portfolioRiskLevel:  'high',
      counts:              { escalating: 0, deteriorating: 2, volatile: 0, recovering: 0, stable: 3, unknown: 0 },
      signals:             [],
    });
    getAttentionQueue.mockReturnValue([
      { repoId: 1, attentionLevel: 'high',   attentionScore: 50, reasons: ['CI pipeline is failing'] },
      { repoId: 2, attentionLevel: 'medium', attentionScore: 30, reasons: ['Stale release cadence'] },
    ]);
    buildExecutiveSummary.mockReturnValue(MOCK_EXEC_SUMMARY);
  });

  it('returns the executive summary from buildExecutiveSummary', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_EXEC_SUMMARY);
  });

  it('calls getPortfolioForecast with mapped repo array', async () => {
    const rows = [
      { repoId: 1, fullName: 'org/repo1', ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
        score: 75, label: 'critical', trend: 'worsening', recentLabels: ['critical', 'critical', 'critical'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(getPortfolioForecast).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ repoId: 1, trajectory: 'escalating', ciStatus: 'failing' }),
      ])
    );
  });

  it('calls getAttentionQueue with the same mapped repo array', async () => {
    const rows = [
      { repoId: 2, fullName: 'org/repo2', ciStatus: 'passing', releaseStatus: 'stale',
        contributorStatus: 'bus_factor_risk', score: 55, label: 'at-risk', trend: 'stable', recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(getAttentionQueue).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ repoId: 2, releaseStatus: 'stale' }),
      ])
    );
  });

  it('calls buildExecutiveSummary with portfolioForecast, repos, and attentionMap', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(buildExecutiveSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        portfolioForecast: expect.any(Object),
        repos:             expect.any(Array),
        attentionMap:      expect.any(Object),
      })
    );
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('SQL query targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL query filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL query joins repo_metrics for CI, release, and contributor status', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('ci_status');
    expect(sql).toContain('release_status');
    expect(sql).toContain('contributor_status');
  });

  it('SQL query selects github_full_name (not full_name) aliased as fullName', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('github_full_name');
    expect(sql).not.toContain('r.full_name');
  });

  it('attentionMap passed to buildExecutiveSummary is keyed by repoId', async () => {
    getAttentionQueue.mockReturnValue([
      { repoId: 7, attentionLevel: 'critical', attentionScore: 80, reasons: [] },
    ]);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const callArg = buildExecutiveSummary.mock.calls[0][0];
    expect(callArg.attentionMap[7]).toBeDefined();
    expect(callArg.attentionMap[7].attentionLevel).toBe('critical');
  });

  it('handles empty repo list gracefully', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_EXEC_SUMMARY);
    expect(next).not.toHaveBeenCalled();
  });

  it('maps repo row with missing metrics to unknown statuses', async () => {
    const rows = [
      { repoId: 3, fullName: 'org/repo3', ciStatus: null, releaseStatus: null,
        contributorStatus: null, score: null, label: null, trend: null, recentLabels: [] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getExecSummaryHandler(req, res, next);
    const callArg = getPortfolioForecast.mock.calls[0][0];
    expect(callArg[0].ciStatus).toBe('unknown');
    expect(callArg[0].trajectory).toBe('unknown');
  });
});

// ── GET /history ──────────────────────────────────────────────────────────────

const MOCK_HISTORY = [
  { snapshotAt: '2025-06-15T10:00:00.000Z', portfolioScore: 45, portfolioLevel: 'at-risk',  repoCount: 4 },
  { snapshotAt: '2025-06-15T09:00:00.000Z', portfolioScore: 20, portfolioLevel: 'monitor',   repoCount: 3 },
  { snapshotAt: '2025-06-15T08:00:00.000Z', portfolioScore: 5,  portfolioLevel: 'healthy',   repoCount: 3 },
];

describe('portfolioRoutes GET /history', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildPortfolioHistory.mockReturnValue(MOCK_HISTORY);
  });

  it('returns the array produced by buildPortfolioHistory', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_HISTORY);
  });

  it('passes DB rows to buildPortfolioHistory', async () => {
    const dbRows = [
      { snapshotAt: '2025-06-15T10:00:00.000Z', portfolioScore: 45, repoCount: 4 },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(dbRows) } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    expect(buildPortfolioHistory).toHaveBeenCalledWith(dbRows);
  });

  it('returns [] when buildPortfolioHistory returns empty array', async () => {
    buildPortfolioHistory.mockReturnValue([]);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('SQL query targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL query filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL query groups by hour using DATE_TRUNC', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/DATE_TRUNC\s*\(\s*'hour'/i);
  });

  it('SQL query orders results newest-first (DESC)', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/ORDER\s+BY.+DESC/is);
  });

  it('SQL query applies LIMIT 30', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('LIMIT 30');
  });

  it('SQL query aggregates score with AVG across repos', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/AVG\s*\(/i);
  });

  it('SQL query counts distinct repos per snapshot window', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/COUNT\s*\(\s*DISTINCT/i);
  });

  it('SQL reads from risk_scores and repositories — no seed/demo data source', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getHistoryHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    // Confirms the route aggregates persisted risk_score rows from the real DB,
    // not from static JSON files or the legacy /history seed endpoint.
    expect(sql).toContain('risk_scores');
    expect(sql).toContain('repositories');
  });
});

// ── GET /changes ──────────────────────────────────────────────────────────────

const MOCK_CHANGES = [
  {
    type: 'label_degraded', severity: 'critical',
    repoId: 1, repoName: 'org/api',
    summary: 'org/api degraded from Healthy to Critical',
    previousState: 'healthy', currentState: 'critical',
    detectedAt: '2025-06-01T12:00:00.000Z',
  },
];

describe('portfolioRoutes GET /changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getOperationalChanges.mockReturnValue(MOCK_CHANGES);
  });

  it('returns the array produced by getOperationalChanges', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_CHANGES);
  });

  it('returns [] when getOperationalChanges returns empty array', async () => {
    getOperationalChanges.mockReturnValue([]);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith([]);
  });

  it('calls getOperationalChanges with a repoPairs array', async () => {
    const rows = [
      {
        repoId: 1, repoName: 'org/api',
        currentScore: 80,   previousScore: 30,
        currentLabel: 'critical', previousLabel: 'healthy',
        currentTrend: 'worsening', previousTrend: 'stable',
        currentCiStatus: 'failing', previousCiStatus: 'passing',
        currentContributorStatus: 'healthy', previousContributorStatus: 'healthy',
        snapshotAt: '2025-06-01T12:00:00.000Z',
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    expect(getOperationalChanges).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          repoId:        1,
          repoName:      'org/api',
          currentLabel:  'critical',
          previousLabel: 'healthy',
        }),
      ])
    );
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('SQL targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL projects current and previous risk_score columns', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('rs_cur');
    expect(sql).toContain('rs_prev');
    expect(sql).toContain('risk_scores');
  });

  it('SQL projects current and previous repo_metric columns', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('rm_cur');
    expect(sql).toContain('rm_prev');
    expect(sql).toContain('repo_metrics');
  });

  it('SQL uses OFFSET 1 to select the previous snapshot', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toMatch(/OFFSET\s+1/i);
  });

  it('maps DB row nulls to null in repoPairs (not strings)', async () => {
    const rows = [
      {
        repoId: 5, repoName: 'org/svc',
        currentScore: null, previousScore: null,
        currentLabel: null, previousLabel: null,
        currentTrend: null, previousTrend: null,
        currentCiStatus: null, previousCiStatus: null,
        currentContributorStatus: null, previousContributorStatus: null,
        snapshotAt: null,
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const pair = getOperationalChanges.mock.calls[0][0][0];
    expect(pair.currentScore).toBeNull();
    expect(pair.currentLabel).toBeNull();
    expect(pair.currentCiStatus).toBeNull();
  });

  it('coerces numeric score strings to numbers in repoPairs', async () => {
    const rows = [
      {
        repoId: 3, repoName: 'org/db',
        currentScore: '75', previousScore: '40',
        currentLabel: 'critical', previousLabel: 'at-risk',
        currentTrend: 'worsening', previousTrend: 'stable',
        currentCiStatus: 'passing', previousCiStatus: 'passing',
        currentContributorStatus: 'healthy', previousContributorStatus: 'healthy',
        snapshotAt: '2025-06-01T12:00:00.000Z',
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getChangesHandler(req, res, next);
    const pair = getOperationalChanges.mock.calls[0][0][0];
    expect(typeof pair.currentScore).toBe('number');
    expect(pair.currentScore).toBe(75);
    expect(typeof pair.previousScore).toBe('number');
    expect(pair.previousScore).toBe(40);
  });
});

// ── GET /anomalies ────────────────────────────────────────────────────────────

const MOCK_ANOMALY = {
  type:              'score_spike',
  severity:          'high',
  title:             'Operational risk spike detected',
  summary:           'Risk score rose from a rolling average of 30 to 70 (delta +40).',
  affectedRepos:     ['org/api'],
  detectedAt:        '2026-05-19T12:00:00.000Z',
  confidence:        { level: 'high', score: 75, rationale: '5 historical snapshots, 67% telemetry coverage, 1 confirming signal' },
  supportingMetrics: { currentScore: 70, rollingAverage: 30, delta: 40, historyDepth: 5 },
};

describe('portfolioRoutes GET /anomalies', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    detectOperationalAnomalies.mockReturnValue([MOCK_ANOMALY]);
  });

  it('returns anomaly array wrapped in { anomalies }', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ anomalies: [MOCK_ANOMALY] });
  });

  it('returns { anomalies: [] } when detectOperationalAnomalies returns empty array', async () => {
    detectOperationalAnomalies.mockReturnValue([]);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ anomalies: [] });
  });

  it('slices anomaly list to a maximum of 50', async () => {
    const many = Array.from({ length: 55 }, function(_, i) {
      return Object.assign({}, MOCK_ANOMALY, { title: 'anomaly ' + i });
    });
    detectOperationalAnomalies.mockReturnValue(many);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    expect(res.json.mock.calls[0][0].anomalies).toHaveLength(50);
  });

  it('calls detectOperationalAnomalies with repos and portfolioHistory derived from DB rows', async () => {
    const repoRows = [
      { repoId: 1, repoName: 'org/api', riskHistory: [{ score: 80, label: 'critical' }], metricsHistory: [{ ciStatus: 'failing' }] },
    ];
    const histRows = [
      { snapshotAt: '2026-05-19T10:00:00.000Z', portfolioScore: 50, repoCount: 1 },
    ];
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: repoRows })
        .mockResolvedValueOnce({ rows: histRows }),
    };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    expect(detectOperationalAnomalies).toHaveBeenCalledWith(
      expect.objectContaining({
        repos: expect.arrayContaining([
          expect.objectContaining({ repoId: 1, riskHistory: [{ score: 80, label: 'critical' }] }),
        ]),
        portfolioHistory: expect.arrayContaining([
          expect.objectContaining({ portfolioScore: 50, repoCount: 1 }),
        ]),
      })
    );
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('repo SQL targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('repo SQL filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('repo SQL fetches riskHistory from risk_scores (up to 10 snapshots per repo)', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('risk_scores');
    expect(sql).toContain('riskHistory');
    expect(sql).toContain('LIMIT  10');
  });

  it('repo SQL fetches metricsHistory from repo_metrics (up to 10 snapshots per repo)', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('repo_metrics');
    expect(sql).toContain('metricsHistory');
  });

  it('portfolio history SQL uses DATE_TRUNC grouping and LIMIT 30', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[1][0];
    expect(sql).toMatch(/DATE_TRUNC\s*\(\s*'hour'/i);
    expect(sql).toContain('LIMIT 30');
  });

  it('portfolio history SQL targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const sql = db.query.mock.calls[1][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[1][1]).toContain(MOCK_USER.userId);
  });

  it('maps metricsHistory null/missing arrays to []', async () => {
    const repoRows = [
      { repoId: 2, repoName: 'org/svc', riskHistory: null, metricsHistory: null },
    ];
    const db = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: repoRows })
        .mockResolvedValueOnce({ rows: [] }),
    };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomaliesHandler(req, res, next);
    const callArg = detectOperationalAnomalies.mock.calls[0][0];
    expect(callArg.repos[0].riskHistory).toEqual([]);
    expect(callArg.repos[0].metricsHistory).toEqual([]);
  });
});

// ── GET /anomaly-clusters ─────────────────────────────────────────────────────

const MOCK_CLUSTER = {
  clusterId:    'cluster_abc12345',
  clusterType:  'risk_acceleration_cluster',
  severity:     'high',
  title:        'Risk acceleration',
  summary:      'Operational risk accelerated: 1 anomaly across 1 repo.',
  anomalyCount: 1,
  affectedRepos: ['org/api'],
  timeWindow:   { start: '2026-05-19T12:00:00.000Z', end: '2026-05-19T12:00:00.000Z', durationMs: 0 },
  confidence:   { level: 'high', score: 75, rationale: 'Aggregated from 1 anomaly: 1 high, 0 medium, 0 low confidence' },
  anomalies:    [MOCK_ANOMALY],
};

describe('portfolioRoutes GET /anomaly-clusters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    detectOperationalAnomalies.mockReturnValue([MOCK_ANOMALY]);
    clusterOperationalAnomalies.mockReturnValue([MOCK_CLUSTER]);
  });

  it('returns cluster array wrapped in { clusters }', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ clusters: [MOCK_CLUSTER] });
  });

  it('returns { clusters: [] } when no anomalies are detected', async () => {
    detectOperationalAnomalies.mockReturnValue([]);
    clusterOperationalAnomalies.mockReturnValue([]);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith({ clusters: [] });
  });

  it('slices cluster list to a maximum of 20', async () => {
    const many = Array.from({ length: 25 }, function(_, i) {
      return Object.assign({}, MOCK_CLUSTER, { clusterId: 'cluster_' + i });
    });
    clusterOperationalAnomalies.mockReturnValue(many);
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    expect(res.json.mock.calls[0][0].clusters).toHaveLength(20);
  });

  it('passes detectOperationalAnomalies output directly to clusterOperationalAnomalies', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    expect(clusterOperationalAnomalies).toHaveBeenCalledWith([MOCK_ANOMALY]);
  });

  it('calls next on db error', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('SQL targets the authenticated user', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL filters to active repos only', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL fetches riskHistory and metricsHistory per repo', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getAnomalyClustersHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('riskHistory');
    expect(sql).toContain('metricsHistory');
    expect(sql).toContain('risk_scores');
    expect(sql).toContain('repo_metrics');
  });
});

// ── GET /telemetry-coverage ───────────────────────────────────────────────────

const MOCK_COVERAGE = {
  repoCount:             2,
  ciCoverage:            { percentage: 100, level: 'high'   },
  releaseCoverage:       { percentage: 100, level: 'high'   },
  contributorCoverage:   { percentage: 100, level: 'high'   },
  telemetryCompleteness: { percentage: 100, level: 'high'   },
  historicalDepth:       { averageSnapshots: 5, level: 'medium' },
  syncFreshness:         { staleCount: 0, stalePercentage: 0, level: 'high' },
  overallMaturity:       'high',
};

describe('portfolioRoutes GET /telemetry-coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildTelemetryCoverageSummary.mockReturnValue(MOCK_COVERAGE);
  });

  it('returns the coverage object from buildTelemetryCoverageSummary', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_COVERAGE);
  });

  it('calls buildTelemetryCoverageSummary with a mapped repo array', async () => {
    const rows = [
      {
        repoId: 1, ciStatus: 'passing', releaseStatus: 'healthy',
        contributorStatus: 'healthy', lastSyncedAt: '2026-05-19T10:00:00.000Z',
        snapshotCount: 7,
      },
      {
        repoId: 2, ciStatus: 'failing', releaseStatus: 'stale',
        contributorStatus: 'bus_factor_risk', lastSyncedAt: '2026-05-18T08:00:00.000Z',
        snapshotCount: 3,
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    expect(buildTelemetryCoverageSummary).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ ciStatus: 'passing', snapshotCount: 7 }),
        expect.objectContaining({ ciStatus: 'failing', snapshotCount: 3 }),
      ])
    );
  });

  it('passes empty array when no active repos exist', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    expect(buildTelemetryCoverageSummary).toHaveBeenCalledWith([]);
  });

  it('SQL targets the authenticated user (r.user_id = $1)', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL filters to active repos only (r.is_active = true)', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL joins repo_metrics for CI, release, and contributor status', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('ci_status');
    expect(sql).toContain('release_status');
    expect(sql).toContain('contributor_status');
    expect(sql).toContain('repo_metrics');
  });

  it('SQL derives snapshotCount from risk_scores for historical depth', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('snapshotCount');
    expect(sql).toContain('risk_scores');
  });

  it('maps snapshotCount to a number and passes it to the helper', async () => {
    const rows = [
      {
        repoId: 1, ciStatus: 'passing', releaseStatus: 'healthy',
        contributorStatus: 'healthy', lastSyncedAt: '2026-05-19T10:00:00.000Z',
        snapshotCount: '12', // DB may return as string
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const arg = buildTelemetryCoverageSummary.mock.calls[0][0];
    expect(typeof arg[0].snapshotCount).toBe('number');
    expect(arg[0].snapshotCount).toBe(12);
  });

  it('maps null telemetry fields to "unknown"', async () => {
    const rows = [
      {
        repoId: 1, ciStatus: null, releaseStatus: null,
        contributorStatus: null, lastSyncedAt: null, snapshotCount: 0,
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const arg = buildTelemetryCoverageSummary.mock.calls[0][0];
    expect(arg[0].ciStatus).toBe('unknown');
    expect(arg[0].releaseStatus).toBe('unknown');
    expect(arg[0].contributorStatus).toBe('unknown');
    expect(arg[0].lastSyncedAt).toBeNull();
  });

  it('maps null snapshotCount to 0', async () => {
    const rows = [
      {
        repoId: 1, ciStatus: 'passing', releaseStatus: 'healthy',
        contributorStatus: 'healthy', lastSyncedAt: '2026-05-19T10:00:00.000Z',
        snapshotCount: null,
      },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    const arg = buildTelemetryCoverageSummary.mock.calls[0][0];
    expect(arg[0].snapshotCount).toBe(0);
  });

  it('forwards DB errors to next', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getTelemetryCoverageHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});

// ── GET /behavioral-stability ─────────────────────────────────────────────────

const MOCK_PR_HEALTH = { label: 'healthy', score: 0, reasons: [], signals: [], confidenceLevel: 'high' };

const MOCK_BSI_RESULT = {
  indexScore:      85,
  stabilityLevel:  'stable',
  confidenceLevel: 'medium',
  summary:         'Portfolio behavioral signals are stable across 2 repositories.',
  drivers:         [],
  counts: { totalRepos: 2, escalatingRepos: 0, deterioratingRepos: 0,
            volatileRepos: 0, persistentRiskRepos: 0, prRiskRepos: 0,
            ciFailingRepos: 0, abandonedRepos: 0, improvingRepos: 0 },
};

// Full DB row with all optional fields populated for rich-input tests.
const FULL_REPO_ROW = {
  repoId: 1, fullName: 'org/repo1',
  ciStatus: 'passing', contributorStatus: 'healthy',
  label: 'at-risk', trend: 'worsening',
  recentLabels: ['at-risk', 'at-risk', 'at-risk'],
  openPrCount: 2, mergedPrCount30d: 5, stalePrCount: 1,
  avgMergeLatencyHours: 48, failedCheckPrCount: 0,
  avgPrSize: 150, throughput30d: 1.5, abandonedPrCount: 0,
  oldestOpenPrAgeDays: 8, prTelemetryStatus: 'active',
};

describe('portfolioRoutes GET /behavioral-stability', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    buildBehavioralStabilityIndex.mockReturnValue(MOCK_BSI_RESULT);
    scorePullRequestHealth.mockReturnValue(MOCK_PR_HEALTH);
  });

  it('returns direct buildBehavioralStabilityIndex output (no wrapper object)', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_BSI_RESULT);
  });

  it('calls buildBehavioralStabilityIndex with the normalized repositories array', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([FULL_REPO_ROW]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(buildBehavioralStabilityIndex).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id:            FULL_REPO_ROW.repoId,
          name:          FULL_REPO_ROW.fullName,
          trajectory:    'deteriorating',
          persistentRisk: true,
        }),
      ]),
      {},
      []
    );
  });

  it('SQL includes r.user_id = $1 for user scoping', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL includes r.is_active = true for active repo filter', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL joins repo_metrics for ci_status and contributor_status', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('repo_metrics');
    expect(sql).toContain('ci_status');
    expect(sql).toContain('contributor_status');
  });

  it('SQL joins risk_scores for label and trend', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('risk_scores');
    expect(sql).toMatch(/\blabel\b/);
    expect(sql).toMatch(/\btrend\b/);
  });

  it('SQL joins repo_pr_metrics for PR telemetry fields', async () => {
    const db = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('repo_pr_metrics');
    expect(sql).toContain('open_pr_count');
    expect(sql).toContain('pr_telemetry_status');
  });

  it('calls scorePullRequestHealth for each repo row', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([FULL_REPO_ROW, FULL_REPO_ROW]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledTimes(2);
  });

  it('passes correct PR telemetry fields to scorePullRequestHealth', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([FULL_REPO_ROW]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(scorePullRequestHealth).toHaveBeenCalledWith(
      expect.objectContaining({
        openPrCount:          2,
        mergedPrCount30d:     5,
        stalePrCount:         1,
        avgMergeLatencyHours: 48,
        prTelemetryStatus:    'active',
      })
    );
  });

  it('prHealthStatus on normalized repo comes from scorePullRequestHealth label', async () => {
    scorePullRequestHealth.mockReturnValue({ label: 'at-risk', score: 60, reasons: [], signals: [], confidenceLevel: 'medium' });
    const req = makeReq({ app: { locals: { db: makeDb([FULL_REPO_ROW]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const arg = buildBehavioralStabilityIndex.mock.calls[0][0][0];
    expect(arg.prHealthStatus).toBe('at-risk');
  });

  it('empty DB result returns buildBehavioralStabilityIndex output for empty input', async () => {
    buildBehavioralStabilityIndex.mockReturnValue({
      indexScore: 0, stabilityLevel: 'unknown', confidenceLevel: 'low',
      summary: 'No repositories available for behavioral stability assessment.',
      drivers: [], counts: { totalRepos: 0, escalatingRepos: 0 },
    });
    const req = makeReq({ app: { locals: { db: makeDb([]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(buildBehavioralStabilityIndex).toHaveBeenCalledWith([], {}, []);
    expect(res.json.mock.calls[0][0].stabilityLevel).toBe('unknown');
  });

  it('null ci_status and null label do not crash normalization', async () => {
    const sparseRow = {
      repoId: 5, fullName: null,
      ciStatus: null, contributorStatus: null,
      label: null, trend: null,
      recentLabels: null,
      openPrCount: null, mergedPrCount30d: null, stalePrCount: null,
      avgMergeLatencyHours: null, failedCheckPrCount: null,
      avgPrSize: null, throughput30d: null, abandonedPrCount: null,
      oldestOpenPrAgeDays: null, prTelemetryStatus: null,
    };
    const req = makeReq({ app: { locals: { db: makeDb([sparseRow]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const arg = buildBehavioralStabilityIndex.mock.calls[0][0][0];
    expect(arg.trajectory).toBe('unknown');
    expect(arg.ciStatus).toBe('unknown');
    expect(arg.persistentRisk).toBe(false);
    expect(arg.ci_failing).toBe(false);
    expect(arg.contributor_abandoned).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  it('DB error is forwarded to next and res.json is not called', async () => {
    const db = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('ci_failing is true only when ciStatus equals failing', async () => {
    const rows = [
      { ...FULL_REPO_ROW, repoId: 1, ciStatus: 'failing'  },
      { ...FULL_REPO_ROW, repoId: 2, ciStatus: 'passing'  },
      { ...FULL_REPO_ROW, repoId: 3, ciStatus: null       },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const normalized = buildBehavioralStabilityIndex.mock.calls[0][0];
    expect(normalized[0].ci_failing).toBe(true);
    expect(normalized[1].ci_failing).toBe(false);
    expect(normalized[2].ci_failing).toBe(false);
  });

  it('contributor_abandoned is true only when contributorStatus equals abandoned', async () => {
    const rows = [
      { ...FULL_REPO_ROW, repoId: 1, contributorStatus: 'abandoned' },
      { ...FULL_REPO_ROW, repoId: 2, contributorStatus: 'healthy'   },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const normalized = buildBehavioralStabilityIndex.mock.calls[0][0];
    expect(normalized[0].contributor_abandoned).toBe(true);
    expect(normalized[1].contributor_abandoned).toBe(false);
  });

  it('trajectory derived correctly for all label/trend combinations', async () => {
    const rows = [
      { ...FULL_REPO_ROW, repoId: 1, label: 'critical', trend: 'worsening' },
      { ...FULL_REPO_ROW, repoId: 2, label: 'at-risk',  trend: 'worsening' },
      { ...FULL_REPO_ROW, repoId: 3, label: 'healthy',  trend: 'improving' },
      { ...FULL_REPO_ROW, repoId: 4, label: 'healthy',  trend: 'stable'    },
      { ...FULL_REPO_ROW, repoId: 5, label: null,        trend: null        },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const normalized = buildBehavioralStabilityIndex.mock.calls[0][0];
    expect(normalized[0].trajectory).toBe('escalating');
    expect(normalized[1].trajectory).toBe('deteriorating');
    expect(normalized[2].trajectory).toBe('recovering');
    expect(normalized[3].trajectory).toBe('stable');
    expect(normalized[4].trajectory).toBe('unknown');
  });

  it('persistentRisk derived from recentLabels (3 consecutive at-risk/critical)', async () => {
    const rows = [
      { ...FULL_REPO_ROW, repoId: 1, recentLabels: ['at-risk', 'critical', 'at-risk'] },
      { ...FULL_REPO_ROW, repoId: 2, recentLabels: ['at-risk', 'healthy',  'at-risk'] },
      { ...FULL_REPO_ROW, repoId: 3, recentLabels: ['at-risk', 'critical'] },
    ];
    const req = makeReq({ app: { locals: { db: makeDb(rows) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const normalized = buildBehavioralStabilityIndex.mock.calls[0][0];
    expect(normalized[0].persistentRisk).toBe(true);
    expect(normalized[1].persistentRisk).toBe(false);
    expect(normalized[2].persistentRisk).toBe(false);
  });

  it('prTelemetryStatus defaults to unknown when null in row', async () => {
    const req = makeReq({ app: { locals: { db: makeDb([{ ...FULL_REPO_ROW, prTelemetryStatus: null }]) } } });
    const res = makeRes();
    await getBehavioralStabilityHandler(req, res, next);
    const call = scorePullRequestHealth.mock.calls[0][0];
    expect(call.prTelemetryStatus).toBe('unknown');
  });

  it('route is authenticated: authenticate middleware applied at router level', () => {
    const routerMiddleware = router.stack.find(function(layer) {
      return !layer.route && typeof layer.handle === 'function';
    });
    expect(routerMiddleware).toBeDefined();
  });
});

// ── GET /maturity ─────────────────────────────────────────────────────────────

describe('portfolioRoutes GET /maturity', () => {
  const MOCK_METRICS_ROW = {
    repoId:           7,
    fullName:         'org/repo-7',
    lastSyncedAt:     '2026-05-20T12:00:00.000Z',
    ciStatus:         'passing',
    releaseStatus:    'stale',
    contributorStatus:'healthy',
    commits7d:        5,
    lastPushAt:       '2026-05-24T09:00:00.000Z',
    prTelemetryStatus:'active',
    snapshotCount:    8,
  };

  const MOCK_MATURITY_SCORED = {
    maturityScore:   65,
    maturityLevel:   'developing',
    confidenceLevel: 'high',
    dimensions: {
      ciMaturity: 20, releaseMaturity: 10, contributorMaturity: 20,
      activityMaturity: 10, prWorkflowMaturity: 6, telemetryMaturity: 4,
    },
    gaps:            ['No releases in the last 90 days'],
    recommendations: ['Review release cadence'],
  };

  const MOCK_INDEX = {
    portfolioMaturityScore: 65,
    maturityLevel:          'developing',
    confidenceLevel:        'low',
    summary:                'Portfolio engineering maturity is developing (score 65/100) across 1 repository.',
    distribution:           { mature: 0, developing: 1, immature: 0, unknown: 0 },
    dimensionAverages:      { ciMaturity: 20, releaseMaturity: 10, contributorMaturity: 20, activityMaturity: 10, prWorkflowMaturity: 6, telemetryMaturity: 4 },
    commonGaps:             ['No releases in the last 90 days'],
    benchmarkedRepositories:[{ id: 7, name: 'org/repo-7', maturityScore: 65, maturityLevel: 'developing', percentile: 100, rank: 1, relativePosition: 'leading', topGaps: ['No releases in the last 90 days'] }],
    recommendations:        ['Review release cadence'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    scoreRepositoryMaturity.mockReturnValue(MOCK_MATURITY_SCORED);
    buildPortfolioMaturityIndex.mockReturnValue(MOCK_INDEX);
  });

  it('returns the buildPortfolioMaturityIndex result on success', async () => {
    const db  = makeDb([MOCK_METRICS_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(res.json).toHaveBeenCalledWith(MOCK_INDEX);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes empty repositories array to buildPortfolioMaturityIndex when no active repos', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(buildPortfolioMaturityIndex).toHaveBeenCalledWith({ repositories: [] });
  });

  it('scoreRepositoryMaturity called once per repo row', async () => {
    const rows = [MOCK_METRICS_ROW, { ...MOCK_METRICS_ROW, repoId: 8, fullName: 'org/repo-8' }];
    const db   = makeDb(rows);
    const req  = makeReq({ app: { locals: { db } } });
    const res  = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledTimes(rows.length);
  });

  it('buildPortfolioMaturityIndex called with scored repository objects', async () => {
    const db  = makeDb([MOCK_METRICS_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(buildPortfolioMaturityIndex).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          id:            MOCK_METRICS_ROW.repoId,
          name:          MOCK_METRICS_ROW.fullName,
          maturityScore: MOCK_MATURITY_SCORED.maturityScore,
          maturityLevel: MOCK_MATURITY_SCORED.maturityLevel,
        }),
      ]),
    });
  });

  it('SQL query scopes to r.user_id', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('user_id');
    expect(db.query.mock.calls[0][1]).toContain(MOCK_USER.userId);
  });

  it('SQL query filters to active repos only', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('is_active');
  });

  it('SQL uses LEFT JOIN LATERAL for repo_metrics with snapshot_at DESC LIMIT 1', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('repo_metrics');
    expect(sql).toContain('snapshot_at DESC');
    expect(sql).toContain('LIMIT  1');
  });

  it('SQL loads PR telemetry from repo_pr_metrics', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('repo_pr_metrics');
    expect(sql).toContain('pr_telemetry_status');
  });

  it('SQL loads snapshot depth via risk_scores COUNT', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('risk_scores');
    expect(sql).toMatch(/COUNT/i);
  });

  it('null ciStatus normalises to "unknown" before scoring', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, ciStatus: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'unknown' })
    );
  });

  it('null releaseStatus and contributorStatus normalise to "unknown"', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, releaseStatus: null, contributorStatus: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ releaseStatus: 'unknown', contributorStatus: 'unknown' })
    );
  });

  it('null commits7d remains null (not coerced)', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, commits7d: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ commits7d: null })
    );
  });

  it('null prTelemetryStatus normalises to "unknown"', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, prTelemetryStatus: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ prTelemetryStatus: 'unknown' })
    );
  });

  it('snapshotCount defaults to 0 when null', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, snapshotCount: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotCount: 0 })
    );
  });

  it('dependencyTelemetryStatus is always "unknown" (v1)', async () => {
    const db  = makeDb([MOCK_METRICS_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({ dependencyTelemetryStatus: 'unknown' })
    );
  });

  it('repo with no metrics row (all null columns) is still included and scored', async () => {
    const noMetricsRow = {
      repoId: 9, fullName: 'org/empty', lastSyncedAt: null,
      ciStatus: null, releaseStatus: null, contributorStatus: null,
      commits7d: null, lastPushAt: null, prTelemetryStatus: null, snapshotCount: 0,
    };
    const db  = makeDb([noMetricsRow]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledTimes(1);
    expect(scoreRepositoryMaturity).toHaveBeenCalledWith(
      expect.objectContaining({
        ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown',
        commits7d: null, snapshotCount: 0,
      })
    );
  });

  it('fullName falls back to stringified repoId when null', async () => {
    const db  = makeDb([{ ...MOCK_METRICS_ROW, fullName: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(buildPortfolioMaturityIndex).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({ name: String(MOCK_METRICS_ROW.repoId) }),
      ]),
    });
  });

  it('mixed portfolio: scoreRepositoryMaturity called for each row', async () => {
    const rows = [
      { ...MOCK_METRICS_ROW, repoId: 1, fullName: 'org/alpha', ciStatus: 'passing',  snapshotCount: 10 },
      { ...MOCK_METRICS_ROW, repoId: 2, fullName: 'org/beta',  ciStatus: 'failing',  snapshotCount: 3  },
      { ...MOCK_METRICS_ROW, repoId: 3, fullName: 'org/gamma', ciStatus: null,        snapshotCount: 0  },
    ];
    const db  = makeDb(rows);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(scoreRepositoryMaturity).toHaveBeenCalledTimes(3);
    expect(buildPortfolioMaturityIndex).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({ id: 1, name: 'org/alpha' }),
        expect.objectContaining({ id: 2, name: 'org/beta'  }),
        expect.objectContaining({ id: 3, name: 'org/gamma' }),
      ]),
    });
  });

  it('response shape matches buildPortfolioMaturityIndex output directly', async () => {
    const db  = makeDb([MOCK_METRICS_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('portfolioMaturityScore');
    expect(body).toHaveProperty('maturityLevel');
    expect(body).toHaveProperty('confidenceLevel');
    expect(body).toHaveProperty('distribution');
    expect(body).toHaveProperty('dimensionAverages');
    expect(body).toHaveProperty('commonGaps');
    expect(body).toHaveProperty('benchmarkedRepositories');
    expect(body).toHaveProperty('recommendations');
  });

  it('forwards DB error to next', async () => {
    const db  = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioMaturityHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});

// ── GET /architecture ─────────────────────────────────────────────────────────

describe('portfolioRoutes GET /architecture', () => {
  const MOCK_ARCH_SNAPSHOT = {
    architectureHealthScore:    75,
    architectureHealthLevel:    'watch',
    confidenceLevel:            'high',
    metrics:                    { totalFiles: 12 },
    dependencyGraph:            { couplingMetrics: { totalEdges: 4, circularDependencyCount: 0 } },
    apiLinkage:                 { coverage: { frontendCallCount: 3, backendRouteCount: 5 } },
    boundaryVerification:       { violations: [] },
    implementationCompleteness: { completenessScore: 80 },
    topFindings:                [],
    recommendations:            ['Add unit tests to core modules.'],
  };

  const MOCK_ARCH_ROW = {
    repoId:     1,
    repoName:   'org/repo-1',
    snapshot:   MOCK_ARCH_SNAPSHOT,
    snapshotAt: '2026-05-27T08:00:00.000Z',
  };

  const MOCK_NO_SNAP_ROW = {
    repoId:     2,
    repoName:   'org/repo-2',
    snapshot:   null,
    snapshotAt: null,
  };

  const MOCK_PORTFOLIO_ARCH_RESULT = {
    portfolioArchitectureScore: 75,
    architectureLevel:          'watch',
    confidenceLevel:            'high',
    summary:                    'Portfolio architecture has watch items.',
    distribution:               { healthy: 0, watch: 1, weak: 0, risky: 0, unknown: 1 },
    systemicBoundaryViolations: [],
    portfolioCoupling:          { totalEdges: 4, couplingLevel: 'healthy' },
    apiIntegrationHealth:       { integrationLevel: 'unknown' },
    implementationIntegrity:    { integrityLevel: 'moderate' },
    benchmarkedRepositories:    [
      { repoId: 1, repoName: 'org/repo-1', architectureHealthScore: 75, architectureHealthLevel: 'watch', rank: 1, percentile: 100, relativePosition: 'leading' },
    ],
    topFindings:     [],
    recommendations: ['Add unit tests to core modules.'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    buildPortfolioArchitectureIntelligence.mockReturnValue(MOCK_PORTFOLIO_ARCH_RESULT);
  });

  it('returns buildPortfolioArchitectureIntelligence result with _cache metadata', async () => {
    const db  = makeDb([MOCK_ARCH_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveProperty('portfolioArchitectureScore');
    expect(body).toHaveProperty('architectureLevel');
    expect(body).toHaveProperty('distribution');
    expect(body).toHaveProperty('systemicBoundaryViolations');
    expect(body).toHaveProperty('portfolioCoupling');
    expect(body).toHaveProperty('apiIntegrationHealth');
    expect(body).toHaveProperty('implementationIntegrity');
    expect(body).toHaveProperty('benchmarkedRepositories');
    expect(body).toHaveProperty('_cache');
  });

  it('calls buildPortfolioArchitectureIntelligence with normalised repo architecture objects', async () => {
    const db  = makeDb([MOCK_ARCH_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          repoId:                  MOCK_ARCH_ROW.repoId,
          repoName:                MOCK_ARCH_ROW.repoName,
          architectureHealthScore: MOCK_ARCH_SNAPSHOT.architectureHealthScore,
          architectureHealthLevel: MOCK_ARCH_SNAPSHOT.architectureHealthLevel,
          confidenceLevel:         MOCK_ARCH_SNAPSHOT.confidenceLevel,
        }),
      ]),
    });
  });

  it('SQL query scopes to r.user_id', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const [sql, params] = db.query.mock.calls[0];
    expect(sql).toContain('user_id');
    expect(params).toContain(MOCK_USER.userId);
  });

  it('SQL query filters to active repos only (r.is_active = true)', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('is_active');
  });

  it('SQL query uses LEFT JOIN LATERAL on repo_architecture_snapshots ORDER BY snapshot_at DESC LIMIT 1', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const [sql] = db.query.mock.calls[0];
    expect(sql).toContain('repo_architecture_snapshots');
    expect(sql).toContain('snapshot_at DESC');
    expect(sql).toContain('LIMIT 1');
  });

  it('repos without snapshots are included as unknown architecture items', async () => {
    const db  = makeDb([MOCK_NO_SNAP_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          repoId:                  MOCK_NO_SNAP_ROW.repoId,
          repoName:                MOCK_NO_SNAP_ROW.repoName,
          architectureHealthScore: 0,
          architectureHealthLevel: 'unknown',
          confidenceLevel:         'low',
          topFindings:             [],
          recommendations:         [],
        }),
      ]),
    });
  });

  it('empty portfolio calls helper with empty repositories array', async () => {
    const db  = makeDb([]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({ repositories: [] });
  });

  it('malformed snapshot (non-object) treated as unknown architecture item', async () => {
    const malformedRow = { repoId: 3, repoName: 'org/broken', snapshot: 'not-json', snapshotAt: null };
    const db  = makeDb([malformedRow]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({
          repoId:                  3,
          architectureHealthScore: 0,
          architectureHealthLevel: 'unknown',
        }),
      ]),
    });
  });

  it('_cache metadata has correct source, repoCount, snapshotCount, missingSnapshotCount', async () => {
    const db  = makeDb([MOCK_ARCH_ROW, MOCK_NO_SNAP_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body._cache).toEqual({
      source:               'repo_architecture_snapshots',
      repoCount:            2,
      snapshotCount:        1,
      missingSnapshotCount: 1,
    });
  });

  it('_cache has snapshotCount 0 and missingSnapshotCount equal to repoCount when no snapshots exist', async () => {
    const db  = makeDb([MOCK_NO_SNAP_ROW, { ...MOCK_NO_SNAP_ROW, repoId: 5, repoName: 'org/repo-5' }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body._cache).toEqual({
      source:               'repo_architecture_snapshots',
      repoCount:            2,
      snapshotCount:        0,
      missingSnapshotCount: 2,
    });
  });

  it('benchmarkedRepositories from helper result are present in response', async () => {
    const db  = makeDb([MOCK_ARCH_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const body = res.json.mock.calls[0][0];
    expect(body.benchmarkedRepositories).toEqual(MOCK_PORTFOLIO_ARCH_RESULT.benchmarkedRepositories);
  });

  it('response does not expose any token value', async () => {
    const db  = makeDb([MOCK_ARCH_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    const body = JSON.stringify(res.json.mock.calls[0][0]);
    expect(body.toLowerCase()).not.toContain('access_token');
    expect(body.toLowerCase()).not.toContain('token_enc');
  });

  it('DB error is forwarded to next without crashing', async () => {
    const db  = { query: jest.fn(async () => { throw new Error('db fail'); }) };
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });

  it('only one DB query is made (no GitHub API call)', async () => {
    const db  = makeDb([MOCK_ARCH_ROW]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('mixed portfolio: repos with and without snapshots both passed to helper', async () => {
    const rows = [
      MOCK_ARCH_ROW,
      MOCK_NO_SNAP_ROW,
      { repoId: 3, repoName: 'org/repo-3', snapshot: { ...MOCK_ARCH_SNAPSHOT, architectureHealthScore: 50, architectureHealthLevel: 'weak' }, snapshotAt: '2026-05-26T00:00:00.000Z' },
    ];
    const db  = makeDb(rows);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({ repoId: 1, architectureHealthLevel: 'watch'   }),
        expect.objectContaining({ repoId: 2, architectureHealthLevel: 'unknown' }),
        expect.objectContaining({ repoId: 3, architectureHealthLevel: 'weak'    }),
      ]),
    });
    const [call] = buildPortfolioArchitectureIntelligence.mock.calls;
    expect(call[0].repositories).toHaveLength(3);
  });

  it('repoName falls back to stringified repoId when github_full_name is null', async () => {
    const db  = makeDb([{ ...MOCK_ARCH_ROW, repoName: null }]);
    const req = makeReq({ app: { locals: { db } } });
    const res = makeRes();
    await getPortfolioArchitectureHandler(req, res, next);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalledWith({
      repositories: expect.arrayContaining([
        expect.objectContaining({ repoName: String(MOCK_ARCH_ROW.repoId) }),
      ]),
    });
  });
});
