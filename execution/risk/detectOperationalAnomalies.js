'use strict';

// ── Detection thresholds (all deterministic, no randomness) ───────────────────

var SCORE_SPIKE_DELTA        = 20;   // points above rolling avg → spike anomaly
var SCORE_SPIKE_ROLLING_N    = 5;    // prior snapshots to include in rolling avg
var CI_STABLE_STREAK         = 2;    // consecutive passing snapshots required before sudden failure
var SYNC_INACTIVITY_MIN      = 3;    // min repos simultaneously entering inactivity
var VOLATILITY_SURGE_WINDOW  = 3;    // recent window size for oscillation counting
var VOLATILITY_SURGE_MIN_OSC = 2;    // min oscillations in recent window to qualify
var VOLATILITY_SURGE_RATIO   = 2.0;  // recent rate must exceed historical rate by this factor
var TELEMETRY_DROPOUT_DELTA  = 2;    // min increase in unknown-field count vs prior avg
var PORTFOLIO_RISK_JUMP      = 15;   // min points portfolio avg must rise between snapshots

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

// ── Confidence accumulation tables ────────────────────────────────────────────

// Historical depth → base confidence points (mirrors getOperationalConfidence pattern).
var DEPTH_POINTS = [
  { min: 5, pts: 50 },
  { min: 3, pts: 35 },
  { min: 2, pts: 25 },
  { min: 1, pts: 15 },
  { min: 0, pts:  0 },
];

// Telemetry completeness fraction (0–1) → points.
var TELEMETRY_POINTS = [
  { min: 1.0,  pts: 25 },
  { min: 0.67, pts: 15 },
  { min: 0.33, pts:  8 },
  { min: 0,    pts:  0 },
];

// Number of independent confirming signals → points.
var SIGNAL_POINTS = [
  { min: 3, pts: 25 },
  { min: 2, pts: 15 },
  { min: 1, pts: 10 },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _depthPoints(depth) {
  for (var i = 0; i < DEPTH_POINTS.length; i++) {
    if (depth >= DEPTH_POINTS[i].min) return DEPTH_POINTS[i].pts;
  }
  return 0;
}

function _telemetryPoints(fraction) {
  for (var i = 0; i < TELEMETRY_POINTS.length; i++) {
    if (fraction >= TELEMETRY_POINTS[i].min) return TELEMETRY_POINTS[i].pts;
  }
  return 0;
}

function _signalPoints(count) {
  for (var i = 0; i < SIGNAL_POINTS.length; i++) {
    if (count >= SIGNAL_POINTS[i].min) return SIGNAL_POINTS[i].pts;
  }
  return 0;
}

function _levelFromScore(score) {
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  return 'low';
}

/**
 * Derives deterministic confidence from evidence quality.
 * Hard caps: depth < 2 → max low (≤ 30); telFrac = 0 → max medium (≤ 60).
 *
 * @param {number} historyDepth      — prior snapshots informing the detection
 * @param {number} telemetryFraction — 0..1, fraction of non-unknown telemetry fields
 * @param {number} signalCount       — independent confirming signals
 * @returns {{ level: string, score: number, rationale: string }}
 */
function _deriveConfidence(historyDepth, telemetryFraction, signalCount) {
  var score = _depthPoints(historyDepth)
            + _telemetryPoints(telemetryFraction)
            + _signalPoints(signalCount);

  if (historyDepth < 2)          score = Math.min(score, 30);
  if (telemetryFraction === 0)   score = Math.min(score, 60);

  score = Math.max(0, Math.min(100, score));

  var rationale = historyDepth + ' historical snapshot' + (historyDepth !== 1 ? 's' : '')
                + ', ' + Math.round(telemetryFraction * 100) + '% telemetry coverage'
                + ', ' + signalCount + ' confirming signal' + (signalCount !== 1 ? 's' : '');

  return { level: _levelFromScore(score), score: score, rationale: rationale };
}

function _countUnknownFields(metricsSnap) {
  if (!metricsSnap || typeof metricsSnap !== 'object') return 3;
  var n = 0;
  if (!metricsSnap.ciStatus          || metricsSnap.ciStatus          === 'unknown') n++;
  if (!metricsSnap.releaseStatus     || metricsSnap.releaseStatus     === 'unknown') n++;
  if (!metricsSnap.contributorStatus || metricsSnap.contributorStatus === 'unknown') n++;
  return n;
}

function _telemetryFractionForSnaps(snaps) {
  if (!snaps || !snaps.length) return 0;
  var totalKnown = 0;
  for (var i = 0; i < snaps.length; i++) {
    totalKnown += 3 - _countUnknownFields(snaps[i]);
  }
  return totalKnown / (snaps.length * 3);
}

function _rollingAvg(scores) {
  if (!scores.length) return 0;
  var sum = 0;
  for (var i = 0; i < scores.length; i++) sum += scores[i];
  return sum / scores.length;
}

// Counts risk-score oscillations (|Δscore| ≥ 10) between consecutive pairs in
// rh[start..end-1]. Pairs are (start,start+1), (start+1,start+2), …, (end-2,end-1).
function _countOscillations(rh, start, end) {
  var count = 0;
  for (var i = start; i < end - 1 && i < rh.length - 1; i++) {
    var a = Number(rh[i].score);
    var b = Number(rh[i + 1].score);
    if (!isNaN(a) && !isNaN(b) && Math.abs(a - b) >= 10) count++;
  }
  return count;
}

function _repoIdentifier(repo) {
  return repo.repoId || repo.repoName || 'unknown';
}

// ── Anomaly detectors ─────────────────────────────────────────────────────────

/**
 * score_spike — current risk score increased sharply vs rolling average of prior snapshots.
 * Requires ≥ 2 snapshots (1 current + at least 1 historical for comparison).
 * Delta threshold: current score − rolling avg ≥ SCORE_SPIKE_DELTA (20 pts).
 */
function _detectScoreSpike(repos, detectedAt) {
  var anomalies = [];

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;
    var rh = Array.isArray(repo.riskHistory) ? repo.riskHistory : [];

    if (rh.length < 2) continue;

    var current = Number(rh[0].score);
    if (isNaN(current)) continue;

    var priorSlice  = rh.slice(1, 1 + SCORE_SPIKE_ROLLING_N);
    var priorScores = [];
    for (var j = 0; j < priorSlice.length; j++) {
      var s = Number(priorSlice[j].score);
      if (!isNaN(s)) priorScores.push(s);
    }
    if (!priorScores.length) continue;

    var avg   = _rollingAvg(priorScores);
    var delta = current - avg;

    if (delta < SCORE_SPIKE_DELTA) continue;

    var severity = (current >= 75 && delta >= 30) ? 'critical'
                 : (current >= 75 || delta >= 30) ? 'high'
                 : 'medium';

    var mh     = Array.isArray(repo.metricsHistory) ? repo.metricsHistory : [];
    var telFrac = _telemetryFractionForSnaps(mh.slice(0, 3));
    var conf   = _deriveConfidence(priorScores.length, telFrac, 1);

    anomalies.push({
      type:        'score_spike',
      severity:    severity,
      title:       'Operational risk spike detected',
      summary:     'Risk score rose from a rolling average of ' + Math.round(avg)
                 + ' to ' + current + ' (delta +' + Math.round(delta) + ').',
      affectedRepos:    [_repoIdentifier(repo)],
      detectedAt:       detectedAt,
      confidence:       conf,
      supportingMetrics: {
        currentScore:   current,
        rollingAverage: Math.round(avg),
        delta:          Math.round(delta),
        historyDepth:   priorScores.length,
      },
    });
  }

  return anomalies;
}

/**
 * sudden_ci_failure — CI transitioned passing → failing after a stable passing streak.
 * Requires current CI = failing AND ≥ CI_STABLE_STREAK (2) consecutive prior snapshots passing.
 * Distinguishes sudden collapse from chronic/expected failure cycles.
 */
function _detectSuddenCiFailure(repos, detectedAt) {
  var anomalies = [];

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;
    var mh = Array.isArray(repo.metricsHistory) ? repo.metricsHistory : [];

    if (mh.length < 2) continue;

    var currentCi = mh[0].ciStatus || 'unknown';
    if (currentCi !== 'failing') continue;

    var streak = 0;
    for (var j = 1; j < mh.length; j++) {
      if ((mh[j].ciStatus || 'unknown') === 'passing') {
        streak++;
      } else {
        break;
      }
    }

    if (streak < CI_STABLE_STREAK) continue;

    var severity = streak >= 4 ? 'critical' : 'high';

    var telFrac = _telemetryFractionForSnaps(mh.slice(1, 4));
    var conf    = _deriveConfidence(streak, telFrac, 2);

    anomalies.push({
      type:        'sudden_ci_failure',
      severity:    severity,
      title:       'Sudden CI pipeline failure',
      summary:     'CI pipeline failed after ' + streak + ' consecutive passing snapshot'
                 + (streak !== 1 ? 's' : '') + '.',
      affectedRepos:    [_repoIdentifier(repo)],
      detectedAt:       detectedAt,
      confidence:       conf,
      supportingMetrics: {
        stablePassingStreak: streak,
        currentCiStatus:     'failing',
      },
    });
  }

  return anomalies;
}

/**
 * synchronized_inactivity — multiple repos simultaneously entering no-commit state.
 * Counts repos where contributorStatus JUST transitioned to low_activity (prior != low_activity).
 * Threshold: ≥ SYNC_INACTIVITY_MIN (3) repos affected.
 * Detects coordinated portfolio-level inactivity, not individual or long-standing stasis.
 */
function _detectSynchronizedInactivity(repos, detectedAt) {
  var inactiveIds = [];

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;
    var mh = Array.isArray(repo.metricsHistory) ? repo.metricsHistory : [];

    if (mh.length < 2) continue;

    var cur  = mh[0].contributorStatus || 'unknown';
    var prev = mh[1].contributorStatus || 'unknown';

    if (cur === 'low_activity' && prev !== 'low_activity') {
      inactiveIds.push(_repoIdentifier(repo));
    }
  }

  if (inactiveIds.length < SYNC_INACTIVITY_MIN) return [];

  var n = inactiveIds.length;

  var severity = n >= 6 ? 'critical'
               : n >= 4 ? 'high'
               : 'medium';

  // Use n-1 as effective depth: each repo is an independent observation beyond the first.
  // telFrac = 0.33 (only contributorStatus out of 3 telemetry fields drives this signal).
  var conf = _deriveConfidence(n - 1, 0.33, Math.min(n, 3));

  return [{
    type:        'synchronized_inactivity',
    severity:    severity,
    title:       'Synchronized repository inactivity',
    summary:     n + ' repositories simultaneously entered inactivity state.',
    affectedRepos:    inactiveIds,
    detectedAt:       detectedAt,
    confidence:       conf,
    supportingMetrics: {
      affectedCount: n,
      threshold:     SYNC_INACTIVITY_MIN,
    },
  }];
}

/**
 * volatility_surge — risk score oscillation rate surged vs recent historical baseline.
 * Splits riskHistory into recent window (VOLATILITY_SURGE_WINDOW = 3 snapshots) and
 * historical (remainder). Detects when recent oscillations are significantly higher
 * than the baseline rate. Requires ≥ VOLATILITY_SURGE_WINDOW + 2 snapshots.
 */
function _detectVolatilitySurge(repos, detectedAt) {
  var anomalies = [];

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;
    var rh = Array.isArray(repo.riskHistory) ? repo.riskHistory : [];

    if (rh.length < VOLATILITY_SURGE_WINDOW + 2) continue;

    var recentEnd    = VOLATILITY_SURGE_WINDOW + 1;
    var recentOsc    = _countOscillations(rh, 0, recentEnd);
    var historicalOsc = _countOscillations(rh, VOLATILITY_SURGE_WINDOW, rh.length);

    if (recentOsc < VOLATILITY_SURGE_MIN_OSC) continue;

    var historicalPairs = Math.max(rh.length - VOLATILITY_SURGE_WINDOW - 1, 1);
    var recentRate      = recentOsc / VOLATILITY_SURGE_WINDOW;
    var historicalRate  = historicalOsc / historicalPairs;

    // If historical baseline was already volatile, require the recent rate to be
    // significantly higher (RATIO × baseline) to confirm a genuine surge.
    if (historicalOsc > 0 && recentRate < historicalRate * VOLATILITY_SURGE_RATIO) continue;

    var severity = recentOsc >= 4 ? 'critical'
                 : recentOsc >= 3 ? 'high'
                 : 'medium';

    var mh     = Array.isArray(repo.metricsHistory) ? repo.metricsHistory : [];
    var telFrac = _telemetryFractionForSnaps(mh.slice(0, 3));
    var conf   = _deriveConfidence(rh.length - 1, telFrac, 1);

    anomalies.push({
      type:        'volatility_surge',
      severity:    severity,
      title:       'Operational volatility surge',
      summary:     'Score oscillation rate increased from '
                 + (Math.round(historicalRate * 100) / 100) + ' to '
                 + (Math.round(recentRate * 100) / 100) + ' per snapshot window.',
      affectedRepos:    [_repoIdentifier(repo)],
      detectedAt:       detectedAt,
      confidence:       conf,
      supportingMetrics: {
        recentOscillations:     recentOsc,
        historicalOscillations: historicalOsc,
        recentWindow:           VOLATILITY_SURGE_WINDOW,
        historyDepth:           rh.length,
      },
    });
  }

  return anomalies;
}

/**
 * telemetry_dropout — sudden increase in unknown/missing telemetry fields.
 * Compares unknown-field count in the current snapshot against the rolling average
 * of prior snapshots. Requires increase ≥ TELEMETRY_DROPOUT_DELTA (2 fields).
 */
function _detectTelemetryDropout(repos, detectedAt) {
  var anomalies = [];

  for (var i = 0; i < repos.length; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;
    var mh = Array.isArray(repo.metricsHistory) ? repo.metricsHistory : [];

    if (mh.length < 2) continue;

    var currentUnknown = _countUnknownFields(mh[0]);
    var priorSnaps     = mh.slice(1);
    var priorSum       = 0;
    for (var j = 0; j < priorSnaps.length; j++) {
      priorSum += _countUnknownFields(priorSnaps[j]);
    }
    var priorAvg = priorSum / priorSnaps.length;
    var delta    = currentUnknown - priorAvg;

    if (delta < TELEMETRY_DROPOUT_DELTA) continue;

    var severity = currentUnknown === 3 ? 'high'
                 : currentUnknown === 2 ? 'medium'
                 : 'low';

    var telFrac = _telemetryFractionForSnaps(priorSnaps.slice(0, 3));
    var conf    = _deriveConfidence(priorSnaps.length, telFrac, 1);

    anomalies.push({
      type:        'telemetry_dropout',
      severity:    severity,
      title:       'Telemetry signal dropout',
      summary:     'Unknown telemetry fields increased from an average of '
                 + (Math.round(priorAvg * 10) / 10) + ' to ' + currentUnknown + '.',
      affectedRepos:    [_repoIdentifier(repo)],
      detectedAt:       detectedAt,
      confidence:       conf,
      supportingMetrics: {
        currentUnknownCount: currentUnknown,
        priorAverageUnknown: Math.round(priorAvg * 10) / 10,
        delta:               Math.round(delta * 10) / 10,
      },
    });
  }

  return anomalies;
}

/**
 * portfolio_risk_jump — portfolio average risk score rises sharply between snapshots.
 * Compares portfolioHistory[0] vs portfolioHistory[1].
 * Threshold: delta ≥ PORTFOLIO_RISK_JUMP (15 pts).
 */
function _detectPortfolioRiskJump(portfolioHistory, detectedAt) {
  var ph = Array.isArray(portfolioHistory) ? portfolioHistory : [];
  if (ph.length < 2) return [];

  var current  = Number(ph[0].portfolioScore);
  var previous = Number(ph[1].portfolioScore);
  if (isNaN(current) || isNaN(previous)) return [];

  var delta = current - previous;
  if (delta < PORTFOLIO_RISK_JUMP) return [];

  var severity = (current >= 75 && delta >= 25) ? 'critical'
               : (current >= 50 || delta >= 25) ? 'high'
               : 'medium';

  var historyDepth = ph.length - 1;
  var conf = _deriveConfidence(historyDepth, 0.67, delta >= 25 ? 2 : 1);

  return [{
    type:        'portfolio_risk_jump',
    severity:    severity,
    title:       'Portfolio risk level jumped',
    summary:     'Portfolio average risk score rose from ' + previous + ' to ' + current
               + ' (delta +' + delta + ').',
    affectedRepos:    [],
    detectedAt:       detectedAt,
    confidence:       conf,
    supportingMetrics: {
      currentScore:  current,
      previousScore: previous,
      delta:         delta,
      repoCount:     ph[0].repoCount != null ? Number(ph[0].repoCount) : 0,
    },
  }];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all deterministic operational anomaly detectors across a portfolio snapshot.
 * Pure function — no I/O, no external AI/ML, no randomness.
 *
 * Anomaly types:
 *   score_spike             — individual repo risk score increased sharply vs rolling avg
 *   sudden_ci_failure       — CI failed after a sustained passing streak
 *   synchronized_inactivity — 3+ repos simultaneously entered contributor inactivity
 *   volatility_surge        — risk score oscillation rate surged vs historical baseline
 *   telemetry_dropout       — unknown telemetry fields suddenly increased
 *   portfolio_risk_jump     — portfolio average risk rose sharply between snapshots
 *
 * Detection philosophy: anomalies are UNUSUAL operational deviations, not merely bad
 * states. Each detector requires comparison against recent history or portfolio baseline.
 *
 * @param {object}  opts
 * @param {Array}   opts.repos              — repo objects, each:
 *                                            { repoId?, repoName?, riskHistory[], metricsHistory[] }
 *                                            Both history arrays are newest-first.
 * @param {Array}   [opts.portfolioHistory] — newest-first portfolio snapshots:
 *                                            [{ portfolioScore, repoCount, snapshotAt }, ...]
 * @param {string}  [opts.detectedAt]       — injectable ISO timestamp (defaults to now)
 * @returns {Array<{
 *   type:              string,
 *   severity:          'low'|'medium'|'high'|'critical',
 *   title:             string,
 *   summary:           string,
 *   affectedRepos:     string[],
 *   detectedAt:        string,
 *   confidence:        { level: string, score: number, rationale: string },
 *   supportingMetrics: object,
 * }>}
 * Sorted: severity descending (critical first), then confidence.score descending.
 */
function detectOperationalAnomalies(opts) {
  var o  = (opts && typeof opts === 'object') ? opts : {};
  var repos            = Array.isArray(o.repos)            ? o.repos            : [];
  var portfolioHistory = Array.isArray(o.portfolioHistory) ? o.portfolioHistory : [];
  var detectedAt       = (typeof o.detectedAt === 'string' && o.detectedAt)
                       ? o.detectedAt
                       : new Date().toISOString();

  var anomalies = [];

  anomalies = anomalies.concat(_detectScoreSpike(repos, detectedAt));
  anomalies = anomalies.concat(_detectSuddenCiFailure(repos, detectedAt));
  anomalies = anomalies.concat(_detectSynchronizedInactivity(repos, detectedAt));
  anomalies = anomalies.concat(_detectVolatilitySurge(repos, detectedAt));
  anomalies = anomalies.concat(_detectTelemetryDropout(repos, detectedAt));
  anomalies = anomalies.concat(_detectPortfolioRiskJump(portfolioHistory, detectedAt));

  anomalies.sort(function(a, b) {
    var sevDiff = (SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 3)
                - (SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 3);
    if (sevDiff !== 0) return sevDiff;
    return b.confidence.score - a.confidence.score;
  });

  return anomalies;
}

module.exports = { detectOperationalAnomalies };
