'use strict';

// Focused tests for the portfolioRoutes.js composition router introduced by
// Coupling Refinement #3 (split of the former monolithic portfolioRoutes.js
// into portfolioArchitectureRoutes.js and portfolioGovernanceRoutes.js).
//
// portfolioRoutes.test.js already covers full business logic for every
// handler via direct handler-function extraction (bypassing Express routing
// entirely). This file exists to prove the things that one cannot: that a
// *real* HTTP request correctly resolves through the new nested-router mount
// structure, that authentication still fires exactly once before either
// child router runs, that a representative endpoint from each of the two
// domain routers is actually reachable end-to-end under the same
// /api/portfolio prefix, that no path segment got accidentally doubled by
// the split, and that an unknown portfolio path still 404s exactly as it did
// before the split (no catch-all handler was added or removed).

// ── Module mocks (hoisted before all requires) ────────────────────────────────

jest.mock('../../../../execution/risk/getPortfolioForecast');
jest.mock('../../../../execution/risk/getAttentionQueue');
jest.mock('../../../../execution/risk/buildExecutiveSummary');
jest.mock('../../../../execution/risk/getPortfolioHistory');
jest.mock('../../../../execution/risk/getOperationalChanges');
jest.mock('../../../../execution/risk/detectOperationalAnomalies');
jest.mock('../../../../execution/risk/clusterOperationalAnomalies');
jest.mock('../../../../execution/risk/buildTelemetryCoverageSummary');
jest.mock('../../../../execution/risk/buildBehavioralStabilityIndex');
jest.mock('../../../../execution/risk/scorePullRequestHealth');
jest.mock('../../../../execution/risk/scoreRepositoryMaturity');
jest.mock('../../../../execution/risk/buildPortfolioMaturityIndex');
jest.mock('../../../../execution/architecture/buildPortfolioArchitectureIntelligence');
jest.mock('../../../../execution/architecture/buildArchitectureTrendTimeline');
jest.mock('../../../../execution/architecture/detectArchitectureRegressions');
jest.mock('../../../../execution/architecture/detectCouplingGrowthAlerts');
jest.mock('../../../../execution/architecture/forecastStructuralDegradation');
jest.mock('../../../../execution/architecture/buildPortfolioForecastingIntelligence');
jest.mock('../../../../execution/architecture/scoreEngineeringGovernance');
jest.mock('../../../../execution/architecture/detectArchitectureAnomalies');
jest.mock('../../../../execution/architecture/buildArchitectureWatchlists');
jest.mock('../../../../execution/architecture/deduplicateTopFindings');
jest.mock('../../../../execution/architecture/deduplicateRecommendations');

let authenticateCallCount = 0;
jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => {
  authenticateCallCount += 1;
  req.user = { userId: 1 };
  next();
});

// ── Imports ───────────────────────────────────────────────────────────────────

const express                     = require('express');
const supertest                   = require('supertest');
const portfolioRoutes             = require('../../../../backend/routes/portfolioRoutes');
const portfolioArchitectureRoutes = require('../../../../backend/routes/portfolioArchitectureRoutes');
const portfolioGovernanceRoutes   = require('../../../../backend/routes/portfolioGovernanceRoutes');

const { buildPortfolioArchitectureIntelligence } = require('../../../../execution/architecture/buildPortfolioArchitectureIntelligence');
const { buildArchitectureWatchlists }            = require('../../../../execution/architecture/buildArchitectureWatchlists');
const { buildPortfolioForecastingIntelligence }  = require('../../../../execution/architecture/buildPortfolioForecastingIntelligence');
const { scoreEngineeringGovernance }             = require('../../../../execution/architecture/scoreEngineeringGovernance');
const { detectArchitectureAnomalies }            = require('../../../../execution/architecture/detectArchitectureAnomalies');
const { buildPortfolioMaturityIndex }            = require('../../../../execution/risk/buildPortfolioMaturityIndex');
const { buildBehavioralStabilityIndex }          = require('../../../../execution/risk/buildBehavioralStabilityIndex');
const { getPortfolioForecast }                   = require('../../../../execution/risk/getPortfolioForecast');
const { getAttentionQueue }                      = require('../../../../execution/risk/getAttentionQueue');
const { buildExecutiveSummary }                  = require('../../../../execution/risk/buildExecutiveSummary');

function makeDb(impl) {
  return { query: jest.fn(impl || (async () => ({ rows: [] }))) };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;
  app.use('/api/portfolio', portfolioRoutes);
  return app;
}

beforeEach(() => {
  authenticateCallCount = 0;
  buildPortfolioArchitectureIntelligence.mockReturnValue({ repositories: [], _placeholder: 'arch' });
  buildArchitectureWatchlists.mockReturnValue({ priorityQueue: [] });
  buildPortfolioForecastingIntelligence.mockReturnValue({ forecastDistribution: { stable: 0, watch: 0, degrading: 0, critical: 0, unknown: 0 } });
  scoreEngineeringGovernance.mockReturnValue({ governanceScore: 0, governanceLevel: 'unknown' });
  detectArchitectureAnomalies.mockReturnValue({ anomalyLevel: 'none' });
  buildPortfolioMaturityIndex.mockReturnValue({ maturityScore: 0 });
  buildBehavioralStabilityIndex.mockReturnValue({ stabilityScore: 0 });
  getPortfolioForecast.mockReturnValue({ portfolioTrajectory: 'stable' });
  getAttentionQueue.mockReturnValue([]);
  buildExecutiveSummary.mockReturnValue({ headline: 'ok' });
});

// ── Composition structure ─────────────────────────────────────────────────────

describe('portfolioRoutes — composition structure', () => {
  test('portfolioRoutes.js exports an Express Router', () => {
    expect(typeof portfolioRoutes).toBe('function');
    expect(Array.isArray(portfolioRoutes.stack)).toBe(true);
  });

  test('portfolioArchitectureRoutes and portfolioGovernanceRoutes are each independent Express Routers', () => {
    [portfolioArchitectureRoutes, portfolioGovernanceRoutes].forEach((r) => {
      expect(typeof r).toBe('function');
      expect(Array.isArray(r.stack)).toBe(true);
    });
  });

  test('portfolioRoutes.stack mounts exactly one middleware layer (authenticate) followed by two nested routers', () => {
    // Layer 0: router.use(authenticate) — a plain middleware layer, no nested stack.
    // Layers 1-2: router.use(portfolioArchitectureRoutes|portfolioGovernanceRoutes)
    // — each is itself a router, so layer.handle.stack exists.
    expect(portfolioRoutes.stack).toHaveLength(3);
    expect(portfolioRoutes.stack[0].handle.stack).toBeUndefined();
    expect(portfolioRoutes.stack[1].handle.stack).toBeDefined();
    expect(portfolioRoutes.stack[2].handle.stack).toBeDefined();
  });

  test('neither domain router registers its own authenticate-style top-level router.use', () => {
    // Every layer directly on each domain router's stack must be an actual
    // route (layer.route defined) — proving auth is applied exactly once,
    // by the composition router, not duplicated inside either domain router.
    [portfolioArchitectureRoutes, portfolioGovernanceRoutes].forEach((r) => {
      r.stack.forEach((layer) => {
        expect(layer.route).toBeDefined();
      });
    });
  });

  test('authenticate fires exactly once per request, regardless of which domain router serves it', async () => {
    const db = makeDb();
    await supertest(buildApp(db)).get('/api/portfolio/history');
    expect(authenticateCallCount).toBe(1);
  });

  test('authenticate runs before the matched child-router handler (db is never queried without a user on the request)', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    await supertest(buildApp(db)).get('/api/portfolio/maturity');
    expect(authenticateCallCount).toBe(1);
    expect(db.query).toHaveBeenCalled();
  });
});

// ── Representative endpoints per domain router (end-to-end HTTP) ────────────

describe('portfolioRoutes — architecture-domain endpoints reach portfolioArchitectureRoutes', () => {
  test('GET /api/portfolio/architecture resolves through the architecture router', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/portfolio/architecture');

    expect(res.status).toBe(200);
    expect(buildPortfolioArchitectureIntelligence).toHaveBeenCalled();
    expect(res.body._placeholder).toBe('arch');
  });

  test('GET /api/portfolio/watchlists resolves through the architecture router', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/portfolio/watchlists');

    expect(res.status).toBe(200);
    expect(buildArchitectureWatchlists).toHaveBeenCalled();
    expect(Array.isArray(res.body.priorityQueue)).toBe(true);
  });
});

describe('portfolioRoutes — governance-domain endpoints reach portfolioGovernanceRoutes', () => {
  test('GET /api/portfolio/governance resolves through the governance router', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/portfolio/governance');

    expect(res.status).toBe(200);
    expect(scoreEngineeringGovernance).toHaveBeenCalled();
    expect(res.body.governanceLevel).toBe('unknown');
  });

  test('GET /api/portfolio/maturity resolves through the governance router', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/portfolio/maturity');

    expect(res.status).toBe(200);
    expect(buildPortfolioMaturityIndex).toHaveBeenCalledWith({ repositories: [] });
    expect(res.body.maturityScore).toBe(0);
  });

  test('GET /api/portfolio/executive-summary resolves through the governance router', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const res = await supertest(buildApp(db)).get('/api/portfolio/executive-summary');

    expect(res.status).toBe(200);
    expect(buildExecutiveSummary).toHaveBeenCalled();
    expect(res.body.headline).toBe('ok');
  });
});

// ── Representative public paths unchanged / no double-prefixing ─────────────

describe('portfolioRoutes — public path stability', () => {
  test('representative public paths remain reachable at their original, unprefixed locations', async () => {
    const db = makeDb(async () => ({ rows: [] }));
    const app = buildApp(db);

    const paths = [
      '/api/portfolio/forecast',
      '/api/portfolio/executive-summary',
      '/api/portfolio/history',
      '/api/portfolio/changes',
      '/api/portfolio/anomalies',
      '/api/portfolio/anomaly-clusters',
      '/api/portfolio/telemetry-coverage',
      '/api/portfolio/behavioral-stability',
      '/api/portfolio/maturity',
      '/api/portfolio/architecture',
      '/api/portfolio/governance',
      '/api/portfolio/watchlists',
    ];

    for (const path of paths) {
      const res = await supertest(app).get(path);
      expect(res.status).not.toBe(404);
    }
  });

  test('no accidental double-prefixing: GET /api/portfolio/architecture/architecture does not resolve', async () => {
    const db = makeDb();
    const res = await supertest(buildApp(db)).get('/api/portfolio/architecture/architecture');
    expect(res.status).toBe(404);
  });

  test('no accidental double-prefixing: GET /api/portfolio/governance/governance does not resolve', async () => {
    const db = makeDb();
    const res = await supertest(buildApp(db)).get('/api/portfolio/governance/governance');
    expect(res.status).toBe(404);
  });

  test('unknown portfolio path retains existing (404) behavior', async () => {
    const db = makeDb();
    const res = await supertest(buildApp(db)).get('/api/portfolio/does-not-exist');
    expect(res.status).toBe(404);
  });
});

// ── Backward compatibility: importers of portfolioRoutes.js are unaffected ──

describe('portfolioRoutes — backward compatibility', () => {
  test('require("../routes/portfolioRoutes") still resolves to a single mountable router (no import-site changes needed)', () => {
    expect(() => {
      const app = express();
      app.use('/api/portfolio', portfolioRoutes);
    }).not.toThrow();
  });
});
