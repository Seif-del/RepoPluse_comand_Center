'use strict';

const {
  fetchPullRequestHealth,
  STALE_DAYS,
  ABANDONED_DAYS,
  WINDOW_DAYS,
} = require('../../../../execution/github/fetchPullRequestHealth');

// ── Constants ─────────────────────────────────────────────────────────────────

const NOW_MS        = 1716206400000; // 2024-05-20T12:00:00Z (fixed clock)
const NOW_ISO       = new Date(NOW_MS).toISOString();
const STALE_MS      = STALE_DAYS     * 24 * 60 * 60 * 1000;
const ABANDONED_MS  = ABANDONED_DAYS * 24 * 60 * 60 * 1000;
const WINDOW_MS     = WINDOW_DAYS    * 24 * 60 * 60 * 1000;
const HOUR_MS       = 60 * 60 * 1000;
const DAY_MS        = 24 * HOUR_MS;

// ── Helpers ───────────────────────────────────────────────────────────────────

function msAgo(ms) {
  return new Date(NOW_MS - ms).toISOString();
}

function daysAgo(d) {
  return msAgo(d * DAY_MS);
}

function makePr(overrides = {}) {
  return {
    number:     1,
    state:      'open',
    created_at: daysAgo(1),
    merged_at:  null,
    head:       { sha: 'abc123' },
    additions:  10,
    deletions:  5,
    ...overrides,
  };
}

function makeCheckRuns(conclusions = []) {
  return {
    check_runs: conclusions.map((c, i) => ({ id: i, conclusion: c })),
  };
}

// Builds a fetchFn that handles both pulls and check-run endpoints.
// pullsOpen / pullsClosed — arrays for open/closed pulls responses
// checkRunsMap — { sha: conclusions[] } for commit check-run responses
function makeFetch({ openPrs = [], closedPrs = [], checkRunsMap = {}, failOnOpen = false, failOnClosed = false } = {}) {
  return async (url) => {
    if (url.includes('/pulls?state=open')) {
      if (failOnOpen) throw new Error('network error');
      return { ok: true, status: 200, json: async () => openPrs };
    }
    if (url.includes('/pulls?state=closed')) {
      if (failOnClosed) throw new Error('network error');
      return { ok: true, status: 200, json: async () => closedPrs };
    }
    // check-runs: /repos/owner/repo/commits/:sha/check-runs
    const shaMatch = url.match(/\/commits\/([^/]+)\/check-runs/);
    if (shaMatch) {
      const sha = shaMatch[1];
      const conclusions = checkRunsMap[sha];
      if (conclusions === undefined) {
        // No entry → return empty check runs
        return { ok: true, status: 200, json: async () => makeCheckRuns([]) };
      }
      if (conclusions === null) throw new Error('check-run network error');
      return { ok: true, status: 200, json: async () => makeCheckRuns(conclusions) };
    }
    return { ok: false, status: 404, json: async () => null };
  };
}

const VALID = {
  accessToken: 'gho_token',
  owner:       'my-org',
  repo:        'my-repo',
  opts:        { _nowMs: NOW_MS },
};

// ── Exported constants ─────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — exported constants', () => {
  it('STALE_DAYS is 7', () => { expect(STALE_DAYS).toBe(7); });
  it('ABANDONED_DAYS is 30', () => { expect(ABANDONED_DAYS).toBe(30); });
  it('WINDOW_DAYS is 30', () => { expect(WINDOW_DAYS).toBe(30); });
});

// ── Validation errors ─────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — validation', () => {
  it('throws INVALID_ACCESS_TOKEN when accessToken is missing', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ owner: 'o', repo: 'r', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for an empty accessToken', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: '', owner: 'o', repo: 'r', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_ACCESS_TOKEN for whitespace-only accessToken', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: '   ', owner: 'o', repo: 'r', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });

  it('throws INVALID_OWNER when owner is missing', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: 'tok', repo: 'r', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_OWNER' });
  });

  it('throws INVALID_OWNER for an empty owner', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: 'tok', owner: '', repo: 'r', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_OWNER' });
  });

  it('throws INVALID_REPO when repo is missing', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: 'tok', owner: 'o', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_REPO' });
  });

  it('throws INVALID_REPO for an empty repo', async () => {
    const fetchFn = makeFetch();
    await expect(fetchPullRequestHealth({ accessToken: 'tok', owner: 'o', repo: '', fetchFn }))
      .rejects.toMatchObject({ code: 'INVALID_REPO' });
  });

  it('throws INVALID_FETCH_FN when fetchFn is not a function', async () => {
    await expect(fetchPullRequestHealth({ accessToken: 'tok', owner: 'o', repo: 'r', fetchFn: null }))
      .rejects.toMatchObject({ code: 'INVALID_FETCH_FN' });
  });

  it('throws INVALID_ACCESS_TOKEN when called with no args', async () => {
    await expect(fetchPullRequestHealth())
      .rejects.toMatchObject({ code: 'INVALID_ACCESS_TOKEN' });
  });
});

// ── Network / API failures → 'unknown' ───────────────────────────────────────

describe('fetchPullRequestHealth — network failures return unknown', () => {
  it('returns unknown when open PRs fetch throws', async () => {
    const fetchFn = makeFetch({ failOnOpen: true });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
    expect(result.openPrCount).toBeNull();
  });

  it('returns unknown when closed PRs fetch throws', async () => {
    const fetchFn = makeFetch({ failOnClosed: true });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
  });

  it('returns unknown when open PRs response is not an array', async () => {
    const fetchFn = async (url) => {
      if (url.includes('state=open'))   return { ok: true, status: 200, json: async () => ({ error: true }) };
      return { ok: true, status: 200, json: async () => [] };
    };
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
  });

  it('returns unknown when closed PRs response is not an array', async () => {
    const fetchFn = async (url) => {
      if (url.includes('state=open'))   return { ok: true, status: 200, json: async () => [] };
      if (url.includes('state=closed')) return { ok: true, status: 200, json: async () => 'bad' };
      return { ok: false, status: 404, json: async () => null };
    };
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
  });

  it('returns unknown on HTTP 403 for open PRs', async () => {
    const fetchFn = async (url) => {
      if (url.includes('state=open'))   return { ok: false, status: 403, json: async () => null };
      return { ok: true, status: 200, json: async () => [] };
    };
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
  });

  it('returns unknown on HTTP 404 for closed PRs', async () => {
    const fetchFn = async (url) => {
      if (url.includes('state=open'))   return { ok: true, status: 200, json: async () => [] };
      if (url.includes('state=closed')) return { ok: false, status: 404, json: async () => null };
      return { ok: false, status: 404, json: async () => null };
    };
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('unknown');
  });
});

// ── Empty PR history → 'none' ─────────────────────────────────────────────────

describe('fetchPullRequestHealth — empty PR history', () => {
  it('returns prTelemetryStatus none when no open or closed PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('none');
  });

  it('returns zero counts when no PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.openPrCount).toBe(0);
    expect(result.mergedPrCount30d).toBe(0);
    expect(result.stalePrCount).toBe(0);
    expect(result.abandonedPrCount).toBe(0);
    expect(result.failedCheckPrCount).toBe(0);
    expect(result.throughput30d).toBe(0);
  });

  it('returns null for metrics that require data when no PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgMergeLatencyHours).toBeNull();
    expect(result.avgPrSize).toBeNull();
    expect(result.oldestOpenPrAgeDays).toBeNull();
  });
});

// ── Open PR metrics ───────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — open PR counts', () => {
  it('counts open PRs correctly', async () => {
    const openPrs = [makePr(), makePr({ number: 2 }), makePr({ number: 3 })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.openPrCount).toBe(3);
  });

  it('reports prTelemetryStatus active when there are open PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [makePr()], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('active');
  });
});

// ── Stale PR detection (>7 days open, not abandoned) ─────────────────────────

describe('fetchPullRequestHealth — stale PR detection', () => {
  it('counts a PR open for exactly 8 days as stale', async () => {
    const pr = makePr({ created_at: daysAgo(8) });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.stalePrCount).toBe(1);
  });

  it('does not count a PR open for exactly 7 days as stale', async () => {
    const pr = makePr({ created_at: msAgo(STALE_MS) });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.stalePrCount).toBe(0);
  });

  it('does not count an abandoned PR (>30d) as stale', async () => {
    const pr = makePr({ created_at: daysAgo(35) });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.stalePrCount).toBe(0);
    expect(result.abandonedPrCount).toBe(1);
  });

  it('counts 0 stale when all open PRs are fresh', async () => {
    const openPrs = [makePr({ created_at: daysAgo(1) }), makePr({ number: 2, created_at: daysAgo(3) })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.stalePrCount).toBe(0);
  });
});

// ── Abandoned PR detection (>30 days open) ────────────────────────────────────

describe('fetchPullRequestHealth — abandoned PR detection', () => {
  it('counts a PR open for 31 days as abandoned', async () => {
    const pr = makePr({ created_at: daysAgo(31) });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.abandonedPrCount).toBe(1);
  });

  it('does not count a PR open for exactly 30 days as abandoned', async () => {
    const pr = makePr({ created_at: msAgo(ABANDONED_MS) });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.abandonedPrCount).toBe(0);
  });

  it('counts 0 abandoned when all PRs are within 30 days', async () => {
    const openPrs = [makePr({ created_at: daysAgo(5) }), makePr({ number: 2, created_at: daysAgo(20) })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.abandonedPrCount).toBe(0);
  });
});

// ── Oldest open PR age ────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — oldestOpenPrAgeDays', () => {
  it('returns null when there are no open PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.oldestOpenPrAgeDays).toBeNull();
  });

  it('returns age of oldest PR when there are open PRs', async () => {
    const openPrs = [
      makePr({ created_at: daysAgo(5) }),
      makePr({ number: 2, created_at: daysAgo(15) }),
      makePr({ number: 3, created_at: daysAgo(3) }),
    ];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.oldestOpenPrAgeDays).toBe(15);
  });

  it('returns 1 decimal place for fractional ages', async () => {
    const halfDayAgo = msAgo(36 * HOUR_MS); // 1.5 days
    const fetchFn = makeFetch({ openPrs: [makePr({ created_at: halfDayAgo })], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.oldestOpenPrAgeDays).toBe(1.5);
  });
});

// ── Merged PR throughput (30d window) ─────────────────────────────────────────

describe('fetchPullRequestHealth — mergedPrCount30d and throughput30d', () => {
  it('counts merged PRs within 30-day window', async () => {
    const closedPrs = [
      makePr({ state: 'closed', merged_at: daysAgo(5),  created_at: daysAgo(7)  }),
      makePr({ state: 'closed', merged_at: daysAgo(10), created_at: daysAgo(12) }),
      makePr({ state: 'closed', merged_at: daysAgo(31), created_at: daysAgo(33) }), // outside window
    ];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.mergedPrCount30d).toBe(2);
  });

  it('excludes closed-but-not-merged PRs from mergedPrCount30d', async () => {
    const closedPrs = [
      makePr({ state: 'closed', merged_at: null, created_at: daysAgo(5) }), // closed without merge
      makePr({ state: 'closed', merged_at: daysAgo(3), created_at: daysAgo(5) }),
    ];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.mergedPrCount30d).toBe(1);
  });

  it('computes throughput30d as mergedCount / (30/7) weeks', async () => {
    const closedPrs = Array.from({ length: 7 }, (_, i) =>
      makePr({ state: 'closed', merged_at: daysAgo(i + 1), created_at: daysAgo(i + 2) })
    );
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    // 7 PRs / (30/7 weeks) = 7 / 4.2857... ≈ 1.6
    expect(result.throughput30d).toBeCloseTo(1.6, 1);
  });

  it('returns throughput30d 0 when no merged PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.throughput30d).toBe(0);
  });
});

// ── Merge latency ─────────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — avgMergeLatencyHours', () => {
  it('returns null when no merged PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgMergeLatencyHours).toBeNull();
  });

  it('computes latency as hours from created_at to merged_at', async () => {
    // 2 hours from open to merge
    const created = msAgo(HOUR_MS * 2);
    const merged  = NOW_ISO;
    const closedPrs = [makePr({ state: 'closed', created_at: created, merged_at: merged })];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgMergeLatencyHours).toBe(2);
  });

  it('averages latency across multiple merged PRs', async () => {
    const closedPrs = [
      makePr({ state: 'closed', created_at: msAgo(4 * HOUR_MS), merged_at: NOW_ISO }),  // 4h
      makePr({ state: 'closed', created_at: msAgo(2 * HOUR_MS), merged_at: NOW_ISO }),  // 2h
    ];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgMergeLatencyHours).toBe(3); // average of 4 and 2
  });

  it('returns 1 decimal place for fractional hours', async () => {
    const closedPrs = [
      makePr({ state: 'closed', created_at: msAgo(1.5 * HOUR_MS), merged_at: NOW_ISO }),
    ];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgMergeLatencyHours).toBe(1.5);
  });
});

// ── PR size (additions + deletions) ──────────────────────────────────────────

describe('fetchPullRequestHealth — avgPrSize', () => {
  it('returns null when no PRs have size data', async () => {
    const openPrs = [makePr({ additions: undefined, deletions: undefined })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgPrSize).toBeNull();
  });

  it('averages additions + deletions across open PRs', async () => {
    const openPrs = [
      makePr({ additions: 10, deletions: 5 }),   // size 15
      makePr({ number: 2, additions: 20, deletions: 5 }), // size 25
    ];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgPrSize).toBe(20); // (15 + 25) / 2
  });

  it('includes merged PRs in the 30d window in avgPrSize', async () => {
    const closedPrs = [
      makePr({ state: 'closed', merged_at: daysAgo(5), created_at: daysAgo(7), additions: 100, deletions: 50 }),
    ];
    const fetchFn = makeFetch({ openPrs: [], closedPrs });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.avgPrSize).toBe(150);
  });
});

// ── Failed check PRs ──────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — failedCheckPrCount', () => {
  it('counts 0 failed check PRs when all checks pass', async () => {
    const openPrs = [makePr({ head: { sha: 'sha1' } })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [], checkRunsMap: { sha1: ['success', 'success'] } });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(0);
  });

  it('counts 1 failed check PR when a check has conclusion failure', async () => {
    const openPrs = [makePr({ head: { sha: 'sha1' } })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [], checkRunsMap: { sha1: ['success', 'failure'] } });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(1);
  });

  it('counts a PR with timed_out conclusion as failed', async () => {
    const openPrs = [makePr({ head: { sha: 'sha1' } })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [], checkRunsMap: { sha1: ['timed_out'] } });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(1);
  });

  it('counts 2 failed check PRs when multiple PRs have failures', async () => {
    const openPrs = [
      makePr({ head: { sha: 'sha1' } }),
      makePr({ number: 2, head: { sha: 'sha2' } }),
    ];
    const fetchFn = makeFetch({ openPrs, closedPrs: [], checkRunsMap: { sha1: ['failure'], sha2: ['failure'] } });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(2);
  });

  it('skips check-run fetch when PR has no head sha', async () => {
    const openPrs = [makePr({ head: null })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(0);
  });

  it('treats a check-run API error as 0 failures for that PR (graceful)', async () => {
    const openPrs = [makePr({ head: { sha: 'sha1' } })];
    const fetchFn = makeFetch({ openPrs, closedPrs: [], checkRunsMap: { sha1: null } }); // null → throws
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(0);
  });

  it('returns 0 failedCheckPrCount when there are no open PRs', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.failedCheckPrCount).toBe(0);
  });
});

// ── Solo-maintainer: no review diversity penalties ────────────────────────────

describe('fetchPullRequestHealth — solo-maintainer assumptions', () => {
  it('does not include reviewer fields in the returned object', async () => {
    const fetchFn = makeFetch({ openPrs: [makePr()], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result).not.toHaveProperty('reviewerCount');
    expect(result).not.toHaveProperty('reviewDiversityScore');
    expect(result).not.toHaveProperty('unreviewedMergeCount');
  });

  it('does not set prTelemetryStatus to unhealthy solely because PRs have no reviewers', async () => {
    // PR explicitly has no reviewers (requested_reviewers empty)
    const pr = makePr({ requested_reviewers: [] });
    const fetchFn = makeFetch({ openPrs: [pr], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(result.prTelemetryStatus).toBe('active');
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — return shape', () => {
  const EXPECTED_KEYS = [
    'openPrCount', 'mergedPrCount30d', 'stalePrCount', 'avgMergeLatencyHours',
    'failedCheckPrCount', 'avgPrSize', 'throughput30d', 'abandonedPrCount',
    'oldestOpenPrAgeDays', 'prTelemetryStatus',
  ];

  it('active result contains all expected keys', async () => {
    const fetchFn = makeFetch({ openPrs: [makePr()], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    for (const key of EXPECTED_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  it('unknown result contains all expected keys', async () => {
    const fetchFn = makeFetch({ failOnOpen: true });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    for (const key of EXPECTED_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  it('none result contains all expected keys', async () => {
    const fetchFn = makeFetch({ openPrs: [], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    for (const key of EXPECTED_KEYS) {
      expect(result).toHaveProperty(key);
    }
  });

  it('prTelemetryStatus is always a string', async () => {
    const fetchFn = makeFetch({ openPrs: [makePr()], closedPrs: [] });
    const result = await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(typeof result.prTelemetryStatus).toBe('string');
  });
});

// ── API URL construction ──────────────────────────────────────────────────────

describe('fetchPullRequestHealth — API URL', () => {
  it('uses the owner and repo in the URL', async () => {
    const urls = [];
    const fetchFn = async (url) => {
      urls.push(url);
      if (url.includes('state=open'))   return { ok: true, status: 200, json: async () => [] };
      if (url.includes('state=closed')) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => makeCheckRuns([]) };
    };
    await fetchPullRequestHealth({ ...VALID, owner: 'my-org', repo: 'my-repo', fetchFn });
    expect(urls.some(u => u.includes('/repos/my-org/my-repo/'))).toBe(true);
  });

  it('includes per_page=100 in pulls requests', async () => {
    const urls = [];
    const fetchFn = async (url) => {
      urls.push(url);
      if (url.includes('state=open'))   return { ok: true, status: 200, json: async () => [] };
      if (url.includes('state=closed')) return { ok: true, status: 200, json: async () => [] };
      return { ok: true, status: 200, json: async () => makeCheckRuns([]) };
    };
    await fetchPullRequestHealth({ ...VALID, fetchFn });
    expect(urls.some(u => u.includes('per_page=100'))).toBe(true);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('fetchPullRequestHealth — determinism', () => {
  it('returns identical results for two calls with the same input', async () => {
    const openPrs = [makePr({ created_at: daysAgo(10) }), makePr({ number: 2, created_at: daysAgo(2) })];
    const closedPrs = [
      makePr({ state: 'closed', merged_at: daysAgo(5), created_at: daysAgo(8) }),
    ];
    const fetchFn = makeFetch({ openPrs, closedPrs });
    const [r1, r2] = await Promise.all([
      fetchPullRequestHealth({ ...VALID, fetchFn }),
      fetchPullRequestHealth({ ...VALID, fetchFn }),
    ]);
    expect(r1).toEqual(r2);
  });
});
