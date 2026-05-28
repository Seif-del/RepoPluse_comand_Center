'use strict';

const { diffArchitectureSnapshots } = require('../../../../execution/architecture/diffArchitectureSnapshots');

// ── Snapshot factory ───────────────────────────────────────────────────────────
// Creates a minimal but structurally complete snapshot mirroring the output of
// buildRepositoryArchitectureSnapshot.

function makeSnap({
  architectureHealthScore = 75,
  architectureHealthLevel = 'healthy',
  metrics                 = {},
  violations              = [],
  unresolvedFrontendCalls = [],
  methodMismatches        = [],
  implSignals             = [],
  completenessScore       = 80,
} = {}) {
  return {
    architectureHealthScore,
    architectureHealthLevel,
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
    implementationCompleteness: { completenessScore, signals: implSignals },
  };
}

// Convenience: clone a snapshot and apply overrides (non-mutating).
function override(base, overrides) {
  return Object.assign({}, base, overrides);
}

// ── Unknown-result assertions ─────────────────────────────────────────────────

function expectUnknown(result) {
  expect(result.changeType).toBe('unknown');
  expect(result.scoreDelta).toBe(0);
  expect(result.levelChange).toEqual({ from: null, to: null, changed: false });
  expect(result.summary).toMatch(/required/i);
  expect(result.metricChanges).toEqual([]);
  expect(result.addedRisks).toEqual([]);
  expect(result.removedRisks).toEqual([]);
  expect(result.persistentRisks).toEqual([]);
  expect(result.recommendations).toEqual([]);
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. Guard / unknown cases
// ═════════════════════════════════════════════════════════════════════════════

describe('guard cases — returns unknown', () => {
  test('null params', () => {
    expectUnknown(diffArchitectureSnapshots(null));
  });

  test('undefined params', () => {
    expectUnknown(diffArchitectureSnapshots(undefined));
  });

  test('missing before', () => {
    expectUnknown(diffArchitectureSnapshots({ after: makeSnap() }));
  });

  test('missing after', () => {
    expectUnknown(diffArchitectureSnapshots({ before: makeSnap() }));
  });

  test('both missing', () => {
    expectUnknown(diffArchitectureSnapshots({}));
  });

  test('before has NaN architectureHealthScore', () => {
    const before = makeSnap();
    before.architectureHealthScore = NaN;
    expectUnknown(diffArchitectureSnapshots({ before, after: makeSnap() }));
  });

  test('after has NaN architectureHealthScore', () => {
    const after = makeSnap();
    after.architectureHealthScore = NaN;
    expectUnknown(diffArchitectureSnapshots({ before: makeSnap(), after }));
  });

  test('before missing architectureHealthScore entirely', () => {
    const before = makeSnap();
    delete before.architectureHealthScore;
    expectUnknown(diffArchitectureSnapshots({ before, after: makeSnap() }));
  });

  test('unknown result apiChanges are all zero', () => {
    const r = diffArchitectureSnapshots(null);
    expect(r.apiChanges.unresolvedFrontendCallDelta).toBe(0);
    expect(r.apiChanges.methodMismatchDelta).toBe(0);
    expect(r.apiChanges.orphanedBackendRouteDelta).toBe(0);
    expect(r.apiChanges.linkedEndpointDelta).toBe(0);
    expect(r.apiChanges.frontendCoverageDelta).toBe(0);
    expect(r.apiChanges.backendCoverageDelta).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. Score delta
// ═════════════════════════════════════════════════════════════════════════════

describe('scoreDelta', () => {
  test('positive delta when score increases', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 60 }),
      after:  makeSnap({ architectureHealthScore: 80 }),
    });
    expect(r.scoreDelta).toBe(20);
  });

  test('negative delta when score decreases', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90 }),
      after:  makeSnap({ architectureHealthScore: 70 }),
    });
    expect(r.scoreDelta).toBe(-20);
  });

  test('zero delta when scores are equal', () => {
    const snap = makeSnap({ architectureHealthScore: 75 });
    const r = diffArchitectureSnapshots({ before: snap, after: makeSnap({ architectureHealthScore: 75 }) });
    expect(r.scoreDelta).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. changeType
// ═════════════════════════════════════════════════════════════════════════════

describe('changeType', () => {
  test('improved: scoreDelta >= +10 and no added risks', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 65 }),
      after:  makeSnap({ architectureHealthScore: 80 }),
    });
    expect(r.changeType).toBe('improved');
  });

  test('not improved when scoreDelta >= +10 but addedRisks exist', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 65 }),
      after:  makeSnap({
        architectureHealthScore: 80,
        violations: [{ type: 'cross_boundary' }],
      }),
    });
    expect(r.changeType).not.toBe('improved');
  });

  test('degraded: scoreDelta <= -10', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90 }),
      after:  makeSnap({ architectureHealthScore: 75 }),
    });
    expect(r.changeType).toBe('degraded');
  });

  test('degraded: addedRisks > removedRisks even with stable score', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 70 }),
      after:  makeSnap({
        architectureHealthScore: 70,
        violations: [{ type: 'cross_boundary' }, { type: 'service_leak' }],
      }),
    });
    expect(r.changeType).toBe('degraded');
  });

  test('mixed: both addedRisks and removedRisks exist', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 70, violations: [{ type: 'old_violation' }] }),
      after:  makeSnap({ architectureHealthScore: 72, violations: [{ type: 'new_violation' }] }),
    });
    expect(r.changeType).toBe('mixed');
  });

  test('unchanged: small score movement with no risk changes', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 70 }),
      after:  makeSnap({ architectureHealthScore: 75 }),
    });
    expect(r.changeType).toBe('unchanged');
  });

  test('unchanged: identical snapshots', () => {
    const snap = makeSnap({ architectureHealthScore: 75 });
    const r = diffArchitectureSnapshots({ before: snap, after: makeSnap({ architectureHealthScore: 75 }) });
    expect(r.changeType).toBe('unchanged');
  });

  test('degraded takes priority over mixed when scoreDelta <= -10 and risks change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90, violations: [{ type: 'old' }] }),
      after:  makeSnap({ architectureHealthScore: 75, violations: [{ type: 'new' }] }),
    });
    expect(r.changeType).toBe('degraded');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. Level change
// ═════════════════════════════════════════════════════════════════════════════

describe('levelChange', () => {
  test('changed: true when levels differ', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthLevel: 'watch' }),
      after:  makeSnap({ architectureHealthLevel: 'healthy' }),
    });
    expect(r.levelChange.from).toBe('watch');
    expect(r.levelChange.to).toBe('healthy');
    expect(r.levelChange.changed).toBe(true);
  });

  test('changed: false when levels are the same', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthLevel: 'healthy' }),
      after:  makeSnap({ architectureHealthLevel: 'healthy' }),
    });
    expect(r.levelChange.changed).toBe(false);
    expect(r.levelChange.from).toBe('healthy');
    expect(r.levelChange.to).toBe('healthy');
  });

  test('degraded level change reflected correctly', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90, architectureHealthLevel: 'healthy' }),
      after:  makeSnap({ architectureHealthScore: 70, architectureHealthLevel: 'watch' }),
    });
    expect(r.levelChange.from).toBe('healthy');
    expect(r.levelChange.to).toBe('watch');
    expect(r.levelChange.changed).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. Summary text
// ═════════════════════════════════════════════════════════════════════════════

describe('summary', () => {
  test('improved → "improved"', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 65 }),
      after:  makeSnap({ architectureHealthScore: 80 }),
    });
    expect(r.summary.toLowerCase()).toContain('improved');
  });

  test('degraded → "degraded"', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90 }),
      after:  makeSnap({ architectureHealthScore: 70 }),
    });
    expect(r.summary.toLowerCase()).toContain('degraded');
  });

  test('mixed → "mixed signals"', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 70, violations: [{ type: 'old' }] }),
      after:  makeSnap({ architectureHealthScore: 72, violations: [{ type: 'new' }] }),
    });
    expect(r.summary.toLowerCase()).toContain('mixed');
  });

  test('unchanged → "unchanged"', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 75 }),
      after:  makeSnap({ architectureHealthScore: 75 }),
    });
    expect(r.summary.toLowerCase()).toContain('unchanged');
  });

  test('summary includes both scores and delta', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 60 }),
      after:  makeSnap({ architectureHealthScore: 80 }),
    });
    expect(r.summary).toContain('60');
    expect(r.summary).toContain('80');
    expect(r.summary).toContain('+20');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. Metric changes
// ═════════════════════════════════════════════════════════════════════════════

describe('metricChanges', () => {
  const EXPECTED_KEYS = [
    'totalFiles', 'totalEdges', 'backendRouteCount', 'frontendApiCallCount',
    'linkedEndpointCount', 'unresolvedFrontendCallCount', 'orphanedBackendRouteCount',
    'circularDependencyCount', 'boundaryViolationCount', 'implementationSignalCount',
  ];

  test('returns one entry per metric key', () => {
    const r = diffArchitectureSnapshots({ before: makeSnap(), after: makeSnap() });
    expect(r.metricChanges).toHaveLength(10);
    const returnedKeys = r.metricChanges.map(function(m) { return m.metric; });
    EXPECTED_KEYS.forEach(function(k) { expect(returnedKeys).toContain(k); });
  });

  test('each entry has before, after, delta, direction', () => {
    const r = diffArchitectureSnapshots({ before: makeSnap(), after: makeSnap() });
    r.metricChanges.forEach(function(m) {
      expect(m).toHaveProperty('metric');
      expect(m).toHaveProperty('before');
      expect(m).toHaveProperty('after');
      expect(m).toHaveProperty('delta');
      expect(m).toHaveProperty('direction');
    });
  });

  test('direction = increased when after > before', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalFiles: 10 } }),
      after:  makeSnap({ metrics: { totalFiles: 20 } }),
    });
    const tf = r.metricChanges.find(function(m) { return m.metric === 'totalFiles'; });
    expect(tf.delta).toBe(10);
    expect(tf.direction).toBe('increased');
  });

  test('direction = decreased when after < before', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 50 } }),
      after:  makeSnap({ metrics: { totalEdges: 30 } }),
    });
    const te = r.metricChanges.find(function(m) { return m.metric === 'totalEdges'; });
    expect(te.delta).toBe(-20);
    expect(te.direction).toBe('decreased');
  });

  test('direction = unchanged when values are equal', () => {
    const r = diffArchitectureSnapshots({ before: makeSnap(), after: makeSnap() });
    const bc = r.metricChanges.find(function(m) { return m.metric === 'backendRouteCount'; });
    expect(bc.delta).toBe(0);
    expect(bc.direction).toBe('unchanged');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. Risk signal classification
// ═════════════════════════════════════════════════════════════════════════════

describe('risk signals', () => {
  test('addedRisks: signals present in after but not before', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }] }),
    });
    expect(r.addedRisks).toContain('cross_boundary');
    expect(r.removedRisks).not.toContain('cross_boundary');
    expect(r.persistentRisks).not.toContain('cross_boundary');
  });

  test('removedRisks: signals present in before but not after', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ violations: [{ type: 'service_leak' }] }),
      after:  makeSnap(),
    });
    expect(r.removedRisks).toContain('service_leak');
    expect(r.addedRisks).not.toContain('service_leak');
    expect(r.persistentRisks).not.toContain('service_leak');
  });

  test('persistentRisks: signals present in both', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ violations: [{ type: 'cross_boundary' }] }),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }] }),
    });
    expect(r.persistentRisks).toContain('cross_boundary');
    expect(r.addedRisks).not.toContain('cross_boundary');
    expect(r.removedRisks).not.toContain('cross_boundary');
  });

  test('unresolved frontend calls → "unresolved_frontend_api" in addedRisks', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ unresolvedFrontendCalls: ['/api/missing'] }),
    });
    expect(r.addedRisks).toContain('unresolved_frontend_api');
  });

  test('method mismatches → "method_mismatch" in addedRisks', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ methodMismatches: [{ route: '/api/x' }] }),
    });
    expect(r.addedRisks).toContain('method_mismatch');
  });

  test('circularDependencyCount > 0 → "circular_dependency" in addedRisks', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ metrics: { circularDependencyCount: 2 } }),
    });
    expect(r.addedRisks).toContain('circular_dependency');
  });

  test('implementation signal types appear in addedRisks', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ implSignals: [{ type: 'scaffold_like_file' }] }),
    });
    expect(r.addedRisks).toContain('scaffold_like_file');
  });

  test('no signals in either snapshot → all signal arrays empty', () => {
    const r = diffArchitectureSnapshots({ before: makeSnap(), after: makeSnap() });
    expect(r.addedRisks).toEqual([]);
    expect(r.removedRisks).toEqual([]);
    expect(r.persistentRisks).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. API changes
// ═════════════════════════════════════════════════════════════════════════════

describe('apiChanges', () => {
  test('unresolvedFrontendCallDelta reflects metric change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { unresolvedFrontendCallCount: 2 } }),
      after:  makeSnap({ metrics: { unresolvedFrontendCallCount: 5 } }),
    });
    expect(r.apiChanges.unresolvedFrontendCallDelta).toBe(3);
  });

  test('methodMismatchDelta reflects array length change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ methodMismatches: [{ route: '/a' }] }),
      after:  makeSnap({ methodMismatches: [{ route: '/a' }, { route: '/b' }] }),
    });
    expect(r.apiChanges.methodMismatchDelta).toBe(1);
  });

  test('linkedEndpointDelta reflects metric change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { linkedEndpointCount: 3 } }),
      after:  makeSnap({ metrics: { linkedEndpointCount: 5 } }),
    });
    expect(r.apiChanges.linkedEndpointDelta).toBe(2);
  });

  test('frontendCoverageDelta: 0 when frontendApiCallCount is 0', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { frontendApiCallCount: 0, linkedEndpointCount: 0 } }),
      after:  makeSnap({ metrics: { frontendApiCallCount: 0, linkedEndpointCount: 0 } }),
    });
    expect(r.apiChanges.frontendCoverageDelta).toBe(0);
  });

  test('frontendCoverageDelta reflects proportional change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { frontendApiCallCount: 4, linkedEndpointCount: 2 } }),
      after:  makeSnap({ metrics: { frontendApiCallCount: 4, linkedEndpointCount: 4 } }),
    });
    // before: 50%, after: 100%, delta: +50
    expect(r.apiChanges.frontendCoverageDelta).toBe(50);
  });

  test('backendCoverageDelta: 0 when backendRouteCount is 0', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { backendRouteCount: 0, linkedEndpointCount: 0 } }),
      after:  makeSnap({ metrics: { backendRouteCount: 0, linkedEndpointCount: 0 } }),
    });
    expect(r.apiChanges.backendCoverageDelta).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. Boundary changes
// ═════════════════════════════════════════════════════════════════════════════

describe('boundaryChanges', () => {
  test('boundaryViolationDelta is positive when violations increase', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ violations: [{ type: 'cross_boundary' }] }),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }, { type: 'service_leak' }] }),
    });
    expect(r.boundaryChanges.boundaryViolationDelta).toBe(1);
  });

  test('addedViolationTypes: types in after not in before', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }] }),
    });
    expect(r.boundaryChanges.addedViolationTypes).toContain('cross_boundary');
    expect(r.boundaryChanges.removedViolationTypes).not.toContain('cross_boundary');
  });

  test('removedViolationTypes: types in before not in after', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ violations: [{ type: 'service_leak' }] }),
      after:  makeSnap(),
    });
    expect(r.boundaryChanges.removedViolationTypes).toContain('service_leak');
    expect(r.boundaryChanges.addedViolationTypes).not.toContain('service_leak');
  });

  test('persistentViolationTypes: types in both snapshots', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ violations: [{ type: 'cross_boundary' }, { type: 'old' }] }),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }, { type: 'new' }] }),
    });
    expect(r.boundaryChanges.persistentViolationTypes).toContain('cross_boundary');
    expect(r.boundaryChanges.addedViolationTypes).toContain('new');
    expect(r.boundaryChanges.removedViolationTypes).toContain('old');
  });

  test('all boundary arrays empty when no violations in either snapshot', () => {
    const r = diffArchitectureSnapshots({ before: makeSnap(), after: makeSnap() });
    expect(r.boundaryChanges.addedViolationTypes).toEqual([]);
    expect(r.boundaryChanges.removedViolationTypes).toEqual([]);
    expect(r.boundaryChanges.persistentViolationTypes).toEqual([]);
    expect(r.boundaryChanges.boundaryViolationDelta).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. Coupling changes
// ═════════════════════════════════════════════════════════════════════════════

describe('couplingChanges', () => {
  test('totalEdgesDelta positive when edges grow', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 20 } }),
      after:  makeSnap({ metrics: { totalEdges: 35 } }),
    });
    expect(r.couplingChanges.totalEdgesDelta).toBe(15);
  });

  test('circularDependencyDelta positive when circulars increase', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { circularDependencyCount: 1 } }),
      after:  makeSnap({ metrics: { circularDependencyCount: 4 } }),
    });
    expect(r.couplingChanges.circularDependencyDelta).toBe(3);
  });

  test('couplingGrowthLevel = none when both deltas <= 0', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 30, circularDependencyCount: 2 } }),
      after:  makeSnap({ metrics: { totalEdges: 25, circularDependencyCount: 1 } }),
    });
    expect(r.couplingChanges.couplingGrowthLevel).toBe('none');
  });

  test('couplingGrowthLevel = low when edges grow <= 10 with no new circulars', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 20, circularDependencyCount: 0 } }),
      after:  makeSnap({ metrics: { totalEdges: 28, circularDependencyCount: 0 } }),
    });
    expect(r.couplingChanges.couplingGrowthLevel).toBe('low');
  });

  test('couplingGrowthLevel = medium when 1+ new circular deps', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 20, circularDependencyCount: 0 } }),
      after:  makeSnap({ metrics: { totalEdges: 22, circularDependencyCount: 1 } }),
    });
    expect(r.couplingChanges.couplingGrowthLevel).toBe('medium');
  });

  test('couplingGrowthLevel = high when 3+ new circular deps', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { circularDependencyCount: 0 } }),
      after:  makeSnap({ metrics: { circularDependencyCount: 3 } }),
    });
    expect(r.couplingChanges.couplingGrowthLevel).toBe('high');
  });

  test('couplingGrowthLevel = high when edge growth > 30', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { totalEdges: 10, circularDependencyCount: 0 } }),
      after:  makeSnap({ metrics: { totalEdges: 45, circularDependencyCount: 0 } }),
    });
    expect(r.couplingChanges.couplingGrowthLevel).toBe('high');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. Implementation changes
// ═════════════════════════════════════════════════════════════════════════════

describe('implementationChanges', () => {
  test('completenessScoreDelta reflects completenessScore change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ completenessScore: 70 }),
      after:  makeSnap({ completenessScore: 85 }),
    });
    expect(r.implementationChanges.completenessScoreDelta).toBe(15);
  });

  test('implementationSignalDelta reflects signal count change', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [] }),
      after:  makeSnap({ implSignals: [{ type: 'scaffold_like_file' }, { type: 'placeholder_code_hint' }] }),
    });
    expect(r.implementationChanges.implementationSignalDelta).toBe(2);
  });

  test('placeholderHintDelta counts only placeholder_code_hint type', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [] }),
      after:  makeSnap({ implSignals: [{ type: 'placeholder_code_hint' }, { type: 'scaffold_like_file' }] }),
    });
    expect(r.implementationChanges.placeholderHintDelta).toBe(1);
  });

  test('scaffoldLikeFileDelta counts only scaffold_like_file type', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [{ type: 'scaffold_like_file' }] }),
      after:  makeSnap({ implSignals: [] }),
    });
    expect(r.implementationChanges.scaffoldLikeFileDelta).toBe(-1);
  });

  test('addedSignalTypes: types in after but not before', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [] }),
      after:  makeSnap({ implSignals: [{ type: 'route_without_tests' }] }),
    });
    expect(r.implementationChanges.addedSignalTypes).toContain('route_without_tests');
    expect(r.implementationChanges.removedSignalTypes).not.toContain('route_without_tests');
  });

  test('removedSignalTypes: types in before but not after', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [{ type: 'model_without_usage' }] }),
      after:  makeSnap({ implSignals: [] }),
    });
    expect(r.implementationChanges.removedSignalTypes).toContain('model_without_usage');
  });

  test('persistentSignalTypes: types in both snapshots', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [{ type: 'scaffold_like_file' }] }),
      after:  makeSnap({ implSignals: [{ type: 'scaffold_like_file' }, { type: 'placeholder_code_hint' }] }),
    });
    expect(r.implementationChanges.persistentSignalTypes).toContain('scaffold_like_file');
    expect(r.implementationChanges.addedSignalTypes).toContain('placeholder_code_hint');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. Recommendations
// ═════════════════════════════════════════════════════════════════════════════

describe('recommendations', () => {
  test('at most 5 recommendations returned', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 90 }),
      after:  makeSnap({
        architectureHealthScore: 70,
        violations: [{ type: 'cross_boundary' }],
        unresolvedFrontendCalls: ['/api/x'],
        metrics: { circularDependencyCount: 2 },
        implSignals: [{ type: 'scaffold_like_file' }],
      }),
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('added risks trigger first recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }] }),
    });
    expect(r.recommendations[0]).toMatch(/new risk/i);
  });

  test('increased unresolved API calls trigger recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { unresolvedFrontendCallCount: 0 } }),
      after:  makeSnap({ metrics: { unresolvedFrontendCallCount: 3 } }),
    });
    expect(r.recommendations.join(' ')).toMatch(/unresolved/i);
  });

  test('new boundary violation types trigger recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap(),
      after:  makeSnap({ violations: [{ type: 'cross_boundary' }] }),
    });
    expect(r.recommendations.join(' ')).toMatch(/boundary/i);
  });

  test('new circular dependencies trigger recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ metrics: { circularDependencyCount: 0 } }),
      after:  makeSnap({ metrics: { circularDependencyCount: 2 } }),
    });
    expect(r.recommendations.join(' ')).toMatch(/circular/i);
  });

  test('increased implementation signals trigger recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ implSignals: [] }),
      after:  makeSnap({ implSignals: [{ type: 'scaffold_like_file' }] }),
    });
    expect(r.recommendations.join(' ')).toMatch(/implementation|signal|placeholder|scaffold/i);
  });

  test('improved changeType appends a "maintain" recommendation', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 65 }),
      after:  makeSnap({ architectureHealthScore: 80 }),
    });
    expect(r.recommendations.join(' ')).toMatch(/maintain/i);
  });

  test('no recommendations for fully clean unchanged snapshot', () => {
    const r = diffArchitectureSnapshots({
      before: makeSnap({ architectureHealthScore: 75 }),
      after:  makeSnap({ architectureHealthScore: 75 }),
    });
    expect(r.recommendations).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. Determinism and non-mutation
// ═════════════════════════════════════════════════════════════════════════════

describe('determinism and non-mutation', () => {
  test('calling twice with same input yields identical output', () => {
    const before = makeSnap({ architectureHealthScore: 60, violations: [{ type: 'cross_boundary' }] });
    const after  = makeSnap({ architectureHealthScore: 80 });
    const r1 = diffArchitectureSnapshots({ before, after });
    const r2 = diffArchitectureSnapshots({ before, after });
    expect(r1).toEqual(r2);
  });

  test('before snapshot is not mutated', () => {
    const before = makeSnap({ architectureHealthScore: 60 });
    const after  = makeSnap({ architectureHealthScore: 80 });
    const snapshot = JSON.stringify(before);
    diffArchitectureSnapshots({ before, after });
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  test('after snapshot is not mutated', () => {
    const before = makeSnap({ architectureHealthScore: 60 });
    const after  = makeSnap({ architectureHealthScore: 80 });
    const snapshot = JSON.stringify(after);
    diffArchitectureSnapshots({ before, after });
    expect(JSON.stringify(after)).toBe(snapshot);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. Missing field safety
// ═════════════════════════════════════════════════════════════════════════════

describe('missing field safety', () => {
  test('snapshot without metrics field does not throw', () => {
    const before = { architectureHealthScore: 70 };
    const after  = { architectureHealthScore: 80 };
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('snapshot without boundaryVerification does not throw', () => {
    const before = { architectureHealthScore: 70, metrics: {} };
    const after  = { architectureHealthScore: 80, metrics: {} };
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('snapshot without apiLinkage does not throw', () => {
    const before = { architectureHealthScore: 70 };
    const after  = { architectureHealthScore: 80 };
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('snapshot without implementationCompleteness does not throw', () => {
    const before = { architectureHealthScore: 70 };
    const after  = { architectureHealthScore: 80 };
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('violations array with null entries does not throw', () => {
    const before = makeSnap();
    before.boundaryVerification.violations = [null, { type: 'cross_boundary' }];
    const after = makeSnap();
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('implementationCompleteness.signals with null entry does not throw', () => {
    const before = makeSnap();
    before.implementationCompleteness.signals = [null, { type: 'scaffold_like_file' }];
    const after = makeSnap();
    expect(() => diffArchitectureSnapshots({ before, after })).not.toThrow();
  });

  test('missing completenessScore treated as 0', () => {
    const before = { architectureHealthScore: 70 };
    const after  = { architectureHealthScore: 80, implementationCompleteness: { completenessScore: 90, signals: [] } };
    const r = diffArchitectureSnapshots({ before, after });
    expect(r.implementationChanges.completenessScoreDelta).toBe(90);
  });
});
