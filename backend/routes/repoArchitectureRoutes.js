'use strict';

// Per-repository architecture intelligence endpoints: structural degradation
// forecast, remediation recommendations, and the full architecture snapshot
// (cached or live-refreshed from GitHub). Split out of repoRoutes.js
// (Coupling Refinement #2) — handler bodies moved verbatim, no logic changes.
// Mounted (without its own auth) by the repoRoutes.js composition router,
// which applies `authenticate` once for all three domain routers.

const express      = require('express');
const { decrypt }  = require('../../execution/crypto/encryptToken');
const { fetchRepositoryFiles }                = require('../../execution/github/fetchRepositoryFiles');
const { buildRepositoryArchitectureSnapshot }  = require('../../execution/architecture/buildRepositoryArchitectureSnapshot');
const { buildArchitectureTrendTimeline }        = require('../../execution/architecture/buildArchitectureTrendTimeline');
const { detectArchitectureRegressions }         = require('../../execution/architecture/detectArchitectureRegressions');
const { detectCouplingGrowthAlerts }            = require('../../execution/architecture/detectCouplingGrowthAlerts');
const { forecastStructuralDegradation }         = require('../../execution/architecture/forecastStructuralDegradation');
const { detectArchitectureAnomalies }           = require('../../execution/architecture/detectArchitectureAnomalies');
const { buildRemediationRecommendations }       = require('../../execution/architecture/buildRemediationRecommendations');
const { deduplicateTopFindings }       = require('../../execution/architecture/deduplicateTopFindings');
const { deduplicateRecommendations }   = require('../../execution/architecture/deduplicateRecommendations');
const { normalizeRecommendationArray } = require('../../execution/architecture/normalizeRecommendationWording');

// Apply semantic dedup and read-time wording normalization when serving a
// snapshot from the DB. This corrects cached snapshots that were built before
// the dedup or action-oriented-phrasing fixes were deployed.
//
// Order of operations:
//   1. deduplicateTopFindings   — collapse cross-source duplicate findings
//   2. deduplicateRecommendations — collapse cross-source duplicate recs,
//      upgrading to the preferred (linkage-sourced) wording when possible
//   3. normalizeRecommendationArray — convert any surviving pre-rewrite strings
//      to modern action-oriented wording (handles the case where only the old
//      wording is present and dedup's preferred-upgrade never fires)
function _withDedupedFindings(snap) {
  if (!snap) return snap;
  const result = Object.assign({}, snap);
  if (Array.isArray(snap.topFindings) && snap.topFindings.length > 1) {
    result.topFindings = deduplicateTopFindings(snap.topFindings);
  }
  if (Array.isArray(snap.recommendations)) {
    const deduped = snap.recommendations.length > 1
      ? deduplicateRecommendations(snap.recommendations)
      : snap.recommendations.slice();
    result.recommendations = normalizeRecommendationArray(deduped);
  }
  return result;
}

const router = express.Router();

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

const ARCH_HEALTH_TO_GOV_LEVEL = {
  healthy: 'strong',
  watch:   'watch',
  weak:    'weak',
  risky:   'critical',
  unknown: 'unknown',
};

// GET /api/repos/:id/remediation
// Returns deterministic remediation recommendations for one repository.
// Builds a full architecture intelligence pipeline from persisted snapshots — no live GitHub calls.
router.get('/:id/remediation', async (req, res, next) => {
  try {
    const repoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(repoId)) {
      return res.status(400).json({ error: 'Invalid repo id' });
    }

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

    const snapshots = snapshotsResult.rows
      .map(function(r) { return r.snapshot; })
      .filter(function(s) { return s != null && typeof s === 'object'; });

    const snapshotCount      = snapshots.length;
    const architectureSnapshot = snapshots[0] || {};

    const timelineData  = buildArchitectureTrendTimeline({ snapshots });
    const regression    = detectArchitectureRegressions({ timelineData });
    const couplingAlert = detectCouplingGrowthAlerts({ timelineData });
    const forecast      = forecastStructuralDegradation({
      timelineData,
      regressionData:    regression,
      couplingAlertData: couplingAlert,
    });
    const anomaly = detectArchitectureAnomalies({ timelineData });

    const archLevel = typeof architectureSnapshot.architectureHealthLevel === 'string'
      ? architectureSnapshot.architectureHealthLevel
      : 'unknown';

    const governance = {
      governanceScore: typeof architectureSnapshot.architectureHealthScore === 'number'
        ? architectureSnapshot.architectureHealthScore
        : 0,
      governanceLevel: ARCH_HEALTH_TO_GOV_LEVEL[archLevel] || 'unknown',
      confidenceLevel: typeof architectureSnapshot.confidenceLevel === 'string'
        ? architectureSnapshot.confidenceLevel
        : 'low',
      boundaryHealthScore: (architectureSnapshot.boundaryVerification &&
        typeof architectureSnapshot.boundaryVerification.boundaryHealthScore === 'number')
        ? architectureSnapshot.boundaryVerification.boundaryHealthScore
        : undefined,
      completenessScore: (architectureSnapshot.implementationCompleteness &&
        typeof architectureSnapshot.implementationCompleteness.completenessScore === 'number')
        ? architectureSnapshot.implementationCompleteness.completenessScore
        : undefined,
      linkageScore: (architectureSnapshot.apiLinkage &&
        typeof architectureSnapshot.apiLinkage.linkageScore === 'number')
        ? architectureSnapshot.apiLinkage.linkageScore
        : undefined,
    };

    const remediation = buildRemediationRecommendations({
      governance,
      forecast,
      anomaly,
      regression,
      couplingAlert,
      watchlistItem:       null,
      architectureSnapshot,
      versionContext: {
        boundaryCount:      timelineData.versionBoundaryCount || 0,
        suppressedIntervals: timelineData.versionBoundaryCount || 0,
      },
    });

    res.json({
      ...remediation,
      _meta: {
        repoId,
        repoName:    repo.fullName,
        snapshotCount,
        source:      'repo_architecture_snapshots',
        generatedAt: new Date().toISOString(),
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
         LIMIT 10`,
        [repoId, req.user.userId]
      ),
    ]);

    if (repoResult.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const repo        = repoResult.rows[0];
    let defaultBranch = 'main';

    // ── Stage 2: serve fresh cache immediately ────────────────────────────────
    // rows[0] is always the most recent snapshot (ORDER BY DESC); remaining rows
    // form the history window used for cumulative disconnected-API detection.
    const cachedRow = snapResult.rows[0] || null;
    if (cachedRow) {
      const ageMs = Date.now() - new Date(cachedRow.snapshotAt).getTime();
      if (ageMs < ARCH_CACHE_TTL_MS) {
        return res.json({
          ..._withDedupedFindings(cachedRow.snapshot),
          _cache: { hit: true, snapshotAt: cachedRow.snapshotAt, stale: false },
        });
      }
    }

    const isStale = cachedRow !== null;

    function _staleCacheResponse() {
      return {
        ..._withDedupedFindings(cachedRow.snapshot),
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
    // Build a cumulative union of linkedEndpoints across all prior snapshots so
    // _classifyOrphanedRoute can detect routes that were ever linked, not just
    // those linked in the immediately previous snapshot.
    const historicalLinkedEndpoints = snapResult.rows.flatMap(function(row) {
      const snap = row.snapshot;
      return (snap && snap.apiLinkage && Array.isArray(snap.apiLinkage.linkedEndpoints))
        ? snap.apiLinkage.linkedEndpoints
        : [];
    });

    const snapshot = buildRepositoryArchitectureSnapshot({
      repoId,
      repoName:               repo.fullName,
      defaultBranch,
      snapshotAt:             new Date().toISOString(),
      files,
      historicalLinkedEndpoints,
      previousLinkedEndpoints: cachedRow
        ? ((cachedRow.snapshot.apiLinkage || {}).linkedEndpoints || [])
        : [],
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

module.exports = router;
