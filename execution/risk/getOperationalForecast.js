'use strict';

// Count the number of consecutive worsening steps from the head of riskHistory.
// A step is worsening when the newer score is higher than the older by >= 10.
// riskHistory is newest-first.
function _countConsecutiveWorsening(riskHistory) {
  if (!riskHistory || riskHistory.length < 2) return 0;
  var count = 0;
  for (var i = 0; i < riskHistory.length - 1; i++) {
    var curScore  = Number(riskHistory[i].score);
    var prevScore = Number(riskHistory[i + 1].score);
    if (isNaN(curScore) || isNaN(prevScore)) break;
    if (curScore - prevScore >= 10) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Count the number of consecutive improving steps from the head of riskHistory.
// A step is improving when the newer score is lower than the older by >= 10.
// riskHistory is newest-first.
function _countConsecutiveImproving(riskHistory) {
  if (!riskHistory || riskHistory.length < 2) return 0;
  var count = 0;
  for (var i = 0; i < riskHistory.length - 1; i++) {
    var curScore  = Number(riskHistory[i].score);
    var prevScore = Number(riskHistory[i + 1].score);
    if (isNaN(curScore) || isNaN(prevScore)) break;
    if (prevScore - curScore >= 10) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// Count events that represent operational decline.
var DECLINE_TYPES = new Set([
  'ci_failure_detected',
  'release_activity_declined',
  'contributor_activity_declined',
  'bus_factor_detected',
  'risk_increase',
]);

function _countDeclineEvents(events) {
  if (!events || !events.length) return 0;
  var count = 0;
  for (var i = 0; i < events.length; i++) {
    if (DECLINE_TYPES.has(events[i].type)) count++;
  }
  return count;
}

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function _sortedSignals(rawSignals) {
  return rawSignals
    .slice()
    .sort(function(a, b) {
      return (SEV_ORDER[a.sev] != null ? SEV_ORDER[a.sev] : 4)
           - (SEV_ORDER[b.sev] != null ? SEV_ORDER[b.sev] : 4);
    })
    .map(function(s) { return s.text; });
}

/**
 * Classifies a repository's operational trajectory and forecast based purely
 * on persisted history. Deterministic — no ML, no random, no probabilistic
 * language. Pure function with no I/O.
 *
 * Trajectory states (priority order):
 *   unknown       — fewer than 2 risk snapshots
 *   escalating    — escalationLevel 'critical' OR 3+ consecutive worsening
 *   deteriorating — (latest step worsening OR escalationLevel 'high') AND
 *                   persistentRisk; OR declineEventCount >= 2 AND escalationLevel 'high'
 *   volatile      — volatilityLevel 'high'
 *   recovering    — 2+ consecutive improving steps AND no critical-severity events
 *   stable        — escalationLevel 'none', volatilityLevel not 'high',
 *                   no persistent risk, no consecutive worsening steps
 *
 * Forecast level:
 *   escalating    → 'critical'
 *   deteriorating → 'high'
 *   volatile      → 'high' when persistentRisk, else 'medium'
 *   recovering    → 'low' when 3+ consecutive improving, else 'medium'
 *   stable        → 'low'
 *   unknown       → 'unknown'
 *
 * Confidence:
 *   rh.length >= 5 AND volatilityLevel !== 'high' → 'high'
 *   rh.length >= 5 OR (rh.length >= 3)            → 'medium'
 *   otherwise                                      → 'low'
 *
 * @param {object} opts
 * @param {Array}  opts.riskHistory  — risk_scores rows, newest first, each: { score, label, snapshotAt }
 * @param {object} opts.escalation   — full output of getEscalationSignals
 * @param {Array}  opts.events       — pre-built operational events from the history window
 * @returns {{
 *   trajectory:    'unknown'|'escalating'|'deteriorating'|'volatile'|'recovering'|'stable',
 *   forecastLevel: 'unknown'|'critical'|'high'|'medium'|'low',
 *   confidence:    'low'|'medium'|'high',
 *   projectedRisk: string,
 *   signals:       string[],
 * }}
 */
function getOperationalForecast({ riskHistory, escalation, events } = {}) {
  var rh  = Array.isArray(riskHistory) ? riskHistory : [];
  var esc = (escalation && typeof escalation === 'object') ? escalation : {};
  var evs = Array.isArray(events)      ? events      : [];

  var volatilityLevel    = esc.volatilityLevel    || 'low';
  var escalationLevel    = esc.escalationLevel    || 'none';
  var persistentRisk     = esc.persistentRisk     || false;

  // ── Confidence ─────────────────────────────────────────────────────────────
  var confidence = rh.length >= 5 && volatilityLevel !== 'high' ? 'high'
                 : rh.length >= 3                               ? 'medium'
                 : 'low';

  // ── Unknown ─────────────────────────────────────────────────────────────────
  if (rh.length < 2) {
    return {
      trajectory:    'unknown',
      forecastLevel: 'unknown',
      confidence:    'low',
      projectedRisk: 'Insufficient history to forecast trajectory',
      signals:       [],
    };
  }

  var consecutiveWorsening = _countConsecutiveWorsening(rh);
  var consecutiveImproving = _countConsecutiveImproving(rh);
  var declineEventCount    = _countDeclineEvents(evs);
  var hasCriticalEvents    = evs.some(function(e) { return e.severity === 'critical'; });
  var latestStepWorsening  = consecutiveWorsening >= 1;

  var rawSignals = [];

  // ── Trajectory classification ────────────────────────────────────────────────

  // 1. Escalating
  if (escalationLevel === 'critical' || consecutiveWorsening >= 3) {
    rawSignals.push({ sev: 'critical', text: 'Risk score is in sustained critical escalation' });
    if (consecutiveWorsening >= 3) {
      rawSignals.push({ sev: 'critical', text: 'Risk score worsened in ' + consecutiveWorsening + ' consecutive snapshots' });
    }
    if (persistentRisk) {
      rawSignals.push({ sev: 'high', text: 'Repository at elevated risk for 3+ consecutive snapshots' });
    }
    if (declineEventCount > 0) {
      rawSignals.push({ sev: 'high', text: declineEventCount + ' operational decline event(s) detected' });
    }
    return {
      trajectory:    'escalating',
      forecastLevel: 'critical',
      confidence:    confidence,
      projectedRisk: 'Likely escalation without intervention',
      signals:       _sortedSignals(rawSignals),
    };
  }

  // 2. Deteriorating
  var isDeteriorating = (latestStepWorsening || escalationLevel === 'high') && persistentRisk;
  if (!isDeteriorating && declineEventCount >= 2 && escalationLevel === 'high') {
    isDeteriorating = true;
  }
  if (isDeteriorating) {
    if (persistentRisk) {
      rawSignals.push({ sev: 'high', text: 'Repository at elevated risk for 3+ consecutive snapshots' });
    }
    if (latestStepWorsening) {
      rawSignals.push({ sev: 'high', text: 'Most recent snapshot shows worsening risk score' });
    }
    if (declineEventCount >= 2) {
      rawSignals.push({ sev: 'high', text: declineEventCount + ' operational decline event(s) detected' });
    }
    if (escalationLevel === 'high') {
      rawSignals.push({ sev: 'medium', text: 'Escalation level is high' });
    }
    return {
      trajectory:    'deteriorating',
      forecastLevel: 'high',
      confidence:    confidence,
      projectedRisk: 'Continued decline expected if unaddressed',
      signals:       _sortedSignals(rawSignals),
    };
  }

  // 3. Volatile
  if (volatilityLevel === 'high') {
    rawSignals.push({ sev: 'medium', text: 'Risk score is highly volatile across recent snapshots' });
    if (persistentRisk) {
      rawSignals.push({ sev: 'high', text: 'Repository at elevated risk for 3+ consecutive snapshots' });
    }
    if (declineEventCount >= 2) {
      rawSignals.push({ sev: 'medium', text: declineEventCount + ' operational decline event(s) detected' });
    }
    return {
      trajectory:    'volatile',
      forecastLevel: persistentRisk ? 'high' : 'medium',
      confidence:    confidence,
      projectedRisk: 'Trajectory unclear due to instability',
      signals:       _sortedSignals(rawSignals),
    };
  }

  // 4. Recovering
  if (consecutiveImproving >= 2 && !hasCriticalEvents) {
    rawSignals.push({ sev: 'low', text: 'Risk score improved in ' + consecutiveImproving + ' consecutive snapshots' });
    if (persistentRisk) {
      rawSignals.push({ sev: 'medium', text: 'Repository remains at elevated risk despite recent improvement' });
    }
    return {
      trajectory:    'recovering',
      forecastLevel: consecutiveImproving >= 3 ? 'low' : 'medium',
      confidence:    confidence,
      projectedRisk: 'Positive trend observed — continued improvement expected',
      signals:       _sortedSignals(rawSignals),
    };
  }

  // 5. Stable (and fallback)
  if (escalationLevel === 'none' && volatilityLevel !== 'high' && !persistentRisk && consecutiveWorsening === 0) {
    rawSignals.push({ sev: 'low', text: 'No escalation or volatility signals detected' });
    return {
      trajectory:    'stable',
      forecastLevel: 'low',
      confidence:    confidence,
      projectedRisk: 'Current trajectory expected to hold',
      signals:       _sortedSignals(rawSignals),
    };
  }

  // Fallback stable — doesn't meet any elevated criteria
  rawSignals.push({ sev: 'low', text: 'No dominant escalation pattern detected' });
  return {
    trajectory:    'stable',
    forecastLevel: 'low',
    confidence:    confidence,
    projectedRisk: 'Current trajectory expected to hold',
    signals:       _sortedSignals(rawSignals),
  };
}

module.exports = { getOperationalForecast };
