'use strict';

const { detectArchitectureRegressions } = require('../../../../execution/architecture/detectArchitectureRegressions');

// ── Snapshot factories ─────────────────────────────────────────────────────────

function makeSnap(opts) {
  opts = opts || {};
  const unresolvedCount  = opts.unresolvedFrontendCalls !== undefined ? opts.unresolvedFrontendCalls : 0;
  const mismatchCount    = opts.methodMismatches        !== undefined ? opts.methodMismatches        : 0;
  const implSignalCount  = opts.implSignals             !== undefined ? opts.implSignals             : 0;
  const violationTypes   = opts.violationTypes          || [];
  const circularDeps     = opts.circularDeps            !== undefined ? opts.circularDeps            : 0;
  const totalEdges       = opts.totalEdges              !== undefined ? opts.totalEdges              : 20;

  return {
    snapshotAt:              opts.snapshotAt || null,
    architectureHealthScore: opts.score      !== undefined ? opts.score : 75,
    architectureHealthLevel: opts.level      || 'healthy',
    confidenceLevel:         opts.confidence || 'high',
    metrics: {
      totalFiles:                   50,
      totalEdges,
      backendRouteCount:            10,
      frontendApiCallCount:         10,
      linkedEndpointCount:           8,
      unresolvedFrontendCallCount:  unresolvedCount,
      orphanedBackendRouteCount:     0,
      circularDependencyCount:      circularDeps,
      boundaryViolationCount:       violationTypes.length,
      implementationSignalCount:    implSignalCount,
    },
    boundaryVerification: {
      violations: violationTypes.map(function(t) { return { type: t }; }),
    },
    apiLinkage: {
      unresolvedFrontendCalls: new Array(unresolvedCount).fill({}),
      methodMismatches:        new Array(mismatchCount).fill({}),
    },
    implementationCompleteness: {
      signals:            new Array(implSignalCount).fill({ type: 'placeholder' }),
      completenessScore:  opts.completenessScore !== undefined ? opts.completenessScore : 80,
      completenessLevel:  'sufficient',
      placeholderAssessment: { placeholderCount: 0 },
      scaffoldAssessment:    { scaffoldLikeFileCount: 0 },
    },
  };
}

const D1 = '2024-01-01T00:00:00Z';
const D2 = '2024-02-01T00:00:00Z';
const D3 = '2024-03-01T00:00:00Z';
const D4 = '2024-04-01T00:00:00Z';
const D5 = '2024-05-01T00:00:00Z';

function ds(date, opts) { return makeSnap(Object.assign({}, opts, { snapshotAt: date })); }

// ── Minimal pre-built timelineData helper ──────────────────────────────────────

function minimalTimeline(timelineArr, driftEvents) {
  driftEvents = driftEvents || [];
  const scoreTimeline = timelineArr.map(function(e, i) {
    return {
      snapshotAt:        e.snapshotAt,
      score:             e.score,
      deltaFromPrevious: i === 0 ? 0 : e.score - timelineArr[i - 1].score,
      deltaFromFirst:    e.score - timelineArr[0].score,
    };
  });
  const firstLevel = timelineArr[0].level || 'healthy';
  return {
    timeline:               timelineArr.map(function(e) { return { snapshotAt: e.snapshotAt, score: e.score, level: e.level || 'healthy', confidenceLevel: 'high', metrics: {} }; }),
    scoreTimeline,
    levelTransitions:       timelineArr.map(function(e, i) { return { snapshotAt: e.snapshotAt, from: i === 0 ? null : timelineArr[i - 1].level || 'healthy', to: e.level || 'healthy', direction: 'unchanged' }; }),
    riskSignalTimeline:     timelineArr.map(function(e) { return { snapshotAt: e.snapshotAt, risks: [], newRisks: [], resolvedRisks: [], persistentRisks: [] }; }),
    couplingTimeline:       timelineArr.map(function(e) { return { snapshotAt: e.snapshotAt, totalEdges: e.totalEdges || 20, circularDependencyCount: 0, boundaryViolationCount: 0, couplingPressure: 'low' }; }),
    apiIntegrationTimeline: timelineArr.map(function(e) { return { snapshotAt: e.snapshotAt, frontendCoveragePercent: 80, backendCoveragePercent: 80, unresolvedFrontendCallCount: e.unresolvedCount || 0, methodMismatchCount: 0, orphanedBackendRouteCount: 0 }; }),
    implementationTimeline: timelineArr.map(function(e) { return { snapshotAt: e.snapshotAt, completenessScore: 80, completenessLevel: 'sufficient', implementationSignalCount: e.implSignals || 0, placeholderCount: 0, scaffoldLikeFileCount: 0 }; }),
    driftEvents,
    summary:                'test',
    recommendations:        [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('input validation', function() {
  test('null params returns unknown', function() {
    expect(detectArchitectureRegressions(null).regressionLevel).toBe('unknown');
  });

  test('undefined params returns unknown', function() {
    expect(detectArchitectureRegressions(undefined).regressionLevel).toBe('unknown');
  });

  test('empty object returns unknown', function() {
    expect(detectArchitectureRegressions({}).regressionLevel).toBe('unknown');
  });

  test('non-array snapshots returns unknown', function() {
    expect(detectArchitectureRegressions({ snapshots: 'bad' }).regressionLevel).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Insufficient data
// ─────────────────────────────────────────────────────────────────────────────

describe('insufficient data', function() {
  test('empty snapshots returns unknown', function() {
    const result = detectArchitectureRegressions({ snapshots: [] });
    expect(result.regressionLevel).toBe('unknown');
    expect(result.regressions).toEqual([]);
    expect(result.recommendations).toEqual([]);
  });

  test('single snapshot returns unknown', function() {
    const result = detectArchitectureRegressions({ snapshots: [makeSnap({ score: 80 })] });
    expect(result.regressionLevel).toBe('unknown');
    expect(result.confidenceLevel).toBe('low');
  });

  test('unknown result has all required pattern keys set to zero/false', function() {
    const result = detectArchitectureRegressions({ snapshots: [] });
    expect(result.patterns.scoreDropCount).toBe(0);
    expect(result.patterns.regressionStreak).toBe(0);
    expect(result.patterns.latestSnapshotRegressed).toBe(false);
  });

  test('unknown result has all affected areas false', function() {
    const result = detectArchitectureRegressions({ snapshots: [] });
    const areas = result.affectedAreas;
    expect(areas.architectureHealth).toBe(false);
    expect(areas.apiIntegration).toBe(false);
    expect(areas.coupling).toBe(false);
    expect(areas.implementationCompleteness).toBe(false);
    expect(areas.boundaryHealth).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pre-built timelineData
// ─────────────────────────────────────────────────────────────────────────────

describe('pre-built timelineData', function() {
  test('uses timelineData when provided, ignores snapshots', function() {
    // timelineData has only 1 timeline entry → unknown
    // snapshots would produce 5 healthy entries if used → none
    const td = minimalTimeline([{ snapshotAt: D1, score: 80 }]);
    const result = detectArchitectureRegressions({
      snapshots:    [ds(D1, { score: 80 }), ds(D2, { score: 85 }), ds(D3, { score: 90 }), ds(D4, { score: 90 }), ds(D5, { score: 90 })],
      timelineData: td,
    });
    expect(result.regressionLevel).toBe('unknown');
  });

  test('pre-built timelineData with 2 stable entries and no driftEvents → none', function() {
    const td = minimalTimeline([{ snapshotAt: D1, score: 80 }, { snapshotAt: D2, score: 85 }]);
    const result = detectArchitectureRegressions({ timelineData: td });
    expect(result.regressionLevel).toBe('none');
    expect(result.regressions).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Clean snapshots — no regressions
// ─────────────────────────────────────────────────────────────────────────────

describe('clean snapshots — no regressions', function() {
  test('stable scores produce regressionLevel none', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 78 }), ds(D3, { score: 80 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('none');
  });

  test('improving scores produce regressionLevel none', function() {
    const snaps = [ds(D1, { score: 60 }), ds(D2, { score: 75 }), ds(D3, { score: 90 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('none');
  });

  test('clean result has empty regressions array', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressions).toHaveLength(0);
  });

  test('clean result has regressionScore of 0', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(0);
  });

  test('clean result includes a maintenance recommendation', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs[0]).toMatch(/No regressions detected/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. score_regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('score_regression detection', function() {
  test('single score drop produces score_regression with severity low', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 })]; // delta=-10
    const result = detectArchitectureRegressions({ snapshots: snaps });
    const sr = result.regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr).toBeDefined();
    expect(sr.severity).toBe('low');
    expect(sr.count).toBe(1);
  });

  test('two score drops produce severity medium', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 }), ds(D3, { score: 55 })];
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.severity).toBe('medium');
    expect(sr.count).toBe(2);
  });

  test('three score drops produce severity high', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 }), ds(D3, { score: 60 }), ds(D4, { score: 50 })];
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.severity).toBe('high');
    expect(sr.count).toBe(3);
  });

  test('net delta ≤ -15 promotes single drop to medium', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 60 })]; // delta=-15
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.severity).toBe('medium');
  });

  test('net delta ≤ -30 promotes single drop to high', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 45 })]; // delta=-30
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.severity).toBe('high');
  });

  test('no score_regression when only score gains', function() {
    const snaps = [ds(D1, { score: 60 }), ds(D2, { score: 80 })];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('score_regression');
  });

  test('score_regression evidence contains structured drop objects', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 })];
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.evidence).toHaveLength(1);
    const ev = sr.evidence[0];
    expect(ev).toHaveProperty('snapshotAt');
    expect(ev).toHaveProperty('prevScore');
    expect(ev).toHaveProperty('currScore');
    expect(ev).toHaveProperty('deltaBoundary');
    expect(ev).toHaveProperty('deltaCompleteness');
    expect(ev).toHaveProperty('deltaLinkage');
  });

  test('score_regression evidence prevScore and currScore reflect the actual scores', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 68 })];
    const sr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'score_regression'; });
    expect(sr.evidence[0].prevScore).toBe(80);
    expect(sr.evidence[0].currScore).toBe(68);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. level_regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('level_regression detection', function() {
  test('single level degradation produces level_regression severity medium', function() {
    const snaps = [ds(D1, { score: 80, level: 'healthy' }), ds(D2, { score: 72, level: 'watch' })];
    const lr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'level_regression'; });
    expect(lr).toBeDefined();
    expect(lr.severity).toBe('medium');
    expect(lr.count).toBe(1);
  });

  test('two level degradations produce severity high', function() {
    const snaps = [
      ds(D1, { score: 85, level: 'healthy' }),
      ds(D2, { score: 70, level: 'watch' }),
      ds(D3, { score: 55, level: 'weak' }),
    ];
    const lr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'level_regression'; });
    expect(lr.severity).toBe('high');
    expect(lr.count).toBe(2);
  });

  test('final level risky with initial level weak produces high severity', function() {
    // firstRank=weak(2) ≥ 2 AND lastRank=risky(1) ≤ 1 → high
    const snaps = [ds(D1, { score: 55, level: 'weak' }), ds(D2, { score: 35, level: 'risky' })];
    const lr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'level_regression'; });
    expect(lr.severity).toBe('high');
  });

  test('no level_regression when level stays healthy', function() {
    const snaps = [ds(D1, { score: 80, level: 'healthy' }), ds(D2, { score: 82, level: 'healthy' })];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('level_regression');
  });

  test('level_regression count matches degradation events', function() {
    const snaps = [
      ds(D1, { score: 90, level: 'healthy' }),
      ds(D2, { score: 75, level: 'watch' }),
      ds(D3, { score: 80, level: 'healthy' }),
      ds(D4, { score: 60, level: 'weak' }),
    ];
    const lr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'level_regression'; });
    expect(lr.count).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. recurring_risk detection
// ─────────────────────────────────────────────────────────────────────────────

describe('recurring_risk detection', function() {
  // Pattern: snap[0] no risk → snap[1] risk appears → snap[2] resolved → snap[3] risk reappears
  function recurringSnaps(riskOpts) {
    const none = makeSnap({ score: 75 }); // no risk
    const with_risk = makeSnap(Object.assign({ score: 75 }, riskOpts));
    return [none, with_risk, none, with_risk];
  }

  test('unresolved_frontend_api recurring twice produces recurring_risk medium', function() {
    const snaps = recurringSnaps({ unresolvedFrontendCalls: 2 });
    const rr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'recurring_risk'; });
    expect(rr).toBeDefined();
    expect(rr.severity).toBe('medium');
    expect(rr.count).toBe(1);
  });

  test('circular_dependency recurring twice produces recurring_risk high', function() {
    const snaps = recurringSnaps({ circularDeps: 1 });
    const rr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'recurring_risk'; });
    expect(rr).toBeDefined();
    expect(rr.severity).toBe('high');
  });

  test('risk appearing only once is NOT recurring', function() {
    const snaps = [
      makeSnap({ score: 75 }),
      makeSnap({ score: 75, unresolvedFrontendCalls: 2 }),
      makeSnap({ score: 75 }),
    ];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('recurring_risk');
  });

  test('recurring_risk evidence lists affected risk types', function() {
    const snaps = recurringSnaps({ circularDeps: 1 });
    const rr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'recurring_risk'; });
    expect(rr.evidence[0]).toMatch(/circular_dependency/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. api_regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('api_regression detection', function() {
  test('increase in unresolved calls produces api_regression', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 0 }), ds(D2, { score: 75, unresolvedFrontendCalls: 1 })];
    const ar = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'api_regression'; });
    expect(ar).toBeDefined();
    expect(ar.severity).toBe('medium');
    expect(ar.count).toBe(1);
  });

  test('unresolvedDelta ≥ 3 produces high severity api_regression', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 0 }), ds(D2, { score: 75, unresolvedFrontendCalls: 3 })];
    const ar = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'api_regression'; });
    expect(ar.severity).toBe('high');
  });

  test('no api_regression when unresolved calls are stable', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 2 }), ds(D2, { score: 75, unresolvedFrontendCalls: 2 })];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('api_regression');
  });

  test('api_regression evidence contains structured delta objects', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 1 }), ds(D2, { score: 75, unresolvedFrontendCalls: 3 })];
    const ar = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'api_regression'; });
    expect(ar.evidence).toHaveLength(1);
    const ev = ar.evidence[0];
    expect(ev).toHaveProperty('snapshotAt');
    expect(ev).toHaveProperty('prevUnresolved');
    expect(ev).toHaveProperty('currUnresolved');
    expect(ev).toHaveProperty('unresolvedDelta');
    expect(ev).toHaveProperty('prevMismatch');
    expect(ev).toHaveProperty('currMismatch');
    expect(ev).toHaveProperty('mismatchDelta');
  });

  test('api_regression evidence unresolvedDelta matches actual delta', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 2 }), ds(D2, { score: 75, unresolvedFrontendCalls: 5 })];
    const ar = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'api_regression'; });
    expect(ar.evidence[0].prevUnresolved).toBe(2);
    expect(ar.evidence[0].currUnresolved).toBe(5);
    expect(ar.evidence[0].unresolvedDelta).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. coupling_regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('coupling_regression detection', function() {
  test('edges growing ≥ 25 produces coupling_regression medium', function() {
    const snaps = [ds(D1, { score: 75, totalEdges: 20 }), ds(D2, { score: 75, totalEdges: 50 })]; // delta=30
    const cr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'coupling_regression'; });
    expect(cr).toBeDefined();
    expect(cr.severity).toBe('medium');
  });

  test('edgeDelta ≥ 50 produces high severity', function() {
    const snaps = [ds(D1, { score: 75, totalEdges: 20 }), ds(D2, { score: 75, totalEdges: 70 })]; // delta=50
    const cr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'coupling_regression'; });
    expect(cr.severity).toBe('high');
  });

  test('new circular dependency produces high severity', function() {
    const snaps = [ds(D1, { score: 75, circularDeps: 0 }), ds(D2, { score: 75, circularDeps: 1 })];
    const cr = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'coupling_regression'; });
    expect(cr.severity).toBe('high');
  });

  test('no coupling_regression when edges are stable', function() {
    const snaps = [ds(D1, { score: 75, totalEdges: 20 }), ds(D2, { score: 75, totalEdges: 22 })];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('coupling_regression');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. implementation_regression detection
// ─────────────────────────────────────────────────────────────────────────────

describe('implementation_regression detection', function() {
  test('increase in impl signals produces implementation_regression medium', function() {
    const snaps = [ds(D1, { score: 75, implSignals: 0 }), ds(D2, { score: 75, implSignals: 1 })];
    const ir = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'implementation_regression'; });
    expect(ir).toBeDefined();
    expect(ir.severity).toBe('medium');
    expect(ir.count).toBe(1);
  });

  test('signalDelta ≥ 3 produces high severity', function() {
    const snaps = [ds(D1, { score: 75, implSignals: 0 }), ds(D2, { score: 75, implSignals: 3 })];
    const ir = detectArchitectureRegressions({ snapshots: snaps }).regressions.find(function(r) { return r.type === 'implementation_regression'; });
    expect(ir.severity).toBe('high');
  });

  test('no implementation_regression when signals are stable', function() {
    const snaps = [ds(D1, { score: 75, implSignals: 2 }), ds(D2, { score: 75, implSignals: 2 })];
    const types = detectArchitectureRegressions({ snapshots: snaps }).regressions.map(function(r) { return r.type; });
    expect(types).not.toContain('implementation_regression');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. regressionStreak
// ─────────────────────────────────────────────────────────────────────────────

describe('regressionStreak', function() {
  test('no drops → streak 0', function() {
    const snaps = [ds(D1, { score: 70 }), ds(D2, { score: 80 }), ds(D3, { score: 85 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.regressionStreak).toBe(0);
  });

  test('two consecutive drops from end → streak 2', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 }), ds(D3, { score: 60 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.regressionStreak).toBe(2);
  });

  test('three consecutive drops from end → streak 3', function() {
    const snaps = [ds(D1, { score: 85 }), ds(D2, { score: 75 }), ds(D3, { score: 65 }), ds(D4, { score: 55 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.regressionStreak).toBe(3);
  });

  test('gain breaks streak', function() {
    // [80, 70, 80, 70]: last interval is drop, second-to-last is gain → streak=1
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 }), ds(D3, { score: 80 }), ds(D4, { score: 70 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.regressionStreak).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. latestSnapshotRegressed
// ─────────────────────────────────────────────────────────────────────────────

describe('latestSnapshotRegressed', function() {
  test('latest interval has score_drop → latestSnapshotRegressed true', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.latestSnapshotRegressed).toBe(true);
  });

  test('latest interval has score_gain only → latestSnapshotRegressed false', function() {
    const snaps = [ds(D1, { score: 65 }), ds(D2, { score: 75 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.latestSnapshotRegressed).toBe(false);
  });

  test('drop followed by stable → latestSnapshotRegressed false', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 }), ds(D3, { score: 70 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).patterns.latestSnapshotRegressed).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Regression score calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('regression score calculation', function() {
  test('zero events → regressionScore 0', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(0);
  });

  test('one score drop (delta -10) → regressionScore 15 (drop×10 + streak×5)', function() {
    // 1 drop × 10 = 10, streak=1 × 5 = 5, totalDelta=-10 → no bonus
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(15);
  });

  test('one score drop with delta -15 → regressionScore 23 (10 + 5 streak + 8 bonus)', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 65 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(23);
  });

  test('one score drop with delta -30 → regressionScore 30 (10 + 5 streak + 15 bonus)', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 50 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(30);
  });

  test('score capped at 100 for extreme regressions', function() {
    // 3 drops(30) + 3 levelDeg(45) + 1 api(8) + 1 coupling(10) + 1 impl(6) + delta -30 bonus(15) = 114 → capped 100
    const snaps = [
      ds(D1, { score: 90, level: 'healthy',  totalEdges: 10, unresolvedFrontendCalls: 0, implSignals: 0 }),
      ds(D2, { score: 77, level: 'watch',    totalEdges: 50, unresolvedFrontendCalls: 1, implSignals: 1 }),
      ds(D3, { score: 62, level: 'weak',     totalEdges: 55, unresolvedFrontendCalls: 2, implSignals: 2 }),
      ds(D4, { score: 47, level: 'risky',    totalEdges: 60, unresolvedFrontendCalls: 3, implSignals: 3 }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionScore).toBe(100);
  });

  test('regressionStreak contributes 5 points per step', function() {
    // 2 drops(20) + streak=2(10) + delta=-20 → +8 = 38
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 }), ds(D3, { score: 60 })];
    const result = detectArchitectureRegressions({ snapshots: snaps });
    expect(result.patterns.regressionStreak).toBe(2);
    const expected = 2 * 10 + 2 * 5 + 8; // drops*10 + streak*5 + delta<=−15 bonus
    expect(result.regressionScore).toBe(expected);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. regressionLevel thresholds
// ─────────────────────────────────────────────────────────────────────────────

describe('regressionLevel thresholds', function() {
  test('regressionScore 0 → none', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('none');
  });

  test('regressionScore in watch range → watch', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 })]; // score=15 (10+5 streak) → watch
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('watch');
  });

  test('regressionScore in regression range (30–69) → regression', function() {
    // 2 drops(20) + 1 levelDeg(15) = 35 (+8 bonus for delta -20) = 43 → regression
    const snaps = [
      ds(D1, { score: 85, level: 'healthy' }),
      ds(D2, { score: 72, level: 'watch' }),
      ds(D3, { score: 65, level: 'watch' }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('regression');
  });

  test('regressionScore ≥ 70 → critical', function() {
    const snaps = [
      ds(D1, { score: 90, level: 'healthy',  totalEdges: 10, unresolvedFrontendCalls: 0, implSignals: 0 }),
      ds(D2, { score: 77, level: 'watch',    totalEdges: 50, unresolvedFrontendCalls: 1, implSignals: 1 }),
      ds(D3, { score: 62, level: 'weak',     totalEdges: 55, unresolvedFrontendCalls: 2, implSignals: 2 }),
      ds(D4, { score: 47, level: 'risky',    totalEdges: 60, unresolvedFrontendCalls: 3, implSignals: 3 }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).regressionLevel).toBe('critical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Confidence levels
// ─────────────────────────────────────────────────────────────────────────────

describe('confidence levels', function() {
  test('2 snapshots → confidence low', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).confidenceLevel).toBe('low');
  });

  test('3 snapshots → confidence medium', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 }), ds(D3, { score: 84 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).confidenceLevel).toBe('medium');
  });

  test('4 snapshots → confidence medium', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 }), ds(D3, { score: 84 }), ds(D4, { score: 86 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).confidenceLevel).toBe('medium');
  });

  test('5 snapshots → confidence high', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 }), ds(D3, { score: 84 }), ds(D4, { score: 86 }), ds(D5, { score: 88 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).confidenceLevel).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Affected areas
// ─────────────────────────────────────────────────────────────────────────────

describe('affectedAreas', function() {
  test('score_regression sets architectureHealth true', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.architectureHealth).toBe(true);
  });

  test('level_regression sets architectureHealth true', function() {
    const snaps = [ds(D1, { score: 80, level: 'healthy' }), ds(D2, { score: 72, level: 'watch' })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.architectureHealth).toBe(true);
  });

  test('api_regression sets apiIntegration true', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 0 }), ds(D2, { score: 75, unresolvedFrontendCalls: 1 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.apiIntegration).toBe(true);
  });

  test('coupling_regression sets coupling true', function() {
    const snaps = [ds(D1, { score: 75, totalEdges: 20 }), ds(D2, { score: 75, totalEdges: 50 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.coupling).toBe(true);
  });

  test('implementation_regression sets implementationCompleteness true', function() {
    const snaps = [ds(D1, { score: 75, implSignals: 0 }), ds(D2, { score: 75, implSignals: 1 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.implementationCompleteness).toBe(true);
  });

  test('recurring_risk sets boundaryHealth true', function() {
    const none = makeSnap({ score: 75 });
    const withRisk = makeSnap({ score: 75, unresolvedFrontendCalls: 2 });
    const snaps = [none, withRisk, none, withRisk];
    expect(detectArchitectureRegressions({ snapshots: snaps }).affectedAreas.boundaryHealth).toBe(true);
  });

  test('clean snapshots have all affected areas false', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const areas = detectArchitectureRegressions({ snapshots: snaps }).affectedAreas;
    Object.values(areas).forEach(function(v) { expect(v).toBe(false); });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Recommendations
// ─────────────────────────────────────────────────────────────────────────────

describe('recommendations', function() {
  test('medium/high score regression includes stabilization recommendation', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 65 }), ds(D3, { score: 55 })]; // 2 drops → medium
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs.some(function(r) { return r.match(/score drops/i); })).toBe(true);
  });

  test('high level regression includes immediate review recommendation', function() {
    const snaps = [
      ds(D1, { score: 85, level: 'healthy' }),
      ds(D2, { score: 70, level: 'watch' }),
      ds(D3, { score: 55, level: 'weak' }),
    ];
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs.some(function(r) { return r.match(/Severe level degradation/); })).toBe(true);
  });

  test('api regression includes api audit recommendation', function() {
    const snaps = [ds(D1, { score: 75, unresolvedFrontendCalls: 0 }), ds(D2, { score: 75, unresolvedFrontendCalls: 1 })];
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs.some(function(r) { return r.match(/API integration regressions/); })).toBe(true);
  });

  test('coupling regression includes import chain recommendation', function() {
    const snaps = [ds(D1, { score: 75, totalEdges: 20 }), ds(D2, { score: 75, totalEdges: 50 })];
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs.some(function(r) { return r.match(/coupling is growing/i); })).toBe(true);
  });

  test('recommendations capped at 5', function() {
    const snaps = [
      ds(D1, { score: 90, level: 'healthy',  totalEdges: 10, unresolvedFrontendCalls: 0, implSignals: 0 }),
      ds(D2, { score: 77, level: 'watch',    totalEdges: 50, unresolvedFrontendCalls: 1, implSignals: 1 }),
      ds(D3, { score: 62, level: 'weak',     totalEdges: 55, unresolvedFrontendCalls: 2, implSignals: 2 }),
      ds(D4, { score: 47, level: 'risky',    totalEdges: 60, unresolvedFrontendCalls: 3, implSignals: 3 }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).recommendations.length).toBeLessThanOrEqual(5);
  });

  test('clean snapshots include maintenance recommendation', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const recs = detectArchitectureRegressions({ snapshots: snaps }).recommendations;
    expect(recs[0]).toMatch(/No regressions detected/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Summary strings
// ─────────────────────────────────────────────────────────────────────────────

describe('summary strings', function() {
  test('unknown → insufficient history message', function() {
    expect(detectArchitectureRegressions({ snapshots: [] }).summary).toMatch(/at least 2 snapshots required/);
  });

  test('none → no regressions detected message', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    expect(detectArchitectureRegressions({ snapshots: snaps }).summary).toMatch(/No architecture regressions detected/);
  });

  test('watch → early warning signs message', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 70 })]; // score=10 → watch
    expect(detectArchitectureRegressions({ snapshots: snaps }).summary).toMatch(/early warning signs/);
  });

  test('regression → regression pattern message', function() {
    const snaps = [
      ds(D1, { score: 85, level: 'healthy' }),
      ds(D2, { score: 72, level: 'watch' }),
      ds(D3, { score: 65, level: 'watch' }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).summary).toMatch(/Regression pattern detected/);
  });

  test('critical → critical regression pattern message', function() {
    const snaps = [
      ds(D1, { score: 90, level: 'healthy',  totalEdges: 10, unresolvedFrontendCalls: 0, implSignals: 0 }),
      ds(D2, { score: 77, level: 'watch',    totalEdges: 50, unresolvedFrontendCalls: 1, implSignals: 1 }),
      ds(D3, { score: 62, level: 'weak',     totalEdges: 55, unresolvedFrontendCalls: 2, implSignals: 2 }),
      ds(D4, { score: 47, level: 'risky',    totalEdges: 60, unresolvedFrontendCalls: 3, implSignals: 3 }),
    ];
    expect(detectArchitectureRegressions({ snapshots: snaps }).summary).toMatch(/Critical regression pattern/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Output shape
// ─────────────────────────────────────────────────────────────────────────────

describe('output shape', function() {
  test('all required top-level keys present', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const result = detectArchitectureRegressions({ snapshots: snaps });
    ['regressionLevel', 'regressionScore', 'confidenceLevel', 'summary',
      'regressions', 'patterns', 'affectedAreas', 'recommendations'].forEach(function(k) {
      expect(result).toHaveProperty(k);
    });
  });

  test('patterns object has all required keys', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const p = detectArchitectureRegressions({ snapshots: snaps }).patterns;
    ['scoreDropCount', 'levelDegradationCount', 'recurringRiskCount',
      'apiRegressionCount', 'couplingGrowthCount', 'implementationRegressionCount',
      'regressionStreak', 'latestSnapshotRegressed'].forEach(function(k) {
      expect(p).toHaveProperty(k);
    });
  });

  test('affectedAreas object has all required keys', function() {
    const snaps = [ds(D1, { score: 80 }), ds(D2, { score: 82 })];
    const a = detectArchitectureRegressions({ snapshots: snaps }).affectedAreas;
    ['architectureHealth', 'apiIntegration', 'coupling',
      'implementationCompleteness', 'boundaryHealth'].forEach(function(k) {
      expect(a).toHaveProperty(k);
    });
  });

  test('each regression entry has type, severity, count, summary, evidence', function() {
    const snaps = [ds(D1, { score: 75 }), ds(D2, { score: 65 })];
    const result = detectArchitectureRegressions({ snapshots: snaps });
    result.regressions.forEach(function(r) {
      expect(r).toHaveProperty('type');
      expect(r).toHaveProperty('severity');
      expect(r).toHaveProperty('count');
      expect(r).toHaveProperty('summary');
      expect(r).toHaveProperty('evidence');
      expect(Array.isArray(r.evidence)).toBe(true);
    });
  });

  test('unknown result has all required keys', function() {
    const result = detectArchitectureRegressions(null);
    ['regressionLevel', 'regressionScore', 'confidenceLevel', 'summary',
      'regressions', 'patterns', 'affectedAreas', 'recommendations'].forEach(function(k) {
      expect(result).toHaveProperty(k);
    });
  });
});
