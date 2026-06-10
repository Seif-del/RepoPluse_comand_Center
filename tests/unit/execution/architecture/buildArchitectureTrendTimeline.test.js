'use strict';

const { buildArchitectureTrendTimeline } = require('../../../../execution/architecture/buildArchitectureTrendTimeline');

// ── Snapshot factory ───────────────────────────────────────────────────────────

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
  completenessScore       = 80,
  completenessLevel       = 'adequate',
  placeholderCount        = 0,
  scaffoldLikeFileCount   = 0,
} = {}) {
  return {
    snapshotAt,
    architectureHealthScore,
    architectureHealthLevel,
    confidenceLevel,
    metrics: {
      totalFiles:                    10,
      totalEdges:                    20,
      backendRouteCount:             5,
      frontendApiCallCount:          4,
      linkedEndpointCount:           4,
      unresolvedFrontendCallCount:   unresolvedFrontendCalls.length,
      orphanedBackendRouteCount:     0,
      circularDependencyCount:       0,
      boundaryViolationCount:        violations.length,
      implementationSignalCount:     implSignals.length,
      ...metrics,
    },
    boundaryVerification:       { violations },
    apiLinkage:                 { unresolvedFrontendCalls, methodMismatches },
    implementationCompleteness: {
      completenessScore,
      completenessLevel,
      signals:              implSignals,
      placeholderAssessment: { placeholderCount },
      scaffoldAssessment:    { scaffoldLikeFileCount },
    },
  };
}

function datedSnap(isoDate, score, opts = {}) {
  return makeSnap({ snapshotAt: isoDate, architectureHealthScore: score, ...opts });
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Empty / guard cases
// ═════════════════════════════════════════════════════════════════════════════

describe('empty / guard cases', () => {
  function expectEmpty(result) {
    expect(result.timeline).toEqual([]);
    expect(result.scoreTimeline).toEqual([]);
    expect(result.levelTransitions).toEqual([]);
    expect(result.riskSignalTimeline).toEqual([]);
    expect(result.couplingTimeline).toEqual([]);
    expect(result.apiIntegrationTimeline).toEqual([]);
    expect(result.implementationTimeline).toEqual([]);
    expect(result.driftEvents).toEqual([]);
    expect(result.recommendations).toEqual([]);
  }

  test('null params returns empty timelines', () => {
    expectEmpty(buildArchitectureTrendTimeline(null));
  });

  test('undefined params returns empty timelines', () => {
    expectEmpty(buildArchitectureTrendTimeline(undefined));
  });

  test('empty snapshots array returns empty timelines', () => {
    expectEmpty(buildArchitectureTrendTimeline({ snapshots: [] }));
  });

  test('snapshots with NaN scores filtered out → empty', () => {
    expectEmpty(buildArchitectureTrendTimeline({
      snapshots: [{ architectureHealthScore: NaN }, { architectureHealthScore: undefined }],
    }));
  });

  test('summary indicates no snapshots available', () => {
    const r = buildArchitectureTrendTimeline({ snapshots: [] });
    expect(r.summary).toMatch(/no architecture snapshots/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Single snapshot
// ═════════════════════════════════════════════════════════════════════════════

describe('single snapshot', () => {
  const snap = makeSnap({ architectureHealthScore: 75, architectureHealthLevel: 'healthy' });
  let r;
  beforeAll(function() { r = buildArchitectureTrendTimeline({ snapshots: [snap] }); });

  test('timeline has one entry', () => {
    expect(r.timeline).toHaveLength(1);
    expect(r.timeline[0].score).toBe(75);
  });

  test('scoreTimeline deltaFromPrevious = 0 and deltaFromFirst = 0', () => {
    expect(r.scoreTimeline[0].deltaFromPrevious).toBe(0);
    expect(r.scoreTimeline[0].deltaFromFirst).toBe(0);
  });

  test('levelTransitions first entry has from: null, direction: unchanged', () => {
    expect(r.levelTransitions[0].from).toBeNull();
    expect(r.levelTransitions[0].direction).toBe('unchanged');
    expect(r.levelTransitions[0].to).toBe('healthy');
  });

  test('riskSignalTimeline newRisks = risks, resolvedRisks = [], persistentRisks = []', () => {
    const entry = r.riskSignalTimeline[0];
    expect(entry.resolvedRisks).toEqual([]);
    expect(entry.persistentRisks).toEqual([]);
    expect(entry.newRisks).toEqual(entry.risks);
  });

  test('no drift events for a single snapshot', () => {
    expect(r.driftEvents).toEqual([]);
  });

  test('summary indicates insufficient history', () => {
    expect(r.summary).toMatch(/insufficient history/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. Sorting behaviour
// ═════════════════════════════════════════════════════════════════════════════

describe('sorting behaviour', () => {
  test('oldest-first dated input preserved in output', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.timeline[0].score).toBe(60);
    expect(r.timeline[1].score).toBe(80);
  });

  test('newest-first dated input sorted to oldest-first in output', () => {
    const snaps = [
      datedSnap('2024-06-01T00:00:00Z', 80),
      datedSnap('2024-01-01T00:00:00Z', 60),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.timeline[0].score).toBe(60);
    expect(r.timeline[1].score).toBe(80);
  });

  test('three dated snapshots out-of-order sorted ascending in output', () => {
    const snaps = [
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-01-01T00:00:00Z', 50),
      datedSnap('2024-06-01T00:00:00Z', 85),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.timeline[0].score).toBe(50);
    expect(r.timeline[1].score).toBe(70);
    expect(r.timeline[2].score).toBe(85);
  });

  test('no dates preserves input order as oldest-first', () => {
    const snaps = [
      makeSnap({ architectureHealthScore: 60 }),   // assumed oldest
      makeSnap({ architectureHealthScore: 70 }),
      makeSnap({ architectureHealthScore: 80 }),   // assumed latest
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.timeline[0].score).toBe(60);
    expect(r.timeline[2].score).toBe(80);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. scoreTimeline
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreTimeline', () => {
  const snaps = [
    datedSnap('2024-01-01T00:00:00Z', 60),
    datedSnap('2024-03-01T00:00:00Z', 75),
    datedSnap('2024-06-01T00:00:00Z', 70),
  ];
  let r;
  beforeAll(function() { r = buildArchitectureTrendTimeline({ snapshots: snaps }); });

  test('first entry: deltaFromPrevious = 0, deltaFromFirst = 0', () => {
    expect(r.scoreTimeline[0].deltaFromPrevious).toBe(0);
    expect(r.scoreTimeline[0].deltaFromFirst).toBe(0);
    expect(r.scoreTimeline[0].score).toBe(60);
  });

  test('second entry: deltaFromPrevious relative to first', () => {
    expect(r.scoreTimeline[1].deltaFromPrevious).toBe(15);
    expect(r.scoreTimeline[1].deltaFromFirst).toBe(15);
  });

  test('third entry: deltaFromPrevious relative to second, deltaFromFirst relative to first', () => {
    expect(r.scoreTimeline[2].deltaFromPrevious).toBe(-5);
    expect(r.scoreTimeline[2].deltaFromFirst).toBe(10);
  });

  test('snapshotAt propagated', () => {
    expect(r.scoreTimeline[0].snapshotAt).toBe('2024-01-01T00:00:00Z');
    expect(r.scoreTimeline[2].snapshotAt).toBe('2024-06-01T00:00:00Z');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. levelTransitions
// ═════════════════════════════════════════════════════════════════════════════

describe('levelTransitions', () => {
  test('direction: improved when level rank increases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 65, { architectureHealthLevel: 'watch' }),
      datedSnap('2024-06-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.levelTransitions[1].direction).toBe('improved');
    expect(r.levelTransitions[1].from).toBe('watch');
    expect(r.levelTransitions[1].to).toBe('healthy');
  });

  test('direction: degraded when level rank decreases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 65, { architectureHealthLevel: 'watch' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.levelTransitions[1].direction).toBe('degraded');
  });

  test('direction: unchanged when level stays the same', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 82, { architectureHealthLevel: 'healthy' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.levelTransitions[1].direction).toBe('unchanged');
  });

  test('all snapshots appear in levelTransitions', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.levelTransitions).toHaveLength(3);
    expect(r.levelTransitions[0].from).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. riskSignalTimeline
// ═════════════════════════════════════════════════════════════════════════════

describe('riskSignalTimeline', () => {
  test('first snapshot: all risks are newRisks', () => {
    const snap = makeSnap({
      architectureHealthScore: 70,
      violations: [{ type: 'cross_boundary' }],
    });
    const r = buildArchitectureTrendTimeline({ snapshots: [snap] });
    expect(r.riskSignalTimeline[0].newRisks).toContain('cross_boundary');
    expect(r.riskSignalTimeline[0].resolvedRisks).toEqual([]);
    expect(r.riskSignalTimeline[0].persistentRisks).toEqual([]);
  });

  test('new risk in second snapshot appears in newRisks', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 65, { violations: [{ type: 'cross_boundary' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.riskSignalTimeline[1].newRisks).toContain('cross_boundary');
    expect(r.riskSignalTimeline[1].resolvedRisks).toEqual([]);
  });

  test('risk resolved in second snapshot appears in resolvedRisks', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 65, { violations: [{ type: 'service_leak' }] }),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.riskSignalTimeline[1].resolvedRisks).toContain('service_leak');
    expect(r.riskSignalTimeline[1].newRisks).toEqual([]);
  });

  test('risk present in both snapshots is persistent', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 65, { violations: [{ type: 'cross_boundary' }] }),
      datedSnap('2024-06-01T00:00:00Z', 68, { violations: [{ type: 'cross_boundary' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.riskSignalTimeline[1].persistentRisks).toContain('cross_boundary');
    expect(r.riskSignalTimeline[1].newRisks).toEqual([]);
    expect(r.riskSignalTimeline[1].resolvedRisks).toEqual([]);
  });

  test('unresolved frontend calls appear as risk signal', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 65, { unresolvedFrontendCalls: ['/api/missing'] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.riskSignalTimeline[1].newRisks).toContain('unresolved_frontend_api');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. couplingTimeline
// ═════════════════════════════════════════════════════════════════════════════

describe('couplingTimeline', () => {
  test('couplingPressure: low when edges < 50, no circulars, no violations', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { totalEdges: 20, circularDependencyCount: 0, boundaryViolationCount: 0 } })],
    });
    expect(r.couplingTimeline[0].couplingPressure).toBe('low');
  });

  test('couplingPressure: medium when edges >= 50', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { totalEdges: 50, circularDependencyCount: 0, boundaryViolationCount: 0 } })],
    });
    expect(r.couplingTimeline[0].couplingPressure).toBe('medium');
  });

  test('couplingPressure: medium when boundaryViolationCount > 0', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ violations: [{ type: 'cross_boundary' }], metrics: { totalEdges: 10 } })],
    });
    expect(r.couplingTimeline[0].couplingPressure).toBe('medium');
  });

  test('couplingPressure: high when circularDependencyCount > 0', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { totalEdges: 10, circularDependencyCount: 1, boundaryViolationCount: 0 } })],
    });
    expect(r.couplingTimeline[0].couplingPressure).toBe('high');
  });

  test('couplingPressure: high when totalEdges >= 100', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { totalEdges: 100, circularDependencyCount: 0, boundaryViolationCount: 0 } })],
    });
    expect(r.couplingTimeline[0].couplingPressure).toBe('high');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. apiIntegrationTimeline
// ═════════════════════════════════════════════════════════════════════════════

describe('apiIntegrationTimeline', () => {
  test('frontendCoveragePercent: 100 when all calls are linked', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { frontendApiCallCount: 4, linkedEndpointCount: 4 } })],
    });
    expect(r.apiIntegrationTimeline[0].frontendCoveragePercent).toBe(100);
  });

  test('frontendCoveragePercent: 50 when half are linked', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { frontendApiCallCount: 4, linkedEndpointCount: 2 } })],
    });
    expect(r.apiIntegrationTimeline[0].frontendCoveragePercent).toBe(50);
  });

  test('frontendCoveragePercent: 0 when frontendApiCallCount = 0', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { frontendApiCallCount: 0, linkedEndpointCount: 0 } })],
    });
    expect(r.apiIntegrationTimeline[0].frontendCoveragePercent).toBe(0);
  });

  test('backendCoveragePercent calculated from linkedEndpointCount / backendRouteCount', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ metrics: { backendRouteCount: 10, linkedEndpointCount: 5 } })],
    });
    expect(r.apiIntegrationTimeline[0].backendCoveragePercent).toBe(50);
  });

  test('methodMismatchCount from apiLinkage.methodMismatches', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ methodMismatches: [{ route: '/a' }, { route: '/b' }] })],
    });
    expect(r.apiIntegrationTimeline[0].methodMismatchCount).toBe(2);
  });

  test('unresolvedFrontendCallCount from metrics', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ unresolvedFrontendCalls: ['/api/x', '/api/y'] })],
    });
    expect(r.apiIntegrationTimeline[0].unresolvedFrontendCallCount).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. implementationTimeline
// ═════════════════════════════════════════════════════════════════════════════

describe('implementationTimeline', () => {
  test('completenessScore from implementationCompleteness.completenessScore', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ completenessScore: 85 })],
    });
    expect(r.implementationTimeline[0].completenessScore).toBe(85);
  });

  test('completenessLevel from implementationCompleteness.completenessLevel', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ completenessLevel: 'strong' })],
    });
    expect(r.implementationTimeline[0].completenessLevel).toBe('strong');
  });

  test('implementationSignalCount from metrics', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ implSignals: [{ type: 'scaffold_like_file' }, { type: 'placeholder_code_hint' }] })],
    });
    expect(r.implementationTimeline[0].implementationSignalCount).toBe(2);
  });

  test('placeholderCount from placeholderAssessment', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ placeholderCount: 3 })],
    });
    expect(r.implementationTimeline[0].placeholderCount).toBe(3);
  });

  test('scaffoldLikeFileCount from scaffoldAssessment', () => {
    const r = buildArchitectureTrendTimeline({
      snapshots: [makeSnap({ scaffoldLikeFileCount: 2 })],
    });
    expect(r.implementationTimeline[0].scaffoldLikeFileCount).toBe(2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Drift events — score_drop and score_gain
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — score_drop / score_gain', () => {
  test('score_drop emitted when delta <= -10', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90),
      datedSnap('2024-06-01T00:00:00Z', 75),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev).toBeDefined();
  });

  test('score_drop NOT emitted when delta = -9', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 79),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'score_drop'; })).toBeUndefined();
  });

  test('score_drop severity: high when delta <= -30', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 100),
      datedSnap('2024-06-01T00:00:00Z', 65),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.severity).toBe('high');
  });

  test('score_drop severity: medium when -30 < delta <= -15', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90),
      datedSnap('2024-06-01T00:00:00Z', 74),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.severity).toBe('medium');
  });

  test('score_drop severity: low when -15 < delta <= -10', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.severity).toBe('low');
  });

  test('score_gain emitted when delta >= +10', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-06-01T00:00:00Z', 75),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_gain'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('low');
  });

  test('score_gain NOT emitted when delta = +9', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 79),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'score_gain'; })).toBeUndefined();
  });

  test('no drift events from first snapshot comparison', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    r.driftEvents.forEach(function(ev) {
      expect(ev.snapshotAt).toBe('2024-06-01T00:00:00Z');
    });
  });

  test('score_drop event contains prevScore and currScore', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.prevScore).toBe(90);
    expect(ev.currScore).toBe(70);
  });

  test('score_drop event contains deltaBoundary, deltaCompleteness, deltaLinkage', () => {
    const prev = {
      snapshotAt: '2024-01-01T00:00:00Z',
      architectureHealthScore: 90,
      boundaryVerification:        { boundaryHealthScore: 80, violations: [] },
      implementationCompleteness:  { completenessScore: 75 },
      apiLinkage:                  { linkageScore: 70 },
      metrics: {},
    };
    const curr = {
      snapshotAt: '2024-06-01T00:00:00Z',
      architectureHealthScore: 70,
      boundaryVerification:        { boundaryHealthScore: 60, violations: [] },
      implementationCompleteness:  { completenessScore: 65 },
      apiLinkage:                  { linkageScore: 65 },
      metrics: {},
    };
    const r = buildArchitectureTrendTimeline({ snapshots: [prev, curr] });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.deltaBoundary).toBe(-20);
    expect(ev.deltaCompleteness).toBe(-10);
    expect(ev.deltaLinkage).toBe(-5);
  });

  test('score_drop component deltas default to 0 when sub-objects absent', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'score_drop'; });
    expect(ev.deltaBoundary).toBe(0);
    expect(ev.deltaCompleteness).toBe(0);
    expect(ev.deltaLinkage).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10b. Version boundary — scoreTimeline.versionBoundary and version_change events
// ═════════════════════════════════════════════════════════════════════════════

describe('version boundary — scoreTimeline and drift events', () => {
  // makeSnap destructuring drops extra keys — build versioned snaps directly
  function vSnap(isoDate, score, analyzerVersion, scoringVersion) {
    return {
      snapshotAt:             isoDate,
      architectureHealthScore: score,
      architectureHealthLevel: score >= 85 ? 'healthy' : score >= 70 ? 'watch' : score >= 45 ? 'weak' : 'risky',
      analyzerVersion,
      scoringVersion,
      metrics: {},
    };
  }

  test('scoreTimeline[0].versionBoundary is always false', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 75, '1.0', '1.0')];
    expect(buildArchitectureTrendTimeline({ snapshots: snaps }).scoreTimeline[0].versionBoundary).toBe(false);
  });

  test('scoreTimeline[i].versionBoundary is false when versions match', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 75, '1.0', '1.0')];
    expect(buildArchitectureTrendTimeline({ snapshots: snaps }).scoreTimeline[1].versionBoundary).toBe(false);
  });

  test('scoreTimeline[i].versionBoundary is true when analyzerVersion differs', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 75, '2.0', '1.0')];
    expect(buildArchitectureTrendTimeline({ snapshots: snaps }).scoreTimeline[1].versionBoundary).toBe(true);
  });

  test('scoreTimeline[i].versionBoundary is true when scoringVersion differs', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 75, '1.0', '2.0')];
    expect(buildArchitectureTrendTimeline({ snapshots: snaps }).scoreTimeline[1].versionBoundary).toBe(true);
  });

  test('scoreTimeline[i].versionBoundary is true on legacy → versioned transition', () => {
    const snaps = [
      { snapshotAt: '2024-01-01T00:00:00Z', architectureHealthScore: 80, metrics: {} },  // no version → legacy
      vSnap('2024-06-01T00:00:00Z', 60, '1.0', '1.0'),
    ];
    expect(buildArchitectureTrendTimeline({ snapshots: snaps }).scoreTimeline[1].versionBoundary).toBe(true);
  });

  test('version_change drift event emitted at version boundary', () => {
    const snaps = [
      { snapshotAt: '2024-01-01T00:00:00Z', architectureHealthScore: 80, metrics: {} },
      vSnap('2024-06-01T00:00:00Z', 60, '1.0', '1.0'),
    ];
    const r  = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'version_change'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('low');
    expect(ev.prevAnalyzerVersion).toBe('legacy');
    expect(ev.currAnalyzerVersion).toBe('1.0');
    expect(ev.prevScoringVersion).toBe('legacy');
    expect(ev.currScoringVersion).toBe('1.0');
  });

  test('score_drop NOT emitted when delta <= -10 but version boundary present', () => {
    const snaps = [
      { snapshotAt: '2024-01-01T00:00:00Z', architectureHealthScore: 80, metrics: {} },  // legacy
      vSnap('2024-06-01T00:00:00Z', 60, '1.0', '1.0'),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'score_drop'; })).toBeUndefined();
  });

  test('score_drop IS emitted when delta <= -10 and versions match', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 60, '1.0', '1.0')];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'score_drop'; })).toBeDefined();
  });

  test('version_change NOT emitted when versions are same', () => {
    const snaps = [vSnap('2024-01-01T00:00:00Z', 80, '1.0', '1.0'), vSnap('2024-06-01T00:00:00Z', 70, '1.0', '1.0')];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'version_change'; })).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Drift events — level_degraded / level_improved
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — level_degraded / level_improved', () => {
  test('level_degraded emitted when level rank decreases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 68, { architectureHealthLevel: 'watch' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'level_degraded'; });
    expect(ev).toBeDefined();
  });

  test('level_degraded severity: medium for 1-rank drop (healthy → watch)', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 68, { architectureHealthLevel: 'watch' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'level_degraded'; });
    expect(ev.severity).toBe('medium');
  });

  test('level_degraded severity: high for 2+-rank drop (healthy → weak)', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 40, { architectureHealthLevel: 'weak' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'level_degraded'; });
    expect(ev.severity).toBe('high');
  });

  test('level_degraded severity: high for 3+-rank drop (healthy → risky)', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 30, { architectureHealthLevel: 'risky' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'level_degraded'; });
    expect(ev.severity).toBe('high');
  });

  test('level_improved emitted when level rank increases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 68, { architectureHealthLevel: 'watch' }),
      datedSnap('2024-06-01T00:00:00Z', 85, { architectureHealthLevel: 'healthy' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'level_improved'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('low');
  });

  test('no level event when level unchanged', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80, { architectureHealthLevel: 'healthy' }),
      datedSnap('2024-06-01T00:00:00Z', 82, { architectureHealthLevel: 'healthy' }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const levelEvents = r.driftEvents.filter(function(e) {
      return e.type === 'level_degraded' || e.type === 'level_improved';
    });
    expect(levelEvents).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Drift events — new_risk / resolved_risk
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — new_risk / resolved_risk', () => {
  test('new_risk emitted for each newly appeared risk signal', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 65, { violations: [{ type: 'cross_boundary' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) {
      return e.type === 'new_risk' && e.summary && e.summary.includes('cross_boundary');
    });
    expect(ev).toBeDefined();
  });

  test('new_risk severity: high for boundary violation type', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 65, { violations: [{ type: 'service_leak' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) {
      return e.type === 'new_risk' && e.summary && e.summary.includes('service_leak');
    });
    expect(ev.severity).toBe('high');
  });

  test('new_risk severity: high for circular_dependency', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 65, { metrics: { circularDependencyCount: 2 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) {
      return e.type === 'new_risk' && e.summary && e.summary.includes('circular_dependency');
    });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('high');
  });

  test('new_risk severity: medium for non-boundary signal (e.g. scaffold_like_file)', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 68, { implSignals: [{ type: 'scaffold_like_file' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) {
      return e.type === 'new_risk' && e.summary && e.summary.includes('scaffold_like_file');
    });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
  });

  test('resolved_risk emitted for each disappeared risk signal', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 65, { violations: [{ type: 'cross_boundary' }] }),
      datedSnap('2024-06-01T00:00:00Z', 75),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'resolved_risk'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('low');
    expect(ev.summary).toContain('cross_boundary');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. Drift events — coupling_growth
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — coupling_growth', () => {
  test('coupling_growth emitted when totalEdges grows by >= 25', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { totalEdges: 10 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { totalEdges: 35 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'coupling_growth'; });
    expect(ev).toBeDefined();
  });

  test('coupling_growth NOT emitted when edge growth < 25', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { totalEdges: 10 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { totalEdges: 34 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'coupling_growth'; })).toBeUndefined();
  });

  test('coupling_growth emitted when circularDependencyCount increases (even with small edge growth)', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { totalEdges: 10, circularDependencyCount: 0 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { totalEdges: 12, circularDependencyCount: 1 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'coupling_growth'; });
    expect(ev).toBeDefined();
  });

  test('coupling_growth severity: high when circularDependencyCount increased', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { circularDependencyCount: 0 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { circularDependencyCount: 1 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'coupling_growth'; });
    expect(ev.severity).toBe('high');
  });

  test('coupling_growth severity: medium when only edge growth >= 25', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { totalEdges: 10, circularDependencyCount: 0 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { totalEdges: 40, circularDependencyCount: 0 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'coupling_growth'; });
    expect(ev.severity).toBe('medium');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. Drift events — api_regression
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — api_regression', () => {
  test('api_regression emitted when unresolvedFrontendCallCount increases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { unresolvedFrontendCallCount: 2 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { unresolvedFrontendCallCount: 5 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'api_regression'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
  });

  test('api_regression emitted when methodMismatchCount increases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { methodMismatches: [] }),
      datedSnap('2024-06-01T00:00:00Z', 68, { methodMismatches: [{ route: '/a' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'api_regression'; });
    expect(ev).toBeDefined();
  });

  test('api_regression NOT emitted when counts decrease or stay same', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { unresolvedFrontendCallCount: 3 } }),
      datedSnap('2024-06-01T00:00:00Z', 72, { metrics: { unresolvedFrontendCallCount: 2 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'api_regression'; })).toBeUndefined();
  });

  test('api_regression event contains prevUnresolved, currUnresolved, unresolvedDelta', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { unresolvedFrontendCallCount: 2 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { unresolvedFrontendCallCount: 5 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'api_regression'; });
    expect(ev.prevUnresolved).toBe(2);
    expect(ev.currUnresolved).toBe(5);
    expect(ev.unresolvedDelta).toBe(3);
  });

  test('api_regression event contains prevMismatch, currMismatch, mismatchDelta', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { methodMismatches: [] }),
      datedSnap('2024-06-01T00:00:00Z', 68, { methodMismatches: [{ route: '/a' }, { route: '/b' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'api_regression'; });
    expect(ev.prevMismatch).toBe(0);
    expect(ev.currMismatch).toBe(2);
    expect(ev.mismatchDelta).toBe(2);
  });

  test('api_regression mismatchDelta is 0 when only unresolved changed', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { unresolvedFrontendCallCount: 1 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { unresolvedFrontendCallCount: 3 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'api_regression'; });
    expect(ev.mismatchDelta).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. Drift events — implementation_regression
// ═════════════════════════════════════════════════════════════════════════════

describe('drift events — implementation_regression', () => {
  test('implementation_regression emitted when implementationSignalCount increases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { implSignals: [] }),
      datedSnap('2024-06-01T00:00:00Z', 68, { implSignals: [{ type: 'scaffold_like_file' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    const ev = r.driftEvents.find(function(e) { return e.type === 'implementation_regression'; });
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
  });

  test('implementation_regression NOT emitted when signal count stays same or decreases', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { implSignals: [{ type: 'scaffold_like_file' }] }),
      datedSnap('2024-06-01T00:00:00Z', 72, { implSignals: [] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.driftEvents.find(function(e) { return e.type === 'implementation_regression'; })).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. Recommendations
// ═════════════════════════════════════════════════════════════════════════════

describe('recommendations', () => {
  test('at most 5 recommendations', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 100, {
        architectureHealthLevel: 'healthy',
        metrics: { totalEdges: 10, circularDependencyCount: 0 },
      }),
      datedSnap('2024-06-01T00:00:00Z', 50, {
        architectureHealthLevel: 'risky',
        violations: [{ type: 'cross_boundary' }],
        metrics: { totalEdges: 50, circularDependencyCount: 3, unresolvedFrontendCallCount: 5 },
        implSignals: [{ type: 'scaffold_like_file' }],
      }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('no degradation → monitoring/stable recommendation', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 80),
      datedSnap('2024-06-01T00:00:00Z', 82),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.recommendations.join(' ')).toMatch(/stable|maintain|monitor/i);
  });

  test('api regression → recommendation about API routes', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { unresolvedFrontendCallCount: 0 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { unresolvedFrontendCallCount: 4 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.recommendations.join(' ')).toMatch(/api|route/i);
  });

  test('implementation regression → recommendation about placeholders/scaffolds', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { implSignals: [] }),
      datedSnap('2024-06-01T00:00:00Z', 68, { implSignals: [{ type: 'scaffold_like_file' }] }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.recommendations.join(' ')).toMatch(/placeholder|scaffold|implementation/i);
  });

  test('high-severity coupling growth → recommendation about circular dependencies', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 70, { metrics: { circularDependencyCount: 0 } }),
      datedSnap('2024-06-01T00:00:00Z', 68, { metrics: { circularDependencyCount: 2 } }),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.recommendations.join(' ')).toMatch(/circular|coupling/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 17. Summary text
// ═════════════════════════════════════════════════════════════════════════════

describe('summary text', () => {
  test('improving trend → contains "improved"', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.summary.toLowerCase()).toContain('improved');
  });

  test('degrading trend → contains "degraded"', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 90),
      datedSnap('2024-06-01T00:00:00Z', 70),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.summary.toLowerCase()).toContain('degraded');
  });

  test('stable trend → contains "stable"', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 75),
      datedSnap('2024-06-01T00:00:00Z', 77),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.summary.toLowerCase()).toContain('stable');
  });

  test('summary includes snapshot count', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60),
      datedSnap('2024-03-01T00:00:00Z', 70),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r.summary).toContain('3');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 18. Determinism and non-mutation
// ═════════════════════════════════════════════════════════════════════════════

describe('determinism and non-mutation', () => {
  test('calling twice yields identical output', () => {
    const snaps = [
      datedSnap('2024-01-01T00:00:00Z', 60, { violations: [{ type: 'cross_boundary' }] }),
      datedSnap('2024-06-01T00:00:00Z', 80),
    ];
    const r1 = buildArchitectureTrendTimeline({ snapshots: snaps });
    const r2 = buildArchitectureTrendTimeline({ snapshots: snaps });
    expect(r1).toEqual(r2);
  });

  test('input snapshots array is not mutated', () => {
    const s1 = datedSnap('2024-06-01T00:00:00Z', 80);  // newest first
    const s2 = datedSnap('2024-01-01T00:00:00Z', 60);
    const original = [s1, s2];
    buildArchitectureTrendTimeline({ snapshots: original });
    expect(original[0]).toBe(s1);
    expect(original[1]).toBe(s2);
  });

  test('input snapshot objects are not mutated', () => {
    const s1 = datedSnap('2024-01-01T00:00:00Z', 60);
    const s2 = datedSnap('2024-06-01T00:00:00Z', 80);
    const before1 = JSON.stringify(s1);
    const before2 = JSON.stringify(s2);
    buildArchitectureTrendTimeline({ snapshots: [s1, s2] });
    expect(JSON.stringify(s1)).toBe(before1);
    expect(JSON.stringify(s2)).toBe(before2);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 19. Missing field safety
// ═════════════════════════════════════════════════════════════════════════════

describe('missing field safety', () => {
  test('snapshot without metrics field does not throw', () => {
    const snap = { architectureHealthScore: 75 };
    expect(() => buildArchitectureTrendTimeline({ snapshots: [snap] })).not.toThrow();
  });

  test('snapshot without boundaryVerification does not throw', () => {
    const snap = { architectureHealthScore: 75, metrics: {} };
    expect(() => buildArchitectureTrendTimeline({ snapshots: [snap] })).not.toThrow();
  });

  test('snapshot without apiLinkage does not throw', () => {
    const snap = { architectureHealthScore: 75 };
    expect(() => buildArchitectureTrendTimeline({ snapshots: [snap] })).not.toThrow();
  });

  test('snapshot without implementationCompleteness does not throw', () => {
    const snap = { architectureHealthScore: 75 };
    expect(() => buildArchitectureTrendTimeline({ snapshots: [snap] })).not.toThrow();
  });

  test('violations array containing null entries does not throw', () => {
    const snap = makeSnap({ architectureHealthScore: 75 });
    snap.boundaryVerification.violations = [null, { type: 'cross_boundary' }];
    expect(() => buildArchitectureTrendTimeline({ snapshots: [snap] })).not.toThrow();
  });

  test('null entries in snapshots array are filtered out and do not throw', () => {
    const valid = datedSnap('2024-01-01T00:00:00Z', 70);
    const r = buildArchitectureTrendTimeline({ snapshots: [null, valid, undefined] });
    expect(r.timeline).toHaveLength(1);
    expect(r.timeline[0].score).toBe(70);
  });
});
