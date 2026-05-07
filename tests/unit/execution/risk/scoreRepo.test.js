'use strict';

const { scoreRepo } = require('../../../../execution/risk/scoreRepo');

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

// ── Rule: no_commits_7d (+25) ─────────────────────────────────────────────────

describe('scoreRepo — rule: no_commits_7d', () => {
  it('adds 25 points when commits7d is 0', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 0 }).score).toBe(25);
  });

  it('does not trigger when commits7d is 1', () => {
    expect(scoreRepo({ ...healthy(), commits7d: 1 }).score).toBe(0);
  });

  it('includes the no-commits factor string', () => {
    const { factors } = scoreRepo({ ...healthy(), commits7d: 0 });
    expect(factors.some(f => f.toLowerCase().includes('commit'))).toBe(true);
  });
});

// ── Rule: stale_push (+20) ────────────────────────────────────────────────────

describe('scoreRepo — rule: stale_push', () => {
  it('adds 20 points when daysSincePush > 14', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: 15 }).score).toBe(20);
  });

  it('does not trigger when daysSincePush is exactly 14', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: 14 }).score).toBe(0);
  });

  it('does not trigger when daysSincePush is null', () => {
    expect(scoreRepo({ ...healthy(), daysSincePush: null }).score).toBe(0);
  });
});

// ── Rule: stale_prs (+20) ────────────────────────────────────────────────────

describe('scoreRepo — rule: stale_prs', () => {
  it('adds 20 points when stalePrs >= 3', () => {
    expect(scoreRepo({ ...healthy(), stalePrs: 3 }).score).toBe(20);
  });

  it('does not trigger when stalePrs is 2', () => {
    expect(scoreRepo({ ...healthy(), stalePrs: 2 }).score).toBe(0);
  });
});

// ── Rule: high_open_issues (+15) ──────────────────────────────────────────────

describe('scoreRepo — rule: high_open_issues', () => {
  it('adds 15 points when openIssues > 20', () => {
    expect(scoreRepo({ ...healthy(), openIssues: 21 }).score).toBe(15);
  });

  it('does not trigger when openIssues is exactly 20', () => {
    expect(scoreRepo({ ...healthy(), openIssues: 20 }).score).toBe(0);
  });
});

// ── Rule: elevated_open_prs (+10) ─────────────────────────────────────────────

describe('scoreRepo — rule: elevated_open_prs', () => {
  it('adds 10 points when openPrs > 10 (moderate rule is mutually exclusive)', () => {
    // stalePrs=0 and openPrs=11: elevated fires (+10); moderate requires openPrs<=10 so does NOT fire
    expect(scoreRepo({ ...healthy(), openPrs: 11 }).score).toBe(10);
  });

  it('does not trigger when openPrs is 5 or fewer', () => {
    expect(scoreRepo({ ...healthy(), openPrs: 5 }).score).toBe(0);
  });
});

// ── Score cap ─────────────────────────────────────────────────────────────────

describe('scoreRepo — score cap', () => {
  it('score is always between 0 and 100 regardless of inputs', () => {
    const worst = { commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30 };
    const { score } = scoreRepo(worst);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it('worst possible inputs produce the maximum score (all rules fire)', () => {
    const worst = { commits7d: 0, openPrs: 15, stalePrs: 5, openIssues: 25, daysSincePush: 30 };
    expect(scoreRepo(worst).score).toBe(90);
  });
});

// ── Label thresholds ──────────────────────────────────────────────────────────

describe('scoreRepo — label thresholds', () => {
  it('labels score < 30 as healthy', () => {
    expect(scoreRepo({ ...healthy(), openPrs: 6 }).label).toBe('healthy');
  });

  it('labels score 30-59 as at-risk', () => {
    // 30 points: stalePrs(3)=20 + stalePush(15)=20 → 40 → at-risk
    const atRisk = { commits7d: 5, openPrs: 2, stalePrs: 3, openIssues: 5, daysSincePush: 20 };
    const result = scoreRepo(atRisk);
    expect(result.score).toBeGreaterThanOrEqual(30);
    expect(result.label).toBe('at-risk');
  });

  it('labels score >= 60 as critical', () => {
    const critical = { commits7d: 0, openPrs: 2, stalePrs: 3, openIssues: 5, daysSincePush: 20 };
    const result = scoreRepo(critical);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.label).toBe('critical');
  });
});

// ── Trend ─────────────────────────────────────────────────────────────────────

describe('scoreRepo — trend', () => {
  it('returns stable when previousScore is null (first snapshot)', () => {
    expect(scoreRepo({ ...healthy(), previousScore: null }).trend).toBe('stable');
  });

  it('returns improving when score drops > 5 vs previousScore', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0 }); // score = 25
    const next = scoreRepo({ ...healthy(), previousScore: 60 }); // score = 0, prev = 60
    expect(next.trend).toBe('improving');
  });

  it('returns worsening when score rises > 5 vs previousScore', () => {
    const result = scoreRepo({ ...healthy(), commits7d: 0, previousScore: 0 }); // score=25, prev=0
    expect(result.trend).toBe('worsening');
  });

  it('returns stable when score delta <= 5', () => {
    // score=0, previousScore=3 → delta=3 → stable
    expect(scoreRepo({ ...healthy(), previousScore: 3 }).trend).toBe('stable');
  });
});
