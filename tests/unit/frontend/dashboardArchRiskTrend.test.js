'use strict';

// Pure-logic unit tests for buildArchitectureRiskTrendHtml.
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

// ── buildArchitectureRiskTrendHtml (copied verbatim from dashboard.html) ─────
function buildArchitectureRiskTrendHtml(fcData, archData) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
             + 'Architecture risk trend is unavailable until multiple architecture snapshots exist.</p>';

  var hasFc    = !!(fcData && (fcData.forecastLevel || fcData.scoreTrend));
  var hasArch  = !!(archData && (archData.architectureHealthLevel || archData.architectureHealthScore != null));
  if (!hasFc && !hasArch) return UNAVAIL;

  var st = fcData ? fcData.scoreTrend : null;
  var trendLabel, trendCls;
  if      (st === 'volatile')  { trendLabel = 'Volatile';      trendCls = 'severity-medium';  }
  else if (st === 'degrading') { trendLabel = 'Deteriorating'; trendCls = 'severity-high';    }
  else if (st === 'improving') { trendLabel = 'Improving';     trendCls = 'severity-healthy'; }
  else if (st === 'stable')    { trendLabel = 'Stable';        trendCls = 'severity-neutral'; }
  else                         { trendLabel = 'Unknown';       trendCls = 'severity-unknown'; }

  var fl    = (fcData && fcData.forecastLevel && fcData.forecastLevel !== 'unknown') ? fcData.forecastLevel : null;
  var flCls = fl === 'critical' ? 'severity-critical'
            : fl === 'high'     ? 'severity-high'
            : fl === 'medium' || fl === 'watch' ? 'severity-medium'
            : fl === 'low' || fl === 'none' || fl === 'stable' ? 'severity-healthy'
            : 'severity-unknown';
  var flLabel = fl ? fl.toUpperCase() : 'UNKNOWN';

  var cl    = (fcData && fcData.confidenceLevel) || 'low';
  var clCls = cl === 'high' ? 'conf-high' : cl === 'medium' ? 'conf-medium' : 'conf-low';

  var projScore    = fcData ? fcData.projectedScore    : null;
  var intervention = fcData ? (fcData.interventionUrgency || null) : null;
  var summaryText;

  if (st) {
    var sParts = 'Architecture risk trend is ' + trendLabel.toLowerCase();
    if (projScore != null) sParts += '; projected score is ' + projScore;
    if (intervention && intervention !== 'none') sParts += ' and intervention urgency is ' + intervention;
    summaryText = sParts + '.';
  } else if (fl) {
    summaryText = 'Architecture forecast indicates ' + fl + ' risk.';
  } else if (hasArch) {
    var hl = archData.architectureHealthLevel || 'unknown';
    summaryText = 'Architecture health is currently ' + hl + '; no forecast trend data available.';
  } else {
    summaryText = 'Architecture risk trend is unavailable until multiple architecture snapshots exist.';
  }

  var rfs  = fcData && Array.isArray(fcData.riskFactors)    ? fcData.riskFactors    : [];
  var recs = fcData && Array.isArray(fcData.recommendations) ? fcData.recommendations : [];

  var html = '<div class="rms-trend-panel">';

  html += '<div class="rms-trend-header">'
        + '<span class="pf-badge ' + esc(trendCls) + '">' + esc(trendLabel.toUpperCase()) + '</span>'
        + '<span class="pf-badge ' + esc(flCls) + '" style="font-size:0.67rem;">Risk: ' + esc(flLabel) + '</span>'
        + '<span class="confidence-badge ' + esc(clCls) + '">'
        +   esc(cl.toUpperCase() + ' CONFIDENCE')
        + '</span>'
        + '</div>';

  html += '<p style="font-size:0.75rem;color:var(--text-secondary);margin:4px 0 8px;">'
        + esc(summaryText) + '</p>';

  html += '<div class="rms-sublabel">Architecture Trend Drivers</div>';
  if (rfs.length === 0) {
    html += '<p style="font-size:0.75rem;color:var(--text-muted);margin:2px 0 6px;">'
          + 'No architecture trend drivers detected.</p>';
  } else {
    rfs.slice(0, 5).forEach(function(rf) {
      var rfText = typeof rf === 'string' ? rf : (rf.summary || rf.type || String(rf));
      var rfSev  = typeof rf === 'object' && rf.severity ? rf.severity : null;
      html += '<div class="rms-gap-row">';
      if (rfSev) {
        html += '<span class="pf-badge severity-' + esc(rfSev) + '" style="font-size:0.60rem;">'
              + esc(rfSev.toUpperCase()) + '</span> ';
      }
      html += '<span>' + esc(rfText) + '</span></div>';
    });
  }

  html += '<div class="rms-sublabel" style="margin-top:10px;">Architecture Trend Actions</div>';
  if (recs.length === 0) {
    html += '<p style="font-size:0.75rem;color:var(--text-muted);margin:2px 0 6px;">'
          + 'No trend-specific architecture actions recommended.</p>';
  } else {
    recs.slice(0, 5).forEach(function(r) {
      var recText = typeof r === 'string' ? r : (r.text || r.recommendation || String(r));
      html += '<div class="rms-gap-row"><span>' + esc(recText) + '</span></div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stableFc(overrides) {
  return Object.assign({
    forecastLevel:       'low',
    scoreTrend:          'stable',
    projectedScore:      72,
    projectedLevel:      'healthy',
    interventionUrgency: 'none',
    confidenceLevel:     'high',
    riskFactors:         [],
    recommendations:     [],
  }, overrides);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildArchitectureRiskTrendHtml — stable forecast trend', () => {
  const fc = stableFc();
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders STABLE badge', () => {
    expect(html).toContain('STABLE');
  });

  test('uses severity-neutral class for stable trend', () => {
    expect(html).toContain('severity-neutral');
  });

  test('summary sentence mentions stable', () => {
    expect(html).toContain('Architecture risk trend is stable');
  });

  test('summary includes projected score when present', () => {
    expect(html).toContain('projected score is 72');
  });

  test('does not mention intervention urgency when urgency is none', () => {
    expect(html).not.toContain('intervention urgency');
  });

  test('renders rms-trend-panel wrapper', () => {
    expect(html).toContain('rms-trend-panel');
  });

  test('renders Architecture Trend Drivers section', () => {
    expect(html).toContain('Architecture Trend Drivers');
  });

  test('renders Architecture Trend Actions section', () => {
    expect(html).toContain('Architecture Trend Actions');
  });

  test('shows no-drivers message when riskFactors empty', () => {
    expect(html).toContain('No architecture trend drivers detected.');
  });

  test('shows no-actions message when recommendations empty', () => {
    expect(html).toContain('No trend-specific architecture actions recommended.');
  });

  test('forecast risk badge shows LOW', () => {
    expect(html).toContain('LOW');
    expect(html).toContain('severity-healthy');
  });

  test('confidence badge shows HIGH CONFIDENCE', () => {
    expect(html).toContain('HIGH CONFIDENCE');
  });
});

describe('buildArchitectureRiskTrendHtml — volatile forecast trend', () => {
  const fc = stableFc({
    scoreTrend:          'volatile',
    forecastLevel:       'medium',
    projectedScore:      22,
    interventionUrgency: 'monitor',
    confidenceLevel:     'medium',
    riskFactors:         ['Irregular commit patterns', 'Inconsistent module boundaries'],
    recommendations:     ['Stabilise commit cadence', 'Review boundary contracts'],
  });
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders VOLATILE badge', () => {
    expect(html).toContain('VOLATILE');
  });

  test('uses severity-medium class for volatile trend', () => {
    expect(html).toContain('severity-medium');
  });

  test('summary sentence mentions volatile', () => {
    expect(html).toContain('Architecture risk trend is volatile');
  });

  test('summary includes projected score 22', () => {
    expect(html).toContain('projected score is 22');
  });

  test('summary includes intervention urgency monitor', () => {
    expect(html).toContain('intervention urgency is monitor');
  });

  test('renders risk factors', () => {
    expect(html).toContain('Irregular commit patterns');
    expect(html).toContain('Inconsistent module boundaries');
  });

  test('renders recommendations', () => {
    expect(html).toContain('Stabilise commit cadence');
    expect(html).toContain('Review boundary contracts');
  });

  test('confidence badge shows MEDIUM CONFIDENCE', () => {
    expect(html).toContain('MEDIUM CONFIDENCE');
  });
});

describe('buildArchitectureRiskTrendHtml — degrading (deteriorating) forecast trend', () => {
  const fc = stableFc({
    scoreTrend:          'degrading',
    forecastLevel:       'high',
    projectedScore:      38,
    interventionUrgency: 'urgent',
    confidenceLevel:     'high',
    riskFactors:         ['High coupling between modules'],
    recommendations:     ['Decouple payment service'],
  });
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders DETERIORATING badge (degrading maps to Deteriorating)', () => {
    expect(html).toContain('DETERIORATING');
  });

  test('uses severity-high class for degrading trend', () => {
    // severity-high appears for both the trend badge and the HIGH forecast badge
    expect(html).toContain('severity-high');
  });

  test('summary mentions deteriorating', () => {
    expect(html).toContain('Architecture risk trend is deteriorating');
  });

  test('summary includes projected score 38', () => {
    expect(html).toContain('projected score is 38');
  });

  test('summary includes intervention urgency urgent', () => {
    expect(html).toContain('intervention urgency is urgent');
  });

  test('forecast risk badge class is severity-high for forecastLevel high', () => {
    expect(html).toContain('severity-high');
  });

  test('risk factor renders correctly', () => {
    expect(html).toContain('High coupling between modules');
  });

  test('recommendation renders correctly', () => {
    expect(html).toContain('Decouple payment service');
  });
});

describe('buildArchitectureRiskTrendHtml — improving forecast trend', () => {
  const fc = stableFc({
    scoreTrend:          'improving',
    forecastLevel:       'low',
    projectedScore:      80,
    interventionUrgency: 'none',
    confidenceLevel:     'high',
  });
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders IMPROVING badge', () => {
    expect(html).toContain('IMPROVING');
  });

  test('uses severity-healthy class for improving trend', () => {
    expect(html).toContain('severity-healthy');
  });

  test('summary mentions improving', () => {
    expect(html).toContain('Architecture risk trend is improving');
  });
});

describe('buildArchitectureRiskTrendHtml — missing forecast fallback', () => {
  test('returns unavailable message when both fcData and archData are null', () => {
    const html = buildArchitectureRiskTrendHtml(null, null);
    expect(html).toContain('Architecture risk trend is unavailable until multiple architecture snapshots exist.');
  });

  test('returns unavailable message when fcData is empty object and archData is null', () => {
    const html = buildArchitectureRiskTrendHtml({}, null);
    expect(html).toContain('Architecture risk trend is unavailable until multiple architecture snapshots exist.');
  });

  test('falls back to archData health level when fcData has no scoreTrend or forecastLevel', () => {
    const archData = { architectureHealthLevel: 'watch', architectureHealthScore: 48 };
    const html = buildArchitectureRiskTrendHtml(null, archData);
    expect(html).toContain('Architecture health is currently watch');
  });

  test('fallback panel renders rms-trend-panel when archData present', () => {
    const archData = { architectureHealthLevel: 'risky' };
    const html = buildArchitectureRiskTrendHtml(null, archData);
    expect(html).toContain('rms-trend-panel');
  });

  test('Unknown trend badge shown when no scoreTrend and only archData present', () => {
    const archData = { architectureHealthLevel: 'weak' };
    const html = buildArchitectureRiskTrendHtml(null, archData);
    expect(html).toContain('UNKNOWN');
  });

  test('forecastLevel-only fcData (no scoreTrend) renders forecast-indicates summary', () => {
    const fc = { forecastLevel: 'high' };
    const html = buildArchitectureRiskTrendHtml(fc, null);
    expect(html).toContain('Architecture forecast indicates high risk.');
  });
});

describe('buildArchitectureRiskTrendHtml — risk factors cap at 5', () => {
  const sixFactors = ['A', 'B', 'C', 'D', 'E', 'F'];
  const fc = stableFc({ riskFactors: sixFactors });
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders exactly 5 risk factors (not 6)', () => {
    expect(html).toContain('>A<');
    expect(html).toContain('>B<');
    expect(html).toContain('>C<');
    expect(html).toContain('>D<');
    expect(html).toContain('>E<');
    expect(html).not.toContain('>F<');
  });

  test('sixth risk factor is omitted', () => {
    // Count rms-gap-row occurrences as proxy for rendered items
    const matches = html.match(/class="rms-gap-row"/g) || [];
    expect(matches.length).toBe(5);
  });
});

describe('buildArchitectureRiskTrendHtml — recommendations cap at 5', () => {
  const sixRecs = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6'];
  const fc = stableFc({ recommendations: sixRecs });
  const html = buildArchitectureRiskTrendHtml(fc, null);

  test('renders exactly 5 recommendations (not 6)', () => {
    expect(html).toContain('>R1<');
    expect(html).toContain('>R2<');
    expect(html).toContain('>R3<');
    expect(html).toContain('>R4<');
    expect(html).toContain('>R5<');
    expect(html).not.toContain('>R6<');
  });

  test('sixth recommendation is omitted', () => {
    const matches = html.match(/class="rms-gap-row"/g) || [];
    expect(matches.length).toBe(5);
  });
});

describe('buildArchitectureRiskTrendHtml — no operational maturity language', () => {
  const scenarios = [
    ['stable',    buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'stable' }), null)],
    ['volatile',  buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'volatile' }), null)],
    ['degrading', buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'degrading' }), null)],
    ['missing',   buildArchitectureRiskTrendHtml(null, { architectureHealthLevel: 'watch' })],
  ];

  scenarios.forEach(function([label, html]) {
    test(label + ': does not contain "Repository maturity"', () => {
      expect(html).not.toContain('Repository maturity');
    });

    test(label + ': does not contain "maturity trend" (operational)', () => {
      // The architecture version says "Architecture risk trend" — reject bare "maturity trend"
      expect(html.toLowerCase()).not.toContain('maturity trend');
    });
  });
});

describe('buildArchitectureRiskTrendHtml — no CI/CD or release/bus-factor recurring gaps', () => {
  const withGapishFactors = stableFc({
    scoreTrend:  'volatile',
    riskFactors: ['Irregular commit patterns'],
    recommendations: ['Review release cadence'],
  });

  const allScenarios = [
    buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'stable' }), null),
    buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'volatile' }), null),
    buildArchitectureRiskTrendHtml(stableFc({ scoreTrend: 'degrading' }), null),
    buildArchitectureRiskTrendHtml(null, { architectureHealthLevel: 'watch' }),
    buildArchitectureRiskTrendHtml(withGapishFactors, null),
  ];

  allScenarios.forEach(function(html, i) {
    test('scenario ' + i + ': no "Recurring Gaps" section header', () => {
      expect(html).not.toContain('Recurring Gaps');
    });

    test('scenario ' + i + ': no recurring gap badge element', () => {
      expect(html).not.toContain('gap-recurring');
    });

    test('scenario ' + i + ': no bus-factor recurring gap text', () => {
      expect(html).not.toContain('bus-factor risk');
    });

    test('scenario ' + i + ': no "Stale release cadence" recurring gap text', () => {
      expect(html).not.toContain('Stale release cadence');
    });

    test('scenario ' + i + ': no CI/CD recurring gap text', () => {
      expect(html).not.toContain('Recurring CI');
    });

    test('scenario ' + i + ': no maturity sparkline SVG', () => {
      expect(html).not.toContain('mspkGrad');
    });
  });
});

describe('buildArchitectureRiskTrendHtml — forecast risk badge colour mapping', () => {
  test('forecastLevel critical → severity-critical badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'critical' }), null);
    expect(html).toContain('severity-critical');
  });

  test('forecastLevel high → severity-high badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'high' }), null);
    expect(html).toContain('severity-high');
  });

  test('forecastLevel medium → severity-medium badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'medium', scoreTrend: 'stable' }), null);
    expect(html).toContain('severity-medium');
  });

  test('forecastLevel low → severity-healthy badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'low' }), null);
    expect(html).toContain('severity-healthy');
  });

  test('forecastLevel none → severity-healthy badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'none' }), null);
    expect(html).toContain('severity-healthy');
  });

  test('forecastLevel unknown → severity-unknown badge', () => {
    const html = buildArchitectureRiskTrendHtml(stableFc({ forecastLevel: 'unknown', scoreTrend: 'stable' }), null);
    expect(html).toContain('severity-unknown');
  });
});

describe('buildArchitectureRiskTrendHtml — object-shaped risk factors and recommendations', () => {
  test('risk factor with severity field renders severity badge', () => {
    const fc = stableFc({
      riskFactors: [{ summary: 'High coupling', severity: 'high' }],
    });
    const html = buildArchitectureRiskTrendHtml(fc, null);
    expect(html).toContain('High coupling');
    expect(html).toContain('severity-high');
  });

  test('recommendation as object with text field renders text', () => {
    const fc = stableFc({
      recommendations: [{ text: 'Introduce interface layer' }],
    });
    const html = buildArchitectureRiskTrendHtml(fc, null);
    expect(html).toContain('Introduce interface layer');
  });
});
