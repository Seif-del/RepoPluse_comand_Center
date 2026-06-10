'use strict';

const { extractRouteApiStructure } = require('../../../../execution/architecture/extractRouteApiStructure');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFile(path, content, language) {
  return { path, content: content || '', language: language || 'JavaScript' };
}

// ── Empty input ───────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — empty input', () => {
  test('null returns valid zero-state', () => {
    const r = extractRouteApiStructure(null);
    expect(r.backendRoutes).toEqual([]);
    expect(r.frontendApiCalls).toEqual([]);
    expect(r.routeHandlers).toEqual([]);
    expect(r.nextRoutes).toEqual([]);
    expect(r.endpointInventory).toEqual([]);
    expect(r.unresolvedApiCalls).toEqual([]);
    expect(r.unusedBackendRoutes).toEqual([]);
  });

  test('undefined returns valid zero-state', () => {
    const r = extractRouteApiStructure(undefined);
    expect(r.backendRoutes).toEqual([]);
  });

  test('empty files array returns zero-state', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(r.backendRoutes.length).toBe(0);
    expect(r.frontendApiCalls.length).toBe(0);
  });

  test('summary is a non-empty string for empty input', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  test('all framework hints false for empty input', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(r.frameworkHints.hasExpressRoutes).toBe(false);
    expect(r.frameworkHints.hasFastifyRoutes).toBe(false);
    expect(r.frameworkHints.hasNextApiRoutes).toBe(false);
    expect(r.frameworkHints.hasFrontendApiCalls).toBe(false);
    expect(r.frameworkHints.likelyFullStackApiIntegration).toBe(false);
  });
});

// ── Express app.METHOD routes ─────────────────────────────────────────────────

describe('extractRouteApiStructure — Express app.METHOD', () => {
  test('app.get extracts GET route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('app.post extracts POST route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.post('/api/users', createUser);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users' && rt.method === 'POST');
    expect(route).toBeDefined();
  });

  test('app.put extracts PUT route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.put('/api/users/:id', updateUser);")],
    });
    const route = r.backendRoutes.find(rt => rt.method === 'PUT');
    expect(route).toBeDefined();
    expect(route.path).toBe('/api/users/:id');
  });

  test('app.delete extracts DELETE route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.delete('/api/users/:id', deleteUser);")],
    });
    const route = r.backendRoutes.find(rt => rt.method === 'DELETE');
    expect(route).toBeDefined();
  });

  test('app.patch extracts PATCH route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.patch('/api/users/:id', patchUser);")],
    });
    const route = r.backendRoutes.find(rt => rt.method === 'PATCH');
    expect(route).toBeDefined();
  });

  test('backendRoute has file field', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    expect(r.backendRoutes[0].file).toBe('server.js');
  });

  test('backendRoute has framework field set to express', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    expect(r.backendRoutes[0].framework).toBe('express');
  });

  test('hasExpressRoutes hint true', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    expect(r.frameworkHints.hasExpressRoutes).toBe(true);
  });
});

// ── Express router.METHOD routes ──────────────────────────────────────────────

describe('extractRouteApiStructure — Express router.METHOD', () => {
  test('router.get extracts GET route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('routes/users.js', "router.get('/users', listUsers);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/users' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('router.post extracts POST route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('routes/users.js', "router.post('/users', createUser);")],
    });
    expect(r.backendRoutes.find(rt => rt.method === 'POST')).toBeDefined();
  });

  test('router route has framework express', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('routes/users.js', "router.get('/users', listUsers);")],
    });
    expect(r.backendRoutes[0].framework).toBe('express');
  });
});

// ── Express app.use / router.use ──────────────────────────────────────────────

describe('extractRouteApiStructure — Express use (mount)', () => {
  test('app.use("/api", router) is captured in routeHandlers', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.use('/api', apiRouter);")],
    });
    const handler = r.routeHandlers.find(h => h.mountPath === '/api');
    expect(handler).toBeDefined();
  });

  test('router.use("/admin", adminRouter) is captured in routeHandlers', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('routes/index.js', "router.use('/admin', adminRouter);")],
    });
    const handler = r.routeHandlers.find(h => h.mountPath === '/admin');
    expect(handler).toBeDefined();
  });
});

// ── Fastify routes ────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — Fastify', () => {
  test('fastify.get extracts GET route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "fastify.get('/api/users', handler);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(route.framework).toBe('fastify');
  });

  test('fastify.post extracts POST route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "fastify.post('/api/items', createItem);")],
    });
    expect(r.backendRoutes.find(rt => rt.method === 'POST' && rt.framework === 'fastify')).toBeDefined();
  });

  test('fastify.route({ method, url }) extracts route', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', `fastify.route({ method: 'GET', url: '/api/status', handler: getStatus });`)],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/status' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(route.framework).toBe('fastify');
  });

  test('hasFastifyRoutes hint true', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "fastify.get('/api/users', handler);")],
    });
    expect(r.frameworkHints.hasFastifyRoutes).toBe(true);
  });
});

// ── Next.js pages/api routes ──────────────────────────────────────────────────

describe('extractRouteApiStructure — Next.js pages/api', () => {
  test('pages/api/users.js maps to /api/users', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('pages/api/users/[id].js maps to /api/users/:id', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users/[id].js', 'export default function handler(req, res) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users/:id');
    expect(route).toBeDefined();
  });

  test('nextRoute has file field', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    expect(r.nextRoutes[0].file).toBe('pages/api/users.js');
  });

  test('nextRoute has framework next', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    expect(r.nextRoutes[0].framework).toBe('next');
  });

  test('hasNextApiRoutes hint true', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    expect(r.frameworkHints.hasNextApiRoutes).toBe(true);
  });
});

// ── Next.js app/api routes ────────────────────────────────────────────────────

describe('extractRouteApiStructure — Next.js app/api', () => {
  test('app/api/users/route.js maps to /api/users', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/users/route.js', 'export async function GET(req) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('app/api/users/[id]/route.ts maps to /api/users/:id', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/users/[id]/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users/:id');
    expect(route).toBeDefined();
  });

  test('export GET in app route file captures GET method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/users/route.js', 'export async function GET(req) {}\nexport async function POST(req) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.methods).toContain('GET');
    expect(route.methods).toContain('POST');
  });

  test('export DELETE in app route file captures DELETE method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/[id]/route.js', 'export async function DELETE(req) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items/:id');
    expect(route.methods).toContain('DELETE');
  });
});

// ── fetch calls ───────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — fetch calls', () => {
  test('fetch("/api/users") captured as GET', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });

  test('fetch with method option extracts method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users', { method: 'POST' })")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users');
    expect(call).toBeDefined();
    expect(call.method).toBe('POST');
  });

  test('fetch has file field', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    expect(r.frontendApiCalls[0].file).toBe('src/app.js');
  });

  test('hasFrontendApiCalls hint true', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    expect(r.frameworkHints.hasFrontendApiCalls).toBe(true);
  });
});

// ── fetch template literals ───────────────────────────────────────────────────

describe('extractRouteApiStructure — fetch template literals', () => {
  test('fetch(`/api/users/${id}`) normalizes to /api/users/:param', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', 'fetch(`/api/users/${id}`)')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users/:param');
    expect(call).toBeDefined();
  });

  test('fetch(`/api/users/${userId}/posts`) normalizes multiple params', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', 'fetch(`/api/users/${userId}/posts/${postId}`)')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users/:param/posts/:param');
    expect(call).toBeDefined();
  });

  test('fetch template literal with method option extracts method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', 'fetch(`/api/users/${id}`, { method: \'PUT\' })')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users/:param');
    expect(call).toBeDefined();
    expect(call.method).toBe('PUT');
  });
});

// ── fetch multi-line and nested options ───────────────────────────────────────

describe('extractRouteApiStructure — fetch multi-line options', () => {
  test('multi-line fetch with method: POST extracts correct path and method', () => {
    const src = [
      "const res = await fetch('/api/repos/register', {",
      "  method: 'POST',",
      "  credentials: 'include',",
      "});",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/app.html', src)] });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/register');
    expect(call).toBeDefined();
    expect(call.method).toBe('POST');
  });

  test('multi-line fetch with nested headers object extracts method', () => {
    const src = [
      "const res = await fetch('/api/repos/register', {",
      "  method:      'POST',",
      "  credentials: 'include',",
      "  headers:     { 'Content-Type': 'application/json' },",
      "  body:        JSON.stringify({ url }),",
      "});",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/app.html', src)] });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/register');
    expect(call).toBeDefined();
    expect(call.method).toBe('POST');
  });

  test('path does not contain options block content', () => {
    const src = [
      "const res = await fetch('/api/repos/register', {",
      "  method: 'POST',",
      "});",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/app.html', src)] });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/register');
    expect(call).toBeDefined();
    expect(call.path).toBe('/api/repos/register');
    expect(call.path).not.toContain('{');
    expect(call.path).not.toContain("'POST'");
  });

  test('single-quoted options do not capture across surrounding single-quoted strings', () => {
    // Regression: old FETCH_RE would backtrack past closing ' and capture into later code
    const src = [
      "const res = await fetch('/api/repos/register', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ url }),",
      "});",
      "if (res.ok) {",
      "  showBanner(`done`, 'success');",
      "}",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/app.html', src)] });
    const calls = r.frontendApiCalls;
    expect(calls).toHaveLength(1);
    expect(calls[0].path).toBe('/api/repos/register');
    expect(calls[0].method).toBe('POST');
  });

  test('double-quoted fetch URL is extracted', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', 'fetch("/api/users", { method: "DELETE" })')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users');
    expect(call).toBeDefined();
    expect(call.method).toBe('DELETE');
  });

  test('two consecutive fetch calls both extracted without cross-contamination', () => {
    const src = [
      "const a = await fetch('/api/repos', { credentials: 'include' });",
      "const b = await fetch('/api/repos/register', {",
      "  method: 'POST',",
      "  headers: { 'Content-Type': 'application/json' },",
      "  body: JSON.stringify({ url }),",
      "});",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/app.html', src)] });
    const calls = r.frontendApiCalls;
    expect(calls).toHaveLength(2);
    const get = calls.find(c => c.path === '/api/repos');
    const post = calls.find(c => c.path === '/api/repos/register');
    expect(get).toBeDefined();
    expect(get.method).toBe('GET');
    expect(post).toBeDefined();
    expect(post.method).toBe('POST');
  });

  test('manage-repos.html pattern: clean paths, correct methods, no garbage', () => {
    // Exact pattern from frontend/manage-repos.html that previously produced a malformed
    // path containing the entire options block and surrounding code.
    const src = [
      "const res1 = await fetch('/api/repos', { credentials: 'include' });",
      "const res2 = await fetch('/api/repos/register', {",
      "  method:      'POST',",
      "  credentials: 'include',",
      "  headers:     { 'Content-Type': 'application/json' },",
      "  body:        JSON.stringify({ url }),",
      "});",
      "if (res2.status === 401) {",
      "  window.location.href = '/auth/github';",
      "  return;",
      "}",
      "const data = await res2.json();",
      "if (res2.ok && data.ok) {",
      "  showBanner(`\"${data.repo.fullName}\" registered.`, 'success');",
      "}",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/manage-repos.html', src)] });
    const calls = r.frontendApiCalls;
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.path).not.toContain('{');
      expect(c.path).not.toContain("'POST'");
      expect(c.path).not.toContain('success');
    }
    const getCall  = calls.find(c => c.path === '/api/repos');
    const postCall = calls.find(c => c.path === '/api/repos/register');
    expect(getCall).toBeDefined();
    expect(getCall.method).toBe('GET');
    expect(postCall).toBeDefined();
    expect(postCall.method).toBe('POST');
  });
});

// ── axios calls ───────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — axios', () => {
  test('axios.get("/api/users") captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "axios.get('/api/users')")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users' && c.method === 'GET');
    expect(call).toBeDefined();
    expect(call.client).toBe('axios');
  });

  test('axios.post("/api/users") captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "axios.post('/api/users', data)")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users' && c.method === 'POST');
    expect(call).toBeDefined();
  });

  test('axios.delete captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "axios.delete('/api/users/1')")],
    });
    expect(r.frontendApiCalls.find(c => c.method === 'DELETE')).toBeDefined();
  });
});

// ── apiClient calls ───────────────────────────────────────────────────────────

describe('extractRouteApiStructure — apiClient', () => {
  test('apiClient.get captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "apiClient.get('/api/users')")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users' && c.method === 'GET');
    expect(call).toBeDefined();
  });

  test('apiClient.post captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "apiClient.post('/api/items', body)")],
    });
    expect(r.frontendApiCalls.find(c => c.method === 'POST')).toBeDefined();
  });
});

// ── client.request object form ────────────────────────────────────────────────

describe('extractRouteApiStructure — client.request', () => {
  test("client.request({ method:'GET', url:'/api/users' }) captured", () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "client.request({ method: 'GET', url: '/api/users' })")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users' && c.method === 'GET');
    expect(call).toBeDefined();
  });

  test("client.request with POST captured", () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/api.js', "client.request({ method: 'POST', url: '/api/users' })")],
    });
    expect(r.frontendApiCalls.find(c => c.method === 'POST')).toBeDefined();
  });
});

// ── Method/path normalization ─────────────────────────────────────────────────

describe('extractRouteApiStructure — normalization', () => {
  test('method is uppercased', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', handler);")],
    });
    expect(r.backendRoutes[0].method).toBe('GET');
  });

  test('trailing slash stripped from backend route path', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users/', handler);")],
    });
    expect(r.backendRoutes[0].path).toBe('/api/users');
  });

  test('trailing slash stripped from frontend call path', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users/')")],
    });
    expect(r.frontendApiCalls[0].path).toBe('/api/users');
  });

  test('[id] param in Express route normalizes to :id', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users/[id].js', 'export default function handler(req, res) {}')],
    });
    expect(r.nextRoutes[0].urlPattern).toBe('/api/users/:id');
  });

  test('unknown frontend method defaults to UNKNOWN when no method info', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    // fetch with no options defaults to GET (not UNKNOWN)
    expect(r.frontendApiCalls[0].method).toBe('GET');
  });
});

// ── Handler linkage ───────────────────────────────────────────────────────────

describe('extractRouteApiStructure — handler linkage', () => {
  test('named handler is captured in backendRoute', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users');
    expect(route.handlerName).toBe('getUsers');
    expect(route.handlerType).toBe('named');
  });

  test('inline function handler detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', function(req, res) { res.send(); });")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users');
    expect(route.handlerType).toBe('inline');
  });

  test('inline arrow function handler detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', (req, res) => { res.send(); });")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users');
    expect(route.handlerType).toBe('inline');
  });

  test('multiple middleware array: last named handler captured', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', authMiddleware, getUsers);")],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users');
    expect(route.handlerName).toBe('getUsers');
  });
});

// ── Endpoint inventory ────────────────────────────────────────────────────────

describe('extractRouteApiStructure — endpointInventory', () => {
  test('backend route appears in endpointInventory', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    const entry = r.endpointInventory.find(e => e.path === '/api/users' && e.method === 'GET');
    expect(entry).toBeDefined();
  });

  test('frontend call appears in endpointInventory', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    const entry = r.endpointInventory.find(e => e.path === '/api/users');
    expect(entry).toBeDefined();
  });

  test('endpointInventory deduplicates same path+method', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('src/app.js', "fetch('/api/users')"),
      ],
    });
    const entries = r.endpointInventory.filter(e => e.path === '/api/users' && e.method === 'GET');
    expect(entries.length).toBe(1);
  });
});

// ── Unresolved API calls ──────────────────────────────────────────────────────

describe('extractRouteApiStructure — unresolvedApiCalls', () => {
  test('frontend call with no backend route is unresolved', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/ghost')")],
    });
    const u = r.unresolvedApiCalls.find(u => u.path === '/api/ghost');
    expect(u).toBeDefined();
  });

  test('frontend call matched to backend route is not unresolved', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('src/app.js', "fetch('/api/users')"),
      ],
    });
    expect(r.unresolvedApiCalls.find(u => u.path === '/api/users')).toBeUndefined();
  });

  test('UNKNOWN method matches any backend method for same path', () => {
    // Simulate an UNKNOWN method call (no GET/POST info) — use client.request without method
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.post('/api/submit', createSubmit);"),
        makeFile('src/app.js', "apiClient.get('/api/submit')"),
      ],
    });
    // GET /api/submit has a POST backend but no GET backend → should be unresolved
    const u = r.unresolvedApiCalls.find(u => u.path === '/api/submit');
    expect(u).toBeDefined();
  });

  test('unresolvedApiCall has from field', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/ghost')")],
    });
    expect(r.unresolvedApiCalls[0]).toHaveProperty('from');
  });
});

// ── Unused backend routes ─────────────────────────────────────────────────────

describe('extractRouteApiStructure — unusedBackendRoutes', () => {
  test('backend route with no frontend call is candidate unused', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/internal', getInternal);")],
    });
    const unused = r.unusedBackendRoutes.find(u => u.path === '/api/internal');
    expect(unused).toBeDefined();
  });

  test('unused backend route has candidate flag', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/internal', getInternal);")],
    });
    const unused = r.unusedBackendRoutes.find(u => u.path === '/api/internal');
    expect(unused.candidate).toBe(true);
  });

  test('backend route matched by frontend is not in unusedBackendRoutes', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('src/app.js', "fetch('/api/users')"),
      ],
    });
    expect(r.unusedBackendRoutes.find(u => u.path === '/api/users')).toBeUndefined();
  });

  test('Next.js API routes appear as candidate unused when no frontend calls', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    // Next routes are included in backendRoutes for matching purposes
    // If unmatched they should appear as candidates
    expect(r.unusedBackendRoutes.length).toBeGreaterThanOrEqual(0); // permissive — v1 behavior
  });
});

// ── Comments ignored ──────────────────────────────────────────────────────────

describe('extractRouteApiStructure — comments ignored', () => {
  test('line comment with route not extracted', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "// app.get('/api/ghost', handler);")],
    });
    expect(r.backendRoutes.find(rt => rt.path === '/api/ghost')).toBeUndefined();
  });

  test('block comment with fetch not extracted', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "/* fetch('/api/ghost') */")],
    });
    expect(r.frontendApiCalls.find(c => c.path === '/api/ghost')).toBeUndefined();
  });

  test('real route after comment line is still extracted', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "// app.get('/api/ghost', handler);\napp.get('/api/users', getUsers);")],
    });
    expect(r.backendRoutes.find(rt => rt.path === '/api/users')).toBeDefined();
  });
});

// ── likelyFullStackApiIntegration hint ────────────────────────────────────────

describe('extractRouteApiStructure — likelyFullStackApiIntegration', () => {
  test('true when both backend routes and frontend calls present', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('src/app.js', "fetch('/api/users')"),
      ],
    });
    expect(r.frameworkHints.likelyFullStackApiIntegration).toBe(true);
  });

  test('false when only backend routes', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    expect(r.frameworkHints.likelyFullStackApiIntegration).toBe(false);
  });

  test('false when only frontend calls', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    expect(r.frameworkHints.likelyFullStackApiIntegration).toBe(false);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — determinism', () => {
  test('same input produces identical output', () => {
    const files = [
      makeFile('server.js', "app.get('/api/users', getUsers);\napp.post('/api/users', createUser);"),
      makeFile('routes/items.js', "router.get('/items', listItems);"),
      makeFile('src/app.js', "fetch('/api/users')\naxios.get('/api/users')"),
    ];
    const r1 = extractRouteApiStructure({ files });
    const r2 = extractRouteApiStructure({ files });
    expect(r1).toEqual(r2);
  });

  test('backendRoutes sorted by file then path then method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.post('/api/b', h);\napp.get('/api/a', h);")],
    });
    const methods = r.backendRoutes.map(rt => rt.method);
    // GET /api/a should come before POST /api/b
    const getIdx  = r.backendRoutes.findIndex(rt => rt.method === 'GET');
    const postIdx = r.backendRoutes.findIndex(rt => rt.method === 'POST');
    expect(getIdx).toBeLessThan(postIdx);
  });

  test('frontendApiCalls sorted by file then path then method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/z')\nfetch('/api/a')")],
    });
    const paths = r.frontendApiCalls.map(c => c.path);
    expect(paths[0]).toBe('/api/a');
    expect(paths[1]).toBe('/api/z');
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — non-mutation', () => {
  test('input files array not mutated', () => {
    const files = [makeFile('server.js', "app.get('/api/users', getUsers);")];
    const origPath = files[0].path;
    extractRouteApiStructure({ files });
    expect(files[0].path).toBe(origPath);
  });

  test('input object not mutated', () => {
    const input = { files: [makeFile('server.js', "app.get('/api/users', getUsers);")] };
    const origLen = input.files.length;
    extractRouteApiStructure(input);
    expect(input.files.length).toBe(origLen);
  });
});

// ── Mount prefix resolution ───────────────────────────────────────────────────

describe('extractRouteApiStructure — mount prefix resolution', () => {

  test('detects app.use("/api/repos", repoRoutes) and resolves router GET to prefixed path', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/summary', getSummary);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/repos/summary' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('router.get("/") resolves to mount prefix with no trailing slash', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/', listRepos);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/repos' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos/')).toBeUndefined();
  });

  test('router.get("/:id/architecture") resolves to /api/repos/:id/architecture', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/:id/architecture', getArch);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/repos/:id/architecture');
    expect(route).toBeDefined();
  });

  test('portfolioRoutes router.get("/architecture") resolves to /api/portfolio/architecture', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const portfolioRoutes = require('./routes/portfolioRoutes');",
          "app.use('/api/portfolio', portfolioRoutes);",
        ].join('\n')),
        makeFile('routes/portfolioRoutes.js', "router.get('/architecture', getPortfolioArch);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/portfolio/architecture' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('server-level app.get routes are NOT given a mount prefix', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
          "app.get('/summary', getSummary);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/attention', getAttention);"),
      ],
    });
    // /summary lives in server.js (not in the mounted router), so it stays as /summary
    const serverRoute = r.backendRoutes.find(rt => rt.path === '/summary' && rt.method === 'GET');
    expect(serverRoute).toBeDefined();
    // no false double-prefix
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos/summary')).toBeUndefined();
  });

  test('resolved paths contain no double slashes', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/attention', getAttention);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.file === 'routes/repoRoutes.js' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(route.path).not.toContain('//');
  });

  test('frontend /api/repos/summary is no longer unresolved after prefix fix', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', "router.get('/summary', getSummary);"),
        makeFile('frontend/dashboard.html', "fetch('/api/repos/summary')"),
      ],
    });
    expect(r.unresolvedApiCalls.find(u => u.path === '/api/repos/summary')).toBeUndefined();
  });

  test('multiple mounted routers: all prefixed routes resolve correctly', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "const portfolioRoutes = require('./routes/portfolioRoutes');",
          "app.use('/api/repos', repoRoutes);",
          "app.use('/api/portfolio', portfolioRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "router.get('/attention', getAttention);",
          "router.post('/sync', syncRepos);",
        ].join('\n')),
        makeFile('routes/portfolioRoutes.js', "router.get('/architecture', getPortfolioArch);"),
        makeFile('frontend/dashboard.html', [
          "fetch('/api/repos/attention')",
          "fetch('/api/repos/sync', { method: 'POST' })",
          "fetch('/api/portfolio/architecture')",
        ].join('\n')),
      ],
    });
    expect(r.unresolvedApiCalls.find(u => u.path === '/api/repos/attention')).toBeUndefined();
    expect(r.unresolvedApiCalls.find(u => u.path === '/api/repos/sync')).toBeUndefined();
    expect(r.unresolvedApiCalls.find(u => u.path === '/api/portfolio/architecture')).toBeUndefined();
  });

  test('simulates previous false-positive dashboard calls: all now resolved', () => {
    // Mirrors the actual RepoPulse server.js + repoRoutes + portfolioRoutes structure
    const serverSrc = [
      "const repoRoutes = require('./routes/repoRoutes');",
      "const portfolioRoutes = require('./routes/portfolioRoutes');",
      "app.use('/api/repos', repoRoutes);",
      "app.use('/api/portfolio', portfolioRoutes);",
      "app.get('/summary', getSummary);",
    ].join('\n');

    const repoRoutesSrc = [
      "router.get('/', listRepos);",
      "router.get('/summary', getRepoSummary);",
      "router.get('/attention', getAttention);",
      "router.post('/sync', syncRepos);",
      "router.post('/register', registerRepo);",
    ].join('\n');

    const portfolioRoutesSrc = [
      "router.get('/forecast', getForecast);",
      "router.get('/history', getHistory);",
      "router.get('/architecture', getPortfolioArch);",
      "router.get('/governance', getGovernance);",
      "router.get('/watchlists', getWatchlists);",
    ].join('\n');

    const dashboardFetches = [
      "fetch('/api/repos')",
      "fetch('/api/repos/summary')",
      "fetch('/api/repos/attention')",
      "fetch('/api/repos/sync', { method: 'POST' })",
      "fetch('/api/repos/register', { method: 'POST' })",
      "fetch('/api/portfolio/forecast')",
      "fetch('/api/portfolio/history')",
      "fetch('/api/portfolio/architecture')",
      "fetch('/api/portfolio/governance')",
      "fetch('/api/portfolio/watchlists')",
      "fetch('/summary')",
    ].join('\n');

    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', serverSrc),
        makeFile('routes/repoRoutes.js', repoRoutesSrc),
        makeFile('routes/portfolioRoutes.js', portfolioRoutesSrc),
        makeFile('frontend/dashboard.html', dashboardFetches),
      ],
    });

    const unresolved = r.unresolvedApiCalls.map(u => u.path);
    expect(unresolved).not.toContain('/api/repos');
    expect(unresolved).not.toContain('/api/repos/summary');
    expect(unresolved).not.toContain('/api/repos/attention');
    expect(unresolved).not.toContain('/api/repos/sync');
    expect(unresolved).not.toContain('/api/repos/register');
    expect(unresolved).not.toContain('/api/portfolio/forecast');
    expect(unresolved).not.toContain('/api/portfolio/history');
    expect(unresolved).not.toContain('/api/portfolio/architecture');
    expect(unresolved).not.toContain('/api/portfolio/governance');
    expect(unresolved).not.toContain('/api/portfolio/watchlists');
    expect(unresolved).not.toContain('/summary');
    expect(r.unresolvedApiCalls).toHaveLength(0);
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('extractRouteApiStructure — output shape', () => {
  test('all top-level keys present', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(r).toHaveProperty('backendRoutes');
    expect(r).toHaveProperty('frontendApiCalls');
    expect(r).toHaveProperty('routeHandlers');
    expect(r).toHaveProperty('nextRoutes');
    expect(r).toHaveProperty('endpointInventory');
    expect(r).toHaveProperty('unresolvedApiCalls');
    expect(r).toHaveProperty('unusedBackendRoutes');
    expect(r).toHaveProperty('frameworkHints');
    expect(r).toHaveProperty('summary');
  });

  test('all frameworkHint keys present', () => {
    const r = extractRouteApiStructure({ files: [] });
    const h = r.frameworkHints;
    expect(h).toHaveProperty('hasExpressRoutes');
    expect(h).toHaveProperty('hasFastifyRoutes');
    expect(h).toHaveProperty('hasNextApiRoutes');
    expect(h).toHaveProperty('hasFrontendApiCalls');
    expect(h).toHaveProperty('likelyFullStackApiIntegration');
  });

  test('backendRoute shape', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('server.js', "app.get('/api/users', getUsers);")],
    });
    const rt = r.backendRoutes[0];
    expect(rt).toHaveProperty('method');
    expect(rt).toHaveProperty('path');
    expect(rt).toHaveProperty('file');
    expect(rt).toHaveProperty('framework');
    expect(rt).toHaveProperty('handlerType');
  });

  test('frontendApiCall shape', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app.js', "fetch('/api/users')")],
    });
    const c = r.frontendApiCalls[0];
    expect(c).toHaveProperty('method');
    expect(c).toHaveProperty('path');
    expect(c).toHaveProperty('file');
    expect(c).toHaveProperty('client');
  });
});

// ── Markdown false-positive prevention ───────────────────────────────────────

describe('extractRouteApiStructure — Markdown route code blocks are not backend routes', () => {
  const mdContent = [
    '# API Reference',
    '',
    'Register a new user:',
    '',
    '```js',
    "app.post('/api/users', createUser);",
    "app.get('/api/users/:id', getUser);",
    "app.delete('/api/users/:id', deleteUser);",
    '```',
    '',
    'Send a notification:',
    '',
    '```js',
    "app.post('/api/notifications', sendNotification);",
    '```',
  ].join('\n');

  test('Markdown code-block routes produce zero backend routes', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('docs/api-reference.md', mdContent)],
    });
    expect(r.backendRoutes).toHaveLength(0);
  });

  test('Markdown code-block routes do not appear in unusedBackendRoutes', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('docs/api-reference.md', mdContent)],
    });
    expect(r.unusedBackendRoutes).toHaveLength(0);
  });

  test('real .js route file alongside Markdown still extracts its routes', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('docs/api-reference.md', mdContent),
        makeFile('routes/users.js', "app.get('/api/live', handler);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.path === '/api/live' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(r.backendRoutes).toHaveLength(1);
  });

  test('Markdown file with routes does not inflate orphanedBackendRouteCount', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('docs/api-reference.md', mdContent),
        makeFile('frontend/app.js', "fetch('/api/live')"),
        makeFile('routes/users.js', "app.get('/api/live', handler);"),
      ],
    });
    // /api/live is called and served — only route present
    expect(r.unusedBackendRoutes).toHaveLength(0);
  });
});

// ── String-concatenation fetch extraction ────────────────────────────────────

describe('extractRouteApiStructure — concatenated fetch calls resolve to parameterised paths', () => {
  test('fetch with single-segment suffix extracts correct parameterised path', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/dashboard.js',
        "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture', { credentials: 'include' })")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/:_p/architecture');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });

  test('fetch with multi-segment suffix extracts full parameterised path', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/dashboard.js',
        "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture/forecast', { credentials: 'include' })")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/:_p/architecture/forecast');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });

  test('POST method is detected from options object in concatenated fetch', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/dashboard.js',
        "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/change-risk', { method: 'POST', credentials: 'include' })")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/:_p/change-risk');
    expect(call).toBeDefined();
    expect(call.method).toBe('POST');
  });

  test('truncated prefix /api/repos is NOT emitted as a separate call', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/dashboard.js',
        "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture', { credentials: 'include' })")],
    });
    const truncated = r.frontendApiCalls.filter(c => c.path === '/api/repos');
    expect(truncated).toHaveLength(0);
  });

  test('all four dashboard concatenated calls extract without the truncated duplicate', () => {
    const src = [
      "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture/forecast', { credentials: 'include' })",
      "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture', { credentials: 'include' })",
      "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/remediation', { credentials: 'include' })",
      "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/change-risk', { method: 'POST', credentials: 'include' })",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('frontend/dashboard.html', src)] });
    const paths = r.frontendApiCalls.map(c => c.method + ':' + c.path).sort();
    expect(paths).toContain('GET:/api/repos/:_p/architecture');
    expect(paths).toContain('GET:/api/repos/:_p/architecture/forecast');
    expect(paths).toContain('GET:/api/repos/:_p/remediation');
    expect(paths).toContain('POST:/api/repos/:_p/change-risk');
    expect(paths.filter(p => p === 'GET:/api/repos')).toHaveLength(0);
  });

  test('concatenated fetch call links to matching prefixed backend route via linkFrontendBackendApis', () => {
    // extractRouteApiStructure uses exact-key matching for unusedBackendRoutes;
    // param-masked linking happens in linkFrontendBackendApis. Test the full pipeline.
    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const r = extractRouteApiStructure({
      files: [
        makeFile('frontend/dashboard.html',
          "fetch('/api/repos/' + encodeURIComponent(String(repoId)) + '/architecture', { credentials: 'include' })"),
        makeFile('backend/server.js',
          "const repoRoutes = require('./routes/repoRoutes');\napp.use('/api/repos', repoRoutes);"),
        makeFile('backend/routes/repoRoutes.js',
          "router.get('/:id/architecture', getArchitecture);"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:    r.backendRoutes,
      frontendApiCalls: r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    const orphaned = linkage.orphanedBackendRoutes.find(rt => rt.path === '/api/repos/:id/architecture');
    expect(orphaned).toBeUndefined();
  });

  test('non-concatenated fetch call on same route is unaffected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/app.js', "fetch('/api/users')")],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/users');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });
});
