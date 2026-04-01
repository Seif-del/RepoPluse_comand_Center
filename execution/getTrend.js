const summaryHistory = require('./summaryHistory');

function getTrend(currentRiskScore, previousRiskScore) {
  const previous = previousRiskScore !== undefined
    ? previousRiskScore
    : summaryHistory[summaryHistory.length - 1].riskScore;

  if (currentRiskScore > previous) return 'Worsening';
  if (currentRiskScore < previous) return 'Improving';
  return 'Stable';
}

module.exports = getTrend;
