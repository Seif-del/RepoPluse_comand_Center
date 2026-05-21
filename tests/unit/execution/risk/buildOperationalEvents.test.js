'use strict';

const { buildOperationalEvents } = require('../../../../execution/risk/buildOperationalEvents');

// ── Shared fixtures ────────────────────────────────────────────────────────────

const T1 = '2026-05-10T10:00:00.000Z'; // previous snapshot (older)
const T2 = '2026-05-12T13:00:00.000Z'; // current snapshot  (newer)

function makeRisk(score, snapshotAt = T2) {
  return { score, label: score >= 70 ? 'critical' : score >= 40 ? 'at-risk' : 'healthy', snapshotAt };
}

function makeMetrics({ ciStatus = 'passing', releaseStatus = 'healthy', contributorStatus = 'healthy', snapshotAt = T2 } = {}) {
  return { ciStatus, releaseStatus, contributorStatus, snapshotAt };
}

// ── Guard: missing input ───────────────────────────────────────────────────────

describe('buildOperationalEvents — missing input', () => {
  it('returns empty array when called with no arguments', () => {
    expect(buildOperationalEvents()).toEqual([]);
  });

  it('returns empty array when both currentMetrics and currentRiskScore are null', () => {
    expect(buildOperationalEvents({ currentMetrics: null, currentRiskScore: null })).toEqual([]);
  });

  it('returns empty array when no previous snapshots exist', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics(),
      previousMetrics:   null,
      currentRiskScore:  makeRisk(50),
      previousRiskScore: null,
    });
    expect(result).toEqual([]);
  });

  it('skips risk events when previousRiskScore is missing but emits metric events', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: null,
    });
    expect(result.some(e => e.type === 'ci_failure_detected')).toBe(true);
    expect(result.some(e => e.type === 'risk_increase' || e.type === 'risk_recovery')).toBe(false);
  });
});

// ── Risk score transitions ─────────────────────────────────────────────────────

describe('buildOperationalEvents — risk score transitions', () => {
  it('emits risk_increase when delta >= 10', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(35),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    expect(result.some(e => e.type === 'risk_increase')).toBe(true);
  });

  it('emits risk_increase when delta is exactly 10', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(60),
      previousRiskScore: makeRisk(50),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_increase');
    expect(ev).toBeDefined();
    expect(ev.description).toContain('50');
    expect(ev.description).toContain('60');
  });

  it('does NOT emit risk_increase when delta is 9', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(59),
      previousRiskScore: makeRisk(50),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    expect(result.some(e => e.type === 'risk_increase')).toBe(false);
  });

  it('emits risk_recovery when delta <= -10', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(30),
      previousRiskScore: makeRisk(50),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    expect(result.some(e => e.type === 'risk_recovery')).toBe(true);
  });

  it('emits risk_recovery when delta is exactly -10', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(40),
      previousRiskScore: makeRisk(50),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_recovery');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('does NOT emit risk_recovery when delta is -9', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(41),
      previousRiskScore: makeRisk(50),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    expect(result.some(e => e.type === 'risk_recovery')).toBe(false);
  });

  it('assigns critical severity when current score >= 70', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(80),
      previousRiskScore: makeRisk(60),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_increase');
    expect(ev.severity).toBe('critical');
  });

  it('assigns high severity when current score is 40–69', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(60),
      previousRiskScore: makeRisk(40),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_increase');
    expect(ev.severity).toBe('high');
  });

  it('assigns medium severity when current score < 40', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(30),
      previousRiskScore: makeRisk(10),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_increase');
    expect(ev.severity).toBe('medium');
  });

  it('uses currentRiskScore.snapshotAt as the event timestamp', () => {
    const result = buildOperationalEvents({
      currentRiskScore:  makeRisk(80, T2),
      previousRiskScore: makeRisk(60, T1),
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
    });
    const ev = result.find(e => e.type === 'risk_increase');
    expect(ev.timestamp).toBe(T2);
  });
});

// ── CI transitions ─────────────────────────────────────────────────────────────

describe('buildOperationalEvents — CI transitions', () => {
  it('emits ci_failure_detected when CI changes from passing to failing', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'ci_failure_detected');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('critical');
  });

  it('emits ci_recovered when CI changes from failing to passing', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'passing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'failing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'ci_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('does not emit CI event when both snapshots are passing', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'passing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'ci_failure_detected' || e.type === 'ci_recovered')).toBe(false);
  });

  it('does not emit CI event when both snapshots are failing', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'failing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'ci_failure_detected' || e.type === 'ci_recovered')).toBe(false);
  });

  it('does not emit CI event when previous CI was unknown', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'unknown', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'ci_failure_detected')).toBe(false);
  });

  it('uses currentMetrics.snapshotAt as CI event timestamp', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing', snapshotAt: T2 }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'ci_failure_detected');
    expect(ev.timestamp).toBe(T2);
  });
});

// ── Release transitions ────────────────────────────────────────────────────────

describe('buildOperationalEvents — release transitions', () => {
  it('emits release_activity_declined when healthy → stale', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ releaseStatus: 'stale' }),
      previousMetrics:   makeMetrics({ releaseStatus: 'healthy', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'release_activity_declined');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('high');
  });

  it('emits release_activity_recovered when stale → healthy', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ releaseStatus: 'healthy' }),
      previousMetrics:   makeMetrics({ releaseStatus: 'stale', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'release_activity_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('emits release_activity_recovered when none → healthy', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ releaseStatus: 'healthy' }),
      previousMetrics:   makeMetrics({ releaseStatus: 'none', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'release_activity_recovered')).toBe(true);
  });

  it('does not emit release event when status is unchanged', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ releaseStatus: 'stale' }),
      previousMetrics:   makeMetrics({ releaseStatus: 'stale', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'release_activity_declined' || e.type === 'release_activity_recovered')).toBe(false);
  });
});

// ── Contributor transitions ────────────────────────────────────────────────────

describe('buildOperationalEvents — contributor transitions', () => {
  it('emits contributor_activity_declined when healthy → low_activity', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ contributorStatus: 'low_activity' }),
      previousMetrics:   makeMetrics({ contributorStatus: 'healthy', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'contributor_activity_declined');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('medium');
  });

  it('emits contributor_activity_recovered when low_activity → healthy', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ contributorStatus: 'healthy' }),
      previousMetrics:   makeMetrics({ contributorStatus: 'low_activity', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'contributor_activity_recovered');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('healthy');
  });

  it('emits contributor_activity_recovered when bus_factor_risk → healthy', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ contributorStatus: 'healthy' }),
      previousMetrics:   makeMetrics({ contributorStatus: 'bus_factor_risk', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e => e.type === 'contributor_activity_recovered')).toBe(true);
  });

  it('emits bus_factor_detected when healthy → bus_factor_risk', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ contributorStatus: 'bus_factor_risk' }),
      previousMetrics:   makeMetrics({ contributorStatus: 'healthy', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    const ev = result.find(e => e.type === 'bus_factor_detected');
    expect(ev).toBeDefined();
    expect(ev.severity).toBe('high');
  });

  it('does not emit contributor event when status is unchanged', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ contributorStatus: 'low_activity' }),
      previousMetrics:   makeMetrics({ contributorStatus: 'low_activity', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(40),
    });
    expect(result.some(e =>
      e.type === 'contributor_activity_declined' ||
      e.type === 'contributor_activity_recovered' ||
      e.type === 'bus_factor_detected'
    )).toBe(false);
  });
});

// ── Event shape ────────────────────────────────────────────────────────────────

describe('buildOperationalEvents — event shape', () => {
  it('every event has type, severity, title, description, and timestamp keys', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing' }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(80),
      previousRiskScore: makeRisk(50),
    });
    result.forEach(function(ev) {
      expect(ev).toHaveProperty('type');
      expect(ev).toHaveProperty('severity');
      expect(ev).toHaveProperty('title');
      expect(ev).toHaveProperty('description');
      expect(ev).toHaveProperty('timestamp');
    });
  });
});

// ── Ordering ───────────────────────────────────────────────────────────────────

describe('buildOperationalEvents — ordering', () => {
  it('returns events newest first', () => {
    // risk event has T2, metrics events also T2 — but give metrics older T to test ordering
    const EARLY = '2026-05-01T00:00:00.000Z';
    const LATE  = '2026-05-12T00:00:00.000Z';

    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing', snapshotAt: EARLY }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(80, LATE),
      previousRiskScore: makeRisk(50, T1),
    });

    // The risk_increase event is at LATE, ci_failure_detected is at EARLY
    const riskIdx = result.findIndex(e => e.type === 'risk_increase');
    const ciIdx   = result.findIndex(e => e.type === 'ci_failure_detected');
    expect(riskIdx).toBeLessThan(ciIdx);
  });

  it('returns a stable result for same-timestamp events (no crash, correct count)', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing', releaseStatus: 'stale', snapshotAt: T2 }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', releaseStatus: 'healthy', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(80, T2),
      previousRiskScore: makeRisk(50, T1),
    });
    // Should have risk_increase + ci_failure_detected + release_activity_declined
    expect(result.length).toBe(3);
  });
});

// ── Multiple simultaneous events ───────────────────────────────────────────────

describe('buildOperationalEvents — multiple events', () => {
  it('emits all applicable events in one call', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics({ ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'low_activity' }),
      previousMetrics:   makeMetrics({ ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'healthy', snapshotAt: T1 }),
      currentRiskScore:  makeRisk(80),
      previousRiskScore: makeRisk(50),
    });
    const types = result.map(e => e.type);
    expect(types).toContain('risk_increase');
    expect(types).toContain('ci_failure_detected');
    expect(types).toContain('release_activity_declined');
    expect(types).toContain('contributor_activity_declined');
    expect(result.length).toBe(4);
  });

  it('emits no events when everything is stable and unchanged', () => {
    const result = buildOperationalEvents({
      currentMetrics:    makeMetrics(),
      previousMetrics:   makeMetrics({ snapshotAt: T1 }),
      currentRiskScore:  makeRisk(50),
      previousRiskScore: makeRisk(50),
    });
    expect(result).toEqual([]);
  });
});
