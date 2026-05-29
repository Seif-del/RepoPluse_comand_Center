'use strict';

// scoreEngineeringGovernance
// Answers: "How governable is this engineering portfolio right now?"
//
// Input:  { portfolioArchitecture, portfolioForecast, portfolioMaturity,
//            behavioralStability, architectureAnomalies, architectureRegressions,
//            couplingAlerts }
//
// Output: governanceScore, governanceLevel, confidenceLevel, summary,
//         dimensions, governanceRisks, strengths, executiveSignals, recommendations
//
// Pure function — no I/O, no mutation of input, deterministic output.

const MAX_RISKS     = 7;
const MAX_STRENGTHS = 5;
const MAX_RECS      = 5;

const WEIGHTS = {
  architectureGovernance: 0.30,
  maturityGovernance:     0.20,
  behavioralGovernance:   0.20,
  predictiveGovernance:   0.20,
  anomalyGovernance:      0.10,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
function _safeStr(v) { return typeof v === 'string' ? v : ''; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

const SEV_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
function _sevRank(s) { return SEV_RANK[s] || 0; }

function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

// ── Level mapping ─────────────────────────────────────────────────────────────

function _scoreToLevel(score) {
  if (score === null) return 'unknown';
  if (score >= 85) return 'excellent';
  if (score >= 70) return 'strong';
  if (score >= 45) return 'watch';
  if (score >= 20) return 'weak';
  return 'critical';
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    governanceScore:  0,
    governanceLevel:  'unknown',
    confidenceLevel:  'low',
    summary:          'Insufficient data — no usable governance dimensions available.',
    dimensions: {
      architectureGovernance: { score: null, level: 'unknown', drivers: [] },
      maturityGovernance:     { score: null, level: 'unknown', drivers: [] },
      behavioralGovernance:   { score: null, level: 'unknown', drivers: [] },
      predictiveGovernance:   { score: null, level: 'unknown', drivers: [] },
      anomalyGovernance:      { score: null, level: 'unknown', drivers: [] },
    },
    governanceRisks:  [],
    strengths:        [],
    executiveSignals: {
      interventionRequired:   false,
      highestRiskArea:        null,
      lowestScoringDimension: null,
      strongestDimension:     null,
      forecastConcern:        false,
      anomalyConcern:         false,
      confidenceConcern:      true,
    },
    recommendations: [],
  };
}

// ── Dimension A: architectureGovernance ──────────────────────────────────────

function _archDim(portfolioArchitecture) {
  if (!_isObj(portfolioArchitecture)) return { score: null, level: 'unknown', drivers: [] };

  const archLevel = _safeStr(portfolioArchitecture.architectureLevel);
  if (archLevel === 'unknown') return { score: null, level: 'unknown', drivers: [] };

  const raw = _safeNum(portfolioArchitecture.portfolioArchitectureScore);
  if (raw === null) return { score: null, level: 'unknown', drivers: [] };

  const score   = Math.round(_clamp(raw, 0, 100));
  const drivers = [];

  if (archLevel) drivers.push('Architecture health: ' + archLevel);

  const couplingLevel = _isObj(portfolioArchitecture.portfolioCoupling)
    ? _safeStr(portfolioArchitecture.portfolioCoupling.couplingLevel) : '';
  if (couplingLevel && couplingLevel !== 'unknown') {
    drivers.push('Portfolio coupling: ' + couplingLevel);
  }

  const violations = _safeArray(portfolioArchitecture.systemicBoundaryViolations);
  if (violations.length > 0) {
    drivers.push(violations.length + ' systemic boundary violation(s)');
  }

  const implScore = _isObj(portfolioArchitecture.implementationIntegrity)
    ? _safeNum(portfolioArchitecture.implementationIntegrity.averageCompletenessScore) : null;
  if (implScore !== null) {
    drivers.push('Implementation completeness: ' + Math.round(implScore) + '%');
  }

  return { score, level: _scoreToLevel(score), drivers };
}

// ── Dimension B: maturityGovernance ──────────────────────────────────────────

function _maturityDim(portfolioMaturity) {
  if (!_isObj(portfolioMaturity)) return { score: null, level: 'unknown', drivers: [] };

  const raw = _safeNum(portfolioMaturity.portfolioMaturityScore);
  if (raw === null) return { score: null, level: 'unknown', drivers: [] };

  const score   = Math.round(_clamp(raw, 0, 100));
  const drivers = [];

  const ml = _safeStr(portfolioMaturity.maturityLevel);
  if (ml && ml !== 'unknown') drivers.push('Portfolio maturity: ' + ml);

  const gaps = _safeArray(portfolioMaturity.commonGaps);
  if (gaps.length > 0) drivers.push(gaps.length + ' common maturity gap(s) identified');

  return { score, level: _scoreToLevel(score), drivers };
}

// ── Dimension C: behavioralGovernance ────────────────────────────────────────

function _behavioralDim(behavioralStability) {
  if (!_isObj(behavioralStability)) return { score: null, level: 'unknown', drivers: [] };

  const raw = _safeNum(behavioralStability.indexScore);
  if (raw === null) return { score: null, level: 'unknown', drivers: [] };

  const score   = Math.round(_clamp(raw, 0, 100));
  const drivers = [];

  const sl = _safeStr(behavioralStability.stabilityLevel);
  if (sl && sl !== 'unknown') drivers.push('Behavioral stability: ' + sl);

  const bDrivers = _safeArray(behavioralStability.drivers);
  if (bDrivers.length > 0) drivers.push(bDrivers.length + ' behavioral driver(s) observed');

  return { score, level: _scoreToLevel(score), drivers };
}

// ── Dimension D: predictiveGovernance ────────────────────────────────────────

function _predictiveDim(portfolioForecast) {
  if (!_isObj(portfolioForecast)) return { score: null, level: 'unknown', drivers: [] };

  const fl       = _safeStr(portfolioForecast.portfolioForecastLevel);
  const rawScore = _safeNum(portfolioForecast.portfolioForecastScore);

  // If both are missing/unknown, dimension unknown
  if (fl === 'unknown' && rawScore === null) return { score: null, level: 'unknown', drivers: [] };

  let score;
  if (rawScore !== null) {
    // portfolioForecastScore is risk-style (higher = worse) — invert
    score = Math.round(_clamp(100 - rawScore, 0, 100));
  } else {
    // Derive from level
    const LEVEL_TO_SCORE = { stable: 85, watch: 60, degrading: 35, critical: 10 };
    score = LEVEL_TO_SCORE[fl] !== undefined ? LEVEL_TO_SCORE[fl] : null;
    if (score === null) return { score: null, level: 'unknown', drivers: [] };
  }

  const drivers = [];
  if (fl && fl !== 'unknown') drivers.push('Portfolio forecast: ' + fl);

  const govRisk = _isObj(portfolioForecast.projectedGovernanceRisk)
    ? _safeNum(portfolioForecast.projectedGovernanceRisk.governanceRiskScore) : null;
  if (govRisk !== null && govRisk > 0) {
    drivers.push('Projected governance risk: ' + govRisk);
  }

  const hotspots     = _safeArray(portfolioForecast.projectedHotspots);
  const critHotspots = hotspots.filter(function(h) { return _safeStr(h.severity) === 'critical'; });
  if (critHotspots.length > 0) {
    drivers.push(critHotspots.length + ' critical projected hotspot(s)');
  } else if (hotspots.length > 0) {
    drivers.push(hotspots.length + ' projected hotspot(s)');
  }

  return { score, level: _scoreToLevel(score), drivers };
}

// ── Dimension E: anomalyGovernance ───────────────────────────────────────────

function _anomalyDim(architectureAnomalies, architectureRegressions, couplingAlerts) {
  const hasAnomalies   = _isObj(architectureAnomalies);
  const hasRegressions = _isObj(architectureRegressions);
  const hasCoupling    = _isObj(couplingAlerts);

  if (!hasAnomalies && !hasRegressions && !hasCoupling) {
    return { score: null, level: 'unknown', drivers: [] };
  }

  let score   = null;
  const drivers = [];

  if (hasAnomalies) {
    const anomScore = _safeNum(architectureAnomalies.anomalyScore);
    if (anomScore !== null) {
      score = _clamp(100 - anomScore, 0, 100);
    }
    const al = _safeStr(architectureAnomalies.anomalyLevel);
    if (al && al !== 'unknown') drivers.push('Anomaly level: ' + al);

    const critAnoms = _safeArray(architectureAnomalies.anomalies)
      .filter(function(a) { return _safeStr(a.severity) === 'critical'; });
    if (critAnoms.length > 0) drivers.push(critAnoms.length + ' critical anomaly(ies) detected');
  }

  if (hasRegressions) {
    const rl = _safeStr(architectureRegressions.regressionLevel);
    if (rl && rl !== 'unknown' && rl !== 'none') {
      drivers.push('Regression level: ' + rl);
    }
    if (score === null) {
      const rs = _safeNum(architectureRegressions.regressionScore);
      if (rs !== null) score = _clamp(100 - rs, 0, 100);
    }
  }

  if (hasCoupling) {
    const cl = _safeStr(couplingAlerts.alertLevel);
    if (cl && cl !== 'unknown' && cl !== 'none') {
      drivers.push('Coupling alert level: ' + cl);
    }
    if (score === null) {
      const cs = _safeNum(couplingAlerts.couplingGrowthScore);
      if (cs !== null) score = _clamp(100 - cs, 0, 100);
    }
  }

  if (score === null) return { score: null, level: 'unknown', drivers };

  score = Math.round(score);
  return { score, level: _scoreToLevel(score), drivers };
}

// ── Weighted score ────────────────────────────────────────────────────────────

function _weightedScore(dimensions) {
  let weightedSum = 0;
  let totalWeight = 0;

  for (const key of Object.keys(WEIGHTS)) {
    const dim = dimensions[key];
    if (dim.score !== null) {
      weightedSum += dim.score * WEIGHTS[key];
      totalWeight += WEIGHTS[key];
    }
  }

  if (totalWeight === 0) return null;
  return Math.round(weightedSum / totalWeight);
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(dimensions, input) {
  const usableKeys = Object.keys(dimensions).filter(function(k) {
    return dimensions[k].score !== null;
  });

  if (usableKeys.length < 3) return 'low';

  const confMap = {
    architectureGovernance: _isObj(input.portfolioArchitecture) ? _safeStr(input.portfolioArchitecture.confidenceLevel) : '',
    maturityGovernance:     _isObj(input.portfolioMaturity)     ? _safeStr(input.portfolioMaturity.confidenceLevel)     : '',
    behavioralGovernance:   _isObj(input.behavioralStability)   ? _safeStr(input.behavioralStability.confidenceLevel)   : '',
    predictiveGovernance:   _isObj(input.portfolioForecast)     ? _safeStr(input.portfolioForecast.confidenceLevel)     : '',
    anomalyGovernance:      _isObj(input.architectureAnomalies) ? _safeStr(input.architectureAnomalies.confidenceLevel) : '',
  };

  const medHighCount = usableKeys.filter(function(k) {
    const c = confMap[k];
    return c === 'medium' || c === 'high';
  }).length;

  if (usableKeys.length >= 4 && medHighCount >= 3) return 'high';
  return 'medium';
}

// ── Governance risks ──────────────────────────────────────────────────────────

function _governanceRisks(dimensions, input) {
  const risks = [];

  const DIM_LABELS = {
    architectureGovernance: 'Architecture',
    maturityGovernance:     'Maturity',
    behavioralGovernance:   'Behavioral stability',
    predictiveGovernance:   'Predictive',
    anomalyGovernance:      'Anomaly',
  };

  // Weak/critical dimensions
  for (const key of Object.keys(dimensions)) {
    const dim = dimensions[key];
    if (dim.level === 'critical') {
      risks.push({
        type:     key + '_critical',
        severity: 'critical',
        summary:  DIM_LABELS[key] + ' governance is critical (score: ' + dim.score + ')',
        source:   key,
      });
    } else if (dim.level === 'weak') {
      risks.push({
        type:     key + '_weak',
        severity: 'high',
        summary:  DIM_LABELS[key] + ' governance is weak (score: ' + dim.score + ')',
        source:   key,
      });
    }
  }

  // Critical/degrading portfolio forecast
  if (_isObj(input.portfolioForecast)) {
    const fl = _safeStr(input.portfolioForecast.portfolioForecastLevel);
    if (fl === 'critical') {
      risks.push({
        type:     'portfolio_forecast_critical',
        severity: 'critical',
        summary:  'Portfolio forecast is critical — widespread structural degradation projected',
        source:   'portfolioForecast',
      });
    } else if (fl === 'degrading') {
      risks.push({
        type:     'portfolio_forecast_degrading',
        severity: 'high',
        summary:  'Portfolio forecast is degrading — multiple repositories projected to worsen',
        source:   'portfolioForecast',
      });
    }
  }

  // High/critical anomaly level
  if (_isObj(input.architectureAnomalies)) {
    const al = _safeStr(input.architectureAnomalies.anomalyLevel);
    if (al === 'critical') {
      risks.push({
        type:     'architecture_anomalies_critical',
        severity: 'critical',
        summary:  'Critical architecture anomalies detected across portfolio',
        source:   'architectureAnomalies',
      });
    } else if (al === 'anomaly') {
      risks.push({
        type:     'architecture_anomalies',
        severity: 'high',
        summary:  'Significant architecture anomalies detected across portfolio',
        source:   'architectureAnomalies',
      });
    }
  }

  // High/critical regression level ('regression' = elevated, 'critical' = critical)
  if (_isObj(input.architectureRegressions)) {
    const rl = _safeStr(input.architectureRegressions.regressionLevel);
    if (rl === 'critical') {
      risks.push({
        type:     'architecture_regressions_critical',
        severity: 'critical',
        summary:  'Critical architecture regressions detected',
        source:   'architectureRegressions',
      });
    } else if (rl === 'regression') {
      risks.push({
        type:     'architecture_regressions',
        severity: 'high',
        summary:  'Architecture regression risk is elevated',
        source:   'architectureRegressions',
      });
    }
  }

  // High/critical coupling alert ('alert' = elevated, 'critical' = critical)
  if (_isObj(input.couplingAlerts)) {
    const cl = _safeStr(input.couplingAlerts.alertLevel);
    if (cl === 'critical') {
      risks.push({
        type:     'coupling_alerts_critical',
        severity: 'critical',
        summary:  'Critical coupling growth — circular dependency risk is severe',
        source:   'couplingAlerts',
      });
    } else if (cl === 'alert') {
      risks.push({
        type:     'coupling_alerts',
        severity: 'high',
        summary:  'Coupling growth alert — dependency entanglement is accelerating',
        source:   'couplingAlerts',
      });
    }
  }

  // Immature portfolio maturity
  if (_isObj(input.portfolioMaturity)) {
    const ml = _safeStr(input.portfolioMaturity.maturityLevel);
    if (ml === 'immature') {
      risks.push({
        type:     'low_portfolio_maturity',
        severity: 'high',
        summary:  'Portfolio maturity is immature — engineering practices need significant investment',
        source:   'portfolioMaturity',
      });
    }
  }

  // Unstable behavioral stability
  if (_isObj(input.behavioralStability)) {
    const sl = _safeStr(input.behavioralStability.stabilityLevel);
    if (sl === 'unstable') {
      risks.push({
        type:     'behavioral_instability',
        severity: 'high',
        summary:  'Behavioral stability is unstable — team/process patterns are erratic',
        source:   'behavioralStability',
      });
    } else if (sl === 'volatile') {
      risks.push({
        type:     'behavioral_volatility',
        severity: 'medium',
        summary:  'Behavioral stability is volatile — delivery patterns are inconsistent',
        source:   'behavioralStability',
      });
    }
  }

  risks.sort(function(a, b) { return _sevRank(b.severity) - _sevRank(a.severity); });
  return risks.slice(0, MAX_RISKS);
}

// ── Strengths ─────────────────────────────────────────────────────────────────

function _strengths(dimensions, input) {
  const strs = [];

  const DIM_LABELS = {
    architectureGovernance: 'Architecture governance',
    maturityGovernance:     'Maturity governance',
    behavioralGovernance:   'Behavioral governance',
    predictiveGovernance:   'Predictive governance',
    anomalyGovernance:      'Anomaly governance',
  };

  for (const key of Object.keys(dimensions)) {
    const dim = dimensions[key];
    if (dim.level === 'excellent' || dim.level === 'strong') {
      strs.push({
        type:    key,
        summary: DIM_LABELS[key] + ' is ' + dim.level + ' (score: ' + dim.score + ')',
        source:  key,
      });
    }
  }

  // Stable portfolio forecast
  if (_isObj(input.portfolioForecast)) {
    const fl = _safeStr(input.portfolioForecast.portfolioForecastLevel);
    if (fl === 'stable') {
      strs.push({
        type:    'stable_forecast',
        summary: 'Portfolio forecast is stable — no structural degradation projected',
        source:  'portfolioForecast',
      });
    }
  }

  // No architecture anomalies
  if (_isObj(input.architectureAnomalies)) {
    const al = _safeStr(input.architectureAnomalies.anomalyLevel);
    if (al === 'none') {
      strs.push({
        type:    'no_anomalies',
        summary: 'No architecture anomalies detected across portfolio',
        source:  'architectureAnomalies',
      });
    }
  }

  return strs.slice(0, MAX_STRENGTHS);
}

// ── Executive signals ─────────────────────────────────────────────────────────

function _executiveSignals(governanceScore, governanceLevel, dimensions, governanceRisks, confidenceLevel) {
  const hasCriticalRisk     = governanceRisks.some(function(r) { return r.severity === 'critical'; });
  const interventionRequired = governanceLevel === 'weak' || governanceLevel === 'critical' || hasCriticalRisk;

  let lowestDim   = null;
  let lowestScore = Infinity;
  let strongestDim   = null;
  let highestScore   = -Infinity;

  for (const key of Object.keys(dimensions)) {
    const s = dimensions[key].score;
    if (s !== null) {
      if (s < lowestScore)  { lowestScore  = s; lowestDim   = key; }
      if (s > highestScore) { highestScore = s; strongestDim = key; }
    }
  }

  const highestRiskArea = governanceRisks.length > 0 ? governanceRisks[0].source : null;

  const pf = dimensions.predictiveGovernance;
  const ag = dimensions.anomalyGovernance;

  return {
    interventionRequired,
    highestRiskArea,
    lowestScoringDimension: lowestDim,
    strongestDimension:     strongestDim,
    forecastConcern:  pf.score !== null && pf.score < 45,
    anomalyConcern:   ag.score !== null && ag.score < 45,
    confidenceConcern: confidenceLevel === 'low',
  };
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(governanceLevel, dimensions, governanceRisks, input) {
  const recs = [];

  // 1. Critical governance risks
  const critRisks = governanceRisks.filter(function(r) { return r.severity === 'critical'; });
  if (critRisks.length > 0) {
    recs.push('Immediately address critical governance risks: ' +
      critRisks.map(function(r) { return r.type; }).join(', '));
  }

  // 2. Weakest dimension
  let weakestKey   = null;
  let weakestScore = Infinity;
  for (const key of Object.keys(dimensions)) {
    const s = dimensions[key].score;
    if (s !== null && s < weakestScore) { weakestScore = s; weakestKey = key; }
  }

  const DIM_ADVICE = {
    architectureGovernance: 'Invest in architecture health — resolve boundary violations and reduce coupling',
    maturityGovernance:     'Prioritize engineering maturity initiatives — close common practice gaps',
    behavioralGovernance:   'Stabilize team behavioral patterns — investigate and address volatility drivers',
    predictiveGovernance:   'Act on degradation forecasts before they materialize into structural failures',
    anomalyGovernance:      'Investigate and resolve detected anomalies and regressions promptly',
  };

  if (weakestKey && weakestScore < 45) {
    recs.push(DIM_ADVICE[weakestKey]);
  }

  // 3. Predictive degradation (if not already covered by weakest dim)
  const pf = dimensions.predictiveGovernance;
  if (pf.score !== null && pf.score < 45 && weakestKey !== 'predictiveGovernance') {
    recs.push('Act on degradation forecasts — structural regression is projected for multiple repositories');
  }

  // 4. Anomaly/coupling pressure
  if (_isObj(input.couplingAlerts)) {
    const cl = _safeStr(input.couplingAlerts.alertLevel);
    if (cl === 'alert' || cl === 'critical') {
      recs.push('Reduce coupling growth — refactor circular dependencies and entangled modules');
    }
  }

  const ag = dimensions.anomalyGovernance;
  if (ag.score !== null && ag.score < 45 && weakestKey !== 'anomalyGovernance' && recs.length < MAX_RECS) {
    recs.push('Resolve architecture anomalies before they compound into structural regressions');
  }

  // 5. Maturity/behavioral weakness
  const mg = dimensions.maturityGovernance;
  const bg = dimensions.behavioralGovernance;
  if (mg.score !== null && mg.score < 45 && weakestKey !== 'maturityGovernance' && recs.length < MAX_RECS) {
    recs.push('Invest in engineering maturity — close practice gaps across teams');
  } else if (bg.score !== null && bg.score < 45 && weakestKey !== 'behavioralGovernance' && recs.length < MAX_RECS) {
    recs.push('Address behavioral instability — align team patterns with stable delivery practices');
  }

  // 6. Preserve strengths when governance is healthy
  if ((governanceLevel === 'strong' || governanceLevel === 'excellent') && recs.length === 0) {
    recs.push('Portfolio governance is healthy — maintain current practices and monitor for emerging risks');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(governanceLevel, governanceScore, dimensions, confidenceLevel) {
  if (governanceLevel === 'unknown') {
    return 'Insufficient data — no usable governance dimensions available.';
  }
  const usable = Object.keys(dimensions).filter(function(k) {
    return dimensions[k].score !== null;
  }).length;
  const desc = {
    excellent: 'Portfolio governance is excellent',
    strong:    'Portfolio governance is strong',
    watch:     'Portfolio governance requires attention',
    weak:      'Portfolio governance is weak and needs improvement',
    critical:  'Portfolio governance is critically deficient',
  };
  return (desc[governanceLevel] || 'Portfolio governance assessed') +
    ' (score: ' + governanceScore + ', ' + usable + '/5 dimensions, ' + confidenceLevel + ' confidence).';
}

// ── Main ──────────────────────────────────────────────────────────────────────

function scoreEngineeringGovernance(input) {
  if (!_isObj(input)) return _unknownResult();

  const {
    portfolioArchitecture,
    portfolioForecast,
    portfolioMaturity,
    behavioralStability,
    architectureAnomalies,
    architectureRegressions,
    couplingAlerts,
  } = input;

  const dimensions = {
    architectureGovernance: _archDim(portfolioArchitecture),
    maturityGovernance:     _maturityDim(portfolioMaturity),
    behavioralGovernance:   _behavioralDim(behavioralStability),
    predictiveGovernance:   _predictiveDim(portfolioForecast),
    anomalyGovernance:      _anomalyDim(architectureAnomalies, architectureRegressions, couplingAlerts),
  };

  const usableCount = Object.keys(dimensions).filter(function(k) {
    return dimensions[k].score !== null;
  }).length;
  if (usableCount === 0) return _unknownResult();

  const governanceScore = _weightedScore(dimensions);
  const governanceLevel = _scoreToLevel(governanceScore);
  const confidenceLevel = _confidenceLevel(dimensions, input);
  const governanceRisks = _governanceRisks(dimensions, input);
  const strengths       = _strengths(dimensions, input);
  const executiveSignals = _executiveSignals(
    governanceScore, governanceLevel, dimensions, governanceRisks, confidenceLevel);
  const recommendations = _recommendations(governanceLevel, dimensions, governanceRisks, input);
  const summary         = _summary(governanceLevel, governanceScore, dimensions, confidenceLevel);

  return {
    governanceScore,
    governanceLevel,
    confidenceLevel,
    summary,
    dimensions,
    governanceRisks,
    strengths,
    executiveSignals,
    recommendations,
  };
}

module.exports = { scoreEngineeringGovernance };
