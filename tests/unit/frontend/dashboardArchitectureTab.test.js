'use strict';

// Pure-logic unit tests for buildRepositoryArchitectureHtml (Architecture tab).
// Function and its dependency are copied verbatim from dashboard.html.
// Jest node env — no DOM or browser required.

// ── Minimal stubs ─────────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── _architectureWarningMessage (copied verbatim from dashboard.html:4888) ───
function _architectureWarningMessage(raw) {
  var r = String(raw || '').toLowerCase();
  if (r.indexOf('_github_tree_fail') !== -1) {
    return 'Unable to access repository files — a temporary GitHub error occurred. Try again in a moment.';
  }
  if (r.indexOf('token') !== -1 || r.indexOf('access') !== -1
      || r.indexOf('login') !== -1 || r.indexOf('encryption') !== -1) {
    return 'Unable to access repository files — please reconnect your GitHub account to enable architecture analysis.';
  }
  if (r.indexOf('rate') !== -1 || r.indexOf('scope') !== -1 || r.indexOf('eligible') !== -1) {
    return 'Unable to access repository files — GitHub API rate limit reached or token lacks required permissions.';
  }
  return 'Unable to access repository files.';
}

// ── buildRepositoryArchitectureHtml (copied verbatim from dashboard.html:4903) ─
function buildRepositoryArchitectureHtml(data) {
  var UNAVAILABLE = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'Architecture intelligence unavailable until repository files are accessible.</p>';

  if (!data) return UNAVAILABLE;

  if (data._warning) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
      + esc(_architectureWarningMessage(data._warning)) + '</p>';
  }

  var level     = data.architectureHealthLevel || 'unknown';
  var score     = data.architectureHealthScore != null ? data.architectureHealthScore : 0;
  var conf      = data.confidenceLevel || 'unknown';
  var summary   = data.summary || '';
  var m         = data.metrics || {};

  if (m.totalFiles === 0) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
      + 'No supported source files were detected for architecture analysis.</p>';
  }
  var api       = data.apiLinkage || {};
  var dep       = data.dependencyGraph || {};
  var impl      = data.implementationCompleteness || {};
  var findings  = data.topFindings || [];
  var recs      = data.recommendations || [];

  var HEALTH_CLS = {
    healthy: 'severity-healthy', watch: 'severity-medium',
    weak: 'severity-high', risky: 'severity-critical', unknown: 'severity-unknown'
  };
  var CONF_CLS = { high: 'conf-high', medium: 'conf-medium', low: 'conf-low' };
  var FILL_CLR = {
    healthy: 'var(--green)', watch: 'var(--sev-medium-text)',
    weak: 'var(--orange)', risky: 'var(--red)', unknown: 'var(--text-muted)'
  };

  var levelLabel = level.charAt(0).toUpperCase() + level.slice(1);
  var badgeCls   = HEALTH_CLS[level]  || 'severity-unknown';
  var confCls    = CONF_CLS[conf]     || 'conf-low';
  var fillColor  = FILL_CLR[level]    || 'var(--text-muted)';

  var html = '';

  // ── 1. Health card ───────────────────────────────────────────────────────
  html += '<div class="arch-score-row">'
    + '<div class="arch-score-val">' + esc(String(score)) + '</div>'
    + '<div class="arch-score-denom">/ 100</div>'
    + '<span class="aq-badge ' + badgeCls + '" style="margin-left:4px;">' + esc(levelLabel) + '</span>'
    + '<span class="confidence-badge ' + confCls + '" style="margin-left:4px;">' + esc(conf) + ' confidence</span>'
    + '</div>';

  html += '<div class="arch-prog">'
    + '<div class="arch-prog-fill" style="width:' + Math.min(100, score) + '%;background:' + fillColor + ';"></div>'
    + '</div>';

  if (summary) {
    html += '<p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.5;margin-bottom:12px;">'
      + esc(summary) + '</p>';
  }

  // ── 2. Metrics grid ──────────────────────────────────────────────────────
  var metricItems = [
    ['Total Files',         m.totalFiles                   != null ? m.totalFiles                   : '—'],
    ['Dep Edges',           m.totalEdges                   != null ? m.totalEdges                   : '—'],
    ['Backend Routes',      m.backendRouteCount            != null ? m.backendRouteCount            : '—'],
    ['Frontend API Calls',  m.frontendApiCallCount         != null ? m.frontendApiCallCount         : '—'],
    ['Linked Endpoints',    m.linkedEndpointCount          != null ? m.linkedEndpointCount          : '—'],
    ['Unresolved Calls',    m.unresolvedFrontendCallCount  != null ? m.unresolvedFrontendCallCount  : '—'],
    ['Orphaned Routes',     m.orphanedBackendRouteCount    != null ? m.orphanedBackendRouteCount    : '—'],
    ['Circular Deps',       m.circularDependencyCount      != null ? m.circularDependencyCount      : '—'],
    ['Boundary Issues',     m.boundaryViolationCount       != null ? m.boundaryViolationCount       : '—'],
    ['Impl Signals',        m.implementationSignalCount    != null ? m.implementationSignalCount    : '—'],
  ];
  html += '<div class="arch-metric-grid">';
  metricItems.forEach(function(item) {
    html += '<div class="arch-metric">'
      + '<div class="arch-metric-val">' + esc(String(item[1])) + '</div>'
      + '<div class="arch-metric-lbl">' + esc(item[0]) + '</div>'
      + '</div>';
  });
  html += '</div>';

  // ── 3. API Linkage panel ─────────────────────────────────────────────────
  var cov          = api.coverage || {};
  var linkageScore = api.linkageScore != null ? api.linkageScore : null;
  var linkageLevel = api.linkageLevel || null;
  var fcPct        = cov.frontendCallCoveragePercent != null ? cov.frontendCallCoveragePercent : null;
  var bcPct        = cov.backendRouteCoveragePercent != null ? cov.backendRouteCoveragePercent : null;
  var unresolved   = api.unresolvedFrontendCalls || [];
  var mismatches   = (api.methodMismatches || []).length;

  html += '<div class="arch-sub-panel"><div class="arch-sub-label">API Linkage</div>';

  if (linkageScore != null) {
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      + '<span style="font-size:1.05rem;font-weight:700;color:var(--text-primary);">'
      + esc(String(linkageScore)) + '</span>'
      + '<span style="font-size:0.72rem;color:var(--text-muted);">linkage score</span>';
    if (linkageLevel) {
      html += '<span class="aq-badge severity-neutral">' + esc(linkageLevel) + '</span>';
    }
    html += '</div>';
  }

  if (fcPct != null || bcPct != null) {
    html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:8px;">';
    if (fcPct != null) {
      html += '<div class="pf-count-item">'
        + '<div class="pf-count-value">' + esc(String(fcPct)) + '%</div>'
        + '<div class="pf-count-label">Frontend Coverage</div></div>';
    }
    if (bcPct != null) {
      html += '<div class="pf-count-item">'
        + '<div class="pf-count-value">' + esc(String(bcPct)) + '%</div>'
        + '<div class="pf-count-label">Backend Coverage</div></div>';
    }
    if (m.unresolvedFrontendCallCount > 0) {
      html += '<div class="pf-count-item">'
        + '<div class="pf-count-value">' + esc(String(m.unresolvedFrontendCallCount)) + '</div>'
        + '<div class="pf-count-label">Unresolved Calls</div></div>';
    }
    if (m.orphanedBackendRouteCount > 0) {
      html += '<div class="pf-count-item">'
        + '<div class="pf-count-value">' + esc(String(m.orphanedBackendRouteCount)) + '</div>'
        + '<div class="pf-count-label">Orphaned Routes</div></div>';
    }
    html += '</div>';
    if (m.orphanedBackendRouteCount > 0) {
      html += '<div style="font-size:0.77rem;color:var(--text-secondary);margin-bottom:6px;">'
        + 'Navigation/Internal: '   + esc(String(m.navigationOrphanCount  != null ? m.navigationOrphanCount  : '—'))
        + ' &nbsp;&middot;&nbsp; Unlinked APIs: '      + esc(String(m.unlinkedApiCount      != null ? m.unlinkedApiCount      : '—'))
        + ' &nbsp;&middot;&nbsp; Disconnected APIs: '  + esc(String(m.disconnectedApiCount  != null ? m.disconnectedApiCount  : '—'))
        + '</div>';
    }
  }

  if (mismatches > 0) {
    html += '<p style="font-size:0.79rem;color:var(--sev-medium-text);margin-bottom:6px;">'
      + esc(String(mismatches)) + ' HTTP method mismatch' + (mismatches !== 1 ? 'es' : '') + ' detected.</p>';
  }

  if (unresolved.length > 0) {
    html += '<div class="arch-sub-label" style="margin-top:8px;">Unresolved calls (candidates)</div>';
    unresolved.slice(0, 3).forEach(function(call) {
      var method = typeof call === 'object' ? ((call.method || 'GET').toUpperCase()) : 'GET';
      var path   = typeof call === 'object' ? (call.path || call.url || call.endpoint || '') : String(call);
      html += '<div style="font-size:0.77rem;color:var(--text-secondary);font-family:var(--font-mono);padding:2px 0;">'
        + '<span style="color:var(--sev-medium-text);">' + esc(method) + '</span> ' + esc(path) + '</div>';
    });
    if (unresolved.length > 3) {
      html += '<div style="font-size:0.72rem;color:var(--text-muted);margin-top:2px;">+'
        + (unresolved.length - 3) + ' more</div>';
    }
  }

  if (linkageScore == null && fcPct == null && !unresolved.length) {
    html += '<p style="font-size:0.79rem;color:var(--text-muted);font-style:italic;">'
      + 'No frontend-backend API calls detected.</p>';
  }
  html += '</div>';

  // ── 4. Circular Dependencies panel ──────────────────────────────────────
  var circles   = dep.circularDependencies || [];
  var circCount = m.circularDependencyCount != null ? m.circularDependencyCount : circles.length;

  html += '<div class="arch-sub-panel"><div class="arch-sub-label">Circular Dependencies</div>';
  if (circCount === 0) {
    html += '<p style="font-size:0.79rem;color:var(--sev-healthy-text);">&#10003; No circular dependencies detected.</p>';
  } else {
    var circSev    = circles.some(function(c) { return c.severity === 'high'; }) ? 'high' : 'medium';
    var circSevCls = circSev === 'high' ? 'severity-high' : 'severity-medium';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      + '<span style="font-size:1.05rem;font-weight:700;color:var(--text-primary);">' + esc(String(circCount)) + '</span>'
      + '<span style="font-size:0.72rem;color:var(--text-muted);">cycle' + (circCount !== 1 ? 's' : '') + ' detected</span>'
      + '<span class="timeline-badge ' + circSevCls + '">' + esc(circSev) + '</span>'
      + '</div>';
    circles.slice(0, 3).forEach(function(c) {
      var cycle = Array.isArray(c.cycle) ? c.cycle.join(' → ') : (Array.isArray(c.files) ? c.files.join(' → ') : '');
      if (cycle) {
        html += '<div style="font-size:0.75rem;color:var(--text-secondary);font-family:var(--font-mono);padding:2px 0;word-break:break-all;">'
          + esc(cycle) + '</div>';
      }
    });
  }
  html += '</div>';

  // ── 5. Implementation Completeness panel ─────────────────────────────────
  var implScore = impl.completenessScore != null ? impl.completenessScore : null;
  var implLevel = impl.completenessLevel || null;
  var rsCov     = impl.routeServiceCoverage || {};
  var rsPct     = rsCov.coveragePercent != null ? rsCov.coveragePercent : null;
  var phCount   = impl.placeholderAssessment && impl.placeholderAssessment.count != null
                  ? impl.placeholderAssessment.count : null;
  var scCount   = impl.scaffoldAssessment && impl.scaffoldAssessment.count != null
                  ? impl.scaffoldAssessment.count : null;
  var hints     = impl.weakImplementationHints || impl.signals || [];

  html += '<div class="arch-sub-panel"><div class="arch-sub-label">Implementation Completeness</div>';

  if (implScore != null) {
    var implBadgeCls = implLevel === 'complete' ? 'severity-healthy'
                     : implLevel === 'partial'  ? 'severity-medium'
                     : implLevel === 'weak'     ? 'severity-high'
                     : 'severity-unknown';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'
      + '<span style="font-size:1.05rem;font-weight:700;color:var(--text-primary);">' + esc(String(implScore)) + '</span>'
      + '<span style="font-size:0.72rem;color:var(--text-muted);">/100</span>';
    if (implLevel) {
      html += '<span class="aq-badge ' + implBadgeCls + '">' + esc(implLevel) + '</span>';
    }
    html += '</div>';
  }

  if (rsPct != null) {
    html += '<p style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:6px;">'
      + 'Route-to-service coverage: <strong>' + esc(String(rsPct)) + '%</strong></p>';
  }

  if (phCount !== null || scCount !== null) {
    html += '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:7px;">';
    if (phCount !== null) {
      html += '<span style="font-size:0.78rem;color:var(--text-secondary);">'
        + '<strong>' + esc(String(phCount)) + '</strong> placeholder hint' + (phCount !== 1 ? 's' : '') + '</span>';
    }
    if (scCount !== null) {
      html += '<span style="font-size:0.78rem;color:var(--text-secondary);">'
        + '<strong>' + esc(String(scCount)) + '</strong> scaffold-like file candidate' + (scCount !== 1 ? 's' : '') + '</span>';
    }
    html += '</div>';
  }

  if (hints.length > 0) {
    html += '<div class="arch-sub-label" style="margin-top:6px;">Weak implementation hints</div>';
    hints.slice(0, 3).forEach(function(h) {
      var text = typeof h === 'string' ? h : (h.summary || h.type || '');
      if (text) {
        html += '<div class="stability-signal" style="font-size:0.77rem;">' + esc(text) + '</div>';
      }
    });
  }

  if (implScore == null && !hints.length) {
    html += '<p style="font-size:0.79rem;color:var(--text-muted);font-style:italic;">No implementation data available.</p>';
  }
  html += '</div>';

  // ── 6. Top Findings panel ────────────────────────────────────────────────
  html += '<div class="arch-sub-panel"><div class="arch-sub-label">Top Findings</div>';
  if (!findings.length) {
    html += '<p style="font-size:0.79rem;color:var(--sev-healthy-text);">&#10003; No significant architecture findings.</p>';
  } else {
    findings.forEach(function(f) {
      var fSev    = f.severity || 'low';
      var fSevCls = fSev === 'high'   ? 'severity-high'
                  : fSev === 'medium' ? 'severity-medium'
                  : 'severity-low';
      html += '<div class="arch-finding">'
        + '<span class="timeline-badge ' + fSevCls + '">' + esc(fSev) + '</span>'
        + '<span>' + esc(f.summary || f.type || '') + '</span>'
        + '</div>';
    });
  }
  html += '</div>';

  // ── 7. Recommendations ───────────────────────────────────────────────────
  if (recs.length > 0) {
    html += '<div class="arch-sub-label" style="margin-top:14px;">Recommendations</div>';
    recs.slice(0, 5).forEach(function(r) {
      html += '<div class="arch-rec">' + esc(typeof r === 'string' ? r : (r.text || r.recommendation || String(r))) + '</div>';
    });
  }

  return html;
}

// ── Test helpers ──────────────────────────────────────────────────────────────

// Count how many times the arch-rec div opening tag appears in rendered html.
function countArchRecs(html) {
  return (html.match(/<div class="arch-rec">/g) || []).length;
}

// Minimal valid data object that won't early-return.
function minimalData(overrides) {
  return Object.assign({
    architectureHealthLevel: 'watch',
    architectureHealthScore: 72,
    confidenceLevel: 'medium',
    metrics: { totalFiles: 10 },
  }, overrides);
}

// ── Exact strings from the UI duplicate report ────────────────────────────────
const BOUNDARY_44 = '44 backend route candidates have no frontend match — audit for unused or internal-only endpoints.';
const LINKAGE_44  = '44 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildRepositoryArchitectureHtml — recommendations rendering', () => {

  describe('DIAGNOSTIC: frontend passes through whatever the API sends verbatim', () => {

    test('renders ZERO arch-rec divs when recommendations array is empty', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({ recommendations: [] }));
      expect(countArchRecs(html)).toBe(0);
    });

    test('renders ONE arch-rec div when API returns one rec', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [LINKAGE_44],
      }));
      expect(countArchRecs(html)).toBe(1);
    });

    test('DIAGNOSTIC — renders TWO arch-rec divs when API returns both duplicate strings (frontend has no dedup)', () => {
      // If this test passes: duplication in the UI originates from the API response,
      // NOT from frontend rendering logic. Fix must be at the API/builder layer.
      // If this test fails: frontend is somehow collapsing them (unexpected).
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [BOUNDARY_44, LINKAGE_44],
      }));
      expect(countArchRecs(html)).toBe(2);
    });

    test('renders distinct recs when they are semantically unrelated', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [
          'Add dependency injection to decouple service layers.',
          'Extract shared utilities into a dedicated lib module.',
        ],
      }));
      expect(countArchRecs(html)).toBe(2);
    });

  });

  describe('API-deduped input: renderer preserves exactly what it receives', () => {

    test('single linkage rec after API dedup → one arch-rec div with linkage wording', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [LINKAGE_44],
      }));
      expect(countArchRecs(html)).toBe(1);
      expect(html).toContain(LINKAGE_44);
    });

    test('single linkage rec after API dedup → boundary wording absent', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [LINKAGE_44],
      }));
      expect(html).not.toContain(BOUNDARY_44);
    });

    test('deduped single rec does not appear more than once', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [LINKAGE_44],
      }));
      const count = (html.match(/no frontend counterpart/g) || []).length;
      expect(count).toBe(1);
    });

  });

  describe('max-5 cap: recommendations beyond 5 are silently dropped', () => {

    test('6 recs → 5 rendered (slice at 5)', () => {
      const recs = [
        'rec 1', 'rec 2', 'rec 3', 'rec 4', 'rec 5', 'rec 6 (should be dropped)',
      ];
      const html = buildRepositoryArchitectureHtml(minimalData({ recommendations: recs }));
      expect(countArchRecs(html)).toBe(5);
      expect(html).not.toContain('rec 6');
    });

    test('5 recs → all 5 rendered', () => {
      const recs = ['a', 'b', 'c', 'd', 'e'];
      const html = buildRepositoryArchitectureHtml(minimalData({ recommendations: recs }));
      expect(countArchRecs(html)).toBe(5);
    });

  });

  describe('unrelated recommendations survive unchanged', () => {

    test('unrelated recs alongside deduped orphaned-route rec all appear', () => {
      const recs = [
        LINKAGE_44,
        'Introduce service-layer abstraction to reduce controller coupling.',
        'Add OpenAPI spec to document all exposed backend routes.',
      ];
      const html = buildRepositoryArchitectureHtml(minimalData({ recommendations: recs }));
      expect(countArchRecs(html)).toBe(3);
      expect(html).toContain(LINKAGE_44);
      expect(html).toContain('service-layer abstraction');
      expect(html).toContain('OpenAPI spec');
    });

  });

  describe('edge cases', () => {

    test('null data → returns unavailable message, no arch-rec divs', () => {
      const html = buildRepositoryArchitectureHtml(null);
      expect(countArchRecs(html)).toBe(0);
      expect(html).toContain('Architecture intelligence unavailable');
    });

    test('totalFiles === 0 → early-return message, no arch-rec divs', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        metrics: { totalFiles: 0 },
        recommendations: [LINKAGE_44],
      }));
      expect(countArchRecs(html)).toBe(0);
      expect(html).toContain('No supported source files');
    });

    test('_warning present → warning message rendered, no arch-rec divs', () => {
      const html = buildRepositoryArchitectureHtml({ _warning: 'token_missing' });
      expect(countArchRecs(html)).toBe(0);
      expect(html).toContain('reconnect your GitHub account');
    });

    test('object-shaped rec uses .text field', () => {
      const html = buildRepositoryArchitectureHtml(minimalData({
        recommendations: [{ text: 'Use event sourcing for audit trail.' }],
      }));
      expect(countArchRecs(html)).toBe(1);
      expect(html).toContain('Use event sourcing for audit trail.');
    });

  });

  describe('orphaned route exposure breakdown', () => {

    const withCoverage = (metricsOverrides) => minimalData({
      metrics: Object.assign({ totalFiles: 10 }, metricsOverrides),
      apiLinkage: { coverage: { frontendCallCoveragePercent: 80 } },
    });

    test('renders breakdown when orphanedBackendRouteCount > 0', () => {
      const html = buildRepositoryArchitectureHtml(withCoverage({
        orphanedBackendRouteCount: 26,
        navigationOrphanCount:     9,
        unlinkedApiCount:          17,
        disconnectedApiCount:      0,
      }));
      expect(html).toContain('Navigation/Internal: 9');
      expect(html).toContain('Unlinked APIs: 17');
      expect(html).toContain('Disconnected APIs: 0');
    });

    test('does not render breakdown when orphanedBackendRouteCount is 0', () => {
      const html = buildRepositoryArchitectureHtml(withCoverage({
        orphanedBackendRouteCount: 0,
        navigationOrphanCount:     0,
        unlinkedApiCount:          0,
        disconnectedApiCount:      0,
      }));
      expect(html).not.toContain('Navigation/Internal:');
      expect(html).not.toContain('Unlinked APIs:');
      expect(html).not.toContain('Disconnected APIs:');
    });

    test('shows em dash for missing sub-counts on old snapshots', () => {
      const html = buildRepositoryArchitectureHtml(withCoverage({
        orphanedBackendRouteCount: 5,
        // navigationOrphanCount, unlinkedApiCount, disconnectedApiCount absent
      }));
      expect(html).toContain('Navigation/Internal: —');
      expect(html).toContain('Unlinked APIs: —');
      expect(html).toContain('Disconnected APIs: —');
    });

  });

});
