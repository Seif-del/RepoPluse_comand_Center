'use strict';

const { scoreEngineeringGovernance } = require('../../../../execution/architecture/scoreEngineeringGovernance');

// ── Factories ─────────────────────────────────────────────────────────────────

function makeArchitecture(score, level, opts) {
  opts = opts || {};
  return {
    portfolioArchitectureScore: score,
    architectureLevel:          level,
    confidenceLevel:            opts.confidence || 'medium',
    systemicBoundaryViolations: opts.violations || [],
    portfolioCoupling: {
      couplingLevel: opts.couplingLevel || 'low',
    },
    implementationIntegrity: {
      averageCompletenessScore: opts.implScore != null ? opts.implScore : 80,
    },
  };
}

function makeMaturity(score, level, opts) {
  opts = opts || {};
  return {
    portfolioMaturityScore: score,
    maturityLevel:          level,
    confidenceLevel:        opts.confidence || 'medium',
    commonGaps:             opts.gaps || [],
  };
}

function makeBehavioral(score, level, opts) {
  opts = opts || {};
  return {
    indexScore:      score,
    stabilityLevel:  level,
    confidenceLevel: opts.confidence || 'medium',
    drivers:         opts.drivers || [],
  };
}

function makeForecast(score, level, opts) {
  opts = opts || {};
  return {
    portfolioForecastScore: score,
    portfolioForecastLevel: level,
    confidenceLevel:        opts.confidence || 'medium',
    projectedHotspots:      opts.hotspots || [],
    projectedGovernanceRisk: {
      governanceRiskScore: opts.govRisk != null ? opts.govRisk : 0,
    },
  };
}

function makeAnomalies(score, level, opts) {
  opts = opts || {};
  return {
    anomalyScore:    score,
    anomalyLevel:    level,
    confidenceLevel: opts.confidence || 'medium',
    anomalies:       opts.anomalies || [],
  };
}

function makeRegressions(score, level, opts) {
  opts = opts || {};
  return {
    regressionScore: score,
    regressionLevel: level,
    confidenceLevel: opts.confidence || 'medium',
  };
}

function makeCoupling(score, level, opts) {
  opts = opts || {};
  return {
    couplingGrowthScore: score,
    alertLevel:          level,
    confidenceLevel:     opts.confidence || 'medium',
  };
}

function allDims(overrides) {
  overrides = overrides || {};
  return {
    portfolioArchitecture:  overrides.arch       != null ? overrides.arch       : makeArchitecture(80, 'healthy'),
    portfolioMaturity:      overrides.maturity    != null ? overrides.maturity    : makeMaturity(80, 'mature'),
    behavioralStability:    overrides.behavioral  != null ? overrides.behavioral  : makeBehavioral(80, 'stable'),
    portfolioForecast:      overrides.forecast    != null ? overrides.forecast    : makeForecast(20, 'stable'),
    architectureAnomalies:  overrides.anomalies   != null ? overrides.anomalies   : makeAnomalies(0, 'none'),
    architectureRegressions: overrides.regressions != null ? overrides.regressions : makeRegressions(0, 'none'),
    couplingAlerts:         overrides.coupling    != null ? overrides.coupling    : makeCoupling(0, 'none'),
  };
}

// ── 1. Empty / null input ──────────────────────────────────────────────────────

describe('empty/null input', function() {
  it('null => unknown', function() {
    const r = scoreEngineeringGovernance(null);
    expect(r.governanceLevel).toBe('unknown');
    expect(r.governanceScore).toBe(0);
    expect(r.confidenceLevel).toBe('low');
  });

  it('undefined => unknown', function() {
    const r = scoreEngineeringGovernance(undefined);
    expect(r.governanceLevel).toBe('unknown');
  });

  it('empty object => unknown', function() {
    const r = scoreEngineeringGovernance({});
    expect(r.governanceLevel).toBe('unknown');
    expect(r.governanceScore).toBe(0);
  });

  it('unknown returns full output shape', function() {
    const r = scoreEngineeringGovernance(null);
    expect(r).toHaveProperty('governanceScore');
    expect(r).toHaveProperty('governanceLevel');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('dimensions');
    expect(r).toHaveProperty('governanceRisks');
    expect(r).toHaveProperty('strengths');
    expect(r).toHaveProperty('executiveSignals');
    expect(r).toHaveProperty('recommendations');
  });

  it('unknown dimensions all null/unknown', function() {
    const r = scoreEngineeringGovernance({});
    const dims = r.dimensions;
    for (const key of Object.keys(dims)) {
      expect(dims[key].score).toBeNull();
      expect(dims[key].level).toBe('unknown');
      expect(dims[key].drivers).toEqual([]);
    }
  });
});

// ── 2. Output shape ────────────────────────────────────────────────────────────

describe('output shape', function() {
  it('returns all top-level keys', function() {
    const r = scoreEngineeringGovernance(allDims());
    expect(r).toHaveProperty('governanceScore');
    expect(r).toHaveProperty('governanceLevel');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('dimensions');
    expect(r).toHaveProperty('governanceRisks');
    expect(r).toHaveProperty('strengths');
    expect(r).toHaveProperty('executiveSignals');
    expect(r).toHaveProperty('recommendations');
  });

  it('dimensions has all 5 keys', function() {
    const r = scoreEngineeringGovernance(allDims());
    const dims = r.dimensions;
    expect(dims).toHaveProperty('architectureGovernance');
    expect(dims).toHaveProperty('maturityGovernance');
    expect(dims).toHaveProperty('behavioralGovernance');
    expect(dims).toHaveProperty('predictiveGovernance');
    expect(dims).toHaveProperty('anomalyGovernance');
  });

  it('each dimension has score, level, drivers', function() {
    const r = scoreEngineeringGovernance(allDims());
    for (const key of Object.keys(r.dimensions)) {
      const d = r.dimensions[key];
      expect(d).toHaveProperty('score');
      expect(d).toHaveProperty('level');
      expect(d).toHaveProperty('drivers');
      expect(Array.isArray(d.drivers)).toBe(true);
    }
  });

  it('executiveSignals has all required keys', function() {
    const r = scoreEngineeringGovernance(allDims());
    const es = r.executiveSignals;
    expect(es).toHaveProperty('interventionRequired');
    expect(es).toHaveProperty('highestRiskArea');
    expect(es).toHaveProperty('lowestScoringDimension');
    expect(es).toHaveProperty('strongestDimension');
    expect(es).toHaveProperty('forecastConcern');
    expect(es).toHaveProperty('anomalyConcern');
    expect(es).toHaveProperty('confidenceConcern');
  });

  it('governance risks have required fields', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(10, 'risky'),
    }));
    for (const risk of r.governanceRisks) {
      expect(risk).toHaveProperty('type');
      expect(risk).toHaveProperty('severity');
      expect(risk).toHaveProperty('summary');
      expect(risk).toHaveProperty('source');
    }
  });

  it('strengths have required fields', function() {
    const r = scoreEngineeringGovernance(allDims());
    for (const s of r.strengths) {
      expect(s).toHaveProperty('type');
      expect(s).toHaveProperty('summary');
      expect(s).toHaveProperty('source');
    }
  });
});

// ── 3. Level mapping ───────────────────────────────────────────────────────────

describe('governance level mapping', function() {
  it('score >= 85 => excellent', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(90, 'healthy'),
      maturity:   makeMaturity(90, 'mature'),
      behavioral: makeBehavioral(90, 'stable'),
      forecast:   makeForecast(10, 'stable'),   // governance = 100 - 10 = 90
      anomalies:  makeAnomalies(10, 'watch'),   // governance = 100 - 10 = 90
    }));
    expect(r.governanceLevel).toBe('excellent');
    expect(r.governanceScore).toBeGreaterThanOrEqual(85);
  });

  it('score 70-84 => strong', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(75, 'healthy'),
      maturity:   makeMaturity(75, 'mature'),
      behavioral: makeBehavioral(75, 'stable'),
      forecast:   makeForecast(25, 'watch'),   // governance = 75
      anomalies:  makeAnomalies(25, 'watch'),  // governance = 75
    }));
    expect(r.governanceLevel).toBe('strong');
    expect(r.governanceScore).toBeGreaterThanOrEqual(70);
    expect(r.governanceScore).toBeLessThanOrEqual(84);
  });

  it('score 45-69 => watch', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(55, 'watch'),
      maturity:   makeMaturity(55, 'developing'),
      behavioral: makeBehavioral(55, 'watch'),
      forecast:   makeForecast(45, 'watch'),   // governance = 55
      anomalies:  makeAnomalies(45, 'anomaly'), // governance = 55
    }));
    expect(r.governanceLevel).toBe('watch');
    expect(r.governanceScore).toBeGreaterThanOrEqual(45);
    expect(r.governanceScore).toBeLessThanOrEqual(69);
  });

  it('score 20-44 => weak', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(30, 'risky'),
      maturity:   makeMaturity(30, 'immature'),
      behavioral: makeBehavioral(30, 'volatile'),
      forecast:   makeForecast(70, 'degrading'), // governance = 30
      anomalies:  makeAnomalies(70, 'critical'),  // governance = 30
    }));
    expect(r.governanceLevel).toBe('weak');
    expect(r.governanceScore).toBeGreaterThanOrEqual(20);
    expect(r.governanceScore).toBeLessThanOrEqual(44);
  });

  it('score 1-19 => critical', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(10, 'risky'),
      maturity:   makeMaturity(10, 'immature'),
      behavioral: makeBehavioral(10, 'unstable'),
      forecast:   makeForecast(90, 'critical'),  // governance = 10
      anomalies:  makeAnomalies(90, 'critical'),  // governance = 10
    }));
    expect(r.governanceLevel).toBe('critical');
    expect(r.governanceScore).toBeGreaterThanOrEqual(1);
    expect(r.governanceScore).toBeLessThanOrEqual(19);
  });
});

// ── 4. Weighted score calculation ─────────────────────────────────────────────

describe('weighted score calculation', function() {
  it('uses 30/20/20/20/10 weights', function() {
    // arch=80, maturity=60, behavioral=40, predictive=100-20=80, anomaly=100-0=100
    // weighted = 80*0.3 + 60*0.2 + 40*0.2 + 80*0.2 + 100*0.1
    //          = 24 + 12 + 8 + 16 + 10 = 70
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(80, 'healthy', { confidence: 'high' }),
      portfolioMaturity:       makeMaturity(60, 'developing', { confidence: 'high' }),
      behavioralStability:     makeBehavioral(40, 'volatile', { confidence: 'medium' }),
      portfolioForecast:       makeForecast(20, 'stable', { confidence: 'medium' }),
      architectureAnomalies:   makeAnomalies(0, 'none', { confidence: 'medium' }),
      architectureRegressions: makeRegressions(0, 'none'),
      couplingAlerts:          makeCoupling(0, 'none'),
    });
    expect(r.governanceScore).toBe(70);
    expect(r.governanceLevel).toBe('strong');
  });

  it('normalizes weight when dimensions are missing', function() {
    // Only arch (30%) and maturity (20%) available — effective weight 0.50
    // arch=80, maturity=60 => (80*0.3 + 60*0.2) / 0.5 = (24 + 12) / 0.5 = 72
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy'),
      portfolioMaturity:     makeMaturity(60, 'developing'),
    });
    expect(r.governanceScore).toBe(72);
    expect(r.governanceLevel).toBe('strong');
  });

  it('single dimension produces valid score', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(50, 'watch'),
    });
    expect(r.governanceScore).toBe(50);
    expect(r.governanceLevel).toBe('watch');
  });

  it('score is always integer', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(77, 'healthy'),
      maturity:   makeMaturity(63, 'developing'),
      behavioral: makeBehavioral(51, 'watch'),
      forecast:   makeForecast(37, 'watch'),
      anomalies:  makeAnomalies(43, 'anomaly'),
    }));
    expect(Number.isInteger(r.governanceScore)).toBe(true);
  });
});

// ── 5. Risk-style inversion ────────────────────────────────────────────────────

describe('risk-style score inversion', function() {
  it('degradationRisk 80 => predictive governance score 20', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(80, 'degrading'),
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(20);
  });

  it('anomalyScore 70 => anomaly governance score 30', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(70, 'critical'),
    });
    expect(r.dimensions.anomalyGovernance.score).toBe(30);
  });

  it('portfolioForecastScore 0 => predictive score 100', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(0, 'stable'),
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(100);
  });

  it('anomalyScore 0 => anomaly governance score 100', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(0, 'none'),
    });
    expect(r.dimensions.anomalyGovernance.score).toBe(100);
  });

  it('regression score inverted when anomalies absent', function() {
    const r = scoreEngineeringGovernance({
      architectureRegressions: makeRegressions(60, 'regression'),
    });
    expect(r.dimensions.anomalyGovernance.score).toBe(40);
  });

  it('coupling score inverted when anomalies and regressions absent', function() {
    const r = scoreEngineeringGovernance({
      couplingAlerts: makeCoupling(40, 'alert'),
    });
    expect(r.dimensions.anomalyGovernance.score).toBe(60);
  });
});

// ── 6. Architecture dimension ─────────────────────────────────────────────────

describe('architectureGovernance dimension', function() {
  it('uses portfolioArchitectureScore directly', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(72, 'healthy'),
    });
    expect(r.dimensions.architectureGovernance.score).toBe(72);
  });

  it('architectureLevel unknown => dimension unknown', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: {
        portfolioArchitectureScore: 70,
        architectureLevel: 'unknown',
        confidenceLevel: 'medium',
        systemicBoundaryViolations: [],
        portfolioCoupling: { couplingLevel: 'low' },
        implementationIntegrity: { averageCompletenessScore: 80 },
      },
    });
    expect(r.dimensions.architectureGovernance.score).toBeNull();
    expect(r.dimensions.architectureGovernance.level).toBe('unknown');
  });

  it('missing portfolioArchitecture => dimension unknown', function() {
    const r = scoreEngineeringGovernance({ portfolioMaturity: makeMaturity(80, 'mature') });
    expect(r.dimensions.architectureGovernance.score).toBeNull();
    expect(r.dimensions.architectureGovernance.level).toBe('unknown');
  });

  it('includes coupling level in drivers', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(70, 'healthy', { couplingLevel: 'critical' }),
    });
    const drivers = r.dimensions.architectureGovernance.drivers;
    expect(drivers.some(d => d.includes('coupling') || d.includes('critical'))).toBe(true);
  });

  it('includes boundary violations in drivers', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(70, 'healthy', { violations: [{}, {}] }),
    });
    const drivers = r.dimensions.architectureGovernance.drivers;
    expect(drivers.some(d => d.includes('violation') || d.includes('boundary'))).toBe(true);
  });

  it('score clamped 0-100', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(150, 'healthy'),
    });
    expect(r.dimensions.architectureGovernance.score).toBe(100);
  });
});

// ── 7. Maturity dimension ─────────────────────────────────────────────────────

describe('maturityGovernance dimension', function() {
  it('uses portfolioMaturityScore directly', function() {
    const r = scoreEngineeringGovernance({ portfolioMaturity: makeMaturity(65, 'developing') });
    expect(r.dimensions.maturityGovernance.score).toBe(65);
  });

  it('missing portfolioMaturity => dimension unknown', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.dimensions.maturityGovernance.score).toBeNull();
    expect(r.dimensions.maturityGovernance.level).toBe('unknown');
  });

  it('includes maturityLevel in drivers', function() {
    const r = scoreEngineeringGovernance({ portfolioMaturity: makeMaturity(40, 'immature') });
    const d = r.dimensions.maturityGovernance.drivers;
    expect(d.some(s => s.includes('immature'))).toBe(true);
  });

  it('includes common gaps in drivers', function() {
    const r = scoreEngineeringGovernance({
      portfolioMaturity: makeMaturity(50, 'developing', { gaps: ['testing', 'docs', 'ci'] }),
    });
    const d = r.dimensions.maturityGovernance.drivers;
    expect(d.some(s => s.includes('gap') || s.includes('3'))).toBe(true);
  });

  it('level mapping: score 80 => strong', function() {
    const r = scoreEngineeringGovernance({ portfolioMaturity: makeMaturity(80, 'mature') });
    expect(r.dimensions.maturityGovernance.level).toBe('strong');
  });
});

// ── 8. Behavioral dimension ───────────────────────────────────────────────────

describe('behavioralGovernance dimension', function() {
  it('uses indexScore directly', function() {
    const r = scoreEngineeringGovernance({ behavioralStability: makeBehavioral(55, 'watch') });
    expect(r.dimensions.behavioralGovernance.score).toBe(55);
  });

  it('missing behavioralStability => dimension unknown', function() {
    const r = scoreEngineeringGovernance({ portfolioMaturity: makeMaturity(80, 'mature') });
    expect(r.dimensions.behavioralGovernance.score).toBeNull();
  });

  it('includes stabilityLevel in drivers', function() {
    const r = scoreEngineeringGovernance({ behavioralStability: makeBehavioral(30, 'unstable') });
    expect(r.dimensions.behavioralGovernance.drivers.some(d => d.includes('unstable'))).toBe(true);
  });

  it('includes driver count in drivers', function() {
    const r = scoreEngineeringGovernance({
      behavioralStability: makeBehavioral(60, 'watch', { drivers: ['a', 'b', 'c'] }),
    });
    expect(r.dimensions.behavioralGovernance.drivers.some(d => d.includes('3'))).toBe(true);
  });

  it('level mapping: score 90 => excellent', function() {
    const r = scoreEngineeringGovernance({ behavioralStability: makeBehavioral(90, 'stable') });
    expect(r.dimensions.behavioralGovernance.level).toBe('excellent');
  });
});

// ── 9. Predictive dimension ───────────────────────────────────────────────────

describe('predictiveGovernance dimension', function() {
  it('inverts portfolioForecastScore', function() {
    const r = scoreEngineeringGovernance({ portfolioForecast: makeForecast(35, 'watch') });
    expect(r.dimensions.predictiveGovernance.score).toBe(65);
  });

  it('missing portfolioForecast => dimension unknown', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.dimensions.predictiveGovernance.score).toBeNull();
  });

  it('forecastLevel=stable => high predictive score when no forecastScore', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: {
        portfolioForecastLevel: 'stable',
        confidenceLevel: 'medium',
        projectedHotspots: [],
        projectedGovernanceRisk: { governanceRiskScore: 0 },
        // no portfolioForecastScore
      },
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(85);
  });

  it('forecastLevel=critical => low predictive score when no forecastScore', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: {
        portfolioForecastLevel: 'critical',
        confidenceLevel: 'medium',
        projectedHotspots: [],
        projectedGovernanceRisk: { governanceRiskScore: 0 },
      },
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(10);
  });

  it('critical hotspots included in drivers', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(30, 'watch', {
        hotspots: [{ severity: 'critical' }, { severity: 'high' }],
      }),
    });
    expect(r.dimensions.predictiveGovernance.drivers.some(d => d.includes('critical'))).toBe(true);
  });

  it('forecastLevel unknown + no score => dimension unknown', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: {
        portfolioForecastLevel: 'unknown',
        confidenceLevel: 'low',
        projectedHotspots: [],
        projectedGovernanceRisk: { governanceRiskScore: 0 },
      },
    });
    expect(r.dimensions.predictiveGovernance.score).toBeNull();
  });
});

// ── 10. Anomaly dimension ─────────────────────────────────────────────────────

describe('anomalyGovernance dimension', function() {
  it('inverts anomalyScore', function() {
    const r = scoreEngineeringGovernance({ architectureAnomalies: makeAnomalies(40, 'anomaly') });
    expect(r.dimensions.anomalyGovernance.score).toBe(60);
  });

  it('no anomaly sources => dimension unknown', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.dimensions.anomalyGovernance.score).toBeNull();
  });

  it('includes anomalyLevel in drivers', function() {
    const r = scoreEngineeringGovernance({ architectureAnomalies: makeAnomalies(60, 'anomaly') });
    expect(r.dimensions.anomalyGovernance.drivers.some(d => d.includes('anomaly'))).toBe(true);
  });

  it('includes critical anomaly count in drivers', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(50, 'critical', {
        anomalies: [{ severity: 'critical' }, { severity: 'critical' }],
      }),
    });
    expect(r.dimensions.anomalyGovernance.drivers.some(d => d.includes('critical'))).toBe(true);
  });

  it('regression level present in drivers when relevant', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies:   makeAnomalies(30, 'watch'),
      architectureRegressions: makeRegressions(40, 'regression'),
    });
    const d = r.dimensions.anomalyGovernance.drivers;
    expect(d.some(s => s.includes('regression'))).toBe(true);
  });

  it('coupling alert level present in drivers when relevant', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(30, 'watch'),
      couplingAlerts:        makeCoupling(40, 'alert'),
    });
    const d = r.dimensions.anomalyGovernance.drivers;
    expect(d.some(s => s.includes('alert') || s.includes('coupling'))).toBe(true);
  });

  it('regressionLevel none not in drivers', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies:   makeAnomalies(10, 'watch'),
      architectureRegressions: makeRegressions(0, 'none'),
    });
    const d = r.dimensions.anomalyGovernance.drivers;
    expect(d.some(s => s.includes('none'))).toBe(false);
  });
});

// ── 11. Missing dimensions reduce confidence, not crash ───────────────────────

describe('missing dimensions reduce confidence', function() {
  it('only 1 dimension => low confidence', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.confidenceLevel).toBe('low');
  });

  it('only 2 dimensions => low confidence', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy'),
      portfolioMaturity:     makeMaturity(80, 'mature'),
    });
    expect(r.confidenceLevel).toBe('low');
  });

  it('3 dimensions => at least medium confidence', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy'),
      portfolioMaturity:     makeMaturity(80, 'mature'),
      behavioralStability:   makeBehavioral(80, 'stable'),
    });
    expect(['medium', 'high']).toContain(r.confidenceLevel);
  });

  it('4+ dimensions with 3+ medium/high conf => high confidence', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(80, 'healthy', { confidence: 'high' }),
      portfolioMaturity:       makeMaturity(80, 'mature',    { confidence: 'high' }),
      behavioralStability:     makeBehavioral(80, 'stable',   { confidence: 'high' }),
      portfolioForecast:       makeForecast(20, 'stable',    { confidence: 'medium' }),
      architectureAnomalies:   makeAnomalies(10, 'none',     { confidence: 'low' }),
    });
    expect(r.confidenceLevel).toBe('high');
  });

  it('missing dimensions do not force score to 0', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy'),
    });
    expect(r.governanceScore).toBeGreaterThan(0);
    expect(r.governanceLevel).not.toBe('unknown');
  });

  it('governance level not unknown with any single usable dimension', function() {
    const r = scoreEngineeringGovernance({
      behavioralStability: makeBehavioral(70, 'watch'),
    });
    expect(r.governanceLevel).not.toBe('unknown');
  });
});

// ── 12. Governance risks aggregation ─────────────────────────────────────────

describe('governanceRisks aggregation', function() {
  it('critical dimension generates critical risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(10, 'risky'),
    }));
    const critRisk = r.governanceRisks.find(function(risk) {
      return risk.severity === 'critical';
    });
    expect(critRisk).toBeTruthy();
  });

  it('weak dimension generates high risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(30, 'risky'),
    }));
    const highRisk = r.governanceRisks.find(function(risk) {
      return risk.severity === 'high';
    });
    expect(highRisk).toBeTruthy();
  });

  it('critical portfolio forecast generates critical risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      forecast: makeForecast(90, 'critical'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'portfolio_forecast_critical';
    });
    expect(risk).toBeTruthy();
    expect(risk.severity).toBe('critical');
  });

  it('degrading portfolio forecast generates high risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      forecast: makeForecast(70, 'degrading'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'portfolio_forecast_degrading';
    });
    expect(risk).toBeTruthy();
    expect(risk.severity).toBe('high');
  });

  it('critical anomaly level generates critical risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      anomalies: makeAnomalies(80, 'critical'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'architecture_anomalies_critical';
    });
    expect(risk).toBeTruthy();
  });

  it('critical coupling alert generates critical risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      coupling: makeCoupling(80, 'critical'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'coupling_alerts_critical';
    });
    expect(risk).toBeTruthy();
  });

  it('immature maturity generates high risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      maturity: makeMaturity(15, 'immature'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'low_portfolio_maturity';
    });
    expect(risk).toBeTruthy();
  });

  it('unstable behavioral stability generates high risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      behavioral: makeBehavioral(10, 'unstable'),
    }));
    const risk = r.governanceRisks.find(function(r) {
      return r.type === 'behavioral_instability';
    });
    expect(risk).toBeTruthy();
  });

  it('capped at 7 risks', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(10, 'risky'),
      portfolioMaturity:       makeMaturity(10, 'immature'),
      behavioralStability:     makeBehavioral(10, 'unstable'),
      portfolioForecast:       makeForecast(90, 'critical'),
      architectureAnomalies:   makeAnomalies(80, 'critical'),
      architectureRegressions: makeRegressions(80, 'critical'),
      couplingAlerts:          makeCoupling(80, 'critical'),
    });
    expect(r.governanceRisks.length).toBeLessThanOrEqual(7);
  });

  it('risks sorted by severity descending', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(10, 'risky'),
      portfolioMaturity:       makeMaturity(30, 'immature'),
      behavioralStability:     makeBehavioral(10, 'volatile'),
      portfolioForecast:       makeForecast(90, 'critical'),
      architectureAnomalies:   makeAnomalies(20, 'anomaly'),
    });
    const ranks = ['critical', 'high', 'medium', 'low'];
    const sevs = r.governanceRisks.map(function(r) { return r.severity; });
    for (let i = 1; i < sevs.length; i++) {
      expect(ranks.indexOf(sevs[i])).toBeGreaterThanOrEqual(ranks.indexOf(sevs[i - 1]));
    }
  });
});

// ── 13. Strengths aggregation ─────────────────────────────────────────────────

describe('strengths aggregation', function() {
  it('excellent dimension generates strength', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(90, 'healthy'),
    }));
    const s = r.strengths.find(function(s) { return s.type === 'architectureGovernance'; });
    expect(s).toBeTruthy();
    expect(s.summary).toContain('excellent');
  });

  it('strong dimension generates strength', function() {
    const r = scoreEngineeringGovernance(allDims({
      maturity: makeMaturity(75, 'mature'),
    }));
    const s = r.strengths.find(function(s) { return s.type === 'maturityGovernance'; });
    expect(s).toBeTruthy();
    expect(s.summary).toContain('strong');
  });

  it('stable forecast generates strength', function() {
    // Use only forecast so dimension strengths don't fill the cap
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(5, 'stable'),
    });
    const s = r.strengths.find(function(s) { return s.type === 'stable_forecast'; });
    expect(s).toBeTruthy();
  });

  it('no anomalies generates strength', function() {
    // Use only anomalies so dimension strengths don't fill the cap
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(0, 'none'),
    });
    const s = r.strengths.find(function(s) { return s.type === 'no_anomalies'; });
    expect(s).toBeTruthy();
  });

  it('capped at 5 strengths', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(90, 'healthy'),
      portfolioMaturity:       makeMaturity(90, 'mature'),
      behavioralStability:     makeBehavioral(90, 'stable'),
      portfolioForecast:       makeForecast(5, 'stable'),
      architectureAnomalies:   makeAnomalies(0, 'none'),
    });
    expect(r.strengths.length).toBeLessThanOrEqual(5);
  });

  it('watch/weak/critical dimensions do not generate strengths', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(30, 'risky'),
    }));
    const s = r.strengths.find(function(s) { return s.type === 'architectureGovernance'; });
    expect(s).toBeUndefined();
  });
});

// ── 14. Executive signals ─────────────────────────────────────────────────────

describe('executiveSignals', function() {
  it('interventionRequired=true when critical governance', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:       makeArchitecture(10, 'risky'),
      maturity:   makeMaturity(10, 'immature'),
      behavioral: makeBehavioral(10, 'unstable'),
      forecast:   makeForecast(90, 'critical'),
      anomalies:  makeAnomalies(90, 'critical'),
    }));
    expect(r.executiveSignals.interventionRequired).toBe(true);
  });

  it('interventionRequired=true when any critical risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      forecast: makeForecast(90, 'critical'),
    }));
    expect(r.executiveSignals.interventionRequired).toBe(true);
  });

  it('interventionRequired=false when governance is excellent', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(90, 'healthy', { confidence: 'high' }),
      portfolioMaturity:       makeMaturity(90, 'mature', { confidence: 'high' }),
      behavioralStability:     makeBehavioral(90, 'stable', { confidence: 'high' }),
      portfolioForecast:       makeForecast(10, 'stable', { confidence: 'high' }),
      architectureAnomalies:   makeAnomalies(5, 'none', { confidence: 'high' }),
      architectureRegressions: makeRegressions(0, 'none'),
      couplingAlerts:          makeCoupling(0, 'none'),
    });
    expect(r.executiveSignals.interventionRequired).toBe(false);
  });

  it('lowestScoringDimension is the key with lowest score', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(90, 'healthy'),
      portfolioMaturity:     makeMaturity(20, 'immature'),
      behavioralStability:   makeBehavioral(80, 'stable'),
    });
    expect(r.executiveSignals.lowestScoringDimension).toBe('maturityGovernance');
  });

  it('strongestDimension is the key with highest score', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(95, 'healthy'),
      portfolioMaturity:     makeMaturity(50, 'developing'),
      behavioralStability:   makeBehavioral(60, 'watch'),
    });
    expect(r.executiveSignals.strongestDimension).toBe('architectureGovernance');
  });

  it('forecastConcern=true when predictive score < 45', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(70, 'degrading'),
    });
    expect(r.executiveSignals.forecastConcern).toBe(true);
  });

  it('forecastConcern=false when predictive score >= 45', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: makeForecast(30, 'watch'),
    });
    expect(r.executiveSignals.forecastConcern).toBe(false);
  });

  it('anomalyConcern=true when anomaly score < 45', function() {
    const r = scoreEngineeringGovernance({
      architectureAnomalies: makeAnomalies(70, 'critical'),
    });
    expect(r.executiveSignals.anomalyConcern).toBe(true);
  });

  it('confidenceConcern=true when confidenceLevel=low', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.executiveSignals.confidenceConcern).toBe(true);
  });

  it('highestRiskArea is source of highest severity risk', function() {
    const r = scoreEngineeringGovernance(allDims({
      forecast: makeForecast(90, 'critical'),
    }));
    expect(r.executiveSignals.highestRiskArea).toBeTruthy();
  });
});

// ── 15. Recommendations priority ─────────────────────────────────────────────

describe('recommendations', function() {
  it('critical risks appear first', function() {
    const r = scoreEngineeringGovernance(allDims({
      arch:     makeArchitecture(10, 'risky'),
      forecast: makeForecast(90, 'critical'),
    }));
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.recommendations[0]).toMatch(/critical/i);
  });

  it('weakest dimension advice included', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(30, 'risky'),
      portfolioMaturity:     makeMaturity(80, 'mature'),
    });
    // architecture is weakest at 30
    const hasArchAdvice = r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('architecture') || rec.toLowerCase().includes('boundary');
    });
    expect(hasArchAdvice).toBe(true);
  });

  it('no duplicate weakest-dim advice', function() {
    // score=30 => weak (not critical), so no critical-risk rec overlaps with dim advice
    const r = scoreEngineeringGovernance(allDims({
      arch: makeArchitecture(30, 'risky'),
    }));
    const archAdvice = r.recommendations.filter(function(rec) {
      return rec.toLowerCase().includes('architecture health') ||
             rec.toLowerCase().includes('boundary');
    });
    expect(archAdvice.length).toBeLessThanOrEqual(1);
  });

  it('capped at 5 recommendations', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(10, 'risky'),
      portfolioMaturity:       makeMaturity(10, 'immature'),
      behavioralStability:     makeBehavioral(10, 'unstable'),
      portfolioForecast:       makeForecast(90, 'critical'),
      architectureAnomalies:   makeAnomalies(80, 'critical'),
      architectureRegressions: makeRegressions(70, 'critical'),
      couplingAlerts:          makeCoupling(70, 'critical'),
    });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('healthy portfolio includes maintain-practices recommendation', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture:   makeArchitecture(90, 'healthy', { confidence: 'high' }),
      portfolioMaturity:       makeMaturity(90, 'mature',     { confidence: 'high' }),
      behavioralStability:     makeBehavioral(90, 'stable',   { confidence: 'high' }),
      portfolioForecast:       makeForecast(10, 'stable',     { confidence: 'high' }),
      architectureAnomalies:   makeAnomalies(5,  'none',      { confidence: 'high' }),
      architectureRegressions: makeRegressions(0, 'none'),
      couplingAlerts:          makeCoupling(0, 'none'),
    });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('maintain') || rec.toLowerCase().includes('healthy');
    })).toBe(true);
  });

  it('coupling pressure generates coupling recommendation', function() {
    const r = scoreEngineeringGovernance(allDims({
      coupling: makeCoupling(60, 'alert'),
    }));
    const hasCouplingRec = r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('coupling') || rec.toLowerCase().includes('circular');
    });
    expect(hasCouplingRec).toBe(true);
  });
});

// ── 16. Confidence levels ─────────────────────────────────────────────────────

describe('confidence levels', function() {
  it('no usable dims => unknown result with low confidence', function() {
    const r = scoreEngineeringGovernance({});
    expect(r.confidenceLevel).toBe('low');
  });

  it('1 dim => low confidence', function() {
    const r = scoreEngineeringGovernance({ portfolioArchitecture: makeArchitecture(80, 'healthy') });
    expect(r.confidenceLevel).toBe('low');
  });

  it('3 dims => at least medium', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy', { confidence: 'medium' }),
      portfolioMaturity:     makeMaturity(80, 'mature',     { confidence: 'medium' }),
      behavioralStability:   makeBehavioral(80, 'stable',   { confidence: 'medium' }),
    });
    expect(['medium', 'high']).toContain(r.confidenceLevel);
  });

  it('4 dims with 3 medium/high conf => high', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy',  { confidence: 'high' }),
      portfolioMaturity:     makeMaturity(80, 'mature',       { confidence: 'high' }),
      behavioralStability:   makeBehavioral(80, 'stable',     { confidence: 'medium' }),
      portfolioForecast:     makeForecast(20, 'stable',       { confidence: 'high' }),
    });
    expect(r.confidenceLevel).toBe('high');
  });

  it('4 dims but only 2 medium/high => medium', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: makeArchitecture(80, 'healthy',  { confidence: 'high' }),
      portfolioMaturity:     makeMaturity(80, 'mature',       { confidence: 'medium' }),
      behavioralStability:   makeBehavioral(80, 'stable',     { confidence: 'low' }),
      portfolioForecast:     makeForecast(20, 'stable',       { confidence: 'low' }),
    });
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── 17. Deterministic output ──────────────────────────────────────────────────

describe('deterministic output', function() {
  it('same input produces identical output', function() {
    const input = allDims({
      arch:       makeArchitecture(70, 'healthy', { confidence: 'medium', couplingLevel: 'low' }),
      maturity:   makeMaturity(65, 'developing', { confidence: 'medium', gaps: ['testing'] }),
      behavioral: makeBehavioral(75, 'stable', { confidence: 'high', drivers: ['x'] }),
      forecast:   makeForecast(30, 'watch', { confidence: 'medium' }),
      anomalies:  makeAnomalies(20, 'watch', { confidence: 'medium' }),
    });
    const r1 = scoreEngineeringGovernance(input);
    const r2 = scoreEngineeringGovernance(input);
    expect(r1.governanceScore).toBe(r2.governanceScore);
    expect(r1.governanceLevel).toBe(r2.governanceLevel);
    expect(r1.confidenceLevel).toBe(r2.confidenceLevel);
    expect(r1.governanceRisks.length).toBe(r2.governanceRisks.length);
    expect(r1.strengths.length).toBe(r2.strengths.length);
    expect(r1.recommendations.length).toBe(r2.recommendations.length);
  });
});

// ── 18. Non-mutation ──────────────────────────────────────────────────────────

describe('non-mutation', function() {
  it('does not mutate input object', function() {
    const input = allDims();
    const origArchScore = input.portfolioArchitecture.portfolioArchitectureScore;
    const origGaps      = input.portfolioMaturity.commonGaps.slice();
    scoreEngineeringGovernance(input);
    expect(input.portfolioArchitecture.portfolioArchitectureScore).toBe(origArchScore);
    expect(input.portfolioMaturity.commonGaps).toEqual(origGaps);
  });

  it('does not add properties to input', function() {
    const input = { portfolioArchitecture: makeArchitecture(70, 'healthy') };
    const keysBefore = Object.keys(input).length;
    scoreEngineeringGovernance(input);
    expect(Object.keys(input).length).toBe(keysBefore);
  });
});

// ── 19. Missing fields handled safely ────────────────────────────────────────

describe('missing fields handled safely', function() {
  it('portfolioArchitecture with null score => dimension unknown', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: {
        portfolioArchitectureScore: null,
        architectureLevel: 'healthy',
        confidenceLevel: 'medium',
        systemicBoundaryViolations: [],
        portfolioCoupling: { couplingLevel: 'low' },
        implementationIntegrity: { averageCompletenessScore: 80 },
      },
    });
    expect(r.dimensions.architectureGovernance.score).toBeNull();
  });

  it('portfolioForecast missing portfolioForecastScore uses level fallback', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: {
        portfolioForecastLevel: 'watch',
        confidenceLevel: 'medium',
        projectedHotspots: [],
        projectedGovernanceRisk: { governanceRiskScore: 10 },
      },
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(60);
  });

  it('behavioralStability with undefined drivers does not crash', function() {
    const r = scoreEngineeringGovernance({
      behavioralStability: {
        indexScore: 70,
        stabilityLevel: 'watch',
        confidenceLevel: 'medium',
        // drivers absent
      },
    });
    expect(r.dimensions.behavioralGovernance.score).toBe(70);
  });

  it('portfolioCoupling missing does not crash', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: {
        portfolioArchitectureScore: 70,
        architectureLevel: 'healthy',
        confidenceLevel: 'medium',
        systemicBoundaryViolations: [],
        implementationIntegrity: { averageCompletenessScore: 80 },
        // portfolioCoupling absent
      },
    });
    expect(r.dimensions.architectureGovernance.score).toBe(70);
  });

  it('projectedGovernanceRisk missing does not crash', function() {
    const r = scoreEngineeringGovernance({
      portfolioForecast: {
        portfolioForecastScore: 30,
        portfolioForecastLevel: 'watch',
        confidenceLevel: 'medium',
        projectedHotspots: [],
        // projectedGovernanceRisk absent
      },
    });
    expect(r.dimensions.predictiveGovernance.score).toBe(70);
  });

  it('string input => unknown', function() {
    const r = scoreEngineeringGovernance('invalid');
    expect(r.governanceLevel).toBe('unknown');
  });

  it('array input => unknown', function() {
    const r = scoreEngineeringGovernance([]);
    expect(r.governanceLevel).toBe('unknown');
  });

  it('all numeric fields absent gracefully produces unknown dims', function() {
    const r = scoreEngineeringGovernance({
      portfolioArchitecture: { architectureLevel: 'unknown' },
      portfolioMaturity:     {},
      behavioralStability:   {},
      portfolioForecast:     {},
    });
    expect(r.governanceLevel).toBe('unknown');
  });
});
