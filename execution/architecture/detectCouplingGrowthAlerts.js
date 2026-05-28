'use strict';

const { buildArchitectureTrendTimeline } = require('./buildArchitectureTrendTimeline');

const MAX_RECS     = 5;
const PRESSURE_RANK = { low: 0, medium: 1, high: 2 };

function _pressureRank(p) {
  return PRESSURE_RANK[p] !== undefined ? PRESSURE_RANK[p] : 0;
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    alertLevel:          'unknown',
    couplingGrowthScore: 0,
    confidenceLevel:     'low',
    summary:             'Insufficient snapshot history for coupling analysis — at least 2 snapshots required.',
    alerts:              [],
    hotspots:            [],
    couplingTrend: {
      initialEdges:                0,
      latestEdges:                 0,
      edgeDelta:                   0,
      edgeGrowthPercent:           0,
      initialCircularDependencies: 0,
      latestCircularDependencies:  0,
      circularDependencyDelta:     0,
      initialBoundaryViolations:   0,
      latestBoundaryViolations:    0,
      boundaryViolationDelta:      0,
      pressureTimeline:            [],
      latestPressure:              'low',
      pressureEscalated:           false,
      acceleration:                0,
    },
    recommendations: [],
  };
}

// ── Coupling trend extraction ─────────────────────────────────────────────────

function _buildCouplingTrend(couplingTimeline) {
  const n     = couplingTimeline.length;
  const first = couplingTimeline[0];
  const last  = couplingTimeline[n - 1];

  const initialEdges                = first.totalEdges              || 0;
  const latestEdges                 = last.totalEdges               || 0;
  const edgeDelta                   = latestEdges - initialEdges;
  const edgeGrowthPercent           = initialEdges === 0 ? 0
    : Math.round((edgeDelta / initialEdges) * 100);

  const initialCircularDependencies = first.circularDependencyCount || 0;
  const latestCircularDependencies  = last.circularDependencyCount  || 0;
  const circularDependencyDelta     = latestCircularDependencies - initialCircularDependencies;

  const initialBoundaryViolations   = first.boundaryViolationCount  || 0;
  const latestBoundaryViolations    = last.boundaryViolationCount   || 0;
  const boundaryViolationDelta      = latestBoundaryViolations - initialBoundaryViolations;

  const pressureTimeline            = couplingTimeline.map(function(e) { return e.couplingPressure || 'low'; });
  const latestPressure              = last.couplingPressure   || 'low';
  const initialPressure             = first.couplingPressure  || 'low';
  const pressureEscalated           = _pressureRank(latestPressure) > _pressureRank(initialPressure);

  let acceleration = 0;
  if (n >= 3) {
    const midIdx           = Math.floor(n / 2);
    const firstHalfGrowth  = (couplingTimeline[midIdx].totalEdges || 0) - initialEdges;
    const secondHalfGrowth = latestEdges - (couplingTimeline[midIdx].totalEdges || 0);
    acceleration           = secondHalfGrowth - firstHalfGrowth;
  }

  return {
    initialEdges,
    latestEdges,
    edgeDelta,
    edgeGrowthPercent,
    initialCircularDependencies,
    latestCircularDependencies,
    circularDependencyDelta,
    initialBoundaryViolations,
    latestBoundaryViolations,
    boundaryViolationDelta,
    pressureTimeline,
    latestPressure,
    pressureEscalated,
    acceleration,
  };
}

// ── Sustained-pressure run helpers ────────────────────────────────────────────

function _consecutiveHighFromEnd(pressureTimeline) {
  let count = 0;
  for (let i = pressureTimeline.length - 1; i >= 0; i--) {
    if (pressureTimeline[i] === 'high') count++;
    else break;
  }
  return count;
}

function _consecutiveMediumOrHighFromEnd(pressureTimeline) {
  let count = 0;
  for (let i = pressureTimeline.length - 1; i >= 0; i--) {
    const p = pressureTimeline[i];
    if (p === 'medium' || p === 'high') count++;
    else break;
  }
  return count;
}

// ── Alert detectors ───────────────────────────────────────────────────────────

// Rule 2: edge_growth
// Trigger: edgeDelta >= 25 OR edgeGrowthPercent >= 50
// Severity: high if delta >= 100 or percent >= 100; medium if >= 50/50; else low.

function _detectEdgeGrowth(trend) {
  const { edgeDelta, edgeGrowthPercent, initialEdges, latestEdges } = trend;

  if (edgeDelta < 25 && edgeGrowthPercent < 50) return null;

  let severity;
  if      (edgeDelta >= 100 || edgeGrowthPercent >= 100) severity = 'high';
  else if (edgeDelta >= 50  || edgeGrowthPercent >= 50)  severity = 'medium';
  else                                                    severity = 'low';

  return {
    type:     'edge_growth',
    severity,
    summary:  'Dependency edge count grew by ' + edgeDelta + ' (' + edgeGrowthPercent
      + '%) — from ' + initialEdges + ' to ' + latestEdges + '.',
    evidence: [
      'Initial edges: ' + initialEdges,
      'Latest edges: '  + latestEdges,
      'Delta: ' + edgeDelta + ', Growth: ' + edgeGrowthPercent + '%',
    ],
  };
}

// Rule 3: circular_dependency_growth
// delta >= 1 => high; latest >= 3 => critical (critical supersedes)

function _detectCircularDependencyGrowth(trend) {
  const { circularDependencyDelta, latestCircularDependencies, initialCircularDependencies } = trend;

  if (circularDependencyDelta < 1 && latestCircularDependencies < 3) return null;

  let severity, summaryText;

  if (latestCircularDependencies >= 3) {
    severity    = 'critical';
    summaryText = 'Circular dependency count reached ' + latestCircularDependencies
      + (circularDependencyDelta >= 1 ? ', having grown by ' + circularDependencyDelta : '') + '.';
  } else {
    severity    = 'high';
    summaryText = 'Circular dependencies increased by ' + circularDependencyDelta
      + ' — now at ' + latestCircularDependencies + '.';
  }

  return {
    type:     'circular_dependency_growth',
    severity,
    summary:  summaryText,
    evidence: [
      'Initial circular dependencies: ' + initialCircularDependencies,
      'Latest circular dependencies: '  + latestCircularDependencies,
    ],
  };
}

// Rule 4: boundary_coupling_growth
// delta >= 1 => medium; delta >= 3 => high

function _detectBoundaryCouplingGrowth(trend) {
  const { boundaryViolationDelta, initialBoundaryViolations, latestBoundaryViolations } = trend;

  if (boundaryViolationDelta < 1) return null;

  return {
    type:     'boundary_coupling_growth',
    severity: boundaryViolationDelta >= 3 ? 'high' : 'medium',
    summary:  'Boundary violations increased by ' + boundaryViolationDelta
      + ' — from ' + initialBoundaryViolations + ' to ' + latestBoundaryViolations + '.',
    evidence: [
      'Initial boundary violations: ' + initialBoundaryViolations,
      'Latest boundary violations: '  + latestBoundaryViolations,
    ],
  };
}

// Rule 5: sustained_coupling_pressure
// medium 2+ consecutive => medium; high 2+ => high; high 3+ => critical

function _detectSustainedCouplingPressure(trend) {
  const { pressureTimeline } = trend;
  const consecutiveHigh    = _consecutiveHighFromEnd(pressureTimeline);
  const consecutiveMedPlus = _consecutiveMediumOrHighFromEnd(pressureTimeline);

  if (consecutiveHigh >= 3) {
    return {
      type:     'sustained_coupling_pressure',
      severity: 'critical',
      summary:  'Coupling pressure has been high for ' + consecutiveHigh + ' consecutive snapshots.',
      evidence: [
        'High pressure run: ' + consecutiveHigh + ' snapshots',
        'Pressure timeline: ' + pressureTimeline.join(' → '),
      ],
    };
  }
  if (consecutiveHigh >= 2) {
    return {
      type:     'sustained_coupling_pressure',
      severity: 'high',
      summary:  'Coupling pressure has been high for ' + consecutiveHigh + ' consecutive snapshots.',
      evidence: [
        'High pressure run: ' + consecutiveHigh + ' snapshots',
        'Pressure timeline: ' + pressureTimeline.join(' → '),
      ],
    };
  }
  if (consecutiveMedPlus >= 2) {
    return {
      type:     'sustained_coupling_pressure',
      severity: 'medium',
      summary:  'Coupling pressure has been medium or higher for ' + consecutiveMedPlus + ' consecutive snapshots.',
      evidence: [
        'Medium+ pressure run: ' + consecutiveMedPlus + ' snapshots',
        'Pressure timeline: ' + pressureTimeline.join(' → '),
      ],
    };
  }
  return null;
}

// Rule 6: coupling_acceleration
// secondHalfGrowth > firstHalfGrowth by >= 25 => medium; >= 50 => high

function _detectCouplingAcceleration(trend) {
  const { acceleration } = trend;
  if (acceleration < 25) return null;

  return {
    type:     'coupling_acceleration',
    severity: acceleration >= 50 ? 'high' : 'medium',
    summary:  'Dependency coupling is accelerating — second-half edge growth exceeded first-half by '
      + acceleration + ' edges.',
    evidence: ['Acceleration delta: ' + acceleration + ' edges'],
  };
}

// ── Hotspot detectors ─────────────────────────────────────────────────────────

function _detectHotspots(trend) {
  const hotspots = [];

  if (trend.latestCircularDependencies >= 1) {
    hotspots.push({
      type:     'circular_dependencies',
      severity: trend.latestCircularDependencies >= 3 ? 'critical' : 'high',
      summary:  trend.latestCircularDependencies + ' circular dependency chain(s) currently active.',
      evidence: ['Current circular dependency count: ' + trend.latestCircularDependencies],
    });
  }

  if (trend.latestBoundaryViolations >= 1) {
    hotspots.push({
      type:     'boundary_violations',
      severity: trend.latestBoundaryViolations >= 3 ? 'high' : 'medium',
      summary:  trend.latestBoundaryViolations + ' boundary violation(s) currently active.',
      evidence: ['Current boundary violation count: ' + trend.latestBoundaryViolations],
    });
  }

  if (trend.latestEdges >= 50) {
    hotspots.push({
      type:     'dense_dependency_graph',
      severity: trend.latestEdges >= 100 ? 'high' : 'medium',
      summary:  'Dependency graph is dense with ' + trend.latestEdges + ' edges.',
      evidence: ['Current edge count: ' + trend.latestEdges],
    });
  }

  if (trend.acceleration >= 25 && trend.edgeDelta >= 25) {
    hotspots.push({
      type:     'unstable_coupling_growth',
      severity: trend.acceleration >= 50 ? 'high' : 'medium',
      summary:  'Coupling growth is accelerating and unstable — acceleration: ' + trend.acceleration + ' edges.',
      evidence: [
        'Acceleration: '     + trend.acceleration + ' edges',
        'Total edge delta: ' + trend.edgeDelta,
      ],
    });
  }

  return hotspots;
}

// ── Score computation ──────────────────────────────────────────────────────────
// edge_growth:                 low=10, medium=20, high=30
// circular_dependency_growth:  high=25, critical=40
// boundary_coupling_growth:    medium=15, high=25
// sustained_coupling_pressure: medium=10, high=20, critical=30
// coupling_acceleration:       medium=10, high=20
// Total capped at 100.

const ALERT_SCORE = {
  edge_growth:                 { low: 10, medium: 20, high: 30 },
  circular_dependency_growth:  { high: 25, critical: 40 },
  boundary_coupling_growth:    { medium: 15, high: 25 },
  sustained_coupling_pressure: { medium: 10, high: 20, critical: 30 },
  coupling_acceleration:       { medium: 10, high: 20 },
};

function _calcCouplingGrowthScore(alerts) {
  let score = 0;
  alerts.forEach(function(a) {
    const table = ALERT_SCORE[a.type];
    if (table && table[a.severity] !== undefined) score += table[a.severity];
  });
  return Math.min(100, score);
}

// Rule 8: alertLevel
function _alertLevel(score) {
  if (score === 0)  return 'none';
  if (score <= 29)  return 'watch';
  if (score <= 69)  return 'alert';
  return 'critical';
}

// Rule 9: confidence
function _confidenceLevel(n) {
  if (n >= 5) return 'high';
  if (n >= 3) return 'medium';
  return 'low';
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(alerts) {
  const recs   = [];
  const types  = new Set(alerts.map(function(a) { return a.type; }));
  const sevMap = {};
  alerts.forEach(function(a) { sevMap[a.type] = a.severity; });

  // 1. Circular dependency growth
  if (types.has('circular_dependency_growth') && recs.length < MAX_RECS) {
    recs.push(
      sevMap['circular_dependency_growth'] === 'critical'
        ? 'Critical circular dependency growth detected — break dependency cycles immediately before they compound.'
        : 'Circular dependencies are growing — audit import chains and eliminate cycles before they become self-reinforcing.'
    );
  }

  // 2. Boundary coupling growth
  if (types.has('boundary_coupling_growth') && recs.length < MAX_RECS) {
    recs.push('Boundary violations are increasing — enforce layer separation and review cross-boundary imports.');
  }

  // 3. Sustained coupling pressure
  if (types.has('sustained_coupling_pressure') && recs.length < MAX_RECS) {
    const sev = sevMap['sustained_coupling_pressure'];
    if (sev === 'critical') {
      recs.push('Sustained critical coupling pressure — treat as structural debt; schedule a coupling reduction sprint.');
    } else if (sev === 'high') {
      recs.push('Sustained high coupling pressure — review dependency graph and isolate tightly coupled modules.');
    } else {
      recs.push('Sustained coupling pressure — monitor closely and prevent further growth.');
    }
  }

  // 4. Coupling acceleration
  if (types.has('coupling_acceleration') && recs.length < MAX_RECS) {
    recs.push('Coupling growth is accelerating — investigate recent changes introducing new dependencies.');
  }

  // 5. Edge growth
  if (types.has('edge_growth') && recs.length < MAX_RECS) {
    recs.push('Dependency edge count is growing — review module boundaries and eliminate unnecessary dependencies.');
  }

  if (alerts.length === 0 && recs.length < MAX_RECS) {
    recs.push('No coupling growth alerts detected — maintain current dependency discipline and review regularly.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(alertLevel, alerts, trend, n) {
  if (alertLevel === 'none') {
    return 'No coupling growth concerns detected across ' + n + ' snapshot(s).';
  }

  const critOrHighCount = alerts.filter(function(a) {
    return a.severity === 'critical' || a.severity === 'high';
  }).length;

  if (alertLevel === 'critical') {
    return 'Critical coupling growth across ' + n + ' snapshots — '
      + critOrHighCount + ' high/critical alert(s) detected (edges: '
      + trend.initialEdges + ' → ' + trend.latestEdges + ').';
  }
  if (alertLevel === 'alert') {
    return 'Significant coupling growth across ' + n + ' snapshots — '
      + alerts.length + ' alert(s) detected (edges: '
      + trend.initialEdges + ' → ' + trend.latestEdges + ').';
  }
  return 'Early coupling growth signals across ' + n + ' snapshots — monitor '
    + alerts.length + ' pattern(s) (edges: '
    + trend.initialEdges + ' → ' + trend.latestEdges + ').';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Detect specialized coupling growth and structural density alerts from
 * architecture snapshots or pre-built timeline data.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ snapshots?: Array, timelineData?: object }} [params]
 * @returns {object}
 */
function detectCouplingGrowthAlerts(params) {
  const snapshots    = (params && Array.isArray(params.snapshots))                        ? params.snapshots    : null;
  const timelineData = (params && params.timelineData && typeof params.timelineData === 'object') ? params.timelineData : null;

  const td               = timelineData || buildArchitectureTrendTimeline({ snapshots: snapshots || [] });
  const couplingTimeline = (td && Array.isArray(td.couplingTimeline)) ? td.couplingTimeline : [];

  if (couplingTimeline.length < 2) return _unknownResult();

  const n     = couplingTimeline.length;
  const trend = _buildCouplingTrend(couplingTimeline);

  const alerts = [];
  const eg  = _detectEdgeGrowth(trend);               if (eg)  alerts.push(eg);
  const cdg = _detectCircularDependencyGrowth(trend); if (cdg) alerts.push(cdg);
  const bcg = _detectBoundaryCouplingGrowth(trend);   if (bcg) alerts.push(bcg);
  const scp = _detectSustainedCouplingPressure(trend);if (scp) alerts.push(scp);
  const ca  = _detectCouplingAcceleration(trend);     if (ca)  alerts.push(ca);

  const couplingGrowthScore = _calcCouplingGrowthScore(alerts);
  const alertLevel          = _alertLevel(couplingGrowthScore);
  const confidenceLevel     = _confidenceLevel(n);

  return {
    alertLevel,
    couplingGrowthScore,
    confidenceLevel,
    summary:         _summary(alertLevel, alerts, trend, n),
    alerts,
    hotspots:        _detectHotspots(trend),
    couplingTrend:   trend,
    recommendations: _recommendations(alerts),
  };
}

module.exports = { detectCouplingGrowthAlerts };
