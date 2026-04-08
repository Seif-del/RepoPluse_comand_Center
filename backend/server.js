const express = require('express');
const app = express();
const { PORT } = require('../config/paths');
const startSnapshotWorker = require('../services/worker/snapshotWorker');
const projects = require('../execution/projects');
const getProjectSummary = require('../execution/getProjectSummary');
const summaryHistory = require('../execution/summaryHistory');
const appendSummarySnapshot = require('../execution/appendSummarySnapshot');

app.get('/', (req, res) => {
  res.send('RepoPulse backend is running');
});

app.get('/projects', (req, res) => {
  res.json(projects);
});

app.get('/summary', (req, res) => {
  res.json(getProjectSummary());
});

app.get('/history', (req, res) => {
  res.json(summaryHistory);
});

app.post('/history/snapshot', (req, res) => {
  const snapshot = appendSummarySnapshot();
  res.json(snapshot);
});

app.get('/alerts', (req, res) => {
  const { alertState, systemStatus, trend, riskScore, lastUpdated } = getProjectSummary();
  res.json({ alertState, systemStatus, trend, riskScore, lastUpdated });
});

app.get('/health', (req, res) => {
  const { systemStatus, alertState, lastUpdated } = getProjectSummary();
  res.json({ status: 'ok', systemStatus, alertState, lastUpdated });
});

if (require.main === module) {
  if (process.env.ENABLE_SNAPSHOT_WORKER === 'true') {
    startSnapshotWorker();
  }
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
