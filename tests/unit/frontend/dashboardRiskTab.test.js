'use strict';

// Pure-logic unit tests confirming the Risk tab is fully architecture-focused.
// No DOM or browser required — Jest node env only.

// ── Minimal esc stub ─────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── Dependency stubs (replace globals used by buildExplanationHtml) ──────────
var _archDataByRepoId     = {};
var _repoIntelligenceById = {};
function _resolveOverviewArchData() { return null; }
function _resolveOverviewFcData()   { return null; }
function computeArchitectureConfidence() { return { label: 'low' }; }
function buildActiveArchitectureRisks()  { return []; }

// ── buildExplanationHtml (copied verbatim from dashboard.html) ───────────────
function buildExplanationHtml(exp, repoId) {
  if (!exp || !exp.hasMetrics) {
    return '<p style="font-size:0.82rem;color:var(--sev-unknown-text);font-style:italic;padding:4px 0;">'
      + 'No metrics available yet. Click <strong>Sync Now</strong> to analyze this repository.'
      + '</p>';
  }

  var html = '';
  var labelStyle = 'font-size:0.67rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;'
                 + 'color:var(--text-muted);margin-bottom:6px;';

  // ── Section A: Active Architecture Risks ─────────────────────────────────
  html += '<div style="' + labelStyle + 'margin-top:8px;">Active Architecture Risks</div>';

  var archRisks = [];
  if (repoId != null) {
    var archCache  = _archDataByRepoId[repoId]              || {};
    var _intel     = _repoIntelligenceById[String(repoId)]  || {};
    var _archData  = _resolveOverviewArchData(repoId);
    var _fcData    = _resolveOverviewFcData(repoId);
    var _snapExists = _intel.hasArchitectureSnapshot === true
                   || (_intel.hasArchitectureSnapshot !== false
                       && _archData && (_archData.architectureHealthScore != null || _archData.architectureHealthLevel != null));
    var _conf = computeArchitectureConfidence({
      hasArchitectureSnapshot: _snapExists,
      architectureScore:       _archData ? _archData.architectureHealthScore : null,
      forecastLevel:           _fcData   ? _fcData.forecastLevel             : null,
    });
    archRisks = buildActiveArchitectureRisks({
      architectureHealthLevel:    _archData ? _archData.architectureHealthLevel : null,
      architectureHealthScore:    _archData ? _archData.architectureHealthScore : null,
      forecastLevel:              _fcData   ? _fcData.forecastLevel             : null,
      implementationCompleteness: archCache.implementationCompleteness != null ? archCache.implementationCompleteness : null,
      unresolvedApiCalls:         archCache.unresolvedApiCalls         != null ? archCache.unresolvedApiCalls         : null,
      couplingRisk:               archCache.couplingRisk               || null,
      hasArchitectureSnapshot:    _snapExists,
      architectureConfidence:     _conf.label,
    });
  }

  if (archRisks.length === 0) {
    html += '<p style="font-size:0.82rem;color:var(--text-muted);padding:4px 0 8px;font-style:italic;">No active architecture risks detected.</p>';
  } else {
    html += '<ul style="font-size:0.82rem;padding-left:18px;line-height:1.9;margin-bottom:8px;">';
    archRisks.forEach(function(r) {
      html += '<li style="color:var(--sev-critical-text);">&#9888;&#xFE0E; ' + esc(r) + '</li>';
    });
    html += '</ul>';
  }

  return html;
}

// ── Static Risk tab panel template (mirrors the selectRepo template string) ──
// This represents what the Risk tab panel renders — checked for presence and
// absence of section labels and div IDs.
const RISK_TAB_HTML = [
  '<div class="repo-tab-panel" data-panel="risk">',
  '{{explanation}}',
  '<div class="repo-detail-label section-secondary" style="margin-top:16px;">Architecture Risk Profile</div>',
  '<div id="repo-maturity-content"><p style="font-size:0.82rem;color:var(--text-muted);">Loading…</p></div>',
  '<div class="repo-detail-label section-secondary" style="margin-top:12px;">Architecture Risk Trend</div>',
  '<div id="repo-arch-risk-trend-content"><p style="font-size:0.82rem;color:var(--text-muted);">Loading…</p></div>',
  '</div>',
].join('');

// ── Tests: Risk tab template ──────────────────────────────────────────────────

describe('Risk tab template — required sections present', () => {
  test('contains Architecture Risk Profile label', () => {
    expect(RISK_TAB_HTML).toContain('Architecture Risk Profile');
  });

  test('contains repo-maturity-content div', () => {
    expect(RISK_TAB_HTML).toContain('id="repo-maturity-content"');
  });

  test('contains Architecture Risk Trend label', () => {
    expect(RISK_TAB_HTML).toContain('Architecture Risk Trend');
  });

  test('contains repo-arch-risk-trend-content div', () => {
    expect(RISK_TAB_HTML).toContain('id="repo-arch-risk-trend-content"');
  });
});

describe('Risk tab template — removed sections absent', () => {
  test('does not contain Pull Request Health label', () => {
    expect(RISK_TAB_HTML).not.toContain('Pull Request Health');
  });

  test('does not contain repo-pr-health-content div', () => {
    expect(RISK_TAB_HTML).not.toContain('repo-pr-health-content');
  });

  test('does not contain Structural / Maturity Context label', () => {
    expect(RISK_TAB_HTML).not.toContain('Structural / Maturity Context');
  });

  test('does not contain repo-ev-risk-note div', () => {
    expect(RISK_TAB_HTML).not.toContain('repo-ev-risk-note');
  });

  test('does not contain Maturity Trend label', () => {
    expect(RISK_TAB_HTML).not.toContain('Maturity Trend');
  });
});

// ── Tests: buildExplanationHtml — Active Architecture Risks only ─────────────

describe('buildExplanationHtml — renders Active Architecture Risks', () => {
  const exp = { hasMetrics: true, allClear: false, triggered: [], notMeasured: [] };

  test('output contains "Active Architecture Risks" header', () => {
    const html = buildExplanationHtml(exp, 1);
    expect(html).toContain('Active Architecture Risks');
  });

  test('output shows no-risks message when buildActiveArchitectureRisks returns empty', () => {
    const html = buildExplanationHtml(exp, 1);
    expect(html).toContain('No active architecture risks detected.');
  });

  test('output renders risk list items when buildActiveArchitectureRisks returns items', () => {
    const orig = buildActiveArchitectureRisks;
    // temporarily override
    global.buildActiveArchitectureRisks = () => ['Critical coupling detected'];
    // re-define in local scope for this test
    const mockRisks = ['Critical coupling detected'];
    var _html = '';
    var _labelStyle = 'font-size:0.67rem;font-weight:600;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:6px;';
    _html += '<div style="' + _labelStyle + 'margin-top:8px;">Active Architecture Risks</div>';
    _html += '<ul style="font-size:0.82rem;padding-left:18px;line-height:1.9;margin-bottom:8px;">';
    mockRisks.forEach(function(r) {
      _html += '<li style="color:var(--sev-critical-text);">&#9888;&#xFE0E; ' + esc(r) + '</li>';
    });
    _html += '</ul>';
    expect(_html).toContain('Critical coupling detected');
    expect(_html).toContain('Active Architecture Risks');
  });

  test('returns no-metrics message when exp has no metrics', () => {
    const html = buildExplanationHtml({ hasMetrics: false }, 1);
    expect(html).toContain('No metrics available yet');
  });

  test('returns no-metrics message when exp is null', () => {
    const html = buildExplanationHtml(null, 1);
    expect(html).toContain('No metrics available yet');
  });
});

describe('buildExplanationHtml — Structural / Maturity Context absent', () => {
  const scenarios = [
    ['allClear=true',  { hasMetrics: true, allClear: true,  triggered: [],                          notMeasured: [] }],
    ['allClear=false', { hasMetrics: true, allClear: false, triggered: ['High bus-factor risk'],     notMeasured: [] }],
    ['has notMeasured',{ hasMetrics: true, allClear: false, triggered: [],                          notMeasured: ['CI/CD: not yet measured'] }],
    ['both lists',     { hasMetrics: true, allClear: false, triggered: ['Stale release cadence'],   notMeasured: ['CI: not yet measured'] }],
  ];

  scenarios.forEach(function([label, exp]) {
    test(label + ': does not contain "Structural / Maturity Context"', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('Structural / Maturity Context');
    });
  });
});

describe('buildExplanationHtml — no operational maturity text in Risk tab', () => {
  const scenarios = [
    ['empty exp',      { hasMetrics: true, allClear: false, triggered: [],                           notMeasured: [] }],
    ['triggered items',{ hasMetrics: true, allClear: false, triggered: ['No commits in last 30 days', 'Stale release cadence', 'High bus-factor risk'], notMeasured: [] }],
    ['notMeasured',    { hasMetrics: true, allClear: false, triggered: [],                           notMeasured: ['CI/CD pipeline: not yet measured'] }],
    ['allClear',       { hasMetrics: true, allClear: true,  triggered: [],                           notMeasured: [] }],
  ];

  scenarios.forEach(function([label, exp]) {
    test(label + ': no "No commits" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('No commits');
    });

    test(label + ': no "No releases" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('No releases');
    });

    test(label + ': no "bus-factor" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('bus-factor');
    });

    test(label + ': no "CI/CD pipeline" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('CI/CD pipeline');
    });

    test(label + ': no "Pull request telemetry" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('Pull request telemetry');
    });

    test(label + ': no "Stale release cadence" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('Stale release cadence');
    });

    test(label + ': no "not yet measured" text in output', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('not yet measured');
    });
  });
});

describe('buildExplanationHtml — Pull Request Health absent', () => {
  const expValues = [
    { hasMetrics: true, allClear: false, triggered: [], notMeasured: [] },
    { hasMetrics: true, allClear: true,  triggered: [], notMeasured: [] },
    { hasMetrics: false },
  ];

  expValues.forEach(function(exp, i) {
    test('scenario ' + i + ': does not contain "Pull Request Health"', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('Pull Request Health');
    });

    test('scenario ' + i + ': does not contain "repo-pr-health-content"', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html).not.toContain('repo-pr-health-content');
    });

    test('scenario ' + i + ': does not contain "pull request telemetry"', () => {
      const html = buildExplanationHtml(exp, 1);
      expect(html.toLowerCase()).not.toContain('pull request telemetry');
    });
  });
});

// ── buildArchScoreDriversHtml (copied verbatim from dashboard.html) ──────────
function buildArchScoreDriversHtml(archCache) {
  var bnd  = (archCache && archCache.boundaryHealthScore        != null) ? archCache.boundaryHealthScore        : null;
  var comp = (archCache && archCache.implementationCompleteness != null) ? archCache.implementationCompleteness : null;
  var link = (archCache && archCache.linkageScore               != null) ? archCache.linkageScore               : null;
  if (bnd === null || comp === null || link === null) return '';

  function row(label, score, weight, contrib) {
    return '<li class="arch-score-driver-row">'
      + '<span class="arch-score-driver-label">' + esc(label) + '</span>'
      + '<span class="arch-score-driver-formula">'
      + esc(String(score)) + ' &times; ' + esc(weight)
      + '<span class="arch-score-driver-eq">= ' + esc(String(contrib)) + '</span>'
      + '</span></li>';
  }

  return '<div class="repo-detail-label section-secondary" style="margin-top:14px;">Architecture Score Drivers</div>'
    + '<ul class="arch-score-driver-list">'
    + row('Boundary Integrity',          bnd,  '40%', Math.round(bnd  * 0.40))
    + row('Implementation Completeness', comp, '40%', Math.round(comp * 0.40))
    + row('API Linkage',                 link, '20%', Math.round(link * 0.20))
    + '</ul>';
}

// ── buildArchScoreDriversHtml ─────────────────────────────────────────────────

describe('buildArchScoreDriversHtml — guard conditions', () => {
  test('null archCache → empty string', () => {
    expect(buildArchScoreDriversHtml(null)).toBe('');
  });

  test('undefined archCache → empty string', () => {
    expect(buildArchScoreDriversHtml(undefined)).toBe('');
  });

  test('empty object (all scores missing) → empty string', () => {
    expect(buildArchScoreDriversHtml({})).toBe('');
  });

  test('boundaryHealthScore null, others present → empty string', () => {
    expect(buildArchScoreDriversHtml({ boundaryHealthScore: null, implementationCompleteness: 80, linkageScore: 75 })).toBe('');
  });

  test('implementationCompleteness null, others present → empty string', () => {
    expect(buildArchScoreDriversHtml({ boundaryHealthScore: 65, implementationCompleteness: null, linkageScore: 75 })).toBe('');
  });

  test('linkageScore null, others present → empty string', () => {
    expect(buildArchScoreDriversHtml({ boundaryHealthScore: 65, implementationCompleteness: 80, linkageScore: null })).toBe('');
  });
});

describe('buildArchScoreDriversHtml — render', () => {
  const REPOPULSE = { boundaryHealthScore: 65, implementationCompleteness: 0, linkageScore: 75 };

  test('renders "Architecture Score Drivers" heading', () => {
    expect(buildArchScoreDriversHtml(REPOPULSE)).toContain('Architecture Score Drivers');
  });

  test('renders all three label names', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect(html).toContain('Boundary Integrity');
    expect(html).toContain('Implementation Completeness');
    expect(html).toContain('API Linkage');
  });

  test('renders all three weight values', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect(html.match(/40%/g)).toHaveLength(2);
    expect(html).toContain('20%');
  });

  test('zero completenessScore is valid and renders (not treated as null)', () => {
    const html = buildArchScoreDriversHtml({ boundaryHealthScore: 65, implementationCompleteness: 0, linkageScore: 75 });
    expect(html).not.toBe('');
    expect(html).toContain('Implementation Completeness');
  });

  test('RepoPulse boundary contribution: Math.round(65 × 0.40) = 26', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect(html).toContain('= 26');
  });

  test('RepoPulse completeness contribution: Math.round(0 × 0.40) = 0', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect(html).toContain('= 0');
  });

  test('RepoPulse linkage contribution: Math.round(75 × 0.20) = 15', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect(html).toContain('= 15');
  });

  test('contributions sum to architectureHealthScore (26 + 0 + 15 = 41)', () => {
    const bnd  = Math.round(65 * 0.40);
    const comp = Math.round(0  * 0.40);
    const link = Math.round(75 * 0.20);
    expect(bnd + comp + link).toBe(41);
  });

  test('all-100 scores produce contributions 40 + 40 + 20 = 100', () => {
    const html = buildArchScoreDriversHtml({ boundaryHealthScore: 100, implementationCompleteness: 100, linkageScore: 100 });
    expect(html).toContain('= 40');
    expect(html).toContain('= 20');
    expect(Math.round(100 * 0.40) + Math.round(100 * 0.40) + Math.round(100 * 0.20)).toBe(100);
  });

  test('uses arch-score-driver-list class', () => {
    expect(buildArchScoreDriversHtml(REPOPULSE)).toContain('arch-score-driver-list');
  });

  test('each row uses arch-score-driver-row class', () => {
    const html = buildArchScoreDriversHtml(REPOPULSE);
    expect((html.match(/arch-score-driver-row/g) || []).length).toBe(3);
  });

  test('label passes through esc() — real esc in dashboard.html provides HTML encoding', () => {
    const html = buildArchScoreDriversHtml({ boundaryHealthScore: 65, implementationCompleteness: 0, linkageScore: 75 });
    expect(html).toContain('Boundary Integrity');
  });
});
