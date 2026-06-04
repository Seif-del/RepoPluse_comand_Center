'use strict';

const { buildPortfolioMaturityIndex } = require('../../../../execution/risk/buildPortfolioMaturityIndex');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRepo({
  id    = 1,
  name  = 'org/repo-' + id,
  score = 50,
  level = 'developing',
  conf  = 'medium',
  gaps  = [],
  dims  = {},
} = {}) {
  return {
    id,
    name,
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
    },
  };
}

// ── Empty / degenerate input ──────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — empty / degenerate input', () => {
  it('returns unknown level for empty repositories array', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r.maturityLevel).toBe('unknown');
    expect(r.portfolioMaturityScore).toBe(0);
  });

  it('returns unknown level when all repos have unknown maturity', () => {
    const repos = [
      makeRepo({ score: 0, level: 'unknown' }),
      makeRepo({ id: 2, score: 0, level: 'unknown' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.maturityLevel).toBe('unknown');
    expect(r.portfolioMaturityScore).toBe(0);
  });

  it('returns correct shape with all keys for empty input', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r).toHaveProperty('portfolioMaturityScore');
    expect(r).toHaveProperty('maturityLevel');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('distribution');
    expect(r).toHaveProperty('dimensionAverages');
    expect(r).toHaveProperty('commonGaps');
    expect(r).toHaveProperty('benchmarkedRepositories');
    expect(r).toHaveProperty('recommendations');
  });

  it('benchmarkedRepositories is empty for empty input', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r.benchmarkedRepositories).toEqual([]);
  });

  it('distribution is all zeros for empty input', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r.distribution).toEqual({ mature: 0, developing: 0, immature: 0, unknown: 0 });
  });

  it('handles missing repositories key gracefully', () => {
    expect(() => buildPortfolioMaturityIndex({})).not.toThrow();
    expect(() => buildPortfolioMaturityIndex(null)).not.toThrow();
    expect(() => buildPortfolioMaturityIndex(undefined)).not.toThrow();
  });
});

// ── Portfolio maturity level thresholds ──────────────────────────────────────

describe('buildPortfolioMaturityIndex — portfolio maturity level', () => {
  it('mature portfolio (avg >= 75)', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature' }),
      makeRepo({ id: 2, score: 78, level: 'mature' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.maturityLevel).toBe('mature');
    expect(r.portfolioMaturityScore).toBe(79);
  });

  it('developing portfolio (avg 45–74)', () => {
    const repos = [
      makeRepo({ id: 1, score: 60, level: 'developing' }),
      makeRepo({ id: 2, score: 50, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.maturityLevel).toBe('developing');
    expect(r.portfolioMaturityScore).toBe(55);
  });

  it('immature portfolio (avg 1–44)', () => {
    const repos = [
      makeRepo({ id: 1, score: 20, level: 'immature' }),
      makeRepo({ id: 2, score: 30, level: 'immature' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.maturityLevel).toBe('immature');
    expect(r.portfolioMaturityScore).toBe(25);
  });

  it('unknown-score repos are excluded from portfolio average', () => {
    const repos = [
      makeRepo({ id: 1, score: 60, level: 'developing' }),
      makeRepo({ id: 2, score: 0,  level: 'unknown' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.portfolioMaturityScore).toBe(60);
    expect(r.maturityLevel).toBe('developing');
  });

  it('portfolio score rounds to integer', () => {
    const repos = [
      makeRepo({ id: 1, score: 70, level: 'developing' }),
      makeRepo({ id: 2, score: 71, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(Number.isInteger(r.portfolioMaturityScore)).toBe(true);
  });
});

// ── Distribution counts ───────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — distribution', () => {
  it('counts repos by maturity level', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature' }),
      makeRepo({ id: 2, score: 60, level: 'developing' }),
      makeRepo({ id: 3, score: 60, level: 'developing' }),
      makeRepo({ id: 4, score: 20, level: 'immature' }),
      makeRepo({ id: 5, score: 0,  level: 'unknown' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.distribution.mature).toBe(1);
    expect(r.distribution.developing).toBe(2);
    expect(r.distribution.immature).toBe(1);
    expect(r.distribution.unknown).toBe(1);
  });

  it('all mature distribution', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature' }),
      makeRepo({ id: 2, score: 90, level: 'mature' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.distribution).toEqual({ mature: 2, developing: 0, immature: 0, unknown: 0 });
  });
});

// ── Dimension averages ────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — dimensionAverages', () => {
  it('averages each dimension across all repos (including unknown)', () => {
    const repos = [
      makeRepo({ id: 1, dims: { ciMaturity: 20, releaseMaturity: 10, contributorMaturity: 20, activityMaturity: 20, prWorkflowMaturity: 10, telemetryMaturity: 8 } }),
      makeRepo({ id: 2, dims: { ciMaturity: 10, releaseMaturity: 10, contributorMaturity: 10, activityMaturity: 10, prWorkflowMaturity: 6,  telemetryMaturity: 4 } }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.dimensionAverages.ciMaturity).toBe(15);
    expect(r.dimensionAverages.releaseMaturity).toBe(10);
    expect(r.dimensionAverages.contributorMaturity).toBe(15);
    expect(r.dimensionAverages.activityMaturity).toBe(15);
    expect(r.dimensionAverages.prWorkflowMaturity).toBe(8);
    expect(r.dimensionAverages.telemetryMaturity).toBe(6);
  });

  it('all 6 dimension keys always present in dimensionAverages', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [makeRepo()] });
    const keys = ['ciMaturity', 'releaseMaturity', 'contributorMaturity',
                  'activityMaturity', 'prWorkflowMaturity', 'telemetryMaturity'];
    keys.forEach(k => expect(r.dimensionAverages).toHaveProperty(k));
  });

  it('dimension averages are integers', () => {
    const repos = [
      makeRepo({ id: 1, dims: { ciMaturity: 15 } }),
      makeRepo({ id: 2, dims: { ciMaturity: 16 } }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(Number.isInteger(r.dimensionAverages.ciMaturity)).toBe(true);
  });

  it('empty portfolio returns zero dimension averages', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    const keys = ['ciMaturity', 'releaseMaturity', 'contributorMaturity',
                  'activityMaturity', 'prWorkflowMaturity', 'telemetryMaturity'];
    keys.forEach(k => expect(r.dimensionAverages[k]).toBe(0));
  });
});

// ── Percentile and ranking ────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — percentile and rank', () => {
  it('highest-score repo has the highest percentile', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature',     name: 'org/a' }),
      makeRepo({ id: 2, score: 50, level: 'developing', name: 'org/b' }),
      makeRepo({ id: 3, score: 20, level: 'immature',   name: 'org/c' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const byId = Object.fromEntries(r.benchmarkedRepositories.map(b => [b.id, b]));
    expect(byId[1].percentile).toBeGreaterThan(byId[2].percentile);
    expect(byId[2].percentile).toBeGreaterThan(byId[3].percentile);
  });

  it('rank 1 is the highest-maturity repo', () => {
    const repos = [
      makeRepo({ id: 1, score: 30, level: 'immature',   name: 'org/a' }),
      makeRepo({ id: 2, score: 80, level: 'mature',     name: 'org/b' }),
      makeRepo({ id: 3, score: 55, level: 'developing', name: 'org/c' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const rank1 = r.benchmarkedRepositories.find(b => b.rank === 1);
    expect(rank1.id).toBe(2);
  });

  it('percentile is between 0 and 100 inclusive', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature' }),
      makeRepo({ id: 2, score: 50, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    r.benchmarkedRepositories.forEach(b => {
      expect(b.percentile).toBeGreaterThanOrEqual(0);
      expect(b.percentile).toBeLessThanOrEqual(100);
    });
  });

  it('tie-breaking is deterministic: same score sorted by name ASC then id ASC', () => {
    const repos = [
      makeRepo({ id: 3, score: 60, level: 'developing', name: 'org/c' }),
      makeRepo({ id: 1, score: 60, level: 'developing', name: 'org/a' }),
      makeRepo({ id: 2, score: 60, level: 'developing', name: 'org/b' }),
    ];
    const r1 = buildPortfolioMaturityIndex({ repositories: repos });
    const r2 = buildPortfolioMaturityIndex({ repositories: [...repos].reverse() });
    const ranks1 = r1.benchmarkedRepositories.map(b => b.id);
    const ranks2 = r2.benchmarkedRepositories.map(b => b.id);
    expect(ranks1).toEqual(ranks2);
  });

  it('ties receive the same rank', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature',     name: 'org/a' }),
      makeRepo({ id: 2, score: 60, level: 'developing', name: 'org/b' }),
      makeRepo({ id: 3, score: 60, level: 'developing', name: 'org/c' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const byId = Object.fromEntries(r.benchmarkedRepositories.map(b => [b.id, b]));
    expect(byId[2].rank).toBe(byId[3].rank);
  });

  it('benchmarked repository items contain all required fields', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [makeRepo()] });
    const item = r.benchmarkedRepositories[0];
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('maturityScore');
    expect(item).toHaveProperty('maturityLevel');
    expect(item).toHaveProperty('percentile');
    expect(item).toHaveProperty('rank');
    expect(item).toHaveProperty('relativePosition');
    expect(item).toHaveProperty('topGaps');
  });
});

// ── relativePosition ─────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — relativePosition', () => {
  it('single-repo portfolio: repo is "leading"', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [makeRepo({ score: 60, level: 'developing' })] });
    expect(r.benchmarkedRepositories[0].relativePosition).toBe('leading');
  });

  it('all-unknown portfolio: repos have relativePosition "unknown"', () => {
    const repos = [
      makeRepo({ id: 1, score: 0, level: 'unknown' }),
      makeRepo({ id: 2, score: 0, level: 'unknown' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    r.benchmarkedRepositories.forEach(b => expect(b.relativePosition).toBe('unknown'));
  });

  it('top-percentile repo is "leading"', () => {
    const repos = Array.from({ length: 5 }, (_, i) =>
      makeRepo({ id: i + 1, score: (5 - i) * 15, level: 'developing', name: 'org/r' + (i + 1) })
    );
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const top = r.benchmarkedRepositories.find(b => b.rank === 1);
    expect(top.relativePosition).toBe('leading');
  });

  it('bottom-percentile repo is "lagging"', () => {
    const repos = Array.from({ length: 5 }, (_, i) =>
      makeRepo({ id: i + 1, score: (5 - i) * 15, level: 'developing', name: 'org/r' + (i + 1) })
    );
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const bottom = r.benchmarkedRepositories.find(b => b.rank === repos.length);
    expect(bottom.relativePosition).toBe('lagging');
  });

  it('relativePosition values are drawn from the valid set', () => {
    const VALID = new Set(['leading', 'above_average', 'average', 'below_average', 'lagging', 'unknown']);
    const repos = Array.from({ length: 6 }, (_, i) =>
      makeRepo({ id: i + 1, score: 20 + i * 10, level: 'developing', name: 'org/r' + (i + 1) })
    );
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    r.benchmarkedRepositories.forEach(b => expect(VALID.has(b.relativePosition)).toBe(true));
  });
});

// ── Common gaps ───────────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — commonGaps', () => {
  it('returns top 5 gaps by frequency', () => {
    const repos = [
      makeRepo({ id: 1, gaps: ['gap A', 'gap B', 'gap C'] }),
      makeRepo({ id: 2, gaps: ['gap A', 'gap B', 'gap D'] }),
      makeRepo({ id: 3, gaps: ['gap A', 'gap D', 'gap E', 'gap F'] }),
      makeRepo({ id: 4, gaps: ['gap A', 'gap E', 'gap F', 'gap G'] }),
      makeRepo({ id: 5, gaps: ['gap A', 'gap F', 'gap G', 'gap H'] }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.commonGaps.length).toBeLessThanOrEqual(5);
    expect(r.commonGaps[0]).toBe('gap A');
  });

  it('ties in gap frequency are broken alphabetically', () => {
    const repos = [
      makeRepo({ id: 1, gaps: ['gap Z', 'gap A'] }),
      makeRepo({ id: 2, gaps: ['gap Z', 'gap A'] }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const idx_a = r.commonGaps.indexOf('gap A');
    const idx_z = r.commonGaps.indexOf('gap Z');
    expect(idx_a).toBeLessThan(idx_z);
  });

  it('empty gaps returns empty commonGaps', () => {
    const r = buildPortfolioMaturityIndex({
      repositories: [makeRepo({ gaps: [] }), makeRepo({ id: 2, gaps: [] })],
    });
    expect(r.commonGaps).toEqual([]);
  });

  it('no gap appears more than once in commonGaps', () => {
    const repos = [makeRepo({ gaps: ['gap A', 'gap A'] }), makeRepo({ id: 2, gaps: ['gap A'] })];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const unique = new Set(r.commonGaps);
    expect(unique.size).toBe(r.commonGaps.length);
  });
});

// ── Recommendations ───────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — recommendations', () => {
  it('returns at most 5 recommendations', () => {
    const repos = Array.from({ length: 5 }, (_, i) => makeRepo({ id: i + 1 }));
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.recommendations.length).toBeLessThanOrEqual(5);
  });

  it('all recommendations are non-empty strings', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [makeRepo()] });
    r.recommendations.forEach(rec => {
      expect(typeof rec).toBe('string');
      expect(rec.length).toBeGreaterThan(0);
    });
  });

  it('recommendations address weakest dimensions', () => {
    const repos = [
      makeRepo({ id: 1, dims: { ciMaturity: 0, releaseMaturity: 0, contributorMaturity: 20, activityMaturity: 20, prWorkflowMaturity: 10, telemetryMaturity: 10 } }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    const allText = r.recommendations.join(' ').toLowerCase();
    expect(allText).toMatch(/ci|release/i);
  });

  it('empty portfolio returns no recommendations', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r.recommendations).toEqual([]);
  });
});

// ── Confidence ────────────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — confidence', () => {
  it('low: fewer than 3 repos', () => {
    const repos = [
      makeRepo({ id: 1, conf: 'high', score: 70, level: 'developing' }),
      makeRepo({ id: 2, conf: 'high', score: 70, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.confidenceLevel).toBe('low');
  });

  it('medium: 3 or 4 repos', () => {
    const repos = Array.from({ length: 3 }, (_, i) =>
      makeRepo({ id: i + 1, conf: 'high', score: 70, level: 'developing' })
    );
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('high: >=5 repos and >=70% have medium/high confidence', () => {
    const repos = [
      makeRepo({ id: 1, conf: 'high',   score: 70, level: 'developing' }),
      makeRepo({ id: 2, conf: 'medium', score: 70, level: 'developing' }),
      makeRepo({ id: 3, conf: 'high',   score: 70, level: 'developing' }),
      makeRepo({ id: 4, conf: 'medium', score: 70, level: 'developing' }),
      makeRepo({ id: 5, conf: 'high',   score: 70, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.confidenceLevel).toBe('high');
  });

  it('medium (not high): >=5 repos but <70% have medium/high confidence', () => {
    const repos = [
      makeRepo({ id: 1, conf: 'high', score: 70, level: 'developing' }),
      makeRepo({ id: 2, conf: 'low',  score: 70, level: 'developing' }),
      makeRepo({ id: 3, conf: 'low',  score: 70, level: 'developing' }),
      makeRepo({ id: 4, conf: 'low',  score: 70, level: 'developing' }),
      makeRepo({ id: 5, conf: 'low',  score: 70, level: 'developing' }),
    ];
    const r = buildPortfolioMaturityIndex({ repositories: repos });
    expect(r.confidenceLevel).toBe('medium');
  });

  it('empty portfolio has low confidence', () => {
    const r = buildPortfolioMaturityIndex({ repositories: [] });
    expect(r.confidenceLevel).toBe('low');
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — non-mutation', () => {
  it('does not mutate the input repositories array', () => {
    const repos = [
      makeRepo({ id: 1, score: 80, level: 'mature' }),
      makeRepo({ id: 2, score: 50, level: 'developing' }),
    ];
    const originalFirst = repos[0];
    buildPortfolioMaturityIndex({ repositories: repos });
    expect(repos[0]).toBe(originalFirst);
    expect(repos.length).toBe(2);
  });

  it('does not mutate individual repo objects', () => {
    const repo = makeRepo({ id: 1, score: 60, gaps: ['gap A'] });
    buildPortfolioMaturityIndex({ repositories: [repo] });
    expect(repo.maturityScore).toBe(60);
    expect(repo.gaps).toEqual(['gap A']);
  });
});

// ── Mixed portfolio integration ───────────────────────────────────────────────

describe('buildPortfolioMaturityIndex — mixed portfolio', () => {
  const MIXED_REPOS = [
    makeRepo({ id: 1, name: 'org/alpha',   score: 82, level: 'mature',     conf: 'high',   gaps: ['No releases in 90 days'],           dims: { ciMaturity: 20, releaseMaturity: 8,  contributorMaturity: 20, activityMaturity: 20, prWorkflowMaturity: 8,  telemetryMaturity: 6 } }),
    makeRepo({ id: 2, name: 'org/beta',    score: 65, level: 'developing', conf: 'high',   gaps: ['No releases in 90 days', 'High bus-factor'],     dims: { ciMaturity: 18, releaseMaturity: 10, contributorMaturity: 12, activityMaturity: 15, prWorkflowMaturity: 6,  telemetryMaturity: 4 } }),
    makeRepo({ id: 3, name: 'org/gamma',   score: 48, level: 'developing', conf: 'medium', gaps: ['High bus-factor', 'No commits in 7 days'],       dims: { ciMaturity: 10, releaseMaturity: 10, contributorMaturity: 8,  activityMaturity: 12, prWorkflowMaturity: 6,  telemetryMaturity: 2 } }),
    makeRepo({ id: 4, name: 'org/delta',   score: 30, level: 'immature',   conf: 'medium', gaps: ['No releases in 90 days', 'No commits in 7 days'], dims: { ciMaturity: 0,  releaseMaturity: 8,  contributorMaturity: 10, activityMaturity: 4,  prWorkflowMaturity: 6,  telemetryMaturity: 2 } }),
    makeRepo({ id: 5, name: 'org/epsilon', score: 0,  level: 'unknown',    conf: 'low',    gaps: [],                                                 dims: { ciMaturity: 0,  releaseMaturity: 0,  contributorMaturity: 0,  activityMaturity: 0,  prWorkflowMaturity: 0,  telemetryMaturity: 0 } }),
  ];

  it('portfolio score excludes the unknown repo', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    // avg of 82, 65, 48, 30 = 225/4 = 56.25 → 56
    expect(r.portfolioMaturityScore).toBe(56);
  });

  it('distribution counts are correct', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(r.distribution.mature).toBe(1);
    expect(r.distribution.developing).toBe(2);
    expect(r.distribution.immature).toBe(1);
    expect(r.distribution.unknown).toBe(1);
  });

  it('rank 1 is org/alpha (highest score)', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(r.benchmarkedRepositories.find(b => b.rank === 1).name).toBe('org/alpha');
  });

  it('summary is a non-empty string', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(typeof r.summary).toBe('string');
    expect(r.summary.length).toBeGreaterThan(0);
  });

  it('commonGaps include the most frequent ones', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(r.commonGaps).toContain('No releases in 90 days');
  });

  it('topGaps on benchmarked repos is an array', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    r.benchmarkedRepositories.forEach(b => expect(Array.isArray(b.topGaps)).toBe(true));
  });

  it('benchmarkedRepositories has same length as input', () => {
    const r = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(r.benchmarkedRepositories.length).toBe(MIXED_REPOS.length);
  });

  it('second call with same input produces identical output (determinism)', () => {
    const r1 = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    const r2 = buildPortfolioMaturityIndex({ repositories: MIXED_REPOS });
    expect(r1).toEqual(r2);
  });
});
