'use strict';

const express                    = require('express');
const authenticate               = require('../middleware/authenticate');
const { getPortfolioForecast }   = require('../../execution/risk/getPortfolioForecast');
const { getAttentionQueue }      = require('../../execution/risk/getAttentionQueue');
const { buildExecutiveSummary }  = require('../../execution/risk/buildExecutiveSummary');
const { buildPortfolioHistory }    = require('../../execution/risk/getPortfolioHistory');
const { getOperationalChanges }      = require('../../execution/risk/getOperationalChanges');
const { detectOperationalAnomalies }  = require('../../execution/risk/detectOperationalAnomalies');
const { clusterOperationalAnomalies }        = require('../../execution/risk/clusterOperationalAnomalies');
const { buildTelemetryCoverageSummary }      = require('../../execution/risk/buildTelemetryCoverageSummary');
const { buildBehavioralStabilityIndex }      = require('../../execution/risk/buildBehavioralStabilityIndex');
const { scorePullRequestHealth }             = require('../../execution/risk/scorePullRequestHealth');
const { scoreRepositoryMaturity }            = require('../../execution/risk/scoreRepositoryMaturity');
const { buildPortfolioMaturityIndex }        = require('../../execution/risk/buildPortfolioMaturityIndex');
const { buildPortfolioArchitectureIntelligence }   = require('../../execution/architecture/buildPortfolioArchitectureIntelligence');
const { buildArchitectureTrendTimeline }            = require('../../execution/architecture/buildArchitectureTrendTimeline');
const { detectArchitectureRegressions }             = require('../../execution/architecture/detectArchitectureRegressions');
const { detectCouplingGrowthAlerts }                = require('../../execution/architecture/detectCouplingGrowthAlerts');
const { forecastStructuralDegradation }             = require('../../execution/architecture/forecastStructuralDegradation');
const { buildPortfolioForecastingIntelligence }     = require('../../execution/architecture/buildPortfolioForecastingIntelligence');
const { scoreEngineeringGovernance }                = require('../../execution/architecture/scoreEngineeringGovernance');
const { detectArchitectureAnomalies }               = require('../../execution/architecture/detectArchitectureAnomalies');
const { buildArchitectureWatchlists }               = require('../../execution/architecture/buildArchitectureWatchlists');

const router = express.Router();

// ── Governance aggregation helpers ────────────────────────────────────────────

const _REGR_RANK = { unknown: -1, none: 0, low: 1, regression: 2, critical: 3 };
const _COUP_RANK = { unknown: -1, none: 0, low: 1, alert: 2, critical: 3 };

function _worstLevel(levels, RANK) {
  let best = 'none';
  let bestRank = RANK['none'] !== undefined ? RANK['none'] : 0;
  for (const level of levels) {
    const r = RANK[level] !== undefined ? RANK[level] : -1;
    if (r > bestRank) { bestRank = r; best = level; }
  }
  return best;
}

function _aggregateRegressions(perRepoResults) {
  if (!perRepoResults.length) return null;
  return {
    regressionLevel:  _worstLevel(perRepoResults.map(function(r) { return r.regressionLevel; }), _REGR_RANK),
    regressionScore:  Math.max.apply(null, perRepoResults.map(function(r) { return r.regressionScore || 0; })),
    confidenceLevel:  perRepoResults.some(function(r) { return r.confidenceLevel === 'high'; }) ? 'medium' : 'low',
    regressions:      perRepoResults.reduce(function(acc, r) { return acc.concat(Array.isArray(r.regressions) ? r.regressions : []); }, []).slice(0, 10),
  };
}

function _aggregateCouplingAlerts(perRepoResults) {
  if (!perRepoResults.length) return null;
  return {
    alertLevel:          _worstLevel(perRepoResults.map(function(r) { return r.alertLevel; }), _COUP_RANK),
    couplingGrowthScore: Math.max.apply(null, perRepoResults.map(function(r) { return r.couplingGrowthScore || 0; })),
    confidenceLevel:     perRepoResults.some(function(r) { return r.confidenceLevel === 'high'; }) ? 'medium' : 'low',
    alerts:              perRepoResults.reduce(function(acc, r) { return acc.concat(Array.isArray(r.alerts) ? r.alerts : []); }, []).slice(0, 10),
  };
}

router.use(authenticate);

// GET /api/portfolio/forecast
// Returns portfolio-wide structural degradation forecasting intelligence by
// loading the latest 10 repo_architecture_snapshots per active repo, running
// the architecture forecasting pipeline per repo (trendTimeline →
// regressions → couplingAlerts → forecast), then aggregating via
// buildPortfolioForecastingIntelligence. Repos with < 2 snapshots produce
// unknown forecasts. No live GitHub calls — persisted snapshots only.
router.get('/forecast', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'snapshotAt',                 ras2.snapshot_at,
                 'architectureHealthScore',    (ras2.snapshot->>'architectureHealthScore')::numeric,
                 'architectureHealthLevel',    ras2.snapshot->>'architectureHealthLevel',
                 'confidenceLevel',            ras2.snapshot->>'confidenceLevel',
                 'metrics',                    ras2.snapshot->'metrics',
                 'dependencyGraph',            ras2.snapshot->'dependencyGraph',
                 'boundaryVerification',       ras2.snapshot->'boundaryVerification',
                 'apiLinkage',                 ras2.snapshot->'apiLinkage',
                 'implementationCompleteness', ras2.snapshot->'implementationCompleteness'
               ) ORDER BY ras2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT snapshot, snapshot_at
             FROM   repo_architecture_snapshots
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) ras2
         ) AS "snapshotHistory"
       FROM repositories r
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    let missingSnapshotCount = 0;

    const repoForecasts = result.rows.map(function(r) {
      const repoId   = r.repoId;
      const repoName = r.repoName || String(r.repoId);

      let snapshots = r.snapshotHistory;
      try {
        if (typeof snapshots === 'string') snapshots = JSON.parse(snapshots);
      } catch (_) {
        snapshots = [];
      }
      if (!Array.isArray(snapshots)) snapshots = [];

      if (snapshots.length < 2) {
        missingSnapshotCount++;
        return {
          repoId,
          repoName,
          forecastLevel:        'unknown',
          degradationRisk:      0,
          confidenceLevel:      'low',
          trajectory:           { scoreTrend: 'stable', averageScoreDelta: 0, projectedScore: 0, projectedLevel: 'unknown', interventionUrgency: 'none' },
          riskFactors:          [],
          structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' },
          recommendations:      [],
        };
      }

      const trendTimeline = buildArchitectureTrendTimeline({ snapshots });
      detectArchitectureRegressions({ timelineData: trendTimeline });
      detectCouplingGrowthAlerts({ timelineData: trendTimeline });
      const forecast = forecastStructuralDegradation({ snapshots, timelineData: trendTimeline });

      return {
        repoId,
        repoName,
        forecastLevel:        forecast.forecastLevel,
        degradationRisk:      forecast.degradationRisk,
        confidenceLevel:      forecast.confidenceLevel,
        trajectory:           forecast.trajectory           || {},
        riskFactors:          Array.isArray(forecast.riskFactors)     ? forecast.riskFactors     : [],
        structuralProjection: forecast.structuralProjection           || {},
        recommendations:      Array.isArray(forecast.recommendations) ? forecast.recommendations : [],
      };
    });

    const repoCount           = result.rows.length;
    const forecastedRepoCount = repoCount - missingSnapshotCount;

    const portfolioForecast = buildPortfolioForecastingIntelligence({ repoForecasts });

    res.json(Object.assign({}, portfolioForecast, {
      repoForecasts,
      _cache: {
        source:               'repo_architecture_snapshots',
        repoCount,
        forecastedRepoCount,
        missingSnapshotCount,
      },
    }));
  } catch (err) {
    next(err);
  }
});

// ── Shared repo-mapping helper ────────────────────────────────────────────────

function _mapRepoRow(r) {
  var label        = r.label  || '';
  var trend        = r.trend  || 'unknown';
  var recentLabels = Array.isArray(r.recentLabels) ? r.recentLabels : [];

  var trajectory;
  if (!r.label || !r.trend) {
    trajectory = 'unknown';
  } else if (label === 'critical' && trend === 'worsening') {
    trajectory = 'escalating';
  } else if (label === 'at-risk' && trend === 'worsening') {
    trajectory = 'deteriorating';
  } else if (trend === 'improving') {
    trajectory = 'recovering';
  } else {
    trajectory = 'stable';
  }

  var FORECAST_MAP = {
    escalating: 'critical', deteriorating: 'high',
    recovering: 'medium',   stable: 'low', unknown: 'unknown',
  };

  var escalationLevel = (label === 'critical' && trend === 'worsening') ? 'critical'
                      : trend === 'worsening'                           ? 'high'
                      : 'none';

  var persistentRisk = recentLabels.length >= 3 &&
    recentLabels.slice(0, 3).every(function(l) {
      return l === 'at-risk' || l === 'critical';
    });

  return {
    id:               r.repoId,
    repoId:           r.repoId,
    fullName:         r.fullName || null,
    ciStatus:         r.ciStatus          || 'unknown',
    releaseStatus:    r.releaseStatus      || 'unknown',
    contributorStatus:r.contributorStatus  || 'unknown',
    score:            r.score != null ? Number(r.score) : null,
    trajectory:       trajectory,
    forecastLevel:    FORECAST_MAP[trajectory] || 'unknown',
    escalationLevel:  escalationLevel,
    volatilityLevel:  'low',
    persistentRisk:   persistentRisk,
    noRecentCommits:  Array.isArray(r.factors) && r.factors.includes('No commits in the last 7 days'),
  };
}

// GET /api/portfolio/executive-summary
// Loads portfolio forecast + repo intelligence, calls buildExecutiveSummary,
// returns an executive operational briefing object.
router.get('/executive-summary', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id                    AS "repoId",
         r.github_full_name      AS "fullName",
         rm.ci_status            AS "ciStatus",
         rm.release_status       AS "releaseStatus",
         rm.contributor_status   AS "contributorStatus",
         rs.score,
         rs.label,
         rs.trend,
         rs.factors,
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT ci_status, release_status, contributor_status, snapshot_at
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm ON true
       LEFT JOIN LATERAL (
         SELECT score, label, trend, factors
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repos = result.rows.map(_mapRepoRow);

    const portfolioForecast = getPortfolioForecast(repos);

    const attention = getAttentionQueue(repos);
    const attentionMap = {};
    attention.forEach(function(it) { attentionMap[it.repoId] = it; });

    res.json(buildExecutiveSummary({ portfolioForecast, repos, attentionMap }));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/history
// Returns real portfolio operational history derived from persisted risk_score
// snapshots. Rows are grouped into hourly windows, aggregated across all active
// repos for the authenticated user, and ordered newest-first (max 30 windows).
// No interpolation or fabrication — only persisted synced data is used.
router.get('/history', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         DATE_TRUNC('hour', rs.snapshot_at) AS "snapshotAt",
         ROUND(AVG(rs.score))::int          AS "portfolioScore",
         COUNT(DISTINCT rs.repo_id)::int    AS "repoCount"
       FROM risk_scores rs
       JOIN repositories r ON r.id = rs.repo_id
       WHERE r.user_id = $1 AND r.is_active = true
       GROUP BY DATE_TRUNC('hour', rs.snapshot_at)
       ORDER BY "snapshotAt" DESC
       LIMIT 30`,
      [req.user.userId]
    );

    res.json(buildPortfolioHistory(result.rows));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/changes
// Detects meaningful operational changes by comparing each repo's current
// snapshot against its most-recent prior snapshot. Returns a severity-sorted
// feed of up to 50 change events, newest-first. Pure deterministic output —
// all intelligence lives in getOperationalChanges, not in this handler.
router.get('/changes', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id                            AS "repoId",
         r.github_full_name              AS "repoName",
         rs_cur.score                    AS "currentScore",
         rs_cur.label                    AS "currentLabel",
         rs_cur.trend                    AS "currentTrend",
         rs_cur.snapshot_at              AS "snapshotAt",
         rs_prev.score                   AS "previousScore",
         rs_prev.label                   AS "previousLabel",
         rs_prev.trend                   AS "previousTrend",
         rm_cur.ci_status                AS "currentCiStatus",
         rm_cur.contributor_status       AS "currentContributorStatus",
         rm_prev.ci_status               AS "previousCiStatus",
         rm_prev.contributor_status      AS "previousContributorStatus"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT score, label, trend, snapshot_at
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs_cur ON true
       LEFT JOIN LATERAL (
         SELECT score, label, trend
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1 OFFSET 1
       ) rs_prev ON true
       LEFT JOIN LATERAL (
         SELECT ci_status, contributor_status
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm_cur ON true
       LEFT JOIN LATERAL (
         SELECT ci_status, contributor_status
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1 OFFSET 1
       ) rm_prev ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repoPairs = result.rows.map(function(r) {
      return {
        repoId:                    r.repoId,
        repoName:                  r.repoName || String(r.repoId),
        currentScore:              r.currentScore  != null ? Number(r.currentScore)  : null,
        previousScore:             r.previousScore != null ? Number(r.previousScore) : null,
        currentLabel:              r.currentLabel              || null,
        previousLabel:             r.previousLabel             || null,
        currentTrend:              r.currentTrend              || null,
        previousTrend:             r.previousTrend             || null,
        currentCiStatus:           r.currentCiStatus           || null,
        previousCiStatus:          r.previousCiStatus          || null,
        currentContributorStatus:  r.currentContributorStatus  || null,
        previousContributorStatus: r.previousContributorStatus || null,
        snapshotAt:                r.snapshotAt || null,
      };
    });

    res.json(getOperationalChanges(repoPairs));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/anomalies
// Runs deterministic anomaly detection across all active repos using their persisted
// risk/metrics history. Returns up to 50 anomalies, severity-sorted.
// No interpolation — only persisted synced data is used.
router.get('/anomalies', async (req, res, next) => {
  try {
    const repoResult = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'score',      rs2.score,
                 'label',      rs2.label,
                 'trend',      rs2.trend,
                 'snapshotAt', rs2.snapshot_at
               ) ORDER BY rs2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT score, label, trend, snapshot_at
             FROM   risk_scores
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) rs2
         ) AS "riskHistory",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'ciStatus',          rm2.ci_status,
                 'releaseStatus',     rm2.release_status,
                 'contributorStatus', rm2.contributor_status,
                 'snapshotAt',        rm2.snapshot_at
               ) ORDER BY rm2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT ci_status, release_status, contributor_status, snapshot_at
             FROM   repo_metrics
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) rm2
         ) AS "metricsHistory"
       FROM repositories r
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const histResult = await req.app.locals.db.query(
      `SELECT
         DATE_TRUNC('hour', rs.snapshot_at) AS "snapshotAt",
         ROUND(AVG(rs.score))::int          AS "portfolioScore",
         COUNT(DISTINCT rs.repo_id)::int    AS "repoCount"
       FROM risk_scores rs
       JOIN repositories r ON r.id = rs.repo_id
       WHERE r.user_id = $1 AND r.is_active = true
       GROUP BY DATE_TRUNC('hour', rs.snapshot_at)
       ORDER BY "snapshotAt" DESC
       LIMIT 30`,
      [req.user.userId]
    );

    const repos = repoResult.rows.map(function(r) {
      return {
        repoId:         r.repoId,
        repoName:       r.repoName || String(r.repoId),
        riskHistory:    Array.isArray(r.riskHistory)    ? r.riskHistory    : [],
        metricsHistory: Array.isArray(r.metricsHistory) ? r.metricsHistory : [],
      };
    });

    const portfolioHistory = histResult.rows.map(function(h) {
      return {
        snapshotAt:     h.snapshotAt     || null,
        portfolioScore: h.portfolioScore != null ? Number(h.portfolioScore) : null,
        repoCount:      h.repoCount      != null ? Number(h.repoCount)      : 0,
      };
    });

    const anomalies = detectOperationalAnomalies({ repos, portfolioHistory });

    res.json({ anomalies: anomalies.slice(0, 50) });
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/anomaly-clusters
// Clusters detected anomalies into correlated operational groups using union-find.
// Returns up to 20 clusters, severity-sorted. Feeds detectOperationalAnomalies
// output directly into clusterOperationalAnomalies — no additional transformation.
router.get('/anomaly-clusters', async (req, res, next) => {
  try {
    const repoResult = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'score',      rs2.score,
                 'label',      rs2.label,
                 'trend',      rs2.trend,
                 'snapshotAt', rs2.snapshot_at
               ) ORDER BY rs2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT score, label, trend, snapshot_at
             FROM   risk_scores
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) rs2
         ) AS "riskHistory",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'ciStatus',          rm2.ci_status,
                 'releaseStatus',     rm2.release_status,
                 'contributorStatus', rm2.contributor_status,
                 'snapshotAt',        rm2.snapshot_at
               ) ORDER BY rm2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT ci_status, release_status, contributor_status, snapshot_at
             FROM   repo_metrics
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) rm2
         ) AS "metricsHistory"
       FROM repositories r
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const histResult = await req.app.locals.db.query(
      `SELECT
         DATE_TRUNC('hour', rs.snapshot_at) AS "snapshotAt",
         ROUND(AVG(rs.score))::int          AS "portfolioScore",
         COUNT(DISTINCT rs.repo_id)::int    AS "repoCount"
       FROM risk_scores rs
       JOIN repositories r ON r.id = rs.repo_id
       WHERE r.user_id = $1 AND r.is_active = true
       GROUP BY DATE_TRUNC('hour', rs.snapshot_at)
       ORDER BY "snapshotAt" DESC
       LIMIT 30`,
      [req.user.userId]
    );

    const repos = repoResult.rows.map(function(r) {
      return {
        repoId:         r.repoId,
        repoName:       r.repoName || String(r.repoId),
        riskHistory:    Array.isArray(r.riskHistory)    ? r.riskHistory    : [],
        metricsHistory: Array.isArray(r.metricsHistory) ? r.metricsHistory : [],
      };
    });

    const portfolioHistory = histResult.rows.map(function(h) {
      return {
        snapshotAt:     h.snapshotAt     || null,
        portfolioScore: h.portfolioScore != null ? Number(h.portfolioScore) : null,
        repoCount:      h.repoCount      != null ? Number(h.repoCount)      : 0,
      };
    });

    const anomalies = detectOperationalAnomalies({ repos, portfolioHistory });
    const clusters  = clusterOperationalAnomalies(anomalies);

    res.json({ clusters: clusters.slice(0, 20) });
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/telemetry-coverage
// Computes portfolio-level telemetry maturity: what fraction of active repos
// have known CI / release / contributor telemetry, how deep the snapshot history
// is, and how fresh the last sync is. Pure deterministic output — all intelligence
// lives in buildTelemetryCoverageSummary, not in this handler.
router.get('/telemetry-coverage', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id                              AS "repoId",
         rm.ci_status                      AS "ciStatus",
         rm.release_status                 AS "releaseStatus",
         rm.contributor_status             AS "contributorStatus",
         rm.snapshot_at                    AS "lastSyncedAt",
         COALESCE(rs_cnt.count, 0)         AS "snapshotCount"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT ci_status, release_status, contributor_status, snapshot_at
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*)::int AS count
         FROM   risk_scores
         WHERE  repo_id = r.id
       ) rs_cnt ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repos = result.rows.map(function(r) {
      return {
        ciStatus:          r.ciStatus          || 'unknown',
        releaseStatus:     r.releaseStatus      || 'unknown',
        contributorStatus: r.contributorStatus  || 'unknown',
        lastSyncedAt:      r.lastSyncedAt       || null,
        snapshotCount:     r.snapshotCount != null ? Number(r.snapshotCount) : 0,
      };
    });

    res.json(buildTelemetryCoverageSummary(repos));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/behavioral-stability
// Scores behavioral stability across all active repos scoped to the
// authenticated user. Queries the latest repo_metrics, risk_scores, and
// repo_pr_metrics for each repo; maps PR telemetry through
// scorePullRequestHealth; then feeds normalized repo objects to
// buildBehavioralStabilityIndex. Returns the helper output directly.
router.get('/behavioral-stability', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id                              AS "repoId",
         r.github_full_name                AS "fullName",
         rm.ci_status                      AS "ciStatus",
         rm.contributor_status             AS "contributorStatus",
         rs.label,
         rs.trend,
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels",
         rpm.open_pr_count                 AS "openPrCount",
         rpm.merged_pr_count_30d           AS "mergedPrCount30d",
         rpm.stale_pr_count                AS "stalePrCount",
         rpm.avg_merge_latency_hours       AS "avgMergeLatencyHours",
         rpm.failed_check_pr_count         AS "failedCheckPrCount",
         rpm.avg_pr_size                   AS "avgPrSize",
         rpm.throughput_30d                AS "throughput30d",
         rpm.abandoned_pr_count            AS "abandonedPrCount",
         rpm.oldest_open_pr_age_days       AS "oldestOpenPrAgeDays",
         rpm.pr_telemetry_status           AS "prTelemetryStatus"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT ci_status, contributor_status
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm ON true
       LEFT JOIN LATERAL (
         SELECT label, trend
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs ON true
       LEFT JOIN LATERAL (
         SELECT open_pr_count, merged_pr_count_30d, stale_pr_count,
                avg_merge_latency_hours, failed_check_pr_count, avg_pr_size,
                throughput_30d, abandoned_pr_count, oldest_open_pr_age_days,
                pr_telemetry_status
         FROM   repo_pr_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rpm ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    var repos = result.rows.map(function(r) {
      var label        = r.label  || '';
      var trend        = r.trend  || 'unknown';
      var recentLabels = Array.isArray(r.recentLabels) ? r.recentLabels : [];

      var trajectory;
      if (!r.label || !r.trend) {
        trajectory = 'unknown';
      } else if (label === 'critical' && trend === 'worsening') {
        trajectory = 'escalating';
      } else if (label === 'at-risk' && trend === 'worsening') {
        trajectory = 'deteriorating';
      } else if (trend === 'improving') {
        trajectory = 'recovering';
      } else {
        trajectory = 'stable';
      }

      var persistentRisk = recentLabels.length >= 3 &&
        recentLabels.slice(0, 3).every(function(l) {
          return l === 'at-risk' || l === 'critical';
        });

      var prHealth = scorePullRequestHealth({
        openPrCount:          r.openPrCount         != null ? Number(r.openPrCount)         : null,
        mergedPrCount30d:     r.mergedPrCount30d     != null ? Number(r.mergedPrCount30d)    : null,
        stalePrCount:         r.stalePrCount         != null ? Number(r.stalePrCount)        : null,
        avgMergeLatencyHours: r.avgMergeLatencyHours != null ? Number(r.avgMergeLatencyHours): null,
        failedCheckPrCount:   r.failedCheckPrCount   != null ? Number(r.failedCheckPrCount)  : null,
        avgPrSize:            r.avgPrSize            != null ? Number(r.avgPrSize)           : null,
        throughput30d:        r.throughput30d        != null ? Number(r.throughput30d)       : null,
        abandonedPrCount:     r.abandonedPrCount     != null ? Number(r.abandonedPrCount)    : null,
        oldestOpenPrAgeDays:  r.oldestOpenPrAgeDays  != null ? Number(r.oldestOpenPrAgeDays) : null,
        prTelemetryStatus:    r.prTelemetryStatus    || 'unknown',
      });

      return {
        id:                    r.repoId,
        name:                  r.fullName           || String(r.repoId),
        ciStatus:              r.ciStatus           || 'unknown',
        contributorStatus:     r.contributorStatus  || 'unknown',
        trajectory:            trajectory,
        volatilityLevel:       'low',
        persistentRisk:        persistentRisk,
        prHealthStatus:        prHealth.label,
        ci_failing:            r.ciStatus           === 'failing',
        contributor_abandoned: r.contributorStatus  === 'abandoned',
      };
    });

    res.json(buildBehavioralStabilityIndex(repos, {}, []));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/maturity
// Computes a portfolio-wide maturity index by loading the latest repo_metrics,
// repo_pr_metrics, and risk_scores depth for every active repo, scoring each
// with scoreRepositoryMaturity, then aggregating via buildPortfolioMaturityIndex.
//
// SQL strategy — single query with three LEFT JOIN LATERALs:
//   (1) repo_metrics   → latest CI/release/contributor/commit/push telemetry
//   (2) repo_pr_metrics → latest PR telemetry status
//   (3) risk_scores    → total snapshot depth (COUNT) for confidence scoring
//
// v1 simplification: dependencyTelemetryStatus is always 'unknown'.
// PR telemetry uses the single latest row for each repo.
// snapshotCount is total risk_scores count per repo (not per-snapshot cumulative).
router.get('/maturity', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id                            AS "repoId",
         r.github_full_name              AS "fullName",
         r.last_synced_at                AS "lastSyncedAt",
         rm.ci_status                    AS "ciStatus",
         rm.release_status               AS "releaseStatus",
         rm.contributor_status           AS "contributorStatus",
         rm.commits_7d                   AS "commits7d",
         rm.last_push_at                 AS "lastPushAt",
         pm.pr_telemetry_status          AS "prTelemetryStatus",
         COALESCE(rs_cnt."snapshotCount", 0) AS "snapshotCount"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT ci_status, release_status, contributor_status, commits_7d, last_push_at
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm ON true
       LEFT JOIN LATERAL (
         SELECT pr_telemetry_status
         FROM   repo_pr_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) pm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(id)::int AS "snapshotCount"
         FROM   risk_scores
         WHERE  repo_id = r.id
       ) rs_cnt ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repositories = result.rows.map(function(r) {
      let hasRecentCommit = null;
      if (r.lastPushAt != null) {
        const days = (Date.now() - new Date(r.lastPushAt).getTime()) / (1000 * 60 * 60 * 24);
        hasRecentCommit = Number.isFinite(days) ? days < 30 : null;
      }

      const telemetry = {
        ciStatus:                  r.ciStatus         || 'unknown',
        releaseStatus:             r.releaseStatus     || 'unknown',
        contributorStatus:         r.contributorStatus || 'unknown',
        commits7d:                 r.commits7d         != null ? Number(r.commits7d)         : null,
        hasRecentCommit,
        prTelemetryStatus:         r.prTelemetryStatus || 'unknown',
        dependencyTelemetryStatus: 'unknown',
        lastSyncedAt:              r.lastSyncedAt      || null,
        snapshotCount:             r.snapshotCount     != null ? Number(r.snapshotCount)     : 0,
      };

      const scored = scoreRepositoryMaturity(telemetry);

      return {
        id:              r.repoId,
        name:            r.fullName || String(r.repoId),
        maturityScore:   scored.maturityScore,
        maturityLevel:   scored.maturityLevel,
        dimensions:      scored.dimensions,
        gaps:            scored.gaps,
        recommendations: scored.recommendations,
        confidenceLevel: scored.confidenceLevel,
      };
    });

    res.json(buildPortfolioMaturityIndex({ repositories }));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/architecture
// Returns portfolio-wide Architecture Intelligence by aggregating persisted
// repo_architecture_snapshots for all active repos owned by the authenticated user.
// Uses a LEFT JOIN LATERAL so repos without snapshots appear as unknown items —
// no live GitHub traversal ever happens in this route.
router.get('/architecture', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         arch.snapshot,
         arch.snapshot_at   AS "snapshotAt"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT snapshot, snapshot_at
         FROM repo_architecture_snapshots ras
         WHERE ras.repo_id = r.id
         ORDER BY ras.snapshot_at DESC
         LIMIT 1
       ) arch ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    function _unknownArchRepo(repoId, repoName) {
      return {
        repoId,
        repoName,
        architectureHealthScore:    0,
        architectureHealthLevel:    'unknown',
        confidenceLevel:            'low',
        metrics:                    {},
        dependencyGraph:            {},
        apiLinkage:                 {},
        boundaryVerification:       {},
        implementationCompleteness: {},
        topFindings:                [],
        recommendations:            [],
      };
    }

    const repositories = result.rows.map(function(r) {
      const repoId   = r.repoId;
      const repoName = r.repoName || String(r.repoId);

      // Defensively normalise the snapshot value from postgres.
      let snap = r.snapshot;
      try {
        if (typeof snap === 'string') snap = JSON.parse(snap);
      } catch (_) {
        snap = null;
      }

      if (snap === null || snap === undefined || typeof snap !== 'object' || Array.isArray(snap)) {
        return _unknownArchRepo(repoId, repoName);
      }

      return {
        repoId,
        repoName,
        architectureHealthScore:    snap.architectureHealthScore    != null ? snap.architectureHealthScore    : 0,
        architectureHealthLevel:    snap.architectureHealthLevel    || 'unknown',
        confidenceLevel:            snap.confidenceLevel            || 'low',
        metrics:                    snap.metrics                    || {},
        dependencyGraph:            snap.dependencyGraph            || {},
        apiLinkage:                 snap.apiLinkage                 || {},
        boundaryVerification:       snap.boundaryVerification       || {},
        implementationCompleteness: snap.implementationCompleteness || {},
        topFindings:                Array.isArray(snap.topFindings)     ? snap.topFindings     : [],
        recommendations:            Array.isArray(snap.recommendations) ? snap.recommendations : [],
      };
    });

    const repoCount            = result.rows.length;
    const snapshotCount        = result.rows.filter(function(r) { return r.snapshot != null; }).length;
    const missingSnapshotCount = repoCount - snapshotCount;

    const output = buildPortfolioArchitectureIntelligence({ repositories });

    res.json(Object.assign({}, output, {
      _cache: {
        source:               'repo_architecture_snapshots',
        repoCount,
        snapshotCount,
        missingSnapshotCount,
      },
    }));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/governance
// Scores executive-level engineering governance by aggregating five dimensions:
//   architectureGovernance (portfolioArchitecture),
//   maturityGovernance (portfolioMaturity),
//   behavioralGovernance (behavioralStability),
//   predictiveGovernance (portfolioForecast),
//   anomalyGovernance (anomalies + regressions + coupling).
//
// Two SQL queries: (1) latest 10 architecture snapshots per repo, (2) latest
// operational metrics per repo. No live GitHub calls — persisted data only.
// Repos with < 2 snapshots produce unknown forecast/regression/coupling items.
router.get('/governance', async (req, res, next) => {
  try {
    const userId = req.user.userId;

    // ── Query 1: latest 10 architecture snapshots per active repo ─────────────
    const archResult = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'snapshotAt',                 ras2.snapshot_at,
                 'architectureHealthScore',    (ras2.snapshot->>'architectureHealthScore')::numeric,
                 'architectureHealthLevel',    ras2.snapshot->>'architectureHealthLevel',
                 'confidenceLevel',            ras2.snapshot->>'confidenceLevel',
                 'metrics',                    ras2.snapshot->'metrics',
                 'dependencyGraph',            ras2.snapshot->'dependencyGraph',
                 'boundaryVerification',       ras2.snapshot->'boundaryVerification',
                 'apiLinkage',                 ras2.snapshot->'apiLinkage',
                 'implementationCompleteness', ras2.snapshot->'implementationCompleteness'
               ) ORDER BY ras2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT snapshot, snapshot_at
             FROM   repo_architecture_snapshots
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) ras2
         ) AS "snapshotHistory"
       FROM repositories r
       WHERE r.user_id = $1 AND r.is_active = true`,
      [userId]
    );

    // ── Query 2: operational metrics per active repo (maturity + BSI) ─────────
    const metricsResult = await req.app.locals.db.query(
      `SELECT
         r.id                               AS "repoId",
         r.github_full_name                 AS "fullName",
         r.last_synced_at                   AS "lastSyncedAt",
         rm.ci_status                       AS "ciStatus",
         rm.release_status                  AS "releaseStatus",
         rm.contributor_status              AS "contributorStatus",
         rm.commits_7d                      AS "commits7d",
         rm.last_push_at                    AS "lastPushAt",
         rs.label,
         rs.trend,
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels",
         pm.pr_telemetry_status             AS "prTelemetryStatus",
         pm.open_pr_count                   AS "openPrCount",
         pm.merged_pr_count_30d             AS "mergedPrCount30d",
         pm.stale_pr_count                  AS "stalePrCount",
         pm.avg_merge_latency_hours         AS "avgMergeLatencyHours",
         pm.failed_check_pr_count           AS "failedCheckPrCount",
         pm.avg_pr_size                     AS "avgPrSize",
         pm.throughput_30d                  AS "throughput30d",
         pm.abandoned_pr_count              AS "abandonedPrCount",
         pm.oldest_open_pr_age_days         AS "oldestOpenPrAgeDays",
         COALESCE(rs_cnt."snapshotCount", 0)  AS "snapshotCount"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT ci_status, release_status, contributor_status, commits_7d, last_push_at
         FROM   repo_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rm ON true
       LEFT JOIN LATERAL (
         SELECT label, trend
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs ON true
       LEFT JOIN LATERAL (
         SELECT pr_telemetry_status, open_pr_count, merged_pr_count_30d, stale_pr_count,
                avg_merge_latency_hours, failed_check_pr_count, avg_pr_size,
                throughput_30d, abandoned_pr_count, oldest_open_pr_age_days
         FROM   repo_pr_metrics
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) pm ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(id)::int AS "snapshotCount"
         FROM   risk_scores
         WHERE  repo_id = r.id
       ) rs_cnt ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [userId]
    );

    // ── Build architecture + forecast pipeline ────────────────────────────────

    const archRepos            = [];
    const repoForecasts        = [];
    const perRepoRegressions   = [];
    const perRepoCouplingAlerts = [];
    let archSnapshotCount      = 0;
    let archMissingCount       = 0;

    for (const r of archResult.rows) {
      const repoId   = r.repoId;
      const repoName = r.repoName || String(r.repoId);

      let snapshots = r.snapshotHistory;
      try {
        if (typeof snapshots === 'string') snapshots = JSON.parse(snapshots);
      } catch (_) {
        snapshots = [];
      }
      if (!Array.isArray(snapshots)) snapshots = [];

      // Architecture repo object (from most-recent snapshot)
      if (snapshots.length >= 1) {
        archSnapshotCount++;
        const first = snapshots[0];
        archRepos.push({
          repoId,
          repoName,
          architectureHealthScore:    first.architectureHealthScore != null ? Number(first.architectureHealthScore) : 0,
          architectureHealthLevel:    first.architectureHealthLevel || 'unknown',
          confidenceLevel:            first.confidenceLevel         || 'low',
          metrics:                    first.metrics                    || {},
          dependencyGraph:            first.dependencyGraph            || {},
          apiLinkage:                 first.apiLinkage                 || {},
          boundaryVerification:       first.boundaryVerification       || {},
          implementationCompleteness: first.implementationCompleteness || {},
          topFindings:                [],
          recommendations:            [],
        });
      } else {
        archRepos.push({
          repoId, repoName,
          architectureHealthScore: 0, architectureHealthLevel: 'unknown',
          confidenceLevel: 'low', metrics: {}, dependencyGraph: {},
          apiLinkage: {}, boundaryVerification: {}, implementationCompleteness: {},
          topFindings: [], recommendations: [],
        });
      }

      // Forecast pipeline (requires >= 2 snapshots)
      if (snapshots.length < 2) {
        archMissingCount++;
        repoForecasts.push({
          repoId, repoName,
          forecastLevel: 'unknown', degradationRisk: 0, confidenceLevel: 'low',
          trajectory: { scoreTrend: 'stable', averageScoreDelta: 0, projectedScore: 0, projectedLevel: 'unknown', interventionUrgency: 'none' },
          riskFactors: [], structuralProjection: {}, recommendations: [],
        });
      } else {
        const trendTimeline  = buildArchitectureTrendTimeline({ snapshots });
        const regrResult     = detectArchitectureRegressions({ timelineData: trendTimeline });
        const coupResult     = detectCouplingGrowthAlerts({ timelineData: trendTimeline });
        const forecast       = forecastStructuralDegradation({ snapshots, timelineData: trendTimeline });

        perRepoRegressions.push(regrResult);
        perRepoCouplingAlerts.push(coupResult);

        repoForecasts.push({
          repoId,
          repoName,
          forecastLevel:        forecast.forecastLevel,
          degradationRisk:      forecast.degradationRisk,
          confidenceLevel:      forecast.confidenceLevel,
          trajectory:           forecast.trajectory           || {},
          riskFactors:          Array.isArray(forecast.riskFactors)     ? forecast.riskFactors     : [],
          structuralProjection: forecast.structuralProjection           || {},
          recommendations:      Array.isArray(forecast.recommendations) ? forecast.recommendations : [],
        });
      }
    }

    const portfolioArchitecture = buildPortfolioArchitectureIntelligence({ repositories: archRepos });
    const portfolioForecast     = buildPortfolioForecastingIntelligence({ repoForecasts });
    const architectureRegressions = _aggregateRegressions(perRepoRegressions);
    const couplingAlerts          = _aggregateCouplingAlerts(perRepoCouplingAlerts);
    const architectureAnomalies   = detectArchitectureAnomalies({ repoForecasts, portfolioForecast });

    // ── Build maturity + behavioral stability ─────────────────────────────────

    const maturityRepos = metricsResult.rows.map(function(r) {
      let hasRecentCommit = null;
      if (r.lastPushAt != null) {
        const days = (Date.now() - new Date(r.lastPushAt).getTime()) / (1000 * 60 * 60 * 24);
        hasRecentCommit = Number.isFinite(days) ? days < 30 : null;
      }
      const telemetry = {
        ciStatus:                  r.ciStatus         || 'unknown',
        releaseStatus:             r.releaseStatus     || 'unknown',
        contributorStatus:         r.contributorStatus || 'unknown',
        commits7d:                 r.commits7d         != null ? Number(r.commits7d)     : null,
        hasRecentCommit,
        prTelemetryStatus:         r.prTelemetryStatus || 'unknown',
        dependencyTelemetryStatus: 'unknown',
        lastSyncedAt:              r.lastSyncedAt      || null,
        snapshotCount:             r.snapshotCount     != null ? Number(r.snapshotCount) : 0,
      };
      const scored = scoreRepositoryMaturity(telemetry);
      return {
        id:              r.repoId,
        name:            r.fullName || String(r.repoId),
        maturityScore:   scored.maturityScore,
        maturityLevel:   scored.maturityLevel,
        dimensions:      scored.dimensions,
        gaps:            scored.gaps,
        recommendations: scored.recommendations,
        confidenceLevel: scored.confidenceLevel,
      };
    });

    const portfolioMaturity = buildPortfolioMaturityIndex({ repositories: maturityRepos });

    const bsiRepos = metricsResult.rows.map(function(r) {
      const label        = r.label  || '';
      const trend        = r.trend  || 'unknown';
      const recentLabels = Array.isArray(r.recentLabels) ? r.recentLabels : [];

      let trajectory;
      if (!r.label || !r.trend) {
        trajectory = 'unknown';
      } else if (label === 'critical' && trend === 'worsening') {
        trajectory = 'escalating';
      } else if (label === 'at-risk' && trend === 'worsening') {
        trajectory = 'deteriorating';
      } else if (trend === 'improving') {
        trajectory = 'recovering';
      } else {
        trajectory = 'stable';
      }

      const persistentRisk = recentLabels.length >= 3 &&
        recentLabels.slice(0, 3).every(function(l) { return l === 'at-risk' || l === 'critical'; });

      const prHealth = scorePullRequestHealth({
        openPrCount:          r.openPrCount         != null ? Number(r.openPrCount)          : null,
        mergedPrCount30d:     r.mergedPrCount30d     != null ? Number(r.mergedPrCount30d)     : null,
        stalePrCount:         r.stalePrCount         != null ? Number(r.stalePrCount)         : null,
        avgMergeLatencyHours: r.avgMergeLatencyHours != null ? Number(r.avgMergeLatencyHours) : null,
        failedCheckPrCount:   r.failedCheckPrCount   != null ? Number(r.failedCheckPrCount)   : null,
        avgPrSize:            r.avgPrSize            != null ? Number(r.avgPrSize)            : null,
        throughput30d:        r.throughput30d        != null ? Number(r.throughput30d)        : null,
        abandonedPrCount:     r.abandonedPrCount     != null ? Number(r.abandonedPrCount)     : null,
        oldestOpenPrAgeDays:  r.oldestOpenPrAgeDays  != null ? Number(r.oldestOpenPrAgeDays)  : null,
        prTelemetryStatus:    r.prTelemetryStatus    || 'unknown',
      });

      return {
        id:                    r.repoId,
        name:                  r.fullName          || String(r.repoId),
        ciStatus:              r.ciStatus          || 'unknown',
        contributorStatus:     r.contributorStatus || 'unknown',
        trajectory,
        volatilityLevel:       'low',
        persistentRisk,
        prHealthStatus:        prHealth.label,
        ci_failing:            r.ciStatus          === 'failing',
        contributor_abandoned: r.contributorStatus === 'abandoned',
      };
    });

    const behavioralStability = buildBehavioralStabilityIndex(bsiRepos, {}, []);

    // ── Score governance ──────────────────────────────────────────────────────

    const governance = scoreEngineeringGovernance({
      portfolioArchitecture,
      portfolioForecast,
      portfolioMaturity,
      behavioralStability,
      architectureAnomalies,
      architectureRegressions,
      couplingAlerts,
    });

    const repoCount           = archResult.rows.length;
    const forecastedRepoCount = repoCount - archMissingCount;
    const maturityRepoCount   = metricsResult.rows.length;

    res.json(Object.assign({}, governance, {
      _meta: {
        source:                   'persisted_portfolio_signals',
        repoCount,
        architectureSnapshotCount: archSnapshotCount,
        forecastedRepoCount,
        maturityRepoCount,
        generatedAt:              new Date().toISOString(),
      },
    }));
  } catch (err) {
    next(err);
  }
});

// GET /api/portfolio/watchlists
// Builds architecture-aware watchlists by running the full per-repo pipeline
// (trendTimeline → regressions → couplingAlerts → forecast → anomaly) against
// persisted repo_architecture_snapshots. Repos with < 2 snapshots produce
// unknown signals. Per-repo governance is approximated from architectureHealthLevel.
// Calls buildArchitectureWatchlists to produce priority-ranked categories.
// No live GitHub calls — persisted data only.
router.get('/watchlists', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id               AS "repoId",
         r.github_full_name AS "repoName",
         (
           SELECT COALESCE(
             JSON_AGG(
               JSON_BUILD_OBJECT(
                 'snapshotAt',                 ras2.snapshot_at,
                 'architectureHealthScore',    (ras2.snapshot->>'architectureHealthScore')::numeric,
                 'architectureHealthLevel',    ras2.snapshot->>'architectureHealthLevel',
                 'confidenceLevel',            ras2.snapshot->>'confidenceLevel',
                 'metrics',                    ras2.snapshot->'metrics',
                 'dependencyGraph',            ras2.snapshot->'dependencyGraph',
                 'boundaryVerification',       ras2.snapshot->'boundaryVerification',
                 'apiLinkage',                 ras2.snapshot->'apiLinkage',
                 'implementationCompleteness', ras2.snapshot->'implementationCompleteness'
               ) ORDER BY ras2.snapshot_at DESC
             ),
             '[]'::json
           )
           FROM (
             SELECT snapshot, snapshot_at
             FROM   repo_architecture_snapshots
             WHERE  repo_id = r.id
             ORDER  BY snapshot_at DESC
             LIMIT  10
           ) ras2
         ) AS "snapshotHistory"
       FROM repositories r
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const _GOV_LEVEL_MAP = {
      healthy: 'strong', watch: 'watch', weak: 'weak', risky: 'critical', unknown: 'unknown',
    };

    let missingSnapshotCount = 0;
    const repoForecasts  = [];
    const repositories   = [];

    for (const r of result.rows) {
      const repoId   = r.repoId;
      const repoName = r.repoName || String(r.repoId);

      let snapshots = r.snapshotHistory;
      try {
        if (typeof snapshots === 'string') snapshots = JSON.parse(snapshots);
      } catch (_) {
        snapshots = [];
      }
      if (!Array.isArray(snapshots)) snapshots = [];

      if (snapshots.length < 2) {
        missingSnapshotCount++;

        const archHealthScore  = snapshots.length >= 1 && snapshots[0].architectureHealthScore != null
          ? Number(snapshots[0].architectureHealthScore) : 0;
        const archHealthLevel  = snapshots.length >= 1 ? (snapshots[0].architectureHealthLevel || 'unknown') : 'unknown';
        const confLevel        = snapshots.length >= 1 ? (snapshots[0].confidenceLevel || 'low') : 'low';
        const latestSnapshotAt = snapshots.length >= 1 ? (snapshots[0].snapshotAt || null) : null;

        repoForecasts.push({
          repoId, repoName,
          forecastLevel: 'unknown', degradationRisk: 0, confidenceLevel: 'low',
          trajectory: { scoreTrend: 'stable', averageScoreDelta: 0, projectedScore: 0, projectedLevel: 'unknown', interventionUrgency: 'none' },
          riskFactors: [], structuralProjection: {}, recommendations: [],
        });

        repositories.push({
          repoId,
          repoName,
          architectureHealthScore: archHealthScore,
          architectureHealthLevel: archHealthLevel,
          confidenceLevel:         confLevel,
          latestSnapshotAt,
          forecast:      { forecastLevel: 'unknown',   degradationRisk: 0,      confidenceLevel: 'low' },
          regression:    { regressionLevel: 'unknown', regressionScore: 0,      confidenceLevel: 'low' },
          couplingAlert: { alertLevel: 'unknown',      couplingGrowthScore: 0,  confidenceLevel: 'low' },
          anomaly:       { anomalyLevel: 'unknown',    anomalyScore: 0,         confidenceLevel: 'low' },
          governance:    {
            governanceLevel: _GOV_LEVEL_MAP[archHealthLevel] || 'unknown',
            governanceScore: archHealthScore,
            confidenceLevel: confLevel,
          },
        });
      } else {
        const first            = snapshots[0];
        const archHealthScore  = first.architectureHealthScore != null ? Number(first.architectureHealthScore) : 0;
        const archHealthLevel  = first.architectureHealthLevel || 'unknown';
        const confLevel        = first.confidenceLevel || 'low';
        const latestSnapshotAt = first.snapshotAt || null;

        const trendTimeline = buildArchitectureTrendTimeline({ snapshots });
        const regression    = detectArchitectureRegressions({ timelineData: trendTimeline });
        const couplingAlert = detectCouplingGrowthAlerts({ timelineData: trendTimeline });
        const forecast      = forecastStructuralDegradation({ snapshots, timelineData: trendTimeline });
        const anomaly       = detectArchitectureAnomalies({ timelineData: trendTimeline, repoForecasts: [forecast] });

        repoForecasts.push({
          repoId,
          repoName,
          forecastLevel:        forecast.forecastLevel,
          degradationRisk:      forecast.degradationRisk,
          confidenceLevel:      forecast.confidenceLevel,
          trajectory:           forecast.trajectory           || {},
          riskFactors:          Array.isArray(forecast.riskFactors)     ? forecast.riskFactors     : [],
          structuralProjection: forecast.structuralProjection           || {},
          recommendations:      Array.isArray(forecast.recommendations) ? forecast.recommendations : [],
        });

        repositories.push({
          repoId,
          repoName,
          architectureHealthScore: archHealthScore,
          architectureHealthLevel: archHealthLevel,
          confidenceLevel:         confLevel,
          latestSnapshotAt,
          forecast: {
            forecastLevel:   forecast.forecastLevel,
            degradationRisk: forecast.degradationRisk,
            confidenceLevel: forecast.confidenceLevel,
          },
          regression: {
            regressionLevel: regression.regressionLevel,
            regressionScore: regression.regressionScore || 0,
            confidenceLevel: regression.confidenceLevel,
          },
          couplingAlert: {
            alertLevel:          couplingAlert.alertLevel,
            couplingGrowthScore: couplingAlert.couplingGrowthScore || 0,
            confidenceLevel:     couplingAlert.confidenceLevel,
          },
          anomaly: {
            anomalyLevel:    anomaly.anomalyLevel,
            anomalyScore:    anomaly.anomalyScore || 0,
            confidenceLevel: anomaly.confidenceLevel,
          },
          governance: {
            governanceLevel: _GOV_LEVEL_MAP[archHealthLevel] || 'unknown',
            governanceScore: archHealthScore,
            confidenceLevel: confLevel,
          },
        });
      }
    }

    const portfolioForecast    = buildPortfolioForecastingIntelligence({ repoForecasts });
    const watchlists           = buildArchitectureWatchlists({ repositories, portfolioGovernance: null, portfolioForecast });

    const repoCount            = result.rows.length;
    const watchlistedRepoCount = Array.isArray(watchlists.priorityQueue) ? watchlists.priorityQueue.length : 0;

    res.json(Object.assign({}, watchlists, {
      _meta: {
        source:                'repo_architecture_snapshots',
        repoCount,
        watchlistedRepoCount,
        missingSnapshotCount,
        generatedAt:           new Date().toISOString(),
      },
    }));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
