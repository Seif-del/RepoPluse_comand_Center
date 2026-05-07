'use strict';

module.exports = {
  testEnvironment: 'node',

  // Default run: unit tests and directive validation only.
  // Integration tests are run separately via npm run test:integration.
  testMatch: [
    '**/tests/unit/**/*.test.js',
    '**/tests/directives/**/*.test.js',
  ],

  // Coverage is collected from execution/ and backend/ only.
  // Phase 1 MVP files live in execution sub-packages (auth/, audit/, rbac/)
  // and backend/ — all are enforced at 100% and must never be excluded.
  collectCoverageFrom: [
    'execution/**/*.js',
    'backend/**/*.js',

    // Infrastructure utilities — thin wrappers around pg/pino that cannot be
    // meaningfully unit-tested without a live database or I/O sink.
    '!execution/db.js',
    '!execution/logger.js',

    // Pre-MVP legacy scripts — file-based implementations that pre-date the
    // database-backed Phase 1 design. They read from the filesystem via
    // config/paths and are intentionally out of scope until Phase 2+ replaces
    // each one with a database-backed equivalent.
    '!execution/appendRepoHistorySnapshot.js',
    '!execution/appendSummarySnapshot.js',
    '!execution/fetchGithubProjects.js',
    '!execution/getProjectSummary.js',
    '!execution/getTrend.js',
    '!execution/managedRepos.js',
    '!execution/projects.js',
    '!execution/repoHistory.js',
    '!execution/summaryHistory.js',
    '!execution/syncGithubProjects.js',

    // Scratch/debug files — backend/tmp/ is always safe to delete (CLAUDE.md §tmp).
    '!backend/tmp/**/*.js',
  ],

  coverageDirectory: 'coverage',

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
