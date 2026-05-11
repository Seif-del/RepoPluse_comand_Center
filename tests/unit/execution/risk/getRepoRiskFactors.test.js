'use strict';

const { getRepoRiskFactors, NOT_MEASURED } = require('../../../../execution/risk/getRepoRiskFactors');

// ── Return shape ──────────────────────────────────────────────────────────────

describe('getRepoRiskFactors — return shape', () => {
  it('always returns hasMetrics, triggered, notMeasured, allClear', () => {
    const keys = Object.keys(getRepoRiskFactors({ score: null, label: null, factors: null })).sort();
    expect(keys).toEqual(['allClear', 'hasMetrics', 'notMeasured', 'triggered']);
  });

  it('triggered is always an array', () => {
    expect(Array.isArray(getRepoRiskFactors({ score: null }).triggered)).toBe(true);
  });

  it('notMeasured is always an array', () => {
    expect(Array.isArray(getRepoRiskFactors({ score: 0, factors: [] }).notMeasured)).toBe(true);
  });
});

// ── No metrics (never synced) ─────────────────────────────────────────────────

describe('getRepoRiskFactors — no metrics', () => {
  it('hasMetrics is false when score is null', () => {
    expect(getRepoRiskFactors({ score: null, label: null, factors: null }).hasMetrics).toBe(false);
  });

  it('hasMetrics is false when score is undefined', () => {
    expect(getRepoRiskFactors({ score: undefined }).hasMetrics).toBe(false);
  });

  it('hasMetrics is false when called with no arguments', () => {
    expect(getRepoRiskFactors().hasMetrics).toBe(false);
  });

  it('triggered is empty when no metrics', () => {
    expect(getRepoRiskFactors({ score: null }).triggered).toHaveLength(0);
  });

  it('allClear is false when no metrics (data is absent, not clean)', () => {
    expect(getRepoRiskFactors({ score: null }).allClear).toBe(false);
  });

  it('notMeasured is non-empty when no metrics', () => {
    expect(getRepoRiskFactors({ score: null }).notMeasured.length).toBeGreaterThan(0);
  });
});

// ── Healthy repo (synced, no triggered factors) ───────────────────────────────

describe('getRepoRiskFactors — healthy repo', () => {
  const healthy = { score: 0, label: 'healthy', factors: [] };

  it('hasMetrics is true for score 0', () => {
    expect(getRepoRiskFactors(healthy).hasMetrics).toBe(true);
  });

  it('allClear is true when factors array is empty', () => {
    expect(getRepoRiskFactors(healthy).allClear).toBe(true);
  });

  it('triggered is empty for a healthy repo', () => {
    expect(getRepoRiskFactors(healthy).triggered).toHaveLength(0);
  });

  it('notMeasured still lists unsupported factors for a healthy repo', () => {
    expect(getRepoRiskFactors(healthy).notMeasured.length).toBeGreaterThan(0);
  });

  it('handles factors: null gracefully when score is present (treats as empty)', () => {
    const result = getRepoRiskFactors({ score: 0, label: 'healthy', factors: null });
    expect(result.hasMetrics).toBe(true);
    expect(result.triggered).toHaveLength(0);
    expect(result.allClear).toBe(true);
  });
});

// ── Stale PRs ─────────────────────────────────────────────────────────────────

describe('getRepoRiskFactors — stale PRs', () => {
  const stalePrFactor = '3 or more stale pull requests (open > 7 days)';
  const params = { score: 20, label: 'at-risk', factors: [stalePrFactor] };

  it('hasMetrics is true', () => {
    expect(getRepoRiskFactors(params).hasMetrics).toBe(true);
  });

  it('triggered contains the stale PR factor', () => {
    expect(getRepoRiskFactors(params).triggered).toContain(stalePrFactor);
  });

  it('allClear is false', () => {
    expect(getRepoRiskFactors(params).allClear).toBe(false);
  });
});

// ── No commits ────────────────────────────────────────────────────────────────

describe('getRepoRiskFactors — no commits in last 7 days', () => {
  const noCommitsFactor = 'No commits in the last 7 days';
  const params = { score: 25, label: 'at-risk', factors: [noCommitsFactor] };

  it('triggered contains the no-commits factor', () => {
    expect(getRepoRiskFactors(params).triggered).toContain(noCommitsFactor);
  });

  it('allClear is false', () => {
    expect(getRepoRiskFactors(params).allClear).toBe(false);
  });
});

// ── High open issues ──────────────────────────────────────────────────────────

describe('getRepoRiskFactors — too many open issues', () => {
  const issuesFactor = 'More than 20 open issues';
  const params = { score: 15, label: 'at-risk', factors: [issuesFactor] };

  it('triggered contains the high-issues factor', () => {
    expect(getRepoRiskFactors(params).triggered).toContain(issuesFactor);
  });

  it('allClear is false', () => {
    expect(getRepoRiskFactors(params).allClear).toBe(false);
  });
});

// ── Multiple factors ──────────────────────────────────────────────────────────

describe('getRepoRiskFactors — multiple triggered factors', () => {
  const f1 = 'No commits in the last 7 days';
  const f2 = '3 or more stale pull requests (open > 7 days)';
  const f3 = 'More than 20 open issues';
  const params = { score: 60, label: 'critical', factors: [f1, f2, f3] };

  it('triggered contains all three factors', () => {
    const { triggered } = getRepoRiskFactors(params);
    expect(triggered).toContain(f1);
    expect(triggered).toContain(f2);
    expect(triggered).toContain(f3);
  });

  it('triggered length matches the factors array length', () => {
    expect(getRepoRiskFactors(params).triggered).toHaveLength(3);
  });

  it('allClear is false', () => {
    expect(getRepoRiskFactors(params).allClear).toBe(false);
  });
});

// ── Unsupported metrics (notMeasured) ─────────────────────────────────────────

describe('getRepoRiskFactors — unsupported metrics are reported as not measured', () => {
  it('notMeasured includes CI/CD pipeline status', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(true);
  });

  it('notMeasured includes release activity', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(true);
  });

  it('notMeasured includes dependency vulnerabilities', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured.some(m => m.toLowerCase().includes('vulnerabilit'))).toBe(true);
  });

  it('NOT_MEASURED export matches the list used internally', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured).toEqual(NOT_MEASURED);
  });

  it('notMeasured is returned even for risky repos', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 70, factors: ['No commits in the last 7 days'] });
    expect(notMeasured.length).toBeGreaterThan(0);
  });
});

// ── CI status — passing ───────────────────────────────────────────────────────

describe('getRepoRiskFactors — ciStatus passing', () => {
  it('does not add a CI factor to triggered when passing', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'passing' });
    expect(triggered.some(f => f.toLowerCase().includes('ci'))).toBe(false);
  });

  it('removes CI/CD pipeline status from notMeasured when status is known', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'passing' });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(false);
  });

  it('keeps release activity and dependency vulnerabilities in notMeasured', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'passing' });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(true);
    expect(notMeasured.some(m => m.toLowerCase().includes('vulnerabilit'))).toBe(true);
  });

  it('allClear is true when CI is passing and no other factors', () => {
    expect(getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'passing' }).allClear).toBe(true);
  });
});

// ── CI status — failing ───────────────────────────────────────────────────────

describe('getRepoRiskFactors — ciStatus failing', () => {
  it('adds CI failing factor to triggered', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'failing' });
    expect(triggered.some(f => f.toLowerCase().includes('ci'))).toBe(true);
  });

  it('allClear is false when CI is failing even if factors is empty', () => {
    expect(getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'failing' }).allClear).toBe(false);
  });

  it('removes CI/CD pipeline status from notMeasured when failing', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'failing' });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(false);
  });

  it('accumulates CI factor alongside other triggered factors', () => {
    const { triggered } = getRepoRiskFactors({
      score: 50, factors: ['No commits in the last 7 days'], ciStatus: 'failing',
    });
    expect(triggered).toHaveLength(2);
    expect(triggered.some(f => f.toLowerCase().includes('ci'))).toBe(true);
  });

  it('does not mutate the passed factors array when CI is failing', () => {
    const factors = ['No commits in the last 7 days'];
    const copy = factors.slice();
    getRepoRiskFactors({ score: 50, factors, ciStatus: 'failing' });
    expect(factors).toEqual(copy);
  });
});

// ── CI status — unknown / absent ──────────────────────────────────────────────

describe('getRepoRiskFactors — ciStatus unknown or absent', () => {
  it('keeps CI/CD in notMeasured when ciStatus is unknown', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'unknown' });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(true);
  });

  it('keeps CI/CD in notMeasured when ciStatus is absent', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(true);
  });

  it('does not add a CI factor to triggered when ciStatus is unknown', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], ciStatus: 'unknown' });
    expect(triggered.some(f => f.toLowerCase().includes('ci'))).toBe(false);
  });

  it('hasMetrics is false and notMeasured includes CI when no score and ciStatus unknown', () => {
    const result = getRepoRiskFactors({ score: null, ciStatus: 'unknown' });
    expect(result.hasMetrics).toBe(false);
    expect(result.notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(true);
  });

  it('hasMetrics is false and notMeasured drops CI when no score but ciStatus passing', () => {
    const result = getRepoRiskFactors({ score: null, ciStatus: 'passing' });
    expect(result.hasMetrics).toBe(false);
    expect(result.notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(false);
  });
});

// ── Release status — healthy ──────────────────────────────────────────────────

describe('getRepoRiskFactors — releaseStatus healthy', () => {
  it('does not add a release factor to triggered when healthy', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'healthy' });
    expect(triggered.some(f => f.toLowerCase().includes('release'))).toBe(false);
  });

  it('removes Release activity from notMeasured when status is known', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'healthy' });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(false);
  });

  it('keeps dependency vulnerabilities in notMeasured', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'healthy' });
    expect(notMeasured.some(m => m.toLowerCase().includes('vulnerabilit'))).toBe(true);
  });

  it('allClear is true when release is healthy and no other factors', () => {
    expect(getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'healthy' }).allClear).toBe(true);
  });
});

// ── Release status — stale ────────────────────────────────────────────────────

describe('getRepoRiskFactors — releaseStatus stale', () => {
  it('adds stale release factor to triggered', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'stale' });
    expect(triggered.some(f => f.toLowerCase().includes('90 days'))).toBe(true);
  });

  it('allClear is false when release is stale', () => {
    expect(getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'stale' }).allClear).toBe(false);
  });

  it('removes Release activity from notMeasured when stale', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'stale' });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(false);
  });

  it('accumulates stale factor alongside other triggered factors', () => {
    const { triggered } = getRepoRiskFactors({
      score: 40, factors: ['No commits in the last 7 days'], releaseStatus: 'stale',
    });
    expect(triggered).toHaveLength(2);
    expect(triggered.some(f => f.toLowerCase().includes('90 days'))).toBe(true);
  });
});

// ── Release status — none ─────────────────────────────────────────────────────

describe('getRepoRiskFactors — releaseStatus none', () => {
  it('adds no-releases factor to triggered', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'none' });
    expect(triggered.some(f => f.toLowerCase().includes('no releases'))).toBe(true);
  });

  it('allClear is false when releaseStatus is none', () => {
    expect(getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'none' }).allClear).toBe(false);
  });

  it('removes Release activity from notMeasured when none', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'none' });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(false);
  });
});

// ── Release status — unknown / absent ────────────────────────────────────────

describe('getRepoRiskFactors — releaseStatus unknown or absent', () => {
  it('keeps Release activity in notMeasured when releaseStatus is unknown', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'unknown' });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(true);
  });

  it('keeps Release activity in notMeasured when releaseStatus is absent', () => {
    const { notMeasured } = getRepoRiskFactors({ score: 0, factors: [] });
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(true);
  });

  it('does not add a release factor to triggered when releaseStatus is unknown', () => {
    const { triggered } = getRepoRiskFactors({ score: 0, factors: [], releaseStatus: 'unknown' });
    expect(triggered.some(f => f.toLowerCase().includes('release'))).toBe(false);
  });
});

// ── CI + Release combined ─────────────────────────────────────────────────────

describe('getRepoRiskFactors — CI and release combined', () => {
  it('removes both CI and Release from notMeasured when both are known', () => {
    const { notMeasured } = getRepoRiskFactors({
      score: 0, factors: [], ciStatus: 'passing', releaseStatus: 'healthy',
    });
    expect(notMeasured.some(m => m.toLowerCase().includes('ci'))).toBe(false);
    expect(notMeasured.some(m => m.toLowerCase().includes('release'))).toBe(false);
    expect(notMeasured).toEqual(['Dependency vulnerabilities']);
  });

  it('accumulates CI failing + stale release factors together', () => {
    const { triggered } = getRepoRiskFactors({
      score: 60, factors: [], ciStatus: 'failing', releaseStatus: 'stale',
    });
    expect(triggered.some(f => f.toLowerCase().includes('ci'))).toBe(true);
    expect(triggered.some(f => f.toLowerCase().includes('90 days'))).toBe(true);
    expect(triggered).toHaveLength(2);
  });

  it('allClear is false when both CI is failing and release is stale', () => {
    expect(getRepoRiskFactors({
      score: 0, factors: [], ciStatus: 'failing', releaseStatus: 'stale',
    }).allClear).toBe(false);
  });

  it('does not mutate the passed factors array with multiple additions', () => {
    const factors = ['No commits in the last 7 days'];
    const copy = factors.slice();
    getRepoRiskFactors({ score: 50, factors, ciStatus: 'failing', releaseStatus: 'stale' });
    expect(factors).toEqual(copy);
  });
});

// ── Immutability ──────────────────────────────────────────────────────────────

describe('getRepoRiskFactors — does not mutate inputs', () => {
  it('does not mutate the passed factors array', () => {
    const factors = ['No commits in the last 7 days'];
    const copy = factors.slice();
    getRepoRiskFactors({ score: 25, factors });
    expect(factors).toEqual(copy);
  });
});
