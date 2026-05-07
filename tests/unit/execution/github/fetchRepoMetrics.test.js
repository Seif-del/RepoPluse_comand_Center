'use strict';

const { fetchRepoMetrics } = require('../../../../execution/github/fetchRepoMetrics');

const TOKEN    = 'gho_test_token';
const FULLNAME = 'alice/alpha';
const NOW      = new Date('2026-05-07T12:00:00Z');

const MOCK_COMMITS = [
  { commit: { committer: { date: '2026-05-06T10:00:00Z' } } },
  { commit: { committer: { date: '2026-05-05T10:00:00Z' } } },
];

const SEVEN_DAYS_AGO = new Date(NOW.getTime() - 7 * 86_400_000);

function staleDate() {
  return new Date(SEVEN_DAYS_AGO.getTime() - 1000).toISOString();
}

const MOCK_PRS = [
  { created_at: NOW.toISOString() },
  { created_at: staleDate() },
  { created_at: staleDate() },
];

const MOCK_ISSUES = [
  { number: 1 },                    // pure issue
  { number: 2, pull_request: {} },  // PR — should be excluded
  { number: 3 },                    // pure issue
];

const mockFetchFn = jest.fn();

function makeRes(body, ok = true) {
  return { ok, status: ok ? 200 : 401, json: jest.fn().mockResolvedValue(body) };
}

function setupHappyPath() {
  mockFetchFn
    .mockResolvedValueOnce(makeRes(MOCK_COMMITS))
    .mockResolvedValueOnce(makeRes(MOCK_PRS))
    .mockResolvedValueOnce(makeRes(MOCK_ISSUES));
}

beforeEach(() => jest.resetAllMocks());

// ── Happy path ────────────────────────────────────────────────────────────────

describe('fetchRepoMetrics — success: return shape', () => {
  beforeEach(setupHappyPath);

  it('returns commits7d from commits count', async () => {
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.commits7d).toBe(2);
  });

  it('returns openPrs from PRs count', async () => {
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.openPrs).toBe(3);
  });

  it('counts stalePrs (PRs created before 7-day threshold)', async () => {
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.stalePrs).toBe(2);
  });

  it('excludes PR-typed items from openIssues', async () => {
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.openIssues).toBe(2);
  });

  it('parses lastPushAt from most recent commit', async () => {
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.lastPushAt).toBeInstanceOf(Date);
  });

  it('makes exactly 3 fetch calls', async () => {
    await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(mockFetchFn).toHaveBeenCalledTimes(3);
  });

  it('commits URL includes the since query param', async () => {
    await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    const commitUrl = mockFetchFn.mock.calls.find(c => c[0].includes('/commits'))[0];
    expect(commitUrl).toContain('since=');
  });
});

describe('fetchRepoMetrics — empty responses', () => {
  it('returns 0 commits when list is empty', async () => {
    mockFetchFn.mockResolvedValueOnce(makeRes([])).mockResolvedValueOnce(makeRes([])).mockResolvedValueOnce(makeRes([]));
    const r = await fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW });
    expect(r.commits7d).toBe(0);
    expect(r.lastPushAt).toBeNull();
  });
});

// ── GITHUB_API_ERROR ──────────────────────────────────────────────────────────

describe('fetchRepoMetrics — GITHUB_API_ERROR', () => {
  it('throws when commits endpoint returns non-ok', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes({}, false))
      .mockResolvedValueOnce(makeRes([]))
      .mockResolvedValueOnce(makeRes([]));
    await expect(fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'GITHUB_API_ERROR' });
  });
});

// ── Input validation ──────────────────────────────────────────────────────────

describe('fetchRepoMetrics — input validation', () => {
  it('throws INVALID_ACCESS_TOKEN for null', async () => {
    await expect(fetchRepoMetrics({ accessToken: null, fullName: FULLNAME, fetchFn: mockFetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_FULL_NAME for missing slash', async () => {
    await expect(fetchRepoMetrics({ accessToken: TOKEN, fullName: 'noslash', fetchFn: mockFetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FETCH_FN for non-function', async () => {
    await expect(fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: 'nope', now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });

  it('throws INVALID_NOW for non-Date', async () => {
    await expect(fetchRepoMetrics({ accessToken: TOKEN, fullName: FULLNAME, fetchFn: mockFetchFn, now: 'bad' }))
      .rejects.toMatchObject({ code: 'INVALID_NOW' });
  });
});
