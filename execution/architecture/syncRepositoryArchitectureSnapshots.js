'use strict';

// syncRepositoryArchitectureSnapshots
// Refreshes missing or stale architecture snapshots for active repositories.
//
// Processes repos in deterministic order: missing snapshots first, then oldest
// stale first, then by repo id ASC. Skips repos whose snapshot is within TTL.
// Failure in one repo never aborts the batch — failed repos are recorded and
// the helper continues with remaining repos.
//
// Tokens are never logged or returned in any output field.
//
// Dependencies are fully injected so the function is unit-testable without I/O.

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const DEFAULT_LIMIT  = 10;

/**
 * @param {object}   params
 * @param {object}   params.db                                - pg pool (query method)
 * @param {Function} params.decryptToken                      - (ciphertext) => plaintext
 * @param {Function} params.fetchRepositoryFiles              - ({ accessToken, fullName }) => { files, debug }
 * @param {Function} params.buildRepositoryArchitectureSnapshot
 * @param {Date}    [params.now]                              - current time (default: new Date())
 * @param {number}  [params.ttlMs]                           - freshness threshold ms (default: 6 h)
 * @param {number}  [params.limit]                           - max repos per run (default: 10)
 * @param {object}  [params.logger]                          - { warn } (default: console)
 * @returns {Promise<{
 *   scannedRepos: number,
 *   skippedFresh: number,
 *   refreshed:    number,
 *   failed:       number,
 *   cachedFallbacks: number,
 *   results: Array<{ repoId, repoName, status, snapshotAt, error }>
 * }>}
 */
async function syncRepositoryArchitectureSnapshots({
  db,
  decryptToken,
  fetchRepositoryFiles,
  buildRepositoryArchitectureSnapshot,
  now    = new Date(),
  ttlMs  = DEFAULT_TTL_MS,
  limit  = DEFAULT_LIMIT,
  logger = console,
} = {}) {
  const nowMs = (now instanceof Date ? now : new Date(now)).getTime();

  // ── Stage 1: load active repos + latest snapshot age ─────────────────────
  // ORDER BY: repos with no snapshot first (CASE = 0), then oldest snapshot
  // first, then repo id ASC — ensures deterministic processing priority.
  const { rows } = await db.query(
    `SELECT
       r.id,
       r.github_full_name  AS "fullName",
       u.access_token_enc  AS "accessTokenEnc",
       arch.snapshot_at    AS "snapshotAt"
     FROM repositories r
     JOIN users u ON u.id = r.user_id
     LEFT JOIN LATERAL (
       SELECT snapshot_at
       FROM repo_architecture_snapshots
       WHERE repo_id = r.id
       ORDER BY snapshot_at DESC
       LIMIT 1
     ) arch ON true
     WHERE r.is_active = true
     ORDER BY
       CASE WHEN arch.snapshot_at IS NULL THEN 0 ELSE 1 END,
       arch.snapshot_at ASC NULLS FIRST,
       r.id ASC
     LIMIT $1`,
    [limit]
  );

  const results         = [];
  let   skippedFresh    = 0;
  let   refreshed       = 0;
  let   failed          = 0;
  const cachedFallbacks = 0;

  for (const row of rows) {
    const { id: repoId, fullName, accessTokenEnc, snapshotAt } = row;

    // ── Skip repos whose snapshot is within TTL ───────────────────────────
    if (snapshotAt !== null) {
      const ageMs = nowMs - new Date(snapshotAt).getTime();
      if (ageMs < ttlMs) {
        skippedFresh++;
        results.push({ repoId, repoName: fullName, status: 'skipped_fresh', snapshotAt, error: null });
        continue;
      }
    }

    // ── Missing or empty token ────────────────────────────────────────────
    if (!accessTokenEnc) {
      failed++;
      results.push({ repoId, repoName: fullName, status: 'missing_token', snapshotAt: null, error: 'No access token stored' });
      continue;
    }

    // ── Decrypt token ─────────────────────────────────────────────────────
    let accessToken;
    try {
      accessToken = decryptToken(accessTokenEnc);
    } catch (err) {
      logger.warn('[syncArchSnapshots] token decryption failed for repo', repoId, err.message);
      failed++;
      results.push({ repoId, repoName: fullName, status: 'failed', snapshotAt: null, error: 'Token decryption failed' });
      continue;
    }

    // ── Fetch repository files from GitHub ────────────────────────────────
    let files;
    let defaultBranch = 'main';
    try {
      const fetchResult = await fetchRepositoryFiles({ accessToken, fullName });
      files         = fetchResult.files;
      defaultBranch = (fetchResult.debug && fetchResult.debug.branch) || 'main';
    } catch (err) {
      logger.warn('[syncArchSnapshots] file fetch failed for repo', repoId, err.message);
      failed++;
      results.push({ repoId, repoName: fullName, status: 'failed', snapshotAt: null, error: 'File fetch failed' });
      continue;
    }

    // ── Build architecture snapshot ───────────────────────────────────────
    let snapshot;
    try {
      snapshot = buildRepositoryArchitectureSnapshot({
        repoId,
        repoName:      fullName,
        defaultBranch,
        snapshotAt:    new Date(nowMs).toISOString(),
        files,
      });
    } catch (err) {
      logger.warn('[syncArchSnapshots] snapshot build failed for repo', repoId, err.message);
      failed++;
      results.push({ repoId, repoName: fullName, status: 'failed', snapshotAt: null, error: 'Snapshot build failed' });
      continue;
    }

    // ── Guard: only persist when snapshot has real files ──────────────────
    if (!snapshot.metrics || snapshot.metrics.totalFiles === 0) {
      results.push({ repoId, repoName: fullName, status: 'no_files', snapshotAt: null, error: null });
      continue;
    }

    // ── Persist snapshot ──────────────────────────────────────────────────
    await db.query(
      `INSERT INTO repo_architecture_snapshots (repo_id, snapshot, source)
       VALUES ($1, $2, $3)`,
      [repoId, snapshot, 'github']
    );

    const insertedAt = new Date(nowMs).toISOString();
    refreshed++;
    results.push({ repoId, repoName: fullName, status: 'refreshed', snapshotAt: insertedAt, error: null });
  }

  return {
    scannedRepos: rows.length,
    skippedFresh,
    refreshed,
    failed,
    cachedFallbacks,
    results,
  };
}

module.exports = { syncRepositoryArchitectureSnapshots };
