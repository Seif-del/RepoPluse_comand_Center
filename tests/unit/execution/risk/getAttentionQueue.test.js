'use strict';

const { getAttentionQueue, WEIGHTS } = require('../../../../execution/risk/getAttentionQueue');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRepo(overrides = {}) {
  return {
    id:                1,
    fullName:          'owner/repo',
    score:             null,
    ciStatus:          'unknown',
    releaseStatus:     'unknown',
    contributorStatus: 'unknown',
    lastSyncedAt:      '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ── Module shape ───────────────────────────────────────────────────────────────

describe('getAttentionQueue — module shape', () => {
  it('exports getAttentionQueue as a function', () => {
    expect(typeof getAttentionQueue).toBe('function');
  });

  it('exports WEIGHTS as an object', () => {
    expect(typeof WEIGHTS).toBe('object');
  });

  it('WEIGHTS contains all expected keys', () => {
    const keys = [
      // Unified risk score band alignment
      'RISK_SCORE_CRITICAL', 'RISK_SCORE_AT_RISK', 'RISK_SCORE_MONITOR',
      // Freshness signals
      'CI_FAILING', 'CONTRIBUTOR_ABANDONED', 'CONTRIBUTOR_DORMANT',
      // Activity freshness
      'NO_RECENT_COMMITS',
      // Structural freshness
      'CONTRIBUTOR_BUS_FACTOR', 'RELEASE_STALE', 'CONTRIBUTOR_LOW', 'RELEASE_NONE',
      // Data-gap signals
      'CI_UNKNOWN', 'RELEASE_UNKNOWN', 'CONTRIBUTOR_UNKNOWN', 'NO_METRICS',
      // Forecast-awareness keys
      'TRAJ_ESCALATING', 'TRAJ_DETERIORATING', 'TRAJ_VOLATILE',
      'FORECAST_CRITICAL', 'FORECAST_HIGH',
      'PERSISTENT_RISK', 'ESC_HIGH', 'ESC_CRITICAL',
      'VOLATILITY_HIGH', 'CI_UNRESOLVED',
    ];
    keys.forEach(k => expect(WEIGHTS).toHaveProperty(k));
  });

  it('WEIGHTS no longer contains legacy RISK_SCORE_HIGH or RISK_SCORE_MID keys', () => {
    expect(WEIGHTS).not.toHaveProperty('RISK_SCORE_HIGH');
    expect(WEIGHTS).not.toHaveProperty('RISK_SCORE_MID');
  });
});

// ── Guard conditions ───────────────────────────────────────────────────────────

describe('getAttentionQueue — guard conditions', () => {
  it('returns [] when input is null', () => {
    expect(getAttentionQueue(null)).toEqual([]);
  });

  it('returns [] when input is undefined', () => {
    expect(getAttentionQueue(undefined)).toEqual([]);
  });

  it('returns [] when input is not an array', () => {
    expect(getAttentionQueue('bad')).toEqual([]);
    expect(getAttentionQueue(42)).toEqual([]);
    expect(getAttentionQueue({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(getAttentionQueue([])).toEqual([]);
  });
});

// ── Return shape ───────────────────────────────────────────────────────────────

describe('getAttentionQueue — return shape', () => {
  it('each item has repoId, name, attentionLevel, attentionScore, reasons', () => {
    const result = getAttentionQueue([makeRepo({ id: 7, fullName: 'o/r' })]);
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item).toHaveProperty('repoId', 7);
    expect(item).toHaveProperty('name', 'o/r');
    expect(item).toHaveProperty('attentionLevel');
    expect(item).toHaveProperty('attentionScore');
    expect(item).toHaveProperty('reasons');
    expect(Array.isArray(item.reasons)).toBe(true);
  });

  it('does not expose _syncedAt in output', () => {
    const result = getAttentionQueue([makeRepo()]);
    expect(result[0]).not.toHaveProperty('_syncedAt');
  });

  it('attentionScore is a number', () => {
    const result = getAttentionQueue([makeRepo({ score: 80, ciStatus: 'failing' })]);
    expect(typeof result[0].attentionScore).toBe('number');
  });
});

// ── Individual signal weights ──────────────────────────────────────────────────

describe('getAttentionQueue — signal weights', () => {
  it('CI_FAILING freshness adds WEIGHTS.CI_FAILING pts when score is 0', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_FAILING);
  });

  it('CONTRIBUTOR_ABANDONED freshness adds WEIGHTS.CONTRIBUTOR_ABANDONED pts only when CI is failing', () => {
    // Only failing CI corroborates abandonment.
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_ABANDONED + WEIGHTS.CI_FAILING);
  });

  it('CONTRIBUTOR_DORMANT fires (not ABANDONED) when abandoned + CI unknown', () => {
    // Unknown CI is not enough to confirm abandonment — treat as dormant.
    // CI_UNKNOWN(1) also fires alongside CONTRIBUTOR_DORMANT(10).
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT + WEIGHTS.CI_UNKNOWN);
  });

  it('CONTRIBUTOR_DORMANT freshness adds WEIGHTS.CONTRIBUTOR_DORMANT pts when abandoned + CI passing', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
  });

  it('RISK_SCORE_CRITICAL adds 65 pts when score >= 75', () => {
    const result = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RISK_SCORE_CRITICAL);
    expect(result[0].attentionScore).toBe(65);
  });

  it('RISK_SCORE_CRITICAL triggers at exactly 75 (not at 74)', () => {
    const at75 = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    const at74 = getAttentionQueue([makeRepo({ score: 74, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(at75[0].attentionScore).toBe(65);  // RISK_SCORE_CRITICAL
    expect(at74[0].attentionScore).toBe(45);  // RISK_SCORE_AT_RISK
  });

  it('RISK_SCORE_AT_RISK adds 45 pts when score >= 50 and < 75', () => {
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RISK_SCORE_AT_RISK);
    expect(result[0].attentionScore).toBe(45);
  });

  it('RISK_SCORE_AT_RISK triggers at exactly 50, not at 75 (CRITICAL takes over)', () => {
    const at50 = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    const at75 = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(at50[0].attentionScore).toBe(45);  // RISK_SCORE_AT_RISK
    expect(at75[0].attentionScore).toBe(65);  // RISK_SCORE_CRITICAL
  });

  it('RISK_SCORE_MONITOR adds 20 pts when score >= 30 and < 50', () => {
    const result = getAttentionQueue([makeRepo({ score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RISK_SCORE_MONITOR);
    expect(result[0].attentionScore).toBe(20);
  });

  it('RISK_SCORE_MONITOR triggers at exactly 30, not at 50 (AT_RISK takes over)', () => {
    const at30 = getAttentionQueue([makeRepo({ score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    const at50 = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(at30[0].attentionScore).toBe(20);
    expect(at50[0].attentionScore).toBe(45);
  });

  it('no RISK_SCORE tier fires when score < 30', () => {
    const result = getAttentionQueue([makeRepo({ score: 29, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
  });

  it('score=25 (now healthy in scoreRepo) fires no risk-score tier in attention', () => {
    const result = getAttentionQueue([makeRepo({ score: 25, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
    expect(result[0].attentionLevel).toBe('healthy');
  });

  it('CONTRIBUTOR_BUS_FACTOR adds 3 pts (structural, very reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_BUS_FACTOR);
  });

  it('RELEASE_STALE adds 3 pts (structural, very reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_STALE);
  });

  it('CONTRIBUTOR_LOW adds 2 pts (structural, very reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'low_activity' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_LOW);
  });

  it('RELEASE_NONE adds 2 pts (structural, very reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_NONE);
  });

  it('CI_UNKNOWN adds 1 pt (data-gap, near-zero)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_UNKNOWN);
  });

  it('RELEASE_UNKNOWN adds 1 pt (data-gap, near-zero)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'unknown', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_UNKNOWN);
  });

  it('CONTRIBUTOR_UNKNOWN adds 1 pt (data-gap, near-zero)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'unknown' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_UNKNOWN);
  });

  it('NO_METRICS adds 4 pts when score is null (data-gap signal)', () => {
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.NO_METRICS);
  });

  it('NO_METRICS does not trigger when score is 0', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
  });
});

// ── Attention levels — unified model ──────────────────────────────────────────

describe('getAttentionQueue — attention levels (unified model)', () => {
  it('score >= 60 → critical', () => {
    // RISK_SCORE_AT_RISK(45) + CI_FAILING(25) = 70 → critical
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(70);
  });

  it('RISK_SCORE_CRITICAL (score>=75) alone → critical', () => {
    const result = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(65);
  });

  it('score >= 40 and < 60 → high (RISK_SCORE_AT_RISK=45 alone)', () => {
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(45);
  });

  it('CONTRIBUTOR_DORMANT freshness (score=0, abandoned + CI unknown) → low (10+1=11 pts)', () => {
    // Unknown CI → dormant treatment. CONTRIBUTOR_DORMANT(10) + CI_UNKNOWN(1) = 11 → low.
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT + WEIGHTS.CI_UNKNOWN);
  });

  it('CONTRIBUTOR_ABANDONED freshness alone (score=0, CI failing) → medium (CI_FAILING 25 + CONTRIBUTOR_ABANDONED 30 = 55 → high)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_ABANDONED + WEIGHTS.CI_FAILING);
  });

  it('CONTRIBUTOR_DORMANT freshness alone (score=0, abandoned + CI passing) → low (10 pts)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
  });

  it('CONTRIBUTOR_DORMANT + RISK_SCORE_MONITOR → medium (score=35, CI unknown)', () => {
    // Unknown CI → dormant. RISK_SCORE_MONITOR(20) + CONTRIBUTOR_DORMANT(10) + CI_UNKNOWN(1) = 31 → medium.
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(31);
  });

  it('CONTRIBUTOR_ABANDONED + RISK_SCORE_MONITOR → high (score=35, CI failing)', () => {
    // Only failing CI triggers full abandoned weight.
    // RISK_SCORE_MONITOR(20) + CI_FAILING(25) + CONTRIBUTOR_ABANDONED(30) = 75 → critical
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(75);
  });

  it('CONTRIBUTOR_DORMANT + RISK_SCORE_MONITOR → medium (score=35, CI passing)', () => {
    // score=35 ≥ 30 → RISK_SCORE_MONITOR(20) + CONTRIBUTOR_DORMANT(10) = 30 → medium
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(30);
  });

  it('CI_FAILING freshness alone (score=0) → medium (25 pts)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(25);
  });

  it('RISK_SCORE_AT_RISK (score=50) → high (45 pts)', () => {
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(45);
  });

  it('score >= 20 and < 40 → medium (RISK_SCORE_MONITOR=20 alone at score=30)', () => {
    const result = getAttentionQueue([makeRepo({ score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(20);
  });

  it('score >= 5 and < 20 → low (RELEASE_STALE+BUS_FACTOR structural stack)', () => {
    // RELEASE_STALE(3) + BUS_FACTOR(3) = 6 → low
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(6);
  });

  it('score 0 → healthy', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('healthy');
    expect(result[0].attentionScore).toBe(0);
  });

  it('all unknown signals with no score → low (7 pts: 1+1+1+4)', () => {
    // CI_UNKNOWN(1) + RELEASE_UNKNOWN(1) + CONTRIBUTOR_UNKNOWN(1) + NO_METRICS(4) = 7
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' })]);
    expect(result[0].attentionScore).toBe(7);
    expect(result[0].attentionLevel).toBe('low');
  });

  it('no-metrics repo with all unknowns → low (not healthy)', () => {
    const result = getAttentionQueue([makeRepo({ score: null })]);
    // NO_METRICS(4) + CI_UNKNOWN(1) + RELEASE_UNKNOWN(1) + CONTRIBUTOR_UNKNOWN(1) = 7 → low
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionLevel).not.toBe('healthy');
  });
});

// ── Dormant contributor semantics ─────────────────────────────────────────────

describe('getAttentionQueue — dormant contributor semantics', () => {
  it('abandoned + CI passing → reason is "Repository appears dormant"', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
  });

  it('abandoned + CI unknown → reason is "Repository appears dormant" (not abandoned)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
  });

  it('abandoned + CI failing → reason is "Repository appears abandoned"', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears abandoned');
    expect(result[0].reasons).not.toContain('Repository appears dormant');
  });

  it('dormant attention score is lower than fully-corroborated abandoned score', () => {
    // dormant (CI passing, release healthy): CONTRIBUTOR_DORMANT(10) only
    // abandoned (CI failing, release healthy): CI_FAILING(25) + CONTRIBUTOR_ABANDONED(30) = 55
    const dormant   = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    const abandoned = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(dormant[0].attentionScore).toBeLessThan(abandoned[0].attentionScore);
    expect(dormant[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
    expect(abandoned[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_ABANDONED + WEIGHTS.CI_FAILING);
  });

  it('WEIGHTS.CONTRIBUTOR_DORMANT is less than WEIGHTS.CONTRIBUTOR_ABANDONED', () => {
    expect(WEIGHTS.CONTRIBUTOR_DORMANT).toBeLessThan(WEIGHTS.CONTRIBUTOR_ABANDONED);
  });
});

// ── Score cap ──────────────────────────────────────────────────────────────────

describe('getAttentionQueue — score capped at 100', () => {
  it('score is capped at 100 when signals sum beyond 100', () => {
    const result = getAttentionQueue([makeRepo({ score: 80, ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBeLessThanOrEqual(100);
  });

  it('high-signal repo caps at 100', () => {
    // RISK_SCORE_CRITICAL(65) + CI_FAILING(25) + CONTRIBUTOR_ABANDONED(30) = 120 → 100
    const result = getAttentionQueue([makeRepo({ score: 80, ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBe(100);
  });
});

// ── Reason strings ────────────────────────────────────────────────────────────

describe('getAttentionQueue — reason strings', () => {
  it('CI failing produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toContain('CI pipeline is failing');
  });

  it('contributor abandoned + CI failing produces abandoned reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears abandoned');
  });

  it('contributor abandoned + CI passing produces dormant reason (not abandoned)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
  });

  it('critical risk score produces a reason mentioning the score value', () => {
    const result = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons.some(r => r.includes('75'))).toBe(true);
  });

  it('at-risk score produces an elevated reason mentioning the score value', () => {
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons.some(r => r.includes('50'))).toBe(true);
  });

  it('monitored score (score=30) produces a reason mentioning the score value', () => {
    const result = getAttentionQueue([makeRepo({ score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons.some(r => r.includes('30'))).toBe(true);
  });

  it('score=25 (now healthy) produces no risk-score reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 25, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toHaveLength(0);
  });

  it('bus factor risk produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].reasons).toContain('High bus-factor risk');
  });

  it('stale release produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toContain('Stale release cadence');
  });

  it('low activity produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'low_activity' })]);
    expect(result[0].reasons).toContain('Low contributor activity');
  });

  it('no releases produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toContain('No releases found');
  });

  it('unknown CI produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toContain('CI status unknown');
  });

  it('no metrics produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toContain('No metrics available yet');
  });

  it('healthy repo (score < 30, all OK) has empty reasons', () => {
    const result = getAttentionQueue([makeRepo({ score: 10, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons).toHaveLength(0);
    expect(result[0].attentionLevel).toBe('healthy');
  });
});

// ── Sort order ────────────────────────────────────────────────────────────────

describe('getAttentionQueue — sort order', () => {
  it('sorts by attentionScore DESC', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'o/low',  score: 0,  ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
      makeRepo({ id: 2, fullName: 'o/high', score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].repoId).toBe(2);
    expect(result[1].repoId).toBe(1);
  });

  it('breaks attentionScore ties by lastSyncedAt DESC', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'o/older', score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
      makeRepo({ id: 2, fullName: 'o/newer', score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-06-01T00:00:00.000Z' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].repoId).toBe(2);
    expect(result[1].repoId).toBe(1);
  });

  it('breaks score and lastSyncedAt ties by name ASC', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'z/repo', score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
      makeRepo({ id: 2, fullName: 'a/repo', score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].name).toBe('a/repo');
    expect(result[1].name).toBe('z/repo');
  });

  it('handles null lastSyncedAt in sort (treated as epoch 0)', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'o/no-sync',  score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: null }),
      makeRepo({ id: 2, fullName: 'o/has-sync', score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].repoId).toBe(2);
  });
});

// ── Input immutability ────────────────────────────────────────────────────────

describe('getAttentionQueue — immutability', () => {
  it('does not mutate the input array', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'z/last',  score: 0,  ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' }),
      makeRepo({ id: 2, fullName: 'a/first', score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' }),
    ];
    const originalOrder = repos.map(r => r.id);
    getAttentionQueue(repos);
    expect(repos.map(r => r.id)).toEqual(originalOrder);
  });

  it('does not mutate individual repo objects', () => {
    const repo = makeRepo({ id: 1, fullName: 'o/r', score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' });
    const clone = { ...repo };
    getAttentionQueue([repo]);
    expect(repo).toEqual(clone);
  });
});

// ── Forecast-awareness weighting ──────────────────────────────────────────────

function makeForecastRepo(overrides = {}) {
  return makeRepo({
    score: 0,
    ciStatus:          'passing',
    releaseStatus:     'healthy',
    contributorStatus: 'healthy',
    trajectory:        null,
    forecastLevel:     null,
    escalationLevel:   null,
    volatilityLevel:   null,
    persistentRisk:    false,
    unresolvedCiRun:   false,
    ...overrides,
  });
}

describe('getAttentionQueue — forecast-awareness weights', () => {
  it('TRAJ_ESCALATING adds WEIGHTS.TRAJ_ESCALATING pts when trajectory=escalating', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'escalating' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_ESCALATING);
  });

  it('TRAJ_DETERIORATING adds WEIGHTS.TRAJ_DETERIORATING pts when trajectory=deteriorating', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'deteriorating' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_DETERIORATING);
  });

  it('TRAJ_VOLATILE adds WEIGHTS.TRAJ_VOLATILE pts when trajectory=volatile', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'volatile' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_VOLATILE);
  });

  it('FORECAST_CRITICAL adds WEIGHTS.FORECAST_CRITICAL pts when forecastLevel=critical', () => {
    const result = getAttentionQueue([makeForecastRepo({ forecastLevel: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.FORECAST_CRITICAL);
  });

  it('FORECAST_HIGH adds WEIGHTS.FORECAST_HIGH pts when forecastLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ forecastLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.FORECAST_HIGH);
  });

  it('PERSISTENT_RISK adds WEIGHTS.PERSISTENT_RISK pts when persistentRisk=true', () => {
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PERSISTENT_RISK);
  });

  it('ESC_HIGH adds WEIGHTS.ESC_HIGH pts when escalationLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_HIGH);
  });

  it('ESC_CRITICAL adds WEIGHTS.ESC_CRITICAL pts when escalationLevel=critical', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_CRITICAL);
  });

  it('ESC_CRITICAL and ESC_HIGH are mutually exclusive (critical takes precedence)', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_CRITICAL);
    expect(result[0].reasons.filter(r => r.includes('Escalation')).length).toBe(1);
  });

  it('VOLATILITY_HIGH adds WEIGHTS.VOLATILITY_HIGH pts when volatilityLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ volatilityLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.VOLATILITY_HIGH);
  });

  it('CI_UNRESOLVED adds WEIGHTS.CI_UNRESOLVED pts when unresolvedCiRun=true', () => {
    const result = getAttentionQueue([makeForecastRepo({ unresolvedCiRun: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_UNRESOLVED);
  });

  it('forecast signals stack with base signals (additive, capped at 100)', () => {
    // RISK_SCORE_AT_RISK(45) + CI_FAILING(25) + TRAJ_ESCALATING(15) + ESC_CRITICAL(15) = 100
    const result = getAttentionQueue([makeForecastRepo({
      score:           50,
      ciStatus:        'failing',
      trajectory:      'escalating',
      escalationLevel: 'critical',
    })]);
    expect(result[0].attentionScore).toBe(100);
  });

  it('escalating repo outranks identical stable repo', () => {
    const repos = [
      makeForecastRepo({ id: 1, fullName: 'o/stable',    ciStatus: 'failing' }),
      makeForecastRepo({ id: 2, fullName: 'o/escalating', ciStatus: 'failing', trajectory: 'escalating' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].repoId).toBe(2);
  });

  it('absent forecast fields add no points (graceful fallback)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
    expect(result[0].attentionLevel).toBe('healthy');
  });

  it('persistent risk reason string is included', () => {
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].reasons).toContain('Persistent operational risk');
  });

  it('escalating trajectory reason string is included', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'escalating' })]);
    expect(result[0].reasons).toContain('Escalating operational trajectory');
  });

  it('unresolved CI instability reason string is included', () => {
    const result = getAttentionQueue([makeForecastRepo({ unresolvedCiRun: true })]);
    expect(result[0].reasons).toContain('Repeated unresolved CI instability');
  });
});

// ── Trajectory in output ──────────────────────────────────────────────────────

describe('getAttentionQueue — trajectory field in output', () => {
  it('output item includes trajectory field', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'escalating' })]);
    expect(result[0]).toHaveProperty('trajectory', 'escalating');
  });

  it('trajectory is null when not provided', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].trajectory).toBeNull();
  });

  it('trajectory is passed through for all trajectory values', () => {
    const trajectories = ['escalating', 'deteriorating', 'volatile', 'recovering', 'stable', 'unknown'];
    trajectories.forEach(function(traj) {
      const result = getAttentionQueue([makeForecastRepo({ trajectory: traj })]);
      expect(result[0].trajectory).toBe(traj);
    });
  });
});

// ── Unified model operational risk calibration ────────────────────────────────

describe('getAttentionQueue — unified model calibration', () => {
  it('structural-only worst case (score=28) stays below At Risk in attention', () => {
    // score=28 < 30 → no RISK_SCORE_MONITOR fires; only structural freshness
    // CI_UNKNOWN(1) + RELEASE_STALE(3) + BUS_FACTOR(3) = 7 → low
    const result = getAttentionQueue([makeRepo({
      score: 28, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('active operational instability (CI failing) + unified score reaches critical', () => {
    // score=50 (at-risk) + CI_FAILING freshness: RISK_SCORE_AT_RISK(45)+CI_FAILING(25)=70 → critical
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('unified critical score (75+) alone → attention critical', () => {
    const result = getAttentionQueue([makeRepo({
      score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(65);
  });

  it('unified at-risk score (50) → attention high', () => {
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(45);
  });

  it('unified monitor score (30) → attention medium', () => {
    const result = getAttentionQueue([makeRepo({
      score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(20);
  });

  it('score=25 (healthy in scoreRepo) → no tier fires → attention healthy', () => {
    const result = getAttentionQueue([makeRepo({
      score: 25, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(0);
    expect(result[0].attentionLevel).toBe('healthy');
  });

  it('score=0 with structural freshness signals stays below At Risk', () => {
    // RELEASE_STALE(3) + BUS_FACTOR(3) = 6 → low; not high or critical
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('escalating trajectory + at-risk score crosses into critical attention', () => {
    // RISK_SCORE_AT_RISK(45) + TRAJ_ESCALATING(15) = 60 → critical
    const result = getAttentionQueue([makeForecastRepo({ score: 50, trajectory: 'escalating' })]);
    expect(result[0].attentionScore).toBe(60);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('escalating trajectory outweighs structural-only concern stack', () => {
    // structural: score=28 → no RISK_SCORE_MONITOR + CI_UNKNOWN(1)+RELEASE_STALE(3)+BUS_FACTOR(3) = 7
    // escalating: score=25 → no RISK_SCORE_MONITOR + TRAJ_ESCALATING(15) = 15
    const structural = getAttentionQueue([makeRepo({
      score: 28, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    const escalating = getAttentionQueue([makeForecastRepo({ score: 25, trajectory: 'escalating' })]);
    expect(escalating[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
  });

  it('persistent risk alone → low attention (15 pts < 20)', () => {
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PERSISTENT_RISK);
    expect(result[0].attentionLevel).toBe('low');
  });

  it('persistent risk + CI failing freshness → high attention', () => {
    // CI_FAILING(25) + PERSISTENT_RISK(15) = 40 → high
    const result = getAttentionQueue([makeForecastRepo({
      ciStatus: 'failing', persistentRisk: true,
    })]);
    expect(result[0].attentionScore).toBe(40);
    expect(result[0].attentionLevel).toBe('high');
  });

  it('data-gap signals alone cannot reach At Risk', () => {
    // CI_UNKNOWN(1)+RELEASE_UNKNOWN(1)+CONTRIBUTOR_UNKNOWN(1)+NO_METRICS(4) = 7 < 40
    const result = getAttentionQueue([makeRepo({
      score: null, ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown',
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
  });

  it('score/attention band alignment: score=75 → attention critical', () => {
    const result = getAttentionQueue([makeRepo({
      score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('score/attention band alignment: score=50 → attention high', () => {
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('high');
  });

  it('score/attention band alignment: score=30 → attention medium', () => {
    const result = getAttentionQueue([makeRepo({
      score: 30, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('medium');
  });

  it('score/attention band alignment: score=29 → attention healthy (below new threshold)', () => {
    const result = getAttentionQueue([makeRepo({
      score: 29, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(0);
    expect(result[0].attentionLevel).toBe('healthy');
  });

  it('score/attention band alignment: score=0 → attention healthy', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionLevel).toBe('healthy');
  });

  it('CI_FAILING freshness (score=0) → medium attention, not critical', () => {
    // Pre-sync freshness: CI just started failing. score not yet updated → medium concern.
    // After next sync: score=50 → attention high/critical.
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(25);
    expect(result[0].attentionLevel).toBe('medium');
  });

  it('CI failing still reaches At Risk when combined with monitor-band score', () => {
    // score=30 → RISK_SCORE_MONITOR(20) + CI_FAILING(25) = 45 → high (At Risk)
    const result = getAttentionQueue([makeRepo({
      score: 30, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(45);
    expect(result[0].attentionLevel).toBe('high');
  });

  it('abandoned + CI failing reaches critical (at-risk band + both freshness signals)', () => {
    // score=50 → RISK_SCORE_AT_RISK(45) + CI_FAILING(25) + CONTRIBUTOR_ABANDONED(30) = 100 → critical
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned',
    })]);
    expect(result[0].attentionScore).toBe(100);
    expect(result[0].attentionLevel).toBe('critical');
  });
});

// ── Reason ordering — no recent commits before bus-factor ─────────────────────

describe('getAttentionQueue — reason ordering: no recent commits vs bus-factor', () => {
  it('NO_RECENT_COMMITS adds 1 pt when noRecentCommits=true', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
      noRecentCommits: true,
    })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.NO_RECENT_COMMITS);
    expect(result[0].attentionScore).toBe(1);
  });

  it('"No recent commits" reason appears before "High bus-factor risk" when both present', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    const reasons = result[0].reasons;
    const noCommitsIdx = reasons.indexOf('No recent commits');
    const busFactorIdx = reasons.indexOf('High bus-factor risk');
    expect(noCommitsIdx).toBeGreaterThanOrEqual(0);
    expect(busFactorIdx).toBeGreaterThanOrEqual(0);
    expect(noCommitsIdx).toBeLessThan(busFactorIdx);
  });

  it('"No recent commits" reason appears before "Stale release cadence" when both present', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'healthy',
      noRecentCommits: true,
    })]);
    const reasons = result[0].reasons;
    const noCommitsIdx = reasons.indexOf('No recent commits');
    const staleIdx     = reasons.indexOf('Stale release cadence');
    expect(noCommitsIdx).toBeGreaterThanOrEqual(0);
    expect(staleIdx).toBeGreaterThanOrEqual(0);
    expect(noCommitsIdx).toBeLessThan(staleIdx);
  });

  it('"No recent commits" reason appears before "No releases found" when both present', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'healthy',
      noRecentCommits: true,
    })]);
    const reasons = result[0].reasons;
    const noCommitsIdx = reasons.indexOf('No recent commits');
    const noRelIdx     = reasons.indexOf('No releases found');
    expect(noCommitsIdx).toBeGreaterThanOrEqual(0);
    expect(noRelIdx).toBeGreaterThanOrEqual(0);
    expect(noCommitsIdx).toBeLessThan(noRelIdx);
  });

  it('"High bus-factor risk" still appears when applicable without noRecentCommits', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      noRecentCommits: false,
    })]);
    expect(result[0].reasons).toContain('High bus-factor risk');
    expect(result[0].reasons).not.toContain('No recent commits');
  });

  it('structural-only repo with noRecentCommits + bus-factor stays low/healthy (not at-risk)', () => {
    // NO_RECENT_COMMITS(1) + CONTRIBUTOR_BUS_FACTOR(3) = 4 → healthy (< 5)
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    expect(result[0].attentionScore).toBe(4);
    expect(result[0].attentionLevel).toBe('healthy');
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('CI failing still outranks both and appears first in reasons', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    const reasons = result[0].reasons;
    const ciIdx         = reasons.indexOf('CI pipeline is failing');
    const noCommitsIdx  = reasons.indexOf('No recent commits');
    const busFactorIdx  = reasons.indexOf('High bus-factor risk');
    expect(ciIdx).toBe(0);
    expect(noCommitsIdx).toBeGreaterThan(ciIdx);
    expect(busFactorIdx).toBeGreaterThan(noCommitsIdx);
  });

  it('noRecentCommits=false (absent) produces no no-commits reason', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].reasons).not.toContain('No recent commits');
  });

  it('noRecentCommits does not make a structural-only repo At Risk', () => {
    // Worst case structural: score=28 (< 30, no MONITOR tier) + noRecentCommits(1)
    // + BUS_FACTOR(3) + CI_UNKNOWN(1) + RELEASE_STALE(3) = 8 → low, well below 40
    const result = getAttentionQueue([makeRepo({
      score: 28, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });
});

// ── Full dormant/abandoned semantic model ─────────────────────────────────────

describe('getAttentionQueue — dormant vs abandoned full semantic model', () => {
  it('abandoned + CI failing → abandoned reason (high-severity corroborated)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears abandoned');
    expect(result[0].reasons).not.toContain('Repository appears dormant');
  });

  it('abandoned + CI passing → dormant reason (orange/amber, not red)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
  });

  it('abandoned + CI unknown → dormant reason (unknown CI insufficient to confirm abandonment)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
  });

  it('direct dormant contributorStatus produces dormant reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', contributorStatus: 'dormant' })]);
    expect(result[0].reasons).toContain('Repository appears dormant');
  });

  it('direct dormant contributorStatus attentionScore equals CONTRIBUTOR_DORMANT', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'dormant' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
  });

  it('severity ordering: abandoned (CI failing) > dormant (CI unknown) > dormant (CI passing)', () => {
    const abandoned = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    const dormantUnk = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    const dormantPass = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(abandoned[0].attentionScore).toBeGreaterThan(dormantUnk[0].attentionScore);
    expect(dormantUnk[0].attentionScore).toBeGreaterThan(dormantPass[0].attentionScore);
  });

  it('low_activity remains distinct and lower than dormant', () => {
    const dormant    = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    const lowActivity = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'low_activity' })]);
    expect(dormant[0].attentionScore).toBeGreaterThan(lowActivity[0].attentionScore);
    expect(dormant[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
    expect(lowActivity[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_LOW);
  });

  it('bus_factor_risk remains distinct from both dormant and abandoned', () => {
    const busFactor = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk' })]);
    expect(busFactor[0].reasons).toContain('High bus-factor risk');
    expect(busFactor[0].reasons).not.toContain('Repository appears dormant');
    expect(busFactor[0].reasons).not.toContain('Repository appears abandoned');
    expect(busFactor[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_BUS_FACTOR);
  });

  it('false-abandonment regression: CI passing always prevents abandoned reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).not.toContain('Repository appears abandoned');
    expect(result[0].reasons).toContain('Repository appears dormant');
  });
});
