'use strict';

// Repository Maturity Score (RMS).
// Answers: "How complete and governed is this repository's engineering practice?"
// Score range 0–100 (higher = more mature). NOT operational risk.
//
// Maturity levels: mature 75–100, developing 45–74, immature 1–44, unknown 0.
// 'unknown' is only returned when the overall score is 0 — no usable telemetry.
//
// Structural/governance gaps reduce maturity; they do NOT raise operational severity.
// Direct-push / no-PR workflows are treated as neutral, not penalized.
// Unknown telemetry reduces both confidence and maturity score.

// ── Dimension max weights ─────────────────────────────────────────────────────
// Six dimensions sum to a maximum of 100.

const DIM_CI          = 20;   // ciMaturity          (0–20)
const DIM_RELEASE     = 20;   // releaseMaturity      (0–20)
const DIM_CONTRIBUTOR = 20;   // contributorMaturity  (0–20)
const DIM_ACTIVITY    = 20;   // activityMaturity     (0–20)
const DIM_PR          = 10;   // prWorkflowMaturity   (0–10)
const DIM_TELEMETRY   = 10;   // telemetryMaturity    (0–10)

// ── Maturity level thresholds ─────────────────────────────────────────────────

const MATURITY_THRESHOLDS = [
  { min: 75, level: 'mature'     },
  { min: 45, level: 'developing' },
  { min:  1, level: 'immature'   },
  { min:  0, level: 'unknown'    },
];

// ── Internal helpers ──────────────────────────────────────────────────────────

function _clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function _maturityLevel(score) {
  for (const t of MATURITY_THRESHOLDS) {
    if (score >= t.min) return t.level;
  }
  return 'unknown';
}

function _daysSince(isoDate) {
  if (!isoDate) return null;
  try {
    const ms = Date.now() - new Date(isoDate).getTime();
    if (!isFinite(ms)) return null;
    return ms / (1000 * 60 * 60 * 24);
  } catch (_) {
    return null;
  }
}

// ── Dimension scorers ─────────────────────────────────────────────────────────

function _scoreCi(ciStatus) {
  if (ciStatus === 'passing') return DIM_CI;  // 20 — CI integrated and green
  if (ciStatus === 'failing') return 10;       // 10 — CI exists but is broken
  return 0;                                    // unknown — no CI visibility
}

function _scoreRelease(releaseStatus) {
  if (releaseStatus === 'healthy') return DIM_RELEASE; // 20 — active release cadence
  if (releaseStatus === 'stale')   return 10;           // 10 — releases exist but aging
  if (releaseStatus === 'none')    return 4;            // 4  — no releases (maturity gap, not operational risk)
  return 0;                                            // unknown — no visibility
}

function _scoreContributor(contributorStatus) {
  if (contributorStatus === 'healthy')         return DIM_CONTRIBUTOR; // 20
  if (contributorStatus === 'low_activity')    return 12;               // 12 — few but known contributors
  if (contributorStatus === 'bus_factor_risk') return 8;                // 8  — single-person dominance
  if (contributorStatus === 'dormant')         return 4;                // 4  — no recent activity
  if (contributorStatus === 'abandoned')       return 2;                // 2  — known abandoned
  return 0;                                                            // unknown — no visibility
}

function _scoreActivity(commits7d, hasRecentCommit) {
  const c = (typeof commits7d === 'number' && commits7d >= 0) ? commits7d : null;
  if (c === null) return 0;             // no commit data at all
  if (c > 0)      return DIM_ACTIVITY;  // 20 — actively committing this week
  // c === 0
  if (hasRecentCommit === true)  return 10;  // quiet this week but recently active
  if (hasRecentCommit === false) return 4;   // confirmed dormant
  return 6;                                  // no commits this week; longer-range window unknown
}

function _scorePr(prTelemetryStatus) {
  if (prTelemetryStatus === 'active') return DIM_PR; // 10 — PR workflow tracked
  if (prTelemetryStatus === 'none')   return 6;       // 6  — direct-push; neutral, not penalized
  return 0;                                          // unknown — no PR visibility
}

function _scoreTelemetry(lastSyncedAt, sc) {
  const days = _daysSince(lastSyncedAt);

  let freshnessScore = 0;
  if (days !== null) {
    if      (days < 1)  freshnessScore = 5;
    else if (days < 7)  freshnessScore = 4;
    else if (days < 30) freshnessScore = 2;
    // days >= 30 → 0
  }

  let depthScore = 0;
  if      (sc >= 10) depthScore = 5;
  else if (sc >= 5)  depthScore = 4;
  else if (sc >= 2)  depthScore = 2;
  else if (sc >= 1)  depthScore = 1;

  return Math.min(freshnessScore + depthScore, DIM_TELEMETRY);
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(knownSignals, sc) {
  if (knownSignals >= 4 && sc >= 5) return 'high';
  if (knownSignals >= 3 && sc >= 2) return 'medium';
  return 'low';
}

// ── Gaps ─────────────────────────────────────────────────────────────────────

function _collectGaps(p, days, sc) {
  const gaps = [];

  // CI
  if (p.ciStatus === 'unknown')
    gaps.push('CI/CD pipeline status is not tracked');
  else if (p.ciStatus === 'failing')
    gaps.push('CI/CD pipeline is currently failing');

  // Release
  if (p.releaseStatus === 'unknown')
    gaps.push('Release history is not tracked');
  else if (p.releaseStatus === 'none')
    gaps.push('No releases found — release cadence cannot be tracked');
  else if (p.releaseStatus === 'stale')
    gaps.push('No releases in the last 90 days');

  // Contributor
  if (p.contributorStatus === 'unknown')
    gaps.push('Contributor activity is not tracked');
  else if (p.contributorStatus === 'abandoned')
    gaps.push('Repository appears abandoned — no active contributor');
  else if (p.contributorStatus === 'bus_factor_risk')
    gaps.push('High bus-factor risk: single contributor dominates');
  else if (p.contributorStatus === 'low_activity')
    gaps.push('Low contributor activity (1-2 active contributors)');

  // Activity
  if (p.commits7d === null)
    gaps.push('Commit activity data is unavailable');
  else if (p.commits7d === 0)
    gaps.push('No commits in the last 7 days');

  // PR workflow
  if (p.prTelemetryStatus === 'unknown')
    gaps.push('Pull request telemetry is not available');

  // Dependency
  if (p.dependencyTelemetryStatus === 'unknown')
    gaps.push('Dependency vulnerability telemetry is not tracked');

  // Sync freshness
  if (days !== null && days >= 30)
    gaps.push('Repository sync is stale — last synced ' + Math.floor(days) + ' days ago');
  else if (days !== null && days >= 7)
    gaps.push('Repository sync is aging — last synced ' + Math.floor(days) + ' days ago');

  // Snapshot depth
  if (sc < 5)
    gaps.push(
      'Limited snapshot history (' + sc + ' snapshot' + (sc !== 1 ? 's' : '') +
      ') — assessment confidence is reduced'
    );

  return gaps;
}

// ── Recommendations ──────────────────────────────────────────────────────────

function _collectRecommendations(p, days, sc) {
  const recs = [];

  if (p.ciStatus === 'unknown')
    recs.push('Set up a CI/CD pipeline (e.g., GitHub Actions) to track build health');
  if (p.ciStatus === 'failing')
    recs.push('Fix CI/CD pipeline failures to restore green build status');

  if (p.releaseStatus === 'none')
    recs.push('Create versioned releases or tags to establish a delivery cadence');
  if (p.releaseStatus === 'stale')
    recs.push('Review release cadence — no tagged release in over 90 days');

  if (p.contributorStatus === 'bus_factor_risk')
    recs.push('Distribute code ownership across more contributors to reduce single-person dependency');
  if (p.contributorStatus === 'abandoned')
    recs.push('Assess repository status — consider archiving or assigning new ownership');

  if (p.prTelemetryStatus === 'unknown')
    recs.push('Enable pull request tracking to improve code review workflow visibility');

  if (days !== null && days >= 30)
    recs.push('Sync repositories more frequently to maintain fresh operational telemetry');

  if (sc < 5)
    recs.push('Schedule regular syncs to build historical depth for trend analysis');

  return recs;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Score the engineering maturity of a single repository.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {object}        [params]
 * @param {string}        [params.ciStatus='unknown']
 *   'passing' | 'failing' | 'unknown'
 * @param {string}        [params.releaseStatus='unknown']
 *   'healthy' | 'stale' | 'none' | 'unknown'
 * @param {string}        [params.contributorStatus='unknown']
 *   'healthy' | 'low_activity' | 'bus_factor_risk' | 'abandoned' | 'dormant' | 'unknown'
 * @param {number|null}   [params.commits7d=null]
 *   Commits in the last 7 days; null means no data.
 * @param {boolean|null}  [params.hasRecentCommit=null]
 *   Whether a commit occurred in a broader recent window (e.g. 30 days).
 * @param {string}        [params.prTelemetryStatus='unknown']
 *   'active' | 'none' | 'unknown'
 * @param {string}        [params.dependencyTelemetryStatus='unknown']
 *   'active' | 'none' | 'unknown'
 * @param {string|null}   [params.lastSyncedAt=null]
 *   ISO timestamp of the most recent repo sync.
 * @param {number}        [params.snapshotCount=0]
 *   Number of historical snapshots available.
 *
 * @returns {{
 *   maturityScore:   number,
 *   maturityLevel:   'mature'|'developing'|'immature'|'unknown',
 *   dimensions:      object,
 *   gaps:            string[],
 *   recommendations: string[],
 *   confidenceLevel: 'low'|'medium'|'high',
 * }}
 */
function scoreRepositoryMaturity({
  ciStatus                  = 'unknown',
  releaseStatus             = 'unknown',
  contributorStatus         = 'unknown',
  commits7d                 = null,
  hasRecentCommit           = null,
  prTelemetryStatus         = 'unknown',
  dependencyTelemetryStatus = 'unknown',
  lastSyncedAt              = null,
  snapshotCount             = 0,
} = {}) {
  const sc = (snapshotCount != null && snapshotCount > 0) ? Math.floor(snapshotCount) : 0;

  // ── Dimension scores ──────────────────────────────────────────────────────
  const ciScore          = _scoreCi(ciStatus);
  const releaseScore     = _scoreRelease(releaseStatus);
  const contributorScore = _scoreContributor(contributorStatus);
  const activityScore    = _scoreActivity(commits7d, hasRecentCommit);
  const prScore          = _scorePr(prTelemetryStatus);
  const days             = _daysSince(lastSyncedAt);
  const telemetryScore   = _scoreTelemetry(lastSyncedAt, sc);

  const maturityScore = _clamp(
    ciScore + releaseScore + contributorScore + activityScore + prScore + telemetryScore,
    0, 100
  );
  const maturityLevel = _maturityLevel(maturityScore);

  // ── Confidence ────────────────────────────────────────────────────────────
  let knownSignals = 0;
  if (ciStatus          !== 'unknown')                                    knownSignals++;
  if (releaseStatus     !== 'unknown')                                    knownSignals++;
  if (contributorStatus !== 'unknown')                                    knownSignals++;
  if (typeof commits7d === 'number' && commits7d !== null)                knownSignals++;
  if (prTelemetryStatus !== 'unknown')                                    knownSignals++;

  const confidenceLevel = _confidenceLevel(knownSignals, sc);

  // ── Gaps and recommendations ──────────────────────────────────────────────
  const p = {
    ciStatus, releaseStatus, contributorStatus,
    commits7d, hasRecentCommit,
    prTelemetryStatus, dependencyTelemetryStatus,
    snapshotCount: sc,
  };

  return {
    maturityScore,
    maturityLevel,
    dimensions: {
      ciMaturity:          ciScore,
      releaseMaturity:     releaseScore,
      contributorMaturity: contributorScore,
      activityMaturity:    activityScore,
      prWorkflowMaturity:  prScore,
      telemetryMaturity:   telemetryScore,
    },
    gaps:            _collectGaps(p, days, sc),
    recommendations: _collectRecommendations(p, days, sc),
    confidenceLevel,
  };
}

module.exports = { scoreRepositoryMaturity };
