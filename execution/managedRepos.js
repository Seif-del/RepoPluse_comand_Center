'use strict';
const fs = require('fs');
const { MANAGED_REPOS_FILE } = require('../config/paths');

// Matches https://github.com/owner/repo with optional .git suffix and trailing slash.
// owner/repo segments allow letters, digits, hyphens, underscores, and dots.
const GITHUB_URL_RE = /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(\.git)?\/?$/;

function parseGitHubUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.trim().match(GITHUB_URL_RE);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

function loadManagedRepos() {
  if (!MANAGED_REPOS_FILE || !fs.existsSync(MANAGED_REPOS_FILE)) return [];
  try {
    const raw = fs.readFileSync(MANAGED_REPOS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function saveManagedRepos(repos) {
  fs.writeFileSync(MANAGED_REPOS_FILE, JSON.stringify(repos, null, 2), 'utf8');
}

function registerRepo(url) {
  const trimmed = typeof url === 'string' ? url.trim() : '';
  if (!trimmed) {
    return { ok: false, error: 'URL is required.' };
  }
  const parsed = parseGitHubUrl(trimmed);
  if (!parsed) {
    return { ok: false, error: 'Invalid GitHub repository URL. Expected: https://github.com/owner/repo' };
  }
  const { owner, repo } = parsed;
  const fullName = `${owner}/${repo}`;
  const repos = loadManagedRepos();
  const duplicate = repos.some(r => r.fullName.toLowerCase() === fullName.toLowerCase());
  if (duplicate) {
    return { ok: false, error: `Repository "${fullName}" is already registered.` };
  }
  const entry = {
    id: Date.now(),
    url: trimmed,
    owner,
    repo,
    fullName,
    registeredAt: new Date().toISOString(),
  };
  repos.push(entry);
  saveManagedRepos(repos);
  return { ok: true, repo: entry };
}

module.exports = { parseGitHubUrl, loadManagedRepos, saveManagedRepos, registerRepo };
