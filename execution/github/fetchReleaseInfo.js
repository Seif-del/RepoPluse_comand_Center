'use strict';

const GITHUB_API  = 'https://api.github.com';
const STALE_DAYS  = 90;
const MS_PER_DAY  = 86_400_000;

const UNKNOWN_RESULT = Object.freeze({
  latestReleaseName:       null,
  latestReleasePublishedAt: null,
  releaseStatus:           'unknown',
});

const NONE_RESULT = Object.freeze({
  latestReleaseName:       null,
  latestReleasePublishedAt: null,
  releaseStatus:           'none',
});

/**
 * Fetches the most recent GitHub Release for a repository and derives a
 * single release status string.
 *
 * Returns 'healthy' when the latest release is less than 90 days old,
 * 'stale' when 90+ days have passed since the latest release,
 * 'none' when the repository has no releases, and
 * 'unknown' when the API call fails or the response cannot be parsed.
 *
 * @param {object}   params
 * @param {string}   params.accessToken - Raw GitHub OAuth access token
 * @param {string}   params.fullName    - 'owner/repo'
 * @param {Function} params.fetchFn     - Fetch implementation (injected for testability)
 * @param {Date}     [params.now]       - Reference timestamp (defaults to new Date())
 * @returns {Promise<{
 *   latestReleaseName:       string|null,
 *   latestReleasePublishedAt: Date|null,
 *   releaseStatus:           'healthy'|'stale'|'none'|'unknown',
 * }>}
 */
async function fetchReleaseInfo({ accessToken, fullName, fetchFn, now } = {}) {
  if (typeof accessToken !== 'string' || accessToken.trim() === '') {
    const err = new Error('fetchReleaseInfo: accessToken must be a non-empty string');
    err.code = 'INVALID_ACCESS_TOKEN';
    throw err;
  }
  if (typeof fullName !== 'string' || !fullName.includes('/')) {
    const err = new Error('fetchReleaseInfo: fullName must be "owner/repo"');
    err.code = 'INVALID_FULL_NAME';
    throw err;
  }
  if (typeof fetchFn !== 'function') {
    const err = new Error('fetchReleaseInfo: fetchFn must be a function');
    err.code = 'INVALID_FETCH_FN';
    throw err;
  }

  const reference = now instanceof Date ? now : new Date();
  const url = `${GITHUB_API}/repos/${fullName}/releases?per_page=1`;

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

  if (!res.ok) return { ...UNKNOWN_RESULT };

  let data;
  try {
    data = await res.json();
  } catch {
    return { ...UNKNOWN_RESULT };
  }

  if (!Array.isArray(data)) return { ...UNKNOWN_RESULT };
  if (data.length === 0)   return { ...NONE_RESULT };

  const latest      = data[0];
  const releaseName = latest.tag_name || latest.name || null;
  const publishedAt = latest.published_at ? new Date(latest.published_at) : null;

  if (!publishedAt || isNaN(publishedAt.getTime())) {
    return {
      latestReleaseName:       releaseName,
      latestReleasePublishedAt: null,
      releaseStatus:           'unknown',
    };
  }

  const daysSince   = Math.floor((reference.getTime() - publishedAt.getTime()) / MS_PER_DAY);
  const releaseStatus = daysSince >= STALE_DAYS ? 'stale' : 'healthy';

  return {
    latestReleaseName:       releaseName,
    latestReleasePublishedAt: publishedAt,
    releaseStatus,
  };
}

module.exports = { fetchReleaseInfo, STALE_DAYS };
