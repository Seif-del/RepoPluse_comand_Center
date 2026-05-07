'use strict';

// Integration tests for logEvent / audit_logs.
//
// Opt-in: run only when TEST_INTEGRATION=true is set.
// Use:  npm run test:integration
//
// Requires migration 0003_create_audit_logs to be applied before running.
// These tests do NOT run migrations, drop tables, or contact GitHub.

const {
  requireIntegrationEnv,
  createTestPool,
  resetAuditTables,
  closeTestPool,
} = require('./helpers/dbTestHelper');

const { logEvent } = require('../../execution/audit/logEvent');

// ─── Opt-in guard ─────────────────────────────────────────────────────────────
const INTEGRATION_URL     = requireIntegrationEnv();
const describeIntegration = INTEGRATION_URL ? describe : describe.skip;

// ─── Shared pool ──────────────────────────────────────────────────────────────
let pool;

beforeAll(() => {
  if (!INTEGRATION_URL) return;
  pool = createTestPool(INTEGRATION_URL);
});

afterAll(async () => {
  if (!pool) return;
  await closeTestPool(pool);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function baseEvent(overrides = {}) {
  return {
    db:           pool,
    actorId:      overrides.actorId      ?? '42',
    action:       overrides.action       ?? 'test.event',
    resourceType: overrides.resourceType ?? 'session',
    resourceId:   overrides.resourceId   ?? '99',
    metadata:     overrides.metadata     ?? {},
    now:          overrides.now          ?? new Date(),
  };
}

// ─── logEvent integration tests ───────────────────────────────────────────────

describeIntegration('Integration: logEvent / audit_logs against real DB', () => {
  beforeEach(async () => {
    await resetAuditTables(pool);
  });

  it('inserts an audit row and returns the full row via RETURNING *', async () => {
    const now = new Date();

    const row = await logEvent({
      db:           pool,
      actorId:      '42',
      action:       'user.login',
      resourceType: 'session',
      resourceId:   '99',
      metadata:     { githubUsername: 'alice' },
      now,
    });

    expect(row).not.toBeNull();
    expect(typeof row.id).toBe('number');
    expect(row.actor_id).toBe('42');
    expect(row.action).toBe('user.login');
    expect(row.resource_type).toBe('session');
    expect(row.resource_id).toBe('99');
    expect(row.metadata).toEqual({ githubUsername: 'alice' });
    expect(row.created_at).toBeInstanceOf(Date);

    // Confirm exactly one row in the DB
    const { rows } = await pool.query('SELECT * FROM audit_logs WHERE id = $1', [row.id]);
    expect(rows).toHaveLength(1);
    expect(rows[0].action).toBe('user.login');
  });

  it('persists metadata as JSONB — nested objects, numbers, and booleans survive round-trip', async () => {
    const metadata = {
      nested:   { deep: true },
      count:    7,
      tags:     ['a', 'b'],
      flag:     false,
    };

    const row = await logEvent(baseEvent({ metadata }));
    expect(row).not.toBeNull();

    const { rows } = await pool.query(
      'SELECT metadata FROM audit_logs WHERE id = $1', [row.id],
    );
    expect(rows[0].metadata).toEqual(metadata);
  });

  it('returns the inserted row (not null) — confirms 42P01 error is gone', async () => {
    // Before migration 0003 was applied, logEvent caught error code 42P01
    // ("relation audit_logs does not exist") and returned null.
    // This test proves the table now exists and inserts succeed.
    const row = await logEvent(baseEvent({ action: 'audit.table.exists' }));

    expect(row).not.toBeNull();
    expect(row.action).toBe('audit.table.exists');
  });

  it('appends a separate row for each call — no deduplication, no update', async () => {
    const now  = new Date();
    const base = { db: pool, actorId: '1', resourceType: 'session', resourceId: '1', metadata: {}, now };

    await logEvent({ ...base, action: 'user.login'  });
    await logEvent({ ...base, action: 'user.logout' });
    await logEvent({ ...base, action: 'user.login'  });

    const { rows } = await pool.query('SELECT * FROM audit_logs ORDER BY id');
    expect(rows).toHaveLength(3);
    expect(rows[0].action).toBe('user.login');
    expect(rows[1].action).toBe('user.logout');
    expect(rows[2].action).toBe('user.login');

    // Every row has a distinct id — append-only, no merging
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('metadata column DB default is empty object when not supplied by the caller', async () => {
    // logEvent always passes metadata, but the DB default must hold for any
    // future direct INSERT that omits the column.
    const now = new Date();
    await pool.query(
      `INSERT INTO audit_logs (actor_id, action, resource_type, resource_id, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      ['0', 'system.bootstrap', 'system', '0', now],
    );

    const { rows } = await pool.query(
      "SELECT metadata FROM audit_logs WHERE action = 'system.bootstrap'",
    );
    expect(rows[0].metadata).toEqual({});
  });

  it('resetAuditTables clears all rows and resets the id sequence', async () => {
    // Seed two rows
    await logEvent(baseEvent({ action: 'first'  }));
    await logEvent(baseEvent({ action: 'second' }));

    let { rows } = await pool.query('SELECT COUNT(*) AS n FROM audit_logs');
    expect(Number(rows[0].n)).toBe(2);

    // Reset
    await resetAuditTables(pool);

    ({ rows } = await pool.query('SELECT COUNT(*) AS n FROM audit_logs'));
    expect(Number(rows[0].n)).toBe(0);

    // Sequence should restart at 1
    const row = await logEvent(baseEvent({ action: 'after.reset' }));
    expect(row.id).toBe(1);
  });
});
