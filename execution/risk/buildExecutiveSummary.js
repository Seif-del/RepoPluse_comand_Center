'use strict';

// ── Concern weights — aligned with getAttentionQueue operational priority model ──
//
// Active operational instability dominates:
//   ci_failing, contributor_abandoned, escalating, persistent_risk,
//   pr_risk, repeated_ci, no_commits, volatile, deteriorating, forecast_signal
//
// Structural maturity signals are secondary/supporting:
//   contributor_bus_factor, release_stale, contributor_low, release_none
//
// This ordering mirrors getAttentionQueue's WEIGHTS so that Executive Summary
// themes and recommendations reflect the same operational story as the attention queue.
var CONCERN_WEIGHT = {
  // ── Active operational instability (primary themes) ──────────────────────────
  ci_failing:             40,
  contributor_abandoned:  40,
  escalating:             35,
  persistent_risk:        30,
  pr_risk:                28,  // PR health critical / at-risk / monitored
  repeated_ci:            26,  // repeated unresolved CI instability
  no_commits:             25,  // absent commit activity across repos
  volatile:               20,  // operational volatility at portfolio level
  deteriorating:          20,
  forecast_signal:        18,  // high / critical forecast level
  telemetry_gaps:         18,  // incomplete CI/release/contributor data — limits assessment

  // ── Structural maturity signals (secondary/supporting) ───────────────────────
  contributor_bus_factor: 12,
  release_stale:          10,
  contributor_low:         8,
  release_none:            8,
};

// ── Purely behavioral concern keys (excludes inactivity and telemetry gaps) ────
// Used to detect structural-only portfolios where calm language is appropriate.
var BEHAVIORAL_CORE_KEYS = [
  'ci_failing', 'contributor_abandoned', 'escalating',
  'persistent_risk', 'pr_risk', 'repeated_ci', 'volatile', 'deteriorating', 'forecast_signal',
];

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
  confidence:      'low',
};

// ── Structural suppression constants ─────────────────────────────────────────
// Structural concerns are suppressed when operational concerns dominate,
// unless structural concerns are widespread (affecting STRUCTURAL_THRESHOLD+ repos).
var STRUCTURAL_CONCERN_THRESHOLD = 3;

var OPERATIONAL_CONCERN_KEYS = [
  'ci_failing', 'contributor_abandoned', 'escalating',
  'persistent_risk', 'pr_risk', 'repeated_ci', 'no_commits', 'volatile', 'deteriorating',
  'forecast_signal', 'telemetry_gaps',
];

var STRUCTURAL_CONCERN_KEYS = [
  'contributor_bus_factor', 'release_stale', 'contributor_low', 'release_none',
];

// ── Empty concern counts ──────────────────────────────────────────────────────
function _zeroCounts() {
  return {
    ci_failing:             0,
    contributor_abandoned:  0,
    escalating:             0,
    persistent_risk:        0,
    pr_risk:                0,
    repeated_ci:            0,
    no_commits:             0,
    volatile:               0,
    deteriorating:          0,
    forecast_signal:        0,
    telemetry_gaps:         0,
    contributor_bus_factor: 0,
    release_stale:          0,
    contributor_low:        0,
    release_none:           0,
  };
}

// ── Attention-map-based aggregation (primary path) ────────────────────────────
// Derives concern counts from the same reason strings visible in the attention
// table, ensuring Executive Summary themes mirror what the user can see.
// One count per repo per concern key (deduplicates multiple matching reasons).
function _aggregateConcernsFromAttention(attentionMap, portfolioTrajectory) {
  var counts = _zeroCounts();
  var am = attentionMap && typeof attentionMap === 'object' ? attentionMap : {};
  var amKeys = Object.keys(am);

  for (var i = 0; i < amKeys.length; i++) {
    var item    = am[amKeys[i]];
    var reasons = (item && Array.isArray(item.reasons)) ? item.reasons : [];
    var hit     = {};

    for (var j = 0; j < reasons.length; j++) {
      var r = reasons[j];
      if (!hit.ci_failing            && r.indexOf('CI pipeline is failing')              === 0) { counts.ci_failing++;            hit.ci_failing            = true; }
      if (!hit.contributor_abandoned && r.indexOf('Repository appears abandoned')        === 0) { counts.contributor_abandoned++; hit.contributor_abandoned = true; }
      if (!hit.escalating            && r.indexOf('Escalating operational trajectory')   === 0) { counts.escalating++;            hit.escalating            = true; }
      if (!hit.persistent_risk       && r.indexOf('Persistent operational risk')         === 0) { counts.persistent_risk++;       hit.persistent_risk       = true; }
      if (!hit.no_commits            && r.indexOf('No recent commits')                   === 0) { counts.no_commits++;            hit.no_commits            = true; }
      if (!hit.deteriorating         && r.indexOf('Deteriorating operational trajectory') === 0) { counts.deteriorating++;         hit.deteriorating         = true; }
      if (!hit.volatile && (r.indexOf('Volatile operational trajectory') === 0 || r.indexOf('Operational volatility elevated') === 0)) { counts.volatile++; hit.volatile = true; }
      if (!hit.pr_risk && (
          r.indexOf('PR health critical') === 0 ||
          r.indexOf('PR health at-risk')  === 0 ||
          r.indexOf('PR health monitored') === 0
      )) { counts.pr_risk++; hit.pr_risk = true; }
      if (!hit.repeated_ci && r.indexOf('Repeated unresolved CI instability') === 0) { counts.repeated_ci++; hit.repeated_ci = true; }
      if (!hit.forecast_signal && (
          r.indexOf('Critical forecast level') === 0 ||
          r.indexOf('High forecast level')     === 0
      )) { counts.forecast_signal++; hit.forecast_signal = true; }
      if (!hit.contributor_bus_factor && r.indexOf('High bus-factor risk')               === 0) { counts.contributor_bus_factor++; hit.contributor_bus_factor = true; }
      if (!hit.release_stale         && r.indexOf('Stale release cadence')               === 0) { counts.release_stale++;         hit.release_stale         = true; }
      if (!hit.contributor_low       && r.indexOf('Low contributor activity')            === 0) { counts.contributor_low++;       hit.contributor_low       = true; }
      if (!hit.release_none          && r.indexOf('No releases found')                   === 0) { counts.release_none++;          hit.release_none          = true; }
      if (!hit.telemetry_gaps && (
          r.indexOf('CI status unknown')           === 0 ||
          r.indexOf('Release status unknown')      === 0 ||
          r.indexOf('Contributor status unknown')  === 0 ||
          r.indexOf('No metrics available yet')    === 0
      )) { counts.telemetry_gaps++; hit.telemetry_gaps = true; }
    }
  }

  // Portfolio-level volatile supplement when no per-repo volatile reasons found.
  if (portfolioTrajectory === 'volatile' && counts.volatile === 0) {
    counts.volatile = Math.max(1, amKeys.length);
  }

  return counts;
}

// ── Repo-field-based aggregation (fallback when attentionMap is empty) ─────────
// Used in tests and as a backward-compatible fallback.
function _aggregateConcernsFromRepos(repos, portfolioTrajectory) {
  var counts = _zeroCounts();
  var rr = Array.isArray(repos) ? repos : [];

  if (portfolioTrajectory === 'volatile') {
    counts.volatile = Math.max(1, rr.length);
  }

  for (var i = 0; i < rr.length; i++) {
    var r = rr[i];
    if (r.ciStatus           === 'failing')          counts.ci_failing++;
    if (r.contributorStatus  === 'abandoned')        counts.contributor_abandoned++;
    if (r.trajectory         === 'escalating')       counts.escalating++;
    if (r.persistentRisk)                            counts.persistent_risk++;
    if (r.noRecentCommits)                           counts.no_commits++;
    if (r.contributorStatus  === 'bus_factor_risk')  counts.contributor_bus_factor++;
    if (r.releaseStatus      === 'stale')            counts.release_stale++;
    if (r.trajectory         === 'deteriorating')    counts.deteriorating++;
    if (r.contributorStatus  === 'low_activity')     counts.contributor_low++;
    if (r.releaseStatus      === 'none')             counts.release_none++;
    if (r.prHealthStatus === 'critical' || r.prHealthStatus === 'at-risk' || r.prHealthStatus === 'monitored') counts.pr_risk++;
    if (r.forecastLevel  === 'critical' || r.forecastLevel  === 'high')   counts.forecast_signal++;
    if (r.unresolvedCiRun)                           counts.repeated_ci++;
    var hasTelemetryGap = r.ciStatus === 'unknown' || r.releaseStatus === 'unknown' ||
                          r.contributorStatus === 'unknown' || r.score == null;
    if (hasTelemetryGap) counts.telemetry_gaps++;
  }
  return counts;
}

// ── Aggregate concerns: attention-map path when populated, repos fallback ─────
// When attentionMap has entries, derives from the same reason strings shown in
// the attention table (one operational story). Falls back to repos fields when
// the map is empty (tests, or no repos scored yet).
function _aggregateConcerns(attentionMap, repos, portfolioTrajectory) {
  var am = attentionMap && typeof attentionMap === 'object' ? attentionMap : {};
  if (Object.keys(am).length > 0) {
    return _aggregateConcernsFromAttention(am, portfolioTrajectory);
  }
  return _aggregateConcernsFromRepos(repos, portfolioTrajectory);
}

// ── Suppress structural concerns based on dominant operational cluster ─────────
//
// Suppression has two modes:
//
// a) Widespread operational cluster (any operational key with count ≥ 2):
//    ALL structural concerns are zeroed — dominant operational signals saturate
//    executive synthesis and structural concerns disappear entirely from themes
//    and recommendations.
//
// b) Isolated operational only (all operational counts ≤ 1):
//    Structural concerns survive if widespread (count ≥ STRUCTURAL_CONCERN_THRESHOLD).
//    This lets structural issues surface when no clear operational cluster exists.
//
// c) No operational concerns at all: no suppression applied.
function _suppressStructural(concerns) {
  var hasOperational = false;
  var hasWidespreadOperational = false;
  for (var i = 0; i < OPERATIONAL_CONCERN_KEYS.length; i++) {
    var opCount = concerns[OPERATIONAL_CONCERN_KEYS[i]];
    if (opCount > 0)  hasOperational = true;
    if (opCount >= 2) hasWidespreadOperational = true;
    if (hasOperational && hasWidespreadOperational) break;
  }
  if (!hasOperational) return concerns;

  var result = {};
  var allKeys = Object.keys(concerns);
  for (var j = 0; j < allKeys.length; j++) {
    var k = allKeys[j];
    var isStructural = STRUCTURAL_CONCERN_KEYS.indexOf(k) !== -1;
    if (!isStructural) {
      result[k] = concerns[k];
    } else if (hasWidespreadOperational) {
      result[k] = 0;  // dominant cluster → full structural suppression
    } else {
      result[k] = concerns[k] < STRUCTURAL_CONCERN_THRESHOLD ? 0 : concerns[k];
    }
  }
  return result;
}

// ── Detect purely behavioral instability (excludes inactivity + telemetry) ───
function _hasBehavioralCoreConcerns(concerns) {
  for (var i = 0; i < BEHAVIORAL_CORE_KEYS.length; i++) {
    if ((concerns[BEHAVIORAL_CORE_KEYS[i]] || 0) > 0) return true;
  }
  return false;
}

// ── Promote isolated critical instability into top-3 ─────────────────────────
// ci_failing and contributor_abandoned carry the highest operational weight (40)
// but can be displaced when 3+ other concerns score higher. Visual salience of
// a critical-level repo demands at least one guaranteed top-3 slot when present.
// Mutates rankedKeys in place and returns it.
function _promoteIsolatedCritical(rankedKeys, concerns) {
  var criticalKeys = ['ci_failing', 'contributor_abandoned'];
  var alreadyTop3 = false;
  for (var t = 0; t < Math.min(rankedKeys.length, 3); t++) {
    if (criticalKeys.indexOf(rankedKeys[t]) !== -1) { alreadyTop3 = true; break; }
  }
  if (alreadyTop3) return rankedKeys;

  for (var c = 0; c < criticalKeys.length; c++) {
    var ck = criticalKeys[c];
    if (concerns[ck] > 0) {
      var pos = rankedKeys.indexOf(ck);
      if (pos > 2) {
        rankedKeys.splice(pos, 1);
        rankedKeys.splice(2, 0, ck);
      }
      return rankedKeys;
    }
  }
  return rankedKeys;
}

// ── Promote commit inactivity into top-3 when visually dominant ──────────────
// When no_commits is widespread (>= 2) and is at least as common as CI failures,
// the Repository Status table is visually dominated by inactive rows. This
// guarantee ensures inactivity appears in the executive themes even when
// ci_failing / contributor_abandoned hold higher per-repo weight scores.
// Runs AFTER _promoteIsolatedCritical so isolated critical instability is never
// displaced. Inserts no_commits at index 1, preserving telemetry_gaps at index 0.
function _promoteInactivity(rankedKeys, concerns) {
  var nc = concerns.no_commits || 0;
  var cf = concerns.ci_failing  || 0;
  if (nc < 2 || nc < cf) return rankedKeys;

  var pos = rankedKeys.indexOf('no_commits');
  if (pos >= 0 && pos <= 2) return rankedKeys; // already in top-3

  // pos > 2: remove from current position before reinserting.
  // pos < 0: nc >= 2 but not yet ranked (defensive — should not occur in practice).
  if (pos > 2) rankedKeys.splice(pos, 1);
  rankedKeys.splice(1, 0, 'no_commits');
  return rankedKeys;
}

// ── Salience-aware tier ranking ───────────────────────────────────────────────
// Operational signals (CI, inactivity, telemetry) always precede structural
// signals (bus-factor, release cadence) regardless of raw weight × count.
// Within each tier, sort by weight × count descending.
// This guarantees visible operational pain drives themes and recommendations
// even when structural counts are numerically larger.
function _rankConcernsSalience(concerns) {
  var operationalRanked = OPERATIONAL_CONCERN_KEYS
    .filter(function(k) { return concerns[k] > 0; })
    .sort(function(a, b) {
      return ((CONCERN_WEIGHT[b] || 0) * concerns[b])
           - ((CONCERN_WEIGHT[a] || 0) * concerns[a]);
    });
  var structuralRanked = STRUCTURAL_CONCERN_KEYS
    .filter(function(k) { return concerns[k] > 0; })
    .sort(function(a, b) {
      return ((CONCERN_WEIGHT[b] || 0) * concerns[b])
           - ((CONCERN_WEIGHT[a] || 0) * concerns[a]);
    });
  return operationalRanked.concat(structuralRanked);
}

// ── Human-readable theme sentence for a concern ───────────────────────────────
function _themeText(key, count) {
  var noun = count === 1 ? 'repository' : 'repositories';
  switch (key) {
    case 'ci_failing':             return 'CI instability affecting ' + count + ' ' + noun;
    case 'contributor_abandoned':  return count + ' ' + noun + (count === 1 ? ' shows' : ' show') + ' signs of abandonment';
    case 'escalating':             return 'Escalating instability across ' + count + ' ' + noun;
    case 'persistent_risk':        return 'Persistent risk unresolved in ' + count + ' ' + noun;
    case 'no_commits':             return 'Commit inactivity affecting ' + count + ' ' + noun;
    case 'volatile':               return 'Operational volatility affecting ' + count + ' ' + noun;
    case 'deteriorating':          return 'Operational decline spreading across ' + count + ' ' + noun;
    case 'contributor_bus_factor': return 'Contributor concentration remains unresolved across ' + count + ' ' + noun;
    case 'release_stale':          return 'Release cadence declining across ' + count + ' ' + noun;
    case 'contributor_low':        return 'Low contributor activity in ' + count + ' ' + noun;
    case 'release_none':           return 'No releases found in ' + count + ' ' + noun;
    case 'pr_risk':                return 'PR health concerns across ' + count + ' ' + noun;
    case 'repeated_ci':            return 'Repeated CI instability in ' + count + ' ' + noun;
    case 'forecast_signal':        return 'Elevated forecast signals across ' + count + ' ' + noun;
    case 'telemetry_gaps':         return 'Telemetry gaps limiting visibility across ' + count + ' ' + noun;
    default:                       return null;
  }
}

// ── Operationally actionable recommendation for a concern ─────────────────────
// Ordered by operational priority: restore CI/activity/escalation before
// addressing structural maturity (releases, contributor concentration).
function _recommendation(key) {
  switch (key) {
    case 'ci_failing':             return 'Stabilize failing CI pipelines';
    case 'contributor_abandoned':  return 'Review and reassign abandoned repositories';
    case 'escalating':             return 'Investigate escalating repositories';
    case 'persistent_risk':        return 'Address unresolved persistent risk patterns';
    case 'no_commits':             return 'Restore commit activity in inactive repositories';
    case 'volatile':               return 'Reduce operational volatility across the portfolio';
    case 'deteriorating':          return 'Prioritize remediation of deteriorating repositories';
    case 'contributor_bus_factor': return 'Resolve contributor concentration risk';
    case 'release_stale':          return 'Improve release cadence consistency';
    case 'contributor_low':        return 'Expand contributor ownership coverage';
    case 'release_none':           return 'Establish release cadence for stagnant repositories';
    case 'pr_risk':                return 'Review and resolve PR health degradation';
    case 'repeated_ci':            return 'Address repeated CI instability at the root cause';
    case 'forecast_signal':        return 'Investigate elevated forecast signals before they materialize';
    case 'telemetry_gaps':         return 'Improve telemetry coverage by completing repository sync';
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

// ── Derive portfolio-level confidence from trajectory, scored-repo ratio, and concerns ─
// Confidence reflects evidence quality: how many repos have been scored and
// whether the portfolio trajectory is assessable. Does NOT require per-repo
// history depth — it uses available portfolio-level indicators.
//
// high:   ≥ 80% repos scored AND ≥ 3 repos total (strong base)
//         — capped to medium when ≥50% repos (min 2) have telemetry_gaps
// medium: ≥ 50% repos scored, trajectory known
// low:    unknown trajectory, sparse scoring, or too few repos
function _derivePortfolioConfidence(trajectory, repos, concerns) {
  if (trajectory === 'unknown') return 'low';
  var rr = Array.isArray(repos) ? repos : [];
  var total = rr.length;
  if (total === 0) return 'low';
  var withScore = 0;
  for (var i = 0; i < rr.length; i++) {
    if (rr[i] && rr[i].score != null) withScore++;
  }
  var ratio = withScore / total;
  var cn = (concerns && typeof concerns === 'object') ? concerns : {};

  var base;
  if (ratio >= 0.8 && total >= 3) base = 'high';
  else if (ratio >= 0.5)          base = 'medium';
  else                            base = 'low';

  // Any 2+ repos with telemetry gaps undermine high confidence: cap to medium.
  // Ratio check removed — 2 unknown repos in any size portfolio is sufficient
  // signal that the picture is incomplete.
  if (base === 'high' && cn.telemetry_gaps >= 2) {
    base = 'medium';
  }

  return base;
}

// ── Context-aware headline derivation ────────────────────────────────────────
// For non-stable trajectories the HEADLINE_MAP entry is authoritative.
// For stable trajectories, widespread inactivity or telemetry incompleteness
// overrides "Operationally stable" with a more honest description.
//
// Inactivity override:  ≥ 2 repos with no_commits AND ≥ 50% of portfolio
// Telemetry override:   ≥ 2 repos with telemetry_gaps AND ≥ 50% of portfolio
// Isolated instability: inactivity dominant but at least one escalating repo
function _deriveHeadline(trajectory, concerns, totalRepos) {
  if (trajectory !== 'stable') {
    return HEADLINE_MAP[trajectory] || 'Operational state undetermined';
  }
  var cn    = (concerns && typeof concerns === 'object') ? concerns : {};
  var total = totalRepos > 0 ? totalRepos : 1;

  var noCommitRatio   = cn.no_commits    / total;
  var telemetryRatio  = cn.telemetry_gaps / total;

  if (cn.no_commits >= 2 && noCommitRatio >= 0.5) {
    if (cn.ci_failing > 0 || cn.contributor_abandoned > 0) {
      return 'Portfolio activity remains subdued with isolated critical instability';
    }
    if (cn.escalating > 0) {
      return 'Portfolio activity remains subdued with isolated operational instability';
    }
    return 'Limited operational activity detected across the portfolio';
  }

  if (cn.telemetry_gaps >= 2 && telemetryRatio >= 0.5) {
    return 'Operational visibility reduced by incomplete telemetry';
  }

  return HEADLINE_MAP[trajectory] || 'Operational state undetermined';
}

// ── Build one-paragraph executive summary — confidence-aware ──────────────────
//
// Low confidence:  uses softer language — "Limited telemetry suggests...",
//                  "Preliminary operational degradation detected..."
// High confidence: uses decisive language — "Sustained...", "Confirmed...",
//                  "High-confidence CI instability..."
// Medium:          neutral language (unchanged from prior behaviour)
function _buildSummary(trajectory, counts, rankedKeys, concerns, confidence) {
  var lowConf  = confidence === 'low';
  var highConf = confidence === 'high';

  // No elevated concerns — operationally clean state.
  if (!rankedKeys.length) {
    if (lowConf) {
      return 'Preliminary assessment suggests operational stability. Confidence reduced due to limited sync history.';
    }
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
      if (highConf) {
        if (t2) return 'Sustained ' + t1.charAt(0).toLowerCase() + t1.slice(1) + ' and ' + t2.toLowerCase() + ' confirm ongoing operational escalation risk.';
        return 'Sustained ' + t1.charAt(0).toLowerCase() + t1.slice(1) + ' confirms ongoing operational escalation risk.';
      }
      if (lowConf) {
        if (t2) return 'Limited telemetry suggests ' + t1.toLowerCase() + ' and ' + t2.toLowerCase() + ' may be elevating operational risk.';
        return 'Limited telemetry suggests ' + t1.toLowerCase() + ' may indicate growing operational risk.';
      }
      if (t2) return t1 + ' and ' + t2.toLowerCase() + ' continue to elevate operational risk across the portfolio.';
      return t1 + ' continues to escalate operational risk across the portfolio.';

    case 'deteriorating':
      if (highConf) {
        if (t2) return 'Sustained operational degradation detected. ' + t1 + ' and ' + t2.toLowerCase() + ' are the confirmed primary drivers.';
        return 'Sustained operational degradation detected. ' + t1 + ' is the confirmed primary driver.';
      }
      if (lowConf) {
        if (t2) return 'Preliminary operational degradation detected. ' + t1 + ' and ' + t2.toLowerCase() + ' remain unresolved.';
        return 'Preliminary operational degradation detected. ' + t1 + ' is the primary concern.';
      }
      if (t2) return t1 + ' and ' + t2.toLowerCase() + ' remain unresolved and are driving operational decline.';
      return t1 + ' is the primary driver of operational decline.';

    case 'volatile':
      if (highConf) {
        if (t2) return 'Confirmed portfolio instability. ' + t1 + ' and ' + t2.toLowerCase() + ' drive ongoing volatility.';
        return 'Confirmed portfolio instability. ' + t1 + ' drives ongoing volatility.';
      }
      if (lowConf) {
        if (t2) return 'Limited telemetry suggests ' + t1.toLowerCase() + ' and ' + t2.toLowerCase() + ' may be contributing to instability.';
        return 'Limited telemetry suggests ' + t1.toLowerCase() + ' may be contributing to instability.';
      }
      if (t2) return t1 + ' and ' + t2.toLowerCase() + ' contribute to ongoing portfolio instability.';
      return t1 + ' contributes to ongoing portfolio instability.';

    case 'improving':
      return 'Recovery trends detected across ' + (counts.recovering || 0)
        + ' repositories. ' + t1 + ' requires continued attention.';

    case 'stable':
    default:
      // Structural-only portfolio: no behavioral instability, no inactivity, no telemetry gaps.
      // Use calm language — structural maturity gaps are not active operational crises.
      if (!_hasBehavioralCoreConcerns(concerns)
          && !(concerns.no_commits > 0)
          && !(concerns.telemetry_gaps > 0)) {
        if (t2) {
          return 'Portfolio remains operationally quiet. '
            + t1 + ' and ' + t2.charAt(0).toLowerCase() + t2.slice(1)
            + ' represent structural maturity gaps.';
        }
        return 'Portfolio remains operationally quiet. '
          + t1 + ' represents a structural maturity gap.';
      }
      if (rankedKeys[0] === 'no_commits') {
        if (highConf) {
          if (t2) return 'Confirmed ' + t1.charAt(0).toLowerCase() + t1.slice(1)
            + ' and ' + t2.toLowerCase() + ' characterize a portfolio with subdued operational activity.';
          return 'Confirmed ' + t1.charAt(0).toLowerCase() + t1.slice(1)
            + ' characterizes a portfolio with subdued operational activity.';
        }
        if (t2) return t1 + ' and ' + t2.toLowerCase()
          + ' characterize a portfolio with subdued operational activity.';
        return t1 + ' characterizes a portfolio with subdued operational activity.';
      }
      if (rankedKeys[0] === 'telemetry_gaps') {
        if (t2) return t1 + ' and ' + t2.toLowerCase()
          + ' limit the ability to fully assess portfolio health.';
        return t1 + ' limits the ability to fully assess portfolio health.';
      }
      if (rankedKeys[0] === 'ci_failing' || rankedKeys[0] === 'contributor_abandoned') {
        if (t2) return t1 + ' and ' + t2.toLowerCase()
          + ' require immediate attention despite overall portfolio stability.';
        return t1 + ' requires immediate attention despite overall portfolio stability.';
      }
      if (t2) {
        return t1 + ' and ' + t2.toLowerCase()
          + ' remain notable but have not disrupted overall portfolio stability.';
      }
      return t1 + ' remains notable but has not disrupted overall portfolio stability.';
  }
}

/**
 * Generates a deterministic, confidence-aware executive operational summary.
 * Aggregates existing intelligence — no ML, no probabilistic output.
 *
 * Themes and recommendations are ordered by operational priority, aligned with
 * getAttentionQueue's WEIGHTS model:
 *   - Active operational instability (CI, escalation, abandonment, no-commits, volatility)
 *     dominates the summary.
 *   - Structural maturity signals (bus-factor, release cadence) are secondary unless
 *     widespread and meaningful.
 *
 * Confidence-aware wording:
 *   - low:  "Limited telemetry suggests...", "Preliminary operational degradation..."
 *   - high: "Sustained...", "Confirmed...", decisive language
 *   - medium: neutral (default)
 *
 * @param {object} opts
 * @param {object} opts.portfolioForecast — output of getPortfolioForecast
 * @param {Array}  opts.repos            — per-repo objects, each: ciStatus, releaseStatus,
 *                                         contributorStatus, trajectory, persistentRisk,
 *                                         noRecentCommits, score
 * @param {object} opts.attentionMap     — { [repoId]: { attentionLevel, attentionScore, reasons } }
 * @returns {{
 *   severity:        'healthy'|'low'|'medium'|'high'|'critical'|'unknown',
 *   headline:        string,
 *   summary:         string,
 *   themes:          string[],   // max 3, priority-ordered
 *   recommendations: string[],   // max 3, priority-ordered, deduplicated
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
      confidence:      SPARSE_RESULT.confidence,
    };
  }

  // ── Aggregate recurring operational concerns (attention-map primary path) ────
  var concerns   = _suppressStructural(_aggregateConcerns(am, rr, trajectory));
  var rankedKeys = _promoteInactivity(_promoteIsolatedCritical(_rankConcernsSalience(concerns), concerns), concerns);

  // ── Portfolio confidence (deterministic, evidence-quality only) ───────────
  var confidence = _derivePortfolioConfidence(trajectory, rr, concerns);

  // ── Severity ──────────────────────────────────────────────────────────────
  var severity = _deriveSeverity(pf.portfolioRiskLevel, am);

  // ── Headline (context-aware: inactivity/telemetry overrides for stable) ──
  var headline = _deriveHeadline(trajectory, concerns, rr.length);

  // ── Summary (confidence-aware) ────────────────────────────────────────────
  var summary = _buildSummary(trajectory, counts, rankedKeys.slice(0, 2), concerns, confidence);

  // ── Themes (max 3, priority-ordered) ─────────────────────────────────────
  var themes = rankedKeys.slice(0, 3).map(function(k) {
    return _themeText(k, concerns[k]);
  }).filter(Boolean);

  // ── Recommendations (max 3, priority-ordered, deduplicated) ───────────────
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
    confidence:      confidence,
  };
}

module.exports = { buildExecutiveSummary };
