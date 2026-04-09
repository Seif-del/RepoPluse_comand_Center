const fs = require('fs');
const fetchGithubProjects = require('./fetchGithubProjects');
const { PROJECTS_FILE } = require('../config/paths');

/**
 * Fetches projects from GitHub and writes them to PROJECTS_FILE as JSON.
 *
 * This is the async boundary between the GitHub fetch (async I/O) and
 * execution/projects.js (synchronous fs.readFileSync). By resolving the
 * async work here — before the server requires projects.js — all downstream
 * callers remain synchronous and require no contract changes.
 *
 * Call this at server startup or on a scheduled worker interval when
 * PROJECT_SOURCE === 'github', before requiring execution/projects.js.
 *
 * @returns {Promise<Array>} The fetched projects array, identical to what
 *                           was written to PROJECTS_FILE.
 * @throws {Error} If PROJECTS_FILE is not configured.
 */
async function syncGithubProjects() {
  if (!PROJECTS_FILE) {
    throw new Error(
      'syncGithubProjects: PROJECTS_FILE is not set. ' +
      'Configure the PROJECTS_FILE environment variable before calling this function.'
    );
  }

  const projects = await fetchGithubProjects();
  fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf8');
  return projects;
}

module.exports = syncGithubProjects;
