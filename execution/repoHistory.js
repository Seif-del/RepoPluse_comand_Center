const fs = require('fs');
const { REPO_HISTORY_FILE } = require('../config/paths');

let repoHistory;

if (fs.existsSync(REPO_HISTORY_FILE)) {
  repoHistory = JSON.parse(fs.readFileSync(REPO_HISTORY_FILE, 'utf8'));
} else {
  repoHistory = [];
}

module.exports = repoHistory;
