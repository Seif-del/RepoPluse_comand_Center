'use strict';

// Mock pg with an explicit factory so Pool is a jest.fn() with no auto-mock noise.
jest.mock('pg', () => ({ Pool: jest.fn() }));

const { Pool } = require('pg');
const config   = require('../../../config');

// Wire up the mock Pool return value BEFORE db.js is required, because db.js
// creates the pool at module load time.
const mockPool = {
  query: jest.fn(),
  end:   jest.fn(),
  on:    jest.fn(),
};
Pool.mockImplementation(() => mockPool);

const db = require('../../../execution/db');

// ── Pool construction ─────────────────────────────────────────────────────────

describe('db — Pool construction', () => {
  it('creates exactly one Pool instance on import', () => {
    expect(Pool).toHaveBeenCalledTimes(1);
  });

  it('passes connectionString from config.databaseUrl', () => {
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: config.databaseUrl })
    );
  });

  it('sets max to 10', () => {
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ max: 10 })
    );
  });

  it('sets idleTimeoutMillis to 30 000', () => {
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ idleTimeoutMillis: 30_000 })
    );
  });

  it('sets connectionTimeoutMillis to 5 000', () => {
    expect(Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionTimeoutMillis: 5_000 })
    );
  });
});

// ── Exported pool interface ───────────────────────────────────────────────────

describe('db — exported pool interface', () => {
  it('exports the Pool instance returned by the constructor', () => {
    expect(db).toBe(mockPool);
  });

  it('exports an object with a query method', () => {
    expect(typeof db.query).toBe('function');
  });

  it('exports an object with an end method', () => {
    expect(typeof db.end).toBe('function');
  });

  it('exports an object with an on method', () => {
    expect(typeof db.on).toBe('function');
  });
});

// ── Error handler registration ────────────────────────────────────────────────

describe('db — error handler registration', () => {
  it('registers an error event handler on the pool', () => {
    expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('registers exactly one error event handler', () => {
    const errorCalls = mockPool.on.mock.calls.filter((c) => c[0] === 'error');
    expect(errorCalls).toHaveLength(1);
  });
});
