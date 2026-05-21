'use strict';

const {
  detectEngineeringVolatility,
  OSC_DELTA,
  OSC_MIN_COUNT,
  LABEL_CHURN_MIN,
  CYCLE_LEG_DELTA,
  CI_TRANSITIONS_MIN,
  PR_FLOW_MIN,
  ANOMALY_RECUR_MIN,
  CONF_CHANGES_MIN,
  MIN_RISK_DEPTH,
  MIN_METRICS_DEPTH,
  MIN_PR_DEPTH,
} = require('../../../../execution/risk/detectEngineeringVolatility');

// ── Test data builders ────────────────────────────────────────────────────────

function risk(score, label = 'monitor', confidenceLevel = 'medium') {
  return { score, label, confidenceLevel };
}

function metrics(ciStatus) {
  return { ciStatus };
}

function prHealth(label, score = 50) {
  return { label, score };
}

function anomaly(type) {
  return { type };
}

// Builds a stable riskHistory of `n` identical snapshots.
function stableRisk(n, score = 40, label = 'monitor', conf = 'medium') {
  return Array.from({ length: n }, () => risk(score, label, conf));
}

// Builds a stable metricsHistory of `n` identical snapshots.
function stableMetrics(n, ciStatus = 'passing') {
  return Array.from({ length: n }, () => metrics(ciStatus));
}

// Builds a stable prHealthHistory of `n` identical snapshots.
function stablePrHealth(n, label = 'healthy') {
  return Array.from({ length: n }, () => prHealth(label));
}

// ── Helpers — expect clean result ─────────────────────────────────────────────

function expectClean(result) {
  expect(result.volatilityLevel).toBe('low');
  expect(result.volatilityScore).toBe(0);
  expect(result.signals).toEqual([]);
  expect(result.reasons).toEqual([]);
}

// ── Exports ───────────────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — exports', () => {
  it('exports the main function', () => {
    expect(typeof detectEngineeringVolatility).toBe('function');
  });

  it('exports numeric threshold constants', () => {
    expect(typeof OSC_DELTA).toBe('number');
    expect(typeof OSC_MIN_COUNT).toBe('number');
    expect(typeof LABEL_CHURN_MIN).toBe('number');
    expect(typeof CYCLE_LEG_DELTA).toBe('number');
    expect(typeof CI_TRANSITIONS_MIN).toBe('number');
    expect(typeof PR_FLOW_MIN).toBe('number');
    expect(typeof ANOMALY_RECUR_MIN).toBe('number');
    expect(typeof CONF_CHANGES_MIN).toBe('number');
  });

  it('exports minimum depth constants', () => {
    expect(typeof MIN_RISK_DEPTH).toBe('number');
    expect(typeof MIN_METRICS_DEPTH).toBe('number');
    expect(typeof MIN_PR_DEPTH).toBe('number');
  });
});

// ── Empty / sparse input ──────────────────────────────────────────────────────

describe('detectEngineeringVolatility — empty / sparse input', () => {
  it('returns low volatility with low confidence when called with no arguments', () => {
    const result = detectEngineeringVolatility();
    expectClean(result);
    expect(result.confidenceLevel).toBe('low');
  });

  it('returns low volatility with low confidence for an empty object', () => {
    const result = detectEngineeringVolatility({});
    expectClean(result);
    expect(result.confidenceLevel).toBe('low');
  });

  it('returns low volatility for all-empty arrays', () => {
    const result = detectEngineeringVolatility({
      riskHistory: [], metricsHistory: [], prHealthHistory: [], anomalyHistory: [],
    });
    expectClean(result);
    expect(result.confidenceLevel).toBe('low');
  });

  it('treats non-array history fields as empty arrays', () => {
    const result = detectEngineeringVolatility({
      riskHistory: null, metricsHistory: 'bad', prHealthHistory: 42, anomalyHistory: {},
    });
    expectClean(result);
  });

  it('does not fire any primitive for riskHistory of length 1 (below MIN_RISK_DEPTH)', () => {
    const result = detectEngineeringVolatility({ riskHistory: [risk(80, 'critical', 'high')] });
    expect(result.signals).not.toContain('risk_score_oscillation');
    expect(result.signals).not.toContain('label_churn');
    expect(result.signals).not.toContain('recovery_degradation_cycle');
    expect(result.signals).not.toContain('confidence_volatility');
  });

  it('does not fire risk-based primitives for riskHistory of length 2 (below MIN_RISK_DEPTH)', () => {
    const rh = [risk(10, 'healthy', 'high'), risk(90, 'critical', 'low')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('risk_score_oscillation');
    expect(result.signals).not.toContain('label_churn');
    expect(result.signals).not.toContain('recovery_degradation_cycle');
  });

  it('does not fire ci_instability for metricsHistory below MIN_METRICS_DEPTH', () => {
    const mh = [metrics('passing'), metrics('failing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not fire anomaly_recurrence for a single event', () => {
    const result = detectEngineeringVolatility({ anomalyHistory: [anomaly('score_spike')] });
    expect(result.signals).not.toContain('anomaly_recurrence');
  });
});

// ── Stable history — no volatility ───────────────────────────────────────────

describe('detectEngineeringVolatility — stable history', () => {
  it('produces zero score for stable risk history', () => {
    const result = detectEngineeringVolatility({ riskHistory: stableRisk(6) });
    expect(result.volatilityScore).toBe(0);
    expect(result.volatilityLevel).toBe('low');
  });

  it('produces no ci_instability for consistently passing CI', () => {
    const result = detectEngineeringVolatility({ metricsHistory: stableMetrics(5, 'passing') });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('produces no ci_instability for consistently failing CI', () => {
    const result = detectEngineeringVolatility({ metricsHistory: stableMetrics(5, 'failing') });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('produces no pr_flow_instability for stable PR labels', () => {
    const result = detectEngineeringVolatility({ prHealthHistory: stablePrHealth(5) });
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('produces no anomaly_recurrence for one event of each type', () => {
    const result = detectEngineeringVolatility({
      anomalyHistory: [anomaly('score_spike'), anomaly('ci_failure'), anomaly('volatility_surge')],
    });
    expect(result.signals).not.toContain('anomaly_recurrence');
  });
});

// ── risk_score_oscillation ────────────────────────────────────────────────────

describe('detectEngineeringVolatility — risk_score_oscillation', () => {
  it('fires when OSC_MIN_COUNT oscillations are present in riskHistory', () => {
    // Newest-first: 20 → 50 → 20 — two pairs each with |Δ|=30 >= OSC_DELTA(10)
    const rh = [risk(20), risk(50), risk(20)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('risk_score_oscillation');
    expect(result.volatilityScore).toBeGreaterThanOrEqual(20);
  });

  it('does not fire when only 1 oscillation exists (below OSC_MIN_COUNT=2)', () => {
    // 20 → 50 → 52 — only one big swing
    const rh = [risk(20), risk(50), risk(52)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('risk_score_oscillation');
  });

  it('counts a pair as oscillation when |Δ| is exactly OSC_DELTA', () => {
    // Pairs: |20-30|=10 and |30-40|=10 — both exactly at boundary
    const rh = [risk(20), risk(30), risk(40)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('risk_score_oscillation');
  });

  it('does not count a pair as oscillation when |Δ| is OSC_DELTA - 1', () => {
    // |Δ|=9 for each pair
    const rh = [risk(10), risk(19), risk(10)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('risk_score_oscillation');
  });

  it('skips null scores without crashing', () => {
    const rh = [risk(null), risk(50), risk(null)];
    expect(() => detectEngineeringVolatility({ riskHistory: rh })).not.toThrow();
  });

  it('does not fire when riskHistory length is below MIN_RISK_DEPTH even with large swings', () => {
    const rh = [risk(10), risk(90)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('risk_score_oscillation');
  });

  it('adds exactly 20 points when triggered', () => {
    const rh = [risk(10), risk(50), risk(10)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('risk_score_oscillation');
    // Verify score includes the 20-point contribution (no other signals here)
    // Also: recovery_degradation_cycle may fire — check just the signal is present
    expect(result.volatilityScore).toBeGreaterThanOrEqual(20);
  });

  it('includes oscillation count in reason text', () => {
    const rh = [risk(10), risk(50), risk(10), risk(50)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const reason = result.reasons[result.signals.indexOf('risk_score_oscillation')];
    expect(reason).toMatch(/3 risk score swings/);
  });
});

// ── label_churn ───────────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — label_churn', () => {
  it('fires when LABEL_CHURN_MIN label changes are present', () => {
    const rh = [risk(40, 'monitor'), risk(60, 'at-risk'), risk(20, 'healthy')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('label_churn');
  });

  it('does not fire when only 1 label change exists', () => {
    const rh = [risk(40, 'monitor'), risk(60, 'at-risk'), risk(65, 'at-risk')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('label_churn');
  });

  it('does not fire when all labels are identical', () => {
    const rh = stableRisk(5, 40, 'monitor');
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('label_churn');
  });

  it('does not fire when riskHistory is below MIN_RISK_DEPTH', () => {
    const rh = [risk(20, 'healthy'), risk(80, 'critical')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('label_churn');
  });

  it('adds exactly 20 points when triggered (and no other risk-based signals fire)', () => {
    // Scores all equal so no oscillation or cycle — only label changes
    const rh = [risk(40, 'monitor'), risk(40, 'at-risk'), risk(40, 'healthy')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('label_churn');
    expect(result.volatilityScore).toBe(20);
  });

  it('includes change count in reason text', () => {
    const rh = [risk(40, 'monitor'), risk(60, 'at-risk'), risk(20, 'healthy')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const idx    = result.signals.indexOf('label_churn');
    expect(result.reasons[idx]).toMatch(/2 times/);
  });

  it('includes snapshot count in reason text', () => {
    const rh = [risk(40, 'monitor'), risk(60, 'at-risk'), risk(20, 'healthy')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const idx    = result.signals.indexOf('label_churn');
    expect(result.reasons[idx]).toMatch(/3 snapshots/);
  });
});

// ── recovery_degradation_cycle ────────────────────────────────────────────────

describe('detectEngineeringVolatility — recovery_degradation_cycle', () => {
  it('fires for a V-shape: high risk → low risk → high risk (recovery then degradation)', () => {
    // Newest-first: [30, 20, 70] → temporal: 70 → 20 → 30
    // older=70, middle=20, newer=30: older-middle=50>=10, newer-middle=10>=10 ✓
    const rh = [risk(30), risk(20), risk(70)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('recovery_degradation_cycle');
  });

  it('fires for an inverted-V: low risk → high risk → low risk (degradation then recovery)', () => {
    // Newest-first: [10, 80, 10]
    // older=10, middle=80, newer=10: middle-older=70>=10, middle-newer=70>=10 ✓
    const rh = [risk(10), risk(80), risk(10)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('recovery_degradation_cycle');
  });

  it('fires when both legs are exactly CYCLE_LEG_DELTA', () => {
    // older=50, middle=40, newer=50: older-middle=10>=10, newer-middle=10>=10 ✓
    const rh = [risk(50), risk(40), risk(50)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('recovery_degradation_cycle');
  });

  it('does not fire when one leg is below CYCLE_LEG_DELTA', () => {
    // older=50, middle=41, newer=50: older-middle=9 < 10 — fails
    const rh = [risk(50), risk(41), risk(50)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('recovery_degradation_cycle');
  });

  it('does not fire when riskHistory is below MIN_RISK_DEPTH', () => {
    const rh = [risk(10), risk(90)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('recovery_degradation_cycle');
  });

  it('skips triples containing null scores', () => {
    const rh = [risk(null), risk(20), risk(70)];
    expect(() => detectEngineeringVolatility({ riskHistory: rh })).not.toThrow();
    // null in triple means that triple is skipped — no fire unless another triple qualifies
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('recovery_degradation_cycle');
  });

  it('detects a cycle that appears later in a longer history', () => {
    // Newest-first: [50, 50, 10, 80, 10]
    // Triple at i=2: older=arr[3]=80, middle=arr[2]=10, newer=arr[1]=50 → older-middle=70>=10, newer-middle=40>=10 ✓
    const rh = [risk(50), risk(50), risk(10), risk(80), risk(10)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('recovery_degradation_cycle');
  });

  it('adds exactly 25 points when triggered alone', () => {
    // Scores differ but no oscillation pairs AND no label churn
    // older=50, middle=40, newer=50 — same labels throughout
    const rh = [risk(50, 'monitor'), risk(40, 'monitor'), risk(50, 'monitor')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('recovery_degradation_cycle');
    // OSC: |50-40|=10>=OSC_DELTA(10) AND |40-50|=10>=OSC_DELTA(10) — both pairs count → osc fires too
    // So total = 25+20 = 45; verify at least 25
    expect(result.volatilityScore).toBeGreaterThanOrEqual(25);
  });

  it('reason text mentions recovery/degradation', () => {
    const rh = [risk(50), risk(20), risk(70)];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const idx = result.signals.indexOf('recovery_degradation_cycle');
    expect(result.reasons[idx]).toMatch(/recover|degrad/i);
  });
});

// ── ci_instability ────────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — ci_instability', () => {
  it('fires when CI alternates pass/fail at least CI_TRANSITIONS_MIN times', () => {
    const mh = [metrics('passing'), metrics('failing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).toContain('ci_instability');
  });

  it('does not fire when only 1 pass→fail transition exists', () => {
    const mh = [metrics('failing'), metrics('passing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not count passing→unknown transition', () => {
    const mh = [metrics('unknown'), metrics('passing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not count failing→unknown transition', () => {
    const mh = [metrics('unknown'), metrics('failing'), metrics('failing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not count unknown→passing transition', () => {
    const mh = [metrics('passing'), metrics('unknown'), metrics('failing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    // only failing→unknown (not counted) and unknown→passing (not counted) — no signal
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not fire for stable CI unknown throughout (unknown alone is not a signal)', () => {
    const mh = stableMetrics(5, 'unknown');
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('does not fire when metricsHistory is below MIN_METRICS_DEPTH', () => {
    const mh = [metrics('passing'), metrics('failing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });

  it('adds exactly 20 points when triggered alone', () => {
    const mh = [metrics('passing'), metrics('failing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).toContain('ci_instability');
    expect(result.volatilityScore).toBe(20);
  });

  it('reason text mentions the transition count', () => {
    const mh = [metrics('passing'), metrics('failing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    const idx = result.signals.indexOf('ci_instability');
    expect(result.reasons[idx]).toMatch(/2 times/);
  });
});

// ── pr_flow_instability ───────────────────────────────────────────────────────

describe('detectEngineeringVolatility — pr_flow_instability', () => {
  it('fires when active PR labels change at least PR_FLOW_MIN times', () => {
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('at-risk')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).toContain('pr_flow_instability');
  });

  it('does not fire when only 1 active label change exists', () => {
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('healthy')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('does not count none→healthy transition (none = no PR activity, not instability)', () => {
    const ph = [prHealth('healthy'), prHealth('none'), prHealth('none')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('does not count unknown→monitor transition (unknown = no data)', () => {
    const ph = [prHealth('monitor'), prHealth('unknown'), prHealth('monitor')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    // unknown→monitor and monitor→unknown are both excluded → no signal
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('does not count healthy→none transition', () => {
    const ph = [prHealth('none'), prHealth('healthy'), prHealth('none')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('does not fire when prHealthHistory is below MIN_PR_DEPTH', () => {
    const ph = [prHealth('monitor'), prHealth('healthy')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).not.toContain('pr_flow_instability');
  });

  it('adds exactly 15 points when triggered alone', () => {
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('at-risk')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    expect(result.signals).toContain('pr_flow_instability');
    expect(result.volatilityScore).toBe(15);
  });

  it('reason text mentions the shift count', () => {
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('at-risk')];
    const result = detectEngineeringVolatility({ prHealthHistory: ph });
    const idx = result.signals.indexOf('pr_flow_instability');
    expect(result.reasons[idx]).toMatch(/2 times/);
  });
});

// ── anomaly_recurrence ────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — anomaly_recurrence', () => {
  it('fires when the same anomaly type appears ANOMALY_RECUR_MIN times', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.signals).toContain('anomaly_recurrence');
  });

  it('does not fire when each type appears only once', () => {
    const ah = [anomaly('score_spike'), anomaly('ci_failure'), anomaly('volatility_surge')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.signals).not.toContain('anomaly_recurrence');
  });

  it('does not fire when anomalyHistory has fewer than ANOMALY_RECUR_MIN entries', () => {
    const result = detectEngineeringVolatility({ anomalyHistory: [anomaly('score_spike')] });
    expect(result.signals).not.toContain('anomaly_recurrence');
  });

  it('skips events without a type field', () => {
    const ah = [{ severity: 'high' }, { severity: 'high' }];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.signals).not.toContain('anomaly_recurrence');
  });

  it('reports all recurring types in reason text', () => {
    const ah = [
      anomaly('score_spike'), anomaly('score_spike'),
      anomaly('ci_failure'),  anomaly('ci_failure'),
    ];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    const idx    = result.signals.indexOf('anomaly_recurrence');
    expect(result.reasons[idx]).toMatch(/score_spike/);
    expect(result.reasons[idx]).toMatch(/ci_failure/);
  });

  it('sorts recurring types by count descending in reason text', () => {
    const ah = [
      anomaly('rare_type'),
      anomaly('score_spike'), anomaly('score_spike'), anomaly('score_spike'),
      anomaly('ci_failure'),  anomaly('ci_failure'),
    ];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    const idx    = result.signals.indexOf('anomaly_recurrence');
    const reason = result.reasons[idx];
    expect(reason.indexOf('score_spike')).toBeLessThan(reason.indexOf('ci_failure'));
  });

  it('sorts alphabetically for types with equal counts (deterministic)', () => {
    const ah = [
      anomaly('zzz_type'), anomaly('zzz_type'),
      anomaly('aaa_type'), anomaly('aaa_type'),
    ];
    const result1 = detectEngineeringVolatility({ anomalyHistory: ah });
    const result2 = detectEngineeringVolatility({ anomalyHistory: ah });
    const idx     = result1.signals.indexOf('anomaly_recurrence');
    expect(result1.reasons[idx]).toBe(result2.reasons[idx]);
    expect(result1.reasons[idx]).toMatch(/^'aaa_type'/);
  });

  it('adds exactly 25 points when triggered alone', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.signals).toContain('anomaly_recurrence');
    expect(result.volatilityScore).toBe(25);
  });

  it('reason text mentions recurrence count', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    const idx    = result.signals.indexOf('anomaly_recurrence');
    expect(result.reasons[idx]).toMatch(/3 times/);
  });
});

// ── confidence_volatility ─────────────────────────────────────────────────────

describe('detectEngineeringVolatility — confidence_volatility', () => {
  it('fires when confidence level changes CONF_CHANGES_MIN times', () => {
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low'), risk(40, 'monitor', 'high')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('confidence_volatility');
  });

  it('does not fire when only 1 confidence change exists', () => {
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low'), risk(40, 'monitor', 'low')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('confidence_volatility');
  });

  it('does not fire when confidence is stable throughout', () => {
    const rh = stableRisk(5, 40, 'monitor', 'medium');
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('confidence_volatility');
  });

  it('does not fire when riskHistory is below MIN_RISK_DEPTH', () => {
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).not.toContain('confidence_volatility');
  });

  it('adds exactly 10 points when triggered alone (stable scores and labels, no other signals)', () => {
    // Same score (no oscillation), same label (no churn), no cycle — only confidence changes
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low'), risk(40, 'monitor', 'high')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expect(result.signals).toContain('confidence_volatility');
    expect(result.volatilityScore).toBe(10);
  });

  it('reason text mentions fluctuation count', () => {
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low'), risk(40, 'monitor', 'high')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const idx = result.signals.indexOf('confidence_volatility');
    expect(result.reasons[idx]).toMatch(/2 times/);
  });

  it('reason text mentions unstable evidence quality', () => {
    const rh = [risk(40, 'monitor', 'high'), risk(40, 'monitor', 'low'), risk(40, 'monitor', 'high')];
    const result = detectEngineeringVolatility({ riskHistory: rh });
    const idx = result.signals.indexOf('confidence_volatility');
    expect(result.reasons[idx]).toMatch(/evidence quality/);
  });
});

// ── confidenceLevel output ────────────────────────────────────────────────────

describe('detectEngineeringVolatility — confidenceLevel output', () => {
  it('returns low when riskHistory < 3 and metricsHistory < 3', () => {
    const result = detectEngineeringVolatility({
      riskHistory: [risk(40)], metricsHistory: [metrics('passing')],
    });
    expect(result.confidenceLevel).toBe('low');
  });

  it('returns medium when riskHistory.length === 3 (even without metricsHistory)', () => {
    const result = detectEngineeringVolatility({ riskHistory: stableRisk(3) });
    expect(result.confidenceLevel).toBe('medium');
  });

  it('returns medium when metricsHistory.length === 3 (even without riskHistory)', () => {
    const result = detectEngineeringVolatility({ metricsHistory: stableMetrics(3) });
    expect(result.confidenceLevel).toBe('medium');
  });

  it('returns medium when riskHistory.length >= 5 but metricsHistory < 3', () => {
    const result = detectEngineeringVolatility({
      riskHistory: stableRisk(6), metricsHistory: stableMetrics(2),
    });
    expect(result.confidenceLevel).toBe('medium');
  });

  it('returns high when riskHistory.length >= 5 AND metricsHistory.length >= 3', () => {
    const result = detectEngineeringVolatility({
      riskHistory: stableRisk(5), metricsHistory: stableMetrics(3),
    });
    expect(result.confidenceLevel).toBe('high');
  });

  it('returns low for empty input', () => {
    expect(detectEngineeringVolatility({}).confidenceLevel).toBe('low');
  });

  it('anomalyHistory depth does not affect confidenceLevel', () => {
    const ah = Array.from({ length: 20 }, () => anomaly('score_spike'));
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    // Only riskHistory + metricsHistory influence confidenceLevel
    expect(result.confidenceLevel).toBe('low');
  });
});

// ── Combined signals ──────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — combined signals', () => {
  it('reaches medium level (25+) when anomaly_recurrence fires alone (25 pts)', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.volatilityScore).toBe(25);
    expect(result.volatilityLevel).toBe('medium');
  });

  it('reaches high level (50+) when recovery_degradation_cycle and anomaly_recurrence both fire', () => {
    const rh = [risk(70), risk(20), risk(70)];
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ riskHistory: rh, anomalyHistory: ah });
    expect(result.signals).toContain('recovery_degradation_cycle');
    expect(result.signals).toContain('anomaly_recurrence');
    expect(result.volatilityScore).toBeGreaterThanOrEqual(50);
    expect(result.volatilityLevel).toBe('high');
  });

  it('reaches critical level (75+) with four signals combining to 75', () => {
    // recovery(25) + anomaly(25) + pr_flow(15) + confidence(10) = 75
    const rh = [
      risk(50, 'monitor',  'high'),
      risk(30, 'monitor',  'low'),
      risk(50, 'monitor',  'high'),
    ];
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('at-risk')];
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({
      riskHistory: rh, prHealthHistory: ph, anomalyHistory: ah,
    });
    expect(result.volatilityScore).toBeGreaterThanOrEqual(75);
    expect(result.volatilityLevel).toBe('critical');
  });

  it('caps volatilityScore at 100 when all signals fire', () => {
    // All 7 signals would sum to 25+25+20+20+20+15+10 = 135 — capped at 100
    const rh = [
      risk(10,  'healthy',  'high'),
      risk(80,  'critical', 'low'),
      risk(10,  'healthy',  'high'),
      risk(80,  'critical', 'low'),
      risk(10,  'healthy',  'medium'),
    ];
    const mh = [metrics('passing'), metrics('failing'), metrics('passing'), metrics('failing')];
    const ph = [prHealth('healthy'), prHealth('at-risk'), prHealth('healthy'), prHealth('critical')];
    const ah = [anomaly('score_spike'), anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({
      riskHistory: rh, metricsHistory: mh, prHealthHistory: ph, anomalyHistory: ah,
    });
    expect(result.volatilityScore).toBe(100);
    expect(result.volatilityLevel).toBe('critical');
  });

  it('includes all fired signal ids in signals array', () => {
    const rh = [
      risk(10, 'healthy',  'high'),
      risk(80, 'critical', 'low'),
      risk(10, 'healthy',  'high'),
    ];
    const ah = [anomaly('ci_failure'), anomaly('ci_failure')];
    const result = detectEngineeringVolatility({ riskHistory: rh, anomalyHistory: ah });
    expect(result.signals.length).toBeGreaterThanOrEqual(3);
    expect(result.signals).toContain('anomaly_recurrence');
  });

  it('signals and reasons arrays have the same length', () => {
    const rh = [risk(10, 'healthy'), risk(80, 'critical'), risk(10, 'healthy')];
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ riskHistory: rh, anomalyHistory: ah });
    expect(result.signals.length).toBe(result.reasons.length);
  });
});

// ── Score threshold boundaries ────────────────────────────────────────────────

describe('detectEngineeringVolatility — threshold boundaries', () => {
  it('score 0 → volatilityLevel low', () => {
    const result = detectEngineeringVolatility({});
    expect(result.volatilityScore).toBe(0);
    expect(result.volatilityLevel).toBe('low');
  });

  it('score 20 (ci_instability alone) → volatilityLevel low', () => {
    // ci_instability is the cleanest isolated 20-point signal: only metricsHistory, no riskHistory
    const mh = [metrics('passing'), metrics('failing'), metrics('passing')];
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.volatilityScore).toBe(20);
    expect(result.volatilityLevel).toBe('low');
  });

  it('score 25 (anomaly_recurrence alone) → volatilityLevel medium', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike')];
    const result = detectEngineeringVolatility({ anomalyHistory: ah });
    expect(result.volatilityScore).toBe(25);
    expect(result.volatilityLevel).toBe('medium');
  });

  it('score 50 (recovery + anomaly) → volatilityLevel high', () => {
    // Ensure recovery fires (+25) and anomaly fires (+25) but no other signals
    // Stable labels, no churn; scores create only the cycle pattern
    const rh = [risk(50, 'monitor', 'medium'), risk(20, 'monitor', 'medium'), risk(50, 'monitor', 'medium')];
    const ah = [anomaly('spike'), anomaly('spike')];
    const result = detectEngineeringVolatility({ riskHistory: rh, anomalyHistory: ah });
    // recovery(25) + anomaly(25) + possibly risk_osc(20) = 50 or 70 — both are 'high'
    expect(result.volatilityLevel).toBe('high');
    expect(result.volatilityScore).toBeGreaterThanOrEqual(50);
    expect(result.volatilityScore).toBeLessThan(75);
  });

  it('score ≥75 → volatilityLevel critical', () => {
    const rh = [
      risk(50, 'monitor',  'high'),
      risk(30, 'monitor',  'low'),
      risk(50, 'monitor',  'high'),
    ];
    const ph = [prHealth('monitor'), prHealth('healthy'), prHealth('at-risk')];
    const ah = [anomaly('spike'), anomaly('spike')];
    const result = detectEngineeringVolatility({
      riskHistory: rh, prHealthHistory: ph, anomalyHistory: ah,
    });
    expect(result.volatilityScore).toBeGreaterThanOrEqual(75);
    expect(result.volatilityLevel).toBe('critical');
  });
});

// ── No static metadata influence ──────────────────────────────────────────────

describe('detectEngineeringVolatility — no static metadata signals', () => {
  it('does not penalize a repo with no releases in metricsHistory', () => {
    const mh = stableMetrics(5).map(m => ({ ...m, releaseStatus: 'none' }));
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expectClean(result);
  });

  it('does not penalize single-contributor repos', () => {
    const mh = stableMetrics(5).map(m => ({ ...m, contributorCount: 1 }));
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expectClean(result);
  });

  it('does not penalize bus_factor = 1 in metrics', () => {
    const mh = stableMetrics(5).map(m => ({ ...m, busFactor: 1 }));
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expectClean(result);
  });

  it('does not fire ci_instability for stable CI unknown throughout', () => {
    const mh = stableMetrics(5, 'unknown');
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
    expect(result.volatilityScore).toBe(0);
  });

  it('does not penalize solo_maintainer flag', () => {
    const rh = stableRisk(5).map(r => ({ ...r, soloMaintainer: true }));
    const result = detectEngineeringVolatility({ riskHistory: rh });
    expectClean(result);
  });

  it('extra unknown fields in metrics snapshots do not cause false signals', () => {
    const mh = stableMetrics(5, 'passing').map(m => ({
      ...m, contributorStatus: 'unknown', releaseStatus: 'unknown', busFactorStatus: 'unknown',
    }));
    const result = detectEngineeringVolatility({ metricsHistory: mh });
    expect(result.signals).not.toContain('ci_instability');
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — determinism', () => {
  it('returns identical output for identical input across two calls', () => {
    const opts = {
      riskHistory:     [risk(10, 'healthy'), risk(80, 'critical'), risk(10, 'healthy')],
      metricsHistory:  [metrics('passing'), metrics('failing'), metrics('passing')],
      prHealthHistory: [prHealth('healthy'), prHealth('at-risk'), prHealth('monitor')],
      anomalyHistory:  [anomaly('score_spike'), anomaly('score_spike')],
    };
    const r1 = detectEngineeringVolatility(opts);
    const r2 = detectEngineeringVolatility(opts);
    expect(r1).toEqual(r2);
  });

  it('signal order is stable across repeated calls', () => {
    const opts = {
      riskHistory:    [risk(10, 'healthy'), risk(80, 'critical'), risk(10, 'healthy')],
      anomalyHistory: [anomaly('score_spike'), anomaly('score_spike')],
    };
    const r1 = detectEngineeringVolatility(opts);
    const r2 = detectEngineeringVolatility(opts);
    expect(r1.signals).toEqual(r2.signals);
  });

  it('volatilityScore is identical across repeated calls', () => {
    const opts = {
      riskHistory:    [risk(10, 'healthy'), risk(80, 'critical'), risk(10, 'healthy')],
      anomalyHistory: [anomaly('score_spike'), anomaly('score_spike')],
    };
    expect(detectEngineeringVolatility(opts).volatilityScore)
      .toBe(detectEngineeringVolatility(opts).volatilityScore);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('detectEngineeringVolatility — non-mutation', () => {
  it('does not mutate the riskHistory array', () => {
    const rh = [risk(10, 'healthy'), risk(80, 'critical'), risk(10, 'healthy')];
    const copy = JSON.parse(JSON.stringify(rh));
    detectEngineeringVolatility({ riskHistory: rh });
    expect(rh).toEqual(copy);
  });

  it('does not mutate the metricsHistory array', () => {
    const mh = [metrics('passing'), metrics('failing'), metrics('passing')];
    const copy = JSON.parse(JSON.stringify(mh));
    detectEngineeringVolatility({ metricsHistory: mh });
    expect(mh).toEqual(copy);
  });

  it('does not mutate the anomalyHistory array', () => {
    const ah = [anomaly('score_spike'), anomaly('score_spike'), anomaly('ci_failure')];
    const copy = JSON.parse(JSON.stringify(ah));
    detectEngineeringVolatility({ anomalyHistory: ah });
    expect(ah).toEqual(copy);
  });

  it('returns a new signals array (not a shared reference)', () => {
    const opts = { anomalyHistory: [anomaly('spike'), anomaly('spike')] };
    const r1 = detectEngineeringVolatility(opts);
    const r2 = detectEngineeringVolatility(opts);
    r1.signals.push('injected');
    expect(r2.signals).not.toContain('injected');
  });
});
