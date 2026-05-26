'use strict';

// Frontend ↔ Backend API Linkage Engine
// Answers: "Which frontend API calls are connected to which backend routes?"
//
// Input:  { backendRoutes, frontendApiCalls, endpointInventory }
// Output: linkedEndpoints, unresolvedFrontendCalls, orphanedBackendRoutes,
//         methodMismatches, linkageScore, linkageLevel, coverage,
//         summary, recommendations
//
// Pure function — no I/O, no mutation of input.

// ── Constants ─────────────────────────────────────────────────────────────────

const RECOMMENDATIONS_MAX = 5;

// ── Path normalization ────────────────────────────────────────────────────────

function _normPath(p) {
  if (!p) return '/';
  // Collapse repeated slashes
  let s = p.replace(/\/\/+/g, '/');
  // Strip trailing slash (but keep bare /)
  s = s.replace(/\/+$/, '') || '/';
  return s;
}

// Replace all :paramName segments with the canonical placeholder :_param
// so /users/:id and /users/:userId compare equal.
function _paramMask(p) {
  return p.replace(/:([A-Za-z_$][\w$]*)/g, ':_p');
}

function _normAndMask(p) {
  return _paramMask(_normPath(p));
}

// ── Matching ──────────────────────────────────────────────────────────────────

// Returns: 'exact' | 'param_match' | 'method_unknown' | null (no path match at all)
function _matchType(frontendCall, backendRoute) {
  const fPath = _normPath(frontendCall.path);
  const bPath = _normPath(backendRoute.path);
  const fMasked = _paramMask(fPath);
  const bMasked = _paramMask(bPath);

  const pathMatch = fPath === bPath || fMasked === bMasked;
  if (!pathMatch) return null;

  const fMethod = frontendCall.method;
  const bMethod = backendRoute.method;

  if (fMethod === 'UNKNOWN') return 'method_unknown';
  if (fMethod === bMethod)   return fPath === bPath ? 'exact' : 'param_match';
  return null; // path matched but method didn't — caller detects mismatch
}

// Whether two paths match (ignoring param names)
function _pathMatches(pA, pB) {
  return _normAndMask(pA) === _normAndMask(pB);
}

// ── Core linkage engine ───────────────────────────────────────────────────────

function _buildLinkage(backendRoutes, frontendApiCalls) {
  // Keyed by normalizedMaskedPath+method for linked endpoints
  // Map<key → { method, path, frontendCalls[], backendRoutes[], linkageType, confidence }>
  const endpointMap = new Map();

  const linkedFrontendIdxs  = new Set();
  const linkedBackendIdxs   = new Set();
  const methodMismatchPaths = new Map(); // normalizedMaskedPath → Set of backend methods

  // Pre-compute masked keys for backend routes
  const bMaskedKeys = backendRoutes.map(rt => ({
    masked: _normAndMask(rt.path),
    norm:   _normPath(rt.path),
    method: rt.method,
    idx:    backendRoutes.indexOf(rt),
    rt,
  }));

  // For each frontend call, try to find a matching backend route
  frontendApiCalls.forEach(function(call, fIdx) {
    const fNorm   = _normPath(call.path);
    const fMasked = _paramMask(fNorm);

    // Attempt 1: exact method + masked path
    let bestBIdx = -1;
    let bestType = null;

    for (let i = 0; i < bMaskedKeys.length; i++) {
      const bk = bMaskedKeys[i];
      if (bk.masked !== fMasked) continue; // path doesn't match (masked)

      const type = _matchType(call, bk.rt);
      if (type !== null) {
        // Found a match — prefer exact > param_match > method_unknown
        if (bestType === null ||
            (type === 'exact') ||
            (type === 'param_match' && bestType === 'method_unknown')) {
          bestBIdx = i;
          bestType = type;
          if (type === 'exact') break; // exact is best possible
        }
      }
    }

    if (bestBIdx !== -1) {
      const bk  = bMaskedKeys[bestBIdx];
      const key = bestType + ':' + bk.masked + ':' + (call.method === 'UNKNOWN' ? bk.method : call.method);
      const canonPath = bk.norm; // use backend's normalized path as canonical

      linkedFrontendIdxs.add(fIdx);
      linkedBackendIdxs.add(bk.idx);

      if (!endpointMap.has(key)) {
        endpointMap.set(key, {
          method:         call.method === 'UNKNOWN' ? bk.method : call.method,
          path:           canonPath,
          frontendCalls:  [],
          backendRoutes:  [],
          confidence:     bestType === 'exact' ? 'high' : 'medium',
          linkageType:    bestType,
        });
      }
      const ep = endpointMap.get(key);
      ep.frontendCalls.push(call);
      // Collect all backend routes with same masked key and matching method
      for (const bkk of bMaskedKeys) {
        const bt = _matchType(call, bkk.rt);
        if (bt !== null && bkk.masked === fMasked) {
          if (!ep.backendRoutes.includes(bkk.rt)) {
            ep.backendRoutes.push(bkk.rt);
            linkedBackendIdxs.add(bkk.idx);
          }
        }
      }
    } else {
      // Check if any backend route has same masked path but wrong method (mismatch)
      const matchingPathBackends = bMaskedKeys.filter(bk => bk.masked === fMasked);
      if (matchingPathBackends.length > 0 && call.method !== 'UNKNOWN') {
        const p = fMasked;
        if (!methodMismatchPaths.has(p)) methodMismatchPaths.set(p, new Set());
        methodMismatchPaths.get(p).add(call.method);
        // also record available backend methods
        if (!methodMismatchPaths.has('__avail__' + p)) methodMismatchPaths.set('__avail__' + p, new Set());
        matchingPathBackends.forEach(bk => methodMismatchPaths.get('__avail__' + p).add(bk.method));
      }
    }
  });

  // Build sorted linkedEndpoints
  const linkedEndpoints = Array.from(endpointMap.values()).sort(function(a, b) {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.method < b.method ? -1 : 1;
  });

  // Unresolved frontend calls
  const unresolvedFrontendCalls = frontendApiCalls
    .filter(function(_, i) { return !linkedFrontendIdxs.has(i); })
    .map(function(c) { return { from: c.file || '', method: c.method, path: _normPath(c.path) }; })
    .sort(function(a, b) {
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return a.method < b.method ? -1 : 1;
    });

  // Orphaned backend routes
  const orphanedBackendRoutes = backendRoutes
    .filter(function(_, i) { return !linkedBackendIdxs.has(i); })
    .map(function(rt) { return { method: rt.method, path: _normPath(rt.path), file: rt.file || '', framework: rt.framework || '', candidate: true }; })
    .sort(function(a, b) {
      if (a.path !== b.path) return a.path < b.path ? -1 : 1;
      return a.method < b.method ? -1 : 1;
    });

  // Method mismatches
  const methodMismatches = [];
  methodMismatchPaths.forEach(function(frontendMethods, key) {
    if (key.startsWith('__avail__')) return;
    const availKey = '__avail__' + key;
    const available = methodMismatchPaths.has(availKey)
      ? Array.from(methodMismatchPaths.get(availKey)).sort()
      : [];
    // Find a representative path (use a backend route's path for the masked key)
    const rep = bMaskedKeys.find(bk => bk.masked === key);
    const path = rep ? rep.norm : key;
    frontendMethods.forEach(function(fm) {
      methodMismatches.push({
        path,
        frontendMethod:   fm,
        availableMethods: available,
      });
    });
  });
  methodMismatches.sort(function(a, b) {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return a.frontendMethod < b.frontendMethod ? -1 : 1;
  });

  return { linkedEndpoints, unresolvedFrontendCalls, orphanedBackendRoutes, methodMismatches, linkedFrontendIdxs, linkedBackendIdxs };
}

// ── Score and level ───────────────────────────────────────────────────────────

function _score(frontendCovPct, backendCovPct, mismatchCount, totalFrontend) {
  // mismatch penalty: each mismatch costs proportional weight capped at 10 points
  const mismatchPenalty = totalFrontend > 0
    ? Math.min(10, (mismatchCount / totalFrontend) * 10)
    : 0;
  const raw = frontendCovPct * 0.6 + backendCovPct * 0.3 - mismatchPenalty;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function _level(score, hasAny) {
  if (!hasAny) return 'unknown';
  if (score >= 85) return 'integrated';
  if (score >= 60) return 'partial';
  if (score >= 1)  return 'weak';
  return 'weak'; // score 0 but has routes/calls
}

// ── Recommendations ───────────────────────────────────────────────────────────

function _recommendations(unresolved, orphaned, mismatches, linkageLevel) {
  const recs = [];

  if (mismatches.length > 0) {
    recs.push(
      mismatches.length + ' method mismatch' + (mismatches.length === 1 ? '' : 'es') +
      ' detected — verify HTTP methods align between frontend calls and backend route definitions.'
    );
  }

  if (unresolved.length > 0) {
    recs.push(
      unresolved.length + ' frontend API call' + (unresolved.length === 1 ? '' : 's') +
      ' have no matching backend route — confirm the route is defined or remove the dead call.'
    );
  }

  if (orphaned.length > 0) {
    recs.push(
      orphaned.length + ' backend route' + (orphaned.length === 1 ? '' : 's') +
      ' have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.'
    );
  }

  if (linkageLevel === 'weak') {
    recs.push('Overall API linkage is weak — consider documenting the API contract to ensure frontend and backend stay in sync.');
  }

  if (linkageLevel === 'partial') {
    recs.push('API linkage is partial — review unresolved calls and orphaned routes to improve full-stack visibility.');
  }

  return recs.slice(0, RECOMMENDATIONS_MAX);
}

// ── Summary ───────────────────────────────────────────────────────────────────

function _summary(linked, unresolved, orphaned, mismatches, level, score) {
  if (linked === 0 && unresolved === 0 && orphaned === 0) {
    return 'No routes or API calls detected — linkage analysis cannot be performed.';
  }
  const parts = [
    linked + ' linked endpoint' + (linked === 1 ? '' : 's') + '.',
  ];
  if (unresolved > 0) parts.push(unresolved + ' unresolved frontend call' + (unresolved === 1 ? '' : 's') + '.');
  if (orphaned > 0)   parts.push(orphaned + ' orphaned backend route' + (orphaned === 1 ? '' : 's') + '.');
  if (mismatches > 0) parts.push(mismatches + ' method mismatch' + (mismatches === 1 ? '' : 'es') + '.');
  parts.push('Linkage: ' + level + ' (score ' + score + '/100).');
  return parts.join(' ');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Link frontend API calls to backend routes.
 * Pure function — no I/O, no mutation of input.
 *
 * @param {{ backendRoutes: Array, frontendApiCalls: Array, endpointInventory: Array }} [params]
 */
function linkFrontendBackendApis(params) {
  const backendRoutes    = (params && Array.isArray(params.backendRoutes))    ? params.backendRoutes    : [];
  const frontendApiCalls = (params && Array.isArray(params.frontendApiCalls)) ? params.frontendApiCalls : [];

  const {
    linkedEndpoints,
    unresolvedFrontendCalls,
    orphanedBackendRoutes,
    methodMismatches,
    linkedFrontendIdxs,
    linkedBackendIdxs,
  } = _buildLinkage(backendRoutes, frontendApiCalls);

  // Coverage
  const frontendCallCount        = frontendApiCalls.length;
  const backendRouteCount        = backendRoutes.length;
  const linkedFrontendCallCount  = linkedFrontendIdxs.size;
  const linkedBackendRouteCount  = linkedBackendIdxs.size;
  const unresolvedFrontendCallCount = unresolvedFrontendCalls.length;
  const orphanedBackendRouteCount   = orphanedBackendRoutes.length;
  const methodMismatchCount         = methodMismatches.length;

  const frontendCoveragePercent = frontendCallCount > 0
    ? Math.round((linkedFrontendCallCount  / frontendCallCount) * 100)
    : 0;
  const backendCoveragePercent  = backendRouteCount > 0
    ? Math.round((linkedBackendRouteCount  / backendRouteCount)  * 100)
    : 0;

  const coverage = {
    frontendCallCount,
    backendRouteCount,
    linkedFrontendCallCount,
    linkedBackendRouteCount,
    unresolvedFrontendCallCount,
    orphanedBackendRouteCount,
    methodMismatchCount,
    frontendCoveragePercent,
    backendCoveragePercent,
  };

  const hasAny = frontendCallCount > 0 || backendRouteCount > 0;
  const linkageScore = hasAny ? _score(frontendCoveragePercent, backendCoveragePercent, methodMismatchCount, frontendCallCount) : 0;
  const linkageLevel = _level(linkageScore, hasAny);

  const recommendations = _recommendations(unresolvedFrontendCalls, orphanedBackendRoutes, methodMismatches, linkageLevel);
  const summary = _summary(linkedEndpoints.length, unresolvedFrontendCallCount, orphanedBackendRouteCount, methodMismatchCount, linkageLevel, linkageScore);

  return {
    linkedEndpoints,
    unresolvedFrontendCalls,
    orphanedBackendRoutes,
    methodMismatches,
    linkageScore,
    linkageLevel,
    coverage,
    summary,
    recommendations,
  };
}

module.exports = { linkFrontendBackendApis };
