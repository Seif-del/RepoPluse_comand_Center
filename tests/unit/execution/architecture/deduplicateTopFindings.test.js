'use strict';

const { deduplicateTopFindings } = require('../../../../execution/architecture/deduplicateTopFindings');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFinding(type, severity, summary) {
  return { type, severity, summary };
}

// ── UI regression: exact duplicate visible in production ─────────────────────

describe('deduplicateTopFindings — UI regression', () => {
  test('MEDIUM + HIGH same summary collapses to single HIGH entry', () => {
    // Reproduces the exact duplicate visible in the UI:
    //   MEDIUM  19 frontend API calls have no matching backend route.  (unresolved_frontend_calls, step 2)
    //   HIGH    19 frontend API calls have no matching backend route.  (unresolved_frontend_api,   step 4)
    const input = [
      makeFinding('unresolved_frontend_calls', 'medium', '19 frontend API calls have no matching backend route.'),
      makeFinding('unresolved_frontend_api',   'high',   '19 frontend API calls have no matching backend route.'),
    ];
    const result = deduplicateTopFindings(input);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
    expect(result[0].type).toBe('unresolved_frontend_api');
    expect(result[0].summary).toBe('19 frontend API calls have no matching backend route.');
  });

  test('MEDIUM + HIGH same summary: medium entry is removed', () => {
    const input = [
      makeFinding('unresolved_frontend_calls', 'medium', '19 frontend API calls have no matching backend route.'),
      makeFinding('unresolved_frontend_api',   'high',   '19 frontend API calls have no matching backend route.'),
    ];
    const result = deduplicateTopFindings(input);
    const mediumEntry = result.find(function(f) { return f.severity === 'medium'; });
    expect(mediumEntry).toBeUndefined();
  });

  test('singular count (1 call) deduplicates correctly', () => {
    const input = [
      makeFinding('unresolved_frontend_calls', 'medium', '1 frontend API call have no matching backend route.'),
      makeFinding('unresolved_frontend_api',   'high',   '1 frontend API call have no matching backend route.'),
    ];
    const result = deduplicateTopFindings(input);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });
});

// ── Core dedup logic ──────────────────────────────────────────────────────────

describe('deduplicateTopFindings — core logic', () => {
  test('highest severity wins when summaries match — high beats medium', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'medium', 'Same message.'),
      makeFinding('type_b', 'high',   'Same message.'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('highest severity wins — high beats low', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'low',  'Same message.'),
      makeFinding('type_b', 'high', 'Same message.'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('highest severity wins — medium beats low', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'low',    'Same message.'),
      makeFinding('type_b', 'medium', 'Same message.'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('medium');
  });

  test('distinct messages both survive', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'high',   'Message one.'),
      makeFinding('type_b', 'medium', 'Message two.'),
    ]);
    expect(result).toHaveLength(2);
  });

  test('three distinct messages all survive', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'high',   'Alpha.'),
      makeFinding('type_b', 'medium', 'Beta.'),
      makeFinding('type_c', 'low',    'Gamma.'),
    ]);
    expect(result).toHaveLength(3);
  });

  test('three entries — two share summary, one is distinct — dedupes to two', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'medium', 'Shared message.'),
      makeFinding('type_b', 'high',   'Shared message.'),
      makeFinding('type_c', 'low',    'Unique message.'),
    ]);
    expect(result).toHaveLength(2);
    const shared = result.find(function(f) { return f.summary === 'Shared message.'; });
    expect(shared.severity).toBe('high');
  });

  test('normalization: case-insensitive — uppercase and lowercase match', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'medium', 'Frontend calls missing.'),
      makeFinding('type_b', 'high',   'FRONTEND CALLS MISSING.'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('normalization: leading/trailing whitespace stripped', () => {
    const result = deduplicateTopFindings([
      makeFinding('type_a', 'medium', '  Same message.  '),
      makeFinding('type_b', 'high',   'Same message.'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('equal severity: first occurrence wins', () => {
    const first  = makeFinding('type_a', 'high', 'Same message.');
    const second = makeFinding('type_b', 'high', 'Same message.');
    const result = deduplicateTopFindings([first, second]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(first);
  });

  test('no duplicates in input: all entries survive unchanged', () => {
    const input = [
      makeFinding('type_a', 'high',   'Alpha.'),
      makeFinding('type_b', 'medium', 'Beta.'),
      makeFinding('type_c', 'low',    'Gamma.'),
      makeFinding('type_d', 'high',   'Delta.'),
    ];
    const result = deduplicateTopFindings(input);
    expect(result).toHaveLength(4);
  });
});

// ── Edge cases ────────────────────────────────────────────────────────────────

describe('deduplicateTopFindings — edge cases', () => {
  test('empty array returns empty array', () => {
    expect(deduplicateTopFindings([])).toEqual([]);
  });

  test('single-entry array returns copy with same content', () => {
    const input = [makeFinding('type_a', 'high', 'Only one.')];
    const result = deduplicateTopFindings(input);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(input[0]);
  });

  test('null input returns empty array', () => {
    expect(deduplicateTopFindings(null)).toEqual([]);
  });

  test('undefined input returns empty array', () => {
    expect(deduplicateTopFindings(undefined)).toEqual([]);
  });

  test('non-array input returns empty array', () => {
    expect(deduplicateTopFindings('not an array')).toEqual([]);
  });

  test('entry with null summary does not throw', () => {
    const result = deduplicateTopFindings([
      { type: 'type_a', severity: 'high',   summary: null },
      { type: 'type_b', severity: 'medium', summary: null },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('entry with undefined summary does not throw', () => {
    const result = deduplicateTopFindings([
      { type: 'type_a', severity: 'high',   summary: undefined },
      { type: 'type_b', severity: 'medium', summary: undefined },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('high');
  });

  test('does not mutate the input array', () => {
    const input = [
      makeFinding('type_a', 'medium', 'Same.'),
      makeFinding('type_b', 'high',   'Same.'),
    ];
    const origLen = input.length;
    deduplicateTopFindings(input);
    expect(input.length).toBe(origLen);
  });

  test('does not mutate the input objects', () => {
    const f = makeFinding('type_a', 'medium', 'Original.');
    const origSeverity = f.severity;
    deduplicateTopFindings([f]);
    expect(f.severity).toBe(origSeverity);
  });
});
