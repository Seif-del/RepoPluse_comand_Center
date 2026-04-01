const fs = require('fs');
const { HISTORY_FILE } = require('../config/paths');
const summaryHistory = require('./summaryHistory');
const getProjectSummary = require('./getProjectSummary');

function appendSummarySnapshot() {
  const snapshot = getProjectSummary();
  summaryHistory.push(snapshot);
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(summaryHistory, null, 2), 'utf8');
  return snapshot;
}

module.exports = appendSummarySnapshot;
