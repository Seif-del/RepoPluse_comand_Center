'use strict';

// Portfolio Architecture Intelligence
// Answers: "What is the overall architecture health of the entire portfolio?"
//
// Input:  { repositories: [{ repoId, repoName, architectureHealthScore,
//             architectureHealthLevel, confidenceLevel, metrics,
//             dependencyGraph, apiLinkage, boundaryVerification,
//             implementationCompleteness, topFindings, recommendations }] }
//
// Output: portfolioArchitectureScore, architectureLevel, confidenceLevel,
//         summary, distribution, systemicBoundaryViolations, portfolioCoupling,
//         apiIntegrationHealth, implementationIntegrity, benchmarkedRepositories,
//         topFindings, recommendations
//
// Pure function — no I/O, no mutation of input, deterministic output.

// ── Constants ─────────────────────────────────────────────────────────────────

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

// Architecture level thresholds (same scale as repository-level)
const ARCH_LEVEL_THRESHOLDS = [
  { min: 85, level: 'healthy' },
  { min: 70, level: 'watch'   },
  { min: 45, level: 'weak'    },
  { min:  1, level: 'risky'   },
  { min:  0, level: 'unknown' },
];

// relativePosition bands (percentile-based, matching buildPortfolioMaturityIndex pattern)
const POSITION_BANDS = [
  { min: 80, position: 'leading'       },
  { min: 60, position: 'above_average' },
  { min: 40, position: 'average'       },
  { min: 20, position: 'below_average' },
  { min:  0, position: 'lagging'       },
];

const TOP_SYSTEMIC_MAX    = 5;
const TOP_FINDINGS_MAX    = 5;
const RECOMMENDATIONS_MAX = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _safeNumber(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : 0;
}

function _severityRank(s) {
  return SEVERITY_RANK[s] !== undefined ? SEVERITY_RANK[s] : 3;
}

function _round(n) {
  return Math.round(n);
}

function _relativePosition(percentile, level) {
  if (level === 'unknown') return 'unknown';
  for (var i = 0; i < POSITION_BANDS.length; i++) {
    if (percentile >= POSITION_BANDS[i].min) return POSITION_BANDS[i].position;
  }
  return 'lagging';
}

// ── Portfolio score ───────────────────────────────────────────────────────────

function _portfolioScore(repos) {
  const usable = repos.filter(function(r) {
    return r.architectureHealthLevel !== 'unknown' &&
           typeof r.architectureHealthScore === 'number';
  });
  if (usable.length === 0) return 0;
  const sum = usable.reduce(function(acc, r) {
    return acc + r.architectureHealthScore;
  }, 0);
  return _round(sum / usable.length);
}

// ── Architecture level ────────────────────────────────────────────────────────

function _architectureLevel(score, hasUsable) {
  if (!hasUsable) return 'unknown';
  for (var i = 0; i < ARCH_LEVEL_THRESHOLDS.length; i++) {
    if (score >= ARCH_LEVEL_THRESHOLDS[i].min) return ARCH_LEVEL_THRESHOLDS[i].level;
  }
  return 'unknown';
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(repos) {
  const n = repos.length;
  if (n === 0) return 'low';
  const highMedCount = repos.filter(function(r) {
    return r.confidenceLevel === 'high' || r.confidenceLevel === 'medium';
  }).length;
  if (n >= 5 && (highMedCount / n) >= 0.70) return 'high';
  if (n >= 3) return 'medium';
  return 'low';
}

// ── Distribution ──────────────────────────────────────────────────────────────

function _distribution(repos) {
  const dist = { healthy: 0, watch: 0, weak: 0, risky: 0, unknown: 0 };
  repos.forEach(function(r) {
    const lvl = r.architectureHealthLevel || 'unknown';
    if (dist[lvl] !== undefined) dist[lvl]++;
    else dist.unknown++;
  });
  return dist;
}

// ── Systemic boundary violations ──────────────────────────────────────────────

function _systemicBoundaryViolations(repos) {
  const byType = new Map();

  repos.forEach(function(repo) {
    const violations = _safeArray(
      repo.boundaryVerification && repo.boundaryVerification.violations
    );
    violations.forEach(function(v) {
      const type = v.type || 'unknown';
      if (!byType.has(type)) {
        byType.set(type, {
          type,
          count:        0,
          affectedRepos: new Set(),
          severity:     v.severity || 'low',
          summary:      v.summary  || type,
        });
      }
      const entry = byType.get(type);
      entry.count++;
      entry.affectedRepos.add(repo.repoName || String(repo.repoId || ''));
      // Escalate to most severe
      if (_severityRank(v.severity) < _severityRank(entry.severity)) {
        entry.severity = v.severity || entry.severity;
        entry.summary  = v.summary  || entry.summary;
      }
    });
  });

  return Array.from(byType.values())
    .sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      const sr = _severityRank(a.severity) - _severityRank(b.severity);
      if (sr !== 0) return sr;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    })
    .slice(0, TOP_SYSTEMIC_MAX)
    .map(function(entry) {
      return {
        type:          entry.type,
        count:         entry.count,
        affectedRepos: Array.from(entry.affectedRepos).sort(),
        severity:      entry.severity,
        summary:       entry.summary,
      };
    });
}

// ── Portfolio coupling ────────────────────────────────────────────────────────

function _portfolioCoupling(repos) {
  let totalEdges                   = 0;
  let totalCircularDependencies    = 0;
  let reposWithCircularDependencies = 0;
  let highFanOutFiles              = 0;
  let highFanInFiles               = 0;

  repos.forEach(function(repo) {
    const cm = (repo.dependencyGraph && repo.dependencyGraph.couplingMetrics) || {};
    totalEdges += _safeNumber(cm.totalEdges);
    const circCount = _safeNumber(cm.circularDependencyCount);
    totalCircularDependencies += circCount;
    if (circCount > 0) reposWithCircularDependencies++;
    highFanOutFiles += _safeArray(cm.highFanOutFiles).length;
    highFanInFiles  += _safeArray(cm.highFanInFiles).length;
  });

  const n = repos.length;
  const averageEdgesPerRepo = n > 0 ? totalEdges / n : 0;

  let couplingLevel;
  if (reposWithCircularDependencies >= 3 || averageEdgesPerRepo > 80) {
    couplingLevel = 'risky';
  } else if (reposWithCircularDependencies >= 1 || averageEdgesPerRepo > 40) {
    couplingLevel = 'weak';
  } else if (averageEdgesPerRepo > 20) {
    couplingLevel = 'watch';
  } else {
    couplingLevel = 'healthy';
  }

  return {
    totalEdges,
    totalCircularDependencies,
    reposWithCircularDependencies,
    highFanOutFiles,
    highFanInFiles,
    averageEdgesPerRepo: Math.round(averageEdgesPerRepo * 10) / 10,
    couplingLevel,
  };
}

// ── API integration health ────────────────────────────────────────────────────

function _apiIntegrationHealth(repos) {
  let totalFrontendCalls           = 0;
  let totalBackendRoutes           = 0;
  let totalLinkedEndpoints         = 0;
  let totalUnresolvedFrontendCalls = 0;
  let totalOrphanedBackendRoutes   = 0;
  let frontendCovSum               = 0;
  let backendCovSum                = 0;
  let coverageCount                = 0;

  repos.forEach(function(repo) {
    const cov = (repo.apiLinkage && repo.apiLinkage.coverage) || {};
    const fc  = _safeNumber(cov.frontendCallCount);
    const br  = _safeNumber(cov.backendRouteCount);
    totalFrontendCalls           += fc;
    totalBackendRoutes           += br;
    totalLinkedEndpoints         += _safeNumber(cov.linkedFrontendCallCount);
    totalUnresolvedFrontendCalls += _safeNumber(cov.unresolvedFrontendCallCount);
    totalOrphanedBackendRoutes   += _safeNumber(cov.orphanedBackendRouteCount);

    if (fc > 0 || br > 0) {
      frontendCovSum += _safeNumber(cov.frontendCoveragePercent);
      backendCovSum  += _safeNumber(cov.backendCoveragePercent);
      coverageCount++;
    }
  });

  const averageFrontendCoverage = coverageCount > 0 ? _round(frontendCovSum / coverageCount) : 0;
  const averageBackendCoverage  = coverageCount > 0 ? _round(backendCovSum  / coverageCount) : 0;

  let integrationLevel;
  if (totalFrontendCalls === 0 && totalBackendRoutes === 0) {
    integrationLevel = 'unknown';
  } else if (averageFrontendCoverage >= 70 && averageBackendCoverage >= 70) {
    integrationLevel = 'integrated';
  } else if (averageFrontendCoverage >= 40 || averageBackendCoverage >= 40) {
    integrationLevel = 'partial';
  } else {
    integrationLevel = 'weak';
  }

  return {
    totalFrontendCalls,
    totalBackendRoutes,
    totalLinkedEndpoints,
    totalUnresolvedFrontendCalls,
    totalOrphanedBackendRoutes,
    averageFrontendCoverage,
    averageBackendCoverage,
    integrationLevel,
  };
}

// ── Implementation integrity ──────────────────────────────────────────────────

function _implementationIntegrity(repos) {
  let scoreSum                  = 0;
  let scoreCount                = 0;
  let totalImplementationSignals = 0;
  let totalPlaceholderHints     = 0;
  let totalScaffoldLikeFiles    = 0;
  let reposWithWeakCompleteness = 0;

  repos.forEach(function(repo) {
    const ic = repo.implementationCompleteness || {};
    if (typeof ic.completenessScore === 'number') {
      scoreSum += ic.completenessScore;
      scoreCount++;
    }
    totalImplementationSignals += _safeArray(ic.signals).length;
    totalPlaceholderHints      += _safeNumber(ic.placeholderAssessment && ic.placeholderAssessment.placeholderCount);
    totalScaffoldLikeFiles     += _safeNumber(ic.scaffoldAssessment && ic.scaffoldAssessment.scaffoldLikeFileCount);
    if (ic.completenessLevel === 'weak') reposWithWeakCompleteness++;
  });

  const averageCompletenessScore = scoreCount > 0 ? _round(scoreSum / scoreCount) : 0;

  let integrityLevel;
  if (scoreCount === 0) {
    integrityLevel = 'unknown';
  } else if (averageCompletenessScore >= 80 && reposWithWeakCompleteness === 0) {
    integrityLevel = 'strong';
  } else if (averageCompletenessScore >= 60) {
    integrityLevel = 'moderate';
  } else {
    integrityLevel = 'weak';
  }

  return {
    averageCompletenessScore,
    totalImplementationSignals,
    totalPlaceholderHints,
    totalScaffoldLikeFiles,
    reposWithWeakCompleteness,
    integrityLevel,
  };
}

// ── Benchmarked repositories ──────────────────────────────────────────────────

function _benchmarkedRepositories(repos) {
  if (repos.length === 0) return [];

  const n = repos.length;

  // Sort: score DESC, repoName ASC, repoId ASC — deterministic tie-breaking
  const sorted = repos.slice().sort(function(a, b) {
    const sa = _safeNumber(a.architectureHealthScore);
    const sb = _safeNumber(b.architectureHealthScore);
    if (sb !== sa) return sb - sa;
    const na = String(a.repoName || '');
    const nb = String(b.repoName || '');
    if (na !== nb) return na < nb ? -1 : 1;
    return _safeNumber(a.repoId) - _safeNumber(b.repoId);
  });

  // Assign ranks (ties share rank)
  const rankMap = new Map();
  let currRank  = 1;
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const prevScore = _safeNumber(sorted[i - 1].architectureHealthScore);
      const currScore = _safeNumber(sorted[i].architectureHealthScore);
      if (currScore !== prevScore) currRank = i + 1;
    }
    rankMap.set(sorted[i].repoId, currRank);
  }

  // Percentile: proportion of repos with strictly lower score
  // (gives top scorer 100 when n > 1, lowest scorer 0 when n > 1)
  const percentileMap = new Map();
  sorted.forEach(function(repo) {
    const score = _safeNumber(repo.architectureHealthScore);
    const below = repos.filter(function(r) {
      return _safeNumber(r.architectureHealthScore) < score;
    }).length;
    const pct = n === 1 ? 100 : _round((below / (n - 1)) * 100);
    percentileMap.set(repo.repoId, pct);
  });

  return sorted.map(function(repo) {
    const rank       = rankMap.get(repo.repoId) || 1;
    const percentile = percentileMap.get(repo.repoId) !== undefined
      ? percentileMap.get(repo.repoId)
      : 0;
    const relPos = _relativePosition(percentile, repo.architectureHealthLevel || 'unknown');

    // Per-repo driver signal fields (Bug Fix #2): populate Architecture Drivers on
    // initial table render without requiring a per-click /api/repos/:id/architecture fetch.
    const cm     = (repo.dependencyGraph && repo.dependencyGraph.couplingMetrics) || null;
    const apiCov = (repo.apiLinkage && repo.apiLinkage.coverage) || {};
    const ic     = repo.implementationCompleteness || {};
    const bvArr  = (repo.boundaryVerification && Array.isArray(repo.boundaryVerification.violations))
                 ? repo.boundaryVerification.violations : [];

    // Mirror frontend _deriveCouplingLevel() thresholds exactly.
    let couplingRisk;
    if (!cm) {
      couplingRisk = 'healthy';
    } else {
      const circular = _safeNumber(cm.circularDependencyCount);
      const avgOut   = typeof cm.averageOutDegree === 'number' ? cm.averageOutDegree : 0;
      const fanOut   = _safeArray(cm.highFanOutFiles).length;
      if      (circular > 5 || avgOut > 8 || fanOut > 5) couplingRisk = 'risky';
      else if (circular > 2 || avgOut > 5 || fanOut > 2) couplingRisk = 'weak';
      else if (circular > 0 || avgOut > 3 || fanOut > 0) couplingRisk = 'watch';
      else                                                 couplingRisk = 'healthy';
    }

    return {
      repoId:                  repo.repoId,
      repoName:                repo.repoName,
      architectureHealthScore: _safeNumber(repo.architectureHealthScore),
      architectureHealthLevel: repo.architectureHealthLevel || 'unknown',
      rank,
      percentile,
      relativePosition:        relPos,
      unresolvedApiCalls:         _safeNumber(apiCov.unresolvedFrontendCallCount),
      implementationCompleteness: typeof ic.completenessScore === 'number' ? ic.completenessScore : null,
      couplingRisk,
      boundaryViolationCount:     bvArr.length,
      confidenceLevel:            repo.confidenceLevel || 'unknown',
    };
  });
}

// ── Top findings ──────────────────────────────────────────────────────────────

function _topFindings(repos) {
  const byType = new Map();

  repos.forEach(function(repo) {
    _safeArray(repo.topFindings).forEach(function(f) {
      const type = f.type || 'unknown';
      if (!byType.has(type)) {
        byType.set(type, {
          type,
          severity:     f.severity || 'low',
          summary:      f.summary  || type,
          count:        0,
          affectedRepos: new Set(),
        });
      }
      const entry = byType.get(type);
      entry.count++;
      entry.affectedRepos.add(repo.repoName || String(repo.repoId || ''));
      if (_severityRank(f.severity) < _severityRank(entry.severity)) {
        entry.severity = f.severity;
        entry.summary  = f.summary || entry.summary;
      }
    });
  });

  return Array.from(byType.values())
    .sort(function(a, b) {
      const sr = _severityRank(a.severity) - _severityRank(b.severity);
      if (sr !== 0) return sr;
      if (b.count !== a.count) return b.count - a.count;
      return a.type < b.type ? -1 : a.type > b.type ? 1 : 0;
    })
    .slice(0, TOP_FINDINGS_MAX)
    .map(function(entry) {
      return {
        type:          entry.type,
        severity:      entry.severity,
        summary:       entry.summary,
        count:         entry.count,
        affectedRepos: Array.from(entry.affectedRepos).sort(),
      };
    });
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(repos, systemicViolations, coupling, apiHealth, integrity) {
  const recs = [];
  const seen = new Set();

  function _push(rec) {
    if (recs.length < RECOMMENDATIONS_MAX && !seen.has(rec)) {
      seen.add(rec);
      recs.push(rec);
    }
  }

  // 1. Systemic boundary violations
  if (systemicViolations.length > 0) {
    const top = systemicViolations[0];
    _push(
      'Boundary violation "' + top.type + '" found in ' + top.affectedRepos.length +
      ' repositor' + (top.affectedRepos.length === 1 ? 'y' : 'ies') +
      ' — enforce layer boundaries systematically across the portfolio.'
    );
  }

  // 2. Unresolved frontend APIs across multiple repos
  if (apiHealth.totalUnresolvedFrontendCalls > 0) {
    const affected = repos.filter(function(r) {
      const cov = (r.apiLinkage && r.apiLinkage.coverage) || {};
      return _safeNumber(cov.unresolvedFrontendCallCount) > 0;
    }).length;
    if (affected > 1) {
      _push(
        apiHealth.totalUnresolvedFrontendCalls + ' unresolved frontend API call' +
        (apiHealth.totalUnresolvedFrontendCalls === 1 ? '' : 's') + ' across ' + affected +
        ' repositories — align frontend call paths with backend route definitions.'
      );
    }
  }

  // 3. Circular dependency concentration
  if (coupling.reposWithCircularDependencies > 0) {
    _push(
      coupling.reposWithCircularDependencies + ' repositor' +
      (coupling.reposWithCircularDependencies === 1 ? 'y has' : 'ies have') +
      ' circular import dependencies — resolve cycles starting with the highest-risk modules.'
    );
  }

  // 4. Weak implementation completeness
  if (integrity.reposWithWeakCompleteness > 0) {
    _push(
      integrity.reposWithWeakCompleteness + ' repositor' +
      (integrity.reposWithWeakCompleteness === 1 ? 'y has' : 'ies have') +
      ' weak implementation completeness — replace placeholder logic before production use.'
    );
  }

  // 5. Coupling concentration
  if (coupling.couplingLevel === 'risky' || coupling.couplingLevel === 'weak') {
    _push(
      'Portfolio coupling is ' + coupling.couplingLevel +
      ' — review module boundaries to reduce import density and improve maintainability.'
    );
  }

  // 6. Common repo recommendations (fill remaining slots, deduplicated)
  if (recs.length < RECOMMENDATIONS_MAX) {
    const repoRecs = [];
    repos.forEach(function(repo) {
      _safeArray(repo.recommendations).forEach(function(r) {
        repoRecs.push(r);
      });
    });
    // Count frequency
    const freq = new Map();
    repoRecs.forEach(function(r) { freq.set(r, (freq.get(r) || 0) + 1); });
    Array.from(freq.entries())
      .sort(function(a, b) {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
      })
      .forEach(function(entry) { _push(entry[0]); });
  }

  return recs;
}

// ── Summary ───────────────────────────────────────────────────────────────────

const PORTFOLIO_SUMMARIES = {
  healthy: 'Portfolio architecture appears healthy — boundary health and implementation coverage look strong across the portfolio.',
  watch:   'Portfolio architecture has watch items — review boundary violations and API linkage gaps before scaling.',
  weak:    'Portfolio architecture is weakened by a small number of high-risk repositories and implementation completeness concerns.',
  risky:   'Portfolio architecture indicates significant risk — structural refactoring and boundary enforcement are recommended.',
  unknown: 'Portfolio architecture data is insufficient — no usable architecture snapshots available.',
};

function _summary(level, n) {
  if (n === 0) return 'No repositories available for portfolio architecture analysis.';
  return PORTFOLIO_SUMMARIES[level] || PORTFOLIO_SUMMARIES.unknown;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Aggregates multiple repository architecture snapshots into a portfolio-level
 * architecture intelligence report.
 *
 * Pure function — no I/O, no mutation of input, deterministic output.
 *
 * @param {{ repositories: Array }} [params]
 * @returns {object} Portfolio architecture intelligence report
 */
function buildPortfolioArchitectureIntelligence(params) {
  const repos = (params && Array.isArray(params.repositories))
    ? params.repositories
    : [];

  const score    = _portfolioScore(repos);
  const hasUsable = repos.some(function(r) { return r.architectureHealthLevel !== 'unknown'; });
  const level    = _architectureLevel(score, hasUsable);

  const distribution            = _distribution(repos);
  const systemicBoundaryViolations = _systemicBoundaryViolations(repos);
  const portfolioCoupling       = _portfolioCoupling(repos);
  const apiIntegrationHealth    = _apiIntegrationHealth(repos);
  const implementationIntegrity = _implementationIntegrity(repos);
  const benchmarkedRepositories = _benchmarkedRepositories(repos);
  const topFindings             = _topFindings(repos);
  const recommendations         = _recommendations(
    repos, systemicBoundaryViolations, portfolioCoupling,
    apiIntegrationHealth, implementationIntegrity
  );
  const confidence = _confidenceLevel(repos);
  const summary    = _summary(level, repos.length);

  return {
    portfolioArchitectureScore:   score,
    architectureLevel:            level,
    confidenceLevel:              confidence,
    summary,
    distribution,
    systemicBoundaryViolations,
    portfolioCoupling,
    apiIntegrationHealth,
    implementationIntegrity,
    benchmarkedRepositories,
    topFindings,
    recommendations,
  };
}

module.exports = { buildPortfolioArchitectureIntelligence };
