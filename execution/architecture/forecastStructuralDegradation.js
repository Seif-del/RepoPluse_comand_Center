'use strict';

const { buildArchitectureTrendTimeline } = require('./buildArchitectureTrendTimeline');

const MAX_RECS = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _scoreToLevel(score) {
  if (score >= 70) return 'healthy';
  if (score >= 55) return 'watch';
  if (score >= 35) return 'weak';
  return 'risky';
}

function _getEventsByType(driftEvents, type) {
  return driftEvents.filter(function(e) { return e.type === type; });
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    forecastLevel:    'unknown',
    degradationRisk:  0,
    confidenceLevel:  'low',
    summary:          'Insufficient snapshot history for degradation forecast — at least 2 snapshots required.',
    trajectory: {
      scoreTrend:           'stable',
      averageScoreDelta:    0,
      projectedScore:       0,
      projectedLevel:       'unknown',
      interventionUrgency:  'none',
    },
    riskFactors:          [],
    structuralProjection: {
      couplingForecast:             'stable',
      implementationHealthForecast: 'stable',
      boundaryIntegrityForecast:    'stable',
    },
    recommendations: [],
  };
}

// ── Trajectory analysis ───────────────────────────────────────────────────────

function _computeDeltas(scoreTimeline) {
  return scoreTimeline.slice(1).map(function(e) {
    return typeof e.deltaFromPrevious === 'number' ? e.deltaFromPrevious : 0;
  });
}

function _scoreTrend(avg, variance, maxDrop) {
  if (avg >= 5)                              return 'improving';
  if (variance >= 100 && maxDrop <= -20)     return 'volatile';
  if (avg <= -5)                             return 'degrading';
  return 'stable';
}

// ── Risk factor detection ─────────────────────────────────────────────────────

function _detectScoreDecline(avg) {
  if (avg > -5) return null;
  let severity;
  if (avg <= -15)      severity = 'critical';
  else if (avg <= -10) severity = 'high';
  else if (avg <= -7)  severity = 'medium';
  else                 severity = 'low';

  return {
    type:     'score_decline',
    severity,
    trend:    'worsening',
    summary:  `Architecture score declining at an average of ${Math.abs(avg).toFixed(1)} points per snapshot.`,
    evidence: { averageScoreDelta: Math.round(avg * 10) / 10 },
  };
}

function _detectLevelDegradation(driftEvents, scoreTimeline) {
  const events = _getEventsByType(driftEvents, 'level_degraded');
  if (events.length === 0) return null;

  const count       = events.length;
  const latestEntry = scoreTimeline[scoreTimeline.length - 1];
  const latestLevel = latestEntry ? (latestEntry.level || 'unknown') : 'unknown';

  let severity;
  if (latestLevel === 'risky') severity = 'critical';
  else if (count >= 3)         severity = 'high';
  else if (count >= 2)         severity = 'medium';
  else                         severity = 'low';

  return {
    type:     'level_degradation',
    severity,
    trend:    'worsening',
    summary:  `Architecture health level has degraded ${count} time(s); current level: ${latestLevel}.`,
    evidence: { degradationCount: count, currentLevel: latestLevel },
  };
}

function _detectVolatility(variance, maxDrop) {
  if (variance < 100 || maxDrop > -20) return null;
  const severity = variance >= 200 ? 'high' : 'medium';
  return {
    type:     'volatility',
    severity,
    trend:    'stable',
    summary:  `Architecture score shows high volatility (variance: ${Math.round(variance)}).`,
    evidence: { variance: Math.round(variance), maxDrop },
  };
}

function _detectCouplingAcceleration(driftEvents) {
  const events = _getEventsByType(driftEvents, 'coupling_growth');
  if (events.length === 0) return null;
  const hasHigh = events.some(function(e) { return e.severity === 'high'; });
  const severity = hasHigh ? 'high' : 'medium';
  return {
    type:     'coupling_acceleration',
    severity,
    trend:    'worsening',
    summary:  `Coupling growth detected across ${events.length} snapshot(s).`,
    evidence: { couplingGrowthCount: events.length, hasHighSeverity: hasHigh },
  };
}

function _detectImplementationDecay(driftEvents) {
  const events = _getEventsByType(driftEvents, 'implementation_regression');
  if (events.length === 0) return null;
  const signalDelta = events.length;
  let severity;
  if (signalDelta >= 5)      severity = 'high';
  else if (signalDelta >= 3) severity = 'medium';
  else                       severity = 'low';
  return {
    type:     'implementation_decay',
    severity,
    trend:    'worsening',
    summary:  `Implementation quality has regressed across ${signalDelta} snapshot(s).`,
    evidence: { signalDelta },
  };
}

// ── Structural projection ─────────────────────────────────────────────────────

function _couplingForecast(driftEvents) {
  const events = _getEventsByType(driftEvents, 'coupling_growth');
  if (events.length === 0) return 'stable';
  const hasHigh = events.some(function(e) { return e.severity === 'high'; });
  return hasHigh ? 'accelerating' : 'growing';
}

function _implementationHealthForecast(driftEvents) {
  const events = _getEventsByType(driftEvents, 'implementation_regression');
  if (events.length === 0) return 'stable';
  return events.length >= 3 ? 'critical' : 'degrading';
}

function _boundaryIntegrityForecast(driftEvents) {
  const count = driftEvents.filter(function(e) {
    return e.type === 'new_risk' && e.severity === 'high';
  }).length;
  if (count === 0)  return 'stable';
  if (count <= 2)   return 'eroding';
  return 'critical';
}

// ── Degradation risk score ────────────────────────────────────────────────────

const RISK_SCORE_TABLE = {
  score_decline:         { low: 10, medium: 15, high: 20, critical: 30 },
  level_degradation:     { low: 8,  medium: 15, high: 22, critical: 35 },
  volatility:            { low: 0,  medium: 10, high: 18, critical: 0  },
  coupling_acceleration: { low: 0,  medium: 8,  high: 15, critical: 0  },
  implementation_decay:  { low: 5,  medium: 10, high: 15, critical: 0  },
};

function _calcDegradationRisk(riskFactors, projectedScore) {
  let score = 0;
  riskFactors.forEach(function(rf) {
    const table = RISK_SCORE_TABLE[rf.type];
    if (table && table[rf.severity] !== undefined) {
      score += table[rf.severity];
    }
  });
  if (projectedScore < 35)      score += 20;
  else if (projectedScore < 55) score += 10;
  return Math.min(score, 100);
}

function _forecastLevel(degradationRisk) {
  if (degradationRisk === 0)  return 'none';
  if (degradationRisk <= 24)  return 'low';
  if (degradationRisk <= 49)  return 'medium';
  if (degradationRisk <= 74)  return 'high';
  return 'critical';
}

// ── Intervention urgency ──────────────────────────────────────────────────────

function _interventionUrgency(scoreTrend, projectedLevel, riskFactors) {
  if (scoreTrend === 'degrading') {
    if (projectedLevel === 'risky') return 'immediate';
    if (projectedLevel === 'weak')  return 'soon';
    if (projectedLevel === 'watch') return 'monitor';
  }
  if (scoreTrend === 'volatile' && riskFactors.length > 0) return 'monitor';
  return 'none';
}

function _confidenceLevel(n) {
  if (n >= 5) return 'high';
  if (n >= 3) return 'medium';
  return 'low';
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _buildRecommendations(riskFactors, interventionUrgency) {
  const recs = [];
  riskFactors.forEach(function(rf) {
    if (recs.length >= MAX_RECS) return;
    if (rf.type === 'score_decline') {
      recs.push('Investigate and address root causes of declining architecture score.');
    } else if (rf.type === 'level_degradation') {
      recs.push('Review architectural health transitions and stabilize structure before further development.');
    } else if (rf.type === 'coupling_acceleration') {
      recs.push('Audit dependency growth and enforce coupling boundaries to prevent structural lock-in.');
    } else if (rf.type === 'implementation_decay') {
      recs.push('Complete in-progress implementation work and reduce structural debt.');
    } else if (rf.type === 'volatility') {
      recs.push('Identify sources of architectural instability and introduce stabilization checkpoints.');
    }
  });
  if (recs.length < MAX_RECS && interventionUrgency === 'immediate') {
    recs.push('Immediate architectural intervention required — system is approaching critical structural risk.');
  } else if (recs.length < MAX_RECS && interventionUrgency === 'soon') {
    recs.push('Schedule architectural remediation within the next sprint.');
  }
  return recs;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _buildSummary(forecastLevel, trajectory) {
  if (forecastLevel === 'none') {
    return 'No structural degradation risk detected — architecture appears stable.';
  }
  const urgency = trajectory.interventionUrgency !== 'none'
    ? ` Intervention urgency: ${trajectory.interventionUrgency}.`
    : '';
  return `Structural degradation forecast: ${forecastLevel} risk. Score trend is ${trajectory.scoreTrend} (projected: ${trajectory.projectedScore}).${urgency}`;
}

// ── Main function ─────────────────────────────────────────────────────────────

function forecastStructuralDegradation(input) {
  if (!input || typeof input !== 'object') return _unknownResult();

  const { snapshots, timelineData: provided } = input;

  if (!provided) {
    if (!Array.isArray(snapshots) || snapshots.length < 2) return _unknownResult();
  }

  const td = provided || buildArchitectureTrendTimeline({ snapshots });

  const { scoreTimeline = [], driftEvents = [] } = td;

  if (!Array.isArray(scoreTimeline) || scoreTimeline.length < 2) return _unknownResult();

  // ── Trajectory ────────────────────────────────────────────────────────────────
  const deltas = _computeDeltas(scoreTimeline);
  const n      = deltas.length;

  let avg = 0, variance = 0, maxDrop = 0;
  if (n > 0) {
    avg      = deltas.reduce(function(s, d) { return s + d; }, 0) / n;
    variance = deltas.reduce(function(s, d) { return s + Math.pow(d - avg, 2); }, 0) / n;
    maxDrop  = Math.min.apply(null, deltas);
  }

  const averageScoreDelta = Math.round(avg * 10) / 10;
  const scoreTrend        = _scoreTrend(avg, variance, maxDrop);
  const latestScore       = scoreTimeline[scoreTimeline.length - 1].score || 0;
  const projectedScore    = Math.max(0, Math.min(100, Math.round(latestScore + averageScoreDelta)));
  const projectedLevel    = _scoreToLevel(projectedScore);

  // ── Risk factors ──────────────────────────────────────────────────────────────
  const riskFactors = [];
  const scDec = _detectScoreDecline(avg);
  if (scDec)  riskFactors.push(scDec);
  const levDeg = _detectLevelDegradation(driftEvents, scoreTimeline);
  if (levDeg) riskFactors.push(levDeg);
  const vol = _detectVolatility(variance, maxDrop);
  if (vol)    riskFactors.push(vol);
  const coupl = _detectCouplingAcceleration(driftEvents);
  if (coupl)  riskFactors.push(coupl);
  const impl = _detectImplementationDecay(driftEvents);
  if (impl)   riskFactors.push(impl);

  // ── Trajectory object ─────────────────────────────────────────────────────────
  const interventionUrgency = _interventionUrgency(scoreTrend, projectedLevel, riskFactors);
  const trajectory = {
    scoreTrend,
    averageScoreDelta,
    projectedScore,
    projectedLevel,
    interventionUrgency,
  };

  // ── Derived values ────────────────────────────────────────────────────────────
  const degradationRisk = _calcDegradationRisk(riskFactors, projectedScore);
  const forecastLevel   = _forecastLevel(degradationRisk);
  const confidenceLevel = _confidenceLevel(scoreTimeline.length);

  const structuralProjection = {
    couplingForecast:             _couplingForecast(driftEvents),
    implementationHealthForecast: _implementationHealthForecast(driftEvents),
    boundaryIntegrityForecast:    _boundaryIntegrityForecast(driftEvents),
  };

  const recommendations = _buildRecommendations(riskFactors, interventionUrgency);
  const summary         = _buildSummary(forecastLevel, trajectory);

  return {
    forecastLevel,
    degradationRisk,
    confidenceLevel,
    summary,
    trajectory,
    riskFactors,
    structuralProjection,
    recommendations,
  };
}

module.exports = { forecastStructuralDegradation };
