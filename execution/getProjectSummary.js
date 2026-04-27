const getTrend = require('./getTrend');
const summaryHistory = require('./summaryHistory');

function getProjectSummary(projectsOverride) {
  const projects = projectsOverride || require('./projects');
  const totalProjects = projects.length;
  const atRiskProjects = projects.filter(p => p.status === 'At Risk').length;
  const riskScore = Math.round((atRiskProjects / totalProjects) * 100);
  const systemStatus = atRiskProjects > 0 ? 'At Risk' : 'Healthy';
  const lastEntry = summaryHistory.length > 0 ? summaryHistory[summaryHistory.length - 1] : null;
  const trend = getTrend(riskScore, lastEntry ? lastEntry.riskScore : undefined);
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
