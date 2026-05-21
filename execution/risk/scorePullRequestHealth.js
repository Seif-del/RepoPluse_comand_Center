'use strict';

// PR health scoring for solo-maintainer portfolios.
// Focuses on flow blockage and PR debt — NOT review diversity.
//
// Score bands: healthy 0–29, monitor 30–49, at-risk 50–74, critical 75–100.
// Special labels: 'none' (no PR history — neutral), 'unknown' (telemetry unavailable).

const LARGE_PR_SIZE_THRESHOLD = 500;

// Rules evaluated only when prTelemetryStatus === 'active'.
// Each rule is independent; scores are summed and capped at 100.
// Ordered by descending severity so reason lists read most-severe first.
const RULES = [
  {
    id:     'abandoned_prs',
    test:   (t) => typeof t.abandonedPrCount === 'number' && t.abandonedPrCount > 0,
    points: 35,
    reason: (t) => `${t.abandonedPrCount} pull request${t.abandonedPrCount === 1 ? '' : 's'} open for more than 30 days`,
  },
  {
    id:     'failed_checks',
    test:   (t) => typeof t.failedCheckPrCount === 'number' && t.failedCheckPrCount > 0,
    points: 25,
    reason: (t) => `${t.failedCheckPrCount} open pull request${t.failedCheckPrCount === 1 ? '' : 's'} with failed checks`,
  },
  {
    id:     'stale_prs',
    test:   (t) => typeof t.stalePrCount === 'number' && t.stalePrCount > 0,
    points: 20,
    reason: (t) => `${t.stalePrCount} pull request${t.stalePrCount === 1 ? '' : 's'} open for more than 7 days`,
  },
  {
    id:     'oldest_pr_very_old',
    test:   (t) => typeof t.oldestOpenPrAgeDays === 'number' && t.oldestOpenPrAgeDays > 30,
    points: 20,
    reason: () => 'Oldest open pull request is more than 30 days old',
  },
  {
    id:     'high_merge_latency',
    // > 168 h (7 days): serious flow blockage — mutually exclusive with elevated_merge_latency
    test:   (t) => typeof t.avgMergeLatencyHours === 'number' && t.avgMergeLatencyHours > 168,
    points: 15,
    reason: (t) => `Average merge latency is ${t.avgMergeLatencyHours}h (over 7 days)`,
  },
  {
    id:     'oldest_pr_stale',
    // > 7 d but ≤ 30 d — mutually exclusive with oldest_pr_very_old
    test:   (t) => typeof t.oldestOpenPrAgeDays === 'number' && t.oldestOpenPrAgeDays > 7 && t.oldestOpenPrAgeDays <= 30,
    points: 10,
    reason: () => 'Oldest open pull request is more than 7 days old',
  },
  {
    id:     'elevated_merge_latency',
    // > 72 h (3 days) but ≤ 168 h — mutually exclusive with high_merge_latency
    test:   (t) => typeof t.avgMergeLatencyHours === 'number' && t.avgMergeLatencyHours > 72 && t.avgMergeLatencyHours <= 168,
    points: 8,
    reason: (t) => `Average merge latency is ${t.avgMergeLatencyHours}h (over 3 days)`,
  },
  {
    id:     'blocked_throughput',
    test:   (t) => typeof t.throughput30d === 'number' && t.throughput30d === 0 &&
                   typeof t.openPrCount   === 'number' && t.openPrCount > 0,
    points: 10,
    reason: () => 'No PRs merged in 30 days with open pull requests pending',
  },
  {
    id:     'large_pr_size',
    test:   (t) => typeof t.avgPrSize === 'number' && t.avgPrSize > LARGE_PR_SIZE_THRESHOLD,
    points: 10,
    reason: (t) => `Average PR size is ${t.avgPrSize} lines (very large)`,
  },
];

const LABEL_THRESHOLDS = [
  { min: 75, label: 'critical' },
  { min: 50, label: 'at-risk'  },
  { min: 30, label: 'monitor'  },
  { min:  0, label: 'healthy'  },
];

function _confidenceLevel(telemetry) {
  if (telemetry.prTelemetryStatus === 'none')    return 'high';
  if (telemetry.prTelemetryStatus !== 'active')  return 'low';
  const evidence = (telemetry.openPrCount || 0) + (telemetry.mergedPrCount30d || 0);
  if (evidence >= 5) return 'high';
  if (evidence >= 2) return 'medium';
  return 'low';
}

/**
 * Pure, deterministic PR operational health scorer. No I/O.
 *
 * Designed for solo-maintainer portfolios. Signals focus on flow blockage and
 * PR debt (stale, abandoned, failing checks, latency). Review diversity and
 * reviewer participation are intentionally excluded.
 *
 * @param {object}      telemetry
 * @param {number|null} telemetry.openPrCount
 * @param {number|null} telemetry.mergedPrCount30d
 * @param {number|null} telemetry.stalePrCount
 * @param {number|null} telemetry.avgMergeLatencyHours
 * @param {number|null} telemetry.failedCheckPrCount
 * @param {number|null} telemetry.avgPrSize
 * @param {number|null} telemetry.throughput30d
 * @param {number|null} telemetry.abandonedPrCount
 * @param {number|null} telemetry.oldestOpenPrAgeDays
 * @param {string}      telemetry.prTelemetryStatus   'active' | 'none' | 'unknown'
 * @returns {{
 *   score:           number,
 *   label:           'healthy'|'monitor'|'at-risk'|'critical'|'none'|'unknown',
 *   reasons:         string[],
 *   signals:         string[],
 *   confidenceLevel: 'low'|'medium'|'high',
 * }}
 */
function scorePullRequestHealth(telemetry = {}) {
  const status = telemetry.prTelemetryStatus;

  if (status === 'none') {
    return { score: 0, label: 'none', reasons: [], signals: [], confidenceLevel: 'high' };
  }

  if (status !== 'active') {
    return { score: 0, label: 'unknown', reasons: [], signals: [], confidenceLevel: 'low' };
  }

  let total = 0;
  const reasons = [];
  const signals = [];

  for (const rule of RULES) {
    if (rule.test(telemetry)) {
      total += rule.points;
      reasons.push(rule.reason(telemetry));
      signals.push(rule.id);
    }
  }

  const score          = Math.min(100, total);
  const label          = LABEL_THRESHOLDS.find(t => score >= t.min).label;
  const confidenceLevel = _confidenceLevel(telemetry);

  return { score, label, reasons, signals, confidenceLevel };
}

module.exports = { scorePullRequestHealth, LARGE_PR_SIZE_THRESHOLD };
