'use strict';

const http = require('http');
const app  = require('../../../backend/server');

// ── Test server ───────────────────────────────────────────────────────────────
// We bind to port 0 so the OS picks a free port.  No supertest needed.

let server;
let baseUrl;

// Suppress console.error from errorHandler on 5xx responses.
let consoleSpy;

beforeAll((done) => {
  consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  server = http.createServer(app);
  server.listen(0, () => {
    baseUrl = `http://localhost:${server.address().port}`;
    done();
  });
});

afterAll((done) => {
  consoleSpy.mockRestore();
  server.close(done);
});

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function get(path) {
  return new Promise((resolve, reject) => {
    http.get(`${baseUrl}${path}`, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let body = raw;
        try { body = JSON.parse(raw); } catch (_) {}
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    }).on('error', reject);
  });
}

function post(path) {
  return new Promise((resolve, reject) => {
    const url  = new URL(`${baseUrl}${path}`);
    const req  = http.request(
      { hostname: url.hostname, port: Number(url.port), path: url.pathname, method: 'POST',
        headers: { 'Content-Length': 0 } },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let body = raw;
          try { body = JSON.parse(raw); } catch (_) {}
          resolve({ statusCode: res.statusCode, headers: res.headers, body });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

// ── Export ────────────────────────────────────────────────────────────────────

describe('server — export', () => {
  it('exports a function (Express app)', () => {
    expect(typeof app).toBe('function');
  });

  it('exports an object with an Express .use method', () => {
    expect(typeof app.use).toBe('function');
  });

  it('does not export a listening http.Server (app.listening is undefined)', () => {
    expect(app.listening).toBeUndefined();
  });

  it('app.locals.db is null (placeholder)', () => {
    expect(app.locals.db).toBeNull();
  });

  it('app.locals.config is null (placeholder)', () => {
    expect(app.locals.config).toBeNull();
  });
});

// ── GET /health ───────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns status 200', async () => {
    const res = await get('/health');
    expect(res.statusCode).toBe(200);
  });

  it('returns { status: "ok" }', async () => {
    const res = await get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('responds with Content-Type application/json', async () => {
    const res = await get('/health');
    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('does not call next() — no error propagates from health handler', async () => {
    const res = await get('/health');
    // If the handler threw, errorHandler would send { ok: false, ... }
    expect(res.body).not.toHaveProperty('ok', false);
  });
});

// ── Auth routes mounted at /auth ──────────────────────────────────────────────

describe('server — auth routes mounted at /auth', () => {
  it('GET /auth/github is handled by the auth router (not 404)', async () => {
    const res = await get('/auth/github');
    expect(res.statusCode).not.toBe(404);
  });

  it('GET /auth/github returns JSON from errorHandler (config is null → INVALID_OAUTH_CONFIG)', async () => {
    const res = await get('/auth/github');
    expect(typeof res.body).toBe('object');
    expect(res.body).toHaveProperty('ok', false);
  });

  it('auth routes are NOT mounted at /api/auth', async () => {
    const res = await get('/api/auth/github');
    expect(res.statusCode).toBe(404);
  });

  it('POST /auth/logout with no session returns 401 (UNAUTHORIZED in STATUS_MAP)', async () => {
    const res = await post('/auth/logout');
    expect(res.statusCode).toBe(401);
  });

  it('POST /auth/logout with no session returns structured JSON error', async () => {
    const res = await post('/auth/logout');
    expect(res.body).toMatchObject({ ok: false, error: 'Unauthorized' });
  });
});

// ── requestLogger middleware ──────────────────────────────────────────────────

describe('server — requestLogger', () => {
  it('attaches X-Correlation-Id header to every response', async () => {
    const res = await get('/health');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });

  it('X-Correlation-Id is a UUID-format string', async () => {
    const res = await get('/health');
    expect(res.headers['x-correlation-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('each request gets a different correlation ID', async () => {
    const [r1, r2] = await Promise.all([get('/health'), get('/health')]);
    expect(r1.headers['x-correlation-id']).not.toBe(r2.headers['x-correlation-id']);
  });
});

// ── errorHandler ─────────────────────────────────────────────────────────────

describe('server — errorHandler', () => {
  it('returns JSON error body (ok: false) for route errors', async () => {
    const res = await get('/auth/github');
    expect(res.body).toHaveProperty('ok', false);
  });

  it('error response includes an "error" message field', async () => {
    const res = await get('/auth/github');
    expect(typeof res.body.error).toBe('string');
  });

  it('error response includes correlationId (proves requestLogger ran before errorHandler)', async () => {
    const res = await get('/auth/github');
    expect(res.body.correlationId).toBeDefined();
    expect(res.body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  it('maps UNAUTHORIZED to HTTP 401', async () => {
    const res = await post('/auth/logout');
    expect(res.statusCode).toBe(401);
  });

  it('returns 500 for unknown error codes', async () => {
    // INVALID_OAUTH_CONFIG is not in STATUS_MAP → defaults to 500
    const res = await get('/auth/github');
    expect(res.statusCode).toBe(500);
  });
});

// ── Middleware order ──────────────────────────────────────────────────────────

describe('server — middleware order', () => {
  it('requestLogger runs before route handlers: correlationId present in error response body', async () => {
    // If requestLogger ran AFTER the route, req.correlationId would be unset
    // when errorHandler reads it, so body.correlationId would be undefined.
    const res = await get('/auth/github');
    expect(res.body.correlationId).toBeDefined();
  });

  it('requestLogger runs before errorHandler: X-Correlation-Id header present on error responses', async () => {
    const res = await get('/auth/github');
    expect(res.headers['x-correlation-id']).toBeDefined();
  });
});

// ── No Phase 2+ routes registered ────────────────────────────────────────────

describe('server — no Phase 2+ routes', () => {
  it('GET /api/projects returns 404', async () => {
    const res = await get('/api/projects');
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/dashboard returns 404', async () => {
    const res = await get('/api/dashboard');
    expect(res.statusCode).toBe(404);
  });

  it('GET /api/repos returns 404', async () => {
    const res = await get('/api/repos');
    expect(res.statusCode).toBe(404);
  });
});
