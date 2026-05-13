'use strict';

const { getEscalationSignals } = require('../../../../execution/risk/getEscalationSignals');

// Injectable clock anchored to a known instant so 24h-window logic is deterministic.
const NOW_MS = new Date('2026-05-12T12:00:00.000Z').getTime();

function hoursAgo(h) {
  return new Date(NOW_MS - h * 3600 * 1000).toISOString();
}

function makeRisk(score, hoursAgoVal = 1) {
  return {
    score:      score,
    label:      score >= 70 ? 'critical' : score >= 40 ? 'at-risk' : 'healthy',
    snapshotAt: hoursAgo(hoursAgoVal),
  };
}

function makeMetrics({ ciStatus = 'passing', releaseStatus = 'healthy', contributorStatus = 'healthy' } = {}) {
  return { ciStatus, releaseStatus, contributorStatus };
}

// ── Sparse / empty input ───────────────────────────────────────────────────────

describe('getEscalationSignals — sparse / empty input', () => {
  it('returns safe defaults when called with no arguments', () => {
    const r = getEscalationSignals();
    expect(r.volatilityLevel).toBe('low');
    expect(r.escalationLevel).toBe('none');
    expect(r.persistentRisk).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it('returns safe defaults for empty arrays', () => {
    const r = getEscalationSignals({ riskHistory: [], metricsHistory: [], events: [] });
    expect(r.volatilityLevel).toBe('low');
    expect(r.escalationLevel).toBe('none');
    expect(r.persistentRisk).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it('returns safe defaults for single-element histories', () => {
    const r = getEscalationSignals({
      riskHistory:    [makeRisk(80, 1)],
      metricsHistory: [makeMetrics({ ciStatus: 'failing' })],
      events:         [],
      _now: NOW_MS,
    });
    expect(r.volatilityLevel).toBe('low');
    expect(r.escalationLevel).toBe('none');
    expect(r.persistentRisk).toBe(false);
    expect(r.signals).toEqual([]);
  });

  it('returns safe defaults for two healthy snapshots', () => {
    const r = getEscalationSignals({
      riskHistory:    [makeRisk(20, 1), makeRisk(22, 5)],
      metricsHistory: [makeMetrics(), makeMetrics()],
      events:         [],
      _now: NOW_MS,
    });
    expect(r.volatilityLevel).toBe('low');
    expect(r.escalationLevel).toBe('none');
    expect(r.persistentRisk).toBe(false);
    expect(r.signals).toEqual([]);
  });
});

// ── Volatility ─────────────────────────────────────────────────────────────────

describe('getEscalationSignals — volatility', () => {
  it('returns low when there is only 1 change >= 10 in 24h', () => {
    const rh = [makeRisk(60, 1), makeRisk(40, 3)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('low');
  });

  it('returns medium when there are exactly 2 changes >= 10 in 24h', () => {
    const rh = [makeRisk(80, 1), makeRisk(60, 3), makeRisk(40, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('medium');
  });

  it('returns high when there are 3+ changes >= 10 in 24h', () => {
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('high');
  });

  it('does not count a change of exactly 9 toward volatility', () => {
    // Scores below 40 → label 'healthy', so persistent-risk and escalation are
    // not triggered either — only pure volatility is under test here.
    const rh = [
      makeRisk(35, 1), makeRisk(26, 3),
      makeRisk(35, 5), makeRisk(26, 7),
      makeRisk(35, 9), makeRisk(26, 11),
    ];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('low');
    expect(r.signals).toEqual([]);
  });

  it('counts a change of exactly 10 toward volatility', () => {
    // 3 entries → 2 consecutive pairs, each with |delta|=10 → exactly 2 changes → 'medium'
    const rh = [makeRisk(60, 1), makeRisk(50, 3), makeRisk(60, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('medium');
  });

  it('does not count changes whose newer snapshot is outside the 24h window', () => {
    // All snapshots are > 24h old — nothing in window
    const rh = [
      makeRisk(90, 25), makeRisk(70, 27),
      makeRisk(50, 29), makeRisk(30, 31),
    ];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.volatilityLevel).toBe('low');
  });

  it('counts only changes whose newer snapshot is within 24h', () => {
    // Only the first change (1h ago) is in the window; the rest are old
    const rh = [
      makeRisk(80,  1),  // 1h ago  — inside window  (delta=20)
      makeRisk(60, 25),  // 25h ago — outside window (delta=20, but ts < cutoff)
      makeRisk(40, 26),
    ];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    // Only 1 in-window change → low
    expect(r.volatilityLevel).toBe('low');
  });

  it('includes the volatility signal text when medium', () => {
    const rh = [makeRisk(80, 1), makeRisk(60, 3), makeRisk(40, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('2 times in 24 hours'))).toBe(true);
  });

  it('includes the volatility signal text when high', () => {
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('3 times in 24 hours'))).toBe(true);
  });
});

// ── Escalation — consecutive worsening ────────────────────────────────────────

describe('getEscalationSignals — consecutive worsening', () => {
  it('returns none escalation for 1 worsening step', () => {
    const rh = [makeRisk(70, 1), makeRisk(50, 3)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.escalationLevel).toBe('none');
  });

  it('returns high escalation for exactly 2 consecutive worsening steps', () => {
    const rh = [makeRisk(80, 1), makeRisk(60, 3), makeRisk(40, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.escalationLevel).toBe('high');
  });

  it('returns critical escalation for 3 consecutive worsening steps', () => {
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.escalationLevel).toBe('critical');
  });

  it('returns critical escalation for 4 consecutive worsening steps', () => {
    const rh = [makeRisk(100, 1), makeRisk(80, 3), makeRisk(60, 5), makeRisk(40, 7), makeRisk(20, 9)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.escalationLevel).toBe('critical');
  });

  it('uses the max run — a break then restart still triggers high if max run is 2', () => {
    // 1 worsening, then stable, then 2 worsening
    const rh = [
      makeRisk(80, 1),  // newest
      makeRisk(60, 3),  // delta+20 worsening (#1 of new run)
      makeRisk(40, 5),  // delta+20 worsening (#2 of new run) → max=2
      makeRisk(38, 7),  // delta+2  stable (breaks first run of 1)
      makeRisk(18, 9),  // this would be worsening but it's behind the break
    ];
    const r = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    // max run = 2 (indices 0-1-2 give consecutive worsening 0→1 and 1→2)
    expect(r.escalationLevel).toBe('high');
  });

  it('does not flag escalation when worsening is below the 10-point threshold', () => {
    const rh = [makeRisk(58, 1), makeRisk(50, 3), makeRisk(42, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.escalationLevel).toBe('none');
  });

  it('includes the consecutive worsening signal text', () => {
    const rh = [makeRisk(80, 1), makeRisk(60, 3), makeRisk(40, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('2 consecutive snapshots'))).toBe(true);
  });

  it('labels the consecutive-worsening signal as critical when run >= 3', () => {
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    const consignal = r.signals[0]; // critical sorts first
    expect(consignal).toContain('3 consecutive snapshots');
  });
});

// ── Escalation — repeated critical events ─────────────────────────────────────

describe('getEscalationSignals — critical events', () => {
  it('returns none escalation for 1 critical event', () => {
    const r = getEscalationSignals({
      riskHistory:    [makeRisk(50, 1)],
      metricsHistory: [],
      events:         [{ severity: 'critical', type: 'ci_failure_detected' }],
      _now: NOW_MS,
    });
    expect(r.escalationLevel).toBe('none');
  });

  it('returns high escalation for 2+ critical events', () => {
    const r = getEscalationSignals({
      riskHistory:    [makeRisk(50, 1)],
      metricsHistory: [],
      events:         [
        { severity: 'critical', type: 'ci_failure_detected' },
        { severity: 'critical', type: 'ci_failure_detected' },
      ],
      _now: NOW_MS,
    });
    expect(r.escalationLevel).toBe('high');
  });

  it('ignores non-critical events for escalation detection', () => {
    const r = getEscalationSignals({
      riskHistory:    [makeRisk(50, 1)],
      metricsHistory: [],
      events:         [
        { severity: 'high',   type: 'risk_increase' },
        { severity: 'medium', type: 'contributor_activity_declined' },
        { severity: 'healthy', type: 'ci_recovered' },
      ],
      _now: NOW_MS,
    });
    expect(r.escalationLevel).toBe('none');
  });

  it('includes the critical-events signal text', () => {
    const r = getEscalationSignals({
      events: [
        { severity: 'critical' },
        { severity: 'critical' },
        { severity: 'critical' },
      ],
      _now: NOW_MS,
    });
    expect(r.signals.some(s => s.includes('critical events detected'))).toBe(true);
  });
});

// ── Persistent risk ────────────────────────────────────────────────────────────

describe('getEscalationSignals — persistent risk', () => {
  it('returns persistentRisk false for fewer than 3 risk snapshots', () => {
    const r = getEscalationSignals({
      riskHistory: [makeRisk(80, 1), makeRisk(70, 3)],
      _now: NOW_MS,
    });
    expect(r.persistentRisk).toBe(false);
  });

  it('returns persistentRisk false when only 2 of the 3 most-recent are at-risk', () => {
    const rh = [
      makeRisk(70, 1),   // at-risk
      makeRisk(60, 3),   // at-risk
      makeRisk(20, 5),   // healthy ← breaks the run
    ];
    const r = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.persistentRisk).toBe(false);
  });

  it('returns persistentRisk false when the most-recent snapshot is healthy', () => {
    const rh = [
      makeRisk(20,  1),   // healthy ← newest
      makeRisk(70,  3),   // critical
      makeRisk(60,  5),   // at-risk
    ];
    const r = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.persistentRisk).toBe(false);
  });

  it('returns persistentRisk true when 3 most-recent are at-risk', () => {
    const rh = [makeRisk(60, 1), makeRisk(55, 3), makeRisk(50, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.persistentRisk).toBe(true);
  });

  it('returns persistentRisk true when 3 most-recent are critical', () => {
    const rh = [makeRisk(90, 1), makeRisk(85, 3), makeRisk(80, 5), makeRisk(20, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.persistentRisk).toBe(true);
  });

  it('returns persistentRisk true when first 3 mix at-risk and critical', () => {
    const rh = [makeRisk(80, 1), makeRisk(50, 3), makeRisk(75, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.persistentRisk).toBe(true);
  });

  it('includes persistent risk signal text when true', () => {
    const rh = [makeRisk(80, 1), makeRisk(75, 3), makeRisk(70, 5)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('3+ consecutive snapshots'))).toBe(true);
  });
});

// ── Repeated CI failures ───────────────────────────────────────────────────────

describe('getEscalationSignals — repeated CI failures', () => {
  it('does not emit CI signal for a single passing→failing transition', () => {
    const mh = [makeMetrics({ ciStatus: 'failing' }), makeMetrics({ ciStatus: 'passing' })];
    const r  = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('CI failures'))).toBe(false);
  });

  it('emits CI signal when passing→failing transition occurs 2 times', () => {
    const mh = [
      makeMetrics({ ciStatus: 'failing' }),  // transition 1 (newest)
      makeMetrics({ ciStatus: 'passing' }),
      makeMetrics({ ciStatus: 'failing' }),  // transition 2
      makeMetrics({ ciStatus: 'passing' }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('CI failures detected repeatedly'))).toBe(true);
  });

  it('emits unresolved-cycle signal when CI has been failing for 3+ consecutive snapshots', () => {
    const mh = [
      makeMetrics({ ciStatus: 'failing' }),
      makeMetrics({ ciStatus: 'failing' }),
      makeMetrics({ ciStatus: 'failing' }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('unresolved for 3 sync cycles'))).toBe(true);
  });

  it('does not emit unresolved-cycle signal for only 2 consecutive failing snapshots', () => {
    const mh = [
      makeMetrics({ ciStatus: 'failing' }),
      makeMetrics({ ciStatus: 'failing' }),
      makeMetrics({ ciStatus: 'passing' }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('unresolved'))).toBe(false);
  });
});

// ── Repeated release declines ──────────────────────────────────────────────────

describe('getEscalationSignals — repeated release declines', () => {
  it('does not emit release signal for a single healthy→stale transition', () => {
    const mh = [makeMetrics({ releaseStatus: 'stale' }), makeMetrics({ releaseStatus: 'healthy' })];
    const r  = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('Release cadence'))).toBe(false);
  });

  it('emits release signal when healthy→stale occurs 2 times', () => {
    const mh = [
      makeMetrics({ releaseStatus: 'stale'   }),  // transition 1
      makeMetrics({ releaseStatus: 'healthy' }),
      makeMetrics({ releaseStatus: 'stale'   }),  // transition 2
      makeMetrics({ releaseStatus: 'healthy' }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('Release cadence declined 2 times'))).toBe(true);
  });
});

// ── Repeated contributor declines ─────────────────────────────────────────────

describe('getEscalationSignals — repeated contributor declines', () => {
  it('does not emit contributor signal for a single decline', () => {
    const mh = [makeMetrics({ contributorStatus: 'low_activity' }), makeMetrics({ contributorStatus: 'healthy' })];
    const r  = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('Contributor activity'))).toBe(false);
  });

  it('emits contributor signal when healthy→low_activity occurs 2 times', () => {
    const mh = [
      makeMetrics({ contributorStatus: 'low_activity' }),
      makeMetrics({ contributorStatus: 'healthy'      }),
      makeMetrics({ contributorStatus: 'low_activity' }),
      makeMetrics({ contributorStatus: 'healthy'      }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('Contributor activity declined 2 times'))).toBe(true);
  });

  it('emits contributor signal for healthy→bus_factor_risk transition repeated twice', () => {
    const mh = [
      makeMetrics({ contributorStatus: 'bus_factor_risk' }),
      makeMetrics({ contributorStatus: 'healthy'         }),
      makeMetrics({ contributorStatus: 'bus_factor_risk' }),
      makeMetrics({ contributorStatus: 'healthy'         }),
    ];
    const r = getEscalationSignals({ metricsHistory: mh, _now: NOW_MS });
    expect(r.signals.some(s => s.includes('Contributor activity declined'))).toBe(true);
  });
});

// ── Signal ordering ────────────────────────────────────────────────────────────

describe('getEscalationSignals — signal ordering', () => {
  it('orders signals critical → high → medium', () => {
    // Construct a case that triggers all three severity levels:
    //   - 3 consecutive worsening  → critical signal
    //   - persistentRisk           → high signal
    //   - release decline x2       → medium signal
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const mh = [
      makeMetrics({ releaseStatus: 'stale'   }),
      makeMetrics({ releaseStatus: 'healthy' }),
      makeMetrics({ releaseStatus: 'stale'   }),
      makeMetrics({ releaseStatus: 'healthy' }),
    ];
    const r = getEscalationSignals({ riskHistory: rh, metricsHistory: mh, _now: NOW_MS });

    // At least 2 signals exist
    expect(r.signals.length).toBeGreaterThanOrEqual(2);

    // The first signal must not be less severe than the second
    const firstIsCriticalOrHigh = r.signals[0].includes('consecutive') || r.signals[0].includes('elevated risk') || r.signals[0].includes('critical events');
    expect(firstIsCriticalOrHigh).toBe(true);
  });

  it('places medium-severity signals after high-severity signals', () => {
    const rh = [makeRisk(80, 1), makeRisk(60, 3), makeRisk(40, 5)];
    const mh = [
      makeMetrics({ releaseStatus: 'stale'   }),
      makeMetrics({ releaseStatus: 'healthy' }),
      makeMetrics({ releaseStatus: 'stale'   }),
      makeMetrics({ releaseStatus: 'healthy' }),
    ];
    const r = getEscalationSignals({ riskHistory: rh, metricsHistory: mh, _now: NOW_MS });
    const releaseIdx    = r.signals.findIndex(s => s.includes('Release cadence'));
    const worseningIdx  = r.signals.findIndex(s => s.includes('consecutive snapshots'));
    expect(worseningIdx).toBeGreaterThanOrEqual(0);
    expect(releaseIdx).toBeGreaterThanOrEqual(0);
    expect(worseningIdx).toBeLessThan(releaseIdx);
  });
});

// ── Output shape ───────────────────────────────────────────────────────────────

describe('getEscalationSignals — output shape', () => {
  it('always returns all four fields', () => {
    const r = getEscalationSignals();
    expect(r).toHaveProperty('volatilityLevel');
    expect(r).toHaveProperty('escalationLevel');
    expect(r).toHaveProperty('persistentRisk');
    expect(r).toHaveProperty('signals');
  });

  it('signals is always an array', () => {
    expect(Array.isArray(getEscalationSignals().signals)).toBe(true);
  });

  it('volatilityLevel is always one of low/medium/high', () => {
    const r = getEscalationSignals();
    expect(['low', 'medium', 'high']).toContain(r.volatilityLevel);
  });

  it('escalationLevel is always one of none/high/critical', () => {
    const r = getEscalationSignals();
    expect(['none', 'high', 'critical']).toContain(r.escalationLevel);
  });

  it('persistentRisk is always a boolean', () => {
    expect(typeof getEscalationSignals().persistentRisk).toBe('boolean');
  });

  it('every signal is a non-empty string', () => {
    const rh = [makeRisk(90, 1), makeRisk(70, 3), makeRisk(50, 5), makeRisk(30, 7)];
    const r  = getEscalationSignals({ riskHistory: rh, _now: NOW_MS });
    r.signals.forEach(s => {
      expect(typeof s).toBe('string');
      expect(s.length).toBeGreaterThan(0);
    });
  });
});
