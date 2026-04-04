/**
 * Validates that setting PROJECTS_FILE to a file containing invalid JSON
 * causes execution/projects.js to throw a clear, actionable error at load time.
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

const INVALID_JSON_FILE = path.join(os.tmpdir(), 'repopulse-projects.invalid.json');

// Write invalid JSON to the temp file before setting the env var.
fs.writeFileSync(INVALID_JSON_FILE, '{ invalid json }', 'utf8');

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = INVALID_JSON_FILE;

describe('PROJECTS_FILE misconfiguration — invalid JSON content', () => {
  afterAll(() => {
    if (fs.existsSync(INVALID_JSON_FILE)) fs.unlinkSync(INVALID_JSON_FILE);
  });

  it('throws an error mentioning PROJECTS_FILE', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured file path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(INVALID_JSON_FILE);
  });

  it('error message states the content is invalid JSON', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/invalid JSON/i);
  });
});
