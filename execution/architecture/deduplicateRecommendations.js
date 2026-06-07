'use strict';

// Semantic deduplication for architecture recommendations.
//
// Three analysis modules independently flag the same architectural issues but
// phrase them differently. When their outputs are merged, identical issues
// appear as separate bullets. This utility groups recommendations by semantic
// issue category and keeps only the first occurrence (which, after the caller
// re-orders sources by quality, is the strongest wording).
//
// Identified cross-source duplicates (as of Phase 1 architecture pipeline):
//
//   Group A — unresolved frontend API calls:
//     linkFrontendBackendApis:         "N frontend API call(s) have no matching backend
//                                       route — confirm the route is defined or remove
//                                       the dead call."
//     verifyArchitectureBoundaries:    "N frontend API call(s) have no matching backend
//                                       route — verify routes are defined or remove dead
//                                       calls."
//     assessImplementationCompleteness:"N unresolved frontend API call(s) — verify the
//                                       corresponding backend routes exist."
//
//   Group B — orphaned backend routes:
//     linkFrontendBackendApis:         "N backend route(s) have no frontend counterpart —
//                                       these may be internal APIs, webhooks, or unused
//                                       endpoints worth reviewing."
//     verifyArchitectureBoundaries:    "N backend route candidate(s) have no frontend
//                                       match — audit for unused or internal-only
//                                       endpoints."
//
//   Group C — HTTP method mismatches:
//     linkFrontendBackendApis:         "N method mismatch(es) detected — verify HTTP
//                                       methods align between frontend calls and backend
//                                       route definitions."
//     verifyArchitectureBoundaries:    "N HTTP method mismatch(es) — align frontend call
//                                       methods with backend route definitions."

// Ordered patterns — first match wins. Keep the three cross-source groups at
// the top; everything else falls through to its verbatim text as a unique key.
//
// Each pattern matches BOTH the new action-oriented phrasings (current generator
// output) AND the old diagnostic-prefix phrasings (stale DB cache snapshots
// built before the action-oriented rewrite). This lets _withDedupedFindings
// correctly collapse old stale data even after the generator strings changed.
const SEMANTIC_PATTERNS = [
  // Group A: unresolved frontend API calls
  //   new: "...unresolved frontend API calls..."
  //   old: "...no matching backend route..."
  { key: 'unresolved_frontend_api',  re: /unresolved frontend api call|no matching backend route/i },
  // Group B: orphaned backend routes
  //   new: "...without frontend consumers..."
  //   old: "...no frontend counterpart..." / "...no frontend match..."
  { key: 'orphaned_backend_route',   re: /without frontend consumer|no frontend counterpart|no frontend match/i },
  // Group C: HTTP method mismatches — phrase "method mismatch" unchanged across both eras
  { key: 'method_mismatch',          re: /method mismatch/i },
];

// Preferred (linkage-sourced) phrasing for each semantic group.
// When the utility encounters a later occurrence that matches the preferred
// pattern, it replaces the earlier (weaker) wording in-place. This handles
// stale DB-cached snapshots where the old boundary-first concat order placed
// weaker boundary wording before stronger linkage wording.
//
// Each pattern is a disjunction so that both new and old linkage phrasings
// are recognised as preferred:
//   new linkage phrase | old linkage phrase
const PREFERRED_PATTERNS = {
  // new: "...obsolete calls..." | old: "...confirm the route is defined..."
  unresolved_frontend_api: /obsolete calls|confirm the route is defined/i,
  // new: "...where appropriate..." | old: "...no frontend counterpart..."
  orphaned_backend_route:  /where appropriate|no frontend counterpart/i,
  // new: "...resolve HTTP method mismatches..." | old: "detected — verify HTTP methods align..."
  method_mismatch:         /resolve http method mismatch|detected.*verify http methods align/i,
};

function _isPreferred(rec, key) {
  const pref = PREFERRED_PATTERNS[key];
  return pref !== undefined && pref.test(rec);
}

/**
 * Map a recommendation string to a semantic issue category key.
 * Recommendations that share a category key describe the same action.
 * Non-overlapping recommendations map to their own normalized text.
 *
 * @param {string} rec
 * @returns {string}
 */
function recommendationKey(rec) {
  const s = rec || '';
  for (let i = 0; i < SEMANTIC_PATTERNS.length; i++) {
    if (SEMANTIC_PATTERNS[i].re.test(s)) return SEMANTIC_PATTERNS[i].key;
  }
  return s.trim().toLowerCase();
}

/**
 * Deduplicate an ordered array of recommendation strings by semantic category.
 *
 * First-seen-wins by default. For the three cross-source duplicate groups
 * (A/B/C), if a PREFERRED phrasing (linkage-sourced wording) appears AFTER a
 * weaker phrasing (boundary/completeness-sourced), the utility upgrades the
 * earlier slot in-place so the preferred wording always survives.
 *
 * This makes the function safe to apply to stale DB-cached snapshots where the
 * old boundary-first concat order placed weaker wording first.
 *
 * @param {string[]} prioritized  — recommendations (order influences position, not wording)
 * @param {number}   [maxCount]   — cap on result length (defaults to Infinity)
 * @returns {string[]}
 */
function deduplicateRecommendations(prioritized, maxCount) {
  const max  = typeof maxCount === 'number' ? maxCount : Infinity;
  // Map from semantic key → { rec, idx } so we can upgrade in place.
  const seen = new Map();
  const out  = [];
  const arr  = Array.isArray(prioritized) ? prioritized : [];
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    if (typeof rec !== 'string' || !rec.trim()) continue;
    const key = recommendationKey(rec);
    if (!seen.has(key)) {
      // Only add new items while under the cap.
      if (out.length < max) {
        seen.set(key, { rec, idx: out.length });
        out.push(rec);
      }
    } else {
      // In-place upgrade: keep the preferred (linkage) wording even if it
      // arrived later than the weaker (boundary/completeness) wording.
      // This continues even after the cap so linkage can upgrade a boundary
      // rec that was stored at, say, slot 0 when the cap was already full.
      const stored = seen.get(key);
      if (_isPreferred(rec, key) && !_isPreferred(stored.rec, key)) {
        out[stored.idx] = rec;
        seen.set(key, { rec, idx: stored.idx });
      }
    }
  }
  return out;
}

module.exports = { recommendationKey, deduplicateRecommendations };
