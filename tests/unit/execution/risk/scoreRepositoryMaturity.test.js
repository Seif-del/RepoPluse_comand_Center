'use strict';

const { scoreRepositoryMaturity } = require('../../../../execution/risk/scoreRepositoryMaturity');

// ── Shared fixtures ───────────────────────────────────────────────────────────

// Fully mature inputs — all signals known, healthy, fresh telemetry.
function mature() {
  return {
    ciStatus:          'passing',
    releaseStatus:     'healthy',
    contributorStatus: 'healthy',
    commits7d:         10,
    hasRecentCommit:   true,
    prTelemetryStatus: 'active',
    lastSyncedAt:      new Date().toISOString(),  // today → freshnessScore=5
    snapshotCount:     15,                         // depthScore=5 → telemetry=10
  };
  // Score: ci(20)+release(20)+contributor(20)+activity(20)+pr(10)+telemetry(10)=100
}

// All signals unknown — no usable telemetry.
function unknown() {
  return {
    ciStatus:          'unknown',
    releaseStatus:     'unknown',
    contributorStatus: 'unknown',
    commits7d:         null,
    prTelemetryStatus: 'unknown',
    lastSyncedAt:      null,
    snapshotCount:     0,
  };
  // Score: 0 → level 'unknown'
}

// A well-known stale date (> 30 days ago in any reasonable test run).
const STALE_DATE = '2020-01-01T00:00:00.000Z';

// ── Return shape ──────────────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — return shape', () => {
  it('returns all required top-level keys', () => {
    const result = scoreRepositoryMaturity(mature());
    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      'confidenceLevel', 'dimensions', 'gaps', 'maturityLevel', 'maturityScore', 'recommendations',
    ]);
  });

  it('maturityScore is a number between 0 and 100', () => {
    const { maturityScore } = scoreRepositoryMaturity(mature());
    expect(typeof maturityScore).toBe('number');
    expect(maturityScore).toBeGreaterThanOrEqual(0);
    expect(maturityScore).toBeLessThanOrEqual(100);
  });

  it('maturityLevel is one of the valid level strings', () => {
    const valid = ['mature', 'developing', 'immature', 'unknown'];
    expect(valid).toContain(scoreRepositoryMaturity(mature()).maturityLevel);
    expect(valid).toContain(scoreRepositoryMaturity(unknown()).maturityLevel);
  });

  it('dimensions object contains all six dimension keys', () => {
    const { dimensions } = scoreRepositoryMaturity(mature());
    expect(Object.keys(dimensions).sort()).toEqual([
      'activityMaturity', 'ciMaturity', 'contributorMaturity',
      'prWorkflowMaturity', 'releaseMaturity', 'telemetryMaturity',
    ]);
  });

  it('gaps is an array', () => {
    expect(Array.isArray(scoreRepositoryMaturity(mature()).gaps)).toBe(true);
    expect(Array.isArray(scoreRepositoryMaturity(unknown()).gaps)).toBe(true);
  });

  it('recommendations is an array', () => {
    expect(Array.isArray(scoreRepositoryMaturity(mature()).recommendations)).toBe(true);
    expect(Array.isArray(scoreRepositoryMaturity(unknown()).recommendations)).toBe(true);
  });

  it('confidenceLevel is one of low | medium | high', () => {
    const valid = ['low', 'medium', 'high'];
    expect(valid).toContain(scoreRepositoryMaturity(mature()).confidenceLevel);
    expect(valid).toContain(scoreRepositoryMaturity(unknown()).confidenceLevel);
  });

  it('called with no arguments returns a valid result (all defaults)', () => {
    const result = scoreRepositoryMaturity();
    expect(result.maturityScore).toBe(0);
    expect(result.maturityLevel).toBe('unknown');
  });
});

// ── Empty / unknown telemetry ─────────────────────────────────────────────────

describe('scoreRepositoryMaturity — empty / unknown telemetry', () => {
  it('all unknown signals produce score 0', () => {
    expect(scoreRepositoryMaturity(unknown()).maturityScore).toBe(0);
  });

  it('all unknown signals produce level unknown', () => {
    expect(scoreRepositoryMaturity(unknown()).maturityLevel).toBe('unknown');
  });

  it('all unknown signals produce low confidence', () => {
    expect(scoreRepositoryMaturity(unknown()).confidenceLevel).toBe('low');
  });

  it('no arguments produces score 0 and level unknown', () => {
    const r = scoreRepositoryMaturity();
    expect(r.maturityScore).toBe(0);
    expect(r.maturityLevel).toBe('unknown');
  });

  it('unknown inputs produce multiple gap entries', () => {
    expect(scoreRepositoryMaturity(unknown()).gaps.length).toBeGreaterThan(0);
  });

  it('all-unknown dimensions are each 0', () => {
    const { dimensions } = scoreRepositoryMaturity(unknown());
    expect(dimensions.ciMaturity).toBe(0);
    expect(dimensions.releaseMaturity).toBe(0);
    expect(dimensions.contributorMaturity).toBe(0);
    expect(dimensions.activityMaturity).toBe(0);
    expect(dimensions.prWorkflowMaturity).toBe(0);
    expect(dimensions.telemetryMaturity).toBe(0);
  });
});

// ── Fully mature repo ─────────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — fully mature repo', () => {
  it('perfect inputs score 100', () => {
    expect(scoreRepositoryMaturity(mature()).maturityScore).toBe(100);
  });

  it('perfect inputs produce level mature', () => {
    expect(scoreRepositoryMaturity(mature()).maturityLevel).toBe('mature');
  });

  it('perfect inputs produce high confidence', () => {
    expect(scoreRepositoryMaturity(mature()).confidenceLevel).toBe('high');
  });

  it('mature repo has empty recommendations', () => {
    // All signals healthy → nothing actionable to recommend from the major dimensions.
    const { recommendations } = scoreRepositoryMaturity(mature());
    // No CI/release/contributor/PR/staleness recommendations expected.
    expect(recommendations.some(r => r.toLowerCase().includes('ci'))).toBe(false);
    expect(recommendations.some(r => r.toLowerCase().includes('release cadence'))).toBe(false);
  });
});

// ── ciMaturity dimension ──────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — ciMaturity dimension', () => {
  it('ci passing → ciMaturity = 20', () => {
    expect(scoreRepositoryMaturity({ ciStatus: 'passing' }).dimensions.ciMaturity).toBe(20);
  });

  it('ci failing → ciMaturity = 10 (CI exists but broken)', () => {
    expect(scoreRepositoryMaturity({ ciStatus: 'failing' }).dimensions.ciMaturity).toBe(10);
  });

  it('ci unknown → ciMaturity = 0', () => {
    expect(scoreRepositoryMaturity({ ciStatus: 'unknown' }).dimensions.ciMaturity).toBe(0);
  });

  it('ci unknown reduces overall score relative to ci passing', () => {
    const withPassing = scoreRepositoryMaturity({ ...mature(), ciStatus: 'passing' });
    const withUnknown = scoreRepositoryMaturity({ ...mature(), ciStatus: 'unknown' });
    expect(withUnknown.maturityScore).toBeLessThan(withPassing.maturityScore);
    expect(withPassing.maturityScore - withUnknown.maturityScore).toBe(20);
  });

  it('ci passing adds gap about CI failing when ci is failing', () => {
    const { gaps } = scoreRepositoryMaturity({ ciStatus: 'failing' });
    expect(gaps.some(g => g.toLowerCase().includes('failing'))).toBe(true);
  });
});

// ── releaseMaturity dimension ─────────────────────────────────────────────────

describe('scoreRepositoryMaturity — releaseMaturity dimension', () => {
  it('release healthy → releaseMaturity = 20', () => {
    expect(scoreRepositoryMaturity({ releaseStatus: 'healthy' }).dimensions.releaseMaturity).toBe(20);
  });

  it('release stale → releaseMaturity = 10', () => {
    expect(scoreRepositoryMaturity({ releaseStatus: 'stale' }).dimensions.releaseMaturity).toBe(10);
  });

  it('release none → releaseMaturity = 4 (reduced but not zero — maturity signal only)', () => {
    expect(scoreRepositoryMaturity({ releaseStatus: 'none' }).dimensions.releaseMaturity).toBe(4);
  });

  it('release unknown → releaseMaturity = 0', () => {
    expect(scoreRepositoryMaturity({ releaseStatus: 'unknown' }).dimensions.releaseMaturity).toBe(0);
  });

  it('no releases reduces maturity from healthy baseline but not catastrophically', () => {
    const withHealthy = scoreRepositoryMaturity({ ...mature(), releaseStatus: 'healthy' });
    const withNone    = scoreRepositoryMaturity({ ...mature(), releaseStatus: 'none' });
    expect(withNone.maturityScore).toBeLessThan(withHealthy.maturityScore);
    // 20 → 4 = -16 pts; still mature (100-16=84 ≥ 75)
    expect(withNone.maturityLevel).toBe('mature');
    expect(withHealthy.maturityScore - withNone.maturityScore).toBe(16);
  });

  it('release unknown reduces maturity more than release none', () => {
    const withNone    = scoreRepositoryMaturity({ releaseStatus: 'none'    }).dimensions.releaseMaturity;
    const withUnknown = scoreRepositoryMaturity({ releaseStatus: 'unknown' }).dimensions.releaseMaturity;
    expect(withNone).toBeGreaterThan(withUnknown);
  });
});

// ── contributorMaturity dimension ─────────────────────────────────────────────

describe('scoreRepositoryMaturity — contributorMaturity dimension', () => {
  it('contributor healthy → contributorMaturity = 20', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'healthy' }).dimensions.contributorMaturity).toBe(20);
  });

  it('contributor low_activity → contributorMaturity = 12', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'low_activity' }).dimensions.contributorMaturity).toBe(12);
  });

  it('contributor bus_factor_risk → contributorMaturity = 8', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'bus_factor_risk' }).dimensions.contributorMaturity).toBe(8);
  });

  it('contributor abandoned → contributorMaturity = 2 (known state, not zero)', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'abandoned' }).dimensions.contributorMaturity).toBe(2);
  });

  it('contributor dormant → contributorMaturity = 4', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'dormant' }).dimensions.contributorMaturity).toBe(4);
  });

  it('contributor unknown → contributorMaturity = 0', () => {
    expect(scoreRepositoryMaturity({ contributorStatus: 'unknown' }).dimensions.contributorMaturity).toBe(0);
  });

  it('bus factor reduces contributor maturity from healthy baseline', () => {
    const withHealthy = scoreRepositoryMaturity({ ...mature(), contributorStatus: 'healthy' });
    const withBus     = scoreRepositoryMaturity({ ...mature(), contributorStatus: 'bus_factor_risk' });
    expect(withBus.maturityScore).toBeLessThan(withHealthy.maturityScore);
    expect(withHealthy.maturityScore - withBus.maturityScore).toBe(12); // 20 - 8
  });
});

// ── activityMaturity dimension ────────────────────────────────────────────────

describe('scoreRepositoryMaturity — activityMaturity dimension', () => {
  it('commits7d > 0 → activityMaturity = 20', () => {
    expect(scoreRepositoryMaturity({ commits7d: 5 }).dimensions.activityMaturity).toBe(20);
    expect(scoreRepositoryMaturity({ commits7d: 1 }).dimensions.activityMaturity).toBe(20);
  });

  it('commits7d === 0 and hasRecentCommit true → activityMaturity = 10', () => {
    expect(scoreRepositoryMaturity({ commits7d: 0, hasRecentCommit: true }).dimensions.activityMaturity).toBe(10);
  });

  it('commits7d === 0 and hasRecentCommit false → activityMaturity = 4 (confirmed dormant)', () => {
    expect(scoreRepositoryMaturity({ commits7d: 0, hasRecentCommit: false }).dimensions.activityMaturity).toBe(4);
  });

  it('commits7d === 0 and hasRecentCommit null → activityMaturity = 6 (longer-range unknown)', () => {
    expect(scoreRepositoryMaturity({ commits7d: 0, hasRecentCommit: null }).dimensions.activityMaturity).toBe(6);
    expect(scoreRepositoryMaturity({ commits7d: 0 }).dimensions.activityMaturity).toBe(6);
  });

  it('commits7d null → activityMaturity = 0 (no data at all)', () => {
    expect(scoreRepositoryMaturity({ commits7d: null }).dimensions.activityMaturity).toBe(0);
    expect(scoreRepositoryMaturity({}).dimensions.activityMaturity).toBe(0);
  });

  it('no commits reduces activity maturity from active baseline', () => {
    const withCommits   = scoreRepositoryMaturity({ ...mature(), commits7d: 5 });
    const withNoCommits = scoreRepositoryMaturity({ ...mature(), commits7d: 0 });
    expect(withNoCommits.maturityScore).toBeLessThan(withCommits.maturityScore);
    // commits7d=0, hasRecentCommit=true (from mature()) → activityScore=10 (vs 20)
    expect(withCommits.maturityScore - withNoCommits.maturityScore).toBe(10);
  });
});

// ── prWorkflowMaturity dimension ──────────────────────────────────────────────

describe('scoreRepositoryMaturity — prWorkflowMaturity dimension', () => {
  it('prTelemetryStatus active → prWorkflowMaturity = 10', () => {
    expect(scoreRepositoryMaturity({ prTelemetryStatus: 'active' }).dimensions.prWorkflowMaturity).toBe(10);
  });

  it('prTelemetryStatus none (direct-push) → prWorkflowMaturity = 6 (neutral, not penalized)', () => {
    expect(scoreRepositoryMaturity({ prTelemetryStatus: 'none' }).dimensions.prWorkflowMaturity).toBe(6);
  });

  it('prTelemetryStatus unknown → prWorkflowMaturity = 0', () => {
    expect(scoreRepositoryMaturity({ prTelemetryStatus: 'unknown' }).dimensions.prWorkflowMaturity).toBe(0);
  });

  it('direct-push workflow is not treated as failure — none gives higher score than unknown', () => {
    const withNone    = scoreRepositoryMaturity({ prTelemetryStatus: 'none'    }).dimensions.prWorkflowMaturity;
    const withUnknown = scoreRepositoryMaturity({ prTelemetryStatus: 'unknown' }).dimensions.prWorkflowMaturity;
    expect(withNone).toBeGreaterThan(withUnknown);
    expect(withNone).toBe(6);
    expect(withUnknown).toBe(0);
  });

  it('repo with direct-push workflow stays mature when all other signals are healthy', () => {
    // ci(20)+release(20)+contributor(20)+activity(20)+pr(6)+telemetry(10)=96 → mature
    const result = scoreRepositoryMaturity({ ...mature(), prTelemetryStatus: 'none' });
    expect(result.maturityLevel).toBe('mature');
    expect(result.maturityScore).toBe(96);
  });

  it('pr none does NOT add a gap about pull requests being unavailable', () => {
    const { gaps } = scoreRepositoryMaturity({ prTelemetryStatus: 'none' });
    expect(gaps.some(g => g.toLowerCase().includes('pull request telemetry'))).toBe(false);
  });

  it('pr unknown DOES add a gap about pull request telemetry', () => {
    const { gaps } = scoreRepositoryMaturity({ prTelemetryStatus: 'unknown' });
    expect(gaps.some(g => g.toLowerCase().includes('pull request'))).toBe(true);
  });
});

// ── telemetryMaturity dimension ───────────────────────────────────────────────

describe('scoreRepositoryMaturity — telemetryMaturity dimension', () => {
  it('fresh sync (today) + 15 snapshots → telemetryMaturity = 10 (max)', () => {
    // freshnessScore=5 (< 1 day) + depthScore=5 (≥ 10) = 10
    const result = scoreRepositoryMaturity({
      lastSyncedAt: new Date().toISOString(),
      snapshotCount: 15,
    });
    expect(result.dimensions.telemetryMaturity).toBe(10);
  });

  it('stale sync (> 30 days) → freshnessScore = 0', () => {
    // freshnessScore=0, depthScore=5 (snapshotCount=10) → telemetryMaturity=5
    const result = scoreRepositoryMaturity({ lastSyncedAt: STALE_DATE, snapshotCount: 10 });
    expect(result.dimensions.telemetryMaturity).toBe(5);
  });

  it('stale sync reduces telemetry maturity compared to fresh sync', () => {
    const fresh = scoreRepositoryMaturity({ lastSyncedAt: new Date().toISOString(), snapshotCount: 10 });
    const stale = scoreRepositoryMaturity({ lastSyncedAt: STALE_DATE,              snapshotCount: 10 });
    expect(stale.dimensions.telemetryMaturity).toBeLessThan(fresh.dimensions.telemetryMaturity);
  });

  it('no sync data at all → telemetryMaturity = 0 when snapshotCount also 0', () => {
    expect(scoreRepositoryMaturity({ lastSyncedAt: null, snapshotCount: 0 }).dimensions.telemetryMaturity).toBe(0);
    expect(scoreRepositoryMaturity({}).dimensions.telemetryMaturity).toBe(0);
  });

  it('snapshotCount alone improves telemetry maturity (no sync date)', () => {
    // No lastSyncedAt → freshnessScore=0; snapshotCount=5 → depthScore=4 → telemetryMaturity=4
    expect(scoreRepositoryMaturity({ snapshotCount: 5 }).dimensions.telemetryMaturity).toBe(4);
  });

  it('snapshotCount 1 → depthScore = 1', () => {
    expect(scoreRepositoryMaturity({ snapshotCount: 1 }).dimensions.telemetryMaturity).toBe(1);
  });

  it('snapshotCount 2 → depthScore = 2', () => {
    expect(scoreRepositoryMaturity({ snapshotCount: 2 }).dimensions.telemetryMaturity).toBe(2);
  });

  it('snapshotCount 10 → depthScore = 5', () => {
    expect(scoreRepositoryMaturity({ snapshotCount: 10 }).dimensions.telemetryMaturity).toBe(5);
  });

  it('stale sync adds a gap about stale sync', () => {
    const { gaps } = scoreRepositoryMaturity({ lastSyncedAt: STALE_DATE });
    expect(gaps.some(g => g.toLowerCase().includes('stale'))).toBe(true);
  });
});

// ── Confidence level ──────────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — confidence level', () => {
  it('≥4 known signals and snapshotCount ≥ 5 → high confidence', () => {
    // ci+release+contributor+commits7d (=4 known), snapshotCount=5
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'healthy',
      contributorStatus: 'healthy', commits7d: 5,
      snapshotCount: 5,
    });
    expect(result.confidenceLevel).toBe('high');
  });

  it('≥3 known signals and snapshotCount ≥ 2 → medium confidence', () => {
    // ci+release+contributor (=3 known), snapshotCount=3 (no commits7d or pr)
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'healthy',
      contributorStatus: 'healthy',
      snapshotCount: 3,
    });
    expect(result.confidenceLevel).toBe('medium');
  });

  it('fewer than 3 known signals → low confidence', () => {
    // Only ci known
    const result = scoreRepositoryMaturity({ ciStatus: 'passing', snapshotCount: 10 });
    expect(result.confidenceLevel).toBe('low');
  });

  it('≥4 known signals but snapshotCount < 5 → not high (medium or low)', () => {
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'healthy',
      contributorStatus: 'healthy', commits7d: 5,
      snapshotCount: 2,  // below high threshold
    });
    expect(result.confidenceLevel).not.toBe('high');
  });

  it('all unknown signals → low confidence', () => {
    expect(scoreRepositoryMaturity(unknown()).confidenceLevel).toBe('low');
  });

  it('fully mature repo with many snapshots → high confidence', () => {
    expect(scoreRepositoryMaturity(mature()).confidenceLevel).toBe('high');
  });

  it('prTelemetryStatus active counts as a known signal toward confidence', () => {
    // ci+release+contributor+prTelemetry (=4), snapshotCount=5 → high
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'healthy',
      contributorStatus: 'healthy', prTelemetryStatus: 'active',
      snapshotCount: 5,
    });
    expect(result.confidenceLevel).toBe('high');
  });
});

// ── Maturity level thresholds ─────────────────────────────────────────────────

describe('scoreRepositoryMaturity — maturity level thresholds', () => {
  it('score 0 → unknown', () => {
    // All unknown/null → 0
    expect(scoreRepositoryMaturity(unknown()).maturityLevel).toBe('unknown');
    expect(scoreRepositoryMaturity(unknown()).maturityScore).toBe(0);
  });

  it('score 1 → immature (minimum above unknown)', () => {
    // Only snapshotCount=1 → telemetry=1 → score=1
    const result = scoreRepositoryMaturity({ snapshotCount: 1 });
    expect(result.maturityScore).toBe(1);
    expect(result.maturityLevel).toBe('immature');
  });

  it('score 44 → immature (developing threshold is 45)', () => {
    // ci:passing(20)+release:stale(10)+contributor:bus_factor(8)+activity:6(commits7d=0)+pr:0+telemetry:0 = 44
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'stale',
      contributorStatus: 'bus_factor_risk', commits7d: 0,
    });
    expect(result.maturityScore).toBe(44);
    expect(result.maturityLevel).toBe('immature');
  });

  it('score 45 → developing (exact minimum)', () => {
    // Same as above plus snapshotCount:1 → +1 → 45
    const result = scoreRepositoryMaturity({
      ciStatus: 'passing', releaseStatus: 'stale',
      contributorStatus: 'bus_factor_risk', commits7d: 0,
      snapshotCount: 1,
    });
    expect(result.maturityScore).toBe(45);
    expect(result.maturityLevel).toBe('developing');
  });

  it('score 74 → developing (mature threshold is 75)', () => {
    // ci:unknown(0)+release:healthy(20)+contributor:healthy(20)+activity:20(commits7d=5)
    // +pr:active(10)+snapshotCount:5,no sync → depthScore=4 → telemetry=4 → total=74
    const result = scoreRepositoryMaturity({
      releaseStatus: 'healthy', contributorStatus: 'healthy',
      commits7d: 5, prTelemetryStatus: 'active',
      snapshotCount: 5, lastSyncedAt: null,
    });
    expect(result.maturityScore).toBe(74);
    expect(result.maturityLevel).toBe('developing');
  });

  it('score 75 → mature (exact minimum)', () => {
    // Same as above but snapshotCount:10 → depthScore=5 → telemetry=5 → total=75
    const result = scoreRepositoryMaturity({
      releaseStatus: 'healthy', contributorStatus: 'healthy',
      commits7d: 5, prTelemetryStatus: 'active',
      snapshotCount: 10, lastSyncedAt: null,
    });
    expect(result.maturityScore).toBe(75);
    expect(result.maturityLevel).toBe('mature');
  });

  it('score 100 → mature (maximum)', () => {
    expect(scoreRepositoryMaturity(mature()).maturityScore).toBe(100);
    expect(scoreRepositoryMaturity(mature()).maturityLevel).toBe('mature');
  });
});

// ── Gaps ─────────────────────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — gaps', () => {
  it('ci unknown → gap about CI not tracked', () => {
    const { gaps } = scoreRepositoryMaturity({ ciStatus: 'unknown' });
    expect(gaps.some(g => g.toLowerCase().includes('ci/cd') && g.toLowerCase().includes('not tracked'))).toBe(true);
  });

  it('ci failing → gap about CI failing (CI gap is not "not tracked")', () => {
    const { gaps } = scoreRepositoryMaturity({ ciStatus: 'failing' });
    expect(gaps.some(g => g.toLowerCase().includes('failing'))).toBe(true);
    // CI is known-failing so the CI gap should say "failing", not "not tracked"
    expect(gaps.some(g => g.toLowerCase().includes('ci/cd') && g.toLowerCase().includes('not tracked'))).toBe(false);
  });

  it('release none → gap about no releases', () => {
    const { gaps } = scoreRepositoryMaturity({ releaseStatus: 'none' });
    expect(gaps.some(g => g.toLowerCase().includes('no releases'))).toBe(true);
  });

  it('release stale → gap about stale releases', () => {
    const { gaps } = scoreRepositoryMaturity({ releaseStatus: 'stale' });
    expect(gaps.some(g => g.toLowerCase().includes('90 days'))).toBe(true);
  });

  it('bus_factor_risk → gap about bus factor', () => {
    const { gaps } = scoreRepositoryMaturity({ contributorStatus: 'bus_factor_risk' });
    expect(gaps.some(g => g.toLowerCase().includes('bus-factor'))).toBe(true);
  });

  it('commits7d === 0 → gap about no commits', () => {
    const { gaps } = scoreRepositoryMaturity({ commits7d: 0 });
    expect(gaps.some(g => g.toLowerCase().includes('no commits'))).toBe(true);
  });

  it('commits7d null → gap about commit data unavailable', () => {
    const { gaps } = scoreRepositoryMaturity({ commits7d: null });
    expect(gaps.some(g => g.toLowerCase().includes('commit activity data'))).toBe(true);
  });

  it('stale sync → gap about stale sync with days count', () => {
    const { gaps } = scoreRepositoryMaturity({ lastSyncedAt: STALE_DATE });
    expect(gaps.some(g => g.toLowerCase().includes('stale'))).toBe(true);
  });

  it('snapshotCount < 5 → gap about limited snapshot history', () => {
    const { gaps } = scoreRepositoryMaturity({ snapshotCount: 2 });
    expect(gaps.some(g => g.toLowerCase().includes('snapshot'))).toBe(true);
  });

  it('snapshotCount >= 5 → no snapshot gap', () => {
    const { gaps } = scoreRepositoryMaturity({ snapshotCount: 5 });
    expect(gaps.some(g => g.toLowerCase().includes('limited snapshot'))).toBe(false);
  });

  it('fully mature repo with many snapshots has no CI/release/contributor gaps', () => {
    const { gaps } = scoreRepositoryMaturity(mature());
    expect(gaps.some(g => g.toLowerCase().includes('ci/cd pipeline status is not tracked'))).toBe(false);
    expect(gaps.some(g => g.toLowerCase().includes('release history is not tracked'))).toBe(false);
    expect(gaps.some(g => g.toLowerCase().includes('contributor activity is not tracked'))).toBe(false);
  });

  it('dependency telemetry unknown → gap about dependency vulnerability telemetry', () => {
    const { gaps } = scoreRepositoryMaturity({ dependencyTelemetryStatus: 'unknown' });
    expect(gaps.some(g => g.toLowerCase().includes('dependency'))).toBe(true);
  });
});

// ── Recommendations ──────────────────────────────────────────────────────────

describe('scoreRepositoryMaturity — recommendations', () => {
  it('ci unknown → recommendation to set up CI', () => {
    const { recommendations } = scoreRepositoryMaturity({ ciStatus: 'unknown' });
    expect(recommendations.some(r => r.toLowerCase().includes('ci/cd'))).toBe(true);
  });

  it('ci failing → recommendation to fix CI', () => {
    const { recommendations } = scoreRepositoryMaturity({ ciStatus: 'failing' });
    expect(recommendations.some(r => r.toLowerCase().includes('fix'))).toBe(true);
  });

  it('release none → recommendation to create releases', () => {
    const { recommendations } = scoreRepositoryMaturity({ releaseStatus: 'none' });
    expect(recommendations.some(r => r.toLowerCase().includes('releases'))).toBe(true);
  });

  it('bus_factor_risk → recommendation to distribute code ownership', () => {
    const { recommendations } = scoreRepositoryMaturity({ contributorStatus: 'bus_factor_risk' });
    expect(recommendations.some(r => r.toLowerCase().includes('ownership'))).toBe(true);
  });

  it('stale sync → recommendation to sync more frequently', () => {
    const { recommendations } = scoreRepositoryMaturity({ lastSyncedAt: STALE_DATE });
    expect(recommendations.some(r => r.toLowerCase().includes('sync'))).toBe(true);
  });

  it('snapshotCount < 5 → recommendation to build historical depth', () => {
    const { recommendations } = scoreRepositoryMaturity({ snapshotCount: 2 });
    expect(recommendations.some(r => r.toLowerCase().includes('historical depth'))).toBe(true);
  });

  it('all healthy signals → no CI or release recommendations', () => {
    const { recommendations } = scoreRepositoryMaturity(mature());
    expect(recommendations.some(r => r.toLowerCase().includes('set up a ci'))).toBe(false);
    expect(recommendations.some(r => r.toLowerCase().includes('release cadence'))).toBe(false);
  });

  it('recommendations array is empty for a near-perfect repo with many snapshots', () => {
    // Mature + snapshotCount=5 → no staleness, no snapshot rec, all signals known & healthy
    const result = scoreRepositoryMaturity({
      ...mature(),
      snapshotCount: 5,
    });
    // snapshotCount ≥ 5 → no snapshot rec; all signals healthy → no other recs
    expect(result.recommendations).toHaveLength(0);
  });
});

// ── Structural / governance factor display context ────────────────────────────

describe('scoreRepositoryMaturity — structural factors appear in gaps for context', () => {
  it('no releases adds a gap even though it is a maturity signal not operational risk', () => {
    const { gaps, dimensions } = scoreRepositoryMaturity({ releaseStatus: 'none' });
    expect(dimensions.releaseMaturity).toBe(4);   // 4 pts, not 0 — not catastrophic
    expect(gaps.some(g => g.toLowerCase().includes('no releases'))).toBe(true);
  });

  it('bus factor adds a gap even though it is a structural concern, not operational risk', () => {
    const { gaps, dimensions } = scoreRepositoryMaturity({ contributorStatus: 'bus_factor_risk' });
    expect(dimensions.contributorMaturity).toBe(8);  // 8 pts, partial maturity
    expect(gaps.some(g => g.toLowerCase().includes('bus-factor'))).toBe(true);
  });

  it('no commits adds a gap even at low score impact', () => {
    const { gaps, dimensions } = scoreRepositoryMaturity({ commits7d: 0 });
    expect(dimensions.activityMaturity).toBe(6);   // partial score
    expect(gaps.some(g => g.toLowerCase().includes('no commits'))).toBe(true);
  });
});

// ── Threshold boundaries — dimensions ────────────────────────────────────────

describe('scoreRepositoryMaturity — dimension value boundaries', () => {
  it('each dimension is non-negative', () => {
    const { dimensions } = scoreRepositoryMaturity(unknown());
    Object.values(dimensions).forEach(v => expect(v).toBeGreaterThanOrEqual(0));
  });

  it('dimension values do not exceed their individual maximums', () => {
    const { dimensions } = scoreRepositoryMaturity(mature());
    expect(dimensions.ciMaturity).toBeLessThanOrEqual(20);
    expect(dimensions.releaseMaturity).toBeLessThanOrEqual(20);
    expect(dimensions.contributorMaturity).toBeLessThanOrEqual(20);
    expect(dimensions.activityMaturity).toBeLessThanOrEqual(20);
    expect(dimensions.prWorkflowMaturity).toBeLessThanOrEqual(10);
    expect(dimensions.telemetryMaturity).toBeLessThanOrEqual(10);
  });

  it('sum of all dimension values equals maturityScore', () => {
    const r = scoreRepositoryMaturity(mature());
    const dim = r.dimensions;
    const sum = dim.ciMaturity + dim.releaseMaturity + dim.contributorMaturity
              + dim.activityMaturity + dim.prWorkflowMaturity + dim.telemetryMaturity;
    expect(sum).toBe(r.maturityScore);
  });

  it('sum of dimensions for partial repo equals maturityScore', () => {
    const r = scoreRepositoryMaturity({ ciStatus: 'failing', releaseStatus: 'stale', snapshotCount: 3 });
    const dim = r.dimensions;
    const sum = dim.ciMaturity + dim.releaseMaturity + dim.contributorMaturity
              + dim.activityMaturity + dim.prWorkflowMaturity + dim.telemetryMaturity;
    expect(sum).toBe(r.maturityScore);
  });
});

// ── Determinism and non-mutation ──────────────────────────────────────────────

describe('scoreRepositoryMaturity — determinism and non-mutation', () => {
  it('returns identical output for identical inputs', () => {
    const input = {
      ciStatus: 'failing', releaseStatus: 'stale', contributorStatus: 'bus_factor_risk',
      commits7d: 0, prTelemetryStatus: 'active', snapshotCount: 3,
      lastSyncedAt: STALE_DATE,
    };
    const r1 = scoreRepositoryMaturity(input);
    const r2 = scoreRepositoryMaturity(input);
    expect(r1).toEqual(r2);
  });

  it('does not mutate the input object', () => {
    const input = { ciStatus: 'failing', releaseStatus: 'none', snapshotCount: 2 };
    const copy  = { ...input };
    scoreRepositoryMaturity(input);
    expect(input).toEqual(copy);
  });

  it('produces consistent maturityScore across multiple invocations with same inputs', () => {
    const input = { ciStatus: 'passing', contributorStatus: 'healthy', commits7d: 5, snapshotCount: 10 };
    const scores = Array.from({ length: 5 }, () => scoreRepositoryMaturity(input).maturityScore);
    expect(new Set(scores).size).toBe(1);
  });

  it('gaps and recommendations arrays are new instances each call (not shared references)', () => {
    const input = { ciStatus: 'unknown' };
    const r1 = scoreRepositoryMaturity(input);
    const r2 = scoreRepositoryMaturity(input);
    expect(r1.gaps).not.toBe(r2.gaps);
    expect(r1.recommendations).not.toBe(r2.recommendations);
  });
});
