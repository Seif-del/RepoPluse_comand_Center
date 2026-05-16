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
      'CI_FAILING', 'CONTRIBUTOR_ABANDONED', 'RISK_SCORE_HIGH',
      'CONTRIBUTOR_BUS_FACTOR', 'RELEASE_STALE',
      'CONTRIBUTOR_LOW', 'RELEASE_NONE', 'RISK_SCORE_MID',
      'CI_UNKNOWN', 'RELEASE_UNKNOWN', 'CONTRIBUTOR_UNKNOWN', 'NO_METRICS',
      // forecast-awareness keys
      'TRAJ_ESCALATING', 'TRAJ_DETERIORATING', 'TRAJ_VOLATILE',
      'FORECAST_CRITICAL', 'FORECAST_HIGH',
      'PERSISTENT_RISK', 'ESC_HIGH', 'ESC_CRITICAL',
      'VOLATILITY_HIGH', 'CI_UNRESOLVED',
    ];
    keys.forEach(k => expect(WEIGHTS).toHaveProperty(k));
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
  it('CI_FAILING adds 40 pts', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_FAILING);
  });

  it('CONTRIBUTOR_ABANDONED adds 40 pts', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_ABANDONED);
  });

  it('RISK_SCORE_HIGH adds 40 pts (score >= 70)', () => {
    const result = getAttentionQueue([makeRepo({ score: 70, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RISK_SCORE_HIGH);
  });

  it('RISK_SCORE_HIGH triggers at exactly 70', () => {
    const result = getAttentionQueue([makeRepo({ score: 70, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(40);
  });

  it('CONTRIBUTOR_BUS_FACTOR adds 8 pts (structural concern, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_BUS_FACTOR);
  });

  it('RELEASE_STALE adds 8 pts (structural concern, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_STALE);
  });

  it('CONTRIBUTOR_LOW adds 4 pts (maturity signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'low_activity' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_LOW);
  });

  it('RELEASE_NONE adds 6 pts (maturity signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_NONE);
  });

  it('RISK_SCORE_MID adds 10 pts (score >= 40 and < 70)', () => {
    const result = getAttentionQueue([makeRepo({ score: 40, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RISK_SCORE_MID);
  });

  it('RISK_SCORE_MID triggers at exactly 40, not at 70', () => {
    const result = getAttentionQueue([makeRepo({ score: 69, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(10);
  });

  it('RISK_SCORE_MID does not trigger at 70 (HIGH takes over)', () => {
    const result70 = getAttentionQueue([makeRepo({ score: 70, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    const result69 = getAttentionQueue([makeRepo({ score: 69, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result70[0].attentionScore).toBe(40);
    expect(result69[0].attentionScore).toBe(10);
  });

  it('CI_UNKNOWN adds 2 pts (data-gap signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_UNKNOWN);
  });

  it('RELEASE_UNKNOWN adds 2 pts (data-gap signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'unknown', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.RELEASE_UNKNOWN);
  });

  it('CONTRIBUTOR_UNKNOWN adds 2 pts (data-gap signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'unknown' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CONTRIBUTOR_UNKNOWN);
  });

  it('NO_METRICS adds 4 pts when score is null (data-gap signal, reduced)', () => {
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.NO_METRICS);
  });

  it('NO_METRICS does not trigger when score is 0', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionScore).toBe(0);
  });
});

// ── Attention levels ───────────────────────────────────────────────────────────

describe('getAttentionQueue — attention levels', () => {
  it('score >= 60 → critical', () => {
    // CI_FAILING(50) + RISK_SCORE_MID(10) = 60 — active instability + moderate risk score
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('critical');
    expect(result[0].attentionScore).toBe(60);
  });

  it('score >= 40 and < 60 → high', () => {
    // CONTRIBUTOR_ABANDONED(40) alone → high; CI_FAILING(50) alone also → high
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(40);
  });

  it('CI_FAILING alone → high (50 pts)', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(50);
  });

  it('score >= 20 and < 40 → medium', () => {
    // RISK_SCORE_MID(10) + RELEASE_STALE(8) + CONTRIBUTOR_BUS_FACTOR(8) = 26 — structural multi-signal
    const result = getAttentionQueue([makeRepo({ score: 50, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk' })]);
    expect(result[0].attentionLevel).toBe('medium');
    expect(result[0].attentionScore).toBe(26);
  });

  it('score >= 5 and < 20 → low', () => {
    // RELEASE_STALE(8) alone — structural concern maps to low/healthy, not Monitor
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('low');
    expect(result[0].attentionScore).toBe(8);
  });

  it('score 0 → healthy', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].attentionLevel).toBe('healthy');
    expect(result[0].attentionScore).toBe(0);
  });

  it('all unknown signals with no score → low (10 pts)', () => {
    // CI_UNKNOWN(2) + RELEASE_UNKNOWN(2) + CONTRIBUTOR_UNKNOWN(2) + NO_METRICS(4) = 10
    // Reduced from 20 → data-gap telemetry absence is not a Monitor-level concern
    const result = getAttentionQueue([makeRepo({ score: null, ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' })]);
    expect(result[0].attentionScore).toBe(10);
    expect(result[0].attentionLevel).toBe('low');
  });
});

// ── Score cap ──────────────────────────────────────────────────────────────────

describe('getAttentionQueue — score capped at 100', () => {
  it('score is capped at 100 when signals sum beyond 100', () => {
    // CI_FAILING(50) + CONTRIBUTOR_ABANDONED(40) + RISK_SCORE_HIGH(40) + RELEASE_STALE(8) = 138 → capped at 100
    const result = getAttentionQueue([makeRepo({ score: 80, ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'abandoned' })]);
    expect(result[0].attentionScore).toBeLessThanOrEqual(100);
  });

  it('maximum possible score is exactly 100', () => {
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

  it('contributor abandoned produces a reason', () => {
    const result = getAttentionQueue([makeRepo({ score: 0, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'abandoned' })]);
    expect(result[0].reasons).toContain('Repository appears abandoned');
  });

  it('high risk score produces a reason with score value', () => {
    const result = getAttentionQueue([makeRepo({ score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' })]);
    expect(result[0].reasons.some(r => r.includes('75'))).toBe(true);
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

  it('healthy repo with score has empty reasons', () => {
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
  it('TRAJ_ESCALATING adds 30 pts when trajectory=escalating', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'escalating' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_ESCALATING);
  });

  it('TRAJ_DETERIORATING adds 15 pts when trajectory=deteriorating', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'deteriorating' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_DETERIORATING);
  });

  it('TRAJ_VOLATILE adds 10 pts when trajectory=volatile', () => {
    const result = getAttentionQueue([makeForecastRepo({ trajectory: 'volatile' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.TRAJ_VOLATILE);
  });

  it('FORECAST_CRITICAL adds 25 pts when forecastLevel=critical', () => {
    const result = getAttentionQueue([makeForecastRepo({ forecastLevel: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.FORECAST_CRITICAL);
  });

  it('FORECAST_HIGH adds 10 pts when forecastLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ forecastLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.FORECAST_HIGH);
  });

  it('PERSISTENT_RISK adds 20 pts when persistentRisk=true', () => {
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PERSISTENT_RISK);
  });

  it('ESC_HIGH adds 15 pts when escalationLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_HIGH);
  });

  it('ESC_CRITICAL adds 30 pts when escalationLevel=critical', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'critical' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_CRITICAL);
  });

  it('ESC_CRITICAL and ESC_HIGH are mutually exclusive (critical takes precedence)', () => {
    const result = getAttentionQueue([makeForecastRepo({ escalationLevel: 'critical' })]);
    // Only ESC_CRITICAL (30) should fire, not ESC_HIGH (15) on top
    expect(result[0].attentionScore).toBe(WEIGHTS.ESC_CRITICAL);
    expect(result[0].reasons.filter(r => r.includes('Escalation')).length).toBe(1);
  });

  it('VOLATILITY_HIGH adds 10 pts when volatilityLevel=high', () => {
    const result = getAttentionQueue([makeForecastRepo({ volatilityLevel: 'high' })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.VOLATILITY_HIGH);
  });

  it('CI_UNRESOLVED adds 15 pts when unresolvedCiRun=true', () => {
    const result = getAttentionQueue([makeForecastRepo({ unresolvedCiRun: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.CI_UNRESOLVED);
  });

  it('forecast signals stack with base signals (additive, capped at 100)', () => {
    // CI_FAILING(50) + TRAJ_ESCALATING(30) + ESC_CRITICAL(30) = 110 → capped at 100
    const result = getAttentionQueue([makeForecastRepo({
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

// ── Operational risk calibration ──────────────────────────────────────────────

describe('getAttentionQueue — operational risk calibration', () => {
  it('structurally immature stable repo stays Healthy: no-releases + bus-factor = low attention', () => {
    // RELEASE_NONE(6) + CONTRIBUTOR_BUS_FACTOR(8) = 14 → low (<20), not Monitor
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'bus_factor_risk',
    })]);
    expect(result[0].attentionScore).toBe(14);
    expect(result[0].attentionLevel).toBe('low');
  });

  it('structural concern stack cannot alone reach At Risk (high ≥ 40)', () => {
    // Worst structural-only combo (no abandoned, no active signals):
    // CONTRIBUTOR_BUS_FACTOR(8) + RELEASE_STALE(8) + RISK_SCORE_MID(10) + CI_UNKNOWN(2) + NO_METRICS(4) = 32
    const result = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('failing CI outweighs no-releases + bus-factor combined', () => {
    const structural = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'none', contributorStatus: 'bus_factor_risk',
    })]);
    const activeInstability = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(activeInstability[0].attentionScore).toBeGreaterThan(structural[0].attentionScore);
    expect(activeInstability[0].attentionLevel).toBe('high');
  });

  it('escalating trajectory outweighs structural concern stack', () => {
    const structuralOnly = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    const escalating = getAttentionQueue([makeForecastRepo({ trajectory: 'escalating' })]);
    expect(escalating[0].attentionScore).toBeGreaterThan(structuralOnly[0].attentionScore);
  });

  it('persistent risk alone produces Monitor-level attention', () => {
    // PERSISTENT_RISK(20) alone → medium (20 ≥ 20), which maps to Monitor
    const result = getAttentionQueue([makeForecastRepo({ persistentRisk: true })]);
    expect(result[0].attentionScore).toBe(WEIGHTS.PERSISTENT_RISK);
    expect(result[0].attentionLevel).toBe('medium');
  });

  it('persistent risk + failing CI produces critical attention', () => {
    // CI_FAILING(50) + PERSISTENT_RISK(20) = 70 → critical
    const result = getAttentionQueue([makeForecastRepo({
      ciStatus: 'failing', persistentRisk: true,
    })]);
    expect(result[0].attentionScore).toBe(70);
    expect(result[0].attentionLevel).toBe('critical');
  });

  it('HIGH attention requires active instability — structural+data-gap alone cannot reach it', () => {
    // Max data-gap: CI_UNKNOWN(2)+RELEASE_UNKNOWN(2)+CONTRIBUTOR_UNKNOWN(2)+NO_METRICS(4) = 10
    // Max structural (no abandoned): BUS_FACTOR(8)+RELEASE_STALE(8)+RISK_SCORE_MID(10) = 26
    // Combined (realistic): 10+26 = 36 < 40 (high threshold)
    const allGaps = getAttentionQueue([makeRepo({
      score: 50, ciStatus: 'unknown', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    expect(allGaps[0].attentionScore).toBeLessThan(40);
  });

  it('score/attention correlation: high risk score (≥70) gives At Risk attention', () => {
    const result = getAttentionQueue([makeRepo({
      score: 75, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    // RISK_SCORE_HIGH(40) → high attention matches high risk score
    expect(result[0].attentionLevel).toBe('high');
    expect(result[0].attentionScore).toBe(40);
  });

  it('score/attention correlation: score=0 with only structural signals stays below At Risk', () => {
    // Previously: BUS_FACTOR(20)+RELEASE_STALE(20)=40 → HIGH with score=0 (divergence).
    // Now: BUS_FACTOR(8)+RELEASE_STALE(8)=16 → low — aligned with low risk score.
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
    })]);
    expect(result[0].attentionScore).toBeLessThan(40);
    expect(result[0].attentionLevel).not.toBe('high');
    expect(result[0].attentionLevel).not.toBe('critical');
  });

  it('CI_FAILING(50) alone → At Risk, not Critical — two signals required for Critical', () => {
    const result = getAttentionQueue([makeRepo({
      score: 0, ciStatus: 'failing', releaseStatus: 'healthy', contributorStatus: 'healthy',
    })]);
    expect(result[0].attentionScore).toBe(50);
    expect(result[0].attentionLevel).toBe('high');
  });
});
