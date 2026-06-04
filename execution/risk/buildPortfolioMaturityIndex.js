'use strict';

// Portfolio Maturity Index.
// Answers: "How mature is the engineering practice across the entire portfolio?"
//
// Input:  { repositories: [...scored maturity objects] }
// Output: portfolio-level score, distribution, benchmarked repos with percentile/rank,
//         common gaps, and actionable recommendations.
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const DIM_KEYS = [
  'ciMaturity',
  'releaseMaturity',
  'contributorMaturity',
  'activityMaturity',
  'prWorkflowMaturity',
  'telemetryMaturity',
];

const DIM_MAX = {
  ciMaturity:          20,
  releaseMaturity:     20,
  contributorMaturity: 20,
  activityMaturity:    20,
  prWorkflowMaturity:  10,
  telemetryMaturity:   10,
};

const MATURITY_THRESHOLDS = [
  { min: 75, level: 'mature'     },
  { min: 45, level: 'developing' },
  { min:  1, level: 'immature'   },
  { min:  0, level: 'unknown'    },
];

// relativePosition bands (percentile-based)
const POSITION_BANDS = [
  { min: 80, position: 'leading'       },
  { min: 60, position: 'above_average' },
  { min: 40, position: 'average'       },
  { min: 20, position: 'below_average' },
  { min:  0, position: 'lagging'       },
];

const COMMON_GAPS_LIMIT   = 5;
const RECOMMENDATIONS_MAX = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _maturityLevel(score) {
  for (var i = 0; i < MATURITY_THRESHOLDS.length; i++) {
    if (score >= MATURITY_THRESHOLDS[i].min) return MATURITY_THRESHOLDS[i].level;
  }
  return 'unknown';
}

function _dimValue(repo, key) {
  var dims = (repo && repo.dimensions) || {};
  var v    = dims[key];
  return typeof v === 'number' ? v : 0;
}

function _round(n) {
  return Math.round(n);
}

// ── Portfolio score ───────────────────────────────────────────────────────────

function _portfolioScore(repos) {
  var scorable = repos.filter(function(r) {
    return r.maturityLevel !== 'unknown' && typeof r.maturityScore === 'number' && r.maturityScore > 0;
  });
  if (scorable.length === 0) return 0;
  var sum = scorable.reduce(function(acc, r) { return acc + r.maturityScore; }, 0);
  return _round(sum / scorable.length);
}

// ── Distribution ──────────────────────────────────────────────────────────────

function _distribution(repos) {
  var dist = { mature: 0, developing: 0, immature: 0, unknown: 0 };
  repos.forEach(function(r) {
    var lvl = r.maturityLevel || 'unknown';
    if (dist[lvl] !== undefined) dist[lvl]++;
    else                          dist.unknown++;
  });
  return dist;
}

// ── Dimension averages ────────────────────────────────────────────────────────

function _dimensionAverages(repos) {
  var avgs = {};
  if (repos.length === 0) {
    DIM_KEYS.forEach(function(k) { avgs[k] = 0; });
    return avgs;
  }
  DIM_KEYS.forEach(function(k) {
    var sum = repos.reduce(function(acc, r) { return acc + _dimValue(r, k); }, 0);
    avgs[k] = _round(sum / repos.length);
  });
  return avgs;
}

// ── Ranking and percentile ────────────────────────────────────────────────────

function _sortedRanks(repos) {
  // Sort descending: maturityScore DESC, name ASC, id ASC — deterministic
  var sorted = repos.slice().sort(function(a, b) {
    if (b.maturityScore !== a.maturityScore) return b.maturityScore - a.maturityScore;
    var na = String(a.name || '');
    var nb = String(b.name || '');
    if (na !== nb) return na < nb ? -1 : 1;
    return (a.id || 0) - (b.id || 0);
  });

  var n = sorted.length;
  // Assign rank (ties share the same rank)
  var rankMap  = new Map(); // id → rank
  var currRank = 1;
  for (var i = 0; i < n; i++) {
    if (i > 0 && sorted[i].maturityScore !== sorted[i - 1].maturityScore) {
      currRank = i + 1;
    }
    rankMap.set(sorted[i].id, currRank);
  }

  // Percentile: proportion of repos scored strictly lower
  // (gives the top scorer 100 when n > 1 and lowest scorer 0 when n > 1)
  var percentileMap = new Map();
  for (var j = 0; j < n; j++) {
    var repo  = sorted[j];
    var below = repos.filter(function(r) { return r.maturityScore < repo.maturityScore; }).length;
    var pct   = n === 1 ? 100 : _round((below / (n - 1)) * 100);
    percentileMap.set(repo.id, pct);
  }

  return { rankMap: rankMap, percentileMap: percentileMap };
}

// ── relativePosition ─────────────────────────────────────────────────────────

function _relativePosition(percentile, allUnknown) {
  if (allUnknown) return 'unknown';
  for (var i = 0; i < POSITION_BANDS.length; i++) {
    if (percentile >= POSITION_BANDS[i].min) return POSITION_BANDS[i].position;
  }
  return 'lagging';
}

// ── Common gaps ───────────────────────────────────────────────────────────────

function _commonGaps(repos) {
  var freq = new Map();
  repos.forEach(function(r) {
    var seen = new Set();
    (Array.isArray(r.gaps) ? r.gaps : []).forEach(function(g) {
      if (!seen.has(g)) {
        seen.add(g);
        freq.set(g, (freq.get(g) || 0) + 1);
      }
    });
  });
  if (freq.size === 0) return [];

  var entries = [];
  freq.forEach(function(count, gap) { entries.push({ gap: gap, count: count }); });

  entries.sort(function(a, b) {
    if (b.count !== a.count) return b.count - a.count;   // freq DESC
    return a.gap < b.gap ? -1 : a.gap > b.gap ? 1 : 0;  // alpha ASC for ties
  });

  return entries.slice(0, COMMON_GAPS_LIMIT).map(function(e) { return e.gap; });
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidence(repos) {
  var n = repos.length;
  if (n < 3) return 'low';
  if (n < 5) return 'medium';
  var goodCount = repos.filter(function(r) {
    return r.confidenceLevel === 'high' || r.confidenceLevel === 'medium';
  }).length;
  return (goodCount / n) >= 0.7 ? 'high' : 'medium';
}

// ── Recommendations ───────────────────────────────────────────────────────────

// Dimension display names for recommendation prose
var _DIM_NAMES = {
  ciMaturity:          'CI/CD pipelines',
  releaseMaturity:     'release cadence',
  contributorMaturity: 'contributor health',
  activityMaturity:    'commit activity',
  prWorkflowMaturity:  'pull request workflow',
  telemetryMaturity:   'telemetry freshness',
};

var _DIM_RECS = {
  ciMaturity:          'Set up or fix CI/CD pipelines across repositories to increase build health visibility.',
  releaseMaturity:     'Establish a release cadence — create versioned tags or releases in repositories that lack them.',
  contributorMaturity: 'Distribute code ownership to reduce bus-factor risk and improve contributor health.',
  activityMaturity:    'Investigate inactive repositories — low commit activity may indicate abandoned or neglected work.',
  prWorkflowMaturity:  'Enable pull request workflows to improve code review visibility and governance.',
  telemetryMaturity:   'Schedule regular syncs to build historical depth and keep telemetry fresh.',
};

function _recommendations(dimAvgs, commonGaps, n) {
  if (n === 0) return [];

  var recs = [];

  // Weakest dimensions: score as fraction of max, ascending
  var dimScores = DIM_KEYS.map(function(k) {
    return { key: k, frac: dimAvgs[k] / DIM_MAX[k] };
  });
  dimScores.sort(function(a, b) { return a.frac - b.frac; });

  // Add recommendation for each dimension scoring below 60% of max
  dimScores.forEach(function(d) {
    if (recs.length >= RECOMMENDATIONS_MAX) return;
    if (d.frac < 0.6) recs.push(_DIM_RECS[d.key]);
  });

  // Add a gap-driven recommendation if common gaps exist and we still have room
  if (commonGaps.length > 0 && recs.length < RECOMMENDATIONS_MAX) {
    recs.push(
      'Address the ' + commonGaps.length + ' most common maturity gap' +
      (commonGaps.length !== 1 ? 's' : '') +
      ' shared across repositories: ' + commonGaps.slice(0, 2).join('; ') +
      (commonGaps.length > 2 ? '; and others.' : '.')
    );
  }

  return recs.slice(0, RECOMMENDATIONS_MAX);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(score, level, dist, n) {
  if (n === 0) return 'No repositories in portfolio — maturity index cannot be computed.';
  if (level === 'unknown') return 'Portfolio maturity is unknown — no usable telemetry found across ' + n + ' repositor' + (n === 1 ? 'y' : 'ies') + '.';
  var total = dist.mature + dist.developing + dist.immature + dist.unknown;
  return 'Portfolio engineering maturity is ' + level + ' (score ' + score + '/100) across ' +
    total + ' repositor' + (total === 1 ? 'y' : 'ies') + '. ' +
    dist.mature + ' mature, ' + dist.developing + ' developing, ' +
    dist.immature + ' immature, ' + dist.unknown + ' unknown.';
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Summarize maturity across a portfolio of repositories.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ repositories: Array }} [params]
 * @returns {{
 *   portfolioMaturityScore: number,
 *   maturityLevel:          string,
 *   confidenceLevel:        string,
 *   summary:                string,
 *   distribution:           object,
 *   dimensionAverages:      object,
 *   commonGaps:             string[],
 *   benchmarkedRepositories: Array,
 *   recommendations:        string[],
 * }}
 */
function buildPortfolioMaturityIndex(params) {
  var repos = (params && Array.isArray(params.repositories)) ? params.repositories : [];

  var portfolioMaturityScore = _portfolioScore(repos);
  var maturityLevel          = repos.length === 0 ? 'unknown' : _maturityLevel(portfolioMaturityScore);
  var dist                   = _distribution(repos);
  var dimAvgs                = _dimensionAverages(repos);
  var confidenceLevel        = _confidence(repos);
  var common                 = _commonGaps(repos);
  var recs                   = _recommendations(dimAvgs, common, repos.length);
  var summary                = _summary(portfolioMaturityScore, maturityLevel, dist, repos.length);

  var allUnknown = repos.length > 0 && repos.every(function(r) { return r.maturityLevel === 'unknown'; });
  var rankings   = repos.length > 0 ? _sortedRanks(repos) : { rankMap: new Map(), percentileMap: new Map() };

  var benchmarked = repos.map(function(r) {
    var pct  = rankings.percentileMap.has(r.id) ? rankings.percentileMap.get(r.id) : 0;
    var rank = rankings.rankMap.has(r.id)       ? rankings.rankMap.get(r.id)       : repos.length;
    return {
      id:               r.id,
      name:             r.name || '',
      maturityScore:    typeof r.maturityScore === 'number' ? r.maturityScore : 0,
      maturityLevel:    r.maturityLevel || 'unknown',
      percentile:       pct,
      rank:             rank,
      relativePosition: _relativePosition(pct, allUnknown),
      topGaps:          Array.isArray(r.gaps) ? r.gaps.slice(0, 3) : [],
    };
  });

  // Sort benchmarkedRepositories output by rank ASC, then name ASC for stable output
  benchmarked.sort(function(a, b) {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });

  return {
    portfolioMaturityScore,
    maturityLevel,
    confidenceLevel,
    summary,
    distribution:            dist,
    dimensionAverages:       dimAvgs,
    commonGaps:              common,
    benchmarkedRepositories: benchmarked,
    recommendations:         recs,
  };
}

module.exports = { buildPortfolioMaturityIndex };
