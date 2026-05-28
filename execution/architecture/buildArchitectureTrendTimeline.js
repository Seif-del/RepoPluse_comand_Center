'use strict';

// buildArchitectureTrendTimeline
// Converts a series of architecture snapshots into timeline-ready trend data.
//
// Input:  { snapshots: [{ snapshotAt, architectureHealthScore, architectureHealthLevel,
//           confidenceLevel, metrics, boundaryVerification, apiLinkage,
//           implementationCompleteness }] }
// Output: { timeline, scoreTimeline, levelTransitions, riskSignalTimeline,
//           couplingTimeline, apiIntegrationTimeline, implementationTimeline,
//           driftEvents, summary, recommendations }
//
// Pure function — no I/O, no mutation of input.
// Sorting: when any snapshot carries a parseable snapshotAt, all snapshots are
// sorted ascending (oldest → newest). When no dates exist, input order is
// preserved and treated as oldest-first (contrast: analyzeArchitectureDrift
// treats undated input as newest-first and reverses — that is intentionally
// different behaviour for that function's endpoint-comparison semantics).

const LEVEL_RANK = { unknown: 0, risky: 1, weak: 2, watch: 3, healthy: 4 };
const MAX_RECS   = 5;

// ── Level utilities ───────────────────────────────────────────────────────────

function _levelRank(level) {
  return LEVEL_RANK[level] !== undefined ? LEVEL_RANK[level] : 0;
}

function _levelDirection(fromLevel, toLevel) {
  const fr = _levelRank(fromLevel);
  const tr = _levelRank(toLevel);
  if (tr > fr) return 'improved';
  if (tr < fr) return 'degraded';
  return 'unchanged';
}

// ── Sorting ───────────────────────────────────────────────────────────────────

function _sortedSnapshots(snapshots) {
  const hasAnyDate = snapshots.some(function(s) {
    return s && s.snapshotAt && !isNaN(new Date(s.snapshotAt).getTime());
  });
  if (!hasAnyDate) return snapshots.slice();   // preserve input order as oldest-first
  return snapshots.slice().sort(function(a, b) {
    const da = (a && a.snapshotAt) ? new Date(a.snapshotAt).getTime() : 0;
    const db = (b && b.snapshotAt) ? new Date(b.snapshotAt).getTime() : 0;
    return da - db;
  });
}

// ── Metric extraction ─────────────────────────────────────────────────────────

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

function _extractRiskSignals(snapshot) {
  const signals = new Set();

  const viols = (snapshot && snapshot.boundaryVerification && snapshot.boundaryVerification.violations) || [];
  (Array.isArray(viols) ? viols : []).forEach(function(v) {
    if (v && v.type) signals.add(v.type);
  });

  const unresolved = (snapshot && snapshot.apiLinkage && snapshot.apiLinkage.unresolvedFrontendCalls) || [];
  if (Array.isArray(unresolved) && unresolved.length > 0) signals.add('unresolved_frontend_api');

  const mismatches = (snapshot && snapshot.apiLinkage && snapshot.apiLinkage.methodMismatches) || [];
  if (Array.isArray(mismatches) && mismatches.length > 0) signals.add('method_mismatch');

  if (_getMetric(snapshot, 'circularDependencyCount') > 0) signals.add('circular_dependency');

  const implSignals = (snapshot && snapshot.implementationCompleteness && snapshot.implementationCompleteness.signals) || [];
  (Array.isArray(implSignals) ? implSignals : []).forEach(function(s) {
    if (s && s.type) signals.add(s.type);
  });

  return signals;
}

function _extractBoundaryViolationTypes(snapshot) {
  const viols = (snapshot && snapshot.boundaryVerification && snapshot.boundaryVerification.violations) || [];
  const types = new Set();
  (Array.isArray(viols) ? viols : []).forEach(function(v) {
    if (v && v.type) types.add(v.type);
  });
  return types;
}

// ── Coverage helpers ──────────────────────────────────────────────────────────

function _frontendCoveragePercent(snapshot) {
  const total = _getMetric(snapshot, 'frontendApiCallCount');
  if (total === 0) return 0;
  return Math.round((_getMetric(snapshot, 'linkedEndpointCount') / total) * 100);
}

function _backendCoveragePercent(snapshot) {
  const total = _getMetric(snapshot, 'backendRouteCount');
  if (total === 0) return 0;
  return Math.round((_getMetric(snapshot, 'linkedEndpointCount') / total) * 100);
}

function _methodMismatchCount(snapshot) {
  const m = (snapshot && snapshot.apiLinkage && snapshot.apiLinkage.methodMismatches) || [];
  return Array.isArray(m) ? m.length : 0;
}

// ── Coupling pressure ─────────────────────────────────────────────────────────
// Rule 16: high  → circularDependencyCount > 0 OR totalEdges >= 100
//          medium → totalEdges >= 50 OR boundaryViolationCount > 0
//          low   → otherwise

function _couplingPressure(totalEdges, circularDependencyCount, boundaryViolationCount) {
  if (circularDependencyCount > 0 || totalEdges >= 100) return 'high';
  if (totalEdges >= 50 || boundaryViolationCount > 0)   return 'medium';
  return 'low';
}

// ── New-risk severity ─────────────────────────────────────────────────────────
// circular_dependency → high; boundary violation type → high; else medium.

function _newRiskSeverity(riskType, boundaryViolationTypes) {
  if (riskType === 'circular_dependency') return 'high';
  if (boundaryViolationTypes.has(riskType)) return 'high';
  return 'medium';
}

// ── Drift event builder ───────────────────────────────────────────────────────
// Events are emitted only for snapshots at index >= 1 (require a previous
// snapshot to compare against).

function _buildDriftEvents(sorted) {
  const events = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev        = sorted[i - 1];
    const curr        = sorted[i];
    const snapshotAt  = curr.snapshotAt || null;

    const prevScore   = prev.architectureHealthScore;
    const currScore   = curr.architectureHealthScore;
    const delta       = currScore - prevScore;

    const prevLevel   = prev.architectureHealthLevel || null;
    const currLevel   = curr.architectureHealthLevel || null;
    const prevRank    = _levelRank(prevLevel);
    const currRank    = _levelRank(currLevel);
    const rankDelta   = currRank - prevRank;

    const prevRisks   = _extractRiskSignals(prev);
    const currRisks   = _extractRiskSignals(curr);
    const newRisks    = Array.from(currRisks).filter(function(s) { return !prevRisks.has(s); });
    const resolvedRisks = Array.from(prevRisks).filter(function(s) { return !currRisks.has(s); });
    const currBoundaryViolTypes = _extractBoundaryViolationTypes(curr);

    // 1. score_drop
    if (delta <= -10) {
      let sev = 'low';
      if (delta <= -30)      sev = 'high';
      else if (delta <= -15) sev = 'medium';
      events.push({
        snapshotAt,
        type:    'score_drop',
        severity: sev,
        summary: 'Architecture health score dropped by ' + Math.abs(delta) + ' points.',
      });
    }

    // 2. score_gain
    if (delta >= 10) {
      events.push({
        snapshotAt,
        type:    'score_gain',
        severity: 'low',
        summary: 'Architecture health score improved by ' + delta + ' points.',
      });
    }

    // 3. level_degraded
    if (rankDelta < 0) {
      events.push({
        snapshotAt,
        type:    'level_degraded',
        severity: rankDelta <= -2 ? 'high' : 'medium',
        summary: 'Architecture health level degraded from ' + prevLevel + ' to ' + currLevel + '.',
      });
    }

    // 4. level_improved
    if (rankDelta > 0) {
      events.push({
        snapshotAt,
        type:    'level_improved',
        severity: 'low',
        summary: 'Architecture health level improved from ' + prevLevel + ' to ' + currLevel + '.',
      });
    }

    // 5. new_risk — one event per new risk signal
    newRisks.forEach(function(risk) {
      events.push({
        snapshotAt,
        type:    'new_risk',
        severity: _newRiskSeverity(risk, currBoundaryViolTypes),
        summary: 'New risk signal detected: ' + risk + '.',
      });
    });

    // 6. resolved_risk — one event per resolved risk signal
    resolvedRisks.forEach(function(risk) {
      events.push({
        snapshotAt,
        type:    'resolved_risk',
        severity: 'low',
        summary: 'Risk signal resolved: ' + risk + '.',
      });
    });

    // 7. coupling_growth
    const prevTotalEdges      = _getMetric(prev, 'totalEdges');
    const currTotalEdges      = _getMetric(curr, 'totalEdges');
    const edgesDelta          = currTotalEdges - prevTotalEdges;
    const prevCircular        = _getMetric(prev, 'circularDependencyCount');
    const currCircular        = _getMetric(curr, 'circularDependencyCount');
    const circularGrew        = currCircular > prevCircular;

    if (edgesDelta >= 25 || circularGrew) {
      events.push({
        snapshotAt,
        type:    'coupling_growth',
        severity: circularGrew ? 'high' : 'medium',
        summary: 'Dependency coupling pressure increased — total edges: ' + currTotalEdges
          + (circularGrew ? ', circular dependencies: ' + currCircular + '.' : '.'),
      });
    }

    // 8. api_regression
    const prevUnresolved = _getMetric(prev, 'unresolvedFrontendCallCount');
    const currUnresolved = _getMetric(curr, 'unresolvedFrontendCallCount');
    const prevMismatch   = _methodMismatchCount(prev);
    const currMismatch   = _methodMismatchCount(curr);

    if (currUnresolved > prevUnresolved || currMismatch > prevMismatch) {
      events.push({
        snapshotAt,
        type:    'api_regression',
        severity: 'medium',
        summary: 'API integration regression detected — unresolved calls: ' + currUnresolved
          + ', method mismatches: ' + currMismatch + '.',
      });
    }

    // 9. implementation_regression
    const prevImplSignals = _getMetric(prev, 'implementationSignalCount');
    const currImplSignals = _getMetric(curr, 'implementationSignalCount');

    if (currImplSignals > prevImplSignals) {
      events.push({
        snapshotAt,
        type:    'implementation_regression',
        severity: 'medium',
        summary: 'Implementation signal regression detected — signal count: ' + currImplSignals + '.',
      });
    }
  }

  return events;
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(driftEvents) {
  const recs     = [];
  const typesSeen = new Set(driftEvents.map(function(e) { return e.type; }));

  const highEvents = driftEvents.filter(function(e) { return e.severity === 'high'; });

  if (highEvents.some(function(e) { return e.type === 'score_drop'; }) && recs.length < MAX_RECS) {
    recs.push('Significant architecture score degradation detected — prioritize structural refactoring and root-cause analysis.');
  }

  if (highEvents.some(function(e) { return e.type === 'level_degraded'; }) && recs.length < MAX_RECS) {
    recs.push('Severe level degradation detected — review architectural layer boundaries and coupling immediately.');
  }

  if (highEvents.some(function(e) { return e.type === 'coupling_growth'; }) && recs.length < MAX_RECS) {
    recs.push('High coupling growth with circular dependencies — audit import structure and break dependency cycles.');
  }

  if (highEvents.some(function(e) { return e.type === 'new_risk'; }) && recs.length < MAX_RECS) {
    recs.push('High-severity risk signals detected — resolve circular dependencies and boundary violations before next release.');
  }

  if (typesSeen.has('api_regression') && recs.length < MAX_RECS) {
    recs.push('Recurring API integration regressions — verify route registration and frontend call patterns.');
  }

  if (typesSeen.has('implementation_regression') && recs.length < MAX_RECS) {
    recs.push('Implementation signal regressions observed — resolve placeholder and scaffold patterns before merging.');
  }

  const hasDegradation = driftEvents.some(function(e) {
    return ['score_drop', 'level_degraded', 'coupling_growth', 'api_regression', 'implementation_regression'].includes(e.type);
  });

  if (!hasDegradation && recs.length < MAX_RECS) {
    recs.push('Architecture health is stable — maintain current practices and continue regular snapshot reviews.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(sorted, driftEvents) {
  if (sorted.length === 0) return 'No architecture snapshots available.';
  if (sorted.length === 1) {
    return 'Single architecture snapshot available; insufficient history for trend analysis.';
  }

  const firstScore = sorted[0].architectureHealthScore;
  const lastScore  = sorted[sorted.length - 1].architectureHealthScore;
  const delta      = lastScore - firstScore;
  const n          = sorted.length;
  const sign       = delta >= 0 ? '+' : '';

  const highDegradations = driftEvents.filter(function(e) {
    return e.severity === 'high' && ['score_drop', 'level_degraded', 'coupling_growth'].includes(e.type);
  }).length;

  if (delta >= 10 && highDegradations === 0) {
    return 'Architecture health improved across ' + n + ' snapshots (score: '
      + firstScore + ' → ' + lastScore + ', ' + sign + delta + ').';
  }
  if (delta <= -10) {
    return 'Architecture health degraded across ' + n + ' snapshots (score: '
      + firstScore + ' → ' + lastScore + ', ' + sign + delta + ').';
  }
  if (highDegradations > 0) {
    return 'Architecture health is unstable across ' + n + ' snapshots with '
      + highDegradations + ' high-severity event(s) detected.';
  }
  return 'Architecture health is stable across ' + n + ' snapshots (score: '
    + firstScore + ' → ' + lastScore + ', ' + sign + delta + ').';
}

// ── Empty result factory ──────────────────────────────────────────────────────

function _emptyResult() {
  return {
    timeline:               [],
    scoreTimeline:          [],
    levelTransitions:       [],
    riskSignalTimeline:     [],
    couplingTimeline:       [],
    apiIntegrationTimeline: [],
    implementationTimeline: [],
    driftEvents:            [],
    summary:                'No architecture snapshots available.',
    recommendations:        [],
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Convert historical architecture snapshots into timeline-ready trend data.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ snapshots: Array }} [params]
 * @returns {object}
 */
function buildArchitectureTrendTimeline(params) {
  const raw = (params && Array.isArray(params.snapshots)) ? params.snapshots : [];

  const usable = raw.filter(function(s) {
    return s && typeof s.architectureHealthScore === 'number' && !isNaN(s.architectureHealthScore);
  });

  if (usable.length === 0) return _emptyResult();

  const sorted     = _sortedSnapshots(usable);
  const firstScore = sorted[0].architectureHealthScore;

  const timeline               = [];
  const scoreTimeline          = [];
  const levelTransitions       = [];
  const riskSignalTimeline     = [];
  const couplingTimeline       = [];
  const apiIntegrationTimeline = [];
  const implementationTimeline = [];

  let prevLevel   = null;
  let prevSignals = null;

  sorted.forEach(function(snap, i) {
    const snapshotAt = snap.snapshotAt || null;
    const score      = snap.architectureHealthScore;
    const level      = snap.architectureHealthLevel || null;

    // ── timeline ──────────────────────────────────────────────────────────
    timeline.push({
      snapshotAt,
      score,
      level,
      confidenceLevel: snap.confidenceLevel || null,
      metrics:         snap.metrics         || {},
    });

    // ── scoreTimeline ─────────────────────────────────────────────────────
    const prevScore       = i === 0 ? score : sorted[i - 1].architectureHealthScore;
    const deltaFromPrev   = i === 0 ? 0 : score - prevScore;
    scoreTimeline.push({
      snapshotAt,
      score,
      deltaFromPrevious: deltaFromPrev,
      deltaFromFirst:    score - firstScore,
    });

    // ── levelTransitions ──────────────────────────────────────────────────
    levelTransitions.push({
      snapshotAt,
      from:      i === 0 ? null : prevLevel,
      to:        level,
      direction: i === 0 ? 'unchanged' : _levelDirection(prevLevel, level),
    });

    // ── riskSignalTimeline ────────────────────────────────────────────────
    const currSignals = _extractRiskSignals(snap);
    const risks       = Array.from(currSignals);
    let   newRisks, resolvedRisks, persistentRisks;

    if (i === 0) {
      newRisks        = risks.slice();
      resolvedRisks   = [];
      persistentRisks = [];
    } else {
      newRisks        = risks.filter(function(s) { return !prevSignals.has(s); });
      resolvedRisks   = Array.from(prevSignals).filter(function(s) { return !currSignals.has(s); });
      persistentRisks = risks.filter(function(s) { return prevSignals.has(s); });
    }
    riskSignalTimeline.push({ snapshotAt, risks, newRisks, resolvedRisks, persistentRisks });

    // ── couplingTimeline ──────────────────────────────────────────────────
    const totalEdges              = _getMetric(snap, 'totalEdges');
    const circularDependencyCount = _getMetric(snap, 'circularDependencyCount');
    const boundaryViolationCount  = _getMetric(snap, 'boundaryViolationCount');
    couplingTimeline.push({
      snapshotAt,
      totalEdges,
      circularDependencyCount,
      boundaryViolationCount,
      couplingPressure: _couplingPressure(totalEdges, circularDependencyCount, boundaryViolationCount),
    });

    // ── apiIntegrationTimeline ────────────────────────────────────────────
    apiIntegrationTimeline.push({
      snapshotAt,
      frontendCoveragePercent:     _frontendCoveragePercent(snap),
      backendCoveragePercent:      _backendCoveragePercent(snap),
      unresolvedFrontendCallCount: _getMetric(snap, 'unresolvedFrontendCallCount'),
      methodMismatchCount:         _methodMismatchCount(snap),
      orphanedBackendRouteCount:   _getMetric(snap, 'orphanedBackendRouteCount'),
    });

    // ── implementationTimeline ────────────────────────────────────────────
    const ic                = snap.implementationCompleteness || {};
    const placeholderCount  = (ic.placeholderAssessment  && ic.placeholderAssessment.placeholderCount)       || 0;
    const scaffoldCount     = (ic.scaffoldAssessment     && ic.scaffoldAssessment.scaffoldLikeFileCount)     || 0;
    implementationTimeline.push({
      snapshotAt,
      completenessScore:        typeof ic.completenessScore === 'number' ? ic.completenessScore : 0,
      completenessLevel:        ic.completenessLevel || null,
      implementationSignalCount: _getMetric(snap, 'implementationSignalCount'),
      placeholderCount,
      scaffoldLikeFileCount:    scaffoldCount,
    });

    prevLevel   = level;
    prevSignals = currSignals;
  });

  const driftEvents     = _buildDriftEvents(sorted);
  const summary         = _summary(sorted, driftEvents);
  const recommendations = _recommendations(driftEvents);

  return {
    timeline,
    scoreTimeline,
    levelTransitions,
    riskSignalTimeline,
    couplingTimeline,
    apiIntegrationTimeline,
    implementationTimeline,
    driftEvents,
    summary,
    recommendations,
  };
}

module.exports = { buildArchitectureTrendTimeline };
