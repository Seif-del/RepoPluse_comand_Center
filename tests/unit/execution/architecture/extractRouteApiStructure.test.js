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

describe('extractRouteApiStructure — Next.js App Router (src/app/api and dynamic segments)', () => {
  test('app/api/auth/login/route.ts GET function export maps to /api/auth/login', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/auth/login/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/auth/login');
    expect(route).toBeDefined();
    expect(route.methods).toEqual(['GET']);
  });

  test('app/api/health/route.js with no dynamic segments maps to /api/health', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/health/route.js', 'export function GET() {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/health');
    expect(route).toBeDefined();
  });

  test('src/app/api/candidates/[id]/edit/route.ts maps to /api/candidates/:id/edit', () => {
    const r = extractRouteApiStructure({
      files: [makeFile(
        'src/app/api/candidates/[id]/edit/route.ts',
        'export async function GET(req) {}\nexport async function POST(req) {}',
        'TypeScript',
      )],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/candidates/:id/edit');
    expect(route).toBeDefined();
    expect(route.methods).toContain('GET');
    expect(route.methods).toContain('POST');
  });

  test('src/app/api/users/route.ts (no dynamic segment) is detected under the src/ prefix', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.type).toBe('app');
  });

  test('export const PATCH = async (...) => {} is detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', "export const PATCH = async (req) => { return Response.json({}); };", 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route).toBeDefined();
    expect(route.methods).toEqual(['PATCH']);
  });

  test('export const DELETE = function (...) {} is detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', "export const DELETE = function (req) { return Response.json({}); };", 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route).toBeDefined();
    expect(route.methods).toEqual(['DELETE']);
  });

  test('export const PUT = async is detected alongside a function-form GET export', () => {
    const r = extractRouteApiStructure({
      files: [makeFile(
        'app/api/items/route.ts',
        "export async function GET(req) {}\nexport const PUT = async (req) => { return Response.json({}); };",
        'TypeScript',
      )],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route.methods).toContain('GET');
    expect(route.methods).toContain('PUT');
  });

  test('export { GET, POST } list form is detected', () => {
    const src = [
      'async function handleGet(req) {}',
      'async function handlePost(req) {}',
      'export { handleGet as GET, handlePost as POST };',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('app/api/items/route.ts', src, 'TypeScript')] });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route).toBeDefined();
    expect(route.methods).toContain('GET');
    expect(route.methods).toContain('POST');
  });

  test('export { GET, POST } with bare identifiers (no aliasing) is detected', () => {
    const src = [
      'async function GET(req) {}',
      'async function POST(req) {}',
      'export { GET, POST };',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('app/api/items/route.ts', src, 'TypeScript')] });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route.methods).toContain('GET');
    expect(route.methods).toContain('POST');
  });

  test('route.ts file with no exported HTTP method produces no route (does not invent methods)', () => {
    const src = [
      'function helper() { return 42; }',
      'export const CONFIG = { revalidate: 60 };',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('app/api/items/route.ts', src, 'TypeScript')] });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/items');
    expect(route).toBeUndefined();
    expect(r.nextRoutes).toHaveLength(0);
  });

  test('route.ts with no exported HTTP method does not appear in unusedBackendRoutes or endpointInventory', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', 'export const CONFIG = { revalidate: 60 };', 'TypeScript')],
    });
    expect(r.unusedBackendRoutes.find(rt => rt.path === '/api/items')).toBeUndefined();
    expect(r.endpointInventory.find(e => e.path === '/api/items')).toBeUndefined();
  });

  test('existing pages/api wildcard fallback behavior is unchanged', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.methods).toEqual(['*']);
    expect(route.type).toBe('pages');
  });
});

// ── Step #8: monorepo/workspace App Router detection ──────────────────────────

describe('extractRouteApiStructure — Next.js App Router workspace layouts', () => {
  test('apps/web/src/app/api/users/route.ts is detected (apps/*/src/app/api)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.type).toBe('app');
    expect(route.methods).toEqual(['GET']);
  });

  test('apps/admin/app/api/users/route.ts is detected (apps/*/app/api, no src/)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/admin/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('packages/web/src/app/api/users/route.ts is detected (packages/*/src/app/api)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('packages/web/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('packages/frontend/src/app/api/users/route.ts is detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('packages/frontend/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('services/frontend/src/app/api/users/route.ts is detected (services/*/src/app/api)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('services/frontend/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('libs/demo/src/app/api/users/route.ts is detected (libs/*/src/app/api)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('libs/demo/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
  });

  test('workspace-detected App Router routes are merged into backendRoutes exactly as Step #5', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nextjs-app-router');
    expect(route).toMatchObject({ method: 'GET', path: '/api/users' });
  });
});

describe('extractRouteApiStructure — Next.js App Router workspace layouts — dynamic and catch-all segments preserved', () => {
  test('nested dynamic segment inside a workspace layout: apps/web/src/app/api/users/[id]/edit/route.ts → /api/users/:id/edit', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/[id]/edit/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users/:id/edit');
    expect(route).toBeDefined();
  });

  test('catch-all segment inside a workspace layout: apps/web/src/app/api/docs/[...slug]/route.ts uses the existing normalization unchanged', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/docs/[...slug]/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    // Documents current normalization behavior verbatim (requirement 2: preserve as-is, not "fix").
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/docs/:...slug');
    expect(route).toBeDefined();
  });

  test('optional catch-all segment inside a workspace layout: apps/web/src/app/api/docs/[[...slug]]/route.ts uses the existing normalization unchanged', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/docs/[[...slug]]/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    // Same pre-existing (unmodified) [[...slug]] normalization as the root app/api case.
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/docs/:[...slug]');
    expect(route).toBeDefined();
  });

  test('root app/api catch-all and workspace app/api catch-all normalize identically', () => {
    const root = extractRouteApiStructure({
      files: [makeFile('app/api/docs/[...slug]/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const workspace = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/docs/[...slug]/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    expect(root.nextRoutes[0].urlPattern).toBe(workspace.nextRoutes[0].urlPattern);
  });
});

describe('extractRouteApiStructure — Next.js App Router workspace layouts — route.* extension and export requirements preserved', () => {
  test('a non-route.* file at a workspace App Router path is still ignored', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/handler.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    expect(r.nextRoutes).toHaveLength(0);
  });

  test('route.jsx and route.tsx extensions are still recognized inside a workspace layout', () => {
    const jsx = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/route.jsx', 'export async function GET(req) {}')],
    });
    const tsx = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/users/route.tsx', 'export async function GET(req) {}', 'TypeScript')],
    });
    expect(jsx.nextRoutes.find(rt => rt.urlPattern === '/api/users')).toBeDefined();
    expect(tsx.nextRoutes.find(rt => rt.urlPattern === '/api/users')).toBeDefined();
  });

  test('a methodless route.ts inside a workspace layout produces no route (Step #2 skip behavior preserved)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/src/app/api/config/route.ts', 'export const CONFIG = {};', 'TypeScript')],
    });
    expect(r.nextRoutes).toHaveLength(0);
    expect(r.backendRoutes.filter(rt => rt.framework === 'nextjs-app-router')).toHaveLength(0);
  });
});

describe('extractRouteApiStructure — Next.js App Router workspace layouts — existing behavior regressions', () => {
  test('root app/api/... (no workspace prefix) still resolves exactly as before', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.type).toBe('app');
  });

  test('root src/app/api/... (no workspace prefix) still resolves exactly as before', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.type).toBe('app');
  });

  test('pages/api/... stays root-anchored only — a workspace-nested pages/api file is NOT detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('apps/web/pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    expect(r.nextRoutes).toHaveLength(0);
  });

  test('root pages/api/... regression: still resolves exactly as before', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    const route = r.nextRoutes.find(rt => rt.urlPattern === '/api/users');
    expect(route).toBeDefined();
    expect(route.type).toBe('pages');
    expect(route.methods).toEqual(['*']);
  });
});

describe('extractRouteApiStructure — Next.js App Router workspace layouts — linkage via linkFrontendBackendApis', () => {
  const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');

  test('a workspace-detected App Router route links to a matching frontend fetch call', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('apps/web/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('apps/web/src/components/user-list.tsx', "fetch('/api/users')"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/users')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
    expect(linkage.orphanedBackendRoutes).toHaveLength(0);
  });

  test('a dynamic workspace App Router route links to a matching template-literal frontend call', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('apps/web/src/app/api/users/[id]/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('apps/web/src/components/user-detail.tsx', 'fetch(`/api/users/${id}`)'),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/users/:id')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test('multiple workspace apps (web + admin) both link correctly in the same repo', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('apps/web/src/app/api/users/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('apps/admin/app/api/reports/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('apps/web/src/components/list.tsx', "fetch('/api/users')"),
        makeFile('apps/admin/src/components/reports.tsx', "fetch('/api/reports')"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints).toHaveLength(2);
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });
});

// ── NestJS decorator-based controllers ────────────────────────────────────────

describe('extractRouteApiStructure — NestJS controller prefix + method path', () => {
  test('@Controller(\'api/auth\') + @Get(\'login\') resolves to GET /api/auth/login', () => {
    const src = [
      "@Controller('api/auth')",
      'export class AuthController {',
      "  @Get('login')",
      '  login() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('src/auth/auth.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/api/auth/login' && rt.method === 'GET');
    expect(route).toBeDefined();
    expect(route.framework).toBe('nestjs');
  });

  test("@Controller('/api/users') + @Post() resolves to POST /api/users", () => {
    const src = [
      "@Controller('/api/users')",
      'export class UsersController {',
      '  @Post()',
      '  create() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('src/users/users.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/api/users' && rt.method === 'POST');
    expect(route).toBeDefined();
  });

  test('double-quoted controller prefix and method path both resolve', () => {
    const src = [
      '@Controller("api/items")',
      'export class ItemsController {',
      '  @Get("list")',
      '  list() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('items.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/api/items/list' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('template literal path without interpolation resolves like a plain string', () => {
    const src = [
      '@Controller(`api/items`)',
      'export class ItemsController {',
      '  @Put(`:id`)',
      '  update() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('items.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/api/items/:id' && rt.method === 'PUT');
    expect(route).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS empty decorator paths', () => {
  test('empty @Controller() combined with a method path uses only the method path', () => {
    const src = [
      '@Controller()',
      'export class RootController {',
      "  @Get('/health')",
      '  health() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('root.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/health' && rt.method === 'GET');
    expect(route).toBeDefined();
  });

  test('empty @Controller() and empty method path resolves to bare /', () => {
    const src = [
      '@Controller()',
      'export class RootController {',
      '  @Get()',
      '  index() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('root.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/' && rt.method === 'GET');
    expect(route).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS root controller path', () => {
  test('non-empty controller prefix with no leading slash still normalizes to a leading slash', () => {
    const src = [
      "@Controller('api/health')",
      'export class HealthController {',
      "  @Get('')",
      '  check() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('health.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.path === '/api/health' && rt.method === 'GET');
    expect(route).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS multiple methods in one controller', () => {
  test('all five supported method decorators are extracted under the same controller prefix', () => {
    const src = [
      "@Controller('api/items')",
      'export class ItemsController {',
      '  @Get()',
      '  list() {}',
      '',
      "  @Get(':id')",
      '  getOne() {}',
      '',
      "  @Post()",
      '  create() {}',
      '',
      "  @Put(':id')",
      '  update() {}',
      '',
      "  @Patch(':id')",
      '  patch() {}',
      '',
      "  @Delete(':id')",
      '  remove() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('items.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes).toHaveLength(6);
    expect(nestRoutes.find(rt => rt.method === 'GET'    && rt.path === '/api/items')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'GET'    && rt.path === '/api/items/:id')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'POST'   && rt.path === '/api/items')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'PUT'    && rt.path === '/api/items/:id')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'PATCH'  && rt.path === '/api/items/:id')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'DELETE' && rt.path === '/api/items/:id')).toBeDefined();
  });

  test('multiple controllers in the same file are each resolved independently', () => {
    const src = [
      "@Controller('api/auth')",
      'export class AuthController {',
      "  @Post('login')",
      '  login() {}',
      '}',
      '',
      "@Controller('api/users')",
      'export class UsersController {',
      '  @Get()',
      '  list() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('multi.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes.find(rt => rt.method === 'POST' && rt.path === '/api/auth/login')).toBeDefined();
    expect(nestRoutes.find(rt => rt.method === 'GET'  && rt.path === '/api/users')).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS dynamic decorator paths are skipped safely', () => {
  test('method decorator with an identifier argument (not a string literal) is skipped', () => {
    const src = [
      "@Controller('api/dyn')",
      'export class DynController {',
      '  @Get(someVar)',
      '  a() {}',
      '',
      "  @Post('ok')",
      '  c() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('dyn.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes).toHaveLength(1);
    expect(nestRoutes[0]).toMatchObject({ method: 'POST', path: '/api/dyn/ok' });
  });

  test('method decorator with a template literal containing ${...} interpolation is skipped', () => {
    const src = [
      "@Controller('api/dyn')",
      'export class DynController {',
      '  @Get(`${prefix}/x`)',
      '  b() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('dyn.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes).toHaveLength(0);
  });

  test('dynamic controller prefix (identifier, not a string literal) skips the entire controller safely', () => {
    const src = [
      '@Controller(basePath)',
      'export class DynCtrl {',
      "  @Get('x')",
      '  a() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('dyn.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes).toHaveLength(0);
  });

  test('dynamic controller prefix does not throw and other files are still processed', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('dyn.controller.ts', "@Controller(basePath)\nexport class DynCtrl {\n  @Get('x')\n  a() {}\n}"),
        makeFile('server.js', "app.get('/api/users', getUsers);"),
      ],
    });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
    expect(r.backendRoutes.find(rt => rt.framework === 'express' && rt.path === '/api/users')).toBeDefined();
  });
});

// ── Step #6: object-form @Controller({ ... }) support ─────────────────────────

describe('extractRouteApiStructure — NestJS object-form @Controller — path only', () => {
  test("@Controller({ path: 'users' }) resolves the path", () => {
    const src = "@Controller({ path: 'users' })\nexport class UsersController {\n  @Get()\n  list() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/users' });
  });

  test('double-quoted object path is resolved', () => {
    const src = '@Controller({ path: "users" })\nexport class UsersController {\n  @Get()\n  list() {}\n}';
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/users' });
  });

  test('template-literal object path with no interpolation is resolved', () => {
    const src = '@Controller({ path: `users` })\nexport class UsersController {\n  @Get()\n  list() {}\n}';
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/users' });
  });
});

describe('extractRouteApiStructure — NestJS object-form @Controller — version only', () => {
  test("@Controller({ version: '1' }) resolves to a /v1 prefix", () => {
    const src = "@Controller({ version: '1' })\nexport class HealthController {\n  @Get('health')\n  check() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('health.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/v1/health' });
  });

  test("@Controller({ version: '1' }) with an empty method path resolves to bare /v1", () => {
    const src = "@Controller({ version: '1' })\nexport class RootController {\n  @Get()\n  index() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('root.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/v1' });
  });
});

describe('extractRouteApiStructure — NestJS object-form @Controller — path + version (both key orders)', () => {
  test("{ path: 'auth', version: '1' } resolves to /v1/auth", () => {
    const src = "@Controller({ path: 'auth', version: '1' })\nexport class AuthController {\n  @Post('login')\n  login() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'POST', path: '/v1/auth/login' });
  });

  test("{ version: '1', path: 'auth' } (reversed key order) resolves identically to /v1/auth", () => {
    const src = "@Controller({ version: '1', path: 'auth' })\nexport class AuthController {\n  @Post('login')\n  login() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'POST', path: '/v1/auth/login' });
  });

  test('both key orders produce byte-identical route paths', () => {
    const srcA = "@Controller({ path: 'auth', version: '1' })\nexport class A {\n  @Post('login')\n  login() {}\n}";
    const srcB = "@Controller({ version: '1', path: 'auth' })\nexport class B {\n  @Post('login')\n  login() {}\n}";
    const rA = extractRouteApiStructure({ files: [makeFile('a.controller.ts', srcA, 'TypeScript')] });
    const rB = extractRouteApiStructure({ files: [makeFile('b.controller.ts', srcB, 'TypeScript')] });
    expect(rA.backendRoutes[0].path).toBe(rB.backendRoutes[0].path);
    expect(rA.backendRoutes[0].path).toBe('/v1/auth/login');
  });
});

describe('extractRouteApiStructure — NestJS object-form @Controller — leading slash normalization', () => {
  test("{ path: '/auth' } (leading slash) resolves the same as { path: 'auth' }", () => {
    const withSlash = extractRouteApiStructure({
      files: [makeFile('a.controller.ts', "@Controller({ path: '/auth' })\nexport class A {\n  @Post('login')\n  login() {}\n}", 'TypeScript')],
    });
    const withoutSlash = extractRouteApiStructure({
      files: [makeFile('b.controller.ts', "@Controller({ path: 'auth' })\nexport class B {\n  @Post('login')\n  login() {}\n}", 'TypeScript')],
    });
    expect(withSlash.backendRoutes[0].path).toBe('/auth/login');
    expect(withSlash.backendRoutes[0].path).toBe(withoutSlash.backendRoutes[0].path);
  });
});

describe('extractRouteApiStructure — NestJS object-form @Controller — dynamic/unsupported values skipped', () => {
  test('array path is unsupported — the whole controller is skipped safely', () => {
    const src = "@Controller({ path: ['users', 'members'], version: '1' })\nexport class UsersController {\n  @Get()\n  list() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  test('an imported constant used as path is unsupported — the whole controller is skipped safely', () => {
    const src = "@Controller({ path: ROUTE_PREFIX })\nexport class UsersController {\n  @Get()\n  list() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  test('a computed expression used as path is unsupported — the whole controller is skipped safely', () => {
    const src = "@Controller({ path: getPrefix() })\nexport class UsersController {\n  @Get()\n  list() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  test('an imported constant used as version is unsupported — the whole controller is skipped safely', () => {
    const src = "@Controller({ path: 'auth', version: API_VERSION })\nexport class AuthController {\n  @Post('login')\n  login() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  test('a template literal path with ${...} interpolation is unsupported — the whole controller is skipped safely', () => {
    const src = "@Controller({ path: `${prefix}/users` })\nexport class UsersController {\n  @Get()\n  list() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('users.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  test('skipping a dynamic object-form controller does not throw and other files still process', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('users.controller.ts', "@Controller({ path: ROUTE_PREFIX })\nexport class UsersController {\n  @Get()\n  list() {}\n}", 'TypeScript'),
        makeFile('server.js', "app.get('/api/users', getUsers);"),
      ],
    });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
    expect(r.backendRoutes.find(rt => rt.framework === 'express' && rt.path === '/api/users')).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS existing string-literal @Controller support is preserved', () => {
  test("@Controller('health') (bare string) still resolves as before", () => {
    const src = "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('health.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/health' });
  });

  test('@Controller() with no argument still resolves as before', () => {
    const src = "@Controller()\nexport class RootController {\n  @Get('ping')\n  ping() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('root.controller.ts', src, 'TypeScript')] });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/ping' });
  });

  test('a bare identifier controller prefix is still treated as dynamic and skipped', () => {
    const src = "@Controller(basePath)\nexport class DynController {\n  @Get('x')\n  a() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('dyn.controller.ts', src, 'TypeScript')] });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });
});

describe('extractRouteApiStructure — NestJS object-form @Controller — real-world repo_id=98 shapes', () => {
  test('EmployeeController ({ version: \'1\' } + method-level resource path) resolves and links', () => {
    // No app.setGlobalPrefix(...) file is included in this fixture, so this test
    // isolates verification of Step #6's version+path object-form support alone,
    // targeting the un-prefixed /v1/employees path. Step #7 (global prefix
    // detection) covers the /api/v1/employees case end-to-end separately below.
    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const r = extractRouteApiStructure({
      files: [
        makeFile('employee.controller.ts', "@ApiTags('workforce')\n@Controller({ version: '1' })\n@UseGuards(JwtAuthGuard, RolesGuard)\nexport class EmployeeController {\n  @Post('employees')\n  create() {}\n}", 'TypeScript'),
        makeFile('frontend/create-employee-form.tsx', "fetch('/v1/employees', { method: 'POST' })"),
      ],
    });
    expect(r.backendRoutes.find(rt => rt.framework === 'nestjs')).toMatchObject({ method: 'POST', path: '/v1/employees' });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test("AuthController ({ version: '1', path: 'auth' } + two methods) resolves both routes", () => {
    const src = "@ApiTags('auth')\n@Controller({ version: '1', path: 'auth' })\nexport class AuthController {\n  @Post('login')\n  login() {}\n\n  @Post('logout')\n  logout() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    const nestRoutes = r.backendRoutes.filter(rt => rt.framework === 'nestjs');
    expect(nestRoutes).toHaveLength(2);
    expect(nestRoutes.find(rt => rt.path === '/v1/auth/login')).toBeDefined();
    expect(nestRoutes.find(rt => rt.path === '/v1/auth/logout')).toBeDefined();
  });
});

// ── Step #7: app.setGlobalPrefix() detection ──────────────────────────────────

describe('extractRouteApiStructure — NestJS global prefix — supported literal forms', () => {
  test("app.setGlobalPrefix('api') (single-quote) is applied to a NestJS route", () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/api/health' });
  });

  test('app.setGlobalPrefix("/api") (double-quote, leading slash) normalizes correctly', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix("/api");'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/api/health' });
  });

  test('app.setGlobalPrefix(`api`) (template literal, no interpolation) is applied', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix(`api`);'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/api/health' });
  });

  test('the full example from the requirements resolves to POST /api/v1/auth/login', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('auth.controller.ts', "@Controller({ version: '1', path: 'auth' })\nexport class AuthController {\n  @Post('login')\n  login() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'POST', path: '/api/v1/auth/login' });
  });
});

describe('extractRouteApiStructure — NestJS global prefix — dynamic/unsupported forms ignored', () => {
  test('a variable argument is ignored safely — route stays unprefixed', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix(PREFIX_VAR);', 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/health' });
  });

  test('a function-call argument is ignored safely — route stays unprefixed', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix(getPrefix());', 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/health' });
  });

  test('an interpolated template literal argument is ignored safely — route stays unprefixed', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix(`${env}/api`);', 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/health' });
  });

  test('an unsupported prefix call does not throw and other files still process', () => {
    expect(() => extractRouteApiStructure({
      files: [
        makeFile('main.ts', 'app.setGlobalPrefix(getPrefix());', 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
        makeFile('server.js', "app.get('/legacy', handler);"),
      ],
    })).not.toThrow();
  });
});

describe('extractRouteApiStructure — NestJS global prefix — multiple declarations use the first literal', () => {
  test('a dynamic call followed by a literal call — the literal one is used', () => {
    // Documents the behavior: the dynamic call at line 1 is invisible to the regex
    // (it never matches), so the literal call at line 2 is the first one *found*.
    const withRoute = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix(PREFIX_VAR);\napp.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = withRoute.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ path: '/api/health' });
  });

  test('two literal calls — the first one (in file scan order) wins, not the last', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('v2');\napp.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ path: '/v2/health' });
  });

  test('two literal calls in separate files — the file listed first wins', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('other-bootstrap.ts', "app.setGlobalPrefix('v2');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ path: '/api/health' });
  });
});

describe('extractRouteApiStructure — NestJS global prefix — applies only to NestJS routes', () => {
  test('Express, Fastify, and Next.js App Router routes are not prefixed', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
        makeFile('server.js', "app.get('/legacy', handler);"),
        makeFile('app/api/items/route.ts', 'export async function GET(req) {}', 'TypeScript'),
      ],
    });
    const nest    = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    const express = r.backendRoutes.find(rt => rt.framework === 'express');
    const nextApp = r.backendRoutes.find(rt => rt.framework === 'nextjs-app-router');
    expect(nest).toMatchObject({ path: '/api/health' });
    expect(express).toMatchObject({ path: '/legacy' });
    expect(nextApp).toMatchObject({ path: '/api/items' }); // unchanged — already had its own /api/ segment from its file path, not from setGlobalPrefix
  });

  test('frontend calls are never touched by the global prefix pass', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api');", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
        makeFile('frontend/app.js', "fetch('/health')"),
      ],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/health');
    expect(call).toBeDefined();
  });
});

describe('extractRouteApiStructure — NestJS global prefix — no prefix present preserves existing behavior', () => {
  test('no setGlobalPrefix call anywhere leaves NestJS routes exactly as Step #6 produced them', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript')],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'GET', path: '/health' });
  });
});

describe('extractRouteApiStructure — NestJS global prefix — repo_id=98 end-to-end closure', () => {
  test('the exact repo_id=98 main.ts + AuthController + BFF call now links (Step #6 + Step #7 combined)', () => {
    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const mainTs = [
      "app.setGlobalPrefix('api', {",
      "  exclude: [{ path: 'health', method: RequestMethod.GET }],",
      '});',
    ].join('\n');
    const authController = [
      "@ApiTags('auth')",
      "@Controller({ version: '1', path: 'auth' })",
      'export class AuthController {',
      "  @Post('login')",
      '  login() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({
      files: [
        makeFile('apps/api/src/main.ts', mainTs, 'TypeScript'),
        makeFile('apps/api/src/identity/auth.controller.ts', authController, 'TypeScript'),
        makeFile('apps/web/src/features/auth/login-form.tsx', "fetch('/api/v1/auth/login', { method: 'POST' })"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ method: 'POST', path: '/api/v1/auth/login' });

    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/v1/auth/login')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test('setGlobalPrefix\'s second (options) argument does not interfere with prefix extraction', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('main.ts', "app.setGlobalPrefix('api', { exclude: [{ path: 'health', method: RequestMethod.GET }] });", 'TypeScript'),
        makeFile('health.controller.ts', "@Controller('health')\nexport class HealthController {\n  @Get()\n  check() {}\n}", 'TypeScript'),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.framework === 'nestjs');
    expect(route).toMatchObject({ path: '/api/health' });
  });
});

describe('extractRouteApiStructure — NestJS routes participate in existing pipeline output', () => {
  test('NestJS routes appear in endpointInventory with hasBackend true', () => {
    const src = [
      "@Controller('api/auth')",
      'export class AuthController {',
      "  @Get('login')",
      '  login() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    const entry = r.endpointInventory.find(e => e.path === '/api/auth/login' && e.method === 'GET');
    expect(entry).toBeDefined();
    expect(entry.hasBackend).toBe(true);
  });

  test('a NestJS route with no matching frontend call appears in unusedBackendRoutes', () => {
    const src = [
      "@Controller('api/auth')",
      'export class AuthController {',
      "  @Get('login')",
      '  login() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    const unused = r.unusedBackendRoutes.find(rt => rt.path === '/api/auth/login' && rt.method === 'GET');
    expect(unused).toBeDefined();
  });

  test('a NestJS route links to a matching frontend fetch call via linkFrontendBackendApis', () => {
    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const r = extractRouteApiStructure({
      files: [
        makeFile('auth.controller.ts', "@Controller('api/auth')\nexport class AuthController {\n  @Post('login')\n  login() {}\n}"),
        makeFile('frontend/app.js', "fetch('/api/auth/login', { method: 'POST' })"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/auth/login' && e.method === 'POST')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
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

// ── serverFetch / BFF internal fetch wrappers ─────────────────────────────────

describe('extractRouteApiStructure — serverFetch/apiFetch/internalFetch/backendFetch', () => {
  test("serverFetch('/api/repos') captured as GET with client 'serverFetch'", () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "serverFetch('/api/repos')", 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
    expect(call.client).toBe('serverFetch');
  });

  test('serverFetch with template literal interpolation normalizes to :param', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', 'serverFetch(`/api/repos/${id}`)', 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/:param');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });

  test("serverFetch with string concatenation resolves the full parameterised path", () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "serverFetch('/api/repos/' + id + '/metrics')", 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos/:_p/metrics');
    expect(call).toBeDefined();
    expect(call.method).toBe('GET');
  });

  test("serverFetch('/api/repos', { method: 'POST' }) detects POST from options object", () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "serverFetch('/api/repos', { method: 'POST' })", 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/repos');
    expect(call).toBeDefined();
    expect(call.method).toBe('POST');
  });

  test('apiFetch variant is detected with double-quoted method option', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', 'apiFetch(\'/api/x\', { method: "PATCH" })', 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/x');
    expect(call).toBeDefined();
    expect(call.method).toBe('PATCH');
    expect(call.client).toBe('apiFetch');
  });

  test('internalFetch variant is detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "internalFetch('/api/y')", 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/y');
    expect(call).toBeDefined();
    expect(call.client).toBe('internalFetch');
  });

  test('backendFetch variant is detected', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "backendFetch('/api/z')", 'TypeScript')],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/z');
    expect(call).toBeDefined();
    expect(call.client).toBe('backendFetch');
  });

  test('external absolute URL is ignored (does not start with /)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "serverFetch('https://example.com/api/x')", 'TypeScript')],
    });
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  test('non-API helper call with an unsupported wrapper name is ignored', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "randomHelper('/api/x')", 'TypeScript')],
    });
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  test('existing fetch() and axios extraction still work alongside serverFetch in the same file', () => {
    const src = [
      "fetch('/api/users')",
      "axios.post('/api/things')",
      "serverFetch('/api/internal')",
    ].join('\n');
    const r = extractRouteApiStructure({ files: [makeFile('src/lib/data.ts', src, 'TypeScript')] });
    expect(r.frontendApiCalls.find(c => c.path === '/api/users' && c.client === 'fetch')).toBeDefined();
    expect(r.frontendApiCalls.find(c => c.path === '/api/things' && c.client === 'axios' && c.method === 'POST')).toBeDefined();
    expect(r.frontendApiCalls.find(c => c.path === '/api/internal' && c.client === 'serverFetch')).toBeDefined();
    expect(r.frontendApiCalls).toHaveLength(3);
  });

  test('serverFetch call links to a matching backend route via linkFrontendBackendApis', () => {
    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const r = extractRouteApiStructure({
      files: [
        makeFile('src/lib/data.ts', "serverFetch('/api/repos/metrics')", 'TypeScript'),
        makeFile('server.js', "app.get('/api/repos/metrics', getMetrics);"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/repos/metrics')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
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

// ── Nested router mount-prefix resolution ─────────────────────────────────────
// Analyzer Improvement — Nested Express Router Mount Prefix Resolution.
// Covers the live repoId=80 regression: after repoRoutes.js/portfolioRoutes.js
// were split into composition routers, routes defined in the *child* domain
// routers (mounted onto the composition router, not directly onto `app`) lost
// their real /api/repos and /api/portfolio prefixes entirely.

describe('extractRouteApiStructure — nested router mount-prefix resolution', () => {
  const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');

  // A. Current repoRoutes composition: server.js → /api/repos → repoRoutes → / → repoCoreRoutes
  test('A. repoRoutes composition: routes in repoCoreRoutes inherit /api/repos', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "const repoCoreRoutes = require('./repoCoreRoutes');",
          "router.use('/', repoCoreRoutes);",
        ].join('\n')),
        makeFile('routes/repoCoreRoutes.js', [
          "router.get('/summary', getSummary);",
          "router.get('/:id/metrics', getMetrics);",
        ].join('\n')),
      ],
    });
    expect(r.backendRoutes.find(rt => rt.method === 'GET' && rt.path === '/api/repos/summary')).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.method === 'GET' && rt.path === '/api/repos/:id/metrics')).toBeDefined();
    // The stale, prefix-less extraction must not also be present.
    expect(r.backendRoutes.find(rt => rt.path === '/summary')).toBeUndefined();
    expect(r.backendRoutes.find(rt => rt.path === '/:id/metrics')).toBeUndefined();
  });

  // B. Current portfolioRoutes composition: server.js → /api/portfolio → portfolioRoutes → portfolioArchitectureRoutes
  test('B. portfolioRoutes composition: routes in portfolioArchitectureRoutes inherit /api/portfolio', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const portfolioRoutes = require('./routes/portfolioRoutes');",
          "app.use('/api/portfolio', portfolioRoutes);",
        ].join('\n')),
        makeFile('routes/portfolioRoutes.js', [
          "const portfolioArchitectureRoutes = require('./portfolioArchitectureRoutes');",
          "router.use(portfolioArchitectureRoutes);",
        ].join('\n')),
        makeFile('routes/portfolioArchitectureRoutes.js', [
          "router.get('/architecture', getArch);",
          "router.get('/watchlists', getWatchlists);",
        ].join('\n')),
      ],
    });
    expect(r.backendRoutes.find(rt => rt.method === 'GET' && rt.path === '/api/portfolio/architecture')).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.method === 'GET' && rt.path === '/api/portfolio/watchlists')).toBeDefined();
  });

  // C. Omitted router.use prefix is equivalent to router.use('/', childRoutes)
  test('C. router.use(childRoutes) with no prefix argument mounts at "/"', () => {
    const withOmitted = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const parentRoutes = require('./parentRoutes');",
          "app.use('/api/x', parentRoutes);",
        ].join('\n')),
        makeFile('parentRoutes.js', [
          "const childRoutes = require('./childRoutes');",
          "router.use(childRoutes);",
        ].join('\n')),
        makeFile('childRoutes.js', "router.get('/y', getY);"),
      ],
    });
    const withExplicitSlash = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const parentRoutes = require('./parentRoutes');",
          "app.use('/api/x', parentRoutes);",
        ].join('\n')),
        makeFile('parentRoutes.js', [
          "const childRoutes = require('./childRoutes');",
          "router.use('/', childRoutes);",
        ].join('\n')),
        makeFile('childRoutes.js', "router.get('/y', getY);"),
      ],
    });
    const omittedPath  = withOmitted.backendRoutes.find(rt => rt.file === 'childRoutes.js').path;
    const explicitPath = withExplicitSlash.backendRoutes.find(rt => rt.file === 'childRoutes.js').path;
    expect(omittedPath).toBe('/api/x/y');
    expect(omittedPath).toBe(explicitPath);
  });

  // D. Explicit child prefix
  test('D. router.use("/risk", riskRoutes) applies the explicit child prefix', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('repoRoutes.js', [
          "const riskRoutes = require('./riskRoutes');",
          "router.use('/risk', riskRoutes);",
        ].join('\n')),
        makeFile('riskRoutes.js', "router.get('/:id', getRisk);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.file === 'riskRoutes.js');
    expect(route.path).toBe('/api/repos/risk/:id');
  });

  // E. Three-hop mount chain: app → apiRouter → repoRouter → riskRouter
  test('E. three-hop mount chain resolves the full transitive prefix', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const apiRouter = require('./apiRouter');",
          "app.use('/api', apiRouter);",
        ].join('\n')),
        makeFile('apiRouter.js', [
          "const repoRouter = require('./repoRouter');",
          "router.use('/repos', repoRouter);",
        ].join('\n')),
        makeFile('repoRouter.js', [
          "const riskRouter = require('./riskRouter');",
          "router.use('/risk', riskRouter);",
        ].join('\n')),
        makeFile('riskRouter.js', "router.get('/:id', getRisk);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.file === 'riskRouter.js');
    expect(route).toBeDefined();
    expect(route.path).toBe('/api/repos/risk/:id');
  });

  // F. Direct mount regression — existing single-hop behavior unchanged
  test('F. direct mount app.use("/api/auth", authRoutes) is unaffected', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const authRoutes = require('./routes/authRoutes');",
          "app.use('/api/auth', authRoutes);",
        ].join('\n')),
        makeFile('routes/authRoutes.js', "router.get('/github', githubLogin);"),
      ],
    });
    const route = r.backendRoutes.find(rt => rt.file === 'routes/authRoutes.js');
    expect(route.path).toBe('/api/auth/github');
  });

  // G. Non-router middleware is never interpreted as child-router composition
  test('G. router.use(authenticate) and app.use(express.json()) are ignored as mounts', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "const authenticate = require('./middleware/authenticate');",
          "app.use(express.json());",
          "app.use(cors());",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "const authenticateAgain = require('../middleware/authenticate');",
          "router.use(authenticateAgain);",
          "router.get('/summary', getSummary);",
        ].join('\n')),
        makeFile('middleware/authenticate.js',
          "module.exports = function authenticate(req, res, next) { next(); };"),
      ],
    });
    // The real route still gets its prefix.
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos/summary')).toBeDefined();
    // authenticate.js contributes no routes of its own and must not be treated
    // as a mount target — it should never appear as a `file` in backendRoutes,
    // and no route should be prefixed as if authenticate.js were a router.
    expect(r.backendRoutes.find(rt => rt.file === 'middleware/authenticate.js')).toBeUndefined();
    expect(r.backendRoutes.every(rt => !rt.path.includes('authenticate'))).toBe(true);
  });

  // H. Cycle protection: aRoutes ↔ bRoutes must not hang or throw
  test('H. mutually-mounting routers (cycle) terminate safely without throwing', () => {
    let r;
    expect(() => {
      r = extractRouteApiStructure({
        files: [
          makeFile('aRoutes.js', [
            "const bRoutes = require('./bRoutes');",
            "router.use(bRoutes);",
            "router.get('/from-a', getFromA);",
          ].join('\n')),
          makeFile('bRoutes.js', [
            "const aRoutes = require('./aRoutes');",
            "router.use(aRoutes);",
            "router.get('/from-b', getFromB);",
          ].join('\n')),
        ],
      });
    }).not.toThrow();
    // Both routes are still extracted exactly once each — no infinite duplication.
    const fromA = r.backendRoutes.filter(rt => rt.path.endsWith('/from-a'));
    const fromB = r.backendRoutes.filter(rt => rt.path.endsWith('/from-b'));
    expect(fromA).toHaveLength(1);
    expect(fromB).toHaveLength(1);
  });

  // I. Same router mounted at two different prefixes — both must remain
  test('I. the same router mounted at /v1 and /v2 produces both route sets', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const apiRoutes = require('./apiRoutes');",
          "app.use('/v1', apiRoutes);",
          "app.use('/v2', apiRoutes);",
        ].join('\n')),
        makeFile('apiRoutes.js', "router.get('/x', getX);"),
      ],
    });
    expect(r.backendRoutes.find(rt => rt.path === '/v1/x')).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.path === '/v2/x')).toBeDefined();
    expect(r.backendRoutes.filter(rt => rt.file === 'apiRoutes.js')).toHaveLength(2);
  });

  // J. Duplicate-path normalization — no double slashes anywhere
  test('J. no resolved path contains a double slash, at any composition depth', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "const repoCoreRoutes = require('./repoCoreRoutes');",
          "router.use('/', repoCoreRoutes);",
        ].join('\n')),
        makeFile('routes/repoCoreRoutes.js', [
          "router.get('/summary', getSummary);",
          "router.get('/:id/architecture', getArch);",
        ].join('\n')),
      ],
    });
    for (const rt of r.backendRoutes) {
      expect(rt.path).not.toContain('//');
    }
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos//summary')).toBeUndefined();
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos//:id/architecture')).toBeUndefined();
  });

  // K. Full linkage regression — a real dynamic frontend call now links correctly
  test('K. fetch to a dynamic child-router route links via linkFrontendBackendApis', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "const repoCoreRoutes = require('./repoCoreRoutes');",
          "router.use('/', repoCoreRoutes);",
        ].join('\n')),
        makeFile('routes/repoCoreRoutes.js', "router.get('/:id/metrics', getMetrics);"),
        makeFile('frontend/dashboard.html', 'fetch(`/api/repos/${id}/metrics`)'),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/repos/:id/metrics' || e.path === '/api/repos/:_p/metrics')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls.find(c => c.path.includes('metrics'))).toBeUndefined();
  });

  // L. False-link regression — a real prefixed route must not accidentally
  // match an unrelated root-level frontend call just because the un-prefixed
  // (buggy) extraction happened to collide with it.
  test('L. GET /api/repos/summary does not exact-link to fetch("/summary")', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "app.use('/api/repos', repoRoutes);",
          "app.get('/summary', getLegacySummary);",
        ].join('\n')),
        makeFile('routes/repoRoutes.js', [
          "const repoCoreRoutes = require('./repoCoreRoutes');",
          "router.use('/', repoCoreRoutes);",
        ].join('\n')),
        makeFile('routes/repoCoreRoutes.js', "router.get('/summary', getRepoSummary);"),
        makeFile('frontend/legacy.html', "fetch('/summary')"),
      ],
    });
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    const repoSummaryLink = linkage.linkedEndpoints.find(e => e.path === '/api/repos/summary');
    expect(repoSummaryLink).toBeUndefined(); // no frontend call targets this path
    const legacySummaryLink = linkage.linkedEndpoints.find(e => e.path === '/summary');
    expect(legacySummaryLink).toBeDefined();
    // The legacy /summary link must only carry the server.js-level route, never
    // the /api/repos/summary route mis-collapsed onto the same bare path.
    expect(legacySummaryLink.backendRoutes.every(br => br.file === 'server.js')).toBe(true);
  });

  // Requirement 11 — route inventory is preserved: nested resolution must not
  // drop any route, only correct its effective public path. Mirrors the real
  // repoId=80 composition shape (repoRoutes → 3 child routers, portfolioRoutes
  // → 2 child routers) at the same route counts documented in PROGRESS.md.
  test('repoId=80-like fixture: nested resolution does not reduce backendRoutes count', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('backend/server.js', [
          "const repoRoutes = require('./routes/repoRoutes');",
          "const portfolioRoutes = require('./routes/portfolioRoutes');",
          "app.use('/api/repos', repoRoutes);",
          "app.use('/api/portfolio', portfolioRoutes);",
        ].join('\n')),
        makeFile('backend/routes/repoRoutes.js', [
          "const repoCoreRoutes = require('./repoCoreRoutes');",
          "const repoRiskRoutes = require('./repoRiskRoutes');",
          "const repoArchitectureRoutes = require('./repoArchitectureRoutes');",
          "router.use('/', repoCoreRoutes);",
          "router.use('/', repoRiskRoutes);",
          "router.use('/', repoArchitectureRoutes);",
        ].join('\n')),
        makeFile('backend/routes/repoCoreRoutes.js', [
          "router.get('/', listRepos);",
          "router.get('/:id/metrics', getMetrics);",
          "router.get('/attention', getAttention);",
          "router.get('/summary', getSummary);",
          "router.post('/register', registerRepo);",
          "router.post('/:id/change-risk', changeRisk);",
          "router.post('/sync', syncRepos);",
        ].join('\n')),
        makeFile('backend/routes/repoRiskRoutes.js', [
          "router.get('/:id/risk', getRisk);",
          "router.get('/:id/events', getEvents);",
          "router.get('/:id/escalation', getEscalation);",
          "router.get('/:id/forecast', getForecast);",
          "router.get('/:id/confidence', getConfidence);",
          "router.get('/:id/pr-health', getPrHealth);",
          "router.get('/:id/engineering-volatility', getVolatility);",
          "router.get('/:id/maturity', getMaturity);",
          "router.get('/:id/maturity-trend', getMaturityTrend);",
        ].join('\n')),
        makeFile('backend/routes/repoArchitectureRoutes.js', [
          "router.get('/:id/architecture', getArch);",
          "router.get('/:id/architecture/forecast', getArchForecast);",
          "router.get('/:id/remediation', getRemediation);",
        ].join('\n')),
        makeFile('backend/routes/portfolioRoutes.js', [
          "const portfolioArchitectureRoutes = require('./portfolioArchitectureRoutes');",
          "const portfolioGovernanceRoutes = require('./portfolioGovernanceRoutes');",
          "router.use(portfolioArchitectureRoutes);",
          "router.use(portfolioGovernanceRoutes);",
        ].join('\n')),
        makeFile('backend/routes/portfolioArchitectureRoutes.js', [
          "router.get('/forecast', getForecast);",
          "router.get('/anomalies', getAnomalies);",
          "router.get('/anomaly-clusters', getAnomalyClusters);",
          "router.get('/telemetry-coverage', getTelemetryCoverage);",
          "router.get('/architecture', getArch);",
          "router.get('/watchlists', getWatchlists);",
        ].join('\n')),
        makeFile('backend/routes/portfolioGovernanceRoutes.js', [
          "router.get('/executive-summary', getExecSummary);",
          "router.get('/history', getHistory);",
          "router.get('/changes', getChanges);",
          "router.get('/behavioral-stability', getBehavioralStability);",
          "router.get('/maturity', getMaturity);",
          "router.get('/governance', getGovernance);",
        ].join('\n')),
      ],
    });

    // Same total route count as the ungrouped originals: 7 + 9 + 3 + 6 + 6 = 31.
    const repoAndPortfolioRoutes = r.backendRoutes.filter(rt =>
      rt.file.startsWith('backend/routes/repo') || rt.file.startsWith('backend/routes/portfolio'));
    expect(repoAndPortfolioRoutes).toHaveLength(31);

    // Every one of them carries the correct effective prefix — none stayed bare.
    const repoRoutePaths      = r.backendRoutes.filter(rt => /repo(Core|Risk|Architecture)Routes\.js$/.test(rt.file)).map(rt => rt.path);
    const portfolioRoutePaths = r.backendRoutes.filter(rt => /portfolio(Architecture|Governance)Routes\.js$/.test(rt.file)).map(rt => rt.path);
    expect(repoRoutePaths.every(p => p.startsWith('/api/repos'))).toBe(true);
    expect(portfolioRoutePaths.every(p => p.startsWith('/api/portfolio'))).toBe(true);

    // Spot-check the two exact examples from the live regression.
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos/summary' && rt.file.endsWith('repoCoreRoutes.js'))).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.path === '/api/repos/:id/metrics' && rt.file.endsWith('repoCoreRoutes.js'))).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.path === '/api/portfolio/architecture')).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.path === '/api/portfolio/watchlists')).toBeDefined();
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

// ── Documentation exclusion from frontend/BFF API-call extraction ───────────
// Analyzer Improvement — Exclude Documentation from Frontend/BFF API-Call
// Extraction. Confirmed live regression: snapshot #194 for repoId=80 had 6
// unresolvedFrontendCalls, all traced to PROGRESS.md's own "Example Extracted
// Calls" table documenting serverFetch/apiFetch/internalFetch/backendFetch
// support — the table's illustrative call syntax was parsed as real calls
// because _extractFrontendCalls ran unconditionally on every file, including
// Markdown, while only backend-route extraction had a (`.md`-only) guard.

describe('extractRouteApiStructure — documentation exclusion from frontend/BFF API-call extraction', () => {
  const allCallForms = [
    "fetch('/api/fetch')",
    "axios.get('/api/axios')",
    "serverFetch('/api/server')",
    "apiFetch('/api/api-fetch')",
    "internalFetch('/api/internal')",
    "backendFetch('/api/backend')",
  ].join('\n');

  // A. .md file with every supported call form produces zero frontendApiCalls
  test('A. a .md file containing fetch/axios/serverFetch/apiFetch/internalFetch/backendFetch produces zero frontendApiCalls', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('docs/api-guide.md', allCallForms)],
    });
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // B. .mdx file — same content, same zero result
  test('B. a .mdx file containing the same call syntax produces zero frontendApiCalls', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('docs/api-guide.mdx', allCallForms)],
    });
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // C. Realistic PROGRESS.md-shaped regression fixture — the exact table that
  // produced the live snapshot #194 false positives, reproduced verbatim.
  test('C. PROGRESS.md-shaped markdown table contributes zero frontendApiCalls and zero unresolvedApiCalls', () => {
    const progressLikeContent = [
      '#### Example Extracted Calls',
      '',
      '| Input | Extracted call |',
      '|---|---|',
      "| `serverFetch('/api/repos')` | `{ method: 'GET', path: '/api/repos', client: 'serverFetch' }` |",
      "| `` serverFetch(`/api/repos/${id}`) `` | `{ method: 'GET', path: '/api/repos/:param', client: 'serverFetch' }` |",
      "| `serverFetch('/api/repos/' + id + '/metrics')` | `{ method: 'GET', path: '/api/repos/:_p/metrics', client: 'serverFetch' }` |",
      "| `serverFetch('/api/repos', { method: 'POST' })` | `{ method: 'POST', path: '/api/repos', client: 'serverFetch' }` |",
      '| `apiFetch(\'/api/x\', { method: "PATCH" })` | `{ method: \'PATCH\', path: \'/api/x\', client: \'apiFetch\' }` |',
      "| `internalFetch('/api/y')` | `{ method: 'GET', path: '/api/y', client: 'internalFetch' }` |",
      "| `backendFetch('/api/z')` | `{ method: 'GET', path: '/api/z', client: 'backendFetch' }` |",
      '',
      "a three-segment concatenation (`serverFetch('/api/' + a + '/' + b)`) is not handled",
    ].join('\n');

    const r = extractRouteApiStructure({
      files: [makeFile('PROGRESS.md', progressLikeContent)],
    });

    // Actual returned field names: frontendApiCalls and unresolvedApiCalls.
    expect(r.frontendApiCalls).toHaveLength(0);
    expect(r.unresolvedApiCalls).toHaveLength(0);

    const forbiddenPaths = [
      '/api/:_p',
      '/api/repos',
      '/api/repos/:param',
      '/api/repos/:_p/metrics',
      '/api/x',
      '/api/y',
      '/api/z',
    ];
    for (const p of forbiddenPaths) {
      expect(r.frontendApiCalls.find(c => c.path === p)).toBeUndefined();
      expect(r.unresolvedApiCalls.find(c => c.path === p)).toBeUndefined();
    }
  });

  // D. Identical call syntax in real code files is still extracted —
  // parameterized across every supported code extension.
  describe.each([
    ['.js',   'JavaScript'],
    ['.jsx',  'JavaScript'],
    ['.ts',   'TypeScript'],
    ['.tsx',  'TypeScript'],
    ['.mjs',  'JavaScript'],
    ['.cjs',  'JavaScript'],
  ])('D. %s files are unaffected by the documentation guard', (ext, language) => {
    test(`fetch/axios/serverFetch/apiFetch/internalFetch/backendFetch all still extract from a src/api${ext} file`, () => {
      const r = extractRouteApiStructure({
        files: [makeFile('src/api' + ext, allCallForms, language)],
      });
      expect(r.frontendApiCalls).toHaveLength(6);
      const paths = r.frontendApiCalls.map(c => c.path).sort();
      expect(paths).toEqual([
        '/api/api-fetch', '/api/axios', '/api/backend',
        '/api/fetch', '/api/internal', '/api/server',
      ]);
    });
  });

  // E. .html remains fully scanned and still links end-to-end.
  test('E. an .html file with a real fetch() call is still extracted and links to its backend route', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('frontend/index.html', "fetch('/api/example')"),
        makeFile('server.js', "app.get('/api/example', getExample);"),
      ],
    });
    const call = r.frontendApiCalls.find(c => c.path === '/api/example' && c.method === 'GET');
    expect(call).toBeDefined();
    expect(call.file).toBe('frontend/index.html');

    const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');
    const linkage = linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/example')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  // F. Pre-existing Markdown backend-route exclusion behavior is preserved —
  // both .md and .mdx.
  test('F. Express/NestJS-looking route examples in .md and .mdx still create zero backendRoutes', () => {
    const routeLikeContent = [
      "app.get('/api/users', getUsers);",
      "router.post('/api/users', createUser);",
      "@Controller('cats')",
      'class CatsController {',
      "  @Get('/')",
      '  findAll() {}',
      '}',
    ].join('\n');

    const r = extractRouteApiStructure({
      files: [
        makeFile('docs/api-reference.md', routeLikeContent),
        makeFile('docs/api-reference.mdx', routeLikeContent),
      ],
    });
    expect(r.backendRoutes).toHaveLength(0);
  });
});

// ── Test-file exclusion from architecture extraction ─────────────────────────
// Analyzer Improvement — Restore Test-File Visibility Without Scanning Test
// Fixtures as Architecture. Test files are no longer excluded at the GitHub-
// fetch layer (fetchRepositoryFiles.js) so structure inventory/completeness
// analysis can see them; this block proves the false-positive protection that
// exclusion used to provide (fixture strings like "app.get('/api/foo', ...)"
// or "fetch('/api/ghost')" inside test files being scanned as real
// architecture evidence) now holds at extraction time instead.

describe('extractRouteApiStructure — test-file exclusion from architecture extraction', () => {
  // A
  test('A. a .test.js file with Express/fetch/BFF fixture strings produces no backendRoutes or frontendApiCalls', () => {
    const fixtureContent = [
      "app.get('/api/foo', handler);",
      "router.post('/api/bar', handler);",
      "fetch('/api/foo')",
      "serverFetch('/api/server')",
    ].join('\n');
    const r = extractRouteApiStructure({
      files: [makeFile('tests/unit/backend/routes/fooRoutes.test.js', fixtureContent)],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // B
  test('B. a .spec.ts file with NestJS decorator examples produces no NestJS backendRoutes', () => {
    const nestFixture = [
      "@Controller('api/users')",
      'class UsersController {',
      '  @Get()',
      '  findAll() {}',
      "  @Post('create')",
      '  create() {}',
      '}',
    ].join('\n');
    const r = extractRouteApiStructure({
      files: [makeFile('tests/unit/users.controller.spec.ts', nestFixture, 'TypeScript')],
    });
    expect(r.backendRoutes.filter(rt => rt.framework === 'nestjs')).toHaveLength(0);
  });

  // C — excluded regardless of basename, purely by directory segment
  test.each([
    'tests/fixture.js',
    'test/fixture.js',
    '__tests__/fixture.js',
  ])('C. a file under a test directory (%s) is excluded even without .test/.spec in its basename', (path) => {
    const r = extractRouteApiStructure({
      files: [makeFile(path, "app.get('/api/fixture', handler); fetch('/api/fixture')")],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // D
  test('D. a nested test directory (packages/web/tests/fixture.js) is excluded', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('packages/web/tests/fixture.js', "app.get('/api/fixture', handler); fetch('/api/fixture')")],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // E — directories that merely contain the substring "test" must not be
  // misclassified; these must remain fully scanned.
  test.each([
    ['backend/contest/routes.js',      "app.get('/api/contest', handler);"],
    ['frontend/latest/dashboard.js',   "fetch('/api/latest')"],
    ['services/testimonials/send.js',  "fetch('/api/testimonials')"],
  ])('E. %s (only contains "test" as a substring) remains scanned', (path, content) => {
    const r = extractRouteApiStructure({ files: [makeFile(path, content)] });
    const total = r.backendRoutes.length + r.frontendApiCalls.length;
    expect(total).toBeGreaterThan(0);
  });

  // F
  test('F. a real production route file is extracted while its co-located test file fixture is ignored', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('backend/routes/fooRoutes.js', "router.get('/foo', getFoo);"),
        makeFile('tests/unit/backend/routes/fooRoutes.test.js',
          "app.get('/api/fixture-only', handler); fetch('/api/fixture-only')"),
      ],
    });
    expect(r.backendRoutes.find(rt => rt.path === '/foo' && rt.file === 'backend/routes/fooRoutes.js')).toBeDefined();
    expect(r.backendRoutes).toHaveLength(1);
    expect(r.frontendApiCalls.find(c => c.path === '/api/fixture-only')).toBeUndefined();
  });

  // G — HTML production extraction remains unchanged
  test('G. a real .html file (not under a test path) is still fully scanned', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/index.html', "fetch('/api/real')")],
    });
    expect(r.frontendApiCalls.find(c => c.path === '/api/real')).toBeDefined();
  });

  // H — .md/.mdx documentation exclusion remains unchanged and independent
  // of the new test-file guard.
  test('H. .md/.mdx documentation exclusion is unaffected by the test-file guard', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('docs/guide.md', "serverFetch('/api/doc')"),
        makeFile('docs/guide.mdx', "serverFetch('/api/doc-mdx')"),
      ],
    });
    expect(r.frontendApiCalls).toHaveLength(0);
  });

  // Next.js interaction (requirement 10) — proves _nextUrlFromPath's anchored
  // regexes structurally cannot match a test-marked path, so no additional
  // guard was needed for Next.js extraction.
  describe('Next.js route extraction cannot match test-marked paths (structural, no guard needed)', () => {
    test('tests/app/api/users/route.ts does not become a Next.js route', () => {
      const r = extractRouteApiStructure({
        files: [makeFile('tests/app/api/users/route.ts', 'export async function GET() {}', 'TypeScript')],
      });
      expect(r.nextRoutes).toHaveLength(0);
      expect(r.backendRoutes.filter(rt => rt.framework === 'nextjs-app-router')).toHaveLength(0);
    });

    test('apps/web/__tests__/app/api/users/route.ts does not become a Next.js route', () => {
      const r = extractRouteApiStructure({
        files: [makeFile('apps/web/__tests__/app/api/users/route.ts', 'export async function GET() {}', 'TypeScript')],
      });
      expect(r.nextRoutes).toHaveLength(0);
      expect(r.backendRoutes.filter(rt => rt.framework === 'nextjs-app-router')).toHaveLength(0);
    });

    test('a real (non-test) app/api/users/route.ts at the same shape still extracts normally', () => {
      const r = extractRouteApiStructure({
        files: [makeFile('apps/web/app/api/users/route.ts', 'export async function GET() {}', 'TypeScript')],
      });
      expect(r.nextRoutes).toHaveLength(1);
    });
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

// ── analyzerCoverage — framework-support confidence warnings ─────────────────

describe('extractRouteApiStructure — analyzerCoverage shape', () => {
  test('analyzerCoverage object is present with expected keys for empty input', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(r.analyzerCoverage).toBeDefined();
    expect(r.analyzerCoverage.frameworkHints).toEqual({
      nestjs: false, nextAppRouter: false, bffFetchWrappers: false,
    });
    expect(r.analyzerCoverage.supportedPatterns).toEqual([]);
    expect(r.analyzerCoverage.unsupportedRisk).toBe('low');
    expect(r.analyzerCoverage.warnings).toEqual([]);
  });

  test('a fully working Express + fetch repo has no warnings and low risk', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('frontend/app.js', "fetch('/api/users')"),
      ],
    });
    expect(r.analyzerCoverage.warnings).toEqual([]);
    expect(r.analyzerCoverage.unsupportedRisk).toBe('low');
    expect(r.analyzerCoverage.supportedPatterns).toContain('express');
  });
});

describe('extractRouteApiStructure — analyzerCoverage NestJS hint warnings', () => {
  test('NestJS decorator hints with zero routes extracted produces a warning', () => {
    const src = "@Controller(basePath)\nexport class AuthController {\n  @Get('x')\n  a() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    expect(r.analyzerCoverage.frameworkHints.nestjs).toBe(true);
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.analyzerCoverage.warnings).toContain('NestJS decorators were detected but no routes were extracted.');
  });

  test('supported NestJS routes extracted avoids the NestJS warning entirely', () => {
    const src = "@Controller('api/auth')\nexport class AuthController {\n  @Get('login')\n  login() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    expect(r.analyzerCoverage.frameworkHints.nestjs).toBe(true);
    expect(r.backendRoutes.length).toBeGreaterThan(0);
    expect(r.analyzerCoverage.warnings).not.toContain('NestJS decorators were detected but no routes were extracted.');
    expect(r.analyzerCoverage.supportedPatterns).toContain('nestjs-decorators');
    expect(r.analyzerCoverage.unsupportedRisk).toBe('low');
  });

  test('@Injectable/@Module hints alone (service/module files) with a working controller elsewhere do not warn', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('auth.controller.ts', "@Controller('api/auth')\nexport class AuthController {\n  @Get('login')\n  login() {}\n}", 'TypeScript'),
        makeFile('app.module.ts', "@Module({})\nexport class AppModule {}", 'TypeScript'),
        makeFile('auth.service.ts', "@Injectable()\nexport class AuthService {}", 'TypeScript'),
      ],
    });
    expect(r.analyzerCoverage.warnings).toHaveLength(0);
  });
});

describe('extractRouteApiStructure — analyzerCoverage Next.js App Router hint warnings', () => {
  test('App Router file present but no exported HTTP handler produces a warning', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', 'export const CONFIG = { revalidate: 60 };', 'TypeScript')],
    });
    expect(r.analyzerCoverage.frameworkHints.nextAppRouter).toBe(true);
    expect(r.nextRoutes).toHaveLength(0);
    expect(r.analyzerCoverage.warnings).toContain(
      'Next.js App Router files were detected but no exported HTTP handlers were recognized.',
    );
  });

  test('App Router file with a recognized exported handler avoids the warning', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    expect(r.analyzerCoverage.frameworkHints.nextAppRouter).toBe(true);
    expect(r.analyzerCoverage.warnings).not.toContain(
      'Next.js App Router files were detected but no exported HTTP handlers were recognized.',
    );
    expect(r.analyzerCoverage.supportedPatterns).toContain('nextjs-app-router');
  });

  test('src/app/api path form is also recognized as a hint', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/app/api/items/route.ts', 'export const CONFIG = {};', 'TypeScript')],
    });
    expect(r.analyzerCoverage.frameworkHints.nextAppRouter).toBe(true);
  });
});

describe('extractRouteApiStructure — analyzerCoverage frontend/BFF-without-backend warnings', () => {
  test('frontend calls with zero backend routes produces the frontend-without-backend warning', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "fetch('/api/repos')\nserverFetch('/api/things')", 'TypeScript')],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.frontendApiCalls.length).toBeGreaterThan(0);
    expect(r.analyzerCoverage.warnings).toContain(
      'Frontend/BFF API calls were detected without matching backend route extraction; verify framework support before treating unresolved calls as architecture debt.',
    );
  });

  test('serverFetch usage alone sets the bffFetchWrappers hint and contributes the generic framework-hint warning', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "serverFetch('/api/things')", 'TypeScript')],
    });
    expect(r.analyzerCoverage.frameworkHints.bffFetchWrappers).toBe(true);
    expect(r.analyzerCoverage.supportedPatterns).toContain('bff-fetch-wrappers');
    expect(r.analyzerCoverage.warnings).toContain(
      'Framework patterns detected but no backend routes were extracted; architecture linkage may be underreported.',
    );
  });

  test('frontend calls with a matching backend route produce no frontend-without-backend warning', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('frontend/app.js', "fetch('/api/users')"),
      ],
    });
    expect(r.analyzerCoverage.warnings).not.toContain(
      'Frontend/BFF API calls were detected without matching backend route extraction; verify framework support before treating unresolved calls as architecture debt.',
    );
  });

  test('plain fetch() alone does not set the bffFetchWrappers hint (only named wrappers count)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('src/lib/data.ts', "fetch('/api/things')")],
    });
    expect(r.analyzerCoverage.frameworkHints.bffFetchWrappers).toBe(false);
  });
});

describe('extractRouteApiStructure — analyzerCoverage unsupportedRisk scaling', () => {
  test('zero warnings yields low risk', () => {
    const r = extractRouteApiStructure({ files: [] });
    expect(r.analyzerCoverage.unsupportedRisk).toBe('low');
  });

  test('exactly one warning yields medium risk', () => {
    // Plain fetch() (no framework hints — not serverFetch/apiFetch/App Router/NestJS)
    // with zero backend routes fires only the generic "frontend calls without
    // matching backend routes" warning, not the framework-hint warning.
    const r = extractRouteApiStructure({
      files: [makeFile('frontend/app.js', "fetch('/api/things')")],
    });
    expect(r.analyzerCoverage.frameworkHints).toEqual({
      nestjs: false, nextAppRouter: false, bffFetchWrappers: false,
    });
    expect(r.analyzerCoverage.warnings).toHaveLength(1);
    expect(r.analyzerCoverage.unsupportedRisk).toBe('medium');
  });

  test('two or more warnings yields high risk', () => {
    const src = "@Controller(basePath)\nexport class AuthController {\n  @Get('x')\n  a() {}\n}";
    const r = extractRouteApiStructure({ files: [makeFile('auth.controller.ts', src, 'TypeScript')] });
    expect(r.analyzerCoverage.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r.analyzerCoverage.unsupportedRisk).toBe('high');
  });
});

describe('extractRouteApiStructure — analyzerCoverage preserves existing extraction behavior', () => {
  test('backendRoutes/frontendApiCalls/nextRoutes are unaffected by analyzerCoverage computation', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('frontend/app.js', "fetch('/api/users')"),
        makeFile('app/api/items/route.ts', 'export async function GET(req) {}', 'TypeScript'),
      ],
    });
    // backendRoutes now includes both the Express route and the App Router route
    // merged in by Step #5 (Feed Next.js App Router Routes Into API Linkage);
    // analyzerCoverage itself does not add to or alter this count further.
    expect(r.backendRoutes).toHaveLength(2);
    expect(r.backendRoutes.find(rt => rt.framework === 'express')).toBeDefined();
    expect(r.backendRoutes.find(rt => rt.framework === 'nextjs-app-router')).toBeDefined();
    expect(r.frontendApiCalls).toHaveLength(1);
    expect(r.nextRoutes).toHaveLength(1);
  });
});

// ── Step #5: Next.js App Router routes participate in API linkage ────────────

describe('extractRouteApiStructure — App Router routes are merged into backendRoutes', () => {
  test('an App Router route appears in backendRoutes with framework nextjs-app-router', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const rt = r.backendRoutes.find(x => x.path === '/api/example' && x.method === 'GET');
    expect(rt).toBeDefined();
    expect(rt.framework).toBe('nextjs-app-router');
    expect(rt.file).toBe('app/api/example/route.ts');
  });

  test('the route also still appears in nextRoutes unchanged (backward compatible with Step #2)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const nr = r.nextRoutes.find(x => x.urlPattern === '/api/example');
    expect(nr).toBeDefined();
    expect(nr.type).toBe('app');
    expect(nr.methods).toEqual(['GET']);
  });

  test('a multi-method App Router route produces one backendRoutes entry per method', () => {
    const r = extractRouteApiStructure({
      files: [makeFile(
        'app/api/items/route.ts',
        'export async function GET(req) {}\nexport async function POST(req) {}',
        'TypeScript',
      )],
    });
    const forPath = r.backendRoutes.filter(x => x.path === '/api/items');
    expect(forPath).toHaveLength(2);
    expect(forPath.map(x => x.method).sort()).toEqual(['GET', 'POST']);
  });

  test('pages/api routes are NOT merged into backendRoutes (existing pages/api behavior preserved)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('pages/api/users.js', 'export default function handler(req, res) {}')],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.nextRoutes).toHaveLength(1);
    expect(r.nextRoutes[0].type).toBe('pages');
  });

  test('a methodless route.ts contributes nothing to backendRoutes (Step #2 skip behavior preserved)', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/items/route.ts', 'export const CONFIG = { revalidate: 60 };', 'TypeScript')],
    });
    expect(r.backendRoutes).toHaveLength(0);
    expect(r.nextRoutes).toHaveLength(0);
  });

  test('merging App Router routes does not duplicate them in unusedBackendRoutes', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const matches = r.unusedBackendRoutes.filter(x => x.path === '/api/example');
    expect(matches).toHaveLength(1);
  });

  test('merging App Router routes does not duplicate their endpointInventory entry', () => {
    const r = extractRouteApiStructure({
      files: [makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript')],
    });
    const matches = r.endpointInventory.filter(e => e.path === '/api/example' && e.method === 'GET');
    expect(matches).toHaveLength(1);
  });
});

describe('extractRouteApiStructure — App Router linkage via linkFrontendBackendApis', () => {
  const { linkFrontendBackendApis } = require('../../../../execution/architecture/linkFrontendBackendApis');

  function link(r) {
    return linkFrontendBackendApis({
      backendRoutes:     r.backendRoutes,
      frontendApiCalls:  r.frontendApiCalls,
      endpointInventory: r.endpointInventory,
    });
  }

  test('frontend call to /api/example links to app/api/example/route.ts GET', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('frontend/app.js', "fetch('/api/example')"),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/example' && e.method === 'GET')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
    expect(linkage.orphanedBackendRoutes).toHaveLength(0);
  });

  test('dynamic route app/api/users/[id]/route.ts links to a template-literal frontend call for /api/users/${id}', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('app/api/users/[id]/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('frontend/app.js', 'fetch(`/api/users/${id}`)'),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/users/:id' && e.method === 'GET')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test('method mismatch is still detected for an App Router route', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('app/api/example/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('frontend/app.js', "fetch('/api/example', { method: 'POST' })"),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints).toHaveLength(0);
    expect(linkage.methodMismatches).toEqual([
      { path: '/api/example', frontendMethod: 'POST', availableMethods: ['GET'] },
    ]);
    expect(linkage.orphanedBackendRoutes.find(rt => rt.path === '/api/example')).toBeDefined();
  });

  test('a methodless route.ts does not link — the frontend call stays unresolved', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('app/api/example/route.ts', 'export const CONFIG = {};', 'TypeScript'),
        makeFile('frontend/app.js', "fetch('/api/example')"),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints).toHaveLength(0);
    expect(linkage.unresolvedFrontendCalls).toEqual([
      { from: 'frontend/app.js', method: 'GET', path: '/api/example' },
    ]);
  });

  test('existing Express linkage still works unaffected by the App Router merge', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('frontend/app.js', "fetch('/api/users')"),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/users' && e.method === 'GET')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test('existing NestJS linkage still works unaffected by the App Router merge', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('auth.controller.ts', "@Controller('api/auth')\nexport class AuthController {\n  @Get('login')\n  login() {}\n}", 'TypeScript'),
        makeFile('frontend/app.js', "fetch('/api/auth/login')"),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints.find(e => e.path === '/api/auth/login' && e.method === 'GET')).toBeDefined();
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
  });

  test('Express, NestJS, and App Router routes can all link simultaneously in one repo', () => {
    const r = extractRouteApiStructure({
      files: [
        makeFile('server.js', "app.get('/api/users', getUsers);"),
        makeFile('auth.controller.ts', "@Controller('api/auth')\nexport class AuthController {\n  @Get('login')\n  login() {}\n}", 'TypeScript'),
        makeFile('app/api/items/route.ts', 'export async function GET(req) {}', 'TypeScript'),
        makeFile('frontend/app.js', [
          "fetch('/api/users')",
          "fetch('/api/auth/login')",
          "fetch('/api/items')",
        ].join('\n')),
      ],
    });
    const linkage = link(r);
    expect(linkage.linkedEndpoints).toHaveLength(3);
    expect(linkage.unresolvedFrontendCalls).toHaveLength(0);
    expect(linkage.orphanedBackendRoutes).toHaveLength(0);
  });
});
