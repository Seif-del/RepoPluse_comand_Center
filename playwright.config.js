'use strict';

const { defineConfig, devices } = require('@playwright/test');

// E2E tests are opt-in, mirroring the integration test pattern.
// Run with:  npm run test:e2e
// Or:        cross-env RUN_E2E=true playwright test
//
// Requires the server to be reachable (webServer starts it via `npm run dev`).
// Set E2E_BASE_URL to override the default http://localhost:3000 when targeting
// a server that is already running (reuseExistingServer handles this case).
//
// Playwright test files live in tests/e2e/ and use the .spec.js suffix.
// Jest's testMatch patterns cover only tests/unit/, tests/directives/, and
// tests/integration/ — so tests/e2e/ is never discovered by Jest regardless
// of suffix. The .spec.js convention makes the distinction explicit.

module.exports = defineConfig({
  testDir: 'tests/e2e',

  // Runs once before all test suites to seed the E2E test user and create a
  // real session. Saves session_token cookie to tests/e2e/.auth/user.json so
  // authenticated test specs can load it via `use: { storageState: ... }`.
  globalSetup: require.resolve('./tests/e2e/globalSetup'),

  // Run tests sequentially — the shared server state makes parallelism risky
  // until authenticated session seeding and data isolation are in place.
  fullyParallel: false,
  workers: 1,

  // Retry once on CI to absorb transient server startup timing issues.
  retries: process.env.CI ? 1 : 0,

  reporter: [
    ['list'],
    ['json', { outputFile: 'tmp/playwright-results.json' }],
  ],

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    headless: true,
    // Capture traces on first retry so failures in CI can be inspected.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Starts the dev server before the test suite runs.
  // reuseExistingServer: true means if something is already listening on
  // port 3000 (e.g. `npm run dev` in another terminal) Playwright will not
  // start a second instance — it will reuse the running one.
  //
  // NOTE: `npm run dev` loads .env via --env-file. Ensure .env contains a
  // valid DATABASE_URL before running E2E tests that exercise authenticated
  // endpoints or any API that requires a database connection.
  webServer: {
    command: 'cross-env PROJECT_SOURCE=file npm run dev',
    url: 'http://localhost:3000/health',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
