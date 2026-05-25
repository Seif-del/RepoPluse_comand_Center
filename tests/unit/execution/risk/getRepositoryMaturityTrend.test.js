'use strict';

const { getRepositoryMaturityTrend } = require('../../../../execution/risk/getRepositoryMaturityTrend');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSnapshot({
  score    = 50,
  level    = 'developing',
  conf     = 'medium',
  gaps     = [],
  dims     = {},
  snapshotAt = null,
} = {}) {
  return {
    maturityScore:    score,
    maturityLevel:    level,
    confidenceLevel:  conf,
    gaps,
    recommendations:  [],
    dimensions: {
      ciMaturity:          dims.ciMaturity          ?? 10,
      releaseMaturity:     dims.releaseMaturity      ?? 10,
      contributorMaturity: dims.contributorMaturity  ?? 10,
      activityMaturity:    dims.activityMaturity     ?? 10,
      prWorkflowMaturity:  dims.prWorkflowMaturity   ?? 5,
      telemetryMaturity:   dims.telemetryMaturity    ?? 5,
      ...dims,
    },
    snapshotAt,
  };
}

// ── Empty / degenerate input ──────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — empty / degenerate input', () => {
  it('returns unknown trend for empty array', () => {
    const r = getRepositoryMaturityTrend([]);
    expect(r.trend).toBe('unknown');
    expect(r.delta).toBeNull();
    expect(r.latestScore).toBeNull();
    expect(r.oldestScore).toBeNull();
  });

  it('returns unknown trend for single snapshot', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot({ score: 70 })]);
    expect(r.trend).toBe('unknown');
    expect(r.delta).toBeNull();
    expect(r.latestScore).toBe(70);
    expect(r.oldestScore).toBeNull();
  });

  it('single snapshot: confidenceLevel is low', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot()]);
    expect(r.confidenceLevel).toBe('low');
  });

  it('returns correct shape with all keys even for empty input', () => {
    const r = getRepositoryMaturityTrend([]);
    expect(r).toHaveProperty('trend');
    expect(r).toHaveProperty('delta');
    expect(r).toHaveProperty('latestScore');
    expect(r).toHaveProperty('oldestScore');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('dimensionDeltas');
    expect(r).toHaveProperty('recurringGaps');
    expect(r).toHaveProperty('resolvedGaps');
    expect(r).toHaveProperty('emergingGaps');
  });
});

// ── Trend thresholds ──────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — trend thresholds', () => {
  it('delta >= +10 => improving', () => {
    const snapshots = [
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('improving');
    expect(r.delta).toBe(10);
  });

  it('delta > +10 => improving', () => {
    const snapshots = [
      makeSnapshot({ score: 80 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('improving');
    expect(r.delta).toBe(30);
  });

  it('delta <= -10 => declining', () => {
    const snapshots = [
      makeSnapshot({ score: 40 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('declining');
    expect(r.delta).toBe(-10);
  });

  it('delta < -10 => declining', () => {
    const snapshots = [
      makeSnapshot({ score: 30 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('declining');
    expect(r.delta).toBe(-20);
  });

  it('delta +9 => stable', () => {
    const snapshots = [
      makeSnapshot({ score: 59 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('stable');
    expect(r.delta).toBe(9);
  });

  it('delta -9 => stable', () => {
    const snapshots = [
      makeSnapshot({ score: 41 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('stable');
    expect(r.delta).toBe(-9);
  });

  it('delta 0 => stable', () => {
    const snapshots = [
      makeSnapshot({ score: 50 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.trend).toBe('stable');
    expect(r.delta).toBe(0);
  });

  it('latestScore and oldestScore correctly identified', () => {
    const snapshots = [
      makeSnapshot({ score: 70 }),
      makeSnapshot({ score: 45 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.latestScore).toBe(70);
    expect(r.oldestScore).toBe(45);
  });
});

// ── Input ordering ────────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — input ordering', () => {
  it('newest-first (no dates): first element is latest', () => {
    const snapshots = [
      makeSnapshot({ score: 70 }),
      makeSnapshot({ score: 50 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.latestScore).toBe(70);
    expect(r.oldestScore).toBe(50);
    expect(r.delta).toBe(20);
    expect(r.trend).toBe('improving');
  });

  it('oldest-first (with dates): sorts by snapshotAt, newest becomes latest', () => {
    const snapshots = [
      makeSnapshot({ score: 40, snapshotAt: '2024-01-01T00:00:00Z' }),
      makeSnapshot({ score: 60, snapshotAt: '2024-06-01T00:00:00Z' }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.latestScore).toBe(60);
    expect(r.oldestScore).toBe(40);
    expect(r.delta).toBe(20);
    expect(r.trend).toBe('improving');
  });

  it('mixed-date order is sorted correctly', () => {
    const snapshots = [
      makeSnapshot({ score: 55, snapshotAt: '2024-04-01T00:00:00Z' }),
      makeSnapshot({ score: 30, snapshotAt: '2024-01-01T00:00:00Z' }),
      makeSnapshot({ score: 70, snapshotAt: '2024-07-01T00:00:00Z' }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.latestScore).toBe(70);
    expect(r.oldestScore).toBe(30);
    expect(r.delta).toBe(40);
    expect(r.trend).toBe('improving');
  });

  it('no dates: preserves input order, first = latest', () => {
    const snapshots = [
      makeSnapshot({ score: 30 }),
      makeSnapshot({ score: 55 }),
      makeSnapshot({ score: 70 }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.latestScore).toBe(30);
    expect(r.oldestScore).toBe(70);
    expect(r.delta).toBe(-40);
    expect(r.trend).toBe('declining');
  });

  it('does not mutate the input array', () => {
    const snapshots = [
      makeSnapshot({ score: 40, snapshotAt: '2024-01-01T00:00:00Z' }),
      makeSnapshot({ score: 60, snapshotAt: '2024-06-01T00:00:00Z' }),
    ];
    const originalFirst = snapshots[0];
    getRepositoryMaturityTrend(snapshots);
    expect(snapshots[0]).toBe(originalFirst);
  });

  it('does not mutate snapshot objects', () => {
    const s = makeSnapshot({ score: 60, gaps: ['gap A'] });
    const input = [s, makeSnapshot({ score: 50 })];
    getRepositoryMaturityTrend(input);
    expect(s.maturityScore).toBe(60);
    expect(s.gaps).toEqual(['gap A']);
  });
});

// ── Confidence ────────────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — confidence', () => {
  it('low: fewer than 3 snapshots', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 60, conf: 'high' }),
      makeSnapshot({ score: 50, conf: 'high' }),
    ]);
    expect(r.confidenceLevel).toBe('low');
  });

  it('medium: 3 snapshots', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 70, conf: 'high' }),
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ]);
    expect(r.confidenceLevel).toBe('medium');
  });

  it('medium: 4 snapshots', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 70, conf: 'high' }),
      makeSnapshot({ score: 65 }),
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ]);
    expect(r.confidenceLevel).toBe('medium');
  });

  it('high: 5+ snapshots and latest confidence high', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 80, conf: 'high' }),
      makeSnapshot({ score: 70 }),
      makeSnapshot({ score: 65 }),
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ]);
    expect(r.confidenceLevel).toBe('high');
  });

  it('high: 5+ snapshots and latest confidence medium', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 80, conf: 'medium' }),
      makeSnapshot({ score: 70 }),
      makeSnapshot({ score: 65 }),
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ]);
    expect(r.confidenceLevel).toBe('high');
  });

  it('medium (not high): 5+ snapshots but latest confidence low', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ score: 80, conf: 'low' }),
      makeSnapshot({ score: 70 }),
      makeSnapshot({ score: 65 }),
      makeSnapshot({ score: 60 }),
      makeSnapshot({ score: 50 }),
    ]);
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── Dimension deltas ──────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — dimension deltas', () => {
  it('computes per-dimension latest minus oldest', () => {
    const latest = {
      ciMaturity: 20, releaseMaturity: 15, contributorMaturity: 12,
      activityMaturity: 18, prWorkflowMaturity: 8, telemetryMaturity: 7,
    };
    const oldest = {
      ciMaturity: 10, releaseMaturity: 10, contributorMaturity: 10,
      activityMaturity: 10, prWorkflowMaturity: 5, telemetryMaturity: 5,
    };
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ dims: latest }),
      makeSnapshot({ dims: oldest }),
    ]);
    expect(r.dimensionDeltas.ciMaturity).toBe(10);
    expect(r.dimensionDeltas.releaseMaturity).toBe(5);
    expect(r.dimensionDeltas.contributorMaturity).toBe(2);
    expect(r.dimensionDeltas.activityMaturity).toBe(8);
    expect(r.dimensionDeltas.prWorkflowMaturity).toBe(3);
    expect(r.dimensionDeltas.telemetryMaturity).toBe(2);
  });

  it('negative deltas for regressing dimensions', () => {
    const latest = { ciMaturity: 0, releaseMaturity: 5 };
    const oldest = { ciMaturity: 20, releaseMaturity: 20 };
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ dims: latest }),
      makeSnapshot({ dims: oldest }),
    ]);
    expect(r.dimensionDeltas.ciMaturity).toBe(-20);
    expect(r.dimensionDeltas.releaseMaturity).toBe(-15);
  });

  it('handles missing dimension keys safely (treats as 0)', () => {
    const latest = makeSnapshot({ score: 60 });
    const oldest = makeSnapshot({ score: 50 });
    delete latest.dimensions.ciMaturity;
    const r = getRepositoryMaturityTrend([latest, oldest]);
    expect(r.dimensionDeltas.ciMaturity).toBeDefined();
    expect(typeof r.dimensionDeltas.ciMaturity).toBe('number');
  });

  it('all 6 dimension keys always present in output', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot(), makeSnapshot()]);
    const keys = ['ciMaturity', 'releaseMaturity', 'contributorMaturity',
                  'activityMaturity', 'prWorkflowMaturity', 'telemetryMaturity'];
    keys.forEach(k => expect(r.dimensionDeltas).toHaveProperty(k));
  });

  it('empty input returns empty dimensionDeltas object', () => {
    const r = getRepositoryMaturityTrend([]);
    expect(r.dimensionDeltas).toEqual({});
  });
});

// ── Gap analytics ─────────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — gap analytics', () => {
  it('recurringGaps: appear in at least 2 snapshots including latest', () => {
    const snapshots = [
      makeSnapshot({ gaps: ['gap A', 'gap B'] }),
      makeSnapshot({ gaps: ['gap A', 'gap C'] }),
      makeSnapshot({ gaps: ['gap C'] }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.recurringGaps).toContain('gap A');
    expect(r.recurringGaps).not.toContain('gap B');
  });

  it('recurringGap must be present in latest snapshot', () => {
    const snapshots = [
      makeSnapshot({ gaps: ['gap X'] }),           // latest
      makeSnapshot({ gaps: ['gap A', 'gap X'] }),
      makeSnapshot({ gaps: ['gap A'] }),            // oldest
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.recurringGaps).toContain('gap X');
    expect(r.recurringGaps).not.toContain('gap A'); // A not in latest
  });

  it('resolvedGaps: present in oldest but absent in latest', () => {
    const snapshots = [
      makeSnapshot({ gaps: ['gap B'] }),
      makeSnapshot({ gaps: ['gap A', 'gap B'] }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.resolvedGaps).toContain('gap A');
    expect(r.resolvedGaps).not.toContain('gap B');
  });

  it('emergingGaps: present in latest but absent in oldest', () => {
    const snapshots = [
      makeSnapshot({ gaps: ['gap A', 'gap NEW'] }),
      makeSnapshot({ gaps: ['gap A'] }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.emergingGaps).toContain('gap NEW');
    expect(r.emergingGaps).not.toContain('gap A');
  });

  it('gap can appear in both resolvedGaps and emergingGaps only if logic allows — resolved and emerging are mutually exclusive from oldest/latest perspective', () => {
    const snapshots = [
      makeSnapshot({ gaps: ['gap X'] }),
      makeSnapshot({ gaps: ['gap Y'] }),
    ];
    const r = getRepositoryMaturityTrend(snapshots);
    expect(r.resolvedGaps).toContain('gap Y');
    expect(r.emergingGaps).toContain('gap X');
    // X is in latest but not oldest → emerging; Y in oldest but not latest → resolved
  });

  it('all gap arrays empty when no gaps exist', () => {
    const r = getRepositoryMaturityTrend([
      makeSnapshot({ gaps: [] }),
      makeSnapshot({ gaps: [] }),
    ]);
    expect(r.recurringGaps).toEqual([]);
    expect(r.resolvedGaps).toEqual([]);
    expect(r.emergingGaps).toEqual([]);
  });

  it('empty input returns empty gap arrays', () => {
    const r = getRepositoryMaturityTrend([]);
    expect(r.recurringGaps).toEqual([]);
    expect(r.resolvedGaps).toEqual([]);
    expect(r.emergingGaps).toEqual([]);
  });
});

// ── Summary text ─────────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — summary', () => {
  it('summary is a non-empty string for two snapshots', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot({ score: 70 }), makeSnapshot({ score: 50 })]);
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('summary is a string for empty input', () => {
    const r = getRepositoryMaturityTrend([]);
    expect(typeof r.summary).toBe('string');
  });

  it('improving summary mentions improvement', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot({ score: 80 }), makeSnapshot({ score: 50 })]);
    expect(r.summary.toLowerCase()).toMatch(/improv/);
  });

  it('declining summary mentions decline', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot({ score: 30 }), makeSnapshot({ score: 50 })]);
    expect(r.summary.toLowerCase()).toMatch(/declin/);
  });

  it('stable summary mentions stable', () => {
    const r = getRepositoryMaturityTrend([makeSnapshot({ score: 55 }), makeSnapshot({ score: 50 })]);
    expect(r.summary.toLowerCase()).toMatch(/stable/);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('getRepositoryMaturityTrend — determinism', () => {
  it('same input produces identical output', () => {
    const input = [
      makeSnapshot({ score: 70, gaps: ['gap A'], snapshotAt: '2024-06-01T00:00:00Z' }),
      makeSnapshot({ score: 50, gaps: ['gap A', 'gap B'], snapshotAt: '2024-01-01T00:00:00Z' }),
    ];
    const r1 = getRepositoryMaturityTrend(input);
    const r2 = getRepositoryMaturityTrend(input);
    expect(r1).toEqual(r2);
  });
});
