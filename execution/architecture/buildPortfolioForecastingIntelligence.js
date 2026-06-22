'use strict';

// Portfolio Forecasting Intelligence
// Aggregates repository-level structural degradation forecasts into
// organisation-wide predictive engineering intelligence.
//
// Input:  { repoForecasts: [{ repoId, repoName, forecastLevel, degradationRisk,
//             confidenceLevel, trajectory, riskFactors, structuralProjection,
//             recommendations }] }
//
// Output: portfolioForecastLevel, portfolioForecastScore, confidenceLevel,
//         summary, forecastDistribution, projectedRiskRepos, projectedHotspots,
//         projectedCouplingPressure, projectedGovernanceRisk, trendForecast,
//         recommendations, benchmarking
//
// Pure function — no I/O, no mutation of input, deterministic output.

const MAX_RECS  = 5;
const BENCH_MAX = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeNumber(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : 0;
}

function _safeStr(v) {
  return typeof v === 'string' ? v : '';
}

function _round1(n) {
  return Math.round(n * 10) / 10;
}

// ── Unknown result ─────────────────────────────────────────────────────────────

function _unknownResult() {
  return {
    portfolioForecastLevel:    'unknown',
    portfolioForecastScore:    0,
    confidenceLevel:           'low',
    summary:                   'Insufficient forecast data — no repository forecasts provided.',
    forecastDistribution:      { stable: 0, watch: 0, degrading: 0, critical: 0, unknown: 0 },
    projectedRiskRepos:        [],
    projectedHotspots:         [],
    projectedCouplingPressure: {
      level: 'low', reposAtRisk: [], acceleratingRepos: [], projectedCircularDependencyRepos: [],
    },
    projectedGovernanceRisk: {
      level: 'low', degradingRepos: [], criticalRepos: [], unstableRepos: [], governanceRiskScore: 0,
    },
    trendForecast:   { direction: 'stable', averageRisk: 0, highestRisk: 0, lowestRisk: 0, volatility: 0 },
    recommendations: [],
    benchmarking:    { topStableRepos: [], highestRiskRepos: [], improvingCandidates: [], criticalForecasts: [] },
  };
}

// ── Portfolio score & level ───────────────────────────────────────────────────

function _portfolioScore(forecasts) {
  const valid = forecasts.filter(function(f) { return _safeStr(f.forecastLevel) !== 'unknown'; });
  if (valid.length === 0) return 0;
  const sum = valid.reduce(function(s, f) { return s + _safeNumber(f.degradationRisk); }, 0);
  return Math.round(sum / valid.length);
}

function _portfolioLevel(score) {
  if (score >= 75) return 'critical';
  if (score >= 45) return 'degrading';
  if (score >= 20) return 'watch';
  return 'stable';
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(forecasts) {
  const n = forecasts.length;
  if (n < 3) return 'low';
  if (n < 5) return 'medium';
  const highMed = forecasts.filter(function(f) {
    return f.confidenceLevel === 'high' || f.confidenceLevel === 'medium';
  }).length;
  return (highMed / n >= 0.70) ? 'high' : 'medium';
}

// ── Forecast distribution ─────────────────────────────────────────────────────

function _distribution(forecasts) {
  const d = { stable: 0, watch: 0, degrading: 0, critical: 0, unknown: 0 };
  forecasts.forEach(function(f) {
    const level = _safeStr(f.forecastLevel) || 'unknown';
    if (Object.prototype.hasOwnProperty.call(d, level)) d[level]++;
    else d.unknown++;
  });
  return d;
}

// ── Projected risk repos ──────────────────────────────────────────────────────

function _projectedRiskRepos(forecasts) {
  return forecasts
    .filter(function(f) { return f.forecastLevel === 'degrading' || f.forecastLevel === 'critical'; })
    .map(function(f) {
      const rf   = _safeArray(f.riskFactors);
      const traj = f.trajectory || {};
      return {
        repoId:          f.repoId,
        repoName:        _safeStr(f.repoName),
        forecastLevel:   _safeStr(f.forecastLevel),
        degradationRisk: _safeNumber(f.degradationRisk),
        confidenceLevel: _safeStr(f.confidenceLevel),
        primaryRisk:     rf.length > 0 ? _safeStr(rf[0].type) : '',
        projectedLevel:  _safeStr(traj.projectedLevel),
      };
    })
    .sort(function(a, b) {
      if (b.degradationRisk !== a.degradationRisk) return b.degradationRisk - a.degradationRisk;
      return a.repoName.localeCompare(b.repoName);
    });
}

// ── Projected hotspots ────────────────────────────────────────────────────────

function _hotspotSeverity(count) {
  if (count >= 5) return 'critical';
  if (count >= 3) return 'high';
  if (count >= 2) return 'medium';
  return 'low';
}

const HOTSPOT_SPECS = [
  {
    type: 'coupling',
    match: function(f) {
      const sp = f.structuralProjection || {};
      const v  = _safeStr(sp.couplingForecast);
      return v !== 'stable' && v !== '';
    },
  },
  {
    type: 'implementation',
    match: function(f) {
      const sp = f.structuralProjection || {};
      const v  = _safeStr(sp.implementationHealthForecast);
      return v !== 'stable' && v !== '';
    },
  },
  {
    type: 'boundary',
    match: function(f) {
      const sp = f.structuralProjection || {};
      const v  = _safeStr(sp.boundaryIntegrityForecast);
      return v !== 'stable' && v !== '';
    },
  },
  {
    type: 'volatility',
    match: function(f) {
      const traj = f.trajectory || {};
      return _safeStr(traj.scoreTrend) === 'volatile';
    },
  },
  {
    type: 'regression',
    match: function(f) {
      return f.forecastLevel === 'degrading' || f.forecastLevel === 'critical';
    },
  },
];

function _projectedHotspots(forecasts) {
  const hotspots = [];
  HOTSPOT_SPECS.forEach(function(spec) {
    const matched = forecasts.filter(spec.match);
    if (matched.length === 0) return;
    const repoCount = matched.length;
    hotspots.push({
      type:      spec.type,
      severity:  _hotspotSeverity(repoCount),
      repoCount,
      repos:     matched.map(function(f) { return { repoId: f.repoId, repoName: _safeStr(f.repoName) }; }),
      summary:   repoCount + ' repo' + (repoCount !== 1 ? 's' : '') + ' projected to experience ' + spec.type + ' issues.',
    });
  });
  return hotspots;
}

// ── Projected coupling pressure ───────────────────────────────────────────────

function _couplingPressureLevel(atRiskCount, acceleratingCount) {
  if (acceleratingCount >= 5 || atRiskCount >= 8) return 'critical';
  if (acceleratingCount >= 3 || atRiskCount >= 5) return 'high';
  if (acceleratingCount >= 1 || atRiskCount >= 3) return 'medium';
  return 'low';
}

function _projectedCouplingPressure(forecasts) {
  const atRisk = forecasts.filter(function(f) {
    const sp = f.structuralProjection || {};
    const cf = _safeStr(sp.couplingForecast);
    return cf === 'growing' || cf === 'accelerating';
  });
  const accelerating = forecasts.filter(function(f) {
    const sp = f.structuralProjection || {};
    return _safeStr(sp.couplingForecast) === 'accelerating';
  });
  const circular = forecasts.filter(function(f) {
    return _safeArray(f.riskFactors).some(function(rf) {
      return _safeStr(rf.type) === 'coupling_acceleration';
    });
  });

  const toRef = function(f) { return { repoId: f.repoId, repoName: _safeStr(f.repoName) }; };

  return {
    level:                           _couplingPressureLevel(atRisk.length, accelerating.length),
    reposAtRisk:                     atRisk.map(toRef),
    acceleratingRepos:               accelerating.map(toRef),
    projectedCircularDependencyRepos: circular.map(toRef),
  };
}

// ── Projected governance risk ─────────────────────────────────────────────────

function _governanceLevel(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 25) return 'medium';
  return 'low';
}

function _projectedGovernanceRisk(forecasts) {
  const degrading = forecasts.filter(function(f) { return f.forecastLevel === 'degrading'; });
  const critical  = forecasts.filter(function(f) { return f.forecastLevel === 'critical'; });
  const unstable  = forecasts.filter(function(f) {
    return _safeStr((f.trajectory || {}).scoreTrend) === 'volatile';
  });
  const accel = forecasts.filter(function(f) {
    return _safeStr((f.structuralProjection || {}).couplingForecast) === 'accelerating';
  });

  const score = Math.min(
    critical.length  * 15
    + degrading.length * 8
    + unstable.length  * 5
    + accel.length     * 5,
    100
  );

  const toRef = function(f) { return { repoId: f.repoId, repoName: _safeStr(f.repoName) }; };

  return {
    level:               _governanceLevel(score),
    degradingRepos:      degrading.map(toRef),
    criticalRepos:       critical.map(toRef),
    unstableRepos:       unstable.map(toRef),
    governanceRiskScore: score,
  };
}

// ── Trend forecast ────────────────────────────────────────────────────────────

function _trendForecast(forecasts, portfolioScore) {
  const valid = forecasts.filter(function(f) { return _safeStr(f.forecastLevel) !== 'unknown'; });
  if (valid.length === 0) {
    return { direction: 'stable', averageRisk: 0, highestRisk: 0, lowestRisk: 0, volatility: 0 };
  }

  const risks    = valid.map(function(f) { return _safeNumber(f.degradationRisk); });
  const high     = Math.max.apply(null, risks);
  const low      = Math.min.apply(null, risks);
  const avg      = portfolioScore;
  const variance = risks.reduce(function(s, r) { return s + Math.pow(r - avg, 2); }, 0) / risks.length;

  const stableCount    = forecasts.filter(function(f) { return f.forecastLevel === 'stable'; }).length;
  const majorityStable = forecasts.length > 0 && stableCount / forecasts.length > 0.5;

  let direction;
  if (avg >= 45)               direction = 'degrading';
  else if (avg <= 20 && majorityStable) direction = 'improving';
  else                         direction = 'stable';

  return {
    direction,
    averageRisk:  avg,
    highestRisk:  high,
    lowestRisk:   low,
    volatility:   _round1(Math.sqrt(variance)),
  };
}

// ── Benchmarking ──────────────────────────────────────────────────────────────

function _benchmarking(forecasts) {
  const toRef = function(f) {
    return {
      repoId:          f.repoId,
      repoName:        _safeStr(f.repoName),
      forecastLevel:   _safeStr(f.forecastLevel),
      degradationRisk: _safeNumber(f.degradationRisk),
    };
  };

  const topStable = forecasts
    .filter(function(f) { return f.forecastLevel === 'stable'; })
    .sort(function(a, b) {
      if (a.degradationRisk !== b.degradationRisk) return a.degradationRisk - b.degradationRisk;
      return _safeStr(a.repoName).localeCompare(_safeStr(b.repoName));
    })
    .slice(0, BENCH_MAX)
    .map(toRef);

  const highestRisk = forecasts
    .filter(function(f) { return _safeStr(f.forecastLevel) !== 'unknown'; })
    .sort(function(a, b) {
      if (b.degradationRisk !== a.degradationRisk) return b.degradationRisk - a.degradationRisk;
      return _safeStr(a.repoName).localeCompare(_safeStr(b.repoName));
    })
    .slice(0, BENCH_MAX)
    .map(toRef);

  const improving = forecasts
    .filter(function(f) {
      return (f.forecastLevel === 'stable' || f.forecastLevel === 'watch')
        && _safeStr((f.trajectory || {}).scoreTrend) === 'improving';
    })
    .sort(function(a, b) { return _safeStr(a.repoName).localeCompare(_safeStr(b.repoName)); })
    .slice(0, BENCH_MAX)
    .map(toRef);

  const criticals = forecasts
    .filter(function(f) { return f.forecastLevel === 'critical'; })
    .sort(function(a, b) {
      if (b.degradationRisk !== a.degradationRisk) return b.degradationRisk - a.degradationRisk;
      return _safeStr(a.repoName).localeCompare(_safeStr(b.repoName));
    })
    .slice(0, BENCH_MAX)
    .map(toRef);

  return {
    topStableRepos:      topStable,
    highestRiskRepos:    highestRisk,
    improvingCandidates: improving,
    criticalForecasts:   criticals,
  };
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(forecasts, portfolioLevel, couplingPressure, governanceRisk, hotspots) {
  const recs = [];

  const criticalCount = forecasts.filter(function(f) { return f.forecastLevel === 'critical'; }).length;
  if (criticalCount > 0 && recs.length < MAX_RECS) {
    recs.push(
      criticalCount + ' repo' + (criticalCount !== 1 ? 's have' : ' has')
      + ' critical structural degradation forecasts — prioritize immediate architectural remediation.'
    );
  }

  if ((couplingPressure.level === 'high' || couplingPressure.level === 'critical') && recs.length < MAX_RECS) {
    recs.push(
      'Coupling pressure is ' + couplingPressure.level + ' across '
      + couplingPressure.reposAtRisk.length + ' repo(s) — enforce dependency boundaries and audit cross-service coupling.'
    );
  }

  const implHotspot = hotspots.find(function(h) { return h.type === 'implementation'; });
  if (implHotspot && (implHotspot.severity === 'high' || implHotspot.severity === 'critical') && recs.length < MAX_RECS) {
    recs.push(
      'Implementation health is degrading across ' + implHotspot.repoCount
      + ' repo(s) — complete in-progress work and reduce structural debt before adding features.'
    );
  }

  if ((governanceRisk.level === 'high' || governanceRisk.level === 'critical') && recs.length < MAX_RECS) {
    recs.push(
      'Portfolio governance risk score is ' + governanceRisk.governanceRiskScore
      + ' — establish architectural review gates and stabilize degrading repositories.'
    );
  }

  const severeHotspots = hotspots.filter(function(h) { return h.severity === 'high' || h.severity === 'critical'; });
  if (severeHotspots.length >= 2 && recs.length < MAX_RECS) {
    recs.push(
      severeHotspots.length + ' structural hotspot categories detected at high or critical severity — conduct cross-team architectural review.'
    );
  } else if (portfolioLevel === 'degrading' && recs.length < MAX_RECS) {
    recs.push('Portfolio structural forecast is degrading — initiate portfolio-wide architectural health review.');
  } else if (portfolioLevel === 'watch' && recs.length < MAX_RECS) {
    recs.push('Portfolio is trending toward structural risk — monitor degradation signals and plan proactive remediation.');
  }

  return recs.slice(0, MAX_RECS);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(portfolioLevel, portfolioScore, n, dist) {
  if (portfolioLevel === 'stable') {
    return 'Portfolio structural forecast is stable (score: ' + portfolioScore + ') across ' + n + ' repo(s). No significant degradation risk detected.';
  }
  const degraded = dist.degrading + dist.critical;
  return (
    'Portfolio structural forecast: ' + portfolioLevel
    + ' (score: ' + portfolioScore + ') across ' + n + ' repo(s). '
    + degraded + ' repo(s) are degrading or critical.'
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function buildPortfolioForecastingIntelligence(input) {
  if (!input || typeof input !== 'object') return _unknownResult();

  const forecasts = _safeArray(input.repoForecasts);
  if (forecasts.length === 0) return _unknownResult();

  const forecastableCount = forecasts.filter(function(f) { return _safeStr(f.forecastLevel) !== 'unknown'; }).length;
  if (forecastableCount === 0) return _unknownResult();

  const portfolioScore    = _portfolioScore(forecasts);
  const portfolioLevel    = _portfolioLevel(portfolioScore);
  const confidenceLevel   = _confidenceLevel(forecasts);
  const dist              = _distribution(forecasts);
  const riskRepos         = _projectedRiskRepos(forecasts);
  const hotspots          = _projectedHotspots(forecasts);
  const couplingPressure  = _projectedCouplingPressure(forecasts);
  const governanceRisk    = _projectedGovernanceRisk(forecasts);
  const trendForecast     = _trendForecast(forecasts, portfolioScore);
  const bench             = _benchmarking(forecasts);
  const recs              = _recommendations(forecasts, portfolioLevel, couplingPressure, governanceRisk, hotspots);
  const summary           = _summary(portfolioLevel, portfolioScore, forecasts.length, dist);

  return {
    portfolioForecastLevel:    portfolioLevel,
    portfolioForecastScore:    portfolioScore,
    confidenceLevel,
    summary,
    forecastDistribution:      dist,
    projectedRiskRepos:        riskRepos,
    projectedHotspots:         hotspots,
    projectedCouplingPressure: couplingPressure,
    projectedGovernanceRisk:   governanceRisk,
    trendForecast,
    recommendations:           recs,
    benchmarking:              bench,
  };
}

module.exports = { buildPortfolioForecastingIntelligence };
