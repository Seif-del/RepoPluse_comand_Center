'use strict';

// Pure-logic unit tests for buildChangeRiskHtml.
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

// ── buildChangeRiskHtml (copied verbatim from dashboard.html) ─────────────────
function buildChangeRiskHtml(data) {
  var INSUFF = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'Insufficient information available to assess change risk.</p>';

  if (!data) return INSUFF;
  var level = (data.changeRiskLevel || 'unknown').toLowerCase();
  if (level === 'unknown') return INSUFF;

  function levelCls(l) {
    if (l === 'low')      return 'severity-healthy';
    if (l === 'medium')   return 'severity-medium';
    if (l === 'high')     return 'severity-high';
    if (l === 'critical') return 'severity-critical';
    return 'severity-unknown';
  }

  var badge = 'font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;padding:2px 9px;border-radius:99px;border:1px solid transparent;white-space:nowrap;';
  var h = '';

  var score = data.changeRiskScore != null ? data.changeRiskScore : null;
  var conf  = data.confidenceLevel || null;

  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:8px 0 6px;">';
  if (score !== null) {
    h += '<span style="font-size:1.4rem;font-weight:700;color:var(--text-primary);">' + esc(String(score)) + '</span>';
    h += '<span style="font-size:0.75rem;color:var(--text-muted);">/ 100</span>';
  }
  h += '<span class="aq-badge ' + levelCls(level) + '" style="' + badge + '">'
    + esc((data.changeRiskLevel || 'UNKNOWN').toUpperCase()) + ' RISK</span>';
  if (conf) {
    h += '<span class="aq-badge severity-neutral" style="' + badge + '">'
      + esc(String(conf).toUpperCase()) + ' CONFIDENCE</span>';
  }
  h += '</div>';

  if (data.summary) {
    h += '<p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.45;margin:0 0 10px;">'
      + esc(data.summary) + '</p>';
  }

  // A. Risk Factors
  var factors = Array.isArray(data.riskFactors) ? data.riskFactors : [];
  if (factors.length > 0) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Risk Factors</div>';
    factors.forEach(function(f) {
      if (!f) return;
      if (typeof f === 'string') {
        h += '<div class="arch-rec">' + esc(f) + '</div>';
      } else {
        h += '<div style="padding:5px 0;border-bottom:1px solid var(--border);">';
        h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px;">';
        if (f.severity) h += '<span class="aq-badge ' + levelCls(String(f.severity).toLowerCase()) + '" style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:1px 7px;border-radius:99px;border:1px solid transparent;">' + esc(String(f.severity).toUpperCase()) + '</span>';
        if (f.factor)   h += '<span style="font-size:0.80rem;font-weight:600;color:var(--text-primary);">' + esc(String(f.factor)) + '</span>';
        h += '</div>';
        if (f.summary) h += '<div style="font-size:0.77rem;color:var(--text-secondary);">' + esc(String(f.summary)) + '</div>';
        h += '</div>';
      }
    });
    h += '</div>';
  }

  // B. Impacted Areas
  var areas  = (data.impactedAreas && typeof data.impactedAreas === 'object') ? data.impactedAreas : {};
  var areaMap = { architecture:'Architecture', api:'API', database:'Database', auth:'Security',
                  frontend:'Frontend', backend:'Backend', dependencies:'Dependencies', tests:'Tests', governance:'Governance' };
  var impacted = Object.keys(areaMap).filter(function(k) { return areas[k] === true; });
  if (impacted.length) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Impacted Areas</div>';
    h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;">';
    impacted.forEach(function(k) {
      h += '<span class="aq-badge severity-medium" style="font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid transparent;text-transform:uppercase;letter-spacing:0.04em;">'
        + esc(areaMap[k]) + '</span>';
    });
    h += '</div></div>';
  }

  // C. Recommended Review
  var review = (data.recommendedReview && typeof data.recommendedReview === 'object') ? data.recommendedReview : null;
  if (review) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Recommended Review</div>';
    if (review.requiredReviewLevel) h += '<div style="font-size:0.82rem;font-weight:600;color:var(--text-primary);margin-bottom:4px;">Review level: ' + esc(String(review.requiredReviewLevel)) + '</div>';
    if (Array.isArray(review.reviewers) && review.reviewers.length) h += '<div style="font-size:0.77rem;color:var(--text-secondary);margin-bottom:3px;">Suggested reviewers: ' + review.reviewers.map(function(r) { return esc(String(r)); }).join(', ') + '</div>';
    if (review.rationale) h += '<div style="font-size:0.77rem;color:var(--text-muted);">' + esc(String(review.rationale)) + '</div>';
    h += '</div>';
  }

  // D. Mitigation Checklist
  var checklist = Array.isArray(data.mitigationChecklist) ? data.mitigationChecklist : [];
  if (checklist.length) {
    h += '<div class="arch-sub-panel">';
    h += '<div class="arch-sub-label">Mitigation Checklist</div>';
    checklist.forEach(function(item) {
      if (!item) return;
      h += '<div class="arch-rec">' + esc(typeof item === 'string' ? item : String(item)) + '</div>';
    });
    h += '</div>';
  }

  // E. Release Guidance
  var guidance = (data.releaseGuidance && typeof data.releaseGuidance === 'object') ? data.releaseGuidance : null;
  if (guidance) {
    var guideFlags = [
      ['canFastTrack',               'Can fast-track'],
      ['requiresStaging',            'Requires staging'],
      ['requiresRollbackPlan',       'Requires rollback plan'],
      ['requiresSecurityReview',     'Requires security review'],
      ['requiresMigrationPlan',      'Requires migration plan'],
      ['requiresArchitectureReview', 'Requires architecture review'],
    ];
    var activeFlags = guideFlags.filter(function(p) { return guidance[p[0]] === true; });
    var guideLines  = [];
    if (guidance.recommendation)     guideLines.push(esc(String(guidance.recommendation)));
    if (guidance.deploymentGuidance) guideLines.push(esc(String(guidance.deploymentGuidance)));
    if (guidance.monitoringGuidance) guideLines.push(esc(String(guidance.monitoringGuidance)));

    if (activeFlags.length || guideLines.length) {
      h += '<div class="arch-sub-panel">';
      h += '<div class="arch-sub-label">Release Guidance</div>';
      guideLines.forEach(function(line) {
        h += '<div style="font-size:0.80rem;color:var(--text-secondary);margin-bottom:4px;">' + line + '</div>';
      });
      if (activeFlags.length) {
        h += '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:4px;">';
        activeFlags.forEach(function(p) {
          h += '<span class="aq-badge severity-neutral" style="font-size:0.65rem;font-weight:600;padding:2px 8px;border-radius:99px;border:1px solid transparent;text-transform:none;letter-spacing:0.02em;">'
            + esc(p[1]) + '</span>';
        });
        h += '</div>';
      }
      h += '</div>';
    }
  }

  return h;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildChangeRiskHtml — empty/failure states', () => {
  test('returns insufficient message for null data', () => {
    expect(buildChangeRiskHtml(null)).toContain('Insufficient information available to assess change risk');
  });

  test('returns insufficient message for undefined', () => {
    expect(buildChangeRiskHtml(undefined)).toContain('Insufficient information available');
  });

  test('returns insufficient message when changeRiskLevel is unknown', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'unknown' })).toContain('Insufficient information available');
  });

  test('returns insufficient message when changeRiskLevel is UNKNOWN (uppercase)', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'UNKNOWN' })).toContain('Insufficient information available');
  });

  test('renders content when level is low', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'low', changeRiskScore: 10 });
    expect(html).not.toContain('Insufficient information available');
    expect(html).toContain('LOW RISK');
  });
});

describe('buildChangeRiskHtml — score and level badge', () => {
  test('renders score value', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium', changeRiskScore: 42 })).toContain('42');
  });

  test('renders / 100', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium', changeRiskScore: 42 })).toContain('/ 100');
  });

  test('renders RISK suffix on level badge', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'high', changeRiskScore: 70 })).toContain('HIGH RISK');
  });

  test('low level maps to severity-healthy', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'low', changeRiskScore: 5 })).toContain('severity-healthy');
  });

  test('medium level maps to severity-medium', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium', changeRiskScore: 42 })).toContain('severity-medium');
  });

  test('high level maps to severity-high', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'high', changeRiskScore: 70 })).toContain('severity-high');
  });

  test('critical level maps to severity-critical', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'critical', changeRiskScore: 90 })).toContain('severity-critical');
  });

  test('omits score row when changeRiskScore is null', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'medium' });
    expect(html).not.toContain('/ 100');
  });
});

describe('buildChangeRiskHtml — confidence and summary', () => {
  test('renders confidence badge when confidenceLevel present', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'high', changeRiskScore: 70, confidenceLevel: 'medium' });
    expect(html).toContain('MEDIUM CONFIDENCE');
    expect(html).toContain('severity-neutral');
  });

  test('omits confidence badge when confidenceLevel absent', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium', changeRiskScore: 42 })).not.toContain('CONFIDENCE');
  });

  test('renders summary text', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'medium', summary: 'Auth surface touched.' });
    expect(html).toContain('Auth surface touched.');
  });

  test('escapes XSS in summary', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'medium', summary: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

describe('buildChangeRiskHtml — risk factors (string form)', () => {
  const data = { changeRiskLevel: 'high', changeRiskScore: 70, riskFactors: ['auth surface touched', 'migration present'] };

  test('renders Risk Factors section', () => {
    expect(buildChangeRiskHtml(data)).toContain('Risk Factors');
  });

  test('renders first string factor', () => {
    expect(buildChangeRiskHtml(data)).toContain('auth surface touched');
  });

  test('renders second string factor', () => {
    expect(buildChangeRiskHtml(data)).toContain('migration present');
  });

  test('omits Risk Factors section when array is empty', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'medium', riskFactors: [] });
    expect(html).not.toContain('Risk Factors');
  });

  test('escapes XSS in string factor', () => {
    const html = buildChangeRiskHtml({ changeRiskLevel: 'high', riskFactors: ['<img onerror=x>'] });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});

describe('buildChangeRiskHtml — risk factors (object form)', () => {
  const factor = { severity: 'high', factor: 'Auth surface', summary: 'Login logic changed.' };
  const data   = { changeRiskLevel: 'high', changeRiskScore: 70, riskFactors: [factor] };

  test('renders object factor severity badge', () => {
    expect(buildChangeRiskHtml(data)).toContain('HIGH');
  });

  test('object high severity maps to severity-high', () => {
    expect(buildChangeRiskHtml(data)).toContain('severity-high');
  });

  test('renders factor name', () => {
    expect(buildChangeRiskHtml(data)).toContain('Auth surface');
  });

  test('renders factor summary', () => {
    expect(buildChangeRiskHtml(data)).toContain('Login logic changed.');
  });

  test('object critical severity maps to severity-critical', () => {
    const d = { changeRiskLevel: 'critical', riskFactors: [{ severity: 'critical', factor: 'x' }] };
    expect(buildChangeRiskHtml(d)).toContain('severity-critical');
  });

  test('object low severity maps to severity-healthy', () => {
    const d = { changeRiskLevel: 'low', riskFactors: [{ severity: 'low', factor: 'x' }] };
    expect(buildChangeRiskHtml(d)).toContain('severity-healthy');
  });
});

describe('buildChangeRiskHtml — impacted areas', () => {
  test('renders Impacted Areas when flags are true', () => {
    const data = { changeRiskLevel: 'high', impactedAreas: { auth: true, api: true } };
    const html = buildChangeRiskHtml(data);
    expect(html).toContain('Impacted Areas');
    expect(html).toContain('Security');
    expect(html).toContain('API');
  });

  test('omits Impacted Areas when all flags are false', () => {
    const data = { changeRiskLevel: 'medium', impactedAreas: { auth: false, api: false } };
    expect(buildChangeRiskHtml(data)).not.toContain('Impacted Areas');
  });

  test('renders Architecture area', () => {
    const data = { changeRiskLevel: 'high', impactedAreas: { architecture: true } };
    expect(buildChangeRiskHtml(data)).toContain('Architecture');
  });

  test('renders Backend area', () => {
    const data = { changeRiskLevel: 'high', impactedAreas: { backend: true } };
    expect(buildChangeRiskHtml(data)).toContain('Backend');
  });

  test('renders Tests area', () => {
    const data = { changeRiskLevel: 'medium', impactedAreas: { tests: true } };
    expect(buildChangeRiskHtml(data)).toContain('Tests');
  });

  test('renders Governance area', () => {
    const data = { changeRiskLevel: 'medium', impactedAreas: { governance: true } };
    expect(buildChangeRiskHtml(data)).toContain('Governance');
  });

  test('omits Impacted Areas section when impactedAreas is absent', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium' })).not.toContain('Impacted Areas');
  });
});

describe('buildChangeRiskHtml — recommended review', () => {
  const review = { requiredReviewLevel: 'senior', reviewers: ['alice', 'bob'], rationale: 'Auth change detected.' };
  const data   = { changeRiskLevel: 'high', recommendedReview: review };

  test('renders Recommended Review section', () => {
    expect(buildChangeRiskHtml(data)).toContain('Recommended Review');
  });

  test('renders review level', () => {
    expect(buildChangeRiskHtml(data)).toContain('Review level: senior');
  });

  test('renders suggested reviewers', () => {
    const html = buildChangeRiskHtml(data);
    expect(html).toContain('alice');
    expect(html).toContain('bob');
  });

  test('renders rationale', () => {
    expect(buildChangeRiskHtml(data)).toContain('Auth change detected.');
  });

  test('omits Recommended Review when absent', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium' })).not.toContain('Recommended Review');
  });

  test('handles empty reviewers array gracefully', () => {
    const d = { changeRiskLevel: 'high', recommendedReview: { requiredReviewLevel: 'standard', reviewers: [], rationale: 'none' } };
    const html = buildChangeRiskHtml(d);
    expect(html).toContain('Recommended Review');
    expect(html).not.toContain('Suggested reviewers');
  });

  test('escapes XSS in rationale', () => {
    const d = { changeRiskLevel: 'high', recommendedReview: { rationale: '<script>x</script>' } };
    expect(buildChangeRiskHtml(d)).not.toContain('<script>');
  });
});

describe('buildChangeRiskHtml — mitigation checklist', () => {
  const data = { changeRiskLevel: 'high', mitigationChecklist: ['Run auth tests', 'Review migration'] };

  test('renders Mitigation Checklist section', () => {
    expect(buildChangeRiskHtml(data)).toContain('Mitigation Checklist');
  });

  test('renders first checklist item', () => {
    expect(buildChangeRiskHtml(data)).toContain('Run auth tests');
  });

  test('renders second checklist item', () => {
    expect(buildChangeRiskHtml(data)).toContain('Review migration');
  });

  test('omits Mitigation Checklist when array is empty', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium', mitigationChecklist: [] })).not.toContain('Mitigation Checklist');
  });

  test('escapes XSS in checklist item', () => {
    const d = { changeRiskLevel: 'high', mitigationChecklist: ['<img onerror=alert(1)>'] };
    expect(buildChangeRiskHtml(d)).not.toContain('<img');
  });
});

describe('buildChangeRiskHtml — release guidance', () => {
  test('renders Release Guidance with requiresStaging flag', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { requiresStaging: true } };
    const html = buildChangeRiskHtml(data);
    expect(html).toContain('Release Guidance');
    expect(html).toContain('Requires staging');
  });

  test('renders canFastTrack flag', () => {
    const data = { changeRiskLevel: 'low', releaseGuidance: { canFastTrack: true } };
    expect(buildChangeRiskHtml(data)).toContain('Can fast-track');
  });

  test('renders requiresRollbackPlan flag', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { requiresRollbackPlan: true } };
    expect(buildChangeRiskHtml(data)).toContain('Requires rollback plan');
  });

  test('renders requiresSecurityReview flag', () => {
    const data = { changeRiskLevel: 'critical', releaseGuidance: { requiresSecurityReview: true } };
    expect(buildChangeRiskHtml(data)).toContain('Requires security review');
  });

  test('renders requiresMigrationPlan flag', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { requiresMigrationPlan: true } };
    expect(buildChangeRiskHtml(data)).toContain('Requires migration plan');
  });

  test('renders requiresArchitectureReview flag', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { requiresArchitectureReview: true } };
    expect(buildChangeRiskHtml(data)).toContain('Requires architecture review');
  });

  test('omits Release Guidance when all flags are false and no guidance strings', () => {
    const data = { changeRiskLevel: 'low', releaseGuidance: { canFastTrack: false, requiresStaging: false } };
    expect(buildChangeRiskHtml(data)).not.toContain('Release Guidance');
  });

  test('omits Release Guidance when absent', () => {
    expect(buildChangeRiskHtml({ changeRiskLevel: 'medium' })).not.toContain('Release Guidance');
  });

  test('renders recommendation string when present', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { recommendation: 'Deploy off-peak.' } };
    expect(buildChangeRiskHtml(data)).toContain('Deploy off-peak.');
  });

  test('renders deploymentGuidance string when present', () => {
    const data = { changeRiskLevel: 'high', releaseGuidance: { deploymentGuidance: 'Use blue-green.' } };
    expect(buildChangeRiskHtml(data)).toContain('Use blue-green.');
  });

  test('renders monitoringGuidance string when present', () => {
    const data = { changeRiskLevel: 'medium', releaseGuidance: { monitoringGuidance: 'Watch error rate.' } };
    expect(buildChangeRiskHtml(data)).toContain('Watch error rate.');
  });

  test('multiple active flags all rendered', () => {
    const data = {
      changeRiskLevel: 'critical',
      releaseGuidance: { requiresStaging: true, requiresSecurityReview: true, requiresRollbackPlan: true },
    };
    const html = buildChangeRiskHtml(data);
    expect(html).toContain('Requires staging');
    expect(html).toContain('Requires security review');
    expect(html).toContain('Requires rollback plan');
  });
});
