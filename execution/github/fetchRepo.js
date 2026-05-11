'use strict';

const GITHUB_API = 'https://api.github.com';

/**
 * Fetches metadata for a single GitHub repository by full name (owner/repo).
 * Used to obtain the stable numeric github_repo_id before inserting into the DB.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - "owner/repo" string
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @returns {Promise<{ githubRepoId: number, fullName: string }>}
 * @throws {Error} code INVALID_ACCESS_TOKEN    — accessToken not a non-empty string
 * @throws {Error} code INVALID_ARGUMENT        — fullName not a non-empty string
 * @throws {Error} code INVALID_FETCH_FN        — fetchFn not a function
 * @throws {Error} code REPO_NOT_FOUND          — GitHub returned 404
 * @throws {Error} code GITHUB_REPO_FETCH_FAILED — any other non-OK response
 */
async function fetchRepo({ accessToken, fullName, fetchFn } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    const err = new Error('accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }

  if (typeof fullName !== 'string' || fullName.trim().length === 0) {
    const err = new Error('fullName must be a non-empty string');
    err.code = 'INVALID_ARGUMENT';
    throw err;
  }

  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const res = await fetchFn(`${GITHUB_API}/repos/${fullName}`, {
    headers: {
      Authorization:          `Bearer ${accessToken}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.status === 404) {
    const err = new Error(`Repository not found: ${fullName}`);
    err.code = 'REPO_NOT_FOUND';
    throw err;
  }

  if (!res.ok) {
    const err = new Error('GitHub repo fetch failed');
    err.code = 'GITHUB_REPO_FETCH_FAILED';
    err.status = res.status;
    throw err;
  }

  const data = await res.json();

  return {
    githubRepoId: data.id,
    fullName:     data.full_name,
  };
}

module.exports = { fetchRepo };
