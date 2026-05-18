'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/risk/getPortfolioForecast');
jest.mock('../../../../execution/risk/getAttentionQueue');
jest.mock('../../../../execution/risk/buildExecutiveSummary');
jest.mock('../../../../execution/risk/getPortfolioHistory');
jest.mock('../../../../execution/risk/getOperationalChanges');
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const router                      = require('../../../../backend/routes/portfolioRoutes');
const { getPortfolioForecast }    = require('../../../../execution/risk/getPortfolioForecast');
const { getAttentionQueue }       = require('../../../../execution/risk/getAttentionQueue');
const { buildExecutiveSummary }   = require('../../../../execution/risk/buildExecutiveSummary');
const { buildPortfolioHistory }   = require('../../../../execution/risk/getPortfolioHistory');
const { getOperationalChanges }   = require('../../../../execution/risk/getOperationalChanges');

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
const getChangesHandler        = extractHandler(router, 'GET', '/changes');

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
