'use strict';

// execution/rbac/roles.js
// Defines all user roles and their permitted capabilities.
// This is a data definition — not logic.
// Roles are stable for MVP; they live here as constants, not in the database.
// All RBAC decisions reference this file as the single source of truth.

const ROLES = Object.freeze({
  PROJECT_MANAGER:    'project_manager',
  INTERN:             'intern',
  STAKEHOLDER:        'stakeholder',
  COMPLIANCE_AUDITOR: 'compliance_auditor',
});

// Maps each role to the set of capabilities it holds.
// Capability strings follow the pattern: resource:action
// checkPermission.js evaluates these sets — do not add logic here.
const ROLE_CAPABILITIES = Object.freeze({
  [ROLES.PROJECT_MANAGER]: new Set([
    'projects:view',
    'projects:configure',
    'repositories:configure',
    'analytics:view',
    'risk:view',
    'recommendations:view',
    'interns:manage',
    'notifications:receive',
    'dashboard:view',
  ]),

  [ROLES.INTERN]: new Set([
    'projects:view',
    'metrics:view',
    'feedback:view',
    'activity:view',
    'dashboard:view',
  ]),

  [ROLES.STAKEHOLDER]: new Set([
    'dashboard:view',
    'analytics:summary:view',
    'projects:status:view',
  ]),

  [ROLES.COMPLIANCE_AUDITOR]: new Set([
    'audit:view',
    'access-history:view',
    'permissions:view',
  ]),
});

module.exports = { ROLES, ROLE_CAPABILITIES };
