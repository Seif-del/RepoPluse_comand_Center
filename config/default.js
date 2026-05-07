'use strict';

// config/default.js
// Non-sensitive default values shared across all environments.
// No secrets. No hardcoded credentials.
// Sensitive values (DB URL, API keys) are read from process.env in
// environment-specific config files, not here.

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,

  // Session
  sessionExpiryHours: 24,

  // Background job retry policy (Phase 3+)
  maxJobRetries: 5,
  jobRetryBaseDelayMs: 1000, // Workers apply exponential backoff from this base.

  // Dashboard polling interval in milliseconds (Phase 3+)
  pollingIntervalMs: 60_000,

  // AI analysis thresholds (Phase 5+)
  minSnapshotsForFullConfidence: 28,

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Email dispatch — enabled by default, overridden to false in test config
  emailDispatchEnabled: true,
};
