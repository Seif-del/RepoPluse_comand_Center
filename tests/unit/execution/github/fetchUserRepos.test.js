'use strict';

const { fetchUserRepos } = require('../../../../execution/github/fetchUserRepos');

const TOKEN = 'gho_test_token_abc';

const MOCK_REPOS = [
  { id: 1001, full_name: 'alice/alpha', private: false, pushed_at: '2026-05-01T10:00:00Z' },
  { id: 1002, full_name: 'alice/beta',  private: true,  pushed_at: '2026-04-20T08:00:00Z' },
  { id: 1003, full_name: 'alice/gamma', private: false, pushed_at: null },
];

const mockFetchFn = jest.fn();

function makeRes(body, ok = true) {
  return { ok, status: ok ? 200 : 401, json: jest.fn().mockResolvedValue(body) };
}

beforeEach(() => jest.resetAllMocks());

// ── Happy path ────────────────────────────────────────────────────────────────

describe('fetchUserRepos — success', () => {
  beforeEach(() => {
    mockFetchFn.mockResolvedValue(makeRes(MOCK_REPOS));
  });

  it('returns an array with one entry per repo', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result).toHaveLength(3);
  });

  it('maps id to githubRepoId', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result[0].githubRepoId).toBe(1001);
  });

  it('maps full_name to fullName', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result[0].fullName).toBe('alice/alpha');
  });

  it('maps private to isPrivate', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result[1].isPrivate).toBe(true);
    expect(result[0].isPrivate).toBe(false);
  });

  it('converts pushed_at string to Date', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result[0].pushedAt).toBeInstanceOf(Date);
  });

  it('returns null pushedAt when pushed_at is null', async () => {
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result[2].pushedAt).toBeNull();
  });

  it('sets Authorization header with Bearer token', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('calls the GitHub user repos endpoint', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain('api.github.com/user/repos');
  });
});

// ── GITHUB_REPOS_FETCH_FAILED ─────────────────────────────────────────────────

describe('fetchUserRepos — GITHUB_REPOS_FETCH_FAILED', () => {
  it('throws when response is not ok', async () => {
    mockFetchFn.mockResolvedValue(makeRes({}, false));
    await expect(fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'GITHUB_REPOS_FETCH_FAILED' });
  });

  it('throws when response body is not an array', async () => {
    mockFetchFn.mockResolvedValue(makeRes({ not: 'an array' }));
    await expect(fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'GITHUB_REPOS_FETCH_FAILED' });
  });
});

// ── INVALID_ACCESS_TOKEN ──────────────────────────────────────────────────────

describe('fetchUserRepos — INVALID_ACCESS_TOKEN', () => {
  it('throws INVALID_ACCESS_TOKEN for null', async () => {
    await expect(fetchUserRepos({ accessToken: null, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for empty string', async () => {
    await expect(fetchUserRepos({ accessToken: '', fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('does not call fetchFn when accessToken is invalid', async () => {
    try { await fetchUserRepos({ accessToken: null, fetchFn: mockFetchFn }); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_FETCH_FN ──────────────────────────────────────────────────────────

describe('fetchUserRepos — INVALID_FETCH_FN', () => {
  it('throws INVALID_FETCH_FN for non-function', async () => {
    await expect(fetchUserRepos({ accessToken: TOKEN, fetchFn: null }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });
});
