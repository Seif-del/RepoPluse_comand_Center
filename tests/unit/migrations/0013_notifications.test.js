'use strict';

const migration = require('../../../migrations/0013_create_notifications');

// ─── Module structure ──────────────────────────────────────────────────────────

describe('0013_create_notifications — module structure', () => {
  it('exports.up is a function', () => {
    expect(typeof migration.up).toBe('function');
  });

  it('exports.down is a function', () => {
    expect(typeof migration.down).toBe('function');
  });

  it('exports.shorthands is undefined', () => {
    expect(migration.shorthands).toBeUndefined();
  });
});

// ─── up migration ──────────────────────────────────────────────────────────────

describe('0013_create_notifications — up migration', () => {
  let pgm;
  let createTableArgs;
  let sqlCalls;

  beforeEach(() => {
    createTableArgs = null;
    sqlCalls = [];
    pgm = {
      createTable: jest.fn((name, columns) => { createTableArgs = { name, columns }; }),
      sql:         jest.fn((s) => { sqlCalls.push(s.trim()); }),
      func:        jest.fn((f) => f),
    };
    migration.up(pgm);
  });

  it('creates a table named notifications', () => {
    expect(pgm.createTable).toHaveBeenCalledTimes(1);
    expect(createTableArgs.name).toBe('notifications');
  });

  it('user_id is notNull', () => {
    expect(createTableArgs.columns.user_id.notNull).toBe(true);
  });

  it('user_id references users(id)', () => {
    expect(createTableArgs.columns.user_id.references).toContain('"users"(id)');
  });

  it('user_id cascades on delete', () => {
    expect(createTableArgs.columns.user_id.onDelete).toMatch(/CASCADE/i);
  });

  it('status is notNull', () => {
    expect(createTableArgs.columns.status.notNull).toBe(true);
  });

  it('status defaults to CREATED', () => {
    expect(createTableArgs.columns.status.default).toContain('CREATED');
  });

  it('status check constraint contains all six lifecycle values', () => {
    const check = createTableArgs.columns.status.check;
    ['CREATED', 'QUEUED', 'SENT', 'FAILED', 'READ', 'EXPIRED'].forEach(v => {
      expect(check).toContain(v);
    });
  });

  it('priority is notNull', () => {
    expect(createTableArgs.columns.priority.notNull).toBe(true);
  });

  it('priority check constraint contains all four priority values', () => {
    const check = createTableArgs.columns.priority.check;
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].forEach(v => {
      expect(check).toContain(v);
    });
  });

  it('title is notNull varchar(255)', () => {
    expect(createTableArgs.columns.title.notNull).toBe(true);
    expect(createTableArgs.columns.title.type).toMatch(/varchar\(255\)/i);
  });

  it('body is notNull text', () => {
    expect(createTableArgs.columns.body.notNull).toBe(true);
    expect(createTableArgs.columns.body.type).toBe('text');
  });

  it('dedupe_key is nullable', () => {
    const col = createTableArgs.columns.dedupe_key;
    expect(col.notNull).toBeFalsy();
  });

  it('created_at is notNull timestamptz', () => {
    const col = createTableArgs.columns.created_at;
    expect(col.notNull).toBe(true);
    expect(col.type).toBe('timestamptz');
  });

  it('read_at is nullable', () => {
    expect(createTableArgs.columns.read_at.notNull).toBeFalsy();
  });

  it('expires_at is nullable', () => {
    expect(createTableArgs.columns.expires_at.notNull).toBeFalsy();
  });

  it('calls pgm.sql at least 4 times (3 indexes + 1 unique constraint)', () => {
    expect(sqlCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('creates the notifications_user_id_created_at_idx index', () => {
    expect(sqlCalls.some(s => s.includes('notifications_user_id_created_at_idx'))).toBe(true);
  });

  it('user_id + created_at index is descending on created_at', () => {
    const idx = sqlCalls.find(s => s.includes('notifications_user_id_created_at_idx'));
    expect(idx).toBeDefined();
    expect(idx).toMatch(/created_at\s+DESC/i);
  });

  it('creates the notifications_user_id_status_idx index', () => {
    expect(sqlCalls.some(s => s.includes('notifications_user_id_status_idx'))).toBe(true);
  });

  it('creates the notifications_user_dedupe_key_uidx partial unique constraint', () => {
    expect(sqlCalls.some(s => s.includes('notifications_user_dedupe_key_uidx'))).toBe(true);
  });

  it('partial unique constraint is UNIQUE INDEX', () => {
    const idx = sqlCalls.find(s => s.includes('notifications_user_dedupe_key_uidx'));
    expect(idx).toMatch(/UNIQUE\s+INDEX/i);
  });

  it('partial unique constraint covers user_id and dedupe_key', () => {
    const idx = sqlCalls.find(s => s.includes('notifications_user_dedupe_key_uidx'));
    expect(idx).toContain('user_id');
    expect(idx).toContain('dedupe_key');
  });

  it('partial unique constraint has WHERE dedupe_key IS NOT NULL', () => {
    const idx = sqlCalls.find(s => s.includes('notifications_user_dedupe_key_uidx'));
    expect(idx).toMatch(/WHERE\s+dedupe_key\s+IS\s+NOT\s+NULL/i);
  });
});

// ─── down migration ────────────────────────────────────────────────────────────

describe('0013_create_notifications — down migration', () => {
  it('drops the notifications table', () => {
    const pgm = { dropTable: jest.fn() };
    migration.down(pgm);
    expect(pgm.dropTable).toHaveBeenCalledTimes(1);
    expect(pgm.dropTable).toHaveBeenCalledWith('notifications');
  });
});
