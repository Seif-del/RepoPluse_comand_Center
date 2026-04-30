/**
 * fetchGithubProjects
 *
 * Returns a list of projects derived from GitHub repositories.
 * Each item conforms to the RepoPulse project shape: { id, name, status }.
 *
 * When GITHUB_TOKEN and GITHUB_ORG are set, calls the GitHub REST API:
 *   GET https://api.github.com/orgs/{org}/repos
 *
 * Mapping rules:
 *   id     → repo.id
 *   name   → repo.full_name
 *   status → "At Risk"  if repo.disabled === true          (hard stop)
 *                        OR score >= 2
 *            "Healthy"  otherwise
 *
 *   Score signals (weighted):
 *     isStale       — last push older than STALE_DAYS         (+1)
 *     hasHighIssues — open_issues_count > ISSUE_THRESHOLD     (+2)
 *
 *   hasHighIssues outweighs isStale because an open-issue backlog represents
 *   active, unresolved maintenance burden. Staleness alone may simply reflect
 *   a stable or intentionally quiet repo — one weak signal is not enough to
 *   declare risk.
 *
 *   archived is intentionally excluded from scoring. Archiving is a
 *   deliberate human action (read-only retirement), not an operational
 *   failure. Active signals (isStale, hasHighIssues) are still evaluated
 *   for archived repos.
 *
 * Falls back to mock data when GITHUB_ORG is missing, preserving
 * existing behavior for local development and tests.
 */

const { GITHUB_TOKEN, GITHUB_ORG, STALE_DAYS, INACTIVE_DAYS, ISSUE_THRESHOLD } = require('../config/paths');

const MOCK = [
  { id: 101, name: 'colaberry/data-pipeline',      status: 'Healthy',  archived: false, disabled: false, isStale: false, isInactive: false, hasHighIssues: false, score: 0 },
  { id: 102, name: 'colaberry/auth-service',        status: 'At Risk',  archived: false, disabled: false, isStale: true,  isInactive: true,  hasHighIssues: true,  score: 3 },
  { id: 103, name: 'colaberry/reporting-dashboard', status: 'Healthy',  archived: true,  disabled: false, isStale: false, isInactive: false, hasHighIssues: false, score: 0 },
  { id: 104, name: 'colaberry/ml-feature-store',    status: 'Healthy',  archived: false, disabled: false, isStale: true,  isInactive: true,  hasHighIssues: false, score: 1 },
  { id: 105, name: 'colaberry/infra-terraform',     status: 'At Risk',  archived: false, disabled: true,  isStale: false, isInactive: false, hasHighIssues: false, score: 0 },
];

async function fetchGithubProjects() {
  if (!GITHUB_ORG) {
    return MOCK.map(function(repo) {
      const reasons = [];
      if (repo.isStale)       reasons.push('No recent activity');
      if (repo.hasHighIssues) reasons.push('High issue backlog');
      if (repo.disabled)      reasons.push('Repository is disabled');
      if (repo.status === 'At Risk' && reasons.length === 0) reasons.push('Risk signals detected');
      return { id: repo.id, name: repo.name, status: repo.status, reasons };
    });
  }

  const url = 'https://api.github.com/orgs/' + encodeURIComponent(GITHUB_ORG) + '/repos';
  const headers = {
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers.Authorization = 'Bearer ' + GITHUB_TOKEN;
  }

  const response = await fetch(url, { headers });

  if (!response.ok) {
    throw new Error(
      'GitHub API request failed: ' + response.status + ' ' + response.statusText
      + ' (org: ' + GITHUB_ORG + ')'
    );
  }

  const repos = await response.json();
  const staleThresholdMs    = STALE_DAYS    * 24 * 60 * 60 * 1000;
  const inactiveThresholdMs = INACTIVE_DAYS * 24 * 60 * 60 * 1000;

  return repos.map(function(repo) {
    const msSinceLastPush = repo.pushed_at
      ? Date.now() - new Date(repo.pushed_at).getTime()
      : Infinity;

    const isStale        = msSinceLastPush > staleThresholdMs;
    const isInactive     = msSinceLastPush > inactiveThresholdMs;
    const hasHighIssues  = repo.open_issues_count > ISSUE_THRESHOLD;

    let score = 0;
    const reasons = [];
    if (isStale)               { score += 1; reasons.push('No recent activity'); }
    if (hasHighIssues)         { score += 2; reasons.push('High issue backlog'); }
    if (repo.disabled === true)  reasons.push('Repository is disabled');

    const status = repo.disabled === true || score >= 2 ? 'At Risk' : 'Healthy';
    if (status === 'At Risk' && reasons.length === 0) reasons.push('Risk signals detected');

    return { id: repo.id, name: repo.full_name, status, reasons };
  });
}

module.exports = fetchGithubProjects;
