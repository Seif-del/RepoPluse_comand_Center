'use strict';

// Portfolio-wide Behavioral Stability Index (BSI).
// Answers: "How stable is engineering behavior across the portfolio right now?"
// Score range 0–100 (higher = more stable). Behavioral signals only — static
// structural gaps (no releases, bus factor, single contributor) are excluded.
//
// Stability levels: unstable 0–49, volatile 50–69, watch 70–84, stable 85–100.
// Returns 'unknown' for an empty portfolio.

// ── Penalty constants ─────────────────────────────────────────────────────────

var PENALTY_ESCALATING        = 20;  // critical behavioral (escalating trajectory)
var PENALTY_CI_FAILING        = 18;  // critical behavioral (CI failing)
var PENALTY_CLUSTER_CRITICAL  = 15;  // critical cluster anomaly
var PENALTY_ABANDONED         = 15;  // contributor_abandoned
var PENALTY_DETERIORATING     = 12;  // high behavioral (deteriorating trajectory)
var PENALTY_VOLATILE_HI       = 10;  // high/critical volatility repo
var PENALTY_PERSISTENT_RISK   = 10;  // persistent operational risk
var PENALTY_PR_RISK_HI        = 8;   // critical or at-risk PR health
var PENALTY_CLUSTER_RECURRING = 5;   // non-critical cluster anomaly
var PENALTY_PR_MONITOR        = 4;   // PR health in monitor range
var PENALTY_VOLATILE_MED      = 4;   // medium volatility repo

var OFFSET_IMPROVING          = 3;   // per recovering/improving repo
var OFFSET_IMPROVING_CAP      = 15;  // max total improvement offset
var PER_REPO_PENALTY_CAP      = 35;  // max penalty from a single repo

// ── Stability thresholds ──────────────────────────────────────────────────────

var STABILITY_THRESHOLDS = [
  { min: 85, level: 'stable'   },
  { min: 70, level: 'watch'    },
  { min: 50, level: 'volatile' },
  { min:  0, level: 'unstable' },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _stabilityLevel(score) {
  for (var i = 0; i < STABILITY_THRESHOLDS.length; i++) {
    if (score >= STABILITY_THRESHOLDS[i].min) return STABILITY_THRESHOLDS[i].level;
  }
  return 'unstable';
}

function _confidenceLevel(totalRepos, usableEvidenceCount) {
  if (totalRepos === 0) return 'low';
  if (totalRepos >= 5 && usableEvidenceCount / totalRepos >= 0.6) return 'high';
  if (totalRepos >= 3) return 'medium';
  return 'low';
}

function _clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function _repoId(repo, index) {
  if (repo == null) return String(index);
  if (repo.repoId != null) return String(repo.repoId);
  if (repo.id     != null) return String(repo.id);
  return String(index);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build the portfolio Behavioral Stability Index.
 *
 * @param {Object[]} repositories          – Array of repo objects (attentionQueue output).
 *   Each repo: { trajectory, volatilityLevel, persistentRisk, prHealthStatus,
 *                ci_failing (bool), contributor_abandoned (bool), repoId|id }
 * @param {Object}   [volatilityByRepo={}] – Map of repoId → detectEngineeringVolatility output.
 *   Used to extract high/critical volatility when repo.volatilityLevel is absent.
 * @param {Object[]} [clusters=[]]         – Array of clusterOperationalAnomalies output clusters.
 *   Each cluster: { severity, anomalyCount, affectedRepos, clusterType, ... }
 *
 * @returns {Object} BSI result:
 *   { indexScore, stabilityLevel, confidenceLevel, summary, drivers, counts }
 */
function buildBehavioralStabilityIndex(repositories, volatilityByRepo, clusters) {
  var repos   = Array.isArray(repositories)   ? repositories   : [];
  var volMap  = (volatilityByRepo && typeof volatilityByRepo === 'object') ? volatilityByRepo : {};
  var clstArr = Array.isArray(clusters)        ? clusters        : [];

  // ── Empty portfolio guard ─────────────────────────────────────────────────
  if (repos.length === 0) {
    return {
      indexScore:     0,
      stabilityLevel: 'unknown',
      confidenceLevel: 'low',
      summary:        'No repositories available for behavioral stability assessment.',
      drivers:        [],
      counts: {
        totalRepos:       0,
        escalatingRepos:  0,
        deterioratingRepos: 0,
        volatileRepos:    0,
        persistentRiskRepos: 0,
        prRiskRepos:      0,
        ciFailingRepos:   0,
        abandonedRepos:   0,
        improvingRepos:   0,
      },
    };
  }

  // ── Per-repo signal extraction ────────────────────────────────────────────

  var escalatingRepos    = 0;
  var deterioratingRepos = 0;
  var volatileRepos      = 0;   // high+critical volatility only
  var medVolatileRepos   = 0;   // medium volatility
  var persistentRiskRepos = 0;
  var prRiskRepos        = 0;   // critical or at-risk PR health
  var prMonitorRepos     = 0;   // monitor PR health
  var ciFailingRepos     = 0;
  var abandonedRepos     = 0;
  var improvingRepos     = 0;
  var usableEvidenceCount = 0;

  // Per-repo raw penalty totals (uncapped) — used for driver impact ordering
  var rawPenalties = {
    escalating_repos:    0,
    ci_failing_repos:    0,
    abandoned_repos:     0,
    deteriorating_repos: 0,
    volatile_repos:      0,
    persistent_risk_repos: 0,
    pr_risk_repos:       0,
    pr_monitor_repos:    0,
    medium_volatile_repos: 0,
  };

  var totalPenalty    = 0;
  var totalRepos      = repos.length;

  for (var i = 0; i < totalRepos; i++) {
    var repo = repos[i];
    if (!repo || typeof repo !== 'object') continue;

    var id   = _repoId(repo, i);
    var traj = repo.trajectory || null;
    var volRecord = volMap[id] || null;

    // Usable evidence: known trajectory OR volatility record present
    if ((traj && traj !== 'unknown') || volRecord) {
      usableEvidenceCount++;
    }

    // Resolve volatility level
    var volLevel = repo.volatilityLevel
      || (volRecord && volRecord.volatilityLevel)
      || null;

    // Resolve PR health
    var prHealth = repo.prHealthStatus || null;

    var repoPenalty = 0;  // accumulate before capping

    // ── Escalating ────────────────────────────────────────────────────────
    if (traj === 'escalating') {
      escalatingRepos++;
      rawPenalties.escalating_repos += PENALTY_ESCALATING;
      repoPenalty += PENALTY_ESCALATING;
    }

    // ── CI failing ────────────────────────────────────────────────────────
    if (repo.ci_failing) {
      ciFailingRepos++;
      rawPenalties.ci_failing_repos += PENALTY_CI_FAILING;
      repoPenalty += PENALTY_CI_FAILING;
    }

    // ── Contributor abandoned ─────────────────────────────────────────────
    if (repo.contributor_abandoned) {
      abandonedRepos++;
      rawPenalties.abandoned_repos += PENALTY_ABANDONED;
      repoPenalty += PENALTY_ABANDONED;
    }

    // ── Deteriorating ─────────────────────────────────────────────────────
    if (traj === 'deteriorating') {
      deterioratingRepos++;
      rawPenalties.deteriorating_repos += PENALTY_DETERIORATING;
      repoPenalty += PENALTY_DETERIORATING;
    }

    // ── Volatility ────────────────────────────────────────────────────────
    if (volLevel === 'high' || volLevel === 'critical') {
      volatileRepos++;
      rawPenalties.volatile_repos += PENALTY_VOLATILE_HI;
      repoPenalty += PENALTY_VOLATILE_HI;
    } else if (volLevel === 'medium') {
      medVolatileRepos++;
      rawPenalties.medium_volatile_repos += PENALTY_VOLATILE_MED;
      repoPenalty += PENALTY_VOLATILE_MED;
    }

    // ── Persistent risk ───────────────────────────────────────────────────
    if (repo.persistentRisk) {
      persistentRiskRepos++;
      rawPenalties.persistent_risk_repos += PENALTY_PERSISTENT_RISK;
      repoPenalty += PENALTY_PERSISTENT_RISK;
    }

    // ── PR health ─────────────────────────────────────────────────────────
    if (prHealth === 'critical' || prHealth === 'at-risk') {
      prRiskRepos++;
      rawPenalties.pr_risk_repos += PENALTY_PR_RISK_HI;
      repoPenalty += PENALTY_PR_RISK_HI;
    } else if (prHealth === 'monitor') {
      prMonitorRepos++;
      rawPenalties.pr_monitor_repos += PENALTY_PR_MONITOR;
      repoPenalty += PENALTY_PR_MONITOR;
    }

    // ── Improving / recovering ────────────────────────────────────────────
    if (traj === 'recovering' || traj === 'improving') {
      improvingRepos++;
      // Improvement offset applied after all penalties are summed
    }

    // Apply per-repo penalty cap
    totalPenalty += _clamp(repoPenalty, 0, PER_REPO_PENALTY_CAP);
  }

  // ── Cluster penalties ─────────────────────────────────────────────────────

  var criticalClusters  = 0;
  var recurringClusters = 0;
  var rawClusterPenalty = { critical_clusters: 0, recurring_clusters: 0 };

  for (var c = 0; c < clstArr.length; c++) {
    var cluster = clstArr[c];
    if (!cluster || typeof cluster !== 'object') continue;
    if (cluster.severity === 'critical') {
      criticalClusters++;
      totalPenalty += PENALTY_CLUSTER_CRITICAL;
      rawClusterPenalty.critical_clusters += PENALTY_CLUSTER_CRITICAL;
    } else {
      recurringClusters++;
      totalPenalty += PENALTY_CLUSTER_RECURRING;
      rawClusterPenalty.recurring_clusters += PENALTY_CLUSTER_RECURRING;
    }
  }

  // ── Improvement offset ────────────────────────────────────────────────────

  var rawImprovingOffset = improvingRepos * OFFSET_IMPROVING;
  var improvingOffset    = Math.min(rawImprovingOffset, OFFSET_IMPROVING_CAP);

  // ── Final score ───────────────────────────────────────────────────────────

  var rawScore    = 100 - totalPenalty + improvingOffset;
  var indexScore  = _clamp(rawScore, 0, 100);
  var stability   = _stabilityLevel(indexScore);
  var confidence  = _confidenceLevel(totalRepos, usableEvidenceCount);

  // ── Driver assembly ───────────────────────────────────────────────────────
  // Sort by absolute raw impact descending; alphabetical signal name as tiebreaker.

  var driverDefs = [
    {
      direction: 'negative',
      signal:    'escalating_repos',
      count:     escalatingRepos,
      rawImpact: rawPenalties.escalating_repos,
      description: escalatingRepos + ' repositor' + (escalatingRepos === 1 ? 'y' : 'ies') + ' on escalating operational trajectory',
    },
    {
      direction: 'negative',
      signal:    'ci_failing_repos',
      count:     ciFailingRepos,
      rawImpact: rawPenalties.ci_failing_repos,
      description: ciFailingRepos + ' repositor' + (ciFailingRepos === 1 ? 'y' : 'ies') + ' with active CI failure',
    },
    {
      direction: 'negative',
      signal:    'critical_clusters',
      count:     criticalClusters,
      rawImpact: rawClusterPenalty.critical_clusters,
      description: criticalClusters + ' critical operational anomaly cluster' + (criticalClusters === 1 ? '' : 's'),
    },
    {
      direction: 'negative',
      signal:    'abandoned_repos',
      count:     abandonedRepos,
      rawImpact: rawPenalties.abandoned_repos,
      description: abandonedRepos + ' repositor' + (abandonedRepos === 1 ? 'y' : 'ies') + ' with abandoned contributor',
    },
    {
      direction: 'negative',
      signal:    'deteriorating_repos',
      count:     deterioratingRepos,
      rawImpact: rawPenalties.deteriorating_repos,
      description: deterioratingRepos + ' repositor' + (deterioratingRepos === 1 ? 'y' : 'ies') + ' on deteriorating trajectory',
    },
    {
      direction: 'negative',
      signal:    'volatile_repos',
      count:     volatileRepos,
      rawImpact: rawPenalties.volatile_repos,
      description: volatileRepos + ' repositor' + (volatileRepos === 1 ? 'y' : 'ies') + ' with high/critical engineering volatility',
    },
    {
      direction: 'negative',
      signal:    'persistent_risk_repos',
      count:     persistentRiskRepos,
      rawImpact: rawPenalties.persistent_risk_repos,
      description: persistentRiskRepos + ' repositor' + (persistentRiskRepos === 1 ? 'y' : 'ies') + ' with persistent operational risk',
    },
    {
      direction: 'negative',
      signal:    'pr_risk_repos',
      count:     prRiskRepos,
      rawImpact: rawPenalties.pr_risk_repos,
      description: prRiskRepos + ' repositor' + (prRiskRepos === 1 ? 'y' : 'ies') + ' with critical or at-risk PR health',
    },
    {
      direction: 'negative',
      signal:    'recurring_clusters',
      count:     recurringClusters,
      rawImpact: rawClusterPenalty.recurring_clusters,
      description: recurringClusters + ' recurring operational anomaly cluster' + (recurringClusters === 1 ? '' : 's'),
    },
    {
      direction: 'negative',
      signal:    'pr_monitor_repos',
      count:     prMonitorRepos,
      rawImpact: rawPenalties.pr_monitor_repos,
      description: prMonitorRepos + ' repositor' + (prMonitorRepos === 1 ? 'y' : 'ies') + ' with PR health under monitoring',
    },
    {
      direction: 'negative',
      signal:    'medium_volatile_repos',
      count:     medVolatileRepos,
      rawImpact: rawPenalties.medium_volatile_repos,
      description: medVolatileRepos + ' repositor' + (medVolatileRepos === 1 ? 'y' : 'ies') + ' with medium engineering volatility',
    },
    {
      direction: 'positive',
      signal:    'improving_repos',
      count:     improvingRepos,
      rawImpact: rawImprovingOffset,
      description: improvingRepos + ' repositor' + (improvingRepos === 1 ? 'y' : 'ies') + ' on recovering/improving trajectory',
    },
  ];

  var drivers = driverDefs
    .filter(function (d) { return d.count > 0; })
    .map(function (d) {
      return {
        direction:   d.direction,
        signal:      d.signal,
        count:       d.count,
        impact:      d.direction === 'negative' ? -d.rawImpact : d.rawImpact,
        description: d.description,
      };
    })
    .sort(function (a, b) {
      var ai = Math.abs(a.impact);
      var bi = Math.abs(b.impact);
      if (bi !== ai) return bi - ai;
      return a.signal < b.signal ? -1 : a.signal > b.signal ? 1 : 0;
    });

  // ── Summary ───────────────────────────────────────────────────────────────

  var summary;
  if (stability === 'stable') {
    summary = 'Portfolio behavioral signals are stable across ' + totalRepos
      + ' repositor' + (totalRepos === 1 ? 'y' : 'ies') + '.';
  } else if (stability === 'watch') {
    summary = 'Behavioral stability requires monitoring across the portfolio ('
      + totalRepos + ' repositor' + (totalRepos === 1 ? 'y' : 'ies') + ').';
  } else if (stability === 'volatile') {
    summary = 'Elevated behavioral instability detected across the portfolio ('
      + totalRepos + ' repositor' + (totalRepos === 1 ? 'y' : 'ies') + ').';
  } else {
    summary = 'Portfolio behavioral instability is critical — immediate attention required ('
      + totalRepos + ' repositor' + (totalRepos === 1 ? 'y' : 'ies') + ').';
  }

  return {
    indexScore:      indexScore,
    stabilityLevel:  stability,
    confidenceLevel: confidence,
    summary:         summary,
    drivers:         drivers,
    counts: {
      totalRepos:          totalRepos,
      escalatingRepos:     escalatingRepos,
      deterioratingRepos:  deterioratingRepos,
      volatileRepos:       volatileRepos,
      persistentRiskRepos: persistentRiskRepos,
      prRiskRepos:         prRiskRepos,
      ciFailingRepos:      ciFailingRepos,
      abandonedRepos:      abandonedRepos,
      improvingRepos:      improvingRepos,
    },
  };
}

module.exports = { buildBehavioralStabilityIndex };
