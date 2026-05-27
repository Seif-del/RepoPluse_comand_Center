'use strict';

const { syncRepositoryArchitectureSnapshots } = require('../../../../execution/architecture/syncRepositoryArchitectureSnapshots');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const NOW    = new Date('2025-01-01T12:00:00.000Z');
const NOW_MS = NOW.getTime();
const TTL_MS = 6 * 60 * 60 * 1000;

// 1 second inside TTL — should be skipped
const FRESH = new Date(NOW_MS - TTL_MS + 1_000).toISOString();
// 1 second past TTL — should be refreshed
const STALE = new Date(NOW_MS - TTL_MS - 1_000).toISOString();

const MOCK_SNAPSHOT = {
  architectureHealthScore: 72,
  architectureHealthLevel: 'watch',
  confidenceLevel: 'high',
  metrics: { totalFiles: 5 },
};

const MOCK_SNAPSHOT_NO_FILES = {
  architectureHealthScore: 0,
  architectureHealthLevel: 'unknown',
  confidenceLevel: 'low',
  metrics: { totalFiles: 0 },
};

const MOCK_FILES_RESULT = {
  files: [{ path: 'index.js', content: 'const x = 1;', sizeBytes: 12, language: 'javascript' }],
  debug: { branch: 'main', fetchedTreeCount: 1, eligibleFileCount: 1, fetchedFileCount: 1, skippedFileCount: 0 },
};

function makeRow({ id = 1, fullName = 'owner/repo', accessTokenEnc = 'enc_abc', snapshotAt = null } = {}) {
  return { id, fullName, accessTokenEnc, snapshotAt };
}

function makeDb({ rows = [] } = {}) {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('FROM repositories r')) return { rows };
      if (sql.includes('INSERT INTO repo_architecture_snapshots')) return { rows: [] };
      return { rows: [] };
    }),
  };
}

function makeLogger() {
  return { warn: jest.fn() };
}

// ── Test suite ─────────────────────────────────────────────────────────────────

describe('syncRepositoryArchitectureSnapshots', () => {
  let decryptToken;
  let fetchRepositoryFiles;
  let buildRepositoryArchitectureSnapshot;

  beforeEach(() => {
    decryptToken                      = jest.fn().mockReturnValue('raw_token');
    fetchRepositoryFiles              = jest.fn().mockResolvedValue(MOCK_FILES_RESULT);
    buildRepositoryArchitectureSnapshot = jest.fn().mockReturnValue(MOCK_SNAPSHOT);
  });

  function callSync(overrides = {}) {
    return syncRepositoryArchitectureSnapshots({
      db:     makeDb(),
      decryptToken,
      fetchRepositoryFiles,
      buildRepositoryArchitectureSnapshot,
      now:    NOW,
      ttlMs:  TTL_MS,
      limit:  10,
      logger: makeLogger(),
      ...overrides,
    });
  }

  // ── Empty repo list ────────────────────────────────────────────────────────

  it('returns zero counts when no repos are returned from DB', async () => {
    const result = await callSync({ db: makeDb({ rows: [] }) });
    expect(result.scannedRepos).toBe(0);
    expect(result.skippedFresh).toBe(0);
    expect(result.refreshed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.cachedFallbacks).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('does not call fetchRepositoryFiles when no repos exist', async () => {
    await callSync({ db: makeDb({ rows: [] }) });
    expect(fetchRepositoryFiles).not.toHaveBeenCalled();
  });

  // ── Fresh snapshot — skip ──────────────────────────────────────────────────

  it('skips a repo whose snapshot age is within TTL', async () => {
    const db     = makeDb({ rows: [makeRow({ snapshotAt: FRESH })] });
    const result = await callSync({ db });
    expect(result.skippedFresh).toBe(1);
    expect(result.refreshed).toBe(0);
    expect(result.results[0].status).toBe('skipped_fresh');
  });

  it('does not call fetchRepositoryFiles for a fresh-cache repo', async () => {
    const db = makeDb({ rows: [makeRow({ snapshotAt: FRESH })] });
    await callSync({ db });
    expect(fetchRepositoryFiles).not.toHaveBeenCalled();
  });

  it('preserves snapshotAt in the result for a skipped-fresh repo', async () => {
    const db     = makeDb({ rows: [makeRow({ snapshotAt: FRESH })] });
    const result = await callSync({ db });
    expect(result.results[0].snapshotAt).toBe(FRESH);
  });

  // ── Missing snapshot — process ─────────────────────────────────────────────

  it('processes a repo with no prior snapshot (snapshotAt null)', async () => {
    const db     = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.refreshed).toBe(1);
    expect(result.results[0].status).toBe('refreshed');
    expect(fetchRepositoryFiles).toHaveBeenCalledTimes(1);
  });

  // ── Stale snapshot — process ───────────────────────────────────────────────

  it('processes a repo whose snapshot exceeds TTL', async () => {
    const db     = makeDb({ rows: [makeRow({ snapshotAt: STALE })] });
    const result = await callSync({ db });
    expect(result.refreshed).toBe(1);
    expect(result.results[0].status).toBe('refreshed');
  });

  // ── Limit ─────────────────────────────────────────────────────────────────

  it('passes the limit value to the DB query', async () => {
    const db = makeDb({ rows: [] });
    await callSync({ db, limit: 3 });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [3]);
  });

  it('uses default limit of 10 when not specified', async () => {
    const db = makeDb({ rows: [] });
    await syncRepositoryArchitectureSnapshots({
      db,
      decryptToken,
      fetchRepositoryFiles,
      buildRepositoryArchitectureSnapshot,
      now: NOW,
      logger: makeLogger(),
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $1'), [10]);
  });

  // ── Token decryption ───────────────────────────────────────────────────────

  it('calls decryptToken with the stored accessTokenEnc value', async () => {
    const db = makeDb({ rows: [makeRow({ accessTokenEnc: 'enc_xyz', snapshotAt: null })] });
    await callSync({ db });
    expect(decryptToken).toHaveBeenCalledWith('enc_xyz');
  });

  it('passes the decrypted token to fetchRepositoryFiles as accessToken', async () => {
    decryptToken.mockReturnValue('plain_token_abc');
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db });
    expect(fetchRepositoryFiles).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'plain_token_abc' })
    );
  });

  // ── Missing token ─────────────────────────────────────────────────────────

  it('records missing_token and increments failed when accessTokenEnc is null', async () => {
    const db     = makeDb({ rows: [makeRow({ accessTokenEnc: null, snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.failed).toBe(1);
    expect(result.results[0].status).toBe('missing_token');
    expect(fetchRepositoryFiles).not.toHaveBeenCalled();
  });

  it('records missing_token when accessTokenEnc is empty string', async () => {
    const db     = makeDb({ rows: [makeRow({ accessTokenEnc: '', snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.results[0].status).toBe('missing_token');
  });

  // ── Decrypt failure — does not abort ──────────────────────────────────────

  it('continues processing remaining repos when decryptToken throws', async () => {
    decryptToken
      .mockImplementationOnce(() => { throw new Error('bad key'); })
      .mockReturnValue('good_token');
    const rows = [
      makeRow({ id: 1, snapshotAt: null }),
      makeRow({ id: 2, fullName: 'owner/repo2', snapshotAt: null }),
    ];
    const result = await callSync({ db: makeDb({ rows }) });
    expect(result.failed).toBe(1);
    expect(result.refreshed).toBe(1);
    expect(result.results.find(r => r.repoId === 1).status).toBe('failed');
    expect(result.results.find(r => r.repoId === 2).status).toBe('refreshed');
  });

  // ── Fetch failure — does not abort ────────────────────────────────────────

  it('records failed and continues when fetchRepositoryFiles rejects', async () => {
    fetchRepositoryFiles
      .mockRejectedValueOnce(new Error('rate limited'))
      .mockResolvedValue(MOCK_FILES_RESULT);
    const rows = [
      makeRow({ id: 1, snapshotAt: null }),
      makeRow({ id: 2, fullName: 'owner/repo2', snapshotAt: null }),
    ];
    const result = await callSync({ db: makeDb({ rows }) });
    expect(result.failed).toBe(1);
    expect(result.refreshed).toBe(1);
    expect(result.results.find(r => r.repoId === 1).status).toBe('failed');
    expect(result.results.find(r => r.repoId === 2).status).toBe('refreshed');
  });

  // ── Build failure — does not abort ────────────────────────────────────────

  it('records failed and continues when buildRepositoryArchitectureSnapshot throws', async () => {
    buildRepositoryArchitectureSnapshot
      .mockImplementationOnce(() => { throw new Error('analysis error'); })
      .mockReturnValue(MOCK_SNAPSHOT);
    const rows = [
      makeRow({ id: 1, snapshotAt: null }),
      makeRow({ id: 2, fullName: 'owner/repo2', snapshotAt: null }),
    ];
    const result = await callSync({ db: makeDb({ rows }) });
    expect(result.failed).toBe(1);
    expect(result.refreshed).toBe(1);
  });

  // ── no_files — does not insert ────────────────────────────────────────────

  it('records no_files when snapshot.metrics.totalFiles is 0', async () => {
    buildRepositoryArchitectureSnapshot.mockReturnValue(MOCK_SNAPSHOT_NO_FILES);
    const db     = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.results[0].status).toBe('no_files');
    expect(result.refreshed).toBe(0);
  });

  it('does not INSERT when totalFiles is 0', async () => {
    buildRepositoryArchitectureSnapshot.mockReturnValue(MOCK_SNAPSHOT_NO_FILES);
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db });
    const insertCalled = db.query.mock.calls.some(c =>
      c[0].includes('INSERT INTO repo_architecture_snapshots')
    );
    expect(insertCalled).toBe(false);
  });

  it('records no_files when snapshot has no metrics field at all', async () => {
    buildRepositoryArchitectureSnapshot.mockReturnValue({});
    const db     = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.results[0].status).toBe('no_files');
    const insertCalled = db.query.mock.calls.some(c =>
      c[0].includes('INSERT INTO repo_architecture_snapshots')
    );
    expect(insertCalled).toBe(false);
  });

  // ── Successful insert ─────────────────────────────────────────────────────

  it('inserts snapshot with correct repoId, snapshot object, and source=github', async () => {
    const db = makeDb({ rows: [makeRow({ id: 7, snapshotAt: null })] });
    await callSync({ db });
    const insertCall = db.query.mock.calls.find(c =>
      c[0].includes('INSERT INTO repo_architecture_snapshots')
    );
    expect(insertCall).toBeTruthy();
    expect(insertCall[1][0]).toBe(7);
    expect(insertCall[1][1]).toBe(MOCK_SNAPSHOT);
    expect(insertCall[1][2]).toBe('github');
  });

  it('returns refreshed status with a snapshotAt timestamp after insert', async () => {
    const db     = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    const result = await callSync({ db });
    expect(result.results[0].status).toBe('refreshed');
    expect(result.results[0].snapshotAt).toBe(new Date(NOW_MS).toISOString());
  });

  // ── Deterministic processing order ────────────────────────────────────────

  it('SQL includes ORDER BY missing-first, oldest-first, id ASC', async () => {
    const db = makeDb({ rows: [] });
    await callSync({ db });
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('CASE WHEN arch.snapshot_at IS NULL THEN 0 ELSE 1 END');
    expect(sql).toContain('arch.snapshot_at ASC NULLS FIRST');
    expect(sql).toContain('r.id ASC');
  });

  it('SQL uses LEFT JOIN LATERAL for per-repo latest snapshot', async () => {
    const db = makeDb({ rows: [] });
    await callSync({ db });
    const sql = db.query.mock.calls[0][0];
    expect(sql).toContain('LEFT JOIN LATERAL');
    expect(sql).toContain('repo_architecture_snapshots');
  });

  // ── Token safety ──────────────────────────────────────────────────────────

  it('does not include the raw accessTokenEnc value in any logger.warn call', async () => {
    const logger = makeLogger();
    decryptToken.mockImplementation(() => { throw new Error('decrypt failed'); });
    const SECRET = 'super_secret_encrypted_value';
    const db = makeDb({ rows: [makeRow({ accessTokenEnc: SECRET, snapshotAt: null })] });
    await callSync({ db, logger });
    const logOutput = logger.warn.mock.calls.flat().join(' ');
    expect(logOutput).not.toContain(SECRET);
  });

  it('does not include the decrypted token in logger.warn when fetch fails', async () => {
    const logger = makeLogger();
    const PLAIN = 'ghp_plaintext_token_value';
    decryptToken.mockReturnValue(PLAIN);
    fetchRepositoryFiles.mockRejectedValue(new Error('network error'));
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db, logger });
    const logOutput = logger.warn.mock.calls.flat().join(' ');
    expect(logOutput).not.toContain(PLAIN);
  });

  // ── Output counts ─────────────────────────────────────────────────────────

  it('counts correctly across a mixed batch: missing_token, fresh, stale-refreshed, no_files', async () => {
    buildRepositoryArchitectureSnapshot
      .mockReturnValueOnce(MOCK_SNAPSHOT)            // repo 3 → refreshed
      .mockReturnValue(MOCK_SNAPSHOT_NO_FILES);      // repo 4 → no_files

    const rows = [
      makeRow({ id: 1, accessTokenEnc: null,    snapshotAt: null  }),  // missing_token
      makeRow({ id: 2, snapshotAt: FRESH }),                            // skipped_fresh
      makeRow({ id: 3, snapshotAt: STALE }),                            // refreshed
      makeRow({ id: 4, fullName: 'owner/repo4', snapshotAt: STALE }),   // no_files
    ];
    const result = await callSync({ db: makeDb({ rows }) });

    expect(result.scannedRepos).toBe(4);
    expect(result.failed).toBe(1);
    expect(result.skippedFresh).toBe(1);
    expect(result.refreshed).toBe(1);
    expect(result.results.filter(r => r.status === 'no_files').length).toBe(1);
  });

  it('scannedRepos equals the number of rows returned by the DB', async () => {
    const rows   = [makeRow({ id: 1 }), makeRow({ id: 2, fullName: 'owner/b' })];
    const result = await callSync({ db: makeDb({ rows }) });
    expect(result.scannedRepos).toBe(2);
  });

  // ── DB error on initial query ─────────────────────────────────────────────

  it('propagates a DB error from the initial query', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    await expect(callSync({ db })).rejects.toThrow('connection refused');
  });

  // ── Default TTL ───────────────────────────────────────────────────────────

  it('uses a 6-hour default TTL when ttlMs is not provided', async () => {
    // snapshot that is 5h59m59s old — should be skipped with default TTL
    const almostStale = new Date(NOW_MS - (6 * 60 * 60 * 1000) + 1_000).toISOString();
    const rows  = [makeRow({ snapshotAt: almostStale })];
    const result = await syncRepositoryArchitectureSnapshots({
      db: makeDb({ rows }),
      decryptToken,
      fetchRepositoryFiles,
      buildRepositoryArchitectureSnapshot,
      now: NOW,
      logger: makeLogger(),
    });
    expect(result.skippedFresh).toBe(1);
    expect(result.refreshed).toBe(0);
  });

  // ── Branch auto-detection ─────────────────────────────────────────────────

  it('uses branch from fetchRepositoryFiles debug when available', async () => {
    fetchRepositoryFiles.mockResolvedValue({
      files: MOCK_FILES_RESULT.files,
      debug: { branch: 'develop', fetchedTreeCount: 1, eligibleFileCount: 1, fetchedFileCount: 1, skippedFileCount: 0 },
    });
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db });
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranch: 'develop' })
    );
  });

  it('falls back to main when fetchRepositoryFiles debug has no branch', async () => {
    fetchRepositoryFiles.mockResolvedValue({ files: MOCK_FILES_RESULT.files, debug: {} });
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db });
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ defaultBranch: 'main' })
    );
  });

  // ── repoName passed through ───────────────────────────────────────────────

  it('passes fullName as repoName to buildRepositoryArchitectureSnapshot', async () => {
    const db = makeDb({ rows: [makeRow({ fullName: 'acme/service-x', snapshotAt: null })] });
    await callSync({ db });
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ repoName: 'acme/service-x' })
    );
  });

  // ── snapshotAt in build call uses now ─────────────────────────────────────

  it('passes now as snapshotAt to buildRepositoryArchitectureSnapshot', async () => {
    const db = makeDb({ rows: [makeRow({ snapshotAt: null })] });
    await callSync({ db });
    expect(buildRepositoryArchitectureSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ snapshotAt: new Date(NOW_MS).toISOString() })
    );
  });
});
