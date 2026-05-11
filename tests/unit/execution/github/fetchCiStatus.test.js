'use strict';

const { fetchCiStatus, FAILING_CONCLUSIONS } = require('../../../../execution/github/fetchCiStatus');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetch(status, body) {
  return async () => ({
    ok:   status >= 200 && status < 300,
    json: async () => body,
  });
}

function makeRun(conclusion, runStatus = 'completed') {
  return { status: runStatus, conclusion };
}

const VALID = {
  accessToken: 'gho_token',
  fullName:    'owner/repo',
  fetchFn:     makeFetch(200, { workflow_runs: [] }),
};

// ── FAILING_CONCLUSIONS export ────────────────────────────────────────────────

describe('fetchCiStatus — FAILING_CONCLUSIONS', () => {
  it('is a Set', () => {
    expect(FAILING_CONCLUSIONS).toBeInstanceOf(Set);
  });

  it('contains failure', () => {
    expect(FAILING_CONCLUSIONS.has('failure')).toBe(true);
  });

  it('contains timed_out', () => {
    expect(FAILING_CONCLUSIONS.has('timed_out')).toBe(true);
  });

  it('contains cancelled', () => {
    expect(FAILING_CONCLUSIONS.has('cancelled')).toBe(true);
  });

  it('does not contain success', () => {
    expect(FAILING_CONCLUSIONS.has('success')).toBe(false);
  });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('fetchCiStatus — validation', () => {
  it('throws INVALID_ACCESS_TOKEN when accessToken is missing', async () => {
    await expect(fetchCiStatus({ fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for an empty string', async () => {
    await expect(fetchCiStatus({ accessToken: '', fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for whitespace-only string', async () => {
    await expect(fetchCiStatus({ accessToken: '   ', fullName: 'o/r', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_FULL_NAME when fullName has no slash', async () => {
    await expect(fetchCiStatus({ accessToken: 'tok', fullName: 'noslash', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FULL_NAME when fullName is missing', async () => {
    await expect(fetchCiStatus({ accessToken: 'tok', fetchFn: VALID.fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_FULL_NAME' });
  });

  it('throws INVALID_FETCH_FN when fetchFn is not a function', async () => {
    await expect(fetchCiStatus({ accessToken: 'tok', fullName: 'o/r', fetchFn: null }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });

  it('throws INVALID_FETCH_FN when called with no args', async () => {
    await expect(fetchCiStatus())
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });
});

// ── Network / API failures → 'unknown' ───────────────────────────────────────

describe('fetchCiStatus — network failures return unknown', () => {
  it('returns unknown when fetchFn throws', async () => {
    const fetchFn = async () => { throw new Error('network error'); };
    const result = await fetchCiStatus({ accessToken: 'tok', fullName: 'o/r', fetchFn });
    expect(result).toBe('unknown');
  });

  it('returns unknown for a 403 response', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(403, {}) });
    expect(result).toBe('unknown');
  });

  it('returns unknown for a 404 response', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(404, {}) });
    expect(result).toBe('unknown');
  });

  it('returns unknown for a 500 response', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(500, {}) });
    expect(result).toBe('unknown');
  });

  it('returns unknown when res.json() throws', async () => {
    const fetchFn = async () => ({
      ok:   true,
      json: async () => { throw new Error('bad json'); },
    });
    const result = await fetchCiStatus({ ...VALID, fetchFn });
    expect(result).toBe('unknown');
  });

  it('returns unknown when workflow_runs is missing from response', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, {}) });
    expect(result).toBe('unknown');
  });

  it('returns unknown when workflow_runs is not an array', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: 'bad' }) });
    expect(result).toBe('unknown');
  });
});

// ── No completed runs → 'unknown' ────────────────────────────────────────────

describe('fetchCiStatus — no completed runs', () => {
  it('returns unknown when runs array is empty', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: [] }) });
    expect(result).toBe('unknown');
  });

  it('returns unknown when all runs are in_progress', async () => {
    const runs = [makeRun(null, 'in_progress'), makeRun(null, 'queued')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('unknown');
  });
});

// ── Passing runs ──────────────────────────────────────────────────────────────

describe('fetchCiStatus — passing', () => {
  it('returns passing when all completed runs have success conclusion', async () => {
    const runs = [makeRun('success'), makeRun('success')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('passing');
  });

  it('returns passing for a single success run', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: [makeRun('success')] }) });
    expect(result).toBe('passing');
  });

  it('ignores in_progress runs when computing passing status', async () => {
    const runs = [makeRun('success'), makeRun(null, 'in_progress')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('passing');
  });
});

// ── Failing runs ──────────────────────────────────────────────────────────────

describe('fetchCiStatus — failing', () => {
  it('returns failing when at least one completed run has failure conclusion', async () => {
    const runs = [makeRun('failure'), makeRun('success')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('failing');
  });

  it('returns failing for timed_out conclusion', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: [makeRun('timed_out')] }) });
    expect(result).toBe('failing');
  });

  it('returns failing for cancelled conclusion', async () => {
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: [makeRun('cancelled')] }) });
    expect(result).toBe('failing');
  });

  it('returns failing when all runs are failing', async () => {
    const runs = [makeRun('failure'), makeRun('failure'), makeRun('timed_out')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('failing');
  });

  it('ignores in_progress runs when determining failing', async () => {
    const runs = [makeRun('failure'), makeRun(null, 'queued')];
    const result = await fetchCiStatus({ ...VALID, fetchFn: makeFetch(200, { workflow_runs: runs }) });
    expect(result).toBe('failing');
  });
});

// ── Return type is always a string ───────────────────────────────────────────

describe('fetchCiStatus — return type', () => {
  it('always returns a string', async () => {
    const result = await fetchCiStatus({ ...VALID });
    expect(typeof result).toBe('string');
  });
});
