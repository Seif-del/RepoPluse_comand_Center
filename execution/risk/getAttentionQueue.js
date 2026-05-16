'use strict';

// Points awarded per matched signal. Values are additive; total is capped at 100.
//
// Calibration principle: active operational instability dominates structural
// maturity concerns. One active signal alone → 'high'. Two → 'critical'.
// Structural concerns (bus-factor, stale releases) can influence 'medium' but
// cannot reach 'high' on their own, preventing false At Risk classifications.
// Data-gap signals are negligible — absent telemetry is not an operational alert.
const WEIGHTS = {
  // ── Active instability signals ──────────────────────────────────────────────
  // One alone → 'high'. Two together → 'critical'.
  CI_FAILING:            50,   // was 40 — primary active signal
  CONTRIBUTOR_ABANDONED: 40,
  RISK_SCORE_HIGH:       40,   // composite risk score >= 70

  // ── Structural concern signals ──────────────────────────────────────────────
  // Reduced so structural signals alone cannot reach 'high' (≥40).
  // Realistic max structural-only combo: ~30 → 'medium' (Monitor).
  CONTRIBUTOR_BUS_FACTOR:  8,   // was 20
  RELEASE_STALE:           8,   // was 20

  // ── Maturity / low-signal structural indicators ────────────────────────────
  RISK_SCORE_MID:         10,   // composite risk score >= 40 and < 70
  RELEASE_NONE:            6,   // was 10
  CONTRIBUTOR_LOW:         4,   // was 10

  // ── Data-gap signals — absence of telemetry is low signal ─────────────────
  // Individually sub-threshold for 'low'; require multiple to surface.
  CI_UNKNOWN:              2,   // was 5
  RELEASE_UNKNOWN:         2,   // was 5
  CONTRIBUTOR_UNKNOWN:     2,   // was 5
  NO_METRICS:              4,   // was 5

  // ── Forecast-awareness signals ─────────────────────────────────────────────
  TRAJ_ESCALATING:    30,   // was 25 — trajectory === 'escalating'
  TRAJ_DETERIORATING: 15,   //          trajectory === 'deteriorating'
  TRAJ_VOLATILE:      10,   //          trajectory === 'volatile'
  FORECAST_CRITICAL:  25,   // was 20 — forecastLevel === 'critical'
  FORECAST_HIGH:      10,   //          forecastLevel === 'high'
  PERSISTENT_RISK:    20,   // was 15 — persistentRisk === true
  ESC_HIGH:           15,   //          escalationLevel === 'high'
  ESC_CRITICAL:       30,   // was 25 — escalationLevel === 'critical'
  VOLATILITY_HIGH:    10,   //          volatilityLevel === 'high'
  CI_UNRESOLVED:      15,   // was 10 — unresolvedCiRun === true
};

// Thresholds evaluated in descending order of severity.
const LEVEL_THRESHOLDS = [
  { min: 60, level: 'critical' },
  { min: 40, level: 'high'     },
  { min: 20, level: 'medium'   },
  { min: 5,  level: 'low'      },
  { min: 0,  level: 'healthy'  },
];

function _attentionLevel(score) {
  for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i].min) return LEVEL_THRESHOLDS[i].level;
  }
  return 'healthy';
}

function _scoreRepo(repo) {
  var riskScore  = repo.score != null ? Number(repo.score) : null;
  var ci         = repo.ciStatus         || 'unknown';
  var rel        = repo.releaseStatus    || 'unknown';
  var con        = repo.contributorStatus || 'unknown';

  // Optional forecast fields — graceful fallback when absent.
  var trajectory      = repo.trajectory      || null;
  var forecastLevel   = repo.forecastLevel   || null;
  var escalationLevel = repo.escalationLevel || null;
  var volatilityLevel = repo.volatilityLevel || null;
  var persistentRisk  = repo.persistentRisk  === true;
  var unresolvedCiRun = repo.unresolvedCiRun === true;

  var total   = 0;
  var reasons = [];

  // ── Blocking signals ───────────────────────────────────────────────────────
  if (ci === 'failing') {
    total += WEIGHTS.CI_FAILING;
    reasons.push('CI pipeline is failing');
  }
  if (con === 'abandoned') {
    total += WEIGHTS.CONTRIBUTOR_ABANDONED;
    reasons.push('Repository appears abandoned');
  }
  if (riskScore !== null && riskScore >= 70) {
    total += WEIGHTS.RISK_SCORE_HIGH;
    reasons.push('High risk score (' + riskScore + ')');
  }

  // ── High-concern signals ───────────────────────────────────────────────────
  if (con === 'bus_factor_risk') {
    total += WEIGHTS.CONTRIBUTOR_BUS_FACTOR;
    reasons.push('High bus-factor risk');
  }
  if (rel === 'stale') {
    total += WEIGHTS.RELEASE_STALE;
    reasons.push('Stale release cadence');
  }

  // ── Medium-concern signals ─────────────────────────────────────────────────
  if (con === 'low_activity') {
    total += WEIGHTS.CONTRIBUTOR_LOW;
    reasons.push('Low contributor activity');
  }
  if (rel === 'none') {
    total += WEIGHTS.RELEASE_NONE;
    reasons.push('No releases found');
  }
  if (riskScore !== null && riskScore >= 40 && riskScore < 70) {
    total += WEIGHTS.RISK_SCORE_MID;
    reasons.push('Elevated risk score (' + riskScore + ')');
  }

  // ── Data-gap / low signals ─────────────────────────────────────────────────
  if (ci === 'unknown') {
    total += WEIGHTS.CI_UNKNOWN;
    reasons.push('CI status unknown');
  }
  if (rel === 'unknown') {
    total += WEIGHTS.RELEASE_UNKNOWN;
    reasons.push('Release status unknown');
  }
  if (con === 'unknown') {
    total += WEIGHTS.CONTRIBUTOR_UNKNOWN;
    reasons.push('Contributor status unknown');
  }
  if (riskScore === null) {
    total += WEIGHTS.NO_METRICS;
    reasons.push('No metrics available yet');
  }

  // ── Forecast-awareness signals ─────────────────────────────────────────────
  if (trajectory === 'escalating') {
    total += WEIGHTS.TRAJ_ESCALATING;
    reasons.push('Escalating operational trajectory');
  }
  if (trajectory === 'deteriorating') {
    total += WEIGHTS.TRAJ_DETERIORATING;
    reasons.push('Deteriorating operational trajectory');
  }
  if (trajectory === 'volatile') {
    total += WEIGHTS.TRAJ_VOLATILE;
    reasons.push('Volatile operational trajectory');
  }
  if (forecastLevel === 'critical') {
    total += WEIGHTS.FORECAST_CRITICAL;
    reasons.push('Critical forecast level');
  }
  if (forecastLevel === 'high') {
    total += WEIGHTS.FORECAST_HIGH;
    reasons.push('High forecast level');
  }
  if (persistentRisk) {
    total += WEIGHTS.PERSISTENT_RISK;
    reasons.push('Persistent operational risk');
  }
  if (escalationLevel === 'critical') {
    total += WEIGHTS.ESC_CRITICAL;
    reasons.push('Escalation level is critical');
  } else if (escalationLevel === 'high') {
    total += WEIGHTS.ESC_HIGH;
    reasons.push('Escalation level is high');
  }
  if (volatilityLevel === 'high') {
    total += WEIGHTS.VOLATILITY_HIGH;
    reasons.push('Operational volatility elevated');
  }
  if (unresolvedCiRun) {
    total += WEIGHTS.CI_UNRESOLVED;
    reasons.push('Repeated unresolved CI instability');
  }

  var attentionScore = Math.min(100, total);
  var attentionLevel = _attentionLevel(attentionScore);

  return { attentionScore: attentionScore, attentionLevel: attentionLevel, reasons: reasons };
}

/**
 * Derives a priority-sorted attention queue from an array of repo objects.
 * Pure function — no I/O.
 *
 * Scoring: points are awarded per matched signal and summed (max 100).
 * Sort: attentionScore DESC → lastSyncedAt DESC → fullName ASC.
 *
 * @param {Array} repos  Array of repo rows as returned by the DB query.
 * @returns {Array<{
 *   repoId:         number,
 *   name:           string,
 *   attentionLevel: 'critical'|'high'|'medium'|'low'|'healthy',
 *   attentionScore: number,
 *   reasons:        string[],
 * }>}
 */
function getAttentionQueue(repos) {
  if (!Array.isArray(repos)) return [];

  var items = repos.map(function(repo) {
    var scored = _scoreRepo(repo);
    return {
      repoId:         repo.id,
      name:           repo.fullName,
      attentionLevel: scored.attentionLevel,
      attentionScore: scored.attentionScore,
      reasons:        scored.reasons,
      trajectory:     repo.trajectory || null,
      _syncedAt:      repo.lastSyncedAt,
    };
  });

  items.sort(function(a, b) {
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;
    var ta = a._syncedAt ? new Date(a._syncedAt).getTime() : 0;
    var tb = b._syncedAt ? new Date(b._syncedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return (a.name || '').localeCompare(b.name || '');
  });

  return items.map(function(item) {
    return {
      repoId:         item.repoId,
      name:           item.name,
      attentionLevel: item.attentionLevel,
      attentionScore: item.attentionScore,
      reasons:        item.reasons,
      trajectory:     item.trajectory,
    };
  });
}

module.exports = { getAttentionQueue, WEIGHTS };
