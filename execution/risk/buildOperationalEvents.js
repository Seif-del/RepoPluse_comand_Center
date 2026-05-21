'use strict';

/**
 * Maps a numeric risk score to an event severity label.
 * @param {number} score
 * @returns {'critical'|'high'|'medium'}
 */
function _riskSeverity(score) {
  if (score >= 70) return 'critical';
  if (score >= 40) return 'high';
  return 'medium';
}

function _ts(snapshotAt) {
  return snapshotAt ? new Date(snapshotAt).toISOString() : null;
}

/**
 * Derives a time-ordered list of operational events by comparing consecutive
 * metric and risk-score snapshots. Pure function — no I/O.
 *
 * All events reference the timestamp at which the changed state was first
 * observed (currentMetrics.snapshotAt or currentRiskScore.snapshotAt).
 *
 * @param {object}      params
 * @param {object|null} params.currentMetrics      — latest repo_metrics row
 * @param {object|null} params.previousMetrics     — second-latest repo_metrics row
 * @param {object|null} params.currentRiskScore    — latest risk_scores row
 * @param {object|null} params.previousRiskScore   — second-latest risk_scores row
 * @param {object|null} params.trendIndicator      — output of getTrendIndicator
 * @returns {Array<{
 *   type:        string,
 *   severity:    'critical'|'high'|'medium'|'healthy',
 *   title:       string,
 *   description: string,
 *   timestamp:   string|null,
 * }>}
 */
function buildOperationalEvents({
  currentMetrics,
  previousMetrics,
  currentRiskScore,
  previousRiskScore,
} = {}) {
  if (!currentMetrics && !currentRiskScore) return [];

  var events = [];

  var riskTs    = currentRiskScore   ? _ts(currentRiskScore.snapshotAt)   : null;
  var metricsTs = currentMetrics     ? _ts(currentMetrics.snapshotAt)     : null;

  // ── Risk score transitions ─────────────────────────────────────────────────
  if (currentRiskScore && previousRiskScore) {
    var curScore  = Number(currentRiskScore.score);
    var prevScore = Number(previousRiskScore.score);
    var delta     = curScore - prevScore;

    if (delta >= 10) {
      events.push({
        type:        'risk_increase',
        severity:    _riskSeverity(curScore),
        title:       'Risk score increased',
        description: 'Risk score increased from ' + prevScore + ' to ' + curScore + '.',
        timestamp:   riskTs,
      });
    } else if (delta <= -10) {
      events.push({
        type:        'risk_recovery',
        severity:    'healthy',
        title:       'Risk score improved',
        description: 'Risk score decreased from ' + prevScore + ' to ' + curScore + '.',
        timestamp:   riskTs,
      });
    }
  }

  // ── CI transitions ─────────────────────────────────────────────────────────
  if (currentMetrics && previousMetrics) {
    var curCi  = currentMetrics.ciStatus   || 'unknown';
    var prevCi = previousMetrics.ciStatus  || 'unknown';

    if (prevCi === 'passing' && curCi === 'failing') {
      events.push({
        type:        'ci_failure_detected',
        severity:    'critical',
        title:       'CI pipeline failure detected',
        description: 'CI status changed from passing to failing.',
        timestamp:   metricsTs,
      });
    } else if (prevCi === 'failing' && curCi === 'passing') {
      events.push({
        type:        'ci_recovered',
        severity:    'healthy',
        title:       'CI pipeline recovered',
        description: 'CI status returned to passing.',
        timestamp:   metricsTs,
      });
    }
  }

  // ── Release transitions ────────────────────────────────────────────────────
  if (currentMetrics && previousMetrics) {
    var curRel  = currentMetrics.releaseStatus   || 'unknown';
    var prevRel = previousMetrics.releaseStatus  || 'unknown';

    if (prevRel === 'healthy' && curRel === 'stale') {
      events.push({
        type:        'release_activity_declined',
        severity:    'high',
        title:       'Release cadence declined',
        description: 'Release status changed from healthy to stale.',
        timestamp:   metricsTs,
      });
    } else if ((prevRel === 'stale' || prevRel === 'none') && curRel === 'healthy') {
      events.push({
        type:        'release_activity_recovered',
        severity:    'healthy',
        title:       'Release activity recovered',
        description: 'Release status returned to healthy.',
        timestamp:   metricsTs,
      });
    }
  }

  // ── Contributor transitions ────────────────────────────────────────────────
  if (currentMetrics && previousMetrics) {
    var curCon  = currentMetrics.contributorStatus   || 'unknown';
    var prevCon = previousMetrics.contributorStatus  || 'unknown';

    if (prevCon === 'healthy' && curCon === 'low_activity') {
      events.push({
        type:        'contributor_activity_declined',
        severity:    'medium',
        title:       'Contributor activity declined',
        description: 'Contributor status changed from healthy to low activity.',
        timestamp:   metricsTs,
      });
    } else if ((prevCon === 'low_activity' || prevCon === 'bus_factor_risk') && curCon === 'healthy') {
      events.push({
        type:        'contributor_activity_recovered',
        severity:    'healthy',
        title:       'Contributor activity recovered',
        description: 'Contributor activity returned to healthy.',
        timestamp:   metricsTs,
      });
    } else if (prevCon === 'healthy' && curCon === 'bus_factor_risk') {
      events.push({
        type:        'bus_factor_detected',
        severity:    'high',
        title:       'Bus-factor risk detected',
        description: 'Contributor concentration increased to bus-factor risk.',
        timestamp:   metricsTs,
      });
    }
  }

  // Sort newest first (null timestamps sort last)
  events.sort(function(a, b) {
    var ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    var tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return events;
}

module.exports = { buildOperationalEvents };
