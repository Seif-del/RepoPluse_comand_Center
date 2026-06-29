'use strict';

// Tests for governance rendering helpers and buildPortfolioGovernanceHtml
// (verbatim copies from dashboard.html).
// Engineering Governance Refinements #1–#3 (2026-06-28):
//   Removed Executive Signals; replaced intervention banner with Portfolio
//   Governance Summary; removed driver paragraphs.
// Engineering Governance Refinement #4 (2026-06-28):
//   Merged Risks + Strengths into Key Governance Findings; grammar fix.
// Engineering Governance Refinements #5–#7 (2026-06-28):
//   Grammar fix for plural noun subjects; added _govLabel identifier mapper;
//   added _govCleanRec recommendation cleaner; top-3 cap on risks/strengths.

// ── esc stub (matches dashboard implementation) ───────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── _govLabel (copied verbatim from dashboard.html) ───────────────────────────
function _govLabel(key) {
  var map = {
    architectureGovernance:            'Architecture',
    maturityGovernance:                'Engineering Maturity',
    behavioralGovernance:              'Behavioral Governance',
    predictiveGovernance:              'Predictive Governance',
    anomalyGovernance:                 'Anomaly Governance',
    architectureRegressions:           'Architecture Regressions',
    couplingAlerts:                    'Dependency Coupling',
    portfolioMaturity:                 'Portfolio Maturity',
    portfolioForecast:                 'Portfolio Forecast',
    architectureAnomalies:             'Architecture Anomalies',
    behavioralStability:               'Behavioral Stability',
    stable_forecast:                   'Stable Forecast',
    no_anomalies:                      'No Architecture Anomalies',
    architectureGovernance_critical:   'Architecture Governance',
    architectureGovernance_weak:       'Architecture Governance',
    maturityGovernance_critical:       'Engineering Maturity',
    maturityGovernance_weak:           'Engineering Maturity',
    behavioralGovernance_critical:     'Behavioral Governance',
    behavioralGovernance_weak:         'Behavioral Governance',
    predictiveGovernance_critical:     'Predictive Governance',
    predictiveGovernance_weak:         'Predictive Governance',
    anomalyGovernance_critical:        'Anomaly Governance',
    anomalyGovernance_weak:            'Anomaly Governance',
    portfolio_forecast_critical:       'Portfolio Forecast',
    portfolio_forecast_degrading:      'Portfolio Forecast',
    architecture_anomalies_critical:   'Architecture Anomalies',
    architecture_anomalies:            'Architecture Anomalies',
    architecture_regressions_critical: 'Architecture Regressions',
    architecture_regressions:          'Architecture Regressions',
    coupling_alerts_critical:          'Dependency Coupling',
    coupling_alerts:                   'Dependency Coupling',
    low_portfolio_maturity:            'Portfolio Maturity',
    behavioral_instability:            'Behavioral Instability',
    behavioral_volatility:             'Behavioral Volatility',
  };
  return map[key] || (key ? String(key).replace(/_/g, ' ') : '');
}

// ── _govCleanRec (copied verbatim from dashboard.html) ────────────────────────
function _govCleanRec(text) {
  return text.replace(
    /^(Immediately address critical governance risks: )(.+)$/,
    function(_, prefix, typesStr) {
      var labels = typesStr.split(', ').map(function(t) { return _govLabel(t.trim()); });
      return prefix + labels.join(', ');
    }
  );
}

// ── _govSummaryHtml (copied verbatim from dashboard.html) ─────────────────────
function _govSummaryHtml(level, signals) {
  var isPositive = level === 'excellent' || level === 'strong';
  var isWatch    = level === 'watch';
  var concerns   = [];
  if (signals.lowestScoringDimension) {
    var dimMap = {
      architectureGovernance: 'architecture', maturityGovernance: 'maturity',
      behavioralGovernance: 'behavioral',     predictiveGovernance: 'predictive',
      anomalyGovernance: 'anomaly'
    };
    var dimKey   = signals.lowestScoringDimension;
    var dimLabel = dimMap[dimKey] || String(dimKey).toLowerCase().replace(/governance$/i, '').trim();
    concerns.push(dimLabel + ' gaps');
  }
  if (signals.forecastConcern) concerns.push('forecast instability');
  if (signals.anomalyConcern)  concerns.push('anomaly concerns');
  if (!concerns.length && signals.highestRiskArea) {
    concerns.push(String(signals.highestRiskArea).toLowerCase() + ' risk');
  }
  var c       = concerns.slice(0, 2);
  var reqVerb = c.length > 1
    ? 'require'
    : (c.length === 1 && /\b(gaps|concerns|anomalies|violations|regressions|issues)$/.test(c[0]))
      ? 'require'
      : 'requires';
  var sentence;
  if (isPositive) {
    sentence = c.length
      ? 'Governance is ' + level + ' overall, but ' + c.join(' and ') + ' ' + reqVerb + ' attention.'
      : 'Governance is ' + level + ' with no significant concerns.';
  } else if (isWatch) {
    sentence = c.length
      ? 'Governance health is stable, but ' + c.join(' and ') + ' ' + reqVerb + ' monitoring.'
      : 'Governance health is stable — continue monitoring for regressions.';
  } else {
    sentence = c.length
      ? 'Governance is ' + level + ' — ' + c.join(' and ') + ' ' + reqVerb + ' immediate attention.'
      : 'Governance health is ' + level + ' and requires intervention.';
  }
  var h = '<div style="margin-bottom:12px;padding:10px 12px;background:var(--bg-panel,var(--bg-card));border:1px solid var(--border);border-radius:6px;">';
  h += '<div style="font-size:0.67rem;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--text-muted);margin-bottom:6px;">Portfolio Governance Summary</div>';
  h += '<div style="font-size:0.82rem;color:var(--text-primary);">' + esc(sentence) + '</div>';
  h += '</div>';
  return h;
}

// ── buildPortfolioGovernanceHtml (copied verbatim from dashboard.html) ────────
function buildPortfolioGovernanceHtml(data) {
  var EMPTY = '<p style="font-size:0.82rem;color:var(--text-muted);font-style:italic;padding:4px 0;">'
    + 'Engineering governance unavailable until portfolio intelligence data is available.</p>';

  if (!data || typeof data !== 'object') return EMPTY;
  if (!data.governanceLevel || data.governanceLevel === 'unknown') return EMPTY;

  function _govLevelSev(level) {
    if (level === 'excellent' || level === 'strong') return 'healthy';
    if (level === 'watch')    return 'medium';
    if (level === 'weak')     return 'high';
    if (level === 'critical') return 'critical';
    return 'unknown';
  }
  function _govLevelLabel(level) {
    return { excellent: 'EXCELLENT', strong: 'STRONG', watch: 'WATCH', weak: 'WEAK', critical: 'CRITICAL' }[level]
      || 'UNKNOWN';
  }

  var score     = typeof data.governanceScore === 'number' ? data.governanceScore : 0;
  var level     = data.governanceLevel;
  var conf      = data.confidenceLevel || 'low';
  var summary   = data.summary || '';
  var dims      = data.dimensions || {};
  var risks     = Array.isArray(data.governanceRisks)  ? data.governanceRisks  : [];
  var strengths = Array.isArray(data.strengths)        ? data.strengths        : [];
  var signals   = data.executiveSignals                || {};
  var recs      = Array.isArray(data.recommendations)  ? data.recommendations  : [];
  var meta      = data._meta                           || {};

  var levelSev = _govLevelSev(level);
  var confCls  = 'conf-' + esc(conf);

  var html = '<div class="pf-panel">';

  // ── Header: score + badges + meta counts
  html += '<div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-bottom:10px;">';
  html += '<div>';
  html += '<div class="arch-score-row" style="margin-bottom:4px;">';
  html += '<span class="arch-score-val">' + esc(String(score)) + '</span>';
  html += '<span class="arch-score-denom">/ 100</span>';
  html += '</div>';
  html += '<div class="pf-badges">';
  html += '<span class="pf-badge severity-' + levelSev + '">' + esc(_govLevelLabel(level)) + '</span>';
  html += '<span class="confidence-badge ' + confCls + '">' + esc(conf.toUpperCase() + ' CONFIDENCE') + '</span>';
  html += '</div>';
  html += '</div>';

  var metaItems = [];
  if (meta.repoCount != null)                 metaItems.push([String(meta.repoCount),                'Repos']);
  if (meta.architectureSnapshotCount != null)  metaItems.push([String(meta.architectureSnapshotCount), 'Arch Snapshots']);
  if (meta.forecastedRepoCount != null)        metaItems.push([String(meta.forecastedRepoCount),       'Forecasted']);
  if (meta.maturityRepoCount != null)          metaItems.push([String(meta.maturityRepoCount),         'Maturity Scored']);
  if (metaItems.length) {
    html += '<div class="pf-counts" style="flex:1;justify-content:flex-end;">';
    metaItems.forEach(function(item) {
      html += '<div class="pf-count-item">'
        + '<span class="pf-count-value">' + esc(item[0]) + '</span>'
        + '<span class="pf-count-label">' + esc(item[1]) + '</span>'
        + '</div>';
    });
    html += '</div>';
  }
  html += '</div>';

  if (summary) {
    html += '<div class="pf-summary">' + esc(summary) + '</div>';
  }

  var progColor = score >= 70 ? 'var(--green)' : score >= 45 ? 'var(--orange)' : 'var(--red)';
  html += '<div class="arch-prog" style="margin-bottom:14px;">'
    + '<div class="arch-prog-fill" style="width:' + Math.min(100, score) + '%;background:' + progColor + ';"></div>'
    + '</div>';

  // Portfolio Governance Summary
  html += _govSummaryHtml(level, signals);

  // A. Governance Dimensions
  var dimDefs = [
    { key: 'architectureGovernance', label: 'Architecture' },
    { key: 'maturityGovernance',     label: 'Maturity'     },
    { key: 'behavioralGovernance',   label: 'Behavioral'   },
    { key: 'predictiveGovernance',   label: 'Predictive'   },
    { key: 'anomalyGovernance',      label: 'Anomaly'      },
  ];
  var dimHasContent = dimDefs.some(function(d) { return !!dims[d.key]; });
  if (dimHasContent) {
    html += '<div class="arch-sub-panel">';
    html += '<div class="arch-sub-label">Governance Dimensions</div>';
    html += '<div class="arch-metric-grid">';
    dimDefs.forEach(function(d) {
      var dim      = dims[d.key];
      if (!dim) return;
      var dimLevel = dim.level || 'unknown';
      var dimScore = typeof dim.score === 'number' ? dim.score : null;
      var dimSev   = _govLevelSev(dimLevel);
      html += '<div class="arch-metric">'
        + '<div class="arch-metric-val">' + esc(dimScore != null ? String(dimScore) : '—') + '</div>'
        + '<div class="arch-metric-lbl">' + esc(d.label) + '</div>'
        + '<div><span class="pf-badge severity-' + dimSev + '" style="font-size:0.65rem;padding:1px 4px;">'
        + esc(dimLevel.toUpperCase()) + '</span></div>'
        + '</div>';
    });
    html += '</div>';
    html += '</div>';
  }

  // C+D. Key Governance Findings
  var topRisks     = risks.slice(0, 3);
  var topStrengths = strengths.slice(0, 3);
  html += '<div class="arch-sub-panel" style="margin-top:10px;">';
  html += '<div class="arch-sub-label">Key Governance Findings</div>';
  if (!topRisks.length && !topStrengths.length) {
    html += '<div style="font-size:0.79rem;color:var(--sev-healthy-text);">No significant governance risks or concerns detected.</div>';
  } else {
    if (topRisks.length) {
      html += '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:8px 0 4px;">Risks</div>';
      topRisks.forEach(function(risk) {
        var sev      = risk.severity || 'medium';
        var source   = risk.source   || '';
        var riskText = risk.summary  || risk.text || '';
        var sevCls   = { low: 'severity-low', medium: 'severity-medium', high: 'severity-high', critical: 'severity-critical' }[sev] || 'severity-unknown';
        html += '<div class="arch-finding">'
          + '<span class="timeline-badge ' + sevCls + '">' + esc(sev) + '</span>'
          + '<span>';
        if (source) {
          html += '<span style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);">' + esc(_govLabel(source)) + '</span>';
          if (riskText) html += ' — ';
        }
        if (riskText) {
          html += '<span style="font-size:0.77rem;">' + esc(riskText) + '</span>';
        }
        html += '</span></div>';
      });
    }
    if (topStrengths.length) {
      html += '<div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin:8px 0 4px;">Strengths</div>';
      html += '<ul class="pf-signals">';
      topStrengths.forEach(function(s) {
        var sType = typeof s === 'object' ? (s.type || s.source || '') : '';
        var sText = typeof s === 'object' ? (s.summary || s.text || '') : String(s);
        html += '<li class="pf-signal">';
        if (sType) {
          html += '<span style="font-size:0.72rem;font-weight:600;color:var(--sev-healthy-text);">'
            + esc(_govLabel(sType)) + '</span> — ';
        }
        html += esc(sText) + '</li>';
      });
      html += '</ul>';
    }
  }
  html += '</div>';

  // E. Recommendations (top 5)
  var topRecs = recs.slice(0, 5);
  if (topRecs.length) {
    html += '<div class="arch-sub-label" style="margin-top:14px;">Recommendations</div>';
    topRecs.forEach(function(r) {
      var text = typeof r === 'string' ? r : (r.text || r.recommendation || String(r));
      html += '<div class="arch-rec">' + esc(_govCleanRec(text)) + '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Tests: _govLabel ──────────────────────────────────────────────────────────

describe('_govLabel — dimension source keys', () => {
  test('architectureGovernance → "Architecture"', () => {
    expect(_govLabel('architectureGovernance')).toBe('Architecture');
  });

  test('maturityGovernance → "Engineering Maturity"', () => {
    expect(_govLabel('maturityGovernance')).toBe('Engineering Maturity');
  });

  test('behavioralGovernance → "Behavioral Governance"', () => {
    expect(_govLabel('behavioralGovernance')).toBe('Behavioral Governance');
  });

  test('predictiveGovernance → "Predictive Governance"', () => {
    expect(_govLabel('predictiveGovernance')).toBe('Predictive Governance');
  });

  test('anomalyGovernance → "Anomaly Governance"', () => {
    expect(_govLabel('anomalyGovernance')).toBe('Anomaly Governance');
  });
});

describe('_govLabel — input source keys', () => {
  test('architectureRegressions → "Architecture Regressions"', () => {
    expect(_govLabel('architectureRegressions')).toBe('Architecture Regressions');
  });

  test('couplingAlerts → "Dependency Coupling"', () => {
    expect(_govLabel('couplingAlerts')).toBe('Dependency Coupling');
  });

  test('portfolioMaturity → "Portfolio Maturity"', () => {
    expect(_govLabel('portfolioMaturity')).toBe('Portfolio Maturity');
  });

  test('portfolioForecast → "Portfolio Forecast"', () => {
    expect(_govLabel('portfolioForecast')).toBe('Portfolio Forecast');
  });

  test('architectureAnomalies → "Architecture Anomalies"', () => {
    expect(_govLabel('architectureAnomalies')).toBe('Architecture Anomalies');
  });

  test('behavioralStability → "Behavioral Stability"', () => {
    expect(_govLabel('behavioralStability')).toBe('Behavioral Stability');
  });
});

describe('_govLabel — strength type keys', () => {
  test('stable_forecast → "Stable Forecast"', () => {
    expect(_govLabel('stable_forecast')).toBe('Stable Forecast');
  });

  test('no_anomalies → "No Architecture Anomalies"', () => {
    expect(_govLabel('no_anomalies')).toBe('No Architecture Anomalies');
  });
});

describe('_govLabel — recommendation type codes', () => {
  test('architecture_regressions_critical → "Architecture Regressions"', () => {
    expect(_govLabel('architecture_regressions_critical')).toBe('Architecture Regressions');
  });

  test('coupling_alerts_critical → "Dependency Coupling"', () => {
    expect(_govLabel('coupling_alerts_critical')).toBe('Dependency Coupling');
  });

  test('maturityGovernance_critical → "Engineering Maturity"', () => {
    expect(_govLabel('maturityGovernance_critical')).toBe('Engineering Maturity');
  });

  test('anomalyGovernance_weak → "Anomaly Governance"', () => {
    expect(_govLabel('anomalyGovernance_weak')).toBe('Anomaly Governance');
  });
});

describe('_govLabel — fallback and edge cases', () => {
  test('unknown key replaces underscores with spaces', () => {
    expect(_govLabel('some_unknown_key')).toBe('some unknown key');
  });

  test('empty string returns empty string', () => {
    expect(_govLabel('')).toBe('');
  });

  test('null/undefined-like falsy returns empty string', () => {
    expect(_govLabel(undefined)).toBe('');
  });
});

// ── Tests: _govCleanRec ───────────────────────────────────────────────────────

describe('_govCleanRec — internal code replacement', () => {
  test('replaces single type code with human label', () => {
    expect(_govCleanRec(
      'Immediately address critical governance risks: architecture_regressions_critical'
    )).toBe(
      'Immediately address critical governance risks: Architecture Regressions'
    );
  });

  test('replaces two type codes with labels', () => {
    expect(_govCleanRec(
      'Immediately address critical governance risks: architecture_regressions_critical, coupling_alerts_critical'
    )).toBe(
      'Immediately address critical governance risks: Architecture Regressions, Dependency Coupling'
    );
  });

  test('replaces maturityGovernance_critical with "Engineering Maturity"', () => {
    expect(_govCleanRec(
      'Immediately address critical governance risks: maturityGovernance_critical'
    )).toBe(
      'Immediately address critical governance risks: Engineering Maturity'
    );
  });

  test('passes through normal recommendation text unchanged', () => {
    const rec = 'Invest in architecture health — resolve boundary violations and reduce coupling';
    expect(_govCleanRec(rec)).toBe(rec);
  });

  test('passes through empty string unchanged', () => {
    expect(_govCleanRec('')).toBe('');
  });
});

// ── Tests: _govSummaryHtml ────────────────────────────────────────────────────

describe('_govSummaryHtml — section label', () => {
  test('always renders "Portfolio Governance Summary" label', () => {
    expect(_govSummaryHtml('strong', {})).toContain('Portfolio Governance Summary');
  });

  test('does not throw for empty signals object', () => {
    expect(() => _govSummaryHtml('watch', {})).not.toThrow();
  });
});

describe('_govSummaryHtml — strong level, no concerns', () => {
  test('renders "Governance is strong with no significant concerns."', () => {
    expect(_govSummaryHtml('strong', {})).toContain('Governance is strong with no significant concerns.');
  });

  test('excellent level also uses positive path', () => {
    expect(_govSummaryHtml('excellent', {})).toContain('Governance is excellent with no significant concerns.');
  });
});

describe('_govSummaryHtml — grammar: plural noun subjects', () => {
  test('"architecture gaps" alone uses "require" (plural noun)', () => {
    const html = _govSummaryHtml('strong', { lowestScoringDimension: 'architectureGovernance' });
    expect(html).toContain('architecture gaps require attention.');
    expect(html).not.toContain('architecture gaps requires attention.');
  });

  test('"maturity gaps" alone uses "require" (plural noun)', () => {
    const html = _govSummaryHtml('weak', { lowestScoringDimension: 'maturityGovernance' });
    expect(html).toContain('maturity gaps require immediate attention.');
    expect(html).not.toContain('maturity gaps requires immediate attention.');
  });

  test('"anomaly concerns" alone uses "require" (plural noun)', () => {
    const html = _govSummaryHtml('watch', { anomalyConcern: true });
    expect(html).toContain('anomaly concerns require monitoring.');
    expect(html).not.toContain('anomaly concerns requires monitoring.');
  });

  test('"forecast instability" alone uses "requires" (singular noun)', () => {
    const html = _govSummaryHtml('strong', { forecastConcern: true });
    expect(html).toContain('forecast instability requires attention.');
    expect(html).not.toContain('forecast instability require attention.');
  });

  test('"architecture risk" alone uses "requires" (singular noun)', () => {
    const html = _govSummaryHtml('strong', { highestRiskArea: 'Architecture' });
    expect(html).toContain('architecture risk requires attention.');
    expect(html).not.toContain('architecture risk require attention.');
  });

  test('two concerns always use "require" regardless of noun type', () => {
    const html = _govSummaryHtml('strong', {
      lowestScoringDimension: 'architectureGovernance',
      forecastConcern: true,
    });
    expect(html).toContain('architecture gaps and forecast instability require attention.');
  });
});

describe('_govSummaryHtml — strong level, lowestScoringDimension', () => {
  test('architectureGovernance → "architecture gaps" in sentence with "require"', () => {
    const html = _govSummaryHtml('strong', { lowestScoringDimension: 'architectureGovernance' });
    expect(html).toContain('architecture gaps');
    expect(html).toContain('Governance is strong overall, but');
    expect(html).toContain('require attention.');
  });

  test('maturityGovernance → "maturity gaps" in sentence', () => {
    expect(_govSummaryHtml('strong', { lowestScoringDimension: 'maturityGovernance' })).toContain('maturity gaps');
  });

  test('behavioralGovernance → "behavioral gaps" in sentence', () => {
    expect(_govSummaryHtml('strong', { lowestScoringDimension: 'behavioralGovernance' })).toContain('behavioral gaps');
  });

  test('predictiveGovernance → "predictive gaps" in sentence', () => {
    expect(_govSummaryHtml('strong', { lowestScoringDimension: 'predictiveGovernance' })).toContain('predictive gaps');
  });

  test('anomalyGovernance → "anomaly gaps" in sentence', () => {
    expect(_govSummaryHtml('strong', { lowestScoringDimension: 'anomalyGovernance' })).toContain('anomaly gaps');
  });

  test('unknown key strips "governance" suffix', () => {
    const html = _govSummaryHtml('strong', { lowestScoringDimension: 'customGovernance' });
    expect(html).toContain('custom gaps');
  });
});

describe('_govSummaryHtml — strong level, forecast/anomaly concerns', () => {
  test('forecastConcern adds "forecast instability" to sentence', () => {
    const html = _govSummaryHtml('strong', { forecastConcern: 'rising risk' });
    expect(html).toContain('forecast instability');
    expect(html).toContain('requires attention.');
  });

  test('anomalyConcern adds "anomaly concerns" to sentence', () => {
    const html = _govSummaryHtml('strong', { anomalyConcern: 'drift detected' });
    expect(html).toContain('anomaly concerns');
  });

  test('two concerns joined with " and "', () => {
    const html = _govSummaryHtml('strong', {
      lowestScoringDimension: 'architectureGovernance',
      forecastConcern: 'yes',
    });
    expect(html).toContain('architecture gaps and forecast instability');
  });

  test('two concerns use "require" (compound subject)', () => {
    const html = _govSummaryHtml('strong', {
      lowestScoringDimension: 'architectureGovernance',
      forecastConcern: 'yes',
    });
    expect(html).toContain(' require attention.');
    expect(html).not.toContain(' requires attention.');
  });

  test('caps concerns at 2 even when all three signals active', () => {
    const html = _govSummaryHtml('strong', {
      lowestScoringDimension: 'maturityGovernance',
      forecastConcern: 'yes',
      anomalyConcern: 'yes',
    });
    expect(html).toContain('maturity gaps and forecast instability');
    expect(html).not.toContain('anomaly concerns');
  });
});

describe('_govSummaryHtml — highestRiskArea fallback', () => {
  test('uses highestRiskArea when no other concerns exist', () => {
    const html = _govSummaryHtml('strong', { highestRiskArea: 'Architecture' });
    expect(html).toContain('architecture risk');
    expect(html).toContain('requires attention.');
  });

  test('highestRiskArea lowercased in sentence', () => {
    const html = _govSummaryHtml('strong', { highestRiskArea: 'MATURITY' });
    expect(html).toContain('maturity risk');
  });

  test('highestRiskArea NOT used when lowestScoringDimension present', () => {
    const html = _govSummaryHtml('strong', {
      lowestScoringDimension: 'architectureGovernance',
      highestRiskArea: 'Maturity',
    });
    expect(html).toContain('architecture gaps');
    expect(html).not.toContain('maturity risk');
  });
});

describe('_govSummaryHtml — watch level', () => {
  test('no concerns → stable monitoring sentence', () => {
    expect(_govSummaryHtml('watch', {})).toContain(
      'Governance health is stable — continue monitoring for regressions.'
    );
  });

  test('single plural concern → "require monitoring."', () => {
    const html = _govSummaryHtml('watch', { anomalyConcern: true });
    expect(html).toContain('Governance health is stable, but');
    expect(html).toContain('anomaly concerns require monitoring.');
  });

  test('single singular concern → "requires monitoring."', () => {
    const html = _govSummaryHtml('watch', { forecastConcern: 'trend down' });
    expect(html).toContain('forecast instability requires monitoring.');
  });

  test('two concerns → "require monitoring."', () => {
    const html = _govSummaryHtml('watch', { forecastConcern: 'yes', anomalyConcern: 'yes' });
    expect(html).toContain('require monitoring.');
    expect(html).not.toContain('requires monitoring.');
  });
});

describe('_govSummaryHtml — weak level', () => {
  test('no concerns → intervention sentence', () => {
    expect(_govSummaryHtml('weak', {})).toContain('Governance health is weak and requires intervention.');
  });

  test('"maturity gaps" alone → "require immediate attention."', () => {
    const html = _govSummaryHtml('weak', { lowestScoringDimension: 'maturityGovernance' });
    expect(html).toContain('Governance is weak — maturity gaps require immediate attention.');
  });

  test('"forecast instability" alone → "requires immediate attention."', () => {
    const html = _govSummaryHtml('weak', { forecastConcern: true });
    expect(html).toContain('forecast instability requires immediate attention.');
  });

  test('two concerns → "require immediate attention."', () => {
    const html = _govSummaryHtml('weak', {
      lowestScoringDimension: 'maturityGovernance',
      forecastConcern: 'yes',
    });
    expect(html).toContain('require immediate attention.');
    expect(html).not.toContain('requires immediate attention.');
  });
});

describe('_govSummaryHtml — critical level', () => {
  test('no concerns → "Governance health is critical and requires intervention."', () => {
    expect(_govSummaryHtml('critical', {})).toContain(
      'Governance health is critical and requires intervention.'
    );
  });

  test('"architecture risk" alone → "requires immediate attention."', () => {
    const html = _govSummaryHtml('critical', { highestRiskArea: 'Architecture' });
    expect(html).toContain('architecture risk requires immediate attention.');
  });
});

// ── Tests: buildPortfolioGovernanceHtml ───────────────────────────────────────

const VALID_DATA = {
  governanceLevel: 'strong',
  governanceScore: 78,
  confidenceLevel: 'high',
};

describe('buildPortfolioGovernanceHtml — guard clauses', () => {
  test('returns EMPTY for null data', () => {
    expect(buildPortfolioGovernanceHtml(null)).toContain('Engineering governance unavailable');
  });

  test('returns EMPTY for non-object data', () => {
    expect(buildPortfolioGovernanceHtml('string')).toContain('Engineering governance unavailable');
  });

  test('returns EMPTY when governanceLevel is missing', () => {
    expect(buildPortfolioGovernanceHtml({ governanceScore: 70 })).toContain('Engineering governance unavailable');
  });

  test('returns EMPTY when governanceLevel is "unknown"', () => {
    expect(buildPortfolioGovernanceHtml({ governanceLevel: 'unknown' })).toContain('Engineering governance unavailable');
  });
});

describe('buildPortfolioGovernanceHtml — Portfolio Governance Summary', () => {
  test('renders "Portfolio Governance Summary" section', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).toContain('Portfolio Governance Summary');
  });

  test('does NOT render "Governance Intervention Required"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceLevel: 'weak',
      executiveSignals: { interventionRequired: true, highestRiskArea: 'Architecture' },
    });
    expect(html).not.toContain('Governance Intervention Required');
  });

  test('summary sentence reflects level: strong', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).toContain('Governance is strong');
  });

  test('summary sentence reflects level: weak', () => {
    const html = buildPortfolioGovernanceHtml({ ...VALID_DATA, governanceLevel: 'weak', governanceScore: 30 });
    expect(html).toContain('Governance health is weak');
  });
});

describe('buildPortfolioGovernanceHtml — Executive Signals removed', () => {
  test('does NOT render "Executive Signals" section label', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      executiveSignals: { lowestScoringDimension: 'architectureGovernance', forecastConcern: 'yes' },
    });
    expect(html).not.toContain('Executive Signals');
  });

  test('does NOT render "Lowest Dimension" row label', () => {
    expect(buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      executiveSignals: { lowestScoringDimension: 'architectureGovernance' },
    })).not.toContain('Lowest Dimension');
  });

  test('does NOT render "Strongest Dimension" row label', () => {
    expect(buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      executiveSignals: { strongestDimension: 'behavioralGovernance' },
    })).not.toContain('Strongest Dimension');
  });
});

describe('buildPortfolioGovernanceHtml — driver paragraphs removed', () => {
  test('does NOT render driver text joined with " · "', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      dimensions: {
        architectureGovernance: {
          level: 'watch', score: 60,
          drivers: ['Architecture risk one', 'Architecture risk two'],
        },
      },
    });
    expect(html).not.toContain('Architecture risk one · Architecture risk two');
    expect(html).not.toContain('Architecture risk one');
  });
});

describe('buildPortfolioGovernanceHtml — Governance Dimensions', () => {
  const dataWithDims = {
    ...VALID_DATA,
    dimensions: {
      architectureGovernance: { level: 'watch', score: 60 },
      maturityGovernance:     { level: 'strong', score: 80 },
    },
  };

  test('renders "Governance Dimensions" label when dims present', () => {
    expect(buildPortfolioGovernanceHtml(dataWithDims)).toContain('Governance Dimensions');
  });

  test('renders "Architecture" dimension label', () => {
    expect(buildPortfolioGovernanceHtml(dataWithDims)).toContain('Architecture');
  });

  test('renders "Maturity" dimension label', () => {
    expect(buildPortfolioGovernanceHtml(dataWithDims)).toContain('Maturity');
  });

  test('renders dimension score value', () => {
    expect(buildPortfolioGovernanceHtml(dataWithDims)).toContain('60');
  });

  test('omits Governance Dimensions section when no dims present', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).not.toContain('Governance Dimensions');
  });
});

describe('buildPortfolioGovernanceHtml — score + badges', () => {
  test('renders governance score', () => {
    expect(buildPortfolioGovernanceHtml({ ...VALID_DATA, governanceScore: 78 })).toContain('78');
  });

  test('renders STRONG level badge', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).toContain('>STRONG<');
  });

  test('renders WEAK level badge', () => {
    const html = buildPortfolioGovernanceHtml({ ...VALID_DATA, governanceLevel: 'weak', governanceScore: 30 });
    expect(html).toContain('>WEAK<');
  });

  test('renders confidence badge', () => {
    expect(buildPortfolioGovernanceHtml({ ...VALID_DATA, confidenceLevel: 'high' })).toContain('HIGH CONFIDENCE');
  });
});

describe('buildPortfolioGovernanceHtml — Key Governance Findings: structure', () => {
  test('always renders "Key Governance Findings" section', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).toContain('Key Governance Findings');
  });

  test('shows empty-state message when no risks and no strengths', () => {
    expect(buildPortfolioGovernanceHtml(VALID_DATA)).toContain(
      'No significant governance risks or concerns detected.'
    );
  });

  test('renders "Risks" subsection when risks present', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'high', summary: 'Architecture drift detected.' }],
    });
    expect(html).toContain('>Risks<');
  });

  test('renders "Strengths" subsection when strengths present', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'architectureGovernance', summary: 'Architecture governance is strong.' }],
    });
    expect(html).toContain('>Strengths<');
  });

  test('shows only Risks when strengths absent', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'medium', summary: 'Drift detected.' }],
    });
    expect(html).toContain('>Risks<');
    expect(html).not.toContain('>Strengths<');
  });

  test('shows only Strengths when risks absent', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'stable_forecast', summary: 'Forecast stable.' }],
    });
    expect(html).toContain('>Strengths<');
    expect(html).not.toContain('>Risks<');
  });

  test('does NOT render old "Governance Risks" section label', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'high', summary: 'Architecture drift.' }],
    });
    expect(html).not.toContain('>Governance Risks<');
  });

  test('does NOT render old "Governance Strengths" section label', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'stable_forecast', summary: 'Good.' }],
    });
    expect(html).not.toContain('>Governance Strengths<');
  });
});

describe('buildPortfolioGovernanceHtml — Key Governance Findings: top-3 cap', () => {
  test('caps risks at 3 items (not 5)', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: Array.from({ length: 5 }, (_, i) => ({ severity: 'medium', summary: 'Risk ' + i })),
    });
    const items = (html.match(/class="arch-finding"/g) || []).length;
    expect(items).toBe(3);
  });

  test('caps strengths at 3 items', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: Array.from({ length: 5 }, (_, i) => ({ type: 'stable_forecast', summary: 'Strength ' + i })),
    });
    const items = (html.match(/class="pf-signal"/g) || []).length;
    expect(items).toBe(3);
  });
});

describe('buildPortfolioGovernanceHtml — identifier translation', () => {
  test('risk source "architectureRegressions" renders as "Architecture Regressions"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'critical', source: 'architectureRegressions', summary: 'Critical regressions.' }],
    });
    expect(html).toContain('Architecture Regressions');
    expect(html).not.toContain('>architectureRegressions<');
  });

  test('risk source "couplingAlerts" renders as "Dependency Coupling"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'high', source: 'couplingAlerts', summary: 'Coupling alert.' }],
    });
    expect(html).toContain('Dependency Coupling');
    expect(html).not.toContain('>couplingAlerts<');
  });

  test('risk source "maturityGovernance" renders as "Engineering Maturity"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      governanceRisks: [{ severity: 'high', source: 'maturityGovernance', summary: 'Maturity weak.' }],
    });
    expect(html).toContain('Engineering Maturity');
    expect(html).not.toContain('>maturityGovernance<');
  });

  test('strength type "stable_forecast" renders as "Stable Forecast"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'stable_forecast', summary: 'Portfolio forecast is stable.' }],
    });
    expect(html).toContain('Stable Forecast');
    expect(html).not.toContain('>stable_forecast<');
  });

  test('strength type "no_anomalies" renders as "No Architecture Anomalies"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'no_anomalies', summary: 'No anomalies detected.' }],
    });
    expect(html).toContain('No Architecture Anomalies');
    expect(html).not.toContain('>no_anomalies<');
  });

  test('strength type "architectureGovernance" renders as "Architecture"', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      strengths: [{ type: 'architectureGovernance', summary: 'Architecture governance is strong.' }],
    });
    expect(html).toContain('>Architecture<');
  });
});

describe('buildPortfolioGovernanceHtml — recommendation cleaning', () => {
  test('recommendation with internal codes is cleaned to human labels', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      recommendations: [
        'Immediately address critical governance risks: architecture_regressions_critical',
      ],
    });
    expect(html).toContain('Architecture Regressions');
    expect(html).not.toContain('architecture_regressions_critical');
  });

  test('normal recommendation text passes through unchanged', () => {
    const rec = 'Invest in architecture health — resolve boundary violations and reduce coupling';
    const html = buildPortfolioGovernanceHtml({ ...VALID_DATA, recommendations: [rec] });
    expect(html).toContain(rec);
  });

  test('renders "Recommendations" label when recs present', () => {
    const html = buildPortfolioGovernanceHtml({
      ...VALID_DATA,
      recommendations: ['Improve architecture review cadence.'],
    });
    expect(html).toContain('Recommendations');
    expect(html).toContain('Improve architecture review cadence.');
  });
});
