'use strict';

const GITHUB_API = 'https://api.github.com';
const MAX_PAGES  = 50;

/**
 * Fetches all repositories the authenticated user can access from GitHub,
 * following Link-header pagination automatically.
 *
 * Includes repos the user owns, is an explicit collaborator on, and can
 * access via GitHub organization membership (affiliation=organization_member).
 * Without organization_member, org repos where the user is only a member
 * (not an explicit per-repo collaborator) are silently excluded.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @returns {Promise<Array<{ githubRepoId, fullName, isPrivate, pushedAt }>>}
 * @throws {Error} code INVALID_ACCESS_TOKEN — accessToken not a non-empty string
 * @throws {Error} code INVALID_FETCH_FN     — fetchFn not a function
 * @throws {Error} code GITHUB_REPOS_FETCH_FAILED — non-OK response from GitHub API
 */
async function fetchUserRepos({ accessToken, fetchFn } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    const err = new Error('accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }

  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const headers = {
    Authorization:          `Bearer ${accessToken}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const allRepos = [];
  let url   = `${GITHUB_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    pages++;
    const res = await fetchFn(url, { headers });

    if (!res.ok) {
      const err = new Error('GitHub repos fetch failed');
      err.code   = 'GITHUB_REPOS_FETCH_FAILED';
      err.status = res.status;
      throw err;
    }

    const batch = await res.json();

    if (!Array.isArray(batch)) {
      const err = new Error('GitHub repos response is not an array');
      err.code = 'GITHUB_REPOS_FETCH_FAILED';
      throw err;
    }

    allRepos.push(...batch);

    const linkHeader = res.headers && typeof res.headers.get === 'function'
      ? res.headers.get('link')
      : null;
    url = _parseNextLink(linkHeader);
  }

  return allRepos.map(r => ({
    githubRepoId: r.id,
    fullName:     r.full_name,
    isPrivate:    r.private === true,
    pushedAt:     r.pushed_at ? new Date(r.pushed_at) : null,
  }));
}

function _parseNextLink(linkHeader) {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

module.exports = { fetchUserRepos };
