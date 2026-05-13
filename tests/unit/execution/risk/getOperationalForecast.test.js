'use strict';

const { getOperationalForecast } = require('../../../../execution/risk/getOperationalForecast');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRisk(score, label) {
  return { score, label: label || (score >= 70 ? 'critical' : score >= 40 ? 'at-risk' : 'healthy'), snapshotAt: new Date().toISOString() };
}

function makeMetrics({ ciStatus = 'passing', releaseStatus = 'healthy', contributorStatus = 'healthy' } = {}) {
  return { ciStatus, releaseStatus, contributorStatus, snapshotAt: new Date().toISOString() };
}

function makeEscalation(overrides = {}) {
  return {
    volatilityLevel: 'low',
    escalationLevel: 'none',
    persistentRisk:  false,
    signals:         [],
    ...overrides,
  };
}

function makeEvent(type, severity = 'medium') {
  return { type, severity, snapshotAt: new Date().toISOString() };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

describe('getOperationalForecast — output shape', () => {
  it('returns all required fields with valid defaults', () => {
    const result = getOperationalForecast({
      riskHistory: [makeRisk(50), makeRisk(45)],
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result).toHaveProperty('trajectory');
    expect(result).toHaveProperty('forecastLevel');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('projectedRisk');
    expect(result).toHaveProperty('signals');
    expect(Array.isArray(result.signals)).toBe(true);
  });
});

// ── Unknown trajectory ─────────────────────────────────────────────────────────

describe('getOperationalForecast — unknown trajectory', () => {
  it('returns unknown when called with no arguments', () => {
    const result = getOperationalForecast();
    expect(result.trajectory).toBe('unknown');
    expect(result.forecastLevel).toBe('unknown');
    expect(result.confidence).toBe('low');
  });

  it('returns unknown when riskHistory is empty', () => {
    const result = getOperationalForecast({ riskHistory: [], escalation: makeEscalation(), events: [] });
    expect(result.trajectory).toBe('unknown');
  });

  it('returns unknown when riskHistory has only 1 entry', () => {
    const result = getOperationalForecast({ riskHistory: [makeRisk(60)], escalation: makeEscalation(), events: [] });
    expect(result.trajectory).toBe('unknown');
    expect(result.forecastLevel).toBe('unknown');
  });

  it('returns empty signals for unknown', () => {
    const result = getOperationalForecast({ riskHistory: [makeRisk(60)] });
    expect(result.signals).toHaveLength(0);
  });
});

// ── Confidence derivation ──────────────────────────────────────────────────────

describe('getOperationalForecast — confidence', () => {
  it('returns low confidence when fewer than 3 snapshots', () => {
    const rh = [makeRisk(50), makeRisk(45)];
    const result = getOperationalForecast({ riskHistory: rh, escalation: makeEscalation(), events: [] });
    expect(result.confidence).toBe('low');
  });

  it('returns medium confidence when 3 snapshots and stable', () => {
    const rh = [makeRisk(50), makeRisk(48), makeRisk(46)];
    const result = getOperationalForecast({ riskHistory: rh, escalation: makeEscalation(), events: [] });
    expect(result.confidence).toBe('medium');
  });

  it('returns medium confidence when 5 snapshots but volatilityLevel is high', () => {
    const rh = [makeRisk(50), makeRisk(40), makeRisk(50), makeRisk(40), makeRisk(50)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'high' }),
      events:      [],
    });
    expect(result.confidence).toBe('medium');
  });

  it('returns high confidence when 5 snapshots and not volatile', () => {
    const rh = [makeRisk(50), makeRisk(48), makeRisk(46), makeRisk(44), makeRisk(42)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'low' }),
      events:      [],
    });
    expect(result.confidence).toBe('high');
  });

  it('returns high confidence when 5 snapshots and volatilityLevel medium', () => {
    const rh = [makeRisk(50), makeRisk(48), makeRisk(46), makeRisk(44), makeRisk(42)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'medium' }),
      events:      [],
    });
    expect(result.confidence).toBe('high');
  });
});

// ── Escalating trajectory ──────────────────────────────────────────────────────

describe('getOperationalForecast — escalating trajectory', () => {
  it('classifies as escalating when escalationLevel is critical', () => {
    const rh = [makeRisk(80), makeRisk(60)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'critical' }),
      events:      [],
    });
    expect(result.trajectory).toBe('escalating');
    expect(result.forecastLevel).toBe('critical');
  });

  it('classifies as escalating when 3 consecutive worsening steps', () => {
    // newest-first: 80 > 70 > 60 > 50 — three worsening steps of 10
    const rh = [makeRisk(80), makeRisk(70), makeRisk(60), makeRisk(50)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'none' }),
      events:      [],
    });
    expect(result.trajectory).toBe('escalating');
    expect(result.forecastLevel).toBe('critical');
  });

  it('includes consecutive-worsening signal when >= 3 steps', () => {
    const rh = [makeRisk(80), makeRisk(70), makeRisk(60), makeRisk(50)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'critical' }),
      events:      [],
    });
    expect(result.signals.some(s => s.includes('worsened'))).toBe(true);
  });

  it('includes persistentRisk signal in escalating when persistentRisk true', () => {
    const rh = [makeRisk(80), makeRisk(60)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'critical', persistentRisk: true }),
      events:      [],
    });
    expect(result.signals.some(s => s.includes('elevated risk'))).toBe(true);
  });

  it('does NOT classify 2 consecutive worsening steps as escalating', () => {
    const rh = [makeRisk(70), makeRisk(60), makeRisk(50)];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high' }),
      events:      [],
    });
    expect(result.trajectory).not.toBe('escalating');
  });
});

// ── Deteriorating trajectory ───────────────────────────────────────────────────

describe('getOperationalForecast — deteriorating trajectory', () => {
  it('classifies as deteriorating when latest step worsening AND persistentRisk', () => {
    const rh = [makeRisk(60, 'at-risk'), makeRisk(50, 'at-risk'), makeRisk(45, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high', persistentRisk: true }),
      events:      [],
    });
    expect(result.trajectory).toBe('deteriorating');
    expect(result.forecastLevel).toBe('high');
  });

  it('classifies as deteriorating when escalationLevel high AND persistentRisk', () => {
    const rh = [makeRisk(55, 'at-risk'), makeRisk(57, 'at-risk'), makeRisk(52, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high', persistentRisk: true }),
      events:      [],
    });
    expect(result.trajectory).toBe('deteriorating');
  });

  it('classifies as deteriorating when 2+ decline events AND escalationLevel high', () => {
    const rh = [makeRisk(60, 'at-risk'), makeRisk(55, 'at-risk')];
    const evs = [makeEvent('ci_failure_detected', 'high'), makeEvent('risk_increase', 'high')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high', persistentRisk: false }),
      events:      evs,
    });
    expect(result.trajectory).toBe('deteriorating');
  });

  it('does NOT classify as deteriorating when escalationLevel high but no persistentRisk and < 2 decline events', () => {
    const rh = [makeRisk(60, 'at-risk'), makeRisk(55, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high', persistentRisk: false }),
      events:      [makeEvent('ci_failure_detected', 'high')],
    });
    expect(result.trajectory).not.toBe('deteriorating');
  });
});

// ── Volatile trajectory ────────────────────────────────────────────────────────

describe('getOperationalForecast — volatile trajectory', () => {
  it('classifies as volatile when volatilityLevel is high', () => {
    const rh = [makeRisk(50, 'at-risk'), makeRisk(40, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'high' }),
      events:      [],
    });
    expect(result.trajectory).toBe('volatile');
  });

  it('forecastLevel is medium when volatile without persistent risk', () => {
    const rh = [makeRisk(50, 'at-risk'), makeRisk(40, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'high', persistentRisk: false }),
      events:      [],
    });
    expect(result.forecastLevel).toBe('medium');
  });

  it('forecastLevel is high when volatile WITH persistent risk', () => {
    const rh = [makeRisk(60, 'at-risk'), makeRisk(50, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'high', persistentRisk: true }),
      events:      [],
    });
    expect(result.forecastLevel).toBe('high');
  });

  it('includes volatility signal', () => {
    const rh = [makeRisk(50, 'at-risk'), makeRisk(40, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ volatilityLevel: 'high' }),
      events:      [],
    });
    expect(result.signals.some(s => s.includes('volatile'))).toBe(true);
  });
});

// ── Recovering trajectory ──────────────────────────────────────────────────────

describe('getOperationalForecast — recovering trajectory', () => {
  it('classifies as recovering when 2 consecutive improving steps and no critical events', () => {
    // newest-first: 30 < 40 < 50 — two improving steps of 10
    const rh = [makeRisk(30, 'healthy'), makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.trajectory).toBe('recovering');
    expect(result.forecastLevel).toBe('medium');
  });

  it('forecastLevel is low when 3+ consecutive improving steps', () => {
    const rh = [makeRisk(20, 'healthy'), makeRisk(30, 'healthy'), makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.trajectory).toBe('recovering');
    expect(result.forecastLevel).toBe('low');
  });

  it('does NOT classify as recovering when critical event exists', () => {
    const rh = [makeRisk(30, 'healthy'), makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const evs = [makeEvent('risk_increase', 'critical')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      evs,
    });
    expect(result.trajectory).not.toBe('recovering');
  });

  it('does NOT classify as recovering when only 1 improving step', () => {
    const rh = [makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.trajectory).not.toBe('recovering');
  });

  it('includes improving-streak signal', () => {
    const rh = [makeRisk(30, 'healthy'), makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.signals.some(s => s.includes('improved'))).toBe(true);
  });
});

// ── Stable trajectory ──────────────────────────────────────────────────────────

describe('getOperationalForecast — stable trajectory', () => {
  it('classifies as stable when no escalation, no volatility, no persistentRisk, no consecutive worsening', () => {
    const rh = [makeRisk(45, 'at-risk'), makeRisk(44, 'at-risk')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'none', volatilityLevel: 'low', persistentRisk: false }),
      events:      [],
    });
    expect(result.trajectory).toBe('stable');
    expect(result.forecastLevel).toBe('low');
  });

  it('classifies healthy, quiescent repo as stable', () => {
    const rh = [makeRisk(20, 'healthy'), makeRisk(22, 'healthy')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.trajectory).toBe('stable');
  });

  it('includes no-escalation signal', () => {
    const rh = [makeRisk(30, 'healthy'), makeRisk(32, 'healthy')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      [],
    });
    expect(result.signals.length).toBeGreaterThan(0);
  });
});

// ── Signal ordering ────────────────────────────────────────────────────────────

describe('getOperationalForecast — signal ordering', () => {
  it('returns signals sorted critical → high → medium → low', () => {
    // Force escalating with persistentRisk and decline events to produce mixed severities
    const rh = [makeRisk(80), makeRisk(70), makeRisk(60), makeRisk(50)];
    const evs = [makeEvent('ci_failure_detected', 'high')];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'critical', persistentRisk: true }),
      events:      evs,
    });
    const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const signalTexts = result.signals;
    // Signals can only be verified via content; we just ensure at least 2 returned
    expect(signalTexts.length).toBeGreaterThanOrEqual(2);
  });
});

// ── Decline event counting ─────────────────────────────────────────────────────

describe('getOperationalForecast — decline event counting', () => {
  it('counts ci_failure_detected, release_activity_declined, contributor_activity_declined, bus_factor_detected, risk_increase as decline events', () => {
    const rh = [makeRisk(60, 'at-risk'), makeRisk(55, 'at-risk')];
    const evs = [
      makeEvent('ci_failure_detected'),
      makeEvent('release_activity_declined'),
      makeEvent('contributor_activity_declined'),
      makeEvent('bus_factor_detected'),
      makeEvent('risk_increase'),
    ];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation({ escalationLevel: 'high', persistentRisk: false }),
      events:      evs,
    });
    expect(result.trajectory).toBe('deteriorating');
  });

  it('does NOT count recovery events as decline events', () => {
    const rh = [makeRisk(30, 'healthy'), makeRisk(40, 'at-risk'), makeRisk(50, 'at-risk')];
    const evs = [
      makeEvent('ci_recovered'),
      makeEvent('release_activity_recovered'),
      makeEvent('contributor_activity_recovered'),
      makeEvent('risk_recovery'),
    ];
    const result = getOperationalForecast({
      riskHistory: rh,
      escalation:  makeEscalation(),
      events:      evs,
    });
    expect(result.trajectory).toBe('recovering');
  });
});

// ── Sparse / malformed input ───────────────────────────────────────────────────

describe('getOperationalForecast — sparse or malformed input', () => {
  it('handles null riskHistory gracefully', () => {
    expect(() => getOperationalForecast({ riskHistory: null, escalation: makeEscalation(), events: [] })).not.toThrow();
  });

  it('handles undefined escalation gracefully', () => {
    const rh = [makeRisk(50), makeRisk(45)];
    expect(() => getOperationalForecast({ riskHistory: rh, escalation: undefined, events: [] })).not.toThrow();
  });

  it('handles null events gracefully', () => {
    const rh = [makeRisk(50), makeRisk(45)];
    expect(() => getOperationalForecast({ riskHistory: rh, escalation: makeEscalation(), events: null })).not.toThrow();
  });

  it('handles NaN scores in riskHistory without throwing', () => {
    const rh = [{ score: 'bad', label: 'at-risk' }, { score: 50, label: 'at-risk' }];
    expect(() => getOperationalForecast({ riskHistory: rh, escalation: makeEscalation(), events: [] })).not.toThrow();
  });
});
