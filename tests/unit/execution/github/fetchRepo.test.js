'use strict';

const { fetchRepo } = require('../../../../execution/github/fetchRepo');

const TOKEN     = 'gho_test_token';
const FULL_NAME = 'vercel/next.js';

const MOCK_REPO = { id: 7_774_892, full_name: 'vercel/next.js' };

const mockFetchFn = jest.fn();

function makeRes(body, status = 200) {
  return {
    ok:     status >= 200 && status < 300,
    status,
    json:   jest.fn().mockResolvedValue(body),
  };
}

beforeEach(() => jest.resetAllMocks());

// ── Happy path ────────────────────────────────────────────────────────────────

describe('fetchRepo — success', () => {
  beforeEach(() => {
    mockFetchFn.mockResolvedValue(makeRes(MOCK_REPO));
  });

  it('returns githubRepoId from the API response', async () => {
    const result = await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn });
    expect(result.githubRepoId).toBe(7_774_892);
  });

  it('returns fullName from the API response', async () => {
    const result = await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn });
    expect(result.fullName).toBe('vercel/next.js');
  });

  it('calls the correct GitHub repos endpoint', async () => {
    await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][0]).toContain(`api.github.com/repos/${FULL_NAME}`);
  });

  it('sends the Authorization header with Bearer token', async () => {
    await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('sends the correct Accept header', async () => {
    await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn });
    expect(mockFetchFn.mock.calls[0][1].headers['Accept']).toBe('application/vnd.github+json');
  });
});

// ── REPO_NOT_FOUND ────────────────────────────────────────────────────────────

describe('fetchRepo — REPO_NOT_FOUND', () => {
  it('throws REPO_NOT_FOUND when GitHub returns 404', async () => {
    mockFetchFn.mockResolvedValue(makeRes({}, 404));
    await expect(fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'REPO_NOT_FOUND' });
  });
});

// ── GITHUB_REPO_FETCH_FAILED ──────────────────────────────────────────────────

describe('fetchRepo — GITHUB_REPO_FETCH_FAILED', () => {
  it('throws GITHUB_REPO_FETCH_FAILED for a 401 response', async () => {
    mockFetchFn.mockResolvedValue(makeRes({}, 401));
    await expect(fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'GITHUB_REPO_FETCH_FAILED' });
  });

  it('throws GITHUB_REPO_FETCH_FAILED for a 500 response', async () => {
    mockFetchFn.mockResolvedValue(makeRes({}, 500));
    await expect(fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'GITHUB_REPO_FETCH_FAILED' });
  });

  it('exposes the HTTP status on the error', async () => {
    mockFetchFn.mockResolvedValue(makeRes({}, 403));
    const err = await fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: mockFetchFn })
      .catch(e => e);
    expect(err.status).toBe(403);
  });
});

// ── INVALID_ACCESS_TOKEN ──────────────────────────────────────────────────────

describe('fetchRepo — INVALID_ACCESS_TOKEN', () => {
  it('throws for null accessToken', async () => {
    await expect(fetchRepo({ accessToken: null, fullName: FULL_NAME, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws for empty string accessToken', async () => {
    await expect(fetchRepo({ accessToken: '', fullName: FULL_NAME, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('does not call fetchFn when accessToken is invalid', async () => {
    try { await fetchRepo({ accessToken: null, fullName: FULL_NAME, fetchFn: mockFetchFn }); } catch (_) {}
    expect(mockFetchFn).not.toHaveBeenCalled();
  });
});

// ── INVALID_ARGUMENT ──────────────────────────────────────────────────────────

describe('fetchRepo — INVALID_ARGUMENT (fullName)', () => {
  it('throws for null fullName', async () => {
    await expect(fetchRepo({ accessToken: TOKEN, fullName: null, fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  it('throws for empty string fullName', async () => {
    await expect(fetchRepo({ accessToken: TOKEN, fullName: '', fetchFn: mockFetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

// ── INVALID_FETCH_FN ──────────────────────────────────────────────────────────

describe('fetchRepo — INVALID_FETCH_FN', () => {
  it('throws for a non-function fetchFn', async () => {
    await expect(fetchRepo({ accessToken: TOKEN, fullName: FULL_NAME, fetchFn: null }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });
});
