'use strict';

// Unit tests for buildPortfolioForecastHtml (copied verbatim from dashboard.html).
// Tests focus on the readiness guard: when portfolioForecastLevel is 'unknown'
// (all repos lack sufficient architecture history), the panel must display
// "FORECAST UNAVAILABLE" + "Insufficient architecture history" and must NOT
// display forecast level labels, confidence badges, or risk scores.

// ── esc stub ─────────────────────────────────────────────────────────────────
function esc(s) { return String(s); }

// ── buildPortfolioForecastHtml (copied verbatim from dashboard.html) ──────────
function buildPortfolioForecastHtml(data) {
  if (!data || typeof data !== 'object'
      || !data.portfolioForecastLevel
      || data.portfolioForecastLevel === 'unknown') {
    return '<div class="pf-panel">'
      + '<div class="pf-badges"><span class="pf-badge severity-unknown">FORECAST UNAVAILABLE</span></div>'
      + '<p class="pf-summary" style="color:var(--text-muted);font-style:italic;">Insufficient architecture history</p>'
      + '</div>';
  }

  function _pfLevelSev(level) {
    if (level === 'none' || level === 'low') return 'healthy';
    if (level === 'medium')  return 'medium';
    if (level === 'high')    return 'high';
    if (level === 'critical') return 'critical';
    return 'unknown';
  }
  function _pfTrendSev(trend) {
    if (!trend) return 'unknown';
    var t = trend.toLowerCase();
    if (t === 'stable' || t === 'improving') return 'healthy';
    if (t === 'watch')     return 'medium';
    if (t === 'degrading') return 'high';
    if (t === 'critical')  return 'critical';
    return 'unknown';
  }
  function _pfCouplingFcastSev(v) {
    if (!v) return 'unknown';
    var s = v.toLowerCase();
    if (s === 'stable')                      return 'healthy';
    if (s === 'growing' || s === 'degrading' || s === 'eroding') return 'medium';
    if (s === 'accelerating' || s === 'critical') return 'critical';
    return 'unknown';
  }

  var level      = data.portfolioForecastLevel;
  var score      = typeof data.portfolioForecastScore === 'number' ? data.portfolioForecastScore : 0;
  var conf       = data.confidenceLevel || 'low';
  var summary    = data.summary || '';
  var dist       = data.forecastDistribution || {};
  var riskRepos  = Array.isArray(data.projectedRiskRepos)  ? data.projectedRiskRepos  : [];
  var hotspots   = Array.isArray(data.projectedHotspots)   ? data.projectedHotspots   : [];
  var coupPres   = data.projectedCouplingPressure  || null;
  var govRisk    = data.projectedGovernanceRisk    || null;
  var trendFcast = data.trendForecast              || null;
  var recs       = Array.isArray(data.recommendations) ? data.recommendations : [];
  var bench      = data.benchmarking               || null;
  var cache      = data._cache                     || {};

  var levelSev = _pfLevelSev(level);
  var confCls  = 'conf-' + esc(conf);

  var html = '<div class="pf-panel">';

  html += '<div class="pf-badges">';
  html += '<span class="pf-badge severity-' + levelSev + '">'
    + esc(level.toUpperCase()) + ' FORECAST RISK</span>';
  html += '<span class="confidence-badge ' + confCls + '">'
    + esc(conf.toUpperCase() + ' CONFIDENCE') + '</span>';
  html += '<span class="pf-badge">Risk score: ' + esc(String(score)) + '</span>';
  html += '</div>';

  if (summary) {
    html += '<p class="pf-summary">' + esc(summary) + '</p>';
  }

  if (cache.missingSnapshotCount > 0) {
    html += '<p style="font-size:0.75rem;color:var(--text-muted);font-style:italic;margin:6px 0 10px;">'
      + esc(String(cache.missingSnapshotCount)) + ' '
      + (cache.missingSnapshotCount === 1 ? 'repository does' : 'repositories do')
      + ' not yet have enough architecture history for forecasting.</p>';
  }

  var distEntries = [
    { key: 'stable',    label: 'Stable',    sev: 'healthy'  },
    { key: 'watch',     label: 'Watch',     sev: 'medium'   },
    { key: 'degrading', label: 'Degrading', sev: 'high'     },
    { key: 'critical',  label: 'Critical',  sev: 'critical' },
    { key: 'unknown',   label: 'Unknown',   sev: 'unknown'  },
  ].filter(function(e) { return (dist[e.key] || 0) > 0; });
  if (distEntries.length) {
    html += '<div class="pf-counts">';
    distEntries.forEach(function(e) {
      html += '<div class="pf-count-item">'
        + '<span class="pf-count-value">' + esc(String(dist[e.key])) + '</span>'
        + '<span class="pf-count-label severity-' + e.sev + '">' + esc(e.label) + '</span>'
        + '</div>';
    });
    html += '</div>';
  }

  // A. Projected Risk Repos
  var topRiskRepos = riskRepos.slice(0, 5);
  if (topRiskRepos.length) {
    html += '<div class="arch-sub-label" style="margin-top:14px;">Projected Risk Repos</div>';
    html += '<ul class="pf-signals">';
    topRiskRepos.forEach(function(r) {
      var name   = typeof r === 'string' ? r : (r.repoName || r.name || '');
      var rLevel = typeof r === 'object' ? (r.forecastLevel || r.projectedLevel || '') : '';
      html += '<li class="pf-signal">';
      if (rLevel) {
        html += '<span class="pf-badge severity-' + _pfLevelSev(rLevel) + '" style="font-size:0.7rem;padding:1px 5px;margin-right:5px;">'
          + esc(rLevel.toUpperCase()) + '</span>';
      }
      html += esc(name) + '</li>';
    });
    html += '</ul>';
  }

  // B. Projected Hotspots
  var topHotspots = hotspots.slice(0, 5);
  if (topHotspots.length) {
    html += '<div class="arch-sub-label" style="margin-top:12px;">Projected Hotspots</div>';
    html += '<ul class="pf-signals">';
    topHotspots.forEach(function(h) {
      var text   = typeof h === 'string' ? h : (h.file || h.module || h.name || '');
      var rScore = typeof h === 'object' && h.riskScore != null ? ' — score: ' + h.riskScore : '';
      html += '<li class="pf-signal" style="font-family:var(--font-mono);font-size:0.77rem;">'
        + esc(text)
        + (rScore ? '<span style="color:var(--text-muted);">' + esc(rScore) + '</span>' : '')
        + '</li>';
    });
    html += '</ul>';
  }

  // C. Coupling Pressure
  if (coupPres) {
    var cpLevel    = coupPres.level || coupPres.couplingLevel || '';
    var cpForecast = coupPres.forecast || coupPres.couplingForecast || '';
    var cpSummary  = coupPres.summary || coupPres.description || '';
    html += '<div class="arch-sub-panel" style="margin-top:12px;">';
    html += '<div class="arch-sub-label">Projected Coupling Pressure</div>';
    if (cpLevel) {
      var cpSev = cpLevel === 'low' || cpLevel === 'minimal' ? 'healthy'
                : cpLevel === 'moderate' ? 'medium'
                : cpLevel === 'high'     ? 'high'
                : cpLevel === 'critical' ? 'critical' : 'unknown';
      html += '<span class="pf-badge severity-' + cpSev + '" style="margin-right:5px;">'
        + esc(cpLevel.toUpperCase()) + '</span>';
    }
    if (cpForecast) {
      html += '<span class="pf-badge severity-' + _pfCouplingFcastSev(cpForecast) + '">'
        + esc('Projected: ' + cpForecast) + '</span>';
    }
    if (cpSummary) {
      html += '<p style="font-size:0.79rem;color:var(--text-secondary);margin-top:6px;">'
        + 'If current trends continue: ' + esc(cpSummary) + '</p>';
    }
    html += '</div>';
  }

  // D. Governance Risk Forecast
  if (govRisk) {
    var grLevel    = govRisk.level || govRisk.governanceRiskLevel || '';
    var grForecast = govRisk.forecast || govRisk.governanceRiskForecast || '';
    var grSummary  = govRisk.summary || govRisk.description || '';
    html += '<div class="arch-sub-panel" style="margin-top:12px;">';
    html += '<div class="arch-sub-label">Projected Governance Risk</div>';
    if (grLevel) {
      var grSev = grLevel === 'low'    ? 'healthy'
                : grLevel === 'medium' ? 'medium'
                : grLevel === 'high'   ? 'high'
                : grLevel === 'critical' ? 'critical' : 'unknown';
      html += '<span class="pf-badge severity-' + grSev + '" style="margin-right:5px;">'
        + esc(grLevel.toUpperCase()) + '</span>';
    }
    if (grForecast) {
      var grFcastSev = _pfTrendSev(grForecast);
      html += '<span class="pf-badge severity-' + grFcastSev + '">'
        + esc('Projected: ' + grForecast) + '</span>';
    }
    if (grSummary) {
      html += '<p style="font-size:0.79rem;color:var(--text-secondary);margin-top:6px;">'
        + esc(grSummary) + '</p>';
    }
    html += '</div>';
  }

  // E. Trend Forecast
  if (trendFcast) {
    var tfDirection = trendFcast.direction || trendFcast.trendDirection || '';
    var tfSummary   = trendFcast.summary || '';
    var tfHorizon   = trendFcast.horizon || trendFcast.projectionHorizon || '';
    html += '<div class="arch-sub-panel" style="margin-top:12px;">';
    html += '<div class="arch-sub-label">Trend Forecast</div>';
    if (tfDirection) {
      html += '<span class="pf-badge severity-' + _pfTrendSev(tfDirection) + '">'
        + esc(tfDirection.toUpperCase()) + '</span>';
    }
    if (tfHorizon) {
      html += ' <span style="font-size:0.72rem;color:var(--text-muted);">' + esc(tfHorizon) + '</span>';
    }
    if (tfSummary) {
      html += '<p style="font-size:0.79rem;color:var(--text-secondary);margin-top:6px;">'
        + 'If current trends continue: ' + esc(tfSummary) + '</p>';
    }
    html += '</div>';
  }

  // F. Benchmarking
  if (bench) {
    var benchGroups = [
      { key: 'aboveAverage', label: 'Above Average', sev: 'healthy'  },
      { key: 'average',      label: 'Average',       sev: 'medium'   },
      { key: 'belowAverage', label: 'Below Average', sev: 'high'     },
      { key: 'lagging',      label: 'Lagging',       sev: 'critical' },
    ].filter(function(g) { return Array.isArray(bench[g.key]) && bench[g.key].length > 0; });
    if (benchGroups.length) {
      html += '<div class="arch-sub-panel" style="margin-top:12px;">';
      html += '<div class="arch-sub-label">Benchmarking</div>';
      benchGroups.forEach(function(g) {
        var shown = bench[g.key].slice(0, 3);
        var extra = bench[g.key].length - shown.length;
        var names = shown.map(function(item) {
          return typeof item === 'string' ? item : (item.repoName || item.name || '');
        }).join(', ');
        html += '<div style="margin-top:6px;">'
          + '<span class="pf-badge severity-' + g.sev + '" style="font-size:0.7rem;">'
          + esc(g.label) + '</span>'
          + '<span style="font-size:0.77rem;color:var(--text-secondary);margin-left:6px;">'
          + esc(names) + (extra > 0 ? ' +' + extra + ' more' : '')
          + '</span>'
          + '</div>';
      });
      html += '</div>';
    }
  }

  // G. Recommendations
  var topRecs = recs.slice(0, 5);
  if (topRecs.length) {
    html += '<div class="arch-sub-label" style="margin-top:14px;">Recommendations</div>';
    topRecs.forEach(function(r) {
      var text = typeof r === 'string' ? r : (r.text || r.recommendation || String(r));
      html += '<div class="arch-rec">' + esc(text) + '</div>';
    });
  }

  html += '</div>';
  return html;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function validData(overrides) {
  return Object.assign({
    portfolioForecastLevel: 'stable',
    portfolioForecastScore: 12,
    confidenceLevel:        'high',
    summary:                'Portfolio structural forecast is stable.',
    forecastDistribution:   { stable: 3, watch: 0, degrading: 0, critical: 0, unknown: 0 },
    projectedRiskRepos:     [],
    projectedHotspots:      [],
    projectedCouplingPressure: { level: 'low', reposAtRisk: [], acceleratingRepos: [], projectedCircularDependencyRepos: [] },
    projectedGovernanceRisk:   { level: 'low', degradingRepos: [], criticalRepos: [], unstableRepos: [], governanceRiskScore: 0 },
    trendForecast:          { direction: 'stable', averageRisk: 12, highestRisk: 12, lowestRisk: 12, volatility: 0 },
    recommendations:        [],
    benchmarking:           null,
    _cache:                 { repoCount: 3, forecastedRepoCount: 3, missingSnapshotCount: 0 },
  }, overrides);
}

// ── Readiness guard: unavailable states ──────────────────────────────────────

describe('buildPortfolioForecastHtml — unavailable state (null/missing/unknown)', () => {
  test('null data returns pf-panel with FORECAST UNAVAILABLE badge', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).toContain('FORECAST UNAVAILABLE');
    expect(html).toContain('pf-panel');
  });

  test('undefined data returns FORECAST UNAVAILABLE', () => {
    const html = buildPortfolioForecastHtml(undefined);
    expect(html).toContain('FORECAST UNAVAILABLE');
  });

  test('empty object returns FORECAST UNAVAILABLE', () => {
    const html = buildPortfolioForecastHtml({});
    expect(html).toContain('FORECAST UNAVAILABLE');
  });

  test('portfolioForecastLevel unknown returns FORECAST UNAVAILABLE', () => {
    const html = buildPortfolioForecastHtml({ portfolioForecastLevel: 'unknown' });
    expect(html).toContain('FORECAST UNAVAILABLE');
  });

  test('FORECAST UNAVAILABLE uses severity-unknown class', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).toContain('severity-unknown');
  });
});

// ── Readiness guard: Insufficient architecture history message ────────────────

describe('buildPortfolioForecastHtml — insufficient architecture history message', () => {
  test('null data shows "Insufficient architecture history"', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).toContain('Insufficient architecture history');
  });

  test('portfolioForecastLevel unknown shows "Insufficient architecture history"', () => {
    const html = buildPortfolioForecastHtml({ portfolioForecastLevel: 'unknown' });
    expect(html).toContain('Insufficient architecture history');
  });

  test('insufficient history message uses pf-summary class', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).toContain('pf-summary');
  });
});

// ── Readiness guard: suppressed labels when unavailable ──────────────────────

describe('buildPortfolioForecastHtml — no forecast labels when unavailable', () => {
  test('null data does not show STABLE FORECAST RISK badge', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).not.toContain('STABLE FORECAST RISK');
  });

  test('null data does not show MEDIUM CONFIDENCE badge', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).not.toContain('MEDIUM CONFIDENCE');
  });

  test('null data does not show HIGH CONFIDENCE badge', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).not.toContain('HIGH CONFIDENCE');
  });

  test('null data does not show Risk score', () => {
    const html = buildPortfolioForecastHtml(null);
    expect(html).not.toContain('Risk score:');
  });

  test('portfolioForecastLevel unknown does not show WATCH FORECAST RISK', () => {
    const html = buildPortfolioForecastHtml({ portfolioForecastLevel: 'unknown' });
    expect(html).not.toContain('WATCH FORECAST RISK');
  });

  test('portfolioForecastLevel unknown does not show DEGRADING FORECAST RISK', () => {
    const html = buildPortfolioForecastHtml({ portfolioForecastLevel: 'unknown' });
    expect(html).not.toContain('DEGRADING FORECAST RISK');
  });

  test('portfolioForecastLevel unknown does not show Risk score', () => {
    const html = buildPortfolioForecastHtml({ portfolioForecastLevel: 'unknown', portfolioForecastScore: 0 });
    expect(html).not.toContain('Risk score:');
  });
});

// ── Valid data: correct badges and values rendered ────────────────────────────

describe('buildPortfolioForecastHtml — valid data renders forecast correctly', () => {
  test('stable level shows STABLE FORECAST RISK badge', () => {
    const html = buildPortfolioForecastHtml(validData({ portfolioForecastLevel: 'stable' }));
    expect(html).toContain('STABLE FORECAST RISK');
  });

  test('watch level shows WATCH FORECAST RISK badge', () => {
    const html = buildPortfolioForecastHtml(validData({ portfolioForecastLevel: 'watch' }));
    expect(html).toContain('WATCH FORECAST RISK');
  });

  test('degrading level shows DEGRADING FORECAST RISK badge', () => {
    const html = buildPortfolioForecastHtml(validData({ portfolioForecastLevel: 'degrading' }));
    expect(html).toContain('DEGRADING FORECAST RISK');
  });

  test('critical level shows DEGRADING FORECAST RISK badge', () => {
    const html = buildPortfolioForecastHtml(validData({ portfolioForecastLevel: 'critical' }));
    expect(html).toContain('CRITICAL FORECAST RISK');
  });

  test('valid data shows confidence badge', () => {
    const html = buildPortfolioForecastHtml(validData({ confidenceLevel: 'high' }));
    expect(html).toContain('HIGH CONFIDENCE');
  });

  test('valid data shows risk score', () => {
    const html = buildPortfolioForecastHtml(validData({ portfolioForecastScore: 12 }));
    expect(html).toContain('Risk score: 12');
  });

  test('valid data shows summary text', () => {
    const html = buildPortfolioForecastHtml(validData({ summary: 'Portfolio structural forecast is stable.' }));
    expect(html).toContain('Portfolio structural forecast is stable.');
  });

  test('valid data does not show FORECAST UNAVAILABLE', () => {
    const html = buildPortfolioForecastHtml(validData());
    expect(html).not.toContain('FORECAST UNAVAILABLE');
  });

  test('valid data does not show Insufficient architecture history', () => {
    const html = buildPortfolioForecastHtml(validData());
    expect(html).not.toContain('Insufficient architecture history');
  });
});

// ── Partial snapshot warning (missingSnapshotCount) on valid data ─────────────

describe('buildPortfolioForecastHtml — partial snapshot warning on valid data', () => {
  test('missingSnapshotCount > 0 shows partial warning', () => {
    const html = buildPortfolioForecastHtml(validData({ _cache: { missingSnapshotCount: 2 } }));
    expect(html).toContain('repositories do not yet have enough architecture history for forecasting');
  });

  test('missingSnapshotCount 1 uses singular wording', () => {
    const html = buildPortfolioForecastHtml(validData({ _cache: { missingSnapshotCount: 1 } }));
    expect(html).toContain('repository does not yet have enough');
  });

  test('missingSnapshotCount 0 does not show partial warning', () => {
    const html = buildPortfolioForecastHtml(validData({ _cache: { missingSnapshotCount: 0 } }));
    expect(html).not.toContain('not yet have enough architecture history');
  });
});
