function getTrend(currentRiskScore, previousRiskScore) {
  if (previousRiskScore === undefined || previousRiskScore === null) return 'Stable';
  if (currentRiskScore > previousRiskScore) return 'Worsening';
  if (currentRiskScore < previousRiskScore) return 'Improving';
  return 'Stable';
}

module.exports = getTrend;
