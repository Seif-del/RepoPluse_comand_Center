/**
 * Validates that setting PROJECTS_FILE to a nonexistent path causes
 * execution/projects.js to throw a clear, actionable error at load time.
 *
 * This test is intentionally written BEFORE the guard is implemented.
 * It should fail on the current code and pass once the guard is added.
 *
 * MUST run in its own Jest module registry (default behaviour) so that
 * process.env.PROJECTS_FILE is set before execution/projects.js is required.
 */

const FAKE_PATH = '/nonexistent/path/to/projects.json';

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = FAKE_PATH;

describe('PROJECTS_FILE misconfiguration — nonexistent file path', () => {
  it('throws an error stating PROJECTS_FILE is set, the configured path, and that the file does not exist', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/PROJECTS_FILE/);
  });

  it('error message includes the configured path', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(FAKE_PATH);
  });

  it('error message states the file does not exist', () => {
    expect(() => {
      require('../execution/projects');
    }).toThrow(/does not exist/);
  });
});
