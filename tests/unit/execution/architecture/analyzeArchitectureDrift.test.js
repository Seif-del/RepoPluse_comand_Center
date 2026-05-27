'use strict';

const { analyzeArchitectureDrift } = require('../../../../execution/architecture/analyzeArchitectureDrift');

// ── Snapshot factories ─────────────────────────────────────────────────────────

const OLD_DATE = '2024-01-01T00:00:00Z';
const NEW_DATE = '2024-06-01T00:00:00Z';
const MID_DATE = '2024-03-01T00:00:00Z';

function makeSnap({
  snapshotAt              = null,
  architectureHealthScore = 75,
  architectureHealthLevel = 'healthy',
  confidenceLevel         = 'medium',
  metrics                 = {},
  violations              = [],
  unresolvedFrontendCalls = [],
  methodMismatches        = [],
  implSignals             = [],
} = {}) {
  return {
    snapshotAt,
    architectureHealthScore,
    architectureHealthLevel,
    confidenceLevel,
    metrics: {
      totalFiles:                    0,
      totalEdges:                    0,
      backendRouteCount:             0,
      frontendApiCallCount:          0,
      linkedEndpointCount:           0,
      unresolvedFrontendCallCount:   0,
      orphanedBackendRouteCount:     0,
      circularDependencyCount:       0,
      boundaryViolationCount:        violations.length,
      implementationSignalCount:     implSignals.length,
      ...metrics,
    },
    boundaryVerification:       { violations },
    apiLinkage:                 { unresolvedFrontendCalls, methodMismatches },
    implementationCompleteness: { signals: implSignals },
  };
}

// Undated snapshot — use only for tests that explicitly verify undated-sort behavior
function snap(score, opts = {}) {
  return makeSnap({ architectureHealthScore: score, ...opts });
}

// Dated snapshot — use for all tests that depend on oldest/latest ordering
function datedSnap(isoDate, score, opts = {}) {
  return makeSnap({ snapshotAt: isoDate, architectureHealthScore: score, ...opts });
}

// Convenience: two-element dated pair [oldest, latest]
function pair(oldScore, newScore, oldOpts = {}, newOpts = {}) {
  return [
    datedSnap(OLD_DATE, oldScore, oldOpts),
    datedSnap(NEW_DATE, newScore, newOpts),
  ];
}

// ── Unknown-result shape ───────────────────────────────────────────────────────

function expectUnknown(result) {
  expect(result.driftDirection).toBe('unknown');
  expect(result.driftSeverity).toBe('unknown');
  expect(result.delta).toBe(0);
  expect(result.latestScore).toBeNull();
  expect(result.oldestScore).toBeNull();
  expect(result.confidenceLevel).toBe('low');
  expect(result.summary).toMatch(/insufficient/i);
  expect(result.newRiskSignals).toEqual([]);
  expect(result.resolvedRiskSignals).toEqual([]);
  expect(result.persistentRiskSignals).toEqual([]);
  expect(result.drivers).toEqual([]);
  expect(result.recommendations).toEqual([]);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Guard / edge cases — returns unknownResult
// ═════════════════════════════════════════════════════════════════════════════

describe('guard cases', () => {
  test('null params returns unknown', () => {
    expectUnknown(analyzeArchitectureDrift(null));
  });

  test('undefined params returns unknown', () => {
    expectUnknown(analyzeArchitectureDrift(undefined));
  });

  test('empty snapshots array returns unknown', () => {
    expectUnknown(analyzeArchitectureDrift({ snapshots: [] }));
  });

  test('single valid snapshot returns unknown', () => {
    expectUnknown(analyzeArchitectureDrift({ snapshots: [datedSnap(OLD_DATE, 80)] }));
  });

  test('snapshots with NaN scores are filtered; <2 usable → unknown', () => {
    expectUnknown(analyzeArchitectureDrift({
      snapshots: [{ architectureHealthScore: NaN }, datedSnap(NEW_DATE, 70)],
    }));
  });

  test('snapshots missing architectureHealthScore are filtered; <2 usable → unknown', () => {
    expectUnknown(analyzeArchitectureDrift({
      snapshots: [{ confidenceLevel: 'high' }, datedSnap(NEW_DATE, 70)],
    }));
  });

  test('metricDeltas in unknownResult are all zero', () => {
    const r = analyzeArchitectureDrift({ snapshots: [] });
    for (const v of Object.values(r.metricDeltas)) {
      expect(v).toBe(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Drift direction
// ═════════════════════════════════════════════════════════════════════════════

describe('driftDirection', () => {
  test('delta === +10 → improving', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(70, 80) });
    expect(r.driftDirection).toBe('improving');
  });

  test('delta > +10 → improving', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 85) });
    expect(r.driftDirection).toBe('improving');
  });

  test('delta === -10 → degrading', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(80, 70) });
    expect(r.driftDirection).toBe('degrading');
  });

  test('delta < -10 → degrading', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(90, 60) });
    expect(r.driftDirection).toBe('degrading');
  });

  test('delta === 0 → stable', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(75, 75) });
    expect(r.driftDirection).toBe('stable');
  });

  test('delta === +9 → stable', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(70, 79) });
    expect(r.driftDirection).toBe('stable');
  });

  test('delta === -9 → stable', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(79, 70) });
    expect(r.driftDirection).toBe('stable');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Drift severity
// ═════════════════════════════════════════════════════════════════════════════

describe('driftSeverity', () => {
  test('|delta| > 30 → high', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(100, 65) });
    expect(r.driftSeverity).toBe('high');
  });

  test('|delta| === 30 exactly → high', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(100, 70) });
    expect(r.driftSeverity).toBe('high');
  });

  test('|delta| === 15 → medium', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(85, 70) });
    expect(r.driftSeverity).toBe('medium');
  });

  test('|delta| === 10 → low', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(80, 70) });
    expect(r.driftSeverity).toBe('low');
  });

  test('|delta| < 10 → none', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(75, 70) });
    expect(r.driftSeverity).toBe('none');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Delta and score fields
// ═════════════════════════════════════════════════════════════════════════════

describe('delta / latestScore / oldestScore', () => {
  test('delta = latestScore - oldestScore for improving case', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expect(r.delta).toBe(20);
    expect(r.latestScore).toBe(80);
    expect(r.oldestScore).toBe(60);
  });

  test('delta is negative for degrading case', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(90, 70) });
    expect(r.delta).toBe(-20);
    expect(r.latestScore).toBe(70);
    expect(r.oldestScore).toBe(90);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Snapshot sorting
// ═════════════════════════════════════════════════════════════════════════════

describe('sorting', () => {
  test('dated snapshots sorted ascending (oldest → latest) regardless of input order', () => {
    // Input newest-first; should sort to oldest-first
    const snaps = [
      datedSnap('2024-03-01T00:00:00Z', 90),
      datedSnap('2024-01-01T00:00:00Z', 60),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.oldestScore).toBe(60);
    expect(r.latestScore).toBe(90);
    expect(r.delta).toBe(30);
  });

  test('undated snapshots treated as newest-first → reversed to oldest-first', () => {
    // Input: [newest=90, oldest=60] → reversed → oldest=60 first
    const r = analyzeArchitectureDrift({ snapshots: [snap(90), snap(60)] });
    expect(r.oldestScore).toBe(60);
    expect(r.latestScore).toBe(90);
    expect(r.delta).toBe(30);
  });

  test('three dated snapshots — oldest and newest endpoints are correct', () => {
    const snaps = [
      datedSnap('2024-02-01T00:00:00Z', 70),
      datedSnap('2024-01-01T00:00:00Z', 50),
      datedSnap('2024-03-01T00:00:00Z', 85),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.oldestScore).toBe(50);
    expect(r.latestScore).toBe(85);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Confidence
// ═════════════════════════════════════════════════════════════════════════════

describe('confidenceLevel', () => {
  test('n < 3 → low regardless of latest confidence', () => {
    const r = analyzeArchitectureDrift({
      snapshots: pair(70, 80, { confidenceLevel: 'high' }, { confidenceLevel: 'high' }),
    });
    expect(r.confidenceLevel).toBe('low');
  });

  test('latest confidenceLevel = low → low even with n >= 5', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 50),
      datedSnap('2024-02-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 65),
      datedSnap('2024-04-01T00:00:00Z', 70),
      datedSnap('2024-05-01T00:00:00Z', 75, { confidenceLevel: 'low' }),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.confidenceLevel).toBe('low');
  });

  test('n >= 5 and latest confidence = high → high', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 50),
      datedSnap('2024-02-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 65),
      datedSnap('2024-04-01T00:00:00Z', 70),
      datedSnap('2024-05-01T00:00:00Z', 75, { confidenceLevel: 'high' }),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.confidenceLevel).toBe('high');
  });

  test('n >= 5 and latest confidence = medium → high', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 50),
      datedSnap('2024-02-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 65),
      datedSnap('2024-04-01T00:00:00Z', 70),
      datedSnap('2024-05-01T00:00:00Z', 75, { confidenceLevel: 'medium' }),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.confidenceLevel).toBe('high');
  });

  test('n === 3 and latest confidence = high → medium', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-05-01T00:00:00Z', 80, { confidenceLevel: 'high' }),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('n === 4 and latest confidence = medium → medium', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-02-01T00:00:00Z', 65),
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-04-01T00:00:00Z', 80, { confidenceLevel: 'medium' }),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Metric deltas
// ═════════════════════════════════════════════════════════════════════════════

describe('metricDeltas', () => {
  test('all ten metric keys are present in output', () => {
    const expected = [
      'totalFiles', 'totalEdges', 'backendRouteCount', 'frontendApiCallCount',
      'linkedEndpointCount', 'unresolvedFrontendCallCount', 'orphanedBackendRouteCount',
      'circularDependencyCount', 'boundaryViolationCount', 'implementationSignalCount',
    ];
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expected.forEach(k => expect(r.metricDeltas).toHaveProperty(k));
  });

  test('deltas reflect latest - oldest per metric', () => {
    const oldest = makeSnap({
      snapshotAt: OLD_DATE,
      architectureHealthScore: 60,
      metrics: { totalFiles: 50, totalEdges: 100, backendRouteCount: 10 },
    });
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 80,
      metrics: { totalFiles: 70, totalEdges: 130, backendRouteCount: 10 },
    });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.metricDeltas.totalFiles).toBe(20);
    expect(r.metricDeltas.totalEdges).toBe(30);
    expect(r.metricDeltas.backendRouteCount).toBe(0);
  });

  test('boundaryViolationCount delta falls back to violations array length', () => {
    const oldest = makeSnap({
      snapshotAt: OLD_DATE,
      architectureHealthScore: 70,
      violations: [{ type: 'cross_boundary' }],
    });
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 80,
      violations: [{ type: 'cross_boundary' }, { type: 'service_leak' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.metricDeltas.boundaryViolationCount).toBe(1);
  });

  test('implementationSignalCount delta falls back to signals array length', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70, implSignals: [] });
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 80,
      implSignals: [{ type: 'scaffold' }, { type: 'todo' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.metricDeltas.implementationSignalCount).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. Risk signal classification
// ═════════════════════════════════════════════════════════════════════════════

describe('risk signal classification', () => {
  const cleanOldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70 });

  test('new violation type appears in newRiskSignals', () => {
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      violations: [{ type: 'cross_boundary' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.newRiskSignals).toContain('cross_boundary');
    expect(r.resolvedRiskSignals).not.toContain('cross_boundary');
    expect(r.persistentRiskSignals).not.toContain('cross_boundary');
  });

  test('violation type present in both → persistentRiskSignals', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70, violations: [{ type: 'cross_boundary' }] });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60, violations: [{ type: 'cross_boundary' }] });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.persistentRiskSignals).toContain('cross_boundary');
    expect(r.newRiskSignals).not.toContain('cross_boundary');
    expect(r.resolvedRiskSignals).not.toContain('cross_boundary');
  });

  test('violation type in oldest but not latest → resolvedRiskSignals', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 60, violations: [{ type: 'service_leak' }] });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 80 });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.resolvedRiskSignals).toContain('service_leak');
    expect(r.newRiskSignals).not.toContain('service_leak');
    expect(r.persistentRiskSignals).not.toContain('service_leak');
  });

  test('unresolved frontend calls → synthetic signal "unresolved_frontend_api"', () => {
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      unresolvedFrontendCalls: ['/api/missing'],
    });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.newRiskSignals).toContain('unresolved_frontend_api');
  });

  test('method mismatches → synthetic signal "method_mismatch"', () => {
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      methodMismatches: [{ route: '/api/x', expected: 'GET', found: 'POST' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.newRiskSignals).toContain('method_mismatch');
  });

  test('circularDependencyCount > 0 → synthetic signal "circular_dependency"', () => {
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      metrics: { circularDependencyCount: 3 },
    });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.newRiskSignals).toContain('circular_dependency');
  });

  test('implementation signal types are collected', () => {
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      implSignals: [{ type: 'scaffold' }, { type: 'todo' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.newRiskSignals).toContain('scaffold');
    expect(r.newRiskSignals).toContain('todo');
  });

  test('no signals in either snapshot → all signal arrays empty', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(70, 80) });
    expect(r.newRiskSignals).toEqual([]);
    expect(r.resolvedRiskSignals).toEqual([]);
    expect(r.persistentRiskSignals).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Summary text
// ═════════════════════════════════════════════════════════════════════════════

describe('summary text', () => {
  test('improving → contains "improving"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expect(r.summary.toLowerCase()).toContain('improving');
  });

  test('degrading → contains "degradation" or "degrading"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(90, 60) });
    expect(r.summary.toLowerCase()).toMatch(/degrad/);
  });

  test('stable → contains "stable"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(70, 75) });
    expect(r.summary.toLowerCase()).toContain('stable');
  });

  test('summary includes both scores', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expect(r.summary).toContain('60');
    expect(r.summary).toContain('80');
  });

  test('summary includes snapshot count', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r.summary).toContain('3');
  });

  test('high-severity degradation summary includes "severe"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(100, 65) });
    expect(r.summary.toLowerCase()).toContain('severe');
  });

  test('medium-severity degradation summary includes "moderate"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(90, 74) });
    expect(r.summary.toLowerCase()).toContain('moderate');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Drivers
// ═════════════════════════════════════════════════════════════════════════════

describe('drivers', () => {
  test('improving direction → first driver mentions "improved"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expect(r.drivers[0]).toMatch(/improved/i);
  });

  test('degrading direction → first driver mentions "declined" or "regression"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(90, 70) });
    expect(r.drivers[0]).toMatch(/declined|regression/i);
  });

  test('stable direction → first driver mentions "stable"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(70, 75) });
    expect(r.drivers[0]).toMatch(/stable/i);
  });

  test('growing unresolved frontend calls appear in drivers', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70, metrics: { unresolvedFrontendCallCount: 0 } });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60, metrics: { unresolvedFrontendCallCount: 5 } });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.drivers.join(' ')).toMatch(/unresolved frontend/i);
  });

  test('growing boundary violations appear in drivers', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70 });
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 60,
      violations: [{ type: 'cross_boundary' }, { type: 'service_leak' }],
    });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.drivers.join(' ')).toMatch(/boundary violation/i);
  });

  test('resolved signals mentioned in drivers', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 60, violations: [{ type: 'cross_boundary' }] });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 80 });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.drivers.join(' ')).toMatch(/resolved/i);
  });

  test('new signals mentioned in drivers', () => {
    const cleanOldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70 });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60, violations: [{ type: 'service_leak' }] });
    const r = analyzeArchitectureDrift({ snapshots: [cleanOldest, latest] });
    expect(r.drivers.join(' ')).toMatch(/new risk signal/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Recommendations
// ═════════════════════════════════════════════════════════════════════════════

describe('recommendations', () => {
  test('at most 5 recommendations returned', () => {
    const oldest = makeSnap({
      snapshotAt: OLD_DATE,
      architectureHealthScore: 90,
      violations: [{ type: 'cross_boundary' }],
      metrics: { unresolvedFrontendCallCount: 3, circularDependencyCount: 2, implementationSignalCount: 4, totalEdges: 10 },
    });
    const latest = makeSnap({
      snapshotAt: NEW_DATE,
      architectureHealthScore: 55,
      violations: [{ type: 'cross_boundary' }, { type: 'service_leak' }],
      metrics: { unresolvedFrontendCallCount: 6, circularDependencyCount: 5, implementationSignalCount: 9, totalEdges: 20 },
    });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('improving without issues → includes "Maintain current"', () => {
    const r = analyzeArchitectureDrift({ snapshots: pair(60, 80) });
    expect(r.recommendations.join(' ')).toMatch(/maintain current/i);
  });

  test('degrading with growing unresolved frontend calls → recommendation about API drift', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 80, metrics: { unresolvedFrontendCallCount: 0 } });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60, metrics: { unresolvedFrontendCallCount: 4 } });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.recommendations.join(' ')).toMatch(/unresolved|API/i);
  });

  test('degrading with growing circular dependencies → recommendation about breaking them', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 80 });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60, metrics: { circularDependencyCount: 3 } });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.recommendations.join(' ')).toMatch(/circular/i);
  });

  test('improving with persistent signals → recommendation to monitor persistent signals', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 60, violations: [{ type: 'cross_boundary' }] });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 80, violations: [{ type: 'cross_boundary' }] });
    const r = analyzeArchitectureDrift({ snapshots: [oldest, latest] });
    expect(r.recommendations.join(' ')).toMatch(/persistent|monitor/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Determinism and non-mutation
// ═════════════════════════════════════════════════════════════════════════════

describe('determinism and non-mutation', () => {
  test('calling twice with same input yields identical output', () => {
    const snaps = pair(60, 80);
    const r1 = analyzeArchitectureDrift({ snapshots: snaps });
    const r2 = analyzeArchitectureDrift({ snapshots: snaps });
    expect(r1).toEqual(r2);
  });

  test('input snapshot array is not mutated', () => {
    const s1 = datedSnap('2024-03-01T00:00:00Z', 90);
    const s2 = datedSnap('2024-01-01T00:00:00Z', 60);
    const original = [s1, s2];
    analyzeArchitectureDrift({ snapshots: original });
    expect(original[0]).toBe(s1);
    expect(original[1]).toBe(s2);
  });

  test('input snapshot objects are not mutated', () => {
    const s1 = datedSnap(OLD_DATE, 60);
    const s2 = datedSnap(NEW_DATE, 80);
    const before1 = JSON.stringify(s1);
    const before2 = JSON.stringify(s2);
    analyzeArchitectureDrift({ snapshots: [s1, s2] });
    expect(JSON.stringify(s1)).toBe(before1);
    expect(JSON.stringify(s2)).toBe(before2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. Missing / null field safety
// ═════════════════════════════════════════════════════════════════════════════

describe('missing field safety', () => {
  test('snapshot without metrics field does not throw', () => {
    const oldest = { snapshotAt: OLD_DATE, architectureHealthScore: 70 };
    const latest = { snapshotAt: NEW_DATE, architectureHealthScore: 80 };
    expect(() => analyzeArchitectureDrift({ snapshots: [oldest, latest] })).not.toThrow();
  });

  test('snapshot without boundaryVerification does not throw', () => {
    const oldest = { snapshotAt: OLD_DATE, architectureHealthScore: 70, metrics: {} };
    const latest = { snapshotAt: NEW_DATE, architectureHealthScore: 80, metrics: {} };
    expect(() => analyzeArchitectureDrift({ snapshots: [oldest, latest] })).not.toThrow();
  });

  test('snapshot without apiLinkage does not throw', () => {
    const oldest = { snapshotAt: OLD_DATE, architectureHealthScore: 70 };
    const latest = { snapshotAt: NEW_DATE, architectureHealthScore: 80 };
    expect(() => analyzeArchitectureDrift({ snapshots: [oldest, latest] })).not.toThrow();
  });

  test('null entries in snapshots array are filtered out', () => {
    const result = analyzeArchitectureDrift({
      snapshots: [null, datedSnap(OLD_DATE, 70), undefined, datedSnap(NEW_DATE, 80)],
    });
    expect(result.driftDirection).toBe('improving');
  });

  test('violations array with null entry does not throw', () => {
    const oldest = makeSnap({ snapshotAt: OLD_DATE, architectureHealthScore: 70 });
    const latest = makeSnap({ snapshotAt: NEW_DATE, architectureHealthScore: 60 });
    latest.boundaryVerification.violations = [null, { type: 'cross_boundary' }];
    expect(() => analyzeArchitectureDrift({ snapshots: [oldest, latest] })).not.toThrow();
  });
});
