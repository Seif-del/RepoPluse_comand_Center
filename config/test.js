'use strict';

// config/test.js
// Applied automatically when NODE_ENV=test.
// Disables all external side effects so tests never send real emails,
// make real HTTP calls, or write to production infrastructure.

module.exports = {
  // Never send real emails during tests.
  // Notification modules check this flag before calling the email provider.
  emailDispatchEnabled: false,

  // Use a dedicated test database to avoid polluting dev data.
  // Reads TEST_DATABASE_URL from env; falls back to a local default.
  databaseUrl: process.env.TEST_DATABASE_URL || 'postgres://repopulse:password@localhost:5432/repopulse_test',

  // Reduce log noise during test runs.
  logLevel: 'error',
};
