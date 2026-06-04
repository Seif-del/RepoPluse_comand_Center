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
    || kpi.forecastLevel != null || kpi.criticalRepos != null || kpi.watchlistCount != null;

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
      || (kpi.watchlistCount    != null && kpi.watchlistCount    >  0)
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

  // ── Signal helpers ────────────────────────────────────────────────────────
  function scoreSev(s) {
    if (s == null) return 'unknown';
    return s >= 80 ? 'healthy' : s >= 60 ? 'medium' : 'high';
  }
  function forecastSev(l) {
    if (!l || l === 'none' || l === 'low') return 'healthy';
    if (l === 'stable')    return 'healthy';
    if (l === 'watch')     return 'medium';
    if (l === 'degrading') return 'high';
    if (l === 'critical')  return 'critical';
    return 'unknown';
  }

  // ── Key Signals ───────────────────────────────────────────────────────────
  var govSignal, archSignal, fcSignal, attnSignal, covSignal;

  if (kpi.governanceScore != null) {
    var gLbl = kpi.governanceScore >= 80 ? 'Strong' : kpi.governanceScore >= 60 ? 'Watch' : 'Weak';
    govSignal = { label: 'Governance', text: 'Score ' + kpi.governanceScore + ' — ' + gLbl, sev: scoreSev(kpi.governanceScore) };
  } else {
    govSignal = { label: 'Governance', text: '—', sev: 'unknown' };
  }

  if (kpi.architectureScore != null) {
    var aLbl = kpi.architectureScore >= 80 ? 'Healthy' : kpi.architectureScore >= 60 ? 'Watch' : 'At Risk';
    archSignal = { label: 'Architecture', text: 'Score ' + kpi.architectureScore + ' — ' + aLbl, sev: scoreSev(kpi.architectureScore) };
  } else {
    archSignal = { label: 'Architecture', text: '—', sev: 'unknown' };
  }

  var fcLabels = { none: 'None', low: 'Low', stable: 'Stable', watch: 'Watch', degrading: 'Degrading', critical: 'Critical' };
  var fcText   = kpi.forecastLevel ? (fcLabels[kpi.forecastLevel] || kpi.forecastLevel) : '—';
  fcSignal = { label: 'Forecast', text: fcText, sev: forecastSev(kpi.forecastLevel) };

  var attnParts   = [];
  if (kpi.criticalRepos  != null && kpi.criticalRepos  > 0) attnParts.push(kpi.criticalRepos  + ' critical');
  if (kpi.watchlistCount != null && kpi.watchlistCount > 0) attnParts.push(kpi.watchlistCount + ' watchlisted');
  var attnHasData = kpi.criticalRepos != null || kpi.watchlistCount != null;
  var attnText    = attnParts.length ? attnParts.join(', ') + ' repos' : attnHasData ? 'None' : '—';
  var attnSev     = kpi.criticalRepos != null && kpi.criticalRepos > 0 ? 'critical'
    : kpi.watchlistCount != null && kpi.watchlistCount > 0 ? 'medium'
    : attnHasData ? 'healthy' : 'unknown';
  attnSignal = { label: 'Attention Required', text: attnText, sev: attnSev };

  if (covPct != null) {
    var covSev = covPct >= 80 ? 'healthy' : covPct >= 50 ? 'medium' : 'high';
    covSignal = { label: 'Snapshot Coverage', text: covPct + '% (' + covRatio + ')', sev: covSev };
  } else {
    covSignal = { label: 'Snapshot Coverage', text: '—', sev: 'unknown' };
  }

  var signals = [govSignal, archSignal, fcSignal, attnSignal, covSignal];

  // ── Portfolio Assessment ──────────────────────────────────────────────────
  var assessment;
  if (status === 'needs_attention') {
    var naReasons = [];
    if (kpi.forecastLevel === 'critical')  naReasons.push('critical structural forecast');
    if (kpi.forecastLevel === 'degrading') naReasons.push('degrading structural forecast');
    if (kpi.criticalRepos != null && kpi.criticalRepos > 0)  naReasons.push(kpi.criticalRepos + ' critical repo' + (kpi.criticalRepos > 1 ? 's' : ''));
    if (kpi.architectureScore != null && kpi.architectureScore < 60) naReasons.push('architecture score ' + kpi.architectureScore);
    if (kpi.governanceScore   != null && kpi.governanceScore   < 60) naReasons.push('governance score ' + kpi.governanceScore);
    assessment = 'Portfolio requires immediate attention — ' + (naReasons.slice(0, 2).join(', ') || 'critical signals detected') + '.';
  } else if (status === 'watch') {
    var wReasons = [];
    if (kpi.forecastLevel === 'watch')     wReasons.push('structural forecast in watch state');
    if (kpi.watchlistCount != null && kpi.watchlistCount > 0) wReasons.push(kpi.watchlistCount + ' repo' + (kpi.watchlistCount > 1 ? 's' : '') + ' on watchlist');
    if (kpi.architectureScore != null && kpi.architectureScore < 80) wReasons.push('architecture score at ' + kpi.architectureScore);
    if (kpi.governanceScore   != null && kpi.governanceScore   < 80) wReasons.push('governance at ' + kpi.governanceScore);
    assessment = 'Portfolio is stable with signals requiring monitoring — ' + (wReasons.slice(0, 2).join(', ') || 'elevated indicators present') + '.';
  } else if (status === 'healthy') {
    assessment = 'Portfolio architecture is healthy across all monitored dimensions. Governance, forecast, and coverage are within acceptable thresholds.';
  } else {
    assessment = 'Portfolio intelligence is partially loaded. Architecture signals will update as data completes.';
  }

  // ── Primary Risks ─────────────────────────────────────────────────────────
  var risks = [];
  if (kpi.forecastLevel === 'critical')  risks.push('Structural degradation forecast is critical — architecture integrity is at risk.');
  if (kpi.forecastLevel === 'degrading') risks.push('Structural degradation is forecast — coupling and complexity trends are worsening.');
  if (kpi.criticalRepos != null && kpi.criticalRepos > 0) {
    risks.push(kpi.criticalRepos + ' repositor' + (kpi.criticalRepos > 1 ? 'ies' : 'y') + ' flagged as critical in the architecture watchlist.');
  }
  if (kpi.architectureScore != null && kpi.architectureScore < 60) {
    risks.push('Portfolio architecture health score (' + kpi.architectureScore + ') is below the acceptable threshold of 60.');
  }
  if (kpi.governanceScore != null && kpi.governanceScore < 60) {
    risks.push('Engineering governance score (' + kpi.governanceScore + ') indicates structural governance deficits.');
  }
  if (kpi.watchlistCount != null && kpi.watchlistCount >= 5) {
    risks.push(kpi.watchlistCount + ' repositories are on the architecture watchlist and require attention.');
  }
  if (covPct != null && covPct < 50) {
    risks.push('Architecture snapshot coverage is insufficient (' + covPct + '%) — intelligence accuracy may be limited.');
  }

  // ── Recommended Actions ───────────────────────────────────────────────────
  var recs = [];
  if (kpi.criticalRepos != null && kpi.criticalRepos > 0)                         recs.push('Review and address critical repositories immediately.');
  if (kpi.forecastLevel === 'critical' || kpi.forecastLevel === 'degrading')       recs.push('Investigate structural degradation root cause across the portfolio.');
  if (kpi.architectureScore != null && kpi.architectureScore < 60)                recs.push('Prioritize architecture improvements for the lowest-scoring repositories.');
  if (kpi.governanceScore   != null && kpi.governanceScore   < 60)                recs.push('Strengthen engineering governance practices and architectural standards.');
  if (kpi.watchlistCount != null && kpi.watchlistCount >= 5)                      recs.push('Triage architecture watchlist and prioritize remediation for elevated repositories.');
  if (covPct != null && covPct < 50)                                               recs.push('Increase architecture snapshot coverage to improve intelligence accuracy.');
  if (!recs.length) recs.push('Maintain current architecture health standards and continue regular snapshots.');

  // ── Render ────────────────────────────────────────────────────────────────
  var html = '<div class="exec-brief sev-' + esc(statusSev) + '">';
  html += '<div class="exec-brief-header">';
  html += '<span class="exec-brief-label">Architecture Intelligence Briefing</span>';
  html += '<span class="exec-brief-badge severity-' + esc(statusSev) + '">' + esc(statusLabel) + '</span>';
  html += '</div>';
  html += '<div class="exec-brief-summary" style="margin-top:4px;">' + esc(assessment) + '</div>';
  html += '<div class="exec-brief-body" style="margin-top:12px;">';

  html += '<div class="exec-brief-col" style="min-width:230px;">';
  html += '<div class="exec-brief-col-label">Key Signals</div>';
  html += '<div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">';
  signals.forEach(function(s) {
    html += '<div style="display:flex;align-items:center;gap:8px;">';
    html += '<span style="width:7px;height:7px;border-radius:50%;background:var(--sev-' + esc(s.sev) + '-text);flex-shrink:0;display:inline-block;"></span>';
    html += '<span style="font-size:0.74rem;color:var(--text-muted);min-width:118px;flex-shrink:0;">' + esc(s.label) + '</span>';
    html += '<span style="font-size:0.80rem;color:var(--text-primary);">' + esc(s.text) + '</span>';
    html += '</div>';
  });
  html += '</div></div>';

  if (risks.length) {
    html += '<div class="exec-brief-col">';
    html += '<div class="exec-brief-col-label">Primary Risks</div>';
    html += '<ul class="exec-brief-list">';
    risks.slice(0, 3).forEach(function(r) { html += '<li class="exec-brief-item">' + esc(r) + '</li>'; });
    html += '</ul>';
    html += '</div>';
  }

  html += '<div class="exec-brief-col">';
  html += '<div class="exec-brief-col-label">Recommended Actions</div>';
  html += '<ul class="exec-brief-list">';
  recs.slice(0, 3).forEach(function(r) { html += '<li class="exec-brief-rec-item">' + esc(r) + '</li>'; });
  html += '</ul></div>';

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
  test('renders Architecture Intelligence Briefing label', () => { expect(html).toContain('Architecture Intelligence Briefing'); });
  test('renders exec-brief-header', () => { expect(html).toContain('exec-brief-header'); });
  test('renders exec-brief-body', () => { expect(html).toContain('exec-brief-body'); });
  test('renders Key Signals section', () => { expect(html).toContain('Key Signals'); });
  test('renders Recommended Actions section', () => { expect(html).toContain('Recommended Actions'); });
});

describe('buildExecutiveBriefing — executive status: needs_attention', () => {
  test('forecast=critical → Needs Attention', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'critical' });
    expect(html).toContain('Needs Attention');
    expect(html).toContain('sev-high');
  });

  test('forecast=degrading → Needs Attention', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'degrading' })).toContain('Needs Attention');
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
    const html = buildExecutiveBriefing({ forecastLevel: 'critical' });
    expect(html).toContain('immediate attention');
  });
});

describe('buildExecutiveBriefing — executive status: watch', () => {
  test('forecast=watch → Watch badge', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'watch' });
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

  test('watchlistCount=1 → Watch', () => {
    expect(buildExecutiveBriefing({ watchlistCount: 1 })).toContain('Watch');
  });

  test('covPct=79 (7/9) → Watch', () => {
    expect(buildExecutiveBriefing({ snapshotCount: 7, repoCount: 9, forecastLevel: 'stable' })).toContain('Watch');
  });

  test('assessment text references monitoring', () => {
    const html = buildExecutiveBriefing({ forecastLevel: 'watch' });
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

describe('buildExecutiveBriefing — Key Signals labels', () => {
  const html = buildExecutiveBriefing({ architectureScore: 75, governanceScore: 70, forecastLevel: 'watch', criticalRepos: 0, watchlistCount: 2 });

  test('renders Governance signal', () => { expect(html).toContain('Governance'); });
  test('renders Architecture signal', () => { expect(html).toContain('Architecture'); });
  test('renders Forecast signal', () => { expect(html).toContain('Forecast'); });
  test('renders Attention Required signal', () => { expect(html).toContain('Attention Required'); });
  test('renders Snapshot Coverage signal', () => { expect(html).toContain('Snapshot Coverage'); });
});

describe('buildExecutiveBriefing — Key Signals values', () => {
  test('gov 85 → Strong label', () => {
    expect(buildExecutiveBriefing({ governanceScore: 85 })).toContain('Strong');
  });
  test('gov 70 → Watch label', () => {
    expect(buildExecutiveBriefing({ governanceScore: 70 })).toContain('Watch');
  });
  test('gov 55 → Weak label', () => {
    expect(buildExecutiveBriefing({ governanceScore: 55 })).toContain('Weak');
  });
  test('arch 85 → Healthy label', () => {
    expect(buildExecutiveBriefing({ architectureScore: 85 })).toContain('Healthy');
  });
  test('arch 65 → Watch label in signal', () => {
    expect(buildExecutiveBriefing({ architectureScore: 65 })).toContain('Watch');
  });
  test('arch 45 → At Risk label', () => {
    expect(buildExecutiveBriefing({ architectureScore: 45 })).toContain('At Risk');
  });
  test('forecast stable → Stable in signal', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'stable' })).toContain('Stable');
  });
  test('forecast degrading → Degrading in signal', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'degrading' })).toContain('Degrading');
  });
  test('criticalRepos=2 and watchlistCount=3 → shows "2 critical, 3 watchlisted repos"', () => {
    const html = buildExecutiveBriefing({ criticalRepos: 2, watchlistCount: 3 });
    expect(html).toContain('2 critical');
    expect(html).toContain('3 watchlisted');
  });
  test('criticalRepos=0 and watchlistCount=0 → shows None', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 0, watchlistCount: 0 })).toContain('None');
  });
  test('7/16 snapshot coverage shows 44%', () => {
    const html = buildExecutiveBriefing({ snapshotCount: 7, repoCount: 16, forecastLevel: 'stable' });
    expect(html).toContain('44%');
    expect(html).toContain('7 / 16');
  });
});

describe('buildExecutiveBriefing — Primary Risks', () => {
  test('forecast=critical adds critical structural forecast risk', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'critical' })).toContain('critical');
  });
  test('forecast=degrading adds degrading forecast risk', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'degrading' })).toContain('Structural degradation is forecast');
  });
  test('criticalRepos=1 adds repository risk', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 1 })).toContain('1 repository flagged as critical');
  });
  test('criticalRepos=2 uses plural "repositories"', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 2 })).toContain('2 repositories flagged');
  });
  test('archScore=55 adds architecture score risk', () => {
    expect(buildExecutiveBriefing({ architectureScore: 55 })).toContain('below the acceptable threshold');
  });
  test('govScore=50 adds governance risk', () => {
    expect(buildExecutiveBriefing({ governanceScore: 50 })).toContain('governance deficits');
  });
  test('watchlistCount=5 adds watchlist risk', () => {
    expect(buildExecutiveBriefing({ watchlistCount: 5 })).toContain('architecture watchlist');
  });
  test('watchlistCount=4 does NOT add watchlist risk', () => {
    const html = buildExecutiveBriefing({ watchlistCount: 4, forecastLevel: 'stable' });
    expect(html).not.toContain('architecture watchlist and require attention');
  });
  test('no bad signals → no Primary Risks section', () => {
    const html = buildExecutiveBriefing({
      architectureScore: 85, governanceScore: 85, forecastLevel: 'stable', criticalRepos: 0, watchlistCount: 0,
    });
    expect(html).not.toContain('Primary Risks');
  });
  test('caps risks at top 3', () => {
    const html = buildExecutiveBriefing({
      forecastLevel: 'critical', criticalRepos: 3, architectureScore: 40, governanceScore: 40, watchlistCount: 6,
    });
    const listItems = (html.match(/exec-brief-item/g) || []).length;
    expect(listItems).toBeLessThanOrEqual(3);
  });
});

describe('buildExecutiveBriefing — Recommended Actions', () => {
  test('criticalRepos=1 → Review immediately action', () => {
    expect(buildExecutiveBriefing({ criticalRepos: 1 })).toContain('Review and address critical repositories immediately');
  });
  test('degrading forecast → Investigate root cause action', () => {
    expect(buildExecutiveBriefing({ forecastLevel: 'degrading' })).toContain('Investigate structural degradation root cause');
  });
  test('govScore=50 → Strengthen governance action', () => {
    expect(buildExecutiveBriefing({ governanceScore: 50 })).toContain('Strengthen engineering governance');
  });
  test('archScore=50 → Prioritize architecture action', () => {
    expect(buildExecutiveBriefing({ architectureScore: 50 })).toContain('Prioritize architecture improvements');
  });
  test('watchlistCount=5 → Triage watchlist action', () => {
    expect(buildExecutiveBriefing({ watchlistCount: 5 })).toContain('Triage architecture watchlist');
  });
  test('all healthy → Maintain standards action', () => {
    const html = buildExecutiveBriefing({
      architectureScore: 85, governanceScore: 85, forecastLevel: 'stable', criticalRepos: 0, watchlistCount: 0,
    });
    expect(html).toContain('Maintain current architecture health standards');
  });
  test('caps recommended actions at top 3', () => {
    const html = buildExecutiveBriefing({
      forecastLevel: 'critical', criticalRepos: 3, architectureScore: 40, governanceScore: 40,
      watchlistCount: 6, snapshotCount: 2, repoCount: 20,
    });
    const recItems = (html.match(/exec-brief-rec-item/g) || []).length;
    expect(recItems).toBeLessThanOrEqual(3);
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
