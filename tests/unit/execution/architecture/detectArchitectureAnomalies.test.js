'use strict';

const { detectArchitectureAnomalies } = require('../../../../execution/architecture/detectArchitectureAnomalies');

// ── Timeline data factories ───────────────────────────────────────────────────

function makeScoreTL(scores) {
  return scores.map(function(score, i) {
    return {
      snapshotAt:        '2024-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z',
      score,
      deltaFromPrevious: i === 0 ? 0 : score - scores[i - 1],
      deltaFromFirst:    score - scores[0],
    };
  });
}

function makeCouplingTL(entries) {
  return entries.map(function(e, i) {
    return {
      snapshotAt:             '2024-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z',
      totalEdges:             e.totalEdges             !== undefined ? e.totalEdges             : 10,
      circularDependencyCount: e.circularDependencyCount !== undefined ? e.circularDependencyCount : 0,
      boundaryViolationCount: e.boundaryViolationCount !== undefined ? e.boundaryViolationCount : 0,
      couplingPressure:       'low',
    };
  });
}

function makeApiTL(entries) {
  return entries.map(function(e, i) {
    return {
      snapshotAt:                  '2024-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z',
      frontendCoveragePercent:     e.frontendCoveragePercent     !== undefined ? e.frontendCoveragePercent     : 80,
      backendCoveragePercent:      e.backendCoveragePercent      !== undefined ? e.backendCoveragePercent      : 80,
      unresolvedFrontendCallCount: e.unresolvedFrontendCallCount !== undefined ? e.unresolvedFrontendCallCount : 0,
      methodMismatchCount:         e.methodMismatchCount         !== undefined ? e.methodMismatchCount         : 0,
      orphanedBackendRouteCount:   e.orphanedBackendRouteCount   !== undefined ? e.orphanedBackendRouteCount   : 0,
    };
  });
}

function makeImplTL(entries) {
  return entries.map(function(e, i) {
    return {
      snapshotAt:               '2024-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z',
      completenessScore:        e.completenessScore        !== undefined ? e.completenessScore        : 80,
      completenessLevel:        e.completenessLevel        !== undefined ? e.completenessLevel        : 'complete',
      implementationSignalCount: e.implementationSignalCount !== undefined ? e.implementationSignalCount : 0,
      placeholderCount:         e.placeholderCount         !== undefined ? e.placeholderCount         : 0,
      scaffoldLikeFileCount:    e.scaffoldLikeFileCount    !== undefined ? e.scaffoldLikeFileCount    : 0,
    };
  });
}

/**
 * Build a minimal timelineData object.
 * opts.scores   — score array (default [80, 80])
 * opts.coupling — coupling entries (default stable)
 * opts.api      — api entries (default clean)
 * opts.impl     — impl entries (default clean)
 */
function makeTD(opts) {
  opts = opts || {};
  const scores = opts.scores || [80, 80];
  const n      = scores.length;
  const flat   = Array.from({ length: n }, function(_, i) { return i; });

  return {
    scoreTimeline:          makeScoreTL(scores),
    couplingTimeline:       opts.coupling || makeCouplingTL(flat.map(function() { return {}; })),
    apiIntegrationTimeline: opts.api      || makeApiTL(flat.map(function()      { return {}; })),
    implementationTimeline: opts.impl     || makeImplTL(flat.map(function()     { return {}; })),
    driftEvents:            [],
    summary:                '',
    recommendations:        [],
  };
}

// ── Snapshot factory (for snapshot-path tests) ────────────────────────────────

function makeSnapshot(score, opts) {
  opts = opts || {};
  return {
    architectureHealthScore: score,
    architectureHealthLevel: score >= 70 ? 'healthy' : score >= 55 ? 'watch' : 'risky',
    snapshotAt: opts.snapshotAt || null,
    confidenceLevel: opts.confidenceLevel || 'medium',
    metrics: Object.assign({
      totalEdges: 10, circularDependencyCount: 0,
      boundaryViolationCount: 0, unresolvedFrontendCallCount: 0,
    }, opts.metrics || {}),
    apiLinkage:               { unresolvedFrontendCalls: [], methodMismatches: [] },
    boundaryVerification:     { violations: [] },
    implementationCompleteness: { signals: [], placeholderAssessment: { placeholderCount: 0 }, scaffoldAssessment: { scaffoldLikeFileCount: 0 } },
  };
}

// ── Repo forecast factory ─────────────────────────────────────────────────────

function makeRepoForecast(opts) {
  opts = opts || {};
  return {
    repoId:          opts.repoId          !== undefined ? opts.repoId          : 1,
    repoName:        opts.repoName        !== undefined ? opts.repoName        : 'repo-1',
    forecastLevel:   opts.forecastLevel   !== undefined ? opts.forecastLevel   : 'stable',
    degradationRisk: opts.degradationRisk !== undefined ? opts.degradationRisk : 10,
    confidenceLevel: opts.confidenceLevel !== undefined ? opts.confidenceLevel : 'high',
    trajectory: Object.assign(
      { scoreTrend: 'stable', projectedLevel: 'healthy', interventionUrgency: 'none' },
      opts.trajectory || {}
    ),
    structuralProjection: Object.assign(
      { couplingForecast: 'stable', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' },
      opts.structuralProjection || {}
    ),
    riskFactors:     opts.riskFactors     !== undefined ? opts.riskFactors     : [],
    recommendations: opts.recommendations !== undefined ? opts.recommendations : [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

// ── Empty / invalid input ─────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — empty / invalid input', function() {
  test('null returns unknown', function() {
    const r = detectArchitectureAnomalies(null);
    expect(r.anomalyLevel).toBe('unknown');
    expect(r.anomalyScore).toBe(0);
    expect(r.confidenceLevel).toBe('low');
  });

  test('undefined returns unknown', function() {
    expect(detectArchitectureAnomalies(undefined).anomalyLevel).toBe('unknown');
  });

  test('non-object returns unknown', function() {
    expect(detectArchitectureAnomalies(42).anomalyLevel).toBe('unknown');
    expect(detectArchitectureAnomalies('x').anomalyLevel).toBe('unknown');
  });

  test('empty object returns unknown', function() {
    expect(detectArchitectureAnomalies({}).anomalyLevel).toBe('unknown');
  });

  test('unknown result has all required keys', function() {
    const r = detectArchitectureAnomalies(null);
    ['anomalyLevel','anomalyScore','confidenceLevel','summary','anomalies','outliers','patterns','recommendations']
      .forEach(function(k) { expect(r).toHaveProperty(k); });
  });

  test('patterns has all required keys in unknown result', function() {
    const r = detectArchitectureAnomalies(null);
    [
      'scoreCollapseCount','couplingSpikeCount','apiLinkageDropCount',
      'boundarySpikeCount','implementationDebtSurgeCount','volatilityOutlierCount',
      'portfolioOutlierCount','latestSnapshotAnomalous',
    ].forEach(function(k) { expect(r.patterns).toHaveProperty(k); });
  });
});

// ── Single timeline point => unknown ─────────────────────────────────────────

describe('detectArchitectureAnomalies — single timeline point', function() {
  test('single-entry scoreTimeline without portfolio data returns unknown', function() {
    const td = makeTD({ scores: [80] });
    td.scoreTimeline = td.scoreTimeline.slice(0, 1); // force single entry
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('unknown');
  });

  test('single snapshot without portfolio data returns unknown', function() {
    const r = detectArchitectureAnomalies({ snapshots: [makeSnapshot(80)] });
    expect(r.anomalyLevel).toBe('unknown');
  });

  test('single timeline point WITH repoForecasts still returns non-unknown', function() {
    const td = makeTD({ scores: [80] });
    td.scoreTimeline = td.scoreTimeline.slice(0, 1);
    const r = detectArchitectureAnomalies({
      timelineData: td,
      repoForecasts: [makeRepoForecast({ repoId: 1, forecastLevel: 'stable', degradationRisk: 5 })],
    });
    expect(r.anomalyLevel).not.toBe('unknown');
  });
});

// ── timelineData vs snapshots path ────────────────────────────────────────────

describe('detectArchitectureAnomalies — data source resolution', function() {
  test('uses provided timelineData directly without calling buildArchitectureTrendTimeline', function() {
    const td = makeTD({ scores: [80, 80] });
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('none');
    expect(r.anomalyScore).toBe(0);
  });

  test('timelineData preferred over snapshots when both provided', function() {
    // timelineData has stable scores; snapshots have a collapse — timelineData wins
    const td = makeTD({ scores: [80, 80] });
    const snaps = [makeSnapshot(80), makeSnapshot(40)]; // collapse
    const r = detectArchitectureAnomalies({ timelineData: td, snapshots: snaps });
    expect(r.anomalyLevel).toBe('none');
  });

  test('builds timeline from snapshots when timelineData absent', function() {
    const snaps = [makeSnapshot(80), makeSnapshot(80)];
    const r = detectArchitectureAnomalies({ snapshots: snaps });
    expect(r.anomalyLevel).toBe('none');
    expect(r.anomalyScore).toBe(0);
  });

  test('snapshot path: collapse in snapshots is detected', function() {
    const snaps = [makeSnapshot(80), makeSnapshot(50)]; // delta=-30, collapse high
    const r = detectArchitectureAnomalies({ snapshots: snaps });
    expect(r.anomalies.some(function(a) { return a.type === 'score_collapse'; })).toBe(true);
  });
});

// ── Score collapse ────────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — score_collapse', function() {
  test('delta -20 triggers score_collapse high', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 60] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(sc).toBeDefined();
    expect(sc.severity).toBe('high');
  });

  test('delta -35 triggers score_collapse critical', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 45] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(sc.severity).toBe('critical');
  });

  test('delta -19 does NOT trigger score_collapse', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 61] }) });
    expect(r.anomalies.find(function(a) { return a.type === 'score_collapse'; })).toBeUndefined();
  });

  test('multiple collapses: worst severity wins', function() {
    // Two intervals: -21 (high) then -36 (critical)
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 59, 23] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(sc.severity).toBe('critical');
  });

  test('scoreCollapseCount reflects interval count', function() {
    // -25, -25, -25 → 3 collapses
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55, 30, 5] }) });
    expect(r.patterns.scoreCollapseCount).toBe(3);
  });

  test('evidence contains scoreCollapseCount', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(sc.evidence).toHaveProperty('scoreCollapseCount');
  });

  test('evidence contains collapseEvents array', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(Array.isArray(sc.evidence.collapseEvents)).toBe(true);
    expect(sc.evidence.collapseEvents).toHaveLength(1);
  });

  test('each collapseEvent has snapshotAt, severity, delta, prevScore, currScore', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55] }) });
    const ev = r.anomalies.find(function(a) { return a.type === 'score_collapse'; }).evidence.collapseEvents[0];
    expect(ev).toHaveProperty('snapshotAt');
    expect(ev).toHaveProperty('severity');
    expect(ev).toHaveProperty('delta');
    expect(ev).toHaveProperty('prevScore');
    expect(ev).toHaveProperty('currScore');
  });

  test('collapseEvent prevScore and currScore are correct', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55] }) });
    const ev = r.anomalies.find(function(a) { return a.type === 'score_collapse'; }).evidence.collapseEvents[0];
    expect(ev.prevScore).toBe(80);
    expect(ev.currScore).toBe(55);
    expect(ev.delta).toBe(-25);
  });

  test('collapseEvent severity critical for delta <= -35', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 40] }) });
    const ev = r.anomalies.find(function(a) { return a.type === 'score_collapse'; }).evidence.collapseEvents[0];
    expect(ev.severity).toBe('critical');
  });

  test('multiple collapses accumulate multiple collapseEvents entries', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55, 30] }) });
    const sc = r.anomalies.find(function(a) { return a.type === 'score_collapse'; });
    expect(sc.evidence.collapseEvents).toHaveLength(2);
  });
});

// ── Coupling spike ────────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — coupling_spike', function() {
  test('totalEdges delta >= 50 => high', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 60 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const cs = r.anomalies.find(function(a) { return a.type === 'coupling_spike'; });
    expect(cs).toBeDefined();
    expect(cs.severity).toBe('high');
  });

  test('totalEdges delta >= 100 => critical', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 115 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const cs = r.anomalies.find(function(a) { return a.type === 'coupling_spike'; });
    expect(cs.severity).toBe('critical');
  });

  test('circularDependencyCount increase => critical', function() {
    const coupling = makeCouplingTL([
      { totalEdges: 10, circularDependencyCount: 0 },
      { totalEdges: 12, circularDependencyCount: 1 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const cs = r.anomalies.find(function(a) { return a.type === 'coupling_spike'; });
    expect(cs.severity).toBe('critical');
  });

  test('totalEdges delta 49 does NOT trigger coupling_spike', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 59 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    expect(r.anomalies.find(function(a) { return a.type === 'coupling_spike'; })).toBeUndefined();
  });

  test('circular grew with edges delta < 50 still gives critical', function() {
    const coupling = makeCouplingTL([
      { totalEdges: 10, circularDependencyCount: 1 },
      { totalEdges: 20, circularDependencyCount: 2 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const cs = r.anomalies.find(function(a) { return a.type === 'coupling_spike'; });
    expect(cs.severity).toBe('critical');
  });
});

// ── API linkage drop ──────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — api_linkage_drop', function() {
  test('unresolvedFrontendCallCount delta >= 5 => high', function() {
    const api = makeApiTL([{ unresolvedFrontendCallCount: 0 }, { unresolvedFrontendCallCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ api }) });
    const al = r.anomalies.find(function(a) { return a.type === 'api_linkage_drop'; });
    expect(al).toBeDefined();
    expect(al.severity).toBe('high');
  });

  test('methodMismatchCount delta >= 3 => medium', function() {
    const api = makeApiTL([{ methodMismatchCount: 0 }, { methodMismatchCount: 3 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ api }) });
    const al = r.anomalies.find(function(a) { return a.type === 'api_linkage_drop'; });
    expect(al).toBeDefined();
    expect(al.severity).toBe('medium');
  });

  test('both unresolved>=5 and mismatch>=3 => high (max severity)', function() {
    const api = makeApiTL([
      { unresolvedFrontendCallCount: 0, methodMismatchCount: 0 },
      { unresolvedFrontendCallCount: 6, methodMismatchCount: 4 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ api }) });
    const al = r.anomalies.find(function(a) { return a.type === 'api_linkage_drop'; });
    expect(al.severity).toBe('high');
  });

  test('unresolved delta 4 and mismatch delta 2 => no anomaly', function() {
    const api = makeApiTL([
      { unresolvedFrontendCallCount: 0, methodMismatchCount: 0 },
      { unresolvedFrontendCallCount: 4, methodMismatchCount: 2 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ api }) });
    expect(r.anomalies.find(function(a) { return a.type === 'api_linkage_drop'; })).toBeUndefined();
  });
});

// ── Boundary spike ────────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — boundary_spike', function() {
  test('boundaryViolationCount delta >= 2 => high', function() {
    const coupling = makeCouplingTL([{ boundaryViolationCount: 0 }, { boundaryViolationCount: 2 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const bs = r.anomalies.find(function(a) { return a.type === 'boundary_spike'; });
    expect(bs).toBeDefined();
    expect(bs.severity).toBe('high');
  });

  test('boundaryViolationCount delta >= 5 => critical', function() {
    const coupling = makeCouplingTL([{ boundaryViolationCount: 0 }, { boundaryViolationCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    const bs = r.anomalies.find(function(a) { return a.type === 'boundary_spike'; });
    expect(bs.severity).toBe('critical');
  });

  test('delta 1 => no boundary_spike', function() {
    const coupling = makeCouplingTL([{ boundaryViolationCount: 0 }, { boundaryViolationCount: 1 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    expect(r.anomalies.find(function(a) { return a.type === 'boundary_spike'; })).toBeUndefined();
  });
});

// ── Implementation debt surge ─────────────────────────────────────────────────

describe('detectArchitectureAnomalies — implementation_debt_surge', function() {
  test('implementationSignalCount delta >= 3 => high', function() {
    const impl = makeImplTL([{ implementationSignalCount: 0 }, { implementationSignalCount: 3 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ impl }) });
    const ids = r.anomalies.find(function(a) { return a.type === 'implementation_debt_surge'; });
    expect(ids).toBeDefined();
    expect(ids.severity).toBe('high');
  });

  test('placeholderCount delta >= 5 => medium', function() {
    const impl = makeImplTL([{ placeholderCount: 0 }, { placeholderCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ impl }) });
    const ids = r.anomalies.find(function(a) { return a.type === 'implementation_debt_surge'; });
    expect(ids).toBeDefined();
    expect(ids.severity).toBe('medium');
  });

  test('scaffoldLikeFileCount delta >= 5 => medium', function() {
    const impl = makeImplTL([{ scaffoldLikeFileCount: 0 }, { scaffoldLikeFileCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ impl }) });
    const ids = r.anomalies.find(function(a) { return a.type === 'implementation_debt_surge'; });
    expect(ids.severity).toBe('medium');
  });

  test('signal >= 3 with placeholder >= 5 => high (max)', function() {
    const impl = makeImplTL([
      { implementationSignalCount: 0, placeholderCount: 0 },
      { implementationSignalCount: 4, placeholderCount: 6 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ impl }) });
    const ids = r.anomalies.find(function(a) { return a.type === 'implementation_debt_surge'; });
    expect(ids.severity).toBe('high');
  });

  test('signal delta 2 and placeholder 4 => no anomaly', function() {
    const impl = makeImplTL([
      { implementationSignalCount: 0, placeholderCount: 0 },
      { implementationSignalCount: 2, placeholderCount: 4 },
    ]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ impl }) });
    expect(r.anomalies.find(function(a) { return a.type === 'implementation_debt_surge'; })).toBeUndefined();
  });
});

// ── Volatility outlier ────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — volatility_outlier', function() {
  test('3+ direction changes => medium', function() {
    // deltas: -10, +10, -10, +10 → 3 direction changes
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 70, 80, 70, 80] }) });
    const vo = r.anomalies.find(function(a) { return a.type === 'volatility_outlier'; });
    expect(vo).toBeDefined();
    expect(['medium','high']).toContain(vo.severity);
  });

  test('avgAbsMovement >= 20 => high', function() {
    // delta: -25, +25 → avgAbs=25 >= 20
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55, 80] }) });
    const vo = r.anomalies.find(function(a) { return a.type === 'volatility_outlier'; });
    expect(vo).toBeDefined();
    expect(vo.severity).toBe('high');
  });

  test('stable scores => no volatility_outlier', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80, 80, 80] }) });
    expect(r.anomalies.find(function(a) { return a.type === 'volatility_outlier'; })).toBeUndefined();
  });

  test('small fluctuations (avgAbs < 20, dir changes < 3) => no volatility_outlier', function() {
    // deltas: +5, -5 → 1 direction change, avgAbs=5
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 85, 80] }) });
    expect(r.anomalies.find(function(a) { return a.type === 'volatility_outlier'; })).toBeUndefined();
  });

  test('volatilityOutlierCount is 1 when volatility detected', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55, 80] }) });
    expect(r.patterns.volatilityOutlierCount).toBe(1);
  });
});

// ── latestSnapshotAnomalous ───────────────────────────────────────────────────

describe('detectArchitectureAnomalies — latestSnapshotAnomalous', function() {
  test('last interval with collapse => latestSnapshotAnomalous true', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80, 55] }) });
    expect(r.patterns.latestSnapshotAnomalous).toBe(true);
  });

  test('collapse only in first interval, last is stable => latestSnapshotAnomalous false', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55, 60] }) });
    // interval 1: delta -25 → collapse; interval 2: delta +5 → no anomaly
    expect(r.patterns.latestSnapshotAnomalous).toBe(false);
  });

  test('no anomalies => latestSnapshotAnomalous false', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80] }) });
    expect(r.patterns.latestSnapshotAnomalous).toBe(false);
  });
});

// ── Portfolio: repo-level outliers ────────────────────────────────────────────

describe('detectArchitectureAnomalies — portfolio outliers', function() {
  test('degradationRisk >= 75 => high_degradation_risk high', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 75 })],
    });
    const o = r.outliers.find(function(o) { return o.type === 'high_degradation_risk'; });
    expect(o).toBeDefined();
    expect(o.severity).toBe('high');
  });

  test('degradationRisk >= 90 => high_degradation_risk critical', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 90 })],
    });
    const o = r.outliers.find(function(o) { return o.type === 'high_degradation_risk'; });
    expect(o.severity).toBe('critical');
  });

  test('forecastLevel critical => critical_forecast outlier severity critical', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, forecastLevel: 'critical', degradationRisk: 50 })],
    });
    const o = r.outliers.find(function(o) { return o.type === 'critical_forecast'; });
    expect(o).toBeDefined();
    expect(o.severity).toBe('critical');
  });

  test('degradationRisk >= 60 and confidenceLevel low => low_confidence_high_risk high', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 65, confidenceLevel: 'low' })],
    });
    const o = r.outliers.find(function(o) { return o.type === 'low_confidence_high_risk'; });
    expect(o).toBeDefined();
    expect(o.severity).toBe('high');
  });

  test('degradationRisk 60 and confidenceLevel medium => no low_confidence_high_risk', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 65, confidenceLevel: 'medium' })],
    });
    expect(r.outliers.find(function(o) { return o.type === 'low_confidence_high_risk'; })).toBeUndefined();
  });

  test('trajectory.scoreTrend volatile => volatile_forecast outlier medium', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, trajectory: { scoreTrend: 'volatile' } })],
    });
    const o = r.outliers.find(function(o) { return o.type === 'volatile_forecast'; });
    expect(o).toBeDefined();
    expect(o.severity).toBe('medium');
  });

  test('one repo can produce multiple outlier types', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({
        repoId: 1, forecastLevel: 'critical', degradationRisk: 80,
        trajectory: { scoreTrend: 'volatile' },
      })],
    });
    // Should have critical_forecast, high_degradation_risk, volatile_forecast
    expect(r.outliers.length).toBeGreaterThanOrEqual(2);
  });

  test('portfolioOutlierCount equals outliers.length', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [
        makeRepoForecast({ repoId: 1, degradationRisk: 80 }),
        makeRepoForecast({ repoId: 2, forecastLevel: 'critical', degradationRisk: 60 }),
      ],
    });
    expect(r.patterns.portfolioOutlierCount).toBe(r.outliers.length);
  });
});

// ── portfolioForecast anomalies ───────────────────────────────────────────────

describe('detectArchitectureAnomalies — portfolioForecast anomalies', function() {
  test('portfolioForecastLevel critical => portfolio_outlier critical anomaly', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: {
        portfolioForecastLevel: 'critical',
        portfolioForecastScore: 80,
        projectedHotspots: [],
      },
    });
    const pa = r.anomalies.find(function(a) { return a.type === 'portfolio_outlier' && a.severity === 'critical'; });
    expect(pa).toBeDefined();
  });

  test('portfolioForecastLevel degrading => no portfolio_outlier from level', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: {
        portfolioForecastLevel: 'degrading',
        portfolioForecastScore: 55,
        projectedHotspots: [],
      },
    });
    const pa = r.anomalies.find(function(a) { return a.type === 'portfolio_outlier'; });
    expect(pa).toBeUndefined();
  });

  test('projectedHotspots with critical severity => portfolio_outlier high', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: {
        portfolioForecastLevel: 'watch',
        projectedHotspots: [{ type: 'coupling', severity: 'critical', repoCount: 5, repos: [] }],
      },
    });
    const pa = r.anomalies.find(function(a) { return a.type === 'portfolio_outlier' && a.severity === 'high'; });
    expect(pa).toBeDefined();
  });

  test('projectedHotspots with only high severity => portfolio_outlier medium', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: {
        portfolioForecastLevel: 'watch',
        projectedHotspots: [{ type: 'implementation', severity: 'high', repoCount: 3, repos: [] }],
      },
    });
    const pa = r.anomalies.find(function(a) { return a.type === 'portfolio_outlier' && a.severity === 'medium'; });
    expect(pa).toBeDefined();
  });

  test('projectedHotspots with only low/medium severity => no hotspot portfolio_outlier', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: {
        portfolioForecastLevel: 'watch',
        projectedHotspots: [{ type: 'volatility', severity: 'low', repoCount: 1, repos: [] }],
      },
    });
    expect(r.anomalies.find(function(a) { return a.type === 'portfolio_outlier'; })).toBeUndefined();
  });
});

// ── Anomaly score ─────────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — anomalyScore', function() {
  test('no anomalies => score 0', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80] }) });
    expect(r.anomalyScore).toBe(0);
  });

  test('one high timeline anomaly => score 25', function() {
    // boundary_spike high: stable scores (no volatility), boundaryViolation 0→2
    const coupling = makeCouplingTL([{ boundaryViolationCount: 0 }, { boundaryViolationCount: 2 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    expect(r.anomalyScore).toBe(25);
  });

  test('one critical timeline anomaly => score 40', function() {
    // boundary_spike critical: stable scores (no volatility), boundaryViolation 0→5
    const coupling = makeCouplingTL([{ boundaryViolationCount: 0 }, { boundaryViolationCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    expect(r.anomalyScore).toBe(40);
  });

  test('high outlier adds 15 to score', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 80 })],
    });
    // high_degradation_risk (high) → +15
    expect(r.anomalyScore).toBe(15);
  });

  test('critical outlier adds 25 to score', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, forecastLevel: 'critical', degradationRisk: 50 })],
    });
    // critical_forecast (critical) → +25
    expect(r.anomalyScore).toBe(25);
  });

  test('score capped at 100', function() {
    // Two critical timeline anomalies and multiple outliers
    const coupling = makeCouplingTL([
      { totalEdges: 10, circularDependencyCount: 0 },
      { totalEdges: 120, circularDependencyCount: 2 },
    ]);
    const repoForecasts = [1,2,3,4,5].map(function(i) {
      return makeRepoForecast({ repoId: i, forecastLevel: 'critical', degradationRisk: 95 });
    });
    const r = detectArchitectureAnomalies({
      timelineData: makeTD({ scores: [80, 40], coupling }),
      repoForecasts,
    });
    expect(r.anomalyScore).toBe(100);
  });
});

// ── Anomaly level thresholds ──────────────────────────────────────────────────

describe('detectArchitectureAnomalies — anomalyLevel', function() {
  test('score 0 => none', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80] }) });
    expect(r.anomalyLevel).toBe('none');
  });

  test('score 1–29 => watch', function() {
    // medium outlier only: volatile_forecast = +0 (medium is only +0 from outlier scoring)
    // Actually volatile_forecast outlier severity is medium → adds 0 to outlier score
    // Let's use a medium timeline anomaly (methodMismatch): +15 → watch
    const api = makeApiTL([{ methodMismatchCount: 0 }, { methodMismatchCount: 3 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ api }) });
    expect(r.anomalyLevel).toBe('watch');
    expect(r.anomalyScore).toBe(15);
  });

  test('score 30–69 => anomaly', function() {
    // coupling_spike high (+25) + api_linkage_drop high (+25) = 50 → anomaly
    // Stable scores prevent volatility_outlier from firing
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 65 }]);
    const api = makeApiTL([{ unresolvedFrontendCallCount: 0 }, { unresolvedFrontendCallCount: 5 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling, api }) });
    expect(r.anomalyScore).toBe(50);
    expect(r.anomalyLevel).toBe('anomaly');
  });

  test('score 70–100 => critical', function() {
    // score_collapse critical (+40) + coupling_spike critical (+40) = 80 → critical
    const coupling = makeCouplingTL([{ totalEdges: 10, circularDependencyCount: 0 }, { totalEdges: 115, circularDependencyCount: 1 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 40], coupling }) });
    expect(r.anomalyScore).toBeGreaterThanOrEqual(70);
    expect(r.anomalyLevel).toBe('critical');
  });
});

// ── Confidence levels ─────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — confidenceLevel', function() {
  test('2 timeline points => low confidence', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80] }) });
    expect(r.confidenceLevel).toBe('low');
  });

  test('3 timeline points => medium confidence', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80, 80] }) });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('5 timeline points => high confidence', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80, 80, 80, 80] }) });
    expect(r.confidenceLevel).toBe('high');
  });

  test('2 repoForecasts => low confidence', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1 }), makeRepoForecast({ repoId: 2 })],
    });
    expect(r.confidenceLevel).toBe('low');
  });

  test('3 repoForecasts => medium confidence', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [1,2,3].map(function(i) { return makeRepoForecast({ repoId: i }); }),
    });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('5 repoForecasts => high confidence', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [1,2,3,4,5].map(function(i) { return makeRepoForecast({ repoId: i }); }),
    });
    expect(r.confidenceLevel).toBe('high');
  });

  test('4 timeline + 0 forecasts => medium', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80, 80, 80] }) });
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — recommendations', function() {
  test('no anomalies => no recommendations', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 80] }) });
    expect(r.recommendations).toHaveLength(0);
  });

  test('critical anomaly generates first recommendation', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 40] }) });
    expect(r.recommendations[0]).toMatch(/[Cc]ritical/);
    expect(r.recommendations[0]).toMatch(/investigation/);
  });

  test('score_collapse without critical still generates recommendation', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 60] }) });
    const hasCollapse = r.recommendations.some(function(rec) { return rec.toLowerCase().includes('collapse'); });
    expect(hasCollapse).toBe(true);
  });

  test('coupling_spike generates recommendation', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 65 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ coupling }) });
    expect(r.recommendations.some(function(rec) { return rec.toLowerCase().includes('coupling'); })).toBe(true);
  });

  test('high risk outliers generate recommendation', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 80 })],
    });
    expect(r.recommendations.some(function(rec) { return rec.toLowerCase().includes('outlier'); })).toBe(true);
  });

  test('capped at 5 recommendations', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10, circularDependencyCount: 0, boundaryViolationCount: 0 }, { totalEdges: 120, circularDependencyCount: 1, boundaryViolationCount: 5 }]);
    const api = makeApiTL([{ unresolvedFrontendCallCount: 0, methodMismatchCount: 0 }, { unresolvedFrontendCallCount: 8, methodMismatchCount: 5 }]);
    const impl = makeImplTL([{ implementationSignalCount: 0 }, { implementationSignalCount: 5 }]);
    const r = detectArchitectureAnomalies({
      timelineData: makeTD({ scores: [80, 40], coupling, api, impl }),
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 90 })],
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('recommendations are strings', function() {
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 55] }) });
    r.recommendations.forEach(function(rec) { expect(typeof rec).toBe('string'); });
  });
});

// ── Deterministic output ──────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — deterministic output', function() {
  test('same input produces identical output on repeated calls', function() {
    const td = makeTD({ scores: [80, 55, 80, 50] });
    const r1 = detectArchitectureAnomalies({ timelineData: td });
    const r2 = detectArchitectureAnomalies({ timelineData: td });
    expect(r1.anomalyLevel).toBe(r2.anomalyLevel);
    expect(r1.anomalyScore).toBe(r2.anomalyScore);
    expect(r1.anomalies.map(function(a) { return a.type; })).toEqual(r2.anomalies.map(function(a) { return a.type; }));
  });

  test('anomalies appear in consistent order (ANOMALY_ORDER)', function() {
    const coupling = makeCouplingTL([{ totalEdges: 10 }, { totalEdges: 65 }]);
    const api = makeApiTL([{ unresolvedFrontendCallCount: 0 }, { unresolvedFrontendCallCount: 6 }]);
    const r = detectArchitectureAnomalies({ timelineData: makeTD({ scores: [80, 60], coupling, api }) });
    const types = r.anomalies.map(function(a) { return a.type; });
    const scIdx = types.indexOf('score_collapse');
    const csIdx = types.indexOf('coupling_spike');
    const alIdx = types.indexOf('api_linkage_drop');
    if (scIdx !== -1 && csIdx !== -1) expect(scIdx).toBeLessThan(csIdx);
    if (csIdx !== -1 && alIdx !== -1) expect(csIdx).toBeLessThan(alIdx);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('detectArchitectureAnomalies — non-mutation', function() {
  test('input timelineData is not mutated', function() {
    const td = makeTD({ scores: [80, 55] });
    const origLen = td.scoreTimeline.length;
    const origScore = td.scoreTimeline[0].score;
    detectArchitectureAnomalies({ timelineData: td });
    expect(td.scoreTimeline.length).toBe(origLen);
    expect(td.scoreTimeline[0].score).toBe(origScore);
  });

  test('input repoForecasts array is not mutated', function() {
    const repos = [makeRepoForecast({ repoId: 1, degradationRisk: 80 })];
    const origLen = repos.length;
    const origRisk = repos[0].degradationRisk;
    detectArchitectureAnomalies({ repoForecasts: repos });
    expect(repos.length).toBe(origLen);
    expect(repos[0].degradationRisk).toBe(origRisk);
  });
});

// ── Missing fields handled safely ─────────────────────────────────────────────

describe('detectArchitectureAnomalies — missing field safety', function() {
  test('timelineData missing couplingTimeline does not crash', function() {
    const td = makeTD({ scores: [80, 80] });
    delete td.couplingTimeline;
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('none');
  });

  test('timelineData missing apiIntegrationTimeline does not crash', function() {
    const td = makeTD({ scores: [80, 80] });
    delete td.apiIntegrationTimeline;
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('none');
  });

  test('timelineData missing implementationTimeline does not crash', function() {
    const td = makeTD({ scores: [80, 80] });
    delete td.implementationTimeline;
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('none');
  });

  test('repoForecast without trajectory does not crash', function() {
    const r = detectArchitectureAnomalies({
      repoForecasts: [{ repoId: 1, forecastLevel: 'stable', degradationRisk: 5 }],
    });
    expect(r.anomalyLevel).not.toBe('unknown');
  });

  test('portfolioForecast without projectedHotspots does not crash', function() {
    const r = detectArchitectureAnomalies({
      portfolioForecast: { portfolioForecastLevel: 'watch', portfolioForecastScore: 30 },
    });
    expect(r.anomalyLevel).not.toBe('unknown');
  });

  test('scoreTimeline entries with non-numeric deltaFromPrevious treated as 0', function() {
    const td = makeTD({ scores: [80, 80] });
    td.scoreTimeline[1].deltaFromPrevious = 'bad';
    const r = detectArchitectureAnomalies({ timelineData: td });
    expect(r.anomalyLevel).toBe('none');
  });

  test('combined timeline + portfolio data: both analyses run', function() {
    const r = detectArchitectureAnomalies({
      timelineData: makeTD({ scores: [80, 55] }), // score_collapse high
      repoForecasts: [makeRepoForecast({ repoId: 1, degradationRisk: 80 })], // outlier
    });
    expect(r.anomalies.some(function(a) { return a.type === 'score_collapse'; })).toBe(true);
    expect(r.outliers.length).toBeGreaterThan(0);
  });
});
