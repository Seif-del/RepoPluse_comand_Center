'use strict';

const { buildExecutiveSummary } = require('../../../../execution/risk/buildExecutiveSummary');
const { getAttentionQueue }     = require('../../../../execution/risk/getAttentionQueue');

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

// ── Operational priority alignment ────────────────────────────────────────────

describe('buildExecutiveSummary — operational priority alignment', () => {
  it('CI failing (weight 40) outranks contributor bus-factor (weight 12) in themes', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 3, repoId: 3, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    const ciIdx  = result.themes.findIndex(function(t) { return t.toLowerCase().includes('ci'); });
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(ciIdx).toBeGreaterThanOrEqual(0);
    if (busIdx !== -1) expect(ciIdx).toBeLessThan(busIdx);
  });

  it('no_commits (weight 25) outranks release_stale (weight 10) in themes', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, releaseStatus: 'stale' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const noCommitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const releaseIdx  = result.themes.findIndex(function(t) { return t.toLowerCase().includes('release'); });
    expect(noCommitIdx).toBeGreaterThanOrEqual(0);
    if (releaseIdx !== -1) expect(noCommitIdx).toBeLessThan(releaseIdx);
  });

  it('no_commits (weight 25) outranks contributor_bus_factor (weight 12) in themes', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const noCommitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const busIdx      = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(noCommitIdx).toBeGreaterThanOrEqual(0);
    if (busIdx !== -1) expect(noCommitIdx).toBeLessThan(busIdx);
  });

  it('CI recommendation precedes bus-factor recommendation', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'failing' }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    const ciIdx  = result.recommendations.findIndex(function(r) { return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil'); });
    const busIdx = result.recommendations.findIndex(function(r) { return r.toLowerCase().includes('concentration'); });
    expect(ciIdx).toBeGreaterThanOrEqual(0);
    if (busIdx !== -1) expect(ciIdx).toBeLessThan(busIdx);
  });

  it('no_commits recommendation precedes release_stale recommendation', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, releaseStatus: 'stale' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const noCommitIdx = result.recommendations.findIndex(function(r) { return r.toLowerCase().includes('commit') || r.toLowerCase().includes('inactive'); });
    const releaseIdx  = result.recommendations.findIndex(function(r) { return r.toLowerCase().includes('release') || r.toLowerCase().includes('cadence'); });
    expect(noCommitIdx).toBeGreaterThanOrEqual(0);
    if (releaseIdx !== -1) expect(noCommitIdx).toBeLessThan(releaseIdx);
  });
});

// ── no_commits concern ────────────────────────────────────────────────────────

describe('buildExecutiveSummary — no_commits concern', () => {
  it('detects no_commits theme when repos have noRecentCommits=true', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });

  it('no_commits theme text includes the repo count', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const theme = result.themes.find(function(t) { return t.toLowerCase().includes('commit'); });
    expect(theme).toBeDefined();
    expect(theme).toContain('3');
  });

  it('no_commits recommendation maps to restore commit activity', () => {
    const repos = [makeRepo({ id: 1, repoId: 1, noRecentCommits: true })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('commit') || r.toLowerCase().includes('inactive');
    })).toBe(true);
  });

  it('repos without noRecentCommits do not trigger no_commits theme', () => {
    const repos = [makeRepo({ id: 1, repoId: 1, noRecentCommits: false })];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('no recent commit'); })).toBe(false);
  });

  it('single repo with noRecentCommits still triggers the theme', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos:             [makeRepo({ noRecentCommits: true })],
      attentionMap:      {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });
});

// ── Confidence-aware wording ──────────────────────────────────────────────────

describe('buildExecutiveSummary — confidence-aware wording', () => {
  it('low confidence + escalating → summary uses soft language', () => {
    // low confidence: < 50% repos have a non-null score
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: null, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: null, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: 20,  ciStatus: 'passing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    expect(lower.includes('limited telemetry') || lower.includes('preliminary')).toBe(true);
  });

  it('high confidence + escalating → summary uses decisive language', () => {
    // high confidence: all 3 repos have score, total >= 3 → ratio 1.0 >= 0.8
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 80, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: 75, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: 70, ciStatus: 'failing', trajectory: 'escalating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    expect(lower.includes('sustained') || lower.includes('confirmed') || lower.includes('confirm')).toBe(true);
  });

  it('high confidence + deteriorating → summary uses decisive language', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 70, ciStatus: 'failing', trajectory: 'deteriorating' }),
      makeRepo({ id: 2, repoId: 2, score: 65, ciStatus: 'failing', trajectory: 'deteriorating' }),
      makeRepo({ id: 3, repoId: 3, score: 60, trajectory: 'deteriorating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    expect(lower.includes('sustained') || lower.includes('confirmed')).toBe(true);
  });

  it('unscored repos generate telemetry_gaps concern, not the "no concerns" path', () => {
    // Repos with score: null are now detected as telemetry gaps.
    // The "preliminary / confidence reduced" no-concerns path is no longer reached.
    // Instead a telemetry_gaps theme surfaces.
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: null }),
      makeRepo({ id: 2, repoId: 2, score: null }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('telemetry'); })).toBe(true);
  });

  it('medium confidence uses neutral language (no "limited telemetry" or "sustained")', () => {
    // medium confidence: exactly 2 of 4 repos have a score → ratio 0.5 → medium
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 80, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: 75, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: null }),
      makeRepo({ id: 4, repoId: 4, score: null }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    expect(lower.includes('limited telemetry')).toBe(false);
    expect(lower.includes('sustained')).toBe(false);
  });
});

// ── Attention-map-derived themes ──────────────────────────────────────────────

describe('buildExecutiveSummary — attention-map-derived themes', () => {
  // Builds an attention map entry with explicit reason strings.
  function amEntry(repoId, reasons, level) {
    return { repoId: repoId, attentionLevel: level || 'high', attentionScore: 50, reasons: reasons };
  }

  it('derives commit-inactivity theme from attention-map "No recent commits" reasons', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }), makeRepo({ id: 4, repoId: 4 }),
      makeRepo({ id: 5, repoId: 5 }),
    ];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['No recent commits', 'Monitored risk score (30)']),
      amEntry(2, ['No recent commits']),
      amEntry(3, ['No recent commits']),
      amEntry(4, ['No recent commits']),
      amEntry(5, ['No recent commits']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
    const theme = result.themes.find(function(t) { return t.toLowerCase().includes('commit'); });
    expect(theme).toContain('5');
  });

  it('derives CI-failing theme from attention-map "CI pipeline is failing" reasons', () => {
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }), makeRepo({ id: 3, repoId: 3 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['CI pipeline is failing', 'Escalating operational trajectory']),
      amEntry(2, ['CI pipeline is failing']),
      amEntry(3, ['CI pipeline is failing']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci'); })).toBe(true);
  });

  it('structural concern with count < 3 is suppressed when operational concern present', () => {
    // 2 CI failing (operational) + 1 bus-factor (structural, count < threshold 3) → bus-factor suppressed
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }), makeRepo({ id: 3, repoId: 3 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['CI pipeline is failing']),
      amEntry(2, ['CI pipeline is failing']),
      amEntry(3, ['High bus-factor risk']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap,
    });
    const ciIdx  = result.themes.findIndex(function(t) { return t.toLowerCase().includes('ci'); });
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(ciIdx).toBeGreaterThanOrEqual(0);
    expect(busIdx).toBe(-1); // suppressed: count 1 < threshold 3
  });

  it('widespread structural concern (≥3 repos) survives suppression even with operational concern', () => {
    // 3 bus-factor (structural, meets threshold 3) + 1 CI failing → bus-factor NOT suppressed
    const repos = [
      makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }), makeRepo({ id: 4, repoId: 4 }),
    ];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['High bus-factor risk']),
      amEntry(2, ['High bus-factor risk']),
      amEntry(3, ['High bus-factor risk']),
      amEntry(4, ['CI pipeline is failing']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap,
    });
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(busIdx).toBeGreaterThanOrEqual(0); // threshold met → not suppressed
  });

  it('structural concern appears when no operational concerns present', () => {
    // Bus-factor alone (no operational concerns) → not suppressed regardless of count
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['High bus-factor risk'], 'low'),
      amEntry(2, ['High bus-factor risk'], 'low'),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(busIdx).toBeGreaterThanOrEqual(0); // no operational concerns → not suppressed
  });

  it('attention-map commit inactivity maps to restore-commit recommendation', () => {
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['No recent commits']),
      amEntry(2, ['No recent commits']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('commit') || r.toLowerCase().includes('inactive');
    })).toBe(true);
  });

  it('mixed portfolio: escalation + commit-inactivity from attention map both surface in themes', () => {
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }), makeRepo({ id: 3, repoId: 3 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['Escalating operational trajectory', 'CI pipeline is failing'], 'critical'),
      amEntry(2, ['Escalating operational trajectory', 'No recent commits'], 'high'),
      amEntry(3, ['No recent commits'], 'medium'),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap,
    });
    const hasCommit    = result.themes.some(function(t) { return t.toLowerCase().includes('commit'); });
    const hasEscalating = result.themes.some(function(t) { return t.toLowerCase().includes('escalat'); });
    expect(hasCommit || hasEscalating).toBe(true);
    expect(result.themes.length).toBeGreaterThan(0);
    expect(result.themes.length).toBeLessThanOrEqual(3);
  });

  it('attention-map CI failures map to CI stabilization recommendation', () => {
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['CI pipeline is failing', 'No recent commits']),
      amEntry(2, ['CI pipeline is failing']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap,
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil');
    })).toBe(true);
  });

  it('abandoned repo reason from attention map triggers abandonment theme', () => {
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['Repository appears abandoned'], 'critical'),
      amEntry(2, ['Repository appears abandoned'], 'critical'),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('abandon'); })).toBe(true);
  });

  it('attention map with only structural reasons and no operational produces structural theme', () => {
    // No operational reasons at all → structural not suppressed
    const repos = [makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 })];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['Stale release cadence'], 'low'),
      amEntry(2, ['No releases found'], 'low'),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    const hasRelease = result.themes.some(function(t) {
      return t.toLowerCase().includes('release');
    });
    expect(hasRelease).toBe(true);
  });
});

// ── Telemetry gap and inactivity-dominant ─────────────────────────────────────

describe('buildExecutiveSummary — telemetry gap and inactivity-dominant', () => {
  it('headline overrides "Operationally stable" when ≥50% repos have no_commits', () => {
    // 3 repos, 2 with noRecentCommits → 2/3 ≈ 67% ≥ 50%
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline).not.toBe('Operationally stable');
    expect(result.headline.toLowerCase()).toMatch(/activity|inactive|subdued|limited/);
  });

  it('inactivity + isolated escalation produces "subdued with isolated instability" headline', () => {
    // 3 of 5 repos inactive (60%), 1 escalating → subdued + instability variant
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, trajectory: 'escalating' }),
      makeRepo({ id: 5, repoId: 5 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline.toLowerCase()).toContain('subdued');
    expect(result.headline.toLowerCase()).toContain('instabilit');
  });

  it('headline overrides to telemetry language when ≥50% repos have telemetry_gaps', () => {
    // 2 of 3 repos with ciStatus unknown → 2/3 ≈ 67% ≥ 50%
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'unknown' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'unknown' }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline.toLowerCase()).toMatch(/telemetry|sparse/);
  });

  it('headline override requires at least 2 repos — single repo with no_commits does not override', () => {
    // 1 of 3 repos with no_commits → 33% < 50% → no override
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline).toBe('Operationally stable');
  });

  it('non-stable trajectories always use HEADLINE_MAP regardless of inactivity', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'deteriorating', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline).toBe('Operational instability increasing');
  });

  it('detects telemetry_gaps theme from attention-map "CI status unknown" reasons', () => {
    function amEntry(repoId, reasons, level) {
      return { repoId: repoId, attentionLevel: level || 'low', attentionScore: 5, reasons: reasons };
    }
    const repos = [
      makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }), makeRepo({ id: 3, repoId: 3 }),
    ];
    const attentionMap = makeAttentionMap([
      amEntry(1, ['CI status unknown']),
      amEntry(2, ['Release status unknown']),
      amEntry(3, ['Contributor status unknown']),
    ]);
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('telemetry'); })).toBe(true);
  });

  it('unscored repos (score: null) generate telemetry_gaps theme via repos fallback', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: null }),
      makeRepo({ id: 2, repoId: 2, score: null }),
      makeRepo({ id: 3, repoId: 3, score: 20 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('telemetry'); })).toBe(true);
  });

  it('telemetry_gaps concern maps to improve-telemetry recommendation', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'unknown', score: null }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'unknown', score: null }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('telemetry') || r.toLowerCase().includes('sync');
    })).toBe(true);
  });

  it('confidence capped to medium when widespread telemetry gaps despite high scored-repo ratio', () => {
    // All 3 repos scored → normally high confidence. But 2/3 have ciStatus unknown → capped to medium.
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 80, ciStatus: 'unknown', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: 75, ciStatus: 'unknown', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: 70, ciStatus: 'failing', trajectory: 'escalating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    // Capped to medium → decisive "sustained" / "confirmed" language should not appear
    expect(lower.includes('sustained')).toBe(false);
    expect(lower.includes('confirmed')).toBe(false);
  });

  it('no_commits outranks telemetry_gaps in theme ordering (weight 25 vs 18)', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'unknown' }),
      makeRepo({ id: 4, repoId: 4, ciStatus: 'unknown' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const commitIdx   = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const telemetryIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('telemetry'); });
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    if (telemetryIdx !== -1) expect(commitIdx).toBeLessThan(telemetryIdx);
  });
});

// ── Salience-aware synthesis ──────────────────────────────────────────────────

describe('buildExecutiveSummary — salience-aware synthesis', () => {
  it('operational concern outranks structural concern even when structural has higher weighted count', () => {
    // no_commits=1 (score 25×1=25) vs contributor_bus_factor=5 (score 12×5=60)
    // weight-only ranking would put bus_factor first; tier-based must not
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 3, repoId: 3, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const noCommitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const busIdx      = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    expect(noCommitIdx).toBeGreaterThanOrEqual(0);
    expect(noCommitIdx).toBeLessThan(busIdx);
  });

  it('all operational themes appear before any structural theme', () => {
    // 2 operational (no_commits, telemetry_gaps) + 1 structural (bus_factor with high count)
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'unknown' }),
      makeRepo({ id: 3, repoId: 3, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    // structural (bus_factor) must not appear before any operational theme
    for (var i = 0; i < result.themes.length; i++) {
      if (busIdx !== -1 && i < busIdx) {
        expect(result.themes[i].toLowerCase()).not.toContain('concentration');
      }
    }
    // commit and telemetry themes appear before bus_factor
    const commitIdx    = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const telemetryIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('telemetry'); });
    if (commitIdx !== -1 && busIdx !== -1)    expect(commitIdx).toBeLessThan(busIdx);
    if (telemetryIdx !== -1 && busIdx !== -1) expect(telemetryIdx).toBeLessThan(busIdx);
  });

  it('isolated critical repo (ci_failing + abandoned) appears in top-3 themes alongside inactivity dominance', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, noRecentCommits: true }),
      makeRepo({ id: 5, repoId: 5, ciStatus: 'failing', contributorStatus: 'abandoned' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    const hasNoCommit = result.themes.some(function(t) { return t.toLowerCase().includes('commit'); });
    const hasCritical = result.themes.some(function(t) {
      return t.toLowerCase().includes('ci') || t.toLowerCase().includes('abandon');
    });
    expect(hasNoCommit).toBe(true);
    expect(hasCritical).toBe(true);
  });

  it('structural concerns do not appear in top-2 themes when operational signals dominate', () => {
    // 3 no_commits + 3 telemetry_gaps + 5 bus_factor
    // bus_factor raw score (12×5=60) exceeds telemetry (18×3=54) but must stay at position 3+
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true, ciStatus: 'unknown' }),
      makeRepo({ id: 4, repoId: 4, ciStatus: 'unknown' }),
      makeRepo({ id: 5, repoId: 5, ciStatus: 'unknown', contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 7, repoId: 7, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 8, repoId: 8, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 9, repoId: 9, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    if (result.themes.length > 0) {
      expect(result.themes[0].toLowerCase()).not.toContain('concentration');
    }
    if (result.themes.length > 1) {
      expect(result.themes[1].toLowerCase()).not.toContain('concentration');
    }
    const busIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('concentration'); });
    if (busIdx !== -1) expect(busIdx).toBeGreaterThanOrEqual(2);
  });

  it('inactivity-dominant stable portfolio with isolated CI failure produces critical instability headline', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, ciStatus: 'failing' }),
      makeRepo({ id: 5, repoId: 5 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    expect(result.headline.toLowerCase()).toContain('subdued');
    expect(result.headline.toLowerCase()).toContain('critical');
  });

  it('inactivity-dominant stable portfolio uses subdued-activity language in summary', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toMatch(/subdued|inactive|activity/);
  });

  it('telemetry-dominant stable portfolio uses assessment-limitation language in summary', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'unknown', score: null }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'unknown', score: null }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'unknown', score: null }),
      makeRepo({ id: 4, repoId: 4 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    expect(result.summary.toLowerCase()).toMatch(/assess|visibility|telemetry/);
  });

  it('salience-ordered themes drive recommendations in same operational-first order', () => {
    // no_commits (operational) must produce commit-restore recommendation before bus_factor recommendation
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 3, repoId: 3, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap: {},
    });
    const commitRecIdx = result.recommendations.findIndex(function(r) {
      return r.toLowerCase().includes('commit') || r.toLowerCase().includes('inactive');
    });
    const busRecIdx = result.recommendations.findIndex(function(r) {
      return r.toLowerCase().includes('concentration');
    });
    expect(commitRecIdx).toBeGreaterThanOrEqual(0);
    if (busRecIdx !== -1) expect(commitRecIdx).toBeLessThan(busRecIdx);
  });
});

// ── Dominant-cluster synthesis ────────────────────────────────────────────────

describe('buildExecutiveSummary — dominant-cluster synthesis', () => {
  // ── Inactivity-dominant: full structural suppression ─────────────────────

  it('inactivity-dominant cluster fully suppresses structural even when structural count ≥ 3', () => {
    // no_commits=3 (widespread, count ≥ 2) → ALL structural zeroed regardless of count
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 7, repoId: 7, releaseStatus: 'none' }),
      makeRepo({ id: 8, repoId: 8, releaseStatus: 'none' }),
      makeRepo({ id: 9, repoId: 9, releaseStatus: 'none' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('release'); })).toBe(false);
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('cadence') || r.toLowerCase().includes('release'); })).toBe(false);
  });

  // ── Telemetry-dominant: full structural suppression ───────────────────────

  it('telemetry-dominant cluster fully suppresses structural even when structural count ≥ 3', () => {
    // telemetry_gaps=3 (widespread) → ALL structural zeroed
    const repos = [
      makeRepo({ id: 1, repoId: 1, ciStatus: 'unknown' }),
      makeRepo({ id: 2, repoId: 2, ciStatus: 'unknown' }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'unknown' }),
      makeRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 7, repoId: 7, releaseStatus: 'none' }),
      makeRepo({ id: 8, repoId: 8, releaseStatus: 'none' }),
      makeRepo({ id: 9, repoId: 9, releaseStatus: 'none' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('release'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('telemetry'); })).toBe(true);
  });

  // ── Combined inactivity + telemetry → structural eliminated ──────────────

  it('combined inactivity and telemetry dominance eliminates structural from themes and recommendations', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, ciStatus: 'unknown' }),
      makeRepo({ id: 4, repoId: 4, ciStatus: 'unknown' }),
      makeRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 6, repoId: 6, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 7, repoId: 7, contributorStatus: 'bus_factor_risk' }),
      makeRepo({ id: 8, repoId: 8, releaseStatus: 'none' }),
      makeRepo({ id: 9, repoId: 9, releaseStatus: 'none' }),
      makeRepo({ id: 10, repoId: 10, releaseStatus: 'none' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    const hasStructuralTheme = result.themes.some(function(t) {
      return t.toLowerCase().includes('concentration') || t.toLowerCase().includes('release');
    });
    const hasStructuralRec = result.recommendations.some(function(r) {
      return r.toLowerCase().includes('concentration') || r.toLowerCase().includes('cadence') || r.toLowerCase().includes('release');
    });
    expect(hasStructuralTheme).toBe(false);
    expect(hasStructuralRec).toBe(false);
  });

  // ── Isolated critical promotion ───────────────────────────────────────────

  it('isolated critical repo promoted to top-3 when 3+ operational concerns displace it', () => {
    // no_commits=4 (100), escalating=2 (70), persistent_risk=2 (60), ci_failing=1 (40)
    // Without promotion: top-3 = no_commits, escalating, persistent_risk (ci_failing at pos 4)
    // With promotion: ci_failing injected at position 3
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, noRecentCommits: true, trajectory: 'escalating' }),
      makeRepo({ id: 5, repoId: 5, trajectory: 'escalating', persistentRisk: true }),
      makeRepo({ id: 6, repoId: 6, persistentRisk: true }),
      makeRepo({ id: 7, repoId: 7, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('ci'); })).toBe(true);
  });

  it('isolated critical repo appears in recommendations even when pushed past position 3 naturally', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, noRecentCommits: true, trajectory: 'escalating' }),
      makeRepo({ id: 5, repoId: 5, trajectory: 'escalating', persistentRisk: true }),
      makeRepo({ id: 6, repoId: 6, persistentRisk: true }),
      makeRepo({ id: 7, repoId: 7, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap: {},
    });
    expect(result.recommendations.some(function(r) {
      return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil');
    })).toBe(true);
  });

  // ── Confidence correction ─────────────────────────────────────────────────

  it('confidence capped to medium when 2+ repos have telemetry gaps regardless of portfolio ratio', () => {
    // 5 repos all scored (ratio=1.0 → normally HIGH) but 2 have ciStatus unknown
    // Old rule: 2/5=40% < 50% → would NOT cap. New rule: 2 >= 2 → always cap.
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 80, ciStatus: 'unknown', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: 75, ciStatus: 'unknown', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: 70, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 4, repoId: 4, score: 65, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 5, repoId: 5, score: 60, ciStatus: 'failing', trajectory: 'escalating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    // Capped to medium → decisive "sustained"/"confirmed" must not appear
    expect(lower.includes('sustained')).toBe(false);
    expect(lower.includes('confirmed')).toBe(false);
  });

  it('confidence remains high when fewer than 2 repos have telemetry gaps', () => {
    // 3 repos all scored, only 1 with ciStatus unknown → telemetry_gaps=1 < 2 → no cap
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 80, ciStatus: 'unknown', trajectory: 'escalating' }),
      makeRepo({ id: 2, repoId: 2, score: 75, ciStatus: 'failing', trajectory: 'escalating' }),
      makeRepo({ id: 3, repoId: 3, score: 70, ciStatus: 'failing', trajectory: 'escalating' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    const lower = result.summary.toLowerCase();
    // High confidence → decisive language expected
    expect(lower.includes('sustained') || lower.includes('confirmed')).toBe(true);
  });

  // ── Dominant-cluster recommendations ─────────────────────────────────────

  it('recommendations map to dominant operational mode: restore activity, improve telemetry, stabilize CI', () => {
    // Inactivity + telemetry + isolated CI failing → operational recommendations only
    const repos = [
      makeRepo({ id: 1, repoId: 1, noRecentCommits: true }),
      makeRepo({ id: 2, repoId: 2, noRecentCommits: true }),
      makeRepo({ id: 3, repoId: 3, noRecentCommits: true }),
      makeRepo({ id: 4, repoId: 4, ciStatus: 'unknown' }),
      makeRepo({ id: 5, repoId: 5, ciStatus: 'unknown' }),
      makeRepo({ id: 6, repoId: 6, ciStatus: 'failing' }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap: {},
    });
    const hasCommitRec    = result.recommendations.some(function(r) { return r.toLowerCase().includes('commit') || r.toLowerCase().includes('inactive'); });
    const hasTelemetryRec = result.recommendations.some(function(r) { return r.toLowerCase().includes('telemetry') || r.toLowerCase().includes('sync'); });
    const hasCIRec        = result.recommendations.some(function(r) { return r.toLowerCase().includes('ci') || r.toLowerCase().includes('stabil'); });
    expect(hasCommitRec).toBe(true);
    expect(hasTelemetryRec).toBe(true);
    expect(hasCIRec).toBe(true);
    // Structural recommendations must be absent
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.recommendations.some(function(r) { return r.toLowerCase().includes('cadence') || r.toLowerCase().includes('establish release'); })).toBe(false);
  });

  // ── Attention-map path: dominant cluster ─────────────────────────────────

  it('dominant cluster suppresses structural via attention-map path when no_commits widespread', () => {
    function amEntry(repoId, reasons, level) {
      return { repoId: repoId, attentionLevel: level || 'medium', attentionScore: 30, reasons: reasons };
    }
    const repos = [
      makeRepo({ id: 1, repoId: 1 }), makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }), makeRepo({ id: 4, repoId: 4 }),
      makeRepo({ id: 5, repoId: 5 }),
    ];
    const attentionMap = {
      1: amEntry(1, ['No recent commits', 'CI status unknown']),
      2: amEntry(2, ['No recent commits', 'CI status unknown']),
      3: amEntry(3, ['No recent commits']),
      4: amEntry(4, ['High bus-factor risk']),
      5: amEntry(5, ['High bus-factor risk', 'High bus-factor risk', 'No releases found']),
    };
    // Manually set key names matching makeAttentionMap contract
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('release'); })).toBe(false);
  });
});

// ── Confidence field in response ──────────────────────────────────────────────

describe('buildExecutiveSummary — confidence field', () => {
  it('response always includes a confidence field', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast(),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(result).toHaveProperty('confidence');
  });

  it('confidence is one of high, medium, or low', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast(),
      repos:             [makeRepo()],
      attentionMap:      {},
    });
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });

  it('sparse guard return includes confidence: low', () => {
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'unknown' }),
      repos:             [],
      attentionMap:      {},
    });
    expect(result.confidence).toBe('low');
  });

  it('returns high confidence for fully-scored portfolio with no telemetry gaps', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, score: 20 }),
      makeRepo({ id: 2, repoId: 2, score: 15 }),
      makeRepo({ id: 3, repoId: 3, score: 25 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable' }),
      repos,
      attentionMap: {},
    });
    expect(result.confidence).toBe('high');
  });

  it('caps confidence to medium when 2+ repos have telemetry gaps', () => {
    const repos = Array.from({ length: 13 }, function(_, i) {
      return makeRepo({ id: i + 1, repoId: i + 1, score: i < 10 ? 20 : null });
    });
    const attentionMap = {};
    for (var i = 1; i <= 13; i++) {
      attentionMap[i] = {
        repoId: i, attentionLevel: 'medium', attentionScore: 30,
        reasons: ['CI status unknown'],
      };
    }
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.confidence).not.toBe('high');
  });

  it('confidence field is present when trajectory is escalating', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1, trajectory: 'escalating', score: 80 }),
      makeRepo({ id: 2, repoId: 2, trajectory: 'escalating', score: 75 }),
      makeRepo({ id: 3, repoId: 3, score: 20 }),
    ];
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'escalating', portfolioRiskLevel: 'critical' }),
      repos,
      attentionMap: {},
    });
    expect(result).toHaveProperty('confidence');
    expect(['high', 'medium', 'low']).toContain(result.confidence);
  });
});

// ── Theme text grammar ────────────────────────────────────────────────────────

describe('buildExecutiveSummary — theme text grammar', () => {
  it('contributor_abandoned singular uses "shows" not "show"', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1 }),
      makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const attentionMap = {
      1: { repoId: 1, attentionLevel: 'high', attentionScore: 60, reasons: ['Repository appears abandoned'] },
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    const abandonedTheme = result.themes.find(function(t) { return t.toLowerCase().includes('abandon'); });
    if (abandonedTheme) {
      expect(abandonedTheme).toMatch(/\bshows\b/);
      expect(abandonedTheme).not.toMatch(/\brepository show\b/i);
    }
  });

  it('contributor_abandoned plural uses "show" not "shows"', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1 }),
      makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const attentionMap = {
      1: { repoId: 1, attentionLevel: 'high', attentionScore: 60, reasons: ['Repository appears abandoned'] },
      2: { repoId: 2, attentionLevel: 'high', attentionScore: 60, reasons: ['Repository appears abandoned'] },
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    const abandonedTheme = result.themes.find(function(t) { return t.toLowerCase().includes('abandon'); });
    if (abandonedTheme) {
      expect(abandonedTheme).toMatch(/\bshow\b/);
      expect(abandonedTheme).not.toMatch(/\bshows\b/);
    }
  });
});

// ── Inactivity salience promotion ─────────────────────────────────────────────

describe('buildExecutiveSummary — inactivity salience', () => {
  // Helper: build an attention-map entry
  function amEntry(repoId, reasons) {
    return { repoId, attentionLevel: 'medium', attentionScore: 30, reasons };
  }

  it('no_commits appears in themes when widespread and at least as common as ci_failing', () => {
    // 3 repos with No recent commits, 2 with CI failing — inactivity >= ci_failing
    const repos = Array.from({ length: 5 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {
      1: amEntry(1, ['No recent commits', 'CI status unknown']),
      2: amEntry(2, ['No recent commits', 'CI status unknown']),
      3: amEntry(3, ['No recent commits']),
      4: amEntry(4, ['CI pipeline is failing']),
      5: amEntry(5, ['CI pipeline is failing']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });

  it('inactivity theme includes the repo count', () => {
    const repos = Array.from({ length: 4 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {
      1: amEntry(1, ['No recent commits', 'CI status unknown']),
      2: amEntry(2, ['No recent commits', 'CI status unknown']),
      3: amEntry(3, ['No recent commits', 'CI status unknown']),
      4: amEntry(4, ['CI pipeline is failing']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    const inactiveTheme = result.themes.find(function(t) { return t.toLowerCase().includes('commit'); });
    expect(inactiveTheme).toBeDefined();
    expect(inactiveTheme).toMatch(/3/);
  });

  it('inactivity ranks before ci_failing when no_commits >= ci_failing count', () => {
    // 4 no_commits, 2 ci_failing — inactivity should rank ahead of CI
    const repos = Array.from({ length: 7 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {
      1: amEntry(1, ['No recent commits', 'CI status unknown']),
      2: amEntry(2, ['No recent commits', 'CI status unknown']),
      3: amEntry(3, ['No recent commits', 'CI status unknown']),
      4: amEntry(4, ['No recent commits']),
      5: amEntry(5, ['CI pipeline is failing']),
      6: amEntry(6, ['CI pipeline is failing']),
      7: amEntry(7, ['CI status unknown']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    const commitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    const ciIdx     = result.themes.findIndex(function(t) { return t.toLowerCase().includes('ci') || t.toLowerCase().includes('instability'); });
    expect(commitIdx).toBeGreaterThanOrEqual(0);
    if (ciIdx >= 0) {
      expect(commitIdx).toBeLessThan(ciIdx);
    }
  });

  it('telemetry_gaps remains at position 0 after inactivity promotion', () => {
    const repos = Array.from({ length: 13 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {};
    for (var i = 1; i <= 13; i++) {
      attentionMap[i] = amEntry(i, i <= 8 ? ['No recent commits', 'CI status unknown'] : ['CI status unknown']);
    }
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes[0]).toMatch(/telemetry/i);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });

  it('inactivity NOT promoted when no_commits < ci_failing', () => {
    // ci_failing=5, no_commits=2 — CI dominates, no promotion
    const repos = Array.from({ length: 7 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {
      1: amEntry(1, ['CI pipeline is failing']),
      2: amEntry(2, ['CI pipeline is failing']),
      3: amEntry(3, ['CI pipeline is failing']),
      4: amEntry(4, ['CI pipeline is failing']),
      5: amEntry(5, ['CI pipeline is failing']),
      6: amEntry(6, ['No recent commits', 'CI status unknown']),
      7: amEntry(7, ['No recent commits', 'CI status unknown']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'high' }),
      repos,
      attentionMap,
    });
    // CI instability must rank first among operational themes
    const ciIdx     = result.themes.findIndex(function(t) { return t.toLowerCase().includes('ci') || t.toLowerCase().includes('instability'); });
    const commitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    if (ciIdx >= 0 && commitIdx >= 0) {
      expect(ciIdx).toBeLessThan(commitIdx);
    }
  });

  it('inactivity NOT promoted when no_commits < 2', () => {
    const repos = [
      makeRepo({ id: 1, repoId: 1 }),
      makeRepo({ id: 2, repoId: 2 }),
      makeRepo({ id: 3, repoId: 3 }),
    ];
    const attentionMap = {
      1: amEntry(1, ['No recent commits']),        // only 1 — not widespread
      2: amEntry(2, ['CI status unknown']),
      3: amEntry(3, ['CI status unknown']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'low' }),
      repos,
      attentionMap,
    });
    // Single inactive repo — inactivity may appear in themes but is not forced to top-2
    const commitIdx = result.themes.findIndex(function(t) { return t.toLowerCase().includes('commit'); });
    // telemetry_gaps dominates — commit (if present) must not be at index 0
    if (commitIdx >= 0) {
      expect(commitIdx).toBeGreaterThan(0);
    }
  });

  it('structural themes absent when inactivity cluster is widespread', () => {
    const repos = Array.from({ length: 5 }, function(_, i) { return makeRepo({ id: i + 1, repoId: i + 1 }); });
    const attentionMap = {
      1: amEntry(1, ['No recent commits', 'CI status unknown']),
      2: amEntry(2, ['No recent commits', 'CI status unknown']),
      3: amEntry(3, ['No recent commits']),
      4: amEntry(4, ['High bus-factor risk']),
      5: amEntry(5, ['High bus-factor risk', 'No releases found']),
    };
    const result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('release'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });
});

// ── Production-route flow: getAttentionQueue → attentionMap → buildExecutiveSummary ───
//
// These tests replicate the exact pipeline the /executive-summary route uses:
//   repos = result.rows.map(_mapRepoRow)
//   attentionMap built from getAttentionQueue(repos)
//   buildExecutiveSummary({ portfolioForecast, repos, attentionMap })
//
// The root-cause bug was: rs.factors was not projected in the outer SELECT,
// making noRecentCommits permanently false, so getAttentionQueue never emitted
// "No recent commits" reasons, and no_commits stayed 0 in the attention-map path.

describe('buildExecutiveSummary — production route flow (getAttentionQueue → attentionMap)', () => {
  // Simulates _mapRepoRow output with noRecentCommits correctly derived.
  function makeRouteRepo(overrides) {
    return Object.assign({
      id:                1,
      repoId:            1,
      fullName:          'org/repo',
      ciStatus:          'passing',
      releaseStatus:     'healthy',
      contributorStatus: 'healthy',
      score:             20,
      trajectory:        'stable',
      forecastLevel:     'low',
      escalationLevel:   'none',
      volatilityLevel:   'low',
      persistentRisk:    false,
      noRecentCommits:   false,
      lastSyncedAt:      null,
    }, overrides);
  }

  function buildAttentionMap(repos) {
    var attention = getAttentionQueue(repos);
    var map = {};
    attention.forEach(function(it) { map[it.repoId] = it; });
    return map;
  }

  it('inactivity theme appears when noRecentCommits=true on >= 2 repos', () => {
    var repos = [
      makeRouteRepo({ id: 1, repoId: 1, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 2, repoId: 2, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 3, repoId: 3, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 4, repoId: 4, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 5, repoId: 5, ciStatus: 'unknown', score: null }),
    ];
    var attentionMap = buildAttentionMap(repos);
    var result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });

  it('inactivity theme absent when noRecentCommits=false for all repos (simulates missing rs.factors)', () => {
    // This is the broken state: noRecentCommits always false, as if factors was not selected
    var repos = [
      makeRouteRepo({ id: 1, repoId: 1, noRecentCommits: false, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 2, repoId: 2, noRecentCommits: false, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 3, repoId: 3, noRecentCommits: false, ciStatus: 'unknown', score: null }),
    ];
    var attentionMap = buildAttentionMap(repos);
    var result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    // With noRecentCommits=false, getAttentionQueue never emits "No recent commits"
    // so no_commits=0 and the inactivity theme must not appear.
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(false);
  });

  it('telemetry stays at position 0, inactivity at position 1 when both are widespread', () => {
    var repos = [
      makeRouteRepo({ id: 1,  repoId: 1,  noRecentCommits: true,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 2,  repoId: 2,  noRecentCommits: true,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 3,  repoId: 3,  noRecentCommits: true,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 4,  repoId: 4,  noRecentCommits: true,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 5,  repoId: 5,  noRecentCommits: true,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 6,  repoId: 6,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 7,  repoId: 7,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 8,  repoId: 8,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 9,  repoId: 9,  ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 10, repoId: 10, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 11, repoId: 11, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 12, repoId: 12, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 13, repoId: 13, ciStatus: 'unknown', score: null }),
    ];
    var attentionMap = buildAttentionMap(repos);
    var result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes[0]).toMatch(/telemetry/i);
    expect(result.themes[1]).toMatch(/commit/i);
  });

  it('isolated CI failure appears in top-3 alongside inactivity when nc >= ci_failing', () => {
    var repos = [
      makeRouteRepo({ id: 1, repoId: 1, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 2, repoId: 2, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 3, repoId: 3, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 4, repoId: 4, ciStatus: 'failing',   score: 75 }),
      makeRouteRepo({ id: 5, repoId: 5, ciStatus: 'unknown',   score: null }),
    ];
    var attentionMap = buildAttentionMap(repos);
    var result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    // All three of telemetry, inactivity, and CI instability must be represented
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('telemetry'); })).toBe(true);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
    var hasCI = result.themes.some(function(t) { return t.toLowerCase().includes('ci') || t.toLowerCase().includes('instability'); });
    expect(hasCI).toBe(true);
  });

  it('structural themes absent even when inactivity route path active', () => {
    var repos = [
      makeRouteRepo({ id: 1, repoId: 1, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 2, repoId: 2, noRecentCommits: true, ciStatus: 'unknown', score: null }),
      makeRouteRepo({ id: 3, repoId: 3, contributorStatus: 'bus_factor_risk', score: 30 }),
      makeRouteRepo({ id: 4, repoId: 4, contributorStatus: 'bus_factor_risk', score: 30 }),
      makeRouteRepo({ id: 5, repoId: 5, contributorStatus: 'bus_factor_risk', score: 30 }),
    ];
    var attentionMap = buildAttentionMap(repos);
    var result = buildExecutiveSummary({
      portfolioForecast: makePortfolioForecast({ portfolioTrajectory: 'stable', portfolioRiskLevel: 'medium' }),
      repos,
      attentionMap,
    });
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('concentration'); })).toBe(false);
    expect(result.themes.some(function(t) { return t.toLowerCase().includes('commit'); })).toBe(true);
  });
});
