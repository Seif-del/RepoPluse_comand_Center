'use strict';

const {
  normalizeRecommendationWording,
  normalizeRecommendationArray,
} = require('../../../../execution/architecture/normalizeRecommendationWording');

// ── normalizeRecommendationWording — linkFrontendBackendApis old strings ───────

describe('normalizeRecommendationWording — linkFrontendBackendApis old strings', () => {

  test('singular method mismatch → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 method mismatch detected — verify HTTP methods align between frontend calls and backend route definitions.'
    )).toBe('Align frontend request methods with backend route definitions to resolve HTTP method mismatches.');
  });

  test('plural method mismatches → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '3 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.'
    )).toBe('Align frontend request methods with backend route definitions to resolve HTTP method mismatches.');
  });

  test('singular unresolved frontend call → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 frontend API call have no matching backend route — confirm the route is defined or remove the dead call.'
    )).toBe('Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.');
  });

  test('plural unresolved frontend calls → action-oriented (UI-observed string)', () => {
    // Exact string observed in production UI
    expect(normalizeRecommendationWording(
      '19 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.'
    )).toBe('Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.');
  });

  test('singular orphaned backend route → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.'
    )).toBe('Review backend routes without frontend consumers and retire unused endpoints where appropriate.');
  });

  test('plural orphaned backend routes → action-oriented (UI-observed string)', () => {
    // Exact string observed in production UI
    expect(normalizeRecommendationWording(
      '44 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.'
    )).toBe('Review backend routes without frontend consumers and retire unused endpoints where appropriate.');
  });

  test('weak linkage → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Overall API linkage is weak — consider documenting the API contract to ensure frontend and backend stay in sync.'
    )).toBe('Document the API contract and align frontend calls with backend routes to improve full-stack linkage.');
  });

  test('partial linkage → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'API linkage is partial — review unresolved calls and orphaned routes to improve full-stack visibility.'
    )).toBe('Audit unresolved API calls and orphaned routes to improve full-stack visibility.');
  });
});

// ── normalizeRecommendationWording — verifyArchitectureBoundaries old strings ──

describe('normalizeRecommendationWording — verifyArchitectureBoundaries old strings', () => {

  test('singular boundary violation → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 architectural boundary violation detected (route_imports_model) — fix import direction to respect layer boundaries.'
    )).toBe('Fix import direction violations to respect layer boundaries.');
  });

  test('plural boundary violations with multiple types → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '3 architectural boundary violations detected (route_imports_model, circular_dependency) — fix import direction to respect layer boundaries.'
    )).toBe('Fix import direction violations to respect layer boundaries.');
  });

  test('high-severity circular deps → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'High-severity circular dependencies detected — break cycles in route/service/model layers to prevent hidden coupling.'
    )).toBe('Break high-severity circular dependencies in route, service, and model layers to prevent hidden coupling.');
  });

  test('circular deps → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Circular dependencies detected — consider extracting shared utilities to break import cycles.'
    )).toBe('Extract shared utilities to break circular import cycles.');
  });

  test('singular unresolved call (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 frontend API call have no matching backend route — verify routes are defined or remove dead calls.'
    )).toBe('Verify backend routes exist for unresolved frontend API calls, or remove dead calls.');
  });

  test('plural unresolved calls (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '5 frontend API calls have no matching backend route — verify routes are defined or remove dead calls.'
    )).toBe('Verify backend routes exist for unresolved frontend API calls, or remove dead calls.');
  });

  test('singular HTTP method mismatch (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 HTTP method mismatch — align frontend call methods with backend route definitions.'
    )).toBe('Align frontend call methods with backend route definitions to resolve method mismatches.');
  });

  test('plural HTTP method mismatches (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '4 HTTP method mismatches — align frontend call methods with backend route definitions.'
    )).toBe('Align frontend call methods with backend route definitions to resolve method mismatches.');
  });

  test('routes import models directly (singular) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Routes import models directly (1 instance) — introduce a service layer between routes and models.'
    )).toBe('Introduce a service layer to eliminate direct model imports from route handlers.');
  });

  test('routes import models directly (plural) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Routes import models directly (7 instances) — introduce a service layer between routes and models.'
    )).toBe('Introduce a service layer to eliminate direct model imports from route handlers.');
  });

  test('high fan-out module preserves filename → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'High fan-out modules detected — consider splitting src/utils/helpers.js to reduce coupling.'
    )).toBe('Split high fan-out modules such as src/utils/helpers.js to reduce inter-module coupling.');
  });

  test('high fan-out module with nested path preserves filename', () => {
    expect(normalizeRecommendationWording(
      'High fan-out modules detected — consider splitting services/data/index.js to reduce coupling.'
    )).toBe('Split high fan-out modules such as services/data/index.js to reduce inter-module coupling.');
  });

  test('singular orphaned route candidate (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.'
    )).toBe('Audit backend routes without frontend consumers and retire unused or internal-only endpoints.');
  });

  test('plural orphaned route candidates (boundary phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '44 backend route candidates have no frontend match — audit for unused or internal-only endpoints.'
    )).toBe('Audit backend routes without frontend consumers and retire unused or internal-only endpoints.');
  });
});

// ── normalizeRecommendationWording — assessImplementationCompleteness old strings

describe('normalizeRecommendationWording — assessImplementationCompleteness old strings', () => {

  test('singular unresolved call (completeness phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 unresolved frontend API call — verify the corresponding backend routes exist.'
    )).toBe('Verify that backend routes exist for all unresolved frontend API calls.');
  });

  test('plural unresolved calls (completeness phrasing) → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '19 unresolved frontend API calls — verify the corresponding backend routes exist.'
    )).toBe('Verify that backend routes exist for all unresolved frontend API calls.');
  });

  test('singular route file without service layer → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 route file have no service layer import — consider delegating business logic to service modules.'
    )).toBe('Delegate business logic to service modules in route files that lack service layer imports.');
  });

  test('plural route files without service layer → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '3 route files have no service layer import — consider delegating business logic to service modules.'
    )).toBe('Delegate business logic to service modules in route files that lack service layer imports.');
  });

  test('singular scaffold file → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '1 file show scaffold or placeholder patterns — replace stub implementations with production logic.'
    )).toBe('Replace scaffold and placeholder implementations with production-ready logic.');
  });

  test('plural scaffold files → action-oriented', () => {
    expect(normalizeRecommendationWording(
      '5 files show scaffold or placeholder patterns — replace stub implementations with production logic.'
    )).toBe('Replace scaffold and placeholder implementations with production-ready logic.');
  });

  test('missing test coverage → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Routes and/or services lack test coverage — add unit tests to verify behavior before shipping.'
    )).toBe('Add unit tests to routes and services to verify behavior before shipping.');
  });

  test('boundary health weak → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Architecture boundary health is weak — review boundary violations to improve layering.'
    )).toBe('Review and resolve architecture boundary violations to strengthen layering.');
  });

  test('boundary health degraded → action-oriented', () => {
    expect(normalizeRecommendationWording(
      'Architecture boundary health is degraded — review boundary violations to improve layering.'
    )).toBe('Review and resolve architecture boundary violations to strengthen layering.');
  });
});

// ── normalizeRecommendationWording — already-modern strings pass through ───────

describe('normalizeRecommendationWording — modern strings pass through unchanged', () => {

  const MODERN_STRINGS = [
    // Group A — unresolved frontend API calls
    'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
    'Verify backend routes exist for unresolved frontend API calls, or remove dead calls.',
    'Verify that backend routes exist for all unresolved frontend API calls.',
    // Group B — orphaned backend routes
    'Review backend routes without frontend consumers and retire unused endpoints where appropriate.',
    'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.',
    // Group C — HTTP method mismatches
    'Align frontend request methods with backend route definitions to resolve HTTP method mismatches.',
    'Align frontend call methods with backend route definitions to resolve method mismatches.',
    // Other boundary recs
    'Fix import direction violations to respect layer boundaries.',
    'Break high-severity circular dependencies in route, service, and model layers to prevent hidden coupling.',
    'Extract shared utilities to break circular import cycles.',
    'Introduce a service layer to eliminate direct model imports from route handlers.',
    'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.',
    // Other completeness recs
    'Delegate business logic to service modules in route files that lack service layer imports.',
    'Replace scaffold and placeholder implementations with production-ready logic.',
    'Add unit tests to routes and services to verify behavior before shipping.',
    'Review and resolve architecture boundary violations to strengthen layering.',
    // Other linkage recs
    'Document the API contract and align frontend calls with backend routes to improve full-stack linkage.',
    'Audit unresolved API calls and orphaned routes to improve full-stack visibility.',
  ];

  MODERN_STRINGS.forEach(function(rec) {
    test('modern string is returned unchanged: ' + rec.slice(0, 60) + '…', () => {
      expect(normalizeRecommendationWording(rec)).toBe(rec);
    });
  });
});

// ── normalizeRecommendationWording — edge cases ────────────────────────────────

describe('normalizeRecommendationWording — edge cases', () => {

  test('null returns null', () => {
    expect(normalizeRecommendationWording(null)).toBeNull();
  });

  test('undefined returns undefined', () => {
    expect(normalizeRecommendationWording(undefined)).toBeUndefined();
  });

  test('number returns number unchanged', () => {
    expect(normalizeRecommendationWording(42)).toBe(42);
  });

  test('empty string returns empty string', () => {
    expect(normalizeRecommendationWording('')).toBe('');
  });

  test('unrecognized string returns unchanged', () => {
    const rec = 'Some future recommendation not in the mapping table.';
    expect(normalizeRecommendationWording(rec)).toBe(rec);
  });

  test('matching is case-insensitive', () => {
    expect(normalizeRecommendationWording(
      '5 FRONTEND API CALLS have no matching backend route — confirm the route is defined or remove the dead call.'
    )).toBe('Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.');
  });

  test('idempotent — normalizing an already-normalized string returns it unchanged', () => {
    const modern = 'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.';
    expect(normalizeRecommendationWording(normalizeRecommendationWording(modern))).toBe(modern);
  });
});

// ── normalizeRecommendationArray ──────────────────────────────────────────────

describe('normalizeRecommendationArray', () => {

  test('converts all old strings in an array', () => {
    const input = [
      '19 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.',
      '44 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.',
    ];
    const result = normalizeRecommendationArray(input);
    expect(result).toEqual([
      'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
      'Review backend routes without frontend consumers and retire unused endpoints where appropriate.',
    ]);
  });

  test('modern strings in array pass through unchanged', () => {
    const input = [
      'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
      'Fix import direction violations to respect layer boundaries.',
    ];
    expect(normalizeRecommendationArray(input)).toEqual(input);
  });

  test('mixed array — old strings normalized, modern strings unchanged', () => {
    const input = [
      'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
      '3 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.',
    ];
    const result = normalizeRecommendationArray(input);
    expect(result[0]).toBe('Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.');
    expect(result[1]).toBe('Align frontend request methods with backend route definitions to resolve HTTP method mismatches.');
  });

  test('empty array returns empty array', () => {
    expect(normalizeRecommendationArray([])).toEqual([]);
  });

  test('null input returns empty array', () => {
    expect(normalizeRecommendationArray(null)).toEqual([]);
  });

  test('undefined input returns empty array', () => {
    expect(normalizeRecommendationArray(undefined)).toEqual([]);
  });

  test('non-array input returns empty array', () => {
    expect(normalizeRecommendationArray('not an array')).toEqual([]);
  });

  test('does not mutate the input array', () => {
    const input = [
      '1 frontend API call have no matching backend route — confirm the route is defined or remove the dead call.',
    ];
    const original = input.slice();
    normalizeRecommendationArray(input);
    expect(input).toEqual(original);
  });

  test('preserves array length', () => {
    const input = [
      '3 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.',
      '5 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.',
      'Fix import direction violations to respect layer boundaries.',
    ];
    expect(normalizeRecommendationArray(input)).toHaveLength(3);
  });
});
