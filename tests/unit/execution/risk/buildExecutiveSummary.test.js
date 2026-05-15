'use strict';

const { buildExecutiveSummary } = require('../../../../execution/risk/buildExecutiveSummary');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePortfolioForecast(overrides = {}) {
  return {
    portfolioTrajectory: 'stable',
    portfolioRiskLevel:  'low',
    summary:             'Portfolio is operationally stable.',
    counts:              { escalating: 0, deteriorating: 0, volatile: 0, recovering: 0, stable: 5, unknown: 0 },
    signals:             [],
    ...overrides,
  };
}

function makeRepo(overrides = {}) {
  return {
    id:                1,
    repoId:            1,
    ciStatus:          'passing',
    releaseStatus:     'healthy',
    contributorStatus: 'healthy',
    score:             20,
    trajectory:        'stable',
    persistentRisk:    false,
    ...overrides,
  };
}

function makeAttentionMap(items = []) {
  const map = {};
  items.forEach(function(it) { map[it.repoId] = it; });
  return map;
}

// ── Output shape ──────────────────────────────────────────────────────────────

describe('buildExecutiveSummary — output shape', () => {
  it('returns all required fields for a known portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast(),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(result).toHaveProperty('severity');
    expect(result).toHaveProperty('headline');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('themes');
    expect(result).toHaveProperty('recommendations');
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('themes is capped at 3 even with many concerns', () => {
    const repos = [
      makeRepo({ ciStatus: 'failing',         trajectory: 'escalating', persistentRisk: true }),
      makeRepo({ ciStatus: 'failing',         trajectory: 'escalating', persistentRisk: true, id: 2, repoId: 2 }),
      makeRepo({ contributorStatus: 'bus_factor_risk', id: 3, repoId: 3 }),
      makeRepo({ releaseStatus: 'stale',       id: 4, repoId: 4 }),
      makeRepo({ contributorStatus: 'abandoned', id: 5, repoId: 5 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.length).toBeLessThanOrEqual(3);
  });

  it('recommendations is capped at 3', () => {
    const repos = [
      makeRepo({ ciStatus: 'failing',         trajectory: 'escalating', id: 1, repoId: 1 }),
      makeRepo({ contributorStatus: 'bus_factor_risk', id: 2, repoId: 2 }),
      makeRepo({ releaseStatus: 'stale',       id: 3, repoId: 3 }),
      makeRepo({ contributorStatus: 'abandoned', id: 4, repoId: 4 }),
      makeRepo({ persistentRisk: true,         id: 5, repoId: 5 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.length).toBeLessThanOrEqual(3);
  });
});

// ── Sparse / unknown history ──────────────────────────────────────────────────

describe('buildExecutiveSummary — sparse history', () => {
  it('returns unknown severity when portfolioTrajectory is unknown', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'unknown' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(result.severity).toBe('unknown');
  });

  it('returns the sparse headline when trajectory is unknown', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'unknown' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(result.headline).toBe('Insufficient operational history');
  });

  it('returns empty themes and recommendations for sparse data', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'unknown' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(result.themes).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });

  it('returns sparse result when called with no arguments', () => {
    const result = buildExecutiveSummary();
    expect(result.severity).toBe('unknown');
    expect(result.headline).toBe('Insufficient operational history');
  });

  it('returns sparse result when portfolioForecast is missing', () => {
    const result = buildExecutiveSummary({ repos: [makeRepo()], attentionMap: {} });
    expect(result.severity).toBe('unknown');
  });

  it('sparse summary contains guidance about sync history', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'unknown' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(result.summary.toLowerCase()).toContain('history');
  });
});

// ── Healthy portfolio ─────────────────────────────────────────────────────────

describe('buildExecutiveSummary — healthy portfolio', () => {
  it('returns healthy severity when all repos are stable with no elevated attention', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1 }),
      makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const attentionMap = makeAttentionMap([
      { repoId: 1, attentionLevel: 'healthy', attentionScore: 0 },
      { repoId: 2, attentionLevel: 'healthy', attentionScore: 0 },
      { repoId: 3, attentionLevel: 'healthy', attentionScore: 0 },
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    expect(result.severity).toBe('healthy');
    expect(result.headline).toBe('Operationally stable');
  });

  it('summary mentions stability for a healthy portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo(), makeRepo({ id: 2, repoId: 2 })],
      attentionMap:      {},
    });
    expect(result.summary.toLowerCase()).toContain('stable');
  });

  it('produces no themes or recommendations when portfolio is clean', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo(), makeRepo({ id: 2, repoId: 2 })],
      attentionMap:      {},
    });
    expect(result.themes).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
  });
});

// ── Deteriorating portfolio ───────────────────────────────────────────────────

describe('buildExecutiveSummary — deteriorating portfolio', () => {
  it('returns high severity for deteriorating portfolio', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'deteriorating', ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'deteriorating', ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.severity).toBe('high');
  });

  it('headline is "Operational instability increasing" for deteriorating', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos:             [makeRepo({ trajectory: 'deteriorating' })],
      attentionMap:      {},
    });
    expect(result.headline).toBe('Operational instability increasing');
  });

  it('summary mentions the top concern for deteriorating portfolio', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'deteriorating', ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'deteriorating', ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toContain('ci');
  });

  it('themes include CI instability when multiple CI failures present', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci'); })).toBe(true);
  });

  it('recommendations include CI stabilization when CI failing', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil'); })).toBe(true);
  });
});

// ── Escalating portfolio ──────────────────────────────────────────────────────

describe('buildExecutiveSummary — escalating portfolio', () => {
  it('returns critical severity for escalating portfolio', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'escalating', ciStatus: 'failing', persistentRisk: true }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'escalating', ciStatus: 'failing', persistentRisk: true }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result.severity).toBe('critical');
  });

  it('headline is "Escalation risk concentrated" for escalating portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos:             [makeRepo({ trajectory: 'escalating' })],
      attentionMap:      {},
    });
    expect(result.headline).toBe('Escalation risk concentrated');
  });

  it('summary mentions risk elevation for escalating portfolio', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'escalating', ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'escalating', ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toContain('risk');
  });

  it('recommendations include investigating escalating repos', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'escalating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('escalat'); })).toBe(true);
  });
});

// ── Volatility-driven portfolio ───────────────────────────────────────────────

describe('buildExecutiveSummary — volatility-driven portfolio', () => {
  it('returns medium severity for volatile portfolio without persistent risk', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'volatile', portfolioRiskLevel: 'medium' }),
      repos:             [makeRepo({ trajectory: 'volatile' })],
      attentionMap:      {},
    });
    expect(result.severity).toBe('medium');
  });

  it('headline is "Portfolio volatility elevated" for volatile portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'volatile', portfolioRiskLevel: 'medium' }),
      repos:             [makeRepo({ trajectory: 'volatile' })],
      attentionMap:      {},
    });
    expect(result.headline).toBe('Portfolio volatility elevated');
  });

  it('summary mentions instability for volatile portfolio', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'volatile', ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'volatile', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toContain('instabilit');
  });
});

// ── Improving portfolio ───────────────────────────────────────────────────────

describe('buildExecutiveSummary — improving portfolio', () => {
  it('returns low severity for improving portfolio when some medium attention exists', () => {
    const attentionMap = makeAttentionMap([
      { repoId: 1, attentionLevel: 'medium', attentionScore: 25 },
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({
        portfolioTrajectory: 'improving',
        portfolioRiskLevel:  'low',
        counts:              { escalating: 0, deteriorating: 1, volatile: 0, recovering: 4, stable: 2, unknown: 0 },
      }),
      repos:        [makeRepo({ trajectory: 'recovering' })],
      attentionMap,
    });
    expect(result.severity).toBe('low');
  });

  it('headline is "Recovery trends emerging" for improving portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'improving', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo({ trajectory: 'recovering' })],
      attentionMap:      {},
    });
    expect(result.headline).toBe('Recovery trends emerging');
  });

  it('summary mentions recovery for improving portfolio', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({
        portfolioTrajectory: 'improving',
        portfolioRiskLevel:  'low',
        counts:              { escalating: 0, deteriorating: 0, volatile: 0, recovering: 3, stable: 2, unknown: 0 },
      }),
      repos:        [makeRepo({ trajectory: 'recovering' })],
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toContain('recover');
  });
});

// ── Recurring theme derivation ────────────────────────────────────────────────

describe('buildExecutiveSummary — recurring theme derivation', () => {
  it('CI failures appear in themes when multiple repos have CI failing', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'failing' }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci'); })).toBe(true);
  });

  it('contributor concentration appears in themes when bus_factor repos exist', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('contributor'); })).toBe(true);
  });

  it('persistent risk appears in themes when multiple repos have persistentRisk=true', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, persistentRisk: true }),
      makeRepo({ id: 2, repoId: 2, persistentRisk: true }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('persistent'); })).toBe(true);
  });

  it('themes are ordered by severity weight (CI failing above release stale)', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing', releaseStatus: 'stale' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'failing', releaseStatus: 'stale' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    // CI failing (weight 40) should appear before release stale (weight 20)
    const ciIdx      = result.themes.findIndex(function(t) { return t.toLowerCase().includes('ci'); });
    const releaseIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('release'); });
    if (ciIdx !== -1 && releaseIdx !== -1) {
      expect(ciIdx).toBeLessThan(releaseIdx);
    }
  });

  it('single repo concern still appears in themes', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo({ ciStatus: 'failing' })],
      attentionMap:      {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci'); })).toBe(true);
  });
});

// ── Recommendation derivation ─────────────────────────────────────────────────

describe('buildExecutiveSummary — recommendation derivation', () => {
  it('CI failure maps to CI stabilization recommendation', () => {
    const repos = [makeRepo({ ciStatus: 'failing' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil');
    })).toBe(true);
  });

  it('contributor bus_factor maps to ownership coverage recommendation', () => {
    const repos = [makeRepo({ contributorStatus: 'bus_factor_risk' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('contributor') || r.toLowerCase().includes('concentration');
    })).toBe(true);
  });

  it('release stale maps to cadence recommendation', () => {
    const repos = [makeRepo({ releaseStatus: 'stale' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('release') || r.toLowerCase().includes('cadence');
    })).toBe(true);
  });

  it('escalating trajectory maps to investigate recommendation', () => {
    const repos = [makeRepo({ trajectory: 'escalating' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('escalat') || r.toLowerCase().includes('investig');
    })).toBe(true);
  });

  it('recommendations are deduplicated', () => {
    // Multiple repos with same concern should not produce duplicate recommendations
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'failing' }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    const ciRecs = result.recommendations.filter(function(r) {
      return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil');
    });
    expect(ciRecs.length).toBe(1);
  });
});

// ── Severity derivation ───────────────────────────────────────────────────────

describe('buildExecutiveSummary — severity derivation', () => {
  it('maps critical portfolioRiskLevel to critical severity', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(result.severity).toBe('critical');
  });

  it('maps high portfolioRiskLevel to high severity', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(result.severity).toBe('high');
  });

  it('maps medium portfolioRiskLevel to medium severity', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'volatile', portfolioRiskLevel: 'medium' }),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(result.severity).toBe('medium');
  });

  it('returns healthy when low risk and no elevated attention', () => {
    const attentionMap = makeAttentionMap([
      { repoId: 1, attentionLevel: 'healthy', attentionScore: 0 },
      { repoId: 2, attentionLevel: 'healthy', attentionScore: 0 },
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })],
      attentionMap,
    });
    expect(result.severity).toBe('healthy');
  });

  it('returns low (not healthy) when low risk but medium attention exists', () => {
    const attentionMap = makeAttentionMap([
      { repoId: 1, attentionLevel: 'medium', attentionScore: 30 },
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo({ id: 1, repoId: 1 })],
      attentionMap,
    });
    expect(result.severity).toBe('low');
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('buildExecutiveSummary — edge cases', () => {
  it('handles empty repos array without throwing', () => {
    expect(() => buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [],
      attentionMap:      {},
    })).not.toThrow();
  });

  it('handles null repos without throwing', () => {
    expect(() => buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             null,
      attentionMap:      {},
    })).not.toThrow();
  });

  it('handles null attentionMap without throwing', () => {
    expect(() => buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo()],
      attentionMap:      null,
    })).not.toThrow();
  });

  it('themes and recommendations are always arrays', () => {
    const result = buildExecutiveSummary();
    expect(Array.isArray(result.themes)).toBe(true);
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('repos with unknown ciStatus do not pollute CI failing count', () => {
    const repos = [makeRepo({ ciStatus: 'unknown' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci instabilit'); })).toBe(false);
  });

  it('repos with passing ciStatus do not appear in CI theme', () => {
    const repos = [makeRepo({ ciStatus: 'passing' })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci instabilit'); })).toBe(false);
  });

  it('summary is always a non-empty string', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(typeof result.summary).toBe('string');
    expect(result.summary.length).toBeGreaterThan(0);
  });
});
