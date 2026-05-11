'use strict';

/**
 * Parses and validates a GitHub repository URL.
 *
 * Accepts only https://github.com/owner/repo URLs.
 * Extra path segments beyond owner/repo are ignored.
 *
 * @param {string} raw - URL string to parse
 * @returns {{ owner: string, repo: string, fullName: string }}
 * @throws {Error} code VALIDATION_ERROR — missing, unparseable, non-GitHub, or missing owner/repo
 */
function parseGithubUrl(raw) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    const err = new Error('url is required');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch (_) {
    const err = new Error('Invalid URL');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  if (parsed.hostname !== 'github.com') {
    const err = new Error('Invalid GitHub URL: host must be github.com');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const parts = parsed.pathname
    .replace(/^\//, '')
    .replace(/\/$/, '')
    .split('/')
    .filter(Boolean);

  if (parts.length < 2) {
    const err = new Error('Invalid GitHub URL: must include owner and repo');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  const owner = parts[0];
  let   repo  = parts[1];

  // Normalize clone-style URLs: strip trailing .git from the repo segment only.
  // "owner/repo.git" → "owner/repo". Owner is never modified.
  if (repo.endsWith('.git')) {
    repo = repo.slice(0, -4);
  }

  if (repo.length === 0) {
    const err = new Error('Invalid GitHub URL: repo name is empty after normalisation');
    err.code = 'VALIDATION_ERROR';
    throw err;
  }

  return { owner, repo, fullName: `${owner}/${repo}` };
}

module.exports = { parseGithubUrl };
