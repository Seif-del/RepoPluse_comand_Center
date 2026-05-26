'use strict';

// Architecture Boundary Verifier
// Answers: "Are the structural layers of this repository respecting their boundaries?"
//
// Input:  { inventory, dependencyGraph, routeApiStructure, apiLinkage }
// Output: boundaryHealthScore, boundaryHealthLevel, violations, warnings,
//         circularDependencyAssessment, layeringAssessment, couplingAssessment,
//         routeModelCoupling, recommendations, summary
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const RECOMMENDATIONS_MAX = 5;

// Boundary hints that are strong structural violations (not warnings)
const STRONG_VIOLATION_TYPES = new Set([
  'frontend_imports_backend',
  'backend_imports_frontend',
  'model_imports_route',
  'service_imports_route',
  'route_imports_component',
]);

// Boundary hints that are warnings (informational)
const WARNING_HINT_TYPES = new Set([
  'config_imported_by_runtime',
]);

// Penalty values
const PENALTY = {
  strongViolation:       20,
  highCircular:          18,
  mediumCircular:        10,
  routeModelCoupling:    12,
  routeModelCouplingCap: 30,
  unresolvedCall:         8,
  unresolvedCallCap:     24,
  methodMismatch:        10,
  methodMismatchCap:     30,
  orphanedRoute:          3,
  orphanedRouteCap:      15,
  fanWarning:             5,
  fanWarningCap:         20,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function _safeArray(v) {
  return Array.isArray(v) ? v : [];
}

function _cap(value, cap) {
  return Math.min(value, cap);
}

// Check if a file path belongs to route/service/model layer
function _isCriticalLayer(filePath) {
  return /^routes\//.test(filePath) || /\/routes\//.test(filePath) ||
         /^router\//.test(filePath) || /\/router\//.test(filePath) ||
         /^services\//.test(filePath) || /\/services\//.test(filePath) ||
         /^models\//.test(filePath) || /\/models\//.test(filePath) ||
         /^schemas\//.test(filePath) || /^entities\//.test(filePath);
}

function _isRouteFile(p) {
  return /^routes\//.test(p) || /\/routes\//.test(p) || /^router\//.test(p) || /\/router\//.test(p);
}

function _isServiceFile(p) {
  return /^services\//.test(p) || /\/services\//.test(p);
}

function _isModelFile(p) {
  return /^models\//.test(p) || /\/models\//.test(p) || /^schemas\//.test(p) || /^entities\//.test(p);
}

// ── Circular dependency assessment ───────────────────────────────────────────

function _assessCircularDeps(cycles) {
  const arr = _safeArray(cycles);
  if (arr.length === 0) return { count: 0, severity: 'none', cycles: [] };

  let severity = 'medium';

  for (const c of arr) {
    const cycleFiles = _safeArray(c.cycle);
    // Length >= 3 (number of distinct files in cycle) → high
    if ((c.length || 0) >= 3) { severity = 'high'; break; }
    // Any critical layer file in cycle → high
    if (cycleFiles.some(f => _isCriticalLayer(f))) { severity = 'high'; break; }
  }

  return { count: arr.length, severity, cycles: arr.slice() };
}

// ── Route/model coupling detection ───────────────────────────────────────────

function _assessRouteModelCoupling(edges, inventory) {
  const routeFiles = new Set(_safeArray(inventory && inventory.categories && inventory.categories.routes));
  const modelFiles = new Set(_safeArray(inventory && inventory.categories && inventory.categories.models));

  if (routeFiles.size === 0 || modelFiles.size === 0) {
    // Fallback: use path patterns when inventory categories are empty
    const found = [];
    for (const e of _safeArray(edges)) {
      if (_isRouteFile(e.from) && _isModelFile(e.to)) {
        found.push({ from: e.from, to: e.to });
      }
    }
    return { count: found.length, files: found.map(f => f.from).filter((v, i, a) => a.indexOf(v) === i).sort() };
  }

  const involved = new Set();
  for (const e of _safeArray(edges)) {
    if ((routeFiles.has(e.from) || _isRouteFile(e.from)) &&
        (modelFiles.has(e.to)   || _isModelFile(e.to))) {
      involved.add(e.from);
    }
  }
  const files = Array.from(involved).sort();
  return { count: files.length, files };
}

// ── Layering assessment ───────────────────────────────────────────────────────

function _assessLayering(inventory, dependencyGraph) {
  const hints       = _safeArray(dependencyGraph && dependencyGraph.boundaryHints);
  const edges       = _safeArray(dependencyGraph && dependencyGraph.edges);
  const archHints   = (inventory && inventory.architectureHints) || {};

  const hasRouteLayer   = !!archHints.hasApiLayer;
  const hasServiceLayer = !!archHints.hasServiceLayer;
  const hasModelLayer   = !!archHints.hasModelLayer;

  const riskyPatterns = [];

  // From dependency graph boundary hints
  if (hints.some(h => h.type === 'service_imports_route'))  riskyPatterns.push('service_imports_route');
  if (hints.some(h => h.type === 'model_imports_route'))    riskyPatterns.push('model_imports_route');
  if (hints.some(h => h.type === 'route_imports_component')) riskyPatterns.push('route_imports_component');

  // From edges: route → model directly (bypassing service)
  for (const e of edges) {
    if ((_isRouteFile(e.from)) && (_isModelFile(e.to))) {
      if (!riskyPatterns.includes('route_imports_model_directly')) {
        riskyPatterns.push('route_imports_model_directly');
      }
    }
    if ((_isServiceFile(e.from)) && (_isRouteFile(e.to))) {
      if (!riskyPatterns.includes('service_imports_route')) {
        riskyPatterns.push('service_imports_route');
      }
    }
    if ((_isModelFile(e.from)) && (_isRouteFile(e.to))) {
      if (!riskyPatterns.includes('model_imports_route')) {
        riskyPatterns.push('model_imports_route');
      }
    }
  }

  return {
    hasRouteLayer,
    hasServiceLayer,
    hasModelLayer,
    riskyPatterns: riskyPatterns.slice().sort(),
  };
}

// ── Coupling assessment ───────────────────────────────────────────────────────

function _assessCoupling(dependencyGraph) {
  const metrics      = (dependencyGraph && dependencyGraph.couplingMetrics) || {};
  const highFanOut   = _safeArray(metrics.highFanOutFiles);
  const highFanIn    = _safeArray(metrics.highFanInFiles);
  const avgOutDegree = metrics.averageOutDegree || 0;

  let level = 'healthy';
  if (highFanOut.length > 2 || highFanIn.length > 2 || avgOutDegree > 5) level = 'weak';
  else if (highFanOut.length > 0 || highFanIn.length > 0 || avgOutDegree > 2) level = 'watch';

  return {
    level,
    highFanOutFiles:  highFanOut.slice().sort(),
    highFanInFiles:   highFanIn.slice().sort(),
    averageOutDegree: avgOutDegree,
  };
}

// ── Violations and warnings builder ──────────────────────────────────────────

function _buildViolationsAndWarnings(dependencyGraph, inventory, apiLinkage) {
  const hints     = _safeArray(dependencyGraph && dependencyGraph.boundaryHints);
  const archHints = (inventory && inventory.architectureHints) || {};
  const metrics   = (dependencyGraph && dependencyGraph.couplingMetrics) || {};

  const violations = [];
  const warnings   = [];

  // From dependency graph boundary hints
  for (const hint of hints) {
    if (STRONG_VIOLATION_TYPES.has(hint.type)) {
      violations.push({ type: hint.type, severity: hint.severity || 'high', summary: hint.summary || hint.type, files: _safeArray(hint.files).slice() });
    } else if (WARNING_HINT_TYPES.has(hint.type)) {
      warnings.push({ type: hint.type, severity: hint.severity || 'low', summary: hint.summary || hint.type });
    }
  }

  // Inventory-derived warnings
  const hasRouteLayer   = !!archHints.hasApiLayer;
  const hasServiceLayer = !!archHints.hasServiceLayer;
  const hasTests        = !!archHints.hasTests;

  if (hasRouteLayer && !hasServiceLayer) {
    warnings.push({ type: 'routes_without_services', severity: 'medium', summary: 'Route layer present but no service layer detected — business logic may be leaking into routes.' });
  }
  if (hasServiceLayer && !hasTests) {
    warnings.push({ type: 'services_without_tests', severity: 'medium', summary: 'Service layer present but no test files detected — service logic is untested.' });
  }

  // Fan-out/fan-in warnings
  const fanOutFiles = _safeArray(metrics.highFanOutFiles);
  const fanInFiles  = _safeArray(metrics.highFanInFiles);
  if (fanOutFiles.length > 0) {
    warnings.push({ type: 'high_fan_out', severity: 'low', summary: fanOutFiles.length + ' file' + (fanOutFiles.length === 1 ? '' : 's') + ' with high outbound import count: ' + fanOutFiles.slice(0, 3).join(', ') + '.' });
  }
  if (fanInFiles.length > 0) {
    warnings.push({ type: 'high_fan_in', severity: 'low', summary: fanInFiles.length + ' file' + (fanInFiles.length === 1 ? '' : 's') + ' with high inbound import count (hotspot): ' + fanInFiles.slice(0, 3).join(', ') + '.' });
  }

  // API linkage-derived warnings
  const orphaned   = _safeArray(apiLinkage && apiLinkage.orphanedBackendRoutes);
  const unresolved = _safeArray(apiLinkage && apiLinkage.unresolvedFrontendCalls);
  const mismatches = _safeArray(apiLinkage && apiLinkage.methodMismatches);

  if (orphaned.length > 0) {
    warnings.push({ type: 'orphaned_backend_routes', severity: 'low', summary: orphaned.length + ' backend route' + (orphaned.length === 1 ? '' : 's') + ' with no matching frontend call — may be internal APIs, webhooks, or unused endpoints.' });
  }
  if (unresolved.length > 0) {
    warnings.push({ type: 'unresolved_frontend_calls', severity: 'medium', summary: unresolved.length + ' frontend API call' + (unresolved.length === 1 ? '' : 's') + ' with no matching backend route.' });
  }
  if (mismatches.length > 0) {
    warnings.push({ type: 'method_mismatches', severity: 'medium', summary: mismatches.length + ' HTTP method mismatch' + (mismatches.length === 1 ? '' : 'es') + ' between frontend calls and backend routes.' });
  }

  // Sort deterministically
  violations.sort((a, b) => a.type < b.type ? -1 : a.type > b.type ? 1 : 0);
  warnings.sort((a, b)   => a.type < b.type ? -1 : a.type > b.type ? 1 : 0);

  return { violations, warnings };
}

// ── Score computation ─────────────────────────────────────────────────────────

function _computeScore(violations, circularAssessment, routeModelCoupling, apiLinkage, fanOutFiles, fanInFiles) {
  let deductions = 0;

  // Strong violations: -20 each
  deductions += violations.length * PENALTY.strongViolation;

  // Circular dependencies
  if (circularAssessment.severity === 'high')   deductions += PENALTY.highCircular;
  if (circularAssessment.severity === 'medium') deductions += PENALTY.mediumCircular;

  // Route/model coupling: -12 each, capped at -30
  deductions += _cap(routeModelCoupling.count * PENALTY.routeModelCoupling, PENALTY.routeModelCouplingCap);

  // Unresolved frontend calls: -8 each, capped at -24
  const unresolved = _safeArray(apiLinkage && apiLinkage.unresolvedFrontendCalls);
  deductions += _cap(unresolved.length * PENALTY.unresolvedCall, PENALTY.unresolvedCallCap);

  // Method mismatches: -10 each, capped at -30
  const mismatches = _safeArray(apiLinkage && apiLinkage.methodMismatches);
  deductions += _cap(mismatches.length * PENALTY.methodMismatch, PENALTY.methodMismatchCap);

  // Orphaned backend routes: -3 each, capped at -15
  const orphaned = _safeArray(apiLinkage && apiLinkage.orphanedBackendRoutes);
  deductions += _cap(orphaned.length * PENALTY.orphanedRoute, PENALTY.orphanedRouteCap);

  // High fan-out/fan-in: -5 each, capped at -20 combined
  const fanCount = fanOutFiles.length + fanInFiles.length;
  deductions += _cap(fanCount * PENALTY.fanWarning, PENALTY.fanWarningCap);

  return Math.max(0, Math.min(100, 100 - deductions));
}

// ── Level ─────────────────────────────────────────────────────────────────────

function _level(score, hasStructure) {
  if (!hasStructure) return 'unknown';
  if (score >= 85) return 'healthy';
  if (score >= 70) return 'watch';
  if (score >= 45) return 'weak';
  return 'risky';
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _buildRecommendations(violations, circularAssessment, apiLinkage, routeModelCoupling, couplingAssessment, orphaned) {
  const recs = [];

  // 1. Strong violations
  if (violations.length > 0) {
    const types = violations.map(v => v.type).join(', ');
    recs.push(violations.length + ' architectural boundary violation' + (violations.length === 1 ? '' : 's') + ' detected (' + types + ') — fix import direction to respect layer boundaries.');
  }

  // 2. Circular dependencies
  if (circularAssessment.severity === 'high') {
    recs.push('High-severity circular dependencies detected — break cycles in route/service/model layers to prevent hidden coupling.');
  } else if (circularAssessment.severity === 'medium') {
    recs.push('Circular dependencies detected — consider extracting shared utilities to break import cycles.');
  }

  // 3. Unresolved API calls
  const unresolved = _safeArray(apiLinkage && apiLinkage.unresolvedFrontendCalls);
  if (unresolved.length > 0) {
    recs.push(unresolved.length + ' frontend API call' + (unresolved.length === 1 ? '' : 's') + ' have no matching backend route — verify routes are defined or remove dead calls.');
  }

  // 4. Method mismatches
  const mismatches = _safeArray(apiLinkage && apiLinkage.methodMismatches);
  if (mismatches.length > 0) {
    recs.push(mismatches.length + ' HTTP method mismatch' + (mismatches.length === 1 ? '' : 'es') + ' — align frontend call methods with backend route definitions.');
  }

  // 5. Route/model coupling
  if (routeModelCoupling.count > 0) {
    recs.push('Routes import models directly (' + routeModelCoupling.count + ' instance' + (routeModelCoupling.count === 1 ? '' : 's') + ') — introduce a service layer between routes and models.');
  }

  // 6. Fan-out/fan-in
  if (couplingAssessment.level !== 'healthy' && couplingAssessment.highFanOutFiles.length > 0) {
    recs.push('High fan-out modules detected — consider splitting ' + couplingAssessment.highFanOutFiles[0] + ' to reduce coupling.');
  }

  // 7. Orphaned routes
  if (orphaned.length > 0 && recs.length < RECOMMENDATIONS_MAX) {
    recs.push(orphaned.length + ' backend route candidate' + (orphaned.length === 1 ? '' : 's') + ' have no frontend match — audit for unused or internal-only endpoints.');
  }

  return recs.slice(0, RECOMMENDATIONS_MAX);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _buildSummary(score, level, violations, warnings, circularAssessment) {
  if (level === 'unknown') {
    return 'No structural input detected — architecture boundary verification cannot be performed.';
  }
  const parts = ['Boundary health: ' + level + ' (score ' + score + '/100).'];
  if (violations.length > 0) parts.push(violations.length + ' violation' + (violations.length === 1 ? '' : 's') + '.');
  if (warnings.length > 0)   parts.push(warnings.length + ' warning' + (warnings.length === 1 ? '' : 's') + '.');
  if (circularAssessment.count > 0) parts.push(circularAssessment.count + ' circular dependenc' + (circularAssessment.count === 1 ? 'y' : 'ies') + ' (' + circularAssessment.severity + ').');
  return parts.join(' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Verify architectural boundaries using structural graph outputs.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ inventory, dependencyGraph, routeApiStructure, apiLinkage }} [params]
 */
function verifyArchitectureBoundaries(params) {
  const inventory         = (params && params.inventory)         || {};
  const dependencyGraph   = (params && params.dependencyGraph)   || {};
  const apiLinkage        = (params && params.apiLinkage)        || {};

  const archHints = (inventory && inventory.architectureHints) || {};
  const metrics   = (dependencyGraph && dependencyGraph.couplingMetrics) || {};

  // Detect whether any structural data exists at all
  const hasStructure =
    _safeArray(dependencyGraph.nodes).length > 0 ||
    _safeArray(dependencyGraph.edges).length > 0 ||
    _safeArray(dependencyGraph.boundaryHints).length > 0 ||
    _safeArray(dependencyGraph.circularDependencies).length > 0 ||
    !!archHints.hasApiLayer || !!archHints.hasServiceLayer || !!archHints.hasModelLayer ||
    !!archHints.hasFrontend || !!archHints.hasBackend ||
    _safeArray(metrics.highFanOutFiles).length > 0 ||
    _safeArray(metrics.highFanInFiles).length > 0 ||
    _safeArray(apiLinkage.unresolvedFrontendCalls).length > 0 ||
    _safeArray(apiLinkage.orphanedBackendRoutes).length > 0 ||
    _safeArray(apiLinkage.methodMismatches).length > 0;

  const circularDependencyAssessment = _assessCircularDeps(_safeArray(dependencyGraph.circularDependencies));
  const routeModelCoupling           = _assessRouteModelCoupling(_safeArray(dependencyGraph.edges), inventory);
  const layeringAssessment           = _assessLayering(inventory, dependencyGraph);
  const couplingAssessment           = _assessCoupling(dependencyGraph);

  const { violations, warnings } = _buildViolationsAndWarnings(dependencyGraph, inventory, apiLinkage);

  const fanOutFiles = _safeArray(metrics.highFanOutFiles);
  const fanInFiles  = _safeArray(metrics.highFanInFiles);

  const boundaryHealthScore = hasStructure
    ? _computeScore(violations, circularDependencyAssessment, routeModelCoupling, apiLinkage, fanOutFiles, fanInFiles)
    : 0;

  const boundaryHealthLevel = _level(boundaryHealthScore, hasStructure);

  const orphaned = _safeArray(apiLinkage.orphanedBackendRoutes);

  const recommendations = hasStructure
    ? _buildRecommendations(violations, circularDependencyAssessment, apiLinkage, routeModelCoupling, couplingAssessment, orphaned)
    : [];

  const summary = _buildSummary(boundaryHealthScore, boundaryHealthLevel, violations, warnings, circularDependencyAssessment);

  return {
    boundaryHealthScore,
    boundaryHealthLevel,
    violations,
    warnings,
    circularDependencyAssessment,
    layeringAssessment,
    couplingAssessment,
    routeModelCoupling,
    recommendations,
    summary,
  };
}

module.exports = { verifyArchitectureBoundaries };
