'use strict';

const express      = require('express');
const { logEvent } = require('../../execution/audit/logEvent');

const router = express.Router();

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

// GET /github
// Builds and issues a redirect to the GitHub OAuth authorization page.
// config is read from req.app.locals.config.github (set during app bootstrap).
router.get('/github', (req, res, next) => {
  const config = req.app.locals.config && req.app.locals.config.github;

  if (!config || !config.clientId || !config.callbackUrl || !config.scopes) {
    const err = new Error('OAuth configuration is invalid');
    err.code = 'INVALID_OAUTH_CONFIG';
    return next(err);
  }

  const scope = Array.isArray(config.scopes)
    ? config.scopes.join(' ')
    : config.scopes;

  const url = new URL(GITHUB_AUTHORIZE_URL);
  url.searchParams.set('client_id',    config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('scope',        scope);

  res.redirect(url.toString());
});

// GET /callback
// GitHub redirects here after the user authorises the OAuth app.
// Token exchange is deferred until execution/auth/exchangeOAuthCode.js exists.
router.get('/callback', (req, res, next) => {
  const code = req.query && req.query.code;

  if (!code) {
    const err = new Error('OAuth callback code is required');
    err.code = 'INVALID_OAUTH_CODE';
    return next(err);
  }

  const err = new Error('GitHub OAuth callback exchange is not implemented');
  err.code = 'NOT_IMPLEMENTED';
  next(err);
});

// POST /logout
// Writes an audit event then clears the session cookie.
// Session row invalidation is deferred to execution/auth/invalidateSession.js.
router.post('/logout', async (req, res, next) => {
  if (!req.user || !req.session) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    return next(err);
  }

  try {
    await logEvent({
      db:           req.app.locals.db,
      actorId:      req.user.userId,
      action:       'user.logout',
      resourceType: 'session',
      resourceId:   req.session.sessionId,
      metadata:     {},
      now:          new Date(),
    });

    if (res.clearCookie) {
      res.clearCookie('session_token');
    }

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
