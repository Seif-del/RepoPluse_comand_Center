'use strict';

// ── Concern weights for theme/recommendation ordering ─────────────────────────
var CONCERN_WEIGHT = {
  ci_failing:             40,
  contributor_abandoned:  40,
  escalating:             35,
  persistent_risk:        30,
  contributor_bus_factor: 20,
  release_stale:          20,
  deteriorating:          20,
  contributor_low:        10,
  release_none:           10,
};

// ── Severity map from portfolioRiskLevel ──────────────────────────────────────
var RISK_TO_SEV = {
  critical: 'critical',
  high:     'high',
  medium:   'medium',
  low:      'low',
};

// ── Headline map from portfolioTrajectory ─────────────────────────────────────
var HEADLINE_MAP = {
  escalating:    'Escalation risk concentrated',
  deteriorating: 'Operational instability increasing',
  volatile:      'Portfolio volatility elevated',
  improving:     'Recovery trends emerging',
  stable:        'Operationally stable',
};

// ── Sparse-data result ────────────────────────────────────────────────────────
var SPARSE_RESULT = {
  severity:        'unknown',
  headline:        'Insufficient operational history',
  summary:         'Additional repository sync history is required before portfolio-level operational conclusions can be generated.',
  themes:          [],
  recommendations: [],
};

// ── Count occurrences of each operational concern across repos ────────────────
function _aggregateConcerns(repos) {
  var counts = {
    ci_failing:             0,
    contributor_abandoned:  0,
    escalating:             0,
    persistent_risk:        0,
    contributor_bus_factor: 0,
    release_stale:          0,
    deteriorating:          0,
    contributor_low:        0,
    release_none:           0,
  };

  for (var i = 0; i < repos.length; i++) {
    var r = repos[i];
    if (r.ciStatus           === 'failing')          counts.ci_failing++;
    if (r.contributorStatus  === 'abandoned')        counts.contributor_abandoned++;
    if (r.trajectory         === 'escalating')       counts.escalating++;
    if (r.persistentRisk)                            counts.persistent_risk++;
    if (r.contributorStatus  === 'bus_factor_risk')  counts.contributor_bus_factor++;
    if (r.releaseStatus      === 'stale')            counts.release_stale++;
    if (r.trajectory         === 'deteriorating')    counts.deteriorating++;
    if (r.contributorStatus  === 'low_activity')     counts.contributor_low++;
    if (r.releaseStatus      === 'none')             counts.release_none++;
  }
  return counts;
}

// ── Sort concern keys by weighted impact (weight × count), descending ─────────
function _rankConcerns(concerns) {
  return Object.keys(concerns)
    .filter(function(k) { return concerns[k] > 0; })
    .sort(function(a, b) {
      return ((CONCERN_WEIGHT[b] || 0) * concerns[b])
           - ((CONCERN_WEIGHT[a] || 0) * concerns[a]);
    });
}

// ── Human-readable theme sentence for a concern ───────────────────────────────
function _themeText(key, count) {
  var noun = count === 1 ? 'repository' : 'repositories';
  switch (key) {
    case 'ci_failing':             return 'CI instability affecting ' + count + ' ' + noun;
    case 'contributor_abandoned':  return count + ' ' + noun + ' show signs of abandonment';
    case 'escalating':             return 'Escalating instability across ' + count + ' ' + noun;
    case 'persistent_risk':        return 'Persistent risk unresolved in ' + count + ' ' + noun;
    case 'contributor_bus_factor': return 'Contributor concentration remains unresolved across ' + count + ' ' + noun;
    case 'release_stale':          return 'Release cadence declining across ' + count + ' ' + noun;
    case 'deteriorating':          return 'Operational decline spreading across ' + count + ' ' + noun;
    case 'contributor_low':        return 'Low contributor activity in ' + count + ' ' + noun;
    case 'release_none':           return 'No releases found in ' + count + ' ' + noun;
    default:                       return null;
  }
}

// ── Operationally actionable recommendation for a concern ─────────────────────
function _recommendation(key) {
  switch (key) {
    case 'ci_failing':             return 'Stabilize failing CI pipelines';
    case 'contributor_abandoned':  return 'Review and reassign abandoned repositories';
    case 'escalating':             return 'Investigate escalating repositories';
    case 'persistent_risk':        return 'Address unresolved persistent risk patterns';
    case 'contributor_bus_factor': return 'Resolve contributor concentration risk';
    case 'release_stale':          return 'Improve release cadence consistency';
    case 'deteriorating':          return 'Prioritize remediation of deteriorating repositories';
    case 'contributor_low':        return 'Expand contributor ownership coverage';
    case 'release_none':           return 'Establish release cadence for stagnant repositories';
    default:                       return null;
  }
}

// ── Derive executive severity from portfolio risk + attention map ──────────────
function _deriveSeverity(portfolioRiskLevel, attentionMap) {
  var sev = RISK_TO_SEV[portfolioRiskLevel];
  if (!sev) return 'low';

  // When portfolio risk is low, check whether any repo has elevated attention.
  // If not, the portfolio is fully healthy — promote to 'healthy'.
  if (sev === 'low') {
    var am   = attentionMap && typeof attentionMap === 'object' ? attentionMap : {};
    var keys = Object.keys(am);
    var elevated = false;
    for (var i = 0; i < keys.length; i++) {
      var lvl = am[keys[i]] && am[keys[i]].attentionLevel;
      if (lvl === 'critical' || lvl === 'high' || lvl === 'medium') {
        elevated = true;
        break;
      }
    }
    return elevated ? 'low' : 'healthy';
  }

  return sev;
}

// ── Build one-paragraph executive summary from trajectory + top concerns ───────
function _buildSummary(trajectory, counts, rankedKeys, concerns) {
  // No elevated concerns — clean state
  if (!rankedKeys.length) {
    switch (trajectory) {
      case 'stable':
        return 'All monitored repositories are operationally stable. No escalation signals detected.';
      case 'improving':
        return 'Recovery trends are emerging across ' + (counts.recovering || 0) + ' repositories with no critical escalation.';
      default:
        var total = Object.keys(counts).reduce(function(s, k) { return s + (counts[k] || 0); }, 0);
        return 'Portfolio is operationally stable across ' + total + ' repositories.';
    }
  }

  var t1 = _themeText(rankedKeys[0], concerns[rankedKeys[0]]);
  var t2 = rankedKeys[1] ? _themeText(rankedKeys[1], concerns[rankedKeys[1]]) : null;

  switch (trajectory) {
    case 'escalating':
      if (t2) {
        return t1 + ' and ' + t2.toLowerCase() + ' continue to elevate operational risk across the portfolio.';
      }
      return t1 + ' continues to escalate operational risk across the portfolio.';

    case 'deteriorating':
      if (t2) {
        return t1 + ' and ' + t2.toLowerCase() + ' remain unresolved and are driving operational decline.';
      }
      return t1 + ' is the primary driver of operational decline.';

    case 'volatile':
      if (t2) {
        return t1 + ' and ' + t2.toLowerCase() + ' contribute to ongoing portfolio instability.';
      }
      return t1 + ' contributes to ongoing portfolio instability.';

    case 'improving':
      return 'Recovery trends detected across ' + (counts.recovering || 0)
        + ' repositories. ' + t1 + ' requires continued attention.';

    case 'stable':
    default:
      if (t2) {
        return t1 + ' and ' + t2.toLowerCase()
          + ' remain notable but have not disrupted overall portfolio stability.';
      }
      return t1 + ' remains notable but has not disrupted overall portfolio stability.';
  }
}

/**
 * Generates a deterministic executive operational summary for the portfolio.
 * Aggregates existing intelligence — no ML, no probabilistic output.
 *
 * @param {object} opts
 * @param {object} opts.portfolioForecast — output of getPortfolioForecast
 * @param {Array}  opts.repos            — per-repo objects, each containing:
 *                                         ciStatus, releaseStatus, contributorStatus,
 *                                         trajectory, persistentRisk
 * @param {object} opts.attentionMap     — { [repoId]: { attentionLevel, attentionScore, reasons } }
 * @returns {{
 *   severity:        'healthy'|'low'|'medium'|'high'|'critical'|'unknown',
 *   headline:        string,
 *   summary:         string,
 *   themes:          string[],   // max 3, severity-ordered
 *   recommendations: string[],   // max 3, operationally actionable
 * }}
 */
function buildExecutiveSummary({ portfolioForecast, repos, attentionMap } = {}) {
  var pf  = portfolioForecast && typeof portfolioForecast === 'object' ? portfolioForecast : {};
  var rr  = Array.isArray(repos) ? repos : [];
  var am  = attentionMap && typeof attentionMap === 'object' ? attentionMap : {};

  var trajectory = pf.portfolioTrajectory || 'unknown';
  var counts     = pf.counts              || {};

  // ── Sparse guard: unknown trajectory means insufficient history ───────────
  if (trajectory === 'unknown') {
    return {
      severity:        SPARSE_RESULT.severity,
      headline:        SPARSE_RESULT.headline,
      summary:         SPARSE_RESULT.summary,
      themes:          SPARSE_RESULT.themes.slice(),
      recommendations: SPARSE_RESULT.recommendations.slice(),
    };
  }

  // ── Aggregate recurring operational concerns ──────────────────────────────
  var concerns    = _aggregateConcerns(rr);
  var rankedKeys  = _rankConcerns(concerns);

  // ── Severity ──────────────────────────────────────────────────────────────
  var severity = _deriveSeverity(pf.portfolioRiskLevel, am);

  // ── Headline ──────────────────────────────────────────────────────────────
  var headline = HEADLINE_MAP[trajectory] || 'Operational state undetermined';

  // ── Summary ───────────────────────────────────────────────────────────────
  var summary = _buildSummary(trajectory, counts, rankedKeys.slice(0, 2), concerns);

  // ── Themes (max 3, severity-ordered) ─────────────────────────────────────
  var themes = rankedKeys.slice(0, 3).map(function(k) {
    return _themeText(k, concerns[k]);
  }).filter(Boolean);

  // ── Recommendations (max 3, deduplicated) ─────────────────────────────────
  var seen = {};
  var recommendations = [];
  for (var i = 0; i < rankedKeys.length && recommendations.length < 3; i++) {
    var rec = _recommendation(rankedKeys[i]);
    if (rec && !seen[rec]) {
      seen[rec] = true;
      recommendations.push(rec);
    }
  }

  return {
    severity:        severity,
    headline:        headline,
    summary:         summary,
    themes:          themes,
    recommendations: recommendations,
  };
}

module.exports = { buildExecutiveSummary };
