const path = require('path');
const os = require('os');

const PORT = parseInt(process.env.PORT, 10) || 3000;

// Controls which data source projects.js loads from: "file" (default) or "github".
// Declared before PROJECTS_FILE so the github-mode default can reference it.
const PROJECT_SOURCE = process.env.PROJECT_SOURCE || 'file';

// When set, projects are loaded from this JSON file instead of the embedded seed.
// In github mode a sensible default is provided so syncGithubProjects works without
// requiring PROJECTS_FILE to be explicitly set.
const PROJECTS_FILE = process.env.PROJECTS_FILE || (
  PROJECT_SOURCE === 'github'
    ? path.join(__dirname, '../execution/projects.json')
    : null
);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_ORG   = process.env.GITHUB_ORG   || '';

// Short key that identifies the active project source configuration.
// Used to namespace history files so switching sources (file → github,
// or changing GITHUB_ORG) never mixes snapshots from incompatible datasets.
const _sourceKey = PROJECT_SOURCE === 'github'
  ? 'github-' + (GITHUB_ORG ? GITHUB_ORG.toLowerCase().replace(/[^a-z0-9]+/g, '_') : 'mock')
  : 'file';

const HISTORY_FILE = process.env.HISTORY_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'repopulse-summaryHistory.test.json')
    : path.join(__dirname, `../execution/summaryHistory-${_sourceKey}.json`)
);

const REPO_HISTORY_FILE = process.env.REPO_HISTORY_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'repopulse-repoHistory.test.json')
    : path.join(__dirname, `../execution/repoHistory-${_sourceKey}.json`)
);

const SNAPSHOT_INTERVAL_MS = parseInt(process.env.SNAPSHOT_INTERVAL_MS, 10) || 3600000;

// --- Proactive alerting ---
const ENABLE_PROACTIVE_ALERTS = process.env.ENABLE_PROACTIVE_ALERTS === 'true';
const SLACK_WEBHOOK_URL  = process.env.SLACK_WEBHOOK_URL  || '';
const ALERT_EMAIL_TO     = process.env.ALERT_EMAIL_TO     || '';
const ALERT_EMAIL_FROM   = process.env.ALERT_EMAIL_FROM   || '';
const SMTP_HOST          = process.env.SMTP_HOST          || '';
const SMTP_PORT          = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER          = process.env.SMTP_USER          || '';
const SMTP_PASS          = process.env.SMTP_PASS          || '';

const STALE_DAYS = parseInt(process.env.STALE_DAYS, 10) || 90;

const INACTIVE_DAYS = parseInt(process.env.INACTIVE_DAYS, 10) || 30;

const ISSUE_THRESHOLD = parseInt(process.env.ISSUE_THRESHOLD, 10) || 20;

module.exports = {
  HISTORY_FILE, REPO_HISTORY_FILE, PORT, PROJECTS_FILE,
  SNAPSHOT_INTERVAL_MS, STALE_DAYS, INACTIVE_DAYS, ISSUE_THRESHOLD,
  PROJECT_SOURCE, GITHUB_TOKEN, GITHUB_ORG,
  ENABLE_PROACTIVE_ALERTS, SLACK_WEBHOOK_URL,
  ALERT_EMAIL_TO, ALERT_EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS,
};
