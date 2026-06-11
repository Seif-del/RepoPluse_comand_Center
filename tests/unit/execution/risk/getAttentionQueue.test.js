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
      // Behavioral operational signals
      'CI_FAILING', 'CONTRIBUTOR_ABANDONED', 'CONTRIBUTOR_DORMANT',
      // Activity freshness
      'NO_RECENT_COMMITS',
      // Structural context
      'CONTRIBUTOR_BUS_FACTOR', 'RELEASE_STALE', 'CONTRIBUTOR_LOW', 'RELEASE_NONE',
      // Data-gap signals
      'CI_UNKNOWN', 'RELEASE_UNKNOWN', 'CONTRIBUTOR_UNKNOWN', 'NO_METRICS',
      // Forecast-awareness keys
      'TRAJ_ESCALATING', 'TRAJ_DETERIORATING', 'TRAJ_VOLATILE',
      'FORECAST_CRITICAL', 'FORECAST_HIGH',
      'PERSISTENT_RISK', 'ESC_HIGH', 'ESC_CRITICAL',
      'VOLATILITY_HIGH', 'CI_UNRESOLVED',
      // PR Health operational signals
      'PR_HEALTH_CRITICAL', 'PR_HEALTH_AT_RISK', 'PR_HEALTH_MONITOR',
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
  it('each item has repoId, name, attentionLevel, attentionScore, reasons, drivers', () => {
    const result = getAttentionQueue([makeRepo({ id: 7, fullName: 'o/r' })]);
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item).toHaveProperty('repoId', 7);
    expect(item).toHaveProperty('name', 'o/r');
    expect(item).toHaveProperty('attentionLevel');
    expect(item).toHaveProperty('attentionScore');
    expect(item).toHaveProperty('reasons');
    expect(Array.isArray(item.reasons)).toBe(true);
    expect(item).toHaveProperty('drivers');
    expect(Array.isArray(item.drivers)).toBe(true);
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
    // RISK_SCORE_AT_RISK(45) + CI_FAILING(40) = 85 → critical
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(85);
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

  it('CONTRIBUTOR_DORMANT freshness (score=0, abandoned + CI unknown) → low (10+2=12 pts)', () => {
    // Unknown CI → dormant treatment. CONTRIBUTOR_DORMANT(10) + CI_UNKNOWN(2) = 12 → low.
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT + WEIGHTS.CI_UNKNOWN);
  });

  it('CONTRIBUTOR_ABANDONED freshness alone (score=0, CI failing) → critical (CI_FAILING 40 + CONTRIBUTOR_ABANDONED 40 = 80)', () => {
    // Behavioral signals now significantly weighted: 40+40=80 → critical.
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_ABANDONED + WEIGHTS.CI_FAILING);
  });

  it('CONTRIBUTOR_DORMANT freshness alone (score=0, abandoned + CI passing) → low (10 pts)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_DORMANT);
  });

  it('CONTRIBUTOR_DORMANT + RISK_SCORE_MONITOR → medium (score=35, CI unknown)', () => {
    // Unknown CI → dormant. RISK_SCORE_MONITOR(20) + CONTRIBUTOR_DORMANT(10) + CI_UNKNOWN(2) = 32 → medium.
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(32);
  });

  it('CONTRIBUTOR_ABANDONED + RISK_SCORE_MONITOR → critical (score=35, CI failing)', () => {
    // Only failing CI triggers full abandoned weight.
    // RISK_SCORE_MONITOR(20) + CI_FAILING(40) + CONTRIBUTOR_ABANDONED(40) = 100 → critical (capped)
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(100);
  });

  it('CONTRIBUTOR_DORMANT + RISK_SCORE_MONITOR → medium (score=35, CI passing)', () => {
    // score=35 ≥ 30 → RISK_SCORE_MONITOR(20) + CONTRIBUTOR_DORMANT(10) = 30 → medium
    const result = getAttentionQueue([makeRepo({ score: 35, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(30);
  });

  it('CI_FAILING behavioral alone (score=0) → high (40 pts)', () => {
    // Behavioral CI_FAILING(40) dominates; high attention even without a base score.
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(40);
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
    // RELEASE_STALE(3) + BUS_FACTOR(5) = 8 → low (structural context only)
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(8);
  });

  it('score 0 → healthy', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('healthy');
    expect(result[0].attentionScore).toBe(0);
  });

  it('all unknown signals with no score → low (9 pts: 2+2+1+4)', () => {
    // CI_UNKNOWN(2) + RELEASE_UNKNOWN(2) + CONTRIBUTOR_UNKNOWN(1) + NO_METRICS(4) = 9
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' })]);
    expect(result[0].attentionScore).toBe(9);
    expect(result[0].attentionLevel).toBe('low');
  });

  it('no-metrics repo with all unknowns → low (not healthy)', () => {
    const result = getAttentionQueue([makeRepo({ score: null })]);
    // NO_METRICS(4) + CI_UNKNOWN(2) + RELEASE_UNKNOWN(2) + CONTRIBUTOR_UNKNOWN(1) = 9 → low
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
    // RISK_SCORE_AT_RISK(45) + TRAJ_ESCALATING(30) = 75 → critical
    const result = getAttentionQueue([makeForecastRepo({ score: 50, trajectory: 'escalating' })]);
    expect(result[0].attentionScore).toBe(75);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('escalating trajectory outweighs structural-only concern stack', () => {
    // structural: score=28 → no RISK_SCORE_MONITOR + CI_UNKNOWN(2)+RELEASE_STALE(3)+BUS_FACTOR(5) = 10
    // escalating: score=25 → no RISK_SCORE_MONITOR + TRAJ_ESCALATING(30) = 30
    const structural = getAttentionQueue([makeRepo({
      score: 28, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    const escalating = getAttentionQueue([makeForecastRepo({ score: 25, trajectory: 'escalating' })]);
    expect(escalating[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
  });

  it('persistent risk alone → medium attention (25 pts)', () => {
    // PERSISTENT_RISK(25) = 25 → medium (behavioral signal with meaningful weight)
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PERSISTENT_RISK);
    expect(result[0].attentionLevel).toBe('medium');
  });

  it('persistent risk + CI failing → critical attention', () => {
    // CI_FAILING(40) + PERSISTENT_RISK(25) = 65 → critical
    const result = getAttentionQueue([makeForecastRepo({
      ciStatus: 'failing', persistentRisk: true,
    })]);
    expect(result[0].attentionScore).toBe(65);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('data-gap signals alone cannot reach At Risk', () => {
    // CI_UNKNOWN(2)+RELEASE_UNKNOWN(2)+CONTRIBUTOR_UNKNOWN(1)+NO_METRICS(4) = 9 < 40
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

  it('CI_FAILING behavioral (score=0) → high attention pre-sync', () => {
    // Behavioral CI_FAILING(40) alone → high. After next sync: score=50 → critical.
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(40);
    expect(result[0].attentionLevel).toBe('high');
  });

  it('CI failing + monitor-band score reaches critical attention', () => {
    // score=30 → RISK_SCORE_MONITOR(20) + CI_FAILING(40) = 60 → critical
    const result = getAttentionQueue([makeRepo({
      score: 30, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(60);
    expect(result[0].attentionLevel).toBe('critical');
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
  it('NO_RECENT_COMMITS adds WEIGHTS.NO_RECENT_COMMITS pts when noRecentCommits=true', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
      noRecentCommits: true,
    })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.NO_RECENT_COMMITS);
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

  it('structural-only repo with noRecentCommits + bus-factor stays low (not at-risk)', () => {
    // NO_RECENT_COMMITS(6) + CONTRIBUTOR_BUS_FACTOR(5) = 11 → low (structural context only)
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    expect(result[0].attentionScore).toBe(11);
    expect(result[0].attentionLevel).toBe('low');
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
    // Worst case structural: score=28 (< 30, no MONITOR tier) + noRecentCommits(6)
    // + BUS_FACTOR(5) + CI_UNKNOWN(2) + RELEASE_STALE(3) = 16 → low, well below 40
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

// ── Behavioral dominance over structural context ───────────────────────────────
// These tests verify the core model: behavioral instability clearly outranks
// static maturity signals (no releases, bus factor, no commits, CI unknown).

describe('getAttentionQueue — behavioral dominance over structural context', () => {
  // Heavy structural-only stack for comparison (score=0, all structural signals)
  function makeStructuralRepo(overrides = {}) {
    return makeRepo({
      score: 0,
      ciStatus: 'unknown',
      releaseStatus: 'none',
      contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
      ...overrides,
    });
  }

  it('CI failing outranks structural-only repo (no releases + bus factor + no commits)', () => {
    const ciFailingRepo  = makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' });
    const structuralRepo = makeStructuralRepo();
    const result = getAttentionQueue([structuralRepo, ciFailingRepo]);
    expect(result[0].repoId).toBe(ciFailingRepo.id);
    expect(result[0].attentionScore).toBeGreaterThan(result[1].attentionScore);
  });

  it('escalating trajectory outranks structural-only stack', () => {
    const escalating = makeForecastRepo({ score: 0, trajectory: 'escalating' });
    const structural = makeStructuralRepo();
    const result = getAttentionQueue([structural, escalating]);
    expect(result[0].repoId).toBe(escalating.id);
  });

  it('deteriorating trajectory outranks structural-only stack', () => {
    const deteriorating = makeForecastRepo({ score: 0, trajectory: 'deteriorating' });
    const structural = makeStructuralRepo();
    const result = getAttentionQueue([structural, deteriorating]);
    expect(result[0].repoId).toBe(deteriorating.id);
  });

  it('engineering volatility elevated outranks structural-only stack', () => {
    // VOLATILITY_HIGH(22) vs structural worst: CI_UNKNOWN(2)+RELEASE_NONE(3)+BUS_FACTOR(5)+NO_RECENT_COMMITS(6) = 16
    const volatilityRepo = makeForecastRepo({ score: 0, volatilityLevel: 'high' });
    const structuralRepo = makeStructuralRepo();
    const result = getAttentionQueue([structuralRepo, volatilityRepo]);
    expect(result[0].repoId).toBe(volatilityRepo.id);
    expect(result[0].attentionScore).toBeGreaterThan(result[1].attentionScore);
  });

  it('VOLATILITY_HIGH alone exceeds the worst structural-only signal stack', () => {
    // VOLATILITY_HIGH(22) > CI_UNKNOWN(2)+RELEASE_NONE(3)+BUS_FACTOR(5)+NO_RECENT_COMMITS(6) = 16
    const volatility = getAttentionQueue([makeForecastRepo({ score: 0, volatilityLevel: 'high' })]);
    const structural = getAttentionQueue([makeStructuralRepo()]);
    expect(volatility[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
  });

  it('no recent commits alone is far below CI failing', () => {
    const noCommits = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy', noRecentCommits: true })]);
    const ciFailing = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(ciFailing[0].attentionScore).toBeGreaterThan(noCommits[0].attentionScore);
    expect(noCommits[0].attentionLevel).not.toBe('high');
    expect(noCommits[0].attentionLevel).not.toBe('critical');
  });

  it('no releases alone never outranks a repo with escalating trajectory', () => {
    const noReleases = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'healthy' })]);
    const escalating = getAttentionQueue([makeForecastRepo({ score: 0, trajectory: 'escalating' })]);
    expect(escalating[0].attentionScore).toBeGreaterThan(noReleases[0].attentionScore);
  });

  it('bus factor alone never outranks volatility elevated', () => {
    const busFactor   = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk' })]);
    const volatility  = getAttentionQueue([makeForecastRepo({ score: 0, volatilityLevel: 'high' })]);
    expect(volatility[0].attentionScore).toBeGreaterThan(busFactor[0].attentionScore);
  });

  it('structural reasons still appear even when behavioral signals dominate', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'none',
      contributorStatus: 'bus_factor_risk', noRecentCommits: true,
    })]);
    expect(result[0].reasons).toContain('CI pipeline is failing');
    expect(result[0].reasons).toContain('High bus-factor risk');
    expect(result[0].reasons).toContain('No releases found');
    expect(result[0].reasons).toContain('No recent commits');
  });

  it('mixed behavioral + structural repo: both reason types present', () => {
    const result = getAttentionQueue([makeForecastRepo({
      score: 0, trajectory: 'escalating',
      releaseStatus: 'none', contributorStatus: 'bus_factor_risk',
    })]);
    const reasons = result[0].reasons;
    expect(reasons).toContain('Escalating operational trajectory');
    expect(reasons).toContain('No releases found');
    expect(reasons).toContain('High bus-factor risk');
  });

  it('structural-only repo (score=0, all structural signals) stays below high (< 40)', () => {
    const result = getAttentionQueue([makeStructuralRepo()]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('deterministic ordering: same behavioral signal always sorts the same way', () => {
    const repos = [
      makeRepo({ id: 3, fullName: 'c/repo', score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
      makeRepo({ id: 1, fullName: 'a/repo', score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
      makeRepo({ id: 2, fullName: 'b/repo', score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy', lastSyncedAt: '2025-01-01T00:00:00.000Z' }),
    ];
    const r1 = getAttentionQueue([...repos]);
    const r2 = getAttentionQueue([...repos].reverse());
    expect(r1.map(x => x.repoId)).toEqual(r2.map(x => x.repoId));
  });
});

// ── PR Health operational signals ─────────────────────────────────────────────

function makePrHealthRepo(overrides = {}) {
  return makeRepo({
    score: 0,
    ciStatus: 'passing',
    releaseStatus: 'healthy',
    contributorStatus: 'healthy',
    prHealthStatus: null,
    ...overrides,
  });
}

describe('getAttentionQueue — PR health signals', () => {
  it('absent prHealthStatus adds no PR health points', () => {
    const result = getAttentionQueue([makePrHealthRepo()]);
    expect(result[0].attentionScore).toBe(0);
    expect(result[0].reasons).not.toContain('PR health critical');
    expect(result[0].reasons).not.toContain('PR health at-risk');
    expect(result[0].reasons).not.toContain('PR health monitored');
  });

  it('prHealthStatus=healthy adds no PR health points', () => {
    const result = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
  });

  it('prHealthStatus=monitor adds PR_HEALTH_MONITOR pts', () => {
    const result = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'monitor' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PR_HEALTH_MONITOR);
    expect(result[0].reasons).toContain('PR health monitored');
  });

  it('prHealthStatus=at-risk adds PR_HEALTH_AT_RISK pts', () => {
    const result = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'at-risk' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PR_HEALTH_AT_RISK);
    expect(result[0].reasons).toContain('PR health at-risk');
  });

  it('prHealthStatus=critical adds PR_HEALTH_CRITICAL pts', () => {
    const result = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PR_HEALTH_CRITICAL);
    expect(result[0].reasons).toContain('PR health critical');
  });

  it('PR_HEALTH_CRITICAL > PR_HEALTH_AT_RISK > PR_HEALTH_MONITOR', () => {
    expect(WEIGHTS.PR_HEALTH_CRITICAL).toBeGreaterThan(WEIGHTS.PR_HEALTH_AT_RISK);
    expect(WEIGHTS.PR_HEALTH_AT_RISK).toBeGreaterThan(WEIGHTS.PR_HEALTH_MONITOR);
  });

  it('PR health status values are exclusive (critical does not also fire at-risk)', () => {
    const result = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'critical' })]);
    const reasons = result[0].reasons;
    expect(reasons.filter(r => r.startsWith('PR health')).length).toBe(1);
    expect(reasons).toContain('PR health critical');
  });

  it('PR health at-risk outranks structural-only stack (no releases + bus factor)', () => {
    // PR_HEALTH_AT_RISK(20) vs RELEASE_NONE(3)+BUS_FACTOR(5) = 8
    const prAtRisk   = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'at-risk' })]);
    const structural = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'bus_factor_risk' })]);
    expect(prAtRisk[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
  });

  it('PR health critical outranks structural-only stack', () => {
    const prCritical = getAttentionQueue([makePrHealthRepo({ prHealthStatus: 'critical' })]);
    const structural = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'none', contributorStatus: 'bus_factor_risk', noRecentCommits: true })]);
    expect(prCritical[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
  });

  it('PR health stacks additively with base score signals', () => {
    // RISK_SCORE_MONITOR(20) + PR_HEALTH_CRITICAL(30) = 50 → high
    const result = getAttentionQueue([makePrHealthRepo({ score: 30, prHealthStatus: 'critical' })]);
    expect(result[0].attentionScore).toBe(50);
    expect(result[0].attentionLevel).toBe('high');
  });

  it('PR health stacks with CI failing (both behavioral signals)', () => {
    // CI_FAILING(40) + PR_HEALTH_CRITICAL(30) = 70 → critical
    const result = getAttentionQueue([makePrHealthRepo({ ciStatus: 'failing', prHealthStatus: 'critical' })]);
    expect(result[0].attentionScore).toBe(70);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('PR health repo sorts above structural-only repo in queue', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'o/structural', score: 0, ciStatus: 'unknown', releaseStatus: 'none', contributorStatus: 'bus_factor_risk' }),
      makePrHealthRepo({ id: 2, fullName: 'o/pr-health', prHealthStatus: 'at-risk' }),
    ];
    const result = getAttentionQueue(repos);
    expect(result[0].repoId).toBe(2);
  });
});

// ── Volatility-adjusted sorting ───────────────────────────────────────────────

describe('getAttentionQueue — volatility-adjusted sorting', () => {
  // Repos are in a same severity tier unless stated otherwise.
  // All structural signals: ciStatus='unknown', releaseStatus='none',
  // contributorStatus='bus_factor_risk' (no behavioral state).

  function makeStructural(overrides = {}) {
    // A repo whose attentionScore comes entirely from structural/maturity signals.
    // RELEASE_NONE(3) + BUS_FACTOR(5) + CI_UNKNOWN(2) = 10 → low tier.
    // Pass score override to push into medium tier when needed.
    return makeRepo({
      id:                99,
      fullName:          'o/structural',
      score:             null,
      ciStatus:          'unknown',
      releaseStatus:     'none',
      contributorStatus: 'bus_factor_risk',
      ...overrides,
    });
  }

  // ── Tier 1 behavioral signals outrank structural within same severity band ──

  it('high volatility repo (medium, attentionScore=22) outranks structural-only repo (medium, attentionScore=28)', () => {
    // Structural gets RISK_SCORE_MONITOR(20) from score=35 + BUS_FACTOR(5) + RELEASE_NONE(3) = 28 → medium
    const structural = makeStructural({ id: 1, fullName: 'o/structural-higher', score: 35 });
    // Volatility-high gets VOLATILITY_HIGH(22) = 22 → medium; behavioral score = 30
    const volatile_  = makeRepo({
      id:             2,
      fullName:       'o/volatile',
      score:          null,
      ciStatus:       'unknown',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
      volatilityLevel: 'high',
    });
    const result = getAttentionQueue([structural, volatile_]);
    expect(result[0].repoId).toBe(2);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[1].repoId).toBe(1);
    expect(result[1].attentionLevel).toBe('medium');
  });

  it('deteriorating trajectory repo (medium) outranks structural-only repo (medium) with higher attentionScore', () => {
    // Structural: RISK_SCORE_MONITOR(20) + BUS_FACTOR(5) + RELEASE_NONE(3) + CI_UNKNOWN(2) = 30 → medium
    const structural = makeStructural({ id: 1, fullName: 'o/structural-higher', score: 35 });
    // Deteriorating: TRAJ_DETERIORATING(22) = 22 → medium; behavioral score = 35
    const deteriorating = makeRepo({
      id:             2,
      fullName:       'o/deteriorating',
      score:          null,
      ciStatus:       'unknown',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
      trajectory:     'deteriorating',
    });
    const result = getAttentionQueue([structural, deteriorating]);
    expect(result[0].repoId).toBe(2);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[1].repoId).toBe(1);
    expect(result[1].attentionLevel).toBe('medium');
  });

  it('PR at-risk repo (medium) outranks structural-only repo (medium) with higher attentionScore', () => {
    // Structural: RISK_SCORE_MONITOR(20) + BUS_FACTOR(5) + RELEASE_NONE(3) + CI_UNKNOWN(2) = 30 → medium
    const structural = makeStructural({ id: 1, fullName: 'o/structural-higher', score: 35 });
    // PR at-risk: PR_HEALTH_AT_RISK(20) = 20 → medium; behavioral score = 12
    const prAtRisk = makeRepo({
      id:             2,
      fullName:       'o/pr-at-risk',
      score:          null,
      ciStatus:       'unknown',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
      prHealthStatus: 'at-risk',
    });
    const result = getAttentionQueue([structural, prAtRisk]);
    expect(result[0].repoId).toBe(2);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[1].repoId).toBe(1);
    expect(result[1].attentionLevel).toBe('medium');
  });

  it('persistent risk repo (medium) outranks no-commit-only structural repo (medium) with higher attentionScore', () => {
    // Structural: RISK_SCORE_MONITOR(20) + NO_RECENT_COMMITS(6) = 26 → medium
    const structural = makeStructural({
      id:               1,
      fullName:         'o/no-commits',
      score:            35,
      releaseStatus:    'unknown',
      contributorStatus: 'unknown',
      noRecentCommits:  true,
    });
    // Persistent risk: PERSISTENT_RISK(25) = 25 → medium; behavioral score = 25
    const persistent = makeRepo({
      id:             2,
      fullName:       'o/persistent',
      score:          null,
      ciStatus:       'unknown',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
      persistentRisk: true,
    });
    const result = getAttentionQueue([structural, persistent]);
    expect(result[0].repoId).toBe(2);
    expect(result[0].attentionLevel).toBe('medium');
  });

  // ── Severity tier still dominates behavioral sort score ───────────────────

  it('critical-tier structural repo outranks low-tier behavioral repo', () => {
    // Critical structural: RISK_SCORE_CRITICAL(65) + BUS_FACTOR(5) + RELEASE_NONE(3) + CI_UNKNOWN(2) = 75 → critical
    const criticalStructural = makeStructural({
      id:       1,
      fullName: 'o/critical-structural',
      score:    80,
      releaseStatus:     'unknown',
      contributorStatus: 'bus_factor_risk',
    });
    // Low behavioral: TRAJ_VOLATILE(10) = 10 → low tier; behavioral sort score = 8
    const lowBehavioral = makeRepo({
      id:                2,
      fullName:          'o/low-behavioral',
      score:             null,
      ciStatus:          'unknown',
      releaseStatus:     'unknown',
      contributorStatus: 'unknown',
      trajectory:        'volatile',
    });
    const result = getAttentionQueue([lowBehavioral, criticalStructural]);
    expect(result[0].repoId).toBe(1);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[1].repoId).toBe(2);
    expect(result[1].attentionLevel).toBe('low');
  });

  // ── CI failing and abandoned still dominate within their tier ─────────────

  it('CI failing (behavioral=100) outranks escalating+volatile+persistent in same tier', () => {
    // escalating+volatile+persistent: TRAJ_ESCALATING(30)+TRAJ_VOLATILE(10)+PERSISTENT_RISK(25) = 65 → critical
    // CI failing alone = 40 → high. So they won't be same tier. Use score to push CI-failing to critical.
    // CI failing + RISK_SCORE_CRITICAL(65 from score>=60) = 105 → capped at 100 → critical, behavioral=100
    const ciFailing = makeRepo({
      id:             1,
      fullName:       'o/ci-failing',
      score:          70,
      ciStatus:       'failing',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
    });
    // escalating+volatile+persistent = 65 → critical, behavioral = 40+8+25 = 73
    const escalatingMulti = makeRepo({
      id:             2,
      fullName:       'o/escalating-multi',
      score:          null,
      ciStatus:       'unknown',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
      trajectory:     'escalating',
      persistentRisk: true,
    });
    const result = getAttentionQueue([escalatingMulti, ciFailing]);
    // Both critical tier. CI failing has behavioral=100, escalating+persistent has 40+25=65
    expect(result[0].repoId).toBe(1);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[1].repoId).toBe(2);
  });

  it('abandoned + CI failing (behavioral=150) outranks CI-failing-only (behavioral=100)', () => {
    // abandoned + CI failing: CONTRIBUTOR_ABANDONED(40) + CI_FAILING(40) = 80 → critical
    // behavioral: ci=failing(100) + (abandoned&&failing)(50) = 150
    const abandonedCiFailing = makeRepo({
      id:             1,
      fullName:       'o/abandoned-ci',
      score:          null,
      ciStatus:       'failing',
      releaseStatus:  'unknown',
      contributorStatus: 'abandoned',
    });
    // CI failing only: CI_FAILING(40) → high. Push to critical with score.
    const ciFailing = makeRepo({
      id:             2,
      fullName:       'o/ci-only',
      score:          70,
      ciStatus:       'failing',
      releaseStatus:  'unknown',
      contributorStatus: 'unknown',
    });
    const result = getAttentionQueue([ciFailing, abandonedCiFailing]);
    // Both critical tier. abandonedCiFailing behavioral=150, ciFailing behavioral=100
    expect(result[0].repoId).toBe(1);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[1].repoId).toBe(2);
  });

  // ── Structural-only repos cluster at behavioral=0 and sort by attentionScore ─

  it('structural-only repos sort by attentionScore DESC when behavioral scores are equal', () => {
    // All structural: behavioral=0; sort falls through to attentionScore
    const low    = makeStructural({ id: 1, fullName: 'o/low',    score: null }); // ~10 pts → low
    const medium = makeStructural({ id: 2, fullName: 'o/medium', score: 35   }); // ~30 pts → medium
    const high_  = makeStructural({ id: 3, fullName: 'o/high',   score: 60   }); // RISK_SCORE_CRITICAL(65)+BUS(5)+NONE(3)+UNK(2)=75→critical actually
    // Use score=45 for high: RISK_SCORE_AT_RISK(45)+BUS(5)+NONE(3)+UNK(2)=55 → high
    const highRepo = makeStructural({ id: 3, fullName: 'o/high', score: 45 });
    const result = getAttentionQueue([low, medium, highRepo]);
    // high > medium > low by severity, then attentionScore within tier
    expect(result[0].repoId).toBe(3);
    expect(result[1].repoId).toBe(2);
    expect(result[2].repoId).toBe(1);
  });

  it('two structural-only repos in same tier sort by attentionScore DESC', () => {
    // Both medium tier (20-39): higher attentionScore first
    const lower  = makeStructural({ id: 1, fullName: 'o/lower',  score: 30 }); // RISK_SCORE_MONITOR(20)+BUS(5)+NONE(3)+UNK(2)=30
    const higher = makeStructural({ id: 2, fullName: 'o/higher', score: 35 }); // same breakdown but score=35 gives same RISK_SCORE_MONITOR
    // Actually both score=30 and score=35 map to RISK_SCORE_MONITOR(20). Add extra CI_UNKNOWN for higher.
    // Make "higher" have more structural signals: add noRecentCommits
    const lowerRepo  = makeStructural({ id: 1, fullName: 'o/lower',  score: null });   // BUS(5)+NONE(3)+UNK(2)=10
    const higherRepo = makeStructural({ id: 2, fullName: 'o/higher', score: null, noRecentCommits: true }); // BUS(5)+NONE(3)+UNK(2)+NO_COMMITS(6)=16
    const result = getAttentionQueue([lowerRepo, higherRepo]);
    expect(result[0].repoId).toBe(2);
    expect(result[1].repoId).toBe(1);
  });

  // ── Output shape ─────────────────────────────────────────────────────────────

  it('output items do not expose internal sort fields (_severityRank, _behavioralScore, _riskScore, _syncedAt)', () => {
    const repos = [
      makeRepo({ id: 1, volatilityLevel: 'high' }),
      makeStructural({ id: 2 }),
    ];
    const result = getAttentionQueue(repos);
    for (const item of result) {
      expect(item).not.toHaveProperty('_severityRank');
      expect(item).not.toHaveProperty('_behavioralScore');
      expect(item).not.toHaveProperty('_riskScore');
      expect(item).not.toHaveProperty('_syncedAt');
    }
  });

  it('each output item has exactly the public fields: repoId, name, attentionLevel, attentionScore, reasons, drivers, trajectory', () => {
    const repos = [makeRepo({ id: 1, trajectory: 'escalating' })];
    const result = getAttentionQueue(repos);
    const keys = Object.keys(result[0]).sort();
    expect(keys).toEqual(['attentionLevel', 'attentionScore', 'drivers', 'name', 'reasons', 'repoId', 'trajectory']);
  });

  // ── Determinism ───────────────────────────────────────────────────────────────

  it('sort is deterministic regardless of input array order', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'o/volatile',      volatilityLevel: 'high' }),
      makeRepo({ id: 2, fullName: 'o/ci-failing',    ciStatus: 'failing' }),
      makeStructural({ id: 3, fullName: 'o/structural-a', score: 35 }),
      makeStructural({ id: 4, fullName: 'o/structural-b', score: null }),
      makeRepo({ id: 5, fullName: 'o/persistent',    persistentRisk: true }),
    ];
    const reversed = [...repos].reverse();
    const shuffled = [repos[2], repos[0], repos[4], repos[1], repos[3]];

    const r1 = getAttentionQueue(repos).map(i => i.repoId);
    const r2 = getAttentionQueue(reversed).map(i => i.repoId);
    const r3 = getAttentionQueue(shuffled).map(i => i.repoId);

    expect(r1).toEqual(r2);
    expect(r1).toEqual(r3);
  });

  it('name tiebreaker sorts alphabetically ASC when all other fields are equal', () => {
    const base = { score: null, ciStatus: 'failing', releaseStatus: 'unknown', contributorStatus: 'unknown' };
    const repoA = makeRepo({ id: 1, fullName: 'o/alpha',   ...base });
    const repoB = makeRepo({ id: 2, fullName: 'o/beta',    ...base });
    const repoC = makeRepo({ id: 3, fullName: 'o/charlie', ...base });
    const result = getAttentionQueue([repoC, repoA, repoB]);
    expect(result.map(i => i.repoId)).toEqual([1, 2, 3]);
  });

  it('id tiebreaker is used as last resort when name is also equal', () => {
    const base = { fullName: 'o/same', score: null, ciStatus: 'failing', releaseStatus: 'unknown', contributorStatus: 'unknown' };
    const r1 = makeRepo({ id: 3, ...base });
    const r2 = makeRepo({ id: 1, ...base });
    const r3 = makeRepo({ id: 2, ...base });
    const result = getAttentionQueue([r1, r2, r3]);
    expect(result.map(i => i.repoId)).toEqual([1, 2, 3]);
  });
});

// ── attentionDrivers ──────────────────────────────────────────────────────────

describe('getAttentionQueue — attentionDrivers', () => {
  it('drivers is an array on every returned item', () => {
    const result = getAttentionQueue([makeRepo()]);
    expect(Array.isArray(result[0].drivers)).toBe(true);
  });

  it('zero-signal repo produces empty drivers array', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].drivers).toHaveLength(0);
  });

  it('each driver has label (string) and contribution (number)', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    const driver = result[0].drivers[0];
    expect(typeof driver.label).toBe('string');
    expect(typeof driver.contribution).toBe('number');
  });

  it('CI failing produces driver { label: "CI pipeline is failing", contribution: WEIGHTS.CI_FAILING }', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'CI pipeline is failing', contribution: WEIGHTS.CI_FAILING });
  });

  it('critical risk band produces driver { label: "Critical risk score (75)", contribution: WEIGHTS.RISK_SCORE_CRITICAL }', () => {
    const result = getAttentionQueue([makeRepo({
      score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'Critical risk score (75)', contribution: WEIGHTS.RISK_SCORE_CRITICAL });
  });

  it('at-risk band produces driver with contribution WEIGHTS.RISK_SCORE_AT_RISK', () => {
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'Elevated risk score (50)', contribution: WEIGHTS.RISK_SCORE_AT_RISK });
  });

  it('persistent risk produces driver with contribution WEIGHTS.PERSISTENT_RISK', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
      persistentRisk: true,
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'Persistent operational risk', contribution: WEIGHTS.PERSISTENT_RISK });
  });

  it('drivers[i].label matches reasons[i] for all i', () => {
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
      noRecentCommits: true,
    })]);
    const { reasons, drivers } = result[0];
    expect(drivers).toHaveLength(reasons.length);
    reasons.forEach((r, i) => expect(drivers[i].label).toBe(r));
  });

  it('multiple signals produce one driver per signal', () => {
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    // RISK_SCORE_AT_RISK + CI_FAILING = 2 drivers
    expect(result[0].drivers).toHaveLength(2);
  });

  it('drivers contributions sum equals uncapped total (no-cap scenario)', () => {
    // score=50 → RISK_SCORE_AT_RISK(45) + CI_FAILING(40) = 85, not capped
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    const { attentionScore, drivers } = result[0];
    const sum = drivers.reduce((acc, d) => acc + d.contribution, 0);
    expect(attentionScore).toBe(85);
    expect(sum).toBe(85);
  });

  it('drivers contributions sum can exceed attentionScore when cap fires', () => {
    // score=80 → RISK_SCORE_CRITICAL(65) + CI_FAILING(40) + CONTRIBUTOR_ABANDONED(40) = 145 → capped at 100
    const result = getAttentionQueue([makeRepo({
      score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned',
    })]);
    const { attentionScore, drivers } = result[0];
    const sum = drivers.reduce((acc, d) => acc + d.contribution, 0);
    expect(attentionScore).toBe(100);
    expect(sum).toBeGreaterThan(100);
  });

  it('drivers are not affected by score cap — all fired signals appear', () => {
    const result = getAttentionQueue([makeRepo({
      score: 80, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'abandoned',
    })]);
    const labels = result[0].drivers.map(d => d.label);
    expect(labels).toContain('Critical risk score (80)');
    expect(labels).toContain('CI pipeline is failing');
    expect(labels).toContain('Repository appears abandoned');
  });

  it('escalating trajectory driver has contribution WEIGHTS.TRAJ_ESCALATING', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
      trajectory: 'escalating',
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'Escalating operational trajectory', contribution: WEIGHTS.TRAJ_ESCALATING });
  });

  it('PR health critical driver has contribution WEIGHTS.PR_HEALTH_CRITICAL', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
      prHealthStatus: 'critical',
    })]);
    expect(result[0].drivers).toContainEqual({ label: 'PR health critical', contribution: WEIGHTS.PR_HEALTH_CRITICAL });
  });

  it('does not expose _add in the returned item', () => {
    const result = getAttentionQueue([makeRepo()]);
    expect(result[0]).not.toHaveProperty('_add');
  });
});
