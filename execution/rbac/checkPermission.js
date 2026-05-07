'use strict';

const { ROLE_CAPABILITIES } = require('./roles');

/**
 * Returns true if the given role holds the required capability, false otherwise.
 * Never throws for unknown roles or capabilities — fails closed (returns false).
 * Pure and synchronous; no I/O, no side effects.
 *
 * @param {object} params
 * @param {string} params.role       - Role string (e.g. 'project_manager')
 * @param {string} params.capability - Capability string (e.g. 'projects:view')
 * @returns {boolean}
 * @throws {Error} code INVALID_ROLE       — role is not a non-empty string
 * @throws {Error} code INVALID_CAPABILITY — capability is not a non-empty string
 */
function checkPermission({ role, capability } = {}) {
  if (typeof role !== 'string' || role.trim().length === 0) {
    const err = new Error('role must be a non-empty string');
    err.code = 'INVALID_ROLE';
    throw err;
  }

  if (typeof capability !== 'string' || capability.trim().length === 0) {
    const err = new Error('capability must be a non-empty string');
    err.code = 'INVALID_CAPABILITY';
    throw err;
  }

  const capabilities = ROLE_CAPABILITIES[role];

  // Unknown role — fail closed.
  if (!capabilities) return false;

  // Unknown capability — Set.has returns false; fail closed.
  return capabilities.has(capability);
}

module.exports = { checkPermission };
