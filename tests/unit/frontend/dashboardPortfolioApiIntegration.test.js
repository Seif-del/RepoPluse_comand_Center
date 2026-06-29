'use strict';

// Tests for _archApiIntegrationHtml (verbatim copy from dashboard.html).
// Portfolio Architecture Refinement #16 (2026-06-28):
//   Replaced "Unresolved frontend/backend API mappings detected." with a
//   concrete count-driven message: "N frontend API call(s) are not linked
//   to backend route(s)." — with proper singular/plural handling.

// ── esc stub (matches dashboard implementation) ───────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── _archIntegrationLevelSev (copied verbatim from dashboard.html) ─────────────
function _archIntegrationLevelSev(level) {
  if (!level) return 'unknown';
  var l = level.toLowerCase();
  if (l === 'integrated' || l === 'strong') return 'healthy';
  if (l === 'partial')                      return 'medium';
  if (l === 'weak' || l === 'below_average') return 'high';
  if (l === 'none')                         return 'critical';
  return 'unknown';
}

// ── _archMetric (copied verbatim from dashboard.html) ─────────────────────────
function _archMetric(val, label) {
  return '<div class="arch-metric">'
    + '<div class="arch-metric-val">' + esc(String(val)) + '</div>'
    + '<div class="arch-metric-lbl">' + esc(label) + '</div>'
    + '</div>';
}

// ── _archApiIntegrationHtml (copied verbatim from dashboard.html) ──────────────
function _archApiIntegrationHtml(api) {
  var html = '<div class="arch-sub-panel">';
  html += '<div class="arch-sub-label">API Integration Health</div>';
  if (!api) {
    html += '<p style="font-size:0.79rem;color:var(--text-muted);font-style:italic;">No API data available.</p>';
    return html + '</div>';
  }

  // ── Health-first interpretation
  var unresolved = api.totalUnresolvedFrontendCalls || 0;
  var feCalls    = api.totalFrontendCalls           || 0;
  var linked     = api.totalLinkedEndpoints         || 0;
  var il = (api.integrationLevel || '').toLowerCase();
  var unresolvedMsg = unresolved === 1
    ? '1 frontend API call is not linked to a backend route.'
    : unresolved + ' frontend API calls are not linked to backend routes.';
  var healthSev, healthLabel, healthMsg;
  if (il === 'weak' || il === 'risky' || il === 'critical' || il === 'none' || il === 'below_average') {
    healthSev   = 'high';
    healthLabel = 'Risky';
    healthMsg   = unresolved > 0
      ? unresolvedMsg
      : (feCalls > 0 && linked === 0)
        ? 'Frontend API calls exist but no backend route mappings are linked.'
        : 'API integration coverage is weak and needs review.';
  } else if (il === 'partial' || il === 'watch' || il === 'medium') {
    healthSev   = 'medium';
    healthLabel = 'Watch';
    healthMsg   = unresolved > 0
      ? unresolvedMsg
      : 'API mappings are partially linked.';
  } else {
    healthSev   = 'healthy';
    healthLabel = 'Healthy';
    healthMsg   = 'API integration mappings are structurally aligned.';
  }
  html += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;flex-wrap:wrap;">';
  html += '<span style="font-size:0.70rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">API Health:</span>';
  html += '<span class="aq-badge severity-' + esc(healthSev) + '">' + esc(healthLabel) + '</span>';
  html += '<span style="font-size:0.72rem;color:var(--text-muted);">' + esc(healthMsg) + '</span>';
  html += '</div>';

  // ── Coverage-level badge
  var lvlSev = _archIntegrationLevelSev(api.integrationLevel);
  html += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap;">';
  html += '<span style="font-size:0.70rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Coverage Level:</span>';
  html += '<span class="pf-badge severity-' + esc(lvlSev) + '">' + esc((api.integrationLevel || 'unknown').toUpperCase()) + '</span>';
  html += '</div>';

  // ── Raw metrics
  html += '<div class="arch-metric-grid">';
  html += _archMetric(feCalls, 'FE Calls');
  html += _archMetric(api.totalBackendRoutes || 0, 'BE Routes');
  html += _archMetric(linked, 'Linked');
  html += _archMetric(unresolved, 'Unresolved');
  html += '</div>';
  if (api.averageFrontendCoverage != null || api.averageBackendCoverage != null) {
    html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:0.72rem;color:var(--text-muted);">';
    if (api.averageFrontendCoverage != null) {
      html += '<span>FE coverage: ' + esc(Number(api.averageFrontendCoverage).toFixed(0)) + '%</span>';
    }
    if (api.averageBackendCoverage != null) {
      html += '<span>BE coverage: ' + esc(Number(api.averageBackendCoverage).toFixed(0)) + '%</span>';
    }
    html += '</div>';
  }
  return html + '</div>';
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('_archApiIntegrationHtml — no data', () => {
  test('renders "No API data available." when api is null', () => {
    expect(_archApiIntegrationHtml(null)).toContain('No API data available.');
  });

  test('does not throw when api is null', () => {
    expect(() => _archApiIntegrationHtml(null)).not.toThrow();
  });
});

describe('_archApiIntegrationHtml — section label', () => {
  test('always renders "API Integration Health" label', () => {
    expect(_archApiIntegrationHtml({ integrationLevel: 'weak' })).toContain('API Integration Health');
  });
});

describe('_archApiIntegrationHtml — unresolved message: singular', () => {
  test('risky level + unresolved = 1 → singular "call is not linked to a backend route"', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak', totalUnresolvedFrontendCalls: 1 });
    expect(html).toContain('1 frontend API call is not linked to a backend route.');
  });

  test('watch level + unresolved = 1 → singular message', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'partial', totalUnresolvedFrontendCalls: 1 });
    expect(html).toContain('1 frontend API call is not linked to a backend route.');
  });

  test('singular message does not use plural "calls"', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak', totalUnresolvedFrontendCalls: 1 });
    expect(html).not.toContain('1 frontend API calls');
  });
});

describe('_archApiIntegrationHtml — unresolved message: plural', () => {
  test('risky level + unresolved = 17 → "17 frontend API calls are not linked to backend routes."', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'risky', totalUnresolvedFrontendCalls: 17 });
    expect(html).toContain('17 frontend API calls are not linked to backend routes.');
  });

  test('watch level + unresolved = 3 → "3 frontend API calls are not linked to backend routes."', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'watch', totalUnresolvedFrontendCalls: 3 });
    expect(html).toContain('3 frontend API calls are not linked to backend routes.');
  });

  test('plural message includes the count', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak', totalUnresolvedFrontendCalls: 5 });
    expect(html).toContain('5 frontend API calls');
  });
});

describe('_archApiIntegrationHtml — old wording removed', () => {
  test('old "Unresolved frontend/backend API mappings detected." not rendered when unresolved > 0 (risky)', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak', totalUnresolvedFrontendCalls: 4 });
    expect(html).not.toContain('Unresolved frontend/backend API mappings detected.');
  });

  test('old "Unresolved frontend/backend API mappings detected." not rendered when unresolved > 0 (watch)', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'partial', totalUnresolvedFrontendCalls: 2 });
    expect(html).not.toContain('Unresolved frontend/backend API mappings detected.');
  });
});

describe('_archApiIntegrationHtml — Risky health state', () => {
  test('risky level renders "Risky" badge', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak' });
    expect(html).toContain('>Risky<');
  });

  test('risky + unresolved = 0 + feCalls > 0 + linked = 0 → fallback msg about no linked routes', () => {
    const html = _archApiIntegrationHtml({
      integrationLevel: 'weak',
      totalUnresolvedFrontendCalls: 0,
      totalFrontendCalls: 10,
      totalLinkedEndpoints: 0,
    });
    expect(html).toContain('Frontend API calls exist but no backend route mappings are linked.');
  });

  test('risky + unresolved = 0 + feCalls = 0 → "API integration coverage is weak and needs review."', () => {
    const html = _archApiIntegrationHtml({
      integrationLevel: 'risky',
      totalUnresolvedFrontendCalls: 0,
      totalFrontendCalls: 0,
    });
    expect(html).toContain('API integration coverage is weak and needs review.');
  });

  test('risky + unresolved > 0 → uses count-driven message, not weak-coverage message', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'weak', totalUnresolvedFrontendCalls: 3 });
    expect(html).not.toContain('API integration coverage is weak and needs review.');
    expect(html).toContain('frontend API calls are not linked to backend routes.');
  });
});

describe('_archApiIntegrationHtml — Watch health state', () => {
  test('partial level renders "Watch" badge', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'partial' });
    expect(html).toContain('>Watch<');
  });

  test('watch + unresolved = 0 → "API mappings are partially linked."', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'partial', totalUnresolvedFrontendCalls: 0 });
    expect(html).toContain('API mappings are partially linked.');
  });

  test('watch + unresolved > 0 → count-driven message, not "partially linked"', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'watch', totalUnresolvedFrontendCalls: 2 });
    expect(html).not.toContain('API mappings are partially linked.');
    expect(html).toContain('frontend API calls are not linked to backend routes.');
  });
});

describe('_archApiIntegrationHtml — Healthy health state', () => {
  test('unknown/healthy level renders "Healthy" badge', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'integrated' });
    expect(html).toContain('>Healthy<');
  });

  test('healthy message: "API integration mappings are structurally aligned."', () => {
    const html = _archApiIntegrationHtml({ integrationLevel: 'integrated' });
    expect(html).toContain('API integration mappings are structurally aligned.');
  });
});

describe('_archApiIntegrationHtml — raw metrics', () => {
  const base = {
    integrationLevel: 'partial',
    totalFrontendCalls: 20,
    totalBackendRoutes: 15,
    totalLinkedEndpoints: 12,
    totalUnresolvedFrontendCalls: 3,
  };

  test('renders "FE Calls" metric', () => {
    expect(_archApiIntegrationHtml(base)).toContain('FE Calls');
  });

  test('renders "BE Routes" metric', () => {
    expect(_archApiIntegrationHtml(base)).toContain('BE Routes');
  });

  test('renders "Linked" metric', () => {
    expect(_archApiIntegrationHtml(base)).toContain('Linked');
  });

  test('renders "Unresolved" metric', () => {
    expect(_archApiIntegrationHtml(base)).toContain('Unresolved');
  });

  test('renders FE coverage percentage when averageFrontendCoverage present', () => {
    const html = _archApiIntegrationHtml({ ...base, averageFrontendCoverage: 75.4 });
    expect(html).toContain('FE coverage: 75%');
  });

  test('renders BE coverage percentage when averageBackendCoverage present', () => {
    const html = _archApiIntegrationHtml({ ...base, averageBackendCoverage: 80 });
    expect(html).toContain('BE coverage: 80%');
  });

  test('omits coverage row when both coverage values absent', () => {
    const html = _archApiIntegrationHtml(base);
    expect(html).not.toContain('FE coverage:');
    expect(html).not.toContain('BE coverage:');
  });
});
