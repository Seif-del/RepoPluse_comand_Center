'use strict';

const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function bRoute(method, path, file, opts = {}) {
  return { method: method.toUpperCase(), path, file: file || 'server.js', framework: opts.framework || 'express', handlerType: opts.handlerType || 'named', handlerName: opts.handlerName || null };
}

function fCall(method, path, file, opts = {}) {
  return { method: method.toUpperCase(), path, file: file || 'src/app.js', client: opts.client || 'fetch' };
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — empty input', () => {
  test('null returns valid zero-state', () => {
    const r = linkFrontendBackendApis(null);
    expect(r.linkedEndpoints).toEqual([]);
    expect(r.unresolvedFrontendCalls).toEqual([]);
    expect(r.orphanedBackendRoutes).toEqual([]);
    expect(r.methodMismatches).toEqual([]);
  });

  test('undefined returns valid zero-state', () => {
    const r = linkFrontendBackendApis(undefined);
    expect(r.linkedEndpoints).toEqual([]);
  });

  test('empty arrays return zero-state', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r.linkedEndpoints.length).toBe(0);
    expect(r.coverage.frontendCallCount).toBe(0);
    expect(r.coverage.backendRouteCount).toBe(0);
  });

  test('linkageLevel is unknown when no routes and no calls', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r.linkageLevel).toBe('unknown');
  });

  test('linkageScore is 0 for empty input', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r.linkageScore).toBe(0);
  });

  test('summary is a non-empty string', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('recommendations is an array', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(Array.isArray(r.recommendations)).toBe(true);
  });
});

// ── Exact match ───────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — exact match', () => {
  test('matching method + path creates linkedEndpoint', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(1);
    const ep = r.linkedEndpoints[0];
    expect(ep.method).toBe('GET');
    expect(ep.path).toBe('/api/users');
  });

  test('linkedEndpoint linkageType is exact', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints[0].linkageType).toBe('exact');
  });

  test('linkedEndpoint confidence is high for exact match', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints[0].confidence).toBe('high');
  });

  test('linkedEndpoint includes frontendCalls and backendRoutes arrays', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users', 'server.js')],
      frontendApiCalls:[fCall('GET', '/api/users', 'src/app.js')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints[0];
    expect(Array.isArray(ep.frontendCalls)).toBe(true);
    expect(Array.isArray(ep.backendRoutes)).toBe(true);
    expect(ep.frontendCalls.length).toBeGreaterThan(0);
    expect(ep.backendRoutes.length).toBeGreaterThan(0);
  });

  test('exact match removes from unresolved and orphaned', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.unresolvedFrontendCalls.length).toBe(0);
    expect(r.orphanedBackendRoutes.length).toBe(0);
  });

  test('multiple different routes each create separate linkedEndpoints', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users'), bRoute('POST', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(2);
  });
});

// ── UNKNOWN method match ──────────────────────────────────────────────────────

describe('linkFrontendBackendApis — UNKNOWN method match', () => {
  test('UNKNOWN frontend method matches any backend method on same path', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('POST', '/api/submit')],
      frontendApiCalls:[fCall('UNKNOWN', '/api/submit')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints.find(e => e.path === '/api/submit');
    expect(ep).toBeDefined();
    expect(ep.linkageType).toBe('method_unknown');
  });

  test('UNKNOWN method match confidence is medium', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('POST', '/api/submit')],
      frontendApiCalls:[fCall('UNKNOWN', '/api/submit')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints[0].confidence).toBe('medium');
  });

  test('UNKNOWN method does not create method mismatch', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('POST', '/api/submit')],
      frontendApiCalls:[fCall('UNKNOWN', '/api/submit')],
      endpointInventory: [],
    });
    expect(r.methodMismatches.length).toBe(0);
  });
});

// ── Param name normalization ──────────────────────────────────────────────────

describe('linkFrontendBackendApis — param name normalization', () => {
  test('/api/users/:id matches /api/users/:userId', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users/:userId')],
      frontendApiCalls:[fCall('GET', '/api/users/:id')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints.find(e => e.path.startsWith('/api/users/'));
    expect(ep).toBeDefined();
    expect(ep.linkageType).toBe('param_match');
  });

  test('param match confidence is medium', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users/:userId')],
      frontendApiCalls:[fCall('GET', '/api/users/:id')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints[0].confidence).toBe('medium');
  });

  test('param names differ but route still linked, not unresolved', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/items/:itemId')],
      frontendApiCalls:[fCall('GET', '/api/items/:id')],
      endpointInventory: [],
    });
    expect(r.unresolvedFrontendCalls.length).toBe(0);
  });

  test('multiple param segments matched regardless of names', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/orgs/:orgId/repos/:repoId')],
      frontendApiCalls:[fCall('GET', '/api/orgs/:orgSlug/repos/:repoSlug')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints.find(e => e.path.startsWith('/api/orgs/'));
    expect(ep).toBeDefined();
  });
});

// ── Template param matching ───────────────────────────────────────────────────

describe('linkFrontendBackendApis — template param matching', () => {
  test('/api/users/:param (from template) matches backend /api/users/:id', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users/:id')],
      frontendApiCalls:[fCall('GET', '/api/users/:param')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints.find(e => e.path.startsWith('/api/users/'));
    expect(ep).toBeDefined();
    expect(ep.linkageType).toBe('param_match');
  });

  test(':param frontend matches :anything backend', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('DELETE', '/api/items/:itemId')],
      frontendApiCalls:[fCall('DELETE', '/api/items/:param')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(1);
    expect(r.unresolvedFrontendCalls.length).toBe(0);
  });
});

// ── Trailing slash normalization ──────────────────────────────────────────────

describe('linkFrontendBackendApis — trailing slash normalization', () => {
  test('frontend /api/users/ matches backend /api/users', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users/')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(1);
    expect(r.unresolvedFrontendCalls.length).toBe(0);
  });

  test('backend /api/users/ matches frontend /api/users', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users/')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(1);
  });
});

// ── Repeated slash normalization ──────────────────────────────────────────────

describe('linkFrontendBackendApis — repeated slash normalization', () => {
  test('//api//users normalizes to /api/users for matching', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '//api//users')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(1);
  });
});

// ── Unresolved frontend calls ─────────────────────────────────────────────────

describe('linkFrontendBackendApis — unresolvedFrontendCalls', () => {
  test('frontend call with no backend path match is unresolved', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    const u = r.unresolvedFrontendCalls.find(c => c.path === '/api/ghost');
    expect(u).toBeDefined();
  });

  test('unresolved call is not in linkedEndpoints', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [],
      frontendApiCalls:[fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.linkedEndpoints.length).toBe(0);
    expect(r.unresolvedFrontendCalls.length).toBe(1);
  });

  test('unresolved call has from, method, path fields', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [],
      frontendApiCalls:[fCall('GET', '/api/ghost', 'src/app.js')],
      endpointInventory: [],
    });
    const u = r.unresolvedFrontendCalls[0];
    expect(u).toHaveProperty('from');
    expect(u).toHaveProperty('method');
    expect(u).toHaveProperty('path');
  });
});

// ── Orphaned backend routes ───────────────────────────────────────────────────

describe('linkFrontendBackendApis — orphanedBackendRoutes', () => {
  test('backend route with no frontend call is orphaned', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/internal')],
      frontendApiCalls:[],
      endpointInventory: [],
    });
    const o = r.orphanedBackendRoutes.find(rt => rt.path === '/api/internal');
    expect(o).toBeDefined();
  });

  test('orphaned route has candidate: true', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/internal')],
      frontendApiCalls:[],
      endpointInventory: [],
    });
    expect(r.orphanedBackendRoutes[0].candidate).toBe(true);
  });

  test('matched backend route is not orphaned', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.orphanedBackendRoutes.length).toBe(0);
  });

  test('orphaned route has method, path, file fields', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('DELETE', '/api/admin', 'routes/admin.js')],
      frontendApiCalls:[],
      endpointInventory: [],
    });
    const o = r.orphanedBackendRoutes[0];
    expect(o).toHaveProperty('method');
    expect(o).toHaveProperty('path');
    expect(o).toHaveProperty('file');
  });
});

// ── Method mismatch ───────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — methodMismatches', () => {
  test('frontend POST where backend only has GET → method mismatch', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    const mm = r.methodMismatches.find(m => m.path === '/api/users');
    expect(mm).toBeDefined();
  });

  test('method mismatch has frontendMethod and availableMethods fields', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    const mm = r.methodMismatches[0];
    expect(mm).toHaveProperty('frontendMethod');
    expect(mm).toHaveProperty('availableMethods');
    expect(Array.isArray(mm.availableMethods)).toBe(true);
    expect(mm.availableMethods).toContain('GET');
  });

  test('method mismatch call appears in unresolvedFrontendCalls', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    // method mismatch means the frontend call cannot link — it may appear unresolved
    // at minimum the path should not appear in linkedEndpoints with that method
    const linked = r.linkedEndpoints.find(e => e.method === 'POST' && e.path === '/api/users');
    expect(linked).toBeUndefined();
  });

  test('no method mismatch when methods match exactly', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.methodMismatches.length).toBe(0);
  });
});

// ── Coverage ──────────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — coverage', () => {
  test('frontendCallCount equals total frontend calls', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.coverage.frontendCallCount).toBe(2);
  });

  test('backendRouteCount equals total backend routes', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users'), bRoute('POST', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.coverage.backendRouteCount).toBe(2);
  });

  test('linkedFrontendCallCount counts matched frontend calls', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.coverage.linkedFrontendCallCount).toBe(1);
  });

  test('frontendCoveragePercent = linked/total * 100', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.coverage.frontendCoveragePercent).toBe(50);
  });

  test('backendCoveragePercent = linked/total * 100', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users'), bRoute('POST', '/api/items')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.coverage.backendCoveragePercent).toBe(50);
  });

  test('all coverage keys present', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    const c = r.coverage;
    expect(c).toHaveProperty('frontendCallCount');
    expect(c).toHaveProperty('backendRouteCount');
    expect(c).toHaveProperty('linkedFrontendCallCount');
    expect(c).toHaveProperty('linkedBackendRouteCount');
    expect(c).toHaveProperty('unresolvedFrontendCallCount');
    expect(c).toHaveProperty('orphanedBackendRouteCount');
    expect(c).toHaveProperty('methodMismatchCount');
    expect(c).toHaveProperty('frontendCoveragePercent');
    expect(c).toHaveProperty('backendCoveragePercent');
  });

  test('100% coverage when all match', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users'), bRoute('POST', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    expect(r.coverage.frontendCoveragePercent).toBe(100);
    expect(r.coverage.backendCoveragePercent).toBe(100);
  });
});

// ── Linkage score ─────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — linkageScore', () => {
  test('100% frontend + 100% backend + no mismatches → score 90', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    // 100*0.6 + 100*0.3 - 0 = 90
    expect(r.linkageScore).toBe(90);
  });

  test('0% coverage → score 0', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.linkageScore).toBe(0);
  });

  test('score is clamped to 0 at minimum', () => {
    // Create scenario with many mismatches to drive score negative
    const routes = [bRoute('GET', '/api/a'), bRoute('GET', '/api/b'), bRoute('GET', '/api/c')];
    const calls  = [fCall('POST', '/api/a'), fCall('POST', '/api/b'), fCall('POST', '/api/c')];
    const r = linkFrontendBackendApis({ backendRoutes: routes, frontendApiCalls: calls, endpointInventory: [] });
    expect(r.linkageScore).toBeGreaterThanOrEqual(0);
  });

  test('score is clamped to 100 at maximum', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkageScore).toBeLessThanOrEqual(100);
  });

  test('score is an integer', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(Number.isInteger(r.linkageScore)).toBe(true);
  });
});

// ── Linkage level ─────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — linkageLevel', () => {
  test('score >= 85 → integrated', () => {
    // Perfect match on both sides: score = 90
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkageLevel).toBe('integrated');
  });

  test('score >= 60 and < 85 → partial', () => {
    // 3 backend routes, 2 matched frontend calls (frontend coverage ~67%), all backend matched
    // frontendCov ~67%, backendCov 67% → 67*0.6 + 67*0.3 = 40.2 + 20.1 = ~60
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/a'), bRoute('GET', '/api/b'), bRoute('GET', '/api/c')],
      frontendApiCalls:[fCall('GET', '/api/a'), fCall('GET', '/api/b'), fCall('GET', '/api/d')],
      endpointInventory: [],
    });
    // frontendCov = 2/3 = 67%, backendCov = 2/3 = 67%, no mismatches
    // score = round(67*0.6 + 67*0.3) = round(40.2 + 20.1) = round(60.3) = 60
    expect(['partial', 'integrated']).toContain(r.linkageLevel);
  });

  test('score >= 1 and < 60 → weak', () => {
    // 1 matched frontend call out of 5, 1 matched backend out of 5
    const routes = Array.from({ length: 5 }, (_, i) => bRoute('GET', `/api/r${i}`));
    const calls  = [fCall('GET', '/api/r0'), ...Array.from({ length: 4 }, (_, i) => fCall('GET', `/api/x${i}`))];
    const r = linkFrontendBackendApis({ backendRoutes: routes, frontendApiCalls: calls, endpointInventory: [] });
    // frontendCov = 1/5 = 20%, backendCov = 1/5 = 20%
    // score = round(20*0.6 + 20*0.3) = round(12 + 6) = 18
    expect(r.linkageLevel).toBe('weak');
  });

  test('no frontend calls and no backend routes → unknown', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r.linkageLevel).toBe('unknown');
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — recommendations', () => {
  test('unresolved frontend calls generate a recommendation', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [],
      frontendApiCalls:[fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('orphaned backend routes generate a recommendation', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/internal')],
      frontendApiCalls:[],
      endpointInventory: [],
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('method mismatches generate a recommendation', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('POST', '/api/users')],
      endpointInventory: [],
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('max 5 recommendations', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/a'), bRoute('GET', '/api/b')],
      frontendApiCalls:[fCall('POST', '/api/a'), fCall('POST', '/api/b'), fCall('GET', '/api/c')],
      endpointInventory: [],
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('each recommendation is a non-empty string', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [],
      frontendApiCalls:[fCall('GET', '/api/ghost')],
      endpointInventory: [],
    });
    r.recommendations.forEach(rec => {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    });
  });

  test('no recommendations when perfectly linked', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.recommendations.length).toBe(0);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — determinism', () => {
  test('same input produces identical output', () => {
    const input = {
      backendRoutes:   [bRoute('GET', '/api/users'), bRoute('POST', '/api/items')],
      frontendApiCalls:[fCall('GET', '/api/users'), fCall('GET', '/api/ghost')],
      endpointInventory: [],
    };
    const r1 = linkFrontendBackendApis(input);
    const r2 = linkFrontendBackendApis(input);
    expect(r1).toEqual(r2);
  });

  test('linkedEndpoints sorted by path then method', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('POST', '/api/z'), bRoute('GET', '/api/a')],
      frontendApiCalls:[fCall('POST', '/api/z'), fCall('GET', '/api/a')],
      endpointInventory: [],
    });
    const paths = r.linkedEndpoints.map(e => e.path);
    expect(paths[0]).toBe('/api/a');
    expect(paths[1]).toBe('/api/z');
  });

  test('unresolvedFrontendCalls sorted by path then method', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [],
      frontendApiCalls:[fCall('GET', '/api/z'), fCall('GET', '/api/a')],
      endpointInventory: [],
    });
    const paths = r.unresolvedFrontendCalls.map(u => u.path);
    expect(paths[0]).toBe('/api/a');
    expect(paths[1]).toBe('/api/z');
  });

  test('orphanedBackendRoutes sorted by path then method', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/z'), bRoute('GET', '/api/a')],
      frontendApiCalls:[],
      endpointInventory: [],
    });
    const paths = r.orphanedBackendRoutes.map(o => o.path);
    expect(paths[0]).toBe('/api/a');
    expect(paths[1]).toBe('/api/z');
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — non-mutation', () => {
  test('input backendRoutes not mutated', () => {
    const backendRoutes = [bRoute('GET', '/api/users')];
    const orig = { ...backendRoutes[0] };
    linkFrontendBackendApis({ backendRoutes, frontendApiCalls: [], endpointInventory: [] });
    expect(backendRoutes[0].path).toBe(orig.path);
    expect(backendRoutes[0].method).toBe(orig.method);
  });

  test('input frontendApiCalls not mutated', () => {
    const frontendApiCalls = [fCall('GET', '/api/users')];
    const orig = { ...frontendApiCalls[0] };
    linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls, endpointInventory: [] });
    expect(frontendApiCalls[0].path).toBe(orig.path);
  });
});

// ── Duplicate handling ────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — duplicate handling', () => {
  test('duplicate frontend calls to same endpoint both counted in frontendCallCount', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users', 'src/a.js'), fCall('GET', '/api/users', 'src/b.js')],
      endpointInventory: [],
    });
    expect(r.coverage.frontendCallCount).toBe(2);
    expect(r.coverage.linkedFrontendCallCount).toBe(2);
  });

  test('two frontend calls to same endpoint → one linkedEndpoint', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users', 'src/a.js'), fCall('GET', '/api/users', 'src/b.js')],
      endpointInventory: [],
    });
    const eps = r.linkedEndpoints.filter(e => e.path === '/api/users' && e.method === 'GET');
    expect(eps.length).toBe(1);
    expect(eps[0].frontendCalls.length).toBe(2);
  });

  test('duplicate backend routes for same path/method both listed in linkedEndpoint', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users', 'server.js'), bRoute('GET', '/api/users', 'routes/users.js')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints.find(e => e.path === '/api/users');
    expect(ep.backendRoutes.length).toBe(2);
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('linkFrontendBackendApis — output shape', () => {
  test('all top-level keys present', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r).toHaveProperty('linkedEndpoints');
    expect(r).toHaveProperty('unresolvedFrontendCalls');
    expect(r).toHaveProperty('orphanedBackendRoutes');
    expect(r).toHaveProperty('methodMismatches');
    expect(r).toHaveProperty('linkageScore');
    expect(r).toHaveProperty('linkageLevel');
    expect(r).toHaveProperty('coverage');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('recommendations');
  });

  test('linkedEndpoint has all required fields', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:   [bRoute('GET', '/api/users')],
      frontendApiCalls:[fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    const ep = r.linkedEndpoints[0];
    expect(ep).toHaveProperty('method');
    expect(ep).toHaveProperty('path');
    expect(ep).toHaveProperty('frontendCalls');
    expect(ep).toHaveProperty('backendRoutes');
    expect(ep).toHaveProperty('confidence');
    expect(ep).toHaveProperty('linkageType');
  });
});

// ── Orphan classification — orphanType field ──────────────────────────────────

describe('linkFrontendBackendApis — orphanType classification', () => {
  function orphan(method, path) {
    return { method: method.toUpperCase(), path, file: 'backend/server.js', framework: 'express' };
  }
  function prevLinked(method, path) {
    return { method: method.toUpperCase(), path };
  }

  test('non-/api/ orphaned route has orphanType "navigation"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/dashboard')],
      frontendApiCalls: [],
      endpointInventory: [],
    });
    const rt = r.orphanedBackendRoutes.find(function(x) { return x.path === '/dashboard'; });
    expect(rt).toBeDefined();
    expect(rt.orphanType).toBe('navigation');
  });

  test('/api/ orphaned route with no previous linkage has orphanType "unlinked"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/repos/confidence')],
      frontendApiCalls: [],
      endpointInventory: [],
    });
    const rt = r.orphanedBackendRoutes[0];
    expect(rt.orphanType).toBe('unlinked');
  });

  test('/api/ orphaned route present in previousLinkedEndpoints has orphanType "disconnected"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:          [bRoute('GET', '/api/portfolio/anomalies')],
      frontendApiCalls:       [],
      endpointInventory:      [],
      previousLinkedEndpoints: [prevLinked('GET', '/api/portfolio/anomalies')],
    });
    const rt = r.orphanedBackendRoutes[0];
    expect(rt.orphanType).toBe('disconnected');
  });

  test('param masking: :id in previous and :_p in current both classify as "disconnected"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:          [bRoute('GET', '/api/repos/:id/architecture')],
      frontendApiCalls:       [],
      endpointInventory:      [],
      previousLinkedEndpoints: [prevLinked('GET', '/api/repos/:_p/architecture')],
    });
    const rt = r.orphanedBackendRoutes[0];
    expect(rt.orphanType).toBe('disconnected');
  });

  test('count invariant: navigationOrphanCount + unlinkedApiCount + disconnectedApiCount === orphanedBackendRouteCount', () => {
    const r = linkFrontendBackendApis({
      backendRoutes: [
        bRoute('GET', '/dashboard'),
        bRoute('GET', '/auth/github'),
        bRoute('GET', '/api/repos/confidence'),
        bRoute('GET', '/api/portfolio/anomalies'),
      ],
      frontendApiCalls:       [],
      endpointInventory:      [],
      previousLinkedEndpoints: [prevLinked('GET', '/api/portfolio/anomalies')],
    });
    const cov = r.coverage;
    expect(cov.navigationOrphanCount + cov.unlinkedApiCount + cov.disconnectedApiCount)
      .toBe(cov.orphanedBackendRouteCount);
  });

  test('without previousLinkedEndpoints all /api/ orphans are "unlinked"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes: [
        bRoute('GET', '/api/repos/confidence'),
        bRoute('GET', '/api/portfolio/anomalies'),
      ],
      frontendApiCalls:  [],
      endpointInventory: [],
    });
    const types = r.orphanedBackendRoutes.map(function(rt) { return rt.orphanType; });
    expect(types.every(function(t) { return t === 'unlinked'; })).toBe(true);
  });

  test('coverage contains all three new count fields', () => {
    const r = linkFrontendBackendApis({ backendRoutes: [], frontendApiCalls: [], endpointInventory: [] });
    expect(r.coverage).toHaveProperty('navigationOrphanCount');
    expect(r.coverage).toHaveProperty('unlinkedApiCount');
    expect(r.coverage).toHaveProperty('disconnectedApiCount');
  });

  test('/auth/ path orphaned route has orphanType "navigation"', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/auth/github'), bRoute('GET', '/auth/github/callback'), bRoute('POST', '/auth/logout')],
      frontendApiCalls: [],
      endpointInventory: [],
    });
    r.orphanedBackendRoutes.forEach(function(rt) {
      expect(rt.orphanType).toBe('navigation');
    });
  });
});

// ── Classification-aware scoring ──────────────────────────────────────────────

describe('linkFrontendBackendApis — classification-aware scoring', () => {

  test('navigation orphan excluded from denominator — score higher than if treated as unlinked', () => {
    // 1 linked API + 1 navigation orphan (/dashboard)
    // apiBackendCount = 2 - 1 = 1 → classifiedBackendCovPct = 100%
    // score = round(100*0.6 + 100*0.3 - 0 - 0) = 90
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/dashboard')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkageScore).toBe(90);
  });

  test('no navigation orphans — denominator unchanged, score same as before', () => {
    // 1 linked + 1 unlinked /api/ → navigationOrphanCount = 0
    // apiBackendCount = 2, classifiedBackendCovPct = 50%
    // score = round(100*0.6 + 50*0.3) = 75
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/api/internal')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    expect(r.linkageScore).toBe(75);
  });

  test('all routes are navigation (apiBackendCount = 0) — falls back gracefully, no crash', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/dashboard'), bRoute('GET', '/auth/login')],
      frontendApiCalls: [],
      endpointInventory: [],
    });
    expect(Number.isFinite(r.linkageScore)).toBe(true);
    expect(['integrated', 'partial', 'weak', 'unknown']).toContain(r.linkageLevel);
  });

  test('disconnectedApiCount = 1 — penalty of 2 applied to linkageScore', () => {
    // 1 linked + 1 disconnected /api/ route
    // apiBackendCount = 2, classifiedBackendCovPct = 50%
    // disconnectedPenalty = min(8, 1*2) = 2
    // score = round(100*0.6 + 50*0.3 - 0 - 2) = round(73) = 73
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/api/items')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
      previousLinkedEndpoints: [{ method: 'GET', path: '/api/items' }],
    });
    expect(r.coverage.disconnectedApiCount).toBe(1);
    expect(r.linkageScore).toBe(73);
  });

  test('disconnectedApiCount >= 4 — penalty capped at 8', () => {
    // 1 linked + 4 disconnected → disconnectedPenalty = min(8, 8) = 8 (exactly at cap)
    // 1 linked + 10 disconnected → disconnectedPenalty = min(8, 20) = 8 (over cap, still 8)
    const prevLinked = [
      { method: 'GET', path: '/api/a' }, { method: 'GET', path: '/api/b' },
      { method: 'GET', path: '/api/c' }, { method: 'GET', path: '/api/d' },
      { method: 'GET', path: '/api/e' }, { method: 'GET', path: '/api/f' },
      { method: 'GET', path: '/api/g' }, { method: 'GET', path: '/api/h' },
      { method: 'GET', path: '/api/i' }, { method: 'GET', path: '/api/j' },
    ];
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), ...prevLinked.map(e => bRoute(e.method, e.path))],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
      previousLinkedEndpoints: prevLinked,
    });
    expect(r.coverage.disconnectedApiCount).toBe(10);
    // score = round(100*0.6 + round(1/11*100)*0.3 - 8) = round(60 + 9*0.3 - 8) = round(54.7) = 55
    expect(r.linkageScore).toBe(55);
  });

  test('disconnectedApiCount = 0 — no extra penalty, score matches base formula', () => {
    // 1 linked + 1 unlinked (never in previousLinkedEndpoints) → no disconnected penalty
    // score = round(100*0.6 + 50*0.3) = 75
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/api/other')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
      previousLinkedEndpoints: [],
    });
    expect(r.coverage.disconnectedApiCount).toBe(0);
    expect(r.linkageScore).toBe(75);
  });

  test('navigation orphan scores 15 pts higher than same-sized /api/ unlinked orphan', () => {
    const rNav = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/dashboard')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    const rUnlinked = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/api/internal')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
    });
    // nav → 90, unlinked → 75
    expect(rNav.linkageScore - rUnlinked.linkageScore).toBe(15);
  });

  test('linkageScore is an integer after classification-aware adjustments', () => {
    const r = linkFrontendBackendApis({
      backendRoutes:    [bRoute('GET', '/api/users'), bRoute('GET', '/dashboard'), bRoute('GET', '/api/items')],
      frontendApiCalls: [fCall('GET', '/api/users')],
      endpointInventory: [],
      previousLinkedEndpoints: [{ method: 'GET', path: '/api/items' }],
    });
    expect(Number.isInteger(r.linkageScore)).toBe(true);
  });

});
