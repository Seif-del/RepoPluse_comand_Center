'use strict';

const path          = require('path');
const express       = require('express');
const cookieParser  = require('cookie-parser');
const app           = express();
const { PORT, PROJECT_SOURCE } = require('../config/paths');
const config        = require('../config');
const db            = require('../execution/db');
const requestLogger = require('./middleware/requestLogger');
const errorHandler  = require('./middleware/errorHandler');
const authRoutes           = require('./routes/authRoutes');
const repoRoutes           = require('./routes/repoRoutes');
const portfolioRoutes      = require('./routes/portfolioRoutes');
const notificationRoutes   = require('./routes/notificationRoutes');
const legacySummaryRoutes  = require('./routes/legacySummaryRoutes');
const syncGithubProjects = require('../execution/syncGithubProjects');

app.locals.db     = db;
app.locals.config = config;

// syncedProjects mirrors what a pre-refactor closure variable held: null until
// the async startup block (below) resolves syncGithubProjects(), after which
// legacySummaryRoutes.js reads the live value at request time via app.locals.
app.locals.syncedProjects = null;

app.use(cookieParser());
app.use(express.json());
app.use(requestLogger);

app.use('/auth',               authRoutes);
app.use('/api/repos',          repoRoutes);
app.use('/api/portfolio',      portfolioRoutes);
app.use('/api/notifications',  notificationRoutes);
app.use('/',                   legacySummaryRoutes);

app.get('/', (req, res) => {
  res.send('RepoPulse backend is running');
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../frontend/dashboard.html'));
});

app.get('/manage/repos', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../frontend/manage-repos.html'));
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(errorHandler);

if (require.main === module) {
  (async () => {
    if (PROJECT_SOURCE === 'github') {
      app.locals.syncedProjects = await syncGithubProjects();
    }
    if (process.env.ENABLE_SNAPSHOT_WORKER === 'true') {
      const startSnapshotWorker = require('../services/worker/snapshotWorker');
      startSnapshotWorker(db);
    }
    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
    });
  })();
}

module.exports = app;
