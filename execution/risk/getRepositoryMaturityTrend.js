'use strict';

// Repository Maturity Trend.
// Answers: "Is this repository becoming more mature, less mature, or staying the same?"
//
// Input:  array of maturity snapshots (from scoreRepositoryMaturity), any order.
// Output: trend summary with delta, dimension deltas, and gap analytics.
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const TREND_IMPROVING_THRESHOLD = 10;   // delta >= +10
const TREND_DECLINING_THRESHOLD = -10;  // delta <= -10

const DIM_KEYS = [
  'ciMaturity',
  'releaseMaturity',
  'contributorMaturity',
  'activityMaturity',
  'prWorkflowMaturity',
  'telemetryMaturity',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function _sortSnapshots(snapshots) {
  const hasAnyDate = snapshots.some(s => s.snapshotAt != null);
  if (!hasAnyDate) {
    // No dates available: preserve input order (caller convention: newest-first).
    return snapshots.slice();
  }
  // Sort descending: newest first.
  return snapshots.slice().sort(function(a, b) {
    const ta = a.snapshotAt ? new Date(a.snapshotAt).getTime() : 0;
    const tb = b.snapshotAt ? new Date(b.snapshotAt).getTime() : 0;
    return tb - ta;
  });
}

function _deriveTrend(delta) {
  if (delta >= TREND_IMPROVING_THRESHOLD) return 'improving';
  if (delta <= TREND_DECLINING_THRESHOLD) return 'declining';
  return 'stable';
}

function _deriveConfidence(sorted) {
  const count  = sorted.length;
  if (count < 3) return 'low';
  if (count < 5) return 'medium';
  // 5+ snapshots: high only if latest confidence is not low
  const latestConf = (sorted[0] && sorted[0].confidenceLevel) || 'low';
  if (latestConf === 'high' || latestConf === 'medium') return 'high';
  return 'medium';
}

function _dimValue(snapshot, key) {
  const dims = (snapshot && snapshot.dimensions) || {};
  const v = dims[key];
  return typeof v === 'number' ? v : 0;
}

function _dimensionDeltas(latest, oldest) {
  const deltas = {};
  DIM_KEYS.forEach(function(k) {
    deltas[k] = _dimValue(latest, k) - _dimValue(oldest, k);
  });
  return deltas;
}

function _gapSet(snapshot) {
  return new Set(Array.isArray(snapshot.gaps) ? snapshot.gaps : []);
}

function _recurringGaps(sorted) {
  if (sorted.length < 2) return [];
  const latestSet = _gapSet(sorted[0]);
  if (latestSet.size === 0) return [];

  const recurring = [];
  latestSet.forEach(function(gap) {
    // Must appear in latest AND at least one other snapshot.
    const appearsElsewhere = sorted.slice(1).some(function(s) {
      return _gapSet(s).has(gap);
    });
    if (appearsElsewhere) recurring.push(gap);
  });
  return recurring;
}

function _resolvedGaps(latest, oldest) {
  const oldestSet = _gapSet(oldest);
  const latestSet = _gapSet(latest);
  const resolved  = [];
  oldestSet.forEach(function(gap) {
    if (!latestSet.has(gap)) resolved.push(gap);
  });
  return resolved;
}

function _emergingGaps(latest, oldest) {
  const oldestSet = _gapSet(oldest);
  const latestSet = _gapSet(latest);
  const emerging  = [];
  latestSet.forEach(function(gap) {
    if (!oldestSet.has(gap)) emerging.push(gap);
  });
  return emerging;
}

function _buildSummary(trend, delta, latestScore, count) {
  if (count === 0) return 'No maturity snapshots available — trend cannot be determined.';
  if (count === 1) return 'Only one maturity snapshot available — trend requires at least two snapshots.';

  const sign   = delta > 0 ? '+' : '';
  const change = sign + delta + ' point' + (Math.abs(delta) === 1 ? '' : 's');

  if (trend === 'improving') {
    return 'Repository maturity is improving (' + change + ' over ' + count + ' snapshots, current score ' + latestScore + ').';
  }
  if (trend === 'declining') {
    return 'Repository maturity is declining (' + change + ' over ' + count + ' snapshots, current score ' + latestScore + ').';
  }
  return 'Repository maturity is stable (' + change + ' over ' + count + ' snapshots, current score ' + latestScore + ').';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute the maturity trend across a series of scored maturity snapshots.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {Array} snapshots
 *   Array of objects shaped like scoreRepositoryMaturity() output, plus snapshotAt.
 *   Accepted in any order when snapshotAt is provided; newest-first assumed otherwise.
 *
 * @returns {{
 *   trend:           'improving'|'declining'|'stable'|'unknown',
 *   delta:           number|null,
 *   latestScore:     number|null,
 *   oldestScore:     number|null,
 *   confidenceLevel: 'low'|'medium'|'high',
 *   summary:         string,
 *   dimensionDeltas: object,
 *   recurringGaps:   string[],
 *   resolvedGaps:    string[],
 *   emergingGaps:    string[],
 * }}
 */
function getRepositoryMaturityTrend(snapshots) {
  if (!Array.isArray(snapshots) || snapshots.length === 0) {
    return {
      trend:           'unknown',
      delta:           null,
      latestScore:     null,
      oldestScore:     null,
      confidenceLevel: 'low',
      summary:         'No maturity snapshots available — trend cannot be determined.',
      dimensionDeltas: {},
      recurringGaps:   [],
      resolvedGaps:    [],
      emergingGaps:    [],
    };
  }

  const sorted      = _sortSnapshots(snapshots);
  const latest      = sorted[0];
  const oldest      = sorted[sorted.length - 1];
  const latestScore = typeof latest.maturityScore === 'number' ? latest.maturityScore : null;
  const count       = sorted.length;

  if (count < 2) {
    return {
      trend:           'unknown',
      delta:           null,
      latestScore,
      oldestScore:     null,
      confidenceLevel: 'low',
      summary:         'Only one maturity snapshot available — trend requires at least two snapshots.',
      dimensionDeltas: {},
      recurringGaps:   [],
      resolvedGaps:    [],
      emergingGaps:    [],
    };
  }

  const oldestScore = typeof oldest.maturityScore === 'number' ? oldest.maturityScore : null;
  const delta       = (latestScore !== null && oldestScore !== null) ? (latestScore - oldestScore) : null;
  const trend       = delta !== null ? _deriveTrend(delta) : 'unknown';

  return {
    trend,
    delta,
    latestScore,
    oldestScore,
    confidenceLevel: _deriveConfidence(sorted),
    summary:         _buildSummary(trend, delta, latestScore, count),
    dimensionDeltas: _dimensionDeltas(latest, oldest),
    recurringGaps:   _recurringGaps(sorted),
    resolvedGaps:    _resolvedGaps(latest, oldest),
    emergingGaps:    _emergingGaps(latest, oldest),
  };
}

module.exports = { getRepositoryMaturityTrend };
