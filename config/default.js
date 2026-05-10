'use strict';

// config/default.js
// Non-sensitive default values shared across all environments.
// No secrets. No hardcoded credentials.
// Sensitive values (DB URL, API keys) are read from process.env in
// environment-specific config files, not here.

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  // Database — resolved from DATABASE_URL env var; null when unset (Phase 1 default).
  databaseUrl: process.env.DATABASE_URL || null,

  // GitHub OAuth — wired from GITHUB_* env vars set in .env.
  github: {
    clientId:     process.env.GITHUB_CLIENT_ID     || null,
    clientSecret: process.env.GITHUB_CLIENT_SECRET || null,
    callbackUrl:  process.env.GITHUB_CALLBACK_URL  || null,
    scopes:       ['read:user', 'user:email', 'repo'],
  },

  // Auth defaults
  defaultUserRole:       'project_manager',
  postLoginRedirectPath: '/dashboard',

  // Session
  sessionExpiryHours: 24,

  // Background job retry policy (Phase 3+)
  maxJobRetries: 5,
  jobRetryBaseDelayMs: 1000, // Workers apply exponential backoff from this base.

  // Dashboard polling interval in milliseconds (Phase 3+)
  pollingIntervalMs: 60_000,

  // AI analysis thresholds (Phase 5+)
  minSnapshotsForFullConfidence: 28,

  // Token encryption — TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).
  // Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || null,

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Email dispatch — enabled by default, overridden to false in test config
  emailDispatchEnabled: true,
};
