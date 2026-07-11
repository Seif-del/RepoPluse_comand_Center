'use strict';

const express        = require('express');
const summaryHistory = require('../../execution/summaryHistory');

const router = express.Router();

// projects, getProjectSummary, and appendSummarySnapshot are required lazily
// inside their route handlers rather than at module scope. This ensures they
// are not loaded until after the async startup block (syncGithubProjects) has
// written PROJECTS_FILE to disk. Node caches the result after the first call,
// so there is no repeated file I/O on subsequent requests.
//
// req.app.locals.syncedProjects mirrors the pre-refactor server.js closure
// variable of the same name — server.js sets it once syncGithubProjects()
// resolves, and these handlers read the live value at request time.

router.get('/projects', (req, res) => {
  const syncedProjects = req.app.locals.syncedProjects;
  if (syncedProjects !== null) return res.json(syncedProjects);
  const projects = require('../../execution/projects');
  res.json(projects);
});

router.get('/summary', (req, res) => {
  const getProjectSummary = require('../../execution/getProjectSummary');
  res.json(getProjectSummary(req.app.locals.syncedProjects));
});

router.get('/history', (req, res) => {
  res.json(summaryHistory);
});

router.post('/history/snapshot', (req, res) => {
  const appendSummarySnapshot = require('../../execution/appendSummarySnapshot');
  const snapshot = appendSummarySnapshot();
  res.json(snapshot);
});

router.get('/alerts', (req, res) => {
  const getProjectSummary = require('../../execution/getProjectSummary');
  const { alertState, systemStatus, trend, riskScore, lastUpdated } = getProjectSummary(req.app.locals.syncedProjects);
  res.json({ alertState, systemStatus, trend, riskScore, lastUpdated });
});

module.exports = router;
