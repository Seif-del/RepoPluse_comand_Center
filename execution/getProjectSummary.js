const projects = require('./projects');
const getTrend = require('./getTrend');
const summaryHistory = require('./summaryHistory');

function getProjectSummary() {
  const totalProjects = projects.length;
  const atRiskProjects = projects.filter(p => p.status === 'At Risk').length;
  const riskScore = Math.round((atRiskProjects / totalProjects) * 100);
  const systemStatus = atRiskProjects > 0 ? 'At Risk' : 'Healthy';
  const previousRiskScore = summaryHistory[summaryHistory.length - 1].riskScore;
  const trend = getTrend(riskScore, previousRiskScore);
  const alertState =
    systemStatus === 'At Risk' && trend === 'Worsening' ? 'Critical' :
    systemStatus === 'At Risk' && trend === 'Stable'    ? 'Monitor'  :
    'Normal';
  return {
    totalProjects,
    healthyProjects: projects.filter(p => p.status === 'Healthy').length,
    atRiskProjects,
    systemStatus,
    riskScore,
    lastUpdated: new Date().toISOString(),
    trend,
    alertState,
  };
}

module.exports = getProjectSummary;
