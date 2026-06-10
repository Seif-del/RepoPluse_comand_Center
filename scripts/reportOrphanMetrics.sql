-- reportOrphanMetrics.sql
-- Read-only validation report for route exposure classification metrics.
-- Compares orphanedBackendRouteCount, navigationOrphanCount, unlinkedApiCount,
-- and disconnectedApiCount across all active repositories using the latest
-- persisted architecture snapshot per repo.
--
-- No data mutations. Safe to run against production.
--
-- Run with:
--   psql $DATABASE_URL -f scripts/reportOrphanMetrics.sql
--
-- Pre-condition: repos showing pattern='pre-feature' were snapshotted before the
-- classification metrics were introduced. Trigger a fresh snapshot for those repos
-- via GET /api/repos/:id/architecture (or the scheduled sync worker) before
-- relying on the nav_internal / unlinked_apis / disconnected_apis columns.
--
-- Pattern definitions (evaluated in priority order):
--   no-snapshot      — no architecture snapshot exists for this repo
--   pre-feature      — snapshot exists but navigationOrphanCount is absent
--                      (built before the classification metrics were added)
--   no-orphans       — orphaned_total = 0
--   has-disconnected — disconnected_apis > 0  (highest-signal: was previously linked)
--   mostly-navigation — nav_internal / orphaned_total >= 0.6
--   mostly-unlinked  — unlinked_apis / orphaned_total >= 0.6
--   mixed            — multiple orphan types without a dominant category


-- ── 1. PER-REPO ORPHAN BREAKDOWN ─────────────────────────────────────────────
-- One row per active repo.  NULL in nav_internal / unlinked_apis / disconnected_apis
-- means the snapshot pre-dates the classification feature (pattern = 'pre-feature').

\echo ''
\echo '=== 1. PER-REPO ORPHAN BREAKDOWN (latest snapshot, ordered by orphaned_total DESC) ==='
\echo ''

SELECT
  r.github_full_name                                                               AS repo_name,
  ROUND(EXTRACT(EPOCH FROM (now() - s.snapshot_at)) / 3600.0, 1)                  AS snapshot_age_h,
  COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0)     AS orphaned_total,
  (s.snapshot -> 'metrics' ->> 'navigationOrphanCount')::int                      AS nav_internal,
  (s.snapshot -> 'metrics' ->> 'unlinkedApiCount')::int                           AS unlinked_apis,
  (s.snapshot -> 'metrics' ->> 'disconnectedApiCount')::int                       AS disconnected_apis,
  CASE
    WHEN s.snapshot IS NULL
      THEN 'no-snapshot'
    WHEN (s.snapshot -> 'metrics' ->> 'navigationOrphanCount') IS NULL
      THEN 'pre-feature'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0) = 0
      THEN 'no-orphans'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'disconnectedApiCount')::int, 0) > 0
      THEN 'has-disconnected'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'navigationOrphanCount')::int, 0)::float
         / NULLIF(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0), 0) >= 0.6
      THEN 'mostly-navigation'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'unlinkedApiCount')::int, 0)::float
         / NULLIF(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0), 0) >= 0.6
      THEN 'mostly-unlinked'
    ELSE 'mixed'
  END                                                                               AS pattern
FROM repositories r
LEFT JOIN LATERAL (
  SELECT snapshot, snapshot_at
  FROM   repo_architecture_snapshots
  WHERE  repo_id = r.id
  ORDER  BY snapshot_at DESC
  LIMIT  1
) s ON true
WHERE r.is_active = true
ORDER BY
  COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0) DESC,
  r.github_full_name ASC;


-- ── 2. PATTERN DISTRIBUTION ──────────────────────────────────────────────────
-- Count of repos per pattern and total orphaned routes each pattern contributes.

\echo ''
\echo '=== 2. PATTERN DISTRIBUTION ==='
\echo ''

SELECT
  CASE
    WHEN s.snapshot IS NULL
      THEN 'no-snapshot'
    WHEN (s.snapshot -> 'metrics' ->> 'navigationOrphanCount') IS NULL
      THEN 'pre-feature'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0) = 0
      THEN 'no-orphans'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'disconnectedApiCount')::int, 0) > 0
      THEN 'has-disconnected'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'navigationOrphanCount')::int, 0)::float
         / NULLIF(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0), 0) >= 0.6
      THEN 'mostly-navigation'
    WHEN COALESCE((s.snapshot -> 'metrics' ->> 'unlinkedApiCount')::int, 0)::float
         / NULLIF(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0), 0) >= 0.6
      THEN 'mostly-unlinked'
    ELSE 'mixed'
  END                                                                               AS pattern,
  COUNT(*)                                                                          AS repo_count,
  SUM(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0)) AS total_orphaned_routes
FROM repositories r
LEFT JOIN LATERAL (
  SELECT snapshot, snapshot_at
  FROM   repo_architecture_snapshots
  WHERE  repo_id = r.id
  ORDER  BY snapshot_at DESC
  LIMIT  1
) s ON true
WHERE r.is_active = true
GROUP BY pattern
ORDER BY repo_count DESC, pattern ASC;


-- ── 3. SUMMARY ROLLUP ────────────────────────────────────────────────────────
-- Portfolio-wide totals.  Sums for nav_internal / unlinked_apis / disconnected_apis
-- are meaningful only once all repos have new-metric snapshots.

\echo ''
\echo '=== 3. SUMMARY ROLLUP ==='
\echo ''

SELECT
  COUNT(*)                                                                          AS active_repos,
  COUNT(s.snapshot)                                                                 AS repos_with_snapshot,
  COUNT(*) FILTER (WHERE s.snapshot IS NULL)                                        AS repos_missing_snapshot,
  COUNT(*) FILTER (
    WHERE s.snapshot IS NOT NULL
      AND (s.snapshot -> 'metrics' ->> 'navigationOrphanCount') IS NOT NULL
  )                                                                                 AS repos_with_new_metrics,
  COUNT(*) FILTER (
    WHERE s.snapshot IS NOT NULL
      AND (s.snapshot -> 'metrics' ->> 'navigationOrphanCount') IS NULL
  )                                                                                 AS repos_pre_feature,
  SUM(COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0)) AS portfolio_orphaned_total,
  SUM(COALESCE((s.snapshot -> 'metrics' ->> 'navigationOrphanCount')::int,     0)) AS portfolio_nav_internal,
  SUM(COALESCE((s.snapshot -> 'metrics' ->> 'unlinkedApiCount')::int,          0)) AS portfolio_unlinked_apis,
  SUM(COALESCE((s.snapshot -> 'metrics' ->> 'disconnectedApiCount')::int,      0)) AS portfolio_disconnected_apis,
  COUNT(*) FILTER (
    WHERE COALESCE((s.snapshot -> 'metrics' ->> 'disconnectedApiCount')::int, 0) > 0
  )                                                                                 AS repos_with_disconnected_apis
FROM repositories r
LEFT JOIN LATERAL (
  SELECT snapshot, snapshot_at
  FROM   repo_architecture_snapshots
  WHERE  repo_id = r.id
  ORDER  BY snapshot_at DESC
  LIMIT  1
) s ON true
WHERE r.is_active = true;


-- ── 4. REPOS NEEDING FRESH SNAPSHOT ─────────────────────────────────────────
-- Lists repos whose latest snapshot pre-dates the classification feature.
-- These repos' orphaned_total values are known but cannot be broken down by type
-- until a new snapshot is generated.
-- Empty result = all repos have new-metric snapshots; report is fully valid.

\echo ''
\echo '=== 4. REPOS NEEDING FRESH SNAPSHOT (pre-feature — nav_internal / unlinked_apis / disconnected_apis absent) ==='
\echo ''

SELECT
  r.github_full_name                                                                AS repo_name,
  s.snapshot_at                                                                     AS last_snapshotted_at,
  ROUND(EXTRACT(EPOCH FROM (now() - s.snapshot_at)) / 3600.0, 1)                   AS age_hours,
  COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0)      AS orphaned_total_unclassified
FROM repositories r
LEFT JOIN LATERAL (
  SELECT snapshot, snapshot_at
  FROM   repo_architecture_snapshots
  WHERE  repo_id = r.id
  ORDER  BY snapshot_at DESC
  LIMIT  1
) s ON true
WHERE r.is_active = true
  AND s.snapshot IS NOT NULL
  AND (s.snapshot -> 'metrics' ->> 'navigationOrphanCount') IS NULL
ORDER BY
  COALESCE((s.snapshot -> 'metrics' ->> 'orphanedBackendRouteCount')::int, 0) DESC,
  r.github_full_name ASC;

\echo ''
\echo '--- end of reportOrphanMetrics ---'
\echo ''
