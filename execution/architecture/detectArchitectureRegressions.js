'use strict';

const { buildArchitectureTrendTimeline } = require('./buildArchitectureTrendTimeline');

const LEVEL_RANK = { unknown: 0, risky: 1, weak: 2, watch: 3, healthy: 4 };
const MAX_RECS   = 5;

function _levelRank(level) {
  return LEVEL_RANK[level] !== undefined ? LEVEL_RANK[level] : 0;
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    regressionLevel:  'unknown',
    regressionScore:  0,
    confidenceLevel:  'low',
    summary:          'Insufficient snapshot history for regression analysis — at least 2 snapshots required.',
    regressions:      [],
    patterns: {
      scoreDropCount:                0,
      levelDegradationCount:         0,
      recurringRiskCount:            0,
      apiRegressionCount:            0,
      couplingGrowthCount:           0,
      implementationRegressionCount: 0,
      regressionStreak:              0,
      latestSnapshotRegressed:       false,
    },
    affectedAreas: {
      architectureHealth:         false,
      apiIntegration:             false,
      coupling:                   false,
      implementationCompleteness: false,
      boundaryHealth:             false,
    },
    recommendations: [],
  };
}

// ── Event counting ─────────────────────────────────────────────────────────────

function _countEventType(driftEvents, type) {
  return driftEvents.filter(function(e) { return e.type === type; }).length;
}

// ── Streak: count consecutive drops from the tail of scoreTimeline ─────────────

function _regressionStreak(scoreTimeline) {
  let streak = 0;
  for (let i = scoreTimeline.length - 1; i >= 1; i--) {
    if (scoreTimeline[i].deltaFromPrevious < 0) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

// ── Latest interval regression flag ────────────────────────────────────────────

function _latestSnapshotRegressed(driftEvents, scoreTimeline) {
  if (scoreTimeline.length < 2) return false;
  const latestAt = scoreTimeline[scoreTimeline.length - 1].snapshotAt;
  const regressionTypes = new Set([
    'score_drop', 'level_degraded', 'api_regression',
    'coupling_growth', 'implementation_regression',
  ]);
  return driftEvents.some(function(e) {
    return e.snapshotAt === latestAt && regressionTypes.has(e.type);
  });
}

// ── Recurring risks (risk types that re-appear as new across transitions) ───────
// Uses riskSignalTimeline.slice(1) — index 0 is the first snapshot baseline.

function _recurringRisks(riskSignalTimeline) {
  const typeCount = {};
  riskSignalTimeline.slice(1).forEach(function(entry) {
    (entry.newRisks || []).forEach(function(risk) {
      typeCount[risk] = (typeCount[risk] || 0) + 1;
    });
  });
  const recurring = {};
  Object.keys(typeCount).forEach(function(k) {
    if (typeCount[k] >= 2) recurring[k] = typeCount[k];
  });
  return recurring;
}

// ── High-severity risk types (parsed from new_risk drift events) ────────────────

function _highSeverityRiskTypes(driftEvents) {
  const highTypes = new Set();
  driftEvents.forEach(function(e) {
    if (e.type === 'new_risk' && e.severity === 'high' && e.summary) {
      const match = e.summary.match(/^New risk signal detected: (.+)\.$/);
      if (match) highTypes.add(match[1]);
    }
  });
  return highTypes;
}

// ── Timeline delta helpers ─────────────────────────────────────────────────────

function _couplingDeltas(couplingTimeline) {
  if (couplingTimeline.length < 2) return { edgeDelta: 0, circularDelta: 0 };
  const first = couplingTimeline[0];
  const last  = couplingTimeline[couplingTimeline.length - 1];
  return {
    edgeDelta:    last.totalEdges              - first.totalEdges,
    circularDelta: last.circularDependencyCount - first.circularDependencyCount,
  };
}

function _apiDelta(apiIntegrationTimeline) {
  if (apiIntegrationTimeline.length < 2) return 0;
  return apiIntegrationTimeline[apiIntegrationTimeline.length - 1].unresolvedFrontendCallCount
       - apiIntegrationTimeline[0].unresolvedFrontendCallCount;
}

function _implDelta(implementationTimeline) {
  if (implementationTimeline.length < 2) return 0;
  return implementationTimeline[implementationTimeline.length - 1].implementationSignalCount
       - implementationTimeline[0].implementationSignalCount;
}

// ── Individual regression detectors ───────────────────────────────────────────

function _detectScoreRegression(driftEvents, scoreTimeline) {
  const drops = driftEvents.filter(function(e) { return e.type === 'score_drop'; });
  if (drops.length === 0) return null;

  const totalDelta = scoreTimeline[scoreTimeline.length - 1].deltaFromFirst;

  let severity = 'low';
  if      (drops.length >= 3 || totalDelta <= -30) severity = 'high';
  else if (drops.length >= 2 || totalDelta <= -15) severity = 'medium';

  return {
    type:     'score_regression',
    severity,
    count:    drops.length,
    summary:  'Architecture health score dropped ' + drops.length + ' time(s) — net delta: ' + totalDelta + '.',
    evidence: drops.map(function(e) { return e.summary; }),
  };
}

function _detectLevelRegression(driftEvents, levelTransitions) {
  const degradations = driftEvents.filter(function(e) { return e.type === 'level_degraded'; });
  if (degradations.length === 0) return null;

  const firstLevel = levelTransitions.length > 0 ? levelTransitions[0].to : null;
  const lastLevel  = levelTransitions.length > 0 ? levelTransitions[levelTransitions.length - 1].to : null;
  const firstRank  = _levelRank(firstLevel);
  const lastRank   = _levelRank(lastLevel);

  let severity = 'medium';
  if (degradations.length >= 2 || (lastRank <= _levelRank('risky') && firstRank >= _levelRank('weak'))) {
    severity = 'high';
  }

  return {
    type:     'level_regression',
    severity,
    count:    degradations.length,
    summary:  'Architecture health level degraded ' + degradations.length + ' time(s).',
    evidence: degradations.map(function(e) { return e.summary; }),
  };
}

function _detectRecurringRisk(riskSignalTimeline, driftEvents) {
  const recurring = _recurringRisks(riskSignalTimeline);
  const types     = Object.keys(recurring);
  if (types.length === 0) return null;

  const highSeverityTypes      = _highSeverityRiskTypes(driftEvents);
  const hasHighSeverityRecurring = types.some(function(t) { return highSeverityTypes.has(t); });

  return {
    type:     'recurring_risk',
    severity: hasHighSeverityRecurring ? 'high' : 'medium',
    count:    types.length,
    summary:  types.length + ' risk signal(s) recur across multiple snapshots.',
    evidence: types.map(function(t) { return 'Risk "' + t + '" reappeared ' + recurring[t] + ' time(s).'; }),
  };
}

function _detectApiRegression(driftEvents, apiIntegrationTimeline) {
  const apiRegressions = driftEvents.filter(function(e) { return e.type === 'api_regression'; });
  if (apiRegressions.length === 0) return null;

  const unresolvedDelta = _apiDelta(apiIntegrationTimeline);

  return {
    type:     'api_regression',
    severity: unresolvedDelta >= 3 ? 'high' : 'medium',
    count:    apiRegressions.length,
    summary:  'API integration regressed ' + apiRegressions.length + ' time(s) — unresolved call delta: ' + unresolvedDelta + '.',
    evidence: apiRegressions.map(function(e) { return e.summary; }),
  };
}

function _detectCouplingRegression(driftEvents, couplingTimeline) {
  const couplingGrowths = driftEvents.filter(function(e) { return e.type === 'coupling_growth'; });
  if (couplingGrowths.length === 0) return null;

  const { edgeDelta, circularDelta } = _couplingDeltas(couplingTimeline);

  return {
    type:     'coupling_regression',
    severity: (edgeDelta >= 50 || circularDelta > 0) ? 'high' : 'medium',
    count:    couplingGrowths.length,
    summary:  'Dependency coupling grew ' + couplingGrowths.length + ' time(s) — total edge delta: ' + edgeDelta + '.',
    evidence: couplingGrowths.map(function(e) { return e.summary; }),
  };
}

function _detectImplementationRegression(driftEvents, implementationTimeline) {
  const implRegressions = driftEvents.filter(function(e) { return e.type === 'implementation_regression'; });
  if (implRegressions.length === 0) return null;

  const signalDelta = _implDelta(implementationTimeline);

  return {
    type:     'implementation_regression',
    severity: signalDelta >= 3 ? 'high' : 'medium',
    count:    implRegressions.length,
    summary:  'Implementation signals regressed ' + implRegressions.length + ' time(s) — total signal delta: ' + signalDelta + '.',
    evidence: implRegressions.map(function(e) { return e.summary; }),
  };
}

// ── Scoring and level ──────────────────────────────────────────────────────────
// scoreDropCount×10 + levelDegCount×15 + apiCount×8 + couplingCount×10 +
// implCount×6 + streak×5 + delta bonus (≤-30→+15, ≤-15→+8) — capped at 100.

function _calcRegressionScore(patterns, totalScoreDelta) {
  let score = 0;
  score += patterns.scoreDropCount                * 10;
  score += patterns.levelDegradationCount         * 15;
  score += patterns.apiRegressionCount            *  8;
  score += patterns.couplingGrowthCount           * 10;
  score += patterns.implementationRegressionCount *  6;
  score += patterns.regressionStreak              *  5;

  if      (totalScoreDelta <= -30) score += 15;
  else if (totalScoreDelta <= -15) score +=  8;

  return Math.min(100, Math.max(0, score));
}

function _regressionLevel(score) {
  if (score === 0)  return 'none';
  if (score <= 29)  return 'watch';
  if (score <= 69)  return 'regression';
  return 'critical';
}

function _confidenceLevel(n) {
  if (n >= 5) return 'high';
  if (n >= 3) return 'medium';
  return 'low';
}

// ── Affected areas ─────────────────────────────────────────────────────────────

function _affectedAreas(regressions) {
  const types = new Set(regressions.map(function(r) { return r.type; }));
  return {
    architectureHealth:         types.has('score_regression') || types.has('level_regression'),
    apiIntegration:             types.has('api_regression'),
    coupling:                   types.has('coupling_regression'),
    implementationCompleteness: types.has('implementation_regression'),
    boundaryHealth:             types.has('recurring_risk'),
  };
}

// ── Recommendations ────────────────────────────────────────────────────────────

function _recommendations(regressions, patterns) {
  const recs = [];

  if (regressions.some(function(r) {
    return r.type === 'score_regression' && (r.severity === 'high' || r.severity === 'medium');
  }) && recs.length < MAX_RECS) {
    recs.push('Multiple architecture score drops detected — investigate structural changes and prioritize stabilization.');
  }

  if (regressions.some(function(r) {
    return r.type === 'level_regression' && r.severity === 'high';
  }) && recs.length < MAX_RECS) {
    recs.push('Severe level degradation pattern — immediately review layer boundaries and coupling across the codebase.');
  }

  if (regressions.some(function(r) {
    return r.type === 'recurring_risk' && r.severity === 'high';
  }) && recs.length < MAX_RECS) {
    recs.push('Circular dependencies or critical risks are recurring — eliminate root causes rather than patching symptoms.');
  }

  if (regressions.some(function(r) { return r.type === 'api_regression'; }) && recs.length < MAX_RECS) {
    recs.push('API integration regressions detected — audit route registration and frontend call alignment.');
  }

  if (regressions.some(function(r) { return r.type === 'coupling_regression'; }) && recs.length < MAX_RECS) {
    recs.push('Dependency coupling is growing — audit import chains and apply dependency inversion where appropriate.');
  }

  if (regressions.some(function(r) { return r.type === 'implementation_regression'; }) && recs.length < MAX_RECS) {
    recs.push('Implementation signal regression detected — resolve placeholder and scaffold patterns before release.');
  }

  if (patterns.regressionStreak >= 3 && recs.length < MAX_RECS) {
    recs.push('Architecture health has declined in ' + patterns.regressionStreak + ' consecutive snapshots — treat as an active incident.');
  }

  if (regressions.length === 0 && recs.length < MAX_RECS) {
    recs.push('No regressions detected — maintain current architectural practices and review snapshots regularly.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ────────────────────────────────────────────────────────────────────

function _summary(regressionLevel, regressions, patterns, n) {
  if (regressionLevel === 'none') {
    return 'No architecture regressions detected across ' + n + ' snapshot(s).';
  }

  const streak   = patterns.regressionStreak;
  const regTypes = regressions.map(function(r) { return r.type.replace(/_/g, ' '); });

  if (regressionLevel === 'critical') {
    return 'Critical regression pattern across ' + n + ' snapshots — ' + regressions.length
      + ' regression type(s) detected'
      + (streak > 0 ? ' with a ' + streak + '-snapshot decline streak' : '') + '.';
  }

  if (regressionLevel === 'regression') {
    return 'Regression pattern detected across ' + n + ' snapshots — ' + regressions.length
      + ' regression type(s) including: ' + regTypes.slice(0, 3).join(', ') + '.';
  }

  return 'Architecture showing early warning signs across ' + n + ' snapshots — monitor '
    + regressions.length + ' pattern(s): ' + regTypes.slice(0, 2).join(', ') + '.';
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Detect regression patterns in an architecture snapshot series.
 * Accepts either raw snapshots or pre-built timelineData from buildArchitectureTrendTimeline.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ snapshots?: Array, timelineData?: object }} [params]
 * @returns {object}
 */
function detectArchitectureRegressions(params) {
  const snapshots    = (params && Array.isArray(params.snapshots))                       ? params.snapshots    : null;
  const timelineData = (params && params.timelineData && typeof params.timelineData === 'object') ? params.timelineData : null;

  const td = timelineData || buildArchitectureTrendTimeline({ snapshots: snapshots || [] });

  const {
    timeline,
    scoreTimeline,
    levelTransitions,
    riskSignalTimeline,
    driftEvents,
    apiIntegrationTimeline,
    couplingTimeline,
    implementationTimeline,
  } = td;

  if (!timeline || timeline.length < 2) return _unknownResult();

  const n = timeline.length;

  // ── Patterns ──────────────────────────────────────────────────────────────────
  const scoreDropCount                = _countEventType(driftEvents, 'score_drop');
  const levelDegradationCount         = _countEventType(driftEvents, 'level_degraded');
  const apiRegressionCount            = _countEventType(driftEvents, 'api_regression');
  const couplingGrowthCount           = _countEventType(driftEvents, 'coupling_growth');
  const implementationRegressionCount = _countEventType(driftEvents, 'implementation_regression');
  const regressionStreak              = _regressionStreak(scoreTimeline);
  const latestSnapshotRegressed       = _latestSnapshotRegressed(driftEvents, scoreTimeline);
  const recurringRisksMap             = _recurringRisks(riskSignalTimeline);
  const recurringRiskCount            = Object.keys(recurringRisksMap).length;

  const patterns = {
    scoreDropCount,
    levelDegradationCount,
    recurringRiskCount,
    apiRegressionCount,
    couplingGrowthCount,
    implementationRegressionCount,
    regressionStreak,
    latestSnapshotRegressed,
  };

  // ── Regression objects ────────────────────────────────────────────────────────
  const regressions = [];

  const scoreReg    = _detectScoreRegression(driftEvents, scoreTimeline);
  if (scoreReg)    regressions.push(scoreReg);

  const levelReg    = _detectLevelRegression(driftEvents, levelTransitions);
  if (levelReg)    regressions.push(levelReg);

  const recurringReg = _detectRecurringRisk(riskSignalTimeline, driftEvents);
  if (recurringReg) regressions.push(recurringReg);

  const apiReg      = _detectApiRegression(driftEvents, apiIntegrationTimeline);
  if (apiReg)      regressions.push(apiReg);

  const couplingReg = _detectCouplingRegression(driftEvents, couplingTimeline);
  if (couplingReg) regressions.push(couplingReg);

  const implReg     = _detectImplementationRegression(driftEvents, implementationTimeline);
  if (implReg)     regressions.push(implReg);

  // ── Score, level, confidence ───────────────────────────────────────────────────
  const totalScoreDelta  = scoreTimeline[scoreTimeline.length - 1].deltaFromFirst;
  const regressionScore  = _calcRegressionScore(patterns, totalScoreDelta);
  const regressionLevel  = _regressionLevel(regressionScore);
  const confidenceLevel  = _confidenceLevel(n);

  return {
    regressionLevel,
    regressionScore,
    confidenceLevel,
    summary:         _summary(regressionLevel, regressions, patterns, n),
    regressions,
    patterns,
    affectedAreas:   _affectedAreas(regressions),
    recommendations: _recommendations(regressions, patterns),
  };
}

module.exports = { detectArchitectureRegressions };
