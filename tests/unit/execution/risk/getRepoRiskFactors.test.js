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

// ── Immutability ──────────────────────────────────────────────────────────────

describe('getRepoRiskFactors — does not mutate inputs', () => {
  it('does not mutate the passed factors array', () => {
    const factors = ['No commits in the last 7 days'];
    const copy = factors.slice();
    getRepoRiskFactors({ score: 25, factors });
    expect(factors).toEqual(copy);
  });
});
