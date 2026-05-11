'use strict';

// ── Module mocks ───────────────────────────────────────────────────────────────

jest.mock('../../../../execution/github/fetchUserRepos');
jest.mock('../../../../execution/github/fetchRepoMetrics');
jest.mock('../../../../execution/github/fetchCiStatus');
jest.mock('../../../../execution/github/fetchReleaseInfo');
jest.mock('../../../../execution/risk/scoreRepo');

// ── Imports ────────────────────────────────────────────────────────────────────

const { syncUserRepos }    = require('../../../../execution/github/syncUserRepos');
const { fetchUserRepos }   = require('../../../../execution/github/fetchUserRepos');
const { fetchRepoMetrics } = require('../../../../execution/github/fetchRepoMetrics');
const { fetchCiStatus }    = require('../../../../execution/github/fetchCiStatus');
const { fetchReleaseInfo } = require('../../../../execution/github/fetchReleaseInfo');
const { scoreRepo }        = require('../../../../execution/risk/scoreRepo');

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

const MOCK_SCORE = {
  score:   20,
  label:   'at-risk',
  trend:   'stable',
  factors: ['3 or more stale pull requests (open > 7 days)'],
};

const REPO_ROW = { id: 42 };

function makeDb({ repoRow = REPO_ROW, prevScore = null } = {}) {
  return {
    query: jest.fn(async (sql) => {
      if (sql.includes('INSERT INTO repositories')) return { rows: [repoRow] };
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
  scoreRepo.mockReset();
}

beforeEach(() => {
  resetMocks();
  fetchUserRepos.mockResolvedValue([MOCK_REPO_GITHUB]);
  fetchRepoMetrics.mockResolvedValue(MOCK_METRICS);
  fetchCiStatus.mockResolvedValue('passing');
  fetchReleaseInfo.mockResolvedValue(MOCK_RELEASE);
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
