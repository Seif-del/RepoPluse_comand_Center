const express = require('express');
const app = express();
const PORT = 3000;
const projects = require('../execution/projects');
const getProjectSummary = require('../execution/getProjectSummary');

app.get('/', (req, res) => {
  res.send('RepoPulse backend is running');
});

app.get('/projects', (req, res) => {
  res.json(projects);
});

app.get('/summary', (req, res) => {
  res.json(getProjectSummary());
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
