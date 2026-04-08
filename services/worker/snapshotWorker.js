const appendSummarySnapshot = require('../../execution/appendSummarySnapshot');
const { SNAPSHOT_INTERVAL_MS } = require('../../config/paths');

function startSnapshotWorker() {
  console.log(`[snapshotWorker] Started. Interval: ${SNAPSHOT_INTERVAL_MS}ms`);

  setInterval(() => {
    try {
      const snapshot = appendSummarySnapshot();
      console.log(`[snapshotWorker] Snapshot recorded at ${snapshot.lastUpdated}`);
    } catch (e) {
      console.error(`[snapshotWorker] Snapshot failed: ${e.message}`);
    }
  }, SNAPSHOT_INTERVAL_MS);
}

module.exports = startSnapshotWorker;
