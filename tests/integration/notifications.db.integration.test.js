'use strict';

// Integration tests: in-app notification DB write path (FR-008).
//
// Proves the full worker → DB row path that unit tests cannot cover:
//   writeNotification.js  →  notifications table  (row shape, constraints)
//   sendAlert._writeInAppNotifications  →  per-user fan-out
//
// Opt-in only — self-skip when TEST_INTEGRATION is not set.
// Run (single file, no coverage):
//   $env:TEST_INTEGRATION = "true"; npx jest tests/integration/notifications.db.integration.test.js --no-coverage
//
// Requires a PostgreSQL test database with migrations 0001–0013 applied.
// Set TEST_DATABASE_URL (preferred) or DATABASE_URL — URL must contain
// "test", "local", or "localhost" or the safety guard throws.
//
// No SMTP server or Slack webhook required — those channels fail silently
// via Promise.allSettled; these tests assert only on DB rows.

// ─── Env vars — MUST precede all require() calls that load config/paths.js ────
// sendAlert.js requires config/paths.js at module load time.
// ENABLE_PROACTIVE_ALERTS must be 'true' before that require() executes,
// otherwise sendAlert exits at the guard and writes no DB rows.
if (process.env.TEST_INTEGRATION === 'true') {
  process.env.ENABLE_PROACTIVE_ALERTS = 'true';
  // SMTP_HOST and SLACK_WEBHOOK_URL are intentionally absent — email/Slack
  // channels throw network errors that Promise.allSettled absorbs silently.
}

const {
  requireIntegrationEnv,
  createTestPool,
  resetAuthTables,
  closeTestPool,
} = require('./helpers/dbTestHelper');

const { writeNotification } = require('../../execution/notifications/writeNotification');
const { sendAlert, _sent }  = require('../../services/notifications/sendAlert');
const { upsertUser }        = require('../../execution/auth/upsertUser');

// ─── Opt-in guard ─────────────────────────────────────────────────────────────
// requireIntegrationEnv() returns false  → tests skip (TEST_INTEGRATION unset)
// requireIntegrationEnv() returns string → tests run against that DB URL
// requireIntegrationEnv() throws         → URL is unsafe (fail fast)
const INTEGRATION_URL     = requireIntegrationEnv();
const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

// ─── Shared pool — created once, closed after all suites ─────────────────────
let pool;

beforeAll(() => {
  if (!INTEGRATION_URL) return;
  pool = createTestPool(INTEGRATION_URL);
});

afterAll(async () => {
  if (!pool) return;
  await closeTestPool(pool);
});

// ─── Local helpers ────────────────────────────────────────────────────────────

// Seeds a user via the real execution function.
// githubId is varied per-test where multiple users are required to avoid
// UNIQUE constraint violations on github_id.
async function seedUser(overrides = {}) {
  return upsertUser({
    db:             pool,
    githubId:       overrides.githubId       ?? 5001,
    githubUsername: overrides.githubUsername ?? 'notif-test-user',
    email:          overrides.email          ?? 'notif@test.local',
    defaultRole:    overrides.defaultRole    ?? 'project_manager',
    now:            new Date(),
  });
}

// Truncates the notifications table and restarts its id sequence.
// Called inline (constraint: no modifications to dbTestHelper.js).
// resetAuthTables() cascades into notifications via the FK ON DELETE CASCADE,
// removing rows — this function additionally restarts the id sequence.
async function resetNotifications() {
  await pool.query('TRUNCATE notifications RESTART IDENTITY');
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const CRITICAL_WORSENING = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-17T00:00:00.000Z',
};

const WARNING_WORSENING = {
  alertState:     'Warning',
  trend:          'Worsening',
  riskScore:      60,
  atRiskProjects: 5,
  totalProjects:  10,
  lastUpdated:    '2026-06-17T00:00:00.000Z',
};

const NORMAL_STABLE = {
  alertState:     'Normal',
  trend:          'Stable',
  riskScore:      15,
  atRiskProjects: 1,
  totalProjects:  10,
  lastUpdated:    '2026-06-17T00:00:00.000Z',
};

// ─── Block 1: writeNotification — row shape ───────────────────────────────────

describeIntegration('Integration: writeNotification — row shape against real DB', () => {
  let testUser;

  beforeEach(async () => {
    await resetAuthTables(pool);   // TRUNCATE sessions, users CASCADE → cascades notifications
    await resetNotifications();    // restart notifications id sequence
    testUser = await seedUser();
  });

  it('inserts a row and returns a non-null object with an integer id', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    expect(row).not.toBeNull();
    expect(typeof row.id).toBe('number');
    expect(row.id).toBeGreaterThan(0);
  });

  it('inserted row has type "portfolio_alert" and status "CREATED"', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    expect(row.type).toBe('portfolio_alert');
    expect(row.status).toBe('CREATED');

    // Confirm via raw SELECT — proves RETURNING and the live table agree
    const { rows } = await pool.query(
      'SELECT type, status FROM notifications WHERE id = $1', [row.id]
    );
    expect(rows[0].type).toBe('portfolio_alert');
    expect(rows[0].status).toBe('CREATED');
  });

  it('derives priority CRITICAL when alertState is "Critical"', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    expect(row.priority).toBe('CRITICAL');

    const { rows } = await pool.query(
      'SELECT priority FROM notifications WHERE id = $1', [row.id]
    );
    expect(rows[0].priority).toBe('CRITICAL');
  });

  it('derives priority HIGH when trend is "Worsening" and alertState is not "Critical"', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: WARNING_WORSENING });

    expect(row.priority).toBe('HIGH');
  });

  it('derives priority MEDIUM when alertState is not Critical and trend is not Worsening', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: NORMAL_STABLE });

    expect(row.priority).toBe('MEDIUM');
  });

  it('title contains alertState and trend; body contains riskScore, atRiskProjects, and totalProjects', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    expect(row.title).toContain('Critical');
    expect(row.title).toContain('Worsening');

    // Verify stored body via raw SELECT — confirms the text written to the DB
    const { rows } = await pool.query(
      'SELECT body FROM notifications WHERE id = $1', [row.id]
    );
    const body = rows[0].body;
    expect(body).toContain('Critical');
    expect(body).toContain('Worsening');
    expect(body).toContain('80%');
    expect(body).toContain('8');
    expect(body).toContain('10');
  });
});

// ─── Block 2: Deduplication constraint ───────────────────────────────────────

describeIntegration('Integration: writeNotification — deduplication constraint against real DB', () => {
  let testUser;

  beforeEach(async () => {
    await resetAuthTables(pool);
    await resetNotifications();
    testUser = await seedUser();
  });

  it('second call with same user and dedupe_key returns null (ON CONFLICT DO NOTHING); only one row in DB', async () => {
    const first  = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });
    const second = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const { rows } = await pool.query(
      'SELECT COUNT(*) AS n FROM notifications WHERE user_id = $1', [testUser.userId]
    );
    expect(Number(rows[0].n)).toBe(1);
  });

  it('same dedupe_key for a different user inserts a separate row (constraint is per-user)', async () => {
    const user2 = await seedUser({
      githubId:       5002,
      githubUsername: 'notif-test-user-2',
      email:          'notif2@test.local',
    });

    const r1 = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });
    const r2 = await writeNotification({ db: pool, userId: user2.userId,    summary: CRITICAL_WORSENING });

    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1.id).not.toBe(r2.id);

    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM notifications');
    expect(Number(rows[0].n)).toBe(2);
  });

  it('dedupe_key stored in DB equals "${alertState}:${trend}"', async () => {
    const row = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    const { rows } = await pool.query(
      'SELECT dedupe_key FROM notifications WHERE id = $1', [row.id]
    );
    expect(rows[0].dedupe_key).toBe('Critical:Worsening');
  });
});

// ─── Block 3: sendAlert fan-out ───────────────────────────────────────────────

describeIntegration('Integration: sendAlert — in-app fan-out against real DB', () => {
  let errorSpy;
  let logSpy;

  beforeEach(async () => {
    _sent.clear();
    // Suppress expected console noise: Slack/email channel failures and
    // sendAlert status messages — these are intentional in this environment.
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy   = jest.spyOn(console, 'log').mockImplementation(() => {});
    await resetAuthTables(pool);
    await resetNotifications();
  });

  afterEach(() => {
    errorSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('with 2 active users, writes exactly 2 notification rows', async () => {
    await seedUser({ githubId: 5001, githubUsername: 'user-a', email: 'a@test.local' });
    await seedUser({ githubId: 5002, githubUsername: 'user-b', email: 'b@test.local' });

    await sendAlert(CRITICAL_WORSENING, { db: pool });

    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM notifications');
    expect(Number(rows[0].n)).toBe(2);
  });

  it('with 0 users in the DB, writes no notification rows', async () => {
    // resetAuthTables already truncated users — no seedUser call
    await sendAlert(CRITICAL_WORSENING, { db: pool });

    const { rows } = await pool.query('SELECT COUNT(*) AS n FROM notifications');
    expect(Number(rows[0].n)).toBe(0);
  });

  it('with 1 active user and 1 soft-deleted user, writes exactly 1 row belonging to the active user', async () => {
    const active  = await seedUser({ githubId: 5001, githubUsername: 'active-user',  email: 'active@test.local' });
    const deleted = await seedUser({ githubId: 5002, githubUsername: 'deleted-user', email: 'deleted@test.local' });

    // Soft-delete the second user — mirrors the pattern in auth.integration.test.js
    await pool.query('UPDATE users SET deleted_at = NOW() WHERE id = $1', [deleted.userId]);

    await sendAlert(CRITICAL_WORSENING, { db: pool });

    const { rows } = await pool.query('SELECT user_id FROM notifications');
    expect(rows).toHaveLength(1);
    expect(rows[0].user_id).toBe(active.userId);
  });
});

// ─── Block 4: Column integrity ────────────────────────────────────────────────

describeIntegration('Integration: notifications — column integrity against real DB', () => {
  let testUser;

  beforeEach(async () => {
    await resetAuthTables(pool);
    await resetNotifications();
    testUser = await seedUser();
  });

  it('expires_at is approximately 90 days from now (within 10 seconds)', async () => {
    const before = Date.now();
    const row    = await writeNotification({ db: pool, userId: testUser.userId, summary: CRITICAL_WORSENING });

    const { rows } = await pool.query(
      'SELECT expires_at FROM notifications WHERE id = $1', [row.id]
    );
    const expiresMs    = new Date(rows[0].expires_at).getTime();
    const expected90d  = before + 90 * 24 * 60 * 60 * 1000;

    expect(Math.abs(expiresMs - expected90d)).toBeLessThan(10_000);
  });

  it('priority check constraint rejects an invalid priority value (PG error code 23514)', async () => {
    await expect(
      pool.query(
        `INSERT INTO notifications (user_id, type, priority, title, body, status, dedupe_key, expires_at)
         VALUES ($1, 'portfolio_alert', 'EXTREME', 'test title', 'test body', 'CREATED',
                 'test:constraint', NOW() + INTERVAL '90 days')`,
        [testUser.userId]
      )
    ).rejects.toMatchObject({ code: '23514' });
  });
});
