/**
 * fetchGithubProjects
 *
 * Returns a list of projects derived from GitHub repositories.
 * Each item conforms to the RepoPulse project shape: { id, name, status }.
 *
 * When GITHUB_ORG is set, calls the GitHub REST API:
 *   GET https://api.github.com/orgs/{org}/repos
 *
 * Authentication:
 *   If GITHUB_TOKEN is set, an Authorization header is included (5 000 req/hr).
 *   If GITHUB_TOKEN is absent, the request is made unauthenticated (60 req/hr).
 *
 * Mapping rules:
 *   id     → repo.id
 *   name   → repo.full_name
 *   status → "At Risk"  if repo.archived === true
 *                       OR repo.disabled === true
 *                       OR repo.pushed_at is older than STALE_DAYS days  (long-term abandonment)
 *                       OR repo.pushed_at is older than INACTIVE_DAYS days (short-term inactivity)
 *            "Healthy"  otherwise
 *
 * STALE_DAYS and INACTIVE_DAYS are imported from config/paths.js (defaults: 90 and 30).
 *
 * Falls back to mock data when GITHUB_ORG is missing, preserving
 * existing behavior for local development and tests.
 */

const { GITHUB_TOKEN, GITHUB_ORG, STALE_DAYS, INACTIVE_DAYS } = require('../config/paths');

const MOCK = [
  { id: 101, name: 'colaberry/data-pipeline',       status: 'Healthy'  },
  { id: 102, name: 'colaberry/auth-service',         status: 'At Risk'  },
  { id: 103, name: 'colaberry/reporting-dashboard',  status: 'Healthy'  },
  { id: 104, name: 'colaberry/ml-feature-store',     status: 'At Risk'  },
  { id: 105, name: 'colaberry/infra-terraform',      status: 'Healthy'  },
];

async function fetchGithubProjects() {
  if (!GITHUB_ORG) {
    return MOCK;
  }

  const headers = {
    'Accept':              'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  if (GITHUB_TOKEN) {
    headers['Authorization'] = 'Bearer ' + GITHUB_TOKEN;
  }

  const url = 'https://api.github.com/orgs/' + encodeURIComponent(GITHUB_ORG) + '/repos';
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

    const isStale    = msSinceLastPush > staleThresholdMs;
    const isInactive = msSinceLastPush > inactiveThresholdMs;

    const atRisk = repo.archived === true || repo.disabled === true || isStale || isInactive;

    return {
      id:     repo.id,
      name:   repo.full_name,
      status: atRisk ? 'At Risk' : 'Healthy',
    };
  });
}

module.exports = fetchGithubProjects;
