/**
 * Validates that setting PROJECTS_FILE to a file containing a valid JSON array
 * with at least one non-object item (e.g. null, a number, a string, a nested
 * array) causes execution/projects.js to throw a clear, actionable error at
 * load time — before any business logic can receive a malformed value.
 *
 * Non-object items must be rejected at the loader boundary because downstream
 * code assumes each item is an object with a `status` field. Allowing them
 * through produces generic TypeErrors with no reference to the file or index.
 *
 * MUST run in its own Jest module registry (default behaviour) so that
 * process.env.PROJECTS_FILE is set before execution/projects.js is required.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const NON_OBJECT_ITEM_FILE = path.join(os.tmpdir(), 'repopulse-projects.non-object-item.json');

// Valid JSON array — top-level shape is correct — but the single item is null,
// which is not an object and cannot carry a status field.
fs.writeFileSync(NON_OBJECT_ITEM_FILE, JSON.stringify([null]), 'utf8');

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = NON_OBJECT_ITEM_FILE;

describe('PROJECTS_FILE misconfiguration — array item is not an object (e.g. null)', () => {
  afterAll(() => {
    if (fs.existsSync(NON_OBJECT_ITEM_FILE)) fs.unlinkSync(NON_OBJECT_ITEM_FILE);
  });

  it('throws an error mentioning PROJECTS_FILE', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured file path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(NON_OBJECT_ITEM_FILE);
  });

  it('error message includes the item index', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/index 0/i);
  });

  it('error message references the missing or invalid status field', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/missing required field "status"/i);
  });
});
