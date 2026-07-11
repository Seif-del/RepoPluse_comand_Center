'use strict';

// Core repository collection endpoints: listing, per-repo metrics, portfolio
// summary/attention, registration, and sync. Split out of repoRoutes.js
// (Coupling Refinement #2) — handler bodies moved verbatim, no logic changes.
// Mounted (without its own auth) by the repoRoutes.js composition router,
// which applies `authenticate` once for all three domain routers.

const express              = require('express');
const authorize            = require('../middleware/authorize');
const { decrypt }          = require('../../execution/crypto/encryptToken');
const { syncUserRepos }    = require('../../execution/github/syncUserRepos');
const logger               = require('../../execution/logger');
const { parseGithubUrl }   = require('../../execution/github/parseGithubUrl');
const { fetchRepo }        = require('../../execution/github/fetchRepo');
const { getRepoRiskFactors } = require('../../execution/risk/getRepoRiskFactors');
const { getAttentionQueue }  = require('../../execution/risk/getAttentionQueue');
const { getTrendIndicator }  = require('../../execution/risk/getTrendIndicator');
const { predictChangeRisk }  = require('../../execution/architecture/predictChangeRisk');

const router = express.Router();

// GET /api/repos
// Returns all active repositories for the logged-in user, each with its latest risk score.
router.get('/', async (req, res, next) => {
  try {
    const { riskLevel, search, activeSince, projectStatus } = req.query || {};
    const VALID_RISK_LABELS = new Set(['healthy', 'at-risk', 'critical']);
    if (riskLevel !== undefined && !VALID_RISK_LABELS.has(riskLevel)) {
      return res.status(400).json({ error: 'Invalid riskLevel. Must be healthy, at-risk, or critical.' });
    }
    if (search !== undefined && typeof search !== 'string') {
      return res.status(400).json({ error: 'search must be a string.' });
    }
    const trimmedSearch = typeof search === 'string' ? search.trim() : undefined;
    if (trimmedSearch !== undefined && trimmedSearch.length > 200) {
      return res.status(400).json({ error: 'search must be 200 characters or fewer.' });
    }
    const VALID_ACTIVE_SINCE = new Set(['7d', '30d', '90d', 'stale']);
    if (activeSince !== undefined && activeSince !== '' && !VALID_ACTIVE_SINCE.has(activeSince)) {
      return res.status(400).json({ error: 'Invalid activeSince. Must be 7d, 30d, 90d, or stale.' });
    }
    const VALID_PROJECT_STATUSES = new Set(['active', 'inactive', 'archived', 'unknown']);
    if (projectStatus !== undefined && !VALID_PROJECT_STATUSES.has(projectStatus)) {
      return res.status(400).json({ error: 'Invalid projectStatus. Must be active, inactive, archived, or unknown.' });
    }
    const DAY_MS = 86400000;
    let lowerBound = null;
    let upperBound = null;
    if (activeSince === 'stale') {
      upperBound = new Date(Date.now() - 30 * DAY_MS).toISOString();
    } else if (activeSince === '7d' || activeSince === '30d' || activeSince === '90d') {
      lowerBound = new Date(Date.now() - parseInt(activeSince, 10) * DAY_MS).toISOString();
    }
    const result = await req.app.locals.db.query(
      `SELECT
         r.id,
         r.github_full_name AS "fullName",
         r.is_active        AS "isActive",
         r.linked_at        AS "linkedAt",
         r.last_synced_at   AS "lastSyncedAt",
         r.project_status   AS "projectStatus",
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
         AND ($2::varchar IS NULL OR rs.label = $2)
         AND ($3::varchar IS NULL OR r.github_full_name ILIKE '%' || $3 || '%')
         AND ($4::timestamptz IS NULL OR r.last_synced_at >= $4::timestamptz)
         AND ($5::timestamptz IS NULL OR r.last_synced_at IS NULL OR r.last_synced_at < $5::timestamptz)
         AND ($6::varchar IS NULL OR r.project_status = $6)
       ORDER BY rs.score DESC NULLS LAST, r.github_full_name ASC`,
      [req.user.userId, riskLevel || null, trimmedSearch || null, lowerBound, upperBound, projectStatus || null]
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
         (user_id, github_repo_id, github_full_name, is_active, linked_at, project_status)
       VALUES ($1, $2, $3, true, $4, 'active')
       ON CONFLICT (github_repo_id) DO UPDATE SET
         github_full_name = EXCLUDED.github_full_name,
         is_active        = true,
         project_status   = 'active'
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

// POST /api/repos/:id/change-risk
// Predicts the risk level of a proposed code change for one repository.
// Uses persisted architecture snapshots to build context; no live GitHub calls.
// Scores based on the submitted change object alone when no snapshot is available.
router.post('/:id/change-risk', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

    const db = req.app.locals.db;

    const [repoResult, snapshotResult] = await Promise.all([
      db.query(
        `SELECT id, github_full_name AS "fullName"
         FROM repositories
         WHERE id = $1 AND user_id = $2 AND is_active = true`,
        [repoId, req.user.userId]
      ),
      db.query(
        `SELECT s.snapshot
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

    const repo = repoResult.rows[0];

    const rawSnapshot        = snapshotResult.rows[0] && snapshotResult.rows[0].snapshot;
    const architectureSnapshot = (rawSnapshot != null && typeof rawSnapshot === 'object' && !Array.isArray(rawSnapshot))
      ? rawSnapshot
      : null;
    const hasArchitectureSnapshot = architectureSnapshot !== null;

    const change = (req.body && typeof req.body.change === 'object' && req.body.change !== null)
      ? req.body.change
      : {};

    const changeRisk = predictChangeRisk({
      change,
      repository:          { id: repo.id, fullName: repo.fullName },
      architectureSnapshot: hasArchitectureSnapshot ? architectureSnapshot : undefined,
    });

    res.json({
      ...changeRisk,
      _meta: {
        repoId,
        repoName:             repo.fullName,
        source:               'request_body_and_repo_architecture_snapshot',
        hasArchitectureSnapshot,
        generatedAt:          new Date().toISOString(),
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
    }).catch((err) => {
      logger.error({
        msg:    'sync:background:failed',
        userId: req.user.userId,
        code:   err.code || null,
        error:  err.message,
      });
    });

    res.status(202).json({ queued: true, startedAt: now.toISOString() });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
