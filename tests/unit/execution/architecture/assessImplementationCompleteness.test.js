'use strict';

const { assessImplementationCompleteness } = require('../../../../execution/architecture/assessImplementationCompleteness');

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeFile(path, content, language) {
  return { path, content: content || '', language: language || 'JavaScript' };
}

function makeInventory(opts = {}) {
  return {
    categories: {
      routes:   opts.routes   || [],
      services: opts.services || [],
      models:   opts.models   || [],
      tests:    opts.tests    || [],
      frontend: opts.frontend || [],
      components: opts.components || [],
      backend:  opts.backend  || [],
      config:   [], docs: [], migrations: [], scripts: [],
      apiClients: [], styles: [], assets: [], unknown: [],
    },
    architectureHints: {
      hasApiLayer:     opts.hasApiLayer     ?? false,
      hasServiceLayer: opts.hasServiceLayer ?? false,
      hasModelLayer:   opts.hasModelLayer   ?? false,
      hasTests:        opts.hasTests        ?? false,
      hasFrontend:     opts.hasFrontend     ?? false,
      hasBackend:      opts.hasBackend      ?? false,
      hasComponentLayer: opts.hasComponentLayer ?? false,
      likelyFullStackApp: opts.likelyFullStackApp ?? false,
    },
  };
}

function makeDependencyGraph(opts = {}) {
  return {
    nodes: opts.nodes || [],
    edges: opts.edges || [],
    circularDependencies: opts.circularDependencies || [],
    boundaryHints: opts.boundaryHints || [],
    couplingMetrics: {
      totalNodes: 0, totalEdges: 0, unresolvedCount: 0,
      externalDependencyCount: 0, circularDependencyCount: 0,
      averageOutDegree: 0,
      highFanOutFiles: opts.highFanOutFiles || [],
      highFanInFiles:  opts.highFanInFiles  || [],
    },
  };
}

function makeRouteApiStructure(opts = {}) {
  return {
    backendRoutes:       opts.backendRoutes       || [],
    frontendApiCalls:    opts.frontendApiCalls    || [],
    routeHandlers:       opts.routeHandlers       || [],
    nextRoutes:          opts.nextRoutes          || [],
    endpointInventory:   opts.endpointInventory   || [],
    unresolvedApiCalls:  opts.unresolvedApiCalls  || [],
    unusedBackendRoutes: opts.unusedBackendRoutes || [],
    frameworkHints: opts.frameworkHints || {},
  };
}

function makeApiLinkage(opts = {}) {
  return {
    linkedEndpoints:         opts.linkedEndpoints         || [],
    unresolvedFrontendCalls: opts.unresolvedFrontendCalls || [],
    orphanedBackendRoutes:   opts.orphanedBackendRoutes   || [],
    methodMismatches:        opts.methodMismatches        || [],
    linkageScore:            opts.linkageScore            ?? 0,
    linkageLevel:            opts.linkageLevel            || 'unknown',
    coverage: {
      frontendCallCount:        opts.frontendCallCount        ?? 0,
      backendRouteCount:        opts.backendRouteCount        ?? 0,
      linkedFrontendCallCount:  opts.linkedFrontendCallCount  ?? 0,
      linkedBackendRouteCount:  opts.linkedBackendRouteCount  ?? 0,
      unresolvedFrontendCallCount: opts.unresolvedFrontendCallCount ?? 0,
      orphanedBackendRouteCount:   opts.orphanedBackendRouteCount   ?? 0,
      frontendCoveragePercent:  opts.frontendCoveragePercent  ?? 0,
      backendCoveragePercent:   opts.backendCoveragePercent   ?? 0,
    },
  };
}

function makeBoundaryVerification(opts = {}) {
  return {
    boundaryHealthScore: opts.boundaryHealthScore ?? 100,
    boundaryHealthLevel: opts.boundaryHealthLevel || 'healthy',
    violations:   opts.violations  || [],
    warnings:     opts.warnings    || [],
    recommendations: [],
    summary: '',
  };
}

function emptyInput() {
  return {
    files: [],
    inventory: makeInventory(),
    dependencyGraph: makeDependencyGraph(),
    routeApiStructure: makeRouteApiStructure(),
    apiLinkage: makeApiLinkage(),
    boundaryVerification: makeBoundaryVerification(),
  };
}

// ── Empty / null input ────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — empty input', () => {
  test('null returns valid zero-state', () => {
    const r = assessImplementationCompleteness(null);
    expect(r.signals).toEqual([]);
    expect(r.evidence).toEqual([]);
    expect(r.recommendations).toEqual([]);
  });

  test('undefined returns valid zero-state', () => {
    const r = assessImplementationCompleteness(undefined);
    expect(r.completenessLevel).toBeDefined();
  });

  test('empty structural input returns level unknown', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(r.completenessLevel).toBe('unknown');
  });

  test('empty input score is 0', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(r.completenessScore).toBe(0);
  });

  test('summary is a non-empty string', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('all top-level keys present', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(r).toHaveProperty('completenessScore');
    expect(r).toHaveProperty('completenessLevel');
    expect(r).toHaveProperty('signals');
    expect(r).toHaveProperty('evidence');
    expect(r).toHaveProperty('weakImplementationHints');
    expect(r).toHaveProperty('routeServiceCoverage');
    expect(r).toHaveProperty('frontendBackendCoverage');
    expect(r).toHaveProperty('placeholderAssessment');
    expect(r).toHaveProperty('scaffoldAssessment');
    expect(r).toHaveProperty('recommendations');
    expect(r).toHaveProperty('summary');
  });
});

// ── Healthy implementation ────────────────────────────────────────────────────

describe('assessImplementationCompleteness — healthy implementation', () => {
  test('fully linked, tested, clean implementation scores >= 85', () => {
    const r = assessImplementationCompleteness({
      files: [
        makeFile('routes/users.js',        "const UserService = require('../services/UserService');\nrouter.get('/users', UserService.list);"),
        makeFile('services/UserService.js', "module.exports = { list: async () => db.query('SELECT * FROM users') };"),
        makeFile('models/User.js',         "module.exports = class User {};"),
        makeFile('tests/UserService.test.js', "test('list', () => {});"),
      ],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        models: ['models/User.js'],  tests: ['tests/UserService.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasModelLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' },
          { from: 'services/UserService.js', to: 'models/User.js', importPath: '../models/User', importType: 'require' },
        ],
      }),
      routeApiStructure: makeRouteApiStructure({
        backendRoutes: [{ method: 'GET', path: '/api/users', file: 'routes/users.js', framework: 'express', handlerType: 'named', handlerName: 'UserService.list' }],
      }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [], orphanedBackendRoutes: [], methodMismatches: [],
        linkageLevel: 'integrated', frontendCoveragePercent: 100, backendCoveragePercent: 100,
      }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 95, boundaryHealthLevel: 'healthy' }),
    });
    expect(r.completenessScore).toBeGreaterThanOrEqual(85);
    expect(r.completenessLevel).toBe('complete');
  });
});

// ── Route without service path ────────────────────────────────────────────────

describe('assessImplementationCompleteness — route_without_service_path', () => {
  test('route file with no service import emits signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "router.get('/users', (req, res) => res.json([]));\n")],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [], // no edge from routes/users.js to any service
      }),
    });
    const sig = r.signals.find(s => s.type === 'route_without_service_path');
    expect(sig).toBeDefined();
  });

  test('route with service import does NOT emit route_without_service_path', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "const svc = require('../services/UserService');\nrouter.get('/users', svc.list);")],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' }],
      }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('route_without_service_path only applies when service layer exists', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "router.get('/users', (req, res) => res.json([]));\n")],
      inventory: makeInventory({
        routes: ['routes/users.js'],
        hasApiLayer: true, hasServiceLayer: false, // no service layer
      }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    // Without service layer, we should NOT emit route_without_service_path
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('routeServiceCoverage reflects route/service linkage', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        makeFile('routes/a.js', "const svc = require('../services/A');\nrouter.get('/', svc.run);"),
        makeFile('routes/b.js', "router.get('/', (req, res) => res.json({}));"),
      ],
      inventory: makeInventory({
        routes: ['routes/a.js', 'routes/b.js'],
        services: ['services/A.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/a.js', to: 'services/A.js', importPath: '../services/A', importType: 'require' }],
      }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(2);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
    expect(r.routeServiceCoverage.coveragePercent).toBe(50);
  });

  test('each route_without_service_path subtracts 10 (cap -30)', () => {
    const routeFiles = ['routes/a.js', 'routes/b.js', 'routes/c.js', 'routes/d.js'];
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: routeFiles.map(p => makeFile(p, "router.get('/', (req,res)=>res.json({}));")),
      inventory: makeInventory({
        routes: routeFiles,
        services: ['services/S.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    // 4 routes × -10 = -40 but capped at -30 → score ≤ 70
    expect(r.completenessScore).toBeLessThanOrEqual(70);
  });
});

// ── Composition-router awareness (route_without_service_path only) ───────────
// Analyzer Improvement — Composition-Router Awareness for route_without_service_path.
// Confirmed live regression: repoId=80 snapshot #201/#202 flagged exactly 2
// route_without_service_path files — backend/routes/repoRoutes.js and
// backend/routes/portfolioRoutes.js — both composition-only routers (own no
// HTTP handler, only mount child routers) that have no business-logic
// boundary to delegate to a service in the first place.

describe('assessImplementationCompleteness — composition-router awareness', () => {
  // A
  test('A. router.use(childRouter) only — composition-only, excluded from signal and denominator', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/parentRoutes.js', "const childRoutes = require('./childRoutes');\nrouter.use(childRoutes);")],
      inventory: makeInventory({ routes: ['routes/parentRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
    expect(r.routeServiceCoverage.coveragePercent).toBe(0);
  });

  // B
  test("B. router.use('/', childRouter) only — composition-only, excluded", () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/parentRoutes.js', "const childRoutes = require('./childRoutes');\nrouter.use('/', childRoutes);")],
      inventory: makeInventory({ routes: ['routes/parentRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
  });

  // C
  test("C. app.use('/api', childRouter) only — composition-only, excluded", () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/parentRoutes.js', "const childRoutes = require('./childRoutes');\napp.use('/api', childRoutes);")],
      inventory: makeInventory({ routes: ['routes/parentRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
  });

  // D
  test('D. router.get("/x", handler) with no service import — not composition-only, remains flagged', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/handlerRoutes.js', "router.get('/x', (req, res) => res.json({}));")],
      inventory: makeInventory({ routes: ['routes/handlerRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    const sig = r.signals.find(s => s.type === 'route_without_service_path');
    expect(sig).toBeDefined();
    expect(sig.count).toBe(1);
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.coveragePercent).toBe(0);
  });

  // E
  test('E. router.post("/x", handler) with an execution/ dependency edge — denominator 1, covered 1, 100%', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/handlerRoutes.js', "const { doThing } = require('../../execution/domain/doThing');\nrouter.post('/x', doThing);")],
      inventory: makeInventory({ routes: ['routes/handlerRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/handlerRoutes.js', to: 'execution/domain/doThing.js', importPath: '../../execution/domain/doThing', importType: 'require' }],
      }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
    expect(r.routeServiceCoverage.coveragePercent).toBe(100);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  // F
  test('F. router.use(childRouter) + router.get("/x", handler), no service edge — mixed file, remains flagged', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/mixedRoutes.js', "const childRoutes = require('./childRoutes');\nrouter.use(childRoutes);\nrouter.get('/x', (req, res) => res.json({}));")],
      inventory: makeInventory({ routes: ['routes/mixedRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    const sig = r.signals.find(s => s.type === 'route_without_service_path');
    expect(sig).toBeDefined();
    expect(sig.count).toBe(1);
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.coveragePercent).toBe(0);
  });

  // G
  test('G. fooRoutes.js filename with no .use and no handler registration — not composition-only by filename alone', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/fooRoutes.js', "module.exports = { note: 'placeholder module, no routing calls at all' };")],
      inventory: makeInventory({ routes: ['routes/fooRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    // No .use() mount call exists, so _isCompositionOnlyRouter is false —
    // the file is not excluded; existing route_without_service_path behavior applies.
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    const sig = r.signals.find(s => s.type === 'route_without_service_path');
    expect(sig).toBeDefined();
  });

  // H — reuses the module's existing _stripComments helper (already used by
  // _isRichCode/_hasPlaceholderHint/_isScaffoldLike); no new parser introduced.
  test('H. ".use(" text appearing only in a comment does not classify a file as composition-only', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/handlerRoutes.js', "// example: router.use('/', childRoutes)\nrouter.get('/x', (req, res) => res.json({}));")],
      inventory: makeInventory({ routes: ['routes/handlerRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    // The commented-out .use() must not suppress the real .get() handler
    // detection — this remains a handler-owning file, flagged as before.
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeDefined();
  });

  // I
  test('I. ".get(" text appearing only in a comment does not turn a genuine composition router into a mixed router', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/parentRoutes.js', "// legacy note: used to call router.get('/x', handler) directly here\nconst childRoutes = require('./childRoutes');\nrouter.use(childRoutes);")],
      inventory: makeInventory({ routes: ['routes/parentRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });
});

// ── repoId=80-shaped composition-router regression fixtures ──────────────────

describe('assessImplementationCompleteness — repoId=80-shaped composition-router fixtures', () => {
  const repoRoutesShape = [
    "const express = require('express');",
    "const authenticate = require('../middleware/authenticate');",
    "const repoCoreRoutes = require('./repoCoreRoutes');",
    "const repoRiskRoutes = require('./repoRiskRoutes');",
    "const repoArchitectureRoutes = require('./repoArchitectureRoutes');",
    '',
    'const router = express.Router();',
    '',
    'router.use(authenticate);',
    "router.use('/', repoCoreRoutes);",
    "router.use('/', repoRiskRoutes);",
    "router.use('/', repoArchitectureRoutes);",
    '',
    'module.exports = router;',
  ].join('\n');

  const portfolioRoutesShape = [
    "const express = require('express');",
    "const authenticate = require('../middleware/authenticate');",
    "const portfolioArchitectureRoutes = require('./portfolioArchitectureRoutes');",
    "const portfolioGovernanceRoutes = require('./portfolioGovernanceRoutes');",
    '',
    'const router = express.Router();',
    '',
    'router.use(authenticate);',
    'router.use(portfolioArchitectureRoutes);',
    'router.use(portfolioGovernanceRoutes);',
    '',
    'module.exports = router;',
  ].join('\n');

  test('Fixture 1: repoRoutes.js shape is composition-only and excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/repoRoutes.js', repoRoutesShape)],
      inventory: makeInventory({ routes: ['backend/routes/repoRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('Fixture 2: portfolioRoutes.js shape is composition-only and excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/portfolioRoutes.js', portfolioRoutesShape)],
      inventory: makeInventory({ routes: ['backend/routes/portfolioRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(0);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('Fixture 3: a child/domain route with an execution/ dependency edge is handler-owning, included, and covered', () => {
    const childRouteShape = [
      "router.get('/forecast', async (req, res, next) => {",
      '  try {',
      "    const { getForecast } = require('../../execution/risk/getForecast');",
      '    res.json(await getForecast());',
      '  } catch (err) { next(err); }',
      '});',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/repoRiskRoutes.js', childRouteShape)],
      inventory: makeInventory({ routes: ['backend/routes/repoRiskRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'backend/routes/repoRiskRoutes.js', to: 'execution/risk/getForecast.js', importPath: '../../execution/risk/getForecast', importType: 'require' }],
      }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
    expect(r.routeServiceCoverage.coveragePercent).toBe(100);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });
});

// ── Full completeness regression: mirrors the repoId=80 10-route-file shape ──
// 2 composition-only routers (repoRoutes.js/portfolioRoutes.js-shaped) + 8
// handler-owning routers (all with a service/execution edge, tests present,
// no placeholder/scaffold signals, boundary not weak) — proves the eligible-
// route-file population is used consistently for both the signal and the
// routeServiceCoverage metric (8/8, not 8/10).

describe('assessImplementationCompleteness — full completeness regression (2 composition + 8 handler-owning)', () => {
  test('routeServiceCoverage denominator is 8 (handler-owning only), not 10 (all route files)', () => {
    const compositionRoutes = ['backend/routes/repoRoutes.js', 'backend/routes/portfolioRoutes.js'];
    const handlerRoutes = Array.from({ length: 8 }, (_, i) => `backend/routes/domain${i}Routes.js`);
    const allRoutes = compositionRoutes.concat(handlerRoutes);

    const compositionFiles = compositionRoutes.map(p =>
      makeFile(p, "const child = require('./child');\nrouter.use('/', child);"));

    const handlerFiles = handlerRoutes.map((p, i) =>
      makeFile(p, `const { doThing${i} } = require('../../execution/domain/doThing${i}');\nrouter.get('/x${i}', doThing${i});`));

    const testFile = makeFile('tests/unit/backend/routes/domain0Routes.test.js', "test('x', () => {});");

    const edges = handlerRoutes.map((p, i) => ({
      from: p, to: `execution/domain/doThing${i}.js`,
      importPath: `../../execution/domain/doThing${i}`, importType: 'require',
    }));

    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: compositionFiles.concat(handlerFiles, [testFile]),
      inventory: makeInventory({
        routes: allRoutes,
        tests: ['tests/unit/backend/routes/domain0Routes.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({ edges }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 90, boundaryHealthLevel: 'healthy' }),
    });

    expect(r.routeServiceCoverage.routeFileCount).toBe(8);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(8);
    expect(r.routeServiceCoverage.coveragePercent).toBe(100);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
    expect(r.signals.find(s => s.type === 'route_without_tests')).toBeUndefined();
  });
});

// ── Framework preservation: composition-only check is Express-.use()-specific ─
// The composition-only rule only recognizes generic-identifier `.use(...)`
// mount calls; it does not interpret NestJS decorators or Fastify's plugin/
// route-object registration forms as mounts, so it cannot misclassify them.

describe('assessImplementationCompleteness — framework preservation (NestJS/Fastify unaffected)', () => {
  test('a NestJS controller (decorator-based, no .use()/.get() call syntax) is evaluated exactly as before', () => {
    const nestControllerShape = [
      "import { Controller, Get } from '@nestjs/common';",
      "import { UsersService } from '../../execution/users/usersService';",
      '',
      "@Controller('users')",
      'export class UsersController {',
      '  constructor(private usersService: UsersService) {}',
      '',
      '  @Get()',
      '  findAll() { return this.usersService.findAll(); }',
      '}',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/controllers/users.controller.ts', nestControllerShape, 'TypeScript')],
      inventory: makeInventory({ routes: ['backend/controllers/users.controller.ts'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'backend/controllers/users.controller.ts', to: 'execution/users/usersService.ts', importPath: '../../execution/users/usersService', importType: 'import' }],
      }),
    });
    // No .use() mount call anywhere in this file, so _isCompositionOnlyRouter
    // is false — it is evaluated as a normal (handler-owning) route file,
    // exactly as before this change, and correctly counted as covered.
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('a Fastify route-object registration (fastify.route({...})) is evaluated exactly as before', () => {
    const fastifyRouteShape = [
      "const { getWidgets } = require('../../execution/widgets/getWidgets');",
      'fastify.route({',
      "  method: 'GET',",
      "  url: '/widgets',",
      '  handler: getWidgets,',
      '});',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/widgetsRoutes.js', fastifyRouteShape)],
      inventory: makeInventory({ routes: ['backend/routes/widgetsRoutes.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'backend/routes/widgetsRoutes.js', to: 'execution/widgets/getWidgets.js', importPath: '../../execution/widgets/getWidgets', importType: 'require' }],
      }),
    });
    // fastify.route({...}) contains neither a generic `.use(` mount call nor
    // a `.get(`/`.post(`/etc. call — _isCompositionOnlyRouter's hasMount check
    // is false, so this file is unaffected by the composition-only exclusion
    // and is evaluated exactly as before.
    expect(r.routeServiceCoverage.routeFileCount).toBe(1);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });
});

// ── Unresolved frontend API ───────────────────────────────────────────────────

describe('assessImplementationCompleteness — unresolved_frontend_api', () => {
  test('unresolved frontend call emits signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    const sig = r.signals.find(s => s.type === 'unresolved_frontend_api');
    expect(sig).toBeDefined();
  });

  test('unresolved frontend call appears in evidence', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    const ev = r.evidence.find(e => e.type === 'unresolved_frontend_api');
    expect(ev).toBeDefined();
    expect(ev.file).toBe('src/app.js');
  });

  test('each unresolved frontend call subtracts 12 (cap -36)', () => {
    const calls = Array.from({ length: 4 }, (_, i) => ({ from: 'src/app.js', method: 'GET', path: `/api/g${i}` }));
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: calls }),
    });
    // 4 × -12 = -48 capped at -36 → score ≤ 64
    expect(r.completenessScore).toBeLessThanOrEqual(64);
  });
});

// ── Frontend without backend linkage ─────────────────────────────────────────

describe('assessImplementationCompleteness — frontend_without_backend_linkage', () => {
  test('frontend file with no API calls in a full-stack app emits signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('src/pages/Dashboard.jsx', "export default function Dashboard() { return <div>Hello</div>; }")],
      inventory: makeInventory({
        frontend: ['src/pages/Dashboard.jsx'],
        hasFrontend: true, hasApiLayer: true, likelyFullStackApp: true,
      }),
      routeApiStructure: makeRouteApiStructure({
        frontendApiCalls: [], // no API calls from frontend
      }),
      apiLinkage: makeApiLinkage({ frontendCallCount: 0 }),
    });
    const sig = r.signals.find(s => s.type === 'frontend_without_backend_linkage');
    expect(sig).toBeDefined();
  });

  test('frontend file with API calls does not emit frontend_without_backend_linkage', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('src/pages/Dashboard.jsx', "fetch('/api/users').then(r=>r.json());")],
      inventory: makeInventory({ frontend: ['src/pages/Dashboard.jsx'], hasFrontend: true, hasApiLayer: true, likelyFullStackApp: true }),
      routeApiStructure: makeRouteApiStructure({
        frontendApiCalls: [{ method: 'GET', path: '/api/users', file: 'src/pages/Dashboard.jsx', client: 'fetch' }],
      }),
      apiLinkage: makeApiLinkage({ frontendCallCount: 1 }),
    });
    expect(r.signals.find(s => s.type === 'frontend_without_backend_linkage')).toBeUndefined();
  });
});

// ── Placeholder code hints ────────────────────────────────────────────────────

describe('assessImplementationCompleteness — placeholder_code_hint', () => {
  test('TODO in source emits placeholder signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "// TODO: implement this handler\nrouter.get('/users', (req, res) => res.json([]));")],
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('FIXME in source emits placeholder signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('services/UserService.js', "// FIXME: real implementation needed\nmodule.exports = {};")],
      inventory: makeInventory({ services: ['services/UserService.js'], hasServiceLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('throw new Error("Not implemented") emits placeholder signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('services/AuthService.js', "module.exports = { login: () => { throw new Error('Not implemented'); } };")],
      inventory: makeInventory({ services: ['services/AuthService.js'], hasServiceLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('"not implemented" string in non-comment code emits placeholder signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('services/PayService.js', "const msg = 'not implemented yet';")],
      inventory: makeInventory({ services: ['services/PayService.js'], hasServiceLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('"coming soon" in non-comment code emits placeholder signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/beta.js', "res.json({ message: 'coming soon' });")],
      inventory: makeInventory({ routes: ['routes/beta.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('placeholder text only in line comment is ignored', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "// TODO: improve this later\nrouter.get('/users', UserService.list);")],
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
    });
    // Comment-only TODO should NOT trigger placeholder signal
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });

  test('placeholder text only in block comment is ignored', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "/* FIXME: placeholder for now */\nrouter.get('/users', UserService.list);")],
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });

  test('placeholderAssessment lists affected files', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        makeFile('services/A.js', "throw new Error('Not implemented');"),
        makeFile('services/B.js', "module.exports = {};"),
      ],
      inventory: makeInventory({ services: ['services/A.js', 'services/B.js'], hasServiceLayer: true }),
    });
    expect(r.placeholderAssessment.files).toContain('services/A.js');
    expect(r.placeholderAssessment.files).not.toContain('services/B.js');
  });

  test('each placeholder file subtracts 6 (cap -30)', () => {
    const services = Array.from({ length: 6 }, (_, i) => `services/S${i}.js`);
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: services.map(p => makeFile(p, "throw new Error('Not implemented');")),
      inventory: makeInventory({ services, hasServiceLayer: true }),
    });
    // 6 × -6 = -36 capped at -30 → score ≤ 70
    expect(r.completenessScore).toBeLessThanOrEqual(70);
  });
});

// ── Scaffold-like files ───────────────────────────────────────────────────────

describe('assessImplementationCompleteness — scaffold_like_file', () => {
  test('React component returning only static JSX emits scaffold signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('src/components/Button.jsx', "export default function Button() { return <button>Click me</button>; }")],
      inventory: makeInventory({ components: ['src/components/Button.jsx'], hasComponentLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeDefined();
  });

  test('Express route returning only static JSON emits scaffold signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/health.js', "router.get('/health', (req, res) => res.json({ status: 'ok' }));")],
      inventory: makeInventory({ routes: ['routes/health.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeDefined();
  });

  test('console.log-only handler emits scaffold signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/debug.js', "router.get('/debug', (req, res) => { console.log(req); res.sendStatus(200); });")],
      inventory: makeInventory({ routes: ['routes/debug.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeDefined();
  });

  test('rich implementation does not emit scaffold signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('routes/users.js', "const UserService = require('../services/UserService');\nrouter.get('/users', async (req, res) => { const users = await UserService.list(); res.json(users); });")],
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' }],
      }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
  });

  test('scaffoldAssessment lists affected files', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('src/components/Empty.jsx', "export default function Empty() { return <div>Placeholder</div>; }")],
      inventory: makeInventory({ components: ['src/components/Empty.jsx'], hasComponentLayer: true }),
    });
    expect(r.scaffoldAssessment.files).toContain('src/components/Empty.jsx');
  });

  test('each scaffold file subtracts 8 (cap -32)', () => {
    const comps = Array.from({ length: 5 }, (_, i) => `src/components/C${i}.jsx`);
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: comps.map(p => makeFile(p, "export default function C() { return <div>Hello</div>; }")),
      inventory: makeInventory({ components: comps, hasComponentLayer: true }),
    });
    // 5 × -8 = -40 capped at -32 → score ≤ 68
    expect(r.completenessScore).toBeLessThanOrEqual(68);
  });
});

// ── Test-file exclusion from placeholder/scaffold heuristics ─────────────────
// Analyzer Improvement — Exclude Test Files from Implementation Placeholder/
// Scaffold Heuristics. Confirmed live regression: repoId=80 snapshot #201
// flagged 9 tests/unit/frontend/*.test.js files as placeholder_code_hint —
// all 9 use this repository's established verbatim-copy test convention
// (the pure function under test is copied directly into the test file, so
// there is no require()/import to satisfy _isRichCode()) and legitimately
// contain "return null;" guards or the word "placeholder" as UI vocabulary.

describe('assessImplementationCompleteness — placeholder_code_hint excludes test files', () => {
  const testFixtureContent = [
    "function buildWidget(data) {",
    "  if (!data) return null;",
    "  return '<div>' + data.label + '</div>';",
    "}",
    "test('renders a placeholder when no data', () => {",
    "  expect(buildWidget(null)).toBe(null);",
    "});",
    "test('dummy mock data is rendered', () => {",
    "  const mock = { label: 'x' };",
    "  expect(buildWidget(mock)).toContain('x');",
    "});",
  ].join('\n');

  // A
  test('A. tests/unit/frontend/foo.test.js with return null / placeholder / dummy / mock data and no require/import is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/frontend/foo.test.js', testFixtureContent)],
      inventory: makeInventory({ frontend: ['tests/unit/frontend/foo.test.js'], hasFrontend: true, hasTests: true, tests: ['tests/unit/frontend/foo.test.js'] }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('tests/unit/frontend/foo.test.js');
  });

  // B
  test('B. a .spec.ts test file with placeholder-pattern text is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/widget.spec.ts', testFixtureContent, 'TypeScript')],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('tests/unit/widget.spec.ts');
  });

  // C
  test('C. __tests__/renderer.js (plain basename, no .test/.spec) is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('__tests__/renderer.js', testFixtureContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('__tests__/renderer.js');
  });

  // D
  test('D. a nested test directory (packages/web/tests/fixture.js) is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('packages/web/tests/fixture.js', testFixtureContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('packages/web/tests/fixture.js');
  });

  // E — representative reproduction of the actual snapshot #201 shape
  test('E. a snapshot-#201-style verbatim-copy dashboard test file produces no placeholder_code_hint', () => {
    const dashboardTestContent = [
      "function _resolveOverviewArchData(data) { return null; }",
      "function _resolveOverviewFcData()   { return null; }",
      "describe('_resolveOverviewArchData', () => {",
      "  test('no data shows — placeholder', () => {",
      "    expect(_resolveOverviewArchData(null)).toBe(null);",
      "  });",
      "});",
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/frontend/dashboardExample.test.js', dashboardTestContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });

  // F — regression: real production stub must still be flagged
  test('F. frontend/renderDashboard.js with a genuine TODO/return-null placeholder is still flagged', () => {
    // Object-literal arrow-function stub (not a named `function X() {}` declaration),
    // so it is not suppressed by _isRichCode's function+module.exports rule — mirrors
    // the existing "throw new Error('Not implemented')" false-positive-suppression fixtures.
    const productionStub = "// TODO: implement real rendering\nmodule.exports = { renderDashboard: (data) => { throw new Error('Not implemented'); } };";
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/renderDashboard.js', productionStub)],
      inventory: makeInventory({ frontend: ['frontend/renderDashboard.js'], hasFrontend: true }),
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
    expect(r.placeholderAssessment.files).toContain('frontend/renderDashboard.js');
  });

  // G — false-positive path controls remain scanned
  test.each([
    'backend/contest/routes.js',
    'frontend/latest/dashboard.js',
    'services/testimonials/send.js',
  ])('G. %s (only contains "test" as a substring) remains eligible for placeholder analysis', (path) => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile(path, "throw new Error('Not implemented');")],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
    expect(r.placeholderAssessment.files).toContain(path);
  });

  // H — .md exclusion unchanged
  test('H. .md exclusion still works unchanged', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('docs/guide.md', "TODO: placeholder content, not implemented yet")],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });

  // I — .html exclusion unchanged
  test('I. .html exclusion still works unchanged', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/manage-repos.html', '<input placeholder="dummy value">')],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });
});

// ── Test-file exclusion from scaffold_like_file heuristic ────────────────────

describe('assessImplementationCompleteness — scaffold_like_file excludes test files', () => {
  const staticJsxContent = "export default function Empty() { return <div>Placeholder</div>; }";
  const staticJsonRouteContent = "router.get('/health', (req, res) => res.json({ status: 'ok' }));";

  // A
  test('A. a *.test.jsx file satisfying the static-JSX scaffold detector is not counted', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/frontend/Empty.test.jsx', staticJsxContent)],
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
    expect(r.scaffoldAssessment.files).not.toContain('tests/unit/frontend/Empty.test.jsx');
  });

  // B
  test('B. a *.spec.ts file satisfying the static-JSON-route scaffold detector is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/backend/health.spec.ts', staticJsonRouteContent, 'TypeScript')],
      inventory: makeInventory({ routes: ['tests/unit/backend/health.spec.ts'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
    expect(r.scaffoldAssessment.files).not.toContain('tests/unit/backend/health.spec.ts');
  });

  // C
  test('C. a file under tests/ (no .test/.spec basename) satisfying the scaffold detector is excluded', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('tests/unit/health.js', staticJsonRouteContent)],
      inventory: makeInventory({ routes: ['tests/unit/health.js'], hasApiLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
  });

  // D — regression: genuine production scaffold-like file remains counted
  test('D. a genuine production component satisfying the scaffold detector remains counted', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('src/components/Empty.jsx', staticJsxContent)],
      inventory: makeInventory({ components: ['src/components/Empty.jsx'], hasComponentLayer: true }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeDefined();
    expect(r.scaffoldAssessment.files).toContain('src/components/Empty.jsx');
  });

  // E — false-positive path controls remain eligible
  test('E. frontend/latest/Widget.jsx (only contains "test" as a substring) remains eligible for scaffold analysis', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/latest/Widget.jsx', staticJsxContent)],
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeDefined();
  });
});

// ── Combined end-to-end: real inventory, test visibility, production evidence ─
// Proves the intended architectural separation: test files remain visible as
// test evidence (hasTests true, no routes/services_without_tests), but their
// contents never become production placeholder/scaffold evidence.

describe('assessImplementationCompleteness — combined end-to-end (real buildRepositoryStructureInventory)', () => {
  const { buildRepositoryStructureInventory } = require('../../../../execution/architecture/buildRepositoryStructureInventory');

  test('test placeholder/scaffold content is excluded while production placeholder/scaffold content is still flagged, and hasTests is true', () => {
    const files = [
      makeFile('backend/routes/fooRoutes.js', "const svc = require('../../services/fooService');\nrouter.get('/foo', svc.getFoo);"),
      makeFile('services/fooService.js',      "module.exports = { getFoo: async () => db.query('SELECT 1') };"),
      makeFile('tests/unit/backend/routes/fooRoutes.test.js', "test('foo', () => {});"),
      makeFile('tests/unit/frontend/widget.test.js',
        "function buildWidget(data) { if (!data) return null; return data.label; }\n" +
        "test('placeholder when empty', () => { expect(buildWidget(null)).toBe(null); });"),
      makeFile('tests/unit/frontend/Empty.test.jsx', "export default function Empty() { return <div>Placeholder</div>; }"),
      makeFile('frontend/renderStub.js', "// TODO: implement real rendering\nmodule.exports = { renderStub: () => { throw new Error('Not implemented'); } };"),
      makeFile('src/components/Empty.jsx', "export default function Empty() { return <div>Placeholder</div>; }"),
    ];

    const inventory = buildRepositoryStructureInventory({ files });
    expect(inventory.architectureHints.hasTests).toBe(true);

    const r = assessImplementationCompleteness({
      files,
      inventory,
      dependencyGraph: {
        nodes: [], edges: [
          { from: 'backend/routes/fooRoutes.js', to: 'services/fooService.js', importPath: '../../services/fooService', importType: 'require' },
        ],
        circularDependencies: [], boundaryHints: [],
        couplingMetrics: { totalNodes: 0, totalEdges: 0, unresolvedCount: 0, externalDependencyCount: 0, circularDependencyCount: 0, averageOutDegree: 0, highFanOutFiles: [], highFanInFiles: [] },
      },
      routeApiStructure: makeRouteApiStructure(),
      apiLinkage: makeApiLinkage(),
      boundaryVerification: makeBoundaryVerification(),
    });

    expect(r.signals.find(s => s.type === 'route_without_tests')).toBeUndefined();
    expect(r.signals.find(s => s.type === 'service_without_tests')).toBeUndefined();

    expect(r.placeholderAssessment.files).not.toContain('tests/unit/frontend/widget.test.js');
    expect(r.scaffoldAssessment.files).not.toContain('tests/unit/frontend/Empty.test.jsx');

    expect(r.placeholderAssessment.files).toContain('frontend/renderStub.js');
    expect(r.scaffoldAssessment.files).toContain('src/components/Empty.jsx');
  });
});

// ── Routes without tests ──────────────────────────────────────────────────────

describe('assessImplementationCompleteness — routes_without_tests', () => {
  test('routes exist but no tests emits signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true, hasTests: false }),
    });
    const sig = r.signals.find(s => s.type === 'route_without_tests');
    expect(sig).toBeDefined();
  });

  test('routes with tests do NOT emit route_without_tests', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['routes/users.js'], tests: ['tests/routes/users.test.js'],
        hasApiLayer: true, hasTests: true,
      }),
    });
    expect(r.signals.find(s => s.type === 'route_without_tests')).toBeUndefined();
  });

  test('each route without tests subtracts 5 (cap -20)', () => {
    const routes = Array.from({ length: 5 }, (_, i) => `routes/r${i}.js`);
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes, hasApiLayer: true, hasTests: false }),
    });
    // 5 × -5 = -25 capped at -20 → score ≤ 80
    expect(r.completenessScore).toBeLessThanOrEqual(80);
  });
});

// ── Services without tests ────────────────────────────────────────────────────

describe('assessImplementationCompleteness — services_without_tests', () => {
  test('services without tests emit signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ services: ['services/UserService.js'], hasServiceLayer: true, hasTests: false }),
    });
    expect(r.signals.find(s => s.type === 'service_without_tests')).toBeDefined();
  });

  test('each service without tests subtracts 5 (cap -20)', () => {
    const services = Array.from({ length: 5 }, (_, i) => `services/S${i}.js`);
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ services, hasServiceLayer: true, hasTests: false }),
    });
    expect(r.completenessScore).toBeLessThanOrEqual(80);
  });
});

// ── Models without usage ──────────────────────────────────────────────────────

describe('assessImplementationCompleteness — model_without_usage', () => {
  test('model file with no inbound edges emits signal', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ models: ['models/User.js'], hasModelLayer: true }),
      dependencyGraph: makeDependencyGraph({
        nodes: [{ path: 'models/User.js', language: 'JavaScript', category: 'models', inboundCount: 0, outboundCount: 0 }],
        edges: [],
      }),
    });
    expect(r.signals.find(s => s.type === 'model_without_usage')).toBeDefined();
  });

  test('model with inbound edges does NOT emit model_without_usage', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ models: ['models/User.js'], hasModelLayer: true }),
      dependencyGraph: makeDependencyGraph({
        nodes: [{ path: 'models/User.js', language: 'JavaScript', category: 'models', inboundCount: 2, outboundCount: 0 }],
        edges: [
          { from: 'services/UserService.js', to: 'models/User.js', importPath: '../models/User', importType: 'require' },
        ],
      }),
    });
    expect(r.signals.find(s => s.type === 'model_without_usage')).toBeUndefined();
  });

  test('each unused model subtracts 6 (cap -24)', () => {
    const models = Array.from({ length: 5 }, (_, i) => `models/M${i}.js`);
    const nodes  = models.map(p => ({ path: p, language: 'JavaScript', category: 'models', inboundCount: 0, outboundCount: 0 }));
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ models, hasModelLayer: true }),
      dependencyGraph: makeDependencyGraph({ nodes, edges: [] }),
    });
    // 5 × -6 = -30 capped at -24 → score ≤ 76
    expect(r.completenessScore).toBeLessThanOrEqual(76);
  });
});

// ── Boundary risk penalty ─────────────────────────────────────────────────────

describe('assessImplementationCompleteness — boundary risk penalty', () => {
  test('risky boundary health subtracts 15', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 20, boundaryHealthLevel: 'risky' }),
    });
    expect(r.completenessScore).toBeLessThanOrEqual(85);
  });

  test('weak boundary health subtracts 8', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 55, boundaryHealthLevel: 'weak' }),
    });
    expect(r.completenessScore).toBeLessThanOrEqual(92);
  });

  test('healthy boundary health has no penalty', () => {
    const r1 = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 90, boundaryHealthLevel: 'healthy' }),
    });
    const r2 = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 100, boundaryHealthLevel: 'healthy' }),
    });
    expect(r1.completenessScore).toBe(r2.completenessScore);
  });
});

// ── Level thresholds ──────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — level thresholds', () => {
  test('score >= 85 → complete', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        makeFile('routes/users.js', "const svc = require('../services/UserService');\nrouter.get('/users', svc.list);"),
        makeFile('tests/users.test.js', "test('list', () => {});"),
      ],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        tests: ['tests/users.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' }],
      }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [], frontendCallCount: 0,
      }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 100, boundaryHealthLevel: 'healthy' }),
    });
    expect(r.completenessLevel).toBe('complete');
  });

  test('score >= 60 and < 85 → partial', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true, hasTests: false }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 75, boundaryHealthLevel: 'watch' }),
    });
    // routes_without_tests: -5, routes_without_services warning if no services
    // Should land in partial range
    expect(['partial', 'complete', 'weak']).toContain(r.completenessLevel);
  });

  test('score 0 with no structural input → unknown', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(r.completenessLevel).toBe('unknown');
  });

  test('score clamped to 0 minimum', () => {
    const routes = Array.from({ length: 4 }, (_, i) => `routes/r${i}.js`);
    const services = Array.from({ length: 4 }, (_, i) => `services/S${i}.js`);
    const calls = Array.from({ length: 4 }, (_, i) => ({ from: 'src/app.js', method: 'GET', path: `/api/g${i}` }));
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        ...routes.map(p => makeFile(p, "throw new Error('Not implemented'); // placeholder\nrouter.get('/', (req, res) => res.json({}));")),
        ...services.map(p => makeFile(p, "throw new Error('Not implemented');")),
      ],
      inventory: makeInventory({ routes, services, hasApiLayer: true, hasServiceLayer: true, hasTests: false }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: calls }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 10, boundaryHealthLevel: 'risky' }),
    });
    expect(r.completenessScore).toBeGreaterThanOrEqual(0);
  });
});

// ── Signal shape ──────────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — signal shape', () => {
  test('signal has type, severity, count, summary fields', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true, hasTests: false }),
    });
    const sig = r.signals.find(s => s.type === 'route_without_tests');
    expect(sig).toHaveProperty('type');
    expect(sig).toHaveProperty('severity');
    expect(sig).toHaveProperty('count');
    expect(sig).toHaveProperty('summary');
  });

  test('evidence has type, file, details fields', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    const ev = r.evidence[0];
    expect(ev).toHaveProperty('type');
    expect(ev).toHaveProperty('file');
    expect(ev).toHaveProperty('details');
  });
});

// ── weakImplementationHints ───────────────────────────────────────────────────

describe('assessImplementationCompleteness — weakImplementationHints', () => {
  test('weakImplementationHints is an array', () => {
    const r = assessImplementationCompleteness(emptyInput());
    expect(Array.isArray(r.weakImplementationHints)).toBe(true);
  });

  test('weak hints populated when signals exist', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true, hasTests: false }),
    });
    expect(r.weakImplementationHints.length).toBeGreaterThan(0);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — recommendations', () => {
  test('unresolved frontend calls generate recommendations first', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.recommendations[0]).toMatch(/frontend|api|unresolved/i);
  });

  test('max 5 recommendations', () => {
    const routes = Array.from({ length: 3 }, (_, i) => `routes/r${i}.js`);
    const services = Array.from({ length: 2 }, (_, i) => `services/S${i}.js`);
    const calls = Array.from({ length: 2 }, (_, i) => ({ from: 'src/app.js', method: 'GET', path: `/api/g${i}` }));
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        ...routes.map(p => makeFile(p, "throw new Error('Not implemented');")),
        makeFile('src/Empty.jsx', "export default function Empty() { return <div>Hello</div>; }"),
      ],
      inventory: makeInventory({
        routes, services, frontend: ['src/Empty.jsx'],
        hasApiLayer: true, hasServiceLayer: true, hasFrontend: true, hasTests: false,
      }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: calls }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 30, boundaryHealthLevel: 'risky' }),
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('each recommendation is a non-empty string', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true, hasTests: false }),
    });
    r.recommendations.forEach(rec => {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    });
  });

  test('no recommendations for healthy implementation', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [
        makeFile('routes/users.js', "const svc = require('../services/UserService');\nrouter.get('/users', svc.list);"),
        makeFile('tests/users.test.js', "test('list', () => {});"),
      ],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        tests: ['tests/users.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' }],
      }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: [], frontendCallCount: 0 }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 100, boundaryHealthLevel: 'healthy' }),
    });
    expect(r.recommendations.length).toBe(0);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — determinism', () => {
  test('same input produces identical output', () => {
    const input = {
      files: [
        makeFile('routes/users.js', "throw new Error('Not implemented');"),
        makeFile('services/UserService.js', "// TODO: complete this"),
      ],
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true, hasTests: false,
      }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
      routeApiStructure: makeRouteApiStructure(),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
      boundaryVerification: makeBoundaryVerification({ boundaryHealthScore: 50, boundaryHealthLevel: 'weak' }),
    };
    const r1 = assessImplementationCompleteness(input);
    const r2 = assessImplementationCompleteness(input);
    expect(r1).toEqual(r2);
  });

  test('signals sorted by type', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/S.js'],
        hasApiLayer: true, hasServiceLayer: true, hasTests: false,
      }),
      dependencyGraph: makeDependencyGraph({ edges: [] }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    const types = r.signals.map(s => s.type);
    expect(types).toEqual([...types].sort());
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('assessImplementationCompleteness — non-mutation', () => {
  test('input files array not mutated', () => {
    const files = [makeFile('routes/users.js', "router.get('/users', (req,res)=>res.json([]));")];
    const origPath = files[0].path;
    assessImplementationCompleteness({ ...emptyInput(), files });
    expect(files[0].path).toBe(origPath);
  });

  test('inventory categories not mutated', () => {
    const inventory = makeInventory({ routes: ['routes/users.js'], hasApiLayer: true });
    const origLen = inventory.categories.routes.length;
    assessImplementationCompleteness({ ...emptyInput(), inventory });
    expect(inventory.categories.routes.length).toBe(origLen);
  });
});

// ── frontendBackendCoverage ───────────────────────────────────────────────────

describe('assessImplementationCompleteness — frontendBackendCoverage', () => {
  test('uses apiLinkage.coverage when available', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        frontendCallCount: 5,
        linkedFrontendCallCount: 3,
        frontendCoveragePercent: 60,
        backendCoveragePercent: 80,
      }),
    });
    expect(r.frontendBackendCoverage.frontendCoveragePercent).toBe(60);
    expect(r.frontendBackendCoverage.backendCoveragePercent).toBe(80);
  });
});

// ── execution/* service-layer detection ──────────────────────────────────────

describe('assessImplementationCompleteness — execution/* service-layer detection', () => {
  test('route importing execution/* does NOT emit route_without_service_path (Mode 1)', () => {
    // This repo uses execution/ as its service layer, not services/.
    // hasServiceLayer=true because services/alertDecision.js etc. exist at root level.
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/notificationRoutes.js', "const { getNotifications } = require('../../execution/notifications/getNotifications');\nrouter.get('/', async (req, res) => res.json(await getNotifications({ db: req.app.locals.db, userId: req.user.userId })));\n")],
      inventory: makeInventory({
        routes:   ['backend/routes/notificationRoutes.js'],
        services: ['services/alertDecision.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'backend/routes/notificationRoutes.js', to: 'execution/notifications/getNotifications.js', importPath: '../../execution/notifications/getNotifications', importType: 'require' },
        ],
      }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('route importing execution/* is counted as having a service import', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes:   ['backend/routes/notificationRoutes.js'],
        services: ['services/alertDecision.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'backend/routes/notificationRoutes.js', to: 'execution/notifications/getNotifications.js', importPath: '../../execution/notifications/getNotifications', importType: 'require' },
        ],
      }),
    });
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
  });

  test('all routes using execution/* produce 100% routeServiceCoverage (Mode 1)', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes:   ['backend/routes/authRoutes.js', 'backend/routes/notificationRoutes.js'],
        services: ['services/alertDecision.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'backend/routes/authRoutes.js',         to: 'execution/auth/exchangeOAuthCode.js',            importPath: '../../execution/auth/exchangeOAuthCode',            importType: 'require' },
          { from: 'backend/routes/notificationRoutes.js', to: 'execution/notifications/getNotifications.js',    importPath: '../../execution/notifications/getNotifications',    importType: 'require' },
        ],
      }),
    });
    expect(r.routeServiceCoverage.coveragePercent).toBe(100);
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
  });

  test('execution/* edge prevents scaffold-like classification', () => {
    // A static-JSON route would normally be scaffold_like, but an execution/ import
    // means it has real orchestration — _isScaffoldLike should return false.
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('backend/routes/notificationRoutes.js', "router.get('/notifications', (req, res) => res.json([]));\n")],
      inventory: makeInventory({
        routes:   ['backend/routes/notificationRoutes.js'],
        services: ['services/alertDecision.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'backend/routes/notificationRoutes.js', to: 'execution/notifications/getNotifications.js', importPath: '../../execution/notifications/getNotifications', importType: 'require' },
        ],
      }),
    });
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
  });

  test('services/* paths still recognized after regex update (regression guard)', () => {
    // Existing services/ convention must continue to be recognized.
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes:   ['routes/users.js'],
        services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' },
        ],
      }),
    });
    expect(r.signals.find(s => s.type === 'route_without_service_path')).toBeUndefined();
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(1);
  });

  test('mixed routes: execution/* and services/* both count toward coverage', () => {
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      inventory: makeInventory({
        routes:   ['routes/users.js', 'backend/routes/notificationRoutes.js'],
        services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'routes/users.js',                      to: 'services/UserService.js',                     importPath: '../services/UserService',                     importType: 'require' },
          { from: 'backend/routes/notificationRoutes.js', to: 'execution/notifications/getNotifications.js', importPath: '../../execution/notifications/getNotifications', importType: 'require' },
        ],
      }),
    });
    expect(r.routeServiceCoverage.routeFileCount).toBe(2);
    expect(r.routeServiceCoverage.routeFilesWithServiceImport).toBe(2);
    expect(r.routeServiceCoverage.coveragePercent).toBe(100);
  });
});

// ── False-positive suppression: module.exports + .md exclusion ───────────────

describe('assessImplementationCompleteness — false-positive suppression (Step #9)', () => {
  test('exported pure function with return [] is not flagged as placeholder', () => {
    // Pure computation module: no require/async, but has module.exports — should be suppressed.
    const code = [
      "'use strict';",
      'function getPortfolioHistory(rows) {',
      '  if (!Array.isArray(rows)) return [];',
      '  return rows.map(function(r) { return { id: r.id, score: r.score }; });',
      '}',
      'module.exports = { getPortfolioHistory };',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/risk/getPortfolioHistory.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('execution/risk/getPortfolioHistory.js');
  });

  test('exported pure function with return null is not flagged as placeholder', () => {
    const code = [
      "'use strict';",
      'function scoreRepositoryMaturity(isoDate) {',
      '  if (!isoDate) return null;',
      '  var ms = Date.parse(isoDate);',
      '  if (!isFinite(ms)) return null;',
      '  return ms;',
      '}',
      'module.exports = { scoreRepositoryMaturity };',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/risk/scoreRepositoryMaturity.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('execution/risk/scoreRepositoryMaturity.js');
  });

  test('module containing "placeholder" in a recommendation string is not flagged when exported', () => {
    // Architecture analyzer recommends "resolve placeholder patterns" — the word appears in a string,
    // not as a stub signal. The module.exports makes it rich code.
    const code = [
      "'use strict';",
      'function analyzeArchitectureDrift(before, after) {',
      '  var recs = [];',
      "  recs.push('Review new implementation weakness signals and resolve placeholder or scaffold patterns.');",
      '  return { recs: recs };',
      '}',
      'module.exports = { analyzeArchitectureDrift };',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/architecture/analyzeArchitectureDrift.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('execution/architecture/analyzeArchitectureDrift.js');
  });

  test('markdown file containing "Placeholder charts" is not flagged', () => {
    // Wireframe specs and documentation contain "Placeholder" as English prose — not code stubs.
    const mdContent = [
      '# Dashboard Wireframe',
      '',
      '| Section | Content |',
      '|---------|---------|',
      '| Charts  | Placeholder charts |',
      '| Cards   | Placeholder cards  |',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/27_dashboard_wireframe_spec.md', mdContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('frontend/27_dashboard_wireframe_spec.md');
  });

  test('PROGRESS.md mentioning placeholder in prose is not flagged', () => {
    const mdContent = '# PROGRESS.md\n\nCapability: expose incomplete or placeholder implementations\n';
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('PROGRESS.md', mdContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('PROGRESS.md');
  });

  test('real stub — throw Not implemented without module.exports — is still flagged', () => {
    // No module.exports, no require, no async — a genuine unimplemented stub.
    const code = "function login() { throw new Error('Not implemented'); }";
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/auth/login.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
    expect(r.placeholderAssessment.files).toContain('execution/auth/login.js');
  });

  test('real stub — TODO in a file without exports — is still flagged', () => {
    const code = "// TODO: implement rate limiting\nfunction rateLimit() {}";
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('middleware/rateLimit.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
  });

  test('named exported function with return null guard is not flagged (not scaffold or placeholder)', () => {
    // A named, exported pure function with a return-null guard is a legitimate module — not a stub.
    // Both a named function definition AND module.exports must be present for suppression.
    const code = [
      "'use strict';",
      'function nullGuard(x) {',
      '  if (!x) return null;',
      '  return x.value;',
      '}',
      'module.exports = { nullGuard };',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/risk/nullGuard.js', code)],
    });
    // Not in routeFiles/componentFiles inventory, so no scaffold signal
    expect(r.signals.find(s => s.type === 'scaffold_like_file')).toBeUndefined();
    // Named function + module.exports suppresses the return-null guard-clause false positive
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
  });
});

describe('assessImplementationCompleteness — false-positive suppression (Step #12)', () => {
  test('HTML file with placeholder= attributes and return null guards is not flagged', () => {
    // frontend/dashboard.html: placeholder= is an HTML input hint attribute, not a code stub.
    // return null in frontend fetch wrappers are HTTP guard clauses, not unimplemented stubs.
    const html = [
      '<input type="search" id="repo-search-input" placeholder="Search repositories…">',
      '<script>',
      'function loadArchitecture(repoId) {',
      '  return fetch(\'/api/repos/\' + repoId + \'/architecture\')',
      '    .then(function(r) {',
      '      if (r.status === 401 || r.status === 403) return null;',
      '      if (!r.ok) return null;',
      '      return r.json().catch(function() { return null; });',
      '    });',
      '}',
      '</script>',
    ].join('\n');
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/dashboard.html', html)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('frontend/dashboard.html');
  });

  test('manage-repos.html with placeholder= attribute is not flagged', () => {
    const html = '<input type="url" class="url-input" placeholder="https://github.com/owner/repo">';
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('frontend/manage-repos.html', html)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('frontend/manage-repos.html');
  });

  test('markdown exclusion still works after adding html exclusion (regression guard)', () => {
    const mdContent = '# Spec\n\nTODO: add placeholder charts\nreturn null when no data';
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('spec/wireframe.md', mdContent)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeUndefined();
    expect(r.placeholderAssessment.files).not.toContain('spec/wireframe.md');
  });

  test('real JavaScript stub is still flagged after adding html exclusion (regression guard)', () => {
    const code = "// TODO: implement session refresh\nfunction refreshSession() {}";
    const r = assessImplementationCompleteness({
      ...emptyInput(),
      files: [makeFile('execution/auth/refreshSession.js', code)],
    });
    expect(r.signals.find(s => s.type === 'placeholder_code_hint')).toBeDefined();
    expect(r.placeholderAssessment.files).toContain('execution/auth/refreshSession.js');
  });
});

// ── End-to-end: real buildRepositoryStructureInventory → hasTests → completeness ──
// Analyzer Improvement — Restore Test-File Visibility Without Scanning Test
// Fixtures as Architecture. Test files are no longer excluded before reaching
// the inventory categorizer (that exclusion moved to extractRouteApiStructure.js
// at extraction time), so this validates the repo-wide hasTests boolean flows
// correctly end-to-end from real file paths through to route_without_tests/
// service_without_tests. This validates the CURRENT repo-wide hasTests
// heuristic only — there is still no per-file production-file-to-test-file
// matcher, so this does not (and cannot) prove per-file coverage association.

describe('assessImplementationCompleteness — end-to-end inventory visibility (real buildRepositoryStructureInventory)', () => {
  const { buildRepositoryStructureInventory } = require('../../../../execution/architecture/buildRepositoryStructureInventory');

  function buildInventoryFromFiles(files) {
    return buildRepositoryStructureInventory({ files });
  }

  test('requirement 6: test files reach categories.routes/services/tests and hasTests becomes true end-to-end', () => {
    const files = [
      makeFile('backend/routes/fooRoutes.js',                  "router.get('/foo', getFoo);"),
      makeFile('services/domain/doThing.js',                   'module.exports = { doThing: () => {} };'),
      makeFile('tests/unit/backend/routes/fooRoutes.test.js',  "test('foo', () => {});"),
      makeFile('tests/unit/services/domain/doThing.test.js',   "test('doThing', () => {});"),
    ];

    const inventory = buildInventoryFromFiles(files);

    expect(inventory.categories.routes).toContain('backend/routes/fooRoutes.js');
    expect(inventory.categories.services).toContain('services/domain/doThing.js');
    expect(inventory.categories.tests).toEqual(
      expect.arrayContaining([
        'tests/unit/backend/routes/fooRoutes.test.js',
        'tests/unit/services/domain/doThing.test.js',
      ])
    );
    expect(inventory.architectureHints.hasTests).toBe(true);

    const r = assessImplementationCompleteness({
      files,
      inventory,
      dependencyGraph:      makeDependencyGraph(),
      routeApiStructure:    makeRouteApiStructure(),
      apiLinkage:           makeApiLinkage(),
      boundaryVerification: makeBoundaryVerification(),
    });

    expect(r.signals.find(s => s.type === 'route_without_tests')).toBeUndefined();
    expect(r.signals.find(s => s.type === 'service_without_tests')).toBeUndefined();
  });

  test('requirement 7 (negative control): with no test files anywhere, hasTests stays false and both signals still fire at their real counts', () => {
    const files = [
      makeFile('backend/routes/fooRoutes.js', "router.get('/foo', getFoo);"),
      makeFile('services/domain/doThing.js',  'module.exports = { doThing: () => {} };'),
    ];

    const inventory = buildInventoryFromFiles(files);

    expect(inventory.categories.tests).toEqual([]);
    expect(inventory.architectureHints.hasTests).toBe(false);

    const r = assessImplementationCompleteness({
      files,
      inventory,
      dependencyGraph:      makeDependencyGraph(),
      routeApiStructure:    makeRouteApiStructure(),
      apiLinkage:           makeApiLinkage(),
      boundaryVerification: makeBoundaryVerification(),
    });

    const routeSignal   = r.signals.find(s => s.type === 'route_without_tests');
    const serviceSignal = r.signals.find(s => s.type === 'service_without_tests');
    expect(routeSignal).toBeDefined();
    expect(routeSignal.count).toBe(1);
    expect(serviceSignal).toBeDefined();
    expect(serviceSignal.count).toBe(1);
  });
});
