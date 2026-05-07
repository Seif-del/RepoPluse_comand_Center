'use strict';

// tests/fixtures/users.js
// Static user objects representing each of the four roles.
// Used across unit and integration tests.
// All data is fictional — no real GitHub accounts.

const { ROLES } = require('../../execution/rbac/roles');

const users = {
  projectManager: {
    id: 1,
    github_id: 10001,
    github_username: 'pm-test-user',
    email: 'pm@example.com',
    role: ROLES.PROJECT_MANAGER,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    deleted_at: null,
  },

  intern: {
    id: 2,
    github_id: 10002,
    github_username: 'intern-test-user',
    email: 'intern@example.com',
    role: ROLES.INTERN,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    deleted_at: null,
  },

  stakeholder: {
    id: 3,
    github_id: 10003,
    github_username: 'stakeholder-test-user',
    email: 'stakeholder@example.com',
    role: ROLES.STAKEHOLDER,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    deleted_at: null,
  },

  complianceAuditor: {
    id: 4,
    github_id: 10004,
    github_username: 'auditor-test-user',
    email: 'auditor@example.com',
    role: ROLES.COMPLIANCE_AUDITOR,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
    deleted_at: null,
  },

  // Soft-deleted user — used to test that sessions cannot be created for deleted accounts.
  softDeleted: {
    id: 5,
    github_id: 10005,
    github_username: 'deleted-test-user',
    email: 'deleted@example.com',
    role: ROLES.INTERN,
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-06-01T00:00:00Z'),
    deleted_at: new Date('2024-06-01T00:00:00Z'),
  },
};

module.exports = users;
