'use strict';

// Pure-logic unit tests for buildExecutiveKpiCards.
// The function is embedded in frontend/dashboard.html but has no DOM
// dependency — logic is duplicated here verbatim so Jest (node env) can run
// these without a browser or jsdom.

// ── Minimal esc stub (matches dashboard implementation) ──────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── card helper (copied verbatim from dashboard.html) ─────────────────────────
function card(label, value, cls) {
  var valueHtml = cls
    ? '<span class="card-badge ' + cls + '">' + esc(String(value)) + '</span>'
    : '<div class="card-value">' + esc(String(value)) + '</div>';
  return '<div class="card">'
    + '<div class="card-label">' + esc(label) + '</div>'
    + valueHtml
    + '</div>';
}

// ── buildExecutiveKpiCards (copied verbatim from dashboard.html) ──────────────
function buildExecutiveKpiCards(k) {
  if (!k) k = {};

  function archCls(s) {
    if (s == null) return '';
    return s >= 80 ? 'severity-healthy' : s >= 60 ? 'severity-medium' : 'severity-high';
  }
  function govCls(s) {
    if (s == null) return '';
    return s >= 80 ? 'severity-healthy' : s >= 60 ? 'severity-medium' : 'severity-high';
  }
  function fcCls(l) {
    if (!l) return '';
    if (l === 'stable')    return 'severity-healthy';
    if (l === 'watch')     return 'severity-medium';
    if (l === 'degrading') return 'severity-high';
    if (l === 'critical')  return 'severity-critical';
    return 'severity-unknown';
  }
  function wlCls(n) {
    if (n == null) return '';
    return n === 0 ? 'severity-healthy' : n <= 4 ? 'severity-medium' : 'severity-high';
  }
  function critCls(n) {
    if (n == null) return '';
    return n === 0 ? 'severity-healthy' : 'severity-critical';
  }
  function covCls(pct) {
    if (pct == null) return '';
    return pct >= 80 ? 'severity-healthy' : pct >= 50 ? 'severity-medium' : 'severity-high';
  }

  var archVal = k.architectureScore != null ? k.architectureScore : '—';
  var govVal  = k.governanceScore   != null ? k.governanceScore   : '—';
  var fcVal   = k.forecastLevel     != null ? k.forecastLevel     : '—';
  var wlVal   = k.watchlistCount    != null ? k.watchlistCount    : '—';
  var critVal = k.criticalRepos     != null ? k.criticalRepos     : '—';

  // Snapshot Coverage: percent badge + "N / M" ratio sub-label
  var hasCov    = k.snapshotCount != null && k.repoCount != null && k.repoCount > 0;
  var covPct    = hasCov ? Math.round(k.snapshotCount / k.repoCount * 100) : null;
  var covPctVal = covPct != null ? (covPct + '%') : '—';
  var covRatio  = hasCov ? (k.snapshotCount + ' / ' + k.repoCount) : null;
  var covBadge  = covCls(covPct);
  var covValHtml = covBadge
    ? '<span class="card-badge ' + covBadge + '">' + esc(String(covPctVal)) + '</span>'
    : '<div class="card-value">' + esc(String(covPctVal)) + '</div>';
  if (covRatio) {
    covValHtml += '<div style="font-size:0.68rem;color:var(--text-muted);margin-top:2px;">' + esc(covRatio) + '</div>';
  }
  var covCard = '<div class="card">'
    + '<div class="card-label">Snapshot Coverage</div>'
    + covValHtml
    + '</div>';

  var fields = [
    ['Architecture Health', archVal, archCls(k.architectureScore)],
    ['Governance',          govVal,  govCls(k.governanceScore)],
    ['Forecast Risk',       fcVal,   fcCls(k.forecastLevel)],
    ['Watchlists',          wlVal,   wlCls(k.watchlistCount)],
    ['Critical Repos',      critVal, critCls(k.criticalRepos)],
  ];

  return fields.map(function(f) { return card(f[0], f[1], f[2]); }).join('') + covCard;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildExecutiveKpiCards — card labels', () => {
  const html = buildExecutiveKpiCards({});

  test('renders Architecture Health label',  () => { expect(html).toContain('Architecture Health'); });
  test('renders Governance label',           () => { expect(html).toContain('Governance'); });
  test('renders Forecast Risk label',        () => { expect(html).toContain('Forecast Risk'); });
  test('renders Watchlists label',           () => { expect(html).toContain('Watchlists'); });
  test('renders Critical Repos label',       () => { expect(html).toContain('Critical Repos'); });
  test('renders Snapshot Coverage label',    () => { expect(html).toContain('Snapshot Coverage'); });
  test('does NOT render Confidence label',   () => { expect(html).not.toContain('Confidence'); });
  test('renders exactly 6 card divs',        () => {
    expect((html.match(/<div class="card">/g) || []).length).toBe(6);
  });
});

describe('buildExecutiveKpiCards — empty state (no data)', () => {
  const html = buildExecutiveKpiCards({});

  test('shows — for architectureScore when null', () => { expect(html).toContain('—'); });
  test('handles null input gracefully',            () => { expect(() => buildExecutiveKpiCards(null)).not.toThrow(); });
  test('handles undefined input gracefully',       () => { expect(() => buildExecutiveKpiCards(undefined)).not.toThrow(); });
});

describe('buildExecutiveKpiCards — Architecture Health color', () => {
  test('score >= 80 maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 80 })).toContain('severity-healthy');
  });
  test('score 90 maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 90 })).toContain('severity-healthy');
  });
  test('score 60 maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 60 })).toContain('severity-medium');
  });
  test('score 79 maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 79 })).toContain('severity-medium');
  });
  test('score 59 maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 59 })).toContain('severity-high');
  });
  test('score 0 maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 0 })).toContain('severity-high');
  });
  test('null score shows — without badge', () => {
    expect(buildExecutiveKpiCards({ architectureScore: null })).toContain('—');
  });
});

describe('buildExecutiveKpiCards — Governance color', () => {
  test('governanceScore >= 80 maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ governanceScore: 85 })).toContain('severity-healthy');
  });
  test('governanceScore 60 maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ governanceScore: 60 })).toContain('severity-medium');
  });
  test('governanceScore 59 maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ governanceScore: 59 })).toContain('severity-high');
  });
});

describe('buildExecutiveKpiCards — Forecast Risk color', () => {
  test('stable maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'stable' })).toContain('severity-healthy');
  });
  test('watch maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'watch' })).toContain('severity-medium');
  });
  test('degrading maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'degrading' })).toContain('severity-high');
  });
  test('critical maps to severity-critical', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'critical' })).toContain('severity-critical');
  });
  test('unknown maps to severity-unknown', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'unknown' })).toContain('severity-unknown');
  });
  test('renders the forecastLevel string value', () => {
    expect(buildExecutiveKpiCards({ forecastLevel: 'stable' })).toContain('stable');
  });
});

describe('buildExecutiveKpiCards — Watchlists color', () => {
  test('0 watchlists maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 0 })).toContain('severity-healthy');
  });
  test('1 watchlist maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 1 })).toContain('severity-medium');
  });
  test('4 watchlists maps to severity-medium', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 4 })).toContain('severity-medium');
  });
  test('5 watchlists maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 5 })).toContain('severity-high');
  });
  test('10 watchlists maps to severity-high', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 10 })).toContain('severity-high');
  });
  test('renders the count value', () => {
    expect(buildExecutiveKpiCards({ watchlistCount: 3 })).toContain('3');
  });
});

describe('buildExecutiveKpiCards — Critical Repos color', () => {
  test('0 critical repos maps to severity-healthy', () => {
    expect(buildExecutiveKpiCards({ criticalRepos: 0 })).toContain('severity-healthy');
  });
  test('1 critical repo maps to severity-critical', () => {
    expect(buildExecutiveKpiCards({ criticalRepos: 1 })).toContain('severity-critical');
  });
  test('5 critical repos maps to severity-critical', () => {
    expect(buildExecutiveKpiCards({ criticalRepos: 5 })).toContain('severity-critical');
  });
  test('renders the count value', () => {
    expect(buildExecutiveKpiCards({ criticalRepos: 2 })).toContain('2');
  });
});

describe('buildExecutiveKpiCards — Snapshot Coverage display', () => {
  test('7 of 16 repos = 44%, shows percentage', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 7, repoCount: 16 });
    expect(html).toContain('44%');
  });

  test('7 of 16 repos shows ratio sub-label "7 / 16"', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 7, repoCount: 16 });
    expect(html).toContain('7 / 16');
  });

  test('13 of 16 repos = 81%, shows percentage', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 13, repoCount: 16 });
    expect(html).toContain('81%');
  });

  test('0 of 10 repos = 0%, shows percentage', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 0, repoCount: 10 });
    expect(html).toContain('0%');
  });

  test('10 of 10 repos = 100%', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 10, repoCount: 10 });
    expect(html).toContain('100%');
  });

  test('no data shows — placeholder', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: null, repoCount: null });
    expect(html).toContain('—');
  });

  test('repoCount 0 shows — (avoids division by zero)', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 0, repoCount: 0 });
    expect(html).toContain('—');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  test('snapshotCount null shows — even if repoCount is present', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: null, repoCount: 10 });
    expect(html).toContain('—');
  });

  test('ratio sub-label omitted when no data', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: null, repoCount: null });
    expect(html).not.toContain(' / ');
  });
});

describe('buildExecutiveKpiCards — Snapshot Coverage color', () => {
  test('>= 80% maps to severity-healthy', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 8, repoCount: 10 });
    expect(html).toContain('severity-healthy');
    expect(html).toContain('80%');
  });

  test('90% maps to severity-healthy', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 9, repoCount: 10 });
    expect(html).toContain('severity-healthy');
  });

  test('50% maps to severity-medium', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 5, repoCount: 10 });
    expect(html).toContain('severity-medium');
    expect(html).toContain('50%');
  });

  test('79% maps to severity-medium', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 79, repoCount: 100 });
    expect(html).toContain('severity-medium');
  });

  test('49% maps to severity-high', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 49, repoCount: 100 });
    expect(html).toContain('severity-high');
  });

  test('0% maps to severity-high', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: 0, repoCount: 10 });
    expect(html).toContain('severity-high');
  });

  test('no data shows — without a severity badge class on coverage card', () => {
    const html = buildExecutiveKpiCards({ snapshotCount: null, repoCount: null });
    // The — should appear in card-value div, not in a badge
    expect(html).toContain('card-value');
  });
});

describe('buildExecutiveKpiCards — XSS escaping', () => {
  test('escapes forecastLevel value in output', () => {
    const html = buildExecutiveKpiCards({ forecastLevel: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('renders architectureScore as string safely', () => {
    expect(buildExecutiveKpiCards({ architectureScore: 42 })).toContain('42');
  });
});
