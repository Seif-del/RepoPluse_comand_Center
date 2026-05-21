'use strict';

const GITHUB_API = 'https://api.github.com';

const STALE_DAYS     = 7;
const ABANDONED_DAYS = 30;
const WINDOW_DAYS    = 30;

const STALE_MS     = STALE_DAYS     * 24 * 60 * 60 * 1000;
const ABANDONED_MS = ABANDONED_DAYS * 24 * 60 * 60 * 1000;
const WINDOW_MS    = WINDOW_DAYS    * 24 * 60 * 60 * 1000;

const UNKNOWN_RESULT = Object.freeze({
  openPrCount:          null,
  mergedPrCount30d:     null,
  stalePrCount:         null,
  avgMergeLatencyHours: null,
  failedCheckPrCount:   null,
  avgPrSize:            null,
  throughput30d:        null,
  abandonedPrCount:     null,
  oldestOpenPrAgeDays:  null,
  prTelemetryStatus:    'unknown',
});

const NONE_RESULT = Object.freeze({
  openPrCount:          0,
  mergedPrCount30d:     0,
  stalePrCount:         0,
  avgMergeLatencyHours: null,
  failedCheckPrCount:   0,
  avgPrSize:            null,
  throughput30d:        0,
  abandonedPrCount:     0,
  oldestOpenPrAgeDays:  null,
  prTelemetryStatus:    'none',
});

function _headers(accessToken) {
  return {
    Authorization:          `Bearer ${accessToken}`,
    Accept:                 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

async function _fetchJson(fetchFn, url, accessToken) {
  let res;
  try {
    res = await fetchFn(url, { headers: _headers(accessToken) });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function _round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Fetches PR operational telemetry for a single repository.
 *
 * Designed for solo-maintainer portfolios: no review diversity penalties,
 * no reviewer participation signals, no unreviewed-merge penalties.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.owner       - GitHub organisation or user name
 * @param {string}   params.repo        - Repository name (without owner prefix)
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @param {object}   [params.opts]      - { _nowMs } — clock override for tests
 * @returns {Promise<{
 *   openPrCount:          number|null,
 *   mergedPrCount30d:     number|null,
 *   stalePrCount:         number|null,
 *   avgMergeLatencyHours: number|null,
 *   failedCheckPrCount:   number|null,
 *   avgPrSize:            number|null,
 *   throughput30d:        number|null,
 *   abandonedPrCount:     number|null,
 *   oldestOpenPrAgeDays:  number|null,
 *   prTelemetryStatus:    'active'|'none'|'unknown',
 * }>}
 */
async function fetchPullRequestHealth({ accessToken, owner, repo, fetchFn, opts } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    const err = new Error('fetchPullRequestHealth: accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  if (typeof owner !== 'string' || owner.trim() === '') {
    const err = new Error('fetchPullRequestHealth: owner must be a non-empty string');
    err.code = 'INVALID_OWNER';
    throw err;
  }
  if (typeof repo !== 'string' || repo.trim() === '') {
    const err = new Error('fetchPullRequestHealth: repo must be a non-empty string');
    err.code = 'INVALID_REPO';
    throw err;
  }
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchPullRequestHealth: fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const nowMs     = (opts && opts._nowMs != null) ? opts._nowMs : Date.now();
  const windowCutoff = new Date(nowMs - WINDOW_MS).toISOString();
  const base      = `${GITHUB_API}/repos/${owner}/${repo}`;

  // ── Fetch open PRs ─────────────────────────────────────────────────────────
  const openPrs = await _fetchJson(
    fetchFn,
    `${base}/pulls?state=open&per_page=100`,
    accessToken
  );
  if (openPrs === null) return { ...UNKNOWN_RESULT };
  if (!Array.isArray(openPrs)) return { ...UNKNOWN_RESULT };

  // ── Fetch recently closed PRs (last 30 days window approximated by per_page=100) ─
  const closedPrs = await _fetchJson(
    fetchFn,
    `${base}/pulls?state=closed&per_page=100&sort=updated&direction=desc`,
    accessToken
  );
  if (closedPrs === null) return { ...UNKNOWN_RESULT };
  if (!Array.isArray(closedPrs)) return { ...UNKNOWN_RESULT };

  // ── Empty portfolio: no open or closed PRs ─────────────────────────────────
  if (openPrs.length === 0 && closedPrs.length === 0) {
    return { ...NONE_RESULT };
  }

  // ── Open PR metrics ────────────────────────────────────────────────────────
  let stalePrCount       = 0;
  let abandonedPrCount   = 0;
  let oldestOpenAgeMs    = 0;

  for (const pr of openPrs) {
    const createdMs = pr.created_at ? new Date(pr.created_at).getTime() : nowMs;
    const ageMs     = nowMs - createdMs;
    if (ageMs > oldestOpenAgeMs) oldestOpenAgeMs = ageMs;
    if (ageMs > ABANDONED_MS) {
      abandonedPrCount++;
    } else if (ageMs > STALE_MS) {
      stalePrCount++;
    }
  }

  const oldestOpenPrAgeDays = openPrs.length > 0
    ? _round1(oldestOpenAgeMs / (24 * 60 * 60 * 1000))
    : null;

  // ── Closed (merged) PR metrics within 30-day window ───────────────────────
  const mergedInWindow = closedPrs.filter(pr => {
    if (!pr.merged_at) return false;
    return pr.merged_at >= windowCutoff;
  });

  const mergedPrCount30d = mergedInWindow.length;

  // avg merge latency: time from created_at to merged_at
  let totalLatencyMs = 0;
  let latencyCount   = 0;
  for (const pr of mergedInWindow) {
    if (pr.created_at && pr.merged_at) {
      const latency = new Date(pr.merged_at).getTime() - new Date(pr.created_at).getTime();
      if (latency >= 0) {
        totalLatencyMs += latency;
        latencyCount++;
      }
    }
  }
  const avgMergeLatencyHours = latencyCount > 0
    ? _round1(totalLatencyMs / latencyCount / (60 * 60 * 1000))
    : null;

  // throughput: merged PRs per week over the 30-day window
  const throughput30d = _round1(mergedPrCount30d / (WINDOW_DAYS / 7));

  // ── PR size (additions + deletions) from closed PRs that have size fields ──
  const prsWithSize = [...openPrs, ...mergedInWindow].filter(
    pr => typeof pr.additions === 'number' && typeof pr.deletions === 'number'
  );
  const avgPrSize = prsWithSize.length > 0
    ? Math.round(prsWithSize.reduce((sum, pr) => sum + pr.additions + pr.deletions, 0) / prsWithSize.length)
    : null;

  // ── Failed check PRs: count open PRs whose head SHA check suites include a failure ──
  // Check-run data requires an extra call per PR; only fetch if there are open PRs and
  // the list is manageable. Cap at first 10 to limit API usage.
  let failedCheckPrCount = 0;
  const prsToCheck = openPrs.slice(0, 10);
  for (const pr of prsToCheck) {
    const sha = pr.head && pr.head.sha;
    if (!sha) continue;
    const checkRuns = await _fetchJson(
      fetchFn,
      `${base}/commits/${sha}/check-runs?per_page=100`,
      accessToken
    );
    if (!checkRuns || !Array.isArray(checkRuns.check_runs)) continue;
    const hasFailed = checkRuns.check_runs.some(
      cr => cr.conclusion === 'failure' || cr.conclusion === 'timed_out'
    );
    if (hasFailed) failedCheckPrCount++;
  }

  return {
    openPrCount:          openPrs.length,
    mergedPrCount30d,
    stalePrCount,
    avgMergeLatencyHours,
    failedCheckPrCount,
    avgPrSize,
    throughput30d,
    abandonedPrCount,
    oldestOpenPrAgeDays,
    prTelemetryStatus:    'active',
  };
}

module.exports = {
  fetchPullRequestHealth,
  STALE_DAYS,
  ABANDONED_DAYS,
  WINDOW_DAYS,
};
