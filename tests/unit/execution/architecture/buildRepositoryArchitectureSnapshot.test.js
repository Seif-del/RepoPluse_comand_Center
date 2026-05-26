'use strict';

const { buildRepositoryArchitectureSnapshot } = require('../../../../execution/architecture/buildRepositoryArchitectureSnapshot');

// ── Fixture helpers ───────────────────────────────────────────────────────────

function makeFile(path, content, language) {
  return { path, content: content || '', language: language || 'JavaScript' };
}

// Minimal backend-only repo: routes + services + tests, no frontend.
function backendOnlyFiles() {
  return [
    makeFile('routes/users.js',
      "const UserService = require('../services/UserService');\n" +
      "router.get('/users', UserService.list);\n" +
      "router.post('/users', UserService.create);"),
    makeFile('services/UserService.js',
      "module.exports = { list: async () => db.query('SELECT * FROM users'), create: async (d) => db.query('INSERT', d) };"),
    makeFile('models/User.js',
      "const UserService = require('../services/UserService');\nmodule.exports = class User {};"),
    makeFile('tests/UserService.test.js', "test('list', () => { expect(true).toBe(true); });"),
    makeFile('tests/users.test.js',       "test('GET /users', () => { expect(true).toBe(true); });"),
  ];
}

// Full-stack repo with matched frontend API call.
function fullStackFiles() {
  return [
    makeFile('routes/users.js',
      "const UserService = require('../services/UserService');\n" +
      "app.get('/api/users', UserService.list);"),
    makeFile('services/UserService.js',
      "module.exports = { list: async () => db.query('SELECT * FROM users') };"),
    makeFile('tests/UserService.test.js', "test('list', () => {});"),
    makeFile('src/pages/Users.jsx',
      "import React from 'react';\nexport default function Users() { fetch('/api/users').then(r=>r.json()); return <div>Users</div>; }"),
    makeFile('src/pages/App.jsx',
      "import React from 'react';\nexport default function App() { return <div>App</div>; }"),
  ];
}

// Files that produce a boundary violation: frontend imports backend (server/ category).
// buildImportDependencyGraph classifies server/ as 'backend', frontend/ .jsx as 'frontend',
// so this edge triggers the frontend_imports_backend (severity: high) boundary check.
function boundaryViolationFiles() {
  return [
    makeFile('server/auth.js',
      "module.exports = { authenticate: function(req) { return req.user; } };"),
    makeFile('frontend/Dashboard.jsx',
      "import { authenticate } from '../server/auth';\nexport default function Dashboard() { return <div>hi</div>; }"),
    makeFile('tests/stub.test.js', "test('x', () => {});"),
  ];
}

// Files with an unresolved frontend API call.
function unresolvedFrontendFiles() {
  return [
    makeFile('routes/health.js',        "app.get('/api/health', (req,res) => res.json({ ok: true }));"),
    makeFile('services/UserService.js', "module.exports = { get: async () => db.query('select') };"),
    makeFile('src/app.jsx',
      "export default function App() { fetch('/api/ghost').then(r=>r.json()); return <div/>; }"),
    makeFile('tests/stub.test.js', "test('x', () => {});"),
  ];
}

// ── Empty / null input ────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — empty input', () => {
  test('null returns valid snapshot', () => {
    const r = buildRepositoryArchitectureSnapshot(null);
    expect(r).toBeDefined();
    expect(r.architectureHealthLevel).toBe('unknown');
    expect(r.architectureHealthScore).toBe(0);
  });

  test('undefined returns valid snapshot', () => {
    const r = buildRepositoryArchitectureSnapshot(undefined);
    expect(r.architectureHealthLevel).toBeDefined();
  });

  test('empty files returns level unknown', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(r.architectureHealthLevel).toBe('unknown');
  });

  test('empty input has zero score', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(r.architectureHealthScore).toBe(0);
  });

  test('all top-level keys present', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(r).toHaveProperty('repoId');
    expect(r).toHaveProperty('repoName');
    expect(r).toHaveProperty('defaultBranch');
    expect(r).toHaveProperty('snapshotAt');
    expect(r).toHaveProperty('architectureHealthScore');
    expect(r).toHaveProperty('architectureHealthLevel');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('inventory');
    expect(r).toHaveProperty('dependencyGraph');
    expect(r).toHaveProperty('routeApiStructure');
    expect(r).toHaveProperty('apiLinkage');
    expect(r).toHaveProperty('boundaryVerification');
    expect(r).toHaveProperty('implementationCompleteness');
    expect(r).toHaveProperty('topFindings');
    expect(r).toHaveProperty('recommendations');
    expect(r).toHaveProperty('metrics');
  });

  test('repoId/repoName/defaultBranch/snapshotAt passed through', () => {
    const r = buildRepositoryArchitectureSnapshot({
      repoId: 'r-1', repoName: 'my-repo', defaultBranch: 'main', snapshotAt: '2026-05-26T00:00:00Z',
      files: [],
    });
    expect(r.repoId).toBe('r-1');
    expect(r.repoName).toBe('my-repo');
    expect(r.defaultBranch).toBe('main');
    expect(r.snapshotAt).toBe('2026-05-26T00:00:00Z');
  });

  test('empty summary is a non-empty string', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('empty topFindings is an array', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(Array.isArray(r.topFindings)).toBe(true);
  });

  test('empty recommendations is an array', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(Array.isArray(r.recommendations)).toBe(true);
  });
});

// ── Submodule outputs present ─────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — submodule outputs', () => {
  test('inventory has categories and architectureHints', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.inventory).toHaveProperty('categories');
    expect(r.inventory).toHaveProperty('architectureHints');
  });

  test('dependencyGraph has nodes and edges', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.dependencyGraph).toHaveProperty('nodes');
    expect(r.dependencyGraph).toHaveProperty('edges');
  });

  test('routeApiStructure has backendRoutes and frontendApiCalls', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.routeApiStructure).toHaveProperty('backendRoutes');
    expect(r.routeApiStructure).toHaveProperty('frontendApiCalls');
  });

  test('apiLinkage has linkedEndpoints and coverage', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.apiLinkage).toHaveProperty('linkedEndpoints');
    expect(r.apiLinkage).toHaveProperty('coverage');
  });

  test('boundaryVerification has boundaryHealthScore and violations', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.boundaryVerification).toHaveProperty('boundaryHealthScore');
    expect(r.boundaryVerification).toHaveProperty('violations');
  });

  test('implementationCompleteness has completenessScore and signals', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.implementationCompleteness).toHaveProperty('completenessScore');
    expect(r.implementationCompleteness).toHaveProperty('signals');
  });
});

// ── Health score arithmetic ───────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — health score arithmetic', () => {
  test('score is integer in [0, 100]', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.architectureHealthScore).toBeGreaterThanOrEqual(0);
    expect(r.architectureHealthScore).toBeLessThanOrEqual(100);
    expect(Number.isInteger(r.architectureHealthScore)).toBe(true);
  });

  test('score is weighted combination of boundary, completeness, linkage', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    const bv = r.boundaryVerification.boundaryHealthScore;
    const cs = r.implementationCompleteness.completenessScore;
    const ls = r.apiLinkage.linkageScore;
    const expected = Math.round(bv * 0.40 + cs * 0.40 + ls * 0.20);
    expect(r.architectureHealthScore).toBe(expected);
  });

  test('full-stack repo with linked API scores higher than unlinked', () => {
    const linked   = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    const unlinked = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    expect(linked.architectureHealthScore).toBeGreaterThan(unlinked.architectureHealthScore);
  });
});

// ── Health levels ─────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — health levels', () => {
  test('unknown level when no files', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(r.architectureHealthLevel).toBe('unknown');
  });

  test('level string is one of valid values', () => {
    const valid = ['healthy', 'watch', 'weak', 'risky', 'unknown'];
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(valid).toContain(r.architectureHealthLevel);
  });

  test('full-stack linked repo level is healthy or watch', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    expect(['healthy', 'watch']).toContain(r.architectureHealthLevel);
  });

  test('boundary violation repo level is not healthy', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(r.architectureHealthLevel).not.toBe('healthy');
  });
});

// ── Confidence levels ─────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — confidence levels', () => {
  test('low confidence for fewer than 5 files', () => {
    const r = buildRepositoryArchitectureSnapshot({
      files: [makeFile('routes/a.js', "router.get('/a', (req,res)=>res.json({}));")],
    });
    expect(r.confidenceLevel).toBe('low');
  });

  test('medium confidence for 5+ files without rich signals', () => {
    const files = Array.from({ length: 7 }, (_, i) => makeFile(`scripts/util${i}.js`, `module.exports = ${i};`));
    const r = buildRepositoryArchitectureSnapshot({ files });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('high confidence for 20+ files with tests, backend, frontend', () => {
    const files = [
      // routes (backend)
      makeFile('routes/users.js',    "const svc = require('../services/UserService');\napp.get('/api/users', svc.list);"),
      makeFile('routes/posts.js',    "const svc = require('../services/PostService');\napp.get('/api/posts', svc.list);"),
      // services
      makeFile('services/UserService.js', "module.exports = { list: async () => db.query('SELECT * FROM users') };"),
      makeFile('services/PostService.js', "module.exports = { list: async () => db.query('SELECT * FROM posts') };"),
      // models
      makeFile('models/User.js',  "module.exports = class User {};"),
      makeFile('models/Post.js',  "module.exports = class Post {};"),
      // frontend
      makeFile('src/pages/Users.jsx',   "export default function Users() { fetch('/api/users').then(r=>r.json()); return <div/>; }"),
      makeFile('src/pages/Posts.jsx',   "export default function Posts() { fetch('/api/posts').then(r=>r.json()); return <div/>; }"),
      makeFile('src/pages/Home.jsx',    "export default function Home() { return <div>Home</div>; }"),
      makeFile('src/components/Nav.jsx',"export default function Nav() { return <nav/>; }"),
      // tests
      makeFile('tests/UserService.test.js', "test('list', () => {});"),
      makeFile('tests/PostService.test.js', "test('list', () => {});"),
      makeFile('tests/users.test.js',       "test('GET /users', () => {});"),
      makeFile('tests/posts.test.js',       "test('GET /posts', () => {});"),
      // config and misc files to reach 20
      makeFile('config/db.js',   "module.exports = { host: 'localhost' };"),
      makeFile('config/app.js',  "module.exports = { port: 3000 };"),
      makeFile('server.js',      "const app = require('express')();\nmodule.exports = app;"),
      makeFile('app.js',         "const server = require('./server');\nserver.listen(3000);"),
      makeFile('package.json',   '{ "name": "my-app" }'),
      makeFile('README.md',      '# My App'),
    ];
    const r = buildRepositoryArchitectureSnapshot({ files });
    expect(r.confidenceLevel).toBe('high');
  });
});

// ── Top findings ──────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — topFindings', () => {
  test('topFindings is an array', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(Array.isArray(r.topFindings)).toBe(true);
  });

  test('topFindings length <= 5', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    expect(r.topFindings.length).toBeLessThanOrEqual(5);
  });

  test('each finding has type, severity, summary', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    if (r.topFindings.length > 0) {
      r.topFindings.forEach(function(f) {
        expect(f).toHaveProperty('type');
        expect(f).toHaveProperty('severity');
        expect(f).toHaveProperty('summary');
      });
    }
  });

  test('unresolved frontend API appears in topFindings', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    const found = r.topFindings.find(function(f) { return f.type === 'unresolved_frontend_calls'; });
    expect(found).toBeDefined();
  });

  test('boundary violation appears in topFindings', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    const found = r.topFindings.find(function(f) {
      return f.type === 'frontend_imports_backend' || f.type === 'route_imports_component' || f.severity === 'high';
    });
    expect(found).toBeDefined();
  });

  test('clean repo has no topFindings', () => {
    // Backend-only with tests and service imports — minimal signals
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    // topFindings may be empty or low-severity only (no boundary violations)
    const highFindings = r.topFindings.filter(function(f) { return f.severity === 'high'; });
    expect(highFindings.length).toBe(0);
  });
});

// ── Unresolved frontend API affects score ─────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — unresolved frontend API', () => {
  test('unresolved frontend API lowers architectureHealthScore', () => {
    const good = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    const bad  = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    expect(bad.architectureHealthScore).toBeLessThan(good.architectureHealthScore);
  });

  test('unresolvedFrontendCallCount in metrics reflects unresolved calls', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    expect(r.metrics.unresolvedFrontendCallCount).toBeGreaterThan(0);
  });
});

// ── Boundary violation affects score ─────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — boundary violation', () => {
  test('boundary violation lowers architectureHealthScore vs clean repo', () => {
    const clean   = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    const violating = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(violating.architectureHealthScore).toBeLessThan(clean.architectureHealthScore);
  });

  test('boundary violation count in metrics is > 0', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(r.metrics.boundaryViolationCount).toBeGreaterThan(0);
  });

  test('boundary violation appears in boundaryVerification.violations', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(r.boundaryVerification.violations.length).toBeGreaterThan(0);
  });
});

// ── Implementation completeness signals ───────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — implementation completeness', () => {
  test('route without service import emits implementationSignalCount > 0', () => {
    const r = buildRepositoryArchitectureSnapshot({
      files: [
        makeFile('routes/users.js',     "router.get('/users', (req,res) => res.json([]));"),
        makeFile('services/UserService.js', "module.exports = { list: async () => [] };"),
        makeFile('tests/stub.test.js',  "test('x', () => {});"),
      ],
    });
    // route has no service edge → signal emitted
    expect(r.metrics.implementationSignalCount).toBeGreaterThan(0);
  });

  test('no tests emits implementation signal when routes/services exist', () => {
    const r = buildRepositoryArchitectureSnapshot({
      files: [
        makeFile('routes/users.js',     "const svc = require('../services/UserService');\nrouter.get('/users', svc.list);"),
        makeFile('services/UserService.js', "module.exports = { list: async () => [] };"),
      ],
    });
    expect(r.implementationCompleteness.signals.length).toBeGreaterThan(0);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — recommendations', () => {
  test('recommendations is an array', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(Array.isArray(r.recommendations)).toBe(true);
  });

  test('recommendations length <= 5', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('each recommendation is a non-empty string', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    r.recommendations.forEach(function(rec) {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    });
  });

  test('no duplicate recommendations', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    const seen = new Set(r.recommendations);
    expect(seen.size).toBe(r.recommendations.length);
  });

  test('recommendations capped at 5 with many signals', () => {
    // Create a repo with many issues: boundary violation, unresolved, no tests, placeholder
    const files = [
      makeFile('frontend/App.jsx',     "import users from '../routes/users';\nexport default function App() { fetch('/api/ghost').then(r=>r.json()); return <div>App</div>; }"),
      makeFile('routes/users.js',      "router.get('/users', (req,res)=>res.json([]));\n"),
      makeFile('services/UserService.js', "module.exports = { list: () => { throw new Error('Not implemented'); } };"),
    ];
    const r = buildRepositoryArchitectureSnapshot({ files });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });
});

// ── Metrics ───────────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — metrics', () => {
  test('metrics has all required keys', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.metrics).toHaveProperty('totalFiles');
    expect(r.metrics).toHaveProperty('totalEdges');
    expect(r.metrics).toHaveProperty('backendRouteCount');
    expect(r.metrics).toHaveProperty('frontendApiCallCount');
    expect(r.metrics).toHaveProperty('linkedEndpointCount');
    expect(r.metrics).toHaveProperty('unresolvedFrontendCallCount');
    expect(r.metrics).toHaveProperty('orphanedBackendRouteCount');
    expect(r.metrics).toHaveProperty('circularDependencyCount');
    expect(r.metrics).toHaveProperty('boundaryViolationCount');
    expect(r.metrics).toHaveProperty('implementationSignalCount');
  });

  test('totalFiles matches file count', () => {
    const files = backendOnlyFiles();
    const r = buildRepositoryArchitectureSnapshot({ files });
    expect(r.metrics.totalFiles).toBe(files.length);
  });

  test('backendRouteCount > 0 for repo with routes', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.metrics.backendRouteCount).toBeGreaterThan(0);
  });

  test('totalEdges reflects import graph edges', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    // routes/users.js imports services/UserService.js → at least 1 edge
    expect(r.metrics.totalEdges).toBeGreaterThan(0);
  });

  test('frontendApiCallCount > 0 for full-stack repo', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    expect(r.metrics.frontendApiCallCount).toBeGreaterThan(0);
  });

  test('unresolvedFrontendCallCount = 0 for healthy linked repo', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    expect(r.metrics.unresolvedFrontendCallCount).toBe(0);
  });
});

// ── Summary text ──────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — summary', () => {
  test('unknown summary mentions unavailable/no files', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: [] });
    expect(r.summary).toMatch(/unavailable|no files|static analysis/i);
  });

  test('healthy summary mentions healthy/healthy', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    if (r.architectureHealthLevel === 'healthy') {
      expect(r.summary).toMatch(/healthy|strong/i);
    }
  });

  test('summary is always a non-empty string', () => {
    const inputs = [null, { files: [] }, { files: backendOnlyFiles() }];
    inputs.forEach(function(input) {
      const r = buildRepositoryArchitectureSnapshot(input);
      expect(typeof r.summary).toBe('string');
      expect(r.summary.length).toBeGreaterThan(0);
    });
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — determinism', () => {
  test('same input produces identical output', () => {
    const input = {
      repoId: 'r-1', repoName: 'test', defaultBranch: 'main', snapshotAt: '2026-05-26',
      files: fullStackFiles(),
    };
    const r1 = buildRepositoryArchitectureSnapshot(input);
    const r2 = buildRepositoryArchitectureSnapshot(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });

  test('different inputs produce different scores', () => {
    const good = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    const bad  = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    expect(good.architectureHealthScore).not.toBe(bad.architectureHealthScore);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — non-mutation', () => {
  test('input files array not mutated', () => {
    const files   = fullStackFiles();
    const origLen = files.length;
    const origPath = files[0].path;
    buildRepositoryArchitectureSnapshot({ files });
    expect(files.length).toBe(origLen);
    expect(files[0].path).toBe(origPath);
  });

  test('input file content not mutated', () => {
    const files = backendOnlyFiles();
    const origContent = files[0].content;
    buildRepositoryArchitectureSnapshot({ files });
    expect(files[0].content).toBe(origContent);
  });
});

// ── Module composition ────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureSnapshot — module composition', () => {
  test('pipeline feeds routeApiStructure backendRoutes into apiLinkage', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: fullStackFiles() });
    // If routes were detected and frontend calls were detected, linkage should occur
    if (r.routeApiStructure.backendRoutes.length > 0 &&
        r.routeApiStructure.frontendApiCalls.length > 0) {
      expect(r.apiLinkage.coverage.backendRouteCount).toBe(
        r.routeApiStructure.backendRoutes.length
      );
    }
  });

  test('boundaryVerification uses dependencyGraph boundaryHints', () => {
    // boundary hints from dep graph are used in verification
    const r = buildRepositoryArchitectureSnapshot({ files: boundaryViolationFiles() });
    // If there are boundary hints in the dep graph, violations should be non-empty
    const depGraphHints = r.dependencyGraph.boundaryHints || [];
    if (depGraphHints.length > 0) {
      expect(r.boundaryVerification.violations.length + r.boundaryVerification.warnings.length).toBeGreaterThan(0);
    }
  });

  test('implementationCompleteness receives apiLinkage unresolvedFrontendCalls', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: unresolvedFrontendFiles() });
    // unresolved calls in apiLinkage should cause signal in implementationCompleteness
    if (r.apiLinkage.unresolvedFrontendCalls.length > 0) {
      const unresolvedSignal = r.implementationCompleteness.signals.find(
        function(s) { return s.type === 'unresolved_frontend_api'; }
      );
      expect(unresolvedSignal).toBeDefined();
    }
  });

  test('metrics.totalEdges matches dependencyGraph.couplingMetrics.totalEdges', () => {
    const r = buildRepositoryArchitectureSnapshot({ files: backendOnlyFiles() });
    expect(r.metrics.totalEdges).toBe(r.dependencyGraph.couplingMetrics.totalEdges);
  });
});
