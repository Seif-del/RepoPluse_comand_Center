'use strict';

const { detectOperationalAnomalies } = require('../../../../execution/risk/detectOperationalAnomalies');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = '2026-05-19T12:00:00.000Z';

function makeRisk(score, snapshotAt) {
  snapshotAt = snapshotAt || NOW;
  var label = score >= 75 ? 'critical' : score >= 50 ? 'at-risk' : score >= 30 ? 'monitor' : 'healthy';
  return { score, label, snapshotAt };
}

function makeMetrics(opts) {
  opts = opts || {};
  return {
    ciStatus:          opts.ciStatus          !== undefined ? opts.ciStatus          : 'passing',
    releaseStatus:     opts.releaseStatus      !== undefined ? opts.releaseStatus     : 'healthy',
    contributorStatus: opts.contributorStatus  !== undefined ? opts.contributorStatus : 'healthy',
    snapshotAt:        opts.snapshotAt         || NOW,
  };
}

function makePortfolioSnap(score, repoCount) {
  return { portfolioScore: score, repoCount: repoCount != null ? repoCount : 5, snapshotAt: NOW };
}

function makeRepo(id, opts) {
  opts = opts || {};
  return {
    repoId:         id,
    repoName:       id,
    riskHistory:    opts.riskHistory    || [],
    metricsHistory: opts.metricsHistory || [],
  };
}

// Builds a risk history array newest-first. scores[0] = current, scores[1] = previous, etc.
function riskHistory(scores) {
  return scores.map(function(s, i) {
    return makeRisk(s, '2026-05-' + String(19 - i).padStart(2, '0') + 'T12:00:00.000Z');
  });
}

// Builds a metrics history array newest-first.
function metricsHistory(items) {
  return items.map(function(it, i) {
    return makeMetrics(Object.assign({}, it, {
      snapshotAt: '2026-05-' + String(19 - i).padStart(2, '0') + 'T12:00:00.000Z',
    }));
  });
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — guard conditions', () => {
  it('returns empty array when called with no arguments', () => {
    expect(detectOperationalAnomalies()).toEqual([]);
  });

  it('returns empty array for empty repos and no portfolio history', () => {
    expect(detectOperationalAnomalies({ repos: [], portfolioHistory: [] })).toEqual([]);
  });

  it('returns empty array for null repos and undefined portfolioHistory', () => {
    expect(detectOperationalAnomalies({ repos: null })).toEqual([]);
  });

  it('returns an array (never throws) for malformed repo objects', () => {
    const result = detectOperationalAnomalies({
      repos: [{ repoId: 'x' }, null, undefined, {}],
      detectedAt: NOW,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it('uses injected detectedAt timestamp for all anomalies', () => {
    const repos = [makeRepo('r1', {
      riskHistory:    riskHistory([80, 20, 20, 20, 20, 20]),
      metricsHistory: metricsHistory([{}, {}, {}, {}, {}, {}]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    result.forEach(function(a) {
      expect(a.detectedAt).toBe(NOW);
    });
  });
});

// ── Output shape ──────────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — output shape', () => {
  it('every anomaly has all required keys', () => {
    const repos = [makeRepo('r1', {
      riskHistory:    riskHistory([80, 20, 20, 20, 20]),
      metricsHistory: metricsHistory([{}, {}, {}, {}, {}]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.length).toBeGreaterThan(0);
    result.forEach(function(a) {
      expect(a).toHaveProperty('type');
      expect(a).toHaveProperty('severity');
      expect(a).toHaveProperty('title');
      expect(a).toHaveProperty('summary');
      expect(a).toHaveProperty('affectedRepos');
      expect(a).toHaveProperty('detectedAt');
      expect(a).toHaveProperty('confidence');
      expect(a).toHaveProperty('supportingMetrics');
    });
  });

  it('confidence object has level, score, and rationale', () => {
    const repos = [makeRepo('r1', {
      riskHistory:    riskHistory([80, 20, 20, 20, 20]),
      metricsHistory: metricsHistory([{}, {}, {}, {}, {}]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    result.forEach(function(a) {
      expect(a.confidence).toHaveProperty('level');
      expect(a.confidence).toHaveProperty('score');
      expect(a.confidence).toHaveProperty('rationale');
      expect(['low', 'medium', 'high']).toContain(a.confidence.level);
      expect(a.confidence.score).toBeGreaterThanOrEqual(0);
      expect(a.confidence.score).toBeLessThanOrEqual(100);
    });
  });

  it('severity is always one of low | medium | high | critical', () => {
    const repos = [
      makeRepo('r1', { riskHistory: riskHistory([80, 20, 20, 20, 20, 20]) }),
      makeRepo('r2', { riskHistory: riskHistory([50, 20, 20, 20]) }),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    result.forEach(function(a) {
      expect(['low', 'medium', 'high', 'critical']).toContain(a.severity);
    });
  });

  it('affectedRepos is always an array', () => {
    const ph = [makePortfolioSnap(80, 5), makePortfolioSnap(20, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    result.forEach(function(a) {
      expect(Array.isArray(a.affectedRepos)).toBe(true);
    });
  });
});

// ── score_spike ───────────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — score_spike', () => {
  it('detects score_spike when current score exceeds rolling avg by ≥ 20', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([50, 20, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'score_spike')).toBe(true);
  });

  it('score_spike delta is exactly 20 → detects', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([40, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'score_spike')).toBe(true);
  });

  it('score_spike delta is 19 → does NOT detect', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([39, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'score_spike')).toBe(false);
  });

  it('score_spike assigns critical severity when score ≥ 75 and delta ≥ 30', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([80, 40, 40, 40, 40]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike).toBeDefined();
    expect(spike.severity).toBe('critical');
  });

  it('score_spike assigns high severity when score ≥ 75 but delta < 30', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([80, 58, 58, 58]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike).toBeDefined();
    expect(spike.severity).toBe('high');
  });

  it('score_spike assigns medium severity when score < 75 and delta < 30', () => {
    // current=42, avg=20, delta=22 — above 20 threshold but below 30 high boundary
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([42, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike).toBeDefined();
    expect(spike.severity).toBe('medium');
  });

  it('score_spike does NOT detect with only 1 snapshot (no history to compare)', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([90]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'score_spike')).toBe(false);
  });

  it('score_spike supportingMetrics contains currentScore, rollingAverage, delta, historyDepth', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([60, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike.supportingMetrics).toHaveProperty('currentScore', 60);
    expect(spike.supportingMetrics).toHaveProperty('rollingAverage', 20);
    expect(spike.supportingMetrics).toHaveProperty('delta', 40);
    expect(spike.supportingMetrics).toHaveProperty('historyDepth');
  });

  it('score_spike affectedRepos contains the repo identifier', () => {
    const repos = [makeRepo('frontend', {
      riskHistory: riskHistory([60, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike.affectedRepos).toContain('frontend');
  });

  it('score_spike NOT detected when score decreases vs average', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([10, 80, 80, 80]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'score_spike')).toBe(false);
  });
});

// ── sudden_ci_failure ─────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — sudden_ci_failure', () => {
  it('detects sudden_ci_failure after a 2-snapshot passing streak', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'sudden_ci_failure')).toBe(true);
  });

  it('sudden_ci_failure with streak = 2 → severity high', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'sudden_ci_failure');
    expect(anomaly.severity).toBe('high');
  });

  it('sudden_ci_failure with streak ≥ 4 → severity critical', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'sudden_ci_failure');
    expect(anomaly.severity).toBe('critical');
  });

  it('does NOT detect when CI is already failing without prior passing streak', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'failing' },
        { ciStatus: 'failing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'sudden_ci_failure')).toBe(false);
  });

  it('does NOT detect when passing streak is only 1 (below threshold)', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'failing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'sudden_ci_failure')).toBe(false);
  });

  it('does NOT detect when current CI is passing (no failure)', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'sudden_ci_failure')).toBe(false);
  });

  it('does NOT detect with only 1 metrics snapshot', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([{ ciStatus: 'failing' }]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'sudden_ci_failure')).toBe(false);
  });

  it('sudden_ci_failure supportingMetrics contains stablePassingStreak', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'sudden_ci_failure');
    expect(anomaly.supportingMetrics.stablePassingStreak).toBe(3);
    expect(anomaly.supportingMetrics.currentCiStatus).toBe('failing');
  });
});

// ── synchronized_inactivity ───────────────────────────────────────────────────

describe('detectOperationalAnomalies — synchronized_inactivity', () => {
  function makeInactiveRepo(id) {
    return makeRepo(id, {
      metricsHistory: metricsHistory([
        { contributorStatus: 'low_activity' },
        { contributorStatus: 'healthy' },
      ]),
    });
  }

  it('detects synchronized_inactivity when 3 repos transition to low_activity', () => {
    const repos = [
      makeInactiveRepo('r1'),
      makeInactiveRepo('r2'),
      makeInactiveRepo('r3'),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'synchronized_inactivity')).toBe(true);
  });

  it('does NOT detect when only 2 repos transition to inactivity (below threshold)', () => {
    const repos = [
      makeInactiveRepo('r1'),
      makeInactiveRepo('r2'),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'synchronized_inactivity')).toBe(false);
  });

  it('does NOT count repos already in long-standing inactivity (no transition)', () => {
    const repos = [
      makeRepo('r1', {
        metricsHistory: metricsHistory([
          { contributorStatus: 'low_activity' },
          { contributorStatus: 'low_activity' }, // already inactive — not a transition
        ]),
      }),
      makeRepo('r2', {
        metricsHistory: metricsHistory([
          { contributorStatus: 'low_activity' },
          { contributorStatus: 'low_activity' },
        ]),
      }),
      makeRepo('r3', {
        metricsHistory: metricsHistory([
          { contributorStatus: 'low_activity' },
          { contributorStatus: 'low_activity' },
        ]),
      }),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'synchronized_inactivity')).toBe(false);
  });

  it('synchronized_inactivity with 3 repos → severity medium', () => {
    const repos = [makeInactiveRepo('r1'), makeInactiveRepo('r2'), makeInactiveRepo('r3')];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'synchronized_inactivity');
    expect(anomaly.severity).toBe('medium');
  });

  it('synchronized_inactivity with 4 repos → severity high', () => {
    const repos = [
      makeInactiveRepo('r1'), makeInactiveRepo('r2'),
      makeInactiveRepo('r3'), makeInactiveRepo('r4'),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'synchronized_inactivity');
    expect(anomaly.severity).toBe('high');
  });

  it('synchronized_inactivity with 6 repos → severity critical', () => {
    const repos = [
      makeInactiveRepo('r1'), makeInactiveRepo('r2'), makeInactiveRepo('r3'),
      makeInactiveRepo('r4'), makeInactiveRepo('r5'), makeInactiveRepo('r6'),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'synchronized_inactivity');
    expect(anomaly.severity).toBe('critical');
  });

  it('synchronized_inactivity affectedRepos lists all inactive repo IDs', () => {
    const repos = [makeInactiveRepo('alpha'), makeInactiveRepo('beta'), makeInactiveRepo('gamma')];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'synchronized_inactivity');
    expect(anomaly.affectedRepos).toContain('alpha');
    expect(anomaly.affectedRepos).toContain('beta');
    expect(anomaly.affectedRepos).toContain('gamma');
  });

  it('repos without metrics history are skipped and do not inflate count', () => {
    const repos = [
      makeInactiveRepo('r1'),
      makeInactiveRepo('r2'),
      makeRepo('r3', { metricsHistory: [] }),  // no history — skipped
      makeRepo('r4', { metricsHistory: [] }),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'synchronized_inactivity')).toBe(false);
  });
});

// ── volatility_surge ──────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — volatility_surge', () => {
  // Recent window (indices 0-3): high oscillations; historical (indices 3+): stable.
  function surgeRepo(id) {
    return makeRepo(id, {
      // scores newest-first: recent = [90,20,85,20], historical = [20,20,20,20]
      riskHistory: riskHistory([90, 20, 85, 20, 20, 20, 20]),
    });
  }

  it('detects volatility_surge when recent oscillations exceed stable historical baseline', () => {
    const result = detectOperationalAnomalies({ repos: [surgeRepo('r1')], detectedAt: NOW });
    expect(result.some(a => a.type === 'volatility_surge')).toBe(true);
  });

  it('volatility_surge assigns medium severity for 2 recent oscillations', () => {
    // pair(0,1): |20-25|=5 < 10 (no osc), pair(1,2): |25-70|=45≥10, pair(2,3): |70-20|=50≥10 → 2 osc
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([20, 25, 70, 20, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'volatility_surge');
    expect(anomaly).toBeDefined();
    expect(anomaly.severity).toBe('medium');
  });

  it('volatility_surge assigns high severity for 3 recent oscillations', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([90, 20, 85, 20, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'volatility_surge');
    expect(anomaly.severity).toBe('high');
  });

  it('does NOT detect when historical baseline is already volatile (no surge)', () => {
    // Both recent and historical have oscillations at similar rates
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([10, 20, 10, 20, 10, 20, 10, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'volatility_surge')).toBe(false);
  });

  it('does NOT detect when recent oscillations are fewer than min threshold', () => {
    // Only 1 oscillation in recent window
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([30, 20, 20, 20, 20, 20, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'volatility_surge')).toBe(false);
  });

  it('does NOT detect with fewer than 5 snapshots (insufficient history)', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([90, 20, 85, 20]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'volatility_surge')).toBe(false);
  });

  it('volatility_surge supportingMetrics includes recentOscillations and historyDepth', () => {
    const result = detectOperationalAnomalies({ repos: [surgeRepo('r1')], detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'volatility_surge');
    expect(anomaly.supportingMetrics).toHaveProperty('recentOscillations');
    expect(anomaly.supportingMetrics).toHaveProperty('historicalOscillations');
    expect(anomaly.supportingMetrics).toHaveProperty('historyDepth');
    expect(anomaly.supportingMetrics.recentOscillations).toBeGreaterThanOrEqual(2);
  });
});

// ── telemetry_dropout ─────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — telemetry_dropout', () => {
  it('detects telemetry_dropout when 3 fields become unknown after stable telemetry', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'telemetry_dropout')).toBe(true);
  });

  it('detects telemetry_dropout when 2 fields become unknown (delta = 2)', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'telemetry_dropout')).toBe(true);
  });

  it('does NOT detect when only 1 field becomes unknown (delta < threshold)', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'telemetry_dropout')).toBe(false);
  });

  it('does NOT detect when telemetry was already missing historically', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'telemetry_dropout')).toBe(false);
  });

  it('telemetry_dropout assigns high severity when all 3 fields become unknown', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'telemetry_dropout');
    expect(anomaly.severity).toBe('high');
  });

  it('telemetry_dropout assigns medium severity when 2 fields become unknown', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'healthy' },
        { ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'telemetry_dropout');
    expect(anomaly.severity).toBe('medium');
  });

  it('does NOT detect with only 1 metrics snapshot', () => {
    const repos = [makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      ]),
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(result.some(a => a.type === 'telemetry_dropout')).toBe(false);
  });
});

// ── portfolio_risk_jump ───────────────────────────────────────────────────────

describe('detectOperationalAnomalies — portfolio_risk_jump', () => {
  it('detects portfolio_risk_jump when delta ≥ 15', () => {
    const ph = [makePortfolioSnap(55, 5), makePortfolioSnap(35, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    expect(result.some(a => a.type === 'portfolio_risk_jump')).toBe(true);
  });

  it('delta = 15 exactly → detects', () => {
    const ph = [makePortfolioSnap(50, 5), makePortfolioSnap(35, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    expect(result.some(a => a.type === 'portfolio_risk_jump')).toBe(true);
  });

  it('delta = 14 → does NOT detect', () => {
    const ph = [makePortfolioSnap(49, 5), makePortfolioSnap(35, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    expect(result.some(a => a.type === 'portfolio_risk_jump')).toBe(false);
  });

  it('portfolio_risk_jump assigns critical when score ≥ 75 and delta ≥ 25', () => {
    const ph = [makePortfolioSnap(80, 5), makePortfolioSnap(50, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'portfolio_risk_jump');
    expect(anomaly.severity).toBe('critical');
  });

  it('portfolio_risk_jump assigns high when score ≥ 50 but not critical', () => {
    const ph = [makePortfolioSnap(65, 5), makePortfolioSnap(40, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'portfolio_risk_jump');
    expect(anomaly.severity).toBe('high');
  });

  it('portfolio_risk_jump assigns medium when below high thresholds', () => {
    const ph = [makePortfolioSnap(45, 5), makePortfolioSnap(30, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'portfolio_risk_jump');
    expect(anomaly.severity).toBe('medium');
  });

  it('does NOT detect with only 1 portfolio snapshot (no comparison possible)', () => {
    const ph = [makePortfolioSnap(90, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    expect(result.some(a => a.type === 'portfolio_risk_jump')).toBe(false);
  });

  it('portfolio_risk_jump affectedRepos is empty (portfolio-level anomaly)', () => {
    const ph = [makePortfolioSnap(80, 5), makePortfolioSnap(50, 5)];
    const result = detectOperationalAnomalies({ portfolioHistory: ph, detectedAt: NOW });
    const anomaly = result.find(a => a.type === 'portfolio_risk_jump');
    expect(anomaly.affectedRepos).toEqual([]);
  });
});

// ── Simultaneous anomalies ────────────────────────────────────────────────────

describe('detectOperationalAnomalies — simultaneous anomalies', () => {
  it('detects multiple anomaly types in a single call', () => {
    const repos = [
      // score_spike
      makeRepo('r1', { riskHistory: riskHistory([80, 20, 20, 20]) }),
      // sudden_ci_failure
      makeRepo('r2', {
        metricsHistory: metricsHistory([
          { ciStatus: 'failing' },
          { ciStatus: 'passing' },
          { ciStatus: 'passing' },
        ]),
      }),
    ];
    const ph = [makePortfolioSnap(80, 5), makePortfolioSnap(50, 5)];
    const result = detectOperationalAnomalies({ repos, portfolioHistory: ph, detectedAt: NOW });
    const types = result.map(a => a.type);
    expect(types).toContain('score_spike');
    expect(types).toContain('sudden_ci_failure');
    expect(types).toContain('portfolio_risk_jump');
  });

  it('each anomaly is independent even when same repo triggers multiple detectors', () => {
    // A repo that has BOTH a score spike AND a sudden CI failure
    const repo = makeRepo('r1', {
      riskHistory:    riskHistory([80, 20, 20, 20]),
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' },
        { ciStatus: 'passing' },
      ]),
    });
    const result = detectOperationalAnomalies({ repos: [repo], detectedAt: NOW });
    const types = result.map(a => a.type);
    expect(types).toContain('score_spike');
    expect(types).toContain('sudden_ci_failure');
  });

  it('no anomalies emitted when all repos are stable and below all thresholds', () => {
    const repos = [
      makeRepo('r1', {
        riskHistory:    riskHistory([25, 20, 22, 21, 23]),
        metricsHistory: metricsHistory([{}, {}, {}, {}, {}]),
      }),
      makeRepo('r2', {
        riskHistory:    riskHistory([30, 28, 29, 27, 30]),
        metricsHistory: metricsHistory([{}, {}, {}, {}, {}]),
      }),
    ];
    const ph = [makePortfolioSnap(27, 2), makePortfolioSnap(25, 2)];
    const result = detectOperationalAnomalies({ repos, portfolioHistory: ph, detectedAt: NOW });
    expect(result).toEqual([]);
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('detectOperationalAnomalies — ordering', () => {
  it('critical anomalies appear before high anomalies', () => {
    const repos = [
      // critical spike (score 80, delta 60)
      makeRepo('r1', { riskHistory: riskHistory([80, 20, 20, 20, 20]) }),
      // high sudden_ci_failure (streak 2)
      makeRepo('r2', {
        metricsHistory: metricsHistory([
          { ciStatus: 'failing' },
          { ciStatus: 'passing' },
          { ciStatus: 'passing' },
        ]),
      }),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const critIdx = result.findIndex(a => a.severity === 'critical');
    const highIdx = result.findIndex(a => a.severity === 'high');
    if (critIdx !== -1 && highIdx !== -1) {
      expect(critIdx).toBeLessThan(highIdx);
    }
  });

  it('among anomalies of equal severity, higher confidence.score appears first', () => {
    // Two score spikes: one with 5 prior snapshots (higher confidence), one with 1 (lower)
    const repos = [
      makeRepo('r1', { riskHistory: riskHistory([60, 20, 20]) }),           // 2 prior snaps
      makeRepo('r2', { riskHistory: riskHistory([60, 20, 20, 20, 20, 20]) }), // 5 prior snaps
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spikes = result.filter(a => a.type === 'score_spike');
    expect(spikes.length).toBe(2);
    expect(spikes[0].confidence.score).toBeGreaterThanOrEqual(spikes[1].confidence.score);
  });

  it('returns a stable sort (no crashes) when all anomalies have the same severity and confidence', () => {
    const makeSpike = function(id) {
      return makeRepo(id, { riskHistory: riskHistory([60, 20, 20, 20]) });
    };
    const repos = [makeSpike('r1'), makeSpike('r2'), makeSpike('r3')];
    const r1 = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const r2 = detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(r1.map(a => a.affectedRepos[0])).toEqual(r2.map(a => a.affectedRepos[0]));
  });
});

// ── Confidence calibration ────────────────────────────────────────────────────

describe('detectOperationalAnomalies — confidence calibration', () => {
  it('score_spike with 5 prior snapshots has higher confidence than with 1', () => {
    const repoShallow = makeRepo('r1', {
      riskHistory: riskHistory([60, 20, 20]),        // 2 prior
    });
    const repoDeep = makeRepo('r2', {
      riskHistory: riskHistory([60, 20, 20, 20, 20, 20]), // 5 prior
    });
    const r1 = detectOperationalAnomalies({ repos: [repoShallow], detectedAt: NOW });
    const r2 = detectOperationalAnomalies({ repos: [repoDeep],    detectedAt: NOW });
    const s1 = r1.find(a => a.type === 'score_spike');
    const s2 = r2.find(a => a.type === 'score_spike');
    expect(s2.confidence.score).toBeGreaterThan(s1.confidence.score);
  });

  it('confidence level is one of low | medium | high for every anomaly', () => {
    const repos = [
      makeRepo('r1', { riskHistory: riskHistory([60, 20, 20]) }),
    ];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    result.forEach(function(a) {
      expect(['low', 'medium', 'high']).toContain(a.confidence.level);
    });
  });

  it('score_spike detected with only 1 prior snapshot has low confidence (sparse history cap)', () => {
    const repos = [makeRepo('r1', {
      riskHistory: riskHistory([60, 20]),   // current=60, 1 prior=20, delta=40 ≥ 20
    })];
    const result = detectOperationalAnomalies({ repos, detectedAt: NOW });
    const spike = result.find(a => a.type === 'score_spike');
    expect(spike).toBeDefined();
    expect(spike.confidence.level).toBe('low');
    expect(spike.confidence.score).toBeLessThanOrEqual(30);
  });

  it('sudden_ci_failure with a long passing streak earns higher confidence than minimum streak', () => {
    const repoMin = makeRepo('r1', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' }, { ciStatus: 'passing' }, { ciStatus: 'passing' },
      ]),
    });
    const repoBig = makeRepo('r2', {
      metricsHistory: metricsHistory([
        { ciStatus: 'failing' },
        { ciStatus: 'passing' }, { ciStatus: 'passing' }, { ciStatus: 'passing' },
        { ciStatus: 'passing' }, { ciStatus: 'passing' },
      ]),
    });
    const r1 = detectOperationalAnomalies({ repos: [repoMin], detectedAt: NOW });
    const r2 = detectOperationalAnomalies({ repos: [repoBig], detectedAt: NOW });
    const a1 = r1.find(a => a.type === 'sudden_ci_failure');
    const a2 = r2.find(a => a.type === 'sudden_ci_failure');
    expect(a2.confidence.score).toBeGreaterThan(a1.confidence.score);
  });
});

// ── Deterministic output ──────────────────────────────────────────────────────

describe('detectOperationalAnomalies — deterministic output', () => {
  it('same inputs always produce the same output', () => {
    const repos = [
      makeRepo('r1', { riskHistory: riskHistory([80, 20, 20, 20, 20]) }),
      makeRepo('r2', {
        metricsHistory: metricsHistory([
          { ciStatus: 'failing' }, { ciStatus: 'passing' }, { ciStatus: 'passing' },
        ]),
      }),
    ];
    const input = { repos, detectedAt: NOW };
    const r1 = detectOperationalAnomalies(input);
    const r2 = detectOperationalAnomalies(input);
    expect(r1).toEqual(r2);
  });

  it('calling twice does not mutate the input repos array', () => {
    const repos = [makeRepo('r1', { riskHistory: riskHistory([80, 20, 20, 20]) })];
    const len = repos.length;
    detectOperationalAnomalies({ repos, detectedAt: NOW });
    detectOperationalAnomalies({ repos, detectedAt: NOW });
    expect(repos.length).toBe(len);
  });

  it('different repo counts for similar spikes produce proportionally different outputs', () => {
    const makeSpike = function(id) {
      return makeRepo(id, { riskHistory: riskHistory([60, 20, 20, 20]) });
    };
    const r1 = detectOperationalAnomalies({ repos: [makeSpike('a')],                  detectedAt: NOW });
    const r2 = detectOperationalAnomalies({ repos: [makeSpike('a'), makeSpike('b')], detectedAt: NOW });
    expect(r2.filter(a => a.type === 'score_spike').length)
      .toBeGreaterThan(r1.filter(a => a.type === 'score_spike').length);
  });
});

// ── Telemetry gap impact on confidence ────────────────────────────────────────

describe('detectOperationalAnomalies — telemetry gaps affect confidence', () => {
  it('score_spike with full telemetry history has higher confidence than with unknown telemetry', () => {
    const spikeFull = makeRepo('r1', {
      riskHistory:    riskHistory([60, 20, 20, 20, 20, 20]),
      metricsHistory: metricsHistory([{}, {}, {}, {}, {}, {}]),
    });
    const spikeEmpty = makeRepo('r2', {
      riskHistory:    riskHistory([60, 20, 20, 20, 20, 20]),
      metricsHistory: metricsHistory([
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
        { ciStatus: 'unknown', releaseStatus: 'unknown', contributorStatus: 'unknown' },
      ]),
    });
    const r1 = detectOperationalAnomalies({ repos: [spikeFull],  detectedAt: NOW });
    const r2 = detectOperationalAnomalies({ repos: [spikeEmpty], detectedAt: NOW });
    const a1 = r1.find(a => a.type === 'score_spike');
    const a2 = r2.find(a => a.type === 'score_spike');
    expect(a1.confidence.score).toBeGreaterThan(a2.confidence.score);
  });
});
