'use strict';

const GITHUB_API = 'https://api.github.com';

/**
 * Fetches the authenticated user's GitHub repositories (up to 100, sorted by most recently updated).
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

  const url = `${GITHUB_API}/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator`;

  const res = await fetchFn(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept:        'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!res.ok) {
    const err = new Error('GitHub repos fetch failed');
    err.code = 'GITHUB_REPOS_FETCH_FAILED';
    err.status = res.status;
    throw err;
  }

  const repos = await res.json();

  if (!Array.isArray(repos)) {
    const err = new Error('GitHub repos response is not an array');
    err.code = 'GITHUB_REPOS_FETCH_FAILED';
    throw err;
  }

  return repos.map(r => ({
    githubRepoId: r.id,
    fullName:     r.full_name,
    isPrivate:    r.private === true,
    pushedAt:     r.pushed_at ? new Date(r.pushed_at) : null,
  }));
}

module.exports = { fetchUserRepos };
