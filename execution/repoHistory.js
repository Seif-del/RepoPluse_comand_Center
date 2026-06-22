const fs = require('fs');
const { REPO_HISTORY_FILE } = require('../config/paths');

let repoHistory = [];

if (fs.existsSync(REPO_HISTORY_FILE)) {
  try {
    const raw = fs.readFileSync(REPO_HISTORY_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      repoHistory = parsed;
    }
  } catch (_) {
    // empty, corrupt, or invalid JSON — start fresh
  }
}

module.exports = repoHistory;
