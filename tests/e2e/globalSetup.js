'use strict';

// Playwright globalSetup — runs once before any test suite.
//
// Creates a real database session for the E2E test user and writes the
// session_token cookie into a Playwright storageState file so authenticated
// test specs can load it via:
//
//   use: { storageState: 'tests/e2e/.auth/user.json' }
//
// No server-side backdoor. The authenticate middleware sees the real cookie
// and calls validateSession() against the DB — the full auth path runs.
//
// Prerequisites:
//   - DATABASE_URL or TEST_DATABASE_URL must point at a safe local/test DB
//     (URL must contain "test", "local", or "localhost")
//   - Migrations must already be applied to that database
//
// Run via:  npm run test:e2e  (Playwright invokes this automatically)
// Or test directly:  node tests/e2e/globalSetup.js

const crypto = require('crypto');
const fs     = require('fs');
const path   = require('path');

const { createTestPool, closeTestPool } = require('../integration/helpers/dbTestHelper');
const { upsertUser }    = require('../../execution/auth/upsertUser');
const { createSession } = require('../../execution/auth/createSession');

const SAFE_PATTERNS = ['test', 'local', 'localhost'];
const AUTH_DIR      = path.resolve(__dirname, '.auth');
const STATE_PATH    = path.join(AUTH_DIR, 'user.json');

// Non-destructive .env loader — existing process env vars always win.
// Playwright's test runner does not auto-load .env (unlike `node --env-file`),
// so globalSetup loads it explicitly when the file is present.
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

async function globalSetup() {
  loadDotEnv();

  const dbUrl  = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL || '';
  const isSafe = SAFE_PATTERNS.some((p) => dbUrl.toLowerCase().includes(p));

  if (!dbUrl) {
    throw new Error(
      '[globalSetup] No database URL found.\n' +
      '  Set TEST_DATABASE_URL or DATABASE_URL (in .env or environment) before running E2E tests.\n' +
      '  Example: postgres://postgres@localhost:5432/repopulse_test',
    );
  }

  if (!isSafe) {
    throw new Error(
      '[globalSetup] SAFETY BLOCK: The resolved database URL does not contain ' +
      '"test", "local", or "localhost".\n' +
      `  URL: "${dbUrl}"\n` +
      '  E2E tests must connect to a local or test database only.',
    );
  }

  const pool = createTestPool(dbUrl);

  try {
    const now              = new Date();
    const sessionExpiryHours = 24;

    const user = await upsertUser({
      db:             pool,
      githubId:       99001,
      githubUsername: 'e2e-test-user',
      email:          'e2e@test.local',
      defaultRole:    'intern',
      now,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');

    const session = await createSession({
      db:   pool,
      userId: String(user.userId),
      rawToken,
      now,
      sessionExpiryHours,
    });

    fs.mkdirSync(AUTH_DIR, { recursive: true });

    const expiresUnix = Math.floor(new Date(session.expires_at).getTime() / 1000);

    // Playwright storageState format — consumed by test specs that declare
    //   use: { storageState: 'tests/e2e/.auth/user.json' }
    const storageState = {
      cookies: [
        {
          name:     'session_token',
          value:    rawToken,
          domain:   'localhost',
          path:     '/',
          expires:  expiresUnix,
          httpOnly: true,
          secure:   false,
          sameSite: 'Lax',
        },
      ],
      origins: [],
    };

    fs.writeFileSync(STATE_PATH, JSON.stringify(storageState, null, 2), 'utf8');

    console.log(
      `[globalSetup] Session created → userId=${user.userId} (${user.githubUsername}), ` +
      `expires=${new Date(session.expires_at).toISOString()}, ` +
      `state → ${STATE_PATH}`,
    );
  } finally {
    await closeTestPool(pool);
  }
}

module.exports = globalSetup;

// Allow direct invocation for smoke-testing the setup step:
//   node tests/e2e/globalSetup.js
if (require.main === module) {
  globalSetup().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
