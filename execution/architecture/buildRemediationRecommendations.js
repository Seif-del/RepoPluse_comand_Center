'use strict';

// buildRemediationRecommendations
// Deterministic recommendation intelligence for architecture/governance remediation.
// NOT an LLM integration — all logic is rule-based and deterministic.
//
// Input:  { governance, forecast, anomaly, regression, couplingAlert,
//            watchlistItem, architectureSnapshot }
//
// Output: recommendationLevel, remediationScore, confidenceLevel, summary,
//         recommendations, actionPlan, priorities, estimatedImpact
//
// Pure function — no I/O, no AI/LLM, no mutation of input, deterministic output.

const MAX_RECS = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
function _safeStr(v) { return typeof v === 'string' ? v : ''; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const PRI_RANK  = { low: 1, medium: 2, high: 3, critical: 4 };
const PRI_SCORE = { critical: 25, high: 15, medium: 8, low: 3 };
function _priRank(p)  { return PRI_RANK[_safeStr(p)]  || 0; }
function _priScore(p) { return PRI_SCORE[_safeStr(p)] || 0; }

function _rec(id, category, priority, title, rationale, expectedOutcome, evidence) {
  return { id, category, priority, title, rationale, expectedOutcome, evidence };
}

// ── Usable sources & confidence ───────────────────────────────────────────────

function _usableSources(input) {
  let n = 0;
  const FIELDS = ['governance', 'forecast', 'anomaly', 'regression',
                  'couplingAlert', 'watchlistItem', 'architectureSnapshot'];
  for (const f of FIELDS) {
    if (_isObj(input[f])) n++;
  }
  return n;
}

function _confidenceLevel(sources) {
  if (sources >= 4) return 'high';
  if (sources >= 2) return 'medium';
  return 'low';
}

// ── Unknown/none results ───────────────────────────────────────────────────────

function _emptyPriorities() {
  return {
    highestPriorityCategory:          null,
    highestPriorityRecommendationId:  null,
    criticalRecommendationCount:      0,
    highRecommendationCount:          0,
  };
}

function _emptyActionPlan() {
  return { immediate: [], shortTerm: [], mediumTerm: [], longTerm: [] };
}

function _emptyImpact(confidence) {
  return { governanceImpact: 0, architectureImpact: 0, riskReduction: 0, confidence };
}

function _versionBoundaryContext(versionContext) {
  if (!_isObj(versionContext)) {
    return { boundaryCount: 0, suppressedIntervals: 0, affectsConfidence: false };
  }
  const boundaryCount      = _safeNum(versionContext.boundaryCount);
  const suppressedIntervals = _safeNum(versionContext.suppressedIntervals);
  return { boundaryCount, suppressedIntervals, affectsConfidence: boundaryCount > 0 };
}

function _adjustedConfidence(base, vbc) {
  if (!_isObj(vbc) || !vbc.affectsConfidence) return base;
  if (base === 'high')   return 'medium';
  if (base === 'medium') return 'low';
  return 'low';
}

function _confidenceReasons(vbc) {
  const reasons = [];
  if (_isObj(vbc) && vbc.affectsConfidence) {
    const n = _safeNum(vbc.boundaryCount);
    reasons.push(
      n + ' version ' + (n === 1 ? 'boundary' : 'boundaries') +
      ' suppressed historical score comparison' + (n === 1 ? '.' : 's.')
    );
  }
  return reasons;
}

function _unknownResult() {
  return {
    recommendationLevel:    'unknown',
    remediationScore:       0,
    rawRemediationScore:    0,
    scoreCapApplied:        false,
    confidenceLevel:        'low',
    confidenceReasons:      [],
    versionBoundaryContext: { boundaryCount: 0, suppressedIntervals: 0, affectsConfidence: false },
    summary:                'Insufficient data — no usable intelligence sources provided.',
    recommendations:        [],
    actionPlan:             _emptyActionPlan(),
    priorities:             _emptyPriorities(),
    estimatedImpact:        _emptyImpact('low'),
  };
}

// ── Governance recommendations ────────────────────────────────────────────────

const GOV_RISK_CATEGORY = {
  architectureGovernance:  'architecture',
  maturityGovernance:      'governance',
  behavioralGovernance:    'observability',
  predictiveGovernance:    'architecture',
  anomalyGovernance:       'anomaly',
  portfolioForecast:       'architecture',
  architectureAnomalies:   'anomaly',
  architectureRegressions: 'architecture',
  couplingAlerts:          'coupling',
  portfolioMaturity:       'governance',
  behavioralStability:     'observability',
};

function _govRecs(governance) {
  const recs = [];
  if (!_isObj(governance)) return recs;

  const gl  = _safeStr(governance.governanceLevel);
  const gs  = _safeNum(governance.governanceScore);
  const bhs = (typeof governance.boundaryHealthScore === 'number') ? governance.boundaryHealthScore : null;
  const cs  = (typeof governance.completenessScore   === 'number') ? governance.completenessScore   : null;
  const ls  = (typeof governance.linkageScore        === 'number') ? governance.linkageScore        : null;

  const componentEvidence = {};
  if (bhs !== null) componentEvidence.boundaryHealthScore = bhs;
  if (cs  !== null) componentEvidence.completenessScore   = cs;
  if (ls  !== null) componentEvidence.linkageScore        = ls;

  if (gl === 'critical') {
    recs.push(_rec(
      'governance_remediation',
      'governance',
      'critical',
      'Establish architecture governance framework',
      'Architecture health is critical (score: ' + gs + '), indicating weak governance oversight.',
      'Improved governance score and reduced architecture risk',
      Object.assign({ governanceScore: gs, governanceLevel: gl }, componentEvidence)
    ));
  } else if (gl === 'weak') {
    recs.push(_rec(
      'governance_remediation',
      'governance',
      'high',
      'Strengthen architecture governance practices',
      'Architecture health is weak (score: ' + gs + '), indicating governance practices need strengthening.',
      'Improved governance score and engineering quality standards',
      Object.assign({ governanceScore: gs, governanceLevel: gl }, componentEvidence)
    ));
  }

  // Targeted recs from governance risks (max 3 targeted to avoid flooding)
  const risks  = _safeArray(governance.governanceRisks);
  let targeted = 0;
  for (const risk of risks) {
    if (targeted >= 3) break;
    const sev = _safeStr(risk.severity);
    if (sev !== 'critical' && sev !== 'high') continue;

    const riskType = _safeStr(risk.type);
    const source   = _safeStr(risk.source);
    const id       = 'governance_risk_' + riskType;
    if (recs.some(function(r) { return r.id === id; })) continue;

    const cat = GOV_RISK_CATEGORY[source] || 'governance';
    recs.push(_rec(
      id,
      cat,
      sev === 'critical' ? 'critical' : 'high',
      'Resolve governance risk: ' + riskType.replace(/_/g, ' '),
      _safeStr(risk.summary),
      'Reduced governance risk in ' + cat + ' dimension',
      { riskType, severity: sev, source }
    ));
    targeted++;
  }

  return recs;
}

// ── Forecast recommendations ──────────────────────────────────────────────────

function _forecastRecs(forecast) {
  const recs = [];
  if (!_isObj(forecast)) return recs;

  const fl      = _safeStr(forecast.forecastLevel);
  const dr      = _safeNum(forecast.degradationRisk);
  const traj    = _isObj(forecast.trajectory) ? forecast.trajectory : {};
  const urgency = _safeStr(traj.interventionUrgency);

  if (urgency === 'immediate') {
    recs.push(_rec(
      'forecast_immediate_intervention',
      'architecture',
      'critical',
      'Immediate architecture intervention required',
      'Forecast requires immediate intervention (degradation risk: ' + dr + '%). Trajectory demands urgent structural action.',
      'Halt degradation trajectory and begin structural recovery',
      { forecastLevel: fl, degradationRisk: dr, interventionUrgency: urgency }
    ));
    return recs;
  }

  if (fl === 'critical') {
    recs.push(_rec(
      'forecast_stabilization',
      'architecture',
      'critical',
      'Stabilize critical architecture degradation trajectory',
      'Forecast is critical (risk: ' + dr + '%). Significant structural degradation projected without intervention.',
      'Reverse degradation trend and stabilize architecture health score',
      { forecastLevel: fl, degradationRisk: dr }
    ));
  } else if (fl === 'degrading') {
    recs.push(_rec(
      'forecast_stabilization',
      'architecture',
      'high',
      'Address degrading architecture forecast',
      'Architecture forecast is degrading (risk: ' + dr + '%). Continued structural decline projected.',
      'Slow and reverse degradation before it reaches critical levels',
      { forecastLevel: fl, degradationRisk: dr }
    ));
  } else if (fl === 'watch') {
    recs.push(_rec(
      'forecast_watch',
      'architecture',
      'medium',
      'Monitor watch-state architecture forecast',
      'Architecture forecast is in watch state (risk: ' + dr + '%). Close monitoring needed.',
      'Prevent escalation from watch to degrading',
      { forecastLevel: fl, degradationRisk: dr }
    ));
  }

  return recs;
}

// ── Regression recommendations ────────────────────────────────────────────────

function _regressionRecs(regression) {
  const recs = [];
  if (!_isObj(regression)) return recs;

  const rl       = _safeStr(regression.regressionLevel);
  const rs       = _safeNum(regression.regressionScore);
  const patterns = _isObj(regression.patterns) ? regression.patterns : {};

  // Score regression → architecture review
  if (rl === 'critical' || rl === 'regression') {
    const scoreReg          = _safeArray(regression.regressions).find(function(r) { return r.type === 'score_regression'; });
    const scoreDropEvidence = (scoreReg && Array.isArray(scoreReg.evidence)) ? scoreReg.evidence : [];
    const apiReg            = _safeArray(regression.regressions).find(function(r) { return r.type === 'api_regression'; });
    const apiRegressionEvidence = (apiReg && Array.isArray(apiReg.evidence)) ? apiReg.evidence : [];
    recs.push(_rec(
      'regression_review',
      'architecture',
      rl === 'critical' ? 'critical' : 'high',
      'Conduct architecture regression review',
      'Architecture regression detected (level: ' + rl + ', score: ' + rs + '). Structural deterioration requires investigation.',
      'Root causes identified and corrective measures implemented',
      { regressionLevel: rl, regressionScore: rs,
        scoreDropCount: _safeNum(patterns.scoreDropCount),
        scoreDropEvidence, apiRegressionEvidence }
    ));
  }

  // Level degradation count ≥ 2 → governance review
  const levelDeg = _safeNum(patterns.levelDegradationCount);
  if (levelDeg >= 2) {
    recs.push(_rec(
      'regression_governance',
      'governance',
      'high',
      'Governance review for repeated level degradation',
      levelDeg + ' level degradation event(s) detected. Engineering governance is insufficient to prevent recurring regression.',
      'Stronger governance prevents future regressions',
      { levelDegradationCount: levelDeg }
    ));
  }

  // Recurring risk count ≥ 2 → recurring-risk remediation
  const recurring = _safeNum(patterns.recurringRiskCount);
  if (recurring >= 2) {
    recs.push(_rec(
      'regression_recurring',
      'architecture',
      'high',
      'Resolve recurring architecture risk patterns',
      recurring + ' recurring risk pattern(s) detected. Root causes have not been fully resolved.',
      'Root causes eliminated, recurring patterns broken',
      { recurringRiskCount: recurring }
    ));
  }

  return recs;
}

// ── Coupling recommendations ──────────────────────────────────────────────────

function _couplingRecs(couplingAlert) {
  const recs = [];
  if (!_isObj(couplingAlert)) return recs;

  const cl    = _safeStr(couplingAlert.alertLevel);
  const trend = _isObj(couplingAlert.couplingTrend) ? couplingAlert.couplingTrend : {};

  const circDelta        = _safeNum(trend.circularDependencyDelta);
  const boundDelta       = _safeNum(trend.boundaryViolationDelta);
  const acceleration     = _safeNum(trend.acceleration);
  const pressureEscalated = trend.pressureEscalated === true;

  // Circular dependency hotspot → critical decoupling
  if (circDelta > 0 || cl === 'critical') {
    recs.push(_rec(
      'coupling_decoupling',
      'coupling',
      'critical',
      'Eliminate circular dependency growth',
      'Circular dependencies growing (delta: +' + circDelta + '). Circular deps create tight coupling that impairs testability and maintainability.',
      'Reduced circular dependency count, improved modularity',
      { circularDependencyDelta: circDelta, alertLevel: cl }
    ));
  }

  // Boundary coupling growth → boundary enforcement
  if (boundDelta > 0) {
    recs.push(_rec(
      'coupling_boundary',
      'coupling',
      cl === 'critical' ? 'critical' : 'high',
      'Enforce architecture boundary constraints',
      'Boundary violations growing (delta: +' + boundDelta + '). Layer boundary violations increase structural coupling.',
      'Reduced boundary violations, cleaner architecture layering',
      { boundaryViolationDelta: boundDelta, alertLevel: cl }
    ));
  }

  // Acceleration / pressure escalation → architecture review
  if (acceleration > 0 || pressureEscalated) {
    recs.push(_rec(
      'coupling_acceleration',
      'architecture',
      'high',
      'Address accelerating coupling pressure',
      'Coupling pressure escalating (acceleration: ' + acceleration + '). Growth trajectory indicates worsening dependency entanglement.',
      'Coupling growth halted, dependency graph stabilized',
      { acceleration, pressureEscalated, alertLevel: cl }
    ));
  }

  // Alert/watch level without specific signal → general review
  if (recs.length === 0 && (cl === 'alert' || cl === 'watch')) {
    recs.push(_rec(
      'coupling_review',
      'coupling',
      cl === 'alert' ? 'high' : 'medium',
      'Review dependency coupling trends',
      'Coupling alert level is ' + cl + '. Proactive review prevents escalation.',
      'Maintained dependency health, prevented future coupling accumulation',
      { alertLevel: cl, couplingGrowthScore: _safeNum(couplingAlert.couplingGrowthScore) }
    ));
  }

  return recs;
}

// ── Anomaly recommendations ───────────────────────────────────────────────────

function _anomalyRecs(anomaly) {
  const recs = [];
  if (!_isObj(anomaly)) return recs;

  const al       = _safeStr(anomaly.anomalyLevel);
  const patterns = _isObj(anomaly.patterns) ? anomaly.patterns : {};

  // Score collapse → incident-style investigation
  const collapseCount   = _safeNum(patterns.scoreCollapseCount);
  if (collapseCount > 0) {
    const collapseAnomaly = _safeArray(anomaly.anomalies).find(function(a) { return a.type === 'score_collapse'; });
    const collapseEvents  = (collapseAnomaly && _isObj(collapseAnomaly.evidence) && Array.isArray(collapseAnomaly.evidence.collapseEvents))
      ? collapseAnomaly.evidence.collapseEvents : [];
    recs.push(_rec(
      'anomaly_investigation',
      'anomaly',
      'critical',
      'Conduct incident-style architecture investigation',
      collapseCount + ' score collapse event(s) detected. Sudden architecture score drops require root cause analysis.',
      'Root cause identified, score stabilized, preventive measures implemented',
      { scoreCollapseCount: collapseCount, anomalyLevel: al, collapseEvents }
    ));
  }

  // Volatility → architecture observability
  const volatilityCount = _safeNum(patterns.volatilityOutlierCount);
  if (volatilityCount > 0) {
    recs.push(_rec(
      'anomaly_observability',
      'observability',
      al === 'critical' ? 'high' : 'medium',
      'Improve architecture observability and scoring stability',
      volatilityCount + ' volatility outlier(s) detected. High score volatility obscures meaningful trends.',
      'Stabilized architecture score trend and improved signal clarity',
      { volatilityOutlierCount: volatilityCount, anomalyLevel: al }
    ));
  }

  // Implementation debt surge → implementation remediation
  const implSurge = _safeNum(patterns.implementationDebtSurgeCount);
  if (implSurge > 0) {
    recs.push(_rec(
      'anomaly_implementation',
      'implementation',
      'high',
      'Address implementation debt accumulation',
      implSurge + ' implementation debt surge event(s) detected. Rapid debt accumulation risks long-term maintainability.',
      'Reduced implementation debt, improved completion rate',
      { implementationDebtSurgeCount: implSurge, anomalyLevel: al }
    ));
  }

  return recs;
}

// ── Snapshot recommendations ──────────────────────────────────────────────────

function _snapshotRecs(snap) {
  const recs = [];
  if (!_isObj(snap)) return recs;

  const api    = _isObj(snap.apiLinkage)                 ? snap.apiLinkage                 : null;
  const bv     = _isObj(snap.boundaryVerification)       ? snap.boundaryVerification       : null;
  const impl   = _isObj(snap.implementationCompleteness) ? snap.implementationCompleteness : null;

  if (api) {
    const cov             = _isObj(api.coverage) ? api.coverage : {};
    const unresolvedCount = _safeNum(cov.unresolvedFrontendCallCount) ||
                            _safeArray(api.unresolvedFrontendCalls).length;
    const mismatchCount   = _safeNum(cov.methodMismatchCount) ||
                            _safeArray(api.methodMismatches).length;

    if (unresolvedCount > 0) {
      recs.push(_rec(
        'snapshot_api_linkage',
        'api',
        unresolvedCount >= 5 ? 'high' : 'medium',
        'Resolve unresolved frontend API calls',
        unresolvedCount + ' frontend call(s) have no matching backend route. Broken integrations risk runtime failures.',
        'All frontend calls linked to backend routes, improved API reliability',
        { unresolvedFrontendCallCount: unresolvedCount }
      ));
    }

    if (mismatchCount > 0) {
      recs.push(_rec(
        'snapshot_contract',
        'api',
        'high',
        'Enforce API contract consistency',
        mismatchCount + ' HTTP method mismatch(es) between frontend and backend. Contract violations cause integration failures.',
        'Consistent API contracts, reduced integration failures',
        { methodMismatchCount: mismatchCount }
      ));
    }
  }

  if (bv) {
    const violations = _safeArray(bv.violations);
    if (violations.length > 0) {
      const hasSevere = violations.some(function(v) {
        const s = _safeStr(v.severity);
        return s === 'critical' || s === 'high';
      });
      recs.push(_rec(
        'snapshot_boundary',
        'architecture',
        hasSevere ? 'high' : 'medium',
        'Resolve architecture boundary violations',
        violations.length + ' boundary violation(s) detected. Boundary violations erode structural integrity and increase coupling.',
        'Clean architecture boundaries and reduced structural coupling',
        { violationCount: violations.length,
          boundaryHealthLevel: _safeStr(bv.boundaryHealthLevel) }
      ));
    }
  }

  if (impl) {
    const score = _safeNum(impl.completenessScore);
    if (score > 0 && score < 50) {
      recs.push(_rec(
        'snapshot_implementation',
        'implementation',
        score < 30 ? 'high' : 'medium',
        'Address implementation completeness gaps',
        'Implementation completeness is ' + score + '%. Incomplete implementations indicate unfinished features and technical debt.',
        'Improved completeness, reduced placeholder and scaffold code',
        { completenessScore: score,
          completenessLevel: _safeStr(impl.completenessLevel) }
      ));
    }
  }

  return recs;
}

// ── Deduplication, sort, cap ──────────────────────────────────────────────────

function _deduplicate(recs) {
  const seen = new Set();
  return recs.filter(function(r) {
    const key = _safeStr(r.category) + '\x00' + _safeStr(r.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function _sort(recs) {
  return recs.slice().sort(function(a, b) {
    const diff = _priRank(b.priority) - _priRank(a.priority);
    if (diff !== 0) return diff;
    return _safeStr(a.id).localeCompare(_safeStr(b.id));
  });
}

// ── Derived outputs ───────────────────────────────────────────────────────────

function _remediationScore(recs) {
  return _clamp(
    recs.reduce(function(s, r) { return s + _priScore(r.priority); }, 0),
    0, 100
  );
}

function _rawRemediationScore(recs) {
  return recs.reduce(function(s, r) { return s + _priScore(r.priority); }, 0);
}

function _recommendationLevel(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  if (score >= 1)  return 'low';
  return 'none';
}

function _actionPlan(recs) {
  const plan = _emptyActionPlan();
  for (const rec of recs) {
    const reason = rec.rationale.length > 120
      ? rec.rationale.slice(0, 120) + '…'
      : rec.rationale;
    const item = { title: rec.title, reason };
    if      (rec.priority === 'critical') plan.immediate.push(item);
    else if (rec.priority === 'high')     plan.shortTerm.push(item);
    else if (rec.priority === 'medium')   plan.mediumTerm.push(item);
    else                                  plan.longTerm.push(item);
  }
  return plan;
}

function _priorities(recs) {
  const top = recs[0] || null;
  return {
    highestPriorityCategory:         top ? _safeStr(top.category) : null,
    highestPriorityRecommendationId: top ? _safeStr(top.id)       : null,
    criticalRecommendationCount: recs.filter(function(r) { return r.priority === 'critical'; }).length,
    highRecommendationCount:     recs.filter(function(r) { return r.priority === 'high'; }).length,
  };
}

function _estimatedImpact(recs, confidenceLevel) {
  const critCount  = recs.filter(function(r) { return r.priority === 'critical'; }).length;
  const highCount  = recs.filter(function(r) { return r.priority === 'high'; }).length;
  const totalScore = _remediationScore(recs);

  const hasGov     = recs.some(function(r) { return r.category === 'governance'; });
  const hasArch    = recs.some(function(r) { return r.category === 'architecture'; });
  const hasCoupling = recs.some(function(r) { return r.category === 'coupling'; });

  const governanceImpact  = _clamp((hasGov  ? 30 : 0) + critCount * 15 + highCount * 8, 0, 100);
  const architectureImpact = _clamp((hasArch ? 25 : 0) + (hasCoupling ? 20 : 0) +
                                     Math.round(totalScore * 0.4), 0, 100);
  const riskReduction      = _clamp(Math.round(totalScore * 0.6) + critCount * 8 + highCount * 4, 0, 100);

  return { governanceImpact, architectureImpact, riskReduction, confidence: confidenceLevel };
}

function _summary(level, score, recs, confidenceLevel) {
  if (level === 'unknown') {
    return 'Insufficient data — no usable intelligence sources provided.';
  }
  if (level === 'none') {
    return 'No remediation required — no actionable recommendations identified (' + confidenceLevel + ' confidence).';
  }
  const n         = recs.length;
  const critCount = recs.filter(function(r) { return r.priority === 'critical'; }).length;

  if (level === 'critical') {
    return 'Critical remediation required — ' + critCount + ' critical action(s) across ' +
      n + ' recommendation(s) (score: ' + score + ', ' + confidenceLevel + ' confidence).';
  }
  if (level === 'high') {
    return 'High priority remediation identified — ' + n +
      ' recommendation(s) require attention (score: ' + score + ', ' + confidenceLevel + ' confidence).';
  }
  if (level === 'medium') {
    return 'Medium priority remediation identified — ' + n +
      ' improvement recommendation(s) (score: ' + score + ', ' + confidenceLevel + ' confidence).';
  }
  return 'Low priority recommendations — ' + n +
    ' informational action(s) (score: ' + score + ', ' + confidenceLevel + ' confidence).';
}

// ── Main ──────────────────────────────────────────────────────────────────────

function buildRemediationRecommendations(input) {
  if (!_isObj(input)) return _unknownResult();

  const sources = _usableSources(input);
  if (sources === 0) return _unknownResult();

  const confidenceLevel    = _confidenceLevel(sources);
  const vbc                = _versionBoundaryContext(input.versionContext);
  const adjustedConfidence = _adjustedConfidence(confidenceLevel, vbc);
  const confidenceReasons  = _confidenceReasons(vbc);

  const allRecs = [].concat(
    _govRecs(input.governance),
    _forecastRecs(input.forecast),
    _regressionRecs(input.regression),
    _couplingRecs(input.couplingAlert),
    _anomalyRecs(input.anomaly),
    _snapshotRecs(input.architectureSnapshot)
  );

  const deduped = _deduplicate(allRecs);
  const sorted  = _sort(deduped);
  const final   = sorted.slice(0, MAX_RECS);

  if (final.length === 0) {
    return {
      recommendationLevel:    'none',
      remediationScore:       0,
      rawRemediationScore:    0,
      scoreCapApplied:        false,
      confidenceLevel:        adjustedConfidence,
      confidenceReasons,
      versionBoundaryContext: vbc,
      summary:                'No remediation required — no actionable recommendations identified (' + adjustedConfidence + ' confidence).',
      recommendations:        [],
      actionPlan:             _emptyActionPlan(),
      priorities:             _emptyPriorities(),
      estimatedImpact:        _emptyImpact(adjustedConfidence),
    };
  }

  const remediationScore    = _remediationScore(final);
  const rawRemediationScore = _rawRemediationScore(final);
  const scoreCapApplied     = rawRemediationScore > 100;
  const recommendationLevel = _recommendationLevel(remediationScore);
  const actionPlan          = _actionPlan(final);
  const priorities          = _priorities(final);
  const estimatedImpact     = _estimatedImpact(final, adjustedConfidence);
  const summary             = _summary(recommendationLevel, remediationScore, final, adjustedConfidence);

  return {
    recommendationLevel,
    remediationScore,
    rawRemediationScore,
    scoreCapApplied,
    confidenceLevel:        adjustedConfidence,
    confidenceReasons,
    versionBoundaryContext: vbc,
    summary,
    recommendations: final,
    actionPlan,
    priorities,
    estimatedImpact,
  };
}

module.exports = { buildRemediationRecommendations };
