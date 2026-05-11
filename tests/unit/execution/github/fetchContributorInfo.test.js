'use strict';

const {
  fetchContributorInfo,
  BUS_FACTOR_PCT,
  LOW_ACTIVITY_MAX,
} = require('../../../../execution/github/fetchContributorInfo');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(status, body) {
  return async () => ({
    status,
    ok:   status >= 200 && status < 300,
    json: async () => body,
  });
}

function makeContributor(login, contributions) {
  return { login, contributions };
}

const VALID = {
  accessToken: 'gho_token',
  fullName:    'owner/repo',
  fetchFn:     makeFetch(200, []),
};

// ── Exported constants ────────────────────────────────────────────────────────

describe('fetchContributorInfo — exported constants', () => {
  it('BUS_FACTOR_PCT is a number', () => {
    expect(typeof BUS_FACTOR_PCT).toBe('number');
  });

  it('BUS_FACTOR_PCT is 75', () => {
    expect(BUS_FACTOR_PCT).toBe(75);
  });

  it('LOW_ACTIVITY_MAX is a number', () => {
    expect(typeof LOW_ACTIVITY_MAX).toBe('number');
  });

  it('LOW_ACTIVITY_MAX is 2', () => {
    expect(LOW_ACTIVITY_MAX).toBe(2);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('fetchContributorInfo — validation', () => {
  it('throws INVALID_ACCESS_TOKEN when accessToken is missing', async () => {
    await expect(fetchContributorInfo({ fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for an empty string', async () => {
    await expect(fetchContributorInfo({ accessToken: '', fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for whitespace-only string', async () => {
    await expect(fetchContributorInfo({ accessToken: '   ', fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_FULL_NAME when fullName has no slash', async () => {
    await expect(fetchContributorInfo({ accessToken: 'tok', fullName: 'noslash', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FULL_NAME when fullName is missing', async () => {
    await expect(fetchContributorInfo({ accessToken: 'tok', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FETCH_FN when fetchFn is not a function', async () => {
    await expect(fetchContributorInfo({ accessToken: 'tok', fullName: 'o/r', fetchFn: null }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });

  it('throws INVALID_ACCESS_TOKEN when called with no args', async () => {
    await expect(fetchContributorInfo())
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });
});

// ── Network / API failures → 'unknown' ───────────────────────────────────────

describe('fetchContributorInfo — network failures return unknown', () => {
  it('returns unknown when fetchFn throws', async () => {
    const fetchFn = async () => { throw new Error('network error'); };
    const result = await fetchContributorInfo({ ...VALID, fetchFn });
    expect(result.contributorStatus).toBe('unknown');
    expect(result.activeContributorCount).toBeNull();
    expect(result.topContributorPercentage).toBeNull();
  });

  it('returns unknown for a 403 response', async () => {
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(403, []) });
    expect(result.contributorStatus).toBe('unknown');
  });

  it('returns unknown for a 404 response', async () => {
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(404, []) });
    expect(result.contributorStatus).toBe('unknown');
  });

  it('returns unknown for a 500 response', async () => {
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(500, []) });
    expect(result.contributorStatus).toBe('unknown');
  });

  it('returns unknown when res.json() throws', async () => {
    const fetchFn = async () => ({
      status: 200,
      ok:     true,
      json:   async () => { throw new Error('bad json'); },
    });
    const result = await fetchContributorInfo({ ...VALID, fetchFn });
    expect(result.contributorStatus).toBe('unknown');
  });

  it('returns unknown when response body is not an array', async () => {
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, { contributors: [] }) });
    expect(result.contributorStatus).toBe('unknown');
  });
});

// ── Abandoned (204 or empty array) ────────────────────────────────────────────

describe('fetchContributorInfo — abandoned', () => {
  it('returns abandoned for a 204 No Content response', async () => {
    const fetchFn = async () => ({ status: 204, ok: true, json: async () => [] });
    const result = await fetchContributorInfo({ ...VALID, fetchFn });
    expect(result.contributorStatus).toBe('abandoned');
    expect(result.activeContributorCount).toBe(0);
    expect(result.topContributorPercentage).toBeNull();
  });

  it('returns abandoned when the contributors array is empty', async () => {
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, []) });
    expect(result.contributorStatus).toBe('abandoned');
    expect(result.activeContributorCount).toBe(0);
    expect(result.topContributorPercentage).toBeNull();
  });
});

// ── Bus factor risk ───────────────────────────────────────────────────────────

describe('fetchContributorInfo — bus_factor_risk', () => {
  it('returns bus_factor_risk when one contributor owns > 75% with a single contributor', async () => {
    const data = [makeContributor('alice', 100)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('bus_factor_risk');
  });

  it('returns bus_factor_risk when top contributor owns 76% with 2 contributors', async () => {
    const data = [makeContributor('alice', 76), makeContributor('bob', 24)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('bus_factor_risk');
  });

  it('returns bus_factor_risk when top contributor owns exactly 75.1%', async () => {
    const data = [makeContributor('alice', 751), makeContributor('bob', 100), makeContributor('carol', 100), makeContributor('dan', 49)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('bus_factor_risk');
  });

  it('returns bus_factor_risk even with 5 contributors when one dominates', async () => {
    const data = [
      makeContributor('alice', 800),
      makeContributor('bob', 50),
      makeContributor('carol', 50),
      makeContributor('dan', 50),
      makeContributor('eve', 50),
    ];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('bus_factor_risk');
    expect(result.activeContributorCount).toBe(5);
  });

  it('computes topContributorPercentage correctly for bus factor case', async () => {
    const data = [makeContributor('alice', 80), makeContributor('bob', 20)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.topContributorPercentage).toBe(80);
  });
});

// ── Low activity ──────────────────────────────────────────────────────────────

describe('fetchContributorInfo — low_activity', () => {
  it('returns low_activity for exactly 2 contributors with no bus factor', async () => {
    const data = [makeContributor('alice', 55), makeContributor('bob', 45)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('low_activity');
    expect(result.activeContributorCount).toBe(2);
  });

  it('computes topContributorPercentage correctly for low_activity', async () => {
    const data = [makeContributor('alice', 55), makeContributor('bob', 45)];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.topContributorPercentage).toBe(55);
  });
});

// ── Healthy ───────────────────────────────────────────────────────────────────

describe('fetchContributorInfo — healthy', () => {
  it('returns healthy for exactly 3 contributors with no bus factor', async () => {
    const data = [
      makeContributor('alice', 40),
      makeContributor('bob', 35),
      makeContributor('carol', 25),
    ];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('healthy');
    expect(result.activeContributorCount).toBe(3);
  });

  it('returns healthy for exactly 75% top contributor (boundary — not over)', async () => {
    const data = [
      makeContributor('alice', 75),
      makeContributor('bob', 13),
      makeContributor('carol', 12),
    ];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('healthy');
  });

  it('computes topContributorPercentage to 1 decimal place', async () => {
    const data = [
      makeContributor('alice', 1),
      makeContributor('bob', 1),
      makeContributor('carol', 1),
    ];
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.topContributorPercentage).toBeCloseTo(33.3, 1);
  });

  it('returns healthy for a large contributor pool', async () => {
    const data = Array.from({ length: 10 }, (_, i) => makeContributor(`user${i}`, 10));
    const result = await fetchContributorInfo({ ...VALID, fetchFn: makeFetch(200, data) });
    expect(result.contributorStatus).toBe('healthy');
    expect(result.activeContributorCount).toBe(10);
    expect(result.topContributorPercentage).toBe(10);
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe('fetchContributorInfo — return shape', () => {
  it('always returns activeContributorCount, topContributorPercentage, contributorStatus', async () => {
    const result = await fetchContributorInfo({ ...VALID });
    expect(result).toHaveProperty('activeContributorCount');
    expect(result).toHaveProperty('topContributorPercentage');
    expect(result).toHaveProperty('contributorStatus');
  });

  it('contributorStatus is always a string', async () => {
    const result = await fetchContributorInfo({ ...VALID });
    expect(typeof result.contributorStatus).toBe('string');
  });
});
