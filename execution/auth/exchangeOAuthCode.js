'use strict';

const TOKEN_ENDPOINT   = 'https://github.com/login/oauth/access_token';
const PROFILE_ENDPOINT = 'https://api.github.com/user';

/**
 * Exchanges a GitHub OAuth authorization code for an access token,
 * then fetches the authenticated user's GitHub profile.
 *
 * All HTTP is performed through the injected fetchFn — never global fetch.
 * No process.env, config, DB, or session access.
 *
 * @param {object}   params
 * @param {string}   params.code         - GitHub authorization code (non-empty string)
 * @param {string}   params.clientId     - GitHub OAuth app client ID (non-empty string)
 * @param {string}   params.clientSecret - GitHub OAuth app client secret (non-empty string)
 * @param {string}   params.callbackUrl  - OAuth redirect URI; must start with http:// or https://
 * @param {Function} params.fetchFn      - fetch-compatible function used for all HTTP calls
 * @returns {Promise<{ accessToken, githubId, githubUsername, email }>}
 * @throws {Error} code INVALID_OAUTH_CODE          — code is not a non-empty string
 * @throws {Error} code INVALID_CLIENT_ID           — clientId is not a non-empty string
 * @throws {Error} code INVALID_CLIENT_SECRET       — clientSecret is not a non-empty string
 * @throws {Error} code INVALID_CALLBACK_URL        — callbackUrl is not an http/https URL
 * @throws {Error} code INVALID_FETCH_FN            — fetchFn is not a function
 * @throws {Error} code OAUTH_TOKEN_EXCHANGE_FAILED — token endpoint did not return an access_token
 * @throws {Error} code GITHUB_PROFILE_FETCH_FAILED — user profile request failed
 * @throws {Error} code INVALID_GITHUB_PROFILE      — profile response is missing id or login
 */
async function exchangeOAuthCode({ code, clientId, clientSecret, callbackUrl, fetchFn } = {}) {
  if (typeof code !== 'string' || code.trim().length === 0) {
    const err = new Error('code must be a non-empty string');
    err.code = 'INVALID_OAUTH_CODE';
    throw err;
  }

  if (typeof clientId !== 'string' || clientId.trim().length === 0) {
    const err = new Error('clientId must be a non-empty string');
    err.code = 'INVALID_CLIENT_ID';
    throw err;
  }

  if (typeof clientSecret !== 'string' || clientSecret.trim().length === 0) {
    const err = new Error('clientSecret must be a non-empty string');
    err.code = 'INVALID_CLIENT_SECRET';
    throw err;
  }

  if (typeof callbackUrl !== 'string' || !/^https?:\/\//.test(callbackUrl)) {
    const err = new Error('callbackUrl must start with http:// or https://');
    err.code = 'INVALID_CALLBACK_URL';
    throw err;
  }

  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  // Step 1 — exchange authorization code for access token
  const tokenRes = await fetchFn(TOKEN_ENDPOINT, {
    method:  'POST',
    headers: {
      'Accept':       'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_id:     clientId,
      client_secret: clientSecret,
      code,
      redirect_uri:  callbackUrl,
    }),
  });

  if (!tokenRes.ok) {
    const err = new Error('GitHub token exchange failed');
    err.code = 'OAUTH_TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  const tokenData   = await tokenRes.json();
  const accessToken = tokenData.access_token;

  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    const err = new Error('GitHub token exchange failed');
    err.code = 'OAUTH_TOKEN_EXCHANGE_FAILED';
    throw err;
  }

  // Step 2 — fetch the authenticated user's GitHub profile
  const profileRes = await fetchFn(PROFILE_ENDPOINT, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept':        'application/vnd.github+json',
    },
  });

  if (!profileRes.ok) {
    const err = new Error('GitHub profile fetch failed');
    err.code = 'GITHUB_PROFILE_FETCH_FAILED';
    throw err;
  }

  const profile = await profileRes.json();

  if (!profile || !profile.id || !profile.login) {
    const err = new Error('GitHub profile is invalid');
    err.code = 'INVALID_GITHUB_PROFILE';
    throw err;
  }

  return {
    accessToken,
    githubId:       profile.id,
    githubUsername: profile.login,
    email:          profile.email ?? null,
  };
}

module.exports = { exchangeOAuthCode };
