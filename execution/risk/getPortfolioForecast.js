'use strict';

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function _sortSignals(rawSignals) {
  return rawSignals
    .slice()
    .sort(function(a, b) {
      return (SEV_ORDER[a.sev] != null ? SEV_ORDER[a.sev] : 4)
           - (SEV_ORDER[b.sev] != null ? SEV_ORDER[b.sev] : 4);
    })
    .map(function(s) { return s.text; });
}

/**
 * Aggregates per-repo forecast and escalation state into a portfolio-level
 * trajectory and risk assessment. Pure function — no I/O.
 *
 * Trajectory rules (priority order):
 *   escalating    — 2+ repos with trajectory='escalating' OR forecastLevel='critical'
 *   deteriorating — deteriorating repos > recovering repos, OR persistentRisk across 2+ repos
 *   volatile      — 3+ volatile repos (no escalating condition met)
 *   improving     — recovering > deteriorating AND no critical escalation
 *   stable        — default when no elevated signals detected
 *   unknown       — fewer than 2 repos with known trajectory data
 *
 * Portfolio risk levels:
 *   escalating    → 'critical'
 *   deteriorating → 'high'
 *   volatile      → 'high' when persistentRisk >= 2, else 'medium'
 *   improving     → 'low'
 *   stable        → 'low'
 *   unknown       → 'low'
 *
 * @param {Array} repos — per-repo snapshot array:
 *   [{ repoId, trajectory, forecastLevel, escalationLevel, volatilityLevel, persistentRisk }]
 * @returns {{
 *   portfolioTrajectory: 'unknown'|'escalating'|'deteriorating'|'volatile'|'improving'|'stable',
 *   portfolioRiskLevel:  'low'|'medium'|'high'|'critical',
 *   summary:             string,
 *   counts:              { escalating, deteriorating, volatile, recovering, stable, unknown },
 *   signals:             string[],
 * }}
 */
function getPortfolioForecast(repos) {
  var rr = Array.isArray(repos) ? repos : [];

  var counts = {
    escalating:    0,
    deteriorating: 0,
    volatile:      0,
    recovering:    0,
    stable:        0,
    unknown:       0,
  };

  var persistentRiskCount   = 0;
  var criticalForecastCount = 0;

  for (var i = 0; i < rr.length; i++) {
    var r = rr[i];
    var traj = r.trajectory || 'unknown';
    if (Object.prototype.hasOwnProperty.call(counts, traj)) {
      counts[traj]++;
    } else {
      counts.unknown++;
    }
    if (r.persistentRisk)              persistentRiskCount++;
    if (r.forecastLevel === 'critical') criticalForecastCount++;
  }

  var total = rr.length;
  var known = total - counts.unknown;

  // Not enough data to classify portfolio
  if (total === 0 || known < 2) {
    return {
      portfolioTrajectory: 'unknown',
      portfolioRiskLevel:  'low',
      summary:             'Insufficient portfolio forecasting data.',
      counts:              counts,
      signals:             [],
    };
  }

  // ── Trigger evaluation ─────────────────────────────────────────────────────

  // Escalating: 2+ escalating trajectory OR 2+ repos at critical forecastLevel
  var escalatingTrigger    = counts.escalating >= 2 || criticalForecastCount >= 2;
  // Deteriorating: deteriorating repos outnumber recovering OR 2+ repos have persistentRisk
  var deterioratingTrigger = counts.deteriorating > counts.recovering || persistentRiskCount >= 2;
  // Volatile: at least 3 volatile repos (superseded by escalating/deteriorating)
  var volatileTrigger      = counts.volatile >= 3;
  // Improving: recovering > deteriorating AND no critical escalation in portfolio
  var improvingTrigger     = counts.recovering > counts.deteriorating && !escalatingTrigger;

  // ── Portfolio trajectory (priority order) ──────────────────────────────────
  var portfolioTrajectory;
  var portfolioRiskLevel;

  if (escalatingTrigger) {
    portfolioTrajectory = 'escalating';
    portfolioRiskLevel  = 'critical';
  } else if (deterioratingTrigger) {
    portfolioTrajectory = 'deteriorating';
    portfolioRiskLevel  = 'high';
  } else if (volatileTrigger) {
    portfolioTrajectory = 'volatile';
    portfolioRiskLevel  = persistentRiskCount >= 2 ? 'high' : 'medium';
  } else if (improvingTrigger) {
    portfolioTrajectory = 'improving';
    portfolioRiskLevel  = 'low';
  } else {
    portfolioTrajectory = 'stable';
    portfolioRiskLevel  = 'low';
  }

  // ── Summary narrative ──────────────────────────────────────────────────────
  var instableCount = counts.escalating + counts.deteriorating;
  var summary;
  switch (portfolioTrajectory) {
    case 'escalating':
      summary = 'Portfolio instability is increasing across ' + instableCount + ' repositories.';
      break;
    case 'deteriorating':
      summary = counts.deteriorating + ' repositories are deteriorating — operational decline is spreading.';
      break;
    case 'volatile':
      summary = counts.volatile + ' repositories show volatile operational patterns — trajectory is unclear.';
      break;
    case 'improving':
      summary = 'Recovery trends detected across ' + counts.recovering + ' repositories.';
      break;
    default:
      summary = 'Portfolio is operationally stable across ' + total + ' repositories.';
  }

  // ── Signal assembly ────────────────────────────────────────────────────────
  var rawSignals = [];

  if (counts.escalating >= 2) {
    rawSignals.push({
      sev:  'critical',
      text: counts.escalating + ' repositories show critical escalation patterns',
    });
  } else if (counts.escalating === 1) {
    rawSignals.push({
      sev:  'high',
      text: '1 repository shows a critical escalation pattern',
    });
  }

  if (criticalForecastCount >= 2) {
    rawSignals.push({
      sev:  'critical',
      text: criticalForecastCount + ' repositories are forecast at critical risk',
    });
  }

  if (counts.deteriorating >= 2) {
    rawSignals.push({
      sev:  'high',
      text: counts.deteriorating + ' repositories are deteriorating',
    });
  } else if (counts.deteriorating === 1) {
    rawSignals.push({
      sev:  'medium',
      text: '1 repository is deteriorating',
    });
  }

  if (persistentRiskCount >= 2) {
    rawSignals.push({
      sev:  'high',
      text: 'Persistent operational risk remains unresolved across ' + persistentRiskCount + ' repositories',
    });
  }

  if (counts.volatile >= 2) {
    rawSignals.push({
      sev:  'medium',
      text: counts.volatile + ' repositories show volatile operational patterns',
    });
  }

  if (counts.recovering >= 2) {
    rawSignals.push({
      sev:  'low',
      text: 'Recovery trends detected across ' + counts.recovering + ' repositories',
    });
  }

  return {
    portfolioTrajectory: portfolioTrajectory,
    portfolioRiskLevel:  portfolioRiskLevel,
    summary:             summary,
    counts:              counts,
    signals:             _sortSignals(rawSignals),
  };
}

module.exports = { getPortfolioForecast };
