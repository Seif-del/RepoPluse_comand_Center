'use strict';

const GITHUB_API = 'https://api.github.com';

// Conclusions that indicate the pipeline is unhealthy.
const FAILING_CONCLUSIONS = new Set(['failure', 'timed_out', 'cancelled']);

/**
 * Fetches the most recent GitHub Actions workflow runs for a repository and
 * derives a single CI status string.
 *
 * Returns 'passing' when every completed run concluded successfully,
 * 'failing' when at least one completed run has a failing conclusion, and
 * 'unknown' when there are no completed runs or the API call fails.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - 'owner/repo'
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @returns {Promise<'passing'|'failing'|'unknown'>}
 */
async function fetchCiStatus({ accessToken, fullName, fetchFn } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    const err = new Error('fetchCiStatus: accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  if (typeof fullName !== 'string' || !fullName.includes('/')) {
    const err = new Error('fetchCiStatus: fullName must be "owner/repo"');
    err.code = 'INVALID_FULL_NAME';
    throw err;
  }
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchCiStatus: fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const url = `${GITHUB_API}/repos/${fullName}/actions/runs?per_page=10`;
  let res;
  try {
    res = await fetchFn(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept:        'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
  } catch {
    return 'unknown';
  }

  if (!res.ok) return 'unknown';

  let data;
  try {
    data = await res.json();
  } catch {
    return 'unknown';
  }

  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  const completed = runs.filter(r => r.status === 'completed');

  if (completed.length === 0) return 'unknown';

  return completed.some(r => FAILING_CONCLUSIONS.has(r.conclusion))
    ? 'failing'
    : 'passing';
}

module.exports = { fetchCiStatus, FAILING_CONCLUSIONS };
