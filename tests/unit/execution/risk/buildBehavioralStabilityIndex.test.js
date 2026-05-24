'use strict';

const { buildBehavioralStabilityIndex } = require('../../../../execution/risk/buildBehavioralStabilityIndex');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRepo(id, overrides) {
  return Object.assign({ repoId: id }, overrides || {});
}

// ── empty portfolio ───────────────────────────────────────────────────────────

describe('empty portfolio', () => {
  test('returns unknown stability for empty array', () => {
    const r = buildBehavioralStabilityIndex([]);
    expect(r.indexScore).toBe(0);
    expect(r.stabilityLevel).toBe('unknown');
    expect(r.confidenceLevel).toBe('low');
    expect(r.drivers).toEqual([]);
  });

  test('returns unknown stability for null repos', () => {
    expect(buildBehavioralStabilityIndex(null).stabilityLevel).toBe('unknown');
  });

  test('returns unknown stability for undefined repos', () => {
    expect(buildBehavioralStabilityIndex(undefined).stabilityLevel).toBe('unknown');
  });

  test('all counts are zero for empty portfolio', () => {
    const { counts } = buildBehavioralStabilityIndex([]);
    expect(counts.totalRepos).toBe(0);
    expect(counts.escalatingRepos).toBe(0);
    expect(counts.deterioratingRepos).toBe(0);
    expect(counts.volatileRepos).toBe(0);
    expect(counts.persistentRiskRepos).toBe(0);
    expect(counts.prRiskRepos).toBe(0);
    expect(counts.ciFailingRepos).toBe(0);
    expect(counts.abandonedRepos).toBe(0);
    expect(counts.improvingRepos).toBe(0);
  });

  test('summary describes absence of repos', () => {
    const { summary } = buildBehavioralStabilityIndex([]);
    expect(summary.toLowerCase()).toContain('no repositories');
  });
});

// ── stable portfolio ──────────────────────────────────────────────────────────

describe('stable portfolio', () => {
  test('returns score 100 for repos with no behavioral signals', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1'), makeRepo('r2')]);
    expect(r.indexScore).toBe(100);
    expect(r.stabilityLevel).toBe('stable');
  });

  test('no drivers emitted for all-clean portfolio', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1'), makeRepo('r2')]);
    expect(r.drivers).toHaveLength(0);
  });

  test('structural trajectory label does not incur penalty', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { trajectory: 'stable' })]);
    expect(r.indexScore).toBe(100);
  });
});

// ── escalating penalty ────────────────────────────────────────────────────────

describe('escalating trajectory penalty (-20 each)', () => {
  test('single escalating repo: score 80, watch level', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { trajectory: 'escalating' })]);
    expect(r.indexScore).toBe(80);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('two escalating repos: score 60, volatile level', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'escalating' }),
    ]);
    expect(r.indexScore).toBe(60);
    expect(r.stabilityLevel).toBe('volatile');
  });

  test('escalating driver appears with correct impact', () => {
    const { drivers } = buildBehavioralStabilityIndex([makeRepo('r1', { trajectory: 'escalating' })]);
    const d = drivers.find(x => x.signal === 'escalating_repos');
    expect(d).toBeDefined();
    expect(d.direction).toBe('negative');
    expect(d.count).toBe(1);
    expect(d.impact).toBe(-20);
  });

  test('escalating count reflected in counts.escalatingRepos', () => {
    const { counts } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2'),
    ]);
    expect(counts.escalatingRepos).toBe(1);
    expect(counts.totalRepos).toBe(2);
  });
});

// ── CI failure penalty ────────────────────────────────────────────────────────

describe('CI failure penalty (-18)', () => {
  test('single ci_failing repo: score 82, watch level', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { ci_failing: true })]);
    expect(r.indexScore).toBe(82);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('ci_failing driver has -18 impact', () => {
    const { drivers } = buildBehavioralStabilityIndex([makeRepo('r1', { ci_failing: true })]);
    const d = drivers.find(x => x.signal === 'ci_failing_repos');
    expect(d).toBeDefined();
    expect(d.impact).toBe(-18);
  });

  test('ci_failing: false does not incur any penalty', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { ci_failing: false })]);
    expect(r.indexScore).toBe(100);
  });

  test('ciFailingRepos count is correct', () => {
    const { counts } = buildBehavioralStabilityIndex([
      makeRepo('r1', { ci_failing: true }),
      makeRepo('r2', { ci_failing: true }),
    ]);
    expect(counts.ciFailingRepos).toBe(2);
  });
});

// ── deteriorating penalty ─────────────────────────────────────────────────────

describe('deteriorating trajectory penalty (-12 each)', () => {
  test('two deteriorating repos: score 76, watch level', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
    ]);
    expect(r.indexScore).toBe(76);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('deteriorating driver impact = -12 per repo', () => {
    const { drivers } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
    ]);
    const d = drivers.find(x => x.signal === 'deteriorating_repos');
    expect(d.count).toBe(2);
    expect(d.impact).toBe(-24);
  });

  test('deterioratingRepos count is correct', () => {
    const { counts } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
    ]);
    expect(counts.deterioratingRepos).toBe(1);
  });
});

// ── volatility penalty ────────────────────────────────────────────────────────

describe('volatility penalty', () => {
  test('high volatility via repo.volatilityLevel: -10, score 90, stable', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { volatilityLevel: 'high' })]);
    expect(r.indexScore).toBe(90);
    expect(r.stabilityLevel).toBe('stable');
  });

  test('critical volatility via repo.volatilityLevel: -10, score 90', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { volatilityLevel: 'critical' })]);
    expect(r.indexScore).toBe(90);
  });

  test('high volatility resolved from volatilityByRepo map', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1')], { r1: { volatilityLevel: 'high' } });
    expect(r.indexScore).toBe(90);
    const d = r.drivers.find(x => x.signal === 'volatile_repos');
    expect(d).toBeDefined();
    expect(d.impact).toBe(-10);
  });

  test('medium volatility: -4 penalty per repo', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { volatilityLevel: 'medium' })]);
    expect(r.indexScore).toBe(96);
    const d = r.drivers.find(x => x.signal === 'medium_volatile_repos');
    expect(d).toBeDefined();
    expect(d.impact).toBe(-4);
  });

  test('low volatility does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { volatilityLevel: 'low' })]);
    expect(r.indexScore).toBe(100);
  });

  test('volatileRepos count covers high and critical only', () => {
    const { counts } = buildBehavioralStabilityIndex([
      makeRepo('r1', { volatilityLevel: 'high' }),
      makeRepo('r2', { volatilityLevel: 'critical' }),
      makeRepo('r3', { volatilityLevel: 'medium' }),
    ]);
    expect(counts.volatileRepos).toBe(2);
  });
});

// ── PR risk penalty ───────────────────────────────────────────────────────────

describe('PR risk penalty', () => {
  test('two at-risk PR repos: score 84, watch', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { prHealthStatus: 'at-risk' }),
      makeRepo('r2', { prHealthStatus: 'at-risk' }),
    ]);
    expect(r.indexScore).toBe(84);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('critical PR health: -8 penalty, score 92', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { prHealthStatus: 'critical' })]);
    expect(r.indexScore).toBe(92);
    const d = r.drivers.find(x => x.signal === 'pr_risk_repos');
    expect(d.impact).toBe(-8);
  });

  test('PR monitor: -4 penalty, score 96', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { prHealthStatus: 'monitor' })]);
    expect(r.indexScore).toBe(96);
    const d = r.drivers.find(x => x.signal === 'pr_monitor_repos');
    expect(d.impact).toBe(-4);
  });

  test('healthy PR status does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { prHealthStatus: 'healthy' })]);
    expect(r.indexScore).toBe(100);
  });

  test('prRiskRepos count includes critical and at-risk', () => {
    const { counts } = buildBehavioralStabilityIndex([
      makeRepo('r1', { prHealthStatus: 'critical' }),
      makeRepo('r2', { prHealthStatus: 'at-risk' }),
      makeRepo('r3', { prHealthStatus: 'monitor' }),
    ]);
    expect(counts.prRiskRepos).toBe(2);
  });
});

// ── anomaly cluster penalty ───────────────────────────────────────────────────

describe('anomaly cluster penalty', () => {
  test('one critical cluster: score 85, stable (boundary)', () => {
    const r = buildBehavioralStabilityIndex(
      [makeRepo('r1')], {},
      [{ severity: 'critical', clusterType: 'ci_failure', affectedRepos: ['r1'] }],
    );
    expect(r.indexScore).toBe(85);
    expect(r.stabilityLevel).toBe('stable');
  });

  test('one non-critical cluster: score 95, stable', () => {
    const r = buildBehavioralStabilityIndex(
      [makeRepo('r1')], {},
      [{ severity: 'high', clusterType: 'pr_risk', affectedRepos: ['r1'] }],
    );
    expect(r.indexScore).toBe(95);
  });

  test('critical_clusters driver: -15 per cluster', () => {
    const r = buildBehavioralStabilityIndex(
      [makeRepo('r1')], {},
      [{ severity: 'critical' }, { severity: 'critical' }],
    );
    expect(r.indexScore).toBe(70);
    const d = r.drivers.find(x => x.signal === 'critical_clusters');
    expect(d.count).toBe(2);
    expect(d.impact).toBe(-30);
  });

  test('recurring_clusters driver: -5 per cluster', () => {
    const r = buildBehavioralStabilityIndex(
      [makeRepo('r1')], {},
      [{ severity: 'medium' }, { severity: 'low' }],
    );
    expect(r.indexScore).toBe(90);
    const d = r.drivers.find(x => x.signal === 'recurring_clusters');
    expect(d.count).toBe(2);
    expect(d.impact).toBe(-10);
  });

  test('cluster penalties are not subject to per-repo cap', () => {
    // clusters are portfolio-level, so their penalty always applies in full
    const r = buildBehavioralStabilityIndex(
      [makeRepo('r1')], {},
      [
        { severity: 'critical' }, { severity: 'critical' },
        { severity: 'critical' }, { severity: 'critical' },
      ],
    );
    // 4 critical clusters: 4*15 = 60 penalty → score = 40
    expect(r.indexScore).toBe(40);
    expect(r.stabilityLevel).toBe('unstable');
  });
});

// ── improving offset cap ──────────────────────────────────────────────────────

describe('improving offset cap (+3 each, max +15)', () => {
  test('offset caps at +15 (6 recovering repos)', () => {
    // 4 deteriorating: 4*12 = 48 penalty
    // 6 recovering: raw=18, capped at 15
    // score = 100 - 48 + 15 = 67, volatile
    const repos = [
      makeRepo('d1', { trajectory: 'deteriorating' }),
      makeRepo('d2', { trajectory: 'deteriorating' }),
      makeRepo('d3', { trajectory: 'deteriorating' }),
      makeRepo('d4', { trajectory: 'deteriorating' }),
      makeRepo('r1', { trajectory: 'recovering' }),
      makeRepo('r2', { trajectory: 'recovering' }),
      makeRepo('r3', { trajectory: 'recovering' }),
      makeRepo('r4', { trajectory: 'recovering' }),
      makeRepo('r5', { trajectory: 'recovering' }),
      makeRepo('r6', { trajectory: 'recovering' }),
    ];
    const r = buildBehavioralStabilityIndex(repos);
    expect(r.indexScore).toBe(67);
    expect(r.stabilityLevel).toBe('volatile');
  });

  test('offset within cap is applied fully (3 recovering repos, no penalties)', () => {
    // raw offset = 9 < 15; score = 100-0+9 = 109 → clamped to 100
    const repos = [
      makeRepo('r1', { trajectory: 'recovering' }),
      makeRepo('r2', { trajectory: 'recovering' }),
      makeRepo('r3', { trajectory: 'recovering' }),
    ];
    const r = buildBehavioralStabilityIndex(repos);
    expect(r.indexScore).toBe(100);
  });

  test('improving trajectory also counted as offset', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { trajectory: 'improving' }),
    ]);
    // 12 penalty - 0 cap, +3 offset → score = 100-12+3 = 91
    expect(r.indexScore).toBe(91);
    expect(r.counts.improvingRepos).toBe(1);
  });

  test('improving driver direction is positive', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { trajectory: 'recovering' }),
    ]);
    const d = r.drivers.find(x => x.signal === 'improving_repos');
    expect(d).toBeDefined();
    expect(d.direction).toBe('positive');
    expect(d.impact).toBe(3);
  });
});

// ── per-repo penalty cap ──────────────────────────────────────────────────────

describe('per-repo penalty cap (max -35 per repo)', () => {
  test('single repo capped at -35 when raw exceeds cap', () => {
    // escalating(20) + ci_failing(18) = 38 > 35 → capped at 35
    // score = 100 - 35 = 65, volatile
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating', ci_failing: true }),
    ]);
    expect(r.indexScore).toBe(65);
    expect(r.stabilityLevel).toBe('volatile');
  });

  test('cap applies per-repo independently (two capped repos)', () => {
    // each: escalating(20)+ci_failing(18)=38, capped at 35
    // totalPenalty = 70 → score = 30, unstable
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating', ci_failing: true }),
      makeRepo('r2', { trajectory: 'escalating', ci_failing: true }),
    ]);
    expect(r.indexScore).toBe(30);
    expect(r.stabilityLevel).toBe('unstable');
  });

  test('repo below cap is not affected', () => {
    // escalating(20) < 35 — no capping applied
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { trajectory: 'escalating' })]);
    expect(r.indexScore).toBe(80);
  });

  test('driver impact reflects uncapped raw penalty, not capped value', () => {
    // repo has escalating(20)+ci_failing(18)=38 (capped at 35 for score)
    // but driver impact should show the raw signal totals separately
    const { drivers } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating', ci_failing: true }),
    ]);
    const esc = drivers.find(x => x.signal === 'escalating_repos');
    const ci  = drivers.find(x => x.signal === 'ci_failing_repos');
    expect(esc.impact).toBe(-20);
    expect(ci.impact).toBe(-18);
  });
});

// ── structural-only signals ignored ──────────────────────────────────────────

describe('structural-only signals do not reduce score', () => {
  test('noReleases flag does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { noReleases: true })]);
    expect(r.indexScore).toBe(100);
  });

  test('busFactor warning does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { busFactor: 1 })]);
    expect(r.indexScore).toBe(100);
  });

  test('ciStatus unknown does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { ciStatus: 'unknown' })]);
    expect(r.indexScore).toBe(100);
  });

  test('noCommits flag does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { noCommits: true, daysInactive: 120 })]);
    expect(r.indexScore).toBe(100);
  });

  test('singleContributor flag does not reduce score', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1', { singleContributor: true })]);
    expect(r.indexScore).toBe(100);
  });

  test('mix of structural signals still yields score 100 and stable', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { noReleases: true, busFactor: 1, ciStatus: 'unknown' }),
      makeRepo('r2', { noReleases: true, singleContributor: true, daysInactive: 60 }),
    ]);
    expect(r.indexScore).toBe(100);
    expect(r.stabilityLevel).toBe('stable');
    expect(r.drivers).toHaveLength(0);
  });
});

// ── stability level thresholds ────────────────────────────────────────────────

describe('stability level thresholds', () => {
  test('score 100 → stable', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1')]);
    expect(r.indexScore).toBe(100);
    expect(r.stabilityLevel).toBe('stable');
  });

  test('score 85 (1 critical cluster) → stable (lower boundary)', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1')], {}, [{ severity: 'critical' }]);
    expect(r.indexScore).toBe(85);
    expect(r.stabilityLevel).toBe('stable');
  });

  test('score 84 (1 deteriorating + 1 pr_monitor) → watch', () => {
    // penalty = 12 + 4 = 16 → score = 84
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { prHealthStatus: 'monitor' }),
    ]);
    expect(r.indexScore).toBe(84);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('score 70 (1 deteriorating + 1 ci_failing) → watch (lower boundary)', () => {
    // penalty = 12 + 18 = 30 → score = 70
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'deteriorating' }),
      makeRepo('r2', { ci_failing: true }),
    ]);
    expect(r.indexScore).toBe(70);
    expect(r.stabilityLevel).toBe('watch');
  });

  test('score 60 (2 escalating) → volatile', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'escalating' }),
    ]);
    expect(r.indexScore).toBe(60);
    expect(r.stabilityLevel).toBe('volatile');
  });

  test('score 30 (2 repos each escalating+CI, per-repo capped) → unstable', () => {
    // 2 * 35 (capped) = 70 → score = 30
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating', ci_failing: true }),
      makeRepo('r2', { trajectory: 'escalating', ci_failing: true }),
    ]);
    expect(r.indexScore).toBe(30);
    expect(r.stabilityLevel).toBe('unstable');
  });
});

// ── confidence level thresholds ───────────────────────────────────────────────

describe('confidence level thresholds', () => {
  test('1 repo → low confidence', () => {
    expect(buildBehavioralStabilityIndex([makeRepo('r1')]).confidenceLevel).toBe('low');
  });

  test('2 repos → low confidence', () => {
    expect(buildBehavioralStabilityIndex([makeRepo('r1'), makeRepo('r2')]).confidenceLevel).toBe('low');
  });

  test('3 repos → medium confidence', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1'), makeRepo('r2'), makeRepo('r3')]);
    expect(r.confidenceLevel).toBe('medium');
  });

  test('5 repos with exactly 60% evidence → high confidence', () => {
    // 3 of 5 have known trajectory (3/5 = 0.60 ≥ 0.60)
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'stable' }),
      makeRepo('r2', { trajectory: 'stable' }),
      makeRepo('r3', { trajectory: 'stable' }),
      makeRepo('r4'),
      makeRepo('r5'),
    ]);
    expect(r.confidenceLevel).toBe('high');
  });

  test('5 repos with <60% evidence → medium confidence', () => {
    // 2 of 5 have evidence (2/5 = 0.40 < 0.60) → medium (still >=3 repos)
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'stable' }),
      makeRepo('r2', { trajectory: 'stable' }),
      makeRepo('r3'),
      makeRepo('r4'),
      makeRepo('r5'),
    ]);
    expect(r.confidenceLevel).toBe('medium');
  });

  test('volatility record in map counts as usable evidence', () => {
    // 5 repos: 3 have trajectory, 2 have volRecord → 5/5 evidence → high
    const volByRepo = { r4: { volatilityLevel: 'low' }, r5: { volatilityLevel: 'low' } };
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'stable' }),
      makeRepo('r2', { trajectory: 'stable' }),
      makeRepo('r3', { trajectory: 'stable' }),
      makeRepo('r4'),
      makeRepo('r5'),
    ], volByRepo);
    expect(r.confidenceLevel).toBe('high');
  });

  test('trajectory unknown does not count as evidence', () => {
    // 5 repos, 2 with trajectory='unknown' (excluded), 3 with no trajectory → 0 evidence → medium
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'unknown' }),
      makeRepo('r2', { trajectory: 'unknown' }),
      makeRepo('r3'),
      makeRepo('r4'),
      makeRepo('r5'),
    ]);
    expect(r.confidenceLevel).toBe('medium');
  });
});

// ── deterministic drivers ─────────────────────────────────────────────────────

describe('deterministic drivers', () => {
  test('same input produces identical output', () => {
    const repos = [
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
    ];
    expect(buildBehavioralStabilityIndex(repos)).toEqual(buildBehavioralStabilityIndex(repos));
  });

  test('drivers sorted by absolute impact descending', () => {
    // escalating (-20) outranks deteriorating (-12)
    const { drivers } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
    ]);
    const escIdx = drivers.findIndex(d => d.signal === 'escalating_repos');
    const detIdx = drivers.findIndex(d => d.signal === 'deteriorating_repos');
    expect(escIdx).toBeLessThan(detIdx);
  });

  test('alphabetical tiebreaker when impact magnitudes are equal', () => {
    // abandoned_repos (-15) and critical_clusters (-15) tie on |impact|
    // 'abandoned_repos' < 'critical_clusters' alphabetically
    const { drivers } = buildBehavioralStabilityIndex(
      [makeRepo('r1', { contributor_abandoned: true })], {},
      [{ severity: 'critical' }],
    );
    const abIdx = drivers.findIndex(d => d.signal === 'abandoned_repos');
    const ccIdx = drivers.findIndex(d => d.signal === 'critical_clusters');
    expect(abIdx).toBeLessThan(ccIdx);
  });

  test('all driver entries have required shape', () => {
    const { drivers } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
    ]);
    for (const d of drivers) {
      expect(d).toHaveProperty('direction');
      expect(d).toHaveProperty('signal');
      expect(d).toHaveProperty('count');
      expect(d).toHaveProperty('impact');
      expect(d).toHaveProperty('description');
      expect(['negative', 'positive']).toContain(d.direction);
    }
  });
});

// ── non-mutation ──────────────────────────────────────────────────────────────

describe('non-mutation', () => {
  test('input repos array is not modified', () => {
    const repos = [
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
    ];
    const snapshot = JSON.parse(JSON.stringify(repos));
    buildBehavioralStabilityIndex(repos);
    expect(repos).toEqual(snapshot);
  });

  test('input clusters array is not modified', () => {
    const clusters = [{ severity: 'critical' }, { severity: 'high' }];
    const snapshot = JSON.parse(JSON.stringify(clusters));
    buildBehavioralStabilityIndex([makeRepo('r1')], {}, clusters);
    expect(clusters).toEqual(snapshot);
  });

  test('input volatilityByRepo map is not modified', () => {
    const volByRepo = { r1: { volatilityLevel: 'high' } };
    const snapshot  = JSON.parse(JSON.stringify(volByRepo));
    buildBehavioralStabilityIndex([makeRepo('r1')], volByRepo);
    expect(volByRepo).toEqual(snapshot);
  });
});

// ── mixed portfolio ───────────────────────────────────────────────────────────

describe('mixed portfolio', () => {
  test('complex scenario: 2 escalating + CI + PR at-risk + recovering', () => {
    // r1 escalating: 20, r2 escalating: 20, r3 ci_failing: 18, r4 pr at-risk: 8
    // totalPenalty = 66; recovering offset = 3
    // score = 100 - 66 + 3 = 37, unstable
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'escalating' }),
      makeRepo('r3', { ci_failing: true }),
      makeRepo('r4', { prHealthStatus: 'at-risk' }),
      makeRepo('r5', { trajectory: 'recovering' }),
    ]);
    expect(r.indexScore).toBe(37);
    expect(r.stabilityLevel).toBe('unstable');
    expect(r.counts.escalatingRepos).toBe(2);
    expect(r.counts.ciFailingRepos).toBe(1);
    expect(r.counts.prRiskRepos).toBe(1);
    expect(r.counts.improvingRepos).toBe(1);
  });

  test('mixed portfolio drivers include all active signal types', () => {
    const { drivers } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating' }),
      makeRepo('r2', { trajectory: 'deteriorating' }),
      makeRepo('r3', { ci_failing: true }),
      makeRepo('r4', { trajectory: 'recovering' }),
    ]);
    const signals = drivers.map(d => d.signal);
    expect(signals).toContain('escalating_repos');
    expect(signals).toContain('deteriorating_repos');
    expect(signals).toContain('ci_failing_repos');
    expect(signals).toContain('improving_repos');
  });

  test('summary text reflects unstable level', () => {
    const { summary } = buildBehavioralStabilityIndex([
      makeRepo('r1', { trajectory: 'escalating', ci_failing: true }),
      makeRepo('r2', { trajectory: 'escalating', ci_failing: true }),
    ]);
    expect(summary.toLowerCase()).toContain('critical');
  });

  test('counts object has all required keys', () => {
    const { counts } = buildBehavioralStabilityIndex([makeRepo('r1')]);
    const required = [
      'totalRepos', 'escalatingRepos', 'deterioratingRepos', 'volatileRepos',
      'persistentRiskRepos', 'prRiskRepos', 'ciFailingRepos', 'abandonedRepos', 'improvingRepos',
    ];
    for (const key of required) {
      expect(counts).toHaveProperty(key);
    }
  });

  test('output has all required top-level keys', () => {
    const r = buildBehavioralStabilityIndex([makeRepo('r1')]);
    expect(r).toHaveProperty('indexScore');
    expect(r).toHaveProperty('stabilityLevel');
    expect(r).toHaveProperty('confidenceLevel');
    expect(r).toHaveProperty('summary');
    expect(r).toHaveProperty('drivers');
    expect(r).toHaveProperty('counts');
  });

  test('abandoned contributor repo scored and counted correctly', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { contributor_abandoned: true }),
    ]);
    // PENALTY_ABANDONED = 15 → score = 85
    expect(r.indexScore).toBe(85);
    expect(r.counts.abandonedRepos).toBe(1);
    const d = r.drivers.find(x => x.signal === 'abandoned_repos');
    expect(d.impact).toBe(-15);
  });

  test('persistent risk repo scored and counted correctly', () => {
    const r = buildBehavioralStabilityIndex([
      makeRepo('r1', { persistentRisk: true }),
    ]);
    // PENALTY_PERSISTENT_RISK = 10 → score = 90
    expect(r.indexScore).toBe(90);
    expect(r.counts.persistentRiskRepos).toBe(1);
  });
});
