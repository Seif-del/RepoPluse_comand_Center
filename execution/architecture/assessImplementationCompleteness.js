'use strict';

// Implementation Completeness Heuristics
// Answers: "Does this codebase look fully implemented, or are there scaffold/placeholder signals?"
//
// Input:  { files, inventory, dependencyGraph, routeApiStructure, apiLinkage, boundaryVerification }
// Output: completenessScore, completenessLevel, signals, evidence, weakImplementationHints,
//         routeServiceCoverage, frontendBackendCoverage, placeholderAssessment, scaffoldAssessment,
//         recommendations, summary
//
// Pure function — no I/O, no mutation of input.

const RECOMMENDATIONS_MAX = 5;

// ── Comment stripping ─────────────────────────────────────────────────────────

function _stripComments(code) {
  if (!code) return '';
  let s = code.replace(/\/\*[\s\S]*?\*\//g, function(m) {
    return m.replace(/[^\n]/g, ' ');
  });
  s = s.replace(/\/\/[^\n]*/g, function(m) {
    return ' '.repeat(m.length);
  });
  return s;
}

// ── Test-file exclusion ───────────────────────────────────────────────────────
// Test files are intentionally visible to repository inventory (they populate
// architectureHints.hasTests) but their content is test evidence, not
// production implementation quality — a verbatim-copy test fixture legitimately
// contains "return null;" guard clauses and words like "placeholder"/"dummy"
// copied from the function under test, or from UI/domain vocabulary in test
// descriptions. Same pattern shape as extractRouteApiStructure.js's
// _isTestFile, no shared module: segment-boundary-anchored so a path merely
// containing the substring "test" (backend/contest/, frontend/latest/,
// services/testimonials/) is never misclassified.

const TEST_FILE_PATTERNS = [
  /^(?:tests?|__tests__)\//i,   // starts with tests/, test/, or __tests__/
  /\/(?:tests?|__tests__)\//i,  // tests/, test/, or __tests__/ nested anywhere
  /\.(?:test|spec)\.[jt]sx?$/i, // *.test.js/jsx/ts/tsx  *.spec.js/jsx/ts/tsx
];

function _isTestFile(path) {
  const p = path || '';
  return TEST_FILE_PATTERNS.some(function(re) { return re.test(p); });
}

// ── Rich code detection (suppresses placeholder signals) ──────────────────────

function _isRichCode(nonCommentCode) {
  if (/\brequire\s*\(/.test(nonCommentCode))                         return true;
  if (/\bimport\b/.test(nonCommentCode))                             return true;
  if (/\b(await|async)\b/.test(nonCommentCode))                      return true;
  if (/\b[A-Z][A-Za-z]*Service\s*\.\s*[a-z]/.test(nonCommentCode))  return true;
  if (/\b[A-Z][A-Za-z]*Controller\s*\.\s*[a-z]/.test(nonCommentCode)) return true;
  if (/\b[A-Z][A-Za-z]*Repository\s*\.\s*[a-z]/.test(nonCommentCode)) return true;
  if (/\bdb\s*\./.test(nonCommentCode))                              return true;
  // Pure computation modules: named function definition + module.exports both required.
  // This suppresses false positives from guard clauses (return null/[]) and domain-vocabulary
  // strings in fully implemented modules. Empty stubs (module.exports = {}) and arrow-function
  // stubs (module.exports = { fn: () => throw ... }) are intentionally NOT suppressed here.
  if (/\bfunction\s+[A-Za-z_$]\w*\s*\(/.test(nonCommentCode) &&
      /\bmodule\.exports\b/.test(nonCommentCode))                    return true;
  return false;
}

// ── Placeholder patterns ──────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/,
  /\bFIXME\b/,
  /\bplaceholder\b/i,
  /\bmock\s+data\b/i,
  /\bdummy\b/i,
  /\bnot\s+implemented\b/i,
  /\bcoming\s+soon\b/i,
  /throw\s+new\s+Error\s*\(\s*['"`]Not\s+implemented['"`]\s*\)/i,
  /\breturn\s+null\b/,
  /\breturn\s+\[\s*\]/,
  /\breturn\s+\{\s*\}/,
  /\.json\s*\(\s*\[\s*\]\s*\)/,
];

// Scan the entire file (including comments) for placeholder patterns,
// but suppress if the non-comment code contains rich implementation indicators.
function _hasPlaceholderHint(code) {
  if (!code) return false;
  const hasPlaceholderText = PLACEHOLDER_PATTERNS.some(function(re) { return re.test(code); });
  if (!hasPlaceholderText) return false;
  const nonCommentCode = _stripComments(code);
  return !_isRichCode(nonCommentCode);
}

// ── Scaffold detection ────────────────────────────────────────────────────────

function _isStaticJsxOnly(code) {
  if (!/<[A-Za-z]/.test(code))                                        return false;
  if (/\b(useState|useEffect|useCallback|useMemo|useRef)\b/.test(code)) return false;
  if (/\bfetch\s*\(/.test(code))                                      return false;
  if (/\baxios\b/.test(code))                                         return false;
  if (/\bprops\b/.test(code))                                         return false;
  if (/\bawait\b/.test(code))                                         return false;
  return true;
}

function _isStaticJsonRoute(code) {
  if (!/(res|reply)\s*\.\s*json\s*\(/.test(code)) return false;
  if (/\b(await|async)\b/.test(code))             return false;
  if (/\bdb\s*\./.test(code))                     return false;
  if (/\b(query|find|save|update)\b/.test(code))  return false;
  if (/\brequire\s*\(/.test(code))                return false;
  if (/\bimport\b/.test(code))                    return false;
  return true;
}

function _isConsoleLogOnlyHandler(code) {
  if (!/console\s*\.\s*log\s*\(/.test(code)) return false;
  if (/\b(await|async)\b/.test(code))         return false;
  if (/\brequire\s*\(/.test(code))            return false;
  if (/\bimport\b/.test(code))               return false;
  if (/\bdb\s*\./.test(code))               return false;
  if (/\b(query|find|save|update)\b/.test(code)) return false;
  return true;
}

function _isScaffoldLike(file, edges, routeFiles, componentFiles, frontendFiles) {
  const filePath = file.path;
  const content  = file.content || '';

  const hasServiceEdge = edges.some(function(e) {
    return e.from === filePath && /(services?|execution)\//i.test(e.to);
  });
  if (hasServiceEdge) return false;

  const stripped      = _stripComments(content);
  const isRouteFile   = routeFiles.includes(filePath);
  const isComponentFile = componentFiles.includes(filePath) ||
                          frontendFiles.includes(filePath)  ||
                          /\.(jsx|tsx)$/.test(filePath);

  if (isComponentFile && _isStaticJsxOnly(stripped))          return true;
  if (isRouteFile && _isStaticJsonRoute(stripped))             return true;
  if (isRouteFile && _isConsoleLogOnlyHandler(stripped))       return true;
  return false;
}

// ── Composition-only router detection (route_without_service_path only) ──────
// A composition router (e.g. repoRoutes.js/portfolioRoutes.js after the
// Coupling Refinement route splits) owns no HTTP handler and delegates
// everything to child routers it mounts via `.use(...)`. It has no business-
// logic boundary to delegate to a service, so requiring a direct services/
// or execution/ import from it is a false positive. This predicate is
// content-based only (no reliance on routeApiStructure/backendRoutes), scoped
// to this one heuristic, and generic across identifiers — it does not
// hard-code `router`/`app` as the only recognized mount/handler object names.

const MOUNT_CALL_RE       = /\b[A-Za-z_$][\w$]*\s*\.\s*use\s*\(/;
const HANDLER_ROUTE_RE    = /\b[A-Za-z_$][\w$]*\s*\.\s*(?:get|post|put|patch|delete)\s*\(/;

function _isCompositionOnlyRouter(content) {
  if (!content) return false;
  const stripped = _stripComments(content);
  if (!MOUNT_CALL_RE.test(stripped)) return false;
  if (HANDLER_ROUTE_RE.test(stripped)) return false;
  return true;
}

// ── Structure presence ────────────────────────────────────────────────────────

function _hasStructure(cats, hints, nodes, backendRoutes) {
  return (cats.routes    && cats.routes.length    > 0) ||
         (cats.services  && cats.services.length  > 0) ||
         (cats.models    && cats.models.length    > 0) ||
         (cats.frontend  && cats.frontend.length  > 0) ||
         (cats.components && cats.components.length > 0) ||
         (cats.backend   && cats.backend.length   > 0) ||
         (nodes          && nodes.length          > 0) ||
         (backendRoutes  && backendRoutes.length   > 0) ||
         !!(hints && (hints.hasApiLayer || hints.hasServiceLayer || hints.hasModelLayer || hints.hasFrontend));
}

// ── Scoring ───────────────────────────────────────────────────────────────────

const PENALTY = {
  routeWithoutServicePath:      { perItem: 10, cap: 30 },
  unresolvedFrontendApi:        { perItem: 12, cap: 36 },
  frontendWithoutBackendLinkage:{ perItem:  8, cap: 24 },
  placeholderCodeHint:          { perItem:  6, cap: 30 },
  scaffoldLikeFile:             { perItem:  8, cap: 32 },
  routeWithoutTests:            { perItem:  5, cap: 20 },
  serviceWithoutTests:          { perItem:  5, cap: 20 },
  modelWithoutUsage:            { perItem:  6, cap: 24 },
  boundaryRisky:                15,
  boundaryWeak:                  8,
};

function _calcScore(counts, boundaryLevel) {
  const p = PENALTY;
  let penalty = 0;
  penalty += Math.min(p.routeWithoutServicePath.cap,       counts.routeWithoutServicePath       * p.routeWithoutServicePath.perItem);
  penalty += Math.min(p.unresolvedFrontendApi.cap,         counts.unresolvedFrontendApi         * p.unresolvedFrontendApi.perItem);
  penalty += Math.min(p.frontendWithoutBackendLinkage.cap, counts.frontendWithoutBackendLinkage * p.frontendWithoutBackendLinkage.perItem);
  penalty += Math.min(p.placeholderCodeHint.cap,           counts.placeholderCodeHint           * p.placeholderCodeHint.perItem);
  penalty += Math.min(p.scaffoldLikeFile.cap,              counts.scaffoldLikeFile              * p.scaffoldLikeFile.perItem);
  penalty += Math.min(p.routeWithoutTests.cap,             counts.routeWithoutTests             * p.routeWithoutTests.perItem);
  penalty += Math.min(p.serviceWithoutTests.cap,           counts.serviceWithoutTests           * p.serviceWithoutTests.perItem);
  penalty += Math.min(p.modelWithoutUsage.cap,             counts.modelWithoutUsage             * p.modelWithoutUsage.perItem);
  if (boundaryLevel === 'risky') penalty += p.boundaryRisky;
  else if (boundaryLevel === 'weak') penalty += p.boundaryWeak;
  return Math.max(0, Math.min(100, 100 - penalty));
}

function _level(score, anyStructure) {
  if (!anyStructure) return 'unknown';
  if (score >= 85)   return 'complete';
  if (score >= 60)   return 'partial';
  return 'weak';
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(signals, boundaryLevel) {
  const recs = [];

  const unresolved = signals.find(function(s) { return s.type === 'unresolved_frontend_api'; });
  if (unresolved) {
    recs.push('Verify that backend routes exist for all unresolved frontend API calls.');
  }

  const routeNoSvc = signals.find(function(s) { return s.type === 'route_without_service_path'; });
  if (routeNoSvc) {
    recs.push('Delegate business logic to service modules in route files that lack service layer imports.');
  }

  const placeholder = signals.find(function(s) { return s.type === 'placeholder_code_hint'; });
  const scaffold    = signals.find(function(s) { return s.type === 'scaffold_like_file'; });
  if (placeholder || scaffold) {
    recs.push('Replace scaffold and placeholder implementations with production-ready logic.');
  }

  const routeNoTests = signals.find(function(s) { return s.type === 'route_without_tests'; });
  const svcNoTests   = signals.find(function(s) { return s.type === 'service_without_tests'; });
  if (routeNoTests || svcNoTests) {
    recs.push('Add unit tests to routes and services to verify behavior before shipping.');
  }

  if (boundaryLevel === 'risky' || boundaryLevel === 'weak') {
    recs.push('Review and resolve architecture boundary violations to strengthen layering.');
  }

  return recs.slice(0, RECOMMENDATIONS_MAX);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(level, score, signals) {
  if (level === 'unknown') {
    return 'No structural data detected — implementation completeness cannot be assessed.';
  }
  const parts = ['Completeness: ' + level + ' (score ' + score + '/100).'];
  if (signals.length > 0) {
    parts.push(signals.length + ' signal' + (signals.length === 1 ? '' : 's') + ' detected.');
  }
  return parts.join(' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Assess implementation completeness from structural heuristics.
 * Pure function — no I/O, no mutation of input.
 */
function assessImplementationCompleteness(params) {
  const files               = (params && Array.isArray(params.files))           ? params.files               : [];
  const inventory           = (params && params.inventory)                       ? params.inventory           : {};
  const dependencyGraph     = (params && params.dependencyGraph)                 ? params.dependencyGraph     : {};
  const routeApiStructure   = (params && params.routeApiStructure)               ? params.routeApiStructure   : {};
  const apiLinkage          = (params && params.apiLinkage)                      ? params.apiLinkage          : {};
  const boundaryVerification= (params && params.boundaryVerification)            ? params.boundaryVerification: {};

  const cats   = inventory.categories       || {};
  const hints  = inventory.architectureHints || {};
  const edges  = (dependencyGraph.edges)    || [];
  const nodes  = (dependencyGraph.nodes)    || [];

  const routeFiles     = cats.routes     || [];
  const serviceFiles   = cats.services   || [];
  const modelFiles     = cats.models     || [];
  const frontendFiles  = cats.frontend   || [];
  const componentFiles = cats.components || [];

  const coverage               = apiLinkage.coverage                || {};
  const unresolvedFrontendCalls= apiLinkage.unresolvedFrontendCalls || [];
  const backendRoutes          = (routeApiStructure.backendRoutes)  || [];
  const boundaryLevel          = boundaryVerification.boundaryHealthLevel || 'healthy';

  const anyStructure = _hasStructure(cats, hints, nodes, backendRoutes);

  // ── Heuristic A: route_without_service_path ────────────────────────────────
  // Composition-only routers (own no HTTP handler, only mount child routers —
  // e.g. repoRoutes.js/portfolioRoutes.js) are excluded from both the signal
  // and the routeServiceCoverage denominator: they have no business-logic
  // boundary to delegate to a service, so "no direct service import" is
  // expected, not a completeness gap. A route file with no content available
  // (e.g. an inventory-only fixture) defaults to eligible, preserving prior
  // behavior exactly — _isCompositionOnlyRouter only excludes what it can
  // positively prove is composition-only from real source content.
  const fileContentByPath = new Map();
  files.forEach(function(f) { fileContentByPath.set(f.path, f.content); });

  const eligibleRouteFiles = routeFiles.filter(function(rf) {
    return !_isCompositionOnlyRouter(fileContentByPath.get(rf));
  });

  const routesWithoutServiceList = [];
  let routeFilesWithServiceImportCount = 0;

  if (hints.hasServiceLayer && eligibleRouteFiles.length > 0) {
    const serviceFileSet = new Set(serviceFiles);
    eligibleRouteFiles.forEach(function(rf) {
      const hasEdge = edges.some(function(e) {
        return e.from === rf && (serviceFileSet.has(e.to) || /(services?|execution)\//i.test(e.to));
      });
      if (hasEdge) {
        routeFilesWithServiceImportCount++;
      } else {
        routesWithoutServiceList.push(rf);
      }
    });
  } else if (eligibleRouteFiles.length > 0) {
    // Count service edges even if no signal (for coverage metric)
    eligibleRouteFiles.forEach(function(rf) {
      const hasEdge = edges.some(function(e) {
        return e.from === rf && /(services?|execution)\//i.test(e.to);
      });
      if (hasEdge) routeFilesWithServiceImportCount++;
    });
  }

  const routeServiceCoveragePercent = eligibleRouteFiles.length > 0
    ? Math.round((routeFilesWithServiceImportCount / eligibleRouteFiles.length) * 100)
    : 0;

  // ── Heuristic B: frontend_without_backend_linkage ─────────────────────────

  let frontendWithoutBackendCount = 0;
  const allFrontendFiles = frontendFiles.concat(componentFiles);
  if (hints.likelyFullStackApp && hints.hasFrontend &&
      allFrontendFiles.length > 0 &&
      (coverage.frontendCallCount === 0 || coverage.frontendCallCount === undefined || coverage.frontendCallCount === null)) {
    frontendWithoutBackendCount = 1;
  }

  // ── Heuristic C: placeholder_code_hint ───────────────────────────────────

  const placeholderFilesList = [];
  files.forEach(function(f) {
    if (/\.md$/i.test(f.path))   return;
    if (/\.html$/i.test(f.path)) return;
    if (_isTestFile(f.path))     return;
    if (_hasPlaceholderHint(f.content)) {
      placeholderFilesList.push(f.path);
    }
  });

  // ── Heuristic D: scaffold_like_file ──────────────────────────────────────

  const scaffoldFilesList = [];
  files.forEach(function(f) {
    if (_isTestFile(f.path)) return;
    if (_isScaffoldLike(f, edges, routeFiles, componentFiles, frontendFiles)) {
      scaffoldFilesList.push(f.path);
    }
  });

  // ── Heuristic E weak signals ──────────────────────────────────────────────

  // routes_without_tests
  const routesWithoutTestsCount = (!hints.hasTests && routeFiles.length > 0)
    ? routeFiles.length : 0;

  // services_without_tests
  const servicesWithoutTestsCount = (!hints.hasTests && serviceFiles.length > 0)
    ? serviceFiles.length : 0;

  // model_without_usage
  const unusedModelsList = [];
  const nodeMap = new Map();
  nodes.forEach(function(n) { nodeMap.set(n.path, n); });
  modelFiles.forEach(function(mf) {
    const node = nodeMap.get(mf);
    if (node && node.inboundCount === 0) {
      unusedModelsList.push(mf);
    }
  });

  // ── Assemble counts for scoring ───────────────────────────────────────────

  const counts = {
    routeWithoutServicePath:       routesWithoutServiceList.length,
    unresolvedFrontendApi:         unresolvedFrontendCalls.length,
    frontendWithoutBackendLinkage: frontendWithoutBackendCount,
    placeholderCodeHint:           placeholderFilesList.length,
    scaffoldLikeFile:              scaffoldFilesList.length,
    routeWithoutTests:             routesWithoutTestsCount,
    serviceWithoutTests:           servicesWithoutTestsCount,
    modelWithoutUsage:             unusedModelsList.length,
  };

  const completenessScore = anyStructure ? _calcScore(counts, boundaryLevel) : 0;
  const completenessLevel = _level(completenessScore, anyStructure);

  // ── Build signals ─────────────────────────────────────────────────────────

  const signals = [];

  if (counts.modelWithoutUsage > 0) {
    signals.push({
      type:     'model_without_usage',
      severity: 'medium',
      count:    counts.modelWithoutUsage,
      summary:  counts.modelWithoutUsage + ' model file' +
                (counts.modelWithoutUsage === 1 ? '' : 's') +
                ' have no inbound imports — may be unused.',
    });
  }

  if (counts.placeholderCodeHint > 0) {
    signals.push({
      type:     'placeholder_code_hint',
      severity: 'medium',
      count:    counts.placeholderCodeHint,
      summary:  counts.placeholderCodeHint + ' file' +
                (counts.placeholderCodeHint === 1 ? '' : 's') +
                ' contain placeholder or stub code hints.',
    });
  }

  if (counts.routeWithoutServicePath > 0) {
    signals.push({
      type:     'route_without_service_path',
      severity: 'medium',
      count:    counts.routeWithoutServicePath,
      summary:  counts.routeWithoutServicePath + ' route file' +
                (counts.routeWithoutServicePath === 1 ? '' : 's') +
                ' have no import path to a service module.',
    });
  }

  if (counts.routeWithoutTests > 0) {
    signals.push({
      type:     'route_without_tests',
      severity: 'low',
      count:    counts.routeWithoutTests,
      summary:  counts.routeWithoutTests + ' route file' +
                (counts.routeWithoutTests === 1 ? '' : 's') +
                ' have no associated test coverage.',
    });
  }

  if (counts.scaffoldLikeFile > 0) {
    signals.push({
      type:     'scaffold_like_file',
      severity: 'low',
      count:    counts.scaffoldLikeFile,
      summary:  counts.scaffoldLikeFile + ' file' +
                (counts.scaffoldLikeFile === 1 ? '' : 's') +
                ' appear scaffold-like (static JSX, empty JSON routes, or console.log-only handlers).',
    });
  }

  if (counts.serviceWithoutTests > 0) {
    signals.push({
      type:     'service_without_tests',
      severity: 'low',
      count:    counts.serviceWithoutTests,
      summary:  counts.serviceWithoutTests + ' service file' +
                (counts.serviceWithoutTests === 1 ? '' : 's') +
                ' have no associated test coverage.',
    });
  }

  if (counts.unresolvedFrontendApi > 0) {
    signals.push({
      type:     'unresolved_frontend_api',
      severity: 'high',
      count:    counts.unresolvedFrontendApi,
      summary:  counts.unresolvedFrontendApi + ' frontend API call' +
                (counts.unresolvedFrontendApi === 1 ? '' : 's') +
                ' have no matching backend route.',
    });
  }

  if (counts.frontendWithoutBackendLinkage > 0) {
    signals.push({
      type:     'frontend_without_backend_linkage',
      severity: 'medium',
      count:    counts.frontendWithoutBackendLinkage,
      summary:  'Frontend files present in a full-stack app with no detected API calls — frontend may not be connected to the backend.',
    });
  }

  // Signals already pushed in alphabetical type order; sort to guarantee determinism.
  signals.sort(function(a, b) { return a.type < b.type ? -1 : a.type > b.type ? 1 : 0; });

  // ── Build evidence ────────────────────────────────────────────────────────

  const evidence = [];

  unresolvedFrontendCalls.forEach(function(call) {
    evidence.push({
      type:    'unresolved_frontend_api',
      file:    call.from || '',
      details: call.method + ' ' + call.path + ' has no backend route match.',
    });
  });

  routesWithoutServiceList.forEach(function(rf) {
    evidence.push({
      type:    'route_without_service_path',
      file:    rf,
      details: 'Route file has no import to a service module.',
    });
  });

  placeholderFilesList.forEach(function(pf) {
    evidence.push({
      type:    'placeholder_code_hint',
      file:    pf,
      details: 'File contains placeholder or stub code patterns.',
    });
  });

  scaffoldFilesList.forEach(function(sf) {
    evidence.push({
      type:    'scaffold_like_file',
      file:    sf,
      details: 'File appears to be a scaffold (static return, no service imports).',
    });
  });

  unusedModelsList.forEach(function(mf) {
    evidence.push({
      type:    'model_without_usage',
      file:    mf,
      details: 'Model file has no inbound imports in the dependency graph.',
    });
  });

  evidence.sort(function(a, b) {
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return a.file < b.file ? -1 : a.file > b.file ? 1 : 0;
  });

  // ── Assemble output ───────────────────────────────────────────────────────

  const weakImplementationHints = signals.map(function(s) { return s.summary; });

  const routeServiceCoverage = {
    // Files eligible for route-to-service coverage — excludes composition-only
    // routers, which own no handler/service boundary (see Heuristic A above).
    routeFileCount:             eligibleRouteFiles.length,
    routeFilesWithServiceImport: routeFilesWithServiceImportCount,
    coveragePercent:            routeServiceCoveragePercent,
  };

  const frontendBackendCoverage = coverage;

  const placeholderAssessment = {
    placeholderCount: placeholderFilesList.length,
    files:            placeholderFilesList.slice(),
  };

  const scaffoldAssessment = {
    scaffoldLikeFileCount: scaffoldFilesList.length,
    files:                 scaffoldFilesList.slice(),
  };

  const recommendations = _recommendations(signals, boundaryLevel);
  const summary         = _summary(completenessLevel, completenessScore, signals);

  return {
    completenessScore,
    completenessLevel,
    signals,
    evidence,
    weakImplementationHints,
    routeServiceCoverage,
    frontendBackendCoverage,
    placeholderAssessment,
    scaffoldAssessment,
    recommendations,
    summary,
  };
}

module.exports = { assessImplementationCompleteness };
