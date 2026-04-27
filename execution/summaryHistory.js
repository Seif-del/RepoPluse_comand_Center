const fs = require('fs');
const { HISTORY_FILE } = require('../config/paths');

let summaryHistory;

if (fs.existsSync(HISTORY_FILE)) {
  summaryHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
} else {
  summaryHistory = [];
}

module.exports = summaryHistory;
