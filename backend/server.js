const path = require('path');
const fs   = require('fs');
const express = require('express');
const app = express();
const { PORT, PROJECT_SOURCE, REPO_HISTORY_FILE } = require('../config/paths');
const syncGithubProjects = require('../execution/syncGithubProjects');
const summaryHistory = require('../execution/summaryHistory');

let _syncedProjects = null;

// projects, getProjectSummary, and appendSummarySnapshot are required lazily
// inside their route handlers rather than at module scope. This ensures they
// are not loaded until after the async startup block (syncGithubProjects) has
// written PROJECTS_FILE to disk. Node caches the result after the first call,
// so there is no repeated file I/O on subsequent requests.

app.get('/', (req, res) => {
  res.send('RepoPulse backend is running');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../frontend/dashboard.html'));
});

app.get('/projects', (req, res) => {
  if (_syncedProjects !== null) return res.json(_syncedProjects);
  const projects = require('../execution/projects');
  res.json(projects);
});

app.get('/summary', (req, res) => {
  const getProjectSummary = require('../execution/getProjectSummary');
  res.json(getProjectSummary(_syncedProjects));
});

app.get('/history', (req, res) => {
  res.json(summaryHistory);
});

app.post('/history/snapshot', (req, res) => {
  const appendSummarySnapshot = require('../execution/appendSummarySnapshot');
  const snapshot = appendSummarySnapshot();
  res.json(snapshot);
});

app.get('/repo-history/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.json([]);
  let all = [];
  if (fs.existsSync(REPO_HISTORY_FILE)) {
    try { all = JSON.parse(fs.readFileSync(REPO_HISTORY_FILE, 'utf8')); } catch (_) {}
  }
  const entries = all
    .filter(e => e.id === id)
    .sort((a, b) => new Date(a.lastUpdated) - new Date(b.lastUpdated));
  res.json(entries);
});

app.get('/alerts', (req, res) => {
  const getProjectSummary = require('../execution/getProjectSummary');
  const { alertState, systemStatus, trend, riskScore, lastUpdated } = getProjectSummary(_syncedProjects);
  res.json({ alertState, systemStatus, trend, riskScore, lastUpdated });
});

app.get('/health', (req, res) => {
  const getProjectSummary = require('../execution/getProjectSummary');
  const { systemStatus, alertState, lastUpdated } = getProjectSummary(_syncedProjects);
  res.json({ status: 'ok', systemStatus, alertState, lastUpdated });
});

if (require.main === module) {
  (async () => {
    if (PROJECT_SOURCE === 'github') {
      _syncedProjects = await syncGithubProjects();
    }
    if (process.env.ENABLE_SNAPSHOT_WORKER === 'true') {
      const startSnapshotWorker = require('../services/worker/snapshotWorker');
      startSnapshotWorker();
    }
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })();
}

module.exports = app;
