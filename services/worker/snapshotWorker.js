const path = require('path');
const appendSummarySnapshot = require('../../execution/appendSummarySnapshot');
const { SNAPSHOT_INTERVAL_MS, PROJECT_SOURCE } = require('../../config/paths');
const syncGithubProjects = require('../../execution/syncGithubProjects');

function startSnapshotWorker() {
  console.log(`[snapshotWorker] Started. Interval: ${SNAPSHOT_INTERVAL_MS}ms`);

  setInterval(async () => {
    try {
      if (PROJECT_SOURCE === 'github') {
        await syncGithubProjects();
        delete require.cache[require.resolve(path.join(__dirname, '../../execution/projects.js'))];
      }
      const snapshot = appendSummarySnapshot();
      console.log(`[snapshotWorker] Snapshot recorded at ${snapshot.lastUpdated}`);
    } catch (e) {
      console.error(`[snapshotWorker] Snapshot failed: ${e.message}`);
    }
  }, SNAPSHOT_INTERVAL_MS);
}

module.exports = startSnapshotWorker;
