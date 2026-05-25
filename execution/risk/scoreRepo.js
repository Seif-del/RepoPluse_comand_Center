'use strict';

// Scoring rules — each rule returns a risk delta (0..100 total after capping).
// Rules are evaluated independently and summed. Factors array explains each hit.
//
// Operational Risk Model (rebalanced):
//   Active operational signals (CI failing, confirmed abandonment) dominate severity.
//   Structural/maturity signals (no releases, bus factor, low activity) provide
//   display context only — they cannot alone push a repo into at-risk.
//   Target bands: healthy 0–29, monitor 30–49, at-risk 50–74, critical 75–100.
//
//   Demoted maturity signals:
//   - release_none:          0 pts  (no releases = project maturity, not operational risk)
//   - ciStatus unknown:      0 pts  (unmeasured is not failing)
//   - releaseStatus unknown: 0 pts  (unmeasured is not stale)
//
//   Low-impact structural signals (factor string still appears for display context):
//   - contributor_bus_factor: 5 pts (structural concern, never drives at-risk alone)
//   - contributor_low:        5 pts (structural concern, never drives at-risk alone)
//   - no_commits_7d:          8 pts (activity gap, stays well below monitor alone)

const RULES = [
  // ── Structural activity signals (baseline, max ~28 combined) ─────────────────
  {
    id:       'no_commits_7d',
    test:     ({ commits7d })                      => commits7d === 0,
    points:   8,
    factor:   'No commits in the last 7 days',
    category: 'structural',
  },
  {
    id:       'stale_push',
    test:     ({ daysSincePush })                  => daysSincePush !== null && daysSincePush > 14,
    points:   6,
    factor:   'No push to default branch in over 14 days',
    category: 'structural',
  },
  {
    id:       'stale_prs',
    test:     ({ stalePrs })                       => stalePrs >= 3,
    points:   6,
    factor:   '3 or more stale pull requests (open > 7 days)',
    category: 'structural',
  },
  {
    id:       'high_open_issues',
    test:     ({ openIssues })                     => openIssues > 20,
    points:   5,
    factor:   'More than 20 open issues',
    category: 'structural',
  },
  {
    id:       'elevated_open_prs',
    test:     ({ openPrs })                        => openPrs > 10,
    points:   3,
    factor:   'More than 10 open pull requests',
    category: 'structural',
  },
  {
    id:       'moderate_open_prs',
    test:     ({ openPrs, stalePrs })              => openPrs > 5 && openPrs <= 10 && stalePrs < 3,
    points:   2,
    factor:   'More than 5 open pull requests',
    category: 'structural',
  },

  // ── Operational instability signals (dominating severity) ────────────────────
  // One active signal alone drives score into at-risk (50+) or critical (75+).
  {
    id:       'ci_failing',
    test:     ({ ciStatus })                       => ciStatus === 'failing',
    points:   50,
    factor:   'CI/CD pipeline has recent failing runs',
    category: 'operational',
  },
  {
    id:       'contributor_abandoned',
    // Requires full corroboration: abandoned only fires when no commits AND CI is
    // actively failing. Unknown CI is insufficient — it may simply be unmeasured.
    // Mutually exclusive with contributor_dormant (dormant fires when CI is unknown).
    test:     ({ contributorStatus, commits7d, ciStatus }) =>
                contributorStatus === 'abandoned' &&
                commits7d === 0 &&
                ciStatus === 'failing',
    points:   50,
    factor:   'Repository appears abandoned',
    category: 'operational',
  },
  {
    id:       'repo_dormant',
    // Fires when no recent commits and CI is actively passing — repo is intentionally
    // quiet/stable. Mutually exclusive with contributor_dormant and contributor_abandoned.
    test:     ({ commits7d, ciStatus }) => commits7d === 0 && ciStatus === 'passing',
    points:   15,
    factor:   'Repository appears dormant',
    category: 'structural',
  },
  {
    id:       'contributor_dormant',
    // Fires when contributor API returned no contributors AND no recent commits AND
    // CI is not actively failing (unknown or passing). Treats the repo as dormant
    // rather than abandoned — absence of maintenance evidence is not confirmation of
    // abandonment. Mutually exclusive with repo_dormant (repo_dormant requires passing
    // CI) and contributor_abandoned (requires failing CI).
    test:     ({ contributorStatus, commits7d, ciStatus }) =>
                contributorStatus === 'abandoned' &&
                commits7d === 0 &&
                ciStatus !== 'passing' &&
                ciStatus !== 'failing',
    points:   15,
    factor:   'Repository appears dormant',
    category: 'structural',
  },
  {
    id:       'release_stale',
    test:     ({ releaseStatus })                  => releaseStatus === 'stale',
    points:   10,
    factor:   'No releases in the last 90 days',
    category: 'structural',
  },
  {
    id:       'release_none',
    // 0 pts — no releases is a project maturity signal, not active operational risk.
    // Rule fires so the factor string still appears for display context.
    test:     ({ releaseStatus })                  => releaseStatus === 'none',
    points:   0,
    factor:   'No releases found for this repository',
    category: 'structural',
  },
  {
    id:       'contributor_bus_factor',
    // 5 pts — structural concern only; cannot alone drive a repo into at-risk.
    test:     ({ contributorStatus })              => contributorStatus === 'bus_factor_risk',
    points:   5,
    factor:   'High bus-factor risk: one contributor dominates',
    category: 'structural',
  },
  {
    id:       'contributor_low',
    test:     ({ contributorStatus })              => contributorStatus === 'low_activity',
    points:   5,
    factor:   'Low contributor activity (1-2 contributors)',
    category: 'structural',
  },
];

// Unified operational severity thresholds.
// healthy 0–29, monitor 30–49, at-risk 50–74, critical 75–100.
// Pure structural-activity signals (commits/PRs/issues) max at 28 → always healthy.
// Release-stale (10 pts) combined with activity signals can reach monitor (≥30).
// Release-none is 0 pts — maturity context only, not operational risk.
// Active operational instability (CI failing, abandoned) reaches at-risk (50+) or critical (75+).
const LABEL_THRESHOLDS = [
  { min: 75, label: 'critical' },
  { min: 50, label: 'at-risk'  },
  { min: 30, label: 'monitor'  },
  { min: 0,  label: 'healthy'  },
];

// Set of factor strings that represent active operational instability.
// Exported for use by getRepoRiskFactors categorization.
const OPERATIONAL_FACTOR_STRINGS = new Set([
  'CI/CD pipeline has recent failing runs',
  'Repository appears abandoned',
]);

/**
 * Pure, deterministic unified operational risk scorer. No I/O.
 *
 * Structural signals (commits, PRs, issues) contribute baseline concern only —
 * structural-only repos score 0–28 max, always staying healthy (< 30).
 * Release-stale and bus-factor signals can combine to push into monitor (30–49).
 *
 * Operational signals (CI failing, contributor abandoned) dominate severity —
 * a single active signal drives score to at-risk (50+) or critical (75+).
 *
 * @param {object}      params
 * @param {number}      params.commits7d          - commits pushed in the last 7 days
 * @param {number}      params.openPrs            - currently open pull requests
 * @param {number}      params.stalePrs           - open PRs with no activity > 7 days
 * @param {number}      params.openIssues         - open issues (excluding PRs)
 * @param {number|null} params.daysSincePush      - days since last push; null = never pushed
 * @param {number}      [params.previousScore]    - score from the last snapshot (for trend)
 * @param {string}      [params.ciStatus]         - 'passing' | 'failing' | 'unknown'
 * @param {string}      [params.releaseStatus]    - 'healthy' | 'stale' | 'none' | 'unknown'
 * @param {string}      [params.contributorStatus] - 'healthy' | 'low_activity' |
 *                                                   'bus_factor_risk' | 'abandoned' | 'unknown'
 * @returns {{ score: number, label: string, trend: string, factors: string[] }}
 */
function scoreRepo({
  commits7d,
  openPrs,
  stalePrs,
  openIssues,
  daysSincePush,
  previousScore      = null,
  ciStatus           = 'unknown',
  releaseStatus      = 'unknown',
  contributorStatus  = 'unknown',
} = {}) {
  const inputs = { commits7d, openPrs, stalePrs, openIssues, daysSincePush,
                   ciStatus, releaseStatus, contributorStatus };

  let total     = 0;
  const factors = [];

  for (const rule of RULES) {
    if (rule.test(inputs)) {
      total += rule.points;
      factors.push(rule.factor);
    }
  }

  const score = Math.min(100, total);
  const label = LABEL_THRESHOLDS.find(t => score >= t.min).label;

  let trend = 'stable';
  if (previousScore !== null) {
    if (score < previousScore - 5)      trend = 'improving';
    else if (score > previousScore + 5) trend = 'worsening';
  }

  return { score, label, trend, factors };
}

module.exports = { scoreRepo, OPERATIONAL_FACTOR_STRINGS };
