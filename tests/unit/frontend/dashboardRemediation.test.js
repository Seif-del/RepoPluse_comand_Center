'use strict';

// Pure-logic unit tests for buildRepoRemediationHtml.
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

// ── buildRepoRemediationHtml (copied verbatim from dashboard.html) ────────────
function buildRepoRemediationHtml(data) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'Remediation guidance unavailable until architecture intelligence is available for this repository.</p>';

  if (!data) return UNAVAIL;

  var level = (data.recommendationLevel || 'unknown').toLowerCase();
  if (level === 'unknown') return UNAVAIL;

  var recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (recs.length === 0 && level === 'none') {
    return '<p style="font-size:0.83rem;color:var(--text-muted);padding:6px 0;">'
      + 'No remediation actions are currently recommended for this repository.</p>';
  }

  function levelCls(l) {
    if (l === 'none' || l === 'low') return 'severity-healthy';
    if (l === 'medium')   return 'severity-medium';
    if (l === 'high')     return 'severity-high';
    if (l === 'critical') return 'severity-critical';
    return 'severity-unknown';
  }

  function priCls(p) {
    var s = (p || '').toLowerCase();
    if (s === 'critical') return 'severity-critical';
    if (s === 'high')     return 'severity-high';
    if (s === 'medium')   return 'severity-medium';
    if (s === 'low')      return 'severity-healthy';
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
    h += '<div style="font-size:0.70rem;color:var(--text-muted);margin-bottom:10px;">' + mp.join(' · ') + '</div>';
  }

  // A. Action Plan
  var ap     = data.actionPlan || {};
  var phases = [['immediate','Immediate'],['shortTerm','Short-term'],['mediumTerm','Medium-term'],['longTerm','Long-term']];
  var hasAP  = phases.some(function(p) { var a = ap[p[0]]; return Array.isArray(a) && a.length > 0; });
  if (hasAP) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Action Plan</div>';
    phases.forEach(function(p) {
      var items = ap[p[0]];
      if (!Array.isArray(items) || !items.length) return;
      h += '<div style="font-size:0.72rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin:8px 0 4px;">'
        + esc(p[1]) + '</div>';
      items.forEach(function(item) {
        if (!item) return;
        h += '<div class="arch-rec">';
        if (item.title)  h += '<strong>' + esc(item.title) + '</strong>';
        if (item.reason) h += '<span style="color:var(--text-muted);font-size:0.78rem;margin-left:6px;">' + esc(item.reason) + '</span>';
        h += '</div>';
      });
    });
    h += '</div>';
  }

  // B. Recommendations (top 10)
  if (recs.length > 0) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Recommendations</div>';
    recs.slice(0, 10).forEach(function(rec) {
      if (!rec) return;
      h += '<div style="padding:8px 0;border-bottom:1px solid var(--border);">';
      h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px;">';
      if (rec.priority) {
        h += '<span class="aq-badge ' + priCls(rec.priority) + '" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">'
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
      if (Array.isArray(rec.evidence) && rec.evidence.length) {
        var ev = rec.evidence.slice(0, 2).map(function(e) { return esc(typeof e === 'string' ? e : String(e)); });
        h += '<div style="font-size:0.70rem;color:var(--text-muted);margin-top:3px;">Evidence: '
          + ev.join(', ') + (rec.evidence.length > 2 ? '…' : '') + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
  }

  // C. Priorities
  var pri = data.priorities || {};
  if (pri.highestPriorityCategory || pri.highestPriorityRecommendationId != null
      || pri.criticalRecommendationCount != null || pri.highRecommendationCount != null) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Priorities</div>';
    h += '<div class="arch-metric-grid">';
    if (pri.criticalRecommendationCount != null) h += '<div class="arch-metric"><div class="arch-metric-val">' + esc(String(pri.criticalRecommendationCount)) + '</div><div class="arch-metric-lbl">Critical</div></div>';
    if (pri.highRecommendationCount    != null) h += '<div class="arch-metric"><div class="arch-metric-val">' + esc(String(pri.highRecommendationCount))    + '</div><div class="arch-metric-lbl">High</div></div>';
    if (pri.highestPriorityCategory)            h += '<div class="arch-metric"><div class="arch-metric-val" style="font-size:0.8rem;">' + esc(String(pri.highestPriorityCategory)) + '</div><div class="arch-metric-lbl">Top Category</div></div>';
    h += '</div>';
    if (pri.highestPriorityRecommendationId) {
      h += '<div style="font-size:0.71rem;color:var(--text-muted);margin-top:6px;">Highest priority: '
        + esc(String(pri.highestPriorityRecommendationId)) + '</div>';
    }
    h += '</div>';
  }

  // D. Estimated Impact
  var imp     = data.estimatedImpact || {};
  var impKeys = ['governanceImpact','architectureImpact','riskReduction','confidence'];
  var impLbls = { governanceImpact:'Governance', architectureImpact:'Architecture', riskReduction:'Risk Reduction', confidence:'Confidence' };
  if (impKeys.some(function(k) { return imp[k] != null; })) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Estimated Impact</div>';
    h += '<div class="arch-metric-grid">';
    impKeys.forEach(function(k) {
      if (imp[k] == null) return;
      h += '<div class="arch-metric"><div class="arch-metric-val" style="font-size:0.85rem;text-transform:capitalize;">'
        + esc(String(imp[k])) + '</div><div class="arch-metric-lbl">' + esc(impLbls[k]) + '</div></div>';
    });
    h += '</div>';
    h += '</div>';
  }

  return h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildRepoRemediationHtml — empty/failure states', () => {
  test('returns unavailable message for null data', () => {
    const html = buildRepoRemediationHtml(null);
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message for undefined', () => {
    expect(buildRepoRemediationHtml(undefined)).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message when recommendationLevel is unknown', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'unknown', recommendations: [] });
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('returns unavailable message when recommendationLevel is UNKNOWN (uppercase)', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'UNKNOWN', recommendations: [] });
    expect(html).toContain('Remediation guidance unavailable');
  });

  test('returns positive message when level is none and recommendations empty', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'none', recommendations: [] });
    expect(html).toContain('No remediation actions are currently recommended');
    expect(html).not.toContain('Remediation guidance unavailable');
  });

  test('returns positive message when recommendations absent and level is none', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'none' });
    expect(html).toContain('No remediation actions are currently recommended');
  });
});

describe('buildRepoRemediationHtml — score and level badge', () => {
  const base = { recommendationLevel: 'high', remediationScore: 64, recommendations: [] };

  test('renders score value', () => {
    expect(buildRepoRemediationHtml(base)).toContain('64');
  });

  test('renders / 100 label', () => {
    expect(buildRepoRemediationHtml(base)).toContain('/ 100');
  });

  test('renders recommendation level badge uppercased', () => {
    expect(buildRepoRemediationHtml(base)).toContain('HIGH');
  });

  test('high level maps to severity-high badge', () => {
    expect(buildRepoRemediationHtml(base)).toContain('severity-high');
  });

  test('critical level maps to severity-critical badge', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'critical', recommendations: [] });
    expect(html).toContain('severity-critical');
  });

  test('medium level maps to severity-medium badge', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'medium', recommendations: [] });
    expect(html).toContain('severity-medium');
  });

  test('low level maps to severity-healthy badge', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'low', recommendations: [] });
    expect(html).toContain('severity-healthy');
  });

  test('none level maps to severity-healthy badge', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'none', recommendations: [{ title: 'x' }] });
    expect(html).toContain('severity-healthy');
  });
});

describe('buildRepoRemediationHtml — confidence and summary', () => {
  test('renders confidence badge when confidenceLevel present', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      confidenceLevel: 'high',
      recommendations: [],
    });
    expect(html).toContain('HIGH CONFIDENCE');
    expect(html).toContain('severity-neutral');
  });

  test('omits confidence badge when confidenceLevel absent', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'high', recommendations: [] });
    expect(html).not.toContain('CONFIDENCE');
  });

  test('renders summary text', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'medium',
      summary: 'Address coupling issues.',
      recommendations: [],
    });
    expect(html).toContain('Address coupling issues.');
  });

  test('escapes XSS in summary', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'medium',
      summary: '<script>alert(1)</script>',
      recommendations: [],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildRepoRemediationHtml — _meta', () => {
  test('renders snapshotCount', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'medium',
      recommendations: [],
      _meta: { snapshotCount: 5 },
    });
    expect(html).toContain('5 snapshots');
  });

  test('renders source', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'medium',
      recommendations: [],
      _meta: { source: 'architecture' },
    });
    expect(html).toContain('source: architecture');
  });

  test('omits meta section when _meta absent', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'medium', recommendations: [] });
    expect(html).not.toContain('snapshots');
  });
});

describe('buildRepoRemediationHtml — action plan', () => {
  const data = {
    recommendationLevel: 'high',
    recommendations: [],
    actionPlan: {
      immediate: [{ title: 'Fix auth', reason: 'Security gap' }],
      shortTerm:  [{ title: 'Reduce coupling' }],
      mediumTerm: [],
      longTerm:   [],
    },
  };

  test('renders action plan section when items exist', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Action Plan');
  });

  test('renders immediate phase label', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Immediate');
  });

  test('renders item title', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Fix auth');
  });

  test('renders item reason', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Security gap');
  });

  test('renders short-term phase', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Short-term');
  });

  test('omits empty phases', () => {
    const html = buildRepoRemediationHtml(data);
    expect(html).not.toContain('Medium-term');
    expect(html).not.toContain('Long-term');
  });

  test('omits action plan section when actionPlan absent', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'high', recommendations: [] });
    expect(html).not.toContain('Action Plan');
  });

  test('escapes XSS in action plan title', () => {
    const d = {
      recommendationLevel: 'high',
      recommendations: [],
      actionPlan: { immediate: [{ title: '<img src=x onerror=alert(1)>' }] },
    };
    expect(buildRepoRemediationHtml(d)).not.toContain('<img');
  });
});

describe('buildRepoRemediationHtml — recommendations', () => {
  const rec = {
    priority: 'high',
    category: 'architecture',
    title: 'Extract service',
    rationale: 'Reduces coupling.',
    expectedOutcome: 'Improved maintainability.',
    evidence: ['file_a.js', 'file_b.js'],
  };

  const data = { recommendationLevel: 'high', recommendations: [rec] };

  test('renders Recommendations section', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Recommendations');
  });

  test('renders priority badge uppercased', () => {
    expect(buildRepoRemediationHtml(data)).toContain('HIGH');
  });

  test('priority high maps to severity-high', () => {
    expect(buildRepoRemediationHtml(data)).toContain('severity-high');
  });

  test('priority critical maps to severity-critical', () => {
    const d = { recommendationLevel: 'critical', recommendations: [{ priority: 'critical', title: 't' }] };
    expect(buildRepoRemediationHtml(d)).toContain('severity-critical');
  });

  test('priority low maps to severity-healthy', () => {
    const d = { recommendationLevel: 'low', recommendations: [{ priority: 'low', title: 't' }] };
    expect(buildRepoRemediationHtml(d)).toContain('severity-healthy');
  });

  test('renders category', () => {
    expect(buildRepoRemediationHtml(data)).toContain('architecture');
  });

  test('renders title', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Extract service');
  });

  test('renders rationale', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Reduces coupling.');
  });

  test('renders expected outcome', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Expected outcome: Improved maintainability.');
  });

  test('renders evidence (first 2)', () => {
    const html = buildRepoRemediationHtml(data);
    expect(html).toContain('file_a.js');
    expect(html).toContain('file_b.js');
  });

  test('truncates evidence beyond 2 with ellipsis', () => {
    const d = {
      recommendationLevel: 'high',
      recommendations: [{ title: 't', evidence: ['a', 'b', 'c'] }],
    };
    expect(buildRepoRemediationHtml(d)).toContain('…');
  });

  test('caps recommendations at 10', () => {
    const recs = Array.from({ length: 15 }, function(_, i) { return { title: 'rec-' + i }; });
    const html = buildRepoRemediationHtml({ recommendationLevel: 'high', recommendations: recs });
    expect(html).toContain('rec-9');
    expect(html).not.toContain('rec-10');
  });

  test('escapes XSS in recommendation title', () => {
    const d = { recommendationLevel: 'high', recommendations: [{ title: '<script>bad</script>' }] };
    expect(buildRepoRemediationHtml(d)).not.toContain('<script>');
  });
});

describe('buildRepoRemediationHtml — priorities sub-panel', () => {
  const data = {
    recommendationLevel: 'high',
    recommendations: [],
    priorities: {
      criticalRecommendationCount: 2,
      highRecommendationCount: 5,
      highestPriorityCategory: 'security',
      highestPriorityRecommendationId: 'rec-001',
    },
  };

  test('renders Priorities section', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Priorities');
  });

  test('renders criticalRecommendationCount', () => {
    expect(buildRepoRemediationHtml(data)).toContain('2');
  });

  test('renders highRecommendationCount', () => {
    expect(buildRepoRemediationHtml(data)).toContain('5');
  });

  test('renders highestPriorityCategory', () => {
    expect(buildRepoRemediationHtml(data)).toContain('security');
  });

  test('renders highestPriorityRecommendationId', () => {
    expect(buildRepoRemediationHtml(data)).toContain('rec-001');
  });

  test('omits priorities section when priorities absent', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'high', recommendations: [] });
    expect(html).not.toContain('Priorities');
  });
});

describe('buildRepoRemediationHtml — estimated impact sub-panel', () => {
  const data = {
    recommendationLevel: 'high',
    recommendations: [],
    estimatedImpact: {
      governanceImpact: 'significant',
      architectureImpact: 'moderate',
      riskReduction: 'high',
      confidence: 'medium',
    },
  };

  test('renders Estimated Impact section', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Estimated Impact');
  });

  test('renders governanceImpact value', () => {
    expect(buildRepoRemediationHtml(data)).toContain('significant');
  });

  test('renders architectureImpact value', () => {
    expect(buildRepoRemediationHtml(data)).toContain('moderate');
  });

  test('renders riskReduction value', () => {
    expect(buildRepoRemediationHtml(data)).toContain('high');
  });

  test('renders confidence value', () => {
    expect(buildRepoRemediationHtml(data)).toContain('medium');
  });

  test('renders Governance label', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Governance');
  });

  test('renders Risk Reduction label', () => {
    expect(buildRepoRemediationHtml(data)).toContain('Risk Reduction');
  });

  test('omits estimated impact section when estimatedImpact absent', () => {
    const html = buildRepoRemediationHtml({ recommendationLevel: 'high', recommendations: [] });
    expect(html).not.toContain('Estimated Impact');
  });

  test('renders partial impact fields gracefully', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      estimatedImpact: { governanceImpact: 'low' },
    });
    expect(html).toContain('Estimated Impact');
    expect(html).toContain('low');
    expect(html).not.toContain('architectureImpact');
  });
});

describe('buildRepoRemediationHtml — score cap note', () => {
  test('shows raw score and cap note when scoreCapApplied is true', () => {
    const html = buildRepoRemediationHtml({
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
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      remediationScore: 75,
      rawRemediationScore: 75,
      scoreCapApplied: false,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });

  test('omits cap note when scoreCapApplied is absent (older response)', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      remediationScore: 75,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });

  test('omits cap note when rawRemediationScore is absent even if scoreCapApplied true', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'critical',
      remediationScore: 100,
      scoreCapApplied: true,
      recommendations: [],
    });
    expect(html).not.toContain('capped at 100');
  });
});

describe('buildRepoRemediationHtml — confidenceReasons', () => {
  test('renders confidence reason text when confidenceReasons has entries', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['1 version boundary suppressed historical score comparison.'],
    });
    expect(html).toContain('1 version boundary suppressed historical score comparison.');
  });

  test('renders multiple confidence reasons', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['First reason.', 'Second reason.'],
    });
    expect(html).toContain('First reason.');
    expect(html).toContain('Second reason.');
  });

  test('omits reason section when confidenceReasons is empty array', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: [],
    });
    expect(html).not.toContain('version boundary');
  });

  test('omits reason section when confidenceReasons is absent (older response)', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
    });
    expect(html).not.toContain('version boundary');
  });

  test('escapes XSS in confidenceReasons', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      confidenceReasons: ['<script>alert(1)</script>'],
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildRepoRemediationHtml — version boundary context', () => {
  test('shows Version Boundaries and Suppressed Comparisons when affectsConfidence is true', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: true, boundaryCount: 2, suppressedIntervals: 2 },
    });
    expect(html).toContain('Version Boundaries: 2');
    expect(html).toContain('Suppressed Comparisons: 2');
  });

  test('omits version boundary section when affectsConfidence is false', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: false, boundaryCount: 1, suppressedIntervals: 1 },
    });
    expect(html).not.toContain('Version Boundaries');
  });

  test('omits version boundary section when versionBoundaryContext is absent (older response)', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
    });
    expect(html).not.toContain('Version Boundaries');
  });

  test('falls back to 0 for missing boundaryCount and suppressedIntervals', () => {
    const html = buildRepoRemediationHtml({
      recommendationLevel: 'high',
      recommendations: [],
      versionBoundaryContext: { affectsConfidence: true },
    });
    expect(html).toContain('Version Boundaries: 0');
    expect(html).toContain('Suppressed Comparisons: 0');
  });
});

// ── buildTopRemediationActionsHtml (copied verbatim from dashboard.html) ──────
function buildTopRemediationActionsHtml(data, esc) {
  var PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };

  function priRank(p) {
    var s = (p || '').toLowerCase();
    return PRIORITY_RANK.hasOwnProperty(s) ? PRIORITY_RANK[s] : 4;
  }

  function priCls(p) {
    var s = (p || '').toLowerCase();
    if (s === 'critical') return 'severity-critical';
    if (s === 'high')     return 'severity-high';
    if (s === 'medium')   return 'severity-medium';
    if (s === 'low')      return 'severity-healthy';
    return 'severity-unknown';
  }

  var items;
  var recs = Array.isArray(data.recommendations) ? data.recommendations : [];
  if (recs.length > 0) {
    items = recs.slice().sort(function(a, b) {
      return priRank(a.priority) - priRank(b.priority);
    }).slice(0, 5);
  } else {
    var ap = data.actionPlan || {};
    var combined = (Array.isArray(ap.immediate) ? ap.immediate : [])
      .concat(Array.isArray(ap.shortTerm) ? ap.shortTerm : []);
    if (!combined.length) return '';
    items = combined.slice(0, 5).map(function(item) {
      return { title: item ? item.title : undefined, rationale: item ? item.reason : undefined };
    });
  }

  if (!items || !items.length) return '';

  var h = '<div class="arch-sub-panel" style="margin-bottom:12px;">';
  h += '<div class="arch-sub-label">Top Remediation Actions</div>';
  items.forEach(function(item) {
    if (!item) return;
    h += '<div style="padding:6px 0;border-bottom:1px solid var(--border);">';
    h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">';
    if (item.priority) {
      h += '<span class="aq-badge ' + priCls(item.priority) + '" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">'
        + esc(String(item.priority).toUpperCase()) + '</span>';
    }
    if (item.category) {
      h += '<span style="font-size:0.67rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;">'
        + esc(String(item.category)) + '</span>';
    }
    h += '</div>';
    if (item.title)     h += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);margin-bottom:2px;">' + esc(item.title) + '</div>';
    if (item.rationale) h += '<div style="font-size:0.77rem;color:var(--text-secondary);">' + esc(item.rationale) + '</div>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildTopRemediationActionsHtml — empty/no-op states', () => {
  test('returns empty string when recommendations absent and no actionPlan', () => {
    expect(buildTopRemediationActionsHtml({ recommendationLevel: 'high' }, esc)).toBe('');
  });

  test('returns empty string when recommendations is empty and actionPlan absent', () => {
    expect(buildTopRemediationActionsHtml({ recommendations: [] }, esc)).toBe('');
  });

  test('returns empty string when recommendations empty and actionPlan phases both empty', () => {
    const d = { recommendations: [], actionPlan: { immediate: [], shortTerm: [] } };
    expect(buildTopRemediationActionsHtml(d, esc)).toBe('');
  });

  test('returns empty string when actionPlan present but only mediumTerm/longTerm have items', () => {
    const d = { recommendations: [], actionPlan: { mediumTerm: [{ title: 'x' }] } };
    expect(buildTopRemediationActionsHtml(d, esc)).toBe('');
  });
});

describe('buildTopRemediationActionsHtml — section header', () => {
  test('renders Top Remediation Actions header', () => {
    const d = { recommendations: [{ priority: 'high', title: 'Fix it' }] };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('Top Remediation Actions');
  });
});

describe('buildTopRemediationActionsHtml — priority sort order', () => {
  const recs = [
    { priority: 'low',      title: 'Low action' },
    { priority: 'critical', title: 'Critical action' },
    { priority: 'medium',   title: 'Medium action' },
    { priority: 'high',     title: 'High action' },
  ];

  test('critical appears before high in output', () => {
    const html = buildTopRemediationActionsHtml({ recommendations: recs }, esc);
    expect(html.indexOf('Critical action')).toBeLessThan(html.indexOf('High action'));
  });

  test('high appears before medium in output', () => {
    const html = buildTopRemediationActionsHtml({ recommendations: recs }, esc);
    expect(html.indexOf('High action')).toBeLessThan(html.indexOf('Medium action'));
  });

  test('medium appears before low in output', () => {
    const html = buildTopRemediationActionsHtml({ recommendations: recs }, esc);
    expect(html.indexOf('Medium action')).toBeLessThan(html.indexOf('Low action'));
  });

  test('unknown priority sorts after low', () => {
    const d = {
      recommendations: [
        { priority: 'low',     title: 'Low' },
        { priority: 'unknown', title: 'Unknown' },
      ],
    };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html.indexOf('Low')).toBeLessThan(html.indexOf('Unknown'));
  });
});

describe('buildTopRemediationActionsHtml — cap at 5', () => {
  const recs = Array.from({ length: 8 }, function(_, i) {
    return { priority: 'high', title: 'action-' + i };
  });

  test('renders exactly 5 items when 8 recommendations provided', () => {
    const html = buildTopRemediationActionsHtml({ recommendations: recs }, esc);
    expect(html).toContain('action-4');
    expect(html).not.toContain('action-5');
  });

  test('does not mutate the original recommendations array', () => {
    const original = recs.slice();
    buildTopRemediationActionsHtml({ recommendations: recs }, esc);
    expect(recs.length).toBe(original.length);
  });
});

describe('buildTopRemediationActionsHtml — rendered fields', () => {
  const data = {
    recommendations: [{
      priority: 'high',
      category: 'architecture',
      title: 'Extract shared service',
      rationale: 'Reduces coupling.',
    }],
  };

  test('renders priority badge uppercased', () => {
    expect(buildTopRemediationActionsHtml(data, esc)).toContain('HIGH');
  });

  test('priority high maps to severity-high class', () => {
    expect(buildTopRemediationActionsHtml(data, esc)).toContain('severity-high');
  });

  test('priority critical maps to severity-critical class', () => {
    const d = { recommendations: [{ priority: 'critical', title: 't' }] };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('severity-critical');
  });

  test('priority medium maps to severity-medium class', () => {
    const d = { recommendations: [{ priority: 'medium', title: 't' }] };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('severity-medium');
  });

  test('priority low maps to severity-healthy class', () => {
    const d = { recommendations: [{ priority: 'low', title: 't' }] };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('severity-healthy');
  });

  test('renders category', () => {
    expect(buildTopRemediationActionsHtml(data, esc)).toContain('architecture');
  });

  test('renders title', () => {
    expect(buildTopRemediationActionsHtml(data, esc)).toContain('Extract shared service');
  });

  test('renders rationale', () => {
    expect(buildTopRemediationActionsHtml(data, esc)).toContain('Reduces coupling.');
  });

  test('omits rationale row when rationale absent', () => {
    const d = { recommendations: [{ priority: 'high', title: 'Fix it' }] };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).toContain('Fix it');
    expect(html).not.toContain('text-secondary');
  });

  test('renders without crash when priority is absent', () => {
    const d = { recommendations: [{ title: 'No priority item' }] };
    expect(() => buildTopRemediationActionsHtml(d, esc)).not.toThrow();
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('No priority item');
  });

  test('renders without crash when category is absent', () => {
    const d = { recommendations: [{ priority: 'high', title: 'No category' }] };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('No category');
  });
});

describe('buildTopRemediationActionsHtml — XSS escaping', () => {
  test('escapes XSS in title', () => {
    const d = { recommendations: [{ title: '<script>alert(1)</script>' }] };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('escapes XSS in priority', () => {
    const d = { recommendations: [{ priority: '<b>bad</b>', title: 'x' }] };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;B&gt;'); // toUpperCase() is called before esc
  });

  test('escapes XSS in category', () => {
    const d = { recommendations: [{ priority: 'high', category: '<img src=x>', title: 'x' }] };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  test('escapes XSS in rationale', () => {
    const d = { recommendations: [{ priority: 'low', title: 'x', rationale: '<script>bad</script>' }] };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildTopRemediationActionsHtml — actionPlan fallback', () => {
  test('uses actionPlan.immediate when recommendations empty', () => {
    const d = {
      recommendations: [],
      actionPlan: { immediate: [{ title: 'Rotate secrets', reason: 'Security' }] },
    };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('Rotate secrets');
  });

  test('uses actionPlan.shortTerm when recommendations empty and immediate absent', () => {
    const d = {
      recommendations: [],
      actionPlan: { shortTerm: [{ title: 'Add tests', reason: 'Coverage' }] },
    };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('Add tests');
  });

  test('combines immediate then shortTerm items in order', () => {
    const d = {
      recommendations: [],
      actionPlan: {
        immediate: [{ title: 'First' }],
        shortTerm: [{ title: 'Second' }],
      },
    };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html.indexOf('First')).toBeLessThan(html.indexOf('Second'));
  });

  test('caps combined fallback items at 5', () => {
    const items = Array.from({ length: 4 }, function(_, i) { return { title: 'imm-' + i }; });
    const stItems = Array.from({ length: 4 }, function(_, i) { return { title: 'st-' + i }; });
    const d = { recommendations: [], actionPlan: { immediate: items, shortTerm: stItems } };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).toContain('imm-3');  // 4th immediate item — present
    expect(html).toContain('st-0');   // 5th item overall (1st shortTerm) — present
    expect(html).not.toContain('st-1'); // 6th item — beyond cap
  });

  test('renders reason from actionPlan item as rationale', () => {
    const d = {
      recommendations: [],
      actionPlan: { immediate: [{ title: 'Fix dep', reason: 'Outdated library' }] },
    };
    expect(buildTopRemediationActionsHtml(d, esc)).toContain('Outdated library');
  });

  test('escapes XSS in fallback title', () => {
    const d = {
      recommendations: [],
      actionPlan: { immediate: [{ title: '<script>bad</script>' }] },
    };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  test('does not activate fallback when recommendations is non-empty', () => {
    const d = {
      recommendations: [{ priority: 'high', title: 'Primary rec' }],
      actionPlan: { immediate: [{ title: 'Should not appear' }] },
    };
    const html = buildTopRemediationActionsHtml(d, esc);
    expect(html).toContain('Primary rec');
    expect(html).not.toContain('Should not appear');
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
