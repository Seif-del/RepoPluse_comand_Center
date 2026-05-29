'use strict';

const { buildPortfolioForecastingIntelligence } = require('../../../../execution/architecture/buildPortfolioForecastingIntelligence');

// ── Factory ───────────────────────────────────────────────────────────────────

let _nextId = 1;

function makeRepo(opts) {
  opts = opts || {};
  const id = opts.repoId !== undefined ? opts.repoId : _nextId++;
  return {
    repoId:          id,
    repoName:        opts.repoName !== undefined ? opts.repoName : ('repo-' + id),
    forecastLevel:   opts.forecastLevel   !== undefined ? opts.forecastLevel   : 'stable',
    degradationRisk: opts.degradationRisk !== undefined ? opts.degradationRisk : 10,
    confidenceLevel: opts.confidenceLevel !== undefined ? opts.confidenceLevel : 'high',
    trajectory: Object.assign(
      { scoreTrend: 'stable', averageScoreDelta: 0, projectedScore: 75, projectedLevel: 'healthy', interventionUrgency: 'none' },
      opts.trajectory || {}
    ),
    riskFactors:          opts.riskFactors          !== undefined ? opts.riskFactors          : [],
    structuralProjection: Object.assign(
      { couplingForecast: 'stable', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' },
      opts.structuralProjection || {}
    ),
    recommendations: opts.recommendations !== undefined ? opts.recommendations : [],
  };
}

function stableRepo(id, risk) {
  return makeRepo({ repoId: id, repoName: 'repo-' + id, forecastLevel: 'stable', degradationRisk: risk !== undefined ? risk : 10 });
}

function watchRepo(id, risk) {
  return makeRepo({ repoId: id, repoName: 'repo-' + id, forecastLevel: 'watch', degradationRisk: risk !== undefined ? risk : 30 });
}

function degradingRepo(id, risk) {
  return makeRepo({ repoId: id, repoName: 'repo-' + id, forecastLevel: 'degrading', degradationRisk: risk !== undefined ? risk : 55 });
}

function criticalRepo(id, risk) {
  return makeRepo({ repoId: id, repoName: 'repo-' + id, forecastLevel: 'critical', degradationRisk: risk !== undefined ? risk : 80 });
}

beforeEach(function() { _nextId = 100; });

// ── Helpers ───────────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — empty / invalid input', function() {
  test('null input returns unknown result', function() {
    const r = buildPortfolioForecastingIntelligence(null);
    expect(r.portfolioForecastLevel).toBe('unknown');
    expect(r.portfolioForecastScore).toBe(0);
    expect(r.confidenceLevel).toBe('low');
  });

  test('undefined returns unknown result', function() {
    const r = buildPortfolioForecastingIntelligence(undefined);
    expect(r.portfolioForecastLevel).toBe('unknown');
  });

  test('non-object returns unknown result', function() {
    expect(buildPortfolioForecastingIntelligence(42).portfolioForecastLevel).toBe('unknown');
    expect(buildPortfolioForecastingIntelligence('x').portfolioForecastLevel).toBe('unknown');
  });

  test('empty repoForecasts returns unknown result', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [] });
    expect(r.portfolioForecastLevel).toBe('unknown');
    expect(r.projectedRiskRepos).toEqual([]);
    expect(r.projectedHotspots).toEqual([]);
    expect(r.recommendations).toEqual([]);
  });

  test('missing repoForecasts key returns unknown result', function() {
    const r = buildPortfolioForecastingIntelligence({});
    expect(r.portfolioForecastLevel).toBe('unknown');
  });

  test('repoForecasts = null treated as empty', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: null });
    expect(r.portfolioForecastLevel).toBe('unknown');
  });

  test('unknown result has all required top-level keys', function() {
    const r = buildPortfolioForecastingIntelligence(null);
    expect(r).toHaveProperty('portfolioForecastLevel');
    expect(r).toHaveProperty('portfolioForecastScore');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('forecastDistribution');
    expect(r).toHaveProperty('projectedRiskRepos');
    expect(r).toHaveProperty('projectedHotspots');
    expect(r).toHaveProperty('projectedCouplingPressure');
    expect(r).toHaveProperty('projectedGovernanceRisk');
    expect(r).toHaveProperty('trendForecast');
    expect(r).toHaveProperty('recommendations');
    expect(r).toHaveProperty('benchmarking');
  });
});

// ── Portfolio score & level ───────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — portfolio score', function() {
  test('averages degradationRisk of non-unknown repos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1, 10),
        stableRepo(2, 20),
        stableRepo(3, 30),
      ],
    });
    expect(r.portfolioForecastScore).toBe(20);
  });

  test('excludes unknown forecastLevel repos from average', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1, 10),
        makeRepo({ repoId: 2, forecastLevel: 'unknown', degradationRisk: 90 }),
      ],
    });
    expect(r.portfolioForecastScore).toBe(10);
  });

  test('all unknown repos gives score 0', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, forecastLevel: 'unknown', degradationRisk: 80 }),
        makeRepo({ repoId: 2, forecastLevel: 'unknown', degradationRisk: 60 }),
      ],
    });
    expect(r.portfolioForecastScore).toBe(0);
  });

  test('rounds score to nearest integer', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1, 10), stableRepo(2, 11)],
    });
    expect(r.portfolioForecastScore).toBe(11);
  });
});

describe('buildPortfolioForecastingIntelligence — portfolio level', function() {
  test('stable: score 0–19', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1, 0)] });
    expect(r.portfolioForecastLevel).toBe('stable');
  });

  test('stable: score exactly 19', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1, 19)] });
    expect(r.portfolioForecastLevel).toBe('stable');
  });

  test('watch: score 20', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [watchRepo(1, 20)] });
    expect(r.portfolioForecastLevel).toBe('watch');
  });

  test('watch: score 44', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [watchRepo(1, 44)] });
    expect(r.portfolioForecastLevel).toBe('watch');
  });

  test('degrading: score 45', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [degradingRepo(1, 45)] });
    expect(r.portfolioForecastLevel).toBe('degrading');
  });

  test('degrading: score 74', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [degradingRepo(1, 74)] });
    expect(r.portfolioForecastLevel).toBe('degrading');
  });

  test('critical: score 75', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [criticalRepo(1, 75)] });
    expect(r.portfolioForecastLevel).toBe('critical');
  });

  test('critical: score 100', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [criticalRepo(1, 100)] });
    expect(r.portfolioForecastLevel).toBe('critical');
  });
});

// ── Confidence ────────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — confidence', function() {
  test('1 repo → low', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1)] });
    expect(r.confidenceLevel).toBe('low');
  });

  test('2 repos → low', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1), stableRepo(2)] });
    expect(r.confidenceLevel).toBe('low');
  });

  test('3 repos → medium', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1), stableRepo(2), stableRepo(3)] });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('4 repos → medium', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [1, 2, 3, 4].map(function(i) { return stableRepo(i); }) });
    expect(r.confidenceLevel).toBe('medium');
  });

  test('5 repos all high confidence → high', function() {
    const repos = [1, 2, 3, 4, 5].map(function(i) { return makeRepo({ repoId: i, confidenceLevel: 'high' }); });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.confidenceLevel).toBe('high');
  });

  test('5 repos ≥70% high/medium → high', function() {
    // 4 high/medium (80%) + 1 low → high
    const repos = [
      makeRepo({ repoId: 1, confidenceLevel: 'high' }),
      makeRepo({ repoId: 2, confidenceLevel: 'medium' }),
      makeRepo({ repoId: 3, confidenceLevel: 'high' }),
      makeRepo({ repoId: 4, confidenceLevel: 'medium' }),
      makeRepo({ repoId: 5, confidenceLevel: 'low' }),
    ];
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.confidenceLevel).toBe('high');
  });

  test('5 repos <70% high/medium → medium', function() {
    // 3 low (60% low) → only 40% high/medium → medium
    const repos = [
      makeRepo({ repoId: 1, confidenceLevel: 'high' }),
      makeRepo({ repoId: 2, confidenceLevel: 'medium' }),
      makeRepo({ repoId: 3, confidenceLevel: 'low' }),
      makeRepo({ repoId: 4, confidenceLevel: 'low' }),
      makeRepo({ repoId: 5, confidenceLevel: 'low' }),
    ];
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── Forecast distribution ─────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — forecastDistribution', function() {
  test('counts each forecastLevel correctly', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1), stableRepo(2),
        watchRepo(3),
        degradingRepo(4),
        criticalRepo(5),
        makeRepo({ repoId: 6, forecastLevel: 'unknown' }),
      ],
    });
    expect(r.forecastDistribution).toEqual({ stable: 2, watch: 1, degrading: 1, critical: 1, unknown: 1 });
  });

  test('unknown-ish level falls into unknown bucket', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [makeRepo({ repoId: 1, forecastLevel: 'mystery' })],
    });
    expect(r.forecastDistribution.unknown).toBe(1);
  });

  test('all stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1), stableRepo(2), stableRepo(3)],
    });
    expect(r.forecastDistribution).toEqual({ stable: 3, watch: 0, degrading: 0, critical: 0, unknown: 0 });
  });
});

// ── Projected risk repos ──────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — projectedRiskRepos', function() {
  test('includes only degrading and critical repos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1), watchRepo(2), degradingRepo(3), criticalRepo(4),
      ],
    });
    const levels = r.projectedRiskRepos.map(function(x) { return x.forecastLevel; });
    expect(levels).not.toContain('stable');
    expect(levels).not.toContain('watch');
    expect(levels).toContain('degrading');
    expect(levels).toContain('critical');
  });

  test('sorts by degradationRisk DESC then repoName ASC', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, repoName: 'z-repo', forecastLevel: 'degrading', degradationRisk: 50 }),
        makeRepo({ repoId: 2, repoName: 'a-repo', forecastLevel: 'critical',  degradationRisk: 80 }),
        makeRepo({ repoId: 3, repoName: 'b-repo', forecastLevel: 'degrading', degradationRisk: 50 }),
      ],
    });
    expect(r.projectedRiskRepos[0].repoName).toBe('a-repo');
    expect(r.projectedRiskRepos[1].repoName).toBe('b-repo');
    expect(r.projectedRiskRepos[2].repoName).toBe('z-repo');
  });

  test('includes primaryRisk from first riskFactor', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({
          repoId: 1, forecastLevel: 'degrading', degradationRisk: 50,
          riskFactors: [{ type: 'score_decline', severity: 'high' }],
        }),
      ],
    });
    expect(r.projectedRiskRepos[0].primaryRisk).toBe('score_decline');
  });

  test('primaryRisk is empty string when no riskFactors', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [makeRepo({ repoId: 1, forecastLevel: 'degrading', riskFactors: [] })],
    });
    expect(r.projectedRiskRepos[0].primaryRisk).toBe('');
  });

  test('includes projectedLevel from trajectory', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({
          repoId: 1, forecastLevel: 'degrading', degradationRisk: 50,
          trajectory: { scoreTrend: 'degrading', projectedLevel: 'risky' },
        }),
      ],
    });
    expect(r.projectedRiskRepos[0].projectedLevel).toBe('risky');
  });

  test('empty when no degrading/critical repos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1), watchRepo(2)],
    });
    expect(r.projectedRiskRepos).toEqual([]);
  });
});

// ── Projected hotspots ────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — projectedHotspots', function() {
  test('coupling hotspot when couplingForecast !== stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'growing', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'coupling'; });
    expect(hs).toBeDefined();
    expect(hs.repoCount).toBe(1);
    expect(hs.severity).toBe('low');
  });

  test('implementation hotspot when implementationHealthForecast !== stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'degrading', boundaryIntegrityForecast: 'stable' } }),
        makeRepo({ repoId: 2, structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'critical', boundaryIntegrityForecast: 'stable' } }),
        makeRepo({ repoId: 3, structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'degrading', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'implementation'; });
    expect(hs.repoCount).toBe(3);
    expect(hs.severity).toBe('high');
  });

  test('boundary hotspot when boundaryIntegrityForecast !== stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'eroding' } }),
        makeRepo({ repoId: 2, structuralProjection: { couplingForecast: 'stable', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'critical' } }),
      ],
    });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'boundary'; });
    expect(hs.repoCount).toBe(2);
    expect(hs.severity).toBe('medium');
  });

  test('volatility hotspot when scoreTrend === volatile', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, trajectory: { scoreTrend: 'volatile', projectedLevel: 'weak' } }),
        makeRepo({ repoId: 2, trajectory: { scoreTrend: 'volatile', projectedLevel: 'watch' } }),
        makeRepo({ repoId: 3, trajectory: { scoreTrend: 'volatile', projectedLevel: 'weak' } }),
      ],
    });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'volatility'; });
    expect(hs.repoCount).toBe(3);
    expect(hs.severity).toBe('high');
  });

  test('regression hotspot when forecastLevel is degrading/critical', function() {
    const repos = [1, 2, 3, 4, 5].map(function(i) { return degradingRepo(i, 55); });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'regression'; });
    expect(hs.severity).toBe('critical');
    expect(hs.repoCount).toBe(5);
  });

  test('hotspot severity thresholds: 1→low, 2→medium, 3→high, 5→critical', function() {
    function countHotspot(n) {
      const repos = Array.from({ length: n }, function(_, i) {
        return makeRepo({ repoId: i + 1, trajectory: { scoreTrend: 'volatile', projectedLevel: 'watch' } });
      });
      const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
      const hs = r.projectedHotspots.find(function(h) { return h.type === 'volatility'; });
      return hs ? hs.severity : null;
    }
    expect(countHotspot(1)).toBe('low');
    expect(countHotspot(2)).toBe('medium');
    expect(countHotspot(3)).toBe('high');
    expect(countHotspot(5)).toBe('critical');
  });

  test('no hotspot when no matching repos', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1)] });
    expect(r.projectedHotspots.find(function(h) { return h.type === 'regression'; })).toBeUndefined();
  });

  test('hotspot repos list contains correct repoId/repoName', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 7, repoName: 'svc-alpha', trajectory: { scoreTrend: 'volatile' } }),
      ],
    });
    const hs = r.projectedHotspots.find(function(h) { return h.type === 'volatility'; });
    expect(hs.repos[0]).toEqual({ repoId: 7, repoName: 'svc-alpha' });
  });
});

// ── Projected coupling pressure ───────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — projectedCouplingPressure', function() {
  test('level low when no coupling issues', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1)] });
    expect(r.projectedCouplingPressure.level).toBe('low');
    expect(r.projectedCouplingPressure.reposAtRisk).toHaveLength(0);
    expect(r.projectedCouplingPressure.acceleratingRepos).toHaveLength(0);
  });

  test('growing couplingForecast adds to reposAtRisk but not acceleratingRepos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'growing', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    expect(r.projectedCouplingPressure.reposAtRisk).toHaveLength(1);
    expect(r.projectedCouplingPressure.acceleratingRepos).toHaveLength(0);
  });

  test('accelerating couplingForecast adds to both reposAtRisk and acceleratingRepos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    expect(r.projectedCouplingPressure.reposAtRisk).toHaveLength(1);
    expect(r.projectedCouplingPressure.acceleratingRepos).toHaveLength(1);
  });

  test('level medium: 1 accelerating repo', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    expect(r.projectedCouplingPressure.level).toBe('medium');
  });

  test('level medium: 3 growing repos', function() {
    const repos = [1, 2, 3].map(function(i) {
      return makeRepo({ repoId: i, structuralProjection: { couplingForecast: 'growing', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } });
    });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.projectedCouplingPressure.level).toBe('medium');
  });

  test('level high: 3 accelerating repos', function() {
    const repos = [1, 2, 3].map(function(i) {
      return makeRepo({ repoId: i, structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } });
    });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.projectedCouplingPressure.level).toBe('high');
  });

  test('level critical: 5 accelerating repos', function() {
    const repos = [1, 2, 3, 4, 5].map(function(i) {
      return makeRepo({ repoId: i, structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } });
    });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.projectedCouplingPressure.level).toBe('critical');
  });

  test('projectedCircularDependencyRepos from coupling_acceleration riskFactor', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 9, repoName: 'svc-z', riskFactors: [{ type: 'coupling_acceleration', severity: 'high' }] }),
      ],
    });
    expect(r.projectedCouplingPressure.projectedCircularDependencyRepos).toEqual([{ repoId: 9, repoName: 'svc-z' }]);
  });

  test('projectedCircularDependencyRepos empty when no coupling_acceleration riskFactor', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [makeRepo({ repoId: 1, riskFactors: [{ type: 'score_decline', severity: 'medium' }] })],
    });
    expect(r.projectedCouplingPressure.projectedCircularDependencyRepos).toHaveLength(0);
  });
});

// ── Projected governance risk ─────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — projectedGovernanceRisk', function() {
  test('score 0 when no degrading/critical/volatile/accelerating', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1)] });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(0);
    expect(r.projectedGovernanceRisk.level).toBe('low');
  });

  test('critical repo contributes 15 pts each', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [criticalRepo(1, 80), criticalRepo(2, 80)],
    });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(30);
  });

  test('degrading repo contributes 8 pts each', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [degradingRepo(1, 50), degradingRepo(2, 50)],
    });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(16);
  });

  test('volatile trajectory contributes 5 pts each', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, trajectory: { scoreTrend: 'volatile' } }),
        makeRepo({ repoId: 2, trajectory: { scoreTrend: 'volatile' } }),
      ],
    });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(10);
  });

  test('accelerating coupling contributes 5 pts each', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } }),
      ],
    });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(5);
  });

  test('score capped at 100', function() {
    const repos = [1, 2, 3, 4, 5, 6, 7, 8].map(function(i) { return criticalRepo(i, 90); });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.projectedGovernanceRisk.governanceRiskScore).toBe(100);
  });

  test('level thresholds: 0→low, 25→medium, 50→high, 75→critical', function() {
    function govLevel(score) {
      const repos = [
        makeRepo({ repoId: 1, forecastLevel: 'critical', degradationRisk: score }),
        makeRepo({ repoId: 2, forecastLevel: 'critical', degradationRisk: score }),
      ];
      // Override governanceRiskScore by using specific combos instead
      return null; // defer to individual tests below
    }
    // Direct level tests via formula
    // score 0 → low
    expect(buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1, 5)] }).projectedGovernanceRisk.level).toBe('low');
    // 3 degrading → 24 → low (just under 25)
    expect(buildPortfolioForecastingIntelligence({ repoForecasts: [1,2,3].map(function(i){ return degradingRepo(i,50); }) }).projectedGovernanceRisk.level).toBe('low');
    // 4 degrading → 32 → medium
    expect(buildPortfolioForecastingIntelligence({ repoForecasts: [1,2,3,4].map(function(i){ return degradingRepo(i,50); }) }).projectedGovernanceRisk.level).toBe('medium');
    // 4 critical → 60 → high
    expect(buildPortfolioForecastingIntelligence({ repoForecasts: [1,2,3,4].map(function(i){ return criticalRepo(i,80); }) }).projectedGovernanceRisk.level).toBe('high');
    // 5 critical → 75 → critical
    expect(buildPortfolioForecastingIntelligence({ repoForecasts: [1,2,3,4,5].map(function(i){ return criticalRepo(i,80); }) }).projectedGovernanceRisk.level).toBe('critical');
  });

  test('degradingRepos/criticalRepos/unstableRepos contain correct refs', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, repoName: 'svc-a', forecastLevel: 'degrading' }),
        makeRepo({ repoId: 2, repoName: 'svc-b', forecastLevel: 'critical' }),
        makeRepo({ repoId: 3, repoName: 'svc-c', trajectory: { scoreTrend: 'volatile' } }),
      ],
    });
    expect(r.projectedGovernanceRisk.degradingRepos).toEqual([{ repoId: 1, repoName: 'svc-a' }]);
    expect(r.projectedGovernanceRisk.criticalRepos).toEqual([{ repoId: 2, repoName: 'svc-b' }]);
    expect(r.projectedGovernanceRisk.unstableRepos).toEqual([{ repoId: 3, repoName: 'svc-c' }]);
  });
});

// ── Trend forecast ────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — trendForecast', function() {
  test('direction degrading when averageRisk >= 45', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [degradingRepo(1, 45)] });
    expect(r.trendForecast.direction).toBe('degrading');
  });

  test('direction improving when averageRisk <= 20 and majority stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1, 10), stableRepo(2, 10), stableRepo(3, 10)],
    });
    expect(r.trendForecast.direction).toBe('improving');
    expect(r.trendForecast.averageRisk).toBe(10);
  });

  test('direction stable when averageRisk <= 20 but majority not stable', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1, 10),
        makeRepo({ repoId: 2, forecastLevel: 'watch', degradationRisk: 10 }),
        makeRepo({ repoId: 3, forecastLevel: 'watch', degradationRisk: 10 }),
      ],
    });
    expect(r.trendForecast.direction).toBe('stable');
  });

  test('direction stable when averageRisk in 21–44 range', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [watchRepo(1, 30)] });
    expect(r.trendForecast.direction).toBe('stable');
  });

  test('highestRisk and lowestRisk across valid repos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1, 5), watchRepo(2, 30), degradingRepo(3, 60)],
    });
    expect(r.trendForecast.highestRisk).toBe(60);
    expect(r.trendForecast.lowestRisk).toBe(5);
  });

  test('unknown repos excluded from trend risk stats', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1, 10),
        makeRepo({ repoId: 2, forecastLevel: 'unknown', degradationRisk: 99 }),
      ],
    });
    expect(r.trendForecast.highestRisk).toBe(10);
    expect(r.trendForecast.lowestRisk).toBe(10);
  });

  test('volatility is a non-negative number', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1, 10), stableRepo(2, 20), stableRepo(3, 30)],
    });
    expect(typeof r.trendForecast.volatility).toBe('number');
    expect(r.trendForecast.volatility).toBeGreaterThanOrEqual(0);
  });
});

// ── Benchmarking ──────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — benchmarking', function() {
  test('topStableRepos are stable repos sorted by risk ASC then name ASC', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(3, 15), stableRepo(1, 5), stableRepo(2, 15),
        watchRepo(4, 25),
      ],
    });
    const names = r.benchmarking.topStableRepos.map(function(x) { return x.repoName; });
    expect(names[0]).toBe('repo-1');  // lowest risk
    expect(names[1]).toBe('repo-2');  // 15, name 'repo-2' < 'repo-3'
    expect(names[2]).toBe('repo-3');  // 15
    expect(r.benchmarking.topStableRepos).toHaveLength(3);
  });

  test('topStableRepos capped at 5', function() {
    const repos = [1, 2, 3, 4, 5, 6].map(function(i) { return stableRepo(i, i * 2); });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.benchmarking.topStableRepos).toHaveLength(5);
  });

  test('highestRiskRepos sorted by risk DESC, excludes unknowns', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1, 10), watchRepo(2, 40), criticalRepo(3, 90),
        makeRepo({ repoId: 4, forecastLevel: 'unknown', degradationRisk: 99 }),
      ],
    });
    expect(r.benchmarking.highestRiskRepos[0].degradationRisk).toBe(90);
    expect(r.benchmarking.highestRiskRepos.every(function(x) { return x.forecastLevel !== 'unknown'; })).toBe(true);
  });

  test('highestRiskRepos capped at 5', function() {
    const repos = [1, 2, 3, 4, 5, 6].map(function(i) { return criticalRepo(i, 80 + i); });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.benchmarking.highestRiskRepos).toHaveLength(5);
  });

  test('improvingCandidates: stable/watch with improving trajectory', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, repoName: 'a', forecastLevel: 'stable',  trajectory: { scoreTrend: 'improving', projectedLevel: 'healthy' } }),
        makeRepo({ repoId: 2, repoName: 'b', forecastLevel: 'watch',   trajectory: { scoreTrend: 'improving', projectedLevel: 'watch' } }),
        makeRepo({ repoId: 3, repoName: 'c', forecastLevel: 'stable',  trajectory: { scoreTrend: 'stable',    projectedLevel: 'healthy' } }),
        makeRepo({ repoId: 4, repoName: 'd', forecastLevel: 'degrading', trajectory: { scoreTrend: 'improving', projectedLevel: 'watch' } }),
      ],
    });
    const names = r.benchmarking.improvingCandidates.map(function(x) { return x.repoName; });
    expect(names).toContain('a');
    expect(names).toContain('b');
    expect(names).not.toContain('c');
    expect(names).not.toContain('d');
  });

  test('criticalForecasts contains only critical repos', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        stableRepo(1), criticalRepo(2, 90), criticalRepo(3, 85), watchRepo(4),
      ],
    });
    const levels = r.benchmarking.criticalForecasts.map(function(x) { return x.forecastLevel; });
    expect(levels.every(function(l) { return l === 'critical'; })).toBe(true);
    expect(r.benchmarking.criticalForecasts).toHaveLength(2);
  });

  test('criticalForecasts sorted by risk DESC', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [criticalRepo(1, 80), criticalRepo(2, 95), criticalRepo(3, 88)],
    });
    const risks = r.benchmarking.criticalForecasts.map(function(x) { return x.degradationRisk; });
    expect(risks[0]).toBe(95);
    expect(risks[1]).toBe(88);
    expect(risks[2]).toBe(80);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — recommendations', function() {
  test('no recommendations for all-stable portfolio', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [stableRepo(1, 5), stableRepo(2, 5)],
    });
    expect(r.recommendations).toHaveLength(0);
  });

  test('critical repos trigger first recommendation', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [criticalRepo(1, 80)],
    });
    expect(r.recommendations[0]).toMatch(/critical/);
    expect(r.recommendations[0]).toMatch(/remediation/);
  });

  test('high coupling pressure triggers recommendation', function() {
    const repos = [1, 2, 3].map(function(i) {
      return makeRepo({ repoId: i, forecastLevel: 'stable', degradationRisk: 5,
        structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'stable', boundaryIntegrityForecast: 'stable' } });
    });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    const hasCouplRec = r.recommendations.some(function(rec) { return rec.toLowerCase().includes('coupling'); });
    expect(hasCouplRec).toBe(true);
  });

  test('degrading portfolio triggers recommendation when no other recs fill slots', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [degradingRepo(1, 55), degradingRepo(2, 55), degradingRepo(3, 55)],
    });
    expect(r.recommendations.length).toBeGreaterThan(0);
  });

  test('capped at 5 recommendations', function() {
    const repos = [1, 2, 3, 4, 5].map(function(i) {
      return makeRepo({
        repoId: i,
        forecastLevel: 'critical',
        degradationRisk: 90,
        trajectory: { scoreTrend: 'volatile', projectedLevel: 'risky' },
        structuralProjection: { couplingForecast: 'accelerating', implementationHealthForecast: 'critical', boundaryIntegrityForecast: 'critical' },
      });
    });
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  test('recommendations are strings', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [criticalRepo(1, 80), degradingRepo(2, 55)],
    });
    r.recommendations.forEach(function(rec) { expect(typeof rec).toBe('string'); });
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — summary', function() {
  test('stable portfolio summary mentions stable', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1, 10)] });
    expect(r.summary).toMatch(/stable/);
  });

  test('degrading portfolio summary mentions degrading', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [degradingRepo(1, 55)] });
    expect(r.summary).toMatch(/degrading/);
  });

  test('summary includes portfolio score', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1, 12)] });
    expect(r.summary).toMatch(/12/);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — non-mutation', function() {
  test('input array is not mutated', function() {
    const repos = [
      degradingRepo(1, 60), criticalRepo(2, 85), stableRepo(3, 10),
    ];
    const original = repos.map(function(r) { return Object.assign({}, r); });
    buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    repos.forEach(function(r, i) {
      expect(r.repoId).toBe(original[i].repoId);
      expect(r.forecastLevel).toBe(original[i].forecastLevel);
      expect(r.degradationRisk).toBe(original[i].degradationRisk);
    });
  });

  test('input object is not mutated', function() {
    const input = { repoForecasts: [stableRepo(1)] };
    const keys  = Object.keys(input);
    buildPortfolioForecastingIntelligence(input);
    expect(Object.keys(input)).toEqual(keys);
  });
});

// ── Missing / sparse fields ───────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — missing field safety', function() {
  test('repo without trajectory handled safely', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [{ repoId: 1, forecastLevel: 'stable', degradationRisk: 10 }],
    });
    expect(r.portfolioForecastLevel).toBe('stable');
  });

  test('repo without structuralProjection handled safely', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [{ repoId: 1, repoName: 'x', forecastLevel: 'degrading', degradationRisk: 50 }],
    });
    expect(r.projectedHotspots.find(function(h) { return h.type === 'coupling'; })).toBeUndefined();
  });

  test('repo without riskFactors handled safely', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [{ repoId: 1, forecastLevel: 'degrading', degradationRisk: 55 }],
    });
    expect(r.projectedRiskRepos[0].primaryRisk).toBe('');
  });

  test('non-numeric degradationRisk treated as 0', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        { repoId: 1, forecastLevel: 'stable', degradationRisk: 'bad' },
        { repoId: 2, forecastLevel: 'stable', degradationRisk: 20 },
      ],
    });
    expect(r.portfolioForecastScore).toBe(10);
  });

  test('output has all 12 top-level keys for valid input', function() {
    const r = buildPortfolioForecastingIntelligence({ repoForecasts: [stableRepo(1)] });
    const keys = [
      'portfolioForecastLevel', 'portfolioForecastScore', 'confidenceLevel', 'summary',
      'forecastDistribution', 'projectedRiskRepos', 'projectedHotspots',
      'projectedCouplingPressure', 'projectedGovernanceRisk', 'trendForecast',
      'recommendations', 'benchmarking',
    ];
    keys.forEach(function(k) { expect(r).toHaveProperty(k); });
  });
});

// ── Deterministic ordering ────────────────────────────────────────────────────

describe('buildPortfolioForecastingIntelligence — deterministic ordering', function() {
  test('same input produces identical output on repeated calls', function() {
    const repos = [
      stableRepo(1, 5), watchRepo(2, 30), degradingRepo(3, 55), criticalRepo(4, 85),
    ];
    const r1 = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    const r2 = buildPortfolioForecastingIntelligence({ repoForecasts: repos });
    expect(r1.portfolioForecastScore).toBe(r2.portfolioForecastScore);
    expect(r1.projectedRiskRepos.map(function(x) { return x.repoId; }))
      .toEqual(r2.projectedRiskRepos.map(function(x) { return x.repoId; }));
    expect(r1.benchmarking.highestRiskRepos.map(function(x) { return x.repoId; }))
      .toEqual(r2.benchmarking.highestRiskRepos.map(function(x) { return x.repoId; }));
  });

  test('projectedRiskRepos tie-break by repoName ascending', function() {
    const r = buildPortfolioForecastingIntelligence({
      repoForecasts: [
        makeRepo({ repoId: 1, repoName: 'zoo', forecastLevel: 'critical', degradationRisk: 80 }),
        makeRepo({ repoId: 2, repoName: 'ant', forecastLevel: 'critical', degradationRisk: 80 }),
        makeRepo({ repoId: 3, repoName: 'mid', forecastLevel: 'critical', degradationRisk: 80 }),
      ],
    });
    const names = r.projectedRiskRepos.map(function(x) { return x.repoName; });
    expect(names).toEqual(['ant', 'mid', 'zoo']);
  });
});
