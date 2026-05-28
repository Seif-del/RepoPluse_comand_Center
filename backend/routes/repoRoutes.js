'use strict';

const express              = require('express');
const authenticate         = require('../middleware/authenticate');
const authorize            = require('../middleware/authorize');
const { decrypt }          = require('../../execution/crypto/encryptToken');
const { syncUserRepos }    = require('../../execution/github/syncUserRepos');
const { parseGithubUrl }     = require('../../execution/github/parseGithubUrl');
const { fetchRepo }          = require('../../execution/github/fetchRepo');
const { getRepoRiskFactors }      = require('../../execution/risk/getRepoRiskFactors');
const { getAttentionQueue }        = require('../../execution/risk/getAttentionQueue');
const { getTrendIndicator }        = require('../../execution/risk/getTrendIndicator');
const { buildOperationalEvents }   = require('../../execution/risk/buildOperationalEvents');
const { getEscalationSignals }     = require('../../execution/risk/getEscalationSignals');
const { getOperationalForecast }   = require('../../execution/risk/getOperationalForecast');
const { getOperationalConfidence }  = require('../../execution/risk/getOperationalConfidence');
const { scorePullRequestHealth }         = require('../../execution/risk/scorePullRequestHealth');
const { detectEngineeringVolatility }    = require('../../execution/risk/detectEngineeringVolatility');
const { scoreRepositoryMaturity }        = require('../../execution/risk/scoreRepositoryMaturity');
const { getRepositoryMaturityTrend }     = require('../../execution/risk/getRepositoryMaturityTrend');
const { fetchRepositoryFiles }               = require('../../execution/github/fetchRepositoryFiles');
const { buildRepositoryArchitectureSnapshot }  = require('../../execution/architecture/buildRepositoryArchitectureSnapshot');
const { buildArchitectureTrendTimeline }        = require('../../execution/architecture/buildArchitectureTrendTimeline');
const { detectArchitectureRegressions }         = require('../../execution/architecture/detectArchitectureRegressions');
const { detectCouplingGrowthAlerts }            = require('../../execution/architecture/detectCouplingGrowthAlerts');
const { forecastStructuralDegradation }         = require('../../execution/architecture/forecastStructuralDegradation');

const router = express.Router();

// All repo routes require a valid session.
router.use(authenticate);

// GET /api/repos
// Returns all active repositories for the logged-in user, each with its latest risk score.
router.get('/', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id,
         r.github_full_name AS "fullName",
         r.is_active        AS "isActive",
         r.linked_at        AS "linkedAt",
         r.last_synced_at   AS "lastSyncedAt",
         rs.score,
         rs.label,
         rs.trend,
         rs.factors,
         rs.snapshot_at     AS "scoredAt",
         rsp.prev_score     AS "prevScore",
         rm.ci_status                  AS "ciStatus",
         rm.latest_release_name        AS "latestReleaseName",
         rm.latest_release_published_at AS "latestReleasePublishedAt",
         rm.release_status             AS "releaseStatus",
         rm.active_contributor_count   AS "activeContributorCount",
         rm.top_contributor_percentage AS "topContributorPercentage",
         rm.contributor_status         AS "contributorStatus"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT score, label, trend, factors, snapshot_at
         FROM risk_scores
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1
       ) rs ON true
       LEFT JOIN LATERAL (
         SELECT score AS prev_score
         FROM risk_scores
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1 OFFSET 1
       ) rsp ON true
       LEFT JOIN LATERAL (
         SELECT ci_status, latest_release_name, latest_release_published_at, release_status,
                active_contributor_count, top_contributor_percentage, contributor_status
         FROM repo_metrics
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1
       ) rm ON true
       WHERE r.user_id = $1 AND r.is_active = true
       ORDER BY rs.score DESC NULLS LAST, r.github_full_name ASC`,
      [req.user.userId]
    );

    const repos = result.rows.map(r => ({
      ...r,
      explanation: getRepoRiskFactors({
        score:             r.score,
        label:             r.label,
        factors:           r.factors,
        ciStatus:          r.ciStatus,
        releaseStatus:     r.releaseStatus,
        contributorStatus: r.contributorStatus,
      }),
      trendIndicator: getTrendIndicator({
        currentScore:  r.score,
        previousScore: r.prevScore,
      }),
    }));

    res.json({ repos });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/metrics
// Returns the latest metrics snapshot for a repository owned by the current user.
router.get('/:id/metrics', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const result = await req.app.locals.db.query(
      `SELECT
         m.commits_7d   AS "commits7d",
         m.open_prs     AS "openPrs",
         m.stale_prs    AS "stalePrs",
         m.open_issues  AS "openIssues",
         m.last_push_at AS "lastPushAt",
         m.snapshot_at  AS "snapshotAt"
       FROM repo_metrics m
       JOIN repositories r ON r.id = m.repo_id
       WHERE m.repo_id = $1 AND r.user_id = $2
       ORDER BY m.snapshot_at DESC
       LIMIT 1`,
      [repoId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Metrics not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/risk
// Returns the two most recent risk scores (current + previous) for trend display.
router.get('/:id/risk', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const result = await req.app.locals.db.query(
      `SELECT
         rs.score,
         rs.label,
         rs.trend,
         rs.factors,
         rs.snapshot_at AS "snapshotAt"
       FROM risk_scores rs
       JOIN repositories r ON r.id = rs.repo_id
       WHERE rs.repo_id = $1 AND r.user_id = $2
       ORDER BY rs.snapshot_at DESC
       LIMIT 2`,
      [repoId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Risk score not found' });
    }

    res.json({ current: result.rows[0], previous: result.rows[1] || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/events
// Returns operational events derived from the two most recent metric and risk-score snapshots.
router.get('/:id/events', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [riskResult, metricsResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT score, label, snapshot_at AS "snapshotAt"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2
         ORDER BY rs.snapshot_at DESC
         LIMIT 2`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT ci_status          AS "ciStatus",
                release_status     AS "releaseStatus",
                contributor_status AS "contributorStatus",
                snapshot_at        AS "snapshotAt"
         FROM repo_metrics m
         JOIN repositories r ON r.id = m.repo_id
         WHERE m.repo_id = $1 AND r.user_id = $2
         ORDER BY m.snapshot_at DESC
         LIMIT 2`,
        [repoId, req.user.userId]
      ),
    ]);

    const currentRiskScore    = riskResult.rows[0]    || null;
    const previousRiskScore   = riskResult.rows[1]    || null;
    const currentMetrics      = metricsResult.rows[0] || null;
    const previousMetrics     = metricsResult.rows[1] || null;

    const trendIndicator = getTrendIndicator({
      currentScore:  currentRiskScore  ? currentRiskScore.score  : null,
      previousScore: previousRiskScore ? previousRiskScore.score : null,
    });

    const events = buildOperationalEvents({
      currentMetrics,
      previousMetrics,
      currentRiskScore,
      previousRiskScore,
      trendIndicator,
    });

    res.json({ events });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/escalation
// Returns operational volatility, escalation level, persistent risk, and
// ordered signals derived from the recent risk and metrics history.
router.get('/:id/escalation', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [riskResult, metricsResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT score, label, snapshot_at AS "snapshotAt"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2
         ORDER BY rs.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT ci_status          AS "ciStatus",
                release_status     AS "releaseStatus",
                contributor_status AS "contributorStatus",
                snapshot_at        AS "snapshotAt"
         FROM repo_metrics m
         JOIN repositories r ON r.id = m.repo_id
         WHERE m.repo_id = $1 AND r.user_id = $2
         ORDER BY m.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    const riskHistory    = riskResult.rows;
    const metricsHistory = metricsResult.rows;

    // Build events from all consecutive snapshot pairs across the history window.
    const events = [];
    const maxIdx = Math.max(riskHistory.length, metricsHistory.length) - 1;
    for (let i = 0; i < maxIdx; i++) {
      const pairEvents = buildOperationalEvents({
        currentRiskScore:  riskHistory[i]      || null,
        previousRiskScore: riskHistory[i + 1]  || null,
        currentMetrics:    metricsHistory[i]   || null,
        previousMetrics:   metricsHistory[i + 1] || null,
      });
      pairEvents.forEach(e => events.push(e));
    }

    const escalation = getEscalationSignals({ riskHistory, metricsHistory, events });

    res.json(escalation);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/forecast
// Returns a deterministic operational forecast derived from the recent risk and metrics history.
router.get('/:id/forecast', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [riskResult, metricsResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT score, label, snapshot_at AS "snapshotAt"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2
         ORDER BY rs.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT ci_status          AS "ciStatus",
                release_status     AS "releaseStatus",
                contributor_status AS "contributorStatus",
                snapshot_at        AS "snapshotAt"
         FROM repo_metrics m
         JOIN repositories r ON r.id = m.repo_id
         WHERE m.repo_id = $1 AND r.user_id = $2
         ORDER BY m.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    const riskHistory    = riskResult.rows;
    const metricsHistory = metricsResult.rows;

    // Build events from all consecutive snapshot pairs across the history window.
    const events = [];
    const maxIdx = Math.max(riskHistory.length, metricsHistory.length) - 1;
    for (let i = 0; i < maxIdx; i++) {
      const pairEvents = buildOperationalEvents({
        currentRiskScore:  riskHistory[i]       || null,
        previousRiskScore: riskHistory[i + 1]   || null,
        currentMetrics:    metricsHistory[i]    || null,
        previousMetrics:   metricsHistory[i + 1] || null,
      });
      pairEvents.forEach(e => events.push(e));
    }

    const escalation = getEscalationSignals({ riskHistory, metricsHistory, events });
    const forecast   = getOperationalForecast({ riskHistory, escalation, events });

    res.json(forecast);
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/confidence
// Returns a deterministic operational confidence assessment derived from the
// repository's persisted risk and metrics history. Confidence reflects evidence
// quality (snapshot depth, telemetry completeness, volatility) — not probability.
router.get('/:id/confidence', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [riskResult, metricsResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT score, label, snapshot_at AS "snapshotAt"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2
         ORDER BY rs.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT ci_status          AS "ciStatus",
                release_status     AS "releaseStatus",
                contributor_status AS "contributorStatus",
                snapshot_at        AS "snapshotAt"
         FROM repo_metrics m
         JOIN repositories r ON r.id = m.repo_id
         WHERE m.repo_id = $1 AND r.user_id = $2
         ORDER BY m.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    const riskHistory    = riskResult.rows;
    const metricsHistory = metricsResult.rows;

    // Build events from all consecutive snapshot pairs across the history window.
    const events = [];
    const maxIdx = Math.max(riskHistory.length, metricsHistory.length) - 1;
    for (let i = 0; i < maxIdx; i++) {
      const pairEvents = buildOperationalEvents({
        currentRiskScore:  riskHistory[i]        || null,
        previousRiskScore: riskHistory[i + 1]    || null,
        currentMetrics:    metricsHistory[i]     || null,
        previousMetrics:   metricsHistory[i + 1] || null,
      });
      pairEvents.forEach(e => events.push(e));
    }

    const escalation  = getEscalationSignals({ riskHistory, metricsHistory, events });
    const currentRepo = metricsHistory[0] || {};

    res.json(getOperationalConfidence({ riskHistory, metricsHistory, escalation, currentRepo }));
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/pr-health
// Returns scored PR operational health for a single repository.
// Loads the latest repo_pr_metrics row scoped to the authenticated user's active repos,
// normalises it, and returns the scorePullRequestHealth result.
// If no telemetry row exists, returns an unknown-status score rather than 404.
router.get('/:id/pr-health', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const result = await req.app.locals.db.query(
      `SELECT
         pm.open_pr_count           AS "openPrCount",
         pm.merged_pr_count_30d     AS "mergedPrCount30d",
         pm.stale_pr_count          AS "stalePrCount",
         pm.avg_merge_latency_hours AS "avgMergeLatencyHours",
         pm.failed_check_pr_count   AS "failedCheckPrCount",
         pm.avg_pr_size             AS "avgPrSize",
         pm.throughput_30d          AS "throughput30d",
         pm.abandoned_pr_count      AS "abandonedPrCount",
         pm.oldest_open_pr_age_days AS "oldestOpenPrAgeDays",
         pm.pr_telemetry_status     AS "prTelemetryStatus"
       FROM repo_pr_metrics pm
       JOIN repositories r ON r.id = pm.repo_id
       WHERE pm.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
       ORDER BY pm.snapshot_at DESC
       LIMIT 1`,
      [repoId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.json(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }));
    }

    const row = result.rows[0];
    const telemetry = {
      openPrCount:          row.openPrCount          != null ? Number(row.openPrCount)             : null,
      mergedPrCount30d:     row.mergedPrCount30d      != null ? Number(row.mergedPrCount30d)         : null,
      stalePrCount:         row.stalePrCount          != null ? Number(row.stalePrCount)             : null,
      avgMergeLatencyHours: row.avgMergeLatencyHours  != null ? parseFloat(row.avgMergeLatencyHours) : null,
      failedCheckPrCount:   row.failedCheckPrCount    != null ? Number(row.failedCheckPrCount)       : null,
      avgPrSize:            row.avgPrSize             != null ? Number(row.avgPrSize)                : null,
      throughput30d:        row.throughput30d          != null ? parseFloat(row.throughput30d)        : null,
      abandonedPrCount:     row.abandonedPrCount      != null ? Number(row.abandonedPrCount)         : null,
      oldestOpenPrAgeDays:  row.oldestOpenPrAgeDays   != null ? parseFloat(row.oldestOpenPrAgeDays)  : null,
      prTelemetryStatus:    row.prTelemetryStatus,
    };

    res.json(scorePullRequestHealth(telemetry));
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/engineering-volatility
// Returns deterministic engineering volatility for a single repository.
// Loads the 10 most recent snapshots from risk_scores, repo_metrics, and
// repo_pr_metrics. PR metrics are mapped through scorePullRequestHealth to
// produce scored label history for the volatility detector.
// No-data (empty history) returns low volatility / low confidence — not a 404.
router.get('/:id/engineering-volatility', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [riskResult, metricsResult, prMetricsResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT rs.score, rs.label
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY rs.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT m.ci_status AS "ciStatus"
         FROM repo_metrics m
         JOIN repositories r ON r.id = m.repo_id
         WHERE m.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY m.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT
           pm.open_pr_count           AS "openPrCount",
           pm.merged_pr_count_30d     AS "mergedPrCount30d",
           pm.stale_pr_count          AS "stalePrCount",
           pm.avg_merge_latency_hours AS "avgMergeLatencyHours",
           pm.failed_check_pr_count   AS "failedCheckPrCount",
           pm.avg_pr_size             AS "avgPrSize",
           pm.throughput_30d          AS "throughput30d",
           pm.abandoned_pr_count      AS "abandonedPrCount",
           pm.oldest_open_pr_age_days AS "oldestOpenPrAgeDays",
           pm.pr_telemetry_status     AS "prTelemetryStatus"
         FROM repo_pr_metrics pm
         JOIN repositories r ON r.id = pm.repo_id
         WHERE pm.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY pm.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    const riskHistory    = riskResult.rows;
    const metricsHistory = metricsResult.rows;

    // Map each repo_pr_metrics row through scorePullRequestHealth to produce
    // { score, label, confidenceLevel } entries for the volatility detector.
    const prHealthHistory = prMetricsResult.rows.map(row => {
      const telemetry = {
        openPrCount:          row.openPrCount          != null ? Number(row.openPrCount)             : null,
        mergedPrCount30d:     row.mergedPrCount30d      != null ? Number(row.mergedPrCount30d)         : null,
        stalePrCount:         row.stalePrCount          != null ? Number(row.stalePrCount)             : null,
        avgMergeLatencyHours: row.avgMergeLatencyHours  != null ? parseFloat(row.avgMergeLatencyHours) : null,
        failedCheckPrCount:   row.failedCheckPrCount    != null ? Number(row.failedCheckPrCount)       : null,
        avgPrSize:            row.avgPrSize             != null ? Number(row.avgPrSize)                : null,
        throughput30d:        row.throughput30d          != null ? parseFloat(row.throughput30d)        : null,
        abandonedPrCount:     row.abandonedPrCount      != null ? Number(row.abandonedPrCount)         : null,
        oldestOpenPrAgeDays:  row.oldestOpenPrAgeDays   != null ? parseFloat(row.oldestOpenPrAgeDays)  : null,
        prTelemetryStatus:    row.prTelemetryStatus,
      };
      return scorePullRequestHealth(telemetry);
    });

    res.json(detectEngineeringVolatility({
      riskHistory,
      metricsHistory,
      prHealthHistory,
      anomalyHistory: [],
    }));
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/maturity
// Returns the engineering maturity score for a single repository.
// Three parallel queries: (1) repositories + latest repo_metrics via LATERAL JOIN,
// which doubles as the repo-existence/ownership/active check; (2) latest
// repo_pr_metrics row for PR workflow telemetry; (3) risk_scores COUNT for
// snapshot depth. All missing telemetry normalises to 'unknown' — no 404 for
// absent metrics. Returns 404 only when the repo is missing, inactive, or not
// owned by the authenticated user.
router.get('/:id/maturity', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [metricsResult, prResult, countResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT
           r.last_synced_at     AS "lastSyncedAt",
           m.ci_status          AS "ciStatus",
           m.commits_7d         AS "commits7d",
           m.last_push_at       AS "lastPushAt",
           m.release_status     AS "releaseStatus",
           m.contributor_status AS "contributorStatus"
         FROM repositories r
         LEFT JOIN LATERAL (
           SELECT ci_status, commits_7d, last_push_at, release_status, contributor_status
           FROM repo_metrics
           WHERE repo_id = r.id
           ORDER BY snapshot_at DESC
           LIMIT 1
         ) m ON true
         WHERE r.id = $1 AND r.user_id = $2 AND r.is_active = true`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT pm.pr_telemetry_status AS "prTelemetryStatus"
         FROM repo_pr_metrics pm
         JOIN repositories r ON r.id = pm.repo_id
         WHERE pm.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY pm.snapshot_at DESC
         LIMIT 1`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT COUNT(rs.id)::int AS "snapshotCount"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2 AND r.is_active = true`,
        [repoId, req.user.userId]
      ),
    ]);

    if (metricsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const m   = metricsResult.rows[0];
    const pr  = prResult.rows[0]   || null;
    const cnt = countResult.rows[0] || {};

    // Derive hasRecentCommit from last_push_at (any push within 30 days → true).
    // last_push_at is the most reliable proxy since has_recent_commit is not a
    // separate DB column.
    let hasRecentCommit = null;
    if (m.lastPushAt != null) {
      const days = (Date.now() - new Date(m.lastPushAt).getTime()) / (1000 * 60 * 60 * 24);
      hasRecentCommit = Number.isFinite(days) ? days < 30 : null;
    }

    const telemetry = {
      ciStatus:                  m.ciStatus         || 'unknown',
      releaseStatus:             m.releaseStatus     || 'unknown',
      contributorStatus:         m.contributorStatus || 'unknown',
      commits7d:                 m.commits7d         != null ? Number(m.commits7d)         : null,
      hasRecentCommit,
      prTelemetryStatus:         pr ? (pr.prTelemetryStatus || 'unknown') : 'unknown',
      dependencyTelemetryStatus: 'unknown',
      lastSyncedAt:              m.lastSyncedAt      || null,
      snapshotCount:             cnt.snapshotCount   != null ? Number(cnt.snapshotCount) : 0,
    };

    res.json(scoreRepositoryMaturity(telemetry));
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/maturity-trend
// Returns maturity trend analytics across the last 10 historical repo_metrics snapshots.
// Three parallel queries:
//   (1) repositories LEFT JOIN repo_metrics — existence/ownership/active check + metrics history,
//       newest-first LIMIT 10. Zero rows → 404. One row with null snapshotAt → no metrics yet.
//   (2) Latest repo_pr_metrics row — v1: single PR telemetry status applied to all snapshots
//       (per-snapshot PR telemetry join is deferred to a future version).
//   (3) risk_scores COUNT — total snapshot depth passed uniformly to each scoreRepositoryMaturity call.
// Each metrics row is scored with scoreRepositoryMaturity; the array of scored snapshots is
// passed to getRepositoryMaturityTrend. Response includes the trend result plus a history array.
router.get('/:id/maturity-trend', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const [historyResult, prResult, countResult] = await Promise.all([
      req.app.locals.db.query(
        `SELECT
           r.last_synced_at         AS "repoSyncedAt",
           m.snapshot_at            AS "snapshotAt",
           m.ci_status              AS "ciStatus",
           m.commits_7d             AS "commits7d",
           m.last_push_at           AS "lastPushAt",
           m.release_status         AS "releaseStatus",
           m.contributor_status     AS "contributorStatus"
         FROM repositories r
         LEFT JOIN repo_metrics m ON m.repo_id = r.id
         WHERE r.id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY m.snapshot_at DESC NULLS LAST
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT pm.pr_telemetry_status AS "prTelemetryStatus"
         FROM repo_pr_metrics pm
         JOIN repositories r ON r.id = pm.repo_id
         WHERE pm.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY pm.snapshot_at DESC
         LIMIT 1`,
        [repoId, req.user.userId]
      ),
      req.app.locals.db.query(
        `SELECT COUNT(rs.id)::int AS "snapshotCount"
         FROM risk_scores rs
         JOIN repositories r ON r.id = rs.repo_id
         WHERE rs.repo_id = $1 AND r.user_id = $2 AND r.is_active = true`,
        [repoId, req.user.userId]
      ),
    ]);

    if (historyResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const pr            = prResult.rows[0]   || null;
    const cnt           = countResult.rows[0] || {};
    const prStatus      = pr ? (pr.prTelemetryStatus || 'unknown') : 'unknown';
    const snapshotCount = cnt.snapshotCount != null ? Number(cnt.snapshotCount) : 0;

    // Repo exists but no metrics yet — return unknown trend with empty history.
    if (historyResult.rows[0].snapshotAt == null) {
      const emptyTrend = getRepositoryMaturityTrend([]);
      return res.json({ ...emptyTrend, history: [] });
    }

    // Build a scored maturity snapshot for each metrics row.
    const snapshots = historyResult.rows.map(function(row) {
      let hasRecentCommit = null;
      if (row.lastPushAt != null) {
        const days = (Date.now() - new Date(row.lastPushAt).getTime()) / (1000 * 60 * 60 * 24);
        hasRecentCommit = Number.isFinite(days) ? days < 30 : null;
      }

      const telemetry = {
        ciStatus:                  row.ciStatus         || 'unknown',
        releaseStatus:             row.releaseStatus     || 'unknown',
        contributorStatus:         row.contributorStatus || 'unknown',
        commits7d:                 row.commits7d         != null ? Number(row.commits7d) : null,
        hasRecentCommit,
        prTelemetryStatus:         prStatus,
        dependencyTelemetryStatus: 'unknown',
        lastSyncedAt:              row.snapshotAt        || null,
        snapshotCount,
      };

      const scored = scoreRepositoryMaturity(telemetry);
      return { ...scored, snapshotAt: row.snapshotAt || null };
    });

    const trendResult = getRepositoryMaturityTrend(snapshots);

    res.json({
      ...trendResult,
      history: snapshots.map(function(s) {
        return {
          snapshotAt:      s.snapshotAt,
          maturityScore:   s.maturityScore,
          maturityLevel:   s.maturityLevel,
          confidenceLevel: s.confidenceLevel,
          dimensions:      s.dimensions,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/:id/architecture/forecast
// Returns a structural degradation forecast derived from persisted architecture snapshots.
// Loads up to 10 recent snapshots, runs the full timeline → regression → coupling → forecast
// pipeline, and returns forecast analytics together with request metadata.
// No live GitHub calls are made — all data comes from repo_architecture_snapshots.
router.get('/:id/architecture/forecast', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const horizonSnapshots = Number(req.query && req.query.horizon) || 3;
    const db = req.app.locals.db;

    const [repoResult, snapshotsResult] = await Promise.all([
      db.query(
        `SELECT id, github_full_name AS "fullName"
         FROM repositories
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [repoId, req.user.userId]
      ),
      db.query(
        `SELECT s.snapshot, s.snapshot_at AS "snapshotAt"
         FROM repo_architecture_snapshots s
         JOIN repositories r ON r.id = s.repo_id
         WHERE s.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY s.snapshot_at DESC
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const repo = repoResult.rows[0];

    // Parse rows safely — JSONB columns are already objects from the pg driver,
    // but filter any rows where the column is null or not a plain object.
    const snapshots = snapshotsResult.rows
      .map(function(r) { return r.snapshot; })
      .filter(function(s) { return s != null && typeof s === 'object'; });

    const snapshotCount = snapshots.length;

    const timelineData      = buildArchitectureTrendTimeline({ snapshots });
    const regressionData    = detectArchitectureRegressions({ timelineData });
    const couplingAlertData = detectCouplingGrowthAlerts({ timelineData });
    const forecast          = forecastStructuralDegradation({
      timelineData,
      regressionData,
      couplingAlertData,
      horizonSnapshots,
    });

    res.json({
      ...forecast,
      timelineData,
      regressionData,
      couplingAlertData,
      _meta: {
        repoId,
        repoName:         repo.fullName,
        snapshotCount,
        source:           'repo_architecture_snapshots',
        horizonSnapshots,
      },
    });
  } catch (err) {
    next(err);
  }
});

const ARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// GET /api/repos/:id/architecture
// Returns a Phase 1 Architecture Intelligence snapshot for a single repository.
// Serves a cached snapshot immediately when one exists and is fresh (< 6 h old).
// Attempts a live GitHub refresh when the cache is stale or absent; on GitHub failure
// with a stale cache, returns the stale snapshot rather than a 502.
// Returns an "unknown" snapshot with _warning when no token is available and no cache exists.
// Returns 502 only when GitHub fails and there is no cached fallback.
router.get('/:id/architecture', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const appConfig = req.app.locals.config;
    const db        = req.app.locals.db;

    // ── Stage 1: verify repo ownership + load latest snapshot (parallel) ─────
    const [repoResult, snapResult] = await Promise.all([
      db.query(
        `SELECT id, github_full_name AS "fullName"
         FROM repositories
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [repoId, req.user.userId]
      ),
      db.query(
        `SELECT s.snapshot, s.snapshot_at AS "snapshotAt"
         FROM repo_architecture_snapshots s
         JOIN repositories r ON r.id = s.repo_id
         WHERE s.repo_id = $1 AND r.user_id = $2 AND r.is_active = true
         ORDER BY s.snapshot_at DESC
         LIMIT 1`,
        [repoId, req.user.userId]
      ),
    ]);

    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const repo        = repoResult.rows[0];
    let defaultBranch = 'main';

    // ── Stage 2: serve fresh cache immediately ────────────────────────────────
    const cachedRow = snapResult.rows[0] || null;
    if (cachedRow) {
      const ageMs = Date.now() - new Date(cachedRow.snapshotAt).getTime();
      if (ageMs < ARCH_CACHE_TTL_MS) {
        return res.json({
          ...cachedRow.snapshot,
          _cache: { hit: true, snapshotAt: cachedRow.snapshotAt, stale: false },
        });
      }
    }

    const isStale = cachedRow !== null;

    function _staleCacheResponse() {
      return {
        ...cachedRow.snapshot,
        _cache: { hit: true, stale: true, warning: 'Using cached architecture snapshot because live refresh failed.' },
      };
    }

    function _unknownSnapshot(warning) {
      const snap = buildRepositoryArchitectureSnapshot({
        repoId,
        repoName:      repo.fullName,
        defaultBranch,
        snapshotAt:    new Date().toISOString(),
        files:         [],
      });
      return Object.assign({}, snap, { _warning: warning });
    }

    // ── Stage 3: load access token ────────────────────────────────────────────
    if (!appConfig.tokenEncryptionKey) {
      if (isStale) return res.json(_staleCacheResponse());
      return res.json(_unknownSnapshot('Token encryption not configured'));
    }

    const tokenResult = await db.query(
      `SELECT access_token_enc FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.userId]
    );

    if (tokenResult.rows.length === 0 || !tokenResult.rows[0].access_token_enc) {
      if (isStale) return res.json(_staleCacheResponse());
      return res.json(_unknownSnapshot('No stored access token — user must re-login'));
    }

    const accessToken = decrypt(
      tokenResult.rows[0].access_token_enc,
      appConfig.tokenEncryptionKey
    );

    const fetchFn = req.app.locals.fetchFn ||
      (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

    if (typeof fetchFn !== 'function') {
      if (isStale) return res.json(_staleCacheResponse());
      return res.json(_unknownSnapshot('No fetch implementation available'));
    }

    // ── Stage 4: fetch repository files from GitHub ───────────────────────────
    let files;
    let fetchDebug;
    try {
      const result = await fetchRepositoryFiles({
        accessToken,
        fullName: repo.fullName,
        fetchFn,
        // branch omitted — fetchRepositoryFiles auto-detects via /repos/{fullName}
      });
      files         = result.files;
      fetchDebug    = result.debug;
      defaultBranch = result.debug.branch;
    } catch (err) {
      if (isStale) return res.json(_staleCacheResponse());
      return res.status(502).json({ error: 'Failed to fetch repository file tree from GitHub' });
    }

    // Tree had eligible files but every content fetch failed — treat as GitHub failure.
    if (files.length === 0 && fetchDebug.eligibleFileCount > 0) {
      if (isStale) return res.json(_staleCacheResponse());
      return res.json(Object.assign(
        {},
        buildRepositoryArchitectureSnapshot({
          repoId,
          repoName:      repo.fullName,
          defaultBranch,
          snapshotAt:    new Date().toISOString(),
          files:         [],
        }),
        {
          _warning: 'Found ' + fetchDebug.eligibleFileCount + ' eligible files in the tree but all' +
            ' content fetches failed — GitHub API may be rate-limited or the token lacks repo scope',
        }
      ));
    }

    // ── Stage 5: run architecture analysis pipeline ───────────────────────────
    const snapshot = buildRepositoryArchitectureSnapshot({
      repoId,
      repoName:      repo.fullName,
      defaultBranch,
      snapshotAt:    new Date().toISOString(),
      files,
    });

    // ── Stage 6: persist snapshot when it contains real files ────────────────
    if (snapshot.metrics && snapshot.metrics.totalFiles > 0) {
      await db.query(
        `INSERT INTO repo_architecture_snapshots (repo_id, snapshot, source)
         VALUES ($1, $2, $3)`,
        [repoId, snapshot, 'github']
      );
    }

    res.json({
      ...snapshot,
      _cache: { hit: false, refreshed: true, stale: false },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/repos/attention
// Returns a priority-sorted attention queue for the logged-in user's repos.
// Forecast fields (trajectory, forecastLevel, escalationLevel, persistentRisk) are
// derived from the latest risk_score label/trend and fed into getAttentionQueue
// so that forecast-aware weights can amplify repos with worsening trajectories.
router.get('/attention', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         r.id,
         r.github_full_name AS "fullName",
         r.last_synced_at   AS "lastSyncedAt",
         rs.score,
         rs.label,
         rs.trend,
         rs.factors,
         rm.ci_status          AS "ciStatus",
         rm.release_status     AS "releaseStatus",
         rm.contributor_status AS "contributorStatus",
         ARRAY(
           SELECT label
           FROM   risk_scores rsi
           WHERE  rsi.repo_id = r.id
           ORDER  BY rsi.snapshot_at DESC
           LIMIT  3
         ) AS "recentLabels"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT score, label, trend, factors
         FROM risk_scores
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1
       ) rs ON true
       LEFT JOIN LATERAL (
         SELECT ci_status, release_status, contributor_status
         FROM repo_metrics
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1
       ) rm ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    const FORECAST_MAP = {
      escalating: 'critical', deteriorating: 'high',
      recovering: 'medium',   stable: 'low', unknown: 'unknown',
    };

    const repos = result.rows.map(function(r) {
      var label        = r.label || '';
      var trend        = r.trend || '';
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

      var escalationLevel = (label === 'critical' && trend === 'worsening') ? 'critical'
                          : trend === 'worsening'                           ? 'high'
                          : 'none';

      var persistentRisk = recentLabels.length >= 3 &&
        recentLabels.slice(0, 3).every(function(l) {
          return l === 'at-risk' || l === 'critical';
        });

      return {
        id:               r.id,
        fullName:         r.fullName,
        lastSyncedAt:     r.lastSyncedAt,
        score:            r.score,
        ciStatus:         r.ciStatus,
        releaseStatus:    r.releaseStatus,
        contributorStatus:r.contributorStatus,
        trajectory:       trajectory,
        forecastLevel:    FORECAST_MAP[trajectory] || 'unknown',
        escalationLevel:  escalationLevel,
        volatilityLevel:  'low',
        persistentRisk:   persistentRisk,
        noRecentCommits:  Array.isArray(r.factors) && r.factors.includes('No commits in the last 7 days'),
      };
    });

    const attention = getAttentionQueue(repos);
    res.json({ attention });
  } catch (err) {
    next(err);
  }
});

// GET /api/summary
// Aggregated health stats across all the user's active repos.
router.get('/summary', async (req, res, next) => {
  try {
    const result = await req.app.locals.db.query(
      `SELECT
         COUNT(r.id)::int                                                  AS "totalRepos",
         COUNT(rs.score) FILTER (WHERE rs.label = 'healthy')::int          AS "healthy",
         COUNT(rs.score) FILTER (WHERE rs.label = 'at-risk')::int          AS "atRisk",
         COUNT(rs.score) FILTER (WHERE rs.label = 'critical')::int         AS "critical",
         ROUND(AVG(rs.score))::int                                         AS "avgScore",
         MAX(r.last_synced_at)                                             AS "lastSyncedAt"
       FROM repositories r
       LEFT JOIN LATERAL (
         SELECT score, label
         FROM risk_scores
         WHERE repo_id = r.id
         ORDER BY snapshot_at DESC
         LIMIT 1
       ) rs ON true
       WHERE r.user_id = $1 AND r.is_active = true`,
      [req.user.userId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    next(err);
  }
});

// POST /api/repos/register
// Manually registers a single GitHub repository for the current user.
// Fetches repo metadata from GitHub (to obtain the stable github_repo_id), then upserts
// into the repositories table. Idempotent: re-registering the same repo is safe.
// Requires repositories:configure capability.
router.post('/register', authorize('repositories:configure'), async (req, res, next) => {
  const appConfig = req.app.locals.config;

  if (!appConfig.tokenEncryptionKey) {
    return res.status(503).json({ ok: false, error: 'Token encryption not configured — set TOKEN_ENCRYPTION_KEY' });
  }

  let parsed;
  try {
    parsed = parseGithubUrl(req.body && req.body.url);
  } catch (err) {
    return res.status(400).json({ ok: false, error: err.message });
  }

  try {
    const tokenResult = await req.app.locals.db.query(
      `SELECT access_token_enc FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.userId]
    );

    if (tokenResult.rows.length === 0 || !tokenResult.rows[0].access_token_enc) {
      return res.status(422).json({ ok: false, error: 'No stored access token — user must re-login' });
    }

    const accessToken = decrypt(
      tokenResult.rows[0].access_token_enc,
      appConfig.tokenEncryptionKey
    );

    const fetchFn = req.app.locals.fetchFn ||
      (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

    if (typeof fetchFn !== 'function') {
      return res.status(503).json({ ok: false, error: 'No fetch implementation available' });
    }

    let repoMeta;
    try {
      repoMeta = await fetchRepo({ accessToken, fullName: parsed.fullName, fetchFn });
    } catch (err) {
      if (err.code === 'REPO_NOT_FOUND') {
        return res.status(404).json({ ok: false, error: `Repository not found on GitHub: ${parsed.fullName}` });
      }
      return res.status(502).json({ ok: false, error: 'Failed to fetch repository from GitHub' });
    }

    const now = new Date();

    const result = await req.app.locals.db.query(
      `INSERT INTO repositories
         (user_id, github_repo_id, github_full_name, is_active, linked_at)
       VALUES ($1, $2, $3, true, $4)
       ON CONFLICT (github_repo_id) DO UPDATE SET
         github_full_name = EXCLUDED.github_full_name,
         is_active        = true
       RETURNING id, github_full_name AS "fullName", linked_at AS "linkedAt"`,
      [req.user.userId, repoMeta.githubRepoId, repoMeta.fullName, now]
    );

    const row = result.rows[0];
    return res.status(201).json({
      ok: true,
      repo: {
        id:       row.id,
        fullName: row.fullName,
        linkedAt: row.linkedAt,
        url:      `https://github.com/${row.fullName}`,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/sync
// Triggers a fresh sync for the logged-in user. Requires repositories:configure capability.
router.post('/sync', authorize('repositories:configure'), async (req, res, next) => {
  const appConfig = req.app.locals.config;

  if (!appConfig.tokenEncryptionKey) {
    return res.status(503).json({ error: 'Token encryption not configured — set TOKEN_ENCRYPTION_KEY' });
  }

  try {
    // Retrieve the encrypted access token for this user
    const tokenResult = await req.app.locals.db.query(
      `SELECT access_token_enc FROM users WHERE id = $1 AND deleted_at IS NULL`,
      [req.user.userId]
    );

    if (tokenResult.rows.length === 0 || !tokenResult.rows[0].access_token_enc) {
      return res.status(422).json({ error: 'No stored access token — user must re-login' });
    }

    const accessToken = decrypt(
      tokenResult.rows[0].access_token_enc,
      appConfig.tokenEncryptionKey
    );

    const fetchFn = req.app.locals.fetchFn ||
      (typeof globalThis.fetch === 'function' ? globalThis.fetch : null);

    if (typeof fetchFn !== 'function') {
      return res.status(503).json({ error: 'No fetch implementation available' });
    }

    const now = new Date();

    // Run sync in the background — respond immediately so the client isn't blocked.
    syncUserRepos({
      db:          req.app.locals.db,
      userId:      req.user.userId,
      accessToken,
      fetchFn,
      now,
    }).catch(() => {});

    res.status(202).json({ queued: true, startedAt: now.toISOString() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
