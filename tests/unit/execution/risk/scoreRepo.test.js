'use strict';

const { scoreRepo, OPERATIONAL_FACTOR_STRINGS } = require('../../../../execution/risk/scoreRepo');

function healthy() {
  return { commits7d: 10, openPrs: 2, stalePrs: 0, openIssues: 5, daysSincePush: 3 };
}

// ── Return shape ──────────────────────────────────────────────────────────────

describe('scoreRepo — return shape', () => {
  it('returns score, label, trend, and factors', () => {
    const result = scoreRepo(healthy());
    expect(Object.keys(result).sort()).toEqual(['factors', 'label', 'score', 'trend']);
  });

  it('score is a number between 0 and 100', () => {
    const { score } = scoreRepo(healthy());
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('factors is an array', () => {
    expect(Array.isArray(scoreRepo(healthy()).factors)).toBe(true);
  });
});

// ── Healthy baseline ──────────────────────────────────────────────────────────

describe('scoreRepo — healthy baseline', () => {
  it('gives score 0 for a fully healthy repo', () => {
    expect(scoreRepo(healthy()).score).toBe(0);
  });

  it('labels a score-0 repo as healthy', () => {
    expect(scoreRepo(healthy()).label).toBe('healthy');
  });

  it('factors array is empty for a healthy repo', () => {
    expect(scoreRepo(healthy()).factors).toHaveLength(0);
  });
});

// ── Structural rules — reduced weights ────────────────────────────────────────

describe('scoreRepo — structural rule: no_commits_7d (+8)', () => {
  it('adds 8 points when commits7d is 0', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 0 }).score).toBe(8);
  });

  it('does not trigger when commits7d is 1', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 1 }).score).toBe(0);
  });

  it('includes the no-commits factor string', () => {
    const { factors } = scoreRepo({ ...healthy(), commits7d: 0 });
    expect(factors.some(f => f.toLowerCase().includes('commit'))).toBe(true);
  });
});

describe('scoreRepo — structural rule: stale_push (+6)', () => {
  it('adds 6 points when daysSincePush > 14', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: 15 }).score).toBe(6);
  });

  it('does not trigger when daysSincePush is exactly 14', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: 14 }).score).toBe(0);
  });

  it('does not trigger when daysSincePush is null', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: null }).score).toBe(0);
  });
});

describe('scoreRepo — structural rule: stale_prs (+6)', () => {
  it('adds 6 points when stalePrs >= 3', () => {
    expect(scoreRepo({ ...healthy(), stalePrs: 3 }).score).toBe(6);
  });

  it('does not trigger when stalePrs is 2', () => {
    expect(scoreRepo({ ...healthy(), stalePrs: 2 }).score).toBe(0);
  });
});

describe('scoreRepo — structural rule: high_open_issues (+5)', () => {
  it('adds 5 points when openIssues > 20', () => {
    expect(scoreRepo({ ...healthy(), openIssues: 21 }).score).toBe(5);
  });

  it('does not trigger when openIssues is exactly 20', () => {
    expect(scoreRepo({ ...healthy(), openIssues: 20 }).score).toBe(0);
  });
});

describe('scoreRepo — structural rule: elevated_open_prs (+3)', () => {
  it('adds 3 points when openPrs > 10', () => {
    expect(scoreRepo({ ...healthy(), openPrs: 11 }).score).toBe(3);
  });

  it('does not trigger when openPrs is 5 or fewer', () => {
    expect(scoreRepo({ ...healthy(), openPrs: 5 }).score).toBe(0);
  });
});

// ── Operational rules — dominating severity ────────────────────────────────────

describe('scoreRepo — operational rule: ci_failing (+50)', () => {
  it('adds 50 points when ciStatus is failing', () => {
    expect(scoreRepo({ ...healthy(), ciStatus: 'failing' }).score).toBe(50);
  });

  it('does not trigger when ciStatus is passing', () => {
    expect(scoreRepo({ ...healthy(), ciStatus: 'passing' }).score).toBe(0);
  });

  it('does not trigger when ciStatus is unknown (default)', () => {
    expect(scoreRepo({ ...healthy() }).score).toBe(0);
  });

  it('includes the CI failing factor string', () => {
    const { factors } = scoreRepo({ ...healthy(), ciStatus: 'failing' });
    expect(factors.some(f => f.toLowerCase().includes('ci'))).toBe(true);
  });

  it('ci_failing alone → at-risk label (score=50 ≥ 50)', () => {
    expect(scoreRepo({ ...healthy(), ciStatus: 'failing' }).label).toBe('at-risk');
  });
});

describe('scoreRepo — operational rule: contributor_abandoned (+50)', () => {
  it('adds 50 points when contributorStatus is abandoned', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'abandoned' }).score).toBe(50);
  });

  it('does not trigger when contributorStatus is healthy', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'healthy' }).score).toBe(0);
  });

  it('contributor_abandoned alone → at-risk label (score=50 ≥ 50)', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'abandoned' }).label).toBe('at-risk');
  });

  it('ci_failing + contributor_abandoned → critical (50+50=100, capped)', () => {
    const { score, label } = scoreRepo({ ...healthy(), ciStatus: 'failing', contributorStatus: 'abandoned' });
    expect(score).toBe(100);
    expect(label).toBe('critical');
  });
});

describe('scoreRepo — operational rule: release_stale (+10)', () => {
  it('adds 10 points when releaseStatus is stale', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'stale' }).score).toBe(10);
  });

  it('does not trigger when releaseStatus is healthy', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'healthy' }).score).toBe(0);
  });

  it('does not trigger when releaseStatus is unknown (default)', () => {
    expect(scoreRepo({ ...healthy() }).score).toBe(0);
  });
});

describe('scoreRepo — operational rule: release_none (+8)', () => {
  it('adds 8 points when releaseStatus is none', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'none' }).score).toBe(8);
  });

  it('release_none alone stays healthy (8 < 30)', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'none' }).label).toBe('healthy');
  });
});

describe('scoreRepo — operational rule: contributor_bus_factor (+10)', () => {
  it('adds 10 points when contributorStatus is bus_factor_risk', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'bus_factor_risk' }).score).toBe(10);
  });

  it('bus_factor alone stays healthy (10 < 30)', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'bus_factor_risk' }).label).toBe('healthy');
  });
});

describe('scoreRepo — operational rule: contributor_low (+5)', () => {
  it('adds 5 points when contributorStatus is low_activity', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'low_activity' }).score).toBe(5);
  });
});

// ── Structural-only worst case (no operational signals) ───────────────────────

describe('scoreRepo — structural-only worst case', () => {
  // no_commits(8) + stale_push(6) + stale_prs(6) + high_issues(5) + elevated_prs(3) = 28
  const worstStructural = { commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30 };

  it('structural-only worst case scores 28 (below monitor threshold of 30)', () => {
    expect(scoreRepo(worstStructural).score).toBe(28);
  });

  it('structural-only worst case labels as healthy (28 < 30)', () => {
    expect(scoreRepo(worstStructural).label).toBe('healthy');
  });

  it('all operational rules fire with operational signals (capped at 100)', () => {
    const worst = {
      ...worstStructural,
      ciStatus:          'failing',
      releaseStatus:     'stale',
      contributorStatus: 'abandoned',
    };
    // 28 + ci_failing(50) + release_stale(10) + contributor_abandoned(50) = 138 → 100
    expect(scoreRepo(worst).score).toBe(100);
    expect(scoreRepo(worst).label).toBe('critical');
  });
});

// ── Score cap ─────────────────────────────────────────────────────────────────

describe('scoreRepo — score cap', () => {
  it('score is always between 0 and 100 regardless of inputs', () => {
    const worst = { commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30,
                    ciStatus: 'failing', contributorStatus: 'abandoned', releaseStatus: 'stale' };
    const { score } = scoreRepo(worst);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ── Label thresholds (unified operational model) ──────────────────────────────
// Bands: healthy 0–29, monitor 30–49, at-risk 50–74, critical 75–100.

describe('scoreRepo — unified label thresholds', () => {
  it('labels score < 30 as healthy', () => {
    // moderate_open_prs(2) alone → 2 < 30 → healthy
    expect(scoreRepo({ ...healthy(), openPrs: 6 }).label).toBe('healthy');
  });

  it('labels score 30–49 as monitor', () => {
    // release_stale(10) + no_commits(8) + stale_prs(6) + stale_push(6) = 30 → monitor
    const result = scoreRepo({
      ...healthy(), commits7d: 0, daysSincePush: 20, stalePrs: 3, releaseStatus: 'stale',
    });
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.score).toBeLessThan(50);
    expect(result.label).toBe('monitor');
  });

  it('labels score 50–74 as at-risk', () => {
    // ci_failing alone → 50 → at-risk
    const result = scoreRepo({ ...healthy(), ciStatus: 'failing' });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(75);
    expect(result.label).toBe('at-risk');
  });

  it('labels score >= 75 as critical', () => {
    // ci_failing(50) + contributor_bus_factor(10) + release_stale(10) + stale_push(6) = 76 → critical
    const result = scoreRepo({
      ...healthy(), daysSincePush: 20, ciStatus: 'failing', releaseStatus: 'stale',
      contributorStatus: 'bus_factor_risk',
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.label).toBe('critical');
  });

  it('exact boundary: 25 → healthy (below new 30 threshold)', () => {
    // no_commits(8) + stale_push(6) + stale_prs(6) + high_open_issues(5) = 25 → healthy
    const result = scoreRepo({
      ...healthy(), commits7d: 0, daysSincePush: 20, stalePrs: 3, openIssues: 21,
    });
    expect(result.score).toBe(25);
    expect(result.label).toBe('healthy');
  });

  it('exact boundary: 30 → monitor (new minimum threshold)', () => {
    // release_stale(10) + no_commits(8) + stale_prs(6) + stale_push(6) = 30 → monitor
    const result = scoreRepo({
      ...healthy(), commits7d: 0, daysSincePush: 20, stalePrs: 3, releaseStatus: 'stale',
    });
    expect(result.score).toBe(30);
    expect(result.label).toBe('monitor');
  });

  it('exact boundary: 50 → at-risk (not monitor)', () => {
    const result = scoreRepo({ ...healthy(), ciStatus: 'failing' });
    expect(result.score).toBe(50);
    expect(result.label).toBe('at-risk');
  });

  it('exact boundary: 75 → critical (not at-risk)', () => {
    // ci_failing(50) + contributor_bus_factor(10) + release_stale(10) + stale_push(6) = 76 ≥ 75
    const result = scoreRepo({
      ...healthy(), daysSincePush: 20, ciStatus: 'failing', releaseStatus: 'stale',
      contributorStatus: 'bus_factor_risk',
    });
    expect(result.score).toBeGreaterThanOrEqual(75);
    expect(result.label).toBe('critical');
  });
});

// ── No-data label semantics ───────────────────────────────────────────────────

describe('scoreRepo — no-data / unknown repo semantics', () => {
  it('score 25 remains healthy after threshold raise — no longer labeled monitor', () => {
    // Prior threshold was 25; raising to 30 means score=25 is now healthy.
    const result = scoreRepo({
      ...healthy(), commits7d: 0, daysSincePush: 20, stalePrs: 3, openIssues: 21,
    });
    expect(result.score).toBe(25);
    expect(result.label).toBe('healthy');
    expect(result.label).not.toBe('monitor');
  });

  it('score 30 becomes monitor under new threshold', () => {
    const result = scoreRepo({
      ...healthy(), commits7d: 0, daysSincePush: 20, stalePrs: 3, releaseStatus: 'stale',
    });
    expect(result.score).toBe(30);
    expect(result.label).toBe('monitor');
  });

  it('common structural combo (bus_factor + release_none + no_commits) stays below monitor', () => {
    // contributor_bus_factor(10) + release_none(8) + no_commits(8) = 26 → healthy (< 30)
    const result = scoreRepo({
      ...healthy(), commits7d: 0, contributorStatus: 'bus_factor_risk', releaseStatus: 'none',
    });
    expect(result.score).toBe(26);
    expect(result.label).toBe('healthy');
  });

  it('structural-only worst case (all activity signals) stays below monitor threshold', () => {
    // no_commits(8) + stale_push(6) + stale_prs(6) + high_issues(5) + elevated_prs(3) = 28 < 30
    const result = scoreRepo({ commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30 });
    expect(result.score).toBe(28);
    expect(result.label).toBe('healthy');
  });
});

// ── Unified severity alignment ────────────────────────────────────────────────

describe('scoreRepo — unified severity alignment', () => {
  it('structural-only repos (no CI/release/contributor signals) stay below at-risk', () => {
    const worst = { commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30 };
    expect(scoreRepo(worst).score).toBeLessThan(50);
    expect(scoreRepo(worst).label).not.toBe('at-risk');
    expect(scoreRepo(worst).label).not.toBe('critical');
  });

  it('active CI instability alone reaches at-risk (50)', () => {
    const result = scoreRepo({ ...healthy(), ciStatus: 'failing' });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.label).toBe('at-risk');
  });

  it('abandoned contributors alone reaches at-risk (50)', () => {
    const result = scoreRepo({ ...healthy(), contributorStatus: 'abandoned' });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.label).toBe('at-risk');
  });

  it('severe escalation (CI + abandoned) reaches critical (100, capped)', () => {
    const result = scoreRepo({ ...healthy(), ciStatus: 'failing', contributorStatus: 'abandoned' });
    expect(result.score).toBe(100);
    expect(result.label).toBe('critical');
  });

  it('unknown operational signals add zero points (structural score unaffected)', () => {
    const base    = scoreRepo({ ...healthy() }).score;
    const withUnk = scoreRepo({ ...healthy(), ciStatus: 'unknown', releaseStatus: 'unknown',
                                contributorStatus: 'unknown' }).score;
    expect(withUnk).toBe(base);
  });

  it('passing CI/healthy release/healthy contributors add zero points', () => {
    const result = scoreRepo({ ...healthy(), ciStatus: 'passing', releaseStatus: 'healthy',
                               contributorStatus: 'healthy' });
    expect(result.score).toBe(0);
    expect(result.label).toBe('healthy');
  });
});

// ── OPERATIONAL_FACTOR_STRINGS export ─────────────────────────────────────────

describe('scoreRepo — OPERATIONAL_FACTOR_STRINGS', () => {
  it('exports OPERATIONAL_FACTOR_STRINGS as a Set', () => {
    expect(OPERATIONAL_FACTOR_STRINGS).toBeInstanceOf(Set);
  });

  it('CI failing factor is in OPERATIONAL_FACTOR_STRINGS', () => {
    expect(OPERATIONAL_FACTOR_STRINGS.has('CI/CD pipeline has recent failing runs')).toBe(true);
  });

  it('contributor abandoned factor is in OPERATIONAL_FACTOR_STRINGS', () => {
    expect(OPERATIONAL_FACTOR_STRINGS.has('Repository appears abandoned (no contributors)')).toBe(true);
  });

  it('structural factors are NOT in OPERATIONAL_FACTOR_STRINGS', () => {
    expect(OPERATIONAL_FACTOR_STRINGS.has('No commits in the last 7 days')).toBe(false);
    expect(OPERATIONAL_FACTOR_STRINGS.has('No releases in the last 90 days')).toBe(false);
    expect(OPERATIONAL_FACTOR_STRINGS.has('High bus-factor risk: one contributor dominates')).toBe(false);
  });
});

// ── Trend ─────────────────────────────────────────────────────────────────────

describe('scoreRepo — trend', () => {
  it('returns stable when previousScore is null (first snapshot)', () => {
    expect(scoreRepo({ ...healthy(), previousScore: null }).trend).toBe('stable');
  });

  it('returns improving when score drops > 5 vs previousScore', () => {
    const next = scoreRepo({ ...healthy(), previousScore: 60 }); // score=0, prev=60
    expect(next.trend).toBe('improving');
  });

  it('returns worsening when score rises > 5 vs previousScore', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0, previousScore: 0 }); // score=8, prev=0
    expect(result.trend).toBe('worsening');
  });

  it('returns stable when score delta <= 5', () => {
    expect(scoreRepo({ ...healthy(), previousScore: 3 }).trend).toBe('stable');
  });
});
