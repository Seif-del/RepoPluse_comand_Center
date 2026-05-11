'use strict';

const { fetchReleaseInfo, STALE_DAYS } = require('../../../../execution/github/fetchReleaseInfo');

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOW = new Date('2025-06-01T00:00:00.000Z');

function makeFetch(status, body) {
  return async () => ({
    ok:   status >= 200 && status < 300,
    json: async () => body,
  });
}

function makeRelease(daysAgo, tagName = 'v1.0.0') {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return { tag_name: tagName, name: tagName, published_at: d.toISOString() };
}

const VALID = {
  accessToken: 'gho_token',
  fullName:    'owner/repo',
  fetchFn:     makeFetch(200, []),
  now:         NOW,
};

// ── STALE_DAYS export ─────────────────────────────────────────────────────────

describe('fetchReleaseInfo — STALE_DAYS', () => {
  it('is a number', () => {
    expect(typeof STALE_DAYS).toBe('number');
  });

  it('is 90', () => {
    expect(STALE_DAYS).toBe(90);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('fetchReleaseInfo — validation', () => {
  it('throws INVALID_ACCESS_TOKEN when accessToken is missing', async () => {
    await expect(fetchReleaseInfo({ fullName: 'o/r', fetchFn: VALID.fetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for an empty string', async () => {
    await expect(fetchReleaseInfo({ accessToken: '', fullName: 'o/r', fetchFn: VALID.fetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for whitespace-only string', async () => {
    await expect(fetchReleaseInfo({ accessToken: '   ', fullName: 'o/r', fetchFn: VALID.fetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_FULL_NAME when fullName has no slash', async () => {
    await expect(fetchReleaseInfo({ accessToken: 'tok', fullName: 'noslash', fetchFn: VALID.fetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FULL_NAME when fullName is missing', async () => {
    await expect(fetchReleaseInfo({ accessToken: 'tok', fetchFn: VALID.fetchFn, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FETCH_FN when fetchFn is not a function', async () => {
    await expect(fetchReleaseInfo({ accessToken: 'tok', fullName: 'o/r', fetchFn: null, now: NOW }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });

  it('throws INVALID_ACCESS_TOKEN when called with no args', async () => {
    await expect(fetchReleaseInfo())
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });
});

// ── Network / API failures → 'unknown' ───────────────────────────────────────

describe('fetchReleaseInfo — network failures return unknown', () => {
  it('returns unknown when fetchFn throws', async () => {
    const fetchFn = async () => { throw new Error('network error'); };
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('unknown');
    expect(result.latestReleaseName).toBeNull();
    expect(result.latestReleasePublishedAt).toBeNull();
  });

  it('returns unknown for a 403 response', async () => {
    const result = await fetchReleaseInfo({ ...VALID, fetchFn: makeFetch(403, []) });
    expect(result.releaseStatus).toBe('unknown');
  });

  it('returns unknown for a 404 response', async () => {
    const result = await fetchReleaseInfo({ ...VALID, fetchFn: makeFetch(404, []) });
    expect(result.releaseStatus).toBe('unknown');
  });

  it('returns unknown for a 500 response', async () => {
    const result = await fetchReleaseInfo({ ...VALID, fetchFn: makeFetch(500, []) });
    expect(result.releaseStatus).toBe('unknown');
  });

  it('returns unknown when res.json() throws', async () => {
    const fetchFn = async () => ({
      ok:   true,
      json: async () => { throw new Error('bad json'); },
    });
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('unknown');
  });

  it('returns unknown when response body is not an array', async () => {
    const result = await fetchReleaseInfo({ ...VALID, fetchFn: makeFetch(200, { releases: [] }) });
    expect(result.releaseStatus).toBe('unknown');
  });
});

// ── No releases → 'none' ──────────────────────────────────────────────────────

describe('fetchReleaseInfo — no releases', () => {
  it('returns none when releases array is empty', async () => {
    const result = await fetchReleaseInfo({ ...VALID, fetchFn: makeFetch(200, []) });
    expect(result.releaseStatus).toBe('none');
    expect(result.latestReleaseName).toBeNull();
    expect(result.latestReleasePublishedAt).toBeNull();
  });
});

// ── Healthy release ───────────────────────────────────────────────────────────

describe('fetchReleaseInfo — healthy release', () => {
  it('returns healthy when release is 1 day old', async () => {
    const fetchFn = makeFetch(200, [makeRelease(1)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('healthy');
  });

  it('returns healthy when release is 89 days old (just under threshold)', async () => {
    const fetchFn = makeFetch(200, [makeRelease(89)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('healthy');
  });

  it('returns the release name', async () => {
    const fetchFn = makeFetch(200, [makeRelease(10, 'v2.3.1')]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleaseName).toBe('v2.3.1');
  });

  it('returns latestReleasePublishedAt as a Date object', async () => {
    const fetchFn = makeFetch(200, [makeRelease(30)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleasePublishedAt).toBeInstanceOf(Date);
  });
});

// ── Stale release ─────────────────────────────────────────────────────────────

describe('fetchReleaseInfo — stale release', () => {
  it('returns stale when release is exactly 90 days old', async () => {
    const fetchFn = makeFetch(200, [makeRelease(90)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('stale');
  });

  it('returns stale when release is 180 days old', async () => {
    const fetchFn = makeFetch(200, [makeRelease(180)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('stale');
  });

  it('returns stale when release is 365 days old', async () => {
    const fetchFn = makeFetch(200, [makeRelease(365)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('stale');
  });

  it('still populates latestReleaseName when stale', async () => {
    const fetchFn = makeFetch(200, [makeRelease(100, 'v0.9.0')]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleaseName).toBe('v0.9.0');
  });

  it('still populates latestReleasePublishedAt when stale', async () => {
    const fetchFn = makeFetch(200, [makeRelease(120)]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleasePublishedAt).toBeInstanceOf(Date);
  });
});

// ── Edge cases for release data ────────────────────────────────────────────────

describe('fetchReleaseInfo — release data edge cases', () => {
  it('uses tag_name preferentially over name', async () => {
    const release = { tag_name: 'v3.0.0', name: 'Release 3', published_at: makeRelease(10).published_at };
    const fetchFn = makeFetch(200, [release]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleaseName).toBe('v3.0.0');
  });

  it('falls back to name when tag_name is absent', async () => {
    const release = { tag_name: null, name: 'Hotfix', published_at: makeRelease(5).published_at };
    const fetchFn = makeFetch(200, [release]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleaseName).toBe('Hotfix');
  });

  it('returns releaseStatus unknown when published_at is null', async () => {
    const release = { tag_name: 'v1.0.0', name: 'v1.0.0', published_at: null };
    const fetchFn = makeFetch(200, [release]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('unknown');
    expect(result.latestReleaseName).toBe('v1.0.0');
    expect(result.latestReleasePublishedAt).toBeNull();
  });

  it('returns releaseStatus unknown when published_at is an invalid date string', async () => {
    const release = { tag_name: 'v1.0.0', name: 'v1.0.0', published_at: 'not-a-date' };
    const fetchFn = makeFetch(200, [release]);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.releaseStatus).toBe('unknown');
  });

  it('only uses the first (most recent) release when multiple are returned', async () => {
    const releases = [makeRelease(5, 'v2.0.0'), makeRelease(200, 'v1.0.0')];
    const fetchFn = makeFetch(200, releases);
    const result = await fetchReleaseInfo({ ...VALID, fetchFn });
    expect(result.latestReleaseName).toBe('v2.0.0');
    expect(result.releaseStatus).toBe('healthy');
  });

  it('defaults now to current date when omitted', async () => {
    const fetchFn = makeFetch(200, [makeRelease(5)]);
    const result = await fetchReleaseInfo({ accessToken: 'tok', fullName: 'o/r', fetchFn });
    expect(['healthy', 'stale', 'unknown']).toContain(result.releaseStatus);
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe('fetchReleaseInfo — return shape', () => {
  it('always returns latestReleaseName, latestReleasePublishedAt, releaseStatus', async () => {
    const result = await fetchReleaseInfo({ ...VALID });
    expect(result).toHaveProperty('latestReleaseName');
    expect(result).toHaveProperty('latestReleasePublishedAt');
    expect(result).toHaveProperty('releaseStatus');
  });

  it('releaseStatus is always a string', async () => {
    const result = await fetchReleaseInfo({ ...VALID });
    expect(typeof result.releaseStatus).toBe('string');
  });
});
