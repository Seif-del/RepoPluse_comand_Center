'use strict';

// Pure-logic unit tests for the Timeline tab architecture migration.
// buildArchTimelineHtml copied verbatim from dashboard.html.
// Jest node env — no DOM or browser required.

// ── Minimal esc stub ─────────────────────────────────────────────────────────
function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── buildArchTimelineHtml (copied verbatim from dashboard.html) ───────────────
function buildArchTimelineHtml(fc) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'No architecture snapshots available yet.</p>';
  if (!fc) return UNAVAIL;

  var events = Array.isArray(fc.driftEvents) ? fc.driftEvents : [];

  if (events.length === 0) {
    var msg = fc.timelineSummary || 'No architecture events detected yet.';
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
      + esc(msg) + '</p>';
  }

  var TYPE_LABEL = {
    score_drop:                'SCORE DROP',
    score_gain:                'IMPROVEMENT',
    level_degraded:            'DEGRADED',
    level_improved:            'IMPROVED',
    new_risk:                  'NEW RISK',
    resolved_risk:             'RESOLVED',
    coupling_growth:           'COUPLING',
    api_regression:            'API REGRESSION',
    implementation_regression: 'IMPL REGRESSION',
    version_change:            'VERSION CHANGE',
  };

  var SEV_CLASS = {
    high:   'severity-high',
    medium: 'severity-medium',
    low:    'severity-healthy',
  };

  var html = '';
  if (fc.timelineSummary) {
    html += '<p style="font-size:0.82rem;color:var(--text-secondary);padding:4px 0 8px;">'
          + esc(fc.timelineSummary) + '</p>';
  }

  html += '<div class="timeline-list">';
  events.forEach(function(ev) {
    var sevCls   = 'timeline-badge ' + (SEV_CLASS[ev.severity] || 'severity-unknown');
    var badgeTxt = TYPE_LABEL[ev.type] || esc(String(ev.type || 'EVENT')).toUpperCase();
    var timeStr  = ev.snapshotAt
      ? new Date(ev.snapshotAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';
    var detail = '';
    if (ev.type === 'version_change') {
      var pa = ev.prevAnalyzerVersion || 'legacy';
      var ca = ev.currAnalyzerVersion || 'legacy';
      var ps = ev.prevScoringVersion  || 'legacy';
      var cs = ev.currScoringVersion  || 'legacy';
      var ds = 'font-size:0.70rem;color:var(--text-muted);margin-top:3px;';
      detail += '<div style="' + ds + '">Analyzer: ' + esc(pa) + ' → ' + esc(ca) + '</div>';
      detail += '<div style="' + ds + '">Scoring: '  + esc(ps) + ' → ' + esc(cs) + '</div>';
      detail += '<div style="' + ds + '">Score comparison suppressed across this boundary</div>';
    }
    html += '<div class="timeline-item">'
      + '<span class="' + esc(sevCls) + '">' + esc(badgeTxt) + '</span>'
      + '<div class="timeline-content">'
      + '<div class="timeline-desc">' + esc(ev.summary || '') + '</div>'
      + detail
      + '</div>'
      + '<span class="timeline-time">' + esc(timeStr) + '</span>'
      + '</div>';
  });
  html += '</div>';
  return html;
}

// ── Static Timeline tab template (mirrors the selectRepo template string) ─────
const TIMELINE_TAB_HTML = [
  '<div class="repo-tab-panel" data-panel="timeline">',
  '<div class="repo-detail-label section-secondary" style="margin-top:8px;">Architecture Timeline</div>',
  '<div id="repo-timeline-content"></div>',
  '</div>',
].join('');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFc(overrides) {
  return Object.assign({
    forecastLevel:   'high',
    driftEvents:     [],
    timelineEntries: [],
    timelineSummary: '',
  }, overrides);
}

function makeEvent(overrides) {
  return Object.assign({
    snapshotAt: '2026-01-15T10:30:00Z',
    type:       'score_drop',
    severity:   'high',
    summary:    'Architecture health score dropped by 15 points.',
  }, overrides);
}

// ── Timeline tab template — correct labels ────────────────────────────────────

describe('Timeline tab template — architecture label present', () => {
  test('contains "Architecture Timeline" label', () => {
    expect(TIMELINE_TAB_HTML).toContain('Architecture Timeline');
  });

  test('contains repo-timeline-content div', () => {
    expect(TIMELINE_TAB_HTML).toContain('id="repo-timeline-content"');
  });
});

describe('Timeline tab template — operational labels absent', () => {
  test('does not contain "Operational Timeline"', () => {
    expect(TIMELINE_TAB_HTML).not.toContain('Operational Timeline');
  });

  test('does not contain "Operational Events"', () => {
    expect(TIMELINE_TAB_HTML).not.toContain('Operational Events');
  });

  test('does not contain "Operational History"', () => {
    expect(TIMELINE_TAB_HTML).not.toContain('Operational History');
  });
});

// ── buildArchTimelineHtml — fallback states ───────────────────────────────────

describe('buildArchTimelineHtml — fallback states', () => {
  test('null fc returns "No architecture snapshots available yet."', () => {
    const html = buildArchTimelineHtml(null);
    expect(html).toContain('No architecture snapshots available yet.');
  });

  test('fc with empty driftEvents returns no-events message', () => {
    const html = buildArchTimelineHtml(makeFc({ driftEvents: [] }));
    expect(html).toContain('No architecture events detected yet.');
  });

  test('fc with empty driftEvents and custom timelineSummary shows that summary', () => {
    const html = buildArchTimelineHtml(makeFc({
      driftEvents:     [],
      timelineSummary: 'Architecture health is stable across 3 snapshots.',
    }));
    expect(html).toContain('Architecture health is stable across 3 snapshots.');
    expect(html).not.toContain('No architecture events detected yet.');
  });

  test('null fc does not contain "No operational events"', () => {
    const html = buildArchTimelineHtml(null);
    expect(html).not.toContain('No operational events');
  });

  test('empty driftEvents does not contain "No operational events"', () => {
    const html = buildArchTimelineHtml(makeFc({ driftEvents: [] }));
    expect(html).not.toContain('No operational events');
  });

  // delta == 0: buildArchitectureTrendTimeline._summary returns
  // 'Architecture health is stable across N snapshots (score: X → X, +0).'
  // Verify the rendered output contains BOTH the score range AND the +0 delta,
  // not just the word "stable" in isolation.
  test('delta == 0 summary includes score range and +0 delta, not just "stable"', () => {
    const summary = 'Architecture health is stable across 3 snapshots (score: 72 → 72, +0).';
    const html = buildArchTimelineHtml(makeFc({
      driftEvents:     [],
      timelineSummary: summary,
    }));
    expect(html).toContain('score: 72 → 72');
    expect(html).toContain('+0');
    expect(html).toContain('3 snapshots');
    // Must not regress to the old operational fallback wording
    expect(html).not.toContain('No operational events detected yet.');
    expect(html).not.toContain('operational');
  });
});

// ── buildArchTimelineHtml — event type → badge label mapping ─────────────────

describe('buildArchTimelineHtml — event type badge labels', () => {
  const typeCases = [
    ['score_drop',                'SCORE DROP'],
    ['score_gain',                'IMPROVEMENT'],
    ['level_degraded',            'DEGRADED'],
    ['level_improved',            'IMPROVED'],
    ['new_risk',                  'NEW RISK'],
    ['resolved_risk',             'RESOLVED'],
    ['coupling_growth',           'COUPLING'],
    ['api_regression',            'API REGRESSION'],
    ['implementation_regression', 'IMPL REGRESSION'],
  ];

  typeCases.forEach(function([type, expectedLabel]) {
    test('type "' + type + '" renders badge "' + expectedLabel + '"', () => {
      const fc = makeFc({ driftEvents: [makeEvent({ type })] });
      const html = buildArchTimelineHtml(fc);
      expect(html).toContain(expectedLabel);
    });
  });
});

// ── buildArchTimelineHtml — severity → CSS class mapping ─────────────────────

describe('buildArchTimelineHtml — severity CSS classes', () => {
  test('severity "high" uses severity-high class', () => {
    const fc = makeFc({ driftEvents: [makeEvent({ severity: 'high' })] });
    expect(buildArchTimelineHtml(fc)).toContain('severity-high');
  });

  test('severity "medium" uses severity-medium class', () => {
    const fc = makeFc({ driftEvents: [makeEvent({ severity: 'medium' })] });
    expect(buildArchTimelineHtml(fc)).toContain('severity-medium');
  });

  test('severity "low" uses severity-healthy class', () => {
    const fc = makeFc({ driftEvents: [makeEvent({ severity: 'low' })] });
    expect(buildArchTimelineHtml(fc)).toContain('severity-healthy');
  });

  test('unknown severity falls back to severity-unknown', () => {
    const fc = makeFc({ driftEvents: [makeEvent({ severity: 'unexpected' })] });
    expect(buildArchTimelineHtml(fc)).toContain('severity-unknown');
  });
});

// ── buildArchTimelineHtml — snapshot history renders correctly ─────────────────

describe('buildArchTimelineHtml — snapshot history renders correctly', () => {
  test('event summary appears in output', () => {
    const fc = makeFc({
      driftEvents: [makeEvent({ summary: 'Architecture health score dropped by 15 points.' })],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Architecture health score dropped by 15 points.');
  });

  test('multiple events all render', () => {
    const fc = makeFc({
      driftEvents: [
        makeEvent({ type: 'score_drop',   summary: 'Score dropped.' }),
        makeEvent({ type: 'coupling_growth', summary: 'Coupling grew.' }),
        makeEvent({ type: 'level_improved',  summary: 'Level improved.' }),
      ],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Score dropped.');
    expect(html).toContain('Coupling grew.');
    expect(html).toContain('Level improved.');
    expect(html).toContain('SCORE DROP');
    expect(html).toContain('COUPLING');
    expect(html).toContain('IMPROVED');
  });

  test('events with snapshotAt render a time string', () => {
    const fc = makeFc({
      driftEvents: [makeEvent({ snapshotAt: '2026-01-15T10:30:00Z' })],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).not.toContain('"—"');
    // Should NOT contain the raw ISO string — it must be formatted
    expect(html).not.toContain('2026-01-15T10:30:00Z');
  });

  test('event with no snapshotAt renders "—" as time', () => {
    const fc = makeFc({
      driftEvents: [makeEvent({ snapshotAt: null })],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('>—<');
  });

  test('timelineSummary appears above event list when events present', () => {
    const fc = makeFc({
      timelineSummary: 'Architecture degraded across 4 snapshots.',
      driftEvents: [makeEvent()],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Architecture degraded across 4 snapshots.');
    expect(html).toContain('timeline-list');
  });

  test('timeline-list wrapper is present when events exist', () => {
    const fc = makeFc({ driftEvents: [makeEvent()] });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('class="timeline-list"');
  });

  test('timeline-item wrapper is present for each event', () => {
    const fc = makeFc({
      driftEvents: [makeEvent(), makeEvent({ type: 'score_gain', severity: 'low' })],
    });
    const html = buildArchTimelineHtml(fc);
    const itemCount = (html.match(/class="timeline-item"/g) || []).length;
    expect(itemCount).toBe(2);
  });
});

// ── No operational wording in any output ──────────────────────────────────────

describe('buildArchTimelineHtml — no operational wording', () => {
  const scenarios = [
    ['null fc',         null],
    ['empty events',    makeFc({ driftEvents: [] })],
    ['score_drop event', makeFc({ driftEvents: [makeEvent({ type: 'score_drop' })] })],
    ['all event types', makeFc({
      driftEvents: [
        makeEvent({ type: 'score_drop' }),
        makeEvent({ type: 'score_gain',                severity: 'low'    }),
        makeEvent({ type: 'level_degraded',            severity: 'medium' }),
        makeEvent({ type: 'coupling_growth',           severity: 'high'   }),
        makeEvent({ type: 'api_regression',            severity: 'medium' }),
        makeEvent({ type: 'implementation_regression', severity: 'medium' }),
        makeEvent({ type: 'new_risk',                  severity: 'high'   }),
        makeEvent({ type: 'resolved_risk',             severity: 'low'    }),
      ],
    })],
  ];

  scenarios.forEach(function([label, fc]) {
    test(label + ': no "operational" wording', () => {
      expect(buildArchTimelineHtml(fc).toLowerCase()).not.toContain('operational');
    });

    test(label + ': no "telemetry" wording', () => {
      expect(buildArchTimelineHtml(fc).toLowerCase()).not.toContain('telemetry');
    });

    test(label + ': no "commit" wording', () => {
      expect(buildArchTimelineHtml(fc).toLowerCase()).not.toContain('commit');
    });

    test(label + ': no "CI/CD" wording', () => {
      expect(buildArchTimelineHtml(fc).toLowerCase()).not.toContain('ci/cd');
    });
  });
});

// ── buildArchTimelineHtml — version_change events ─────────────────────────────

describe('buildArchTimelineHtml — version_change events', () => {
  function makeVersionChange(overrides) {
    return Object.assign({
      type:                 'version_change',
      severity:             'low',
      snapshotAt:           '2026-03-01T12:00:00Z',
      summary:              'Analyzer or scoring version changed — score comparisons across this boundary may not reflect repository changes.',
      prevAnalyzerVersion:  'legacy',
      currAnalyzerVersion:  '1.0',
      prevScoringVersion:   'legacy',
      currScoringVersion:   '1.0',
    }, overrides);
  }

  test('version_change type renders VERSION CHANGE badge label', () => {
    const fc   = makeFc({ driftEvents: [makeVersionChange()] });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('VERSION CHANGE');
  });

  test('renders Analyzer version transition', () => {
    const fc   = makeFc({ driftEvents: [makeVersionChange({ prevAnalyzerVersion: 'legacy', currAnalyzerVersion: '1.0' })] });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Analyzer: legacy');
    expect(html).toContain('1.0');
  });

  test('renders Scoring version transition', () => {
    const fc   = makeFc({ driftEvents: [makeVersionChange({ prevScoringVersion: 'legacy', currScoringVersion: '1.0' })] });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Scoring: legacy');
    expect(html).toContain('1.0');
  });

  test('renders suppression notice', () => {
    const fc   = makeFc({ driftEvents: [makeVersionChange()] });
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Score comparison suppressed across this boundary');
  });

  test('falls back to legacy when version fields are absent', () => {
    const ev = { type: 'version_change', severity: 'low', summary: 'Version changed.' };
    const fc = makeFc({ driftEvents: [ev] });
    expect(() => buildArchTimelineHtml(fc)).not.toThrow();
    const html = buildArchTimelineHtml(fc);
    expect(html).toContain('Analyzer: legacy');
    expect(html).toContain('Scoring: legacy');
  });

  test('non-version_change event does not show suppression notice', () => {
    const fc   = makeFc({ driftEvents: [makeEvent({ type: 'score_drop', severity: 'high' })] });
    const html = buildArchTimelineHtml(fc);
    expect(html).not.toContain('Score comparison suppressed');
  });

  test('escapes XSS in prevAnalyzerVersion and currAnalyzerVersion', () => {
    const fc = makeFc({
      driftEvents: [makeVersionChange({
        prevAnalyzerVersion: '<script>bad</script>',
        currAnalyzerVersion: '<img src=x>',
      })],
    });
    const html = buildArchTimelineHtml(fc);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });
});
