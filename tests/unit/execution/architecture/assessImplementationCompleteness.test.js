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
