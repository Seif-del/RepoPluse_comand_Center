'use strict';

// HTTP contract tests for GET /api/repos (FR-009 Healthy filter + baseline).
//
// Uses supertest to issue real HTTP requests through the Express routing layer.
// This proves:
//   - Express parses ?riskLevel=healthy → req.query.riskLevel correctly
//   - The response body shape { repos: [...] } matches what loadRepos() expects
//   - db.query receives the correct parameter array at the SQL boundary
//   - HTTP status codes are correct for valid, absent, and invalid param values
//
// No real database is used — db.query is a Jest mock throughout.
// authenticate is replaced by a stub that injects a test user identity so that
// req.user is populated through the real Express middleware chain.

// ── Module mocks (hoisted before all requires) ────────────────────────────────
// Matches the mock surface of repoRoutes.test.js exactly. All external modules
// that repoRoutes.js requires must be mocked so Jest does not attempt to load
// real GitHub / execution / architecture modules.

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
jest.mock('../../../../execution/architecture/buildArchitectureTrendTimeline');
jest.mock('../../../../execution/architecture/detectArchitectureRegressions');
jest.mock('../../../../execution/architecture/detectCouplingGrowthAlerts');
jest.mock('../../../../execution/architecture/forecastStructuralDegradation');
jest.mock('../../../../execution/architecture/detectArchitectureAnomalies');
jest.mock('../../../../execution/architecture/buildRemediationRecommendations');
jest.mock('../../../../execution/architecture/predictChangeRisk');

// authenticate: bypass session validation AND inject req.user so the route
// handler receives a populated user identity through the real Express
// middleware chain. This is different from repoRoutes.test.js which calls
// the handler directly with a hand-built req object.
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => {
  req.user = { userId: 1 };
  next();
});
jest.mock('../../../../backend/middleware/authorize', () => () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const express    = require('express');
const supertest  = require('supertest');
const repoRoutes = require('../../../../backend/routes/repoRoutes');

const { getRepoRiskFactors } = require('../../../../execution/risk/getRepoRiskFactors');
const { getTrendIndicator }  = require('../../../../execution/risk/getTrendIndicator');

// ── Constants ─────────────────────────────────────────────────────────────────

const TEST_USER_ID = 1;
const MOCK_CONFIG  = { tokenEncryptionKey: 'test-key' };

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(queryResult = { rows: [] }) {
  return { query: jest.fn(async () => queryResult) };
}

// Build a minimal Express app that mounts the repo router.
// app.locals.db is injected per-test so each test gets its own spy.
// The router reads req.app.locals.db at request time, so separate app
// instances with different db mocks are fully isolated.
function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db     = db;
  app.locals.config = MOCK_CONFIG;
  app.use('/api/repos', repoRoutes);
  return app;
}

// ── Shared setup ──────────────────────────────────────────────────────────────

beforeEach(() => {
  getRepoRiskFactors.mockReturnValue({
    hasMetrics: true, triggered: [], notMeasured: [], allClear: true,
  });
  getTrendIndicator.mockReturnValue({
    direction: 'stable', delta: 0, label: 'Operationally stable',
  });
});

// ── GET /api/repos?riskLevel=healthy — HTTP contract ─────────────────────────

describe('GET /api/repos?riskLevel=healthy — HTTP contract', () => {
  test('returns HTTP 200', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy');
    expect(res.status).toBe(200);
  });

  test('response body has { repos: Array }', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy');
    expect(res.body).toHaveProperty('repos');
    expect(Array.isArray(res.body.repos)).toBe(true);
  });

  test('db.query receives [userId, "healthy", null, null, null] as the SQL parameter array', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, 'healthy', null, null, null, null]
    );
  });

  test('all repos in the response have label === "healthy"', async () => {
    const rows = [
      { id: 1, fullName: 'org/alpha', label: 'healthy', score: 90, factors: [] },
      { id: 2, fullName: 'org/beta',  label: 'healthy', score: 85, factors: [] },
    ];
    const db  = makeDb({ rows });
    const res = await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy');
    expect(res.body.repos).toHaveLength(2);
    res.body.repos.forEach(r => expect(r.label).toBe('healthy'));
  });
});

// ── GET /api/repos (no riskLevel) — backward compatibility ───────────────────

describe('GET /api/repos (absent riskLevel) — backward compatibility', () => {
  test('returns HTTP 200 with no query param', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos');
    expect(res.status).toBe(200);
  });

  test('db.query receives [userId, null, null, null, null] when no filter params are present', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, null, null]
    );
  });

  test('returns repos of mixed labels when no filter param is supplied', async () => {
    const rows = [
      { id: 1, fullName: 'org/a', label: 'healthy',  score: 90, factors: [] },
      { id: 2, fullName: 'org/b', label: 'at-risk',  score: 50, factors: [] },
      { id: 3, fullName: 'org/c', label: 'critical', score: 20, factors: [] },
    ];
    const db  = makeDb({ rows });
    const res = await supertest(buildApp(db)).get('/api/repos');
    expect(res.body.repos).toHaveLength(3);
  });
});

// ── GET /api/repos?riskLevel=<invalid> — HTTP 400 rejection ──────────────────

describe('GET /api/repos?riskLevel=<invalid> — HTTP 400 rejection', () => {
  test('returns HTTP 400 for an unrecognised riskLevel value', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?riskLevel=unknown');
    expect(res.status).toBe(400);
  });

  test('response body contains an error key for an invalid riskLevel', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?riskLevel=invalid');
    expect(res.body).toHaveProperty('error');
  });

  test('db.query is not called when riskLevel is invalid', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?riskLevel=bad');
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── GET /api/repos?search=<term> — HTTP contract ──────────────────────────────

describe('GET /api/repos?search=<term> — HTTP contract', () => {
  test('returns HTTP 200 with search param', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?search=myrepo');
    expect(res.status).toBe(200);
  });

  test('response body has { repos: Array } with search param', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?search=myrepo');
    expect(res.body).toHaveProperty('repos');
    expect(Array.isArray(res.body.repos)).toBe(true);
  });

  test('db.query receives [userId, null, "myrepo", null, null] as the SQL parameter array', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?search=myrepo');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, 'myrepo', null, null, null]
    );
  });

  test('db.query receives [userId, "healthy", "myrepo", null, null] when both filters are present', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy&search=myrepo');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, 'healthy', 'myrepo', null, null, null]
    );
  });

  test('returns HTTP 400 when search exceeds 200 characters', async () => {
    const db  = makeDb({ rows: [] });
    const longSearch = 'a'.repeat(201);
    const res = await supertest(buildApp(db)).get(`/api/repos?search=${longSearch}`);
    expect(res.status).toBe(400);
  });

  test('db.query is not called when search exceeds 200 characters', async () => {
    const db = makeDb({ rows: [] });
    const longSearch = 'b'.repeat(201);
    await supertest(buildApp(db)).get(`/api/repos?search=${longSearch}`);
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── GET /api/repos?activeSince=<value> — HTTP contract ───────────────────────

describe('GET /api/repos?activeSince=<value> — HTTP contract', () => {
  const DAY_MS = 86400000;
  const FIXED_NOW = 1000000000000;
  let dateSpy;

  beforeEach(() => {
    getRepoRiskFactors.mockReturnValue({
      hasMetrics: true, triggered: [], notMeasured: [], allClear: true,
    });
    getTrendIndicator.mockReturnValue({
      direction: 'stable', delta: 0, label: 'Operationally stable',
    });
    dateSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  test('returns HTTP 200 for activeSince=7d', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?activeSince=7d');
    expect(res.status).toBe(200);
  });

  test('response body has { repos: Array } for activeSince=7d', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?activeSince=7d');
    expect(res.body).toHaveProperty('repos');
    expect(Array.isArray(res.body.repos)).toBe(true);
  });

  test('db.query receives lowerBound for activeSince=7d and null upperBound', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?activeSince=7d');
    const expectedLower = new Date(FIXED_NOW - 7 * DAY_MS).toISOString();
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, expectedLower, null, null]
    );
  });

  test('db.query receives lowerBound for activeSince=30d and null upperBound', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?activeSince=30d');
    const expectedLower = new Date(FIXED_NOW - 30 * DAY_MS).toISOString();
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, expectedLower, null, null]
    );
  });

  test('returns HTTP 200 for activeSince=90d', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?activeSince=90d');
    expect(res.status).toBe(200);
  });

  test('returns HTTP 200 for activeSince=stale', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?activeSince=stale');
    expect(res.status).toBe(200);
  });

  test('db.query receives null lowerBound and upperBound for activeSince=stale', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?activeSince=stale');
    const expectedUpper = new Date(FIXED_NOW - 30 * DAY_MS).toISOString();
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, expectedUpper, null]
    );
  });

  test('combines activeSince=7d with riskLevel=healthy', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy&activeSince=7d');
    const expectedLower = new Date(FIXED_NOW - 7 * DAY_MS).toISOString();
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, 'healthy', null, expectedLower, null, null]
    );
  });

  test('returns HTTP 400 for an unrecognised activeSince value', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?activeSince=45d');
    expect(res.status).toBe(400);
  });

  test('db.query is not called when activeSince is invalid', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?activeSince=invalid');
    expect(db.query).not.toHaveBeenCalled();
  });
});

// ── GET /api/repos?projectStatus=<value> — HTTP contract ─────────────────────

describe('GET /api/repos?projectStatus=<value> — HTTP contract', () => {
  test('returns HTTP 200 for projectStatus=active', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?projectStatus=active');
    expect(res.status).toBe(200);
  });

  test('db.query receives [userId, null, null, null, null, "active"] for projectStatus=active', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?projectStatus=active');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, null, 'active']
    );
  });

  test('db.query receives sixth param "inactive" for projectStatus=inactive', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?projectStatus=inactive');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, null, 'inactive']
    );
  });

  test('db.query receives sixth param "archived" for projectStatus=archived', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?projectStatus=archived');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, null, 'archived']
    );
  });

  test('db.query receives sixth param "unknown" for projectStatus=unknown', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?projectStatus=unknown');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, null, null, null, 'unknown']
    );
  });

  test('returns HTTP 400 for an invalid projectStatus value', async () => {
    const db  = makeDb({ rows: [] });
    const res = await supertest(buildApp(db)).get('/api/repos?projectStatus=pending');
    expect(res.status).toBe(400);
  });

  test('db.query is not called when projectStatus is invalid', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?projectStatus=deleted');
    expect(db.query).not.toHaveBeenCalled();
  });

  test('combines projectStatus=active with riskLevel=healthy', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?riskLevel=healthy&projectStatus=active');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, 'healthy', null, null, null, 'active']
    );
  });

  test('combines projectStatus=inactive with search param', async () => {
    const db = makeDb({ rows: [] });
    await supertest(buildApp(db)).get('/api/repos?search=myrepo&projectStatus=inactive');
    expect(db.query).toHaveBeenCalledWith(
      expect.any(String),
      [TEST_USER_ID, null, 'myrepo', null, null, 'inactive']
    );
  });
});
