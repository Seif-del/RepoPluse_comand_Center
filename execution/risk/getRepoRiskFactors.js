'use strict';

// Factors that cannot be derived from the current DB schema.
// Shown as "not yet measured" in the risk explanation panel.
// Add entries here as new data sources are integrated.
const NOT_MEASURED = [
  'CI/CD pipeline status',
  'Release activity',
  'Dependency vulnerabilities',
];

/**
 * Derives a structured risk explanation for a repository from the fields
 * already returned by GET /api/repos. Pure function — no I/O.
 *
 * "triggered" contains the factor strings written by scoreRepo() and stored in
 * risk_scores.factors. "notMeasured" lists signals the system cannot yet check.
 *
 * @param {object}        params
 * @param {number|null}   params.score    — risk score; null means not yet synced
 * @param {string|null}   params.label    — 'healthy' | 'at-risk' | 'critical' | null
 * @param {string[]|null} params.factors  — scored factor strings; null means not yet synced
 * @returns {{
 *   hasMetrics:  boolean,
 *   triggered:   string[],
 *   notMeasured: string[],
 *   allClear:    boolean,
 * }}
 */
function getRepoRiskFactors({ score, label, factors } = {}) {
  const hasMetrics = score !== null && score !== undefined;

  if (!hasMetrics) {
    return {
      hasMetrics:  false,
      triggered:   [],
      notMeasured: NOT_MEASURED.slice(),
      allClear:    false,
    };
  }

  const triggered = Array.isArray(factors) ? factors.slice() : [];

  return {
    hasMetrics:  true,
    triggered,
    notMeasured: NOT_MEASURED.slice(),
    allClear:    triggered.length === 0,
  };
}

module.exports = { getRepoRiskFactors, NOT_MEASURED };
