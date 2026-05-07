'use strict';

const { validateSession } = require('../../execution/auth/validateSession');

/**
 * Express middleware — validates the session token on every protected request.
 * Reads the raw token from the Authorization header (Bearer scheme) first,
 * falling back to the session_token cookie. Delegates all validation logic
 * to execution/auth/validateSession.js — no session logic lives here.
 *
 * On success: sets req.session and req.user, then calls next().
 * On failure: calls next(err) with the original error — never sends a response.
 */
async function authenticate(req, res, next) {
  let rawToken = null;

  // Authorization header takes priority over cookie.
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.split(' ');
    if (parts[0] === 'Bearer' && parts.length === 2 && parts[1]) {
      rawToken = parts[1];
    }
  }

  // Fall back to cookie if no valid Bearer token was found.
  if (!rawToken) {
    rawToken = (req.cookies && req.cookies.session_token) || null;
  }

  if (!rawToken) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    return next(err);
  }

  try {
    const session = await validateSession({
      db:                 req.app.locals.db,
      rawToken,
      now:                new Date(),
      sessionExpiryHours: req.app.locals.config?.sessionExpiryHours,
    });

    req.session = { sessionId: session.sessionId, expiresAt: session.expiresAt };
    req.user    = { userId: session.userId, role: session.role, githubUsername: session.githubUsername };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;
