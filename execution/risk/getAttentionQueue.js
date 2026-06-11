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

// Numeric rank for each attention level — used as the primary sort key.
// Higher = more urgent. Keeps critical repos above high above medium etc.,
// even when absolute attention scores happen to be close.
const SEVERITY_RANK = {
  critical: 4,
  high:     3,
  medium:   2,
  low:      1,
  healthy:  0,
};

function _attentionLevel(score) {
  for (var i = 0; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i].min) return LEVEL_THRESHOLDS[i].level;
  }
  return 'healthy';
}

function _severityRank(level) {
  var r = SEVERITY_RANK[level];
  return r != null ? r : 0;
}

// Computes a behavioral sort priority — separate from attentionScore.
// Only behavioral/predictive signals contribute; structural signals (bus factor,
// no releases, no commits, CI unknown) contribute 0. This means that within
// the same severity tier, a repo with active behavioral instability always floats
// above a repo whose attention is driven by structural context alone.
//
// Values are local to this function — they are NOT added to attentionScore and
// are NOT exported.
function _behavioralSortScore(repo) {
  var ci              = repo.ciStatus         || 'unknown';
  var con             = repo.contributorStatus || 'unknown';
  var trajectory      = repo.trajectory       || null;
  var volatilityLevel = repo.volatilityLevel  || null;
  var persistentRisk  = repo.persistentRisk   === true;
  var unresolvedCiRun = repo.unresolvedCiRun  === true;
  var prHealthStatus  = repo.prHealthStatus   || null;
  var escalationLevel = repo.escalationLevel  || null;
  var forecastLevel   = repo.forecastLevel    || null;

  var s = 0;

  // ── Tier 0: confirmed operational failure ─────────────────────────────────────
  if (ci === 'failing')                              s += 100;
  if (con === 'abandoned' && ci === 'failing')       s +=  50;  // corroborated abandonment

  // ── Tier 1: strong trajectory and volatility signals ─────────────────────────
  if (trajectory === 'escalating')                  s +=  40;
  if (trajectory === 'deteriorating')               s +=  35;
  if (volatilityLevel === 'high')                   s +=  30;
  if (persistentRisk)                               s +=  25;
  if (unresolvedCiRun)                              s +=  20;

  // ── Tier 2: PR health, escalation, forecast ───────────────────────────────────
  if (prHealthStatus === 'critical')                s +=  18;
  if (escalationLevel === 'critical')               s +=  15;
  if (forecastLevel === 'critical')                 s +=  12;
  if (prHealthStatus === 'at-risk')                 s +=  12;
  if (trajectory === 'volatile')                    s +=   8;
  if (escalationLevel === 'high')                   s +=   8;
  if (prHealthStatus === 'monitor')                 s +=   6;
  if (forecastLevel === 'high')                     s +=   5;

  // ── Tier 3: dormant (quiet but not confirmed abandoned) ───────────────────────
  if ((con === 'abandoned' && ci !== 'failing') || con === 'dormant') s += 5;

  // Structural signals (bus_factor, no_releases, no_commits, CI_unknown) → 0.
  // They remain as attention reasons but do not boost sort position above behavioral repos.

  return s;
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
  var drivers = [];

  var _add = function(points, text) {
    total += points;
    reasons.push(text);
    drivers.push({ label: text, contribution: points });
  };

  // ── Risk score band alignment (exclusive tiers, highest matching fires) ───────
  if (riskScore !== null && riskScore >= 75) {
    _add(WEIGHTS.RISK_SCORE_CRITICAL, 'Critical risk score (' + riskScore + ')');
  } else if (riskScore !== null && riskScore >= 50) {
    _add(WEIGHTS.RISK_SCORE_AT_RISK, 'Elevated risk score (' + riskScore + ')');
  } else if (riskScore !== null && riskScore >= 30) {
    _add(WEIGHTS.RISK_SCORE_MONITOR, 'Monitored risk score (' + riskScore + ')');
  }

  // ── Behavioral operational signals ───────────────────────────────────────────
  if (ci === 'failing') {
    _add(WEIGHTS.CI_FAILING, 'CI pipeline is failing');
  }
  if (con === 'abandoned') {
    // Only treat as abandoned when CI is actively failing — that fully corroborates
    // the absence of contributors. Passing or unknown CI means the repo is dormant,
    // not confirmed abandoned.
    if (ci === 'failing') {
      _add(WEIGHTS.CONTRIBUTOR_ABANDONED, 'Repository appears abandoned');
    } else {
      _add(WEIGHTS.CONTRIBUTOR_DORMANT, 'Repository appears dormant');
    }
  }
  if (con === 'dormant') {
    _add(WEIGHTS.CONTRIBUTOR_DORMANT, 'Repository appears dormant');
  }

  // ── Activity freshness — no recent commits (precedes structural signals) ──────
  if (noRecentCommits) {
    _add(WEIGHTS.NO_RECENT_COMMITS, 'No recent commits');
  }

  // ── Structural context signals ────────────────────────────────────────────────
  if (con === 'bus_factor_risk') {
    _add(WEIGHTS.CONTRIBUTOR_BUS_FACTOR, 'High bus-factor risk');
  }
  if (rel === 'stale') {
    _add(WEIGHTS.RELEASE_STALE, 'Stale release cadence');
  }
  if (con === 'low_activity') {
    _add(WEIGHTS.CONTRIBUTOR_LOW, 'Low contributor activity');
  }
  if (rel === 'none') {
    _add(WEIGHTS.RELEASE_NONE, 'No releases found');
  }

  // ── Data-gap / low signals ────────────────────────────────────────────────────
  if (ci === 'unknown') {
    _add(WEIGHTS.CI_UNKNOWN, 'CI status unknown');
  }
  if (rel === 'unknown') {
    _add(WEIGHTS.RELEASE_UNKNOWN, 'Release status unknown');
  }
  if (con === 'unknown') {
    _add(WEIGHTS.CONTRIBUTOR_UNKNOWN, 'Contributor status unknown');
  }
  if (riskScore === null) {
    _add(WEIGHTS.NO_METRICS, 'No metrics available yet');
  }

  // ── Forecast-awareness prioritization modifiers ───────────────────────────────
  if (trajectory === 'escalating') {
    _add(WEIGHTS.TRAJ_ESCALATING, 'Escalating operational trajectory');
  }
  if (trajectory === 'deteriorating') {
    _add(WEIGHTS.TRAJ_DETERIORATING, 'Deteriorating operational trajectory');
  }
  if (trajectory === 'volatile') {
    _add(WEIGHTS.TRAJ_VOLATILE, 'Volatile operational trajectory');
  }
  if (forecastLevel === 'critical') {
    _add(WEIGHTS.FORECAST_CRITICAL, 'Critical forecast level');
  }
  if (forecastLevel === 'high') {
    _add(WEIGHTS.FORECAST_HIGH, 'High forecast level');
  }
  if (persistentRisk) {
    _add(WEIGHTS.PERSISTENT_RISK, 'Persistent operational risk');
  }
  if (escalationLevel === 'critical') {
    _add(WEIGHTS.ESC_CRITICAL, 'Escalation level is critical');
  } else if (escalationLevel === 'high') {
    _add(WEIGHTS.ESC_HIGH, 'Escalation level is high');
  }
  if (volatilityLevel === 'high') {
    _add(WEIGHTS.VOLATILITY_HIGH, 'Operational volatility elevated');
  }
  if (unresolvedCiRun) {
    _add(WEIGHTS.CI_UNRESOLVED, 'Repeated unresolved CI instability');
  }

  // ── PR Health operational signals (fires only when prHealthStatus present) ────
  if (prHealthStatus === 'critical') {
    _add(WEIGHTS.PR_HEALTH_CRITICAL, 'PR health critical');
  } else if (prHealthStatus === 'at-risk') {
    _add(WEIGHTS.PR_HEALTH_AT_RISK, 'PR health at-risk');
  } else if (prHealthStatus === 'monitor') {
    _add(WEIGHTS.PR_HEALTH_MONITOR, 'PR health monitored');
  }

  var attentionScore = Math.min(100, total);
  var attentionLevel = _attentionLevel(attentionScore);

  return { attentionScore: attentionScore, attentionLevel: attentionLevel, reasons: reasons, drivers: drivers };
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
 * Sort order (all keys applied in sequence):
 *   1. Severity rank DESC  (critical > high > medium > low > healthy)
 *   2. Behavioral sort score DESC  (behavioral instability beats structural context
 *      within the same severity tier, even when attentionScore is lower)
 *   3. Attention score DESC
 *   4. Raw risk score DESC  (higher underlying score within same attention band)
 *   5. Last-synced DESC  (more recently synced repo floats up)
 *   6. Name ASC, then ID ASC  (stable deterministic final tiebreaker)
 *
 * @param {Array} repos  Array of repo rows as returned by the DB query.
 * @returns {Array<{
 *   repoId:         number,
 *   name:           string,
 *   attentionLevel: 'critical'|'high'|'medium'|'low'|'healthy',
 *   attentionScore: number,
 *   reasons:        string[],
 *   drivers:        Array<{ label: string, contribution: number }>,
 *   trajectory:     string|null,
 * }>}
 */
function getAttentionQueue(repos) {
  if (!Array.isArray(repos)) return [];

  var items = repos.map(function(repo) {
    var scored = _scoreRepo(repo);
    return {
      repoId:           repo.id,
      name:             repo.fullName,
      attentionLevel:   scored.attentionLevel,
      attentionScore:   scored.attentionScore,
      reasons:          scored.reasons,
      drivers:          scored.drivers,
      trajectory:       repo.trajectory || null,
      // Internal sort fields — stripped before returning.
      _syncedAt:        repo.lastSyncedAt,
      _riskScore:       repo.score != null ? Number(repo.score) : -1,
      _severityRank:    _severityRank(scored.attentionLevel),
      _behavioralScore: _behavioralSortScore(repo),
    };
  });

  items.sort(function(a, b) {
    // 1. Severity rank DESC — critical repos always above high above medium etc.
    if (b._severityRank !== a._severityRank) return b._severityRank - a._severityRank;

    // 2. Behavioral sort score DESC — within a severity tier, behavioral instability
    //    outranks structural-only repos even if their attentionScore is higher.
    if (b._behavioralScore !== a._behavioralScore) return b._behavioralScore - a._behavioralScore;

    // 3. Attention score DESC
    if (b.attentionScore !== a.attentionScore) return b.attentionScore - a.attentionScore;

    // 4. Raw risk score DESC — finer discrimination within the same attention band.
    if (b._riskScore !== a._riskScore) return b._riskScore - a._riskScore;

    // 5. Last-synced DESC — more recently observed state floats up.
    var ta = a._syncedAt ? new Date(a._syncedAt).getTime() : 0;
    var tb = b._syncedAt ? new Date(b._syncedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;

    // 6. Name ASC then ID ASC — fully deterministic final tiebreaker.
    var nc = (a.name || '').localeCompare(b.name || '');
    if (nc !== 0) return nc;
    return (a.repoId || 0) - (b.repoId || 0);
  });

  return items.map(function(item) {
    return {
      repoId:         item.repoId,
      name:           item.name,
      attentionLevel: item.attentionLevel,
      attentionScore: item.attentionScore,
      reasons:        item.reasons,
      drivers:        item.drivers,
      trajectory:     item.trajectory,
    };
  });
}

module.exports = { getAttentionQueue, WEIGHTS };
