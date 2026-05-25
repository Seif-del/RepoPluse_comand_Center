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
  it('adds 50 points when contributorStatus is abandoned with no commits and FAILING CI', () => {
    // Only failing CI fully corroborates abandonment. ci_failing(50) + contributor_abandoned(50) + no_commits(8) = 108 → 100.
    expect(scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned' }).score).toBe(100);
  });

  it('does NOT add abandoned penalty when CI is unknown (dormant fires instead)', () => {
    // Unknown CI → contributor_dormant fires (15 pts), not contributor_abandoned.
    const { score, factors } = scoreRepo({ ...healthy(), commits7d: 0, contributorStatus: 'abandoned' });
    expect(score).toBe(23); // no_commits(8) + contributor_dormant(15)
    expect(factors).not.toContain('Repository appears abandoned');
    expect(factors).toContain('Repository appears dormant');
  });

  it('does not trigger when contributorStatus is healthy', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'healthy' }).score).toBe(0);
  });

  it('contributor_abandoned + no commits + failing CI → at-risk label (score=100, capped)', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned' }).label).toBe('critical');
  });

  it('ci_failing + contributor_abandoned + no commits → critical (50+50+8=108, capped at 100)', () => {
    const { score, label } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned' });
    expect(score).toBe(100);
    expect(label).toBe('critical');
  });
});

// ── Abandonment corroboration gate ────────────────────────────────────────────
// contributor_abandoned fires only when: abandoned AND commits7d===0 AND ciStatus!=='passing'

describe('scoreRepo — contributor_abandoned corroboration gate', () => {
  it('abandoned + commits7d > 0 does NOT add abandoned penalty', () => {
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 5, contributorStatus: 'abandoned',
    });
    expect(score).toBe(0);
    expect(factors).not.toContain('Repository appears abandoned');
  });

  it('abandoned + commits7d 1 (exactly 1 commit) does NOT add abandoned penalty', () => {
    const { score } = scoreRepo({
      ...healthy(), commits7d: 1, contributorStatus: 'abandoned',
    });
    expect(score).toBe(0);
  });

  it('abandoned + ciStatus passing → dormant fires instead (score=23), NOT abandoned', () => {
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    // no_commits(8) + repo_dormant(15) = 23; abandoned blocked by passing CI
    expect(score).toBe(23);
    expect(factors).not.toContain('Repository appears abandoned');
    expect(factors).toContain('Repository appears dormant');
  });

  it('abandoned + commits7d 0 + ciStatus unknown → dormant fires, NOT abandoned', () => {
    // Unknown CI is not sufficient corroboration for abandonment — treat as dormant.
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    expect(score).toBe(23); // no_commits(8) + contributor_dormant(15)
    expect(factors).toContain('Repository appears dormant');
    expect(factors).not.toContain('Repository appears abandoned');
  });

  it('abandoned + commits7d 0 + ciStatus failing DOES add abandoned penalty', () => {
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned',
    });
    // ci_failing(50) + contributor_abandoned(50) + no_commits(8) = 108 → 100
    expect(score).toBe(100);
    expect(factors).toContain('Repository appears abandoned');
    expect(factors).toContain('CI/CD pipeline has recent failing runs');
  });

  it('abandoned + commits7d 0 + ciStatus omitted → dormant fires (unknown CI is not enough to confirm abandonment)', () => {
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 0, contributorStatus: 'abandoned',
      // ciStatus not passed — defaults to 'unknown'; only failing CI confirms abandonment
    });
    expect(score).toBe(23); // no_commits(8) + contributor_dormant(15)
    expect(factors).toContain('Repository appears dormant');
    expect(factors).not.toContain('Repository appears abandoned');
  });

  it('abandoned + commits7d null does NOT add abandoned penalty (null !== 0)', () => {
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: null, contributorStatus: 'abandoned',
    });
    expect(factors).not.toContain('Repository appears abandoned');
    // null is not === 0 so the corroboration gate is not satisfied
    expect(score).toBe(0);
  });

  it('abandoned + commits7d undefined does NOT add abandoned penalty (undefined !== 0)', () => {
    const input = { openPrs: 2, stalePrs: 0, openIssues: 5, daysSincePush: 3,
                    contributorStatus: 'abandoned' };
    const { factors } = scoreRepo(input);
    expect(factors).not.toContain('Repository appears abandoned');
  });

  it('non-abandoned contributorStatus with zero commits does NOT add abandoned penalty', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 0, contributorStatus: 'low_activity',
    });
    expect(factors).not.toContain('Repository appears abandoned');
  });
});

// ── Dormant rule ─────────────────────────────────────────────────────────────
// repo_dormant fires ONLY when: commits7d===0 AND ciStatus==='passing'
// Mutually exclusive with contributor_abandoned (abandoned requires ciStatus!=='passing').

describe('scoreRepo — structural rule: repo_dormant (+15)', () => {
  it('adds 15 points when commits7d is 0 and ciStatus is passing', () => {
    // no_commits(8) + repo_dormant(15) = 23
    expect(scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'passing' }).score).toBe(23);
  });

  it('includes the dormant factor string', () => {
    const { factors } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'passing' });
    expect(factors).toContain('Repository appears dormant');
  });

  it('dormant alone (healthy contributor, no commits, passing CI) → healthy label (23 < 30)', () => {
    const { label } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'passing' });
    expect(label).toBe('healthy');
  });

  it('does NOT fire when commits7d is > 0 and CI is passing', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 5, ciStatus: 'passing' }).score).toBe(0);
  });

  it('does NOT fire when commits7d is 0 but CI is failing (ci_failing takes over)', () => {
    // Only ci_failing(50) + no_commits(8) fires; dormant does not (ciStatus !== 'passing')
    const { score, factors } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing' });
    expect(score).toBe(58);
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('does NOT fire when commits7d is 0 and CI is unknown', () => {
    // no_commits(8) only; dormant requires ciStatus==='passing'
    const { score, factors } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'unknown' });
    expect(score).toBe(8);
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('does NOT fire when commits7d is 0 and ciStatus is omitted (defaults unknown)', () => {
    const { score, factors } = scoreRepo({ ...healthy(), commits7d: 0 });
    expect(score).toBe(8);
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('abandoned + passing CI → dormant fires, abandoned does NOT fire', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    expect(factors).toContain('Repository appears dormant');
    expect(factors).not.toContain('Repository appears abandoned');
  });

  it('abandoned + passing CI → score = no_commits(8) + dormant(15) = 23, NOT 50+', () => {
    const { score } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    expect(score).toBe(23);
  });

  it('dormant and contributor_abandoned are mutually exclusive for any ciStatus', () => {
    // unknown CI: dormant fires (via contributor_dormant), abandoned does NOT
    const { factors: fUnk } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    expect(fUnk).toContain('Repository appears dormant');
    expect(fUnk).not.toContain('Repository appears abandoned');

    // passing CI: dormant fires (via repo_dormant), abandoned does NOT
    const { factors: fPass } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    expect(fPass).not.toContain('Repository appears abandoned');
    expect(fPass).toContain('Repository appears dormant');

    // failing CI: abandoned fires, dormant does NOT
    const { factors: fFail } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned',
    });
    expect(fFail).toContain('Repository appears abandoned');
    expect(fFail).not.toContain('Repository appears dormant');
  });

  it('structural worst case with passing CI still stays healthy (dormant adds 15 to 28 = 43 → monitor)', () => {
    // This documents the new scoring: passing CI on a quiet repo pushes it to monitor.
    // 28 (structural worst) + 15 (dormant) = 43 → monitor
    const worstWithPassingCI = {
      commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30,
      ciStatus: 'passing',
    };
    const { score, label } = scoreRepo(worstWithPassingCI);
    expect(score).toBe(43);
    expect(label).toBe('monitor');
  });

  it('structural worst case with UNKNOWN CI remains healthy (dormant does not fire, score=28)', () => {
    // contributor_dormant only fires when contributorStatus==='abandoned'; default unknown does not.
    const worstUnknownCI = {
      commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30,
    };
    expect(scoreRepo(worstUnknownCI).score).toBe(28);
    expect(scoreRepo(worstUnknownCI).label).toBe('healthy');
  });
});

// ── Contributor dormant rule ───────────────────────────────────────────────────
// contributor_dormant fires ONLY when: contributorStatus==='abandoned' AND
// commits7d===0 AND ciStatus is neither 'passing' nor 'failing' (i.e. 'unknown').
// This distinguishes "confirmed abandonment" (CI failing) from "quiet but unmonitored".

describe('scoreRepo — structural rule: contributor_dormant (+15)', () => {
  it('adds 15 points when abandoned contributor + no commits + ciStatus unknown', () => {
    // no_commits(8) + contributor_dormant(15) = 23
    const { score, factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    expect(score).toBe(23);
    expect(factors).toContain('Repository appears dormant');
  });

  it('does NOT fire when contributorStatus is healthy (even with no commits + unknown CI)', () => {
    const { factors } = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'unknown' });
    // contributorStatus defaults to 'unknown', not 'abandoned'
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('does NOT fire when contributorStatus is low_activity', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'low_activity',
    });
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('does NOT fire when commits7d > 0 (even with abandoned + unknown CI)', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 5, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    expect(factors).not.toContain('Repository appears dormant');
  });

  it('does NOT fire when ciStatus is passing (repo_dormant fires instead)', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    // repo_dormant fires; contributor_dormant does not (ciStatus==='passing')
    expect(factors).toContain('Repository appears dormant'); // from repo_dormant
    expect(factors.filter(f => f === 'Repository appears dormant').length).toBe(1);
  });

  it('does NOT fire when ciStatus is failing (contributor_abandoned fires instead)', () => {
    const { factors } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned',
    });
    expect(factors).not.toContain('Repository appears dormant');
    expect(factors).toContain('Repository appears abandoned');
  });

  it('contributor_dormant and repo_dormant are mutually exclusive', () => {
    // repo_dormant: passing CI; contributor_dormant: unknown CI (non-passing, non-failing)
    const { factors: fPass } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'passing', contributorStatus: 'abandoned',
    });
    const { factors: fUnk } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    // Both produce exactly one dormant factor
    expect(fPass.filter(f => f === 'Repository appears dormant').length).toBe(1);
    expect(fUnk.filter(f => f === 'Repository appears dormant').length).toBe(1);
    // Neither produces abandoned
    expect(fPass).not.toContain('Repository appears abandoned');
    expect(fUnk).not.toContain('Repository appears abandoned');
  });

  it('dormant score (23) is lower than abandoned score (58+)', () => {
    const dormantScore = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    }).score;
    const abandonedScore = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned',
    }).score;
    expect(dormantScore).toBeLessThan(abandonedScore);
    expect(dormantScore).toBe(23);
    expect(abandonedScore).toBe(100); // capped: 8+50+50
  });

  it('dormant label remains healthy (23 < 30)', () => {
    const { label } = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'unknown', contributorStatus: 'abandoned',
    });
    expect(label).toBe('healthy');
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

describe('scoreRepo — structural rule: release_none (+0 — demoted maturity signal)', () => {
  it('adds 0 points when releaseStatus is none (fully demoted — maturity context, not operational risk)', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'none' }).score).toBe(0);
  });

  it('release_none alone stays healthy (0 < 30)', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'none' }).label).toBe('healthy');
  });

  it('release_none factor string still appears for display context despite 0 score impact', () => {
    const { score, factors } = scoreRepo({ ...healthy(), releaseStatus: 'none' });
    expect(score).toBe(0);
    expect(factors.some(f => f.toLowerCase().includes('no releases'))).toBe(true);
  });
});

describe('scoreRepo — structural rule: contributor_bus_factor (+5 — low impact only)', () => {
  it('adds 5 points when contributorStatus is bus_factor_risk', () => {
    expect(scoreRepo({ ...healthy(), contributorStatus: 'bus_factor_risk' }).score).toBe(5);
  });

  it('bus_factor alone stays healthy (5 < 30)', () => {
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
    // ci_failing(50) + release_stale(10) + stale_push(6) + stale_prs(6) + contributor_bus_factor(5) = 77 → critical
    const result = scoreRepo({
      ...healthy(), daysSincePush: 20, stalePrs: 3, ciStatus: 'failing', releaseStatus: 'stale',
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
    // ci_failing(50) + release_stale(10) + stale_push(6) + stale_prs(6) + elevated_open_prs(3) = 75
    const result = scoreRepo({
      ...healthy(), openPrs: 11, stalePrs: 3, daysSincePush: 15,
      ciStatus: 'failing', releaseStatus: 'stale',
    });
    expect(result.score).toBe(75);
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

  it('common structural combo (bus_factor + release_none + no_commits) stays well below monitor', () => {
    // contributor_bus_factor(5) + release_none(0) + no_commits(8) = 13 → healthy (< 30)
    const result = scoreRepo({
      ...healthy(), commits7d: 0, contributorStatus: 'bus_factor_risk', releaseStatus: 'none',
    });
    expect(result.score).toBe(13);
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

  it('abandoned contributors + no commits + failing CI reaches at-risk (≥50)', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned' });
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.label).toBe('critical'); // 100 capped
  });

  it('abandoned contributors + no commits + unknown CI → dormant, stays healthy (23 < 30)', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0, contributorStatus: 'abandoned' });
    expect(result.score).toBe(23);
    expect(result.label).toBe('healthy');
  });

  it('severe escalation (CI + abandoned + no commits) reaches critical (100, capped)', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned' });
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
    expect(OPERATIONAL_FACTOR_STRINGS.has('Repository appears abandoned')).toBe(true);
  });

  it('dormant factor is NOT in OPERATIONAL_FACTOR_STRINGS (structural, not operational)', () => {
    expect(OPERATIONAL_FACTOR_STRINGS.has('Repository appears dormant')).toBe(false);
  });

  it('structural factors are NOT in OPERATIONAL_FACTOR_STRINGS', () => {
    expect(OPERATIONAL_FACTOR_STRINGS.has('No commits in the last 7 days')).toBe(false);
    expect(OPERATIONAL_FACTOR_STRINGS.has('No releases in the last 90 days')).toBe(false);
    expect(OPERATIONAL_FACTOR_STRINGS.has('High bus-factor risk: one contributor dominates')).toBe(false);
  });
});

// ── Operational vs structural demarcation ────────────────────────────────────
// Verifies the rebalanced model: structural/maturity signals cannot drive at-risk;
// only active operational failures (CI failing, confirmed abandonment) do so.

describe('scoreRepo — operational vs structural demarcation', () => {
  it('spec combination (no releases + bus factor + no commits + unknown CI) stays healthy', () => {
    // The canonical structural-only worst case from the scoring spec.
    // no_commits_7d(8) + contributor_bus_factor(5) + release_none(0) = 13 → healthy
    const result = scoreRepo({
      ...healthy(), commits7d: 0,
      releaseStatus: 'none',
      contributorStatus: 'bus_factor_risk',
      ciStatus: 'unknown',
    });
    expect(result.score).toBe(13);
    expect(result.label).toBe('healthy');
    expect(result.label).not.toBe('at-risk');
    expect(result.label).not.toBe('critical');
  });

  it('no releases alone adds 0 points to operational score (maturity signal only)', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'none' }).score).toBe(0);
  });

  it('CI unknown alone adds 0 points (unmeasured is not failing)', () => {
    expect(scoreRepo({ ...healthy(), ciStatus: 'unknown' }).score).toBe(0);
  });

  it('release unknown alone adds 0 points (unmeasured is not stale)', () => {
    expect(scoreRepo({ ...healthy(), releaseStatus: 'unknown' }).score).toBe(0);
  });

  it('bus factor alone adds 5 points — low impact, stays healthy', () => {
    const result = scoreRepo({ ...healthy(), contributorStatus: 'bus_factor_risk' });
    expect(result.score).toBe(5);
    expect(result.label).toBe('healthy');
  });

  it('no commits alone adds 8 points — low impact, stays healthy', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0 });
    expect(result.score).toBe(8);
    expect(result.label).toBe('healthy');
  });

  it('CI failing alone raises score to at-risk (50 pts)', () => {
    const result = scoreRepo({ ...healthy(), ciStatus: 'failing' });
    expect(result.score).toBe(50);
    expect(result.label).toBe('at-risk');
  });

  it('confirmed abandoned + zero commits + CI failing → critical (operational escalation)', () => {
    const result = scoreRepo({
      ...healthy(), commits7d: 0, ciStatus: 'failing', contributorStatus: 'abandoned',
    });
    expect(result.score).toBe(100);
    expect(result.label).toBe('critical');
  });

  it('no single structural signal can reach at-risk on its own', () => {
    const structuralInputs = [
      { ...healthy(), commits7d: 0 },
      { ...healthy(), releaseStatus: 'none' },
      { ...healthy(), releaseStatus: 'stale' },
      { ...healthy(), contributorStatus: 'bus_factor_risk' },
      { ...healthy(), contributorStatus: 'low_activity' },
      { ...healthy(), openPrs: 11 },
      { ...healthy(), stalePrs: 3 },
      { ...healthy(), openIssues: 21 },
      { ...healthy(), daysSincePush: 15 },
    ];
    structuralInputs.forEach(function(inputs) {
      const result = scoreRepo(inputs);
      expect(result.score).toBeLessThan(50);
      expect(result.label).not.toBe('at-risk');
      expect(result.label).not.toBe('critical');
    });
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
