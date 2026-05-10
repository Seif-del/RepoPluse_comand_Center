'use strict';

const express                   = require('express');
const crypto                    = require('crypto');
const { logEvent }              = require('../../execution/audit/logEvent');
const { exchangeOAuthCode }     = require('../../execution/auth/exchangeOAuthCode');
const { upsertUser }            = require('../../execution/auth/upsertUser');
const { createSession }         = require('../../execution/auth/createSession');
const { invalidateSession }     = require('../../execution/auth/invalidateSession');
const { encrypt }               = require('../../execution/crypto/encryptToken');

const router = express.Router();

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';

// GET /github
// Builds and issues a redirect to the GitHub OAuth authorization page.
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

// GET /github/callback
// GitHub redirects here after the user authorises the OAuth app.
// Exchanges the code, encrypts and stores the access token, upserts the user,
// creates a session, and redirects to the dashboard.
router.get('/github/callback', async (req, res, next) => {
  const code = req.query && req.query.code;

  if (!code) {
    const err = new Error('OAuth callback code is required');
    err.code = 'INVALID_OAUTH_CODE';
    return next(err);
  }

  const appConfig = req.app.locals.config;
  const github    = appConfig && appConfig.github;

  if (
    !github                       ||
    !github.clientId              ||
    !github.clientSecret          ||
    !github.callbackUrl           ||
    !appConfig.sessionExpiryHours ||
    !appConfig.defaultUserRole
  ) {
    const err = new Error('OAuth configuration is invalid');
    err.code = 'INVALID_OAUTH_CONFIG';
    return next(err);
  }

  const fetchFn = req.app.locals.fetchFn ||
    (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

  if (typeof fetchFn !== 'function') {
    const err = new Error('No fetch implementation available');
    err.code = 'FETCH_NOT_AVAILABLE';
    return next(err);
  }

  try {
    const oauthResult = await exchangeOAuthCode({
      code,
      clientId:     github.clientId,
      clientSecret: github.clientSecret,
      callbackUrl:  github.callbackUrl,
      fetchFn,
    });

    // Encrypt the access token before storage. Falls back to null when no
    // encryption key is configured (development without env vars set).
    let accessTokenEnc = null;
    if (appConfig.tokenEncryptionKey) {
      accessTokenEnc = encrypt(oauthResult.accessToken, appConfig.tokenEncryptionKey);
    }

    const now = new Date();

    const user = await upsertUser({
      db:             req.app.locals.db,
      githubId:       oauthResult.githubId,
      githubUsername: oauthResult.githubUsername,
      email:          oauthResult.email,
      defaultRole:    appConfig.defaultUserRole,
      accessTokenEnc,
      now,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');

    const session = await createSession({
      db:                 req.app.locals.db,
      userId:             String(user.userId),
      rawToken,
      now,
      sessionExpiryHours: appConfig.sessionExpiryHours,
    });

    res.cookie('session_token', rawToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   false,
      maxAge:   appConfig.sessionExpiryHours * 60 * 60 * 1000,
    });

    logEvent({
      db:           req.app.locals.db,
      actorId:      String(user.userId),
      action:       'user.login',
      resourceType: 'session',
      resourceId:   String(session.id),
      metadata:     { githubUsername: user.githubUsername },
      now,
    }).catch(() => {});

    res.redirect(appConfig.postLoginRedirectPath || '/dashboard');
  } catch (err) {
    next(err);
  }
});

// POST /logout
// Deletes the session row, clears the cookie, and fires an audit event.
router.post('/logout', async (req, res, next) => {
  if (!req.user || !req.session) {
    const err = new Error('Unauthorized');
    err.code = 'UNAUTHORIZED';
    return next(err);
  }

  try {
    await invalidateSession({
      db:        req.app.locals.db,
      sessionId: String(req.session.sessionId),
    });

    if (res.clearCookie) {
      res.clearCookie('session_token');
    }

    logEvent({
      db:           req.app.locals.db,
      actorId:      String(req.user.userId),
      action:       'user.logout',
      resourceType: 'session',
      resourceId:   String(req.session.sessionId),
      metadata:     {},
      now:          new Date(),
    }).catch(() => {});

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
