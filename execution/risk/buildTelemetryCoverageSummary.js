'use strict';

var STALE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Coverage level thresholds evaluated top-down (first match wins).
var CI_THRESHOLDS = [
  { min: 80, level: 'high'   },
  { min: 40, level: 'medium' },
  { min:  0, level: 'low'    },
];
var RELEASE_THRESHOLDS = [
  { min: 70, level: 'high'   },
  { min: 30, level: 'medium' },
  { min:  0, level: 'low'    },
];
var CONTRIBUTOR_THRESHOLDS = [
  { min: 80, level: 'high'   },
  { min: 40, level: 'medium' },
  { min:  0, level: 'low'    },
];
var COMPLETENESS_THRESHOLDS = [
  { min: 70, level: 'high'   },
  { min: 40, level: 'medium' },
  { min:  0, level: 'low'    },
];
var DEPTH_THRESHOLDS = [
  { min: 10, level: 'high'   },
  { min:  5, level: 'medium' },
  { min:  0, level: 'low'    },
];

function _levelFromThresholds(value, thresholds) {
  for (var i = 0; i < thresholds.length; i++) {
    if (value >= thresholds[i].min) return thresholds[i].level;
  }
  return 'low';
}

function _pct(count, total) {
  if (total === 0) return 0;
  return Math.round((count / total) * 100);
}

function _isKnown(status) {
  return typeof status === 'string' && status !== '' && status !== 'unknown';
}

// A repo is stale when lastSyncedAt is absent, unparseable, or older than STALE_MS.
function _isStale(lastSyncedAt, nowMs) {
  if (!lastSyncedAt) return true;
  var t = new Date(lastSyncedAt).getTime();
  if (isNaN(t)) return true;
  return (nowMs - t) > STALE_MS;
}

/**
 * Computes portfolio-level telemetry maturity metrics from an array of repo objects.
 * Pure function — no I/O.
 *
 * overallMaturity:
 *   'low'    — any of the three key coverages (CI / release / contributor) is low
 *   'high'   — all three coverages are high AND depth ≥ medium AND freshness ≥ medium
 *   'medium' — everything else
 *
 * @param {Array}  repos   Repo objects with ciStatus, releaseStatus, contributorStatus,
 *                         lastSyncedAt, snapshotCount.
 * @param {object} [opts]  { _nowMs } — deterministic clock override for tests.
 * @returns {{
 *   repoCount:             number,
 *   ciCoverage:            { percentage: number, level: 'high'|'medium'|'low' },
 *   releaseCoverage:       { percentage: number, level: 'high'|'medium'|'low' },
 *   contributorCoverage:   { percentage: number, level: 'high'|'medium'|'low' },
 *   telemetryCompleteness: { percentage: number, level: 'high'|'medium'|'low' },
 *   historicalDepth:       { averageSnapshots: number, level: 'high'|'medium'|'low' },
 *   syncFreshness:         { staleCount: number, stalePercentage: number, level: 'high'|'medium'|'low' },
 *   overallMaturity:       'high'|'medium'|'low',
 * }}
 */
function buildTelemetryCoverageSummary(repos, opts) {
  var nowMs = (opts && opts._nowMs != null) ? opts._nowMs : Date.now();

  if (!Array.isArray(repos) || repos.length === 0) {
    return {
      repoCount:             0,
      ciCoverage:            { percentage: 0, level: 'low'  },
      releaseCoverage:       { percentage: 0, level: 'low'  },
      contributorCoverage:   { percentage: 0, level: 'low'  },
      telemetryCompleteness: { percentage: 0, level: 'low'  },
      historicalDepth:       { averageSnapshots: 0, level: 'low'  },
      syncFreshness:         { staleCount: 0, stalePercentage: 0, level: 'high' },
      overallMaturity:       'low',
    };
  }

  var n = repos.length;
  var ciKnown = 0, relKnown = 0, conKnown = 0;
  var totalSnapshots = 0;
  var staleCount = 0;

  for (var i = 0; i < n; i++) {
    var r = repos[i];
    if (_isKnown(r.ciStatus))          ciKnown++;
    if (_isKnown(r.releaseStatus))     relKnown++;
    if (_isKnown(r.contributorStatus)) conKnown++;
    totalSnapshots += (typeof r.snapshotCount === 'number' && r.snapshotCount > 0)
      ? r.snapshotCount : 0;
    if (_isStale(r.lastSyncedAt, nowMs)) staleCount++;
  }

  var ciPct    = _pct(ciKnown,  n);
  var relPct   = _pct(relKnown, n);
  var conPct   = _pct(conKnown, n);
  var compPct  = Math.round((ciPct + relPct + conPct) / 3);
  var avgSnaps = Math.round((totalSnapshots / n) * 10) / 10;
  var stalePct = _pct(staleCount, n);

  var ciLevel    = _levelFromThresholds(ciPct,    CI_THRESHOLDS);
  var relLevel   = _levelFromThresholds(relPct,   RELEASE_THRESHOLDS);
  var conLevel   = _levelFromThresholds(conPct,   CONTRIBUTOR_THRESHOLDS);
  var compLevel  = _levelFromThresholds(compPct,  COMPLETENESS_THRESHOLDS);
  var depthLevel = _levelFromThresholds(avgSnaps, DEPTH_THRESHOLDS);

  // Freshness: 0 stale → high; ≤20% stale → medium; else → low.
  var freshnessLevel = staleCount === 0 ? 'high' : stalePct <= 20 ? 'medium' : 'low';

  var overallMaturity;
  if (ciLevel === 'low' || relLevel === 'low' || conLevel === 'low') {
    overallMaturity = 'low';
  } else if (
    ciLevel === 'high' && relLevel === 'high' && conLevel === 'high' &&
    depthLevel !== 'low' && freshnessLevel !== 'low'
  ) {
    overallMaturity = 'high';
  } else {
    overallMaturity = 'medium';
  }

  return {
    repoCount:             n,
    ciCoverage:            { percentage: ciPct,    level: ciLevel    },
    releaseCoverage:       { percentage: relPct,   level: relLevel   },
    contributorCoverage:   { percentage: conPct,   level: conLevel   },
    telemetryCompleteness: { percentage: compPct,  level: compLevel  },
    historicalDepth:       { averageSnapshots: avgSnaps, level: depthLevel },
    syncFreshness:         { staleCount: staleCount, stalePercentage: stalePct, level: freshnessLevel },
    overallMaturity:       overallMaturity,
  };
}

module.exports = { buildTelemetryCoverageSummary };
