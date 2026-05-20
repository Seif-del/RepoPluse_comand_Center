'use strict';

// ── Constants ─────────────────────────────────────────────────────────────────

var TWO_HOURS_MS = 2 * 60 * 60 * 1000;

var SEV_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
var SEV_BY_ORD = { 0: 'critical', 1: 'high', 2: 'medium', 3: 'low' };

// Maps every anomaly type to its cluster-type family.
// score_spike and portfolio_risk_jump share risk_acceleration_cluster
// because both signal unexpected risk score growth.
var TYPE_FAMILY = {
  'sudden_ci_failure':       'ci_instability_cluster',
  'synchronized_inactivity': 'inactivity_cluster',
  'telemetry_dropout':       'telemetry_visibility_cluster',
  'score_spike':             'risk_acceleration_cluster',
  'portfolio_risk_jump':     'risk_acceleration_cluster',
  'volatility_surge':        'volatility_cluster',
};

// Human-readable baseline label per cluster type (used in titles and summaries).
var CLUSTER_LABEL = {
  'ci_instability_cluster':       'CI instability',
  'inactivity_cluster':           'Contributor inactivity',
  'telemetry_visibility_cluster': 'Telemetry signal loss',
  'risk_acceleration_cluster':    'Risk acceleration',
  'volatility_cluster':           'Operational volatility surge',
  'mixed_operational_cluster':    'Mixed operational signals',
};

// Sentence fragment that opens each cluster summary.
var CLUSTER_BASE = {
  'ci_instability_cluster':       'CI pipeline instability detected',
  'inactivity_cluster':           'Contributor inactivity spread',
  'telemetry_visibility_cluster': 'Telemetry signal dropout detected',
  'risk_acceleration_cluster':    'Operational risk accelerated',
  'volatility_cluster':           'Operational volatility surged',
  'mixed_operational_cluster':    'Mixed operational signals detected',
};

// ── Union-Find ────────────────────────────────────────────────────────────────
// Deterministic connected-component grouping without ML or probability.

function _makeUnionFind(n) {
  var parent = [];
  var rank   = [];
  for (var i = 0; i < n; i++) { parent[i] = i; rank[i] = 0; }
  return { parent: parent, rank: rank };
}

function _find(uf, i) {
  while (uf.parent[i] !== i) {
    uf.parent[i] = uf.parent[uf.parent[i]]; // path-halving
    i = uf.parent[i];
  }
  return i;
}

function _union(uf, i, j) {
  var ri = _find(uf, i);
  var rj = _find(uf, j);
  if (ri === rj) return;
  if (uf.rank[ri] < uf.rank[rj]) {
    uf.parent[ri] = rj;
  } else if (uf.rank[ri] > uf.rank[rj]) {
    uf.parent[rj] = ri;
  } else {
    uf.parent[rj] = ri;
    uf.rank[ri]++;
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function _toMs(isoStr) {
  if (!isoStr) return 0;
  var t = new Date(isoStr).getTime();
  return isNaN(t) ? 0 : t;
}

function _hasSharedRepos(r1, r2) {
  if (!Array.isArray(r1) || !Array.isArray(r2)) return false;
  for (var i = 0; i < r1.length; i++) {
    if (!r1[i]) continue;
    for (var j = 0; j < r2.length; j++) {
      if (r1[i] === r2[j]) return true;
    }
  }
  return false;
}

// Returns unique, sorted union of all affectedRepos across members.
function _collectAffectedRepos(members) {
  var seen = {};
  for (var i = 0; i < members.length; i++) {
    var repos = Array.isArray(members[i].affectedRepos) ? members[i].affectedRepos : [];
    for (var j = 0; j < repos.length; j++) {
      if (repos[j]) seen[repos[j]] = true;
    }
  }
  return Object.keys(seen).sort();
}

// Single cluster type when all members share a family; otherwise mixed.
function _determineClusterType(members) {
  var families = {};
  for (var i = 0; i < members.length; i++) {
    families[TYPE_FAMILY[members[i].type] || 'mixed_operational_cluster'] = true;
  }
  var keys = Object.keys(families);
  return keys.length === 1 ? keys[0] : 'mixed_operational_cluster';
}

// Escalates to the highest severity present across all members.
function _aggregateSeverity(members) {
  var best = 3; // 'low' ordinal
  for (var i = 0; i < members.length; i++) {
    var ord = SEV_ORDER[members[i].severity];
    if (ord != null && ord < best) best = ord;
  }
  return SEV_BY_ORD[best] || 'low';
}

/**
 * Deterministic confidence aggregation:
 *   > 50% high  → 'high'
 *   > 50% low   → 'low'
 *   otherwise   → 'medium'
 * Score is the integer average of individual confidence scores.
 */
function _aggregateConfidence(members) {
  var total = members.length;
  if (total === 0) return { level: 'low', score: 0, rationale: 'No anomalies' };

  var highCount = 0;
  var lowCount  = 0;
  var scoreSum  = 0;
  for (var i = 0; i < members.length; i++) {
    var conf = members[i].confidence;
    if (!conf) continue;
    if (conf.level === 'high') highCount++;
    if (conf.level === 'low')  lowCount++;
    if (typeof conf.score === 'number') scoreSum += conf.score;
  }

  var level = highCount / total > 0.5 ? 'high'
            : lowCount  / total > 0.5 ? 'low'
            : 'medium';

  var mediumCount = total - highCount - lowCount;

  return {
    level:     level,
    score:     Math.round(scoreSum / total),
    rationale: 'Aggregated from ' + total + ' anomal' + (total !== 1 ? 'ies' : 'y')
             + ': ' + highCount + ' high, ' + mediumCount + ' medium, ' + lowCount + ' low confidence',
  };
}

// Builds time window from the earliest to latest detectedAt across members.
function _buildTimeWindow(members) {
  var times = [];
  for (var i = 0; i < members.length; i++) {
    var t = _toMs(members[i].detectedAt);
    if (t > 0) times.push(t);
  }
  if (!times.length) return { start: null, end: null, durationMs: 0 };

  var minT = times[0];
  var maxT = times[0];
  for (var j = 1; j < times.length; j++) {
    if (times[j] < minT) minT = times[j];
    if (times[j] > maxT) maxT = times[j];
  }
  return {
    start:      new Date(minT).toISOString(),
    end:        new Date(maxT).toISOString(),
    durationMs: maxT - minT,
  };
}

function _buildTitle(clusterType, repoCount) {
  var label = CLUSTER_LABEL[clusterType] || 'Operational anomaly';
  if (repoCount > 1) {
    return label + ' across ' + repoCount + ' repositories';
  }
  return label;
}

function _buildSummary(clusterType, members, affectedRepos, timeWindow) {
  var n   = members.length;
  var r   = affectedRepos.length;
  var dur = timeWindow.durationMs > 0
          ? ' within ' + Math.round(timeWindow.durationMs / 60000) + ' minute'
            + (Math.round(timeWindow.durationMs / 60000) !== 1 ? 's' : '')
          : '';

  return (CLUSTER_BASE[clusterType] || 'Operational anomalies detected')
       + ': ' + n + ' anomal' + (n !== 1 ? 'ies' : 'y')
       + (r > 0 ? ' across ' + r + ' repo' + (r !== 1 ? 's' : '') : '')
       + dur + '.';
}

// djb2 hash — deterministic 8-char hex ID from a string.
function _simpleHash(str) {
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Generates a deterministic cluster ID that is:
 *   - stable regardless of input array order
 *   - unique per distinct anomaly set
 * Built from sorted fingerprints of each member's type, repos, and timestamp.
 */
function _generateClusterId(members) {
  var parts = [];
  for (var i = 0; i < members.length; i++) {
    var a     = members[i];
    var repos = Array.isArray(a.affectedRepos) ? a.affectedRepos.slice().sort().join(',') : '';
    parts.push(a.type + '|' + repos + '|' + (a.detectedAt || ''));
  }
  parts.sort();
  return 'cluster_' + _simpleHash(parts.join('::'));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Groups related anomalies into explainable operational clusters.
 * Pure function — no I/O, no ML, no randomness. Does not mutate input.
 *
 * Clustering rules (evaluated pairwise, transitively connected via union-find):
 *   A. Same type-family AND timestamps within 2-hour window → cluster
 *   B. Shared affected repositories AND timestamps within 2-hour window → cluster
 *
 * Cluster types:
 *   ci_instability_cluster       — sudden_ci_failure anomalies
 *   inactivity_cluster           — synchronized_inactivity anomalies
 *   telemetry_visibility_cluster — telemetry_dropout anomalies
 *   risk_acceleration_cluster    — score_spike and portfolio_risk_jump anomalies
 *   volatility_cluster           — volatility_surge anomalies
 *   mixed_operational_cluster    — anomalies spanning multiple families, correlated by repo/time
 *
 * @param {Array} anomalies — output of detectOperationalAnomalies (or compatible shape)
 * @returns {Array<{
 *   clusterId:     string,
 *   clusterType:   string,
 *   severity:      'low'|'medium'|'high'|'critical',
 *   title:         string,
 *   summary:       string,
 *   anomalyCount:  number,
 *   affectedRepos: string[],
 *   timeWindow:    { start: string|null, end: string|null, durationMs: number },
 *   confidence:    { level: string, score: number, rationale: string },
 *   anomalies:     Array,
 * }>}
 * Sorted: severity DESC, anomalyCount DESC, newest timeWindow.end DESC.
 */
function clusterOperationalAnomalies(anomalies) {
  if (!Array.isArray(anomalies) || !anomalies.length) return [];

  // Reject null / non-object / type-less entries.
  var valid = [];
  for (var i = 0; i < anomalies.length; i++) {
    var a = anomalies[i];
    if (a && typeof a === 'object' && typeof a.type === 'string') valid.push(a);
  }
  if (!valid.length) return [];

  var n   = valid.length;
  var uf  = _makeUnionFind(n);
  var tms = [];
  for (var k = 0; k < n; k++) tms.push(_toMs(valid[k].detectedAt));

  // Pairwise rule evaluation — O(n²), acceptable given typical anomaly counts.
  for (var i = 0; i < n; i++) {
    for (var j = i + 1; j < n; j++) {
      if (Math.abs(tms[i] - tms[j]) > TWO_HOURS_MS) continue;

      var fi = TYPE_FAMILY[valid[i].type] || 'mixed_operational_cluster';
      var fj = TYPE_FAMILY[valid[j].type] || 'mixed_operational_cluster';

      if (fi === fj) {
        // Rule A: same type-family within time window.
        _union(uf, i, j);
      } else if (_hasSharedRepos(valid[i].affectedRepos, valid[j].affectedRepos)) {
        // Rule B: cross-family anomalies sharing a repo within time window.
        _union(uf, i, j);
      }
    }
  }

  // Collect connected components by their root index.
  var components = {};
  for (var m = 0; m < n; m++) {
    var root = _find(uf, m);
    if (!components[root]) components[root] = [];
    components[root].push(valid[m]);
  }

  // Build one cluster per component.
  var clusters = [];
  var roots    = Object.keys(components);
  for (var r = 0; r < roots.length; r++) {
    var members = components[roots[r]];

    // Sort members newest-first within each cluster; type ASC as tiebreaker.
    members.sort(function(x, y) {
      var dt = _toMs(y.detectedAt) - _toMs(x.detectedAt);
      if (dt !== 0) return dt;
      return x.type < y.type ? -1 : x.type > y.type ? 1 : 0;
    });

    var clusterType   = _determineClusterType(members);
    var affectedRepos = _collectAffectedRepos(members);
    var timeWindow    = _buildTimeWindow(members);

    clusters.push({
      clusterId:    _generateClusterId(members),
      clusterType:  clusterType,
      severity:     _aggregateSeverity(members),
      title:        _buildTitle(clusterType, affectedRepos.length),
      summary:      _buildSummary(clusterType, members, affectedRepos, timeWindow),
      anomalyCount: members.length,
      affectedRepos: affectedRepos,
      timeWindow:   timeWindow,
      confidence:   _aggregateConfidence(members),
      anomalies:    members,
    });
  }

  // Sort clusters: severity DESC → anomalyCount DESC → newest timeWindow.end DESC.
  clusters.sort(function(a, b) {
    var sevDiff = (SEV_ORDER[a.severity] != null ? SEV_ORDER[a.severity] : 3)
                - (SEV_ORDER[b.severity] != null ? SEV_ORDER[b.severity] : 3);
    if (sevDiff !== 0) return sevDiff;
    if (b.anomalyCount !== a.anomalyCount) return b.anomalyCount - a.anomalyCount;
    var ta = a.timeWindow.end ? _toMs(a.timeWindow.end) : 0;
    var tb = b.timeWindow.end ? _toMs(b.timeWindow.end) : 0;
    return tb - ta;
  });

  return clusters;
}

module.exports = { clusterOperationalAnomalies };
