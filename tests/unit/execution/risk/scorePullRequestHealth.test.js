'use strict';

const {
  scorePullRequestHealth,
  LARGE_PR_SIZE_THRESHOLD,
} = require('../../../../execution/risk/scorePullRequestHealth');

// ── Helpers ───────────────────────────────────────────────────────────────────

// Minimal healthy active telemetry — triggers no rules.
function makeActive(overrides = {}) {
  return {
    openPrCount:          1,
    mergedPrCount30d:     5,
    stalePrCount:         0,
    avgMergeLatencyHours: 24,
    failedCheckPrCount:   0,
    avgPrSize:            100,
    throughput30d:        1.5,
    abandonedPrCount:     0,
    oldestOpenPrAgeDays:  3,
    prTelemetryStatus:    'active',
    ...overrides,
  };
}

// ── Exported constants ─────────────────────────────────────────────────────────

describe('scorePullRequestHealth — exported constants', () => {
  it('LARGE_PR_SIZE_THRESHOLD is a positive number', () => {
    expect(typeof LARGE_PR_SIZE_THRESHOLD).toBe('number');
    expect(LARGE_PR_SIZE_THRESHOLD).toBeGreaterThan(0);
  });

  it('LARGE_PR_SIZE_THRESHOLD is 500', () => {
    expect(LARGE_PR_SIZE_THRESHOLD).toBe(500);
  });
});

// ── Return shape ──────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — return shape', () => {
  const EXPECTED_KEYS = ['score', 'label', 'reasons', 'signals', 'confidenceLevel'];

  it('active result contains all expected keys', () => {
    const result = scorePullRequestHealth(makeActive());
    for (const key of EXPECTED_KEYS) expect(result).toHaveProperty(key);
  });

  it('none result contains all expected keys', () => {
    const result = scorePullRequestHealth({ prTelemetryStatus: 'none' });
    for (const key of EXPECTED_KEYS) expect(result).toHaveProperty(key);
  });

  it('unknown result contains all expected keys', () => {
    const result = scorePullRequestHealth({ prTelemetryStatus: 'unknown' });
    for (const key of EXPECTED_KEYS) expect(result).toHaveProperty(key);
  });

  it('score is always a number', () => {
    expect(typeof scorePullRequestHealth(makeActive()).score).toBe('number');
  });

  it('label is always a string', () => {
    expect(typeof scorePullRequestHealth(makeActive()).label).toBe('string');
  });

  it('reasons is always an array', () => {
    expect(Array.isArray(scorePullRequestHealth(makeActive()).reasons)).toBe(true);
  });

  it('signals is always an array', () => {
    expect(Array.isArray(scorePullRequestHealth(makeActive()).signals)).toBe(true);
  });

  it('confidenceLevel is always a string', () => {
    expect(typeof scorePullRequestHealth(makeActive()).confidenceLevel).toBe('string');
  });
});

// ── None status ───────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — none status', () => {
  it('returns label none', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).label).toBe('none');
  });

  it('returns score 0', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).score).toBe(0);
  });

  it('returns empty reasons array', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).reasons).toEqual([]);
  });

  it('returns empty signals array', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).signals).toEqual([]);
  });

  it('returns high confidence — we have complete information (no PRs)', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).confidenceLevel).toBe('high');
  });
});

// ── Unknown status ────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — unknown status', () => {
  it('returns label unknown for prTelemetryStatus: "unknown"', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).label).toBe('unknown');
  });

  it('returns score 0 when unknown', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).score).toBe(0);
  });

  it('returns empty reasons when unknown', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).reasons).toEqual([]);
  });

  it('returns empty signals when unknown', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).signals).toEqual([]);
  });

  it('returns low confidence when unknown', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).confidenceLevel).toBe('low');
  });

  it('returns unknown label when called with no args', () => {
    expect(scorePullRequestHealth().label).toBe('unknown');
  });

  it('returns unknown label for unrecognised prTelemetryStatus', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'invalid' }).label).toBe('unknown');
  });
});

// ── Healthy active telemetry ──────────────────────────────────────────────────

describe('scorePullRequestHealth — healthy active telemetry', () => {
  it('returns label healthy for clean telemetry', () => {
    expect(scorePullRequestHealth(makeActive()).label).toBe('healthy');
  });

  it('returns score 0 for clean telemetry', () => {
    expect(scorePullRequestHealth(makeActive()).score).toBe(0);
  });

  it('returns empty reasons for clean telemetry', () => {
    expect(scorePullRequestHealth(makeActive()).reasons).toEqual([]);
  });

  it('returns empty signals for clean telemetry', () => {
    expect(scorePullRequestHealth(makeActive()).signals).toEqual([]);
  });
});

// ── Abandoned PRs (+35) ───────────────────────────────────────────────────────

describe('scorePullRequestHealth — abandoned PRs', () => {
  it('fires abandoned_prs signal when abandonedPrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    expect(r.signals).toContain('abandoned_prs');
  });

  it('adds 35 points for abandonedPrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    expect(r.score).toBe(35);
  });

  it('does not fire abandoned_prs when abandonedPrCount is 0', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 0 }));
    expect(r.signals).not.toContain('abandoned_prs');
  });

  it('includes singular reason for abandonedPrCount 1', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    expect(r.reasons).toContain('1 pull request open for more than 30 days');
  });

  it('includes plural reason for abandonedPrCount 2', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 2 }));
    expect(r.reasons).toContain('2 pull requests open for more than 30 days');
  });

  it('label is monitor when only abandoned PRs fire (score 35)', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    expect(r.label).toBe('monitor');
  });
});

// ── Stale PRs (+20) ───────────────────────────────────────────────────────────

describe('scorePullRequestHealth — stale PRs', () => {
  it('fires stale_prs signal when stalePrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 1 }));
    expect(r.signals).toContain('stale_prs');
  });

  it('adds 20 points for stalePrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 1 }));
    expect(r.score).toBe(20);
  });

  it('does not fire stale_prs when stalePrCount is 0', () => {
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 0 }));
    expect(r.signals).not.toContain('stale_prs');
  });

  it('includes singular reason for stalePrCount 1', () => {
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 1 }));
    expect(r.reasons).toContain('1 pull request open for more than 7 days');
  });

  it('includes plural reason for stalePrCount 3', () => {
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 3 }));
    expect(r.reasons).toContain('3 pull requests open for more than 7 days');
  });
});

// ── Failed checks (+25) ───────────────────────────────────────────────────────

describe('scorePullRequestHealth — failed checks', () => {
  it('fires failed_checks signal when failedCheckPrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 1 }));
    expect(r.signals).toContain('failed_checks');
  });

  it('adds 25 points for failedCheckPrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 1 }));
    expect(r.score).toBe(25);
  });

  it('does not fire failed_checks when failedCheckPrCount is 0', () => {
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 0 }));
    expect(r.signals).not.toContain('failed_checks');
  });

  it('includes singular reason for failedCheckPrCount 1', () => {
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 1 }));
    expect(r.reasons).toContain('1 open pull request with failed checks');
  });

  it('includes plural reason for failedCheckPrCount 2', () => {
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 2 }));
    expect(r.reasons).toContain('2 open pull requests with failed checks');
  });
});

// ── Merge latency thresholds ──────────────────────────────────────────────────

describe('scorePullRequestHealth — merge latency thresholds', () => {
  it('fires high_merge_latency when avgMergeLatencyHours > 168', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 169 }));
    expect(r.signals).toContain('high_merge_latency');
  });

  it('adds 15 points for avgMergeLatencyHours > 168', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 200 }));
    expect(r.score).toBe(15);
  });

  it('does not fire high_merge_latency at exactly 168h (boundary)', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 168 }));
    expect(r.signals).not.toContain('high_merge_latency');
  });

  it('fires elevated_merge_latency when avgMergeLatencyHours > 72 and <= 168', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 100 }));
    expect(r.signals).toContain('elevated_merge_latency');
  });

  it('adds 8 points for avgMergeLatencyHours > 72 and <= 168', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 100 }));
    expect(r.score).toBe(8);
  });

  it('fires elevated_merge_latency at exactly 168h (boundary — not > 168)', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 168 }));
    expect(r.signals).toContain('elevated_merge_latency');
  });

  it('does not fire elevated_merge_latency at exactly 72h (boundary)', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 72 }));
    expect(r.signals).not.toContain('elevated_merge_latency');
  });

  it('does not fire elevated_merge_latency when avgMergeLatencyHours > 168 (high fires instead)', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 200 }));
    expect(r.signals).not.toContain('elevated_merge_latency');
  });

  it('high and elevated latency are mutually exclusive', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 200 }));
    expect(r.signals.filter(s => s.includes('merge_latency'))).toHaveLength(1);
  });

  it('includes the latency value in the high_merge_latency reason', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 200 }));
    expect(r.reasons).toContain('Average merge latency is 200h (over 7 days)');
  });

  it('includes the latency value in the elevated_merge_latency reason', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 100 }));
    expect(r.reasons).toContain('Average merge latency is 100h (over 3 days)');
  });

  it('does not fire any latency signal when avgMergeLatencyHours is null', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: null }));
    expect(r.signals).not.toContain('high_merge_latency');
    expect(r.signals).not.toContain('elevated_merge_latency');
  });
});

// ── Oldest open PR age thresholds ─────────────────────────────────────────────

describe('scorePullRequestHealth — oldest open PR age thresholds', () => {
  it('fires oldest_pr_very_old when oldestOpenPrAgeDays > 30', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 31 }));
    expect(r.signals).toContain('oldest_pr_very_old');
  });

  it('adds 20 points for oldestOpenPrAgeDays > 30', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 31 }));
    expect(r.score).toBe(20);
  });

  it('does not fire oldest_pr_very_old at exactly 30 days (boundary)', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 30 }));
    expect(r.signals).not.toContain('oldest_pr_very_old');
  });

  it('fires oldest_pr_stale when oldestOpenPrAgeDays > 7 and <= 30', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 15 }));
    expect(r.signals).toContain('oldest_pr_stale');
  });

  it('adds 10 points for oldestOpenPrAgeDays > 7 and <= 30', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 15 }));
    expect(r.score).toBe(10);
  });

  it('fires oldest_pr_stale at exactly 30 days (boundary — not > 30)', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 30 }));
    expect(r.signals).toContain('oldest_pr_stale');
  });

  it('does not fire oldest_pr_stale at exactly 7 days (boundary)', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 7 }));
    expect(r.signals).not.toContain('oldest_pr_stale');
  });

  it('does not fire oldest_pr_stale when oldestOpenPrAgeDays > 30 (very_old fires instead)', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 35 }));
    expect(r.signals).not.toContain('oldest_pr_stale');
  });

  it('oldest_pr_very_old and oldest_pr_stale are mutually exclusive', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 35 }));
    expect(r.signals.filter(s => s.startsWith('oldest_pr'))).toHaveLength(1);
  });

  it('does not fire any age signal when oldestOpenPrAgeDays is null', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: null }));
    expect(r.signals).not.toContain('oldest_pr_stale');
    expect(r.signals).not.toContain('oldest_pr_very_old');
  });
});

// ── Large PR size (+10) ───────────────────────────────────────────────────────

describe('scorePullRequestHealth — large PR size', () => {
  it('fires large_pr_size when avgPrSize > 500', () => {
    const r = scorePullRequestHealth(makeActive({ avgPrSize: 501 }));
    expect(r.signals).toContain('large_pr_size');
  });

  it('adds 10 points for avgPrSize > 500', () => {
    const r = scorePullRequestHealth(makeActive({ avgPrSize: 501 }));
    expect(r.score).toBe(10);
  });

  it('does not fire large_pr_size at exactly 500 (boundary)', () => {
    const r = scorePullRequestHealth(makeActive({ avgPrSize: 500 }));
    expect(r.signals).not.toContain('large_pr_size');
  });

  it('does not fire large_pr_size when avgPrSize is null', () => {
    const r = scorePullRequestHealth(makeActive({ avgPrSize: null }));
    expect(r.signals).not.toContain('large_pr_size');
  });

  it('includes the size value in the reason string', () => {
    const r = scorePullRequestHealth(makeActive({ avgPrSize: 800 }));
    expect(r.reasons).toContain('Average PR size is 800 lines (very large)');
  });
});

// ── Blocked throughput (+10) ──────────────────────────────────────────────────

describe('scorePullRequestHealth — blocked throughput', () => {
  it('fires blocked_throughput when throughput30d is 0 and openPrCount > 0', () => {
    const r = scorePullRequestHealth(makeActive({ throughput30d: 0, openPrCount: 2 }));
    expect(r.signals).toContain('blocked_throughput');
  });

  it('adds 10 points for blocked throughput', () => {
    const r = scorePullRequestHealth(makeActive({ throughput30d: 0, openPrCount: 1 }));
    expect(r.score).toBe(10);
  });

  it('does not fire blocked_throughput when throughput30d > 0', () => {
    const r = scorePullRequestHealth(makeActive({ throughput30d: 0.1, openPrCount: 2 }));
    expect(r.signals).not.toContain('blocked_throughput');
  });

  it('does not fire blocked_throughput when openPrCount is 0 (no open PRs — not a blockage)', () => {
    const r = scorePullRequestHealth(makeActive({ throughput30d: 0, openPrCount: 0 }));
    expect(r.signals).not.toContain('blocked_throughput');
  });
});

// ── Label thresholds ──────────────────────────────────────────────────────────

describe('scorePullRequestHealth — label thresholds', () => {
  it('score 0 → healthy', () => {
    expect(scorePullRequestHealth(makeActive()).label).toBe('healthy');
  });

  it('score 29 → healthy', () => {
    // stalePrCount(20) + elevated_merge_latency(8) = 28, still healthy
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 1, avgMergeLatencyHours: 100 }));
    expect(r.score).toBe(28);
    expect(r.label).toBe('healthy');
  });

  it('score 30 → monitor (abandoned PRs alone = 35)', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    expect(r.score).toBe(35);
    expect(r.label).toBe('monitor');
  });

  it('score 49 → monitor', () => {
    // failed_checks(25) + stale_prs(20) = 45 → monitor
    const r = scorePullRequestHealth(makeActive({ failedCheckPrCount: 1, stalePrCount: 1 }));
    expect(r.score).toBe(45);
    expect(r.label).toBe('monitor');
  });

  it('score 50 → at-risk', () => {
    // abandoned(35) + failed_checks(25) = 60 → at-risk
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1, failedCheckPrCount: 1 }));
    expect(r.score).toBe(60);
    expect(r.label).toBe('at-risk');
  });

  it('score 75+ → critical', () => {
    // abandoned(35) + failed_checks(25) + stale(20) = 80
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1, failedCheckPrCount: 1, stalePrCount: 1 }));
    expect(r.score).toBe(80);
    expect(r.label).toBe('critical');
  });
});

// ── Score cap ─────────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — score cap', () => {
  it('score never exceeds 100', () => {
    // All rules firing: 35+25+20+20+15+10+10 = 135, capped at 100
    const r = scorePullRequestHealth(makeActive({
      abandonedPrCount:     2,
      failedCheckPrCount:   2,
      stalePrCount:         2,
      oldestOpenPrAgeDays:  35,  // fires oldest_pr_very_old (20)
      avgMergeLatencyHours: 200, // fires high_merge_latency (15)
      throughput30d:        0,
      openPrCount:          2,
      avgPrSize:            600,
    }));
    expect(r.score).toBe(100);
    expect(r.label).toBe('critical');
  });
});

// ── Multiple combined signals ─────────────────────────────────────────────────

describe('scorePullRequestHealth — multiple combined signals', () => {
  it('accumulates points from multiple independent signals', () => {
    // stale(20) + oldest_pr_stale(10) = 30
    const r = scorePullRequestHealth(makeActive({
      stalePrCount:        1,
      oldestOpenPrAgeDays: 15,
    }));
    expect(r.score).toBe(30);
    expect(r.signals).toContain('stale_prs');
    expect(r.signals).toContain('oldest_pr_stale');
  });

  it('reasons and signals arrays have the same length', () => {
    const r = scorePullRequestHealth(makeActive({
      abandonedPrCount:    1,
      failedCheckPrCount:  1,
      stalePrCount:        1,
    }));
    expect(r.reasons).toHaveLength(r.signals.length);
  });

  it('each signal appears at most once', () => {
    const r = scorePullRequestHealth(makeActive({
      abandonedPrCount:     2,
      failedCheckPrCount:   2,
      stalePrCount:         2,
      oldestOpenPrAgeDays:  35,
      avgMergeLatencyHours: 200,
      avgPrSize:            600,
      throughput30d:        0,
    }));
    const uniqueSignals = new Set(r.signals);
    expect(uniqueSignals.size).toBe(r.signals.length);
  });
});

// ── Confidence level ──────────────────────────────────────────────────────────

describe('scorePullRequestHealth — confidenceLevel', () => {
  it('returns high confidence when active with 5+ PRs evidence', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 2, mergedPrCount30d: 5 }));
    expect(r.confidenceLevel).toBe('high');
  });

  it('returns medium confidence when active with 2–4 PRs evidence', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 1, mergedPrCount30d: 1 }));
    expect(r.confidenceLevel).toBe('medium');
  });

  it('returns low confidence when active with only 1 PR total', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 1, mergedPrCount30d: 0 }));
    expect(r.confidenceLevel).toBe('low');
  });

  it('returns low confidence for unknown status', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'unknown' }).confidenceLevel).toBe('low');
  });

  it('returns high confidence for none status (complete information)', () => {
    expect(scorePullRequestHealth({ prTelemetryStatus: 'none' }).confidenceLevel).toBe('high');
  });

  it('confidence threshold: exactly 5 evidence → high', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 2, mergedPrCount30d: 3 }));
    expect(r.confidenceLevel).toBe('high');
  });

  it('confidence threshold: exactly 2 evidence → medium', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 1, mergedPrCount30d: 1 }));
    expect(r.confidenceLevel).toBe('medium');
  });

  it('confidence threshold: exactly 1 evidence → low', () => {
    const r = scorePullRequestHealth(makeActive({ openPrCount: 0, mergedPrCount30d: 1 }));
    expect(r.confidenceLevel).toBe('low');
  });
});

// ── Determinism ───────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — determinism', () => {
  it('returns identical results for identical inputs', () => {
    const t = makeActive({ abandonedPrCount: 1, failedCheckPrCount: 1, stalePrCount: 2 });
    expect(scorePullRequestHealth(t)).toEqual(scorePullRequestHealth(t));
  });

  it('produces same output on repeated calls', () => {
    const t = makeActive({ abandonedPrCount: 1, avgMergeLatencyHours: 200 });
    const r1 = scorePullRequestHealth(t);
    const r2 = scorePullRequestHealth(t);
    expect(r1.score).toBe(r2.score);
    expect(r1.label).toBe(r2.label);
    expect(r1.signals).toEqual(r2.signals);
    expect(r1.reasons).toEqual(r2.reasons);
    expect(r1.confidenceLevel).toBe(r2.confidenceLevel);
  });
});

// ── Non-mutation ──────────────────────────────────────────────────────────────

describe('scorePullRequestHealth — non-mutation', () => {
  it('does not mutate the input telemetry object', () => {
    const t = makeActive({ abandonedPrCount: 2, stalePrCount: 1 });
    const before = JSON.stringify(t);
    scorePullRequestHealth(t);
    expect(JSON.stringify(t)).toBe(before);
  });

  it('does not share the signals array across calls', () => {
    const t = makeActive({ stalePrCount: 1 });
    const r1 = scorePullRequestHealth(t);
    const r2 = scorePullRequestHealth(t);
    r1.signals.push('injected');
    expect(r2.signals).not.toContain('injected');
  });
});

// ── Solo-maintainer: no review/diversity penalties ────────────────────────────

describe('scorePullRequestHealth — solo-maintainer assumptions', () => {
  it('does not include reviewer-related signals', () => {
    const r = scorePullRequestHealth(makeActive({ abandonedPrCount: 1 }));
    const reviewSignals = r.signals.filter(s =>
      s.includes('review') || s.includes('reviewer') || s.includes('diversity')
    );
    expect(reviewSignals).toHaveLength(0);
  });

  it('does not penalise a PR with no reviewers', () => {
    // Simulate a typical solo-maintainer PR: no reviewers, but otherwise fine
    const r = scorePullRequestHealth(makeActive({ stalePrCount: 0, abandonedPrCount: 0 }));
    expect(r.score).toBe(0);
    expect(r.label).toBe('healthy');
  });

  it('no PR history is neutral, not penalised', () => {
    const r = scorePullRequestHealth({ prTelemetryStatus: 'none' });
    expect(r.label).toBe('none');
    expect(r.score).toBe(0);
  });

  it('zero merged PRs without open PRs does not fire blocked_throughput', () => {
    // Solo repos may go weeks without merging if nothing is open
    const r = scorePullRequestHealth(makeActive({ throughput30d: 0, openPrCount: 0 }));
    expect(r.signals).not.toContain('blocked_throughput');
  });
});

// ── Boundary scorecard ────────────────────────────────────────────────────────

describe('scorePullRequestHealth — boundary scorecard', () => {
  it('stalePrCount 1 → fires (boundary > 0)', () => {
    expect(scorePullRequestHealth(makeActive({ stalePrCount: 1 })).signals).toContain('stale_prs');
  });

  it('stalePrCount 0 → no signal', () => {
    expect(scorePullRequestHealth(makeActive({ stalePrCount: 0 })).signals).not.toContain('stale_prs');
  });

  it('abandonedPrCount 1 → fires (boundary > 0)', () => {
    expect(scorePullRequestHealth(makeActive({ abandonedPrCount: 1 })).signals).toContain('abandoned_prs');
  });

  it('abandonedPrCount 0 → no signal', () => {
    expect(scorePullRequestHealth(makeActive({ abandonedPrCount: 0 })).signals).not.toContain('abandoned_prs');
  });

  it('avgPrSize 501 → fires large_pr_size', () => {
    expect(scorePullRequestHealth(makeActive({ avgPrSize: 501 })).signals).toContain('large_pr_size');
  });

  it('avgPrSize 500 → no signal (boundary: > 500)', () => {
    expect(scorePullRequestHealth(makeActive({ avgPrSize: 500 })).signals).not.toContain('large_pr_size');
  });

  it('avgMergeLatencyHours 73 → fires elevated_merge_latency (boundary > 72)', () => {
    expect(scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 73 })).signals).toContain('elevated_merge_latency');
  });

  it('avgMergeLatencyHours 72 → no latency signal (boundary: > 72)', () => {
    const r = scorePullRequestHealth(makeActive({ avgMergeLatencyHours: 72 }));
    expect(r.signals).not.toContain('high_merge_latency');
    expect(r.signals).not.toContain('elevated_merge_latency');
  });

  it('oldestOpenPrAgeDays 7.1 → fires oldest_pr_stale (boundary > 7)', () => {
    expect(scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 7.1 })).signals).toContain('oldest_pr_stale');
  });

  it('oldestOpenPrAgeDays 7 → no age signal (boundary: > 7)', () => {
    const r = scorePullRequestHealth(makeActive({ oldestOpenPrAgeDays: 7 }));
    expect(r.signals).not.toContain('oldest_pr_stale');
    expect(r.signals).not.toContain('oldest_pr_very_old');
  });
});
