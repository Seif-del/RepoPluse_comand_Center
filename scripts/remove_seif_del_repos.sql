-- remove_seif_del_repos.sql
-- One-time data operation: remove 4 Seif-del/* repositories that are no longer
-- needed. All child tables (repo_metrics, risk_scores, repo_pr_metrics,
-- repo_architecture_snapshots) carry ON DELETE CASCADE and will clean up
-- automatically when the repositories rows are deleted.
--
-- Repos targeted (confirmed from SELECT before writing this script):
--   id=2   github_repo_id=1192216112  Seif-del/RepoPulse_Command_New
--   id=3   github_repo_id=1191760509  Seif-del/test
--   id=5   github_repo_id=1173053636  Seif-del/Sei-Forge-AI
--   id=6   github_repo_id=1172887868  Seif-del/Launch-Forge-AI
--
-- Safe to re-run: DELETE WHERE is idempotent if rows are already gone.
-- Does NOT touch any other repositories.
--
-- Run with:
--   psql $DATABASE_URL -f scripts/remove_seif_del_repos.sql
--   -- or --
--   node scripts/remove_seif_del_repos.js

BEGIN;

-- Step 1: Explicitly delete dependent records first for a clear audit trail.
-- (CASCADE would handle this automatically, but explicit is safer to read.)

DELETE FROM repo_architecture_snapshots
WHERE repo_id IN (2, 3, 5, 6);

DELETE FROM repo_pr_metrics
WHERE repo_id IN (2, 3, 5, 6);

DELETE FROM risk_scores
WHERE repo_id IN (2, 3, 5, 6);

DELETE FROM repo_metrics
WHERE repo_id IN (2, 3, 5, 6);

-- Step 2: Delete the repository rows.
-- Verify github_full_name matches to guard against ID reuse.

DELETE FROM repositories
WHERE id IN (2, 3, 5, 6)
  AND github_full_name IN (
    'Seif-del/RepoPulse_Command_New',
    'Seif-del/test',
    'Seif-del/Sei-Forge-AI',
    'Seif-del/Launch-Forge-AI'
  );

-- Step 3: Verify the right rows were removed and the rest remain intact.
DO $$
DECLARE
  remaining_count INTEGER;
  deleted_count   INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM repositories;
  SELECT COUNT(*) INTO deleted_count
    FROM repositories
    WHERE github_full_name IN (
      'Seif-del/RepoPulse_Command_New',
      'Seif-del/test',
      'Seif-del/Sei-Forge-AI',
      'Seif-del/Launch-Forge-AI'
    );

  IF deleted_count > 0 THEN
    RAISE EXCEPTION 'Targeted repos still present after DELETE — rolling back. Count: %', deleted_count;
  END IF;

  RAISE NOTICE 'Deletion successful. Repositories remaining: %', remaining_count;
END;
$$;

COMMIT;
