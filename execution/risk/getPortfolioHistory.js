'use strict';

// Portfolio-level severity thresholds derived from the average risk score
// across all active repos in a snapshot window.
// Mirrors scoreRepo.js LABEL_THRESHOLDS exactly so portfolio level maps 1-to-1
// with individual repo labels: 0–29 healthy, 30–49 monitor, 50–74 at-risk, 75–100 critical.
const LEVEL_THRESHOLDS = [
  { min: 75, level: 'critical' },
  { min: 50, level: 'at-risk'  },
  { min: 30, level: 'monitor'  },
  { min: 0,  level: 'healthy'  },
];

/**
 * Derives a portfolio operational level from the average repo risk score
 * for a snapshot window. Pure, deterministic — no I/O.
 *
 * @param {number} avgScore  Average risk score across repos (0–100).
 * @returns {'critical'|'at-risk'|'monitor'|'healthy'}
 */
function derivePortfolioLevel(avgScore) {
  var s = Number(avgScore);
  if (!isFinite(s)) return 'healthy';
  for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (s >= LEVEL_THRESHOLDS[i].min) return LEVEL_THRESHOLDS[i].level;
  }
  return 'healthy';
}

/**
 * Maps pre-aggregated portfolio snapshot rows (produced by the DB GROUP BY
 * query) into the canonical portfolio history shape, adding a deterministic
 * portfolioLevel derived from the average score.
 *
 * Input rows are produced by:
 *   SELECT DATE_TRUNC('hour', snapshot_at), ROUND(AVG(score))::int, COUNT(DISTINCT repo_id)::int
 *   FROM risk_scores ... GROUP BY ... ORDER BY ... DESC LIMIT 30
 *
 * Pure function — no I/O.
 *
 * @param {Array} rows  DB result rows, each: { snapshotAt, portfolioScore, repoCount }
 * @returns {Array<{
 *   snapshotAt:     string,
 *   portfolioScore: number,
 *   portfolioLevel: 'critical'|'at-risk'|'monitor'|'healthy',
 *   repoCount:      number,
 * }>}
 */
function buildPortfolioHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(function(row) {
    var score = row.portfolioScore != null ? Math.round(Number(row.portfolioScore)) : 0;
    return {
      snapshotAt:     row.snapshotAt,
      portfolioScore: score,
      portfolioLevel: derivePortfolioLevel(score),
      repoCount:      row.repoCount != null ? Number(row.repoCount) : 0,
    };
  });
}

module.exports = { buildPortfolioHistory, derivePortfolioLevel };
