const path = require('path');
const os = require('os');

const HISTORY_FILE = process.env.HISTORY_FILE || (
  process.env.NODE_ENV === 'test'
    ? path.join(os.tmpdir(), 'repopulse-summaryHistory.test.json')
    : path.join(__dirname, '../execution/summaryHistory.json')
);

const PORT = parseInt(process.env.PORT, 10) || 3000;

// When set, projects are loaded from this JSON file instead of the embedded seed.
const PROJECTS_FILE = process.env.PROJECTS_FILE || null;

const SNAPSHOT_INTERVAL_MS = parseInt(process.env.SNAPSHOT_INTERVAL_MS, 10) || 3600000;

// Controls which data source projects.js loads from: "file" (default) or "github".
const PROJECT_SOURCE = process.env.PROJECT_SOURCE || 'file';

module.exports = { HISTORY_FILE, PORT, PROJECTS_FILE, SNAPSHOT_INTERVAL_MS, PROJECT_SOURCE };
