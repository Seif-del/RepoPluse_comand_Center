'use strict';

const { fetchUserRepos }      = require('./fetchUserRepos');
const { fetchRepoMetrics }    = require('./fetchRepoMetrics');
const { fetchCiStatus }       = require('./fetchCiStatus');
const { fetchReleaseInfo }    = require('./fetchReleaseInfo');
const { fetchContributorInfo } = require('./fetchContributorInfo');
const { scoreRepo }           = require('../risk/scoreRepo');

const MS_PER_DAY = 86_400_000;

/**
 * Orchestrates a full sync cycle for one user:
 *   1. Fetch their repos from GitHub
 *   2. Upsert each repo in the repositories table
 *   3. Fetch metrics per repo
 *   4. Insert repo_metrics snapshot
 *   5. Compute risk score (with trend from previous score)
 *   6. Insert risk_scores row
 *   7. Update repositories.last_synced_at
 *
 * @param {object}   params
 * @param {object}   params.db           - pg pool instance
 * @param {number}   params.userId       - RepoPulse user ID (users.id)
 * @param {string}   params.accessToken  - Raw GitHub OAuth access token
 * @param {Function} params.fetchFn      - Fetch implementation
 * @param {Date}     params.now          - Current timestamp
 * @returns {Promise<{ synced: number, errors: Array<{ fullName, message }> }>}
 */
async function syncUserRepos({ db, userId, accessToken, fetchFn, now } = {}) {
  const repos = await fetchUserRepos({ accessToken, fetchFn });

  let synced = 0;
  const errors = [];

  for (const repo of repos) {
    try {
      // Upsert repository row
      const repoRow = await _upsertRepository({ db, userId, repo, now });

      // Fetch metrics, CI status, release info, and contributor info in parallel
      const UNKNOWN_RELEASE      = { latestReleaseName: null, latestReleasePublishedAt: null, releaseStatus: 'unknown' };
      const UNKNOWN_CONTRIBUTORS = { activeContributorCount: null, topContributorPercentage: null, contributorStatus: 'unknown' };
      const [metrics, ciStatus, releaseInfo, contributorInfo] = await Promise.all([
        fetchRepoMetrics({ accessToken, fullName: repo.fullName, fetchFn, now }),
        fetchCiStatus({ accessToken, fullName: repo.fullName, fetchFn }).catch(() => 'unknown'),
        fetchReleaseInfo({ accessToken, fullName: repo.fullName, fetchFn, now }).catch(() => UNKNOWN_RELEASE),
        fetchContributorInfo({ accessToken, fullName: repo.fullName, fetchFn }).catch(() => UNKNOWN_CONTRIBUTORS),
      ]);

      // Insert metrics snapshot
      await db.query(
        `INSERT INTO repo_metrics
           (repo_id, snapshot_at, commits_7d, open_prs, stale_prs, open_issues, last_push_at,
            ci_status, latest_release_name, latest_release_published_at, release_status,
            active_contributor_count, top_contributor_percentage, contributor_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          repoRow.id,
          now,
          metrics.commits7d,
          metrics.openPrs,
          metrics.stalePrs,
          metrics.openIssues,
          metrics.lastPushAt,
          ciStatus,
          releaseInfo.latestReleaseName,
          releaseInfo.latestReleasePublishedAt,
          releaseInfo.releaseStatus,
          contributorInfo.activeContributorCount,
          contributorInfo.topContributorPercentage,
          contributorInfo.contributorStatus,
        ]
      );

      // Fetch previous score for trend calculation
      const prevResult = await db.query(
        `SELECT score FROM risk_scores
         WHERE repo_id = $1
         ORDER BY snapshot_at DESC
         LIMIT 1`,
        [repoRow.id]
      );
      const previousScore = prevResult.rows.length > 0 ? prevResult.rows[0].score : null;

      // Compute days since last push
      const daysSincePush = metrics.lastPushAt
        ? Math.floor((now.getTime() - metrics.lastPushAt.getTime()) / MS_PER_DAY)
        : null;

      const { score, label, trend, factors } = scoreRepo({
        commits7d:     metrics.commits7d,
        openPrs:       metrics.openPrs,
        stalePrs:      metrics.stalePrs,
        openIssues:    metrics.openIssues,
        daysSincePush,
        previousScore,
      });

      // Insert risk score snapshot
      await db.query(
        `INSERT INTO risk_scores
           (repo_id, snapshot_at, score, label, trend, factors)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [repoRow.id, now, score, label, trend, JSON.stringify(factors)]
      );

      // Mark last synced
      await db.query(
        `UPDATE repositories SET last_synced_at = $1 WHERE id = $2`,
        [now, repoRow.id]
      );

      synced++;
    } catch (err) {
      errors.push({ fullName: repo.fullName, message: err.message });
    }
  }

  return { synced, errors };
}

async function _upsertRepository({ db, userId, repo, now }) {
  const result = await db.query(
    `INSERT INTO repositories
       (user_id, github_repo_id, github_full_name, is_active, linked_at)
     VALUES ($1, $2, $3, true, $4)
     ON CONFLICT (github_repo_id) DO UPDATE SET
       github_full_name = EXCLUDED.github_full_name,
       is_active        = true
     RETURNING *`,
    [userId, repo.githubRepoId, repo.fullName, now]
  );
  return result.rows[0];
}

module.exports = { syncUserRepos };
