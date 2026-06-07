'use strict';

// Pure-logic unit tests for the Forecast tab architecture migration.
// All four builder functions are copied verbatim from dashboard.html.
// Jest node env — no DOM or browser required.

// ── Minimal esc stub ─────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── buildArchForecastSummaryHtml (copied verbatim from dashboard.html) ────────
function buildArchForecastSummaryHtml(fc) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
             + 'Architecture forecast unavailable until multiple architecture snapshots exist.</p>';
  if (!fc || !fc.forecastLevel || fc.forecastLevel === 'unknown') return UNAVAIL;

  var fl    = fc.forecastLevel;
  var flSev = fl === 'critical'                  ? 'critical'
            : fl === 'high'                      ? 'high'
            : fl === 'medium' || fl === 'watch'  ? 'medium'
            : fl === 'low' || fl === 'none' || fl === 'stable' ? 'healthy'
            : 'unknown';

  var html = '<div class="forecast-panel">';
  html += '<div class="forecast-badges">';
  html += '<span class="forecast-badge severity-' + esc(flSev) + '">'
        + esc(fl.toUpperCase() + ' FORECAST') + '</span>';

  if (fc.interventionUrgency && fc.interventionUrgency !== 'none') {
    html += '<span class="forecast-badge severity-medium">'
          + esc(fc.interventionUrgency.toUpperCase() + ' URGENCY') + '</span>';
  }
  html += '</div>';

  if (fc.summary) {
    html += '<div class="forecast-narrative">' + esc(fc.summary) + '</div>';
  }

  if (typeof fc.degradationRisk === 'number') {
    html += '<div class="forecast-confidence">Degradation risk: '
          + esc(String(fc.degradationRisk)) + '%</div>';
  }

  html += '</div>';
  return html;
}

// ── buildArchTrajectoryHtml (copied verbatim from dashboard.html) ─────────────
function buildArchTrajectoryHtml(fc) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
             + 'Not enough architecture history to determine architecture direction.</p>';
  if (!fc || !fc.scoreTrend) return UNAVAIL;

  var st = fc.scoreTrend;
  var trendLabel = st === 'volatile'  ? 'Volatile'      :
                   st === 'degrading' ? 'Deteriorating'  :
                   st === 'improving' ? 'Improving'      :
                   st === 'stable'    ? 'Stable'         : 'Unknown';
  var trendSev   = st === 'volatile'  ? 'medium'  :
                   st === 'degrading' ? 'high'    :
                   st === 'improving' ? 'healthy' :
                   st === 'stable'    ? 'neutral' : 'unknown';

  var html = '<div class="stability-panel">';

  // Row 1: direction trend badge + urgency badge
  html += '<div class="stability-badges">';
  html += '<span class="stability-badge severity-' + esc(trendSev) + '">'
        + esc(trendLabel.toUpperCase()) + '</span>';

  if (fc.interventionUrgency && fc.interventionUrgency !== 'none') {
    var uSev = fc.interventionUrgency === 'immediate' ? 'critical'
             : fc.interventionUrgency === 'urgent'    ? 'high'
             : fc.interventionUrgency === 'soon'      ? 'medium' : 'low';
    html += '<span class="stability-badge severity-' + esc(uSev) + '">'
          + esc(fc.interventionUrgency.toUpperCase()) + ' URGENCY</span>';
  }
  html += '</div>';

  // Row 2: projected score + projected level as primary metric tiles
  var hasScore = fc.projectedScore != null;
  var hasLevel = !!fc.projectedLevel;
  if (hasScore || hasLevel) {
    html += '<div class="arch-metric-grid" style="margin-top:8px;">';
    if (hasScore) {
      html += '<div class="arch-metric">'
            + '<div class="arch-metric-val">' + esc(String(fc.projectedScore)) + '</div>'
            + '<div class="arch-metric-lbl">Projected Score</div>'
            + '</div>';
    }
    if (hasLevel) {
      var pSev = fc.projectedLevel === 'risky'   ? 'severity-critical'
               : fc.projectedLevel === 'weak'    ? 'severity-high'
               : fc.projectedLevel === 'watch'   ? 'severity-medium'
               : fc.projectedLevel === 'healthy' ? 'severity-healthy' : 'severity-unknown';
      html += '<div class="arch-metric">'
            + '<div class="arch-metric-val ' + esc(pSev) + '">'
            + esc(fc.projectedLevel.toUpperCase()) + '</div>'
            + '<div class="arch-metric-lbl">Projected Level</div>'
            + '</div>';
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── buildArchConfidenceHtml (copied verbatim from dashboard.html) ─────────────
function buildArchConfidenceHtml(fc) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
             + 'Confidence data unavailable until multiple architecture snapshots exist.</p>';
  if (!fc) return UNAVAIL;

  var cl = fc.confidenceLevel && fc.confidenceLevel !== 'unknown' ? fc.confidenceLevel : 'low';
  var badgeTxt = cl === 'high'   ? 'HIGH CONFIDENCE'
               : cl === 'medium' ? 'MEDIUM CONFIDENCE'
               :                   'LOW CONFIDENCE';
  var badgeCls = 'confidence-badge conf-' + esc(cl);

  var html = '<div class="confidence-panel">';
  html += '<div class="confidence-header">';
  html += '<span class="' + badgeCls + '">' + esc(badgeTxt) + '</span>';

  if (typeof fc.snapshotCount === 'number') {
    html += '<span class="confidence-score">'
          + esc(String(fc.snapshotCount)) + ' snapshot'
          + (fc.snapshotCount !== 1 ? 's' : '') + '</span>';
  }
  html += '</div>';

  var summary = cl === 'high'   ? 'High confidence in architecture forecast based on sufficient snapshot history.'
              : cl === 'medium' ? 'Forecast confidence is moderate. Additional snapshots will improve accuracy.'
              :                   'Additional architecture snapshots are needed to increase forecast confidence.';
  html += '<div class="confidence-summary">' + esc(summary) + '</div>';

  html += '</div>';
  return html;
}

// ── buildArchVolatilityHtml (copied verbatim from dashboard.html) ─────────────
function buildArchVolatilityHtml(fc) {
  var UNAVAIL = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
             + 'No architecture risk driver data available.</p>';
  if (!fc) return UNAVAIL;

  var risk = typeof fc.degradationRisk === 'number' ? fc.degradationRisk : null;
  var rfs  = Array.isArray(fc.riskFactors) ? fc.riskFactors : [];
  var level = risk === null  ? 'low'
            : risk >= 70    ? 'critical'
            : risk >= 40    ? 'high'
            : risk >= 20    ? 'medium'
            :                 'low';

  var levelCls = level === 'low'      ? 'severity-neutral'
               : level === 'medium'   ? 'severity-medium'
               : level === 'high'     ? 'severity-high'
               :                        'severity-critical';
  var cl      = fc.confidenceLevel && fc.confidenceLevel !== 'unknown' ? fc.confidenceLevel : 'low';
  var clCls   = 'confidence-badge conf-' + esc(cl);

  var badge     = '<span class="ev-badge ' + levelCls + '">'
                + level.charAt(0).toUpperCase() + level.slice(1) + '</span>';
  var confBadge = '<span class="' + clCls + '">' + esc(cl) + ' confidence</span>';
  var scoreTxt  = risk !== null
                ? '<span class="ev-score">Degradation risk: ' + esc(String(risk)) + '%</span>'
                : '';

  var body;
  if (rfs.length === 0 || level === 'low') {
    body = '<p class="ev-stable">No significant architecture risk drivers detected.</p>';
  } else {
    body = '<ul class="ev-reasons">'
         + rfs.slice(0, 3).map(function(rf) {
             var t = typeof rf === 'string' ? rf : (rf.summary || rf.type || String(rf));
             return '<li>' + esc(t) + '</li>';
           }).join('')
         + '</ul>';
  }

  return '<div class="ev-panel">'
       + '<div class="ev-meta">' + badge + confBadge + scoreTxt + '</div>'
       + body
       + '</div>';
}

// ── Static Forecast tab template (mirrors the selectRepo template string) ─────
const FORECAST_TAB_HTML = [
  '<div class="repo-tab-panel" data-panel="forecast">',
  '<div class="repo-detail-label section-primary" style="margin-top:8px;">Architecture Forecast</div>',
  '<div id="repo-forecast-content"></div>',
  '<div class="repo-detail-label section-secondary" style="margin-top:16px;">Architecture Direction</div>',
  '<div id="repo-stability-content"></div>',
  '<div class="repo-detail-label section-secondary" style="margin-top:16px;">Forecast Confidence</div>',
  '<div id="repo-confidence-content"></div>',
  '<div class="repo-detail-label section-secondary" style="margin-top:16px;">Architecture Risk Drivers</div>',
  '<div id="repo-ev-content"></div>',
  '</div>',
].join('');

// ── Static Architecture tab template (mirrors the selectRepo template string) ──
const ARCH_TAB_HTML = [
  '<div class="repo-tab-panel" data-panel="architecture">',
  '<div class="repo-detail-label section-primary" style="margin-top:8px;">Architecture Intelligence</div>',
  '<div id="repo-architecture-content"><p style="font-size:0.82rem;color:var(--text-muted);">Loading…</p></div>',
  '</div>',
].join('');

// ── Helpers ───────────────────────────────────────────────────────────────────

function fullFc(overrides) {
  return Object.assign({
    forecastLevel:       'high',
    degradationRisk:     55,
    confidenceLevel:     'medium',
    snapshotCount:       8,
    scoreTrend:          'degrading',
    projectedScore:      38,
    projectedLevel:      'weak',
    interventionUrgency: 'urgent',
    riskFactors:         ['High coupling', 'Missing boundary contracts'],
    recommendations:     ['Decouple payment module'],
    summary:             'Architecture is deteriorating due to coupling growth.',
  }, overrides);
}

// ── Forecast tab template: required labels present ────────────────────────────

describe('Forecast tab template — architecture labels present', () => {
  test('contains "Architecture Forecast" label', () => {
    expect(FORECAST_TAB_HTML).toContain('Architecture Forecast');
  });

  test('contains "Architecture Direction" label', () => {
    expect(FORECAST_TAB_HTML).toContain('Architecture Direction');
  });

  test('contains "Forecast Confidence" label', () => {
    expect(FORECAST_TAB_HTML).toContain('Forecast Confidence');
  });

  test('contains "Architecture Risk Drivers" label', () => {
    expect(FORECAST_TAB_HTML).toContain('Architecture Risk Drivers');
  });
});

// ── Architecture tab template: no duplicate Forecast panel ───────────────────

describe('Architecture tab template — starts with Architecture Intelligence', () => {
  test('contains "Architecture Intelligence" as primary label', () => {
    expect(ARCH_TAB_HTML).toContain('Architecture Intelligence');
    expect(ARCH_TAB_HTML).toContain('section-primary');
  });

  test('contains repo-architecture-content div', () => {
    expect(ARCH_TAB_HTML).toContain('id="repo-architecture-content"');
  });
});

describe('Architecture tab template — Architecture Forecast panel removed', () => {
  test('does not contain "Architecture Forecast" label', () => {
    expect(ARCH_TAB_HTML).not.toContain('Architecture Forecast');
  });

  test('does not contain repo-arch-forecast-content div', () => {
    expect(ARCH_TAB_HTML).not.toContain('repo-arch-forecast-content');
  });

  test('does not contain "Loading architecture forecast" placeholder', () => {
    expect(ARCH_TAB_HTML).not.toContain('Loading architecture forecast');
  });
});

// ── Forecast tab template: renamed labels absent ──────────────────────────────

describe('Forecast tab template — renamed labels absent', () => {
  test('does not contain "Architecture Trajectory"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Architecture Trajectory');
  });

  test('does not contain "Architecture Volatility"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Architecture Volatility');
  });
});

// ── Forecast tab template: operational labels absent ─────────────────────────

describe('Forecast tab template — operational labels absent', () => {
  test('does not contain "Operational Forecast"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Operational Forecast');
  });

  test('does not contain "Operational Stability"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Operational Stability');
  });

  test('does not contain "Operational Confidence"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Operational Confidence');
  });

  test('does not contain "Engineering Volatility"', () => {
    expect(FORECAST_TAB_HTML).not.toContain('Engineering Volatility');
  });
});

// ── buildArchForecastSummaryHtml ──────────────────────────────────────────────

describe('buildArchForecastSummaryHtml — forecast data renders correctly', () => {
  test('high forecastLevel produces severity-high badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ forecastLevel: 'high' }));
    expect(html).toContain('severity-high');
    expect(html).toContain('HIGH FORECAST');
  });

  test('critical forecastLevel produces severity-critical badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ forecastLevel: 'critical' }));
    expect(html).toContain('severity-critical');
    expect(html).toContain('CRITICAL FORECAST');
  });

  test('low forecastLevel produces severity-healthy badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ forecastLevel: 'low' }));
    expect(html).toContain('severity-healthy');
    expect(html).toContain('LOW FORECAST');
  });

  test('medium forecastLevel produces severity-medium badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ forecastLevel: 'medium' }));
    expect(html).toContain('severity-medium');
  });

  test('interventionUrgency !== none renders urgency badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ interventionUrgency: 'urgent' }));
    expect(html).toContain('URGENT URGENCY');
  });

  test('interventionUrgency none does not render urgency badge', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ interventionUrgency: 'none' }));
    expect(html).not.toContain('URGENCY');
  });

  test('summary text appears in narrative', () => {
    const html = buildArchForecastSummaryHtml(fullFc());
    expect(html).toContain('Architecture is deteriorating due to coupling growth.');
  });

  test('degradationRisk appears as percentage', () => {
    const html = buildArchForecastSummaryHtml(fullFc({ degradationRisk: 55 }));
    expect(html).toContain('Degradation risk: 55%');
  });
});

describe('buildArchForecastSummaryHtml — fallback states', () => {
  test('null fc returns unavailable message', () => {
    const html = buildArchForecastSummaryHtml(null);
    expect(html).toContain('Architecture forecast unavailable until multiple architecture snapshots exist.');
  });

  test('empty object returns unavailable message', () => {
    const html = buildArchForecastSummaryHtml({});
    expect(html).toContain('Architecture forecast unavailable');
  });

  test('forecastLevel unknown returns unavailable message', () => {
    const html = buildArchForecastSummaryHtml({ forecastLevel: 'unknown' });
    expect(html).toContain('Architecture forecast unavailable');
  });

  test('no operational wording in fallback', () => {
    const html = buildArchForecastSummaryHtml(null);
    expect(html.toLowerCase()).not.toContain('operational');
    expect(html.toLowerCase()).not.toContain('telemetry');
  });
});

// ── buildArchTrajectoryHtml (Architecture Direction) ──────────────────────────

describe('buildArchTrajectoryHtml — direction badge (scoreTrend)', () => {
  test('degrading → DETERIORATING badge with severity-high', () => {
    const html = buildArchTrajectoryHtml(fullFc({ scoreTrend: 'degrading' }));
    expect(html).toContain('DETERIORATING');
    expect(html).toContain('stability-badge');
    expect(html).toContain('severity-high');
  });

  test('volatile → VOLATILE badge with severity-medium', () => {
    const html = buildArchTrajectoryHtml(fullFc({ scoreTrend: 'volatile' }));
    expect(html).toContain('VOLATILE');
    expect(html).toContain('severity-medium');
  });

  test('improving → IMPROVING badge with severity-healthy', () => {
    const html = buildArchTrajectoryHtml(fullFc({ scoreTrend: 'improving' }));
    expect(html).toContain('IMPROVING');
    expect(html).toContain('severity-healthy');
  });

  test('stable → STABLE badge with severity-neutral', () => {
    const html = buildArchTrajectoryHtml(fullFc({ scoreTrend: 'stable' }));
    expect(html).toContain('STABLE');
    expect(html).toContain('severity-neutral');
  });
});

describe('buildArchTrajectoryHtml — urgency badge (primary metric)', () => {
  test('interventionUrgency "urgent" renders as badge with severity-high', () => {
    const html = buildArchTrajectoryHtml(fullFc({ interventionUrgency: 'urgent' }));
    expect(html).toContain('URGENT URGENCY');
    expect(html).toContain('stability-badge');
  });

  test('interventionUrgency "immediate" renders badge with severity-critical', () => {
    const html = buildArchTrajectoryHtml(fullFc({ interventionUrgency: 'immediate' }));
    expect(html).toContain('IMMEDIATE URGENCY');
    expect(html).toContain('severity-critical');
  });

  test('interventionUrgency "soon" renders badge with severity-medium', () => {
    const html = buildArchTrajectoryHtml(fullFc({ interventionUrgency: 'soon' }));
    expect(html).toContain('SOON URGENCY');
    expect(html).toContain('severity-medium');
  });

  test('interventionUrgency "none" does not render urgency badge', () => {
    const html = buildArchTrajectoryHtml(fullFc({ interventionUrgency: 'none' }));
    expect(html).not.toContain('URGENCY');
  });

  test('urgency is NOT rendered as a stability-signal list item', () => {
    const html = buildArchTrajectoryHtml(fullFc({ interventionUrgency: 'urgent' }));
    expect(html).not.toContain('Intervention urgency: urgent');
    expect(html).not.toContain('stability-signal');
  });
});

describe('buildArchTrajectoryHtml — projected score as primary metric', () => {
  test('projectedScore renders as arch-metric tile with label "Projected Score"', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedScore: 38 }));
    expect(html).toContain('arch-metric');
    expect(html).toContain('>38<');
    expect(html).toContain('Projected Score');
  });

  test('projectedScore is NOT rendered as a stability-signal list item', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedScore: 38 }));
    expect(html).not.toContain('Projected architecture score: 38');
    expect(html).not.toContain('stability-signal');
  });

  test('no projectedScore omits the metric tile entirely', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedScore: null }));
    expect(html).not.toContain('Projected Score');
  });
});

describe('buildArchTrajectoryHtml — projected level as separate metric', () => {
  test('projectedLevel "weak" renders as arch-metric tile with label "Projected Level"', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedLevel: 'weak' }));
    expect(html).toContain('arch-metric');
    expect(html).toContain('WEAK');
    expect(html).toContain('Projected Level');
    expect(html).toContain('severity-high');
  });

  test('projectedLevel "risky" uses severity-critical class', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedLevel: 'risky' }));
    expect(html).toContain('severity-critical');
    expect(html).toContain('RISKY');
  });

  test('projectedLevel "healthy" uses severity-healthy class', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedLevel: 'healthy' }));
    expect(html).toContain('severity-healthy');
    expect(html).toContain('HEALTHY');
  });

  test('projectedLevel NOT rendered as "Projected: WEAK" stability badge', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedLevel: 'weak' }));
    expect(html).not.toContain('Projected: WEAK');
  });

  test('no projectedLevel omits the metric tile', () => {
    const html = buildArchTrajectoryHtml(fullFc({ projectedLevel: null }));
    expect(html).not.toContain('Projected Level');
  });
});

describe('buildArchTrajectoryHtml — fallback states', () => {
  test('null fc returns direction-specific unavailable message', () => {
    const html = buildArchTrajectoryHtml(null);
    expect(html).toContain('Not enough architecture history to determine architecture direction.');
  });

  test('fallback does not say "project trajectory"', () => {
    const html = buildArchTrajectoryHtml(null);
    expect(html).not.toContain('project trajectory');
  });

  test('fc with no scoreTrend returns not-enough-history message', () => {
    const html = buildArchTrajectoryHtml({ forecastLevel: 'high' });
    expect(html).toContain('Not enough architecture history');
  });

  test('no operational wording in fallback', () => {
    const html = buildArchTrajectoryHtml(null);
    expect(html.toLowerCase()).not.toContain('operational');
    expect(html.toLowerCase()).not.toContain('escalation');
  });
});

// ── buildArchConfidenceHtml ───────────────────────────────────────────────────

describe('buildArchConfidenceHtml — confidence level renders correctly', () => {
  test('high confidenceLevel shows HIGH CONFIDENCE badge', () => {
    const html = buildArchConfidenceHtml(fullFc({ confidenceLevel: 'high' }));
    expect(html).toContain('HIGH CONFIDENCE');
    expect(html).toContain('conf-high');
  });

  test('medium confidenceLevel shows MEDIUM CONFIDENCE badge', () => {
    const html = buildArchConfidenceHtml(fullFc({ confidenceLevel: 'medium' }));
    expect(html).toContain('MEDIUM CONFIDENCE');
    expect(html).toContain('conf-medium');
  });

  test('low confidenceLevel shows LOW CONFIDENCE badge', () => {
    const html = buildArchConfidenceHtml(fullFc({ confidenceLevel: 'low' }));
    expect(html).toContain('LOW CONFIDENCE');
    expect(html).toContain('conf-low');
  });

  test('snapshotCount appears with correct plural', () => {
    const html = buildArchConfidenceHtml(fullFc({ snapshotCount: 8 }));
    expect(html).toContain('8 snapshots');
  });

  test('snapshotCount 1 appears singular', () => {
    const html = buildArchConfidenceHtml(fullFc({ snapshotCount: 1 }));
    expect(html).toContain('1 snapshot');
    expect(html).not.toContain('1 snapshots');
  });

  test('high confidence summary message correct', () => {
    const html = buildArchConfidenceHtml(fullFc({ confidenceLevel: 'high' }));
    expect(html).toContain('High confidence in architecture forecast');
  });

  test('low confidence summary message correct', () => {
    const html = buildArchConfidenceHtml(fullFc({ confidenceLevel: 'low' }));
    expect(html).toContain('Additional architecture snapshots are needed');
  });
});

describe('buildArchConfidenceHtml — fallback states', () => {
  test('null fc returns unavailable message', () => {
    const html = buildArchConfidenceHtml(null);
    expect(html).toContain('Confidence data unavailable until multiple architecture snapshots exist.');
  });

  test('no "operational" wording in any output', () => {
    const scenarios = [null, fullFc({ confidenceLevel: 'high' }), fullFc({ confidenceLevel: 'low' })];
    scenarios.forEach(function(fc) {
      expect(buildArchConfidenceHtml(fc).toLowerCase()).not.toContain('operational');
    });
  });
});

// ── buildArchVolatilityHtml (Architecture Risk Drivers) ───────────────────────

describe('buildArchVolatilityHtml — degradation risk level mapping', () => {
  test('degradationRisk >= 70 → critical level badge', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 75 }));
    expect(html).toContain('severity-critical');
    expect(html).toContain('Critical');
  });

  test('degradationRisk >= 40 and < 70 → high level badge', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 55 }));
    expect(html).toContain('severity-high');
    expect(html).toContain('High');
  });

  test('degradationRisk >= 20 and < 40 → medium level badge', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 25 }));
    expect(html).toContain('severity-medium');
    expect(html).toContain('Medium');
  });

  test('degradationRisk < 20 → low level, no-drivers message', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 5, riskFactors: ['some factor'] }));
    expect(html).toContain('No significant architecture risk drivers detected.');
  });

  test('degradationRisk < 20 does not show old "degradation signals" wording', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 5, riskFactors: ['some factor'] }));
    expect(html).not.toContain('degradation signals detected');
  });

  test('degradationRisk appears as percentage', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 55 }));
    expect(html).toContain('Degradation risk: 55%');
  });

  test('riskFactors render up to 3 items', () => {
    const fc = fullFc({
      degradationRisk: 50,
      riskFactors: ['Factor A', 'Factor B', 'Factor C', 'Factor D'],
    });
    const html = buildArchVolatilityHtml(fc);
    expect(html).toContain('Factor A');
    expect(html).toContain('Factor B');
    expect(html).toContain('Factor C');
    expect(html).not.toContain('Factor D');
  });

  test('empty riskFactors shows no-drivers message', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 50, riskFactors: [] }));
    expect(html).toContain('No significant architecture risk drivers detected.');
  });

  test('empty riskFactors does not show old "degradation signals" wording', () => {
    const html = buildArchVolatilityHtml(fullFc({ degradationRisk: 50, riskFactors: [] }));
    expect(html).not.toContain('degradation signals detected');
  });
});

describe('buildArchVolatilityHtml — fallback states', () => {
  test('null fc returns risk-driver-specific unavailable message', () => {
    const html = buildArchVolatilityHtml(null);
    expect(html).toContain('No architecture risk driver data available.');
  });

  test('fallback does not say "volatility data available"', () => {
    const html = buildArchVolatilityHtml(null);
    expect(html).not.toContain('volatility data available');
  });

  test('no "Engineering behavior" wording from old builder', () => {
    const html = buildArchVolatilityHtml(null);
    expect(html).not.toContain('Engineering behavior');
  });

  test('no "engineering volatility" wording in any output', () => {
    const scenarios = [null, fullFc({ degradationRisk: 0 }), fullFc({ degradationRisk: 80 })];
    scenarios.forEach(function(fc) {
      expect(buildArchVolatilityHtml(fc).toLowerCase()).not.toContain('engineering volatility');
    });
  });
});

// ── No operational wording in any builder output ──────────────────────────────

describe('All builders — no operational wording in output', () => {
  const fc = fullFc();
  const builders = [
    ['buildArchForecastSummaryHtml', buildArchForecastSummaryHtml(fc)],
    ['buildArchTrajectoryHtml',      buildArchTrajectoryHtml(fc)],
    ['buildArchConfidenceHtml',      buildArchConfidenceHtml(fc)],
    ['buildArchVolatilityHtml',      buildArchVolatilityHtml(fc)],
  ];

  builders.forEach(function([name, html]) {
    test(name + ': no "operational" wording', () => {
      expect(html.toLowerCase()).not.toContain('operational');
    });

    test(name + ': no "telemetry" wording', () => {
      expect(html.toLowerCase()).not.toContain('telemetry');
    });

    test(name + ': no "escalation" wording', () => {
      expect(html.toLowerCase()).not.toContain('escalation');
    });
  });

  test('buildArchVolatilityHtml: no "engineering volatility" wording', () => {
    expect(buildArchVolatilityHtml(fc).toLowerCase()).not.toContain('engineering volatility');
  });
});
