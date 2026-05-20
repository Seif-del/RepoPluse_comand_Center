'use strict';

const { buildTelemetryCoverageSummary } = require('../../../../execution/risk/buildTelemetryCoverageSummary');

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const NOW_MS   = 1716206400000; // 2024-05-20T08:00:00.000Z — fixed reference

function makeRepo(overrides) {
  return Object.assign({
    id:                1,
    fullName:          'org/repo',
    ciStatus:          'passing',
    releaseStatus:     'healthy',
    contributorStatus: 'healthy',
    lastSyncedAt:      new Date(NOW_MS - 60 * 60 * 1000).toISOString(), // 1 h ago — fresh
    snapshotCount:     5,
  }, overrides);
}

// ── empty / null inputs ───────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — empty / null inputs', () => {
  test('returns zero-state for empty array', () => {
    var r = buildTelemetryCoverageSummary([], { _nowMs: NOW_MS });
    expect(r.repoCount).toBe(0);
    expect(r.ciCoverage.percentage).toBe(0);
    expect(r.ciCoverage.level).toBe('low');
    expect(r.releaseCoverage.percentage).toBe(0);
    expect(r.releaseCoverage.level).toBe('low');
    expect(r.contributorCoverage.percentage).toBe(0);
    expect(r.contributorCoverage.level).toBe('low');
    expect(r.telemetryCompleteness.percentage).toBe(0);
    expect(r.historicalDepth.averageSnapshots).toBe(0);
    expect(r.historicalDepth.level).toBe('low');
    expect(r.syncFreshness.staleCount).toBe(0);
    expect(r.syncFreshness.stalePercentage).toBe(0);
    expect(r.syncFreshness.level).toBe('high');
    expect(r.overallMaturity).toBe('low');
  });

  test('returns zero-state for null', () => {
    var r = buildTelemetryCoverageSummary(null, { _nowMs: NOW_MS });
    expect(r.repoCount).toBe(0);
    expect(r.overallMaturity).toBe('low');
  });

  test('returns zero-state for undefined', () => {
    var r = buildTelemetryCoverageSummary(undefined, { _nowMs: NOW_MS });
    expect(r.repoCount).toBe(0);
  });

  test('returns zero-state for non-array scalar', () => {
    var r = buildTelemetryCoverageSummary(42, { _nowMs: NOW_MS });
    expect(r.repoCount).toBe(0);
  });
});

// ── full telemetry portfolio ──────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — full telemetry portfolio', () => {
  test('all repos with known telemetry → 100% on all three signals', () => {
    var repos = [
      makeRepo({ id: 1, ciStatus: 'passing', releaseStatus: 'healthy',  contributorStatus: 'healthy'      }),
      makeRepo({ id: 2, ciStatus: 'failing', releaseStatus: 'stale',    contributorStatus: 'dormant'      }),
      makeRepo({ id: 3, ciStatus: 'passing', releaseStatus: 'none',     contributorStatus: 'low_activity' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.repoCount).toBe(3);
    expect(r.ciCoverage.percentage).toBe(100);
    expect(r.ciCoverage.level).toBe('high');
    expect(r.releaseCoverage.percentage).toBe(100);
    expect(r.releaseCoverage.level).toBe('high');
    expect(r.contributorCoverage.percentage).toBe(100);
    expect(r.contributorCoverage.level).toBe('high');
    expect(r.telemetryCompleteness.percentage).toBe(100);
    expect(r.telemetryCompleteness.level).toBe('high');
  });

  test('full telemetry + high depth + zero stale → overallMaturity high', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 10 }),
      makeRepo({ id: 2, snapshotCount: 12 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(11);
    expect(r.historicalDepth.level).toBe('high');
    expect(r.syncFreshness.level).toBe('high');
    expect(r.overallMaturity).toBe('high');
  });
});

// ── partial telemetry ─────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — partial telemetry', () => {
  test('2 of 5 known CI (40%) → medium', () => {
    var repos = [
      makeRepo({ id: 1, ciStatus: 'passing' }),
      makeRepo({ id: 2, ciStatus: 'failing' }),
      makeRepo({ id: 3, ciStatus: 'unknown' }),
      makeRepo({ id: 4, ciStatus: 'unknown' }),
      makeRepo({ id: 5, ciStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.percentage).toBe(40);
    expect(r.ciCoverage.level).toBe('medium');
  });

  test('0 of 2 known contributor → 0% → low', () => {
    var repos = [
      makeRepo({ id: 1, contributorStatus: 'unknown' }),
      makeRepo({ id: 2, contributorStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.contributorCoverage.percentage).toBe(0);
    expect(r.contributorCoverage.level).toBe('low');
  });

  test('2 of 5 known release (40%) → medium (≥30)', () => {
    var repos = [
      makeRepo({ id: 1, releaseStatus: 'healthy' }),
      makeRepo({ id: 2, releaseStatus: 'stale'   }),
      makeRepo({ id: 3, releaseStatus: 'unknown' }),
      makeRepo({ id: 4, releaseStatus: 'unknown' }),
      makeRepo({ id: 5, releaseStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.releaseCoverage.percentage).toBe(40);
    expect(r.releaseCoverage.level).toBe('medium');
  });

  test('empty string status treated as unknown (not covered)', () => {
    var repos = [
      makeRepo({ id: 1, ciStatus: '' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.percentage).toBe(0);
    expect(r.ciCoverage.level).toBe('low');
  });
});

// ── telemetryCompleteness ─────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — telemetryCompleteness', () => {
  test('completeness is avg of the three coverage percentages (rounded)', () => {
    // CI: 2/4=50%, release: 4/4=100%, contributor: 0/4=0% → avg=50%
    var repos = [
      makeRepo({ id: 1, ciStatus: 'passing', releaseStatus: 'healthy', contributorStatus: 'unknown' }),
      makeRepo({ id: 2, ciStatus: 'failing', releaseStatus: 'stale',   contributorStatus: 'unknown' }),
      makeRepo({ id: 3, ciStatus: 'unknown', releaseStatus: 'none',    contributorStatus: 'unknown' }),
      makeRepo({ id: 4, ciStatus: 'unknown', releaseStatus: 'healthy', contributorStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.percentage).toBe(50);
    expect(r.releaseCoverage.percentage).toBe(100);
    expect(r.contributorCoverage.percentage).toBe(0);
    expect(r.telemetryCompleteness.percentage).toBe(50);
    expect(r.telemetryCompleteness.level).toBe('medium');
  });

  test('all 100% → completeness 100% → high', () => {
    var repos = [makeRepo({ id: 1 })];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.telemetryCompleteness.percentage).toBe(100);
    expect(r.telemetryCompleteness.level).toBe('high');
  });
});

// ── historicalDepth ───────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — historicalDepth', () => {
  test('averageSnapshots computed correctly', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 10 }),
      makeRepo({ id: 2, snapshotCount:  5 }),
      makeRepo({ id: 3, snapshotCount:  3 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(6);
    expect(r.historicalDepth.level).toBe('medium');
  });

  test('avg ≥ 10 → depth high', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 15 }),
      makeRepo({ id: 2, snapshotCount: 10 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(12.5);
    expect(r.historicalDepth.level).toBe('high');
  });

  test('avg < 5 → depth low', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 1 }),
      makeRepo({ id: 2, snapshotCount: 2 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(1.5);
    expect(r.historicalDepth.level).toBe('low');
  });

  test('null / undefined snapshotCount treated as 0', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: null      }),
      makeRepo({ id: 2, snapshotCount: undefined }),
      makeRepo({ id: 3, snapshotCount: 10        }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(3.3);
    expect(r.historicalDepth.level).toBe('low');
  });

  test('avg exactly 5 → medium (boundary)', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 5 }),
      makeRepo({ id: 2, snapshotCount: 5 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(5);
    expect(r.historicalDepth.level).toBe('medium');
  });
});

// ── syncFreshness ─────────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — syncFreshness', () => {
  test('0 stale → freshness high', () => {
    var fresh = new Date(NOW_MS - 60 * 1000).toISOString();
    var repos = [
      makeRepo({ id: 1, lastSyncedAt: fresh }),
      makeRepo({ id: 2, lastSyncedAt: fresh }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(0);
    expect(r.syncFreshness.stalePercentage).toBe(0);
    expect(r.syncFreshness.level).toBe('high');
  });

  test('1 of 5 stale (20%) → freshness medium', () => {
    var fresh = new Date(NOW_MS - 60 * 1000).toISOString();
    var stale = new Date(NOW_MS - STALE_MS - 1000).toISOString();
    var repos = [
      makeRepo({ id: 1, lastSyncedAt: stale }),
      makeRepo({ id: 2, lastSyncedAt: fresh }),
      makeRepo({ id: 3, lastSyncedAt: fresh }),
      makeRepo({ id: 4, lastSyncedAt: fresh }),
      makeRepo({ id: 5, lastSyncedAt: fresh }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(1);
    expect(r.syncFreshness.stalePercentage).toBe(20);
    expect(r.syncFreshness.level).toBe('medium');
  });

  test('2 of 5 stale (40%) → freshness low', () => {
    var fresh = new Date(NOW_MS - 60 * 1000).toISOString();
    var stale = new Date(NOW_MS - STALE_MS - 1000).toISOString();
    var repos = [
      makeRepo({ id: 1, lastSyncedAt: stale }),
      makeRepo({ id: 2, lastSyncedAt: stale }),
      makeRepo({ id: 3, lastSyncedAt: fresh }),
      makeRepo({ id: 4, lastSyncedAt: fresh }),
      makeRepo({ id: 5, lastSyncedAt: fresh }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(2);
    expect(r.syncFreshness.stalePercentage).toBe(40);
    expect(r.syncFreshness.level).toBe('low');
  });

  test('null lastSyncedAt → treated as stale', () => {
    var repos = [ makeRepo({ id: 1, lastSyncedAt: null }) ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(1);
    expect(r.syncFreshness.level).toBe('low');
  });

  test('invalid date string → treated as stale', () => {
    var repos = [ makeRepo({ id: 1, lastSyncedAt: 'not-a-date' }) ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(1);
  });

  test('exactly 7 days old (not past boundary) → fresh', () => {
    // _isStale uses strict > so exactly STALE_MS ago is NOT stale
    var exact = new Date(NOW_MS - STALE_MS).toISOString();
    var repos = [ makeRepo({ id: 1, lastSyncedAt: exact }) ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.staleCount).toBe(0);
    expect(r.syncFreshness.level).toBe('high');
  });
});

// ── overallMaturity ───────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — overallMaturity', () => {
  test('any key coverage low → overallMaturity low', () => {
    // CI coverage 0% → low; release and contributor are high from defaults
    var repos = [
      makeRepo({ id: 1, ciStatus: 'unknown' }),
      makeRepo({ id: 2, ciStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.level).toBe('low');
    expect(r.overallMaturity).toBe('low');
  });

  test('all coverages high but depth low → overallMaturity medium', () => {
    var repos = [
      makeRepo({ id: 1, snapshotCount: 1 }),
      makeRepo({ id: 2, snapshotCount: 2 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.level).toBe('high');
    expect(r.releaseCoverage.level).toBe('high');
    expect(r.contributorCoverage.level).toBe('high');
    expect(r.historicalDepth.level).toBe('low');
    expect(r.overallMaturity).toBe('medium');
  });

  test('all coverages high but freshness low → overallMaturity medium', () => {
    var stale = new Date(NOW_MS - STALE_MS - 1000).toISOString();
    var repos = [
      makeRepo({ id: 1, lastSyncedAt: stale, snapshotCount: 10 }),
      makeRepo({ id: 2, lastSyncedAt: stale, snapshotCount: 10 }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.syncFreshness.level).toBe('low');
    expect(r.overallMaturity).toBe('medium');
  });

  test('all coverages high + depth medium + freshness high → overallMaturity high', () => {
    var fresh = new Date(NOW_MS - 60 * 1000).toISOString();
    var repos = [
      makeRepo({ id: 1, snapshotCount: 7, lastSyncedAt: fresh }),
      makeRepo({ id: 2, snapshotCount: 6, lastSyncedAt: fresh }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.level).toBe('high');
    expect(r.releaseCoverage.level).toBe('high');
    expect(r.contributorCoverage.level).toBe('high');
    expect(r.historicalDepth.level).toBe('medium'); // avg 6.5 ≥ 5 < 10
    expect(r.syncFreshness.level).toBe('high');
    expect(r.overallMaturity).toBe('high');
  });

  test('all coverages high + depth high + freshness medium → overallMaturity high', () => {
    var fresh = new Date(NOW_MS - 60 * 1000).toISOString();
    var stale = new Date(NOW_MS - STALE_MS - 1000).toISOString();
    // 1 of 5 = 20% stale → medium freshness
    var repos = [
      makeRepo({ id: 1, snapshotCount: 10, lastSyncedAt: stale  }),
      makeRepo({ id: 2, snapshotCount: 10, lastSyncedAt: fresh  }),
      makeRepo({ id: 3, snapshotCount: 10, lastSyncedAt: fresh  }),
      makeRepo({ id: 4, snapshotCount: 10, lastSyncedAt: fresh  }),
      makeRepo({ id: 5, snapshotCount: 10, lastSyncedAt: fresh  }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.level).toBe('high');
    expect(r.syncFreshness.level).toBe('medium');
    expect(r.overallMaturity).toBe('high');
  });
});

// ── threshold boundaries ──────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — threshold boundaries', () => {
  test('CI exactly 80% → high', () => {
    var repos = Array.from({ length: 5 }, function(_, i) {
      return makeRepo({ id: i + 1, ciStatus: i < 4 ? 'passing' : 'unknown' });
    });
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.percentage).toBe(80);
    expect(r.ciCoverage.level).toBe('high');
  });

  test('CI at 75% (3 of 4) → medium (< 80)', () => {
    var repos = [
      makeRepo({ id: 1, ciStatus: 'passing' }),
      makeRepo({ id: 2, ciStatus: 'passing' }),
      makeRepo({ id: 3, ciStatus: 'passing' }),
      makeRepo({ id: 4, ciStatus: 'unknown' }),
    ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.ciCoverage.percentage).toBe(75);
    expect(r.ciCoverage.level).toBe('medium');
  });

  test('release exactly 70% → high', () => {
    var repos = Array.from({ length: 10 }, function(_, i) {
      return makeRepo({ id: i + 1, releaseStatus: i < 7 ? 'healthy' : 'unknown' });
    });
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.releaseCoverage.percentage).toBe(70);
    expect(r.releaseCoverage.level).toBe('high');
  });

  test('release exactly 30% → medium', () => {
    var repos = Array.from({ length: 10 }, function(_, i) {
      return makeRepo({ id: i + 1, releaseStatus: i < 3 ? 'healthy' : 'unknown' });
    });
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.releaseCoverage.percentage).toBe(30);
    expect(r.releaseCoverage.level).toBe('medium');
  });

  test('release at 29% (2 of 7) → low', () => {
    var repos = Array.from({ length: 7 }, function(_, i) {
      return makeRepo({ id: i + 1, releaseStatus: i < 2 ? 'healthy' : 'unknown' });
    });
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.releaseCoverage.percentage).toBe(29);
    expect(r.releaseCoverage.level).toBe('low');
  });

  test('contributor exactly 40% → medium', () => {
    var repos = Array.from({ length: 5 }, function(_, i) {
      return makeRepo({ id: i + 1, contributorStatus: i < 2 ? 'healthy' : 'unknown' });
    });
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.contributorCoverage.percentage).toBe(40);
    expect(r.contributorCoverage.level).toBe('medium');
  });

  test('depth exactly 10 → high', () => {
    var repos = [ makeRepo({ id: 1, snapshotCount: 10 }) ];
    var r = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r.historicalDepth.averageSnapshots).toBe(10);
    expect(r.historicalDepth.level).toBe('high');
  });
});

// ── determinism ───────────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — determinism', () => {
  test('same input → identical output on repeated calls', () => {
    var repos = [
      makeRepo({ id: 1, ciStatus: 'passing', snapshotCount: 8  }),
      makeRepo({ id: 2, ciStatus: 'unknown', snapshotCount: 3  }),
    ];
    var r1 = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    var r2 = buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(r1).toEqual(r2);
  });
});

// ── non-mutation ──────────────────────────────────────────────────────────────

describe('buildTelemetryCoverageSummary — non-mutation', () => {
  test('input array and repo objects are not modified', () => {
    var repos = [
      makeRepo({ id: 1 }),
      makeRepo({ id: 2 }),
    ];
    var len0    = repos.length;
    var id0     = repos[0].id;
    var ci0     = repos[0].ciStatus;
    var snap0   = repos[0].snapshotCount;
    buildTelemetryCoverageSummary(repos, { _nowMs: NOW_MS });
    expect(repos.length).toBe(len0);
    expect(repos[0].id).toBe(id0);
    expect(repos[0].ciStatus).toBe(ci0);
    expect(repos[0].snapshotCount).toBe(snap0);
  });
});
