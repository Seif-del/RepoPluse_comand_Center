'use strict';

const { getOperationalChanges } = require('../../../../execution/risk/getOperationalChanges');

// ── Helpers ────────────────────────────────────────────────────────────────────

function makePair(overrides = {}) {
  return {
    repoId:                    1,
    repoName:                  'org/repo',
    currentScore:              40,
    previousScore:             35,
    currentLabel:              'monitor',
    previousLabel:             'monitor',
    currentTrend:              'stable',
    previousTrend:             'stable',
    currentCiStatus:           'passing',
    previousCiStatus:          'passing',
    currentContributorStatus:  'healthy',
    previousContributorStatus: 'healthy',
    snapshotAt:                '2025-06-01T12:00:00.000Z',
    ...overrides,
  };
}

// ── Guard conditions ──────────────────────────────────────────────────────────

describe('getOperationalChanges — guard conditions', () => {
  it('returns [] when input is null', () => {
    expect(getOperationalChanges(null)).toEqual([]);
  });

  it('returns [] when input is undefined', () => {
    expect(getOperationalChanges(undefined)).toEqual([]);
  });

  it('returns [] when input is not an array', () => {
    expect(getOperationalChanges(42)).toEqual([]);
    expect(getOperationalChanges('bad')).toEqual([]);
    expect(getOperationalChanges({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(getOperationalChanges([])).toEqual([]);
  });

  it('skips items with null repoId', () => {
    const pair = makePair({ repoId: null, currentLabel: 'critical', previousLabel: 'healthy' });
    expect(getOperationalChanges([pair])).toEqual([]);
  });

  it('skips items with undefined repoId', () => {
    const pair = makePair({ repoId: undefined, currentLabel: 'critical', previousLabel: 'healthy' });
    expect(getOperationalChanges([pair])).toEqual([]);
  });
});

// ── Sparse history — no previous snapshot ────────────────────────────────────

describe('getOperationalChanges — sparse history (no previous snapshot)', () => {
  it('produces no events when all previous fields are null', () => {
    const pair = makePair({
      previousScore:             null,
      previousLabel:             null,
      previousTrend:             null,
      previousCiStatus:          null,
      previousContributorStatus: null,
    });
    expect(getOperationalChanges([pair])).toEqual([]);
  });

  it('produces no events when only currentLabel has data but previousLabel is null', () => {
    const pair = makePair({
      currentLabel:  'critical',
      previousLabel: null,
      previousScore: null,
      previousCiStatus: null,
      previousContributorStatus: null,
      previousTrend: null,
    });
    expect(getOperationalChanges([pair])).toEqual([]);
  });

  it('allows events when only CI prev is null but risk prev exists', () => {
    const pair = makePair({
      currentLabel:    'critical',
      previousLabel:   'healthy',
      previousCiStatus: null,
      currentCiStatus:  'failing',
    });
    const changes = getOperationalChanges([pair]);
    expect(changes.some(c => c.type === 'label_degraded')).toBe(true);
    expect(changes.some(c => c.type === 'ci_failure_detected')).toBe(false);
  });
});

// ── Output shape ─────────────────────────────────────────────────────────────

describe('getOperationalChanges — output shape', () => {
  it('each event has required fields', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'healthy' });
    const [event] = getOperationalChanges([pair]);
    expect(event).toHaveProperty('type');
    expect(event).toHaveProperty('severity');
    expect(event).toHaveProperty('repoId');
    expect(event).toHaveProperty('repoName');
    expect(event).toHaveProperty('summary');
    expect(event).toHaveProperty('previousState');
    expect(event).toHaveProperty('currentState');
    expect(event).toHaveProperty('detectedAt');
  });

  it('detectedAt matches snapshotAt', () => {
    const ts = '2025-09-15T08:00:00.000Z';
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'healthy', snapshotAt: ts });
    const [event] = getOperationalChanges([pair]);
    expect(event.detectedAt).toBe(ts);
  });

  it('repoName falls back to string of repoId when repoName is missing', () => {
    const pair = makePair({
      repoId:   99,
      repoName: undefined,
      currentLabel:  'critical',
      previousLabel: 'healthy',
    });
    const [event] = getOperationalChanges([pair]);
    expect(event.repoName).toBe('99');
  });
});

// ── Label degradation ─────────────────────────────────────────────────────────

describe('getOperationalChanges — label degradation', () => {
  it('healthy → monitor emits label_degraded with severity medium', () => {
    const pair = makePair({ currentLabel: 'monitor', previousLabel: 'healthy' });
    const changes = getOperationalChanges([pair]);
    const ev = changes.find(c => c.type === 'label_degraded');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
    expect(ev.previousState).toBe('healthy');
    expect(ev.currentState).toBe('monitor');
  });

  it('healthy → at-risk emits label_degraded with severity high', () => {
    const pair = makePair({ currentLabel: 'at-risk', previousLabel: 'healthy' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.severity).toBe('high');
  });

  it('healthy → critical emits label_degraded with severity critical', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'healthy' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.severity).toBe('critical');
  });

  it('monitor → at-risk emits label_degraded with severity high', () => {
    const pair = makePair({ currentLabel: 'at-risk', previousLabel: 'monitor' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.severity).toBe('high');
  });

  it('monitor → critical emits label_degraded with severity critical', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'monitor' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.severity).toBe('critical');
  });

  it('at-risk → critical emits label_degraded with severity critical', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'at-risk' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.severity).toBe('critical');
  });

  it('summary includes repo name and both label display names', () => {
    const pair = makePair({ repoName: 'org/api', currentLabel: 'at-risk', previousLabel: 'healthy' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_degraded');
    expect(ev.summary).toContain('org/api');
    expect(ev.summary).toContain('Healthy');
    expect(ev.summary).toContain('At Risk');
  });

  it('does not emit label_degraded when label is unchanged', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'critical' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'label_degraded')).toBe(false);
  });
});

// ── Label recovery ─────────────────────────────────────────────────────────────

describe('getOperationalChanges — label recovery', () => {
  it('critical → at-risk emits label_recovered with severity healthy', () => {
    const pair = makePair({ currentLabel: 'at-risk', previousLabel: 'critical' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('critical → monitor emits label_recovered', () => {
    const pair = makePair({ currentLabel: 'monitor', previousLabel: 'critical' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'label_recovered')).toBe(true);
  });

  it('critical → healthy emits label_recovered', () => {
    const pair = makePair({ currentLabel: 'healthy', previousLabel: 'critical' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'label_recovered')).toBe(true);
  });

  it('at-risk → healthy emits label_recovered', () => {
    const pair = makePair({ currentLabel: 'healthy', previousLabel: 'at-risk' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'label_recovered')).toBe(true);
  });

  it('monitor → healthy emits label_recovered', () => {
    const pair = makePair({ currentLabel: 'healthy', previousLabel: 'monitor' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'label_recovered')).toBe(true);
  });

  it('summary includes both label names', () => {
    const pair = makePair({ repoName: 'org/svc', currentLabel: 'healthy', previousLabel: 'critical' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'label_recovered');
    expect(ev.summary).toContain('org/svc');
    expect(ev.summary).toContain('Critical');
    expect(ev.summary).toContain('Healthy');
  });
});

// ── Score spikes ─────────────────────────────────────────────────────────────

describe('getOperationalChanges — score spikes', () => {
  it('delta >= 15 emits score_spike', () => {
    const pair = makePair({ currentScore: 50, previousScore: 35 });
    expect(getOperationalChanges([pair]).some(c => c.type === 'score_spike')).toBe(true);
  });

  it('delta exactly 15 emits score_spike', () => {
    const pair = makePair({ currentScore: 50, previousScore: 35 });
    expect(getOperationalChanges([pair]).some(c => c.type === 'score_spike')).toBe(true);
  });

  it('delta 14 does NOT emit score_spike', () => {
    const pair = makePair({ currentScore: 49, previousScore: 35 });
    expect(getOperationalChanges([pair]).some(c => c.type === 'score_spike')).toBe(false);
  });

  it('spike with new score >= 75 → severity critical', () => {
    const pair = makePair({ currentScore: 80, previousScore: 60 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_spike');
    expect(ev.severity).toBe('critical');
  });

  it('spike with new score 50–74 → severity high', () => {
    const pair = makePair({ currentScore: 60, previousScore: 40 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_spike');
    expect(ev.severity).toBe('high');
  });

  it('spike with new score < 50 → severity medium', () => {
    const pair = makePair({ currentScore: 40, previousScore: 20 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_spike');
    expect(ev.severity).toBe('medium');
  });

  it('previousState and currentState are score strings', () => {
    const pair = makePair({ currentScore: 60, previousScore: 40 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_spike');
    expect(ev.previousState).toBe('40');
    expect(ev.currentState).toBe('60');
  });

  it('summary includes both scores', () => {
    const pair = makePair({ repoName: 'org/x', currentScore: 65, previousScore: 45 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_spike');
    expect(ev.summary).toContain('45');
    expect(ev.summary).toContain('65');
  });

  it('does not emit when either score is null', () => {
    const pair1 = makePair({ currentScore: null, previousScore: 30 });
    const pair2 = makePair({ currentScore: 60, previousScore: null });
    expect(getOperationalChanges([pair1]).some(c => c.type === 'score_spike')).toBe(false);
    expect(getOperationalChanges([pair2]).some(c => c.type === 'score_spike')).toBe(false);
  });
});

// ── Score recovery ────────────────────────────────────────────────────────────

describe('getOperationalChanges — score recovery', () => {
  it('delta <= -15 emits score_recovery with severity healthy', () => {
    const pair = makePair({ currentScore: 20, previousScore: 50 });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'score_recovery');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('delta exactly -15 emits score_recovery', () => {
    const pair = makePair({ currentScore: 35, previousScore: 50 });
    expect(getOperationalChanges([pair]).some(c => c.type === 'score_recovery')).toBe(true);
  });

  it('delta -14 does NOT emit score_recovery', () => {
    const pair = makePair({ currentScore: 36, previousScore: 50 });
    expect(getOperationalChanges([pair]).some(c => c.type === 'score_recovery')).toBe(false);
  });
});

// ── CI transitions ────────────────────────────────────────────────────────────

describe('getOperationalChanges — CI transitions', () => {
  it('passing → failing emits ci_failure_detected with severity critical', () => {
    const pair = makePair({ currentCiStatus: 'failing', previousCiStatus: 'passing' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'ci_failure_detected');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('critical');
    expect(ev.previousState).toBe('passing');
    expect(ev.currentState).toBe('failing');
  });

  it('failing → passing emits ci_recovered with severity healthy', () => {
    const pair = makePair({ currentCiStatus: 'passing', previousCiStatus: 'failing' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'ci_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('no event when CI status unchanged', () => {
    const pair = makePair({ currentCiStatus: 'failing', previousCiStatus: 'failing' });
    expect(getOperationalChanges([pair]).some(c => c.type.startsWith('ci_'))).toBe(false);
  });

  it('no event when either CI value is null', () => {
    const pair1 = makePair({ currentCiStatus: null, previousCiStatus: 'passing' });
    const pair2 = makePair({ currentCiStatus: 'failing', previousCiStatus: null });
    expect(getOperationalChanges([pair1]).some(c => c.type.startsWith('ci_'))).toBe(false);
    expect(getOperationalChanges([pair2]).some(c => c.type.startsWith('ci_'))).toBe(false);
  });

  it('ci_failure_detected summary names the repo', () => {
    const pair = makePair({ repoName: 'org/infra', currentCiStatus: 'failing', previousCiStatus: 'passing' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'ci_failure_detected');
    expect(ev.summary).toContain('org/infra');
  });
});

// ── Contributor transitions ───────────────────────────────────────────────────

describe('getOperationalChanges — contributor transitions', () => {
  it('healthy → abandoned emits contributor_abandoned with severity critical', () => {
    const pair = makePair({ currentContributorStatus: 'abandoned', previousContributorStatus: 'healthy' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'contributor_abandoned');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('critical');
  });

  it('healthy → bus_factor_risk emits bus_factor_detected with severity high', () => {
    const pair = makePair({ currentContributorStatus: 'bus_factor_risk', previousContributorStatus: 'healthy' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'bus_factor_detected');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('high');
  });

  it('abandoned → healthy emits contributor_recovered with severity healthy', () => {
    const pair = makePair({ currentContributorStatus: 'healthy', previousContributorStatus: 'abandoned' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'contributor_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('bus_factor_risk → healthy emits contributor_recovered', () => {
    const pair = makePair({ currentContributorStatus: 'healthy', previousContributorStatus: 'bus_factor_risk' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'contributor_recovered')).toBe(true);
  });

  it('low_activity → healthy emits contributor_recovered', () => {
    const pair = makePair({ currentContributorStatus: 'healthy', previousContributorStatus: 'low_activity' });
    expect(getOperationalChanges([pair]).some(c => c.type === 'contributor_recovered')).toBe(true);
  });

  it('no event when contributor status unchanged', () => {
    const pair = makePair({ currentContributorStatus: 'abandoned', previousContributorStatus: 'abandoned' });
    expect(getOperationalChanges([pair]).some(c => c.type.startsWith('contributor_') || c.type === 'bus_factor_detected')).toBe(false);
  });

  it('contributor_recovered previousState reflects actual prior status', () => {
    const pair = makePair({ currentContributorStatus: 'healthy', previousContributorStatus: 'bus_factor_risk' });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'contributor_recovered');
    expect(ev.previousState).toBe('bus_factor_risk');
  });
});

// ── Trajectory shifts ─────────────────────────────────────────────────────────

describe('getOperationalChanges — trajectory shifts', () => {
  it('stable → escalating emits trajectory_escalating with severity critical', () => {
    const pair = makePair({
      currentLabel:  'critical',
      currentTrend:  'worsening',
      previousLabel: 'critical',
      previousTrend: 'stable',
    });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'trajectory_escalating');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('critical');
  });

  it('recovering → deteriorating emits trajectory_deteriorating with severity high', () => {
    const pair = makePair({
      currentLabel:  'at-risk',
      currentTrend:  'worsening',
      previousLabel: 'at-risk',
      previousTrend: 'improving',
    });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'trajectory_deteriorating');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('high');
  });

  it('stable → deteriorating emits trajectory_deteriorating with severity high', () => {
    const pair = makePair({
      currentLabel:  'at-risk',
      currentTrend:  'worsening',
      previousLabel: 'at-risk',
      previousTrend: 'stable',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'trajectory_deteriorating')).toBe(true);
  });

  it('escalating → recovering emits trajectory_recovering with severity healthy', () => {
    const pair = makePair({
      currentLabel:  'critical',
      currentTrend:  'improving',
      previousLabel: 'critical',
      previousTrend: 'worsening',
    });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'trajectory_recovering');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('deteriorating → recovering emits trajectory_recovering', () => {
    const pair = makePair({
      currentLabel:  'at-risk',
      currentTrend:  'improving',
      previousLabel: 'at-risk',
      previousTrend: 'worsening',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'trajectory_recovering')).toBe(true);
  });

  it('no trajectory event when trajectory is unchanged', () => {
    const pair = makePair({
      currentLabel:  'at-risk',
      currentTrend:  'worsening',
      previousLabel: 'at-risk',
      previousTrend: 'worsening',
    });
    expect(getOperationalChanges([pair]).some(c => c.type.startsWith('trajectory_'))).toBe(false);
  });

  it('no trajectory event when either label is null', () => {
    const pair = makePair({
      currentLabel:  null,
      currentTrend:  'worsening',
      previousLabel: 'at-risk',
      previousTrend: 'stable',
    });
    expect(getOperationalChanges([pair]).some(c => c.type.startsWith('trajectory_'))).toBe(false);
  });
});

// ── Volatile emergence ────────────────────────────────────────────────────────

describe('getOperationalChanges — volatile emergence', () => {
  it('trend reversal worsening→improving with |delta| >= 10 emits volatile_emerged', () => {
    const pair = makePair({
      currentScore:  30,
      previousScore: 50,
      currentTrend:  'improving',
      previousTrend: 'worsening',
    });
    const ev = getOperationalChanges([pair]).find(c => c.type === 'volatile_emerged');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
  });

  it('trend reversal improving→worsening with |delta| >= 10 emits volatile_emerged', () => {
    const pair = makePair({
      currentScore:  50,
      previousScore: 30,
      currentTrend:  'worsening',
      previousTrend: 'improving',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'volatile_emerged')).toBe(true);
  });

  it('trend reversal with |delta| = 9 does NOT emit volatile_emerged', () => {
    const pair = makePair({
      currentScore:  39,
      previousScore: 30,
      currentTrend:  'worsening',
      previousTrend: 'improving',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'volatile_emerged')).toBe(false);
  });

  it('same trend direction with large delta does NOT emit volatile_emerged', () => {
    const pair = makePair({
      currentScore:  70,
      previousScore: 30,
      currentTrend:  'worsening',
      previousTrend: 'worsening',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'volatile_emerged')).toBe(false);
  });

  it('no volatile event when scores are null', () => {
    const pair = makePair({
      currentScore:  null,
      previousScore: 30,
      currentTrend:  'worsening',
      previousTrend: 'improving',
    });
    expect(getOperationalChanges([pair]).some(c => c.type === 'volatile_emerged')).toBe(false);
  });
});

// ── Ordering ──────────────────────────────────────────────────────────────────

describe('getOperationalChanges — ordering', () => {
  it('results are sorted newest-first by detectedAt', () => {
    const pairs = [
      makePair({
        repoId: 1, snapshotAt: '2025-01-01T00:00:00.000Z',
        currentLabel: 'critical', previousLabel: 'healthy',
      }),
      makePair({
        repoId: 2, snapshotAt: '2025-06-01T00:00:00.000Z',
        currentLabel: 'critical', previousLabel: 'healthy',
      }),
    ];
    const changes = getOperationalChanges(pairs);
    const dates = changes.map(c => new Date(c.detectedAt).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  it('within the same timestamp, critical severity comes before healthy', () => {
    const ts = '2025-06-01T12:00:00.000Z';
    const pair = makePair({
      snapshotAt:    ts,
      currentLabel:  'critical',
      previousLabel: 'healthy',
      currentScore:  25,
      previousScore: 60,
    });
    const changes = getOperationalChanges([pair]);
    const sevOrder = { critical: 0, high: 1, medium: 2, healthy: 3 };
    for (let i = 1; i < changes.length; i++) {
      const a = sevOrder[changes[i - 1].severity] ?? 4;
      const b = sevOrder[changes[i].severity]     ?? 4;
      expect(a).toBeLessThanOrEqual(b);
    }
  });
});

// ── 50-item cap ───────────────────────────────────────────────────────────────

describe('getOperationalChanges — 50-item cap', () => {
  it('returns at most 50 changes even with many repos', () => {
    const pairs = Array.from({ length: 60 }, function(_, i) {
      return makePair({
        repoId:        i + 1,
        repoName:      'org/repo-' + (i + 1),
        currentLabel:  'critical',
        previousLabel: 'healthy',
        snapshotAt:    '2025-06-01T12:00:00.000Z',
      });
    });
    const changes = getOperationalChanges(pairs);
    expect(changes.length).toBeLessThanOrEqual(50);
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('getOperationalChanges — determinism', () => {
  it('produces identical results on repeated calls with same input', () => {
    const pairs = [
      makePair({ currentLabel: 'critical', previousLabel: 'healthy' }),
      makePair({ repoId: 2, currentCiStatus: 'failing', previousCiStatus: 'passing' }),
    ];
    expect(getOperationalChanges(pairs)).toEqual(getOperationalChanges(pairs));
  });

  it('does not mutate input pairs', () => {
    const pair = makePair({ currentLabel: 'critical', previousLabel: 'healthy' });
    const clone = { ...pair };
    getOperationalChanges([pair]);
    expect(pair).toEqual(clone);
  });
});

// ── Multiple events per repo ──────────────────────────────────────────────────

describe('getOperationalChanges — multiple events per repo', () => {
  it('can emit multiple distinct event types from a single repo pair', () => {
    const pair = makePair({
      currentLabel:              'critical',
      previousLabel:             'healthy',
      currentScore:              80,
      previousScore:             30,
      currentCiStatus:           'failing',
      previousCiStatus:          'passing',
      currentContributorStatus:  'abandoned',
      previousContributorStatus: 'healthy',
    });
    const changes = getOperationalChanges([pair]);
    const types = changes.map(c => c.type);
    expect(types).toContain('label_degraded');
    expect(types).toContain('score_spike');
    expect(types).toContain('ci_failure_detected');
    expect(types).toContain('contributor_abandoned');
  });
});
