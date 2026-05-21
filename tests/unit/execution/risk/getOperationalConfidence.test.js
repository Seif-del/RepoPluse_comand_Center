'use strict';

const { getOperationalConfidence } = require('../../../../execution/risk/getOperationalConfidence');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRisk(score, label, snapshotAt) {
  label = label || (score >= 75 ? 'critical' : score >= 50 ? 'at-risk' : score >= 30 ? 'monitor' : 'healthy');
  return { score, label, snapshotAt: snapshotAt || '2026-05-01T10:00:00Z' };
}

function makeRiskHistory(count, score, label) {
  var arr = [];
  for (var i = 0; i < count; i++) {
    arr.push(makeRisk(score || 20, label || 'healthy', '2026-05-0' + (1 + i) + 'T10:00:00Z'));
  }
  return arr;
}

function makeMetrics(overrides) {
  overrides = overrides || {};
  return {
    ciStatus:          overrides.ciStatus          || 'passing',
    releaseStatus:     overrides.releaseStatus      || 'healthy',
    contributorStatus: overrides.contributorStatus  || 'healthy',
    snapshotAt:        overrides.snapshotAt         || '2026-05-01T10:00:00Z',
  };
}

function makeCurrentRepo(overrides) {
  overrides = overrides || {};
  return {
    ciStatus:          overrides.ciStatus          || 'passing',
    releaseStatus:     overrides.releaseStatus      || 'healthy',
    contributorStatus: overrides.contributorStatus  || 'healthy',
  };
}

var LOW_VOL_ESC  = { volatilityLevel: 'low',  escalationLevel: 'none', persistentRisk: false };
var HIGH_VOL_ESC = { volatilityLevel: 'high', escalationLevel: 'high', persistentRisk: true  };
var MED_VOL_ESC  = { volatilityLevel: 'medium', escalationLevel: 'none', persistentRisk: false };

// ── Guard: missing / malformed input ─────────────────────────────────────────

describe('getOperationalConfidence — guard conditions', () => {
  it('returns low confidence when called with no arguments', () => {
    var r = getOperationalConfidence();
    expect(r.confidenceLevel).toBe('low');
    expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(r.confidenceScore).toBeLessThanOrEqual(100);
  });

  it('returns low confidence for empty object argument', () => {
    var r = getOperationalConfidence({});
    expect(r.confidenceLevel).toBe('low');
  });

  it('always returns the required output shape', () => {
    var r = getOperationalConfidence();
    expect(typeof r.confidenceLevel).toBe('string');
    expect(typeof r.confidenceScore).toBe('number');
    expect(Array.isArray(r.factors)).toBe(true);
    expect(typeof r.summary).toBe('string');
  });

  it('confidenceLevel is always one of low | medium | high', () => {
    var cases = [
      getOperationalConfidence(),
      getOperationalConfidence({ riskHistory: [] }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(1) }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(5), currentRepo: makeCurrentRepo() }),
    ];
    cases.forEach(function(r) {
      expect(['low', 'medium', 'high']).toContain(r.confidenceLevel);
    });
  });

  it('confidenceScore is always an integer in [0, 100]', () => {
    var cases = [
      getOperationalConfidence(),
      getOperationalConfidence({ riskHistory: makeRiskHistory(3), currentRepo: makeCurrentRepo() }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(7), currentRepo: makeCurrentRepo(), escalation: LOW_VOL_ESC }),
    ];
    cases.forEach(function(r) {
      expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
      expect(r.confidenceScore).toBeLessThanOrEqual(100);
      expect(Number.isInteger(r.confidenceScore)).toBe(true);
    });
  });
});

// ── Sparse history → low confidence ──────────────────────────────────────────

describe('getOperationalConfidence — sparse history → low confidence', () => {
  it('0 snapshots → low confidence', () => {
    var r = getOperationalConfidence({
      riskHistory:  [],
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('low');
    expect(r.confidenceScore).toBeLessThanOrEqual(30);
  });

  it('1 snapshot → low confidence regardless of telemetry', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(1),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('low');
    expect(r.confidenceScore).toBeLessThanOrEqual(30);
  });

  it('1 snapshot with perfect telemetry and low volatility is still low', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(1),
      currentRepo:  makeCurrentRepo({ ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' }),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('low');
  });

  it('factors include a sparse history note for 0 snapshots', () => {
    var r = getOperationalConfidence({ riskHistory: [] });
    expect(r.factors.some(function(f) { return f.includes('No historical snapshot'); })).toBe(true);
  });

  it('factors include a newly-synced note for 1 snapshot', () => {
    var r = getOperationalConfidence({ riskHistory: makeRiskHistory(1) });
    expect(r.factors.some(function(f) { return f.includes('newly synced'); })).toBe(true);
  });

  it('summary includes "Low confidence" for sparse history', () => {
    var r = getOperationalConfidence({ riskHistory: makeRiskHistory(1) });
    expect(r.summary).toMatch(/low confidence/i);
  });
});

// ── Complete telemetry → high confidence ─────────────────────────────────────

describe('getOperationalConfidence — complete telemetry raises confidence', () => {
  it('5+ snapshots with all telemetry and low volatility → high confidence', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('high');
    expect(r.confidenceScore).toBeGreaterThanOrEqual(70);
  });

  it('7 snapshots, full telemetry, low volatility → high confidence', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(7, 15, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('high');
  });

  it('factors include complete telemetry note when all 3 signals present', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Complete telemetry'); })).toBe(true);
  });

  it('summary includes "High confidence" when all signals are strong', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.summary).toMatch(/high confidence/i);
  });

  it('confidenceScore is ≥ 70 for fully evidenced assessment', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceScore).toBeGreaterThanOrEqual(70);
  });
});

// ── Volatility reduces confidence ─────────────────────────────────────────────

describe('getOperationalConfidence — high volatility reduces confidence', () => {
  it('5+ snapshots with high volatility → max medium (never high)', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 60, 'at-risk'),
      currentRepo:  makeCurrentRepo(),
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.confidenceLevel).not.toBe('high');
    expect(r.confidenceScore).toBeLessThanOrEqual(60);
  });

  it('high volatility factors include a reliability-reduction note', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5),
      currentRepo:  makeCurrentRepo(),
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('High operational volatility'); })).toBe(true);
  });

  it('medium volatility reduces stability contribution but stays assessable', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   MED_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Moderate operational volatility'); })).toBe(true);
  });

  it('confidenceScore for high-vol 5-snapshot repo is lower than low-vol equivalent', () => {
    var rHigh = getOperationalConfidence({
      riskHistory: makeRiskHistory(5, 20, 'healthy'),
      currentRepo: makeCurrentRepo(),
      escalation:  HIGH_VOL_ESC,
    });
    var rLow = getOperationalConfidence({
      riskHistory: makeRiskHistory(5, 20, 'healthy'),
      currentRepo: makeCurrentRepo(),
      escalation:  LOW_VOL_ESC,
    });
    expect(rHigh.confidenceScore).toBeLessThan(rLow.confidenceScore);
  });
});

// ── Unknown metrics reduce confidence ────────────────────────────────────────

describe('getOperationalConfidence — unknown metrics reduce confidence', () => {
  it('all-unknown telemetry caps score at medium even with 5+ snapshots', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).not.toBe('high');
    expect(r.confidenceScore).toBeLessThanOrEqual(60);
  });

  it('missing telemetry factor is included when all signals are unknown', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Missing telemetry'); })).toBe(true);
  });

  it('partial telemetry (2/3 known) gives medium confidence with enough history', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(4, 20, 'healthy'),
      currentRepo:  { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Partial telemetry'); })).toBe(true);
    expect(['medium', 'low']).toContain(r.confidenceLevel);
  });

  it('sparse telemetry (1/3 known) note is included', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5),
      currentRepo:  { ciStatus: 'passing', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Sparse telemetry'); })).toBe(true);
  });

  it('no currentRepo gives lower score than full currentRepo with same history', () => {
    var rWith = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    var rWithout = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  {},
      escalation:   LOW_VOL_ESC,
    });
    expect(rWith.confidenceScore).toBeGreaterThan(rWithout.confidenceScore);
  });
});

// ── Stable repeated snapshots increase confidence ─────────────────────────────

describe('getOperationalConfidence — stable repeated snapshots raise confidence', () => {
  it('consistent healthy label across 5 snapshots includes consistency bonus', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 15, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Consistent operational label'); })).toBe(true);
  });

  it('inconsistent labels across history does NOT include consistency bonus', () => {
    var mixed = [
      makeRisk(75, 'critical'),
      makeRisk(20, 'healthy'),
      makeRisk(55, 'at-risk'),
      makeRisk(10, 'healthy'),
      makeRisk(80, 'critical'),
    ];
    var r = getOperationalConfidence({
      riskHistory:  mixed,
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Consistent operational label'); })).toBe(false);
  });

  it('2 snapshots do not qualify for consistency bonus', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(2, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.factors.some(function(f) { return f.includes('Consistent operational label'); })).toBe(false);
  });

  it('more snapshots consistently produce higher score than fewer snapshots', () => {
    var r5 = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    var r2 = getOperationalConfidence({
      riskHistory:  makeRiskHistory(2, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r5.confidenceScore).toBeGreaterThan(r2.confidenceScore);
  });
});

// ── Score normalisation boundaries ────────────────────────────────────────────

describe('getOperationalConfidence — score normalisation', () => {
  it('score never exceeds 100', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(20, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceScore).toBeLessThanOrEqual(100);
  });

  it('score never goes below 0', () => {
    var r = getOperationalConfidence({
      riskHistory:  [],
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.confidenceScore).toBeGreaterThanOrEqual(0);
  });

  it('hard cap: 0–1 snapshots → score ≤ 30', () => {
    [0, 1].forEach(function(n) {
      var r = getOperationalConfidence({
        riskHistory:  makeRiskHistory(n),
        currentRepo:  makeCurrentRepo(),
        escalation:   LOW_VOL_ESC,
      });
      expect(r.confidenceScore).toBeLessThanOrEqual(30);
    });
  });

  it('2–4 snapshots never reach high confidence level', () => {
    [2, 3, 4].forEach(function(n) {
      var r = getOperationalConfidence({
        riskHistory:  makeRiskHistory(n, 20, 'healthy'),
        currentRepo:  makeCurrentRepo(),
        escalation:   LOW_VOL_ESC,
      });
      expect(r.confidenceLevel).not.toBe('high');
    });
  });

  it('hard cap: all-unknown telemetry → score ≤ 60', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(10, 20, 'healthy'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceScore).toBeLessThanOrEqual(60);
  });

  it('hard cap: high volatility → score ≤ 60', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(10, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.confidenceScore).toBeLessThanOrEqual(60);
  });
});

// ── Deterministic outputs ─────────────────────────────────────────────────────

describe('getOperationalConfidence — deterministic outputs', () => {
  it('same inputs always produce same output', () => {
    var input = {
      riskHistory:  makeRiskHistory(5, 30, 'monitor'),
      currentRepo:  makeCurrentRepo({ ciStatus: 'passing', releaseStatus: 'stale', contributorStatus: 'low_activity' }),
      escalation:   MED_VOL_ESC,
    };
    var r1 = getOperationalConfidence(input);
    var r2 = getOperationalConfidence(input);
    expect(r1).toEqual(r2);
  });

  it('different snapshot counts produce different scores', () => {
    var makeInput = function(n) {
      return {
        riskHistory:  makeRiskHistory(n, 20, 'healthy'),
        currentRepo:  makeCurrentRepo(),
        escalation:   LOW_VOL_ESC,
      };
    };
    var r1 = getOperationalConfidence(makeInput(1));
    var r3 = getOperationalConfidence(makeInput(3));
    var r5 = getOperationalConfidence(makeInput(5));
    expect(r1.confidenceScore).toBeLessThan(r3.confidenceScore);
    expect(r3.confidenceScore).toBeLessThan(r5.confidenceScore);
  });

  it('non-mutating: calling twice does not alter riskHistory array', () => {
    var history = makeRiskHistory(5, 20, 'healthy');
    var len = history.length;
    getOperationalConfidence({ riskHistory: history, currentRepo: makeCurrentRepo() });
    getOperationalConfidence({ riskHistory: history, currentRepo: makeCurrentRepo() });
    expect(history.length).toBe(len);
  });
});

// ── Mixed-signal balancing ────────────────────────────────────────────────────

describe('getOperationalConfidence — mixed-signal balancing', () => {
  it('5 snapshots + all-unknown telemetry → medium, not high', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 20, 'healthy'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('5 snapshots + high volatility → medium, not high', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(5, 80, 'critical'),
      currentRepo:  makeCurrentRepo({ ciStatus: 'failing' }),
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('3 snapshots + good telemetry + low vol → medium (not high)', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(3, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('3 snapshots + all-unknown telemetry + high vol → low confidence', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(3, 70, 'critical'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   HIGH_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('low');
  });

  it('2 snapshots + perfect telemetry + low vol → medium (capped at 65)', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(2, 15, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('medium');
    expect(r.confidenceScore).toBeLessThanOrEqual(65);
  });

  it('factors array is non-empty for every input combination', () => {
    var cases = [
      getOperationalConfidence(),
      getOperationalConfidence({ riskHistory: makeRiskHistory(1) }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(3), currentRepo: makeCurrentRepo() }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(5), currentRepo: makeCurrentRepo(), escalation: LOW_VOL_ESC }),
      getOperationalConfidence({ riskHistory: makeRiskHistory(5), currentRepo: makeCurrentRepo(), escalation: HIGH_VOL_ESC }),
    ];
    cases.forEach(function(r) {
      expect(r.factors.length).toBeGreaterThan(0);
    });
  });

  it('summary is non-empty for every input combination', () => {
    var cases = [
      getOperationalConfidence(),
      getOperationalConfidence({ riskHistory: makeRiskHistory(5), currentRepo: makeCurrentRepo() }),
    ];
    cases.forEach(function(r) {
      expect(r.summary.length).toBeGreaterThan(0);
    });
  });
});

// ── Repo-level narrative examples ─────────────────────────────────────────────

describe('getOperationalConfidence — narrative examples', () => {
  it('stable repo with 8 syncs → high confidence, summary mentions snapshot count', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(8, 10, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('high');
    expect(r.summary).toMatch(/8 snapshot/);
  });

  it('newly synced repo (1 snapshot) → low confidence, summary mentions sparse history', () => {
    var r = getOperationalConfidence({
      riskHistory:  makeRiskHistory(1, 25, 'monitor'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      escalation:   LOW_VOL_ESC,
    });
    expect(r.confidenceLevel).toBe('low');
    expect(r.summary).toMatch(/low confidence/i);
  });

  it('repo with missing CI data gives lower score than repo with CI data', () => {
    var withCI = getOperationalConfidence({
      riskHistory:  makeRiskHistory(4, 20, 'healthy'),
      currentRepo:  makeCurrentRepo(),
      escalation:   LOW_VOL_ESC,
    });
    var withoutCI = getOperationalConfidence({
      riskHistory:  makeRiskHistory(4, 20, 'healthy'),
      currentRepo:  { ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      escalation:   LOW_VOL_ESC,
    });
    expect(withCI.confidenceScore).toBeGreaterThan(withoutCI.confidenceScore);
  });
});
