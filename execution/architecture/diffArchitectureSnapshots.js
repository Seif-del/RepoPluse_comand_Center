'use strict';

// diffArchitectureSnapshots
// Computes a detailed diff between two architecture snapshots.
//
// Input:  { before, after } — both shaped like buildRepositoryArchitectureSnapshot output
// Output: { changeType, scoreDelta, levelChange, summary, metricChanges,
//           addedRisks, removedRisks, persistentRisks,
//           apiChanges, boundaryChanges, couplingChanges, implementationChanges,
//           recommendations }
//
// Pure function — no I/O, no mutation of input.

const METRIC_KEYS = [
  'totalFiles',
  'totalEdges',
  'backendRouteCount',
  'frontendApiCallCount',
  'linkedEndpointCount',
  'unresolvedFrontendCallCount',
  'orphanedBackendRouteCount',
  'circularDependencyCount',
  'boundaryViolationCount',
  'implementationSignalCount',
];

// ── Metric extraction ─────────────────────────────────────────────────────────
// Reads from snapshot.metrics first; falls back to structural paths for derived
// counts (boundaryViolationCount, implementationSignalCount).

function _getMetric(snapshot, key) {
  const m = snapshot && snapshot.metrics;
  if (m && m[key] !== undefined && m[key] !== null) return Number(m[key]) || 0;
  if (key === 'boundaryViolationCount') {
    const viols = (snapshot && snapshot.boundaryVerification && snapshot.boundaryVerification.violations) || [];
    return Array.isArray(viols) ? viols.length : 0;
  }
  if (key === 'implementationSignalCount') {
    const sigs = (snapshot && snapshot.implementationCompleteness && snapshot.implementationCompleteness.signals) || [];
    return Array.isArray(sigs) ? sigs.length : 0;
  }
  return 0;
}

// ── Risk signal extraction ────────────────────────────────────────────────────
// Returns a Set of signal-type strings observed in a single snapshot.

function _extractRiskSignals(snapshot) {
  const signals = new Set();

  // 1. Boundary violation types
  const viols = (snapshot && snapshot.boundaryVerification && snapshot.boundaryVerification.violations) || [];
  (Array.isArray(viols) ? viols : []).forEach(function(v) {
    if (v && v.type) signals.add(v.type);
  });

  // 2. Unresolved frontend API calls → synthetic signal key
  const unresolved = (snapshot && snapshot.apiLinkage && snapshot.apiLinkage.unresolvedFrontendCalls) || [];
  if (Array.isArray(unresolved) && unresolved.length > 0) signals.add('unresolved_frontend_api');

  // 3. HTTP method mismatches → synthetic signal key
  const mismatches = (snapshot && snapshot.apiLinkage && snapshot.apiLinkage.methodMismatches) || [];
  if (Array.isArray(mismatches) && mismatches.length > 0) signals.add('method_mismatch');

  // 4. Circular dependencies (from metrics)
  if (_getMetric(snapshot, 'circularDependencyCount') > 0) signals.add('circular_dependency');

  // 5. Implementation completeness signal types
  const implSignals = (snapshot && snapshot.implementationCompleteness && snapshot.implementationCompleteness.signals) || [];
  (Array.isArray(implSignals) ? implSignals : []).forEach(function(s) {
    if (s && s.type) signals.add(s.type);
  });

  return signals;
}

// ── Violation-type set extraction ─────────────────────────────────────────────

function _extractViolationTypes(snapshot) {
  const viols = (snapshot && snapshot.boundaryVerification && snapshot.boundaryVerification.violations) || [];
  const types = new Set();
  (Array.isArray(viols) ? viols : []).forEach(function(v) {
    if (v && v.type) types.add(v.type);
  });
  return types;
}

// ── Implementation signal-type set extraction ─────────────────────────────────

function _extractImplSignalTypes(snapshot) {
  const sigs = (snapshot && snapshot.implementationCompleteness && snapshot.implementationCompleteness.signals) || [];
  const types = new Set();
  (Array.isArray(sigs) ? sigs : []).forEach(function(s) {
    if (s && s.type) types.add(s.type);
  });
  return types;
}

// ── Coverage helpers ──────────────────────────────────────────────────────────

function _frontendCoverage(snapshot) {
  const total = _getMetric(snapshot, 'frontendApiCallCount');
  if (total === 0) return 0;
  return Math.round((_getMetric(snapshot, 'linkedEndpointCount') / total) * 100);
}

function _backendCoverage(snapshot) {
  const total = _getMetric(snapshot, 'backendRouteCount');
  if (total === 0) return 0;
  return Math.round((_getMetric(snapshot, 'linkedEndpointCount') / total) * 100);
}

// ── Signal-type count helper ──────────────────────────────────────────────────

function _countSigType(snapshot, type) {
  const sigs = (snapshot && snapshot.implementationCompleteness && snapshot.implementationCompleteness.signals) || [];
  return (Array.isArray(sigs) ? sigs : []).filter(function(s) { return s && s.type === type; }).length;
}

// ── Coupling growth level ─────────────────────────────────────────────────────

function _couplingGrowthLevel(totalEdgesDelta, circularDependencyDelta) {
  if (totalEdgesDelta <= 0 && circularDependencyDelta <= 0) return 'none';
  if (circularDependencyDelta >= 3 || totalEdgesDelta > 30) return 'high';
  if (circularDependencyDelta >= 1 || totalEdgesDelta > 10) return 'medium';
  return 'low';
}

// ── Change type ───────────────────────────────────────────────────────────────
// Priority: improved → degraded → mixed → unchanged.

function _changeType(scoreDelta, addedRisks, removedRisks) {
  if (scoreDelta >= 10 && addedRisks.length === 0) return 'improved';
  if (scoreDelta <= -10 || addedRisks.length > removedRisks.length) return 'degraded';
  if (addedRisks.length > 0 && removedRisks.length > 0) return 'mixed';
  return 'unchanged';
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(changeType, scoreDelta, before, after) {
  const sign      = scoreDelta >= 0 ? '+' : '';
  const scoreLine = 'Score moved from ' + before.architectureHealthScore
    + ' to ' + after.architectureHealthScore + ' (' + sign + scoreDelta + ').';

  if (changeType === 'improved')  return 'Architecture health improved. '            + scoreLine;
  if (changeType === 'degraded')  return 'Architecture health degraded. '            + scoreLine;
  if (changeType === 'mixed')     return 'Architecture health shows mixed signals. ' + scoreLine;
  return                                 'Architecture health is unchanged. '        + scoreLine;
}

// ── Recommendations ───────────────────────────────────────────────────────────

const MAX_RECS = 5;

function _recommendations(changeType, addedRisks, apiChanges, boundaryChanges, couplingChanges, implementationChanges) {
  const recs = [];

  // 1. Added risks (highest priority)
  if (addedRisks.length > 0) {
    recs.push(
      'New risk signals detected (' + addedRisks.slice(0, 3).join(', ') +
      ') — review and address before merging.'
    );
  }

  // 2. Increased unresolved API calls
  if (apiChanges.unresolvedFrontendCallDelta > 0) {
    recs.push(
      'Unresolved frontend API calls increased by ' + apiChanges.unresolvedFrontendCallDelta +
      ' — verify route registration and naming conventions.'
    );
  }

  // 3. New boundary violations
  if (boundaryChanges.addedViolationTypes.length > 0) {
    recs.push(
      'New boundary violation types detected (' +
      boundaryChanges.addedViolationTypes.slice(0, 2).join(', ') +
      ') — preserve architectural layer separation.'
    );
  }

  // 4. New circular dependencies
  if (couplingChanges.circularDependencyDelta > 0) {
    recs.push(
      'Circular dependencies increased by ' + couplingChanges.circularDependencyDelta +
      ' — restructure imports to break cycles.'
    );
  }

  // 5. Increased implementation signals
  if (implementationChanges.implementationSignalDelta > 0) {
    recs.push(
      'Implementation weakness signals increased by ' + implementationChanges.implementationSignalDelta +
      ' — resolve placeholder or scaffold patterns.'
    );
  }

  // 6. Preserve improvements
  if (recs.length < MAX_RECS && (changeType === 'improved' || changeType === 'mixed')) {
    recs.push('Maintain architectural practices that contributed to score improvement.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Unknown result factory ────────────────────────────────────────────────────

function _unknownResult() {
  return {
    changeType:    'unknown',
    scoreDelta:    0,
    levelChange:   { from: null, to: null, changed: false },
    summary:       'Both before and after snapshots are required for diff analysis.',
    metricChanges: [],
    addedRisks:    [],
    removedRisks:  [],
    persistentRisks: [],
    apiChanges: {
      unresolvedFrontendCallDelta: 0,
      methodMismatchDelta:         0,
      orphanedBackendRouteDelta:   0,
      linkedEndpointDelta:         0,
      frontendCoverageDelta:       0,
      backendCoverageDelta:        0,
    },
    boundaryChanges: {
      boundaryViolationDelta:   0,
      addedViolationTypes:      [],
      removedViolationTypes:    [],
      persistentViolationTypes: [],
    },
    couplingChanges: {
      totalEdgesDelta:         0,
      circularDependencyDelta: 0,
      couplingGrowthLevel:     'none',
    },
    implementationChanges: {
      completenessScoreDelta:    0,
      implementationSignalDelta: 0,
      placeholderHintDelta:      0,
      scaffoldLikeFileDelta:     0,
      addedSignalTypes:          [],
      removedSignalTypes:        [],
      persistentSignalTypes:     [],
    },
    recommendations: [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute a detailed diff between two architecture snapshots.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ before: object, after: object }} [params]
 * @returns {object}
 */
function diffArchitectureSnapshots(params) {
  const before = params && params.before;
  const after  = params && params.after;

  if (!before || !after) return _unknownResult();
  if (typeof before.architectureHealthScore !== 'number' || isNaN(before.architectureHealthScore)) return _unknownResult();
  if (typeof after.architectureHealthScore  !== 'number' || isNaN(after.architectureHealthScore))  return _unknownResult();

  // ── Score delta ───────────────────────────────────────────────────────────
  const scoreDelta = after.architectureHealthScore - before.architectureHealthScore;

  // ── Level change ──────────────────────────────────────────────────────────
  const fromLevel  = before.architectureHealthLevel || null;
  const toLevel    = after.architectureHealthLevel  || null;
  const levelChange = { from: fromLevel, to: toLevel, changed: fromLevel !== toLevel };

  // ── Risk signals ──────────────────────────────────────────────────────────
  const beforeSignals   = _extractRiskSignals(before);
  const afterSignals    = _extractRiskSignals(after);
  const addedRisks      = Array.from(afterSignals).filter(function(s) { return !beforeSignals.has(s); });
  const removedRisks    = Array.from(beforeSignals).filter(function(s) { return !afterSignals.has(s); });
  const persistentRisks = Array.from(beforeSignals).filter(function(s) { return afterSignals.has(s); });

  // ── Change type ───────────────────────────────────────────────────────────
  const changeType = _changeType(scoreDelta, addedRisks, removedRisks);

  // ── Metric changes ────────────────────────────────────────────────────────
  const metricChanges = METRIC_KEYS.map(function(key) {
    const bVal  = _getMetric(before, key);
    const aVal  = _getMetric(after,  key);
    const delta = aVal - bVal;
    return {
      metric:    key,
      before:    bVal,
      after:     aVal,
      delta:     delta,
      direction: delta > 0 ? 'increased' : delta < 0 ? 'decreased' : 'unchanged',
    };
  });

  // ── API changes ───────────────────────────────────────────────────────────
  const beforeMismatches = (before.apiLinkage && before.apiLinkage.methodMismatches) || [];
  const afterMismatches  = (after.apiLinkage  && after.apiLinkage.methodMismatches)  || [];

  const apiChanges = {
    unresolvedFrontendCallDelta: _getMetric(after, 'unresolvedFrontendCallCount') - _getMetric(before, 'unresolvedFrontendCallCount'),
    methodMismatchDelta:         afterMismatches.length  - beforeMismatches.length,
    orphanedBackendRouteDelta:   _getMetric(after, 'orphanedBackendRouteCount')   - _getMetric(before, 'orphanedBackendRouteCount'),
    linkedEndpointDelta:         _getMetric(after, 'linkedEndpointCount')          - _getMetric(before, 'linkedEndpointCount'),
    frontendCoverageDelta:       _frontendCoverage(after)  - _frontendCoverage(before),
    backendCoverageDelta:        _backendCoverage(after)   - _backendCoverage(before),
  };

  // ── Boundary changes ──────────────────────────────────────────────────────
  const beforeViolTypes = _extractViolationTypes(before);
  const afterViolTypes  = _extractViolationTypes(after);

  const boundaryChanges = {
    boundaryViolationDelta:   _getMetric(after, 'boundaryViolationCount') - _getMetric(before, 'boundaryViolationCount'),
    addedViolationTypes:      Array.from(afterViolTypes).filter(function(t) { return !beforeViolTypes.has(t); }),
    removedViolationTypes:    Array.from(beforeViolTypes).filter(function(t) { return !afterViolTypes.has(t); }),
    persistentViolationTypes: Array.from(beforeViolTypes).filter(function(t) { return afterViolTypes.has(t); }),
  };

  // ── Coupling changes ──────────────────────────────────────────────────────
  const totalEdgesDelta         = _getMetric(after, 'totalEdges')              - _getMetric(before, 'totalEdges');
  const circularDependencyDelta = _getMetric(after, 'circularDependencyCount') - _getMetric(before, 'circularDependencyCount');

  const couplingChanges = {
    totalEdgesDelta,
    circularDependencyDelta,
    couplingGrowthLevel: _couplingGrowthLevel(totalEdgesDelta, circularDependencyDelta),
  };

  // ── Implementation changes ────────────────────────────────────────────────
  const beforeImplScore = (before.implementationCompleteness &&
    typeof before.implementationCompleteness.completenessScore === 'number')
    ? before.implementationCompleteness.completenessScore : 0;
  const afterImplScore  = (after.implementationCompleteness &&
    typeof after.implementationCompleteness.completenessScore  === 'number')
    ? after.implementationCompleteness.completenessScore  : 0;

  const beforeSigTypes = _extractImplSignalTypes(before);
  const afterSigTypes  = _extractImplSignalTypes(after);

  const implementationChanges = {
    completenessScoreDelta:    afterImplScore - beforeImplScore,
    implementationSignalDelta: _getMetric(after, 'implementationSignalCount') - _getMetric(before, 'implementationSignalCount'),
    placeholderHintDelta:      _countSigType(after, 'placeholder_code_hint') - _countSigType(before, 'placeholder_code_hint'),
    scaffoldLikeFileDelta:     _countSigType(after, 'scaffold_like_file')    - _countSigType(before, 'scaffold_like_file'),
    addedSignalTypes:          Array.from(afterSigTypes).filter(function(t) { return !beforeSigTypes.has(t); }),
    removedSignalTypes:        Array.from(beforeSigTypes).filter(function(t) { return !afterSigTypes.has(t); }),
    persistentSignalTypes:     Array.from(beforeSigTypes).filter(function(t) { return afterSigTypes.has(t); }),
  };

  // ── Summary ───────────────────────────────────────────────────────────────
  const summary = _summary(changeType, scoreDelta, before, after);

  // ── Recommendations ───────────────────────────────────────────────────────
  const recommendations = _recommendations(
    changeType, addedRisks, apiChanges, boundaryChanges, couplingChanges, implementationChanges
  );

  return {
    changeType,
    scoreDelta,
    levelChange,
    summary,
    metricChanges,
    addedRisks,
    removedRisks,
    persistentRisks,
    apiChanges,
    boundaryChanges,
    couplingChanges,
    implementationChanges,
    recommendations,
  };
}

module.exports = { diffArchitectureSnapshots };
