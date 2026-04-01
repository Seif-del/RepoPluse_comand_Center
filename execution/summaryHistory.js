const fs = require('fs');
const { HISTORY_FILE } = require('../config/paths');

const seed = [
  {
    totalProjects: 3,
    healthyProjects: 3,
    atRiskProjects: 0,
    systemStatus: 'Healthy',
    riskScore: 0,
    lastUpdated: '2026-03-25T00:00:00.000Z',
  },
  {
    totalProjects: 3,
    healthyProjects: 2,
    atRiskProjects: 1,
    systemStatus: 'At Risk',
    riskScore: 33,
    lastUpdated: '2026-03-26T00:00:00.000Z',
  },
];

let summaryHistory;

if (fs.existsSync(HISTORY_FILE)) {
  summaryHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
} else {
  summaryHistory = seed;
}

module.exports = summaryHistory;
