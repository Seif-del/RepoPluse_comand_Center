'use strict';

// Unit tests for the four Operational Status build functions added in Wave 1
// of the API Linkage Improvement (endpoints: /metrics, /risk, /pr-health, /events).
// No DOM or browser required — Jest node env only.

// ── Minimal esc stub ─────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── buildRepoMetricsHtml (copied verbatim from dashboard.html) ───────────────
function buildRepoMetricsHtml(data) {
  if (!data) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No operational metrics available yet.</p>';
  }
  var commits = data.commits7d  != null ? String(data.commits7d)  : '—';
  var openPrs = data.openPrs    != null ? String(data.openPrs)    : '—';
  var stale   = data.stalePrs   != null ? String(data.stalePrs)   : '—';
  var issues  = data.openIssues != null ? String(data.openIssues) : '—';
  var ms = 'font-size:0.74rem;color:var(--text-muted);';
  var vs = 'font-size:0.86rem;font-weight:600;color:var(--text-primary);';
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px 16px;padding:4px 0;">'
    + '<div><span style="' + ms + '">Commits (7d) </span><span style="' + vs + '">' + esc(commits) + '</span></div>'
    + '<div><span style="' + ms + '">Open PRs </span><span style="' + vs + '">' + esc(openPrs) + '</span></div>'
    + '<div><span style="' + ms + '">Stale PRs </span><span style="' + vs + '">' + esc(stale) + '</span></div>'
    + '<div><span style="' + ms + '">Open Issues </span><span style="' + vs + '">' + esc(issues) + '</span></div>'
    + '</div>';
}

// ── buildRepoRiskHtml (copied verbatim from dashboard.html) ──────────────────
function buildRepoRiskHtml(data) {
  var EMPTY = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No risk score available yet.</p>';
  if (!data || !data.current) return EMPTY;
  var cur   = data.current;
  var prev  = data.previous || null;
  var score = cur.score != null ? String(cur.score) : '—';
  var label = (cur.label || 'unknown').toLowerCase();
  var labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  var labelCls = label === 'healthy'                       ? 'severity-healthy'
               : label === 'watch'                         ? 'severity-medium'
               : label === 'at_risk' || label === 'at-risk' ? 'severity-high'
               : label === 'critical'                      ? 'severity-critical'
               : 'severity-unknown';
  var deltaTxt = '';
  if (prev && prev.score != null && cur.score != null) {
    var delta = cur.score - prev.score;
    deltaTxt = delta > 0 ? ' (+' + delta + ' vs prior)'
             : delta < 0 ? ' (' + delta + ' vs prior)'
             : ' (unchanged)';
  }
  var bs = 'font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;'
         + 'padding:2px 8px;border-radius:99px;border:1px solid transparent;';
  return '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 0;">'
    + '<span style="font-size:1.1rem;font-weight:700;color:var(--text-primary);">' + esc(score) + '</span>'
    + '<span class="aq-badge ' + labelCls + '" style="' + bs + '">' + esc(labelCap) + '</span>'
    + (deltaTxt ? '<span style="font-size:0.78rem;color:var(--text-muted);">' + esc(deltaTxt) + '</span>' : '')
    + '</div>';
}

// ── buildRepoPrHealthHtml (copied verbatim from dashboard.html) ──────────────
function buildRepoPrHealthHtml(data) {
  var EMPTY = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No PR health data available yet.</p>';
  if (!data) return EMPTY;
  var label = (data.label || 'unknown').toLowerCase();
  if (label === 'none')    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No pull request activity detected.</p>';
  if (label === 'unknown') return EMPTY;
  var labelCap = label.charAt(0).toUpperCase() + label.slice(1);
  var labelCls = label === 'healthy'  ? 'severity-healthy'
               : label === 'watch'    ? 'severity-medium'
               : label === 'high'     ? 'severity-high'
               : label === 'critical' ? 'severity-critical'
               : 'severity-unknown';
  var bs = 'font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;'
         + 'padding:2px 8px;border-radius:99px;border:1px solid transparent;';
  var reasons = Array.isArray(data.reasons) ? data.reasons : [];
  var html = '<div style="padding:4px 0;">';
  html += '<span class="aq-badge ' + labelCls + '" style="' + bs + '">' + esc(labelCap) + '</span>';
  if (reasons.length > 0) {
    html += '<ul style="margin:6px 0 0;padding-left:16px;font-size:0.80rem;line-height:1.7;">';
    reasons.slice(0, 2).forEach(function(r) {
      html += '<li style="color:var(--text-secondary);">' + esc(r) + '</li>';
    });
    html += '</ul>';
  } else {
    html += '<span style="font-size:0.74rem;color:var(--text-muted);margin-left:8px;">No PR health issues detected.</span>';
  }
  html += '</div>';
  return html;
}

// ── buildRepoEventsHtml (copied verbatim from dashboard.html) ────────────────
function buildRepoEventsHtml(data) {
  var EMPTY = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:2px 0;">No recent operational events detected.</p>';
  if (!data) return EMPTY;
  var events = Array.isArray(data.events) ? data.events : [];
  if (events.length === 0) return EMPTY;
  var SEV_CLS = {
    critical: 'severity-critical',
    high:     'severity-high',
    medium:   'severity-medium',
    healthy:  'severity-healthy',
  };
  var EVENT_LABEL = {
    risk_increase:                 'Risk Increased',
    risk_recovery:                 'Risk Recovered',
    ci_failure_detected:           'CI Failed',
    ci_recovered:                  'CI Recovered',
    release_activity_declined:     'Release Declined',
    release_activity_recovered:    'Release Recovered',
    contributor_activity_declined: 'Activity Declined',
    contributor_activity_recovered:'Activity Recovered',
    bus_factor_detected:           'Bus Factor Risk',
  };
  var bs = 'font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;'
         + 'padding:1px 7px;border-radius:99px;border:1px solid transparent;white-space:nowrap;';
  var html = '<div style="display:flex;flex-direction:column;gap:5px;padding:4px 0;">';
  events.slice(0, 3).forEach(function(ev) {
    var evLabel = EVENT_LABEL[ev.type] || String(ev.type || 'Event').replace(/_/g, ' ');
    var sevCls  = SEV_CLS[ev.severity] || 'severity-unknown';
    var desc    = ev.description || '';
    html += '<div style="display:flex;align-items:flex-start;gap:8px;">';
    html += '<span class="aq-badge ' + sevCls + '" style="' + bs + '">' + esc(evLabel) + '</span>';
    if (desc) {
      html += '<span style="font-size:0.78rem;color:var(--text-secondary);line-height:1.4;">' + esc(desc) + '</span>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildRepoMetricsHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRepoMetricsHtml — empty states', () => {
  test('null data renders empty-state message', () => {
    const html = buildRepoMetricsHtml(null);
    expect(html).toContain('No operational metrics available yet.');
    expect(html).not.toContain('grid');
  });

  test('undefined data renders empty-state message', () => {
    const html = buildRepoMetricsHtml(undefined);
    expect(html).toContain('No operational metrics available yet.');
  });
});

describe('buildRepoMetricsHtml — values', () => {
  const data = { commits7d: 12, openPrs: 3, stalePrs: 1, openIssues: 7 };

  test('renders commits7d value', () => {
    expect(buildRepoMetricsHtml(data)).toContain('>12<');
  });

  test('renders openPrs value', () => {
    expect(buildRepoMetricsHtml(data)).toContain('>3<');
  });

  test('renders stalePrs value', () => {
    expect(buildRepoMetricsHtml(data)).toContain('>1<');
  });

  test('renders openIssues value', () => {
    expect(buildRepoMetricsHtml(data)).toContain('>7<');
  });

  test('renders all four labels', () => {
    const html = buildRepoMetricsHtml(data);
    expect(html).toContain('Commits (7d)');
    expect(html).toContain('Open PRs');
    expect(html).toContain('Stale PRs');
    expect(html).toContain('Open Issues');
  });

  test('null field values render as em dash', () => {
    const html = buildRepoMetricsHtml({ commits7d: null, openPrs: null, stalePrs: null, openIssues: null });
    expect(html.match(/—/g).length).toBe(4);
  });

  test('zero values render as 0, not em dash', () => {
    const html = buildRepoMetricsHtml({ commits7d: 0, openPrs: 0, stalePrs: 0, openIssues: 0 });
    expect(html).not.toContain('—');
    expect(html.match(/>0</g).length).toBe(4);
  });

  test('renders a CSS grid container', () => {
    expect(buildRepoMetricsHtml(data)).toContain('grid-template-columns');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRepoRiskHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRepoRiskHtml — empty states', () => {
  test('null data renders empty-state message', () => {
    expect(buildRepoRiskHtml(null)).toContain('No risk score available yet.');
  });

  test('data without current renders empty-state', () => {
    expect(buildRepoRiskHtml({ previous: null })).toContain('No risk score available yet.');
  });

  test('data.current = null renders empty-state', () => {
    expect(buildRepoRiskHtml({ current: null })).toContain('No risk score available yet.');
  });
});

describe('buildRepoRiskHtml — score and label', () => {
  test('renders score value', () => {
    const html = buildRepoRiskHtml({ current: { score: 72, label: 'healthy' } });
    expect(html).toContain('>72<');
  });

  test('healthy label gets severity-healthy class', () => {
    const html = buildRepoRiskHtml({ current: { score: 80, label: 'healthy' } });
    expect(html).toContain('severity-healthy');
    expect(html).toContain('>Healthy<');
  });

  test('watch label gets severity-medium class', () => {
    const html = buildRepoRiskHtml({ current: { score: 60, label: 'watch' } });
    expect(html).toContain('severity-medium');
    expect(html).toContain('>Watch<');
  });

  test('at_risk label gets severity-high class', () => {
    const html = buildRepoRiskHtml({ current: { score: 40, label: 'at_risk' } });
    expect(html).toContain('severity-high');
    expect(html).toContain('>At_risk<');
  });

  test('at-risk label (hyphen) also gets severity-high class', () => {
    const html = buildRepoRiskHtml({ current: { score: 40, label: 'at-risk' } });
    expect(html).toContain('severity-high');
  });

  test('critical label gets severity-critical class', () => {
    const html = buildRepoRiskHtml({ current: { score: 20, label: 'critical' } });
    expect(html).toContain('severity-critical');
    expect(html).toContain('>Critical<');
  });

  test('unknown label gets severity-unknown class', () => {
    const html = buildRepoRiskHtml({ current: { score: null, label: 'unknown' } });
    expect(html).toContain('severity-unknown');
  });

  test('null score renders em dash, not null', () => {
    const html = buildRepoRiskHtml({ current: { score: null, label: 'watch' } });
    expect(html).toContain('>—<');
    expect(html).not.toContain('>null<');
  });
});

describe('buildRepoRiskHtml — delta vs prior', () => {
  test('positive delta shows +N vs prior', () => {
    const html = buildRepoRiskHtml({ current: { score: 72, label: 'healthy' }, previous: { score: 64, label: 'watch' } });
    expect(html).toContain('+8 vs prior');
  });

  test('negative delta shows -N vs prior', () => {
    const html = buildRepoRiskHtml({ current: { score: 50, label: 'watch' }, previous: { score: 65, label: 'healthy' } });
    expect(html).toContain('-15 vs prior');
  });

  test('zero delta shows unchanged', () => {
    const html = buildRepoRiskHtml({ current: { score: 70, label: 'watch' }, previous: { score: 70, label: 'watch' } });
    expect(html).toContain('unchanged');
  });

  test('no previous — no delta text rendered', () => {
    const html = buildRepoRiskHtml({ current: { score: 72, label: 'healthy' }, previous: null });
    expect(html).not.toContain('vs prior');
    expect(html).not.toContain('unchanged');
  });

  test('previous without score — no delta rendered', () => {
    const html = buildRepoRiskHtml({ current: { score: 72, label: 'healthy' }, previous: { score: null } });
    expect(html).not.toContain('vs prior');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRepoPrHealthHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRepoPrHealthHtml — empty states', () => {
  test('null data renders empty-state message', () => {
    expect(buildRepoPrHealthHtml(null)).toContain('No PR health data available yet.');
  });

  test('label "none" renders no-PR-activity message', () => {
    expect(buildRepoPrHealthHtml({ label: 'none' })).toContain('No pull request activity detected.');
  });

  test('label "unknown" renders empty-state message', () => {
    expect(buildRepoPrHealthHtml({ label: 'unknown' })).toContain('No PR health data available yet.');
  });

  test('missing label treated as unknown — empty-state message', () => {
    expect(buildRepoPrHealthHtml({})).toContain('No PR health data available yet.');
  });
});

describe('buildRepoPrHealthHtml — label and severity', () => {
  test('healthy label gets severity-healthy class', () => {
    const html = buildRepoPrHealthHtml({ label: 'healthy', reasons: [] });
    expect(html).toContain('severity-healthy');
    expect(html).toContain('>Healthy<');
  });

  test('watch label gets severity-medium class', () => {
    const html = buildRepoPrHealthHtml({ label: 'watch', reasons: [] });
    expect(html).toContain('severity-medium');
    expect(html).toContain('>Watch<');
  });

  test('high label gets severity-high class', () => {
    const html = buildRepoPrHealthHtml({ label: 'high', reasons: [] });
    expect(html).toContain('severity-high');
    expect(html).toContain('>High<');
  });

  test('critical label gets severity-critical class', () => {
    const html = buildRepoPrHealthHtml({ label: 'critical', reasons: [] });
    expect(html).toContain('severity-critical');
  });
});

describe('buildRepoPrHealthHtml — reasons', () => {
  test('no reasons renders no-issues-detected text', () => {
    const html = buildRepoPrHealthHtml({ label: 'healthy', reasons: [] });
    expect(html).toContain('No PR health issues detected.');
    expect(html).not.toContain('<ul');
  });

  test('one reason renders as list item', () => {
    const html = buildRepoPrHealthHtml({ label: 'watch', reasons: ['2 stale pull requests'] });
    expect(html).toContain('<ul');
    expect(html).toContain('2 stale pull requests');
  });

  test('two reasons both rendered', () => {
    const html = buildRepoPrHealthHtml({ label: 'high', reasons: ['stale PRs', 'high latency'] });
    expect(html).toContain('stale PRs');
    expect(html).toContain('high latency');
    expect(html.match(/<li/g).length).toBe(2);
  });

  test('only first two reasons shown when more than two exist', () => {
    const html = buildRepoPrHealthHtml({ label: 'critical', reasons: ['a', 'b', 'c'] });
    expect(html.match(/<li/g).length).toBe(2);
    expect(html).not.toContain('>c<');
  });

  test('null reasons treated as empty array — no-issues message', () => {
    const html = buildRepoPrHealthHtml({ label: 'healthy', reasons: null });
    expect(html).toContain('No PR health issues detected.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRepoEventsHtml
// ─────────────────────────────────────────────────────────────────────────────

describe('buildRepoEventsHtml — empty states', () => {
  test('null data renders empty-state message', () => {
    expect(buildRepoEventsHtml(null)).toContain('No recent operational events detected.');
  });

  test('empty events array renders empty-state message', () => {
    expect(buildRepoEventsHtml({ events: [] })).toContain('No recent operational events detected.');
  });

  test('missing events field renders empty-state message', () => {
    expect(buildRepoEventsHtml({})).toContain('No recent operational events detected.');
  });

  test('null events field renders empty-state message', () => {
    expect(buildRepoEventsHtml({ events: null })).toContain('No recent operational events detected.');
  });
});

describe('buildRepoEventsHtml — event labels', () => {
  function makeEvent(type, severity, description) {
    return { type, severity: severity || 'medium', description: description || '' };
  }

  test('ci_failure_detected renders "CI Failed" label', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('ci_failure_detected', 'critical')] });
    expect(html).toContain('CI Failed');
  });

  test('ci_recovered renders "CI Recovered" label', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('ci_recovered', 'healthy')] });
    expect(html).toContain('CI Recovered');
  });

  test('risk_increase renders "Risk Increased" label', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('risk_increase', 'high')] });
    expect(html).toContain('Risk Increased');
  });

  test('risk_recovery renders "Risk Recovered" label', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('risk_recovery', 'healthy')] });
    expect(html).toContain('Risk Recovered');
  });

  test('bus_factor_detected renders "Bus Factor Risk" label', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('bus_factor_detected', 'high')] });
    expect(html).toContain('Bus Factor Risk');
  });

  test('unknown event type falls back to underscore-replaced type string', () => {
    const html = buildRepoEventsHtml({ events: [makeEvent('custom_signal', 'medium')] });
    expect(html).toContain('custom signal');
  });
});

describe('buildRepoEventsHtml — severity classes', () => {
  function singleEvent(severity) {
    return { events: [{ type: 'risk_increase', severity, description: '' }] };
  }

  test('critical severity gets severity-critical class', () => {
    expect(buildRepoEventsHtml(singleEvent('critical'))).toContain('severity-critical');
  });

  test('high severity gets severity-high class', () => {
    expect(buildRepoEventsHtml(singleEvent('high'))).toContain('severity-high');
  });

  test('medium severity gets severity-medium class', () => {
    expect(buildRepoEventsHtml(singleEvent('medium'))).toContain('severity-medium');
  });

  test('healthy severity gets severity-healthy class', () => {
    expect(buildRepoEventsHtml(singleEvent('healthy'))).toContain('severity-healthy');
  });

  test('unknown severity gets severity-unknown class', () => {
    expect(buildRepoEventsHtml(singleEvent('bogus'))).toContain('severity-unknown');
  });
});

describe('buildRepoEventsHtml — description and capping', () => {
  test('event description is rendered', () => {
    const html = buildRepoEventsHtml({
      events: [{ type: 'ci_failure_detected', severity: 'critical', description: 'CI status changed to failing.' }],
    });
    expect(html).toContain('CI status changed to failing.');
  });

  test('event with empty description renders no description span', () => {
    const html = buildRepoEventsHtml({
      events: [{ type: 'ci_failure_detected', severity: 'critical', description: '' }],
    });
    expect(html).not.toContain('font-size:0.78rem;color:var(--text-secondary)');
  });

  test('only first 3 events are rendered when more than 3 exist', () => {
    const events = [
      { type: 'ci_failure_detected', severity: 'critical', description: 'first' },
      { type: 'ci_recovered',        severity: 'healthy',  description: 'second' },
      { type: 'risk_increase',       severity: 'high',     description: 'third' },
      { type: 'risk_recovery',       severity: 'healthy',  description: 'fourth — must not appear' },
    ];
    const html = buildRepoEventsHtml({ events });
    expect(html).toContain('first');
    expect(html).toContain('second');
    expect(html).toContain('third');
    expect(html).not.toContain('fourth — must not appear');
  });

  test('exactly 3 events all rendered', () => {
    const events = [
      { type: 'ci_failure_detected', severity: 'critical', description: 'ev1' },
      { type: 'ci_recovered',        severity: 'healthy',  description: 'ev2' },
      { type: 'risk_increase',       severity: 'high',     description: 'ev3' },
    ];
    const html = buildRepoEventsHtml({ events });
    expect(html).toContain('ev1');
    expect(html).toContain('ev2');
    expect(html).toContain('ev3');
  });

  test('single event renders without error', () => {
    const html = buildRepoEventsHtml({
      events: [{ type: 'bus_factor_detected', severity: 'high', description: 'only one contributor' }],
    });
    expect(html).toContain('Bus Factor Risk');
    expect(html).toContain('only one contributor');
  });
});
