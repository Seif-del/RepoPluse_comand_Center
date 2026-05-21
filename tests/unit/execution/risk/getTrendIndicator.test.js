'use strict';

const { getTrendIndicator } = require('../../../../execution/risk/getTrendIndicator');

describe('getTrendIndicator', () => {
  // ── direction: 'worsening' ────────────────────────────────────────────────

  test('returns worsening when delta is exactly 10', () => {
    const result = getTrendIndicator({ currentScore: 70, previousScore: 60 });
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(10);
    expect(result.label).toBe('Risk increasing');
  });

  test('returns worsening when delta is greater than 10', () => {
    const result = getTrendIndicator({ currentScore: 85, previousScore: 50 });
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(35);
    expect(result.label).toBe('Risk increasing');
  });

  test('returns worsening when delta is 11', () => {
    const result = getTrendIndicator({ currentScore: 61, previousScore: 50 });
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(11);
  });

  // ── direction: 'improving' ────────────────────────────────────────────────

  test('returns improving when delta is exactly -10', () => {
    const result = getTrendIndicator({ currentScore: 40, previousScore: 50 });
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-10);
    expect(result.label).toBe('Risk improving');
  });

  test('returns improving when delta is less than -10', () => {
    const result = getTrendIndicator({ currentScore: 20, previousScore: 60 });
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-40);
    expect(result.label).toBe('Risk improving');
  });

  test('returns improving when delta is -11', () => {
    const result = getTrendIndicator({ currentScore: 39, previousScore: 50 });
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-11);
  });

  // ── direction: 'stable' ───────────────────────────────────────────────────

  test('returns stable when delta is 0', () => {
    const result = getTrendIndicator({ currentScore: 50, previousScore: 50 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(0);
    expect(result.label).toBe('Operationally stable');
  });

  test('returns stable when delta is +9 (below worsening threshold)', () => {
    const result = getTrendIndicator({ currentScore: 59, previousScore: 50 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(9);
  });

  test('returns stable when delta is -9 (above improving threshold)', () => {
    const result = getTrendIndicator({ currentScore: 41, previousScore: 50 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(-9);
  });

  test('returns stable when delta is +1', () => {
    const result = getTrendIndicator({ currentScore: 51, previousScore: 50 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(1);
  });

  test('returns stable when delta is -1', () => {
    const result = getTrendIndicator({ currentScore: 49, previousScore: 50 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(-1);
  });

  // ── direction: 'unknown' (missing data) ──────────────────────────────────

  test('returns unknown when currentScore is null', () => {
    const result = getTrendIndicator({ currentScore: null, previousScore: 50 });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
    expect(result.label).toBe('Insufficient history');
  });

  test('returns unknown when previousScore is null', () => {
    const result = getTrendIndicator({ currentScore: 50, previousScore: null });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
    expect(result.label).toBe('Insufficient history');
  });

  test('returns unknown when both scores are null', () => {
    const result = getTrendIndicator({ currentScore: null, previousScore: null });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  test('returns unknown when currentScore is undefined', () => {
    const result = getTrendIndicator({ currentScore: undefined, previousScore: 50 });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  test('returns unknown when previousScore is undefined', () => {
    const result = getTrendIndicator({ currentScore: 50, previousScore: undefined });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  test('returns unknown when called with no arguments', () => {
    const result = getTrendIndicator();
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  test('returns unknown when called with empty object', () => {
    const result = getTrendIndicator({});
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  // ── numeric coercion ──────────────────────────────────────────────────────

  test('accepts numeric strings', () => {
    const result = getTrendIndicator({ currentScore: '80', previousScore: '50' });
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(30);
  });

  test('handles score of 0 as a valid value', () => {
    const result = getTrendIndicator({ currentScore: 0, previousScore: 50 });
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-50);
  });

  test('returns unknown for NaN input', () => {
    const result = getTrendIndicator({ currentScore: NaN, previousScore: 50 });
    expect(result.direction).toBe('unknown');
    expect(result.delta).toBeNull();
  });

  // ── return shape ──────────────────────────────────────────────────────────

  test('result always contains direction, delta, and label keys', () => {
    const result = getTrendIndicator({ currentScore: 50, previousScore: 40 });
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('delta');
    expect(result).toHaveProperty('label');
  });

  test('unknown result always contains direction, delta, and label keys', () => {
    const result = getTrendIndicator({ currentScore: null, previousScore: null });
    expect(result).toHaveProperty('direction');
    expect(result).toHaveProperty('delta');
    expect(result).toHaveProperty('label');
  });

  // ── boundary conditions ───────────────────────────────────────────────────

  test('returns stable when current and previous are both 100', () => {
    const result = getTrendIndicator({ currentScore: 100, previousScore: 100 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(0);
  });

  test('returns stable when current and previous are both 0', () => {
    const result = getTrendIndicator({ currentScore: 0, previousScore: 0 });
    expect(result.direction).toBe('stable');
    expect(result.delta).toBe(0);
  });

  test('returns worsening for max possible delta (0 to 100)', () => {
    const result = getTrendIndicator({ currentScore: 100, previousScore: 0 });
    expect(result.direction).toBe('worsening');
    expect(result.delta).toBe(100);
  });

  test('returns improving for min possible delta (100 to 0)', () => {
    const result = getTrendIndicator({ currentScore: 0, previousScore: 100 });
    expect(result.direction).toBe('improving');
    expect(result.delta).toBe(-100);
  });
});
