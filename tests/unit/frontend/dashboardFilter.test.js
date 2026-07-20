'use strict';

// Pure-logic unit tests for the Repository Status filter and count display.
// Both are embedded in frontend/dashboard.html but have no DOM dependency —
// the pure data-transformation parts are copied verbatim here so Jest (node env)
// can run them without a browser or jsdom.
//
// filterRepos     — the repos.filter(...) predicate inside applyFilter()
// filterCountText — the countEl.textContent assignment inside renderReposTable()
//
// Filter controls are now exactly: All, Needs Attention. The "Healthy" filter
// button/state has been removed entirely — Architectural Priority 'healthy'
// still exists as a value and remains visible under All, it just has no
// dedicated filter button anymore.
//
// "Needs Attention" filters on Architectural Priority (computeRepoPriority()),
// not on the operational repo.label. computeRepoPriority() is copied verbatim
// below (same copy already exercised exhaustively in dashboardRepoPriority.test.js)
// so filterRepos() here matches dashboard.html's getRepoPriority()-based predicate
// exactly. resolveRepoPriorityInputs()'s cache lookup (_attentionMap /
// _repoIntelligenceById) is intentionally not reproduced — it is a trivial
// keyed passthrough, not logic under test — so fixtures below attach
// aq/archData/fcData directly, equivalent to what that lookup would resolve.

// ── computeRepoPriority (copied verbatim from dashboard.html) ─────────────────
function computeRepoPriority(repo, aq, archData, fcData) {
  var archSev;
  if (archData !== undefined) {
    if (archData && archData.architectureHealthLevel) {
      var hl = archData.architectureHealthLevel;
      archSev = hl === 'risky'   ? 1.00
              : hl === 'weak'    ? 0.67
              : hl === 'watch'   ? 0.33
              : hl === 'healthy' ? 0.00
              :                    0.33;
    } else {
      archSev = 0.33;
    }
  } else {
    var s = repo ? repo.score : null;
    if (s == null)    { archSev = 0.33; }
    else if (s >= 70) { archSev = 1.00; }
    else if (s >= 45) { archSev = 0.67; }
    else if (s >= 20) { archSev = 0.33; }
    else              { archSev = 0;    }
  }

  var aqLevel = aq ? (aq.attentionLevel || 'unknown') : 'unknown';
  var govSev  = aqLevel === 'critical' ? 1.00
    : aqLevel === 'high'   ? 0.67
    : aqLevel === 'medium' ? 0.33
    : 0;

  var fcSev;
  if (fcData !== undefined) {
    if (fcData && fcData.forecastLevel && fcData.forecastLevel !== 'unknown') {
      var fl = fcData.forecastLevel;
      fcSev = fl === 'critical'                  ? 1.00
            : fl === 'high'                      ? 0.67
            : (fl === 'medium' || fl === 'watch') ? 0.33
            :                                      0.00;
    } else {
      fcSev = 0;
    }
  } else {
    fcSev = 0;
  }

  var repoLabel = repo ? (repo.label || '') : '';
  var opSev = repoLabel === 'critical'  ? 1.00
    : repoLabel === 'at-risk' ? 0.67
    : 0;

  var score = archSev * 0.50 + govSev * 0.20 + fcSev * 0.20 + opSev * 0.05;

  if (score >= 0.50) return 'critical';
  if (score >= 0.25) return 'elevated';
  if (score >= 0.10) return 'watch';
  return 'healthy';
}

// ── filterRepos (copied verbatim from applyFilter() in dashboard.html) ────────
function filterRepos(repos, activeFilter) {
  return repos.filter(function(r) {
    if (activeFilter === 'All')      return true;
    if (activeFilter === 'Needs Attention') {
      var pri = computeRepoPriority(r, r.aq, r.archData, r.fcData);
      return pri === 'critical' || pri === 'elevated';
    }
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
// Operational label and Architectural Priority are deliberately set to DISAGREE
// on several rows, proving Needs Attention tracks priority, not repo.label.
//
//   id  label      archData.architectureHealthLevel   →  priority
//   1   healthy    risky                               →  critical
//   2   critical   weak                                →  elevated
//   3   healthy    watch                                →  watch
//   4   healthy    healthy                              →  healthy
//   5   at-risk    weak                                →  elevated

var REPOS = [
  { id: 1, fullName: 'org/alpha',   label: 'healthy',  archData: { architectureHealthLevel: 'risky'   } },
  { id: 2, fullName: 'org/beta',    label: 'critical', archData: { architectureHealthLevel: 'weak'    } },
  { id: 3, fullName: 'org/gamma',   label: 'healthy',  archData: { architectureHealthLevel: 'watch'   } },
  { id: 4, fullName: 'org/delta',   label: 'healthy',  archData: { architectureHealthLevel: 'healthy' } },
  { id: 5, fullName: 'org/epsilon', label: 'at-risk',  archData: { architectureHealthLevel: 'weak'    } },
];

// ── filterRepos — All ─────────────────────────────────────────────────────────

describe('filterRepos — All filter', () => {
  test('returns every repo from a mixed-priority list', () => {
    expect(filterRepos(REPOS, 'All')).toHaveLength(5);
  });

  test('preserves original array order', () => {
    const result = filterRepos(REPOS, 'All');
    expect(result.map(function(r) { return r.id; })).toEqual([1, 2, 3, 4, 5]);
  });

  test('returns all repos when every entry is architecture-critical', () => {
    const repos = [
      { archData: { architectureHealthLevel: 'risky' } },
      { archData: { architectureHealthLevel: 'risky' } },
    ];
    expect(filterRepos(repos, 'All')).toHaveLength(2);
  });

  test('returns all repos when every entry is architecture-watch (watch remains visible under All)', () => {
    const repos = [
      { archData: { architectureHealthLevel: 'watch' } },
      { archData: { architectureHealthLevel: 'watch' } },
    ];
    expect(filterRepos(repos, 'All')).toHaveLength(2);
  });

  test('returns all repos when every entry is architecture-healthy (healthy remains visible under All)', () => {
    const repos = [
      { archData: { architectureHealthLevel: 'healthy' } },
      { archData: { architectureHealthLevel: 'healthy' } },
      { archData: { architectureHealthLevel: 'healthy' } },
    ];
    expect(filterRepos(repos, 'All')).toHaveLength(3);
  });

  test('returns empty array when list is empty', () => {
    expect(filterRepos([], 'All')).toHaveLength(0);
  });

  test('All includes all four Architectural Priority tiers from the shared fixture', () => {
    const result = filterRepos(REPOS, 'All');
    expect(result).toHaveLength(5); // critical(1) + elevated(2) + watch(1) + healthy(1)
  });
});

// ── filterRepos — Needs Attention (Architectural Priority) ────────────────────

describe('filterRepos — Needs Attention filter (Architectural Priority)', () => {
  test('critical Architectural Priority matches Needs Attention', () => {
    const repo = { id: 10, label: 'healthy', archData: { architectureHealthLevel: 'risky' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(1);
  });

  test('elevated Architectural Priority matches Needs Attention', () => {
    const repo = { id: 11, label: 'healthy', archData: { architectureHealthLevel: 'weak' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(1);
  });

  test('watch Architectural Priority does NOT match Needs Attention', () => {
    const repo = { id: 12, label: 'healthy', archData: { architectureHealthLevel: 'watch' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(0);
  });

  test('healthy Architectural Priority does NOT match Needs Attention', () => {
    const repo = { id: 13, label: 'healthy', archData: { architectureHealthLevel: 'healthy' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(0);
  });

  test('operational label healthy but Architectural Priority critical DOES match (label no longer controls result)', () => {
    const repo = { id: 14, label: 'healthy', archData: { architectureHealthLevel: 'risky' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(1);
  });

  test('operational label critical but Architectural Priority watch does NOT match (label no longer controls result)', () => {
    const repo = { id: 15, label: 'critical', archData: { architectureHealthLevel: 'watch' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(0);
  });

  test('operational label at-risk but Architectural Priority healthy does NOT match (label no longer controls result)', () => {
    const repo = { id: 16, label: 'at-risk', archData: { architectureHealthLevel: 'healthy' } };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(0);
  });

  test('fixture: matches exactly the critical + elevated rows (ids 1, 2, 5), excluding watch (3) and healthy (4)', () => {
    const result = filterRepos(REPOS, 'Needs Attention');
    expect(result.map(function(r) { return r.id; })).toEqual([1, 2, 5]);
  });

  test('returns correct count: 1 critical + 2 elevated = 3', () => {
    expect(filterRepos(REPOS, 'Needs Attention')).toHaveLength(3);
  });

  test('archData=null (no architecture intel) → Coverage Gap tier (watch) → excluded', () => {
    const repo = { id: 17, label: 'critical', archData: null };
    const result = filterRepos([repo], 'Needs Attention');
    expect(result).toHaveLength(0);
  });
});

// ── filterRepos — Healthy filter control removed ───────────────────────────────
// The "Healthy" button/state no longer exists. filterRepos() has no branch for
// it, so passing 'Healthy' as activeFilter now falls through to the default
// `return true` — identical to any other unrecognized filter name, and
// identical to 'All'. This proves no active-filter logic still depends on a
// dedicated Healthy filter state.

describe('filterRepos — Healthy filter control no longer exists', () => {
  test('"Healthy" as activeFilter now returns all repos (falls through to default, like "All")', () => {
    const result = filterRepos(REPOS, 'Healthy');
    expect(result).toHaveLength(5);
  });

  test('"Healthy" as activeFilter behaves identically to "All" and to any unrecognized name', () => {
    const asHealthy      = filterRepos(REPOS, 'Healthy');
    const asAll           = filterRepos(REPOS, 'All');
    const asUnrecognized = filterRepos(REPOS, 'SomeOtherName');
    expect(asHealthy).toEqual(asAll);
    expect(asHealthy).toEqual(asUnrecognized);
  });
});

// ── filterRepos — empty result ────────────────────────────────────────────────

describe('filterRepos — empty result', () => {
  test('Needs Attention on an all-architecture-healthy list returns empty array', () => {
    const allHealthy = [
      { id: 1, archData: { architectureHealthLevel: 'healthy' } },
      { id: 2, archData: { architectureHealthLevel: 'healthy' } },
      { id: 3, archData: { architectureHealthLevel: 'healthy' } },
    ];
    expect(filterRepos(allHealthy, 'Needs Attention')).toHaveLength(0);
  });

  test('Needs Attention on an all-architecture-watch list returns empty array', () => {
    const allWatch = [
      { id: 1, archData: { architectureHealthLevel: 'watch' } },
      { id: 2, archData: { architectureHealthLevel: 'watch' } },
    ];
    expect(filterRepos(allWatch, 'Needs Attention')).toHaveLength(0);
  });

  test('empty Needs Attention result is an Array, not null or undefined', () => {
    const result = filterRepos([{ archData: { architectureHealthLevel: 'healthy' } }], 'Needs Attention');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
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
  test('Needs Attention filter: 2 matched of 5 total → "2 / 5"', () => {
    const total    = new Array(5).fill({});
    const filtered = new Array(2).fill({});
    expect(filterCountText(filtered, total, 'Needs Attention')).toBe('2 / 5');
  });

  test('Needs Attention filter: 0 matched of 4 total → "0 / 4"', () => {
    const total = new Array(4).fill({});
    expect(filterCountText([], total, 'Needs Attention')).toBe('0 / 4');
  });

  test('filtered count and total count both appear in the display string', () => {
    const total    = new Array(10).fill({});
    const filtered = new Array(3).fill({});
    expect(filterCountText(filtered, total, 'Needs Attention')).toBe('3 / 10');
  });

  test('Needs Attention fixture count matches table: "3 / 5"', () => {
    const filtered = filterRepos(REPOS, 'Needs Attention');
    expect(filterCountText(filtered, REPOS, 'Needs Attention')).toBe('3 / 5');
  });
});
