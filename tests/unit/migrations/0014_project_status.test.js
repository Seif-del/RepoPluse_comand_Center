'use strict';

const migration = require('../../../migrations/0014_add_project_status_to_repositories');

// ─── Module structure ──────────────────────────────────────────────────────────

describe('0014_add_project_status_to_repositories — module structure', () => {
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

describe('0014_add_project_status_to_repositories — up migration', () => {
  let pgm;
  let addColumnArgs;

  beforeEach(() => {
    addColumnArgs = null;
    pgm = {
      addColumn: jest.fn((table, columns) => { addColumnArgs = { table, columns }; }),
    };
    migration.up(pgm);
  });

  it('calls addColumn exactly once', () => {
    expect(pgm.addColumn).toHaveBeenCalledTimes(1);
  });

  it('targets the repositories table', () => {
    expect(addColumnArgs.table).toBe('repositories');
  });

  it('project_status is notNull', () => {
    expect(addColumnArgs.columns.project_status.notNull).toBe(true);
  });

  it('project_status default is exactly active (no surrounding quotes)', () => {
    expect(addColumnArgs.columns.project_status.default).toBe('active');
  });

  it('project_status default does not contain literal quote characters', () => {
    const def = addColumnArgs.columns.project_status.default;
    expect(def).not.toContain("'");
  });

  it('project_status check constraint contains all four allowed values', () => {
    const check = addColumnArgs.columns.project_status.check;
    ['active', 'inactive', 'archived', 'unknown'].forEach(v => {
      expect(check).toContain(v);
    });
  });
});

// ─── down migration ────────────────────────────────────────────────────────────

describe('0014_add_project_status_to_repositories — down migration', () => {
  it('drops the project_status column from repositories', () => {
    const pgm = { dropColumn: jest.fn() };
    migration.down(pgm);
    expect(pgm.dropColumn).toHaveBeenCalledWith('repositories', 'project_status');
  });
});
