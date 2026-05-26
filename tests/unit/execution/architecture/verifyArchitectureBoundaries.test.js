'use strict';

const { verifyArchitectureBoundaries } = require('../../../../execution/architecture/verifyArchitectureBoundaries');

// ── Fixture builders ──────────────────────────────────────────────────────────

function makeInventory(opts = {}) {
  return {
    totalFiles: opts.totalFiles || 0,
    categories: {
      frontend: opts.frontend || [],
      backend:  opts.backend  || [],
      tests:    opts.tests    || [],
      routes:   opts.routes   || [],
      services: opts.services || [],
      models:   opts.models   || [],
      components: opts.components || [],
      config:   opts.config   || [],
      docs:     opts.docs     || [],
      migrations: opts.migrations || [],
      scripts:  opts.scripts  || [],
      apiClients: opts.apiClients || [],
      styles:   opts.styles   || [],
      assets:   opts.assets   || [],
      unknown:  opts.unknown  || [],
    },
    architectureHints: {
      hasFrontend:       opts.hasFrontend       ?? false,
      hasBackend:        opts.hasBackend         ?? false,
      hasTests:          opts.hasTests           ?? false,
      hasMigrations:     opts.hasMigrations      ?? false,
      hasApiLayer:       opts.hasApiLayer        ?? false,
      hasServiceLayer:   opts.hasServiceLayer    ?? false,
      hasModelLayer:     opts.hasModelLayer      ?? false,
      hasComponentLayer: opts.hasComponentLayer  ?? false,
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
      totalNodes:              opts.totalNodes              || 0,
      totalEdges:              opts.totalEdges              || 0,
      unresolvedCount:         opts.unresolvedCount         || 0,
      externalDependencyCount: opts.externalDependencyCount || 0,
      circularDependencyCount: opts.circularDependencyCount || 0,
      averageOutDegree:        opts.averageOutDegree        || 0,
      highFanOutFiles:         opts.highFanOutFiles         || [],
      highFanInFiles:          opts.highFanInFiles          || [],
    },
  };
}

function makeRouteApiStructure(opts = {}) {
  return {
    backendRoutes:      opts.backendRoutes      || [],
    frontendApiCalls:   opts.frontendApiCalls   || [],
    routeHandlers:      opts.routeHandlers      || [],
    nextRoutes:         opts.nextRoutes         || [],
    endpointInventory:  opts.endpointInventory  || [],
    unresolvedApiCalls: opts.unresolvedApiCalls || [],
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
    coverage:                opts.coverage                || {},
  };
}

function emptyInput() {
  return {
    inventory:        makeInventory(),
    dependencyGraph:  makeDependencyGraph(),
    routeApiStructure: makeRouteApiStructure(),
    apiLinkage:       makeApiLinkage(),
  };
}

// ── Empty / null input ────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — empty input', () => {
  test('null returns valid zero-state', () => {
    const r = verifyArchitectureBoundaries(null);
    expect(r.violations).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.recommendations).toEqual([]);
  });

  test('undefined returns valid zero-state', () => {
    const r = verifyArchitectureBoundaries(undefined);
    expect(r.boundaryHealthLevel).toBeDefined();
  });

  test('empty structural input returns level unknown', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.boundaryHealthLevel).toBe('unknown');
  });

  test('empty structural input score is 0', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.boundaryHealthScore).toBe(0);
  });

  test('summary is a non-empty string', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('all top-level keys present', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r).toHaveProperty('boundaryHealthScore');
    expect(r).toHaveProperty('boundaryHealthLevel');
    expect(r).toHaveProperty('violations');
    expect(r).toHaveProperty('warnings');
    expect(r).toHaveProperty('circularDependencyAssessment');
    expect(r).toHaveProperty('layeringAssessment');
    expect(r).toHaveProperty('couplingAssessment');
    expect(r).toHaveProperty('routeModelCoupling');
    expect(r).toHaveProperty('recommendations');
    expect(r).toHaveProperty('summary');
  });
});

// ── Healthy architecture ──────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — healthy architecture', () => {
  test('well-structured project with no issues scores >= 85', () => {
    const r = verifyArchitectureBoundaries({
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        models: ['models/User.js'], tests: ['tests/unit/UserService.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasModelLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [],
        circularDependencies: [],
        highFanOutFiles: [], highFanInFiles: [],
      }),
      routeApiStructure: makeRouteApiStructure(),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [], orphanedBackendRoutes: [], methodMismatches: [],
        linkageLevel: 'integrated',
      }),
    });
    expect(r.boundaryHealthScore).toBeGreaterThanOrEqual(85);
    expect(r.boundaryHealthLevel).toBe('healthy');
  });
});

// ── Strong violations ─────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — violations', () => {
  test('frontend_imports_backend boundary hint → violation', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ hasFrontend: true, hasBackend: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'Frontend imports backend.', files: ['src/App.jsx', 'server.js'] }],
      }),
    });
    const v = r.violations.find(v => v.type === 'frontend_imports_backend');
    expect(v).toBeDefined();
  });

  test('backend_imports_frontend boundary hint → violation', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'backend_imports_frontend', severity: 'high', summary: 'Backend imports frontend.', files: ['server.js', 'src/App.jsx'] }],
      }),
    });
    expect(r.violations.find(v => v.type === 'backend_imports_frontend')).toBeDefined();
  });

  test('model_imports_route boundary hint → violation', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'model_imports_route', severity: 'medium', summary: 'Model imports route.', files: ['models/User.js', 'routes/users.js'] }],
      }),
    });
    expect(r.violations.find(v => v.type === 'model_imports_route')).toBeDefined();
  });

  test('service_imports_route boundary hint → violation', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'service_imports_route', severity: 'medium', summary: 'Service imports route.', files: ['services/Auth.js', 'routes/auth.js'] }],
      }),
    });
    expect(r.violations.find(v => v.type === 'service_imports_route')).toBeDefined();
  });

  test('route_imports_component boundary hint → violation', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'route_imports_component', severity: 'low', summary: 'Route imports component.', files: ['routes/home.js', 'components/Hero.jsx'] }],
      }),
    });
    expect(r.violations.find(v => v.type === 'route_imports_component')).toBeDefined();
  });

  test('violation has type, severity, summary, files fields', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'Frontend imports backend.', files: ['src/App.jsx', 'server.js'] }],
      }),
    });
    const v = r.violations[0];
    expect(v).toHaveProperty('type');
    expect(v).toHaveProperty('severity');
    expect(v).toHaveProperty('summary');
    expect(v).toHaveProperty('files');
  });

  test('each strong violation subtracts 20 from score', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [
          { type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] },
        ],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(80);
  });

  test('two violations subtract 40 from score', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], services: ['s.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [
          { type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] },
          { type: 'model_imports_route',      severity: 'medium', summary: 'y', files: [] },
        ],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(60);
  });
});

// ── Warnings ──────────────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — warnings', () => {
  test('routes exist but no services → routes_without_services warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['routes/users.js'],
        hasApiLayer: true, hasServiceLayer: false,
      }),
    });
    const w = r.warnings.find(w => w.type === 'routes_without_services');
    expect(w).toBeDefined();
  });

  test('services exist but no tests → services_without_tests warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({
        services: ['services/UserService.js'],
        hasServiceLayer: true, hasTests: false,
      }),
    });
    expect(r.warnings.find(w => w.type === 'services_without_tests')).toBeDefined();
  });

  test('config_imported_by_runtime boundary hint → warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'config_imported_by_runtime', severity: 'low', summary: 'Config imported by runtime.', files: ['server.js', 'config.json'] }],
      }),
    });
    expect(r.warnings.find(w => w.type === 'config_imported_by_runtime')).toBeDefined();
  });

  test('high fan-out files → high_fan_out warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ highFanOutFiles: ['src/megaModule.js'] }),
    });
    expect(r.warnings.find(w => w.type === 'high_fan_out')).toBeDefined();
  });

  test('high fan-in files → high_fan_in warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ highFanInFiles: ['src/utils.js'] }),
    });
    expect(r.warnings.find(w => w.type === 'high_fan_in')).toBeDefined();
  });

  test('orphaned backend routes from apiLinkage → orphaned_backend_routes warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      apiLinkage: makeApiLinkage({
        orphanedBackendRoutes: [{ method: 'GET', path: '/api/internal', file: 'routes/internal.js', candidate: true }],
      }),
    });
    expect(r.warnings.find(w => w.type === 'orphaned_backend_routes')).toBeDefined();
  });

  test('unresolved frontend calls from apiLinkage → unresolved_frontend_calls warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    });
    expect(r.warnings.find(w => w.type === 'unresolved_frontend_calls')).toBeDefined();
  });

  test('method mismatches from apiLinkage → method_mismatches warning', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      apiLinkage: makeApiLinkage({
        methodMismatches: [{ path: '/api/users', frontendMethod: 'POST', availableMethods: ['GET'] }],
      }),
    });
    expect(r.warnings.find(w => w.type === 'method_mismatches')).toBeDefined();
  });

  test('warning has type and summary fields', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
    });
    const w = r.warnings.find(w => w.type === 'routes_without_services');
    expect(w).toHaveProperty('type');
    expect(w).toHaveProperty('summary');
  });
});

// ── Circular dependency assessment ────────────────────────────────────────────

describe('verifyArchitectureBoundaries — circularDependencyAssessment', () => {
  test('no cycles → severity none, count 0', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ circularDependencies: [] }),
    });
    expect(r.circularDependencyAssessment.count).toBe(0);
    expect(r.circularDependencyAssessment.severity).toBe('none');
  });

  test('cycles with length 2 → severity medium', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/a.js'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('medium');
  });

  test('cycles with length >= 3 → severity high', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/c.js', 'src/a.js'], length: 3 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('high');
  });

  test('cycles involving route files → severity high regardless of length', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['routes/auth.js', 'services/Auth.js', 'routes/auth.js'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('high');
  });

  test('cycles involving service files → severity high', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['services/a.js', 'services/b.js', 'services/a.js'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('high');
  });

  test('cycles involving model files → severity high', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['models/User.js', 'models/Post.js', 'models/User.js'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('high');
  });

  test('cycles involving frontend components only → severity medium (unless length >= 3)', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/components/A.jsx', 'src/components/B.jsx', 'src/components/A.jsx'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment.severity).toBe('medium');
  });

  test('assessment has count and cycles fields', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/a.js'], length: 2 }],
      }),
    });
    expect(r.circularDependencyAssessment).toHaveProperty('count');
    expect(r.circularDependencyAssessment).toHaveProperty('cycles');
    expect(r.circularDependencyAssessment).toHaveProperty('severity');
    expect(r.circularDependencyAssessment.count).toBe(1);
  });

  test('high circular dep subtracts 18 from score', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/a.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['routes/a.js', 'routes/b.js', 'routes/a.js'], length: 2 }],
      }),
    });
    // With routes present (hasApiLayer) and no other issues, base ≈ 100 - 18 = 82
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(82);
  });

  test('medium circular dep subtracts 10 from score', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/a.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/a.js'], length: 2 }],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(90);
  });
});

// ── Route/model coupling ──────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — routeModelCoupling', () => {
  test('route importing model file detected in routeModelCoupling', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'models/User.js', importPath: '../models/User', importType: 'require' }],
      }),
      inventory: makeInventory({
        routes: ['routes/users.js'], models: ['models/User.js'],
        hasApiLayer: true, hasModelLayer: true,
      }),
    });
    expect(r.routeModelCoupling.count).toBeGreaterThan(0);
    expect(r.routeModelCoupling.files.length).toBeGreaterThan(0);
  });

  test('routeModelCoupling has count and files fields', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.routeModelCoupling).toHaveProperty('count');
    expect(r.routeModelCoupling).toHaveProperty('files');
  });

  test('no route/model coupling when no such edges', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' }],
      }),
    });
    expect(r.routeModelCoupling.count).toBe(0);
  });

  test('each route/model coupling subtracts 12 from score (capped at -30)', () => {
    const edges = Array.from({ length: 4 }, (_, i) => ({
      from: `routes/r${i}.js`, to: `models/M${i}.js`, importPath: `../models/M${i}`, importType: 'require',
    }));
    const routes = edges.map(e => e.from);
    const models = edges.map(e => e.to);
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ edges }),
      inventory: makeInventory({ routes, models, hasApiLayer: true, hasModelLayer: true }),
    });
    // 4 couplings × -12 = -48 but capped at -30 → score ≤ 70
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(70);
  });
});

// ── Layering assessment ───────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — layeringAssessment', () => {
  test('has layeringAssessment object', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.layeringAssessment).toBeDefined();
    expect(typeof r.layeringAssessment).toBe('object');
  });

  test('healthy layering when route→service→model chain present', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'], models: ['models/User.js'],
        hasApiLayer: true, hasServiceLayer: true, hasModelLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        edges: [
          { from: 'routes/users.js',          to: 'services/UserService.js', importPath: '../services/UserService', importType: 'require' },
          { from: 'services/UserService.js',   to: 'models/User.js',         importPath: '../models/User',         importType: 'require' },
        ],
      }),
    });
    expect(r.layeringAssessment.hasRouteLayer).toBe(true);
    expect(r.layeringAssessment.hasServiceLayer).toBe(true);
    expect(r.layeringAssessment.hasModelLayer).toBe(true);
  });

  test('risky patterns detected: route imports model directly', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        edges: [{ from: 'routes/users.js', to: 'models/User.js', importPath: '../models/User', importType: 'require' }],
      }),
      inventory: makeInventory({ routes: ['routes/users.js'], models: ['models/User.js'], hasApiLayer: true, hasModelLayer: true }),
    });
    expect(r.layeringAssessment.riskyPatterns).toContain('route_imports_model_directly');
  });

  test('service imports route detected as risky', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'service_imports_route', severity: 'medium', summary: 'Service imports route.', files: ['services/Auth.js', 'routes/auth.js'] }],
      }),
    });
    expect(r.layeringAssessment.riskyPatterns).toContain('service_imports_route');
  });
});

// ── Coupling assessment ───────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — couplingAssessment', () => {
  test('no fan-out/fan-in → healthy coupling', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ highFanOutFiles: [], highFanInFiles: [] }),
    });
    expect(r.couplingAssessment.level).toBe('healthy');
  });

  test('has fan-out files → coupling level watch or weak', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({ highFanOutFiles: ['src/megaModule.js', 'src/god.js'] }),
    });
    expect(['watch', 'weak']).toContain(r.couplingAssessment.level);
  });

  test('couplingAssessment has level, highFanOutFiles, highFanInFiles fields', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.couplingAssessment).toHaveProperty('level');
    expect(r.couplingAssessment).toHaveProperty('highFanOutFiles');
    expect(r.couplingAssessment).toHaveProperty('highFanInFiles');
  });
});

// ── Scoring ───────────────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — scoring', () => {
  test('score is an integer 0-100', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
    });
    expect(Number.isInteger(r.boundaryHealthScore)).toBe(true);
    expect(r.boundaryHealthScore).toBeGreaterThanOrEqual(0);
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(100);
  });

  test('score clamped to 0 minimum even with many deductions', () => {
    const violations = ['frontend_imports_backend', 'backend_imports_frontend', 'model_imports_route', 'service_imports_route', 'route_imports_component'];
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: violations.map(type => ({ type, severity: 'high', summary: 'x', files: [] })),
        circularDependencies: [{ cycle: ['routes/a.js', 'routes/b.js', 'routes/c.js', 'routes/a.js'], length: 3 }],
      }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: Array.from({ length: 5 }, (_, i) => ({ from: 'src/app.js', method: 'GET', path: `/api/g${i}` })),
        methodMismatches: Array.from({ length: 4 }, (_, i) => ({ path: `/api/u${i}`, frontendMethod: 'POST', availableMethods: ['GET'] })),
        orphanedBackendRoutes: Array.from({ length: 6 }, (_, i) => ({ method: 'GET', path: `/api/o${i}`, file: 'r.js', candidate: true })),
      }),
    });
    expect(r.boundaryHealthScore).toBe(0);
  });

  test('unresolved frontend call subtracts 8 each (capped at -24)', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['routes/users.js'], hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [
          { from: 'src/app.js', method: 'GET', path: '/api/a' },
          { from: 'src/app.js', method: 'GET', path: '/api/b' },
          { from: 'src/app.js', method: 'GET', path: '/api/c' },
        ],
      }),
    });
    // 3 unresolved × -8 = -24. Base with routes_without_services warning = depends on other penalties.
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(76);
  });

  test('method mismatch subtracts 10 each (capped at -30)', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        methodMismatches: [{ path: '/api/users', frontendMethod: 'POST', availableMethods: ['GET'] }],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(90);
  });

  test('orphaned backend routes subtract 3 each (capped at -15)', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      apiLinkage: makeApiLinkage({
        orphanedBackendRoutes: [
          { method: 'GET', path: '/api/a', file: 'r.js', candidate: true },
          { method: 'GET', path: '/api/b', file: 'r.js', candidate: true },
        ],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(94);
  });

  test('high fan-out warning subtracts 5 each (capped at -20)', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        highFanOutFiles: ['src/mega.js'],
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThanOrEqual(95);
  });
});

// ── Level thresholds ──────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — level thresholds', () => {
  test('score >= 85 → healthy', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['r.js'], services: ['s.js'], models: ['m.js'],
        hasApiLayer: true, hasServiceLayer: true, hasModelLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({ boundaryHints: [], circularDependencies: [] }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: [], orphanedBackendRoutes: [], methodMismatches: [] }),
    });
    expect(r.boundaryHealthLevel).toBe('healthy');
  });

  test('score < 85 and >= 70 → watch', () => {
    // One medium circular dep (-10) = score ~90 is still healthy
    // One strong violation (-20) = score ~80 = watch
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] }],
      }),
    });
    // 100 - 20 (violation) = 80 → watch (but also routes_without_services warning if services empty)
    expect(['watch', 'weak']).toContain(r.boundaryHealthLevel);
  });

  test('score < 45 and >= 1 → risky', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [
          { type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] },
          { type: 'backend_imports_frontend', severity: 'high', summary: 'x', files: [] },
          { type: 'model_imports_route',      severity: 'medium', summary: 'x', files: [] },
        ],
        circularDependencies: [{ cycle: ['routes/a.js', 'routes/b.js', 'routes/a.js'], length: 2 }],
      }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: Array.from({ length: 3 }, (_, i) => ({ from: 'src/app.js', method: 'GET', path: `/api/g${i}` })),
        methodMismatches: Array.from({ length: 2 }, (_, i) => ({ path: `/api/u${i}`, frontendMethod: 'POST', availableMethods: ['GET'] })),
      }),
    });
    expect(r.boundaryHealthScore).toBeLessThan(45);
    expect(r.boundaryHealthLevel).toBe('risky');
  });

  test('score 0 with no structural input → unknown', () => {
    const r = verifyArchitectureBoundaries(emptyInput());
    expect(r.boundaryHealthLevel).toBe('unknown');
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — recommendations', () => {
  test('strong violations generate recommendations', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] }],
      }),
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('circular dependencies generate recommendations', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/a.js'], length: 2 }],
      }),
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('max 5 recommendations', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], hasApiLayer: true }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [
          { type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] },
          { type: 'backend_imports_frontend', severity: 'high', summary: 'x', files: [] },
          { type: 'model_imports_route', severity: 'medium', summary: 'x', files: [] },
        ],
        circularDependencies: [{ cycle: ['routes/a.js', 'services/b.js', 'routes/a.js'], length: 2 }],
        highFanOutFiles: ['src/mega.js'],
      }),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
        methodMismatches: [{ path: '/api/users', frontendMethod: 'POST', availableMethods: ['GET'] }],
      }),
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('each recommendation is a non-empty string', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'frontend_imports_backend', severity: 'high', summary: 'x', files: [] }],
      }),
    });
    r.recommendations.forEach(rec => {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    });
  });

  test('no recommendations for healthy architecture', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        models: ['models/User.js'], tests: ['tests/UserService.test.js'],
        hasApiLayer: true, hasServiceLayer: true, hasModelLayer: true, hasTests: true,
      }),
      dependencyGraph: makeDependencyGraph({ boundaryHints: [], circularDependencies: [] }),
      apiLinkage: makeApiLinkage({ unresolvedFrontendCalls: [], orphanedBackendRoutes: [], methodMismatches: [] }),
    });
    expect(r.recommendations.length).toBe(0);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — determinism', () => {
  test('same input produces identical output', () => {
    const input = {
      inventory: makeInventory({
        routes: ['routes/users.js'], services: ['services/UserService.js'],
        hasApiLayer: true, hasServiceLayer: true,
      }),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [{ type: 'config_imported_by_runtime', severity: 'low', summary: 'x', files: [] }],
        circularDependencies: [{ cycle: ['src/a.js', 'src/b.js', 'src/a.js'], length: 2 }],
        highFanOutFiles: ['src/mega.js'],
      }),
      routeApiStructure: makeRouteApiStructure(),
      apiLinkage: makeApiLinkage({
        unresolvedFrontendCalls: [{ from: 'src/app.js', method: 'GET', path: '/api/ghost' }],
      }),
    };
    const r1 = verifyArchitectureBoundaries(input);
    const r2 = verifyArchitectureBoundaries(input);
    expect(r1).toEqual(r2);
  });

  test('violations sorted by type', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      dependencyGraph: makeDependencyGraph({
        boundaryHints: [
          { type: 'model_imports_route',      severity: 'medium', summary: 'x', files: [] },
          { type: 'frontend_imports_backend', severity: 'high',   summary: 'x', files: [] },
        ],
      }),
    });
    const types = r.violations.map(v => v.type);
    expect(types).toEqual([...types].sort());
  });

  test('warnings sorted by type', () => {
    const r = verifyArchitectureBoundaries({
      ...emptyInput(),
      inventory: makeInventory({ routes: ['r.js'], services: ['s.js'], hasApiLayer: true, hasServiceLayer: true }),
      dependencyGraph: makeDependencyGraph({ highFanOutFiles: ['src/mega.js'], highFanInFiles: ['src/utils.js'] }),
      apiLinkage: makeApiLinkage({
        orphanedBackendRoutes: [{ method: 'GET', path: '/api/a', file: 'r.js', candidate: true }],
      }),
    });
    const types = r.warnings.map(w => w.type);
    expect(types).toEqual([...types].sort());
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('verifyArchitectureBoundaries — non-mutation', () => {
  test('input objects not mutated', () => {
    const inventory = makeInventory({ routes: ['routes/users.js'], hasApiLayer: true });
    const depGraph  = makeDependencyGraph({ highFanOutFiles: ['src/mega.js'] });
    const origRoutes = [...inventory.categories.routes];
    const origFanOut = [...depGraph.couplingMetrics.highFanOutFiles];
    verifyArchitectureBoundaries({ inventory, dependencyGraph: depGraph, routeApiStructure: makeRouteApiStructure(), apiLinkage: makeApiLinkage() });
    expect(inventory.categories.routes).toEqual(origRoutes);
    expect(depGraph.couplingMetrics.highFanOutFiles).toEqual(origFanOut);
  });
});
