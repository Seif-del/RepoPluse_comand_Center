'use strict';

// Read-time wording normalizer for architecture recommendations.
//
// Stale DB-cached snapshots may contain recommendation strings produced by the
// pre-action-oriented generator (before commit 489dcaf). This utility converts
// those old strings to their modern equivalents so the API always returns
// current wording regardless of when the snapshot was built.
//
// Rules:
//   • Patterns are matched case-insensitively against the full string.
//   • First match wins; remaining patterns are not checked.
//   • Strings that match no pattern are returned unchanged (idempotent for
//     already-modern wording).
//   • Non-string inputs are returned unchanged.
//
// Mapping sources (old generator → new generator):
//   linkFrontendBackendApis.js        — 5 mappings
//   verifyArchitectureBoundaries.js   — 8 mappings
//   assessImplementationCompleteness.js — 5 mappings

const NORMALIZATIONS = [

  // ── linkFrontendBackendApis.js ───────────────────────────────────────────────

  // "N method mismatch(es) detected — verify HTTP methods align between frontend
  //  calls and backend route definitions."
  {
    re:  /^\d+ method mismatch(?:es)? detected — verify http methods align between frontend calls and backend route definitions\.$/i,
    out: 'Align frontend request methods with backend route definitions to resolve HTTP method mismatches.',
  },

  // "N frontend API call(s) have no matching backend route — confirm the route is
  //  defined or remove the dead call."
  {
    re:  /^\d+ frontend api calls? have no matching backend route — confirm the route is defined or remove the dead call\.$/i,
    out: 'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
  },

  // "N backend route(s) have no frontend counterpart — these may be internal APIs,
  //  webhooks, or unused endpoints worth reviewing."
  {
    re:  /^\d+ backend routes? have no frontend counterpart — these may be internal apis, webhooks, or unused endpoints worth reviewing\.$/i,
    out: 'Review backend routes without frontend consumers and retire unused endpoints where appropriate.',
  },

  // "Overall API linkage is weak — consider documenting the API contract to ensure
  //  frontend and backend stay in sync."
  {
    re:  /^overall api linkage is weak — consider documenting the api contract to ensure frontend and backend stay in sync\.$/i,
    out: 'Document the API contract and align frontend calls with backend routes to improve full-stack linkage.',
  },

  // "API linkage is partial — review unresolved calls and orphaned routes to
  //  improve full-stack visibility."
  {
    re:  /^api linkage is partial — review unresolved calls and orphaned routes to improve full-stack visibility\.$/i,
    out: 'Audit unresolved API calls and orphaned routes to improve full-stack visibility.',
  },

  // ── verifyArchitectureBoundaries.js ─────────────────────────────────────────

  // "N architectural boundary violation(s) detected (types) — fix import direction
  //  to respect layer boundaries."
  {
    re:  /^\d+ architectural boundary violations? detected.*— fix import direction to respect layer boundaries\.$/i,
    out: 'Fix import direction violations to respect layer boundaries.',
  },

  // "High-severity circular dependencies detected — break cycles in route/service/
  //  model layers to prevent hidden coupling."
  {
    re:  /^high-severity circular dependencies detected — break cycles in route\/service\/model layers to prevent hidden coupling\.$/i,
    out: 'Break high-severity circular dependencies in route, service, and model layers to prevent hidden coupling.',
  },

  // "Circular dependencies detected — consider extracting shared utilities to break
  //  import cycles."
  {
    re:  /^circular dependencies detected — consider extracting shared utilities to break import cycles\.$/i,
    out: 'Extract shared utilities to break circular import cycles.',
  },

  // "N frontend API call(s) have no matching backend route — verify routes are
  //  defined or remove dead calls."
  {
    re:  /^\d+ frontend api calls? have no matching backend route — verify routes are defined or remove dead calls\.$/i,
    out: 'Verify backend routes exist for unresolved frontend API calls, or remove dead calls.',
  },

  // "N HTTP method mismatch(es) — align frontend call methods with backend route
  //  definitions."
  {
    re:  /^\d+ http method mismatch(?:es)? — align frontend call methods with backend route definitions\.$/i,
    out: 'Align frontend call methods with backend route definitions to resolve method mismatches.',
  },

  // "Routes import models directly (N instance(s)) — introduce a service layer
  //  between routes and models."
  {
    re:  /^routes import models directly \(\d+ instances?\) — introduce a service layer between routes and models\.$/i,
    out: 'Introduce a service layer to eliminate direct model imports from route handlers.',
  },

  // "High fan-out modules detected — consider splitting FILE to reduce coupling."
  // FILE is dynamic — capture and embed in new string.
  {
    re:  /^high fan-out modules detected — consider splitting (.+) to reduce coupling\.$/i,
    out: function(rec) {
      var m = /^high fan-out modules detected — consider splitting (.+) to reduce coupling\.$/i.exec(rec);
      return m ? 'Split high fan-out modules such as ' + m[1] + ' to reduce inter-module coupling.' : rec;
    },
  },

  // "N backend route candidate(s) have no frontend match — audit for unused or
  //  internal-only endpoints."
  {
    re:  /^\d+ backend route candidates? have no frontend match — audit for unused or internal-only endpoints\.$/i,
    out: 'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.',
  },

  // ── assessImplementationCompleteness.js ─────────────────────────────────────

  // "N unresolved frontend API call(s) — verify the corresponding backend routes
  //  exist."
  {
    re:  /^\d+ unresolved frontend api calls? — verify the corresponding backend routes exist\.$/i,
    out: 'Verify that backend routes exist for all unresolved frontend API calls.',
  },

  // "N route file(s) have no service layer import — consider delegating business
  //  logic to service modules."
  {
    re:  /^\d+ route files? have no service layer import — consider delegating business logic to service modules\.$/i,
    out: 'Delegate business logic to service modules in route files that lack service layer imports.',
  },

  // "N file(s) show scaffold or placeholder patterns — replace stub implementations
  //  with production logic."
  {
    re:  /^\d+ files? show scaffold or placeholder patterns — replace stub implementations with production logic\.$/i,
    out: 'Replace scaffold and placeholder implementations with production-ready logic.',
  },

  // "Routes and/or services lack test coverage — add unit tests to verify behavior
  //  before shipping."
  {
    re:  /^routes and\/or services lack test coverage — add unit tests to verify behavior before shipping\.$/i,
    out: 'Add unit tests to routes and services to verify behavior before shipping.',
  },

  // "Architecture boundary health is LEVEL — review boundary violations to improve
  //  layering."
  {
    re:  /^architecture boundary health is \w+ — review boundary violations to improve layering\.$/i,
    out: 'Review and resolve architecture boundary violations to strengthen layering.',
  },
];

/**
 * Convert a stale recommendation string to its modern action-oriented equivalent.
 * Strings that are already modern (no pattern match) pass through unchanged.
 *
 * @param {string} rec
 * @returns {string}
 */
function normalizeRecommendationWording(rec) {
  if (typeof rec !== 'string') return rec;
  for (var i = 0; i < NORMALIZATIONS.length; i++) {
    if (NORMALIZATIONS[i].re.test(rec)) {
      var out = NORMALIZATIONS[i].out;
      return typeof out === 'function' ? out(rec) : out;
    }
  }
  return rec;
}

/**
 * Apply normalizeRecommendationWording to every element of an array.
 * Non-array inputs return an empty array.
 *
 * @param {string[]} recs
 * @returns {string[]}
 */
function normalizeRecommendationArray(recs) {
  if (!Array.isArray(recs)) return [];
  return recs.map(normalizeRecommendationWording);
}

module.exports = { normalizeRecommendationWording, normalizeRecommendationArray };
