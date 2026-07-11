'use strict';

// Repository Architecture Snapshot Aggregator
// Answers: "What is the overall architecture health of this repository?"
//
// Input:  { repoId, repoName, defaultBranch, snapshotAt, files: [{path, content, sizeBytes, language, lastModified}] }
// Output: repoId, repoName, defaultBranch, snapshotAt,
//         architectureHealthScore, architectureHealthLevel, confidenceLevel,
//         summary, inventory, dependencyGraph, routeApiStructure, apiLinkage,
//         boundaryVerification, implementationCompleteness,
//         topFindings, recommendations, metrics
//
// Pure function — no I/O, no mutation of input.
// Composes the six Phase 1 Architecture Intelligence modules in pipeline order.

const { buildRepositoryStructureInventory } = require('./buildRepositoryStructureInventory');
const { buildImportDependencyGraph }         = require('./buildImportDependencyGraph');
const { extractRouteApiStructure }           = require('./extractRouteApiStructure');
const { linkFrontendBackendApis }            = require('./linkFrontendBackendApis');
const { verifyArchitectureBoundaries }       = require('./verifyArchitectureBoundaries');
const { assessImplementationCompleteness }   = require('./assessImplementationCompleteness');
const { deduplicateTopFindings }             = require('./deduplicateTopFindings');
const { deduplicateRecommendations }         = require('./deduplicateRecommendations');

const RECOMMENDATIONS_MAX = 5;
const TOP_FINDINGS_MAX    = 5;
const ANALYZER_VERSION    = '1.0';
const SCORING_VERSION     = '1.0';

// ── Structure presence ────────────────────────────────────────────────────────

function _hasAnyStructure(inventory) {
  if (!inventory) return false;
  if (inventory.totalFiles > 0) return true;
  const h = inventory.architectureHints || {};
  return !!(h.hasApiLayer || h.hasServiceLayer || h.hasModelLayer || h.hasFrontend || h.hasBackend);
}

// ── Health score ──────────────────────────────────────────────────────────────

function _calcHealthScore(boundaryScore, completenessScore, linkageScore) {
  return Math.round(boundaryScore * 0.40 + completenessScore * 0.40 + linkageScore * 0.20);
}

function _healthLevel(score, hasStructure) {
  if (!hasStructure) return 'unknown';
  if (score >= 85)   return 'healthy';
  if (score >= 70)   return 'watch';
  if (score >= 45)   return 'weak';
  return 'risky';
}

// ── Confidence ────────────────────────────────────────────────────────────────

function _confidenceLevel(totalFiles, inventory, routeApiStructure) {
  if (totalFiles < 5) return 'low';
  const hints     = (inventory && inventory.architectureHints) || {};
  const routes    = (routeApiStructure && routeApiStructure.backendRoutes)    || [];
  const calls     = (routeApiStructure && routeApiStructure.frontendApiCalls) || [];
  const hasApiData = routes.length > 0 || calls.length > 0;
  const richCount  = [hints.hasTests, hints.hasBackend, hints.hasFrontend, hasApiData].filter(Boolean).length;
  if (totalFiles >= 20 && richCount >= 2) return 'high';
  return 'medium';
}

// ── Top findings ──────────────────────────────────────────────────────────────

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 };

function _severityRank(s) {
  return SEVERITY_RANK[s] !== undefined ? SEVERITY_RANK[s] : 3;
}

function _topFindings(boundaryVerification, apiLinkage, implCompleteness, dependencyGraph) {
  const candidates = [];

  // 1. Strong boundary violations (highest priority)
  const violations = (boundaryVerification && boundaryVerification.violations) || [];
  violations.forEach(function(v) {
    candidates.push({ type: v.type, severity: v.severity || 'high', summary: v.summary || v.type, _p: 1 });
  });

  // 2. Unresolved frontend API calls
  const unresolved = (apiLinkage && apiLinkage.unresolvedFrontendCalls) || [];
  if (unresolved.length > 0) {
    candidates.push({
      type:     'unresolved_frontend_calls',
      severity: 'medium',
      summary:  unresolved.length + ' frontend API call' + (unresolved.length === 1 ? '' : 's') +
                ' have no matching backend route.',
      _p: 2,
    });
  }

  // 3. Method mismatches
  const mismatches = (apiLinkage && apiLinkage.methodMismatches) || [];
  if (mismatches.length > 0) {
    candidates.push({
      type:     'method_mismatches',
      severity: 'medium',
      summary:  mismatches.length + ' HTTP method mismatch' + (mismatches.length === 1 ? '' : 'es') +
                ' between frontend calls and backend routes.',
      _p: 3,
    });
  }

  // 4. High-severity implementation signals
  const signals = (implCompleteness && implCompleteness.signals) || [];
  signals
    .filter(function(s) { return s.severity === 'high'; })
    .forEach(function(s) {
      candidates.push({ type: s.type, severity: s.severity, summary: s.summary, _p: 4 });
    });

  // 5. Circular dependencies
  const circulars = (dependencyGraph && dependencyGraph.circularDependencies) || [];
  if (circulars.length > 0) {
    const hasHighSeverity = circulars.some(function(c) { return c.severity === 'high'; });
    candidates.push({
      type:     'circular_dependencies',
      severity: hasHighSeverity ? 'high' : 'medium',
      summary:  circulars.length + ' circular import dependenc' +
                (circulars.length === 1 ? 'y' : 'ies') + ' detected.',
      _p: 5,
    });
  }

  // 6. Orphaned backend route candidates
  const orphaned = (apiLinkage && apiLinkage.orphanedBackendRoutes) || [];
  if (orphaned.length > 0) {
    candidates.push({
      type:     'orphaned_backend_routes',
      severity: 'low',
      summary:  orphaned.length + ' backend route' + (orphaned.length === 1 ? '' : 's') +
                ' with no frontend counterpart — candidate for review.',
      _p: 6,
    });
  }

  candidates.sort(function(a, b) {
    if (a._p !== b._p) return a._p - b._p;
    return _severityRank(a.severity) - _severityRank(b.severity);
  });

  return deduplicateTopFindings(candidates).slice(0, TOP_FINDINGS_MAX).map(function(f) {
    return { type: f.type, severity: f.severity, summary: f.summary };
  });
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _mergeRecommendations(boundaryRecs, completenessRecs, linkageRecs) {
  // Linkage first: it has the most specific/actionable wording for overlapping
  // categories (unresolved frontend API calls, orphaned backend routes, method
  // mismatches). Placing it first ensures its wording wins the semantic dedup.
  const prioritized = [].concat(
    Array.isArray(linkageRecs)      ? linkageRecs      : [],
    Array.isArray(completenessRecs) ? completenessRecs : [],
    Array.isArray(boundaryRecs)     ? boundaryRecs     : [],
  );
  return deduplicateRecommendations(prioritized, RECOMMENDATIONS_MAX);
}

// ── Summary ───────────────────────────────────────────────────────────────────

const SUMMARY_BY_LEVEL = {
  healthy: 'Architecture structure appears healthy based on static analysis — boundary health and implementation coverage look strong.',
  watch:   'Architecture structure is mostly coherent with watch items detected — review findings before scaling.',
  weak:    'Architecture structure shows weak integration or boundary health — prioritize addressing boundary violations and implementation gaps.',
  risky:   'Architecture structure shows significant implementation or boundary risk — structural refactoring is recommended.',
  unknown: 'Architecture structure unavailable — no files or structural data provided for static analysis.',
};

function _summary(level) {
  return SUMMARY_BY_LEVEL[level] || SUMMARY_BY_LEVEL.unknown;
}

// ── Metrics ───────────────────────────────────────────────────────────────────

function _metrics(inventory, dependencyGraph, apiLinkage, boundaryVerification, implCompleteness) {
  const cm       = (dependencyGraph && dependencyGraph.couplingMetrics) || {};
  const cov      = (apiLinkage && apiLinkage.coverage)                  || {};
  const viols    = (boundaryVerification && boundaryVerification.violations) || [];
  const signals  = (implCompleteness && implCompleteness.signals)       || [];

  return {
    totalFiles:                  (inventory && inventory.totalFiles)           || 0,
    totalEdges:                  cm.totalEdges                                 || 0,
    backendRouteCount:           cov.backendRouteCount                         || 0,
    frontendApiCallCount:        cov.frontendCallCount                         || 0,
    linkedEndpointCount:         cov.linkedFrontendCallCount                   || 0,
    unresolvedFrontendCallCount: cov.unresolvedFrontendCallCount               || 0,
    orphanedBackendRouteCount:   cov.orphanedBackendRouteCount                 || 0,
    navigationOrphanCount:       cov.navigationOrphanCount                    || 0,
    unlinkedApiCount:            cov.unlinkedApiCount                         || 0,
    disconnectedApiCount:        cov.disconnectedApiCount                     || 0,
    circularDependencyCount:     cm.circularDependencyCount                    || 0,
    boundaryViolationCount:      viols.length,
    implementationSignalCount:   signals.length,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a complete architecture intelligence snapshot from repository file contents.
 * Pure function — no I/O, no mutation of input.
 * Composes the six Phase 1 modules in pipeline order.
 *
 * @param {{ repoId, repoName, defaultBranch, snapshotAt, files: Array,
 *           previousLinkedEndpoints?: Array<{method, path}> }} [params]
 */
function buildRepositoryArchitectureSnapshot(params) {
  const repoId        = (params && params.repoId)        || null;
  const repoName      = (params && params.repoName)      || null;
  const defaultBranch = (params && params.defaultBranch) || null;
  const snapshotAt    = (params && params.snapshotAt)    || null;
  const files         = (params && Array.isArray(params.files)) ? params.files : [];
  const previousLinkedEndpoints = (params && Array.isArray(params.previousLinkedEndpoints))
    ? params.previousLinkedEndpoints : [];
  const historicalLinkedEndpoints = (params && Array.isArray(params.historicalLinkedEndpoints))
    ? params.historicalLinkedEndpoints : null;

  // ── Stage 1 ─────────────────────────────────────────────────────────────────
  const inventory = buildRepositoryStructureInventory({ files });

  // ── Stage 2 ─────────────────────────────────────────────────────────────────
  const dependencyGraph = buildImportDependencyGraph({ files });

  // ── Stage 3 ─────────────────────────────────────────────────────────────────
  const routeApiStructure = extractRouteApiStructure({ files });

  // ── Stage 4 ─────────────────────────────────────────────────────────────────
  const apiLinkage = linkFrontendBackendApis({
    backendRoutes:             routeApiStructure.backendRoutes,
    frontendApiCalls:          routeApiStructure.frontendApiCalls,
    endpointInventory:         routeApiStructure.endpointInventory,
    previousLinkedEndpoints,
    historicalLinkedEndpoints: historicalLinkedEndpoints !== null ? historicalLinkedEndpoints : undefined,
  });

  // ── Stage 5 ─────────────────────────────────────────────────────────────────
  const boundaryVerification = verifyArchitectureBoundaries({
    inventory,
    dependencyGraph,
    routeApiStructure,
    apiLinkage,
  });

  // ── Stage 6 ─────────────────────────────────────────────────────────────────
  const implementationCompleteness = assessImplementationCompleteness({
    files,
    inventory,
    dependencyGraph,
    routeApiStructure,
    apiLinkage,
    boundaryVerification,
  });

  // ── Aggregate ────────────────────────────────────────────────────────────────
  const anyStructure = _hasAnyStructure(inventory);

  const architectureHealthScore = anyStructure
    ? _calcHealthScore(
        boundaryVerification.boundaryHealthScore,
        implementationCompleteness.completenessScore,
        apiLinkage.linkageScore,
      )
    : 0;

  const architectureHealthLevel = _healthLevel(architectureHealthScore, anyStructure);

  const confidenceLevel = _confidenceLevel(
    inventory.totalFiles || 0,
    inventory,
    routeApiStructure,
  );

  const topFindings = _topFindings(
    boundaryVerification,
    apiLinkage,
    implementationCompleteness,
    dependencyGraph,
  );

  const recommendations = _mergeRecommendations(
    boundaryVerification.recommendations,
    implementationCompleteness.recommendations,
    apiLinkage.recommendations,
  );

  const metrics = _metrics(
    inventory,
    dependencyGraph,
    apiLinkage,
    boundaryVerification,
    implementationCompleteness,
  );

  const summary = _summary(architectureHealthLevel);

  return {
    repoId,
    repoName,
    defaultBranch,
    snapshotAt,
    analyzerVersion: ANALYZER_VERSION,
    scoringVersion:  SCORING_VERSION,
    architectureHealthScore,
    architectureHealthLevel,
    confidenceLevel,
    summary,
    inventory,
    dependencyGraph,
    routeApiStructure,
    analyzerCoverage: routeApiStructure.analyzerCoverage,
    apiLinkage,
    boundaryVerification,
    implementationCompleteness,
    topFindings,
    recommendations,
    metrics,
  };
}

module.exports = { buildRepositoryArchitectureSnapshot };
