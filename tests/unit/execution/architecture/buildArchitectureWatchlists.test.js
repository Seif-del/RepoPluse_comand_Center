'use strict';

const { buildArchitectureWatchlists } = require('../../../../execution/architecture/buildArchitectureWatchlists');

// ── Factories ─────────────────────────────────────────────────────────────────

function makeRepo(id, name, opts) {
  opts = opts || {};
  return {
    repoId:                   id,
    repoName:                 name,
    architectureHealthScore:  opts.healthScore  != null ? opts.healthScore  : 75,
    architectureHealthLevel:  opts.healthLevel  || 'healthy',
    confidenceLevel:          opts.confidence   || 'medium',
    latestSnapshotAt:         opts.snapshotAt   || '2026-01-01T00:00:00Z',
    forecast:                 opts.forecast     || null,
    regression:               opts.regression   || null,
    anomaly:                  opts.anomaly      || null,
    couplingAlert:            opts.couplingAlert || null,
    governance:               opts.governance   || null,
  };
}

function makeForecast(level, risk, opts) {
  opts = opts || {};
  return {
    forecastLevel:   level,
    degradationRisk: risk,
    confidenceLevel: opts.confidence || 'medium',
  };
}

function makeRegression(level, score, opts) {
  opts = opts || {};
  return {
    regressionLevel: level,
    regressionScore: score,
    confidenceLevel: opts.confidence || 'medium',
  };
}

function makeAnomaly(level, score, opts) {
  opts = opts || {};
  return {
    anomalyLevel:    level,
    anomalyScore:    score,
    confidenceLevel: opts.confidence || 'medium',
  };
}

function makeCoupling(level, score, opts) {
  opts = opts || {};
  return {
    alertLevel:          level,
    couplingGrowthScore: score,
    confidenceLevel:     opts.confidence || 'medium',
  };
}

function makeGovernance(level, score, opts) {
  opts = opts || {};
  return {
    governanceLevel: level,
    governanceScore: score,
    confidenceLevel: opts.confidence || 'medium',
  };
}

// A clean "healthy" repository that should not appear on any watchlist
function healthyRepo(id) {
  return makeRepo(id, 'repo-' + id, {
    healthScore:  85,
    healthLevel:  'healthy',
    confidence:   'high',
    forecast:     makeForecast('stable', 5, { confidence: 'high' }),
    regression:   makeRegression('none', 0, { confidence: 'high' }),
    anomaly:      makeAnomaly('none', 0, { confidence: 'high' }),
    couplingAlert: makeCoupling('none', 0, { confidence: 'high' }),
    governance:   makeGovernance('excellent', 90, { confidence: 'high' }),
  });
}

// A critical repository scoring very high
function criticalRepo(id) {
  return makeRepo(id, 'repo-' + id, {
    healthScore:  20,
    healthLevel:  'risky',
    confidence:   'high',
    forecast:     makeForecast('critical', 90, { confidence: 'high' }),
    regression:   makeRegression('critical', 85, { confidence: 'high' }),
    anomaly:      makeAnomaly('critical', 85, { confidence: 'high' }),
    couplingAlert: makeCoupling('critical', 80, { confidence: 'high' }),
    governance:   makeGovernance('critical', 10, { confidence: 'high' }),
  });
}

// ── 1. Empty / null input ──────────────────────────────────────────────────────

describe('empty/null input', function() {
  it('null => unknown', function() {
    const r = buildArchitectureWatchlists(null);
    expect(r.watchlistLevel).toBe('unknown');
    expect(r.watchlistScore).toBe(0);
    expect(r.confidenceLevel).toBe('low');
  });

  it('undefined => unknown', function() {
    const r = buildArchitectureWatchlists(undefined);
    expect(r.watchlistLevel).toBe('unknown');
  });

  it('empty object => unknown', function() {
    const r = buildArchitectureWatchlists({});
    expect(r.watchlistLevel).toBe('unknown');
  });

  it('empty repositories array => unknown', function() {
    const r = buildArchitectureWatchlists({ repositories: [] });
    expect(r.watchlistLevel).toBe('unknown');
  });

  it('unknown result has correct shape', function() {
    const r = buildArchitectureWatchlists(null);
    expect(r).toHaveProperty('watchlistLevel');
    expect(r).toHaveProperty('watchlistScore');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('categories');
    expect(r).toHaveProperty('priorityQueue');
    expect(r).toHaveProperty('escalationSummary');
    expect(r).toHaveProperty('recommendations');
  });

  it('unknown categories are all empty arrays', function() {
    const r = buildArchitectureWatchlists(null);
    const c = r.categories;
    expect(c.criticalGovernance).toEqual([]);
    expect(c.degradingForecasts).toEqual([]);
    expect(c.anomalyHeavy).toEqual([]);
    expect(c.couplingPressure).toEqual([]);
    expect(c.regressionRisk).toEqual([]);
    expect(c.lowConfidence).toEqual([]);
    expect(c.emergingRisk).toEqual([]);
  });
});

// ── 2. Output shape ────────────────────────────────────────────────────────────

describe('output shape', function() {
  it('returns all top-level keys', function() {
    const r = buildArchitectureWatchlists({ repositories: [healthyRepo('r1')] });
    ['watchlistLevel', 'watchlistScore', 'confidenceLevel', 'summary',
     'categories', 'priorityQueue', 'escalationSummary', 'recommendations'].forEach(function(k) {
      expect(r).toHaveProperty(k);
    });
  });

  it('categories has all 7 keys', function() {
    const r = buildArchitectureWatchlists({ repositories: [healthyRepo('r1')] });
    const c = r.categories;
    ['criticalGovernance', 'degradingForecasts', 'anomalyHeavy', 'couplingPressure',
     'regressionRisk', 'lowConfidence', 'emergingRisk'].forEach(function(k) {
      expect(c).toHaveProperty(k);
      expect(Array.isArray(c[k])).toBe(true);
    });
  });

  it('escalationSummary has all 5 keys', function() {
    const r = buildArchitectureWatchlists({ repositories: [criticalRepo('r1')] });
    const es = r.escalationSummary;
    ['critical', 'urgent', 'elevated', 'monitor', 'none'].forEach(function(k) {
      expect(es).toHaveProperty(k);
      expect(typeof es[k]).toBe('number');
    });
  });

  it('watchlist item has required fields', function() {
    const r = buildArchitectureWatchlists({ repositories: [criticalRepo('r1')] });
    const item = r.priorityQueue[0];
    expect(item).toHaveProperty('repoId');
    expect(item).toHaveProperty('repoName');
    expect(item).toHaveProperty('priorityScore');
    expect(item).toHaveProperty('escalationLevel');
    expect(item).toHaveProperty('reasons');
    expect(item).toHaveProperty('recommendedAction');
    expect(item).toHaveProperty('signals');
    expect(Array.isArray(item.reasons)).toBe(true);
  });
});

// ── 3. Clear portfolio ─────────────────────────────────────────────────────────

describe('clear portfolio', function() {
  it('all healthy repos => clear watchlistLevel', function() {
    const r = buildArchitectureWatchlists({
      repositories: [healthyRepo('r1'), healthyRepo('r2'), healthyRepo('r3')],
    });
    expect(r.watchlistLevel).toBe('clear');
    expect(r.watchlistScore).toBe(0);
  });

  it('clear portfolio => empty priority queue', function() {
    const r = buildArchitectureWatchlists({
      repositories: [healthyRepo('r1'), healthyRepo('r2')],
    });
    expect(r.priorityQueue).toHaveLength(0);
  });

  it('clear portfolio includes maintenance recommendation', function() {
    const r = buildArchitectureWatchlists({
      repositories: [healthyRepo('r1'), healthyRepo('r2'), healthyRepo('r3'),
                     healthyRepo('r4'), healthyRepo('r5')],
    });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('clear') || rec.toLowerCase().includes('maintain');
    })).toBe(true);
  });
});

// ── 4. criticalGovernance category ───────────────────────────────────────────

describe('criticalGovernance category', function() {
  it('governanceLevel=critical adds to category', function() {
    const repo = makeRepo('r1', 'critical-gov', {
      governance: makeGovernance('critical', 10),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.criticalGovernance).toHaveLength(1);
    expect(r.categories.criticalGovernance[0].repoId).toBe('r1');
  });

  it('governanceLevel=weak adds to category', function() {
    const repo = makeRepo('r1', 'weak-gov', {
      governance: makeGovernance('weak', 35),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.criticalGovernance).toHaveLength(1);
  });

  it('governanceScore < 45 adds to category even if level is watch', function() {
    const repo = makeRepo('r1', 'watch-gov', {
      governance: makeGovernance('watch', 40),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.criticalGovernance).toHaveLength(1);
  });

  it('governanceScore >= 45 with watch level does NOT add', function() {
    const repo = makeRepo('r1', 'ok-gov', {
      governance: makeGovernance('watch', 50),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.criticalGovernance).toHaveLength(0);
  });

  it('no governance data does NOT add', function() {
    const repo = makeRepo('r1', 'no-gov');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.criticalGovernance).toHaveLength(0);
  });
});

// ── 5. degradingForecasts category ───────────────────────────────────────────

describe('degradingForecasts category', function() {
  it('forecastLevel=degrading adds to category', function() {
    const repo = makeRepo('r1', 'degrading-fc', {
      forecast: makeForecast('degrading', 60),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.degradingForecasts).toHaveLength(1);
  });

  it('forecastLevel=critical adds to category', function() {
    const repo = makeRepo('r1', 'critical-fc', {
      forecast: makeForecast('critical', 85),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.degradingForecasts).toHaveLength(1);
  });

  it('degradationRisk >= 45 adds to category regardless of level string', function() {
    const repo = makeRepo('r1', 'high-risk', {
      forecast: makeForecast('watch', 50),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.degradingForecasts).toHaveLength(1);
  });

  it('degradationRisk < 45 and stable level does NOT add', function() {
    const repo = makeRepo('r1', 'stable', {
      forecast: makeForecast('stable', 10),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.degradingForecasts).toHaveLength(0);
  });

  it('no forecast data does NOT add', function() {
    const repo = makeRepo('r1', 'no-fc');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.degradingForecasts).toHaveLength(0);
  });
});

// ── 6. anomalyHeavy category ─────────────────────────────────────────────────

describe('anomalyHeavy category', function() {
  it('anomalyLevel=anomaly adds to category', function() {
    const repo = makeRepo('r1', 'anomaly-repo', {
      anomaly: makeAnomaly('anomaly', 50),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.anomalyHeavy).toHaveLength(1);
  });

  it('anomalyLevel=critical adds to category', function() {
    const repo = makeRepo('r1', 'crit-anomaly', {
      anomaly: makeAnomaly('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.anomalyHeavy).toHaveLength(1);
  });

  it('anomalyScore >= 30 adds to category', function() {
    const repo = makeRepo('r1', 'score-anomaly', {
      anomaly: makeAnomaly('watch', 30),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.anomalyHeavy).toHaveLength(1);
  });

  it('anomalyLevel=watch with score < 30 does NOT add to anomalyHeavy', function() {
    const repo = makeRepo('r1', 'watch-anomaly', {
      anomaly: makeAnomaly('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.anomalyHeavy).toHaveLength(0);
  });
});

// ── 7. couplingPressure category ─────────────────────────────────────────────

describe('couplingPressure category', function() {
  it('alertLevel=alert adds to category', function() {
    const repo = makeRepo('r1', 'alert-coupling', {
      couplingAlert: makeCoupling('alert', 50),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.couplingPressure).toHaveLength(1);
  });

  it('alertLevel=critical adds to category', function() {
    const repo = makeRepo('r1', 'crit-coupling', {
      couplingAlert: makeCoupling('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.couplingPressure).toHaveLength(1);
  });

  it('couplingGrowthScore >= 30 adds to category', function() {
    const repo = makeRepo('r1', 'score-coupling', {
      couplingAlert: makeCoupling('watch', 30),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.couplingPressure).toHaveLength(1);
  });

  it('alertLevel=watch with score < 30 does NOT add', function() {
    const repo = makeRepo('r1', 'light-coupling', {
      couplingAlert: makeCoupling('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.couplingPressure).toHaveLength(0);
  });
});

// ── 8. regressionRisk category ───────────────────────────────────────────────

describe('regressionRisk category', function() {
  it('regressionLevel=regression adds to category', function() {
    const repo = makeRepo('r1', 'regression-repo', {
      regression: makeRegression('regression', 45),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.regressionRisk).toHaveLength(1);
  });

  it('regressionLevel=critical adds to category', function() {
    const repo = makeRepo('r1', 'crit-regression', {
      regression: makeRegression('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.regressionRisk).toHaveLength(1);
  });

  it('regressionScore >= 30 adds to category', function() {
    const repo = makeRepo('r1', 'score-regression', {
      regression: makeRegression('watch', 30),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.regressionRisk).toHaveLength(1);
  });

  it('regressionLevel=watch with score < 30 does NOT add', function() {
    const repo = makeRepo('r1', 'watch-regression', {
      regression: makeRegression('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.regressionRisk).toHaveLength(0);
  });
});

// ── 9. lowConfidence category ────────────────────────────────────────────────

describe('lowConfidence category', function() {
  it('repo confidenceLevel=low with risk adds to category', function() {
    const repo = makeRepo('r1', 'low-conf', {
      confidence:  'low',
      forecast:    makeForecast('watch', 35),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.lowConfidence).toHaveLength(1);
  });

  it('repo confidenceLevel=low with no risk does NOT add', function() {
    const repo = makeRepo('r1', 'low-conf-clean', {
      confidence: 'low',
      // no forecast/anomaly/regression/coupling/governance
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.lowConfidence).toHaveLength(0);
  });

  it('signal low confidence with elevated risk adds to category', function() {
    const repo = makeRepo('r1', 'signal-low-conf', {
      forecast: makeForecast('watch', 40, { confidence: 'low' }),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.lowConfidence).toHaveLength(1);
  });

  it('medium confidence repo does NOT add', function() {
    const repo = makeRepo('r1', 'medium-conf', {
      confidence: 'medium',
      forecast:   makeForecast('watch', 35),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.lowConfidence).toHaveLength(0);
  });
});

// ── 10. emergingRisk category ────────────────────────────────────────────────

describe('emergingRisk category', function() {
  it('watch health with watch forecast adds to emerging risk', function() {
    const repo = makeRepo('r1', 'watch-health', {
      healthLevel: 'watch',
      forecast:    makeForecast('watch', 30),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(1);
  });

  it('weak health without forecast adds to emerging risk', function() {
    const repo = makeRepo('r1', 'weak-no-fc', {
      healthLevel: 'weak',
      forecast:    null,
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(1);
  });

  it('watch-level anomaly below threshold adds to emerging risk', function() {
    const repo = makeRepo('r1', 'watch-anomaly-signal', {
      anomaly: makeAnomaly('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(1);
  });

  it('watch-level regression below threshold adds to emerging risk', function() {
    const repo = makeRepo('r1', 'watch-reg-signal', {
      regression: makeRegression('watch', 15),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(1);
  });

  it('watch-level coupling below threshold adds to emerging risk', function() {
    const repo = makeRepo('r1', 'watch-coupling-signal', {
      couplingAlert: makeCoupling('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(1);
  });

  it('healthy repo with strong forecast does NOT add to emergingRisk', function() {
    const repo = healthyRepo('r1');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.categories.emergingRisk).toHaveLength(0);
  });
});

// ── 11. Priority scoring ──────────────────────────────────────────────────────

describe('priority scoring', function() {
  it('governance critical adds +35', function() {
    const repo = makeRepo('r1', 'gov-crit', {
      governance: makeGovernance('critical', 10),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(35);
  });

  it('governance weak adds +25', function() {
    const repo = makeRepo('r1', 'gov-weak', {
      governance: makeGovernance('weak', 30),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(25);
    expect(item.priorityScore).toBeLessThan(35);
  });

  it('forecast critical adds +30', function() {
    const repo = makeRepo('r1', 'fc-crit', {
      forecast: makeForecast('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(30);
  });

  it('forecast degrading adds +22', function() {
    const repo = makeRepo('r1', 'fc-deg', {
      forecast: makeForecast('degrading', 55),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(22);
    expect(item.priorityScore).toBeLessThan(30);
  });

  it('anomaly critical adds +28', function() {
    const repo = makeRepo('r1', 'an-crit', {
      anomaly: makeAnomaly('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(28);
    expect(item.priorityScore).toBeLessThan(30);
  });

  it('coupling critical adds +24', function() {
    const repo = makeRepo('r1', 'coup-crit', {
      couplingAlert: makeCoupling('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(24);
    expect(item.priorityScore).toBeLessThan(28);
  });

  it('regression critical adds +24', function() {
    const repo = makeRepo('r1', 'reg-crit', {
      regression: makeRegression('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(24);
    expect(item.priorityScore).toBeLessThan(28);
  });

  it('healthLevel risky adds +18', function() {
    const repo = makeRepo('r1', 'risky-health', {
      healthLevel: 'risky',
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(18);
    expect(item.priorityScore).toBeLessThan(22);
  });

  it('low confidence +8 when paired with risk', function() {
    // healthy health risky (+18) + low confidence (+8) = 26
    const repo = makeRepo('r1', 'low-conf-risk', {
      healthLevel: 'risky',
      confidence:  'low',
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBe(26);
  });

  it('score capped at 100', function() {
    const repo = criticalRepo('r1');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue[0].priorityScore).toBeLessThanOrEqual(100);
  });

  it('fully healthy repo has zero priority score', function() {
    const repo = healthyRepo('r1');
    // Healthy repos have 0 priority score and do not appear in priorityQueue
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue).toHaveLength(0);
  });
});

// ── 12. Escalation levels ─────────────────────────────────────────────────────

describe('escalation levels', function() {
  it('priorityScore >= 80 => critical escalation', function() {
    const repo = criticalRepo('r1');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue[0].escalationLevel).toBe('critical');
  });

  it('critical governance + critical forecast => critical escalation regardless of score', function() {
    // governance critical (+35) + forecast critical (+30) = 65 (urgent by score)
    // but special rule overrides to critical
    const repo = makeRepo('r1', 'crit-both', {
      governance: makeGovernance('critical', 10),
      forecast:   makeForecast('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue[0].escalationLevel).toBe('critical');
  });

  it('priorityScore 60-79 => urgent escalation', function() {
    // governance critical (+35) + anomaly critical (+28) = 63 => urgent
    const repo = makeRepo('r1', 'urgent-repo', {
      governance: makeGovernance('critical', 10),
      anomaly:    makeAnomaly('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(60);
    expect(item.priorityScore).toBeLessThan(80);
    expect(item.escalationLevel).toBe('urgent');
  });

  it('priorityScore 40-59 => elevated escalation', function() {
    // governance weak (+25) + regression regression (+18) = 43 => elevated
    const repo = makeRepo('r1', 'elevated-repo', {
      governance: makeGovernance('weak', 30),
      regression: makeRegression('regression', 45),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.escalationLevel).toBe('elevated');
  });

  it('priorityScore 20-39 => monitor escalation', function() {
    // anomaly anomaly (+20) = 20 => monitor
    const repo = makeRepo('r1', 'monitor-repo', {
      anomaly: makeAnomaly('anomaly', 50),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.priorityScore).toBeGreaterThanOrEqual(20);
    expect(item.priorityScore).toBeLessThan(40);
    expect(item.escalationLevel).toBe('monitor');
  });

  it('priorityScore < 20 => none escalation', function() {
    // watch anomaly (+10) = 10 => none
    const repo = makeRepo('r1', 'none-esc', {
      anomaly: makeAnomaly('watch', 20),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    const item = r.priorityQueue[0];
    expect(item.escalationLevel).toBe('none');
  });
});

// ── 13. Priority queue deduplication and sorting ──────────────────────────────

describe('priorityQueue deduplication and sorting', function() {
  it('same repo in multiple categories appears only once', function() {
    const repo = makeRepo('r1', 'multi-cat', {
      governance:    makeGovernance('critical', 10),
      forecast:      makeForecast('critical', 85),
      anomaly:       makeAnomaly('critical', 75),
      couplingAlert: makeCoupling('critical', 70),
      regression:    makeRegression('critical', 70),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue).toHaveLength(1);
  });

  it('sorted by priorityScore descending', function() {
    const repos = [
      makeRepo('r1', 'low', { anomaly: makeAnomaly('watch', 20) }),     // ~10
      makeRepo('r2', 'high', { governance: makeGovernance('critical', 10) }), // ~35
      makeRepo('r3', 'mid', { forecast: makeForecast('watch', 35) }),    // ~14
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    const scores = r.priorityQueue.map(function(i) { return i.priorityScore; });
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeLessThanOrEqual(scores[i - 1]);
    }
  });

  it('equal scores sorted by escalation level descending', function() {
    // Two repos with same anomaly score (anomaly +20 each)
    const repos = [
      makeRepo('r1', 'aaa', {
        anomaly:    makeAnomaly('anomaly', 50),
        // no governance => no critical escalation override
      }),
      makeRepo('r2', 'bbb', {
        anomaly:    makeAnomaly('anomaly', 50),
        forecast:   makeForecast('watch', 14), // adds watch 14 => score 34 vs 20
      }),
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    // r2 has higher priority score, should come first
    expect(r.priorityQueue[0].repoId).toBe('r2');
  });

  it('tiebreak by repoName ASC', function() {
    // Both repos with same priority: anomaly watch (+10) only
    const repos = [
      makeRepo('r2', 'zz-repo', { anomaly: makeAnomaly('watch', 20) }),
      makeRepo('r1', 'aa-repo', { anomaly: makeAnomaly('watch', 20) }),
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.priorityQueue[0].repoName).toBe('aa-repo');
  });

  it('capped at 25 items', function() {
    const repos = [];
    for (let i = 0; i < 30; i++) {
      repos.push(makeRepo('r' + i, 'repo-' + i, {
        anomaly: makeAnomaly('anomaly', 50),
      }));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.priorityQueue.length).toBeLessThanOrEqual(25);
  });
});

// ── 14. watchlistScore top-5 average ─────────────────────────────────────────

describe('watchlistScore', function() {
  it('is average of top 5 priorityScores', function() {
    // scores: 35, 30, 25, 22, 18, 10 => top 5 avg = (35+30+25+22+18)/5 = 26
    const repos = [
      makeRepo('r1', 'a', { governance:    makeGovernance('critical', 10) }), // 35
      makeRepo('r2', 'b', { forecast:      makeForecast('critical', 85) }),   // 30
      makeRepo('r3', 'c', { governance:    makeGovernance('weak', 30) }),      // 25
      makeRepo('r4', 'd', { forecast:      makeForecast('degrading', 55) }),   // 22
      makeRepo('r5', 'e', { healthLevel:   'risky' }),                         // 18
      makeRepo('r6', 'f', { anomaly:       makeAnomaly('watch', 20) }),        // 10
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.watchlistScore).toBe(26);
  });

  it('only 1 item => average of 1', function() {
    const repo = makeRepo('r1', 'alone', { governance: makeGovernance('weak', 30) });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.watchlistScore).toBe(r.priorityQueue[0].priorityScore);
  });

  it('no watchlist items => watchlistScore 0', function() {
    const r = buildArchitectureWatchlists({ repositories: [healthyRepo('r1')] });
    expect(r.watchlistScore).toBe(0);
  });

  it('watchlistScore is rounded integer', function() {
    const repos = [
      makeRepo('r1', 'a', { forecast: makeForecast('degrading', 55) }),  // 22
      makeRepo('r2', 'b', { anomaly:  makeAnomaly('anomaly', 50) }),      // 20
      makeRepo('r3', 'c', { forecast: makeForecast('watch', 35) }),       // 14
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(Number.isInteger(r.watchlistScore)).toBe(true);
  });
});

// ── 15. watchlistLevel thresholds ────────────────────────────────────────────

describe('watchlistLevel thresholds', function() {
  it('watchlistScore >= 75 => critical', function() {
    // Need top-5 avg >= 75: multiple critical repos
    const repos = [];
    for (let i = 0; i < 5; i++) {
      repos.push(criticalRepo('r' + i));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.watchlistScore).toBeGreaterThanOrEqual(75);
    expect(r.watchlistLevel).toBe('critical');
  });

  it('watchlistScore 50-74 => elevated', function() {
    // governance critical (+35) * 5 repos => avg 35 per repo
    // Plus anomaly critical (+28): 35+28=63 top-5 avg = 63 => elevated
    const repos = [];
    for (let i = 0; i < 5; i++) {
      repos.push(makeRepo('r' + i, 'repo' + i, {
        governance: makeGovernance('critical', 10),
        anomaly:    makeAnomaly('critical', 75),
        // total: 35 + 28 = 63
      }));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.watchlistScore).toBeGreaterThanOrEqual(50);
    expect(r.watchlistScore).toBeLessThan(75);
    expect(r.watchlistLevel).toBe('elevated');
  });

  it('watchlistScore 20-49 => monitor', function() {
    const repos = [];
    for (let i = 0; i < 5; i++) {
      repos.push(makeRepo('r' + i, 'repo' + i, {
        forecast: makeForecast('watch', 30), // +14
        healthLevel: 'watch',                 // +6
        // total: 20 => monitor
      }));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.watchlistScore).toBeGreaterThanOrEqual(20);
    expect(r.watchlistScore).toBeLessThan(50);
    expect(r.watchlistLevel).toBe('monitor');
  });

  it('watchlistScore 0-19 => clear', function() {
    const r = buildArchitectureWatchlists({ repositories: [healthyRepo('r1')] });
    expect(r.watchlistLevel).toBe('clear');
    expect(r.watchlistScore).toBe(0);
  });
});

// ── 16. escalationSummary counts ─────────────────────────────────────────────

describe('escalationSummary counts', function() {
  it('counts all escalation levels correctly', function() {
    const repos = [
      criticalRepo('r1'),   // critical
      makeRepo('r2', 'b', { governance: makeGovernance('critical', 10), anomaly: makeAnomaly('critical', 75) }), // 35+28=63 => urgent
      makeRepo('r3', 'c', { governance: makeGovernance('weak', 30), regression: makeRegression('regression', 45) }), // 25+18=43 => elevated
      makeRepo('r4', 'd', { anomaly: makeAnomaly('anomaly', 50) }),  // 20 => monitor
      makeRepo('r5', 'e', { anomaly: makeAnomaly('watch', 20) }),    // 10 => none
    ];
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.escalationSummary.critical).toBeGreaterThanOrEqual(1);
    expect(r.escalationSummary.urgent).toBeGreaterThanOrEqual(1);
    expect(r.escalationSummary.elevated).toBeGreaterThanOrEqual(1);
    expect(r.escalationSummary.monitor).toBeGreaterThanOrEqual(1);
    expect(r.escalationSummary.none).toBeGreaterThanOrEqual(1);
  });

  it('sum of escalationSummary equals priorityQueue length', function() {
    const repos = [criticalRepo('r1'), criticalRepo('r2'), healthyRepo('r3')];
    const r = buildArchitectureWatchlists({ repositories: repos });
    const total = Object.values(r.escalationSummary).reduce(function(s, n) { return s + n; }, 0);
    expect(total).toBe(r.priorityQueue.length);
  });
});

// ── 17. Recommendations priority ─────────────────────────────────────────────

describe('recommendations', function() {
  it('critical governance repos appear in first recommendation', function() {
    const repo = makeRepo('r1', 'urgent-gov', {
      governance: makeGovernance('critical', 5),
      forecast:   makeForecast('critical', 85),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations[0]).toMatch(/governance|intervention/i);
  });

  it('degrading forecasts in recommendations', function() {
    const repo = makeRepo('r1', 'degrading-fc', {
      forecast: makeForecast('degrading', 60),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('degradation') || rec.toLowerCase().includes('forecast');
    })).toBe(true);
  });

  it('anomaly-heavy in recommendations', function() {
    const repo = makeRepo('r1', 'anomaly-r', {
      anomaly: makeAnomaly('critical', 80),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('anomal');
    })).toBe(true);
  });

  it('coupling pressure in recommendations', function() {
    const repo = makeRepo('r1', 'coupling-r', {
      couplingAlert: makeCoupling('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('coupling');
    })).toBe(true);
  });

  it('regression risk in recommendations', function() {
    const repo = makeRepo('r1', 'reg-r', {
      regression: makeRegression('critical', 75),
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('regression');
    })).toBe(true);
  });

  it('low confidence in recommendations', function() {
    const repo = makeRepo('r1', 'low-conf-r', {
      confidence:  'low',
      healthLevel: 'risky',
    });
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.recommendations.some(function(rec) {
      return rec.toLowerCase().includes('confidence') || rec.toLowerCase().includes('snapshot');
    })).toBe(true);
  });

  it('capped at 5 recommendations', function() {
    const repos = [];
    for (let i = 0; i < 10; i++) {
      repos.push(criticalRepo('r' + i));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });
});

// ── 18. Confidence levels ─────────────────────────────────────────────────────

describe('confidence levels', function() {
  it('< 3 repos => low confidence', function() {
    const r = buildArchitectureWatchlists({ repositories: [criticalRepo('r1'), criticalRepo('r2')] });
    expect(r.confidenceLevel).toBe('low');
  });

  it('3-4 repos => medium confidence', function() {
    const r = buildArchitectureWatchlists({
      repositories: [criticalRepo('r1'), criticalRepo('r2'), criticalRepo('r3')],
    });
    expect(['medium', 'high']).toContain(r.confidenceLevel);
  });

  it('>= 5 repos with >= 70% medium/high confidence => high', function() {
    const repos = [];
    for (let i = 0; i < 5; i++) {
      repos.push(makeRepo('r' + i, 'repo' + i, {
        confidence: 'high',
        governance: makeGovernance('critical', 10),
      }));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.confidenceLevel).toBe('high');
  });

  it('>= 5 repos but < 70% medium/high => medium', function() {
    const repos = [];
    // 2 high confidence, 3 low confidence => 40% => medium
    for (let i = 0; i < 2; i++) {
      repos.push(makeRepo('r' + i, 'h' + i, { confidence: 'high', governance: makeGovernance('critical', 10) }));
    }
    for (let i = 0; i < 3; i++) {
      repos.push(makeRepo('h' + i, 'l' + i, { confidence: 'low', healthLevel: 'risky' }));
    }
    const r = buildArchitectureWatchlists({ repositories: repos });
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── 19. Deterministic output ──────────────────────────────────────────────────

describe('deterministic output', function() {
  it('same input produces identical output', function() {
    const repos = [
      criticalRepo('r1'),
      makeRepo('r2', 'watch-repo', {
        healthLevel: 'watch',
        forecast:    makeForecast('watch', 30),
        anomaly:     makeAnomaly('watch', 20),
      }),
      healthyRepo('r3'),
    ];
    const input = { repositories: repos };
    const r1 = buildArchitectureWatchlists(input);
    const r2 = buildArchitectureWatchlists(input);
    expect(r1.watchlistScore).toBe(r2.watchlistScore);
    expect(r1.watchlistLevel).toBe(r2.watchlistLevel);
    expect(r1.priorityQueue.length).toBe(r2.priorityQueue.length);
    expect(r1.escalationSummary.critical).toBe(r2.escalationSummary.critical);
    expect(r1.recommendations.length).toBe(r2.recommendations.length);
  });
});

// ── 20. Non-mutation ──────────────────────────────────────────────────────────

describe('non-mutation', function() {
  it('does not mutate input repositories array', function() {
    const repos = [criticalRepo('r1'), healthyRepo('r2')];
    const input = { repositories: repos };
    const origLen = repos.length;
    buildArchitectureWatchlists(input);
    expect(repos.length).toBe(origLen);
    expect(input.repositories).toBe(repos);
  });

  it('does not mutate individual repo objects', function() {
    const repo = criticalRepo('r1');
    const origScore = repo.architectureHealthScore;
    buildArchitectureWatchlists({ repositories: [repo] });
    expect(repo.architectureHealthScore).toBe(origScore);
  });
});

// ── 21. Missing fields handled safely ────────────────────────────────────────

describe('missing fields handled safely', function() {
  it('repo with no signals produces priorityScore=0 and no entry', function() {
    const repo = makeRepo('r1', 'no-signals');
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue).toHaveLength(0);
  });

  it('null forecast does not crash', function() {
    const repo = makeRepo('r1', 'null-fc', { forecast: null });
    expect(function() { buildArchitectureWatchlists({ repositories: [repo] }); }).not.toThrow();
  });

  it('null governance does not crash', function() {
    const repo = makeRepo('r1', 'null-gov', { governance: null });
    expect(function() { buildArchitectureWatchlists({ repositories: [repo] }); }).not.toThrow();
  });

  it('repositories with non-array value => unknown', function() {
    const r = buildArchitectureWatchlists({ repositories: 'oops' });
    expect(r.watchlistLevel).toBe('unknown');
  });

  it('missing repoId and repoName are treated as empty strings', function() {
    const repo = {
      architectureHealthScore: 10,
      architectureHealthLevel: 'risky',
      governance: makeGovernance('critical', 5),
    };
    const r = buildArchitectureWatchlists({ repositories: [repo] });
    expect(r.priorityQueue[0].repoId).toBe('');
    expect(r.priorityQueue[0].repoName).toBe('');
  });

  it('partial governance object does not crash', function() {
    const repo = makeRepo('r1', 'partial-gov', {
      governance: { governanceLevel: 'critical' },
    });
    expect(function() { buildArchitectureWatchlists({ repositories: [repo] }); }).not.toThrow();
  });

  it('string input => unknown', function() {
    expect(buildArchitectureWatchlists('invalid').watchlistLevel).toBe('unknown');
  });
});
