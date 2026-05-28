'use strict';

const { detectCouplingGrowthAlerts } = require('../../../../execution/architecture/detectCouplingGrowthAlerts');

// ── Factories ─────────────────────────────────────────────────────────────────

// Builds a pre-computed couplingTimeline entry; pressure computed from the same
// rules used by buildArchitectureTrendTimeline.
function ce(totalEdges, circularDeps, boundaryViols) {
  circularDeps  = circularDeps  || 0;
  boundaryViols = boundaryViols || 0;
  const pressure = (circularDeps > 0 || totalEdges >= 100) ? 'high'
    : (totalEdges >= 50 || boundaryViols > 0) ? 'medium'
    : 'low';
  return { snapshotAt: null, totalEdges, circularDependencyCount: circularDeps, boundaryViolationCount: boundaryViols, couplingPressure: pressure };
}

// Wrap coupling entries into a minimal timelineData object.
function td(entries) {
  return { couplingTimeline: entries };
}

// Build a coupling entry with an explicit pressure override (for isolated score tests).
function ceP(totalEdges, circularDeps, boundaryViols, pressure) {
  return {
    snapshotAt: null,
    totalEdges:             totalEdges,
    circularDependencyCount: circularDeps  || 0,
    boundaryViolationCount:  boundaryViols || 0,
    couplingPressure:        pressure      || 'low',
  };
}

// Full snapshot factory (used for buildArchitectureTrendTimeline integration tests).
function makeSnap(opts) {
  opts = opts || {};
  const edges        = opts.totalEdges         !== undefined ? opts.totalEdges         : 20;
  const circular     = opts.circularDeps       !== undefined ? opts.circularDeps       : 0;
  const violations   = opts.violations         !== undefined ? opts.violations         : 0;
  return {
    snapshotAt:              opts.snapshotAt || null,
    architectureHealthScore: opts.score      !== undefined ? opts.score : 75,
    architectureHealthLevel: opts.level      || 'healthy',
    confidenceLevel:         'high',
    metrics: {
      totalFiles: 50, totalEdges: edges, backendRouteCount: 10,
      frontendApiCallCount: 10, linkedEndpointCount: 8,
      unresolvedFrontendCallCount: 0, orphanedBackendRouteCount: 0,
      circularDependencyCount: circular, boundaryViolationCount: violations,
      implementationSignalCount: 0,
    },
    boundaryVerification: { violations: new Array(violations).fill({ type: 'layer_violation' }) },
    apiLinkage: { unresolvedFrontendCalls: [], methodMismatches: [] },
    implementationCompleteness: {
      signals: [], completenessScore: 80, completenessLevel: 'sufficient',
      placeholderAssessment: { placeholderCount: 0 },
      scaffoldAssessment:    { scaffoldLikeFileCount: 0 },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Input validation
// ─────────────────────────────────────────────────────────────────────────────

describe('input validation', function() {
  test('null params returns unknown', function() {
    expect(detectCouplingGrowthAlerts(null).alertLevel).toBe('unknown');
  });

  test('undefined params returns unknown', function() {
    expect(detectCouplingGrowthAlerts(undefined).alertLevel).toBe('unknown');
  });

  test('empty object returns unknown', function() {
    expect(detectCouplingGrowthAlerts({}).alertLevel).toBe('unknown');
  });

  test('non-array snapshots returns unknown', function() {
    expect(detectCouplingGrowthAlerts({ snapshots: 'bad' }).alertLevel).toBe('unknown');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Insufficient data
// ─────────────────────────────────────────────────────────────────────────────

describe('insufficient data', function() {
  test('empty snapshots returns unknown', function() {
    const r = detectCouplingGrowthAlerts({ snapshots: [] });
    expect(r.alertLevel).toBe('unknown');
    expect(r.alerts).toEqual([]);
  });

  test('single snapshot returns unknown', function() {
    const r = detectCouplingGrowthAlerts({ snapshots: [makeSnap({ totalEdges: 80 })] });
    expect(r.alertLevel).toBe('unknown');
  });

  test('unknown result has all required keys with safe defaults', function() {
    const r = detectCouplingGrowthAlerts({ snapshots: [] });
    expect(r.couplingTrend.edgeDelta).toBe(0);
    expect(r.couplingTrend.pressureTimeline).toEqual([]);
    expect(r.couplingTrend.latestPressure).toBe('low');
    expect(r.couplingTrend.pressureEscalated).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Pre-built timelineData usage
// ─────────────────────────────────────────────────────────────────────────────

describe('pre-built timelineData usage', function() {
  test('uses timelineData when provided, ignores snapshots', function() {
    // timelineData has 1 entry → unknown; snapshots have 5 clean entries → would not be unknown
    const single = td([ce(20, 0, 0)]);
    const snaps  = [makeSnap(), makeSnap(), makeSnap(), makeSnap(), makeSnap()];
    const r = detectCouplingGrowthAlerts({ snapshots: snaps, timelineData: single });
    expect(r.alertLevel).toBe('unknown');
  });

  test('2-entry timelineData with no growth → alertLevel none', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(22, 0, 0)]) });
    expect(r.alertLevel).toBe('none');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. No alert
// ─────────────────────────────────────────────────────────────────────────────

describe('no alert', function() {
  test('stable low-edge snapshots → alertLevel none', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(15, 0, 0), ce(18, 0, 0)]) });
    expect(r.alertLevel).toBe('none');
  });

  test('no alerts → couplingGrowthScore 0', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.couplingGrowthScore).toBe(0);
  });

  test('no alerts → maintenance recommendation', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.recommendations[0]).toMatch(/No coupling growth alerts/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edge growth detection
// ─────────────────────────────────────────────────────────────────────────────

describe('edge growth detection', function() {
  // low: edgeDelta=30 [100→130], percent=30% → no percent trigger, but delta >= 25 → low
  test('edgeDelta 30 with low percent → severity low', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(130)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg).toBeDefined();
    expect(eg.severity).toBe('low');
  });

  // medium via delta: 100→160, edgeDelta=60 >= 50
  test('edgeDelta >= 50 → severity medium', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(160)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg.severity).toBe('medium');
  });

  // medium via percent: 20→31, edgeDelta=11 (<25), percent=55% (>=50) → medium
  test('edgeGrowthPercent >= 50 triggers medium even when delta < 25', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(31)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg).toBeDefined();
    expect(eg.severity).toBe('medium');
  });

  // high via delta: 20→120, edgeDelta=100
  test('edgeDelta >= 100 → severity high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(120)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg.severity).toBe('high');
  });

  // high via percent: 20→40, edgeDelta=20, percent=100%
  test('edgeGrowthPercent >= 100 → severity high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(40)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg).toBeDefined();
    expect(eg.severity).toBe('high');
  });

  // no trigger: edgeDelta=10, percent=0 (initial=0→10, percent guard gives 0)
  test('small stable growth → no edge_growth alert', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(24)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('edge_growth');
  });

  test('edge_growth evidence contains initial and latest edge counts', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(160)]) });
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg.evidence.some(function(e) { return e.includes('100'); })).toBe(true);
    expect(eg.evidence.some(function(e) { return e.includes('160'); })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Circular dependency growth detection
// ─────────────────────────────────────────────────────────────────────────────

describe('circular dependency growth detection', function() {
  test('delta = 1 → severity high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 1)]) });
    const cdg = r.alerts.find(function(a) { return a.type === 'circular_dependency_growth'; });
    expect(cdg).toBeDefined();
    expect(cdg.severity).toBe('high');
  });

  test('latest >= 3 with no growth → severity critical', function() {
    // Both snapshots have 3 circular deps, delta=0
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(20, 3)]) });
    const cdg = r.alerts.find(function(a) { return a.type === 'circular_dependency_growth'; });
    expect(cdg).toBeDefined();
    expect(cdg.severity).toBe('critical');
  });

  test('latest >= 3 with growth → severity critical (critical supersedes high)', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 1), ce(20, 4)]) });
    const cdg = r.alerts.find(function(a) { return a.type === 'circular_dependency_growth'; });
    expect(cdg.severity).toBe('critical');
  });

  test('no circular dependencies → no alert', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 0)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('circular_dependency_growth');
  });

  test('evidence contains initial and latest counts', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 2)]) });
    const cdg = r.alerts.find(function(a) { return a.type === 'circular_dependency_growth'; });
    expect(cdg.evidence.some(function(e) { return e.includes('0'); })).toBe(true);
    expect(cdg.evidence.some(function(e) { return e.includes('2'); })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Boundary coupling growth detection
// ─────────────────────────────────────────────────────────────────────────────

describe('boundary coupling growth detection', function() {
  test('boundaryViolationDelta = 1 → severity medium', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 0, 1)]) });
    const bcg = r.alerts.find(function(a) { return a.type === 'boundary_coupling_growth'; });
    expect(bcg).toBeDefined();
    expect(bcg.severity).toBe('medium');
  });

  test('boundaryViolationDelta = 3 → severity high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 0, 3)]) });
    const bcg = r.alerts.find(function(a) { return a.type === 'boundary_coupling_growth'; });
    expect(bcg.severity).toBe('high');
  });

  test('no growth in boundary violations → no alert', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 2), ce(20, 0, 2)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('boundary_coupling_growth');
  });

  test('evidence contains initial and latest violation counts', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 1), ce(20, 0, 4)]) });
    const bcg = r.alerts.find(function(a) { return a.type === 'boundary_coupling_growth'; });
    expect(bcg.evidence.some(function(e) { return e.includes('1'); })).toBe(true);
    expect(bcg.evidence.some(function(e) { return e.includes('4'); })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Sustained coupling pressure detection
// ─────────────────────────────────────────────────────────────────────────────

describe('sustained coupling pressure detection', function() {
  test('2 consecutive medium snapshots → severity medium', function() {
    // edges=50 → medium pressure (50 >= 50 rule)
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(50), ce(50)]) });
    const scp = r.alerts.find(function(a) { return a.type === 'sustained_coupling_pressure'; });
    expect(scp).toBeDefined();
    expect(scp.severity).toBe('medium');
  });

  test('2 consecutive high snapshots → severity high', function() {
    // edges=100 → high pressure
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(100), ce(100)]) });
    const scp = r.alerts.find(function(a) { return a.type === 'sustained_coupling_pressure'; });
    expect(scp).toBeDefined();
    expect(scp.severity).toBe('high');
  });

  test('3 consecutive high snapshots → severity critical', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(100), ce(100), ce(100)]) });
    const scp = r.alerts.find(function(a) { return a.type === 'sustained_coupling_pressure'; });
    expect(scp).toBeDefined();
    expect(scp.severity).toBe('critical');
  });

  test('single high snapshot → no sustained pressure alert', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(100)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('sustained_coupling_pressure');
  });

  test('high broken by low → no sustained high alert', function() {
    // [high, low, high] → last run is 1 high, no 2+ streak
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(20), ce(100)]) });
    const scp = r.alerts.find(function(a) { return a.type === 'sustained_coupling_pressure'; });
    if (scp) {
      // if triggered, must be via medium+ run — not high
      expect(scp.severity).not.toBe('high');
      expect(scp.severity).not.toBe('critical');
    }
  });

  test('evidence contains pressure run count', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(100), ce(100)]) });
    const scp = r.alerts.find(function(a) { return a.type === 'sustained_coupling_pressure'; });
    expect(scp.evidence.some(function(e) { return e.match(/\d+ snapshots/); })).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Coupling acceleration detection
// ─────────────────────────────────────────────────────────────────────────────

describe('coupling acceleration detection', function() {
  // n=3, midIdx=1: firstHalf=T[1]-T[0], secondHalf=T[2]-T[1]
  // accel=secondHalf-firstHalf

  test('acceleration = 25 → medium', function() {
    // T=[20, 25, 55]: firstHalf=5, secondHalf=30, accel=25
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(25), ce(55)]) });
    const ca = r.alerts.find(function(a) { return a.type === 'coupling_acceleration'; });
    expect(ca).toBeDefined();
    expect(ca.severity).toBe('medium');
  });

  test('acceleration = 50 → high', function() {
    // T=[20, 25, 80]: firstHalf=5, secondHalf=55, accel=50
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(25), ce(80)]) });
    const ca = r.alerts.find(function(a) { return a.type === 'coupling_acceleration'; });
    expect(ca).toBeDefined();
    expect(ca.severity).toBe('high');
  });

  test('no acceleration with only 2 snapshots → no alert', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(100)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('coupling_acceleration');
  });

  test('small acceleration < 25 → no alert', function() {
    // T=[20, 30, 50]: firstHalf=10, secondHalf=20, accel=10
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(30), ce(50)]) });
    const types = r.alerts.map(function(a) { return a.type; });
    expect(types).not.toContain('coupling_acceleration');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. couplingGrowthScore calculation
// ─────────────────────────────────────────────────────────────────────────────

describe('couplingGrowthScore calculation', function() {
  test('edge_growth low → score 10', function() {
    // Override pressure to 'low' so no sustained_coupling_pressure alert fires;
    // edgeDelta=30, percent=30% → edge_growth_low only → score=10
    const r = detectCouplingGrowthAlerts({ timelineData: td([ceP(100, 0, 0, 'low'), ceP(130, 0, 0, 'low')]) });
    expect(r.couplingGrowthScore).toBe(10);
  });

  test('circular_dependency_growth high → score 25', function() {
    // delta=1, latest=1 → high (25)
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 1)]) });
    expect(r.couplingGrowthScore).toBe(25);
  });

  test('circular_dependency_growth critical → score 40', function() {
    // [ce(20,0)→ce(20,3)]: circular delta=3, latest=3 → critical (40)
    // pressure: [low→high] → only 1 trailing high → no sustained pressure alert
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 3)]) });
    expect(r.couplingGrowthScore).toBe(40);
  });

  test('combined alerts accumulate correctly', function() {
    // [ce(20,0,0)→ce(20,3,1)]: circular critical(40) + boundary medium(15) = 55
    // pressure: [low→high] → only 1 trailing high → no sustained pressure alert
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 3, 1)]) });
    expect(r.couplingGrowthScore).toBe(55);
  });

  test('score capped at 100 for extreme scenarios', function() {
    // circular critical(40) + edge high(30) + boundary high(25) + sustained critical(30) = 125 → 100
    const r = detectCouplingGrowthAlerts({ timelineData: td([
      ce(100, 3, 0),
      ce(200, 4, 3),
      ce(210, 4, 3),
      ce(210, 4, 3),
    ]) });
    expect(r.couplingGrowthScore).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. alertLevel thresholds
// ─────────────────────────────────────────────────────────────────────────────

describe('alertLevel thresholds', function() {
  test('score 0 → alertLevel none', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.alertLevel).toBe('none');
  });

  test('score 10 (edge_growth low) → alertLevel watch', function() {
    // Override pressure to 'low' → edge_growth_low only → score=10 → watch
    const r = detectCouplingGrowthAlerts({ timelineData: td([ceP(100, 0, 0, 'low'), ceP(130, 0, 0, 'low')]) });
    expect(r.alertLevel).toBe('watch');
    expect(r.couplingGrowthScore).toBe(10);
  });

  test('score in alert range (30–69) → alertLevel alert', function() {
    // circular critical (40) → score=40 → alert
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(20, 3)]) });
    expect(r.alertLevel).toBe('alert');
  });

  test('score >= 70 → alertLevel critical', function() {
    // circular critical(40) + edge high(30) = 70
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(120, 3)]) });
    // edgeDelta=100 → edge_growth high (30), circular: latest=3 → critical (40)
    // total = 70 → critical
    expect(r.alertLevel).toBe('critical');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Confidence levels
// ─────────────────────────────────────────────────────────────────────────────

describe('confidence levels', function() {
  test('2 timeline points → confidence low', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.confidenceLevel).toBe('low');
  });

  test('3 timeline points → confidence medium', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22), ce(24)]) });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('5 timeline points → confidence high', function() {
    const entries = [ce(20), ce(22), ce(24), ce(26), ce(28)];
    const r = detectCouplingGrowthAlerts({ timelineData: td(entries) });
    expect(r.confidenceLevel).toBe('high');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Hotspots
// ─────────────────────────────────────────────────────────────────────────────

describe('hotspots', function() {
  test('latestCircularDeps = 1 → circular_dependencies hotspot severity high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 1)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'circular_dependencies'; });
    expect(hs).toBeDefined();
    expect(hs.severity).toBe('high');
  });

  test('latestCircularDeps = 3 → circular_dependencies hotspot severity critical', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(20, 3)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'circular_dependencies'; });
    expect(hs.severity).toBe('critical');
  });

  test('latestBoundaryViolations = 2 → boundary_violations hotspot medium', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 0, 2)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'boundary_violations'; });
    expect(hs).toBeDefined();
    expect(hs.severity).toBe('medium');
  });

  test('latestBoundaryViolations = 3 → boundary_violations hotspot high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 0, 3)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'boundary_violations'; });
    expect(hs.severity).toBe('high');
  });

  test('latestEdges = 50 → dense_dependency_graph hotspot medium', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(50)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'dense_dependency_graph'; });
    expect(hs).toBeDefined();
    expect(hs.severity).toBe('medium');
  });

  test('latestEdges >= 100 → dense_dependency_graph hotspot high', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(100)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'dense_dependency_graph'; });
    expect(hs.severity).toBe('high');
  });

  test('acceleration >= 25 and edgeDelta >= 25 → unstable_coupling_growth hotspot', function() {
    // T=[20,25,55]: accel=25, edgeDelta=35 → medium unstable_coupling_growth hotspot
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(25), ce(55)]) });
    const hs = r.hotspots.find(function(h) { return h.type === 'unstable_coupling_growth'; });
    expect(hs).toBeDefined();
    expect(hs.severity).toBe('medium');
  });

  test('no circular deps → no circular_dependencies hotspot', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0), ce(20, 0)]) });
    const types = r.hotspots.map(function(h) { return h.type; });
    expect(types).not.toContain('circular_dependencies');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Recommendations priority
// ─────────────────────────────────────────────────────────────────────────────

describe('recommendations priority', function() {
  test('circular dep growth recommendation appears first', function() {
    // circular growth + edge growth → circular rec should be first
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100, 0), ce(200, 1)]) });
    expect(r.recommendations[0]).toMatch(/[Cc]ircular/);
  });

  test('critical circular dep growth → critical-specific recommendation text', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(20, 3)]) });
    expect(r.recommendations[0]).toMatch(/Critical circular dependency/);
  });

  test('boundary growth rec appears after circular dep rec', function() {
    // Both circular growth and boundary growth
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 0, 0), ce(20, 1, 2)]) });
    const recs = r.recommendations;
    const ciIdx = recs.findIndex(function(rc) { return rc.match(/[Cc]ircular/); });
    const bvIdx = recs.findIndex(function(rc) { return rc.match(/[Bb]oundary violations/); });
    expect(ciIdx).toBeLessThan(bvIdx);
  });

  test('no alerts → maintenance recommendation', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.recommendations[0]).toMatch(/No coupling growth alerts/);
  });

  test('recommendations capped at 5', function() {
    // All 5 alert types: edge(high) + circular(critical) + boundary(high) + sustained(critical) + accel(high)
    const entries = [ce(100, 3, 0), ce(200, 4, 3), ce(210, 4, 3), ce(210, 4, 3)];
    const r = detectCouplingGrowthAlerts({ timelineData: td(entries) });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. couplingTrend shape and values
// ─────────────────────────────────────────────────────────────────────────────

describe('couplingTrend shape and values', function() {
  test('all required couplingTrend keys are present', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    const keys = [
      'initialEdges', 'latestEdges', 'edgeDelta', 'edgeGrowthPercent',
      'initialCircularDependencies', 'latestCircularDependencies', 'circularDependencyDelta',
      'initialBoundaryViolations', 'latestBoundaryViolations', 'boundaryViolationDelta',
      'pressureTimeline', 'latestPressure', 'pressureEscalated', 'acceleration',
    ];
    keys.forEach(function(k) { expect(r.couplingTrend).toHaveProperty(k); });
  });

  test('edgeDelta computed correctly', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(30), ce(80)]) });
    expect(r.couplingTrend.edgeDelta).toBe(50);
  });

  test('edgeGrowthPercent computed correctly', function() {
    // 30→60: percent = round((30/30)*100) = 100%
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(30), ce(60)]) });
    expect(r.couplingTrend.edgeGrowthPercent).toBe(100);
  });

  test('pressureTimeline is an array of pressure strings', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(50), ce(100)]) });
    expect(r.couplingTrend.pressureTimeline).toEqual(['low', 'medium', 'high']);
  });

  test('pressureEscalated is true when pressure increased', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(100)]) });
    // low → high = escalated
    expect(r.couplingTrend.pressureEscalated).toBe(true);
  });

  test('pressureEscalated is false when pressure is stable', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(100)]) });
    // high → high = not escalated
    expect(r.couplingTrend.pressureEscalated).toBe(false);
  });

  test('acceleration is 0 for 2 timeline points', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(80)]) });
    expect(r.couplingTrend.acceleration).toBe(0);
  });

  test('acceleration computed correctly for 3 timeline points', function() {
    // midIdx=1: firstHalf=T[1]-T[0]=5, secondHalf=T[2]-T[1]=30, accel=25
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(25), ce(55)]) });
    expect(r.couplingTrend.acceleration).toBe(25);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Output shape
// ─────────────────────────────────────────────────────────────────────────────

describe('output shape', function() {
  test('all required top-level keys present', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    ['alertLevel', 'couplingGrowthScore', 'confidenceLevel', 'summary',
      'alerts', 'hotspots', 'couplingTrend', 'recommendations'].forEach(function(k) {
      expect(r).toHaveProperty(k);
    });
  });

  test('each alert entry has required fields', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(100), ce(130)]) });
    r.alerts.forEach(function(a) {
      expect(a).toHaveProperty('type');
      expect(a).toHaveProperty('severity');
      expect(a).toHaveProperty('summary');
      expect(a).toHaveProperty('evidence');
      expect(Array.isArray(a.evidence)).toBe(true);
    });
  });

  test('each hotspot entry has required fields', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 1), ce(20, 1)]) });
    r.hotspots.forEach(function(h) {
      expect(h).toHaveProperty('type');
      expect(h).toHaveProperty('severity');
      expect(h).toHaveProperty('summary');
      expect(h).toHaveProperty('evidence');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Non-mutation
// ─────────────────────────────────────────────────────────────────────────────

describe('non-mutation', function() {
  test('input snapshots array is not modified', function() {
    const snaps = [makeSnap({ totalEdges: 20 }), makeSnap({ totalEdges: 80 })];
    const originalLength = snaps.length;
    const originalEdges  = snaps[0].metrics.totalEdges;
    detectCouplingGrowthAlerts({ snapshots: snaps });
    expect(snaps.length).toBe(originalLength);
    expect(snaps[0].metrics.totalEdges).toBe(originalEdges);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Deterministic output
// ─────────────────────────────────────────────────────────────────────────────

describe('deterministic output', function() {
  test('same input produces identical output on repeated calls', function() {
    const input = { timelineData: td([ce(100), ce(160), ce(200)]) };
    const r1 = detectCouplingGrowthAlerts(input);
    const r2 = detectCouplingGrowthAlerts(input);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Summary strings
// ─────────────────────────────────────────────────────────────────────────────

describe('summary strings', function() {
  test('unknown → insufficient history message', function() {
    expect(detectCouplingGrowthAlerts({ snapshots: [] }).summary).toMatch(/at least 2 snapshots/);
  });

  test('none → no coupling concerns message', function() {
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20), ce(22)]) });
    expect(r.summary).toMatch(/No coupling growth concerns/);
  });

  test('watch → early coupling growth signals message', function() {
    // edge_growth_low only (score=10) → watch
    const r = detectCouplingGrowthAlerts({ timelineData: td([ceP(100, 0, 0, 'low'), ceP(130, 0, 0, 'low')]) });
    expect(r.summary).toMatch(/Early coupling growth signals/);
  });

  test('alert → significant coupling growth message', function() {
    // circular critical (40) → alert
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(20, 3)]) });
    expect(r.summary).toMatch(/Significant coupling growth/);
  });

  test('critical → critical coupling growth message', function() {
    // circular critical(40) + edge high(30) = 70 → critical
    const r = detectCouplingGrowthAlerts({ timelineData: td([ce(20, 3), ce(120, 3)]) });
    expect(r.summary).toMatch(/Critical coupling growth/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Builds timeline from raw snapshots
// ─────────────────────────────────────────────────────────────────────────────

describe('builds timeline from raw snapshots', function() {
  test('edge growth detected from raw snapshots via buildArchitectureTrendTimeline', function() {
    const snaps = [
      makeSnap({ totalEdges: 20 }),
      makeSnap({ totalEdges: 120 }),  // delta=100 → edge_growth high
    ];
    const r = detectCouplingGrowthAlerts({ snapshots: snaps });
    expect(r.alertLevel).not.toBe('unknown');
    const eg = r.alerts.find(function(a) { return a.type === 'edge_growth'; });
    expect(eg).toBeDefined();
  });

  test('circular dependency detected from raw snapshots', function() {
    const snaps = [
      makeSnap({ circularDeps: 0 }),
      makeSnap({ circularDeps: 1 }),
    ];
    const r = detectCouplingGrowthAlerts({ snapshots: snaps });
    const cdg = r.alerts.find(function(a) { return a.type === 'circular_dependency_growth'; });
    expect(cdg).toBeDefined();
    expect(cdg.severity).toBe('high');
  });
});
