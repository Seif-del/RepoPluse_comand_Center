'use strict';

// Severity sort order (lower = higher priority in output).
var SEV_ORDER = { critical: 0, high: 1, medium: 2, healthy: 3 };

// Human-readable label names for summary strings.
var LABEL_NAME = {
  critical: 'Critical',
  'at-risk': 'At Risk',
  monitor:   'Monitor',
  healthy:   'Healthy',
};

// Label severity ordering (higher number = worse).
var LABEL_ORDER = { healthy: 0, monitor: 1, 'at-risk': 2, critical: 3 };

// Severity for worsening label transitions (key: prevLabel_curLabel).
var LABEL_WORSEN_SEV = {
  'healthy_monitor':   'medium',
  'healthy_at-risk':   'high',
  'healthy_critical':  'critical',
  'monitor_at-risk':   'high',
  'monitor_critical':  'critical',
  'at-risk_critical':  'critical',
};

// Severity for a sudden score spike based on the new score value.
function _spikeSeverity(score) {
  if (score >= 75) return 'critical';
  if (score >= 50) return 'high';
  return 'medium';
}

// Derive trajectory from the stored label + trend pair.
// Mirrors the same logic used by getAttentionQueue and portfolioRoutes.
function _deriveTrajectory(label, trend) {
  if (!label || !trend) return 'unknown';
  if (label === 'critical' && trend === 'worsening') return 'escalating';
  if (label === 'at-risk'  && trend === 'worsening') return 'deteriorating';
  if (trend === 'improving') return 'recovering';
  return 'stable';
}

var MAX_CHANGES = 50;

/**
 * Detects meaningful operational changes by comparing the current snapshot
 * against the previous snapshot for each repository. Pure deterministic
 * function — no I/O, no ML, no fabrication.
 *
 * A repo with no previous snapshot (first sync) produces no events.
 *
 * Change categories:
 *   Label transitions   — risk band escalation or recovery
 *   Score movement      — sudden spike (delta >= +15) or recovery (delta <= -15)
 *   CI transitions      — passing ↔ failing
 *   Contributor changes — abandoned, bus-factor, recovery
 *   Trajectory shifts   — direction-of-travel changes derived from label + trend
 *   Volatile emergence  — large score reversal between consecutive snapshots
 *
 * Output is sorted newest-first by detectedAt; within the same timestamp,
 * sorted by severity (critical → high → medium → healthy).
 * Capped at MAX_CHANGES (50) items.
 *
 * @param {Array} repoPairs  Each item: {
 *   repoId:                    number,
 *   repoName:                  string,
 *   currentScore:              number|null,
 *   previousScore:             number|null,
 *   currentLabel:              string|null,   // 'healthy'|'monitor'|'at-risk'|'critical'
 *   previousLabel:             string|null,
 *   currentTrend:              string|null,   // 'improving'|'stable'|'worsening'
 *   previousTrend:             string|null,
 *   currentCiStatus:           string|null,   // 'passing'|'failing'|'unknown'
 *   previousCiStatus:          string|null,
 *   currentContributorStatus:  string|null,
 *   previousContributorStatus: string|null,
 *   snapshotAt:                string|null,   // ISO timestamp of current snapshot
 * }
 * @returns {Array<{
 *   type:          string,
 *   severity:      'critical'|'high'|'medium'|'healthy',
 *   repoId:        number,
 *   repoName:      string,
 *   summary:       string,
 *   previousState: string,
 *   currentState:  string,
 *   detectedAt:    string|null,
 * }>}
 */
function getOperationalChanges(repoPairs) {
  if (!Array.isArray(repoPairs)) return [];

  var changes = [];

  repoPairs.forEach(function(pair) {
    if (!pair || pair.repoId == null) return;

    var id         = pair.repoId;
    var name       = pair.repoName || String(id);
    var detectedAt = pair.snapshotAt || null;

    var curScore  = pair.currentScore  != null ? Number(pair.currentScore)  : null;
    var prevScore = pair.previousScore != null ? Number(pair.previousScore) : null;
    var curLabel  = pair.currentLabel  || null;
    var prevLabel = pair.previousLabel || null;
    var curTrend  = pair.currentTrend  || null;
    var prevTrend = pair.previousTrend || null;
    var curCi     = pair.currentCiStatus           || null;
    var prevCi    = pair.previousCiStatus          || null;
    var curCon    = pair.currentContributorStatus  || null;
    var prevCon   = pair.previousContributorStatus || null;

    // Skip repos with no previous state — nothing to compare against.
    var hasPrevRisk    = prevLabel !== null || prevScore !== null;
    var hasPrevMetrics = prevCi !== null    || prevCon !== null;
    if (!hasPrevRisk && !hasPrevMetrics) return;

    // ── Label transitions ────────────────────────────────────────────────────
    if (curLabel && prevLabel && curLabel !== prevLabel) {
      var transKey  = prevLabel + '_' + curLabel;
      var worsenSev = LABEL_WORSEN_SEV[transKey];

      if (worsenSev) {
        changes.push({
          type:          'label_degraded',
          severity:      worsenSev,
          repoId:        id,
          repoName:      name,
          summary:       name + ' degraded from ' + (LABEL_NAME[prevLabel] || prevLabel)
                       + ' to ' + (LABEL_NAME[curLabel] || curLabel),
          previousState: prevLabel,
          currentState:  curLabel,
          detectedAt:    detectedAt,
        });
      } else {
        var prevOrd = LABEL_ORDER[prevLabel] != null ? LABEL_ORDER[prevLabel] : 0;
        var curOrd  = LABEL_ORDER[curLabel]  != null ? LABEL_ORDER[curLabel]  : 0;
        if (curOrd < prevOrd) {
          changes.push({
            type:          'label_recovered',
            severity:      'healthy',
            repoId:        id,
            repoName:      name,
            summary:       name + ' operational risk recovered from '
                         + (LABEL_NAME[prevLabel] || prevLabel)
                         + ' to ' + (LABEL_NAME[curLabel] || curLabel),
            previousState: prevLabel,
            currentState:  curLabel,
            detectedAt:    detectedAt,
          });
        }
      }
    }

    // ── Score spikes and recoveries ──────────────────────────────────────────
    if (curScore !== null && prevScore !== null && !isNaN(curScore) && !isNaN(prevScore)) {
      var delta = curScore - prevScore;

      if (delta >= 15) {
        changes.push({
          type:          'score_spike',
          severity:      _spikeSeverity(curScore),
          repoId:        id,
          repoName:      name,
          summary:       name + ' risk score spiked from ' + prevScore + ' to ' + curScore,
          previousState: String(prevScore),
          currentState:  String(curScore),
          detectedAt:    detectedAt,
        });
      } else if (delta <= -15) {
        changes.push({
          type:          'score_recovery',
          severity:      'healthy',
          repoId:        id,
          repoName:      name,
          summary:       name + ' risk score recovered from ' + prevScore + ' to ' + curScore,
          previousState: String(prevScore),
          currentState:  String(curScore),
          detectedAt:    detectedAt,
        });
      }
    }

    // ── CI transitions ───────────────────────────────────────────────────────
    if (curCi && prevCi && curCi !== prevCi) {
      if (prevCi === 'passing' && curCi === 'failing') {
        changes.push({
          type:          'ci_failure_detected',
          severity:      'critical',
          repoId:        id,
          repoName:      name,
          summary:       'CI failures detected in ' + name,
          previousState: 'passing',
          currentState:  'failing',
          detectedAt:    detectedAt,
        });
      } else if (prevCi === 'failing' && curCi === 'passing') {
        changes.push({
          type:          'ci_recovered',
          severity:      'healthy',
          repoId:        id,
          repoName:      name,
          summary:       name + ' CI pipeline recovered',
          previousState: 'failing',
          currentState:  'passing',
          detectedAt:    detectedAt,
        });
      }
    }

    // ── Contributor transitions ──────────────────────────────────────────────
    if (curCon && prevCon && curCon !== prevCon) {
      if (prevCon === 'healthy' && curCon === 'abandoned') {
        changes.push({
          type:          'contributor_abandoned',
          severity:      'critical',
          repoId:        id,
          repoName:      name,
          summary:       name + ' appears abandoned — no active contributors',
          previousState: 'healthy',
          currentState:  'abandoned',
          detectedAt:    detectedAt,
        });
      } else if (prevCon === 'healthy' && curCon === 'bus_factor_risk') {
        changes.push({
          type:          'bus_factor_detected',
          severity:      'high',
          repoId:        id,
          repoName:      name,
          summary:       name + ' has elevated bus-factor risk',
          previousState: 'healthy',
          currentState:  'bus_factor_risk',
          detectedAt:    detectedAt,
        });
      } else if (
        (prevCon === 'abandoned' || prevCon === 'bus_factor_risk' || prevCon === 'low_activity')
        && curCon === 'healthy'
      ) {
        changes.push({
          type:          'contributor_recovered',
          severity:      'healthy',
          repoId:        id,
          repoName:      name,
          summary:       name + ' contributor activity recovered',
          previousState: prevCon,
          currentState:  'healthy',
          detectedAt:    detectedAt,
        });
      }
    }

    // ── Trajectory shifts ────────────────────────────────────────────────────
    var curTraj  = _deriveTrajectory(curLabel,  curTrend);
    var prevTraj = _deriveTrajectory(prevLabel, prevTrend);

    if (curTraj !== 'unknown' && prevTraj !== 'unknown' && curTraj !== prevTraj) {
      if (curTraj === 'escalating') {
        changes.push({
          type:          'trajectory_escalating',
          severity:      'critical',
          repoId:        id,
          repoName:      name,
          summary:       name + ' escalated to critical operational trajectory',
          previousState: prevTraj,
          currentState:  'escalating',
          detectedAt:    detectedAt,
        });
      } else if (curTraj === 'deteriorating' && (prevTraj === 'stable' || prevTraj === 'recovering')) {
        changes.push({
          type:          'trajectory_deteriorating',
          severity:      'high',
          repoId:        id,
          repoName:      name,
          summary:       name + ' trajectory shifted to deteriorating',
          previousState: prevTraj,
          currentState:  'deteriorating',
          detectedAt:    detectedAt,
        });
      } else if (curTraj === 'recovering' && (prevTraj === 'escalating' || prevTraj === 'deteriorating')) {
        changes.push({
          type:          'trajectory_recovering',
          severity:      'healthy',
          repoId:        id,
          repoName:      name,
          summary:       name + ' trajectory shifted to recovering',
          previousState: prevTraj,
          currentState:  'recovering',
          detectedAt:    detectedAt,
        });
      }
    }

    // ── Volatile emergence ───────────────────────────────────────────────────
    // Detects a significant score reversal between consecutive snapshots:
    // the current snapshot is worsening after a previously improving trend,
    // or vice versa, with a score delta large enough to be operationally meaningful.
    if (
      curScore !== null && prevScore !== null &&
      !isNaN(curScore) && !isNaN(prevScore) &&
      curTrend && prevTrend &&
      curTrend !== prevTrend &&
      Math.abs(curScore - prevScore) >= 10
    ) {
      if (
        (curTrend === 'worsening' && prevTrend === 'improving') ||
        (curTrend === 'improving' && prevTrend === 'worsening')
      ) {
        changes.push({
          type:          'volatile_emerged',
          severity:      'medium',
          repoId:        id,
          repoName:      name,
          summary:       name + ' shows volatile operational pattern — score reversing direction',
          previousState: prevTrend,
          currentState:  curTrend,
          detectedAt:    detectedAt,
        });
      }
    }
  });

  // Sort: newest detectedAt first; within same timestamp, by severity.
  changes.sort(function(a, b) {
    var ta = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
    var tb = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
    if (tb !== ta) return tb - ta;
    var sa = SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 4;
    var sb = SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 4;
    return sa - sb;
  });

  return changes.slice(0, MAX_CHANGES);
}

module.exports = { getOperationalChanges };
