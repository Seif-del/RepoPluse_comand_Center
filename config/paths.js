const path = require('path');
const os = require('os');

const HISTORY_FILE = process.env.HISTORY_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'repopulse-summaryHistory.test.json')
    : path.join(__dirname, '../execution/summaryHistory.json')
);

const REPO_HISTORY_FILE = process.env.REPO_HISTORY_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'repopulse-repoHistory.test.json')
    : path.join(__dirname, '../execution/repoHistory.json')
);

const PORT = parseInt(process.env.PORT, 10) || 3000;

// When set, projects are loaded from this JSON file instead of the embedded seed.
const PROJECTS_FILE = process.env.PROJECTS_FILE || null;

const SNAPSHOT_INTERVAL_MS = parseInt(process.env.SNAPSHOT_INTERVAL_MS, 10) || 3600000;

const STALE_DAYS = parseInt(process.env.STALE_DAYS, 10) || 90;

const INACTIVE_DAYS = parseInt(process.env.INACTIVE_DAYS, 10) || 30;

const ISSUE_THRESHOLD = parseInt(process.env.ISSUE_THRESHOLD, 10) || 20;

// Controls which data source projects.js loads from: "file" (default) or "github".
const PROJECT_SOURCE = process.env.PROJECT_SOURCE || 'file';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_ORG   = process.env.GITHUB_ORG   || '';

module.exports = { HISTORY_FILE, REPO_HISTORY_FILE, PORT, PROJECTS_FILE, SNAPSHOT_INTERVAL_MS, STALE_DAYS, INACTIVE_DAYS, ISSUE_THRESHOLD, PROJECT_SOURCE, GITHUB_TOKEN, GITHUB_ORG };
