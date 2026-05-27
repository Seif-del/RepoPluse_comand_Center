'use strict';

// analyzeArchitectureDrift
// Computes architecture drift between the oldest and newest snapshots in a series.
//
// Input:  { snapshots: [{ snapshotAt, architectureHealthScore, architectureHealthLevel,
//           confidenceLevel, metrics, boundaryVerification, apiLinkage,
//           implementationCompleteness }] }
// Output: { driftDirection, driftSeverity, delta, latestScore, oldestScore,
//           confidenceLevel, summary, metricDeltas, newRiskSignals,
//           resolvedRiskSignals, persistentRiskSignals, drivers, recommendations }
//
// Pure function — no I/O, no mutation of input.
// Risk signal language uses static-analysis framing (candidate/observed) except where
// the backend already uses the word "violation."

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

// ── Sorting ───────────────────────────────────────────────────────────────────
// When any snapshot has a parseable snapshotAt, sort ascending (oldest → latest).
// When no dates exist, treat input as newest-first and reverse to get oldest-first.

function _sortedSnapshots(snapshots) {
  const hasAnyDate = snapshots.some(function(s) {
    return s && s.snapshotAt && !isNaN(new Date(s.snapshotAt).getTime());
  });

  if (!hasAnyDate) {
    return snapshots.slice().reverse();
  }

  return snapshots.slice().sort(function(a, b) {
    const da = (a && a.snapshotAt) ? new Date(a.snapshotAt).getTime() : 0;
    const db = (b && b.snapshotAt) ? new Date(b.snapshotAt).getTime() : 0;
    return da - db;
  });
}

// ── Metric extraction ─────────────────────────────────────────────────────────
// Reads from snapshot.metrics first; falls back to structural paths for derived
// counts (boundaryViolationCount, implementationSignalCount).

function _getMetric(snapshot, key) {
  const m = snapshot && snapshot.metrics;
  if (m && m[key] !== undefined && m[key] !== null) {
    return Number(m[key]) || 0;
  }
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

function _metricDeltas(oldest, latest) {
  const deltas = {};
  METRIC_KEYS.forEach(function(key) {
    deltas[key] = _getMetric(latest, key) - _getMetric(oldest, key);
  });
  return deltas;
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

// ── Drift direction ───────────────────────────────────────────────────────────

function _driftDirection(delta) {
  if (delta >= 10)  return 'improving';
  if (delta <= -10) return 'degrading';
  return 'stable';
}

// ── Drift severity ────────────────────────────────────────────────────────────

function _driftSeverity(delta) {
  const abs = Math.abs(delta);
  if (abs >= 30) return 'high';
  if (abs >= 15) return 'medium';
  if (abs >= 10) return 'low';
  return 'none';
}

// ── Drift confidence ──────────────────────────────────────────────────────────

function _driftConfidence(snapshots, latestSnap) {
  const n    = snapshots.length;
  const conf = latestSnap && latestSnap.confidenceLevel;

  if (n < 3 || conf === 'low') return 'low';
  if (n >= 5 && (conf === 'high' || conf === 'medium')) return 'high';
  return 'medium';
}

// ── Drivers ───────────────────────────────────────────────────────────────────

function _drivers(direction, deltas, newSignals, resolvedSignals) {
  const d = [];

  if (direction === 'improving') {
    d.push('Architecture health score has improved, indicating structural progress.');
  } else if (direction === 'degrading') {
    d.push('Architecture health score has declined, indicating structural regression.');
  } else {
    d.push('Architecture health score is stable.');
  }

  if (deltas.unresolvedFrontendCallCount > 0) {
    d.push('Unresolved frontend API calls have increased by ' + deltas.unresolvedFrontendCallCount + '.');
  }
  if (deltas.boundaryViolationCount > 0) {
    d.push('Boundary violations have increased by ' + deltas.boundaryViolationCount + '.');
  }
  if (deltas.circularDependencyCount > 0) {
    d.push('Circular dependencies have grown by ' + deltas.circularDependencyCount + '.');
  }
  if (deltas.implementationSignalCount > 0) {
    d.push('Implementation weakness signals have increased by ' + deltas.implementationSignalCount + '.');
  }
  if (deltas.totalEdges > 0) {
    d.push('Dependency coupling has grown by ' + deltas.totalEdges + ' edges.');
  }
  if (resolvedSignals.length > 0) {
    d.push('Resolved risk signals: ' + resolvedSignals.join(', ') + '.');
  }
  if (newSignals.length > 0) {
    d.push('New risk signals observed: ' + newSignals.join(', ') + '.');
  }

  return d;
}

// ── Recommendations ───────────────────────────────────────────────────────────

const MAX_RECS = 5;

function _recommendations(direction, deltas, newSignals, persistentSignals) {
  const recs = [];

  if (direction === 'improving') {
    recs.push('Maintain current architectural practices that have driven score improvement.');
    if (persistentSignals.length > 0) {
      recs.push('Monitor persistent risk signals (' + persistentSignals.slice(0, 3).join(', ') + ') to prevent regression.');
    }
    if (deltas.unresolvedFrontendCallCount > 0) {
      recs.push('Despite overall improvement, unresolved frontend API calls have grown — address these to sustain gains.');
    }
    if (deltas.boundaryViolationCount > 0) {
      recs.push('Despite overall improvement, boundary violations have increased — review new violations.');
    }
  } else {
    if (deltas.unresolvedFrontendCallCount > 0) {
      recs.push('Resolve unresolved frontend API calls to prevent API integration drift.');
    }
    if (deltas.boundaryViolationCount > 0) {
      recs.push('Address new boundary violations to preserve architectural layer separation.');
    }
    if (deltas.circularDependencyCount > 0) {
      recs.push('Break circular dependencies introduced since the last snapshot.');
    }
    if (deltas.implementationSignalCount > 0) {
      recs.push('Review new implementation weakness signals and resolve placeholder or scaffold patterns.');
    }
    if (deltas.totalEdges > 5) {
      recs.push('Audit new dependency coupling — high edge growth can indicate unwanted tight coupling.');
    }
    if (persistentSignals.indexOf('circular_dependency') !== -1) {
      recs.push('Persistent circular dependencies detected — prioritize dependency restructuring.');
    }
    if (persistentSignals.indexOf('unresolved_frontend_api') !== -1) {
      recs.push('Persistent unresolved frontend API calls — verify route registration and naming conventions.');
    }
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(direction, severity, delta, latestScore, oldestScore, n) {
  if (direction === 'unknown') {
    return 'Insufficient snapshot history to determine architecture drift.';
  }

  const sign      = delta >= 0 ? '+' : '';
  const scoreLine = 'Score moved from ' + oldestScore + ' to ' + latestScore
    + ' (' + sign + delta + ') across ' + n + ' snapshot' + (n === 1 ? '' : 's') + '.';

  if (direction === 'improving') {
    return 'Architecture health is improving. ' + scoreLine;
  }
  if (direction === 'degrading') {
    const sevTxt = severity === 'high'   ? 'severe '
                 : severity === 'medium' ? 'moderate '
                 : '';
    return 'Architecture health is experiencing ' + sevTxt + 'degradation. ' + scoreLine;
  }
  return 'Architecture health is stable. ' + scoreLine;
}

// ── Unknown result factory ────────────────────────────────────────────────────

function _unknownResult() {
  const metricDeltas = {};
  METRIC_KEYS.forEach(function(k) { metricDeltas[k] = 0; });
  return {
    driftDirection:        'unknown',
    driftSeverity:         'unknown',
    delta:                 0,
    latestScore:           null,
    oldestScore:           null,
    confidenceLevel:       'low',
    summary:               'Insufficient snapshot history to determine architecture drift.',
    metricDeltas,
    newRiskSignals:        [],
    resolvedRiskSignals:   [],
    persistentRiskSignals: [],
    drivers:               [],
    recommendations:       [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Analyze architecture drift across a series of repository snapshots.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ snapshots: Array }} [params]
 * @returns {object}
 */
function analyzeArchitectureDrift(params) {
  const raw = (params && Array.isArray(params.snapshots)) ? params.snapshots : [];

  const usable = raw.filter(function(s) {
    return s && typeof s.architectureHealthScore === 'number' && !isNaN(s.architectureHealthScore);
  });

  if (usable.length < 2) return _unknownResult();

  const sorted      = _sortedSnapshots(usable);
  const oldest      = sorted[0];
  const latest      = sorted[sorted.length - 1];
  const oldestScore = oldest.architectureHealthScore;
  const latestScore = latest.architectureHealthScore;
  const delta       = latestScore - oldestScore;

  const direction  = _driftDirection(delta);
  const severity   = _driftSeverity(delta);
  const confidence = _driftConfidence(sorted, latest);
  const deltas     = _metricDeltas(oldest, latest);

  const oldestSignals    = _extractRiskSignals(oldest);
  const latestSignals    = _extractRiskSignals(latest);
  const newSignals       = Array.from(latestSignals).filter(function(s) { return !oldestSignals.has(s); });
  const resolvedSignals  = Array.from(oldestSignals).filter(function(s) { return !latestSignals.has(s); });
  const persistentSignals = Array.from(oldestSignals).filter(function(s) { return latestSignals.has(s); });

  const driversArr = _drivers(direction, deltas, newSignals, resolvedSignals);
  const recsArr    = _recommendations(direction, deltas, newSignals, persistentSignals);

  return {
    driftDirection:        direction,
    driftSeverity:         severity,
    delta,
    latestScore,
    oldestScore,
    confidenceLevel:       confidence,
    summary:               _summary(direction, severity, delta, latestScore, oldestScore, sorted.length),
    metricDeltas:          deltas,
    newRiskSignals:        newSignals,
    resolvedRiskSignals:   resolvedSignals,
    persistentRiskSignals: persistentSignals,
    drivers:               driversArr,
    recommendations:       recsArr,
  };
}

module.exports = { analyzeArchitectureDrift };
