'use strict';

// Focused tests for the repoRoutes.js composition router introduced by
// Coupling Refinement #2 (split of the former monolithic repoRoutes.js into
// repoCoreRoutes.js, repoRiskRoutes.js, and repoArchitectureRoutes.js).
//
// repoRoutes.test.js and repoRoutes.http.test.js already cover full business
// logic for every handler (307 tests). This file exists to prove the things
// those files cannot: that a *real* HTTP request correctly resolves through
// the new nested-router mount structure (repoRoutes.test.js only ever
// extracts and calls handler functions directly, bypassing Express routing
// entirely), that authentication still fires exactly once, that static
// single-segment routes owned by repoCoreRoutes (/register, /summary,
// /attention) are never shadowed by a parameterized `:id` route from a
// sub-router mounted before or after it, and that a representative endpoint
// from each of the three domain routers is actually reachable end-to-end
// under the same /api/repos prefix.

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
jest.mock('../../../../execution/architecture/buildArchitectureTrendTimeline');
jest.mock('../../../../execution/architecture/detectArchitectureRegressions');
jest.mock('../../../../execution/architecture/detectCouplingGrowthAlerts');
jest.mock('../../../../execution/architecture/forecastStructuralDegradation');
jest.mock('../../../../execution/architecture/detectArchitectureAnomalies');
jest.mock('../../../../execution/architecture/buildRemediationRecommendations');
jest.mock('../../../../execution/architecture/predictChangeRisk');

let authenticateCallCount = 0;
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => {
  authenticateCallCount += 1;
  req.user = { userId: 1 };
  next();
});
jest.mock('../../../../backend/middleware/authorize', () => () => (req, res, next) => next());

// ── Imports ───────────────────────────────────────────────────────────────────

const express    = require('express');
const supertest  = require('supertest');
const repoRoutes = require('../../../../backend/routes/repoRoutes');
const repoCoreRoutes         = require('../../../../backend/routes/repoCoreRoutes');
const repoRiskRoutes         = require('../../../../backend/routes/repoRiskRoutes');
const repoArchitectureRoutes = require('../../../../backend/routes/repoArchitectureRoutes');

const { parseGithubUrl } = require('../../../../execution/github/parseGithubUrl');
const { fetchRepo }      = require('../../../../execution/github/fetchRepo');

const TEST_USER_ID = 1;
const MOCK_CONFIG  = { tokenEncryptionKey: 'test-key' };

function makeDb(impl) {
  return { query: jest.fn(impl) };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db     = db;
  app.locals.config = MOCK_CONFIG;
  app.use('/api/repos', repoRoutes);
  return app;
}

beforeEach(() => {
  authenticateCallCount = 0;
});

// ── Composition structure ─────────────────────────────────────────────────────

describe('repoRoutes — composition structure', () => {
  test('repoRoutes.js exports an Express Router', () => {
    expect(typeof repoRoutes).toBe('function');
    expect(Array.isArray(repoRoutes.stack)).toBe(true);
  });

  test('repoCoreRoutes, repoRiskRoutes, repoArchitectureRoutes are each independent Express Routers', () => {
    [repoCoreRoutes, repoRiskRoutes, repoArchitectureRoutes].forEach((r) => {
      expect(typeof r).toBe('function');
      expect(Array.isArray(r.stack)).toBe(true);
    });
  });

  test('repoRoutes.stack mounts exactly one middleware layer (authenticate) followed by three nested routers', () => {
    // Layer 0: router.use(authenticate) — a plain middleware layer, no nested stack.
    // Layers 1-3: router.use('/', repoCoreRoutes|repoRiskRoutes|repoArchitectureRoutes)
    // — each is itself a router, so layer.handle.stack exists.
    expect(repoRoutes.stack).toHaveLength(4);
    expect(repoRoutes.stack[0].handle.stack).toBeUndefined();
    expect(repoRoutes.stack[1].handle.stack).toBeDefined();
    expect(repoRoutes.stack[2].handle.stack).toBeDefined();
    expect(repoRoutes.stack[3].handle.stack).toBeDefined();
  });

  test('none of the three domain routers registers its own authenticate/authorize-style top-level router.use', () => {
    // Every layer directly on each domain router's stack must be an actual
    // route (layer.route defined) — proving auth is applied exactly once,
    // by the composition router, not duplicated inside any domain router.
    [repoCoreRoutes, repoRiskRoutes, repoArchitectureRoutes].forEach((r) => {
      r.stack.forEach((layer) => {
        expect(layer.route).toBeDefined();
      });
    });
  });

  test('authenticate fires exactly once per request regardless of which domain router serves it', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    await supertest(buildApp(db)).get('/api/repos/summary');
    expect(authenticateCallCount).toBe(1);
  });
});

// ── Route-order safety: static core routes vs parameterized :id routes ───────

describe('repoRoutes — route-order safety (static routes not shadowed by :id)', () => {
  test('POST /api/repos/register is handled by the register handler, not captured as :id', async () => {
    parseGithubUrl.mockReturnValue({ fullName: 'org/repo' });
    fetchRepo.mockResolvedValue({ githubRepoId: 42, fullName: 'org/repo' });

    const db = makeDb(async (sql) => {
      if (sql.includes('SELECT access_token_enc')) {
        return { rows: [{ access_token_enc: 'enc-token' }] };
      }
      if (sql.includes('INSERT INTO repositories')) {
        return { rows: [{ id: 7, fullName: 'org/repo', linkedAt: '2026-01-01T00:00:00.000Z' }] };
      }
      return { rows: [] };
    });

    const res = await supertest(buildApp(db))
      .post('/api/repos/register')
      .send({ url: 'https://github.com/org/repo' });

    // If "register" were ever parsed as an :id param by a route registered
    // ahead of it, parseInt('register', 10) is NaN and every :id handler in
    // this codebase responds 400 { error: 'Invalid repo id' } — the opposite
    // of the 201 ok:true register contract asserted below.
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ok: true, repo: { id: 7, fullName: 'org/repo' } });
  });

  test('GET /api/repos/summary resolves to the aggregate summary handler, not a :id-shaped route', async () => {
    const db = makeDb(async () => ({
      rows: [{ totalRepos: 3, healthy: 2, atRisk: 1, critical: 0, avgScore: 70, lastSyncedAt: null }],
    }));

    const res = await supertest(buildApp(db)).get('/api/repos/summary');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ totalRepos: 3, healthy: 2, atRisk: 1, critical: 0 });
  });

  test('GET /api/repos/attention resolves to the attention-queue handler, not a :id-shaped route', async () => {
    const { getAttentionQueue } = require('../../../../execution/risk/getAttentionQueue');
    getAttentionQueue.mockReturnValue([]);
    const db = makeDb(async () => ({ rows: [] }));

    const res = await supertest(buildApp(db)).get('/api/repos/attention');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ attention: [] });
  });
});

// ── Representative endpoint from each of the three domain routers ───────────

describe('repoRoutes — representative endpoint per domain router (end-to-end HTTP)', () => {
  test('core domain: GET /api/repos returns { repos: Array }', async () => {
    const { getRepoRiskFactors } = require('../../../../execution/risk/getRepoRiskFactors');
    const { getTrendIndicator }  = require('../../../../execution/risk/getTrendIndicator');
    getRepoRiskFactors.mockReturnValue({ hasMetrics: false, triggered: [], notMeasured: [], allClear: true });
    getTrendIndicator.mockReturnValue({ direction: 'stable', delta: 0, label: 'Operationally stable' });

    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/repos');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.repos)).toBe(true);
  });

  test('risk domain: GET /api/repos/:id/risk returns { current, previous }', async () => {
    const db = makeDb(async () => ({
      rows: [
        { score: 80, label: 'healthy', trend: 'stable', factors: [], snapshotAt: '2026-01-02T00:00:00.000Z' },
        { score: 75, label: 'healthy', trend: 'stable', factors: [], snapshotAt: '2026-01-01T00:00:00.000Z' },
      ],
    }));

    const res = await supertest(buildApp(db)).get('/api/repos/1/risk');

    expect(res.status).toBe(200);
    expect(res.body.current.score).toBe(80);
    expect(res.body.previous.score).toBe(75);
  });

  test('architecture domain: GET /api/repos/:id/architecture returns a fresh cached snapshot', async () => {
    const freshSnapshot = { repoId: 1, architectureHealthScore: 90 };
    const db = makeDb(async (sql) => {
      if (sql.includes('FROM repositories')) {
        return { rows: [{ id: 1, fullName: 'org/repo' }] };
      }
      if (sql.includes('FROM repo_architecture_snapshots')) {
        return { rows: [{ snapshot: freshSnapshot, snapshotAt: new Date().toISOString() }] };
      }
      return { rows: [] };
    });

    const res = await supertest(buildApp(db)).get('/api/repos/1/architecture');

    expect(res.status).toBe(200);
    expect(res.body.architectureHealthScore).toBe(90);
    expect(res.body._cache).toMatchObject({ hit: true, stale: false });
  });
});

// ── Backward compatibility: importers of repoRoutes.js are unaffected ───────

describe('repoRoutes — backward compatibility', () => {
  test('require("../routes/repoRoutes") still resolves to a single mountable router (no import-site changes needed)', () => {
    expect(() => {
      const app = express();
      app.use('/api/repos', repoRoutes);
    }).not.toThrow();
  });
});
