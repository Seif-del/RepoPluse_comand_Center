const summaryHistory = require('./summaryHistory');

function getTrend(currentRiskScore) {
  const previous = summaryHistory[summaryHistory.length - 1];

  if (currentRiskScore > previous.riskScore) return 'Worsening';
  if (currentRiskScore < previous.riskScore) return 'Improving';
  return 'Stable';
}

module.exports = getTrend;
