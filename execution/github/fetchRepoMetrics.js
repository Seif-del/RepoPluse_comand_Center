'use strict';

const GITHUB_API          = 'https://api.github.com';
const STALE_PR_DAYS       = 7;
const MS_PER_DAY          = 86_400_000;

/**
 * Fetches activity metrics for a single GitHub repository.
 * Makes three API calls: commits (since 7 days ago), pull requests, issues.
 *
 * @param {object}   params
 * @param {string}   params.accessToken  - Raw GitHub OAuth access token
 * @param {string}   params.fullName     - Repository in owner/repo format
 * @param {Function} params.fetchFn      - Fetch implementation (injected for testability)
 * @param {Date}     params.now          - Current time (used to compute the 7-day window)
 * @returns {Promise<{ commits7d, openPrs, stalePrs, openIssues, lastPushAt }>}
 * @throws {Error} code INVALID_ACCESS_TOKEN — accessToken not a non-empty string
 * @throws {Error} code INVALID_FULL_NAME    — fullName not owner/repo format
 * @throws {Error} code INVALID_FETCH_FN     — fetchFn not a function
 * @throws {Error} code INVALID_NOW          — now not a valid Date
 * @throws {Error} code GITHUB_API_ERROR     — non-OK response from GitHub
 */
async function fetchRepoMetrics({ accessToken, fullName, fetchFn, now } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) {
    const err = new Error('accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }

  if (typeof fullName !== 'string' || !fullName.includes('/')) {
    const err = new Error('fullName must be a string in owner/repo format');
    err.code = 'INVALID_FULL_NAME';
    throw err;
  }

  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  if (!(now instanceof Date) || isNaN(now.getTime())) {
    const err = new Error('now must be a valid Date object');
    err.code = 'INVALID_NOW';
    throw err;
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept:        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY).toISOString();

  const [commitsRes, prsRes, issuesRes] = await Promise.all([
    fetchFn(`${GITHUB_API}/repos/${fullName}/commits?since=${sevenDaysAgo}&per_page=100`, { headers }),
    fetchFn(`${GITHUB_API}/repos/${fullName}/pulls?state=open&per_page=100`, { headers }),
    fetchFn(`${GITHUB_API}/repos/${fullName}/issues?state=open&per_page=100`, { headers }),
  ]);

  for (const [name, res] of [['commits', commitsRes], ['pulls', prsRes], ['issues', issuesRes]]) {
    if (!res.ok) {
      const err = new Error(`GitHub API error fetching ${name} for ${fullName}`);
      err.code = 'GITHUB_API_ERROR';
      err.status = res.status;
      throw err;
    }
  }

  const [commits, prs, issuesRaw] = await Promise.all([
    commitsRes.json(),
    prsRes.json(),
    issuesRes.json(),
  ]);

  const staleThreshold = new Date(now.getTime() - STALE_PR_DAYS * MS_PER_DAY);
  const stalePrs = prs.filter(pr => new Date(pr.created_at) < staleThreshold).length;

  // GitHub /issues returns both issues and PRs — filter to issues only.
  const openIssues = issuesRaw.filter(i => !i.pull_request).length;

  // last push from the most recent commit
  let lastPushAt = null;
  if (Array.isArray(commits) && commits.length > 0 && commits[0].commit?.committer?.date) {
    lastPushAt = new Date(commits[0].commit.committer.date);
  }

  return {
    commits7d:  Array.isArray(commits) ? commits.length : 0,
    openPrs:    Array.isArray(prs)     ? prs.length     : 0,
    stalePrs,
    openIssues,
    lastPushAt,
  };
}

module.exports = { fetchRepoMetrics };
