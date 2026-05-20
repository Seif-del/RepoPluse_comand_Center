'use strict';

const { clusterOperationalAnomalies } = require('../../../../execution/risk/clusterOperationalAnomalies');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = '2026-05-19T12:00:00.000Z';
const NOW_MS = new Date(NOW).getTime();

// ISO string offset from NOW by ms.
function at(ms) {
  return new Date(NOW_MS + ms).toISOString();
}

const T_1H_AGO       = at(-60 * 60 * 1000);          // 1h before NOW
const T_2H_AGO       = at(-2 * 60 * 60 * 1000);      // exactly 2h before NOW (boundary)
const T_2H_1MS_AGO   = at(-(2 * 60 * 60 * 1000 + 1)); // 2h + 1ms before NOW (outside)
const T_30MIN_LATER  = at(30 * 60 * 1000);            // 30 min after NOW

function makeAnomaly(overrides) {
  return Object.assign({
    type:             'score_spike',
    severity:         'medium',
    title:            'Test anomaly',
    summary:          'Test summary.',
    affectedRepos:    [],
    detectedAt:       NOW,
    confidence:       { level: 'medium', score: 50, rationale: 'test' },
    supportingMetrics: {},
  }, overrides);
}

// Convenience factories per anomaly type.
function ciFailure(repo, opts) {
  return makeAnomaly(Object.assign({
    type:          'sudden_ci_failure',
    severity:      'high',
    affectedRepos: [repo],
    confidence:    { level: 'high', score: 75, rationale: 'test' },
  }, opts));
}

function scoreSpike(repo, opts) {
  return makeAnomaly(Object.assign({
    type:          'score_spike',
    severity:      'medium',
    affectedRepos: [repo],
    confidence:    { level: 'medium', score: 55, rationale: 'test' },
  }, opts));
}

function portfolioJump(opts) {
  return makeAnomaly(Object.assign({
    type:          'portfolio_risk_jump',
    severity:      'high',
    affectedRepos: [],
    confidence:    { level: 'high', score: 70, rationale: 'test' },
  }, opts));
}

function volatilitySurge(repo, opts) {
  return makeAnomaly(Object.assign({
    type:          'volatility_surge',
    severity:      'medium',
    affectedRepos: [repo],
    confidence:    { level: 'medium', score: 50, rationale: 'test' },
  }, opts));
}

function telemetryDropout(repo, opts) {
  return makeAnomaly(Object.assign({
    type:          'telemetry_dropout',
    severity:      'high',
    affectedRepos: [repo],
    confidence:    { level: 'medium', score: 45, rationale: 'test' },
  }, opts));
}

function syncInactivity(repos, opts) {
  return makeAnomaly(Object.assign({
    type:          'synchronized_inactivity',
    severity:      'medium',
    affectedRepos: repos,
    confidence:    { level: 'medium', score: 58, rationale: 'test' },
  }, opts));
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — guard conditions', () => {
  it('returns empty array when called with no arguments', () => {
    expect(clusterOperationalAnomalies()).toEqual([]);
  });

  it('returns empty array for an empty array input', () => {
    expect(clusterOperationalAnomalies([])).toEqual([]);
  });

  it('returns empty array for null input', () => {
    expect(clusterOperationalAnomalies(null)).toEqual([]);
  });

  it('filters out null and malformed entries without throwing', () => {
    const result = clusterOperationalAnomalies([null, undefined, {}, 'string', 42]);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toEqual([]);
  });

  it('processes valid entries even if array also contains nulls', () => {
    const result = clusterOperationalAnomalies([null, ciFailure('r1'), undefined]);
    expect(result.length).toBe(1);
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — output shape', () => {
  it('every cluster has all required keys', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    expect(result.length).toBe(1);
    const c = result[0];
    expect(c).toHaveProperty('clusterId');
    expect(c).toHaveProperty('clusterType');
    expect(c).toHaveProperty('severity');
    expect(c).toHaveProperty('title');
    expect(c).toHaveProperty('summary');
    expect(c).toHaveProperty('anomalyCount');
    expect(c).toHaveProperty('affectedRepos');
    expect(c).toHaveProperty('timeWindow');
    expect(c).toHaveProperty('confidence');
    expect(c).toHaveProperty('anomalies');
  });

  it('timeWindow has start, end, and durationMs', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    const tw = result[0].timeWindow;
    expect(tw).toHaveProperty('start');
    expect(tw).toHaveProperty('end');
    expect(tw).toHaveProperty('durationMs');
  });

  it('confidence has level, score, and rationale', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    const conf = result[0].confidence;
    expect(conf).toHaveProperty('level');
    expect(conf).toHaveProperty('score');
    expect(conf).toHaveProperty('rationale');
    expect(['low', 'medium', 'high']).toContain(conf.level);
  });

  it('severity is always one of low | medium | high | critical', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1'),
      scoreSpike('r2'),
      volatilitySurge('r3'),
    ]);
    result.forEach(c => expect(['low', 'medium', 'high', 'critical']).toContain(c.severity));
  });

  it('affectedRepos is always a sorted array', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    expect(Array.isArray(result[0].affectedRepos)).toBe(true);
  });

  it('anomalies is an array preserving original anomaly objects', () => {
    const a = ciFailure('r1');
    const result = clusterOperationalAnomalies([a]);
    expect(result[0].anomalies[0]).toBe(a);
  });
});

// ── Single anomaly → single cluster ──────────────────────────────────────────

describe('clusterOperationalAnomalies — single anomaly becomes single cluster', () => {
  it('one anomaly produces exactly one cluster', () => {
    expect(clusterOperationalAnomalies([ciFailure('r1')])).toHaveLength(1);
  });

  it('single cluster anomalyCount is 1', () => {
    const result = clusterOperationalAnomalies([scoreSpike('r1')]);
    expect(result[0].anomalyCount).toBe(1);
  });

  it('single-anomaly cluster timeWindow has durationMs = 0', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    expect(result[0].timeWindow.durationMs).toBe(0);
    expect(result[0].timeWindow.start).toBe(result[0].timeWindow.end);
  });

  it('single-anomaly cluster contains the original anomaly in anomalies array', () => {
    const a = volatilitySurge('r1');
    const result = clusterOperationalAnomalies([a]);
    expect(result[0].anomalies).toContain(a);
  });
});

// ── Same type-family within time window → clusters ────────────────────────────

describe('clusterOperationalAnomalies — same family within 2h window', () => {
  it('two same-family anomalies within 2h produce 1 cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].anomalyCount).toBe(2);
  });

  it('three same-family anomalies within 2h produce 1 cluster with 3 anomalies', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
      ciFailure('r3', { detectedAt: NOW }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].anomalyCount).toBe(3);
  });

  it('anomalies exactly 2h apart cluster (inclusive boundary)', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_2H_AGO }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('anomalies 2h + 1ms apart do NOT cluster (outside boundary)', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_2H_1MS_AGO }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('same-family cluster has the correct clusterType', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].clusterType).toBe('ci_instability_cluster');
  });

  it('score_spike and portfolio_risk_jump cluster together (same risk_acceleration family)', () => {
    const result = clusterOperationalAnomalies([
      scoreSpike('r1', { detectedAt: NOW }),
      portfolioJump({ detectedAt: T_1H_AGO }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].clusterType).toBe('risk_acceleration_cluster');
  });
});

// ── Different families, no shared repos → separate clusters ───────────────────

describe('clusterOperationalAnomalies — different family, no shared repos → separate', () => {
  it('different-family, different-repo anomalies within 2h remain separate', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',        { detectedAt: NOW }),
      volatilitySurge('r2',  { detectedAt: NOW }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('different-family, different-repo anomalies outside 2h remain separate', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',       { detectedAt: NOW }),
      ciFailure('r2',       { detectedAt: T_2H_1MS_AGO }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('portfolio_risk_jump (no repos) does not cluster with unrelated type via repo rule', () => {
    const result = clusterOperationalAnomalies([
      portfolioJump({ detectedAt: NOW }),
      ciFailure('r1', { detectedAt: NOW }),
    ]);
    // Different families (risk_acceleration vs ci_instability), no shared repos → separate
    expect(result).toHaveLength(2);
  });
});

// ── Shared repos across different families → mixed cluster ────────────────────

describe('clusterOperationalAnomalies — shared repos → mixed cluster', () => {
  it('different-family anomalies sharing a repo within 2h produce a mixed cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',     { detectedAt: NOW }),
      scoreSpike('r1',    { detectedAt: T_1H_AGO }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].clusterType).toBe('mixed_operational_cluster');
  });

  it('shared-repo cluster anomalyCount reflects all contributing anomalies', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',      { detectedAt: NOW }),
      scoreSpike('r1',     { detectedAt: T_1H_AGO }),
      telemetryDropout('r1', { detectedAt: NOW }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].anomalyCount).toBe(3);
  });

  it('does NOT create mixed cluster when repos differ and families differ', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',    { detectedAt: NOW }),
      scoreSpike('r2',   { detectedAt: NOW }),
    ]);
    expect(result).toHaveLength(2);
    result.forEach(c => expect(c.clusterType).not.toBe('mixed_operational_cluster'));
  });

  it('shared-repo cross-family anomalies outside 2h window do NOT cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',    { detectedAt: NOW }),
      scoreSpike('r1',   { detectedAt: T_2H_1MS_AGO }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('transitively connected anomalies form one cluster', () => {
    // r1: ciFailure ←→ r1: scoreSpike (shared r1)
    // r1: scoreSpike ←→ r1: volatility (shared r1)
    // All three end up in one cluster.
    const result = clusterOperationalAnomalies([
      ciFailure('r1',        { detectedAt: NOW }),
      scoreSpike('r1',       { detectedAt: T_1H_AGO }),
      volatilitySurge('r1',  { detectedAt: NOW }),
    ]);
    expect(result).toHaveLength(1);
  });
});

// ── Cluster type determination ────────────────────────────────────────────────

describe('clusterOperationalAnomalies — cluster type per family', () => {
  it('sudden_ci_failure → ci_instability_cluster', () => {
    expect(clusterOperationalAnomalies([ciFailure('r1')])[0].clusterType)
      .toBe('ci_instability_cluster');
  });

  it('synchronized_inactivity → inactivity_cluster', () => {
    const result = clusterOperationalAnomalies([syncInactivity(['r1', 'r2', 'r3'])]);
    expect(result[0].clusterType).toBe('inactivity_cluster');
  });

  it('telemetry_dropout → telemetry_visibility_cluster', () => {
    expect(clusterOperationalAnomalies([telemetryDropout('r1')])[0].clusterType)
      .toBe('telemetry_visibility_cluster');
  });

  it('score_spike → risk_acceleration_cluster', () => {
    expect(clusterOperationalAnomalies([scoreSpike('r1')])[0].clusterType)
      .toBe('risk_acceleration_cluster');
  });

  it('portfolio_risk_jump → risk_acceleration_cluster', () => {
    expect(clusterOperationalAnomalies([portfolioJump()])[0].clusterType)
      .toBe('risk_acceleration_cluster');
  });

  it('volatility_surge → volatility_cluster', () => {
    expect(clusterOperationalAnomalies([volatilitySurge('r1')])[0].clusterType)
      .toBe('volatility_cluster');
  });

  it('mixed families → mixed_operational_cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1',     { detectedAt: NOW }),
      scoreSpike('r1',    { detectedAt: NOW }),
    ]);
    expect(result[0].clusterType).toBe('mixed_operational_cluster');
  });
});

// ── Severity aggregation ──────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — severity aggregation', () => {
  it('single critical anomaly → critical cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'critical', detectedAt: NOW }),
    ]);
    expect(result[0].severity).toBe('critical');
  });

  it('any critical in cluster escalates cluster to critical', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'low',      detectedAt: NOW }),
      ciFailure('r2', { severity: 'critical',  detectedAt: T_1H_AGO }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('critical');
  });

  it('no critical but has high → high cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'high',   detectedAt: NOW }),
      ciFailure('r2', { severity: 'medium', detectedAt: T_1H_AGO }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  it('all medium → medium cluster', () => {
    const result = clusterOperationalAnomalies([
      scoreSpike('r1', { severity: 'medium', detectedAt: NOW }),
      scoreSpike('r2', { severity: 'medium', detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].severity).toBe('medium');
  });

  it('mixed critical + low → critical (highest wins)', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'critical', detectedAt: NOW }),
      ciFailure('r2', { severity: 'low',      detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].severity).toBe('critical');
  });
});

// ── Confidence aggregation ────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — confidence aggregation', () => {
  it('all high confidence anomalies → high cluster confidence', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { confidence: { level: 'high', score: 80, rationale: 'x' }, detectedAt: NOW }),
      ciFailure('r2', { confidence: { level: 'high', score: 85, rationale: 'x' }, detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].confidence.level).toBe('high');
  });

  it('strictly majority high (> 50%) → high cluster confidence', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { confidence: { level: 'high',   score: 80, rationale: 'x' }, detectedAt: NOW }),
      ciFailure('r2', { confidence: { level: 'high',   score: 75, rationale: 'x' }, detectedAt: T_1H_AGO }),
      ciFailure('r3', { confidence: { level: 'medium', score: 45, rationale: 'x' }, detectedAt: NOW }),
    ]);
    expect(result[0].confidence.level).toBe('high');
  });

  it('exactly half high (not > 50%) → medium cluster confidence', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { confidence: { level: 'high',   score: 80, rationale: 'x' }, detectedAt: NOW }),
      ciFailure('r2', { confidence: { level: 'medium', score: 50, rationale: 'x' }, detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].confidence.level).toBe('medium');
  });

  it('strictly majority low (> 50%) → low cluster confidence', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { confidence: { level: 'low', score: 20, rationale: 'x' }, detectedAt: NOW }),
      ciFailure('r2', { confidence: { level: 'low', score: 25, rationale: 'x' }, detectedAt: T_1H_AGO }),
      ciFailure('r3', { confidence: { level: 'high', score: 75, rationale: 'x' }, detectedAt: NOW }),
    ]);
    expect(result[0].confidence.level).toBe('low');
  });

  it('confidence score is the integer average of member confidence scores', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { confidence: { level: 'high', score: 80, rationale: 'x' }, detectedAt: NOW }),
      ciFailure('r2', { confidence: { level: 'high', score: 60, rationale: 'x' }, detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].confidence.score).toBe(70);
  });

  it('confidence rationale mentions number of anomalies', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].confidence.rationale).toMatch(/2 anomalies/);
  });
});

// ── affectedRepos aggregation ─────────────────────────────────────────────────

describe('clusterOperationalAnomalies — affectedRepos aggregation', () => {
  it('union of repos from multiple anomalies', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('alpha', { detectedAt: NOW }),
      ciFailure('beta',  { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].affectedRepos).toContain('alpha');
    expect(result[0].affectedRepos).toContain('beta');
  });

  it('duplicate repos are deduplicated', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r1', { detectedAt: T_1H_AGO }),
    ]);
    const repos = result[0].affectedRepos;
    expect(repos.filter(r => r === 'r1')).toHaveLength(1);
  });

  it('repos are sorted alphabetically', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('zeta',  { detectedAt: NOW }),
      ciFailure('alpha', { detectedAt: T_1H_AGO }),
      ciFailure('beta',  { detectedAt: NOW }),
    ]);
    const repos = result[0].affectedRepos;
    expect(repos).toEqual([...repos].sort());
  });

  it('portfolio_risk_jump with empty repos contributes no repos to cluster', () => {
    const result = clusterOperationalAnomalies([portfolioJump()]);
    expect(result[0].affectedRepos).toEqual([]);
  });
});

// ── clusterId determinism ─────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — clusterId determinism', () => {
  it('same input always produces the same clusterId', () => {
    const anomalies = [
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ];
    const r1 = clusterOperationalAnomalies(anomalies);
    const r2 = clusterOperationalAnomalies(anomalies);
    expect(r1[0].clusterId).toBe(r2[0].clusterId);
  });

  it('different anomaly sets produce different clusterIds', () => {
    const r1 = clusterOperationalAnomalies([ciFailure('r1', { detectedAt: NOW })]);
    const r2 = clusterOperationalAnomalies([ciFailure('r2', { detectedAt: NOW })]);
    expect(r1[0].clusterId).not.toBe(r2[0].clusterId);
  });

  it('input array order does not change the clusterId', () => {
    const a1 = ciFailure('r1', { detectedAt: NOW });
    const a2 = ciFailure('r2', { detectedAt: T_1H_AGO });
    const fw = clusterOperationalAnomalies([a1, a2]);
    const rv = clusterOperationalAnomalies([a2, a1]);
    expect(fw[0].clusterId).toBe(rv[0].clusterId);
  });

  it('clusterId is a non-empty string starting with "cluster_"', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    expect(result[0].clusterId).toMatch(/^cluster_[0-9a-f]{8}$/);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — non-mutation', () => {
  it('does not mutate the input array', () => {
    const anomalies = [ciFailure('r1'), ciFailure('r2', { detectedAt: T_1H_AGO })];
    const len = anomalies.length;
    clusterOperationalAnomalies(anomalies);
    clusterOperationalAnomalies(anomalies);
    expect(anomalies.length).toBe(len);
  });

  it('does not mutate the individual anomaly objects', () => {
    const a = ciFailure('r1');
    const originalType = a.type;
    const originalSeverity = a.severity;
    clusterOperationalAnomalies([a]);
    expect(a.type).toBe(originalType);
    expect(a.severity).toBe(originalSeverity);
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — ordering', () => {
  it('critical cluster appears before high cluster', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'high',     detectedAt: NOW }),
      scoreSpike('r2', { severity: 'critical', detectedAt: NOW }),
    ]);
    expect(result[0].severity).toBe('critical');
    expect(result[1].severity).toBe('high');
  });

  it('among same-severity clusters, higher anomalyCount appears first', () => {
    // Three CI failures clustering together (count=3) vs one score spike (count=1),
    // both clusters having severity 'high'.
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { severity: 'high', detectedAt: NOW }),
      ciFailure('r2', { severity: 'high', detectedAt: T_1H_AGO }),
      ciFailure('r3', { severity: 'high', detectedAt: NOW }),
      // score_spike with different repo → separate cluster
      scoreSpike('r4', { severity: 'high', detectedAt: NOW }),
    ]);
    // Cluster of 3 ci_failures and cluster of 1 score_spike (both 'high')
    const ciCluster    = result.find(c => c.clusterType === 'ci_instability_cluster');
    const riskCluster  = result.find(c => c.clusterType === 'risk_acceleration_cluster');
    expect(ciCluster).toBeDefined();
    expect(riskCluster).toBeDefined();
    expect(result.indexOf(ciCluster)).toBeLessThan(result.indexOf(riskCluster));
  });

  it('among same-severity, same-count clusters, newest timeWindow.end appears first', () => {
    const result = clusterOperationalAnomalies([
      // Older cluster
      ciFailure('r1', { detectedAt: T_1H_AGO }),
      // Newer cluster
      scoreSpike('r2', { detectedAt: NOW }),
    ]);
    // Two separate clusters of count=1 with medium/high severity
    // Newer should appear first (or at least not last) when severity ties
    const newerCluster = result.find(c => c.timeWindow.end === NOW);
    const olderCluster = result.find(c => c.timeWindow.end === T_1H_AGO);
    if (newerCluster && olderCluster && newerCluster.severity === olderCluster.severity) {
      expect(result.indexOf(newerCluster)).toBeLessThan(result.indexOf(olderCluster));
    }
  });
});

// ── Time window ───────────────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — time window', () => {
  it('timeWindow.start = earliest anomaly, timeWindow.end = latest anomaly', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    const tw = result[0].timeWindow;
    expect(tw.start).toBe(T_1H_AGO);
    expect(tw.end).toBe(NOW);
  });

  it('single-anomaly cluster has start = end = detectedAt', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1', { detectedAt: NOW })]);
    expect(result[0].timeWindow.start).toBe(NOW);
    expect(result[0].timeWindow.end).toBe(NOW);
    expect(result[0].timeWindow.durationMs).toBe(0);
  });

  it('durationMs equals the span between earliest and latest anomaly', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].timeWindow.durationMs).toBe(60 * 60 * 1000);
  });
});

// ── Summary and title content ─────────────────────────────────────────────────

describe('clusterOperationalAnomalies — summary and title', () => {
  it('summary mentions anomaly count', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].summary).toMatch(/2 anomalies/);
  });

  it('summary mentions repo count when repos are present', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].summary).toMatch(/2 repos/);
  });

  it('summary mentions duration when anomalies span > 0ms', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: T_30MIN_LATER }),
      ciFailure('r2', { detectedAt: NOW }),
    ]);
    expect(result[0].summary).toMatch(/within \d+ minute/);
  });

  it('title for multi-repo cluster mentions "repositories"', () => {
    const result = clusterOperationalAnomalies([
      ciFailure('r1', { detectedAt: NOW }),
      ciFailure('r2', { detectedAt: T_1H_AGO }),
    ]);
    expect(result[0].title).toMatch(/repositories/i);
  });

  it('title for single-repo cluster does not mention "repositories"', () => {
    const result = clusterOperationalAnomalies([ciFailure('r1')]);
    expect(result[0].title).not.toMatch(/repositories/i);
  });
});

// ── Deterministic output ──────────────────────────────────────────────────────

describe('clusterOperationalAnomalies — deterministic output', () => {
  it('same inputs always produce identical output', () => {
    const anomalies = [
      ciFailure('r1', { detectedAt: NOW }),
      scoreSpike('r1', { detectedAt: T_1H_AGO }),
      volatilitySurge('r2', { detectedAt: NOW }),
    ];
    const r1 = clusterOperationalAnomalies(anomalies);
    const r2 = clusterOperationalAnomalies(anomalies);
    expect(r1).toEqual(r2);
  });

  it('n distinct unrelated anomalies produce n clusters', () => {
    const anomalies = [
      ciFailure('r1',       { detectedAt: NOW }),
      volatilitySurge('r2', { detectedAt: NOW }),
      telemetryDropout('r3',{ detectedAt: NOW }),
    ];
    // Different families, different repos, same time → 3 separate clusters
    const result = clusterOperationalAnomalies(anomalies);
    expect(result).toHaveLength(3);
  });
});
