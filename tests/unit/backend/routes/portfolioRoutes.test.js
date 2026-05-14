'use strict';

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/risk/getPortfolioForecast');
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const router                 = require('../../../../backend/routes/portfolioRoutes');
const { getPortfolioForecast } = require('../../../../execution/risk/getPortfolioForecast');

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

const getForecastHandler = extractHandler(router, 'GET', '/forecast');

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
