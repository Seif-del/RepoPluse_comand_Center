'use strict';

const CI_FAILING_FACTOR        = 'CI/CD pipeline has recent failing runs';
const RELEASE_STALE_FACTOR     = 'No releases in the last 90 days';
const RELEASE_NONE_FACTOR      = 'No releases found for this repository';
const CONTRIBUTOR_LOW_FACTOR   = 'Low contributor activity (1-2 contributors)';
const CONTRIBUTOR_BUS_FACTOR   = 'High bus-factor risk: one contributor dominates';
const CONTRIBUTOR_NONE_FACTOR  = 'Repository appears abandoned (no contributors)';

// Full list of signals that cannot yet be derived from the current DB schema.
// Exposed as a module export so tests can assert against the canonical list.
// Items are filtered out of notMeasured when the corresponding signal IS known.
const NOT_MEASURED = [
  'CI/CD pipeline status',
  'Release activity',
  'Contributor activity',
  'Dependency vulnerabilities',
];

/**
 * Derives a structured risk explanation for a repository from the fields
 * already returned by GET /api/repos. Pure function — no I/O.
 *
 * "triggered" contains the factor strings stored in risk_scores.factors plus
 * any intelligence-layer factors (CI, release, contributors) derived from the
 * latest metrics. "notMeasured" lists signals the system cannot yet check;
 * items are removed as the corresponding data source becomes known.
 *
 * @param {object}        params
 * @param {number|null}   params.score             — risk score; null means not yet synced
 * @param {string|null}   params.label             — 'healthy' | 'at-risk' | 'critical' | null
 * @param {string[]|null} params.factors           — scored factor strings; null means not yet synced
 * @param {string}        [params.ciStatus]        — 'passing' | 'failing' | 'unknown'
 * @param {string}        [params.releaseStatus]   — 'healthy' | 'stale' | 'none' | 'unknown'
 * @param {string}        [params.contributorStatus] — 'healthy' | 'low_activity' |
 *                                                     'bus_factor_risk' | 'abandoned' | 'unknown'
 * @returns {{
 *   hasMetrics:  boolean,
 *   triggered:   string[],
 *   notMeasured: string[],
 *   allClear:    boolean,
 * }}
 */
function getRepoRiskFactors({ score, label, factors, ciStatus, releaseStatus, contributorStatus } = {}) {
  const hasMetrics = score !== null && score !== undefined;

  const ciKnown          = ciStatus === 'passing' || ciStatus === 'failing';
  const releaseKnown     = releaseStatus === 'healthy' || releaseStatus === 'stale' || releaseStatus === 'none';
  const contributorKnown = contributorStatus === 'healthy'
                        || contributorStatus === 'low_activity'
                        || contributorStatus === 'bus_factor_risk'
                        || contributorStatus === 'abandoned';

  const notMeasured = NOT_MEASURED.filter(m => {
    if (m === 'CI/CD pipeline status' && ciKnown)       return false;
    if (m === 'Release activity'       && releaseKnown)  return false;
    if (m === 'Contributor activity'   && contributorKnown) return false;
    return true;
  });

  if (!hasMetrics) {
    return {
      hasMetrics:  false,
      triggered:   [],
      notMeasured,
      allClear:    false,
    };
  }

  const triggered = Array.isArray(factors) ? factors.slice() : [];
  if (ciStatus === 'failing')                    triggered.push(CI_FAILING_FACTOR);
  if (releaseStatus === 'stale')                 triggered.push(RELEASE_STALE_FACTOR);
  if (releaseStatus === 'none')                  triggered.push(RELEASE_NONE_FACTOR);
  if (contributorStatus === 'low_activity')      triggered.push(CONTRIBUTOR_LOW_FACTOR);
  if (contributorStatus === 'bus_factor_risk')   triggered.push(CONTRIBUTOR_BUS_FACTOR);
  if (contributorStatus === 'abandoned')         triggered.push(CONTRIBUTOR_NONE_FACTOR);

  return {
    hasMetrics:  true,
    triggered,
    notMeasured,
    allClear:    triggered.length === 0,
  };
}

module.exports = { getRepoRiskFactors, NOT_MEASURED };
