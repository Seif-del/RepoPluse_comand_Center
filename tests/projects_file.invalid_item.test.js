/**
 * Validates that setting PROJECTS_FILE to a file containing a valid JSON array
 * with at least one item missing the required "status" field causes
 * execution/projects.js to throw a clear, actionable error at load time.
 *
 * This test is intentionally written BEFORE the guard is implemented.
 * It should fail on the current code and pass once the guard is added.
 *
 * MUST run in its own Jest module registry (default behaviour) so that
 * process.env.PROJECTS_FILE is set before execution/projects.js is required.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const INVALID_ITEM_FILE = path.join(os.tmpdir(), 'repopulse-projects.invalid-item.json');

// Valid JSON array — top-level shape is correct — but first item has no status field.
fs.writeFileSync(INVALID_ITEM_FILE, JSON.stringify([{}]), 'utf8');

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = INVALID_ITEM_FILE;

describe('PROJECTS_FILE misconfiguration — array item missing required "status" field', () => {
  afterAll(() => {
    if (fs.existsSync(INVALID_ITEM_FILE)) fs.unlinkSync(INVALID_ITEM_FILE);
  });

  it('throws an error mentioning PROJECTS_FILE', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured file path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(INVALID_ITEM_FILE);
  });

  it('error message includes the item index', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/index 0/i);
  });

  it('error message states the missing required field is "status"', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/missing required field "status"/i);
  });
});
