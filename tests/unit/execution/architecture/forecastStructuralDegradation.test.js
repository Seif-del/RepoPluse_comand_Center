'use strict';

const { forecastStructuralDegradation } = require('../../../../execution/architecture/forecastStructuralDegradation');

// ── Factories ──────────────────────────────────────────────────────────────────

function minTD(scores, opts) {
  opts = opts || {};
  const scoreTimeline = scores.map(function(score, i) {
    return {
      score,
      snapshotAt: '2024-01-' + String(i + 1).padStart(2, '0') + 'T00:00:00Z',
      level: score >= 70 ? 'healthy' : score >= 55 ? 'watch' : score >= 35 ? 'weak' : 'risky',
      deltaFromPrevious: i > 0 ? score - scores[i - 1] : null,
    };
  });
  return {
    scoreTimeline,
    driftEvents:           opts.driftEvents    || [],
    levelTransitions:      opts.levelTransitions || [],
    couplingTimeline:      opts.couplingTimeline || [],
    implementationTimeline: opts.implementationTimeline || [],
    riskSignalTimeline:    opts.riskSignalTimeline || [],
    timeline:              [],
    apiIntegrationTimeline: [],
    summary:               {},
    recommendations:       [],
  };
}

function de(type, severity) {
  return {
    type,
    severity: severity || 'medium',
    summary:  type + ' detected',
    snapshotAt: '2024-01-02T00:00:00Z',
    affectedArea: 'general',
  };
}

// ── 1. Input validation ────────────────────────────────────────────────────────

describe('forecastStructuralDegradation — input validation', function() {
  it('returns unknown for null input', function() {
    expect(forecastStructuralDegradation(null).forecastLevel).toBe('unknown');
  });

  it('returns unknown for non-object input', function() {
    expect(forecastStructuralDegradation('bad').forecastLevel).toBe('unknown');
  });

  it('returns unknown when no snapshots or timelineData provided', function() {
    expect(forecastStructuralDegradation({}).forecastLevel).toBe('unknown');
  });

  it('returns unknown for single-snapshot array', function() {
    expect(forecastStructuralDegradation({ snapshots: [{}] }).forecastLevel).toBe('unknown');
  });

  it('returns unknown for empty snapshots array', function() {
    expect(forecastStructuralDegradation({ snapshots: [] }).forecastLevel).toBe('unknown');
  });

  it('returns unknown when timelineData has fewer than 2 score entries', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75]) }).forecastLevel).toBe('unknown');
  });

  it('unknown result has correct default shape', function() {
    const r = forecastStructuralDegradation(null);
    expect(r.degradationRisk).toBe(0);
    expect(r.confidenceLevel).toBe('low');
    expect(r.riskFactors).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.trajectory.interventionUrgency).toBe('none');
    expect(r.trajectory.projectedLevel).toBe('unknown');
  });
});

// ── 2. Pre-built timelineData ──────────────────────────────────────────────────

describe('forecastStructuralDegradation — pre-built timelineData', function() {
  it('accepts valid timelineData without calling buildArchitectureTrendTimeline', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).forecastLevel).not.toBe('unknown');
  });

  it('ignores snapshots array when timelineData is provided', function() {
    const td = minTD([75, 75]);
    expect(forecastStructuralDegradation({ snapshots: null, timelineData: td }).forecastLevel).not.toBe('unknown');
  });

  it('result has all expected top-level keys', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([75, 75]) });
    ['forecastLevel', 'degradationRisk', 'confidenceLevel', 'summary',
     'trajectory', 'riskFactors', 'structuralProjection', 'recommendations'].forEach(function(k) {
      expect(r).toHaveProperty(k);
    });
  });

  it('trajectory has all expected keys', function() {
    const t = forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).trajectory;
    ['scoreTrend', 'averageScoreDelta', 'projectedScore', 'projectedLevel', 'interventionUrgency'].forEach(function(k) {
      expect(t).toHaveProperty(k);
    });
  });

  it('structuralProjection has all expected keys', function() {
    const sp = forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).structuralProjection;
    ['couplingForecast', 'implementationHealthForecast', 'boundaryIntegrityForecast'].forEach(function(k) {
      expect(sp).toHaveProperty(k);
    });
  });
});

// ── 3. Stable / clean system ───────────────────────────────────────────────────

describe('forecastStructuralDegradation — stable system', function() {
  it('forecastLevel none for flat stable scores', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).forecastLevel).toBe('none');
  });

  it('degradationRisk 0 for flat stable scores', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).degradationRisk).toBe(0);
  });

  it('no riskFactors for stable system', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).riskFactors).toEqual([]);
  });

  it('scoreTrend stable for near-flat scores', function() {
    // deltas [2,-1,2], avg≈1 → stable
    expect(forecastStructuralDegradation({ timelineData: minTD([70, 72, 71, 73]) }).trajectory.scoreTrend).toBe('stable');
  });

  it('empty recommendations for stable system', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).recommendations).toEqual([]);
  });
});

// ── 4. scoreTrend classification ──────────────────────────────────────────────

describe('forecastStructuralDegradation — scoreTrend', function() {
  it('improving when averageDelta >= 5', function() {
    // deltas [5,5], avg=5 → improving
    expect(forecastStructuralDegradation({ timelineData: minTD([60, 65, 70]) }).trajectory.scoreTrend).toBe('improving');
  });

  it('stable when averageDelta between -5 and 5', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([70, 72, 71, 73]) }).trajectory.scoreTrend).toBe('stable');
  });

  it('degrading when averageDelta <= -5 without volatility', function() {
    // deltas [-5,-5], avg=-5, variance=0, maxDrop=-5 → degrading
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75, 70]) }).trajectory.scoreTrend).toBe('degrading');
  });

  it('volatile when variance >= 100 and maxDrop <= -20', function() {
    // deltas [25,-25], avg=0, variance=625, maxDrop=-25
    expect(forecastStructuralDegradation({ timelineData: minTD([60, 85, 60]) }).trajectory.scoreTrend).toBe('volatile');
  });

  it('improving takes priority over volatile', function() {
    // deltas [30,-20,25], avg≈11.67 >= 5 → improving
    expect(forecastStructuralDegradation({ timelineData: minTD([50, 80, 60, 85]) }).trajectory.scoreTrend).toBe('improving');
  });

  it('volatile takes priority over degrading when both criteria met', function() {
    // deltas [-25,25,-25], avg≈-8.33 <= -5 BUT variance≈555 >= 100 AND maxDrop=-25 → volatile
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 55, 80, 55]) }).trajectory.scoreTrend).toBe('volatile');
  });
});

// ── 5. averageScoreDelta and projectedScore ────────────────────────────────────

describe('forecastStructuralDegradation — averageScoreDelta & projectedScore', function() {
  it('averageScoreDelta rounded to 1 decimal', function() {
    // deltas [-5,-5], avg=-5.0
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75, 70]) }).trajectory.averageScoreDelta).toBe(-5);
  });

  it('averageScoreDelta handles non-integer average', function() {
    // deltas [-5,-4], avg=-4.5
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75, 71]) }).trajectory.averageScoreDelta).toBe(-4.5);
  });

  it('projectedScore clamped to minimum 0', function() {
    // latestScore=5, avg=-5 → 0
    expect(forecastStructuralDegradation({ timelineData: minTD([10, 5]) }).trajectory.projectedScore).toBe(0);
  });

  it('projectedScore clamped to maximum 100', function() {
    // latestScore=100, avg=5 → 100
    expect(forecastStructuralDegradation({ timelineData: minTD([95, 100]) }).trajectory.projectedScore).toBe(100);
  });
});

// ── 6. projectedLevel mapping ─────────────────────────────────────────────────

describe('forecastStructuralDegradation — projectedLevel', function() {
  it('healthy when projectedScore >= 70', function() {
    // latestScore=75, avg=0 → projected=75 → healthy
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).trajectory.projectedLevel).toBe('healthy');
  });

  it('watch when projectedScore 55-69', function() {
    // latestScore=65, avg=0 → projected=65 → watch
    expect(forecastStructuralDegradation({ timelineData: minTD([65, 65]) }).trajectory.projectedLevel).toBe('watch');
  });

  it('weak when projectedScore 35-54', function() {
    // latestScore=45, avg=0 → projected=45 → weak
    expect(forecastStructuralDegradation({ timelineData: minTD([45, 45]) }).trajectory.projectedLevel).toBe('weak');
  });

  it('risky when projectedScore < 35', function() {
    // latestScore=30, avg=0 → projected=30 → risky
    expect(forecastStructuralDegradation({ timelineData: minTD([30, 30]) }).trajectory.projectedLevel).toBe('risky');
  });
});

// ── 7. score_decline risk factor ──────────────────────────────────────────────

describe('forecastStructuralDegradation — score_decline risk factor', function() {
  it('no score_decline when avg > -5', function() {
    // delta=-4, avg=-4 > -5
    const r = forecastStructuralDegradation({ timelineData: minTD([80, 76]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'score_decline'; })).toBeUndefined();
  });

  it('score_decline low when avg = -5', function() {
    // delta=-5, avg=-5 → low
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 75]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('low');
  });

  it('score_decline medium when avg = -7', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 73]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf.severity).toBe('medium');
  });

  it('score_decline high when avg = -10', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 70]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf.severity).toBe('high');
  });

  it('score_decline critical when avg = -15', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 65]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf.severity).toBe('critical');
  });

  it('score_decline has trend=worsening', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 75]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf.trend).toBe('worsening');
  });

  it('score_decline evidence contains averageScoreDelta', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([80, 75]) })
      .riskFactors.find(function(x) { return x.type === 'score_decline'; });
    expect(rf.evidence).toHaveProperty('averageScoreDelta', -5);
  });
});

// ── 8. level_degradation risk factor ─────────────────────────────────────────

describe('forecastStructuralDegradation — level_degradation risk factor', function() {
  it('no level_degradation when no level_degraded events', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([75, 75]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'level_degradation'; })).toBeUndefined();
  });

  it('level_degradation low for 1 event with non-risky current level', function() {
    const td = minTD([75, 75], { driftEvents: [de('level_degraded', 'medium')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'level_degradation'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('low');
  });

  it('level_degradation medium for 2 events with non-risky current level', function() {
    const td = minTD([75, 75], { driftEvents: [de('level_degraded'), de('level_degraded')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'level_degradation'; });
    expect(rf.severity).toBe('medium');
  });

  it('level_degradation high for 3+ events with non-risky current level', function() {
    const td = minTD([75, 75], { driftEvents: [de('level_degraded'), de('level_degraded'), de('level_degraded')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'level_degradation'; });
    expect(rf.severity).toBe('high');
  });

  it('level_degradation critical when current level is risky', function() {
    // Last score=30 → level=risky
    const td = minTD([75, 30], { driftEvents: [de('level_degraded')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'level_degradation'; });
    expect(rf.severity).toBe('critical');
  });

  it('level_degradation evidence contains degradationCount and currentLevel', function() {
    const td = minTD([75, 75], { driftEvents: [de('level_degraded')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'level_degradation'; });
    expect(rf.evidence.degradationCount).toBe(1);
    expect(rf.evidence.currentLevel).toBe('healthy');
  });
});

// ── 9. volatility risk factor ─────────────────────────────────────────────────

describe('forecastStructuralDegradation — volatility risk factor', function() {
  it('no volatility when variance < 100', function() {
    // deltas [2,-1,2], variance≈3
    const r = forecastStructuralDegradation({ timelineData: minTD([70, 72, 71, 73]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'volatility'; })).toBeUndefined();
  });

  it('no volatility when maxDrop > -20 despite variance >= 100', function() {
    // deltas [12,-12], variance=144 but maxDrop=-12 > -20
    const r = forecastStructuralDegradation({ timelineData: minTD([60, 72, 60]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'volatility'; })).toBeUndefined();
  });

  it('volatility medium when variance 100-199 and maxDrop <= -20', function() {
    // deltas [5,5,-20], variance≈138.9, maxDrop=-20
    const rf = forecastStructuralDegradation({ timelineData: minTD([60, 65, 70, 50]) })
      .riskFactors.find(function(x) { return x.type === 'volatility'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('medium');
  });

  it('volatility high when variance >= 200 and maxDrop <= -20', function() {
    // deltas [25,-25], variance=625, maxDrop=-25
    const rf = forecastStructuralDegradation({ timelineData: minTD([60, 85, 60]) })
      .riskFactors.find(function(x) { return x.type === 'volatility'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('high');
  });

  it('volatility evidence contains variance and maxDrop', function() {
    const rf = forecastStructuralDegradation({ timelineData: minTD([60, 85, 60]) })
      .riskFactors.find(function(x) { return x.type === 'volatility'; });
    expect(rf.evidence).toHaveProperty('variance');
    expect(rf.evidence).toHaveProperty('maxDrop', -25);
  });
});

// ── 10. coupling_acceleration risk factor ─────────────────────────────────────

describe('forecastStructuralDegradation — coupling_acceleration risk factor', function() {
  it('no coupling_acceleration when no coupling_growth events', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([75, 75]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'coupling_acceleration'; })).toBeUndefined();
  });

  it('coupling_acceleration medium when no high-severity coupling_growth events', function() {
    const td = minTD([75, 75], { driftEvents: [de('coupling_growth', 'medium')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'coupling_acceleration'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('medium');
  });

  it('coupling_acceleration high when any coupling_growth event is high severity', function() {
    const td = minTD([75, 75], { driftEvents: [de('coupling_growth', 'medium'), de('coupling_growth', 'high')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'coupling_acceleration'; });
    expect(rf.severity).toBe('high');
  });

  it('coupling_acceleration evidence contains couplingGrowthCount', function() {
    const td = minTD([75, 75], { driftEvents: [de('coupling_growth'), de('coupling_growth')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'coupling_acceleration'; });
    expect(rf.evidence.couplingGrowthCount).toBe(2);
  });
});

// ── 11. implementation_decay risk factor ──────────────────────────────────────

describe('forecastStructuralDegradation — implementation_decay risk factor', function() {
  it('no implementation_decay when no implementation_regression events', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([75, 75]) });
    expect(r.riskFactors.find(function(x) { return x.type === 'implementation_decay'; })).toBeUndefined();
  });

  it('implementation_decay low for 1-2 events', function() {
    const td = minTD([75, 75], { driftEvents: [de('implementation_regression'), de('implementation_regression')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'implementation_decay'; });
    expect(rf).toBeDefined();
    expect(rf.severity).toBe('low');
  });

  it('implementation_decay medium for 3-4 events', function() {
    const evts = [1,2,3].map(function() { return de('implementation_regression'); });
    const td = minTD([75, 75], { driftEvents: evts });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'implementation_decay'; });
    expect(rf.severity).toBe('medium');
  });

  it('implementation_decay high for 5+ events', function() {
    const evts = [1,2,3,4,5].map(function() { return de('implementation_regression'); });
    const td = minTD([75, 75], { driftEvents: evts });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'implementation_decay'; });
    expect(rf.severity).toBe('high');
  });

  it('implementation_decay evidence contains signalDelta', function() {
    const td = minTD([75, 75], { driftEvents: [de('implementation_regression')] });
    const rf = forecastStructuralDegradation({ timelineData: td })
      .riskFactors.find(function(x) { return x.type === 'implementation_decay'; });
    expect(rf.evidence.signalDelta).toBe(1);
  });
});

// ── 12. interventionUrgency ────────────────────────────────────────────────────

describe('forecastStructuralDegradation — interventionUrgency', function() {
  it('none when trend is stable', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).trajectory.interventionUrgency).toBe('none');
  });

  it('none when trend is improving', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([60, 65, 70]) }).trajectory.interventionUrgency).toBe('none');
  });

  it('none when degrading but projectedLevel is healthy', function() {
    // scores [80,75] → avg=-5, projectedScore=70 → healthy → none
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75]) }).trajectory.interventionUrgency).toBe('none');
  });

  it('monitor when degrading and projectedLevel is watch', function() {
    // scores [70,65] → avg=-5, projectedScore=60 → watch → monitor
    expect(forecastStructuralDegradation({ timelineData: minTD([70, 65]) }).trajectory.interventionUrgency).toBe('monitor');
  });

  it('soon when degrading and projectedLevel is weak', function() {
    // scores [60,55] → avg=-5, projectedScore=50 → weak → soon
    expect(forecastStructuralDegradation({ timelineData: minTD([60, 55]) }).trajectory.interventionUrgency).toBe('soon');
  });

  it('immediate when degrading and projectedLevel is risky', function() {
    // scores [40,30] → avg=-10, projectedScore=20 → risky → immediate
    expect(forecastStructuralDegradation({ timelineData: minTD([40, 30]) }).trajectory.interventionUrgency).toBe('immediate');
  });

  it('monitor when volatile and risk factors present', function() {
    // scores [60,85,60] → volatile + volatility riskFactor → monitor
    expect(forecastStructuralDegradation({ timelineData: minTD([60, 85, 60]) }).trajectory.interventionUrgency).toBe('monitor');
  });
});

// ── 13. degradationRisk scoring ────────────────────────────────────────────────

describe('forecastStructuralDegradation — degradationRisk scoring', function() {
  it('score_decline low contributes 10 (no bonus)', function() {
    // scores [80,75] → avg=-5 → low(+10), projectedScore=70 ≥ 55 → no bonus → 10
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75]) }).degradationRisk).toBe(10);
  });

  it('level_degradation low contributes 8 (no bonus)', function() {
    // scores [75,75] + 1 level_degraded → low(+8), projectedScore=75 → no bonus → 8
    const td = minTD([75, 75], { driftEvents: [de('level_degraded')] });
    expect(forecastStructuralDegradation({ timelineData: td }).degradationRisk).toBe(8);
  });

  it('score_decline medium + projectedScore < 55 bonus = 25', function() {
    // scores [62,55] → avg=-7 → medium(+15), projectedScore=48 < 55 (+10) → 25
    expect(forecastStructuralDegradation({ timelineData: minTD([62, 55]) }).degradationRisk).toBe(25);
  });

  it('score_decline critical + projectedScore < 35 bonus = 50', function() {
    // scores [55,40] → avg=-15 → critical(+30), projectedScore=25 < 35 (+20) → 50
    expect(forecastStructuralDegradation({ timelineData: minTD([55, 40]) }).degradationRisk).toBe(50);
  });

  it('score_decline critical + level_degradation critical + projectedScore < 35 = 85', function() {
    // scores [55,30] → avg=-25 → critical(+30); level=risky → level_deg critical(+35); projected=5(+20) → 85
    const td = minTD([55, 30], { driftEvents: [de('level_degraded')] });
    expect(forecastStructuralDegradation({ timelineData: td }).degradationRisk).toBe(85);
  });

  it('degradationRisk is capped at 100', function() {
    // scores [55,30] + level_degraded + coupling_growth(high) → 30+35+15+20 = 100
    const td = minTD([55, 30], { driftEvents: [de('level_degraded'), de('coupling_growth', 'high')] });
    expect(forecastStructuralDegradation({ timelineData: td }).degradationRisk).toBeLessThanOrEqual(100);
  });
});

// ── 14. forecastLevel thresholds ──────────────────────────────────────────────

describe('forecastStructuralDegradation — forecastLevel', function() {
  it('none when degradationRisk = 0', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).forecastLevel).toBe('none');
  });

  it('low when degradationRisk = 10', function() {
    // scores [80,75] → 10
    expect(forecastStructuralDegradation({ timelineData: minTD([80, 75]) }).forecastLevel).toBe('low');
  });

  it('medium when degradationRisk = 25', function() {
    // scores [62,55] → 25
    expect(forecastStructuralDegradation({ timelineData: minTD([62, 55]) }).forecastLevel).toBe('medium');
  });

  it('high when degradationRisk = 50', function() {
    // scores [55,40] → 50
    expect(forecastStructuralDegradation({ timelineData: minTD([55, 40]) }).forecastLevel).toBe('high');
  });

  it('critical when degradationRisk >= 75', function() {
    // scores [55,30] + level_degraded → 85
    const td = minTD([55, 30], { driftEvents: [de('level_degraded')] });
    expect(forecastStructuralDegradation({ timelineData: td }).forecastLevel).toBe('critical');
  });
});

// ── 15. confidenceLevel ───────────────────────────────────────────────────────

describe('forecastStructuralDegradation — confidenceLevel', function() {
  it('low for 2 scoreTimeline entries', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).confidenceLevel).toBe('low');
  });

  it('medium for 3-4 scoreTimeline entries', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75, 75]) }).confidenceLevel).toBe('medium');
  });

  it('high for 5+ scoreTimeline entries', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75, 75, 75, 75]) }).confidenceLevel).toBe('high');
  });
});

// ── 16. couplingForecast ──────────────────────────────────────────────────────

describe('forecastStructuralDegradation — couplingForecast', function() {
  it('stable when no coupling_growth events', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).structuralProjection.couplingForecast).toBe('stable');
  });

  it('growing when coupling_growth events are all medium or low severity', function() {
    const td = minTD([75, 75], { driftEvents: [de('coupling_growth', 'medium')] });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.couplingForecast).toBe('growing');
  });

  it('accelerating when any coupling_growth event is high severity', function() {
    const td = minTD([75, 75], { driftEvents: [de('coupling_growth', 'high')] });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.couplingForecast).toBe('accelerating');
  });
});

// ── 17. implementationHealthForecast ─────────────────────────────────────────

describe('forecastStructuralDegradation — implementationHealthForecast', function() {
  it('stable when no implementation_regression events', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).structuralProjection.implementationHealthForecast).toBe('stable');
  });

  it('degrading when 1-2 implementation_regression events', function() {
    const td = minTD([75, 75], { driftEvents: [de('implementation_regression')] });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.implementationHealthForecast).toBe('degrading');
  });

  it('critical when 3+ implementation_regression events', function() {
    const evts = [1,2,3].map(function() { return de('implementation_regression'); });
    const td = minTD([75, 75], { driftEvents: evts });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.implementationHealthForecast).toBe('critical');
  });
});

// ── 18. boundaryIntegrityForecast ─────────────────────────────────────────────

describe('forecastStructuralDegradation — boundaryIntegrityForecast', function() {
  it('stable when no high-severity new_risk events', function() {
    const td = minTD([75, 75], { driftEvents: [de('new_risk', 'medium')] });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.boundaryIntegrityForecast).toBe('stable');
  });

  it('stable when no events at all', function() {
    expect(forecastStructuralDegradation({ timelineData: minTD([75, 75]) }).structuralProjection.boundaryIntegrityForecast).toBe('stable');
  });

  it('eroding when 1-2 high new_risk events', function() {
    const td = minTD([75, 75], { driftEvents: [de('new_risk', 'high'), de('new_risk', 'high')] });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.boundaryIntegrityForecast).toBe('eroding');
  });

  it('critical when 3+ high new_risk events', function() {
    const evts = [1,2,3].map(function() { return de('new_risk', 'high'); });
    const td = minTD([75, 75], { driftEvents: evts });
    expect(forecastStructuralDegradation({ timelineData: td }).structuralProjection.boundaryIntegrityForecast).toBe('critical');
  });
});

// ── 19. recommendations ───────────────────────────────────────────────────────

describe('forecastStructuralDegradation — recommendations', function() {
  it('populated for score_decline risk factor', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([80, 75]) });
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.recommendations[0]).toContain('architecture score');
  });

  it('includes urgency recommendation when interventionUrgency=immediate', function() {
    // scores [40,30] → immediate
    const r = forecastStructuralDegradation({ timelineData: minTD([40, 30]) });
    const hasImmediate = r.recommendations.some(function(x) { return x.toLowerCase().includes('immediate'); });
    expect(hasImmediate).toBe(true);
  });

  it('includes urgency recommendation when interventionUrgency=soon', function() {
    // scores [60,55] → soon
    const r = forecastStructuralDegradation({ timelineData: minTD([60, 55]) });
    const hasSoon = r.recommendations.some(function(x) { return x.toLowerCase().includes('sprint'); });
    expect(hasSoon).toBe(true);
  });

  it('recommendations never exceed 5', function() {
    const evts = [
      de('level_degraded'), de('coupling_growth', 'high'),
      de('implementation_regression'), de('new_risk', 'high'),
    ];
    const td = minTD([80, 73], { driftEvents: evts });
    expect(forecastStructuralDegradation({ timelineData: td }).recommendations.length).toBeLessThanOrEqual(5);
  });
});

// ── 20. summary strings ────────────────────────────────────────────────────────

describe('forecastStructuralDegradation — summary', function() {
  it('stable message when forecastLevel is none', function() {
    const r = forecastStructuralDegradation({ timelineData: minTD([75, 75]) });
    expect(r.summary).toContain('stable');
  });

  it('summary contains forecastLevel and scoreTrend for non-none result', function() {
    // scores [80,75] → forecastLevel=low, scoreTrend=degrading
    const r = forecastStructuralDegradation({ timelineData: minTD([80, 75]) });
    expect(r.summary).toContain('low');
    expect(r.summary).toContain('degrading');
  });

  it('summary contains intervention urgency when present', function() {
    // scores [40,30] → immediate
    const r = forecastStructuralDegradation({ timelineData: minTD([40, 30]) });
    expect(r.summary).toContain('immediate');
  });
});
