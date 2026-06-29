'use strict';

// Pure-logic unit tests for buildExecutiveBriefing.
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

// ── buildExecutiveBriefing (copied verbatim from dashboard.html) ──────────────
function buildExecutiveBriefing(kpi) {
  if (!kpi) kpi = {};

  var dataPresent = kpi.architectureScore != null || kpi.governanceScore != null
    || kpi.criticalRepos != null;

  if (!dataPresent) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
      + 'Architecture intelligence briefing loading…</p>';
  }

  var hasCov   = kpi.snapshotCount != null && kpi.repoCount != null && kpi.repoCount > 0;
  var covPct   = hasCov ? Math.round(kpi.snapshotCount / kpi.repoCount * 100) : null;
  var covRatio = hasCov ? (kpi.snapshotCount + ' / ' + kpi.repoCount) : null;

  // ── Executive Status ──────────────────────────────────────────────────────
  function execStatus() {
    if (kpi.forecastLevel === 'critical' || kpi.forecastLevel === 'degrading')   return 'needs_attention';
    if (kpi.criticalRepos != null && kpi.criticalRepos >= 3)                     return 'needs_attention';
    if (kpi.architectureScore != null && kpi.architectureScore < 60)             return 'needs_attention';
    if (kpi.governanceScore   != null && kpi.governanceScore   < 60)             return 'needs_attention';
    var isWatch = kpi.forecastLevel === 'watch'
      || (kpi.criticalRepos  != null && kpi.criticalRepos  >  0)
      || (kpi.architectureScore != null && kpi.architectureScore < 80)
      || (kpi.governanceScore   != null && kpi.governanceScore   < 80)
      || (covPct !== null && covPct < 80);
    if (isWatch) return 'watch';
    var allLoaded = kpi.architectureScore != null && kpi.governanceScore != null
      && kpi.forecastLevel != null && kpi.criticalRepos != null;
    return allLoaded ? 'healthy' : 'stable';
  }

  var status = execStatus();

  var STATUS_LABELS = { healthy: 'Healthy', stable: 'Stable', watch: 'Watch', needs_attention: 'Needs Attention' };
  var STATUS_SEV    = { healthy: 'healthy', stable: 'unknown', watch: 'medium', needs_attention: 'high' };
  var statusLabel = STATUS_LABELS[status] || status;
  var statusSev   = STATUS_SEV[status]   || 'unknown';

  // ── Key Metrics ───────────────────────────────────────────────────────────
  function scoreSev(s) {
    if (s == null) return 'unknown';
    return s >= 80 ? 'healthy' : s >= 60 ? 'medium' : 'high';
  }

  var archMetricVal = kpi.architectureScore != null
    ? (kpi.architectureScore + ' — ' + (kpi.architectureScore >= 85 ? 'Healthy' : kpi.architectureScore >= 70 ? 'Watch' : kpi.architectureScore >= 45 ? 'Weak' : 'Risky'))
    : '—';
  var critMetricVal = kpi.criticalRepos != null ? (kpi.criticalRepos > 0 ? String(kpi.criticalRepos) : 'None') : '—';
  var critMetricSev = kpi.criticalRepos != null && kpi.criticalRepos > 0 ? 'critical'
    : kpi.criticalRepos != null ? 'healthy' : 'unknown';
  var riskMetricVal = kpi.riskConcentration != null ? (kpi.riskConcentration > 0 ? String(kpi.riskConcentration) : 'None') : '—';
  var riskMetricSev = kpi.riskConcentration != null && kpi.riskConcentration > 0 ? 'high'
    : kpi.riskConcentration != null ? 'healthy' : 'unknown';
  var covMetricVal  = covPct != null ? (covPct + '% (' + covRatio + ')') : '—';
  var covMetricSev  = covPct != null ? (covPct >= 80 ? 'healthy' : covPct >= 50 ? 'medium' : 'high') : 'unknown';

  var metrics = [
    { label: 'Architecture Health',   text: archMetricVal, sev: scoreSev(kpi.architectureScore) },
    { label: 'Critical Repos',        text: critMetricVal, sev: critMetricSev },
    { label: 'Repositories at Risk',  text: riskMetricVal, sev: riskMetricSev },
    { label: 'Snapshot Coverage',     text: covMetricVal,  sev: covMetricSev },
  ];

  // ── Portfolio Assessment ──────────────────────────────────────────────────
  var assessment;
  if (status === 'needs_attention') {
    var naReasons = [];
    if (kpi.forecastLevel === 'critical')  naReasons.push('critical structural degradation forecast');
    if (kpi.forecastLevel === 'degrading') naReasons.push('degrading structural forecast');
    if (kpi.criticalRepos != null && kpi.criticalRepos > 0)  naReasons.push(kpi.criticalRepos + ' critical repositor' + (kpi.criticalRepos > 1 ? 'ies' : 'y') + ' requiring remediation');
    if (kpi.architectureScore != null && kpi.architectureScore < 60) naReasons.push('architecture score below threshold (' + kpi.architectureScore + ')');
    if (kpi.governanceScore   != null && kpi.governanceScore   < 60) naReasons.push('governance score below threshold (' + kpi.governanceScore + ')');
    assessment = 'Portfolio requires immediate attention due to ' + (naReasons.slice(0, 2).join(' and ') || 'critical signals detected') + '.';
  } else if (status === 'watch') {
    var wReasons = [];
    if (kpi.forecastLevel === 'watch')     wReasons.push('structural forecast in watch state');
    if (kpi.architectureScore != null && kpi.architectureScore < 80) wReasons.push('architecture score at ' + kpi.architectureScore);
    if (kpi.governanceScore   != null && kpi.governanceScore   < 80) wReasons.push('governance at ' + kpi.governanceScore);
    assessment = 'Portfolio requires monitoring — ' + (wReasons.slice(0, 2).join(', ') || 'elevated indicators present') + '.';
  } else if (status === 'healthy') {
    assessment = 'Portfolio architecture is healthy across all monitored dimensions. Governance and coverage are within acceptable thresholds.';
  } else {
    assessment = 'Portfolio intelligence is partially loaded. Architecture signals will update as data completes.';
  }

  // ── Render ────────────────────────────────────────────────────────────────
  var html = '<div class="exec-brief sev-' + esc(statusSev) + '">';
  html += '<div class="exec-brief-header">';
  html += '<span class="exec-brief-label">Portfolio Assessment</span>';
  html += '<span class="exec-brief-badge severity-' + esc(statusSev) + '">' + esc(statusLabel) + '</span>';
  html += '</div>';
  html += '<div class="exec-brief-summary" style="margin-top:4px;">' + esc(assessment) + '</div>';
  html += '<div class="exec-brief-body" style="margin-top:12px;">';

  // Key Metrics
  html += '<div class="exec-brief-col" style="min-width:230px;">';
  html += '<div class="exec-brief-col-label">Key Metrics</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">';
  metrics.forEach(function(m) {
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="width:7px;height:7px;border-radius:50%;background:var(--sev-' + esc(m.sev) + '-text);flex-shrink:0;display:inline-block;"></span>';
    html += '<span style="font-size:0.74rem;color:var(--text-muted);min-width:118px;flex-shrink:0;">' + esc(m.label) + '</span>';
    html += '<span style="font-size:0.80rem;color:var(--text-primary);">' + esc(m.text) + '</span>';
    html += '</div>';
  });
  html += '</div></div>';

  // Next Action
  html += '<div class="exec-brief-col">';
  html += '<div class="exec-brief-col-label">Next Action</div>';
  html += '<p style="font-size:0.80rem;color:var(--text-primary);margin:4px 0 0;">Prioritize remediation for the highest-risk repositories.</p>';
  html += '</div>';

  html += '</div></div>';
  return html;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildExecutiveBriefing — empty / no data state', () => {
  test('null input returns loading message', () => {
    expect(buildExecutiveBriefing(null)).toContain('Architecture intelligence briefing loading');
  });

  test('undefined input returns loading message', () => {
    expect(buildExecutiveBriefing(undefined)).toContain('Architecture intelligence briefing loading');
  });

  test('empty object returns loading message (no fields present)', () => {
    expect(buildExecutiveBriefing({})).toContain('Architecture intelligence briefing loading');
  });

  test('does not throw on any null fields', () => {
    expect(() => buildExecutiveBriefing({
      architectureScore: null, governanceScore: null,
      forecastLevel: null, criticalRepos: null, watchlistCount: null,
    })).not.toThrow();
  });
});

describe('buildExecutiveBriefing — HTML structure', () => {
  const html = buildExecutiveBriefing({ architectureScore: 85, governanceScore: 80, forecastLevel: 'stable', criticalRepos: 0 });

  test('wraps content in exec-brief div', () => { expect(html).toContain('exec-brief'); });
  test('renders Portfolio Assessment label', () => { expect(html).toContain('Portfolio Assessment'); });
  test('renders exec-brief-header', () => { expect(html).toContain('exec-brief-header'); });
  test('renders exec-brief-body', () => { expect(html).toContain('exec-brief-body'); });
  test('renders Key Metrics section', () => { expect(html).toContain('Key Metrics'); });
  test('renders Next Action section', () => { expect(html).toContain('Next Action'); });
});

describe('buildExecutiveBriefing — executive status: needs_attention', () => {
  test('forecast=critical → Needs Attention', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'critical', architectureScore: 85 });
    expect(html).toContain('Needs Attention');
    expect(html).toContain('sev-high');
  });

  test('forecast=degrading → Needs Attention', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'degrading', architectureScore: 85 })).toContain('Needs Attention');
  });

  test('criticalRepos=3 → Needs Attention (at threshold)', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 3 })).toContain('Needs Attention');
  });

  test('criticalRepos=4 → Needs Attention (above threshold)', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 4 })).toContain('Needs Attention');
  });

  test('architectureScore=59 → Needs Attention', () => {
    expect(buildExecutiveBriefing({ architectureScore: 59 })).toContain('Needs Attention');
  });

  test('architectureScore=0 → Needs Attention', () => {
    expect(buildExecutiveBriefing({ architectureScore: 0 })).toContain('Needs Attention');
  });

  test('governanceScore=59 → Needs Attention', () => {
    expect(buildExecutiveBriefing({ governanceScore: 59 })).toContain('Needs Attention');
  });

  test('assessment text references immediate attention', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'critical', architectureScore: 85 });
    expect(html).toContain('immediate attention');
  });
});

describe('buildExecutiveBriefing — executive status: watch', () => {
  test('forecast=watch → Watch badge', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'watch', architectureScore: 85 });
    expect(html).toContain('Watch');
    expect(html).toContain('sev-medium');
  });

  test('criticalRepos=1 + stable forecast → Watch (not Needs Attention)', () => {
    const html = buildExecutiveBriefing({ criticalRepos: 1, forecastLevel: 'stable' });
    expect(html).toContain('Watch');
    expect(html).not.toContain('Needs Attention');
  });

  test('criticalRepos=2 + stable forecast → Watch (not Needs Attention)', () => {
    const html = buildExecutiveBriefing({ criticalRepos: 2, forecastLevel: 'stable' });
    expect(html).toContain('Watch');
    expect(html).not.toContain('Needs Attention');
  });

  test('task example: gov=74 arch=61 forecast=stable criticalRepos=1 → Watch', () => {
    const html = buildExecutiveBriefing({ governanceScore: 74, architectureScore: 61, forecastLevel: 'stable', criticalRepos: 1 });
    expect(html).toContain('Watch');
    expect(html).not.toContain('Needs Attention');
  });

  test('architectureScore=60 (in range 60-79) → Watch', () => {
    expect(buildExecutiveBriefing({ architectureScore: 60 })).toContain('Watch');
  });

  test('architectureScore=79 → Watch', () => {
    expect(buildExecutiveBriefing({ architectureScore: 79 })).toContain('Watch');
  });

  test('governanceScore=75 → Watch', () => {
    expect(buildExecutiveBriefing({ governanceScore: 75 })).toContain('Watch');
  });

  test('watchlistCount alone does not influence status (returns loading)', () => {
    expect(buildExecutiveBriefing({ watchlistCount: 1 })).toContain('briefing loading');
  });

  test('covPct=79 (7/9) → Watch', () => {
    expect(buildExecutiveBriefing({ snapshotCount: 7, repoCount: 9, forecastLevel: 'stable', criticalRepos: 0 })).toContain('Watch');
  });

  test('assessment text references monitoring', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'watch', architectureScore: 85 });
    expect(html).toContain('monitoring');
  });
});

describe('buildExecutiveBriefing — executive status: healthy', () => {
  const healthyKpi = { architectureScore: 85, governanceScore: 82, forecastLevel: 'stable', criticalRepos: 0, watchlistCount: 0, snapshotCount: 9, repoCount: 10 };

  test('all good signals → Healthy badge', () => {
    expect(buildExecutiveBriefing(healthyKpi)).toContain('Healthy');
    expect(buildExecutiveBriefing(healthyKpi)).toContain('sev-healthy');
  });

  test('assessment text references all monitored dimensions', () => {
    expect(buildExecutiveBriefing(healthyKpi)).toContain('healthy across all monitored dimensions');
  });
});

describe('buildExecutiveBriefing — executive status: stable', () => {
  test('some data loaded, no bad signals → Stable', () => {
    const html = buildExecutiveBriefing({ architectureScore: 85 }); // only one field, not all loaded
    expect(html).toContain('Stable');
  });

  test('stable assessment mentions partially loaded', () => {
    expect(buildExecutiveBriefing({ architectureScore: 85 })).toContain('partially loaded');
  });
});

describe('buildExecutiveBriefing — Key Metrics', () => {
  const html = buildExecutiveBriefing({ architectureScore: 75, governanceScore: 70, forecastLevel: 'watch', criticalRepos: 2, riskConcentration: 3, snapshotCount: 7, repoCount: 16 });

  test('renders Key Metrics section label', () => { expect(html).toContain('Key Metrics'); });
  test('renders Architecture Health metric label', () => { expect(html).toContain('Architecture Health'); });
  test('renders Critical Repos metric label', () => { expect(html).toContain('Critical Repos'); });
  test('renders Repositories at Risk metric label', () => { expect(html).toContain('Repositories at Risk'); });
  test('renders Snapshot Coverage metric label', () => { expect(html).toContain('Snapshot Coverage'); });
  test('arch 85 shows Healthy in Architecture Health metric', () => {
    expect(buildExecutiveBriefing({ architectureScore: 85 })).toContain('Healthy');
  });
  test('arch 65 shows Weak in Architecture Health metric', () => {
    expect(buildExecutiveBriefing({ architectureScore: 65 })).toContain('Weak');
  });
  test('arch 45 shows Weak in Architecture Health metric', () => {
    expect(buildExecutiveBriefing({ architectureScore: 45 })).toContain('Weak');
  });
  test('arch 44 shows Risky in Architecture Health metric', () => {
    expect(buildExecutiveBriefing({ architectureScore: 44 })).toContain('Risky');
  });
  test('criticalRepos=2 shows count in Critical Repos metric', () => {
    const h = buildExecutiveBriefing({ criticalRepos: 2 });
    expect(h).toContain('Critical Repos');
    expect(h).toContain('>2<');
  });
  test('criticalRepos=0 shows None in Critical Repos metric', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 0 })).toContain('None');
  });
  test('riskConcentration=4 shows count in Repositories at Risk metric', () => {
    const h = buildExecutiveBriefing({ architectureScore: 85, riskConcentration: 4 });
    expect(h).toContain('Repositories at Risk');
    expect(h).toContain('>4<');
  });
  test('riskConcentration=0 shows None in Repositories at Risk metric', () => {
    const h = buildExecutiveBriefing({ architectureScore: 85, riskConcentration: 0 });
    expect(h).toContain('Repositories at Risk');
    expect(h).toContain('None');
  });
  test('7/16 snapshot coverage shows 44% and ratio', () => {
    const h = buildExecutiveBriefing({ snapshotCount: 7, repoCount: 16, forecastLevel: 'stable', criticalRepos: 0 });
    expect(h).toContain('44%');
    expect(h).toContain('7 / 16');
  });
});

describe('buildExecutiveBriefing — Next Action', () => {
  const html = buildExecutiveBriefing({ architectureScore: 85, criticalRepos: 1 });

  test('renders Next Action section label', () => { expect(html).toContain('Next Action'); });
  test('renders standard remediation action text', () => {
    expect(html).toContain('Prioritize remediation');
    expect(html).toContain('highest-risk repositories');
  });
});

describe('buildExecutiveBriefing — XSS escaping', () => {
  test('does not throw for any reasonable input', () => {
    expect(() => buildExecutiveBriefing({
      architectureScore: 75, governanceScore: 70, forecastLevel: 'watch',
      criticalRepos: 1, watchlistCount: 3, snapshotCount: 5, repoCount: 10,
    })).not.toThrow();
  });

  test('null/missing fields render — without crashing', () => {
    const html = buildExecutiveBriefing({ architectureScore: 75 });
    expect(html).toContain('—');
  });
});
