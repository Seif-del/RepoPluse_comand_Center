'use strict';

const GITHUB_API      = 'https://api.github.com';
const BUS_FACTOR_PCT  = 75;   // threshold above which one contributor dominates
const LOW_ACTIVITY_MAX = 2;   // contributor count at or below which the repo is low-activity

const UNKNOWN_RESULT = Object.freeze({
  activeContributorCount:   null,
  topContributorPercentage: null,
  contributorStatus:        'unknown',
});

/**
 * Fetches contributor data from GitHub and derives a contributor health status.
 *
 * Status rules (evaluated in priority order):
 *   1. 'abandoned'       — no contributors returned
 *   2. 'bus_factor_risk' — top contributor owns > 75 % of total commits
 *   3. 'low_activity'    — 1–2 contributors (and no bus-factor)
 *   4. 'healthy'         — 3+ contributors, no single contributor > 75 %
 *   5. 'unknown'         — API unavailable or response unreadable
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - 'owner/repo'
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @returns {Promise<{
 *   activeContributorCount:   number|null,
 *   topContributorPercentage: number|null,
 *   contributorStatus: 'healthy'|'low_activity'|'bus_factor_risk'|'abandoned'|'unknown',
 * }>}
 */
async function fetchContributorInfo({ accessToken, fullName, fetchFn } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    const err = new Error('fetchContributorInfo: accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  if (typeof fullName !== 'string' || !fullName.includes('/')) {
    const err = new Error('fetchContributorInfo: fullName must be "owner/repo"');
    err.code = 'INVALID_FULL_NAME';
    throw err;
  }
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchContributorInfo: fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const url = `${GITHUB_API}/repos/${fullName}/contributors?per_page=100`;

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
    return { ...UNKNOWN_RESULT };
  }

  // 204 No Content means the repo is empty (no commits) — treat as abandoned.
  if (res.status === 204) {
    return { activeContributorCount: 0, topContributorPercentage: null, contributorStatus: 'abandoned' };
  }

  if (!res.ok) return { ...UNKNOWN_RESULT };

  let data;
  try {
    data = await res.json();
  } catch {
    return { ...UNKNOWN_RESULT };
  }

  if (!Array.isArray(data)) return { ...UNKNOWN_RESULT };

  const count = data.length;

  if (count === 0) {
    return { activeContributorCount: 0, topContributorPercentage: null, contributorStatus: 'abandoned' };
  }

  const totalCommits = data.reduce((sum, c) => sum + (typeof c.contributions === 'number' ? c.contributions : 0), 0);
  const topCommits   = typeof data[0].contributions === 'number' ? data[0].contributions : 0;

  const topContributorPercentage = totalCommits > 0
    ? parseFloat((topCommits / totalCommits * 100).toFixed(1))
    : null;

  let contributorStatus;
  if (topContributorPercentage !== null && topContributorPercentage > BUS_FACTOR_PCT) {
    contributorStatus = 'bus_factor_risk';
  } else if (count <= LOW_ACTIVITY_MAX) {
    contributorStatus = 'low_activity';
  } else {
    contributorStatus = 'healthy';
  }

  return { activeContributorCount: count, topContributorPercentage, contributorStatus };
}

module.exports = { fetchContributorInfo, BUS_FACTOR_PCT, LOW_ACTIVITY_MAX };
