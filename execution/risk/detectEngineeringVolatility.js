'use strict';

// Engineering volatility — temporal instability primitives.
// Detects oscillations, label churn, recover/degrade cycles, and recurrence
// across snapshot histories. Static metadata (no releases, bus factor, single
// contributor, CI unknown in isolation) is intentionally excluded.
//
// Volatility levels: low 0–24, medium 25–49, high 50–74, critical 75–100.
// All history arrays are expected newest-first (index 0 = most recent snapshot).

// ── Thresholds ────────────────────────────────────────────────────────────────

var OSC_DELTA          = 10;  // min |Δscore| between snapshots to count as oscillation
var OSC_MIN_COUNT      = 2;   // oscillations required to trigger risk_score_oscillation
var LABEL_CHURN_MIN    = 2;   // label changes required to trigger label_churn
var CYCLE_LEG_DELTA    = 10;  // min score change per leg for recovery_degradation_cycle
var CI_TRANSITIONS_MIN = 2;   // pass↔fail transitions required for ci_instability
var PR_FLOW_MIN        = 2;   // PR label changes required for pr_flow_instability
var ANOMALY_RECUR_MIN  = 2;   // same-type recurrences required for anomaly_recurrence
var CONF_CHANGES_MIN   = 2;   // confidence level changes required for confidence_volatility

// Minimum history depth before a primitive may fire (avoids false positives)
var MIN_RISK_DEPTH    = 3;
var MIN_METRICS_DEPTH = 3;
var MIN_PR_DEPTH      = 3;

// ── Primitive scoring table ───────────────────────────────────────────────────
// Ordered by descending points so signals / reasons read most-impactful first.

var PRIMITIVE_SCORES = {
  recovery_degradation_cycle: 25,
  anomaly_recurrence:         25,
  risk_score_oscillation:     20,
  label_churn:                20,
  ci_instability:             20,
  pr_flow_instability:        15,
  confidence_volatility:      10,
};

var LEVEL_THRESHOLDS = [
  { min: 75, level: 'critical' },
  { min: 50, level: 'high'     },
  { min: 25, level: 'medium'   },
  { min:  0, level: 'low'      },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _levelFromScore(score) {
  for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i].min) return LEVEL_THRESHOLDS[i].level;
  }
  return 'low';
}

function _safeNum(v) {
  var n = Number(v);
  return isNaN(n) ? null : n;
}

// Counts consecutive pairs (arr[i], arr[i+1]) where the extracted value changed.
// filter(newer, older) returns true only for pairs that should be counted.
// arr is newest-first: arr[i] is newer, arr[i+1] is older.
function _countValueTransitions(arr, valueFn, filter) {
  var count = 0;
  for (var i = 0; i < arr.length - 1; i++) {
    var newer = valueFn(arr[i]);
    var older = valueFn(arr[i + 1]);
    if (newer === older) continue;
    if (filter && !filter(newer, older)) continue;
    count++;
  }
  return count;
}

// Counts pairs where |score[i] − score[i+1]| >= OSC_DELTA.
function _countScoreOscillations(arr, scoreFn) {
  var count = 0;
  for (var i = 0; i < arr.length - 1; i++) {
    var a = _safeNum(scoreFn(arr[i]));
    var b = _safeNum(scoreFn(arr[i + 1]));
    if (a === null || b === null) continue;
    if (Math.abs(a - b) >= OSC_DELTA) count++;
  }
  return count;
}

// ── Detection primitives ──────────────────────────────────────────────────────
// Each returns a human-readable reason string when triggered, null otherwise.

function _detectRiskScoreOscillation(riskHistory) {
  if (riskHistory.length < MIN_RISK_DEPTH) return null;
  var count = _countScoreOscillations(riskHistory, function(s) { return s.score; });
  if (count < OSC_MIN_COUNT) return null;
  return count + ' risk score swing' + (count !== 1 ? 's' : '')
       + ' of ≥' + OSC_DELTA + ' points across ' + riskHistory.length + ' snapshots';
}

function _detectLabelChurn(riskHistory) {
  if (riskHistory.length < MIN_RISK_DEPTH) return null;
  var count = _countValueTransitions(riskHistory, function(s) { return s.label || ''; }, null);
  if (count < LABEL_CHURN_MIN) return null;
  return 'Risk label changed ' + count + ' time' + (count !== 1 ? 's' : '')
       + ' across ' + riskHistory.length + ' snapshots';
}

// Detects a local score extremum where both adjacent legs >= CYCLE_LEG_DELTA.
// In newest-first order: arr[i+1]=older, arr[i]=middle, arr[i-1]=newer.
// Recovery-then-degradation: older→middle risk dropped, middle→newer risk rose.
// Degradation-then-recovery: older→middle risk rose, middle→newer risk dropped.
function _detectRecoveryDegradationCycle(riskHistory) {
  if (riskHistory.length < MIN_RISK_DEPTH) return null;
  for (var i = 1; i < riskHistory.length - 1; i++) {
    var older  = _safeNum(riskHistory[i + 1].score);
    var middle = _safeNum(riskHistory[i    ].score);
    var newer  = _safeNum(riskHistory[i - 1].score);
    if (older === null || middle === null || newer === null) continue;
    if (older - middle >= CYCLE_LEG_DELTA && newer - middle >= CYCLE_LEG_DELTA) {
      return 'Repo recovered then degraded again within ' + riskHistory.length + ' snapshots';
    }
    if (middle - older >= CYCLE_LEG_DELTA && middle - newer >= CYCLE_LEG_DELTA) {
      return 'Repo degraded then recovered within ' + riskHistory.length + ' snapshots';
    }
  }
  return null;
}

// Only counts transitions strictly between 'passing' and 'failing'.
// Transitions involving 'unknown' are excluded — CI unknown alone is not a risk signal.
function _detectCiInstability(metricsHistory) {
  if (metricsHistory.length < MIN_METRICS_DEPTH) return null;
  var count = _countValueTransitions(
    metricsHistory,
    function(m) { return m.ciStatus || 'unknown'; },
    function(newer, older) {
      return (newer === 'passing' || newer === 'failing')
          && (older === 'passing' || older === 'failing');
    }
  );
  if (count < CI_TRANSITIONS_MIN) return null;
  return 'CI status alternated ' + count + ' time' + (count !== 1 ? 's' : '')
       + ' between passing and failing across ' + metricsHistory.length + ' snapshots';
}

// Counts PR label changes where both the old and new labels are active
// (not 'none' = no PR activity, not 'unknown' = no data — neither indicates instability).
function _detectPrFlowInstability(prHealthHistory) {
  if (prHealthHistory.length < MIN_PR_DEPTH) return null;
  var count = _countValueTransitions(
    prHealthHistory,
    function(p) { return p.label || 'unknown'; },
    function(newer, older) {
      return newer !== 'none' && newer !== 'unknown'
          && older !== 'none' && older !== 'unknown';
    }
  );
  if (count < PR_FLOW_MIN) return null;
  return 'PR health label shifted ' + count + ' time' + (count !== 1 ? 's' : '')
       + ' across ' + prHealthHistory.length + ' snapshots';
}

function _detectAnomalyRecurrence(anomalyHistory) {
  if (anomalyHistory.length < ANOMALY_RECUR_MIN) return null;
  var counts = {};
  for (var i = 0; i < anomalyHistory.length; i++) {
    var t = anomalyHistory[i].type;
    if (!t) continue;
    counts[t] = (counts[t] || 0) + 1;
  }
  var recurring = [];
  var types = Object.keys(counts);
  for (var j = 0; j < types.length; j++) {
    if (counts[types[j]] >= ANOMALY_RECUR_MIN) {
      recurring.push({ type: types[j], count: counts[types[j]] });
    }
  }
  if (!recurring.length) return null;
  // Sort by count descending, then type name alphabetically for determinism.
  recurring.sort(function(a, b) {
    return b.count - a.count || a.type.localeCompare(b.type);
  });
  return recurring.map(function(r) {
    return '\'' + r.type + '\' recurred ' + r.count + ' time' + (r.count !== 1 ? 's' : '');
  }).join('; ');
}

function _detectConfidenceVolatility(riskHistory) {
  if (riskHistory.length < MIN_RISK_DEPTH) return null;
  var count = _countValueTransitions(
    riskHistory,
    function(s) { return s.confidenceLevel || ''; },
    null
  );
  if (count < CONF_CHANGES_MIN) return null;
  return 'Confidence level fluctuated ' + count + ' time' + (count !== 1 ? 's' : '')
       + ', indicating unstable evidence quality';
}

// ── Confidence in the volatility assessment ───────────────────────────────────

function _confidenceLevel(riskHistory, metricsHistory) {
  var r = riskHistory.length;
  var m = metricsHistory.length;
  if (r >= 5 && m >= 3) return 'high';
  if (r >= 3 || m >= 3) return 'medium';
  return 'low';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pure, deterministic engineering volatility detector.
 * Evaluates temporal instability — oscillations, churn, cycles, recurrence.
 * No static metadata penalties. No DB access. No I/O. Does not mutate inputs.
 *
 * @param {object}  opts
 * @param {Array}   [opts.riskHistory]     — newest-first: [{ score, label, confidenceLevel }, ...]
 * @param {Array}   [opts.metricsHistory]  — newest-first: [{ ciStatus, ... }, ...]
 * @param {Array}   [opts.prHealthHistory] — newest-first: [{ score, label, confidenceLevel }, ...]
 * @param {Array}   [opts.anomalyHistory]  — newest-first: [{ type, ... }, ...]
 * @returns {{
 *   volatilityLevel:  'low'|'medium'|'high'|'critical',
 *   volatilityScore:  number,
 *   signals:          string[],
 *   reasons:          string[],
 *   confidenceLevel:  'low'|'medium'|'high',
 * }}
 */
function detectEngineeringVolatility(opts) {
  var o               = (opts && typeof opts === 'object') ? opts : {};
  var riskHistory     = Array.isArray(o.riskHistory)     ? o.riskHistory     : [];
  var metricsHistory  = Array.isArray(o.metricsHistory)  ? o.metricsHistory  : [];
  var prHealthHistory = Array.isArray(o.prHealthHistory) ? o.prHealthHistory : [];
  var anomalyHistory  = Array.isArray(o.anomalyHistory)  ? o.anomalyHistory  : [];

  // Detectors run in descending-points order so signals/reasons list most-impactful first.
  var DETECTORS = [
    { id: 'recovery_degradation_cycle', fn: function() { return _detectRecoveryDegradationCycle(riskHistory); } },
    { id: 'anomaly_recurrence',         fn: function() { return _detectAnomalyRecurrence(anomalyHistory); } },
    { id: 'risk_score_oscillation',     fn: function() { return _detectRiskScoreOscillation(riskHistory); } },
    { id: 'label_churn',                fn: function() { return _detectLabelChurn(riskHistory); } },
    { id: 'ci_instability',             fn: function() { return _detectCiInstability(metricsHistory); } },
    { id: 'pr_flow_instability',        fn: function() { return _detectPrFlowInstability(prHealthHistory); } },
    { id: 'confidence_volatility',      fn: function() { return _detectConfidenceVolatility(riskHistory); } },
  ];

  var signals = [];
  var reasons = [];
  var total   = 0;

  for (var i = 0; i < DETECTORS.length; i++) {
    var d      = DETECTORS[i];
    var reason = d.fn();
    if (reason !== null) {
      signals.push(d.id);
      reasons.push(reason);
      total += PRIMITIVE_SCORES[d.id] || 0;
    }
  }

  return {
    volatilityLevel:  _levelFromScore(Math.min(100, total)),
    volatilityScore:  Math.min(100, total),
    signals:          signals,
    reasons:          reasons,
    confidenceLevel:  _confidenceLevel(riskHistory, metricsHistory),
  };
}

module.exports = {
  detectEngineeringVolatility,
  OSC_DELTA,
  OSC_MIN_COUNT,
  LABEL_CHURN_MIN,
  CYCLE_LEG_DELTA,
  CI_TRANSITIONS_MIN,
  PR_FLOW_MIN,
  ANOMALY_RECUR_MIN,
  CONF_CHANGES_MIN,
  MIN_RISK_DEPTH,
  MIN_METRICS_DEPTH,
  MIN_PR_DEPTH,
};
