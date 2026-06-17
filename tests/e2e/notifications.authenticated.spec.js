'use strict';

// Authenticated E2E tests for the in-app notification UI (FR-008).
//
// Pre-requisites (all created by globalSetup.js before this suite runs):
//   - tests/e2e/.auth/user.json — Playwright storageState with a valid session_token
//   - github_id=99001 user row in the users table
//   - DATABASE_URL or TEST_DATABASE_URL pointing at the same local/test DB
//   - migrations 0013_create_notifications applied
//
// These tests seed notification data directly via SQL so that:
//   (a) state is deterministic across runs regardless of prior test history
//   (b) no test-only backend route is needed
//   (c) the dedupe_key partial-unique constraint is bypassed (NULL key)
//
// Run with:  npm run test:e2e

const { test, expect } = require('@playwright/test');
const fs   = require('fs');
const path = require('path');

const { createTestPool, closeTestPool } = require('../integration/helpers/dbTestHelper');

// Non-destructive .env loader — mirrors globalSetup.js.
// Playwright test runner does not auto-load .env; spec files that need DB
// access must load it manually.  Existing process env vars always win.
function loadDotEnv() {
  const envFile = path.resolve(__dirname, '../../.env');
  if (!fs.existsSync(envFile)) return;
  const lines = fs.readFileSync(envFile, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

// Creates a pool and resolves the E2E test user's primary key by github_id.
// Called independently in each inner describe's beforeAll so the two test
// groups share no state.
async function setupDb() {
  loadDotEnv();
  const dbUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  if (!dbUrl) {
    throw new Error(
      '[E2E] No database URL found.\n' +
      '  Set TEST_DATABASE_URL or DATABASE_URL (in .env or environment) before running E2E tests.',
    );
  }
  const pool = createTestPool(dbUrl);
  const { rows } = await pool.query(
    'SELECT id FROM users WHERE github_id = $1',
    [99001],
  );
  if (!rows.length) {
    await closeTestPool(pool);
    throw new Error(
      '[E2E] E2E test user (github_id=99001) not found in the database.\n' +
      '  Run globalSetup first:  node tests/e2e/globalSetup.js',
    );
  }
  return { pool, userId: rows[0].id };
}

// Seeds exactly one CREATED (unread) HIGH notification for the given userId.
// Deletes all existing notifications for that user first so every run starts
// from a clean state — avoids stale READ rows left by previous runs and
// sidesteps the dedupe_key partial-unique constraint by using NULL.
async function seedNotification(pool, userId) {
  await pool.query('DELETE FROM notifications WHERE user_id = $1', [userId]);
  const { rows: [notif] } = await pool.query(
    `INSERT INTO notifications
       (user_id, type, priority, title, body, status, expires_at)
     VALUES ($1, 'portfolio_alert', 'HIGH', $2, $3, 'CREATED', NOW() + INTERVAL '90 days')
     RETURNING id`,
    [
      userId,
      '[RepoPulse] High Alert — Worsening trend',
      'E2E test notification.\n\nAlert State : High\nTrend       : Worsening\nRisk Score  : 75%\nAt Risk     : 3 / 5 repos',
    ],
  );
  return notif.id;
}

// ─── Outer describe ───────────────────────────────────────────────────────────
// Sets storageState once so every test in this file loads the authenticated
// session cookie written by globalSetup.js.  The authenticate middleware
// validates the real session_token against the DB — no backend bypass.

test.describe('Notification UI — authenticated', () => {
  test.use({ storageState: 'tests/e2e/.auth/user.json' });

  // ── A — Authenticated unread notification renders ─────────────────────────

  test.describe('A — Authenticated unread notification renders', () => {
    let pool;

    test.beforeAll(async () => {
      const ctx = await setupDb();
      pool = ctx.pool;
      await seedNotification(pool, ctx.userId);
    });

    test.afterAll(async () => {
      if (pool) await closeTestPool(pool);
    });

    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      // Wait until loadNotifications() fetch has completed so badge and list
      // are fully rendered before any assertion runs.
      await page.waitForLoadState('networkidle');
    });

    test('A — badge visible with count "1", panel shows title and HIGH badge', async ({ page }) => {
      // ── Badge ──────────────────────────────────────────────────────────────
      // loadNotifications() returned unreadCount=1 → badge.hidden=false,
      // badge.textContent=buildNotificationBadgeText(1)='1'
      await expect(page.locator('#notif-badge')).toBeVisible();
      await expect(page.locator('#notif-badge')).toHaveText('1');

      // ── Panel opens ────────────────────────────────────────────────────────
      // toggleNotificationPanel() removes the hidden attribute from
      // #notification-section when #notif-btn is clicked.
      await page.locator('#notif-btn').click();
      await expect(page.locator('#notification-section')).toBeVisible();

      // ── Title visible ──────────────────────────────────────────────────────
      // buildNotificationListHtml() renders the title via esc(n.title) inside
      // #notification-list.
      await expect(page.locator('#notification-list')).toContainText(
        '[RepoPulse] High Alert — Worsening trend',
      );

      // ── HIGH priority badge visible ────────────────────────────────────────
      // notificationPriorityClass('HIGH') returns 'severity-high'; the span
      // has class 'aq-badge severity-high'.
      await expect(
        page.locator('#notification-list .aq-badge.severity-high'),
      ).toBeVisible();
    });
  });

  // ── B — Authenticated mark-read flow ─────────────────────────────────────

  test.describe('B — Authenticated mark-read flow', () => {
    let pool;

    // Independent seeding — B must not depend on A's DB state.  The DELETE
    // in seedNotification() ensures we start with exactly one CREATED row
    // even if test A left a READ row from a previous run.
    test.beforeAll(async () => {
      const ctx = await setupDb();
      pool = ctx.pool;
      await seedNotification(pool, ctx.userId);
    });

    test.afterAll(async () => {
      if (pool) await closeTestPool(pool);
    });

    test.beforeEach(async ({ page }) => {
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
    });

    test('B — Mark read fires PATCH 200, removes button, and hides unread badge', async ({ page }) => {
      // Open the notification panel so the Mark read button is rendered.
      await page.locator('#notif-btn').click();
      await expect(page.locator('#notification-section')).toBeVisible();
      await expect(page.locator('button:has-text("Mark read")')).toBeVisible();

      // Register the response intercept BEFORE clicking so the Promise is
      // already listening when the PATCH fires.
      const patchDone = page.waitForResponse(
        (r) =>
          r.url().includes('/api/notifications/') &&
          r.url().includes('/read') &&
          r.request().method() === 'PATCH',
      );

      // ── Click Mark read ────────────────────────────────────────────────────
      await page.locator('button:has-text("Mark read")').click();

      // ── PATCH succeeds ─────────────────────────────────────────────────────
      // markNotificationRead() calls PATCH /api/notifications/:id/read.
      // The route returns { success: true } with HTTP 200 for owned rows.
      const patchResponse = await patchDone;
      expect(patchResponse.status()).toBe(200);

      // After PATCH resolves, markNotificationRead() calls loadNotifications()
      // which re-fetches GET /api/notifications.  Wait for that to settle.
      await page.waitForLoadState('networkidle');

      // ── Mark read button disappears ────────────────────────────────────────
      // buildNotificationListHtml() checks n.status === 'READ' → isRead=true
      // → the button branch is skipped in the re-render.
      await expect(page.locator('button:has-text("Mark read")')).not.toBeVisible();

      // ── Unread badge hides ─────────────────────────────────────────────────
      // loadNotifications() re-fetches: unreadCount=0 →
      //   badge.textContent = buildNotificationBadgeText(0) = ''
      //   badge.hidden      = true   →  hidden="" attribute added
      //
      // CSS rule `#notif-badge[hidden] { display: none !important }` ensures the
      // UA stylesheet's hide behaviour is not overridden by the inline display
      // style, so Playwright's visibility check works correctly.
      await expect(page.locator('#notif-badge')).not.toBeVisible();
    });
  });
});
