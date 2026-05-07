'use strict';

// Integration tests for the Phase 1 auth stack.
//
// Opt-in: run only when TEST_INTEGRATION=true is set.
// Use:  npm run test:integration
//
// Requires a PostgreSQL database whose URL contains 'test', 'local', or
// 'localhost'. Set TEST_DATABASE_URL (preferred) or DATABASE_URL.
// Migrations must already be applied before running these tests.
// These tests do NOT run migrations, drop tables, or contact GitHub.

const supertest = require('supertest');
const express   = require('express');

const {
  requireIntegrationEnv,
  createTestPool,
  resetAuthTables,
  closeTestPool,
} = require('./helpers/dbTestHelper');

const { upsertUser }         = require('../../execution/auth/upsertUser');
const { createSession }      = require('../../execution/auth/createSession');
const { validateSession }    = require('../../execution/auth/validateSession');
const { hashToken }          = require('../../execution/auth/hashToken');
const { invalidateSession }  = require('../../execution/auth/invalidateSession');
const authRoutes          = require('../../backend/routes/authRoutes');
const errorHandler        = require('../../backend/middleware/errorHandler');

// ─── Opt-in guard ─────────────────────────────────────────────────────────────
// requireIntegrationEnv() returns false  → all tests skip (TEST_INTEGRATION unset)
// requireIntegrationEnv() returns string → tests run against that DB URL
// requireIntegrationEnv() throws         → URL is unsafe (fail fast)
const INTEGRATION_URL     = requireIntegrationEnv();
const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

// ─── Shared pool — created once, closed after all suites ──────────────────────
let pool;

beforeAll(() => {
  if (!INTEGRATION_URL) return;
  pool = createTestPool(INTEGRATION_URL);
});

afterAll(async () => {
  if (!pool) return;
  await closeTestPool(pool);
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function seedUser(overrides = {}) {
  return upsertUser({
    db:             pool,
    githubId:       overrides.githubId       ?? 1001,
    githubUsername: overrides.githubUsername ?? 'testuser',
    email:          overrides.email          ?? 'test@example.com',
    defaultRole:    overrides.defaultRole    ?? 'intern',
    now:            overrides.now            ?? new Date(),
  });
}

// Returns a mock fetchFn that handles the two sequential calls exchangeOAuthCode
// makes: (1) POST to token endpoint → (2) GET to profile endpoint.
// Does not touch GitHub.
function buildFetchFn({ githubId = 1001, login = 'testuser', email = 'test@example.com' } = {}) {
  let calls = 0;
  return async () => {
    calls += 1;
    if (calls === 1) {
      return { ok: true, json: async () => ({ access_token: 'mock-access-token-abc' }) };
    }
    return { ok: true, json: async () => ({ id: githubId, login, email }) };
  };
}

// Builds a minimal Express app with only the auth routes wired up.
// Uses the shared test pool and an injected fetchFn — no GitHub calls.
function buildTestApp(fetchFn) {
  const app = express();
  app.locals.db     = pool;
  app.locals.config = {
    github: {
      clientId:    'test-client-id',
      clientSecret: 'test-client-secret',
      callbackUrl: 'http://localhost:3000/auth/callback',
      scopes:      ['read:user', 'user:email'],
    },
    sessionExpiryHours:    24,
    defaultUserRole:       'intern',
    postLoginRedirectPath: '/dashboard',
  };
  app.locals.fetchFn = fetchFn;
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use(errorHandler);
  return app;
}

// ─── upsertUser ───────────────────────────────────────────────────────────────

describeIntegration('Integration: upsertUser against real DB', () => {
  beforeEach(async () => {
    await resetAuthTables(pool);
  });

  it('inserts a new user row with correct fields', async () => {
    const now = new Date();

    const result = await upsertUser({
      db:             pool,
      githubId:       42,
      githubUsername: 'alice',
      email:          'alice@example.com',
      defaultRole:    'intern',
      now,
    });

    expect(result.githubUsername).toBe('alice');
    expect(result.email).toBe('alice@example.com');
    expect(result.role).toBe('intern');
    expect(result.deletedAt).toBeNull();
    expect(typeof result.userId).toBe('number');

    const { rows } = await pool.query('SELECT * FROM users WHERE github_id = $1', [42]);
    expect(rows).toHaveLength(1);
    expect(rows[0].github_username).toBe('alice');
  });

  it('updates without duplicating when called twice with the same github_id', async () => {
    const now  = new Date();
    const base = { db: pool, githubId: 42, email: 'alice@example.com', defaultRole: 'intern', now };

    await upsertUser({ ...base, githubUsername: 'alice-original' });
    const updated = await upsertUser({ ...base, githubUsername: 'alice-updated' });

    expect(updated.githubUsername).toBe('alice-updated');

    const { rows } = await pool.query('SELECT * FROM users WHERE github_id = $1', [42]);
    expect(rows).toHaveLength(1);
    expect(rows[0].github_username).toBe('alice-updated');
  });

  it('preserves the existing role on conflict — does not overwrite with defaultRole', async () => {
    const now = new Date();

    await upsertUser({
      db: pool, githubId: 42, githubUsername: 'alice', email: null,
      defaultRole: 'intern', now,
    });

    // Promote role out-of-band (admin action)
    await pool.query('UPDATE users SET role = $1 WHERE github_id = $2', ['project_manager', 42]);

    const second = await upsertUser({
      db: pool, githubId: 42, githubUsername: 'alice', email: null,
      defaultRole: 'intern', now,
    });

    expect(second.role).toBe('project_manager');

    const { rows } = await pool.query('SELECT role FROM users WHERE github_id = $1', [42]);
    expect(rows[0].role).toBe('project_manager');
  });

  it('clears deleted_at when a soft-deleted user logs in again', async () => {
    const now   = new Date();
    const first = await upsertUser({
      db: pool, githubId: 42, githubUsername: 'alice', email: null,
      defaultRole: 'intern', now,
    });

    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [first.userId]);

    const { rows: before } = await pool.query(
      'SELECT deleted_at FROM users WHERE id = $1', [first.userId],
    );
    expect(before[0].deleted_at).not.toBeNull();

    const restored = await upsertUser({
      db: pool, githubId: 42, githubUsername: 'alice', email: null,
      defaultRole: 'intern', now: new Date(),
    });

    expect(restored.deletedAt).toBeNull();

    const { rows: after } = await pool.query(
      'SELECT deleted_at FROM users WHERE id = $1', [first.userId],
    );
    expect(after[0].deleted_at).toBeNull();
  });
});

// ─── createSession ────────────────────────────────────────────────────────────

describeIntegration('Integration: createSession against real DB', () => {
  let testUser;

  beforeEach(async () => {
    await resetAuthTables(pool);
    testUser = await seedUser();
  });

  it('stores only the hashed token — the raw token is never written to the DB', async () => {
    const rawToken = 'plaintext-secret-token';
    const now      = new Date();

    const session = await createSession({
      db:                  pool,
      userId:              String(testUser.userId),
      rawToken,
      now,
      sessionExpiryHours:  24,
    });

    const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [session.id]);
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.token_hash).toBe(hashToken(rawToken));       // correct hash stored
    expect(JSON.stringify(row)).not.toContain(rawToken);    // raw token absent from every column
  });

  it('sets expires_at to now + sessionExpiryHours', async () => {
    const now                = new Date();
    const sessionExpiryHours = 24;

    const session = await createSession({
      db:                  pool,
      userId:              String(testUser.userId),
      rawToken:            'another-token',
      now,
      sessionExpiryHours,
    });

    const expectedExpiry = new Date(now.getTime() + sessionExpiryHours * 3_600_000);
    const delta = Math.abs(new Date(session.expires_at).getTime() - expectedExpiry.getTime());
    expect(delta).toBeLessThan(2_000); // within 2 seconds
  });
});

// ─── validateSession ──────────────────────────────────────────────────────────

describeIntegration('Integration: validateSession against real DB', () => {
  let testUser;

  beforeEach(async () => {
    await resetAuthTables(pool);
    testUser = await seedUser();
  });

  it('accepts a valid token and returns the correct user context', async () => {
    const rawToken = 'valid-token-abc';
    const now      = new Date();

    await createSession({
      db: pool, userId: String(testUser.userId),
      rawToken, now, sessionExpiryHours: 24,
    });

    const ctx = await validateSession({
      db: pool, rawToken, now: new Date(), sessionExpiryHours: 24,
    });

    expect(ctx.userId).toBe(testUser.userId);
    expect(ctx.role).toBe('intern');
    expect(ctx.githubUsername).toBe('testuser');
    expect(ctx.sessionId).toEqual(expect.any(Number));
    expect(ctx.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects an expired token with UNAUTHORIZED', async () => {
    const rawToken  = 'expired-token';
    const createNow = new Date(Date.now() - 48 * 3_600_000); // 48 hours ago

    await createSession({
      db: pool, userId: String(testUser.userId),
      rawToken, now: createNow, sessionExpiryHours: 1, // expired 47 hours ago
    });

    await expect(
      validateSession({ db: pool, rawToken, now: new Date(), sessionExpiryHours: 24 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects a valid token when the associated user is soft-deleted', async () => {
    const rawToken = 'active-token';
    const now      = new Date();

    await createSession({
      db: pool, userId: String(testUser.userId),
      rawToken, now, sessionExpiryHours: 24,
    });

    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [testUser.userId]);

    await expect(
      validateSession({ db: pool, rawToken, now: new Date(), sessionExpiryHours: 24 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('updates expires_at on each validation (rolling inactivity window)', async () => {
    const rawToken  = 'rolling-token';
    const createNow = new Date();

    const session = await createSession({
      db: pool, userId: String(testUser.userId),
      rawToken, now: createNow, sessionExpiryHours: 1,
    });

    const originalExpiry = new Date(session.expires_at).getTime();

    // Validate 30 minutes later with a 2-hour window
    const validateNow = new Date(createNow.getTime() + 30 * 60_000);
    await validateSession({ db: pool, rawToken, now: validateNow, sessionExpiryHours: 2 });

    const { rows } = await pool.query(
      'SELECT expires_at FROM sessions WHERE id = $1', [session.id],
    );
    const updatedExpiry = new Date(rows[0].expires_at).getTime();

    // New expiry (validateNow + 2h = createNow + 2.5h) must exceed original (createNow + 1h)
    expect(updatedExpiry).toBeGreaterThan(originalExpiry);
  });

  it('rejects a completely unknown token with UNAUTHORIZED', async () => {
    await expect(
      validateSession({ db: pool, rawToken: 'never-seen-token', now: new Date(), sessionExpiryHours: 24 }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

// ─── Auth callback route ──────────────────────────────────────────────────────
// Uses a mock fetchFn injected via app.locals — no GitHub calls.
// exchangeOAuthCode, upsertUser, and createSession all run against the real DB.
// logEvent is fire-and-forget and fails silently (audit_logs table not yet
// migrated in Phase 1), so it does not affect route assertions.

describeIntegration('Integration: GET /auth/callback route with real DB', () => {
  beforeEach(async () => {
    await resetAuthTables(pool);
  });

  it('creates user and session, sets HttpOnly cookie, redirects to /dashboard', async () => {
    const fetchFn = buildFetchFn({ githubId: 9001, login: 'oauthuser', email: 'oauth@example.com' });
    const app     = buildTestApp(fetchFn);

    const res = await supertest(app)
      .get('/auth/callback?code=test-oauth-code')
      .expect(302);

    expect(res.headers.location).toBe('/dashboard');
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.headers['set-cookie'][0]).toMatch(/session_token=/);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);

    // User row must exist with correct fields
    const { rows: users } = await pool.query(
      'SELECT * FROM users WHERE github_id = $1', [9001],
    );
    expect(users).toHaveLength(1);
    expect(users[0].github_username).toBe('oauthuser');
    expect(users[0].email).toBe('oauth@example.com');

    // Session row must exist — token_hash stored (never raw token)
    const { rows: sessions } = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1', [users[0].id],
    );
    expect(sessions).toHaveLength(1);
    expect(sessions[0].token_hash).toHaveLength(64); // SHA-256 hex
  });

  it('redirects to postLoginRedirectPath when configured', async () => {
    const fetchFn = buildFetchFn({ githubId: 9002, login: 'oauthuser2', email: null });
    const app     = buildTestApp(fetchFn);
    app.locals.config = { ...app.locals.config, postLoginRedirectPath: '/custom-path' };

    const res = await supertest(app)
      .get('/auth/callback?code=another-code')
      .expect(302);

    expect(res.headers.location).toBe('/custom-path');
  });

  it('returns 500 when no code query parameter is provided', async () => {
    // INVALID_OAUTH_CODE is not in errorHandler STATUS_MAP → 500
    const res = await supertest(buildTestApp(buildFetchFn()))
      .get('/auth/callback')
      .expect(500);

    expect(res.body.ok).toBe(false);
  });

  it('returns 500 when the upstream OAuth token exchange fails', async () => {
    const failingFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    await supertest(buildTestApp(failingFetch))
      .get('/auth/callback?code=bad-code')
      .expect(500);
  });
});

// ─── invalidateSession / POST /auth/logout ────────────────────────────────────

describeIntegration('Integration: POST /auth/logout with real DB', () => {
  beforeEach(async () => {
    await resetAuthTables(pool);
  });

  // Builds an app with injected req.user and req.session so the guard passes.
  // config is not needed — the logout handler only reads db, user, and session.
  function buildLogoutApp({ userId, sessionId }) {
    const app = express();
    app.locals.db = pool;
    app.use((req, _res, next) => {
      req.user    = { userId };
      req.session = { sessionId };
      next();
    });
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    return app;
  }

  it('deletes the session row and returns 204', async () => {
    const user    = await seedUser({ githubId: 8001, githubUsername: 'logoutuser' });
    const session = await createSession({
      db:                 pool,
      userId:             String(user.userId),
      rawToken:           'logout-test-token',
      now:                new Date(),
      sessionExpiryHours: 24,
    });

    await supertest(buildLogoutApp({ userId: user.userId, sessionId: session.id }))
      .post('/auth/logout')
      .expect(204);

    const { rows } = await pool.query(
      'SELECT * FROM sessions WHERE id = $1', [session.id],
    );
    expect(rows).toHaveLength(0);
  });

  it('returns 204 even when the session row does not exist', async () => {
    const user = await seedUser({ githubId: 8002, githubUsername: 'logoutuser2' });

    await supertest(buildLogoutApp({ userId: user.userId, sessionId: 999999 }))
      .post('/auth/logout')
      .expect(204);
  });

  it('invalidateSession itself returns { invalidated: true } after a real DELETE', async () => {
    const user    = await seedUser({ githubId: 8003, githubUsername: 'logoutuser3' });
    const session = await createSession({
      db:                 pool,
      userId:             String(user.userId),
      rawToken:           'direct-invalidate-token',
      now:                new Date(),
      sessionExpiryHours: 24,
    });

    const result = await invalidateSession({
      db:        pool,
      sessionId: String(session.id),
    });

    expect(result).toEqual({ invalidated: true });
  });

  it('invalidateSession returns { invalidated: false } when session does not exist', async () => {
    const result = await invalidateSession({ db: pool, sessionId: '999999' });
    expect(result).toEqual({ invalidated: false });
  });
});
