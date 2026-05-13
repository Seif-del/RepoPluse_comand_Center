'use strict';

var WINDOW_24H_MS = 24 * 60 * 60 * 1000;

// Count risk changes >= 10 whose newer snapshot falls within the 24h window.
// riskHistory is newest-first.
function _countVolatilityChanges(riskHistory, now) {
  if (!riskHistory || riskHistory.length < 2) return 0;
  var cutoff = (now != null ? now : Date.now()) - WINDOW_24H_MS;
  var count  = 0;
  for (var i = 0; i < riskHistory.length - 1; i++) {
    var cur  = riskHistory[i];
    var prev = riskHistory[i + 1];
    var ts   = cur.snapshotAt ? new Date(cur.snapshotAt).getTime() : 0;
    if (ts < cutoff) continue;
    var curScore  = Number(cur.score);
    var prevScore = Number(prev.score);
    if (isNaN(curScore) || isNaN(prevScore)) continue;
    if (Math.abs(curScore - prevScore) >= 10) count++;
  }
  return count;
}

// Returns the longest run of consecutive worsening steps in riskHistory.
// A step is worsening when newer.score - older.score >= 10.
// riskHistory is newest-first: riskHistory[i] is newer than riskHistory[i+1].
function _countConsecutiveWorsening(riskHistory) {
  if (!riskHistory || riskHistory.length < 2) return 0;
  var max = 0;
  var run = 0;
  for (var i = 0; i < riskHistory.length - 1; i++) {
    var curScore  = Number(riskHistory[i].score);
    var prevScore = Number(riskHistory[i + 1].score);
    if (isNaN(curScore) || isNaN(prevScore)) { run = 0; continue; }
    if (curScore - prevScore >= 10) {
      run++;
      if (run > max) max = run;
    } else {
      run = 0;
    }
  }
  return max;
}

// Returns true when the 3 most-recent risk snapshots are all at-risk or critical.
function _detectPersistentRisk(riskHistory) {
  if (!riskHistory || riskHistory.length < 3) return false;
  for (var i = 0; i < 3; i++) {
    var label = riskHistory[i] && riskHistory[i].label;
    if (label !== 'at-risk' && label !== 'critical') return false;
  }
  return true;
}

// Count passing→failing CI transitions in metricsHistory (newest-first).
function _countCiFailures(metricsHistory) {
  if (!metricsHistory || metricsHistory.length < 2) return 0;
  var count = 0;
  for (var i = 0; i < metricsHistory.length - 1; i++) {
    var curCi  = metricsHistory[i].ciStatus     || 'unknown';
    var prevCi = metricsHistory[i + 1].ciStatus || 'unknown';
    if (prevCi === 'passing' && curCi === 'failing') count++;
  }
  return count;
}

// Count healthy→stale release transitions in metricsHistory (newest-first).
function _countReleaseDeclines(metricsHistory) {
  if (!metricsHistory || metricsHistory.length < 2) return 0;
  var count = 0;
  for (var i = 0; i < metricsHistory.length - 1; i++) {
    var curRel  = metricsHistory[i].releaseStatus     || 'unknown';
    var prevRel = metricsHistory[i + 1].releaseStatus || 'unknown';
    if (prevRel === 'healthy' && curRel === 'stale') count++;
  }
  return count;
}

// Count contributor health decline transitions in metricsHistory (newest-first).
function _countContributorDeclines(metricsHistory) {
  if (!metricsHistory || metricsHistory.length < 2) return 0;
  var count = 0;
  for (var i = 0; i < metricsHistory.length - 1; i++) {
    var cur  = metricsHistory[i].contributorStatus     || 'unknown';
    var prev = metricsHistory[i + 1].contributorStatus || 'unknown';
    if (prev === 'healthy' && (cur === 'low_activity' || cur === 'bus_factor_risk')) count++;
  }
  return count;
}

// Count the current unbroken streak of CI-failing snapshots at the head of
// metricsHistory — indicates an unresolved CI outage across sync cycles.
function _countUnresolvedCiRun(metricsHistory) {
  if (!metricsHistory || !metricsHistory.length) return 0;
  var count = 0;
  for (var i = 0; i < metricsHistory.length; i++) {
    if ((metricsHistory[i].ciStatus || 'unknown') === 'failing') {
      count++;
    } else {
      break;
    }
  }
  return count;
}

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Derives operational volatility, escalation, persistent-risk, and signal
 * state from persisted risk and metric history. Pure function — no I/O.
 *
 * Volatility:
 *   3+ risk changes >= 10 within last 24h → 'high'
 *   2  risk changes >= 10 within last 24h → 'medium'
 *   otherwise                             → 'low'
 *
 * Escalation:
 *   3+ consecutive worsening snapshots            → 'critical'
 *   2  consecutive worsening snapshots            → 'high'
 *   2+ critical-severity events in full history   → 'high'
 *   otherwise                                     → 'none'
 *
 * Persistent risk:
 *   3 most-recent risk snapshots all at-risk/critical → persistentRisk = true
 *
 * @param {object}  opts
 * @param {Array}   opts.riskHistory     — risk_scores rows, newest first
 *                                         each: { score, label, snapshotAt }
 * @param {Array}   opts.metricsHistory  — repo_metrics rows, newest first
 *                                         each: { ciStatus, releaseStatus, contributorStatus }
 * @param {Array}   opts.events          — pre-built operational events from full history window
 *                                         each: { severity, ... }
 * @param {number}  [opts._now]          — injectable clock for deterministic tests (ms)
 * @returns {{
 *   volatilityLevel: 'high'|'medium'|'low',
 *   escalationLevel: 'critical'|'high'|'none',
 *   persistentRisk:  boolean,
 *   signals:         string[],
 * }}
 */
function getEscalationSignals({ riskHistory, metricsHistory, events, _now } = {}) {
  var rh  = Array.isArray(riskHistory)    ? riskHistory    : [];
  var mh  = Array.isArray(metricsHistory) ? metricsHistory : [];
  var evs = Array.isArray(events)         ? events         : [];

  // ── Core derivations ───────────────────────────────────────────────────────
  var volatilityChanges    = _countVolatilityChanges(rh, _now);
  var consecutiveWorsening = _countConsecutiveWorsening(rh);
  var criticalEventCount   = evs.filter(function(e) { return e.severity === 'critical'; }).length;

  var volatilityLevel = volatilityChanges    >= 3 ? 'high'
                      : volatilityChanges    >= 2 ? 'medium'
                      : 'low';

  var escalationLevel = consecutiveWorsening >= 3                                     ? 'critical'
                      : consecutiveWorsening >= 2 || criticalEventCount >= 2          ? 'high'
                      : 'none';

  var persistentRisk = _detectPersistentRisk(rh);

  // ── Signal assembly ────────────────────────────────────────────────────────
  var rawSignals = [];

  if (volatilityChanges >= 2) {
    rawSignals.push({
      sev:  volatilityChanges >= 3 ? 'high' : 'medium',
      text: 'Risk score changed ' + volatilityChanges + ' times in 24 hours',
    });
  }

  if (consecutiveWorsening >= 2) {
    rawSignals.push({
      sev:  consecutiveWorsening >= 3 ? 'critical' : 'high',
      text: 'Risk score worsened in ' + consecutiveWorsening + ' consecutive snapshots',
    });
  }

  if (criticalEventCount >= 2) {
    rawSignals.push({
      sev:  'high',
      text: criticalEventCount + ' critical events detected in history',
    });
  }

  if (persistentRisk) {
    rawSignals.push({ sev: 'high', text: 'Repository at elevated risk for 3+ consecutive snapshots' });
  }

  var ciFailures = _countCiFailures(mh);
  if (ciFailures >= 2) {
    rawSignals.push({ sev: 'high', text: 'CI failures detected repeatedly (' + ciFailures + ' times)' });
  }

  var unresolvedCi = _countUnresolvedCiRun(mh);
  if (unresolvedCi >= 3) {
    rawSignals.push({ sev: 'high', text: 'Repository unresolved for ' + unresolvedCi + ' sync cycles' });
  }

  var relDeclines = _countReleaseDeclines(mh);
  if (relDeclines >= 2) {
    rawSignals.push({ sev: 'medium', text: 'Release cadence declined ' + relDeclines + ' times' });
  }

  var contrDeclines = _countContributorDeclines(mh);
  if (contrDeclines >= 2) {
    rawSignals.push({ sev: 'medium', text: 'Contributor activity declined ' + contrDeclines + ' times' });
  }

  // Ordered by severity: critical → high → medium → low
  rawSignals.sort(function(a, b) {
    return (SEV_ORDER[a.sev] != null ? SEV_ORDER[a.sev] : 3)
         - (SEV_ORDER[b.sev] != null ? SEV_ORDER[b.sev] : 3);
  });

  return {
    volatilityLevel: volatilityLevel,
    escalationLevel: escalationLevel,
    persistentRisk:  persistentRisk,
    signals:         rawSignals.map(function(s) { return s.text; }),
  };
}

module.exports = { getEscalationSignals };
