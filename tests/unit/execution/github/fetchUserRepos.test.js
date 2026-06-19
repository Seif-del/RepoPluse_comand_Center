'use strict';

const { fetchUserRepos } = require('../../../../execution/github/fetchUserRepos');

const TOKEN = 'gho_test_token_abc';

const MOCK_REPOS = [
  { id: 1001, full_name: 'alice/alpha', private: false, pushed_at: '2026-05-01T10:00:00Z' },
  { id: 1002, full_name: 'alice/beta',  private: true,  pushed_at: '2026-04-20T08:00:00Z' },
  { id: 1003, full_name: 'alice/gamma', private: false, pushed_at: null },
];

const mockFetchFn = jest.fn();

function makeRes(body, ok = true, linkHeader = null) {
  return {
    ok,
    status: ok ? 200 : 401,
    json:    jest.fn().mockResolvedValue(body),
    headers: { get: jest.fn((key) => key === 'link' ? linkHeader : null) },
  };
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

// ── URL parameters ────────────────────────────────────────────────────────────

describe('fetchUserRepos — URL parameters', () => {
  beforeEach(() => {
    mockFetchFn.mockResolvedValue(makeRes(MOCK_REPOS));
  });

  it('requests per_page=100', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain('per_page=100');
  });

  it('includes organization_member in affiliation param', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain('organization_member');
  });

  it('includes owner in affiliation param', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain('owner');
  });

  it('includes collaborator in affiliation param', async () => {
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain('collaborator');
  });
});

// ── Pagination ────────────────────────────────────────────────────────────────

const PAGE_2_URL = 'https://api.github.com/user/repos?page=2&per_page=100';

const MOCK_REPOS_PAGE_2 = [
  { id: 2001, full_name: 'alice/delta', private: false, pushed_at: '2026-03-01T00:00:00Z' },
];

describe('fetchUserRepos — pagination', () => {
  it('makes exactly one fetch call when response has no Link header', async () => {
    mockFetchFn.mockResolvedValue(makeRes(MOCK_REPOS));
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });

  it('makes exactly two fetch calls when first page has rel=next Link header', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,       true, `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes(MOCK_REPOS_PAGE_2, true, null));
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn).toHaveBeenCalledTimes(2);
  });

  it('fetches the URL from the Link header on the second call', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,       true, `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes(MOCK_REPOS_PAGE_2, true, null));
    await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[1][0]).toBe(PAGE_2_URL);
  });

  it('accumulates repos from both pages', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,       true, `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes(MOCK_REPOS_PAGE_2, true, null));
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result).toHaveLength(MOCK_REPOS.length + MOCK_REPOS_PAGE_2.length);
  });

  it('returns repos from page 2 with correct mapping', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,       true, `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes(MOCK_REPOS_PAGE_2, true, null));
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    const last = result[result.length - 1];
    expect(last.githubRepoId).toBe(2001);
    expect(last.fullName).toBe('alice/delta');
  });

  it('stops after final page even when previous pages had Link headers', async () => {
    const PAGE_3_URL = 'https://api.github.com/user/repos?page=3&per_page=100';
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,        true, `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes(MOCK_REPOS_PAGE_2, true, `<${PAGE_3_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes([],                true, null));
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(mockFetchFn).toHaveBeenCalledTimes(3);
    expect(result).toHaveLength(MOCK_REPOS.length + MOCK_REPOS_PAGE_2.length);
  });

  it('throws GITHUB_REPOS_FETCH_FAILED when second page returns non-OK', async () => {
    mockFetchFn
      .mockResolvedValueOnce(makeRes(MOCK_REPOS,       true,  `<${PAGE_2_URL}>; rel="next"`))
      .mockResolvedValueOnce(makeRes({},               false, null));
    await expect(fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'GITHUB_REPOS_FETCH_FAILED' });
  });

  it('works when response has no headers object at all', async () => {
    const resWithoutHeaders = {
      ok:     true,
      status: 200,
      json:   jest.fn().mockResolvedValue(MOCK_REPOS),
    };
    mockFetchFn.mockResolvedValue(resWithoutHeaders);
    const result = await fetchUserRepos({ accessToken: TOKEN, fetchFn: mockFetchFn });
    expect(result).toHaveLength(MOCK_REPOS.length);
    expect(mockFetchFn).toHaveBeenCalledTimes(1);
  });
});
