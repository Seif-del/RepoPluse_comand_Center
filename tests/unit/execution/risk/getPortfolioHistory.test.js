'use strict';

const { buildPortfolioHistory, derivePortfolioLevel } = require('../../../../execution/risk/getPortfolioHistory');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    snapshotAt:     '2025-01-01T12:00:00.000Z',
    portfolioScore: 20,
    repoCount:      3,
    ...overrides,
  };
}

// ── derivePortfolioLevel ───────────────────────────────────────────────────────
// Thresholds mirror scoreRepo.js LABEL_THRESHOLDS:
//   0–29 healthy  |  30–49 monitor  |  50–74 at-risk  |  75–100 critical

describe('derivePortfolioLevel — thresholds', () => {
  it('score >= 75 → critical', () => {
    expect(derivePortfolioLevel(75)).toBe('critical');
    expect(derivePortfolioLevel(80)).toBe('critical');
    expect(derivePortfolioLevel(100)).toBe('critical');
  });

  it('score >= 50 and < 75 → at-risk', () => {
    expect(derivePortfolioLevel(50)).toBe('at-risk');
    expect(derivePortfolioLevel(62)).toBe('at-risk');
    expect(derivePortfolioLevel(74)).toBe('at-risk');
  });

  it('score >= 30 and < 50 → monitor', () => {
    expect(derivePortfolioLevel(30)).toBe('monitor');
    expect(derivePortfolioLevel(40)).toBe('monitor');
    expect(derivePortfolioLevel(49)).toBe('monitor');
  });

  it('score < 30 → healthy', () => {
    expect(derivePortfolioLevel(0)).toBe('healthy');
    expect(derivePortfolioLevel(15)).toBe('healthy');
    expect(derivePortfolioLevel(29)).toBe('healthy');
  });

  it('exact boundary: 75 → critical (not at-risk)', () => {
    expect(derivePortfolioLevel(75)).toBe('critical');
    expect(derivePortfolioLevel(74)).toBe('at-risk');
  });

  it('exact boundary: 50 → at-risk (not monitor)', () => {
    expect(derivePortfolioLevel(50)).toBe('at-risk');
    expect(derivePortfolioLevel(49)).toBe('monitor');
  });

  it('exact boundary: 30 → monitor (not healthy)', () => {
    expect(derivePortfolioLevel(30)).toBe('monitor');
    expect(derivePortfolioLevel(29)).toBe('healthy');
  });

  it('non-finite input defaults to healthy', () => {
    expect(derivePortfolioLevel(NaN)).toBe('healthy');
    expect(derivePortfolioLevel(Infinity)).toBe('healthy');
    expect(derivePortfolioLevel(null)).toBe('healthy');
    expect(derivePortfolioLevel(undefined)).toBe('healthy');
  });
});

// ── buildPortfolioHistory — guard conditions ───────────────────────────────────

describe('buildPortfolioHistory — guard conditions', () => {
  it('returns [] when input is null', () => {
    expect(buildPortfolioHistory(null)).toEqual([]);
  });

  it('returns [] when input is undefined', () => {
    expect(buildPortfolioHistory(undefined)).toEqual([]);
  });

  it('returns [] when input is not an array', () => {
    expect(buildPortfolioHistory('bad')).toEqual([]);
    expect(buildPortfolioHistory(42)).toEqual([]);
    expect(buildPortfolioHistory({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(buildPortfolioHistory([])).toEqual([]);
  });
});

// ── buildPortfolioHistory — output shape ──────────────────────────────────────

describe('buildPortfolioHistory — output shape', () => {
  it('each item has snapshotAt, portfolioScore, portfolioLevel, repoCount', () => {
    const result = buildPortfolioHistory([makeRow()]);
    expect(result).toHaveLength(1);
    const item = result[0];
    expect(item).toHaveProperty('snapshotAt');
    expect(item).toHaveProperty('portfolioScore');
    expect(item).toHaveProperty('portfolioLevel');
    expect(item).toHaveProperty('repoCount');
  });

  it('portfolioScore is a number', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: '42' })]);
    expect(typeof result[0].portfolioScore).toBe('number');
    expect(result[0].portfolioScore).toBe(42);
  });

  it('repoCount is a number', () => {
    const result = buildPortfolioHistory([makeRow({ repoCount: '5' })]);
    expect(typeof result[0].repoCount).toBe('number');
    expect(result[0].repoCount).toBe(5);
  });

  it('snapshotAt is passed through unchanged', () => {
    const ts = '2025-06-15T08:00:00.000Z';
    const result = buildPortfolioHistory([makeRow({ snapshotAt: ts })]);
    expect(result[0].snapshotAt).toBe(ts);
  });
});

// ── buildPortfolioHistory — level derivation ──────────────────────────────────

describe('buildPortfolioHistory — level derivation from portfolioScore', () => {
  it('avg score >= 75 → portfolioLevel critical', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: 80 })]);
    expect(result[0].portfolioLevel).toBe('critical');
  });

  it('avg score 50–74 → portfolioLevel at-risk', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: 60 })]);
    expect(result[0].portfolioLevel).toBe('at-risk');
  });

  it('avg score 30–49 → portfolioLevel monitor', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: 40 })]);
    expect(result[0].portfolioLevel).toBe('monitor');
  });

  it('avg score < 30 → portfolioLevel healthy', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: 20 })]);
    expect(result[0].portfolioLevel).toBe('healthy');
  });

  it('avg score 0 → portfolioLevel healthy', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: 0 })]);
    expect(result[0].portfolioLevel).toBe('healthy');
  });
});

// ── buildPortfolioHistory — null/missing score handling ───────────────────────

describe('buildPortfolioHistory — null score handling', () => {
  it('null portfolioScore is treated as 0', () => {
    const result = buildPortfolioHistory([makeRow({ portfolioScore: null })]);
    expect(result[0].portfolioScore).toBe(0);
    expect(result[0].portfolioLevel).toBe('healthy');
  });

  it('null repoCount is treated as 0', () => {
    const result = buildPortfolioHistory([makeRow({ repoCount: null })]);
    expect(result[0].repoCount).toBe(0);
  });
});

// ── buildPortfolioHistory — ordering preserved ────────────────────────────────

describe('buildPortfolioHistory — input ordering preserved', () => {
  it('preserves the order of input rows (caller controls sort)', () => {
    const rows = [
      makeRow({ snapshotAt: '2025-01-03T12:00:00.000Z', portfolioScore: 50 }),
      makeRow({ snapshotAt: '2025-01-02T12:00:00.000Z', portfolioScore: 30 }),
      makeRow({ snapshotAt: '2025-01-01T12:00:00.000Z', portfolioScore: 10 }),
    ];
    const result = buildPortfolioHistory(rows);
    expect(result[0].snapshotAt).toBe('2025-01-03T12:00:00.000Z');
    expect(result[1].snapshotAt).toBe('2025-01-02T12:00:00.000Z');
    expect(result[2].snapshotAt).toBe('2025-01-01T12:00:00.000Z');
  });

  it('returns all input rows (no filtering)', () => {
    const rows = Array.from({ length: 30 }, function(_, i) {
      return makeRow({ portfolioScore: i * 2 });
    });
    expect(buildPortfolioHistory(rows)).toHaveLength(30);
  });
});

// ── buildPortfolioHistory — deterministic scoring ─────────────────────────────

describe('buildPortfolioHistory — deterministic scoring', () => {
  it('same input produces identical output on repeated calls', () => {
    const rows = [
      makeRow({ portfolioScore: 35, repoCount: 4 }),
      makeRow({ portfolioScore: 65, repoCount: 2 }),
    ];
    const result1 = buildPortfolioHistory(rows);
    const result2 = buildPortfolioHistory(rows);
    expect(result1).toEqual(result2);
  });

  it('does not mutate input rows', () => {
    const row = makeRow({ portfolioScore: 40 });
    const clone = { ...row };
    buildPortfolioHistory([row]);
    expect(row).toEqual(clone);
  });

  it('critical level derivation is stable at boundary (75)', () => {
    const below = buildPortfolioHistory([makeRow({ portfolioScore: 74 })]);
    const exact  = buildPortfolioHistory([makeRow({ portfolioScore: 75 })]);
    expect(below[0].portfolioLevel).toBe('at-risk');
    expect(exact[0].portfolioLevel).toBe('critical');
  });
});

// ── buildPortfolioHistory — multi-row mixed levels ────────────────────────────

describe('buildPortfolioHistory — multi-row mixed levels', () => {
  it('each row gets the correct level independently', () => {
    const rows = [
      makeRow({ portfolioScore: 80, snapshotAt: 'T1' }),  // >= 75 → critical
      makeRow({ portfolioScore: 55, snapshotAt: 'T2' }),  // 50–74 → at-risk
      makeRow({ portfolioScore: 35, snapshotAt: 'T3' }),  // 30–49 → monitor
      makeRow({ portfolioScore: 10, snapshotAt: 'T4' }),  // < 30  → healthy
    ];
    const result = buildPortfolioHistory(rows);
    expect(result[0].portfolioLevel).toBe('critical');
    expect(result[1].portfolioLevel).toBe('at-risk');
    expect(result[2].portfolioLevel).toBe('monitor');
    expect(result[3].portfolioLevel).toBe('healthy');
  });

  it('repoCount is correctly passed through per row', () => {
    const rows = [
      makeRow({ repoCount: 1 }),
      makeRow({ repoCount: 7 }),
    ];
    const result = buildPortfolioHistory(rows);
    expect(result[0].repoCount).toBe(1);
    expect(result[1].repoCount).toBe(7);
  });
});
