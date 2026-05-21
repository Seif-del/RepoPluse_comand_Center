'use strict';

// Snapshot count → base confidence points.
// 5+ snapshots deliver the highest base; 0–1 are sparse by definition.
var SNAPSHOT_POINTS = [
  { min: 5, points: 55 },
  { min: 3, points: 35 },
  { min: 2, points: 25 },
  { min: 1, points: 10 },
  { min: 0, points:  0 },
];

// Hard score caps applied after accumulation (take the minimum across all that fire).
// Enforces: 0–1 snapshots → always low; missing telemetry / high volatility → max medium.
// "5+ snapshots required for high" is enforced in _levelFromScore, not as a score cap.
var HARD_CAPS = [
  { condition: function(ctx) { return ctx.snapshotCount <= 1;         }, cap: 30 }, // always low
  { condition: function(ctx) { return ctx.allTelemetryMissing;        }, cap: 60 }, // max medium
  { condition: function(ctx) { return ctx.volatilityLevel === 'high'; }, cap: 60 }, // max medium
];

var LEVEL_THRESHOLDS = [
  { min: 70, level: 'high'   },
  { min: 40, level: 'medium' },
  { min: 0,  level: 'low'    },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _snapshotPoints(count) {
  for (var i = 0; i < SNAPSHOT_POINTS.length; i++) {
    if (count >= SNAPSHOT_POINTS[i].min) return SNAPSHOT_POINTS[i].points;
  }
  return 0;
}

// Count telemetry fields that carry a real (non-unknown) value.
function _telemetryCompleteCount(currentRepo) {
  if (!currentRepo || typeof currentRepo !== 'object') return 0;
  var n = 0;
  if (currentRepo.ciStatus           && currentRepo.ciStatus           !== 'unknown') n++;
  if (currentRepo.releaseStatus      && currentRepo.releaseStatus      !== 'unknown') n++;
  if (currentRepo.contributorStatus  && currentRepo.contributorStatus  !== 'unknown') n++;
  return n;
}

function _telemetryPoints(completedCount) {
  if (completedCount >= 3) return 25;
  if (completedCount === 2) return 15;
  if (completedCount === 1) return 8;
  return 0;
}

function _stabilityPoints(volatilityLevel) {
  if (volatilityLevel === 'high')   return 0;
  if (volatilityLevel === 'medium') return 8;
  return 15;
}

// Consistent label: all snapshots in the most-recent window share the same label.
function _isConsistentLabel(riskHistory) {
  if (!riskHistory || riskHistory.length < 3) return false;
  var anchor = riskHistory[0] && riskHistory[0].label;
  if (!anchor) return false;
  var window = Math.min(riskHistory.length, 5);
  for (var i = 1; i < window; i++) {
    if (!riskHistory[i] || riskHistory[i].label !== anchor) return false;
  }
  return true;
}

function _applyHardCaps(score, ctx) {
  var result = score;
  for (var i = 0; i < HARD_CAPS.length; i++) {
    if (HARD_CAPS[i].condition(ctx)) {
      result = Math.min(result, HARD_CAPS[i].cap);
    }
  }
  return result;
}

// 5+ snapshots are required for high confidence — fewer keeps the ceiling at medium.
function _levelFromScore(score, snapshotCount) {
  if (score >= 70 && snapshotCount >= 5) return 'high';
  if (score >= 40)                        return 'medium';
  return 'low';
}

function _buildSummary(level, snapshotCount, telemetryComplete, volatilityLevel) {
  if (level === 'high') {
    return 'High confidence: ' + snapshotCount + ' snapshots with complete telemetry and stable operational history.';
  }
  if (level === 'medium') {
    var parts = [];
    if (snapshotCount < 5) parts.push('partial history (' + snapshotCount + ' snapshot' + (snapshotCount !== 1 ? 's' : '') + ')');
    if (telemetryComplete < 3) parts.push(telemetryComplete + ' of 3 telemetry signals present');
    if (volatilityLevel === 'high' || volatilityLevel === 'medium') parts.push(volatilityLevel + ' operational volatility');
    return 'Medium confidence' + (parts.length ? ': ' + parts.join(', ') + '.' : '.');
  }
  var parts = [];
  if (snapshotCount <= 1) {
    parts.push('sparse history (' + snapshotCount + ' snapshot' + (snapshotCount !== 1 ? 's' : '') + ')');
  }
  if (telemetryComplete === 0) parts.push('no telemetry data available');
  if (volatilityLevel === 'high') parts.push('high operational volatility');
  return 'Low confidence' + (parts.length ? ': ' + parts.join(', ') + '.' : '.');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Derives a deterministic operational confidence assessment from persisted evidence.
 *
 * Confidence reflects evidence quality, NOT probability.
 * No ML, no random, no fabrication. Pure function — no I/O.
 *
 * Positive evidence: sufficient snapshots, complete telemetry, low volatility, consistent labels.
 * Negative evidence: sparse history, missing telemetry, high volatility.
 *
 * Hard constraints (caps):
 *   0–1 snapshots          → always low  (score ≤ 30)
 *   2–4 snapshots          → max medium  (score ≤ 65)
 *   all telemetry unknown  → max medium  (score ≤ 60)
 *   high volatility        → max medium  (score ≤ 60)
 *
 * @param {object}  opts
 * @param {Array}   opts.riskHistory    — newest-first: [{ score, label, snapshotAt }, ...]
 * @param {Array}   opts.metricsHistory — newest-first: [{ ciStatus, releaseStatus, contributorStatus }, ...]
 * @param {object}  [opts.escalation]   — output of getEscalationSignals (optional)
 * @param {object}  [opts.forecast]     — output of getOperationalForecast (optional, reserved)
 * @param {object}  [opts.currentRepo]  — latest metrics: { ciStatus, releaseStatus, contributorStatus }
 * @returns {{
 *   confidenceLevel:  'low'|'medium'|'high',
 *   confidenceScore:  number,
 *   factors:          string[],
 *   summary:          string,
 * }}
 */
function getOperationalConfidence(opts) {
  var o   = (opts && typeof opts === 'object') ? opts : {};
  var rh  = Array.isArray(o.riskHistory)    ? o.riskHistory    : [];
  var esc = (o.escalation && typeof o.escalation === 'object') ? o.escalation : {};
  var cr  = (o.currentRepo && typeof o.currentRepo === 'object') ? o.currentRepo : {};

  var snapshotCount      = rh.length;
  var volatilityLevel    = esc.volatilityLevel || 'low';
  var telemetryComplete  = _telemetryCompleteCount(cr);
  var allTelemetryMissing = telemetryComplete === 0;

  var ctx = { snapshotCount: snapshotCount, allTelemetryMissing: allTelemetryMissing, volatilityLevel: volatilityLevel };

  // ── Score accumulation ──────────────────────────────────────────────────────
  var score   = 0;
  var factors = [];

  // Snapshot depth
  score += _snapshotPoints(snapshotCount);
  if (snapshotCount >= 5) {
    factors.push(snapshotCount + ' historical snapshots provide strong temporal depth');
  } else if (snapshotCount >= 3) {
    factors.push(snapshotCount + ' historical snapshots provide partial temporal depth');
  } else if (snapshotCount === 2) {
    factors.push('Only 2 historical snapshots — limited basis for assessment');
  } else if (snapshotCount === 1) {
    factors.push('Only 1 historical snapshot — newly synced repository');
  } else {
    factors.push('No historical snapshots — repository has never been scored');
  }

  // Telemetry completeness
  score += _telemetryPoints(telemetryComplete);
  if (telemetryComplete === 3) {
    factors.push('Complete telemetry: CI, release, and contributor data available');
  } else if (telemetryComplete === 2) {
    factors.push('Partial telemetry: 2 of 3 operational signals present');
  } else if (telemetryComplete === 1) {
    factors.push('Sparse telemetry: only 1 of 3 operational signals present');
  } else {
    factors.push('Missing telemetry: no CI, release, or contributor data');
  }

  // Volatility stability
  score += _stabilityPoints(volatilityLevel);
  if (volatilityLevel === 'high') {
    factors.push('High operational volatility reduces assessment reliability');
  } else if (volatilityLevel === 'medium') {
    factors.push('Moderate operational volatility detected');
  } else {
    factors.push('Low operational volatility supports consistent assessment');
  }

  // Consistent label bonus — only meaningful when telemetry context is present
  if (!allTelemetryMissing && _isConsistentLabel(rh)) {
    score += 5;
    factors.push('Consistent operational label across recent snapshots');
  } else if (snapshotCount >= 3) {
    factors.push('Varying operational labels across recent snapshots');
  }

  // ── Hard caps ───────────────────────────────────────────────────────────────
  score = _applyHardCaps(score, ctx);

  // ── Normalize and classify ──────────────────────────────────────────────────
  var confidenceScore = Math.max(0, Math.min(100, score));
  var confidenceLevel = _levelFromScore(confidenceScore, snapshotCount);
  var summary         = _buildSummary(confidenceLevel, snapshotCount, telemetryComplete, volatilityLevel);

  return {
    confidenceLevel:  confidenceLevel,
    confidenceScore:  confidenceScore,
    factors:          factors,
    summary:          summary,
  };
}

module.exports = { getOperationalConfidence };
