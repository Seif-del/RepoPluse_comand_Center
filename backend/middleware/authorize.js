'use strict';

const { checkPermission } = require('../../execution/rbac/checkPermission');

/**
 * Middleware factory — returns a handler that gates a route on one capability.
 * Must run after authenticate (requires req.user to be populated).
 * All permission logic lives in checkPermission; none lives here.
 *
 * @param {string} requiredCapability - e.g. 'analytics:view'
 * @returns {import('express').RequestHandler}
 * @throws {TypeError} code INVALID_REQUIRED_CAPABILITY — requiredCapability is not a non-empty string
 */
function authorize(requiredCapability) {
  if (typeof requiredCapability !== 'string' || requiredCapability.trim().length === 0) {
    const err = new TypeError('requiredCapability must be a non-empty string');
    err.code = 'INVALID_REQUIRED_CAPABILITY';
    throw err;
  }

  return function (req, res, next) {
    if (!req.user) {
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      return next(err);
    }

    if (!req.user.role) {
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      return next(err);
    }

    let allowed;
    try {
      allowed = checkPermission({ role: req.user.role, capability: requiredCapability });
    } catch (err) {
      return next(err);
    }

    if (!allowed) {
      const err = new Error('Forbidden');
      err.code = 'FORBIDDEN';
      return next(err);
    }

    next();
  };
}

module.exports = authorize;
