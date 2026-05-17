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

// Factors representing active operational instability (not structural maturity).
// Used to populate operationalFactors in the returned explanation.
const OPERATIONAL_FACTOR_STRINGS = new Set([
  CI_FAILING_FACTOR,
  CONTRIBUTOR_NONE_FACTOR,
]);

/**
 * Derives a structured risk explanation for a repository from the fields
 * already returned by GET /api/repos. Pure function — no I/O.
 *
 * "triggered" contains the factor strings stored in risk_scores.factors plus
 * any intelligence-layer factors (CI, release, contributors) derived from the
 * latest metrics. "notMeasured" lists signals the system cannot yet check.
 *
 * "structuralFactors" and "operationalFactors" partition triggered into
 * maturity/activity concerns vs active operational instability, for clear
 * operator explanation.
 *
 * @param {object}        params
 * @param {number|null}   params.score             — risk score; null means not yet synced
 * @param {string|null}   params.label             — 'healthy' | 'monitor' | 'at-risk' | 'critical' | null
 * @param {string[]|null} params.factors           — scored factor strings; null means not yet synced
 * @param {string}        [params.ciStatus]        — 'passing' | 'failing' | 'unknown'
 * @param {string}        [params.releaseStatus]   — 'healthy' | 'stale' | 'none' | 'unknown'
 * @param {string}        [params.contributorStatus] — 'healthy' | 'low_activity' |
 *                                                     'bus_factor_risk' | 'abandoned' | 'unknown'
 * @returns {{
 *   hasMetrics:        boolean,
 *   triggered:         string[],
 *   structuralFactors: string[],
 *   operationalFactors:string[],
 *   notMeasured:       string[],
 *   allClear:          boolean,
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
    if (m === 'CI/CD pipeline status' && ciKnown)          return false;
    if (m === 'Release activity'       && releaseKnown)    return false;
    if (m === 'Contributor activity'   && contributorKnown) return false;
    return true;
  });

  if (!hasMetrics) {
    return {
      hasMetrics:         false,
      triggered:          [],
      structuralFactors:  [],
      operationalFactors: [],
      notMeasured,
      allClear:           false,
    };
  }

  // Start from stored scoreRepo factors (may already include operational strings
  // if scoreRepo was called with CI/release/contributor data). Use a Set to
  // deduplicate before the intelligence-layer additions below.
  const seen     = new Set(Array.isArray(factors) ? factors : []);
  const triggered = Array.isArray(factors) ? factors.slice() : [];

  function _addIfNew(factor) {
    if (!seen.has(factor)) {
      seen.add(factor);
      triggered.push(factor);
    }
  }

  if (ciStatus === 'failing')                   _addIfNew(CI_FAILING_FACTOR);
  if (releaseStatus === 'stale')                _addIfNew(RELEASE_STALE_FACTOR);
  if (releaseStatus === 'none')                 _addIfNew(RELEASE_NONE_FACTOR);
  if (contributorStatus === 'low_activity')     _addIfNew(CONTRIBUTOR_LOW_FACTOR);
  if (contributorStatus === 'bus_factor_risk')  _addIfNew(CONTRIBUTOR_BUS_FACTOR);
  if (contributorStatus === 'abandoned')        _addIfNew(CONTRIBUTOR_NONE_FACTOR);

  const operationalFactors = triggered.filter(f => OPERATIONAL_FACTOR_STRINGS.has(f));
  const structuralFactors  = triggered.filter(f => !OPERATIONAL_FACTOR_STRINGS.has(f));

  return {
    hasMetrics:         true,
    triggered,
    structuralFactors,
    operationalFactors,
    notMeasured,
    allClear:           triggered.length === 0,
  };
}

module.exports = { getRepoRiskFactors, NOT_MEASURED };
