'use strict';

// Unauthenticated smoke tests for the RepoPulse dashboard.
//
// These tests require NO login, NO database seeding, and NO session fixtures.
// Every authenticated API endpoint returns HTTP 401 → { ok: false }, which the
// dashboard handles gracefully (login link shown; panels stay hidden).
//
// Pre-requisites:
//   - Server must be reachable on http://localhost:3000  (playwright.config.js
//     starts it automatically via `cross-env PROJECT_SOURCE=file npm run dev`)
//   - Chromium must be installed  (npx playwright install chromium)
//
// Run with:  npm run test:e2e

const { test, expect } = require('@playwright/test');

test.describe('Dashboard smoke — unauthenticated', () => {
  // Accumulate uncaught JS exceptions per test so test 8 can assert on them.
  let pageErrors = [];

  test.beforeEach(async ({ page }) => {
    pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('/dashboard');

    // Wait until all initial API calls (which all 401) have completed so
    // every assertion runs against settled DOM state.
    await page.waitForLoadState('networkidle');
  });

  test('1 — /dashboard loads without navigation error', async ({ page }) => {
    // page.goto() throws on navigation failure; if we reach here the page loaded.
    expect(page.url()).toContain('/dashboard');
  });

  test('2 — page title is "RepoPulse Dashboard"', async ({ page }) => {
    await expect(page).toHaveTitle('RepoPulse Dashboard');
  });

  test('3 — notification bell #notif-btn is visible', async ({ page }) => {
    await expect(page.locator('#notif-btn')).toBeVisible();
  });

  test('4 — #notification-section is hidden on load', async ({ page }) => {
    // The element is rendered with the HTML `hidden` attribute and toggled only
    // by explicit user interaction — it must not auto-show for unauthenticated users.
    await expect(page.locator('#notification-section')).not.toBeVisible();
  });

  test('5 — clicking the bell shows the notification panel', async ({ page }) => {
    await page.locator('#notif-btn').click();
    await expect(page.locator('#notification-section')).toBeVisible();
  });

  test('6 — clicking the bell a second time hides the notification panel', async ({ page }) => {
    await page.locator('#notif-btn').click();
    await expect(page.locator('#notification-section')).toBeVisible();
    await page.locator('#notif-btn').click();
    await expect(page.locator('#notification-section')).not.toBeVisible();
  });

  test('7 — "Login with GitHub" link is visible for unauthenticated access', async ({ page }) => {
    // GET /api/repos returns 401 → errorHandler sends { ok: false } → loadRepos()
    // renders <a href="/auth/github">Login with GitHub</a> in #projects-container.
    // networkidle in beforeEach guarantees the fetch has already completed.
    await expect(
      page.locator('a[href="/auth/github"]'),
    ).toBeVisible();
  });

  test('8 — no uncaught JavaScript errors on page load', async ({ page }) => {
    // 401 API responses are not JS exceptions — they are handled by .catch() or
    // checked via r.ok inside each loader function.  Only genuine runtime errors
    // (TypeError, ReferenceError, etc.) appear here.
    expect(pageErrors, `Unexpected JS errors: ${pageErrors.join('; ')}`).toHaveLength(0);
  });
});
