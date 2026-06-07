'use strict';

const {
  recommendationKey,
  deduplicateRecommendations,
} = require('../../../../execution/architecture/deduplicateRecommendations');

// ── recommendationKey — known cross-source duplicate groups ───────────────────

describe('recommendationKey — Group A (unresolved frontend API calls)', () => {
  // Three sources independently emit different phrasings for the same issue.
  // All must map to the same key so the dedup can collapse them.

  test('linkage phrasing maps to unresolved_frontend_api', () => {
    // linkFrontendBackendApis exact string (singular)
    expect(recommendationKey(
      '1 frontend API call have no matching backend route — confirm the route is defined or remove the dead call.'
    )).toBe('unresolved_frontend_api');
  });

  test('linkage phrasing maps to unresolved_frontend_api (plural)', () => {
    // linkFrontendBackendApis exact string (plural)
    expect(recommendationKey(
      '19 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.'
    )).toBe('unresolved_frontend_api');
  });

  test('boundary phrasing maps to unresolved_frontend_api', () => {
    // verifyArchitectureBoundaries exact string
    expect(recommendationKey(
      '19 frontend API calls have no matching backend route — verify routes are defined or remove dead calls.'
    )).toBe('unresolved_frontend_api');
  });

  test('completeness phrasing maps to unresolved_frontend_api', () => {
    // assessImplementationCompleteness exact string
    expect(recommendationKey(
      '19 unresolved frontend API calls — verify the corresponding backend routes exist.'
    )).toBe('unresolved_frontend_api');
  });

  test('completeness phrasing maps to unresolved_frontend_api (singular)', () => {
    expect(recommendationKey(
      '1 unresolved frontend API call — verify the corresponding backend routes exist.'
    )).toBe('unresolved_frontend_api');
  });
});

describe('recommendationKey — Group B (orphaned backend routes)', () => {
  // Two sources (linkage + boundary) emit different phrasings for the same issue.

  test('linkage phrasing maps to orphaned_backend_route', () => {
    // linkFrontendBackendApis exact string
    expect(recommendationKey(
      '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.'
    )).toBe('orphaned_backend_route');
  });

  test('linkage phrasing maps to orphaned_backend_route (plural)', () => {
    expect(recommendationKey(
      '5 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.'
    )).toBe('orphaned_backend_route');
  });

  test('boundary phrasing maps to orphaned_backend_route', () => {
    // verifyArchitectureBoundaries exact string
    expect(recommendationKey(
      '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.'
    )).toBe('orphaned_backend_route');
  });

  test('boundary phrasing maps to orphaned_backend_route (plural)', () => {
    expect(recommendationKey(
      '5 backend route candidates have no frontend match — audit for unused or internal-only endpoints.'
    )).toBe('orphaned_backend_route');
  });
});

describe('recommendationKey — Group C (HTTP method mismatches)', () => {
  // Two sources (linkage + boundary) emit different phrasings for the same issue.

  test('linkage phrasing maps to method_mismatch', () => {
    // linkFrontendBackendApis exact string
    expect(recommendationKey(
      '1 method mismatch detected — verify HTTP methods align between frontend calls and backend route definitions.'
    )).toBe('method_mismatch');
  });

  test('linkage phrasing maps to method_mismatch (plural)', () => {
    expect(recommendationKey(
      '3 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.'
    )).toBe('method_mismatch');
  });

  test('boundary phrasing maps to method_mismatch', () => {
    // verifyArchitectureBoundaries exact string
    expect(recommendationKey(
      '1 HTTP method mismatch — align frontend call methods with backend route definitions.'
    )).toBe('method_mismatch');
  });

  test('boundary phrasing maps to method_mismatch (plural)', () => {
    expect(recommendationKey(
      '3 HTTP method mismatches — align frontend call methods with backend route definitions.'
    )).toBe('method_mismatch');
  });
});

describe('recommendationKey — non-overlapping recs map to unique keys', () => {
  // Recs that don't belong to any cross-source duplicate group must NOT share a key.
  // Each maps to its own normalized verbatim text.

  test('route-without-service rec has its own unique key', () => {
    const key = recommendationKey(
      '2 route files have no service layer import — consider delegating business logic to service modules.'
    );
    expect(key).not.toBe('unresolved_frontend_api');
    expect(key).not.toBe('orphaned_backend_route');
    expect(key).not.toBe('method_mismatch');
  });

  test('scaffold-placeholder rec has its own unique key', () => {
    const key = recommendationKey(
      '3 files show scaffold or placeholder patterns — replace stub implementations with production logic.'
    );
    expect(key).not.toBe('unresolved_frontend_api');
    expect(key).not.toBe('orphaned_backend_route');
    expect(key).not.toBe('method_mismatch');
  });

  test('two distinct non-overlapping recs produce different keys', () => {
    const k1 = recommendationKey(
      'Routes and/or services lack test coverage — add unit tests to verify behavior before shipping.'
    );
    const k2 = recommendationKey(
      'Architecture boundary health is weak — review boundary violations to improve layering.'
    );
    expect(k1).not.toBe(k2);
  });
});

// ── deduplicateRecommendations — cross-source merge behavior ──────────────────

// ── UI regression: exact strings reported in production ──────────────────────

describe('deduplicateRecommendations — UI regression (exact production strings)', () => {
  // Reproduces the exact duplicate the user observed in the live UI:
  //   "44 backend route candidates have no frontend match — audit for unused or
  //    internal-only endpoints."                           (boundary, weaker)
  //   "44 backend routes have no frontend counterpart — these may be internal
  //    APIs, webhooks, or unused endpoints worth reviewing." (linkage, stronger)
  //
  // This scenario arises from STALE DB CACHE: the snapshot was built before the
  // concat-order fix, so boundary wording sits BEFORE linkage wording in the
  // stored array.

  const BOUNDARY_44 = '44 backend route candidates have no frontend match — audit for unused or internal-only endpoints.';
  const LINKAGE_44  = '44 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';

  test('boundary-first order collapses to one rec', () => {
    const result = deduplicateRecommendations([BOUNDARY_44, LINKAGE_44]);
    expect(result).toHaveLength(1);
  });

  test('boundary-first order: linkage wording wins (preferred upgrade)', () => {
    const result = deduplicateRecommendations([BOUNDARY_44, LINKAGE_44]);
    expect(result[0]).toBe(LINKAGE_44);
  });

  test('boundary-first order: boundary wording is removed', () => {
    const result = deduplicateRecommendations([BOUNDARY_44, LINKAGE_44]);
    expect(result).not.toContain(BOUNDARY_44);
  });

  test('linkage-first order also collapses to one rec (normal new-snapshot path)', () => {
    const result = deduplicateRecommendations([LINKAGE_44, BOUNDARY_44]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(LINKAGE_44);
  });

  test('output position is preserved — rec at slot 0 stays at slot 0 after upgrade', () => {
    // The upgrade replaces in-place: the boundary rec was at index 0, so the
    // preferred linkage rec should also appear at index 0 in the output.
    const other = 'Some unrelated recommendation.';
    const result = deduplicateRecommendations([BOUNDARY_44, other, LINKAGE_44]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(LINKAGE_44);
    expect(result[1]).toBe(other);
  });
});

// ── Preferred-wording upgrade for all three semantic groups ───────────────────

describe('deduplicateRecommendations — preferred-wording upgrade (boundary before linkage)', () => {
  // Simulates the stale-cache scenario for each group: weaker (boundary or
  // completeness) wording appears first, stronger (linkage) wording appears
  // second. The preferred-upgrade logic must replace in-place.

  test('Group B: boundary-first → linkage wording wins (preferred upgrade)', () => {
    const boundary = '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.';
    const linkage  = '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';
    const result   = deduplicateRecommendations([boundary, linkage]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group A: boundary-first → linkage wording wins (preferred upgrade)', () => {
    const boundary = '3 frontend API calls have no matching backend route — verify routes are defined or remove dead calls.';
    const linkage  = '3 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const result   = deduplicateRecommendations([boundary, linkage]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group A: completeness-first → linkage wording wins (preferred upgrade)', () => {
    const completeness = '3 unresolved frontend API calls — verify the corresponding backend routes exist.';
    const linkage      = '3 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const result       = deduplicateRecommendations([completeness, linkage]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group C: boundary-first → linkage wording wins (preferred upgrade)', () => {
    const boundary = '2 HTTP method mismatches — align frontend call methods with backend route definitions.';
    const linkage  = '2 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.';
    const result   = deduplicateRecommendations([boundary, linkage]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('preferred wording does not displace a DIFFERENT preferred wording (both preferred → first wins)', () => {
    // If somehow two linkage-style recs end up in the same group, first one keeps its slot.
    const linkage1 = '3 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const linkage2 = '5 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const result   = deduplicateRecommendations([linkage1, linkage2]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage1);
  });

  test('upgrade does not exceed maxCount', () => {
    // Upgrade happens in-place; the cap must not be exceeded.
    const boundary = '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.';
    const linkage  = '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';
    const other1   = 'Unrelated recommendation alpha.';
    const other2   = 'Unrelated recommendation beta.';
    // Pass 4 items, cap at 2 (boundary + other1 fill the cap before linkage arrives)
    const result   = deduplicateRecommendations([boundary, other1, other2, linkage], 2);
    expect(result).toHaveLength(2);
    // boundary was in slot 0 and should be upgraded to linkage; other1 in slot 1
    expect(result[0]).toBe(linkage);
    expect(result[1]).toBe(other1);
  });
});

describe('deduplicateRecommendations — first-seen wins by semantic key', () => {
  // The caller must order sources by quality BEFORE passing to this function.
  // The UI bug: boundary recs appeared before linkage recs in the old code,
  // so boundary's weaker wording won. Linkage must come first.

  test('Group B UI regression: linkage wording wins over boundary', () => {
    // Reproduces exact user-reported duplicate:
    //   "backend route candidates have no frontend match" (boundary — weaker)
    //   "backend routes have no frontend counterpart"    (linkage — stronger, should win)
    const linkage   = '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';
    const boundary  = '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.';

    // Linkage first (caller's responsibility): linkage wording must survive
    const result = deduplicateRecommendations([linkage, boundary]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group B: boundary wording is removed when linkage appears first', () => {
    const linkage   = '1 backend route have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';
    const boundary  = '1 backend route candidate have no frontend match — audit for unused or internal-only endpoints.';

    const result = deduplicateRecommendations([linkage, boundary]);
    expect(result).not.toContain(boundary);
  });

  test('Group A: linkage wording wins over boundary wording', () => {
    const linkage  = '19 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const boundary = '19 frontend API calls have no matching backend route — verify routes are defined or remove dead calls.';
    const result   = deduplicateRecommendations([linkage, boundary]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group A: linkage wording wins over completeness wording', () => {
    const linkage     = '5 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const completeness = '5 unresolved frontend API calls — verify the corresponding backend routes exist.';
    const result      = deduplicateRecommendations([linkage, completeness]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group A: all three phrasings collapse to one (linkage first → linkage wins)', () => {
    const linkage      = '2 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const completeness  = '2 unresolved frontend API calls — verify the corresponding backend routes exist.';
    const boundary     = '2 frontend API calls have no matching backend route — verify routes are defined or remove dead calls.';
    const result       = deduplicateRecommendations([linkage, completeness, boundary]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });

  test('Group C: linkage wording wins over boundary wording', () => {
    const linkage  = '2 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.';
    const boundary = '2 HTTP method mismatches — align frontend call methods with backend route definitions.';
    const result   = deduplicateRecommendations([linkage, boundary]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(linkage);
  });
});

describe('deduplicateRecommendations — distinct recs both survive', () => {
  test('two recs with different semantic keys both appear in output', () => {
    const a = 'API linkage is partial — review unresolved calls and orphaned routes to improve full-stack visibility.';
    const b = '3 files show scaffold or placeholder patterns — replace stub implementations with production logic.';
    const result = deduplicateRecommendations([a, b]);
    expect(result).toHaveLength(2);
    expect(result).toContain(a);
    expect(result).toContain(b);
  });

  test('all three group winners survive when they are all present', () => {
    const linkageGroupA = '2 frontend API calls have no matching backend route — confirm the route is defined or remove the dead call.';
    const linkageGroupB = '2 backend routes have no frontend counterpart — these may be internal APIs, webhooks, or unused endpoints worth reviewing.';
    const linkageGroupC = '2 method mismatches detected — verify HTTP methods align between frontend calls and backend route definitions.';
    const result = deduplicateRecommendations([linkageGroupA, linkageGroupB, linkageGroupC]);
    expect(result).toHaveLength(3);
    expect(result).toContain(linkageGroupA);
    expect(result).toContain(linkageGroupB);
    expect(result).toContain(linkageGroupC);
  });
});

describe('deduplicateRecommendations — maxCount cap', () => {
  test('output is capped at maxCount', () => {
    const recs = [
      'Rec one — action required.',
      'Rec two — action required.',
      'Rec three — action required.',
      'Rec four — action required.',
      'Rec five — action required.',
      'Rec six — action required.',
    ];
    expect(deduplicateRecommendations(recs, 5)).toHaveLength(5);
  });

  test('maxCount=1 returns only the first rec', () => {
    const recs = ['First.', 'Second.', 'Third.'];
    const result = deduplicateRecommendations(recs, 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe('First.');
  });

  test('maxCount larger than array returns all unique recs', () => {
    const recs = ['Only one.'];
    expect(deduplicateRecommendations(recs, 10)).toHaveLength(1);
  });
});

describe('deduplicateRecommendations — edge cases', () => {
  test('empty array returns empty array', () => {
    expect(deduplicateRecommendations([])).toEqual([]);
  });

  test('null input returns empty array', () => {
    expect(deduplicateRecommendations(null)).toEqual([]);
  });

  test('undefined input returns empty array', () => {
    expect(deduplicateRecommendations(undefined)).toEqual([]);
  });

  test('non-array input returns empty array', () => {
    expect(deduplicateRecommendations('not an array')).toEqual([]);
  });

  test('empty strings are skipped', () => {
    expect(deduplicateRecommendations(['', '   ', 'Valid rec.'])).toEqual(['Valid rec.']);
  });

  test('non-string entries are skipped', () => {
    expect(deduplicateRecommendations([null, undefined, 42, 'Valid rec.'])).toEqual(['Valid rec.']);
  });

  test('does not mutate the input array', () => {
    const recs = ['A.', 'B.', 'A.'];
    const origLen = recs.length;
    deduplicateRecommendations(recs);
    expect(recs.length).toBe(origLen);
  });
});

// ── New action-oriented strings: key mapping ──────────────────────────────────

describe('recommendationKey — new action-oriented phrasings map to correct semantic keys', () => {

  describe('Group A (unresolved frontend API calls)', () => {
    test('linkage new phrasing maps to unresolved_frontend_api', () => {
      expect(recommendationKey(
        'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.'
      )).toBe('unresolved_frontend_api');
    });

    test('boundary new phrasing maps to unresolved_frontend_api', () => {
      expect(recommendationKey(
        'Verify backend routes exist for unresolved frontend API calls, or remove dead calls.'
      )).toBe('unresolved_frontend_api');
    });

    test('completeness new phrasing maps to unresolved_frontend_api', () => {
      expect(recommendationKey(
        'Verify that backend routes exist for all unresolved frontend API calls.'
      )).toBe('unresolved_frontend_api');
    });
  });

  describe('Group B (orphaned backend routes)', () => {
    test('linkage new phrasing maps to orphaned_backend_route', () => {
      expect(recommendationKey(
        'Review backend routes without frontend consumers and retire unused endpoints where appropriate.'
      )).toBe('orphaned_backend_route');
    });

    test('boundary new phrasing maps to orphaned_backend_route', () => {
      expect(recommendationKey(
        'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.'
      )).toBe('orphaned_backend_route');
    });
  });

  describe('Group C (HTTP method mismatches)', () => {
    test('linkage new phrasing maps to method_mismatch', () => {
      expect(recommendationKey(
        'Align frontend request methods with backend route definitions to resolve HTTP method mismatches.'
      )).toBe('method_mismatch');
    });

    test('boundary new phrasing maps to method_mismatch', () => {
      expect(recommendationKey(
        'Align frontend call methods with backend route definitions to resolve method mismatches.'
      )).toBe('method_mismatch');
    });
  });

});

// ── New action-oriented strings: deduplication behavior ──────────────────────

describe('deduplicateRecommendations — new action-oriented phrasings collapse correctly', () => {

  // New Group B strings
  const NEW_LINKAGE_B   = 'Review backend routes without frontend consumers and retire unused endpoints where appropriate.';
  const NEW_BOUNDARY_B  = 'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.';
  // New Group A strings
  const NEW_LINKAGE_A   = 'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.';
  const NEW_BOUNDARY_A  = 'Verify backend routes exist for unresolved frontend API calls, or remove dead calls.';
  const NEW_COMPLETE_A  = 'Verify that backend routes exist for all unresolved frontend API calls.';
  // New Group C strings
  const NEW_LINKAGE_C   = 'Align frontend request methods with backend route definitions to resolve HTTP method mismatches.';
  const NEW_BOUNDARY_C  = 'Align frontend call methods with backend route definitions to resolve method mismatches.';

  test('Group B: linkage-first order → collapses to linkage wording', () => {
    const result = deduplicateRecommendations([NEW_LINKAGE_B, NEW_BOUNDARY_B]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_B);
  });

  test('Group B: boundary-first order (stale cache) → preferred upgrade keeps linkage wording', () => {
    const result = deduplicateRecommendations([NEW_BOUNDARY_B, NEW_LINKAGE_B]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_B);
  });

  test('Group B: boundary-first → boundary wording absent after dedup', () => {
    const result = deduplicateRecommendations([NEW_BOUNDARY_B, NEW_LINKAGE_B]);
    expect(result).not.toContain(NEW_BOUNDARY_B);
  });

  test('Group A: linkage-first order → collapses to linkage wording', () => {
    const result = deduplicateRecommendations([NEW_LINKAGE_A, NEW_BOUNDARY_A, NEW_COMPLETE_A]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_A);
  });

  test('Group A: completeness-first order → preferred upgrade keeps linkage wording', () => {
    const result = deduplicateRecommendations([NEW_COMPLETE_A, NEW_BOUNDARY_A, NEW_LINKAGE_A]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_A);
  });

  test('Group C: linkage-first order → collapses to linkage wording', () => {
    const result = deduplicateRecommendations([NEW_LINKAGE_C, NEW_BOUNDARY_C]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_C);
  });

  test('Group C: boundary-first order (stale cache) → preferred upgrade keeps linkage wording', () => {
    const result = deduplicateRecommendations([NEW_BOUNDARY_C, NEW_LINKAGE_C]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(NEW_LINKAGE_C);
  });

  test('all three new-phrasing group winners survive when combined', () => {
    const result = deduplicateRecommendations([NEW_LINKAGE_A, NEW_LINKAGE_B, NEW_LINKAGE_C]);
    expect(result).toHaveLength(3);
    expect(result).toContain(NEW_LINKAGE_A);
    expect(result).toContain(NEW_LINKAGE_B);
    expect(result).toContain(NEW_LINKAGE_C);
  });

  test('non-overlapping new-phrasing recs survive alongside deduped group recs', () => {
    const unrelated1 = 'Delegate business logic to service modules in route files that lack service layer imports.';
    const unrelated2 = 'Replace scaffold and placeholder implementations with production-ready logic.';
    const result = deduplicateRecommendations([NEW_LINKAGE_B, unrelated1, unrelated2]);
    expect(result).toHaveLength(3);
    expect(result).toContain(NEW_LINKAGE_B);
    expect(result).toContain(unrelated1);
    expect(result).toContain(unrelated2);
  });

});

// ── Action language and non-repetition of finding text ───────────────────────

describe('recommendation phrasing: action-oriented, no repeated finding text', () => {
  // These are all current generator output strings for the three cross-source groups.
  const NEW_STRINGS = [
    // Group A
    'Verify corresponding backend routes exist for unresolved frontend API calls, or remove obsolete calls.',
    'Verify backend routes exist for unresolved frontend API calls, or remove dead calls.',
    'Verify that backend routes exist for all unresolved frontend API calls.',
    // Group B
    'Review backend routes without frontend consumers and retire unused endpoints where appropriate.',
    'Audit backend routes without frontend consumers and retire unused or internal-only endpoints.',
    // Group C
    'Align frontend request methods with backend route definitions to resolve HTTP method mismatches.',
    'Align frontend call methods with backend route definitions to resolve method mismatches.',
    // Other completeness recs
    'Delegate business logic to service modules in route files that lack service layer imports.',
    'Replace scaffold and placeholder implementations with production-ready logic.',
    'Add unit tests to routes and services to verify behavior before shipping.',
    'Review and resolve architecture boundary violations to strengthen layering.',
    // Other linkage recs
    'Document the API contract and align frontend calls with backend routes to improve full-stack linkage.',
    'Audit unresolved API calls and orphaned routes to improve full-stack visibility.',
    // Other boundary recs
    'Fix import direction violations to respect layer boundaries.',
    'Break high-severity circular dependencies in route, service, and model layers to prevent hidden coupling.',
    'Extract shared utilities to break circular import cycles.',
    'Introduce a service layer to eliminate direct model imports from route handlers.',
    'Review and resolve architecture boundary violations to strengthen layering.',
  ];

  test('all new recommendation strings start with an action verb (capital letter, not a digit)', () => {
    NEW_STRINGS.forEach(function(rec) {
      // Must not begin with a digit (count-prefix indicates repeated finding text)
      expect(rec).not.toMatch(/^\d/);
      // Must begin with a capital letter (action verb)
      expect(rec).toMatch(/^[A-Z]/);
    });
  });

  test('no new recommendation string begins with a count followed by a noun phrase', () => {
    // Pattern that characterised old finding-repetition strings, e.g. "19 frontend API calls have..."
    const diagnosisPrefix = /^\d+\s+\w+.*\s(have|has|is|are|was|were|detected|found)\b/i;
    NEW_STRINGS.forEach(function(rec) {
      expect(rec).not.toMatch(diagnosisPrefix);
    });
  });

  test('no new recommendation string contains "— " (em-dash separator used in old diagnosis style)', () => {
    // Old format: "N things detected — do something." New format starts with the action directly.
    NEW_STRINGS.forEach(function(rec) {
      expect(rec).not.toContain('— ');
    });
  });

  test('Group A recs do not begin with repeated finding text about counts of unresolved calls', () => {
    const groupARecs = NEW_STRINGS.filter(function(r) {
      return /unresolved frontend api call/i.test(r);
    });
    groupARecs.forEach(function(rec) {
      // Should not start with "N unresolved..." or "N frontend API calls have..."
      expect(rec).not.toMatch(/^\d+\s+(unresolved|frontend)/i);
    });
  });

  test('Group B recs do not begin with repeated finding text about counts of orphaned routes', () => {
    const groupBRecs = NEW_STRINGS.filter(function(r) {
      return /without frontend consumer/i.test(r);
    });
    groupBRecs.forEach(function(rec) {
      // Should not start with "N backend routes have no..."
      expect(rec).not.toMatch(/^\d+\s+backend route/i);
    });
  });

  test('Group C recs do not begin with repeated finding text about counts of mismatches', () => {
    const groupCRecs = NEW_STRINGS.filter(function(r) {
      return /method mismatch/i.test(r);
    });
    groupCRecs.forEach(function(rec) {
      // Should not start with "N method mismatches detected..."
      expect(rec).not.toMatch(/^\d+\s+(method|http)/i);
    });
  });

});
