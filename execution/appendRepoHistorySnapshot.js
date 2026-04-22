const fs = require('fs');
const { REPO_HISTORY_FILE } = require('../config/paths');
const repoHistory = require('./repoHistory');
const projects = require('./projects');

function appendRepoHistorySnapshot() {
  const now = new Date().toISOString();
  const entries = projects.map(({ id, name, status }) => ({
    id,
    name,
    status,
    lastUpdated: now,
  }));
  entries.forEach(entry => repoHistory.push(entry));
  fs.writeFileSync(REPO_HISTORY_FILE, JSON.stringify(repoHistory, null, 2), 'utf8');
  return entries;
}

module.exports = appendRepoHistorySnapshot;
