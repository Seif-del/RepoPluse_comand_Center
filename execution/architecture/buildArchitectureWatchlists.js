'use strict';

// buildArchitectureWatchlists
// Automatically identifies repositories requiring ongoing architecture/governance attention.
//
// Input:  { repositories: [...], portfolioGovernance?, portfolioForecast? }
// Output: watchlistLevel, watchlistScore, confidenceLevel, summary,
//         categories, priorityQueue, escalationSummary, recommendations
//
// Pure function — no I/O, no mutation of input, deterministic output.

const PRIORITY_QUEUE_MAX = 25;
const MAX_RECS           = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeNum(v) { return (typeof v === 'number' && isFinite(v)) ? v : 0; }
function _safeStr(v) { return typeof v === 'string' ? v : ''; }
function _safeArray(v) { return Array.isArray(v) ? v : []; }
function _isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function _clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const ESC_RANK = { none: 0, monitor: 1, elevated: 2, urgent: 3, critical: 4 };
function _escRank(e) { return ESC_RANK[_safeStr(e)] || 0; }

// ── Empty categories ──────────────────────────────────────────────────────────

function _emptyCategories() {
  return {
    criticalGovernance: [],
    degradingForecasts: [],
    anomalyHeavy:       [],
    couplingPressure:   [],
    regressionRisk:     [],
    lowConfidence:      [],
    emergingRisk:       [],
  };
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    watchlistLevel:    'unknown',
    watchlistScore:    0,
    confidenceLevel:   'low',
    summary:           'Insufficient data — no repositories provided.',
    categories:        _emptyCategories(),
    priorityQueue:     [],
    escalationSummary: { critical: 0, urgent: 0, elevated: 0, monitor: 0, none: 0 },
    recommendations:   [],
  };
}

// ── Priority scoring ──────────────────────────────────────────────────────────

function _priorityScore(repo) {
  let score = 0;

  // Governance (critical +35, weak +25)
  const gov = _isObj(repo.governance) ? repo.governance : null;
  if (gov) {
    const gl = _safeStr(gov.governanceLevel);
    if      (gl === 'critical') score += 35;
    else if (gl === 'weak')     score += 25;
  }

  // Forecast: critical +30, degrading("high") +22, watch("medium") +14
  const fc = _isObj(repo.forecast) ? repo.forecast : null;
  if (fc) {
    const fl = _safeStr(fc.forecastLevel);
    if      (fl === 'critical')  score += 30;
    else if (fl === 'degrading') score += 22;
    else if (fl === 'watch')     score += 14;
  }

  // Anomaly: critical +28, anomaly +20, watch +10
  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (an) {
    const al = _safeStr(an.anomalyLevel);
    if      (al === 'critical') score += 28;
    else if (al === 'anomaly')  score += 20;
    else if (al === 'watch')    score += 10;
  }

  // Coupling: critical +24, alert +18, watch +8
  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (ca) {
    const cl = _safeStr(ca.alertLevel);
    if      (cl === 'critical') score += 24;
    else if (cl === 'alert')    score += 18;
    else if (cl === 'watch')    score += 8;
  }

  // Regression: critical +24, regression +18, watch +8
  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (rg) {
    const rl = _safeStr(rg.regressionLevel);
    if      (rl === 'critical')   score += 24;
    else if (rl === 'regression') score += 18;
    else if (rl === 'watch')      score += 8;
  }

  // Architecture health: risky +18, weak +12, watch +6
  const hl = _safeStr(repo.architectureHealthLevel);
  if      (hl === 'risky') score += 18;
  else if (hl === 'weak')  score += 12;
  else if (hl === 'watch') score += 6;

  // Low confidence +8 if paired with any existing risk
  if (score > 0 && _safeStr(repo.confidenceLevel) === 'low') score += 8;

  return _clamp(Math.round(score), 0, 100);
}

// ── Escalation level ──────────────────────────────────────────────────────────

function _escalationLevel(priorityScore, repo) {
  // Special rule: critical governance + critical forecast always => critical
  const gov = _isObj(repo.governance) ? repo.governance : null;
  const fc  = _isObj(repo.forecast)   ? repo.forecast   : null;
  if (
    gov && _safeStr(gov.governanceLevel) === 'critical' &&
    fc  && _safeStr(fc.forecastLevel)   === 'critical'
  ) return 'critical';

  if (priorityScore >= 80) return 'critical';
  if (priorityScore >= 60) return 'urgent';
  if (priorityScore >= 40) return 'elevated';
  if (priorityScore >= 20) return 'monitor';
  return 'none';
}

// ── Reasons ───────────────────────────────────────────────────────────────────

function _reasons(repo) {
  const reasons = [];

  const gov = _isObj(repo.governance) ? repo.governance : null;
  if (gov) {
    const gl = _safeStr(gov.governanceLevel);
    const gs = _safeNum(gov.governanceScore);
    if      (gl === 'critical') reasons.push('Governance critical (score: ' + gs + ')');
    else if (gl === 'weak')     reasons.push('Governance weak (score: ' + gs + ')');
  }

  const fc = _isObj(repo.forecast) ? repo.forecast : null;
  if (fc) {
    const fl = _safeStr(fc.forecastLevel);
    const dr = _safeNum(fc.degradationRisk);
    if      (fl === 'critical')  reasons.push('Forecast critical (degradation risk: ' + dr + ')');
    else if (fl === 'degrading') reasons.push('Forecast degrading (degradation risk: ' + dr + ')');
    else if (fl === 'watch')     reasons.push('Forecast in watch state (degradation risk: ' + dr + ')');
  }

  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (an) {
    const al = _safeStr(an.anomalyLevel);
    if      (al === 'critical') reasons.push('Architecture anomaly critical');
    else if (al === 'anomaly')  reasons.push('Architecture anomaly detected');
    else if (al === 'watch')    reasons.push('Early anomaly signal (watch)');
  }

  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (ca) {
    const cl = _safeStr(ca.alertLevel);
    if      (cl === 'critical') reasons.push('Coupling growth critical');
    else if (cl === 'alert')    reasons.push('Coupling growth alert');
    else if (cl === 'watch')    reasons.push('Coupling growth in watch state');
  }

  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (rg) {
    const rl = _safeStr(rg.regressionLevel);
    if      (rl === 'critical')   reasons.push('Architecture regression critical');
    else if (rl === 'regression') reasons.push('Architecture regression detected');
    else if (rl === 'watch')      reasons.push('Architecture regression in watch state');
  }

  const hl = _safeStr(repo.architectureHealthLevel);
  if      (hl === 'risky') reasons.push('Architecture health risky');
  else if (hl === 'weak')  reasons.push('Architecture health weak');
  else if (hl === 'watch') reasons.push('Architecture health in watch state');

  if (_safeStr(repo.confidenceLevel) === 'low') {
    reasons.push('Low confidence — more snapshot data needed');
  }

  return reasons;
}

// ── Recommended action ────────────────────────────────────────────────────────

function _recommendedAction(escalationLevel, repo) {
  const gov = _isObj(repo.governance) ? repo.governance : null;
  const fc  = _isObj(repo.forecast)   ? repo.forecast   : null;

  if (escalationLevel === 'critical') {
    if (gov && _safeStr(gov.governanceLevel) === 'critical') {
      return 'Immediate architecture governance intervention required';
    }
    if (fc && _safeStr(fc.forecastLevel) === 'critical') {
      return 'Urgent: address critical degradation trajectory before it compounds';
    }
    return 'Critical attention required — review all architecture signals immediately';
  }
  if (escalationLevel === 'urgent') {
    return 'Schedule architecture review within the next sprint';
  }
  if (escalationLevel === 'elevated') {
    return 'Review architecture signals and create a remediation plan';
  }
  if (escalationLevel === 'monitor') {
    return 'Keep under observation — re-evaluate in next architecture review cycle';
  }
  return 'No immediate action required';
}

// ── Signals ───────────────────────────────────────────────────────────────────

function _signals(repo) {
  const sigs = {};

  const gov = _isObj(repo.governance) ? repo.governance : null;
  if (gov) sigs.governance = { level: _safeStr(gov.governanceLevel), score: _safeNum(gov.governanceScore) };

  const fc = _isObj(repo.forecast) ? repo.forecast : null;
  if (fc) sigs.forecast = { forecastLevel: _safeStr(fc.forecastLevel), degradationRisk: _safeNum(fc.degradationRisk) };

  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (an) sigs.anomaly = { level: _safeStr(an.anomalyLevel), score: _safeNum(an.anomalyScore) };

  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (ca) sigs.coupling = { alertLevel: _safeStr(ca.alertLevel), couplingGrowthScore: _safeNum(ca.couplingGrowthScore) };

  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (rg) sigs.regression = { level: _safeStr(rg.regressionLevel), score: _safeNum(rg.regressionScore) };

  sigs.architectureHealth = {
    level: _safeStr(repo.architectureHealthLevel),
    score: _safeNum(repo.architectureHealthScore),
  };

  return sigs;
}

// ── Build watchlist item ──────────────────────────────────────────────────────

function _buildItem(repo) {
  const priorityScore   = _priorityScore(repo);
  const escalationLevel = _escalationLevel(priorityScore, repo);
  return {
    repoId:             _safeStr(repo.repoId),
    repoName:           _safeStr(repo.repoName),
    priorityScore,
    escalationLevel,
    reasons:            _reasons(repo),
    recommendedAction:  _recommendedAction(escalationLevel, repo),
    signals:            _signals(repo),
  };
}

// ── Category filters ──────────────────────────────────────────────────────────

function _inCriticalGovernance(repo) {
  const gov = _isObj(repo.governance) ? repo.governance : null;
  if (!gov) return false;
  const gl = _safeStr(gov.governanceLevel);
  const gs = _safeNum(gov.governanceScore);
  return gl === 'weak' || gl === 'critical' || gs < 45;
}

function _inDegradingForecasts(repo) {
  const fc = _isObj(repo.forecast) ? repo.forecast : null;
  if (!fc) return false;
  const fl = _safeStr(fc.forecastLevel);
  const dr = _safeNum(fc.degradationRisk);
  // spec says "high/critical" — "high" maps to "degrading" in forecastLevel vocabulary
  return fl === 'degrading' || fl === 'critical' || dr >= 45;
}

function _inAnomalyHeavy(repo) {
  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (!an) return false;
  const al = _safeStr(an.anomalyLevel);
  const as_ = _safeNum(an.anomalyScore);
  return al === 'anomaly' || al === 'critical' || as_ >= 30;
}

function _inCouplingPressure(repo) {
  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (!ca) return false;
  const cl = _safeStr(ca.alertLevel);
  const cs = _safeNum(ca.couplingGrowthScore);
  return cl === 'alert' || cl === 'critical' || cs >= 30;
}

function _inRegressionRisk(repo) {
  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (!rg) return false;
  const rl = _safeStr(rg.regressionLevel);
  const rs = _safeNum(rg.regressionScore);
  return rl === 'regression' || rl === 'critical' || rs >= 30;
}

function _inLowConfidence(repo) {
  // Repo-level low confidence paired with any risk signal
  if (_safeStr(repo.confidenceLevel) === 'low' && _priorityScore(repo) > 0) return true;

  // Individual signal low confidence paired with elevated risk in that signal
  const fc = _isObj(repo.forecast) ? repo.forecast : null;
  if (fc && _safeStr(fc.confidenceLevel) === 'low' && _safeNum(fc.degradationRisk) >= 30) return true;

  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (an && _safeStr(an.confidenceLevel) === 'low' && _safeNum(an.anomalyScore) >= 20) return true;

  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (rg && _safeStr(rg.confidenceLevel) === 'low' && _safeNum(rg.regressionScore) >= 20) return true;

  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (ca && _safeStr(ca.confidenceLevel) === 'low' && _safeNum(ca.couplingGrowthScore) >= 20) return true;

  const gov = _isObj(repo.governance) ? repo.governance : null;
  if (gov && _safeStr(gov.confidenceLevel) === 'low' && _safeNum(gov.governanceScore) < 60) return true;

  return false;
}

function _inEmergingRisk(repo) {
  const hl = _safeStr(repo.architectureHealthLevel);
  const fc = _isObj(repo.forecast) ? repo.forecast : null;

  // Health declining (watch/weak/risky) with forecast not yet at degrading threshold
  // 'risky' is worse than 'weak' — if no other signal puts it in a specific category it belongs here
  if (hl === 'risky' || hl === 'watch' || hl === 'weak') {
    if (!fc) return true;  // health declining but no forecast data yet
    const fl = _safeStr(fc.forecastLevel);
    const dr = _safeNum(fc.degradationRisk);
    // Not yet hitting degradingForecasts threshold — below-radar emerging risk
    if (fl !== 'degrading' && fl !== 'critical' && dr < 45) return true;
    // Or low/medium confidence forecast while health is already declining
    const conf = _safeStr(fc.confidenceLevel);
    if (conf === 'low' || conf === 'medium') return true;
  }

  // Watch-level signals present but below main category thresholds
  const an = _isObj(repo.anomaly) ? repo.anomaly : null;
  if (an && _safeStr(an.anomalyLevel) === 'watch' && _safeNum(an.anomalyScore) < 30) return true;

  const rg = _isObj(repo.regression) ? repo.regression : null;
  if (rg && _safeStr(rg.regressionLevel) === 'watch' && _safeNum(rg.regressionScore) < 30) return true;

  const ca = _isObj(repo.couplingAlert) ? repo.couplingAlert : null;
  if (ca && _safeStr(ca.alertLevel) === 'watch' && _safeNum(ca.couplingGrowthScore) < 30) return true;

  return false;
}

// ── Build categories ──────────────────────────────────────────────────────────

function _buildCategories(repos) {
  const cats = _emptyCategories();

  for (const repo of repos) {
    const item = _buildItem(repo);
    if (_inCriticalGovernance(repo)) cats.criticalGovernance.push(item);
    if (_inDegradingForecasts(repo)) cats.degradingForecasts.push(item);
    if (_inAnomalyHeavy(repo))       cats.anomalyHeavy.push(item);
    if (_inCouplingPressure(repo))   cats.couplingPressure.push(item);
    if (_inRegressionRisk(repo))     cats.regressionRisk.push(item);
    if (_inLowConfidence(repo))      cats.lowConfidence.push(item);
    if (_inEmergingRisk(repo))       cats.emergingRisk.push(item);
  }

  return cats;
}

// ── Priority queue ────────────────────────────────────────────────────────────

function _buildPriorityQueue(categories) {
  const seen = new Set();
  const all  = [];

  const allItems = [].concat(
    categories.criticalGovernance,
    categories.degradingForecasts,
    categories.anomalyHeavy,
    categories.couplingPressure,
    categories.regressionRisk,
    categories.lowConfidence,
    categories.emergingRisk
  );

  for (const item of allItems) {
    const key = _safeStr(item.repoId) + '\x00' + _safeStr(item.repoName);
    if (!seen.has(key)) {
      seen.add(key);
      all.push(item);
    }
  }

  // Sort: priorityScore DESC, escalationLevel DESC, repoName ASC, repoId ASC
  all.sort(function(a, b) {
    if (b.priorityScore !== a.priorityScore) return b.priorityScore - a.priorityScore;
    const er = _escRank(b.escalationLevel) - _escRank(a.escalationLevel);
    if (er !== 0) return er;
    const nr = _safeStr(a.repoName).localeCompare(_safeStr(b.repoName));
    if (nr !== 0) return nr;
    return _safeStr(a.repoId).localeCompare(_safeStr(b.repoId));
  });

  return all.slice(0, PRIORITY_QUEUE_MAX);
}

// ── Watchlist score ───────────────────────────────────────────────────────────

function _watchlistScore(priorityQueue) {
  if (priorityQueue.length === 0) return 0;
  const top5 = priorityQueue.slice(0, 5);
  const sum  = top5.reduce(function(s, i) { return s + i.priorityScore; }, 0);
  return Math.round(sum / top5.length);
}

// ── Watchlist level ───────────────────────────────────────────────────────────

function _watchlistLevel(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'elevated';
  if (score >= 20) return 'monitor';
  return 'clear';
}

// ── Portfolio confidence ──────────────────────────────────────────────────────

function _confidenceLevel(repos) {
  const n = repos.length;
  if (n < 3) return 'low';
  if (n < 5) return 'medium';
  const medHigh = repos.filter(function(r) {
    const cl = _safeStr(r.confidenceLevel);
    return cl === 'medium' || cl === 'high';
  }).length;
  return (medHigh / n >= 0.70) ? 'high' : 'medium';
}

// ── Escalation summary ────────────────────────────────────────────────────────

function _escalationSummary(priorityQueue) {
  const counts = { critical: 0, urgent: 0, elevated: 0, monitor: 0, none: 0 };
  for (const item of priorityQueue) {
    const el = _safeStr(item.escalationLevel);
    if (Object.prototype.hasOwnProperty.call(counts, el)) counts[el]++;
  }
  return counts;
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(watchlistLevel, watchlistScore, priorityQueue, confidenceLevel) {
  if (watchlistLevel === 'unknown') {
    return 'Insufficient data — no repositories provided.';
  }
  const n        = priorityQueue.length;
  const critical = priorityQueue.filter(function(i) { return i.escalationLevel === 'critical'; }).length;

  if (watchlistLevel === 'critical') {
    return 'Portfolio requires critical attention — ' + critical + ' repo(s) at critical escalation' +
      ' (watchlist score: ' + watchlistScore + ', ' + n + ' total entries, ' + confidenceLevel + ' confidence).';
  }
  if (watchlistLevel === 'elevated') {
    return 'Portfolio elevated — ' + n + ' repo(s) require architecture attention' +
      ' (watchlist score: ' + watchlistScore + ', ' + confidenceLevel + ' confidence).';
  }
  if (watchlistLevel === 'monitor') {
    return 'Portfolio under monitoring — ' + n + ' repo(s) show emerging or moderate risk' +
      ' (watchlist score: ' + watchlistScore + ', ' + confidenceLevel + ' confidence).';
  }
  return 'Portfolio is clear — no repositories currently require elevated architecture attention' +
    ' (' + confidenceLevel + ' confidence).';
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(categories, watchlistLevel) {
  const recs = [];

  // 1. Critical governance repos
  if (categories.criticalGovernance.length > 0) {
    const urgent = categories.criticalGovernance
      .filter(function(i) { return i.escalationLevel === 'critical' || i.escalationLevel === 'urgent'; })
      .slice(0, 3).map(function(i) { return i.repoName; });
    if (urgent.length > 0) {
      recs.push('Governance intervention required for: ' + urgent.join(', '));
    } else {
      recs.push('Review governance health for ' + categories.criticalGovernance.length +
        ' repo(s) in critical governance watchlist');
    }
  }

  // 2. Critical/degrading forecasts
  if (categories.degradingForecasts.length > 0 && recs.length < MAX_RECS) {
    const names = categories.degradingForecasts.slice(0, 3).map(function(i) { return i.repoName; });
    recs.push('Address degradation forecasts for: ' + names.join(', '));
  }

  // 3. Anomaly-heavy repos
  if (categories.anomalyHeavy.length > 0 && recs.length < MAX_RECS) {
    recs.push('Investigate architecture anomalies in ' + categories.anomalyHeavy.length + ' repo(s)');
  }

  // 4. Coupling pressure repos
  if (categories.couplingPressure.length > 0 && recs.length < MAX_RECS) {
    const names = categories.couplingPressure.slice(0, 2).map(function(i) { return i.repoName; });
    recs.push('Reduce coupling pressure in: ' + names.join(', '));
  }

  // 5. Regression risk repos
  if (categories.regressionRisk.length > 0 && recs.length < MAX_RECS) {
    recs.push('Investigate architecture regressions in ' + categories.regressionRisk.length + ' repo(s)');
  }

  // 6. Low confidence high-risk repos
  if (categories.lowConfidence.length > 0 && recs.length < MAX_RECS) {
    recs.push('Increase snapshot frequency for ' + categories.lowConfidence.length +
      ' low-confidence repo(s) to improve assessment accuracy');
  }

  // 7. Clear state
  if (watchlistLevel === 'clear' && recs.length === 0) {
    recs.push('Portfolio is clear — maintain current practices and review watchlists periodically');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Main ──────────────────────────────────────────────────────────────────────

function buildArchitectureWatchlists(input) {
  if (!_isObj(input)) return _unknownResult();

  const repos = _safeArray(input.repositories);
  if (repos.length === 0) return _unknownResult();

  const categories      = _buildCategories(repos);
  const priorityQueue   = _buildPriorityQueue(categories);
  const watchlistScore  = _watchlistScore(priorityQueue);
  const watchlistLevel  = _watchlistLevel(watchlistScore);
  const confidenceLevel = _confidenceLevel(repos);
  const escalationSummary = _escalationSummary(priorityQueue);
  const recommendations = _recommendations(categories, watchlistLevel);
  const summary         = _summary(watchlistLevel, watchlistScore, priorityQueue, confidenceLevel);

  return {
    watchlistLevel,
    watchlistScore,
    confidenceLevel,
    summary,
    categories,
    priorityQueue,
    escalationSummary,
    recommendations,
  };
}

module.exports = { buildArchitectureWatchlists };
