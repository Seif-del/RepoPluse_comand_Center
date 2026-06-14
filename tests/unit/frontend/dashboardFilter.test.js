'use strict';

// Pure-logic unit tests for the repository list label filter and count display.
// Both are embedded in frontend/dashboard.html but have no DOM dependency —
// the pure data-transformation parts are copied verbatim here so Jest (node env)
// can run them without a browser or jsdom.
//
// filterRepos  — the repos.filter(...) predicate inside applyFilter()
// filterCountText — the countEl.textContent assignment inside renderReposTable()

// ── filterRepos (copied verbatim from applyFilter() in dashboard.html) ────────
function filterRepos(repos, activeFilter) {
  return repos.filter(function(r) {
    if (activeFilter === 'All')      return true;
    if (activeFilter === 'At Risk')  return r.label === 'critical' || r.label === 'at-risk';
    if (activeFilter === 'Healthy')  return r.label === 'healthy';
    return true;
  });
}

// ── filterCountText (copied verbatim from renderReposTable() in dashboard.html)
function filterCountText(filtered, allRepos, activeFilter) {
  if (activeFilter === 'All') {
    return filtered.length + ' repo' + (filtered.length !== 1 ? 's' : '');
  }
  return filtered.length + ' / ' + allRepos.length;
}

// ── Shared fixture ────────────────────────────────────────────────────────────

var REPOS = [
  { id: 1, fullName: 'org/alpha',   label: 'critical' },
  { id: 2, fullName: 'org/beta',    label: 'at-risk'  },
  { id: 3, fullName: 'org/gamma',   label: 'healthy'  },
  { id: 4, fullName: 'org/delta',   label: 'healthy'  },
  { id: 5, fullName: 'org/epsilon', label: 'at-risk'  },
];

// ── filterRepos — All ─────────────────────────────────────────────────────────

describe('filterRepos — All filter', () => {
  test('returns every repo from a mixed-label list', () => {
    expect(filterRepos(REPOS, 'All')).toHaveLength(5);
  });

  test('preserves original array order', () => {
    const result = filterRepos(REPOS, 'All');
    expect(result.map(function(r) { return r.id; })).toEqual([1, 2, 3, 4, 5]);
  });

  test('returns all repos when every entry is at-risk or critical', () => {
    const repos = [{ label: 'critical' }, { label: 'at-risk' }];
    expect(filterRepos(repos, 'All')).toHaveLength(2);
  });

  test('returns all repos when every entry is healthy', () => {
    const repos = [{ label: 'healthy' }, { label: 'healthy' }, { label: 'healthy' }];
    expect(filterRepos(repos, 'All')).toHaveLength(3);
  });

  test('returns empty array when list is empty', () => {
    expect(filterRepos([], 'All')).toHaveLength(0);
  });
});

// ── filterRepos — At Risk ─────────────────────────────────────────────────────

describe('filterRepos — At Risk filter', () => {
  test('includes repos with label critical', () => {
    const result = filterRepos(REPOS, 'At Risk');
    expect(result.some(function(r) { return r.label === 'critical'; })).toBe(true);
  });

  test('includes repos with label at-risk', () => {
    const result = filterRepos(REPOS, 'At Risk');
    expect(result.some(function(r) { return r.label === 'at-risk'; })).toBe(true);
  });

  test('excludes repos with label healthy', () => {
    const result = filterRepos(REPOS, 'At Risk');
    expect(result.every(function(r) { return r.label !== 'healthy'; })).toBe(true);
  });

  test('returns only critical and at-risk labels — no other labels present', () => {
    const result = filterRepos(REPOS, 'At Risk');
    result.forEach(function(r) {
      expect(['critical', 'at-risk']).toContain(r.label);
    });
  });

  test('returns correct count: 1 critical + 2 at-risk = 3', () => {
    expect(filterRepos(REPOS, 'At Risk')).toHaveLength(3);
  });

  test('repos with no label field are excluded', () => {
    const repos = [{ id: 1 }, { id: 2, label: 'critical' }];
    const result = filterRepos(repos, 'At Risk');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(2);
  });

  test('repos with unrecognised label are excluded', () => {
    const repos = [{ label: 'unknown' }, { label: 'at-risk' }];
    const result = filterRepos(repos, 'At Risk');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('at-risk');
  });
});

// ── filterRepos — Healthy ─────────────────────────────────────────────────────

describe('filterRepos — Healthy filter', () => {
  test('includes repos with label healthy', () => {
    const result = filterRepos(REPOS, 'Healthy');
    expect(result.every(function(r) { return r.label === 'healthy'; })).toBe(true);
  });

  test('excludes repos with label critical', () => {
    const result = filterRepos(REPOS, 'Healthy');
    expect(result.some(function(r) { return r.label === 'critical'; })).toBe(false);
  });

  test('excludes repos with label at-risk', () => {
    const result = filterRepos(REPOS, 'Healthy');
    expect(result.some(function(r) { return r.label === 'at-risk'; })).toBe(false);
  });

  test('returns correct count: 2 healthy repos in fixture', () => {
    expect(filterRepos(REPOS, 'Healthy')).toHaveLength(2);
  });

  test('returns exactly the healthy repos by id', () => {
    const result = filterRepos(REPOS, 'Healthy');
    expect(result.map(function(r) { return r.id; })).toEqual([3, 4]);
  });
});

// ── filterRepos — empty result ────────────────────────────────────────────────

describe('filterRepos — empty result', () => {
  test('At Risk on an all-healthy list returns empty array', () => {
    const allHealthy = [
      { id: 1, label: 'healthy' },
      { id: 2, label: 'healthy' },
      { id: 3, label: 'healthy' },
    ];
    expect(filterRepos(allHealthy, 'At Risk')).toHaveLength(0);
  });

  test('empty At Risk result is an Array, not null or undefined', () => {
    const result = filterRepos([{ label: 'healthy' }], 'At Risk');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  test('Healthy on an all-critical list returns empty array', () => {
    const allCritical = [
      { id: 1, label: 'critical' },
      { id: 2, label: 'critical' },
    ];
    expect(filterRepos(allCritical, 'Healthy')).toHaveLength(0);
  });

  test('Healthy on an all-at-risk list returns empty array', () => {
    const allAtRisk = [
      { id: 1, label: 'at-risk' },
      { id: 2, label: 'critical' },
    ];
    expect(filterRepos(allAtRisk, 'Healthy')).toHaveLength(0);
  });
});

// ── filterCountText — count display behavior ──────────────────────────────────

describe('filterCountText — All filter count display', () => {
  test('1 repo → singular "1 repo"', () => {
    expect(filterCountText([{}], [{}], 'All')).toBe('1 repo');
  });

  test('2 repos → plural "2 repos"', () => {
    expect(filterCountText([{}, {}], [{}, {}], 'All')).toBe('2 repos');
  });

  test('3 repos → plural "3 repos"', () => {
    const repos = [{}, {}, {}];
    expect(filterCountText(repos, repos, 'All')).toBe('3 repos');
  });

  test('0 repos → "0 repos"', () => {
    expect(filterCountText([], [], 'All')).toBe('0 repos');
  });
});

describe('filterCountText — non-All filter count display', () => {
  test('At Risk filter: 2 matched of 5 total → "2 / 5"', () => {
    const total    = new Array(5).fill({});
    const filtered = new Array(2).fill({});
    expect(filterCountText(filtered, total, 'At Risk')).toBe('2 / 5');
  });

  test('Healthy filter: 1 matched of 4 total → "1 / 4"', () => {
    const total    = new Array(4).fill({});
    const filtered = new Array(1).fill({});
    expect(filterCountText(filtered, total, 'Healthy')).toBe('1 / 4');
  });

  test('At Risk filter: 0 matched of 4 total → "0 / 4"', () => {
    const total = new Array(4).fill({});
    expect(filterCountText([], total, 'At Risk')).toBe('0 / 4');
  });

  test('filtered count and total count both appear in the display string', () => {
    const total    = new Array(10).fill({});
    const filtered = new Array(3).fill({});
    expect(filterCountText(filtered, total, 'Healthy')).toBe('3 / 10');
  });
});
