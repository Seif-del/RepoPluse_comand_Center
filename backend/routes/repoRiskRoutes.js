'use strict';

// Per-repository operational risk endpoints: risk score history, events,
// escalation, forecast, confidence, PR health, engineering volatility, and
// maturity. Split out of repoRoutes.js (Coupling Refinement #2) — handler
// bodies moved verbatim, no logic changes. Mounted (without its own auth) by
// the repoRoutes.js composition router, which applies `authenticate` once
// for all three domain routers.

const express = require('express');
const { getTrendIndicator }      = require('../../execution/risk/getTrendIndicator');
const { buildOperationalEvents } = require('../../execution/risk/buildOperationalEvents');
const { getEscalationSignals }   = require('../../execution/risk/getEscalationSignals');
const { getOperationalForecast }  = require('../../execution/risk/getOperationalForecast');
const { getOperationalConfidence } = require('../../execution/risk/getOperationalConfidence');
const { scorePullRequestHealth }     = require('../../execution/risk/scorePullRequestHealth');
const { detectEngineeringVolatility } = require('../../execution/risk/detectEngineeringVolatility');
const { scoreRepositoryMaturity }     = require('../../execution/risk/scoreRepositoryMaturity');
const { getRepositoryMaturityTrend }  = require('../../execution/risk/getRepositoryMaturityTrend');

const router = express.Router();

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

module.exports = router;
