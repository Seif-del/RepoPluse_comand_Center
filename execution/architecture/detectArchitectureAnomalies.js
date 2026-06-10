'use strict';

// detectArchitectureAnomalies
// Identifies unexpected structural anomalies from repository timeline data and/or
// portfolio forecast inputs.
//
// Input:  { snapshots?, timelineData?, repoForecasts?, portfolioForecast? }
//   - timelineData: already-built output of buildArchitectureTrendTimeline (preferred)
//   - snapshots: raw snapshot array — timeline is built internally when timelineData absent
//   - repoForecasts / portfolioForecast: optional portfolio-level signal sources
//
// Output: anomalyLevel, anomalyScore, confidenceLevel, summary,
//         anomalies, outliers, patterns, recommendations
//
// Pure function — no I/O, no mutation of input, deterministic output.

const { buildArchitectureTrendTimeline } = require('./buildArchitectureTrendTimeline');

const MAX_RECS = 5;

// ── Severity helpers ──────────────────────────────────────────────────────────

const SEV_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

function _sevRank(s) { return SEV_RANK[s] || 0; }

function _maxSev(a, b) {
  if (!a) return b;
  if (!b) return a;
  return _sevRank(a) >= _sevRank(b) ? a : b;
}

function _anomalyPoints(severity) {
  return { low: 8, medium: 15, high: 25, critical: 40 }[severity] || 0;
}

// ── General helpers ───────────────────────────────────────────────────────────

function _safeArray(v)  { return Array.isArray(v) ? v : []; }
function _safeNum(v)    { return typeof v === 'number' && isFinite(v) ? v : 0; }
function _safeStr(v)    { return typeof v === 'string' ? v : ''; }

// ── Empty patterns ────────────────────────────────────────────────────────────

function _emptyPatterns() {
  return {
    scoreCollapseCount:           0,
    couplingSpikeCount:           0,
    apiLinkageDropCount:          0,
    boundarySpikeCount:           0,
    implementationDebtSurgeCount: 0,
    volatilityOutlierCount:       0,
    portfolioOutlierCount:        0,
    latestSnapshotAnomalous:      false,
  };
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    anomalyLevel:    'unknown',
    anomalyScore:    0,
    confidenceLevel: 'low',
    summary:         'Insufficient data for anomaly detection — timeline or portfolio forecast required.',
    anomalies:       [],
    outliers:        [],
    patterns:        _emptyPatterns(),
    recommendations: [],
  };
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(timelineLen, forecastLen) {
  if (timelineLen >= 5 || forecastLen >= 5) return 'high';
  if (timelineLen >= 3 || forecastLen >= 3) return 'medium';
  return 'low';
}

// ── Anomaly level ─────────────────────────────────────────────────────────────

function _anomalyLevel(score) {
  if (score === 0)  return 'none';
  if (score <= 29)  return 'watch';
  if (score <= 69)  return 'anomaly';
  return 'critical';
}

// ── Timeline anomaly detection ────────────────────────────────────────────────

const ANOMALY_ORDER = [
  'score_collapse',
  'coupling_spike',
  'api_linkage_drop',
  'boundary_spike',
  'implementation_debt_surge',
  'volatility_outlier',
];

const ANOMALY_SUMMARIES = {
  score_collapse:            'Architecture score dropped by >= 20 points in at least one snapshot interval.',
  coupling_spike:            'Dependency coupling spiked significantly in at least one snapshot interval.',
  api_linkage_drop:          'API linkage quality dropped in at least one snapshot interval.',
  boundary_spike:            'Boundary violations spiked in at least one snapshot interval.',
  implementation_debt_surge: 'Implementation debt surged in at least one snapshot interval.',
  volatility_outlier:        'Architecture score shows high volatility across timeline.',
};

function _timelineAnomalyEvidence(type, patterns, extras) {
  return {
    score_collapse:            {
      scoreCollapseCount: patterns.scoreCollapseCount,
      collapseEvents:     (extras && extras.collapseEvents) || [],
    },
    coupling_spike:            { couplingSpikeCount:           patterns.couplingSpikeCount },
    api_linkage_drop:          { apiLinkageDropCount:          patterns.apiLinkageDropCount },
    boundary_spike:            { boundarySpikeCount:           patterns.boundarySpikeCount },
    implementation_debt_surge: { implementationDebtSurgeCount: patterns.implementationDebtSurgeCount },
    volatility_outlier:        { volatilityOutlierCount:       patterns.volatilityOutlierCount },
  }[type] || {};
}

function _detectTimelineAnomalies(td) {
  const scoreTimeline   = _safeArray(td.scoreTimeline);
  const couplingTL      = _safeArray(td.couplingTimeline);
  const apiTL           = _safeArray(td.apiIntegrationTimeline);
  const implTL          = _safeArray(td.implementationTimeline);

  const n              = scoreTimeline.length;
  const patterns       = _emptyPatterns();
  const collapseEvents = [];
  const worstSev       = {};   // type → worst severity seen

  function _update(type, sev) {
    worstSev[type] = _maxSev(worstSev[type], sev);
  }

  // ── Per-interval scan (i = 1 … n-1) ─────────────────────────────────────────
  for (let i = 1; i < n; i++) {
    const isLast = (i === n - 1);
    let intervalHit = false;

    // Rule 2 — score_collapse (suppressed at version boundaries)
    const delta        = _safeNum(scoreTimeline[i].deltaFromPrevious);
    const vb           = scoreTimeline[i].versionBoundary === true;
    const currScore    = _safeNum(scoreTimeline[i].score);
    const prevScore    = currScore - delta;
    let   collapseSev  = null;
    if (!vb) {
      if (delta <= -35) {
        patterns.scoreCollapseCount++;
        intervalHit = true;
        _update('score_collapse', 'critical');
        collapseSev = 'critical';
      } else if (delta <= -20) {
        patterns.scoreCollapseCount++;
        intervalHit = true;
        _update('score_collapse', 'high');
        collapseSev = 'high';
      }
    }
    if (collapseSev) {
      collapseEvents.push({
        snapshotAt: scoreTimeline[i].snapshotAt || null,
        severity:   collapseSev,
        delta,
        prevScore,
        currScore,
      });
    }

    // Rule 3 — coupling_spike
    if (i < couplingTL.length) {
      const prev        = couplingTL[i - 1];
      const curr        = couplingTL[i];
      const edgesDelta  = _safeNum(curr.totalEdges) - _safeNum(prev.totalEdges);
      const circGrew    = _safeNum(curr.circularDependencyCount) > _safeNum(prev.circularDependencyCount);

      let sev = null;
      if (circGrew || edgesDelta >= 100) sev = 'critical';
      else if (edgesDelta >= 50)         sev = 'high';

      if (sev) {
        patterns.couplingSpikeCount++;
        intervalHit = true;
        _update('coupling_spike', sev);
      }
    }

    // Rule 4 — api_linkage_drop
    if (i < apiTL.length) {
      const prev       = apiTL[i - 1];
      const curr       = apiTL[i];
      const unresDelta = _safeNum(curr.unresolvedFrontendCallCount) - _safeNum(prev.unresolvedFrontendCallCount);
      const mmDelta    = _safeNum(curr.methodMismatchCount)         - _safeNum(prev.methodMismatchCount);

      let sev = null;
      if (unresDelta >= 5)  sev = 'high';
      if (mmDelta >= 3)     sev = _maxSev(sev, 'medium');

      if (sev) {
        patterns.apiLinkageDropCount++;
        intervalHit = true;
        _update('api_linkage_drop', sev);
      }
    }

    // Rule 5 — boundary_spike
    if (i < couplingTL.length) {
      const prev        = couplingTL[i - 1];
      const curr        = couplingTL[i];
      const boundDelta  = _safeNum(curr.boundaryViolationCount) - _safeNum(prev.boundaryViolationCount);

      let sev = null;
      if (boundDelta >= 5)      sev = 'critical';
      else if (boundDelta >= 2) sev = 'high';

      if (sev) {
        patterns.boundarySpikeCount++;
        intervalHit = true;
        _update('boundary_spike', sev);
      }
    }

    // Rule 6 — implementation_debt_surge
    if (i < implTL.length) {
      const prev   = implTL[i - 1];
      const curr   = implTL[i];
      const sigD   = _safeNum(curr.implementationSignalCount) - _safeNum(prev.implementationSignalCount);
      const phD    = _safeNum(curr.placeholderCount)          - _safeNum(prev.placeholderCount);
      const scafD  = _safeNum(curr.scaffoldLikeFileCount)     - _safeNum(prev.scaffoldLikeFileCount);

      let sev = null;
      if (sigD >= 3)             sev = 'high';
      if (phD >= 5 || scafD >= 5) sev = _maxSev(sev, 'medium');

      if (sev) {
        patterns.implementationDebtSurgeCount++;
        intervalHit = true;
        _update('implementation_debt_surge', sev);
      }
    }

    if (isLast && intervalHit) patterns.latestSnapshotAnomalous = true;
  }

  // Rule 7 — volatility_outlier (whole-timeline signal)
  const deltas = scoreTimeline.slice(1).map(function(e) { return _safeNum(e.deltaFromPrevious); });
  if (deltas.length > 0) {
    let dirChanges = 0;
    for (let i = 1; i < deltas.length; i++) {
      const p = deltas[i - 1], c = deltas[i];
      if ((c > 0 && p < 0) || (c < 0 && p > 0)) dirChanges++;
    }
    const sumAbs    = deltas.reduce(function(s, d) { return s + Math.abs(d); }, 0);
    const avgAbsMove = sumAbs / deltas.length;

    let volSev = null;
    if (avgAbsMove >= 20)    volSev = 'high';
    else if (dirChanges >= 3) volSev = 'medium';

    if (volSev) {
      patterns.volatilityOutlierCount = 1;
      _update('volatility_outlier', volSev);
    }
  }

  // Build ordered anomalies array (one entry per detected type, worst severity)
  const anomalies = [];
  ANOMALY_ORDER.forEach(function(type) {
    if (!worstSev[type]) return;
    anomalies.push({
      type,
      severity: worstSev[type],
      summary:  ANOMALY_SUMMARIES[type],
      evidence: _timelineAnomalyEvidence(type, patterns, { collapseEvents }),
    });
  });

  return { anomalies, patterns };
}

// ── Portfolio anomaly detection ───────────────────────────────────────────────

function _detectPortfolioAnomalies(repoForecasts, portfolioForecast) {
  const outliers           = [];
  const portfolioAnomalies = [];

  _safeArray(repoForecasts).forEach(function(f) {
    if (!f || typeof f !== 'object') return;
    const risk   = _safeNum(f.degradationRisk);
    const traj   = (f.trajectory && typeof f.trajectory === 'object') ? f.trajectory : {};
    const ref    = { repoId: f.repoId, repoName: _safeStr(f.repoName) };

    // Rule 9a — high_degradation_risk
    if (risk >= 75) {
      outliers.push(Object.assign({}, ref, {
        type:     'high_degradation_risk',
        severity: risk >= 90 ? 'critical' : 'high',
        summary:  'Repository has high degradation risk (' + risk + ').',
        evidence: { degradationRisk: risk },
      }));
    }

    // Rule 9b — critical_forecast
    if (f.forecastLevel === 'critical') {
      outliers.push(Object.assign({}, ref, {
        type:     'critical_forecast',
        severity: 'critical',
        summary:  'Repository has critical structural degradation forecast.',
        evidence: { forecastLevel: f.forecastLevel, degradationRisk: risk },
      }));
    }

    // Rule 9c — low_confidence_high_risk
    if (risk >= 60 && f.confidenceLevel === 'low') {
      outliers.push(Object.assign({}, ref, {
        type:     'low_confidence_high_risk',
        severity: 'high',
        summary:  'Repository has high degradation risk with low forecast confidence.',
        evidence: { degradationRisk: risk, confidenceLevel: f.confidenceLevel },
      }));
    }

    // Rule 9d — volatile_forecast
    if (_safeStr(traj.scoreTrend) === 'volatile') {
      outliers.push(Object.assign({}, ref, {
        type:     'volatile_forecast',
        severity: 'medium',
        summary:  'Repository score trend is volatile.',
        evidence: { scoreTrend: traj.scoreTrend },
      }));
    }
  });

  if (portfolioForecast && typeof portfolioForecast === 'object') {
    // Rule 10a — portfolioForecastLevel critical
    if (portfolioForecast.portfolioForecastLevel === 'critical') {
      portfolioAnomalies.push({
        type:     'portfolio_outlier',
        severity: 'critical',
        summary:  'Portfolio structural forecast is at critical level.',
        evidence: {
          portfolioForecastLevel: portfolioForecast.portfolioForecastLevel,
          portfolioForecastScore: _safeNum(portfolioForecast.portfolioForecastScore),
        },
      });
    }

    // Rule 10b — projectedHotspots critical/high
    const severeHotspots = _safeArray(portfolioForecast.projectedHotspots).filter(function(h) {
      return h && (h.severity === 'critical' || h.severity === 'high');
    });
    if (severeHotspots.length > 0) {
      const hasCritical = severeHotspots.some(function(h) { return h.severity === 'critical'; });
      portfolioAnomalies.push({
        type:     'portfolio_outlier',
        severity: hasCritical ? 'high' : 'medium',
        summary:  severeHotspots.length + ' structural hotspot(s) at high or critical severity detected in portfolio forecast.',
        evidence: {
          hotspotCount: severeHotspots.length,
          hotspotTypes: severeHotspots.map(function(h) { return _safeStr(h.type); }),
        },
      });
    }
  }

  return { outliers, portfolioAnomalies };
}

// ── Anomaly score ─────────────────────────────────────────────────────────────

function _computeScore(anomalies, outliers) {
  let score = 0;
  anomalies.forEach(function(a) { score += _anomalyPoints(a.severity); });
  outliers.forEach(function(o) {
    if (o.severity === 'critical')    score += 25;
    else if (o.severity === 'high')   score += 15;
  });
  return Math.min(score, 100);
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _buildRecommendations(anomalies, outliers) {
  const recs     = [];
  const typesSeen = new Set(anomalies.map(function(a) { return a.type; }));

  if (anomalies.some(function(a) { return a.severity === 'critical'; }) && recs.length < MAX_RECS) {
    recs.push('Critical anomalies detected — immediate architectural investigation is required.');
  }
  if (typesSeen.has('score_collapse') && recs.length < MAX_RECS) {
    recs.push('Score collapse detected — investigate root causes of large score drops and prioritize structural remediation.');
  }
  if (typesSeen.has('coupling_spike') && recs.length < MAX_RECS) {
    recs.push('Coupling spike detected — audit dependency growth and break any new circular dependencies immediately.');
  }
  if (typesSeen.has('api_linkage_drop') && recs.length < MAX_RECS) {
    recs.push('API linkage degradation detected — verify frontend call patterns and backend route registration.');
  }
  if (typesSeen.has('boundary_spike') && recs.length < MAX_RECS) {
    recs.push('Boundary violations spiked — enforce architectural boundaries and review recent cross-layer changes.');
  }
  if (typesSeen.has('implementation_debt_surge') && recs.length < MAX_RECS) {
    recs.push('Implementation debt surged — resolve placeholder and scaffold patterns before merging new features.');
  }

  const highRiskOut = outliers.filter(function(o) { return o.severity === 'critical' || o.severity === 'high'; });
  if (highRiskOut.length > 0 && recs.length < MAX_RECS) {
    recs.push(highRiskOut.length + ' repo(s) flagged as high or critical risk outliers — prioritize architectural review for these repositories.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _buildSummary(anomalyLevel, score, anomalies, outliers) {
  if (anomalyLevel === 'none') {
    return 'No architecture anomalies detected — system appears structurally stable.';
  }
  return (
    'Architecture anomaly level: ' + anomalyLevel + ' (score: ' + score + '). '
    + anomalies.length + ' anomaly type(s) and ' + outliers.length + ' repo outlier(s) detected.'
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function detectArchitectureAnomalies(input) {
  if (!input || typeof input !== 'object') return _unknownResult();

  // Resolve timeline data
  let td = null;
  if (input.timelineData && typeof input.timelineData === 'object') {
    td = input.timelineData;
  } else if (Array.isArray(input.snapshots) && input.snapshots.length >= 2) {
    td = buildArchitectureTrendTimeline({ snapshots: input.snapshots });
  }

  const repoForecasts    = Array.isArray(input.repoForecasts) ? input.repoForecasts : null;
  const portfolioForecast = (input.portfolioForecast && typeof input.portfolioForecast === 'object')
    ? input.portfolioForecast : null;

  const hasTimeline  = td && _safeArray(td.scoreTimeline).length >= 2;
  const hasPortfolio = repoForecasts !== null || portfolioForecast !== null;

  if (!hasTimeline && !hasPortfolio) return _unknownResult();

  // Timeline anomalies
  let timelineAnomalies = [];
  let basePatterns      = _emptyPatterns();

  if (hasTimeline) {
    const tr        = _detectTimelineAnomalies(td);
    timelineAnomalies = tr.anomalies;
    basePatterns      = tr.patterns;
  }

  // Portfolio anomalies
  let outliers           = [];
  let portfolioAnomalies = [];

  if (hasPortfolio) {
    const pr        = _detectPortfolioAnomalies(repoForecasts, portfolioForecast);
    outliers           = pr.outliers;
    portfolioAnomalies = pr.portfolioAnomalies;
  }

  const allAnomalies = timelineAnomalies.concat(portfolioAnomalies);
  const anomalyScore = _computeScore(allAnomalies, outliers);
  const anomalyLevel = _anomalyLevel(anomalyScore);

  const timelineLen = hasTimeline ? _safeArray(td.scoreTimeline).length : 0;
  const forecastLen = repoForecasts ? repoForecasts.length : 0;
  const confidence  = _confidenceLevel(timelineLen, forecastLen);

  const patterns = Object.assign({}, basePatterns, { portfolioOutlierCount: outliers.length });

  return {
    anomalyLevel,
    anomalyScore,
    confidenceLevel:  confidence,
    summary:          _buildSummary(anomalyLevel, anomalyScore, allAnomalies, outliers),
    anomalies:        allAnomalies,
    outliers,
    patterns,
    recommendations:  _buildRecommendations(allAnomalies, outliers),
  };
}

module.exports = { detectArchitectureAnomalies };
