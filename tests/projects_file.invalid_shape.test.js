/**
 * Validates that setting PROJECTS_FILE to a file containing valid JSON
 * with a non-array top-level value causes execution/projects.js to throw
 * a clear, actionable error at load time.
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

const WRONG_SHAPE_FILE = path.join(os.tmpdir(), 'repopulse-projects.wrong-shape.json');

// Write valid JSON whose top-level value is an object, not an array.
fs.writeFileSync(WRONG_SHAPE_FILE, JSON.stringify({ projects: [] }), 'utf8');

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = WRONG_SHAPE_FILE;

describe('PROJECTS_FILE misconfiguration — valid JSON but wrong shape', () => {
  afterAll(() => {
    if (fs.existsSync(WRONG_SHAPE_FILE)) fs.unlinkSync(WRONG_SHAPE_FILE);
  });

  it('throws an error mentioning PROJECTS_FILE', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured file path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(WRONG_SHAPE_FILE);
  });

  it('error message states the value must be an array', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/must be an array/i);
  });
});
