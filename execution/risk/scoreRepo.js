'use strict';

// Scoring rules — each rule returns a risk delta (0..100 total after capping).
// Rules are evaluated independently and summed. Factors array explains each hit.

const RULES = [
  {
    id:     'no_commits_7d',
    test:   ({ commits7d })      => commits7d === 0,
    points: 25,
    factor: 'No commits in the last 7 days',
  },
  {
    id:     'stale_push',
    test:   ({ daysSincePush })  => daysSincePush !== null && daysSincePush > 14,
    points: 20,
    factor: 'No push to default branch in over 14 days',
  },
  {
    id:     'stale_prs',
    test:   ({ stalePrs })       => stalePrs >= 3,
    points: 20,
    factor: '3 or more stale pull requests (open > 7 days)',
  },
  {
    id:     'high_open_issues',
    test:   ({ openIssues })     => openIssues > 20,
    points: 15,
    factor: 'More than 20 open issues',
  },
  {
    id:     'elevated_open_prs',
    test:   ({ openPrs })        => openPrs > 10,
    points: 10,
    factor: 'More than 10 open pull requests',
  },
  {
    id:     'moderate_open_prs',
    test:   ({ openPrs, stalePrs }) => openPrs > 5 && openPrs <= 10 && stalePrs < 3,
    points: 5,
    factor: 'More than 5 open pull requests',
  },
];

const LABEL_THRESHOLDS = [
  { min: 60, label: 'critical'  },
  { min: 30, label: 'at-risk'   },
  { min: 0,  label: 'healthy'   },
];

/**
 * Pure, deterministic risk scorer. No I/O.
 *
 * @param {object} params
 * @param {number}      params.commits7d      - commits pushed in the last 7 days
 * @param {number}      params.openPrs        - currently open pull requests
 * @param {number}      params.stalePrs       - open PRs with no activity > 7 days
 * @param {number}      params.openIssues     - open issues (excluding PRs)
 * @param {number|null} params.daysSincePush  - days since last push; null = never pushed
 * @param {number}      [params.previousScore] - score from the last snapshot (for trend)
 * @returns {{ score: number, label: string, trend: string, factors: string[] }}
 */
function scoreRepo({ commits7d, openPrs, stalePrs, openIssues, daysSincePush, previousScore = null } = {}) {
  const inputs = { commits7d, openPrs, stalePrs, openIssues, daysSincePush };

  let total   = 0;
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

module.exports = { scoreRepo };
