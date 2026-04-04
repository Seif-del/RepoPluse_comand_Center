/**
 * Validates that setting PROJECTS_FILE to a file containing an item with a
 * present but unrecognised status value causes execution/projects.js to throw
 * a distinct, actionable error that differs from the missing-field case.
 *
 * This test is intentionally written BEFORE the guard is updated.
 * It should fail on the current code and pass once the guard produces a
 * distinct message for invalid (vs. missing) status values.
 *
 * MUST run in its own Jest module registry (default behaviour) so that
 * process.env.PROJECTS_FILE is set before execution/projects.js is required.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const INVALID_STATUS_FILE = path.join(os.tmpdir(), 'repopulse-projects.invalid-status.json');

// Valid JSON array, valid item shape — but status is not an allowed value.
fs.writeFileSync(
  INVALID_STATUS_FILE,
  JSON.stringify([{ id: 1, name: 'Alpha', status: 'Unknown' }]),
  'utf8'
);

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = INVALID_STATUS_FILE;

describe('PROJECTS_FILE misconfiguration — item with unrecognised status value', () => {
  afterAll(() => {
    if (fs.existsSync(INVALID_STATUS_FILE)) fs.unlinkSync(INVALID_STATUS_FILE);
  });

  it('throws an error mentioning PROJECTS_FILE', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured file path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(INVALID_STATUS_FILE);
  });

  it('error message includes the item index', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/index 0/i);
  });

  it('error message includes the phrase "invalid status"', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/invalid status/i);
  });

  it('error message names "Healthy" as an allowed value', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/Healthy/);
  });

  it('error message names "At Risk" as an allowed value', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/At Risk/);
  });
});
