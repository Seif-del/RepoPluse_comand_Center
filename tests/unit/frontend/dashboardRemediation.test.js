'use strict';

// Pure-logic unit tests for the Remediation tab render functions.
// These functions are embedded in frontend/dashboard.html but have no DOM
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

// ── _remediationPriCls / buildRemediationHeaderHtml / buildRemediationActionPlanHtml /
//    buildRemediationImpactSummaryHtml / buildRemediationBodyHtml
//    (copied verbatim from dashboard.html) ────────────────────────────────────
function _remediationPriCls(p) {
  var s = (p || '').toLowerCase();
  if (s === 'critical') return 'severity-critical';
  if (s === 'high')     return 'severity-high';
  if (s === 'medium')   return 'severity-medium';
  if (s === 'low')      return 'severity-healthy';
  return 'severity-unknown';
}

function buildRemediationHeaderHtml(data) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'Remediation guidance unavailable until architecture intelligence is available for this repository.</p>';

  if (!data) return UNAVAIL;

  var level = (data.recommendationLevel || 'unknown').toLowerCase();
  if (level === 'unknown') return UNAVAIL;

  function levelCls(l) {
    if (l === 'none' || l === 'low') return 'severity-healthy';
    if (l === 'medium')   return 'severity-medium';
    if (l === 'high')     return 'severity-high';
    if (l === 'critical') return 'severity-critical';
    return 'severity-unknown';
  }

  var badge = 'font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 9px;border-radius:99px;border:1px solid transparent;white-space:nowrap;';
  var h = '';

  var score = data.remediationScore != null ? data.remediationScore : null;
  var conf  = data.confidenceLevel   || null;

  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 6px;">';
  if (score !== null) {
    h += '<span style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">' + esc(String(score)) + '</span>';
    h += '<span style="font-size:0.75rem;color:var(--text-muted);">/ 100</span>';
  }
  h += '<span class="aq-badge ' + levelCls(level) + '" style="' + badge + '">'
    + esc((data.recommendationLevel || 'UNKNOWN').toUpperCase()) + '</span>';
  if (conf) {
    h += '<span class="aq-badge severity-neutral" style="' + badge + '">'
      + esc(String(conf).toUpperCase()) + ' CONFIDENCE</span>';
  }
  h += '</div>';

  if (data.rawRemediationScore != null && data.scoreCapApplied) {
    h += '<div style="font-size:0.71rem;color:var(--text-muted);margin:-2px 0 5px;">'
      + 'Raw score: ' + esc(String(data.rawRemediationScore)) + ' → capped at 100'
      + '</div>';
  }

  if (Array.isArray(data.confidenceReasons) && data.confidenceReasons.length > 0) {
    data.confidenceReasons.forEach(function(reason) {
      h += '<div style="font-size:0.71rem;color:var(--text-muted);margin-bottom:3px;">'
        + esc(String(reason)) + '</div>';
    });
  }

  var vbc = data.versionBoundaryContext || {};
  if (vbc.affectsConfidence) {
    h += '<div style="font-size:0.71rem;color:var(--text-muted);margin-bottom:8px;">'
      + 'Version Boundaries: ' + esc(String(vbc.boundaryCount  || 0))
      + ' · Suppressed Comparisons: ' + esc(String(vbc.suppressedIntervals || 0))
      + '</div>';
  }

  if (data.summary) {
    h += '<p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.45;margin:0 0 8px;">'
      + esc(data.summary) + '</p>';
  }

  var meta = data._meta || {};
  var mp   = [];
  if (meta.snapshotCount != null) mp.push(esc(String(meta.snapshotCount)) + ' snapshots');
  if (meta.source)                mp.push('source: ' + esc(String(meta.source)));
  if (meta.generatedAt) {
    try { mp.push('generated ' + new Date(meta.generatedAt).toLocaleString()); } catch (e) { /* ignore */ }
  }
  if (mp.length) {
    h += '<div style="font-size:0.70rem;color:var(--text-muted);margin-bottom:6px;">' + mp.join(' · ') + '</div>';
  }

  return h;
}

function buildRemediationActionPlanHtml(data) {
  var recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (!recs.length) return '';

  var h = '<div class="arch-sub-panel">';
  h += '<div class="arch-sub-label">Prioritized Action Plan</div>';
  recs.slice(0, 10).forEach(function(rec) {
    if (!rec) return;
    h += '<div style="padding:8px 0;border-bottom:1px solid var(--border);">';
    h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">';
    if (rec.priority) {
      h += '<span class="aq-badge ' + _remediationPriCls(rec.priority) + '" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">'
        + esc(String(rec.priority).toUpperCase()) + '</span>';
    }
    if (rec.category) {
      h += '<span style="font-size:0.67rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">'
        + esc(String(rec.category)) + '</span>';
    }
    h += '</div>';
    if (rec.title)           h += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);margin-bottom:3px;">' + esc(rec.title) + '</div>';
    if (rec.rationale)       h += '<div style="font-size:0.77rem;color:var(--text-secondary);margin-bottom:2px;">' + esc(rec.rationale) + '</div>';
    if (rec.expectedOutcome) h += '<div style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">Expected outcome: ' + esc(rec.expectedOutcome) + '</div>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

function buildRemediationImpactSummaryHtml(data) {
  var pri = data.priorities      || {};
  var imp = data.estimatedImpact || {};

  var metrics = [];
  if (pri.criticalRecommendationCount != null) metrics.push(['Critical', String(pri.criticalRecommendationCount)]);
  if (pri.highRecommendationCount    != null) metrics.push(['High',     String(pri.highRecommendationCount)]);
  if (pri.highestPriorityCategory)            metrics.push(['Top Category', String(pri.highestPriorityCategory)]);
  if (imp.governanceImpact    != null)        metrics.push(['Governance',    String(imp.governanceImpact)]);
  if (imp.architectureImpact  != null)        metrics.push(['Architecture',  String(imp.architectureImpact)]);
  if (imp.riskReduction       != null)        metrics.push(['Risk Reduction', String(imp.riskReduction)]);

  if (!metrics.length) return '';

  var h = '<div class="arch-sub-panel">';
  h += '<div class="arch-sub-label">Impact Summary</div>';
  h += '<div class="arch-metric-grid">';
  metrics.forEach(function(m) {
    h += '<div class="arch-metric"><div class="arch-metric-val" style="font-size:0.85rem;text-transform:capitalize;">'
      + esc(m[1]) + '</div><div class="arch-metric-lbl">' + esc(m[0]) + '</div></div>';
  });
  h += '</div>';
  h += '</div>';
  return h;
}

function buildRemediationBodyHtml(data) {
  if (!data) return '';

  var level = (data.recommendationLevel || 'unknown').toLowerCase();
  if (level === 'unknown') return '';

  var recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (!recs.length) {
    return '<p style="font-size:0.83rem;color:var(--text-muted);padding:6px 0;">'
      + 'No remediation actions are currently recommended for this repository.</p>';
  }

  return buildRemediationActionPlanHtml(data) + buildRemediationImpactSummaryHtml(data);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildRemediationHeaderHtml — empty/failure states', () => {
  test('returns unavailable message for null data', () => {
    const html = buildRemediationHeaderHtml(null);
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message for undefined', () => {
    expect(buildRemediationHeaderHtml(undefined)).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message when recommendationLevel is unknown', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'unknown', recommendations: [] });
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message when recommendationLevel is UNKNOWN (uppercase)', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'UNKNOWN', recommendations: [] });
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('renders header (not unavailable) when level is none, even with no recommendations', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'none', remediationScore: 92, recommendations: [] });
    expect(html).not.toContain('Remediation guidance unavailable');
    expect(html).toContain('NONE');
    expect(html).toContain('92');
  });
});

describe('buildRemediationHeaderHtml — score and level badge', () => {
  const base = { recommendationLevel: 'high', remediationScore: 64, recommendations: [] };

  test('renders score value', () => {
    expect(buildRemediationHeaderHtml(base)).toContain('64');
  });

  test('renders / 100 label', () => {
    expect(buildRemediationHeaderHtml(base)).toContain('/ 100');
  });

  test('renders recommendation level badge uppercased', () => {
    expect(buildRemediationHeaderHtml(base)).toContain('HIGH');
  });

  test('high level maps to severity-high badge', () => {
    expect(buildRemediationHeaderHtml(base)).toContain('severity-high');
  });

  test('critical level maps to severity-critical badge', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'critical', recommendations: [] });
    expect(html).toContain('severity-critical');
  });

  test('medium level maps to severity-medium badge', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'medium', recommendations: [] });
    expect(html).toContain('severity-medium');
  });

  test('low level maps to severity-healthy badge', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'low', recommendations: [] });
    expect(html).toContain('severity-healthy');
  });

  test('none level maps to severity-healthy badge', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'none', recommendations: [{ title: 'x' }] });
    expect(html).toContain('severity-healthy');
  });
});

describe('buildRemediationHeaderHtml — confidence and summary', () => {
  test('renders confidence badge when confidenceLevel present', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      confidenceLevel: 'high',
      recommendations: [],
    });
    expect(html).toContain('HIGH CONFIDENCE');
    expect(html).toContain('severity-neutral');
  });

  test('omits confidence badge when confidenceLevel absent', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'high', recommendations: [] });
    expect(html).not.toContain('CONFIDENCE');
  });

  test('renders summary text', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'medium',
      summary: 'Address coupling issues.',
      recommendations: [],
    });
    expect(html).toContain('Address coupling issues.');
  });

  test('escapes XSS in summary', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'medium',
      summary: '<script>alert(1)</script>',
      recommendations: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildRemediationHeaderHtml — _meta', () => {
  test('renders snapshotCount', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'medium',
      recommendations: [],
      _meta: { snapshotCount: 5 },
    });
    expect(html).toContain('5 snapshots');
  });

  test('renders source', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'medium',
      recommendations: [],
      _meta: { source: 'architecture' },
    });
    expect(html).toContain('source: architecture');
  });

  test('omits meta section when _meta absent', () => {
    const html = buildRemediationHeaderHtml({ recommendationLevel: 'medium', recommendations: [] });
    expect(html).not.toContain('snapshots');
  });
});

describe('buildRemediationHeaderHtml — score cap note', () => {
  test('shows raw score and cap note when scoreCapApplied is true', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'critical',
      remediationScore: 100,
      rawRemediationScore: 115,
      scoreCapApplied: true,
      recommendations: [],
    });
    expect(html).toContain('Raw score: 115');
    expect(html).toContain('capped at 100');
  });

  test('omits cap note when scoreCapApplied is false', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      remediationScore: 75,
      rawRemediationScore: 75,
      scoreCapApplied: false,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });

  test('omits cap note when scoreCapApplied is absent (older response)', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      remediationScore: 75,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });

  test('omits cap note when rawRemediationScore is absent even if scoreCapApplied true', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'critical',
      remediationScore: 100,
      scoreCapApplied: true,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });
});

describe('buildRemediationHeaderHtml — confidenceReasons', () => {
  test('renders confidence reason text when confidenceReasons has entries', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['1 version boundary suppressed historical score comparison.'],
    });
    expect(html).toContain('1 version boundary suppressed historical score comparison.');
  });

  test('renders multiple confidence reasons', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['First reason.', 'Second reason.'],
    });
    expect(html).toContain('First reason.');
    expect(html).toContain('Second reason.');
  });

  test('omits reason section when confidenceReasons is empty array', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: [],
    });
    expect(html).not.toContain('version boundary');
  });

  test('omits reason section when confidenceReasons is absent (older response)', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
    });
    expect(html).not.toContain('version boundary');
  });

  test('escapes XSS in confidenceReasons', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['<script>alert(1)</script>'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildRemediationHeaderHtml — version boundary context', () => {
  test('shows Version Boundaries and Suppressed Comparisons when affectsConfidence is true', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: true, boundaryCount: 2, suppressedIntervals: 2 },
    });
    expect(html).toContain('Version Boundaries: 2');
    expect(html).toContain('Suppressed Comparisons: 2');
  });

  test('omits version boundary section when affectsConfidence is false', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: false, boundaryCount: 1, suppressedIntervals: 1 },
    });
    expect(html).not.toContain('Version Boundaries');
  });

  test('omits version boundary section when versionBoundaryContext is absent (older response)', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
    });
    expect(html).not.toContain('Version Boundaries');
  });

  test('falls back to 0 for missing boundaryCount and suppressedIntervals', () => {
    const html = buildRemediationHeaderHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: true },
    });
    expect(html).toContain('Version Boundaries: 0');
    expect(html).toContain('Suppressed Comparisons: 0');
  });
});

describe('buildRemediationActionPlanHtml — consolidated recommendation rendering', () => {
  const rec = {
    priority: 'high',
    category: 'architecture',
    title: 'Extract service',
    rationale: 'Reduces coupling.',
    expectedOutcome: 'Improved maintainability.',
    evidence: ['file_a.js', 'file_b.js'],
  };

  const data = { recommendationLevel: 'high', recommendations: [rec] };

  test('renders Prioritized Action Plan header', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('Prioritized Action Plan');
  });

  test('renders each recommendation title exactly once', () => {
    const html = buildRemediationActionPlanHtml(data);
    const matches = html.split('Extract service').length - 1;
    expect(matches).toBe(1);
  });

  test('renders priority badge uppercased', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('HIGH');
  });

  test('priority high maps to severity-high', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('severity-high');
  });

  test('priority critical maps to severity-critical', () => {
    const d = { recommendationLevel: 'critical', recommendations: [{ priority: 'critical', title: 't' }] };
    expect(buildRemediationActionPlanHtml(d)).toContain('severity-critical');
  });

  test('priority low maps to severity-healthy', () => {
    const d = { recommendationLevel: 'low', recommendations: [{ priority: 'low', title: 't' }] };
    expect(buildRemediationActionPlanHtml(d)).toContain('severity-healthy');
  });

  test('renders category', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('architecture');
  });

  test('renders rationale', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('Reduces coupling.');
  });

  test('renders expected outcome', () => {
    expect(buildRemediationActionPlanHtml(data)).toContain('Expected outcome: Improved maintainability.');
  });

  test('does not render an evidence line (dropped from consolidated card)', () => {
    expect(buildRemediationActionPlanHtml(data)).not.toContain('file_a.js');
  });

  test('preserves backend-provided order (no re-sort by priority)', () => {
    const d = {
      recommendationLevel: 'high',
      recommendations: [
        { priority: 'low',      title: 'Low action' },
        { priority: 'critical', title: 'Critical action' },
      ],
    };
    const html = buildRemediationActionPlanHtml(d);
    expect(html.indexOf('Low action')).toBeLessThan(html.indexOf('Critical action'));
  });

  test('caps recommendations at 10', () => {
    const recs = Array.from({ length: 15 }, function(_, i) { return { title: 'rec-' + i }; });
    const html = buildRemediationActionPlanHtml({ recommendationLevel: 'high', recommendations: recs });
    expect(html).toContain('rec-9');
    expect(html).not.toContain('rec-10');
  });

  test('returns empty string when recommendations is empty', () => {
    expect(buildRemediationActionPlanHtml({ recommendationLevel: 'high', recommendations: [] })).toBe('');
  });

  test('escapes XSS in recommendation title', () => {
    const d = { recommendationLevel: 'high', recommendations: [{ title: '<script>bad</script>' }] };
    expect(buildRemediationActionPlanHtml(d)).not.toContain('<script>');
  });

  test('escapes XSS in rationale', () => {
    const d = { recommendationLevel: 'high', recommendations: [{ title: 't', rationale: '<script>bad</script>' }] };
    expect(buildRemediationActionPlanHtml(d)).not.toContain('<script>');
  });
});

describe('buildRemediationImpactSummaryHtml — consolidated impact/priority metrics', () => {
  const data = {
    priorities: {
      criticalRecommendationCount: 2,
      highRecommendationCount: 5,
      highestPriorityCategory: 'security',
      highestPriorityRecommendationId: 'rec-001',
    },
    estimatedImpact: {
      governanceImpact: 'significant',
      architectureImpact: 'moderate',
      riskReduction: 'high',
      confidence: 'medium',
    },
  };

  test('renders a single Impact Summary header (no separate Priorities/Estimated Impact headers)', () => {
    const html = buildRemediationImpactSummaryHtml(data);
    expect(html).toContain('Impact Summary');
    expect(html).not.toContain('Priorities');
    expect(html).not.toContain('Estimated Impact');
  });

  test('renders criticalRecommendationCount', () => {
    expect(buildRemediationImpactSummaryHtml(data)).toContain('2');
  });

  test('renders highRecommendationCount', () => {
    expect(buildRemediationImpactSummaryHtml(data)).toContain('5');
  });

  test('renders highestPriorityCategory', () => {
    expect(buildRemediationImpactSummaryHtml(data)).toContain('security');
  });

  test('does not render highestPriorityRecommendationId (not a decision-useful metric)', () => {
    expect(buildRemediationImpactSummaryHtml(data)).not.toContain('rec-001');
  });

  test('renders governanceImpact value and label', () => {
    const html = buildRemediationImpactSummaryHtml(data);
    expect(html).toContain('significant');
    expect(html).toContain('Governance');
  });

  test('renders architectureImpact value', () => {
    expect(buildRemediationImpactSummaryHtml(data)).toContain('moderate');
  });

  test('renders riskReduction value and Risk Reduction label', () => {
    const html = buildRemediationImpactSummaryHtml(data);
    expect(html).toContain('high');
    expect(html).toContain('Risk Reduction');
  });

  test('does not render estimatedImpact.confidence (already shown once in header)', () => {
    const d = { estimatedImpact: { confidence: 'medium-only-value' } };
    expect(buildRemediationImpactSummaryHtml(d)).not.toContain('medium-only-value');
  });

  test('returns empty string when both priorities and estimatedImpact are absent', () => {
    expect(buildRemediationImpactSummaryHtml({})).toBe('');
  });

  test('renders partial fields gracefully', () => {
    const html = buildRemediationImpactSummaryHtml({ estimatedImpact: { governanceImpact: 'low' } });
    expect(html).toContain('Impact Summary');
    expect(html).toContain('low');
  });
});

describe('buildRemediationBodyHtml — empty state and orchestration', () => {
  test('returns empty string for unavailable data (unknown level)', () => {
    expect(buildRemediationBodyHtml({ recommendationLevel: 'unknown' })).toBe('');
    expect(buildRemediationBodyHtml(null)).toBe('');
  });

  test('shows a single clear empty state when recommendations is empty (level none)', () => {
    const html = buildRemediationBodyHtml({ recommendationLevel: 'none', recommendations: [] });
    expect(html).toContain('No remediation actions are currently recommended');
  });

  test('empty state does not also render Prioritized Action Plan or Impact Summary headers', () => {
    const html = buildRemediationBodyHtml({ recommendationLevel: 'none', recommendations: [] });
    expect(html).not.toContain('Prioritized Action Plan');
    expect(html).not.toContain('Impact Summary');
  });

  test('renders both the action plan and impact summary once each when data is present', () => {
    const data = {
      recommendationLevel: 'high',
      recommendations: [{ priority: 'high', title: 'Fix auth', rationale: 'Security gap' }],
      priorities: { criticalRecommendationCount: 1 },
      estimatedImpact: { governanceImpact: 'high' },
    };
    const html = buildRemediationBodyHtml(data);
    expect(html.split('Prioritized Action Plan').length - 1).toBe(1);
    expect(html.split('Impact Summary').length - 1).toBe(1);
    expect(html.split('Fix auth').length - 1).toBe(1);
  });
});

// ── buildRecentRegressionsHtml (copied verbatim from dashboard.html) ──────────
function buildRecentRegressionsHtml(fc, esc) {
  var REGRESSION_TYPES = {
    score_drop:                true,
    level_degraded:            true,
    api_regression:            true,
    implementation_regression: true,
    coupling_growth:           true,
    new_risk:                  true,
  };

  var TYPE_LABEL = {
    score_drop:                'SCORE DROP',
    level_degraded:            'DEGRADED',
    api_regression:            'API REGRESSION',
    implementation_regression: 'IMPL REGRESSION',
    coupling_growth:           'COUPLING',
    new_risk:                  'NEW RISK',
  };

  var SEV_CLASS = {
    high:   'severity-high',
    medium: 'severity-medium',
    low:    'severity-healthy',
  };

  if (!fc) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
      + 'Architecture data not yet available — regression history will appear once architecture analysis completes.</p>';
  }

  var events = Array.isArray(fc.driftEvents) ? fc.driftEvents : [];

  var regressions = events
    .filter(function(ev) { return ev && REGRESSION_TYPES[ev.type]; })
    .sort(function(a, b) {
      var da = a.snapshotAt ? new Date(a.snapshotAt).getTime() : 0;
      var db = b.snapshotAt ? new Date(b.snapshotAt).getTime() : 0;
      return db - da;
    })
    .slice(0, 5);

  if (!regressions.length) {
    return '<p style="font-size:0.82rem;color:var(--text-muted);padding:6px 0;">'
      + 'No regression events detected in available snapshots.</p>';
  }

  var h = '<div class="arch-sub-panel" style="margin-bottom:12px;">';
  h += '<div class="arch-sub-label">Recent Regressions</div>';

  regressions.forEach(function(ev) {
    var sevCls = SEV_CLASS[ev.severity] || 'severity-unknown';
    var label  = TYPE_LABEL[ev.type]    || esc(String(ev.type || 'EVENT').toUpperCase());
    var timeStr = ev.snapshotAt
      ? new Date(ev.snapshotAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    var evidence = '';
    if (ev.type === 'score_drop' && ev.prevScore != null && ev.currScore != null) {
      evidence = esc(String(ev.prevScore)) + ' → ' + esc(String(ev.currScore));
    } else if (ev.type === 'api_regression') {
      var parts = [];
      if (ev.unresolvedDelta != null && ev.unresolvedDelta !== 0)
        parts.push('+' + esc(String(ev.unresolvedDelta)) + ' unresolved');
      if (ev.mismatchDelta != null && ev.mismatchDelta !== 0)
        parts.push('+' + esc(String(ev.mismatchDelta)) + ' mismatches');
      if (parts.length) evidence = parts.join(', ');
    }

    h += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">';
    h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">';
    h += '<span class="aq-badge ' + sevCls + '" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;'
      + 'letter-spacing:0.06em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">'
      + esc(label) + '</span>';
    if (evidence) {
      h += '<span style="font-size:0.70rem;color:var(--text-muted);">' + evidence + '</span>';
    }
    h += '<span style="font-size:0.70rem;color:var(--text-muted);margin-left:auto;">' + esc(timeStr) + '</span>';
    h += '</div>';
    h += '<div style="font-size:0.80rem;color:var(--text-secondary);">' + esc(ev.summary || '') + '</div>';
    h += '</div>';
  });

  h += '</div>';
  return h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function makeEv(overrides) {
  return Object.assign({
    type:       'score_drop',
    severity:   'high',
    snapshotAt: '2026-05-10T14:00:00Z',
    summary:    'Architecture health score dropped by 20 points.',
    prevScore:  75,
    currScore:  55,
  }, overrides);
}

describe('buildRecentRegressionsHtml — null/empty states', () => {
  test('null fc returns "Architecture data not yet available" message', () => {
    expect(buildRecentRegressionsHtml(null, esc)).toContain('Architecture data not yet available');
  });

  test('null fc does not return no-regression message', () => {
    expect(buildRecentRegressionsHtml(null, esc)).not.toContain('No regression events detected');
  });

  test('fc with no driftEvents returns no-regression message', () => {
    expect(buildRecentRegressionsHtml({ driftEvents: [] }, esc)).toContain('No regression events detected');
  });

  test('fc with only non-regression events returns no-regression message', () => {
    const fc = { driftEvents: [
      makeEv({ type: 'score_gain',     severity: 'low',  summary: 'Score improved.' }),
      makeEv({ type: 'level_improved', severity: 'low',  summary: 'Level improved.' }),
      makeEv({ type: 'resolved_risk',  severity: 'low',  summary: 'Risk resolved.' }),
      makeEv({ type: 'version_change', severity: 'low',  summary: 'Version changed.' }),
    ]};
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('No regression events detected');
  });

  test('fc missing driftEvents property returns no-regression message', () => {
    expect(buildRecentRegressionsHtml({}, esc)).toContain('No regression events detected');
  });
});

describe('buildRecentRegressionsHtml — section header', () => {
  test('renders "Recent Regressions" header', () => {
    const fc = { driftEvents: [makeEv()] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('Recent Regressions');
  });
});

describe('buildRecentRegressionsHtml — regression type filter', () => {
  const INCLUDED = ['score_drop', 'level_degraded', 'api_regression', 'implementation_regression', 'coupling_growth', 'new_risk'];
  const EXCLUDED = ['score_gain', 'level_improved', 'resolved_risk', 'version_change'];

  INCLUDED.forEach(function(type) {
    test('includes type "' + type + '"', () => {
      const fc = { driftEvents: [makeEv({ type, summary: 'event-' + type })] };
      expect(buildRecentRegressionsHtml(fc, esc)).toContain('event-' + type);
    });
  });

  EXCLUDED.forEach(function(type) {
    test('excludes type "' + type + '"', () => {
      const fc = { driftEvents: [makeEv({ type, summary: 'event-' + type })] };
      expect(buildRecentRegressionsHtml(fc, esc)).not.toContain('event-' + type);
    });
  });
});

describe('buildRecentRegressionsHtml — type labels', () => {
  const labelCases = [
    ['score_drop',                'SCORE DROP'],
    ['level_degraded',            'DEGRADED'],
    ['api_regression',            'API REGRESSION'],
    ['implementation_regression', 'IMPL REGRESSION'],
    ['coupling_growth',           'COUPLING'],
    ['new_risk',                  'NEW RISK'],
  ];

  labelCases.forEach(function([type, label]) {
    test('type "' + type + '" renders badge "' + label + '"', () => {
      const fc = { driftEvents: [makeEv({ type })] };
      expect(buildRecentRegressionsHtml(fc, esc)).toContain(label);
    });
  });
});

describe('buildRecentRegressionsHtml — severity classes', () => {
  test('severity "high" uses severity-high class', () => {
    const fc = { driftEvents: [makeEv({ severity: 'high' })] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('severity-high');
  });

  test('severity "medium" uses severity-medium class', () => {
    const fc = { driftEvents: [makeEv({ severity: 'medium' })] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('severity-medium');
  });

  test('severity "low" uses severity-healthy class', () => {
    const fc = { driftEvents: [makeEv({ severity: 'low' })] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('severity-healthy');
  });

  test('unknown severity falls back to severity-unknown', () => {
    const fc = { driftEvents: [makeEv({ severity: 'exotic' })] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('severity-unknown');
  });
});

describe('buildRecentRegressionsHtml — sort order (most recent first)', () => {
  test('more recent snapshotAt appears before older one', () => {
    const fc = { driftEvents: [
      makeEv({ snapshotAt: '2026-03-01T00:00:00Z', summary: 'Older event' }),
      makeEv({ snapshotAt: '2026-05-01T00:00:00Z', summary: 'Newer event' }),
    ]};
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html.indexOf('Newer event')).toBeLessThan(html.indexOf('Older event'));
  });

  test('null snapshotAt sorts last', () => {
    const fc = { driftEvents: [
      makeEv({ snapshotAt: null,                   summary: 'No date event' }),
      makeEv({ snapshotAt: '2026-04-01T00:00:00Z', summary: 'Dated event' }),
    ]};
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html.indexOf('Dated event')).toBeLessThan(html.indexOf('No date event'));
  });
});

describe('buildRecentRegressionsHtml — cap at 5', () => {
  test('renders exactly 5 items when 8 regression events provided', () => {
    const evs = Array.from({ length: 8 }, function(_, i) {
      return makeEv({ snapshotAt: '2026-0' + (i + 1) + '-01T00:00:00Z', summary: 'event-' + i });
    });
    const fc = { driftEvents: evs };
    const html = buildRecentRegressionsHtml(fc, esc);
    // 5 most recent: indices 7,6,5,4,3 → summaries event-7 through event-3
    expect(html).toContain('event-7');
    expect(html).toContain('event-3');
    expect(html).not.toContain('event-2');
  });

  test('does not mutate the original driftEvents array', () => {
    const evs = Array.from({ length: 3 }, function(_, i) { return makeEv({ summary: 's' + i }); });
    const original = evs.slice();
    buildRecentRegressionsHtml({ driftEvents: evs }, esc);
    expect(evs.length).toBe(original.length);
  });
});

describe('buildRecentRegressionsHtml — evidence: score_drop', () => {
  test('renders prevScore → currScore for score_drop', () => {
    const fc = { driftEvents: [makeEv({ type: 'score_drop', prevScore: 80, currScore: 55 })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('80');
    expect(html).toContain('55');
    expect(html).toContain('→');
  });

  test('omits evidence span when prevScore is absent', () => {
    const fc = { driftEvents: [makeEv({ type: 'score_drop', prevScore: null, currScore: 55, summary: 'Dropped.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('Dropped.');
    expect(html).not.toContain('text-muted;">');  // evidence span not rendered
  });

  test('omits evidence span when currScore is absent', () => {
    const fc = { driftEvents: [makeEv({ type: 'score_drop', prevScore: 80, currScore: null, summary: 'Dropped.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('Dropped.');
  });
});

describe('buildRecentRegressionsHtml — evidence: api_regression', () => {
  test('renders unresolvedDelta when non-zero', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', unresolvedDelta: 3, mismatchDelta: 0, summary: 'API issue.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('+3 unresolved');
  });

  test('renders mismatchDelta when non-zero', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', unresolvedDelta: 0, mismatchDelta: 2, summary: 'API issue.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('+2 mismatches');
  });

  test('renders both deltas joined by comma when both non-zero', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', unresolvedDelta: 3, mismatchDelta: 2, summary: 'API issue.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('+3 unresolved');
    expect(html).toContain('+2 mismatches');
  });

  test('omits evidence when both deltas are zero', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', unresolvedDelta: 0, mismatchDelta: 0, summary: 'API issue.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('API issue.');
    expect(html).not.toContain('unresolved');
    expect(html).not.toContain('mismatches');
  });

  test('omits evidence when delta fields absent', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', summary: 'API issue.' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).toContain('API issue.');
    expect(html).not.toContain('unresolved');
  });
});

describe('buildRecentRegressionsHtml — date rendering', () => {
  test('renders a formatted date string when snapshotAt present', () => {
    const fc = { driftEvents: [makeEv({ snapshotAt: '2026-05-10T14:00:00Z' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    // Raw ISO string must not appear — it must be formatted
    expect(html).not.toContain('2026-05-10T14:00:00Z');
  });

  test('renders "—" when snapshotAt is null', () => {
    const fc = { driftEvents: [makeEv({ snapshotAt: null })] };
    expect(buildRecentRegressionsHtml(fc, esc)).toContain('>—<');
  });
});

describe('buildRecentRegressionsHtml — XSS escaping', () => {
  test('escapes XSS in summary', () => {
    const fc = { driftEvents: [makeEv({ summary: '<script>alert(1)</script>' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes XSS in score_drop prevScore', () => {
    const fc = { driftEvents: [makeEv({ type: 'score_drop', prevScore: '<b>80</b>', currScore: 55 })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;b&gt;');
  });

  test('escapes XSS in api_regression unresolvedDelta', () => {
    const fc = { driftEvents: [makeEv({ type: 'api_regression', unresolvedDelta: '<img>', mismatchDelta: 0, summary: 's' })] };
    const html = buildRecentRegressionsHtml(fc, esc);
    expect(html).not.toContain('<img>');
    expect(html).toContain('&lt;img&gt;');
  });
});

// ── buildRecentVersionChangesHtml (copied verbatim from dashboard.html) ───────
function buildRecentVersionChangesHtml(fc, esc) {
  if (!fc) return '';

  var events = Array.isArray(fc.driftEvents) ? fc.driftEvents : [];

  var changes = events
    .filter(function(ev) { return ev && ev.type === 'version_change'; })
    .sort(function(a, b) {
      var da = a.snapshotAt ? new Date(a.snapshotAt).getTime() : 0;
      var db = b.snapshotAt ? new Date(b.snapshotAt).getTime() : 0;
      return db - da;
    })
    .slice(0, 5);

  if (!changes.length) return '';

  var ds = 'font-size:0.72rem;color:var(--text-muted);margin-top:2px;';
  var h  = '<div class="arch-sub-panel" style="margin-bottom:12px;">';
  h += '<div class="arch-sub-label">Recent Version Changes</div>';

  changes.forEach(function(ev) {
    var pa = ev.prevAnalyzerVersion || 'legacy';
    var ca = ev.currAnalyzerVersion || 'legacy';
    var ps = ev.prevScoringVersion  || 'legacy';
    var cs = ev.currScoringVersion  || 'legacy';
    var timeStr = ev.snapshotAt
      ? new Date(ev.snapshotAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '—';

    h += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px;">';
    h += '<span class="aq-badge severity-unknown" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;'
      + 'letter-spacing:0.06em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">VERSION CHANGE</span>';
    h += '<span style="font-size:0.70rem;color:var(--text-muted);">' + esc(timeStr) + '</span>';
    h += '</div>';
    h += '<div style="' + ds + '">Analyzer: ' + esc(pa) + ' → ' + esc(ca) + '</div>';
    h += '<div style="' + ds + '">Scoring: '  + esc(ps) + ' → ' + esc(cs) + '</div>';
    h += '</div>';
  });

  h += '</div>';
  return h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function makeVc(overrides) {
  return Object.assign({
    type:                'version_change',
    severity:            'low',
    snapshotAt:          '2026-05-15T12:00:00Z',
    summary:             'Analyzer or scoring version changed.',
    prevAnalyzerVersion: 'v2.0.0',
    currAnalyzerVersion: 'v2.1.0',
    prevScoringVersion:  'v1.3.0',
    currScoringVersion:  'v1.4.0',
  }, overrides);
}

describe('buildRecentVersionChangesHtml — null/empty states', () => {
  test('null fc returns empty string', () => {
    expect(buildRecentVersionChangesHtml(null, esc)).toBe('');
  });

  test('fc with no driftEvents returns empty string', () => {
    expect(buildRecentVersionChangesHtml({ driftEvents: [] }, esc)).toBe('');
  });

  test('fc missing driftEvents property returns empty string', () => {
    expect(buildRecentVersionChangesHtml({}, esc)).toBe('');
  });

  test('fc with only non-version_change events returns empty string', () => {
    const fc = { driftEvents: [
      { type: 'score_drop',  severity: 'high',   snapshotAt: '2026-05-01T00:00:00Z', summary: 'Drop.' },
      { type: 'api_regression', severity: 'medium', snapshotAt: '2026-04-01T00:00:00Z', summary: 'API.' },
    ]};
    expect(buildRecentVersionChangesHtml(fc, esc)).toBe('');
  });
});

describe('buildRecentVersionChangesHtml — section header', () => {
  test('renders "Recent Version Changes" header when events present', () => {
    const fc = { driftEvents: [makeVc()] };
    expect(buildRecentVersionChangesHtml(fc, esc)).toContain('Recent Version Changes');
  });

  test('renders "VERSION CHANGE" badge', () => {
    const fc = { driftEvents: [makeVc()] };
    expect(buildRecentVersionChangesHtml(fc, esc)).toContain('VERSION CHANGE');
  });
});

describe('buildRecentVersionChangesHtml — type filter', () => {
  test('version_change event is included', () => {
    const fc = { driftEvents: [makeVc({ summary: 'vc-event' })] };
    expect(buildRecentVersionChangesHtml(fc, esc)).toContain('Recent Version Changes');
  });

  test('score_drop event is not included', () => {
    const fc = { driftEvents: [
      { type: 'score_drop', snapshotAt: '2026-05-01T00:00:00Z', summary: 'drop-event', severity: 'high' },
      makeVc(),
    ]};
    expect(buildRecentVersionChangesHtml(fc, esc)).not.toContain('drop-event');
  });

  test('mixed events — only version_change rows rendered', () => {
    const fc = { driftEvents: [
      makeVc({ prevAnalyzerVersion: 'v1.0', currAnalyzerVersion: 'v2.0' }),
      { type: 'new_risk', snapshotAt: '2026-04-01T00:00:00Z', summary: 'risk-summary', severity: 'high' },
    ]};
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).toContain('v1.0');
    expect(html).not.toContain('risk-summary');
  });
});

describe('buildRecentVersionChangesHtml — sort order (most recent first)', () => {
  test('more recent snapshotAt appears before older one', () => {
    const fc = { driftEvents: [
      makeVc({ snapshotAt: '2026-02-01T00:00:00Z', prevAnalyzerVersion: 'v1.0', currAnalyzerVersion: 'v1.1', summary: 'older' }),
      makeVc({ snapshotAt: '2026-05-01T00:00:00Z', prevAnalyzerVersion: 'v2.0', currAnalyzerVersion: 'v2.1', summary: 'newer' }),
    ]};
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html.indexOf('v2.0')).toBeLessThan(html.indexOf('v1.0'));
  });

  test('null snapshotAt sorts last', () => {
    const fc = { driftEvents: [
      makeVc({ snapshotAt: null,                   prevAnalyzerVersion: 'vNull', currAnalyzerVersion: 'vNull2' }),
      makeVc({ snapshotAt: '2026-04-01T00:00:00Z', prevAnalyzerVersion: 'vDated', currAnalyzerVersion: 'vDated2' }),
    ]};
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html.indexOf('vDated')).toBeLessThan(html.indexOf('vNull'));
  });
});

describe('buildRecentVersionChangesHtml — cap at 5', () => {
  const eightChanges = Array.from({ length: 8 }, function(_, i) {
    return makeVc({
      snapshotAt:          '2026-0' + (i + 1) + '-01T00:00:00Z',
      prevAnalyzerVersion: 'v' + i + '.0',
      currAnalyzerVersion: 'v' + (i + 1) + '.0',
    });
  });

  test('renders exactly 5 rows when 8 version_change events provided', () => {
    const fc = { driftEvents: eightChanges };
    const html = buildRecentVersionChangesHtml(fc, esc);
    // 5 most recent: indices 7,6,5,4,3 → v7.0, v6.0, v5.0, v4.0, v3.0
    expect(html).toContain('v7.0');
    expect(html).toContain('v3.0');
    expect(html).not.toContain('v2.0');
  });

  test('does not mutate the original driftEvents array', () => {
    const evs = Array.from({ length: 3 }, function(_, i) { return makeVc({ snapshotAt: '2026-0' + (i + 1) + '-01T00:00:00Z' }); });
    const original = evs.slice();
    buildRecentVersionChangesHtml({ driftEvents: evs }, esc);
    expect(evs.length).toBe(original.length);
  });
});

describe('buildRecentVersionChangesHtml — rendered fields', () => {
  test('renders analyzer prevVersion → currVersion', () => {
    const fc = { driftEvents: [makeVc({ prevAnalyzerVersion: 'v2.0.0', currAnalyzerVersion: 'v2.1.0' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).toContain('v2.0.0');
    expect(html).toContain('v2.1.0');
    expect(html).toContain('Analyzer:');
  });

  test('renders scoring prevVersion → currVersion', () => {
    const fc = { driftEvents: [makeVc({ prevScoringVersion: 'v1.3.0', currScoringVersion: 'v1.4.0' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).toContain('v1.3.0');
    expect(html).toContain('v1.4.0');
    expect(html).toContain('Scoring:');
  });

  test('renders both analyzer and scoring lines for every event', () => {
    const fc = { driftEvents: [makeVc()] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).toContain('Analyzer:');
    expect(html).toContain('Scoring:');
  });

  test('renders both lines even when analyzer side is unchanged (prev === curr)', () => {
    const fc = { driftEvents: [makeVc({ prevAnalyzerVersion: 'v2.0.0', currAnalyzerVersion: 'v2.0.0' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    const analyzerCount = (html.match(/Analyzer:/g) || []).length;
    const scoringCount  = (html.match(/Scoring:/g)  || []).length;
    expect(analyzerCount).toBe(1);
    expect(scoringCount).toBe(1);
  });

  test('renders both lines even when scoring side is unchanged (prev === curr)', () => {
    const fc = { driftEvents: [makeVc({ prevScoringVersion: 'v1.4.0', currScoringVersion: 'v1.4.0' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).toContain('Analyzer:');
    expect(html).toContain('Scoring:');
  });

  test('formatted date rendered when snapshotAt present — raw ISO not shown', () => {
    const fc = { driftEvents: [makeVc({ snapshotAt: '2026-05-15T12:00:00Z' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).not.toContain('2026-05-15T12:00:00Z');
  });

  test('renders "—" when snapshotAt is null', () => {
    const fc = { driftEvents: [makeVc({ snapshotAt: null })] };
    expect(buildRecentVersionChangesHtml(fc, esc)).toContain('>—<');
  });
});

describe('buildRecentVersionChangesHtml — legacy fallbacks', () => {
  test('absent prevAnalyzerVersion falls back to "legacy"', () => {
    const ev = makeVc();
    delete ev.prevAnalyzerVersion;
    const html = buildRecentVersionChangesHtml({ driftEvents: [ev] }, esc);
    expect(html).toContain('legacy');
  });

  test('absent currAnalyzerVersion falls back to "legacy"', () => {
    const ev = makeVc();
    delete ev.currAnalyzerVersion;
    const html = buildRecentVersionChangesHtml({ driftEvents: [ev] }, esc);
    expect(html).toContain('legacy');
  });

  test('absent prevScoringVersion falls back to "legacy"', () => {
    const ev = makeVc();
    delete ev.prevScoringVersion;
    const html = buildRecentVersionChangesHtml({ driftEvents: [ev] }, esc);
    expect(html).toContain('legacy');
  });

  test('absent currScoringVersion falls back to "legacy"', () => {
    const ev = makeVc();
    delete ev.currScoringVersion;
    const html = buildRecentVersionChangesHtml({ driftEvents: [ev] }, esc);
    expect(html).toContain('legacy');
  });
});

describe('buildRecentVersionChangesHtml — XSS escaping', () => {
  test('escapes XSS in prevAnalyzerVersion', () => {
    const fc = { driftEvents: [makeVc({ prevAnalyzerVersion: '<script>bad</script>' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes XSS in currScoringVersion', () => {
    const fc = { driftEvents: [makeVc({ currScoringVersion: '<img src=x onerror=alert(1)>' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('escapes XSS in currAnalyzerVersion', () => {
    const fc = { driftEvents: [makeVc({ currAnalyzerVersion: '"onload="evil()"' })] };
    const html = buildRecentVersionChangesHtml(fc, esc);
    expect(html).not.toContain('"onload=');
    expect(html).toContain('&quot;');
  });
});
