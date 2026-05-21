'use strict';

/**
 * Derives a trend indicator by comparing the current risk score against a previous one.
 *
 * Direction thresholds:
 *   delta >= +10  → 'worsening'  (risk increased)
 *   delta <= -10  → 'improving'  (risk decreased)
 *   otherwise     → 'stable'
 *
 * @param {{ currentScore: number|null|undefined, previousScore: number|null|undefined }} opts
 * @returns {{ direction: 'worsening'|'improving'|'stable'|'unknown', delta: number|null, label: string }}
 */
function getTrendIndicator({ currentScore, previousScore } = {}) {
  var cur  = currentScore  != null ? Number(currentScore)  : null;
  var prev = previousScore != null ? Number(previousScore) : null;

  if (cur === null || prev === null || isNaN(cur) || isNaN(prev)) {
    return { direction: 'unknown', delta: null, label: 'Insufficient history' };
  }

  var delta = cur - prev;

  if (delta >= 10)  return { direction: 'worsening', delta: delta, label: 'Risk increasing' };
  if (delta <= -10) return { direction: 'improving',  delta: delta, label: 'Risk improving' };
  return { direction: 'stable', delta: delta, label: 'Operationally stable' };
}

module.exports = { getTrendIndicator };
