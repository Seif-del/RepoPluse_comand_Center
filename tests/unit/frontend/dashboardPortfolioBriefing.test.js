// Tests for buildPortfolioBriefingHtml (copied verbatim from dashboard.html)

// ── esc stub ──────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── buildPortfolioBriefingHtml (copied verbatim from dashboard.html) ──────────
function buildPortfolioBriefingHtml(kpi, repos, repoIntel) {
  if (!kpi) kpi = {};
  if (!Array.isArray(repos)) repos = [];
  if (!repoIntel || typeof repoIntel !== 'object') repoIntel = {};

  var kpiHasData    = kpi.architectureScore != null || kpi.governanceScore != null
    || kpi.forecastLevel != null || kpi.criticalRepos != null
    || kpi.watchlistCount != null || kpi.snapshotCount != null;
  var intelHasData  = Object.keys(repoIntel).length > 0;

  if (!kpiHasData && !repos.length && !intelHasData) return '';

  var bullets = [];

  // 1. Repositories requiring immediate attention (from _repos labels)
  var attnRepos = repos.filter(function(r) {
    return r && (r.label === 'critical' || r.label === 'at-risk');
  });
  if (attnRepos.length > 0) {
    var n = attnRepos.length;
    bullets.push(n + ' ' + (n === 1 ? 'repository requires' : 'repositories require') + ' immediate attention');
  }

  // 2. Repos with risky architecture health (from _repoIntelligenceById)
  var riskyIds = Object.keys(repoIntel).filter(function(id) {
    return repoIntel[id] && repoIntel[id].architectureHealthLevel === 'risky';
  });
  if (riskyIds.length > 0) {
    var nr = riskyIds.length;
    bullets.push(nr + ' ' + (nr === 1 ? 'repository has' : 'repositories have') + ' risky architecture health');
  }

  // 3. Portfolio forecast level
  if (kpi.forecastLevel) {
    var fcLabels = {
      none:     'No degradation forecast',
      low:      'Low degradation forecast',
      stable:   'Portfolio forecast stable',
      watch:    'Portfolio forecast in watch state',
      degrading:'Portfolio forecast degrading — structural risk elevated',
      critical: 'Portfolio forecast critical — immediate intervention required',
    };
    bullets.push(fcLabels[kpi.forecastLevel] || ('Portfolio forecast: ' + kpi.forecastLevel));
  }

  // 4. Architecture watchlist repos (governance hotspots)
  if (kpi.watchlistCount != null && kpi.watchlistCount > 0) {
    var wn = kpi.watchlistCount;
    bullets.push(wn + ' ' + (wn === 1 ? 'repository' : 'repositories') + ' on architecture watchlist');
  }

  // 5. Architecture snapshot coverage
  var hasCov = kpi.snapshotCount != null && kpi.repoCount != null && kpi.repoCount > 0;
  if (hasCov) {
    var pct = Math.round(kpi.snapshotCount / kpi.repoCount * 100);
    bullets.push('Architecture snapshot coverage: ' + pct + '% (' + kpi.snapshotCount + ' / ' + kpi.repoCount + ' repos)');
  }

  // 6. Highest-risk repository (lowest score among repos with a score)
  var scored = repos.filter(function(r) { return r && r.score != null; });
  if (scored.length > 0) {
    var worst = scored.slice().sort(function(a, b) { return a.score - b.score; })[0];
    if (worst && worst.fullName) {
      bullets.push('Highest-risk repository: ' + worst.fullName);
    }
  }

  if (!bullets.length) return '';

  var sev = (kpi.forecastLevel === 'critical' || (kpi.criticalRepos != null && kpi.criticalRepos > 0))
                ? 'critical'
            : (kpi.forecastLevel === 'degrading' || attnRepos.length > 0)
                ? 'high'
            : (kpi.watchlistCount != null && kpi.watchlistCount > 0)
                ? 'medium'
            : 'healthy';

  var h = '<div class="exec-brief sev-' + esc(sev) + '" style="margin-bottom:16px;">';
  h += '<div class="exec-brief-header">';
  h += '<span class="exec-brief-label">Portfolio Briefing</span>';
  h += '</div>';
  h += '<ul class="exec-brief-list" style="margin-top:6px;">';
  bullets.forEach(function(b) {
    h += '<li class="exec-brief-item">' + esc(b) + '</li>';
  });
  h += '</ul></div>';
  return h;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepo(overrides) {
  return Object.assign({ id: 1, fullName: 'org/repo', score: 75, label: 'healthy' }, overrides);
}

function makeKpi(overrides) {
  return Object.assign({
    architectureScore: null,
    governanceScore:   null,
    forecastLevel:     null,
    watchlistCount:    null,
    criticalRepos:     null,
    snapshotCount:     null,
    repoCount:         null,
  }, overrides);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildPortfolioBriefingHtml — null/empty states', () => {
  test('null kpi and empty repos returns empty string', () => {
    expect(buildPortfolioBriefingHtml(null, [], {})).toBe('');
  });

  test('all-null kpi fields and empty repos returns empty string', () => {
    expect(buildPortfolioBriefingHtml(makeKpi(), [], {})).toBe('');
  });

  test('null repoIntel is treated as empty object', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], null);
    expect(html).toContain('Portfolio Briefing');
  });

  test('non-array repos is treated as empty array', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'watch' }), null, {});
    expect(html).toContain('Portfolio Briefing');
  });

  test('kpi with at least one non-null field renders card even with empty repos', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], {}))
      .toContain('Portfolio Briefing');
  });

  test('repos present with no kpi data still renders card', () => {
    const repos = [makeRepo({ label: 'critical' })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {})).toContain('Portfolio Briefing');
  });

  test('kpi with no data and repos all without score/critical label returns empty string', () => {
    const repos = [makeRepo({ label: 'healthy', score: null })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {})).toBe('');
  });
});

describe('buildPortfolioBriefingHtml — header', () => {
  test('renders "Portfolio Briefing" label', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], {});
    expect(html).toContain('Portfolio Briefing');
  });

  test('renders a list element', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], {});
    expect(html).toContain('<ul');
  });
});

describe('buildPortfolioBriefingHtml — immediate attention bullet', () => {
  test('1 critical repo renders singular "repository requires"', () => {
    const repos = [makeRepo({ label: 'critical' })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .toContain('1 repository requires immediate attention');
  });

  test('1 at-risk repo renders singular "repository requires"', () => {
    const repos = [makeRepo({ label: 'at-risk' })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .toContain('1 repository requires immediate attention');
  });

  test('2 attention repos renders plural "repositories require"', () => {
    const repos = [makeRepo({ label: 'critical', id: 1 }), makeRepo({ label: 'at-risk', id: 2 })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .toContain('2 repositories require immediate attention');
  });

  test('0 attention repos omits the bullet', () => {
    const repos = [makeRepo({ label: 'healthy' }), makeRepo({ label: 'monitor', id: 2 })];
    const html = buildPortfolioBriefingHtml(makeKpi(), repos, {});
    expect(html).not.toContain('immediate attention');
  });

  test('monitor label does not count as attention', () => {
    const repos = [makeRepo({ label: 'monitor' })];
    const html = buildPortfolioBriefingHtml(makeKpi(), repos, {});
    expect(html).not.toContain('immediate attention');
  });
});

describe('buildPortfolioBriefingHtml — risky architecture bullet', () => {
  test('1 risky repo renders singular "repository has risky architecture health"', () => {
    const intel = { '1': { architectureHealthLevel: 'risky' } };
    expect(buildPortfolioBriefingHtml(makeKpi(), [], intel))
      .toContain('1 repository has risky architecture health');
  });

  test('3 risky repos renders plural "repositories have"', () => {
    const intel = {
      '1': { architectureHealthLevel: 'risky' },
      '2': { architectureHealthLevel: 'risky' },
      '3': { architectureHealthLevel: 'risky' },
    };
    expect(buildPortfolioBriefingHtml(makeKpi(), [], intel))
      .toContain('3 repositories have risky architecture health');
  });

  test('non-risky levels (weak, watch, healthy) do not count', () => {
    const intel = {
      '1': { architectureHealthLevel: 'weak' },
      '2': { architectureHealthLevel: 'watch' },
      '3': { architectureHealthLevel: 'healthy' },
    };
    const html = buildPortfolioBriefingHtml(makeKpi(), [], intel);
    expect(html).not.toContain('risky architecture health');
  });

  test('mixed levels — only risky entries counted', () => {
    const intel = {
      '1': { architectureHealthLevel: 'risky' },
      '2': { architectureHealthLevel: 'watch' },
    };
    expect(buildPortfolioBriefingHtml(makeKpi(), [], intel))
      .toContain('1 repository has risky architecture health');
  });
});

describe('buildPortfolioBriefingHtml — forecast bullet', () => {
  test('forecastLevel "none" renders "No degradation forecast"', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'none' }), [], {}))
      .toContain('No degradation forecast');
  });

  test('forecastLevel "stable" renders "Portfolio forecast stable"', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], {}))
      .toContain('Portfolio forecast stable');
  });

  test('forecastLevel "watch" renders watch state message', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'watch' }), [], {}))
      .toContain('Portfolio forecast in watch state');
  });

  test('forecastLevel "degrading" renders degrading message', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'degrading' }), [], {}))
      .toContain('Portfolio forecast degrading');
  });

  test('forecastLevel "critical" renders critical message', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'critical' }), [], {}))
      .toContain('Portfolio forecast critical');
  });

  test('unknown forecastLevel falls back to "Portfolio forecast: X"', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'mystery' }), [], {}))
      .toContain('Portfolio forecast: mystery');
  });

  test('null forecastLevel omits forecast bullet', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ watchlistCount: 3 }), [], {});
    expect(html).not.toContain('forecast');
  });
});

describe('buildPortfolioBriefingHtml — watchlist bullet', () => {
  test('watchlistCount 1 renders singular "repository on architecture watchlist"', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ watchlistCount: 1 }), [], {}))
      .toContain('1 repository on architecture watchlist');
  });

  test('watchlistCount 5 renders plural "repositories on architecture watchlist"', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ watchlistCount: 5 }), [], {}))
      .toContain('5 repositories on architecture watchlist');
  });

  test('watchlistCount 0 omits watchlist bullet', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ watchlistCount: 0, forecastLevel: 'stable' }), [], {});
    expect(html).not.toContain('watchlist');
  });

  test('null watchlistCount omits watchlist bullet', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), [], {});
    expect(html).not.toContain('watchlist');
  });
});

describe('buildPortfolioBriefingHtml — snapshot coverage bullet', () => {
  test('renders coverage percentage when both snapshotCount and repoCount present', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ snapshotCount: 8, repoCount: 10 }), [], {});
    expect(html).toContain('80%');
    expect(html).toContain('8 / 10 repos');
  });

  test('rounds fractional percentage', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ snapshotCount: 1, repoCount: 3 }), [], {});
    expect(html).toContain('33%');
  });

  test('omits coverage bullet when snapshotCount is null', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ repoCount: 10, forecastLevel: 'stable' }), [], {});
    expect(html).not.toContain('coverage');
  });

  test('omits coverage bullet when repoCount is null', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ snapshotCount: 5, forecastLevel: 'stable' }), [], {});
    expect(html).not.toContain('coverage');
  });

  test('omits coverage bullet when repoCount is 0 (avoids division by zero)', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ snapshotCount: 5, repoCount: 0, forecastLevel: 'stable' }), [], {});
    expect(html).not.toContain('coverage');
  });
});

describe('buildPortfolioBriefingHtml — highest-risk repo bullet', () => {
  test('renders name of repo with lowest score', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'org/risky-repo', score: 20 }),
      makeRepo({ id: 2, fullName: 'org/ok-repo',    score: 80 }),
    ];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .toContain('Highest-risk repository: org/risky-repo');
  });

  test('does not render higher-scoring repo as highest-risk', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'org/risky-repo', score: 20 }),
      makeRepo({ id: 2, fullName: 'org/ok-repo',    score: 80 }),
    ];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .not.toContain('org/ok-repo');
  });

  test('skips repos with null score when finding highest-risk', () => {
    const repos = [
      makeRepo({ id: 1, fullName: 'org/no-score',   score: null }),
      makeRepo({ id: 2, fullName: 'org/has-score',  score: 45 }),
    ];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {}))
      .toContain('org/has-score');
  });

  test('omits highest-risk bullet when all repos have null score', () => {
    const repos = [makeRepo({ score: null, fullName: 'org/repo' })];
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), repos, {});
    expect(html).not.toContain('Highest-risk repository');
  });

  test('does not mutate repos array when sorting', () => {
    const repos = [
      makeRepo({ id: 1, score: 30, fullName: 'org/a' }),
      makeRepo({ id: 2, score: 10, fullName: 'org/b' }),
    ];
    const originalFirst = repos[0].fullName;
    buildPortfolioBriefingHtml(makeKpi(), repos, {});
    expect(repos[0].fullName).toBe(originalFirst);
  });
});

describe('buildPortfolioBriefingHtml — severity class', () => {
  test('criticalRepos > 0 → sev-critical class', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ criticalRepos: 2, forecastLevel: 'stable' }), [], {}))
      .toContain('sev-critical');
  });

  test('forecastLevel "critical" → sev-critical class', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'critical' }), [], {}))
      .toContain('sev-critical');
  });

  test('forecastLevel "degrading" → sev-high class', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'degrading' }), [], {}))
      .toContain('sev-high');
  });

  test('at-risk repos (no critical KPI) → sev-high class', () => {
    const repos = [makeRepo({ label: 'at-risk' })];
    expect(buildPortfolioBriefingHtml(makeKpi(), repos, {})).toContain('sev-high');
  });

  test('watchlistCount > 0 (no degrading signals) → sev-medium class', () => {
    expect(buildPortfolioBriefingHtml(makeKpi({ watchlistCount: 3 }), [], {}))
      .toContain('sev-medium');
  });

  test('no risk signals → sev-healthy class', () => {
    const repos = [makeRepo({ label: 'healthy', score: 90 })];
    expect(buildPortfolioBriefingHtml(makeKpi({ forecastLevel: 'stable' }), repos, {}))
      .toContain('sev-healthy');
  });
});

describe('buildPortfolioBriefingHtml — XSS escaping', () => {
  test('escapes XSS in repo fullName', () => {
    const repos = [makeRepo({ fullName: '<script>xss</script>', score: 10 })];
    const html = buildPortfolioBriefingHtml(makeKpi(), repos, {});
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes XSS in forecastLevel fallback text', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ forecastLevel: '<img>' }), [], {});
    expect(html).not.toContain('<img>');
    expect(html).toContain('&lt;img&gt;');
  });

  test('escapes XSS in coverage numbers (coerced to strings)', () => {
    const html = buildPortfolioBriefingHtml(makeKpi({ snapshotCount: 5, repoCount: 10 }), [], {});
    expect(html).toContain('50%');
  });
});
