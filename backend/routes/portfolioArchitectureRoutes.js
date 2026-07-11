'use strict';

// Portfolio-wide architecture/structural-intelligence endpoints: forecasting,
// anomaly detection + clustering, telemetry coverage, the aggregate architecture
// view, and architecture-aware watchlists. Split out of portfolioRoutes.js
// (Coupling Refinement #3) — handler bodies moved verbatim, no logic changes.
// Mounted (without its own auth) by the portfolioRoutes.js composition router,
// which applies `authenticate` once for both domain routers.

const express = require('express');
const { detectOperationalAnomalies }            = require('../../execution/risk/detectOperationalAnomalies');
const { clusterOperationalAnomalies }           = require('../../execution/risk/clusterOperationalAnomalies');
const { buildTelemetryCoverageSummary }         = require('../../execution/risk/buildTelemetryCoverageSummary');
const { buildPortfolioArchitectureIntelligence } = require('../../execution/architecture/buildPortfolioArchitectureIntelligence');
const { buildArchitectureTrendTimeline }        = require('../../execution/architecture/buildArchitectureTrendTimeline');
const { detectArchitectureRegressions }         = require('../../execution/architecture/detectArchitectureRegressions');
const { detectCouplingGrowthAlerts }            = require('../../execution/architecture/detectCouplingGrowthAlerts');
const { forecastStructuralDegradation }         = require('../../execution/architecture/forecastStructuralDegradation');
const { buildPortfolioForecastingIntelligence } = require('../../execution/architecture/buildPortfolioForecastingIntelligence');
const { detectArchitectureAnomalies }           = require('../../execution/architecture/detectArchitectureAnomalies');
const { buildArchitectureWatchlists }           = require('../../execution/architecture/buildArchitectureWatchlists');
const { deduplicateTopFindings }                = require('../../execution/architecture/deduplicateTopFindings');
const { deduplicateRecommendations }            = require('../../execution/architecture/deduplicateRecommendations');

const router = express.Router();

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

    if (repoCount > 0 && forecastedRepoCount === 0) {
      return res.json({
        portfolioForecastLevel:    'unknown',
        portfolioForecastScore:    0,
        confidenceLevel:           'low',
        summary:                   'Portfolio forecast unavailable due to insufficient architecture history.',
        forecastDistribution:      { stable: 0, watch: 0, degrading: 0, critical: 0, unknown: repoCount },
        projectedRiskRepos:        [],
        projectedHotspots:         [],
        projectedCouplingPressure: { level: 'low', reposAtRisk: [], acceleratingRepos: [], projectedCircularDependencyRepos: [] },
        projectedGovernanceRisk:   { level: 'low', degradingRepos: [], criticalRepos: [], unstableRepos: [], governanceRiskScore: 0 },
        trendForecast:             { direction: 'stable', averageRisk: 0, highestRisk: 0, lowestRisk: 0, volatility: 0 },
        recommendations:           [],
        benchmarking:              { topStableRepos: [], highestRiskRepos: [], improvingCandidates: [], criticalForecasts: [] },
        repoForecasts,
        _cache: {
          source:               'repo_architecture_snapshots',
          repoCount,
          forecastedRepoCount:  0,
          missingSnapshotCount,
        },
      });
    }

    const portfolioForecast = buildPortfolioForecastingIntelligence({ repoForecasts });

    // Guard: if the entire forecastDistribution is unknown, the portfolio is not forecastable.
    // This prevents buildPortfolioForecastingIntelligence from emitting a false "stable/medium"
    // signal when score=0 maps to 'stable' and n>=5 repos default confidenceLevel to 'medium'.
    const _dist   = portfolioForecast.forecastDistribution || {};
    const _known  = (_dist.stable || 0) + (_dist.watch || 0) + (_dist.degrading || 0) + (_dist.critical || 0);
    const _total  = _known + (_dist.unknown || 0);
    const _pf = (_total > 0 && _known === 0)
      ? Object.assign({}, portfolioForecast, {
          portfolioForecastLevel: 'unknown',
          confidenceLevel:        'low',
          summary:                'Portfolio forecast unavailable due to insufficient architecture history.',
          ...('projectedCouplingPressure' in portfolioForecast && { projectedCouplingPressure: 'unknown' }),
          ...('projectedGovernanceRisk'   in portfolioForecast && { projectedGovernanceRisk:   'unknown' }),
          ...('trendForecast'             in portfolioForecast && { trendForecast:             'unknown' }),
        })
      : portfolioForecast;

    res.json(Object.assign({}, _pf, {
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
        topFindings:                deduplicateTopFindings(Array.isArray(snap.topFindings) ? snap.topFindings : []),
        recommendations:            deduplicateRecommendations(Array.isArray(snap.recommendations) ? snap.recommendations : []),
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
