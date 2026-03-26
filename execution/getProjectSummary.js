const projects = require('./projects');

function getProjectSummary() {
  const totalProjects = projects.length;
  const atRiskProjects = projects.filter(p => p.status === 'At Risk').length;
  return {
    totalProjects,
    healthyProjects: projects.filter(p => p.status === 'Healthy').length,
    atRiskProjects,
    systemStatus: atRiskProjects > 0 ? 'At Risk' : 'Healthy',
    riskScore: Math.round((atRiskProjects / totalProjects) * 100),
  };
}

module.exports = getProjectSummary;
