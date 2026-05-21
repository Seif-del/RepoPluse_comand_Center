'use strict';

// Points awarded per matched signal. Values are additive; total is capped at 100.
//
// Priority tiers:
//
//   behavioralCritical  CI failing, confirmed abandoned
//   behavioralHigh      escalating/deteriorating/volatile trajectory, persistent risk,
//                       engineering volatility, repeated CI instability
//   behavioralMedium    PR health monitor/at-risk/critical, forecast signals, escalation
//   structuralContext   bus factor, no releases, stale releases, low activity, no commits
//   telemetryContext    CI unknown, release unknown, contributor unknown
//
// PRIMARY driver: unified risk score bands (from scoreRepo).
//   RISK_SCORE_CRITICAL (≥75) → 65 pts → attention lands in critical region (≥60)
//   RISK_SCORE_AT_RISK  (≥50) → 45 pts → attention lands in high region (≥40)
//   RISK_SCORE_MONITOR  (≥30) → 20 pts → attention lands in medium region (≥20)
//
// BEHAVIORAL signals: substantially increased so behavioral instability dominates
//   structural context in the attention queue.
//
// STRUCTURAL signals: small weights — captured in unified score.
//   Structural-only concerns cannot alone push attention to high (≥40).
//
// FORECAST / TRAJECTORY modifiers: increased to ensure behavioral trends clearly
//   outrank structural-only repos.
//
// PR HEALTH signals: graceful — only fire when repo.prHealthStatus is present.
const WEIGHTS = {
  // ── Risk score band alignment (unified model — primary severity driver) ───────
  RISK_SCORE_CRITICAL: 65,  // score >= 75 → starts attention in critical region
  RISK_SCORE_AT_RISK:  45,  // score >= 50 → starts attention in high region
  RISK_SCORE_MONITOR:  20,  // score >= 30 → starts attention in medium region

  // ── Behavioral operational signals ───────────────────────────────────────────
  // Increased significantly so behavioral instability dominates structural context.
  CI_FAILING:            40,  // active CI failure — high-urgency operational event
  CONTRIBUTOR_ABANDONED: 40,  // confirmed abandonment (CI failing + no contributors)
  CONTRIBUTOR_DORMANT:   10,  // intentionally quiet repo — lower urgency than abandoned

  // ── Activity freshness ───────────────────────────────────────────────────────
  NO_RECENT_COMMITS:      6,  // visible context signal; well below behavioral weights

  // ── Structural context (very low — captured in unified score) ─────────────────
  CONTRIBUTOR_BUS_FACTOR: 5,  // structural context, not an active failure
  RELEASE_STALE:          3,  // maturity context
  CONTRIBUTOR_LOW:        2,  // maturity context
  RELEASE_NONE:           3,  // maturity context

  // ── Data-gap signals (near-zero — telemetry absence is not an alert) ──────────
  CI_UNKNOWN:             2,  // coverage gap — not an operational event
  RELEASE_UNKNOWN:        2,  // coverage gap — not an operational event
  CONTRIBUTOR_UNKNOWN:    1,  // coverage gap
  NO_METRICS:             4,  // no data at all — needs first sync

  // ── Forecast / trajectory prioritization modifiers ───────────────────────────
  // Increased so behavioral trends clearly outrank structural-only stacks.
  TRAJ_ESCALATING:       30,  // strong behavioral signal — actively worsening
  TRAJ_DETERIORATING:    22,  // notable deterioration trend
  TRAJ_VOLATILE:         10,  // changing direction — behaviorally uncertain
  FORECAST_CRITICAL:     12,  // forecast at critical level
  FORECAST_HIGH:          6,  // forecast at high level
  PERSISTENT_RISK:       25,  // sustained behavioral risk pattern
  ESC_HIGH:               8,  // escalation elevated
  ESC_CRITICAL:          15,  // escalation at critical
  VOLATILITY_HIGH:       22,  // engineering volatility elevated — key behavioral signal
  CI_UNRESOLVED:         12,  // repeated unresolved CI — behavioral instability pattern

  // ── PR Health operational signals (graceful: only fire when fields present) ───
  PR_HEALTH_CRITICAL:    30,  // PR pipeline in critical state — active operational risk
  PR_HEALTH_AT_RISK:     20,  // PR pipeline at-risk — active concern
  PR_HEALTH_MONITOR:     10,  // PR pipeline monitored — worth noting
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

  // Optional PR health field — graceful fallback when absent.
  // Accepted values: 'healthy' | 'monitor' | 'at-risk' | 'critical' | null
  var prHealthStatus = repo.prHealthStatus || null;

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

  // ── Behavioral operational signals ───────────────────────────────────────────
  if (ci === 'failing') {
    total += WEIGHTS.CI_FAILING;
    reasons.push('CI pipeline is failing');
  }
  if (con === 'abandoned') {
    // Only treat as abandoned when CI is actively failing — that fully corroborates
    // the absence of contributors. Passing or unknown CI means the repo is dormant,
    // not confirmed abandoned.
    if (ci === 'failing') {
      total += WEIGHTS.CONTRIBUTOR_ABANDONED;
      reasons.push('Repository appears abandoned');
    } else {
      total += WEIGHTS.CONTRIBUTOR_DORMANT;
      reasons.push('Repository appears dormant');
    }
  }
  if (con === 'dormant') {
    total += WEIGHTS.CONTRIBUTOR_DORMANT;
    reasons.push('Repository appears dormant');
  }

  // ── Activity freshness — no recent commits (precedes structural signals) ──────
  if (noRecentCommits) {
    total += WEIGHTS.NO_RECENT_COMMITS;
    reasons.push('No recent commits');
  }

  // ── Structural context signals ────────────────────────────────────────────────
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

  // ── PR Health operational signals (fires only when prHealthStatus present) ────
  if (prHealthStatus === 'critical') {
    total += WEIGHTS.PR_HEALTH_CRITICAL;
    reasons.push('PR health critical');
  } else if (prHealthStatus === 'at-risk') {
    total += WEIGHTS.PR_HEALTH_AT_RISK;
    reasons.push('PR health at-risk');
  } else if (prHealthStatus === 'monitor') {
    total += WEIGHTS.PR_HEALTH_MONITOR;
    reasons.push('PR health monitored');
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
 * Behavioral signals (CI failing, trajectories, volatility, PR health) substantially
 * outweigh structural context (bus factor, no releases, no commits).
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
