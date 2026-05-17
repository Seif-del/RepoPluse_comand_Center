'use strict';

// Points awarded per matched signal. Values are additive; total is capped at 100.
//
// Unified Operational Risk Model alignment:
//
// PRIMARY driver: unified risk score bands (from scoreRepo).
// Thresholds mirror scoreRepo's LABEL_THRESHOLDS exactly.
//   RISK_SCORE_CRITICAL (≥75) → 65 pts → attention lands in critical region (≥60)
//   RISK_SCORE_AT_RISK  (≥50) → 45 pts → attention lands in high region (≥40)
//   RISK_SCORE_MONITOR  (≥30) → 20 pts → attention lands in medium region (≥20)
//
// FRESHNESS signals: CI/contributor may have degraded since the last sync.
//   Reduced from their former primary-driver weights; unified score reflects them
//   after the next sync. They provide a bounded freshness window.
//
// STRUCTURAL signals: very low weight — now captured in the unified score.
//   Structural-only concern cannot alone push attention to high (≥40).
//
// FORECAST / TRAJECTORY modifiers: prioritization boosts within or across bands.
//   Primary severity comes from the risk score; these promote repos within a tier
//   and can cross a band boundary when paired with a base score signal.
const WEIGHTS = {
  // ── Risk score band alignment (unified model — primary severity driver) ───────
  RISK_SCORE_CRITICAL: 65,  // score >= 75 → starts attention in critical region
  RISK_SCORE_AT_RISK:  45,  // score >= 50 → starts attention in high region
  RISK_SCORE_MONITOR:  20,  // score >= 30 → starts attention in medium region (mirrors scoreRepo monitor threshold)

  // ── Freshness signals (may have changed since last sync) ─────────────────────
  CI_FAILING:            25,  // freshness — CI may have degraded since last sync
  CONTRIBUTOR_ABANDONED: 30,  // freshness — team may have gone dark

  // ── Activity freshness (ordering signal — commits absence is actionable) ─────
  NO_RECENT_COMMITS:       1,

  // ── Structural freshness signals (very reduced — now in unified score) ────────
  CONTRIBUTOR_BUS_FACTOR:  3,
  RELEASE_STALE:           3,
  CONTRIBUTOR_LOW:         2,
  RELEASE_NONE:            2,

  // ── Data-gap signals (near-zero — telemetry absence is not an alert) ─────────
  CI_UNKNOWN:              1,
  RELEASE_UNKNOWN:         1,
  CONTRIBUTOR_UNKNOWN:     1,
  NO_METRICS:              4,

  // ── Forecast / trajectory prioritization modifiers ───────────────────────────
  // Boost within or across attention bands. Paired with a base score signal,
  // these can cross a band boundary (e.g. at-risk + escalating → critical).
  TRAJ_ESCALATING:    15,
  TRAJ_DETERIORATING: 10,
  TRAJ_VOLATILE:       5,
  FORECAST_CRITICAL:  12,
  FORECAST_HIGH:       6,
  PERSISTENT_RISK:    15,
  ESC_HIGH:            5,
  ESC_CRITICAL:       15,
  VOLATILITY_HIGH:     5,
  CI_UNRESOLVED:       8,
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
  var persistentRisk   = repo.persistentRisk   === true;
  var unresolvedCiRun  = repo.unresolvedCiRun  === true;
  var noRecentCommits  = repo.noRecentCommits  === true;

  var total   = 0;
  var reasons = [];

  // ── Risk score band alignment (exclusive tiers, highest matching fires) ───────
  if (riskScore !== null && riskScore >= 75) {
    total += WEIGHTS.RISK_SCORE_CRITICAL;
    reasons.push('Critical risk score (' + riskScore + ')');
  } else if (riskScore !== null && riskScore >= 50) {
    total += WEIGHTS.RISK_SCORE_AT_RISK;
    reasons.push('Elevated risk score (' + riskScore + ')');
  } else if (riskScore !== null && riskScore >= 30) {
    total += WEIGHTS.RISK_SCORE_MONITOR;
    reasons.push('Monitored risk score (' + riskScore + ')');
  }

  // ── Freshness signals ─────────────────────────────────────────────────────────
  if (ci === 'failing') {
    total += WEIGHTS.CI_FAILING;
    reasons.push('CI pipeline is failing');
  }
  if (con === 'abandoned') {
    total += WEIGHTS.CONTRIBUTOR_ABANDONED;
    reasons.push('Repository appears abandoned');
  }

  // ── Activity freshness — no recent commits (precedes structural signals) ──────
  if (noRecentCommits) {
    total += WEIGHTS.NO_RECENT_COMMITS;
    reasons.push('No recent commits');
  }

  // ── Structural freshness signals ──────────────────────────────────────────────
  if (con === 'bus_factor_risk') {
    total += WEIGHTS.CONTRIBUTOR_BUS_FACTOR;
    reasons.push('High bus-factor risk');
  }
  if (rel === 'stale') {
    total += WEIGHTS.RELEASE_STALE;
    reasons.push('Stale release cadence');
  }
  if (con === 'low_activity') {
    total += WEIGHTS.CONTRIBUTOR_LOW;
    reasons.push('Low contributor activity');
  }
  if (rel === 'none') {
    total += WEIGHTS.RELEASE_NONE;
    reasons.push('No releases found');
  }

  // ── Data-gap / low signals ────────────────────────────────────────────────────
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

  // ── Forecast-awareness prioritization modifiers ───────────────────────────────
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
 * The attention score derives primarily from the unified risk score bands
 * (RISK_SCORE_CRITICAL/AT_RISK/MONITOR), ensuring attention mirrors severity.
 * Forecast/trajectory modifiers boost priority within or across bands.
 *
 * Sort: attentionScore DESC → lastSyncedAt DESC → fullName ASC.
 *
 * @param {Array} repos  Array of repo rows as returned by the DB query.
 * @returns {Array<{
 *   repoId:         number,
 *   name:           string,
 *   attentionLevel: 'critical'|'high'|'medium'|'low'|'healthy',
 *   attentionScore: number,
 *   reasons:        string[],
 *   trajectory:     string|null,
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
