'use strict';

const { getPortfolioForecast } = require('../../../../execution/risk/getPortfolioForecast');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRepo(overrides = {}) {
  return {
    repoId:          1,
    trajectory:      'stable',
    forecastLevel:   'low',
    escalationLevel: 'none',
    volatilityLevel: 'low',
    persistentRisk:  false,
    ...overrides,
  };
}

function makeRepos(count, overrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    makeRepo({ repoId: i + 1, ...overrides })
  );
}

// ── Output shape ──────────────────────────────────────────────────────────────

describe('getPortfolioForecast — output shape', () => {
  it('returns all required fields', () => {
    const result = getPortfolioForecast([makeRepo()]);
    expect(result).toHaveProperty('portfolioTrajectory');
    expect(result).toHaveProperty('portfolioRiskLevel');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('counts');
    expect(result).toHaveProperty('signals');
    expect(Array.isArray(result.signals)).toBe(true);
  });

  it('counts object contains all trajectory keys', () => {
    const result = getPortfolioForecast([makeRepo()]);
    expect(result.counts).toMatchObject({
      escalating:    expect.any(Number),
      deteriorating: expect.any(Number),
      volatile:      expect.any(Number),
      recovering:    expect.any(Number),
      stable:        expect.any(Number),
      unknown:       expect.any(Number),
    });
  });
});

// ── Unknown portfolio ─────────────────────────────────────────────────────────

describe('getPortfolioForecast — unknown portfolio', () => {
  it('returns unknown when called with no arguments', () => {
    const result = getPortfolioForecast();
    expect(result.portfolioTrajectory).toBe('unknown');
    expect(result.portfolioRiskLevel).toBe('low');
    expect(result.signals).toHaveLength(0);
  });

  it('returns unknown when repos array is empty', () => {
    const result = getPortfolioForecast([]);
    expect(result.portfolioTrajectory).toBe('unknown');
  });

  it('returns unknown when only 1 repo has a known trajectory', () => {
    const repos = [
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'unknown' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('unknown');
  });

  it('returns unknown when all repos have unknown trajectory', () => {
    const repos = makeRepos(5, { trajectory: 'unknown' });
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('unknown');
  });

  it('returns insufficient data summary for unknown', () => {
    const result = getPortfolioForecast([]);
    expect(result.summary).toContain('Insufficient');
  });

  it('handles null gracefully', () => {
    expect(() => getPortfolioForecast(null)).not.toThrow();
    const result = getPortfolioForecast(null);
    expect(result.portfolioTrajectory).toBe('unknown');
  });
});

// ── Count aggregation ─────────────────────────────────────────────────────────

describe('getPortfolioForecast — count aggregation', () => {
  it('counts each trajectory correctly', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating' }),
      makeRepo({ trajectory: 'escalating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'unknown' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.counts).toMatchObject({
      escalating:    2,
      deteriorating: 1,
      volatile:      1,
      recovering:    1,
      stable:        2,
      unknown:       1,
    });
  });

  it('unknown trajectory key falls into counts.unknown', () => {
    const repos = [
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'nonsense' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.counts.unknown).toBeGreaterThanOrEqual(1);
  });
});

// ── Escalating portfolio ──────────────────────────────────────────────────────

describe('getPortfolioForecast — escalating portfolio', () => {
  it('classifies as escalating when 2+ repos have trajectory=escalating', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('escalating');
    expect(result.portfolioRiskLevel).toBe('critical');
  });

  it('classifies as escalating when 2+ repos have forecastLevel=critical (even if trajectory is not escalating)', () => {
    const repos = [
      makeRepo({ trajectory: 'deteriorating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'deteriorating', forecastLevel: 'critical' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('escalating');
  });

  it('does NOT classify as escalating when only 1 repo is escalating', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('escalating');
  });

  it('includes critical escalation signal when 2+ escalating', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating' }),
      makeRepo({ trajectory: 'escalating' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.signals.some(s => s.includes('escalation'))).toBe(true);
  });

  it('summary mentions instability increasing for escalating', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.summary).toContain('instability');
  });
});

// ── Deteriorating portfolio ───────────────────────────────────────────────────

describe('getPortfolioForecast — deteriorating portfolio', () => {
  it('classifies as deteriorating when deteriorating > recovering', () => {
    const repos = [
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'recovering' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('deteriorating');
    expect(result.portfolioRiskLevel).toBe('high');
  });

  it('classifies as deteriorating when 2+ repos have persistentRisk (regardless of counts)', () => {
    const repos = [
      makeRepo({ trajectory: 'stable', persistentRisk: true }),
      makeRepo({ trajectory: 'stable', persistentRisk: true }),
      ...makeRepos(5, { trajectory: 'recovering' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('deteriorating');
  });

  it('does NOT classify as deteriorating when recovering >= deteriorating and no persistentRisk', () => {
    const repos = [
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'recovering' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('deteriorating');
  });

  it('includes deteriorating-count signal', () => {
    const repos = [
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'recovering' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.signals.some(s => s.includes('deteriorating'))).toBe(true);
  });

  it('includes persistentRisk signal when 2+ repos have it', () => {
    const repos = [
      makeRepo({ trajectory: 'stable', persistentRisk: true }),
      makeRepo({ trajectory: 'stable', persistentRisk: true }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.signals.some(s => s.includes('Persistent'))).toBe(true);
  });
});

// ── Volatile portfolio ────────────────────────────────────────────────────────

describe('getPortfolioForecast — volatile portfolio', () => {
  it('classifies as volatile when 3+ volatile repos (no escalating condition)', () => {
    const repos = [
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('volatile');
  });

  it('portfolioRiskLevel is medium when volatile without persistentRisk', () => {
    const repos = [
      makeRepo({ trajectory: 'volatile', persistentRisk: false }),
      makeRepo({ trajectory: 'volatile', persistentRisk: false }),
      makeRepo({ trajectory: 'volatile', persistentRisk: false }),
      ...makeRepos(2, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioRiskLevel).toBe('medium');
  });

  it('portfolioRiskLevel is high when volatile WITH 2+ persistentRisk repos', () => {
    const repos = [
      makeRepo({ trajectory: 'volatile', persistentRisk: true }),
      makeRepo({ trajectory: 'volatile', persistentRisk: true }),
      makeRepo({ trajectory: 'volatile', persistentRisk: false }),
      ...makeRepos(2, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioRiskLevel).toBe('high');
  });

  it('does NOT classify as volatile when only 2 volatile repos', () => {
    const repos = [
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('volatile');
  });

  it('escalating overrides volatile when 2+ escalating repos', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('escalating');
  });
});

// ── Improving portfolio ───────────────────────────────────────────────────────

describe('getPortfolioForecast — improving portfolio', () => {
  it('classifies as improving when recovering > deteriorating and no critical escalation', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('improving');
    expect(result.portfolioRiskLevel).toBe('low');
  });

  it('does NOT classify as improving when there is a critical escalation', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('improving');
  });

  it('recovery signal included when 2+ recovering repos', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.signals.some(s => s.includes('Recovery') || s.includes('recovering'))).toBe(true);
  });

  it('summary mentions recovery for improving trajectory', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.summary).toContain('Recovery');
  });
});

// ── Stable portfolio ──────────────────────────────────────────────────────────

describe('getPortfolioForecast — stable portfolio', () => {
  it('classifies as stable when all repos are stable', () => {
    const repos = makeRepos(6, { trajectory: 'stable' });
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('stable');
    expect(result.portfolioRiskLevel).toBe('low');
  });

  it('classifies as stable when mix of stable and recovering with equal counts', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).toBe('stable');
  });

  it('summary mentions stable for stable portfolio', () => {
    const repos = makeRepos(5, { trajectory: 'stable' });
    const result = getPortfolioForecast(repos);
    expect(result.summary).toContain('stable');
  });
});

// ── Signal ordering ───────────────────────────────────────────────────────────

describe('getPortfolioForecast — signal ordering', () => {
  it('returns signals sorted critical → high → medium → low', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'deteriorating', persistentRisk: true }),
      makeRepo({ trajectory: 'deteriorating', persistentRisk: true }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'volatile' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
    ];
    const result = getPortfolioForecast(repos);

    // Critical signals should come before medium/low (there may be no low in escalating scenario)
    expect(result.signals.length).toBeGreaterThan(0);

    // Verify first signal is critical severity if any escalation signals exist
    const criticalKeywords = ['escalation patterns', 'forecast at critical'];
    const firstSig = result.signals[0];
    const firstIsCritical = criticalKeywords.some(k => firstSig.includes(k));
    expect(firstIsCritical).toBe(true);
  });

  it('critical signals appear before high signals', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(3, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    const sigs = result.signals;
    // The first signal should contain "escalation" (critical)
    expect(sigs.some(s => s.includes('escalation'))).toBe(true);
    // Find index of first escalation signal vs first deteriorating signal
    const escalIdx = sigs.findIndex(s => s.includes('escalation'));
    const deterIdx = sigs.findIndex(s => s.includes('deteriorating'));
    if (escalIdx !== -1 && deterIdx !== -1) {
      expect(escalIdx).toBeLessThan(deterIdx);
    }
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('getPortfolioForecast — edge cases', () => {
  it('a single escalating repo does not trigger escalating portfolio', () => {
    const repos = [
      makeRepo({ trajectory: 'escalating', forecastLevel: 'critical' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('escalating');
    // Should still emit a high signal for the 1 escalating repo
    expect(result.signals.some(s => s.includes('escalation'))).toBe(true);
  });

  it('a single deteriorating repo does not trigger deteriorating portfolio', () => {
    const repos = [
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'recovering' }),
      ...makeRepos(4, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('deteriorating');
    // Should emit a medium signal for the 1 deteriorating repo
    expect(result.signals.some(s => s.includes('deteriorating'))).toBe(true);
  });

  it('handles repos with missing trajectory (defaults to unknown)', () => {
    const repos = [
      { repoId: 1 },
      { repoId: 2 },
      makeRepo({ trajectory: 'stable' }),
      makeRepo({ trajectory: 'stable' }),
    ];
    expect(() => getPortfolioForecast(repos)).not.toThrow();
  });

  it('improving does not fire when recovering === deteriorating', () => {
    const repos = [
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'recovering' }),
      makeRepo({ trajectory: 'deteriorating' }),
      makeRepo({ trajectory: 'deteriorating' }),
      ...makeRepos(2, { trajectory: 'stable' }),
    ];
    const result = getPortfolioForecast(repos);
    expect(result.portfolioTrajectory).not.toBe('improving');
  });
});
