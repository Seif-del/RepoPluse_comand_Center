'use strict';

const CI_FAILING_FACTOR = 'CI/CD pipeline has recent failing runs';

// Factors that cannot be derived from the current DB schema.
// Shown as "not yet measured" in the risk explanation panel.
// Add entries here as new data sources are integrated.
const NOT_MEASURED = [
  'CI/CD pipeline status',
  'Release activity',
  'Dependency vulnerabilities',
];

// Used when CI status IS known — CI moves out of not-measured.
const ALWAYS_NOT_MEASURED = [
  'Release activity',
  'Dependency vulnerabilities',
];

/**
 * Derives a structured risk explanation for a repository from the fields
 * already returned by GET /api/repos. Pure function — no I/O.
 *
 * "triggered" contains the factor strings written by scoreRepo() and stored in
 * risk_scores.factors, plus a CI factor when ciStatus === 'failing'.
 * "notMeasured" lists signals the system cannot yet check (CI removed when known).
 *
 * @param {object}        params
 * @param {number|null}   params.score     — risk score; null means not yet synced
 * @param {string|null}   params.label     — 'healthy' | 'at-risk' | 'critical' | null
 * @param {string[]|null} params.factors   — scored factor strings; null means not yet synced
 * @param {string}        [params.ciStatus] — 'passing' | 'failing' | 'unknown'
 * @returns {{
 *   hasMetrics:  boolean,
 *   triggered:   string[],
 *   notMeasured: string[],
 *   allClear:    boolean,
 * }}
 */
function getRepoRiskFactors({ score, label, factors, ciStatus } = {}) {
  const hasMetrics = score !== null && score !== undefined;
  const ciKnown    = ciStatus === 'passing' || ciStatus === 'failing';
  const notMeasured = ciKnown ? ALWAYS_NOT_MEASURED.slice() : NOT_MEASURED.slice();

  if (!hasMetrics) {
    return {
      hasMetrics:  false,
      triggered:   [],
      notMeasured,
      allClear:    false,
    };
  }

  const triggered = Array.isArray(factors) ? factors.slice() : [];
  if (ciStatus === 'failing') triggered.push(CI_FAILING_FACTOR);

  return {
    hasMetrics:  true,
    triggered,
    notMeasured,
    allClear:    triggered.length === 0,
  };
}

module.exports = { getRepoRiskFactors, NOT_MEASURED };
