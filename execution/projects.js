const fs = require('fs');
const { PROJECTS_FILE } = require('../config/paths');

const seed = [
  { id: 1, name: 'Alpha Dashboard', status: 'Healthy' },
  { id: 2, name: 'Beta API Integration', status: 'At Risk' },
  { id: 3, name: 'Gamma Reporting', status: 'Healthy' },
];

const projects = PROJECTS_FILE
  ? JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8'))
  : seed;

module.exports = projects;
