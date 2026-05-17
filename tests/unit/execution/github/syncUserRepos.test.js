'use strict';

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('../../../../execution/github/fetchUserRepos');
jest.mock('../../../../execution/github/fetchRepoMetrics');
jest.mock('../../../../execution/github/fetchCiStatus');
jest.mock('../../../../execution/github/fetchReleaseInfo');
jest.mock('../../../../execution/github/fetchContributorInfo');
jest.mock('../../../../execution/risk/scoreRepo');

// ── Imports ────────────────────────────────────────────────────────────────────

const { syncUserRepos }       = require('../../../../execution/github/syncUserRepos');
const { fetchUserRepos }      = require('../../../../execution/github/fetchUserRepos');
const { fetchRepoMetrics }    = require('../../../../execution/github/fetchRepoMetrics');
const { fetchCiStatus }       = require('../../../../execution/github/fetchCiStatus');
const { fetchReleaseInfo }    = require('../../../../execution/github/fetchReleaseInfo');
const { fetchContributorInfo } = require('../../../../execution/github/fetchContributorInfo');
const { scoreRepo }           = require('../../../../execution/risk/scoreRepo');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const NOW = new Date('2025-01-01T00:00:00.000Z');

const MOCK_REPO_GITHUB = {
  githubRepoId: 999,
  fullName:     'owner/repo',
};

const MOCK_METRICS = {
  commits7d:   5,
  openPrs:     2,
  stalePrs:    1,
  openIssues:  10,
  lastPushAt:  new Date('2024-12-31T00:00:00.000Z'),
};

const MOCK_RELEASE = {
  latestReleaseName:       'v1.0.0',
  latestReleasePublishedAt: new Date('2024-12-01T00:00:00.000Z'),
  releaseStatus:           'healthy',
};

const MOCK_CONTRIBUTORS = {
  activeContributorCount:   5,
  topContributorPercentage: 40.0,
  contributorStatus:        'healthy',
};

const MOCK_SCORE = {
  score:   20,
  label:   'at-risk',
  trend:   'stable',
  factors: ['3 or more stale pull requests (open > 7 days)'],
};

const REPO_ROW = { id: 42 };

function makeDb({ repoRow = REPO_ROW, prevScore = null, registeredRepos = [] } = {}) {
  return {
    query: jest.fn(async (sql) => {
      // Must be checked before 'INSERT INTO repositories' — both contain 'repositories'
      if (sql.includes('SELECT github_repo_id'))     return { rows: registeredRepos };
      if (sql.includes('INSERT INTO repositories'))  return { rows: [repoRow] };
      if (sql.includes('SELECT score FROM risk_scores')) {
        return prevScore !== null ? { rows: [{ score: prevScore }] } : { rows: [] };
      }
      if (sql.includes('INSERT INTO repo_metrics')) return { rows: [] };
      if (sql.includes('INSERT INTO risk_scores'))  return { rows: [] };
      if (sql.includes('UPDATE repositories'))      return { rows: [] };
      return { rows: [] };
    }),
  };
}

function resetMocks() {
  fetchUserRepos.mockReset();
  fetchRepoMetrics.mockReset();
  fetchCiStatus.mockReset();
  fetchReleaseInfo.mockReset();
  fetchContributorInfo.mockReset();
  scoreRepo.mockReset();
}

beforeEach(() => {
  resetMocks();
  fetchUserRepos.mockResolvedValue([MOCK_REPO_GITHUB]);
  fetchRepoMetrics.mockResolvedValue(MOCK_METRICS);
  fetchCiStatus.mockResolvedValue('passing');
  fetchReleaseInfo.mockResolvedValue(MOCK_RELEASE);
  fetchContributorInfo.mockResolvedValue(MOCK_CONTRIBUTORS);
  scoreRepo.mockReturnValue(MOCK_SCORE);
});

// ── Happy path ────────────────────────────────────────────────────────────────

describe('syncUserRepos — happy path', () => {
  it('returns synced count of 1 for a single repo', async () => {
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
  });

  it('errors array is empty on success', async () => {
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.errors).toHaveLength(0);
  });

  it('calls fetchRepoMetrics with correct args', async () => {
    const fetchFn = jest.fn();
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn, now: NOW });
    expect(fetchRepoMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok', fullName: 'owner/repo', fetchFn, now: NOW })
    );
  });

  it('calls fetchCiStatus with correct args', async () => {
    const fetchFn = jest.fn();
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn, now: NOW });
    expect(fetchCiStatus).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok', fullName: 'owner/repo', fetchFn })
    );
  });

  it('inserts ci_status into repo_metrics', async () => {
    fetchCiStatus.mockResolvedValue('failing');
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall).toBeDefined();
    expect(metricsCall[1]).toContain('failing');
  });

  it('passes previousScore when prior risk score exists', async () => {
    const db = makeDb({ prevScore: 30 });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ previousScore: 30 })
    );
  });

  it('passes previousScore: null when no prior risk score', async () => {
    const db = makeDb({ prevScore: null });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ previousScore: null })
    );
  });

  it('syncs multiple repos, incrementing synced count', async () => {
    fetchUserRepos.mockResolvedValue([
      { githubRepoId: 1, fullName: 'o/a' },
      { githubRepoId: 2, fullName: 'o/b' },
    ]);
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(2);
  });
});

// ── scoreRepo — unified operational signal passthrough ────────────────────────

describe('syncUserRepos — scoreRepo receives operational signals (unified model)', () => {
  it('passes ciStatus from fetchCiStatus to scoreRepo', async () => {
    fetchCiStatus.mockResolvedValue('failing');
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'failing' })
    );
  });

  it('passes ciStatus: "passing" when fetchCiStatus returns passing', async () => {
    fetchCiStatus.mockResolvedValue('passing');
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'passing' })
    );
  });

  it('passes ciStatus: "unknown" to scoreRepo when fetchCiStatus throws', async () => {
    fetchCiStatus.mockRejectedValue(new Error('network'));
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'unknown' })
    );
  });

  it('passes releaseStatus from fetchReleaseInfo to scoreRepo', async () => {
    fetchReleaseInfo.mockResolvedValue({ latestReleaseName: null, latestReleasePublishedAt: null, releaseStatus: 'stale' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ releaseStatus: 'stale' })
    );
  });

  it('passes releaseStatus: "unknown" to scoreRepo when fetchReleaseInfo throws', async () => {
    fetchReleaseInfo.mockRejectedValue(new Error('API down'));
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ releaseStatus: 'unknown' })
    );
  });

  it('passes contributorStatus from fetchContributorInfo to scoreRepo', async () => {
    fetchContributorInfo.mockResolvedValue({ activeContributorCount: 0, topContributorPercentage: 0, contributorStatus: 'abandoned' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ contributorStatus: 'abandoned' })
    );
  });

  it('passes contributorStatus: "unknown" to scoreRepo when fetchContributorInfo throws', async () => {
    fetchContributorInfo.mockRejectedValue(new Error('API down'));
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ contributorStatus: 'unknown' })
    );
  });

  it('passes all three operational signals together in a single scoreRepo call', async () => {
    fetchCiStatus.mockResolvedValue('failing');
    fetchReleaseInfo.mockResolvedValue({ latestReleaseName: null, latestReleasePublishedAt: null, releaseStatus: 'none' });
    fetchContributorInfo.mockResolvedValue({ activeContributorCount: 0, topContributorPercentage: 0, contributorStatus: 'abandoned' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(scoreRepo).toHaveBeenCalledWith(
      expect.objectContaining({ ciStatus: 'failing', releaseStatus: 'none', contributorStatus: 'abandoned' })
    );
  });
});

// ── CI status fallback ─────────────────────────────────────────────────────────

describe('syncUserRepos — CI status fallback', () => {
  it('uses "unknown" when fetchCiStatus throws', async () => {
    fetchCiStatus.mockRejectedValue(new Error('network'));
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain('unknown');
  });
});

// ── Release info ───────────────────────────────────────────────────────────────

describe('syncUserRepos — release info', () => {
  it('calls fetchReleaseInfo with correct args', async () => {
    const fetchFn = jest.fn();
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn, now: NOW });
    expect(fetchReleaseInfo).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok', fullName: 'owner/repo', fetchFn, now: NOW })
    );
  });

  it('inserts release_status into repo_metrics', async () => {
    fetchReleaseInfo.mockResolvedValue({ latestReleaseName: 'v2.0.0', latestReleasePublishedAt: new Date(), releaseStatus: 'stale' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain('stale');
  });

  it('uses unknown release status when fetchReleaseInfo throws', async () => {
    fetchReleaseInfo.mockRejectedValue(new Error('API down'));
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain('unknown');
  });

  it('inserts null release name and published_at when none', async () => {
    fetchReleaseInfo.mockResolvedValue({ latestReleaseName: null, latestReleasePublishedAt: null, releaseStatus: 'none' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain(null);
  });
});

// ── Contributor info ───────────────────────────────────────────────────────────

describe('syncUserRepos — contributor info', () => {
  it('calls fetchContributorInfo with correct args', async () => {
    const fetchFn = jest.fn();
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn, now: NOW });
    expect(fetchContributorInfo).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'tok', fullName: 'owner/repo', fetchFn })
    );
  });

  it('inserts contributor_status into repo_metrics', async () => {
    fetchContributorInfo.mockResolvedValue({ activeContributorCount: 1, topContributorPercentage: 100, contributorStatus: 'bus_factor_risk' });
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain('bus_factor_risk');
  });

  it('uses unknown contributor status when fetchContributorInfo throws', async () => {
    fetchContributorInfo.mockRejectedValue(new Error('API down'));
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain('unknown');
  });

  it('inserts active_contributor_count into repo_metrics', async () => {
    const db = makeDb();
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall[1]).toContain(5);
  });
});

// ── Per-repo error isolation ───────────────────────────────────────────────────

describe('syncUserRepos — error isolation', () => {
  it('records error and continues when fetchRepoMetrics throws for one repo', async () => {
    fetchUserRepos.mockResolvedValue([
      { githubRepoId: 1, fullName: 'o/good' },
      { githubRepoId: 2, fullName: 'o/bad' },
    ]);
    fetchRepoMetrics
      .mockResolvedValueOnce(MOCK_METRICS)
      .mockRejectedValueOnce(new Error('API failure'));
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fullName).toBe('o/bad');
  });

  it('returns synced:0 and error for all repos when all fail', async () => {
    fetchRepoMetrics.mockRejectedValue(new Error('boom'));
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('returns synced:0 and errors:[] when no repos are returned', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb();
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(0);
    expect(result.errors).toHaveLength(0);
  });
});

// ── DB-registered repos (not in GitHub /user/repos) ───────────────────────────

describe('syncUserRepos — DB-registered repos', () => {
  it('processes a registered repo not returned by GitHub', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 777, fullName: 'owner/registered' }],
    });
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(0);
  });

  it('inserts repo_metrics for a registered repo not in the GitHub list', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 555, fullName: 'org/registered-only' }],
    });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const metricsCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO repo_metrics'));
    expect(metricsCall).toBeDefined();
  });

  it('inserts risk_scores for a registered repo not in the GitHub list', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 555, fullName: 'org/registered-only' }],
    });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const riskCall = db.query.mock.calls.find(c => c[0].includes('INSERT INTO risk_scores'));
    expect(riskCall).toBeDefined();
  });

  it('updates last_synced_at for a registered repo not in the GitHub list', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 555, fullName: 'org/registered-only' }],
    });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    const updateCall = db.query.mock.calls.find(c => c[0].includes('UPDATE repositories'));
    expect(updateCall).toBeDefined();
  });

  it('calls fetchRepoMetrics with the registered repo fullName', async () => {
    fetchUserRepos.mockResolvedValue([]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 555, fullName: 'org/registered-only' }],
    });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(fetchRepoMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'org/registered-only' })
    );
  });
});

// ── Deduplication (GitHub + DB overlap) ──────────────────────────────────────

describe('syncUserRepos — deduplication', () => {
  it('processes a repo appearing in both GitHub and DB exactly once', async () => {
    fetchUserRepos.mockResolvedValue([{ githubRepoId: 999, fullName: 'owner/repo' }]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 999, fullName: 'owner/repo' }],
    });
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    expect(fetchRepoMetrics).toHaveBeenCalledTimes(1);
  });

  it('synced count equals unique repos when GitHub and DB have overlapping entries', async () => {
    fetchUserRepos.mockResolvedValue([
      { githubRepoId: 1, fullName: 'o/a' },
      { githubRepoId: 2, fullName: 'o/b' },
    ]);
    const db = makeDb({
      registeredRepos: [
        { githubRepoId: 2, fullName: 'o/b' }, // duplicate of GitHub entry
        { githubRepoId: 3, fullName: 'o/c' }, // new registered-only repo
      ],
    });
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(3);
    expect(fetchRepoMetrics).toHaveBeenCalledTimes(3);
  });

  it('GitHub entry wins on collision — its fullName is used for API calls', async () => {
    // GitHub may return a different casing or renamed fullName for the same repo ID
    fetchUserRepos.mockResolvedValue([{ githubRepoId: 42, fullName: 'Owner/Repo' }]);
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 42, fullName: 'owner/repo' }],
    });
    await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(fetchRepoMetrics).toHaveBeenCalledWith(
      expect.objectContaining({ fullName: 'Owner/Repo' })
    );
  });
});

// ── Error isolation for DB-registered repos ───────────────────────────────────

describe('syncUserRepos — error isolation for registered repos', () => {
  it('continues syncing remaining repos when one registered-only repo fails', async () => {
    fetchUserRepos.mockResolvedValue([]);
    fetchRepoMetrics
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(MOCK_METRICS);
    const db = makeDb({
      registeredRepos: [
        { githubRepoId: 1, fullName: 'org/failing-repo' },
        { githubRepoId: 2, fullName: 'org/good-repo' },
      ],
    });
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fullName).toBe('org/failing-repo');
  });

  it('records error for a failing registered repo without crashing the sync', async () => {
    fetchUserRepos.mockResolvedValue([{ githubRepoId: 10, fullName: 'o/github-repo' }]);
    fetchRepoMetrics
      .mockResolvedValueOnce(MOCK_METRICS)        // github repo succeeds
      .mockRejectedValueOnce(new Error('timeout')); // registered repo fails
    const db = makeDb({
      registeredRepos: [{ githubRepoId: 99, fullName: 'org/broken' }],
    });
    const result = await syncUserRepos({ db, userId: 1, accessToken: 'tok', fetchFn: jest.fn(), now: NOW });
    expect(result.synced).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].fullName).toBe('org/broken');
  });
});
