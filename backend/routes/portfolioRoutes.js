'use strict';

const express                    = require('express');
const authenticate               = require('../middleware/authenticate');
const { getPortfolioForecast }   = require('../../execution/risk/getPortfolioForecast');
const { getAttentionQueue }      = require('../../execution/risk/getAttentionQueue');
const { buildExecutiveSummary }  = require('../../execution/risk/buildExecutiveSummary');
const { buildPortfolioHistory }    = require('../../execution/risk/getPortfolioHistory');
const { getOperationalChanges }      = require('../../execution/risk/getOperationalChanges');
const { detectOperationalAnomalies }  = require('../../execution/risk/detectOperationalAnomalies');
const { clusterOperationalAnomalies } = require('../../execution/risk/clusterOperationalAnomalies');

const router = express.Router();

router.use(authenticate);

// GET /api/portfolio/forecast
// Derives a portfolio-level operational trajectory by querying the latest
// risk score and recent history for every active repo, then aggregating
// via getPortfolioForecast. Returns a deterministic forecast object.
router.get('/forecast', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id       AS "repoId",
         rs.label,
         rs.trend,
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT label, trend
         FROM   risk_scores
         WHERE  repo_id = r.id
         ORDER  BY snapshot_at DESC
         LIMIT  1
       ) rs ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const repos = result.rows.map(function(r) {
      var label        = r.label  || '';
      var trend        = r.trend  || 'unknown';
      var recentLabels = Array.isArray(r.recentLabels) ? r.recentLabels : [];

      // Derive trajectory from the stored label + trend combination.
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
        escalating:    'critical',
        deteriorating: 'high',
        recovering:    'medium',
        stable:        'low',
        unknown:       'unknown',
      };

      var escalationLevel = (label === 'critical' && trend === 'worsening') ? 'critical'
                          : trend === 'worsening'                           ? 'high'
                          : 'none';

      // persistentRisk: true when the 3 most-recent snapshots are all at-risk/critical.
      var persistentRisk = recentLabels.length >= 3 &&
        recentLabels.slice(0, 3).every(function(l) {
          return l === 'at-risk' || l === 'critical';
        });

      return {
        repoId:          r.repoId,
        trajectory:      trajectory,
        forecastLevel:   FORECAST_MAP[trajectory] || 'unknown',
        escalationLevel: escalationLevel,
        volatilityLevel: 'low',
        persistentRisk:  persistentRisk,
      };
    });

    res.json(getPortfolioForecast(repos));
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

module.exports = router;
