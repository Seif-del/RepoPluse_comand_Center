const fs = require('fs');
const { HISTORY_FILE, REPO_HISTORY_FILE } = require('../config/paths');
const getProjectSummary = require('../execution/getProjectSummary');
const getTrend = require('../execution/getTrend');
const appendSummarySnapshot = require('../execution/appendSummarySnapshot');
const summaryHistory = require('../execution/summaryHistory');
const appendRepoHistorySnapshot = require('../execution/appendRepoHistorySnapshot');
const repoHistory = require('../execution/repoHistory');

describe('getProjectSummary', () => {
  let summary;

  beforeAll(() => {
    summary = getProjectSummary();
  });

  it('returns expected project counts', () => {
    expect(summary.totalProjects).toBe(3);
    expect(summary.healthyProjects).toBe(2);
    expect(summary.atRiskProjects).toBe(1);
  });

  it('returns systemStatus = "At Risk"', () => {
    expect(summary.systemStatus).toBe('At Risk');
  });

  it('returns riskScore = 33', () => {
    expect(summary.riskScore).toBe(33);
  });

  it('returns trend = "Stable"', () => {
    expect(summary.trend).toBe('Stable');
  });

  it('returns alertState = "Monitor"', () => {
    expect(summary.alertState).toBe('Monitor');
  });
});

describe('getTrend', () => {
  it('returns "Stable" when no previous score exists (first reading)', () => {
    expect(getTrend(33)).toBe('Stable');
  });

  it('returns "Worsening" when riskScore is higher than explicit previous (50 > 33)', () => {
    expect(getTrend(50, 33)).toBe('Worsening');
  });

  it('returns "Improving" when riskScore is lower than explicit previous (0 < 33)', () => {
    expect(getTrend(0, 33)).toBe('Improving');
  });

  it('returns "Improving" when current (33) is lower than explicit previous (50)', () => {
    expect(getTrend(33, 50)).toBe('Improving');
  });
});

describe('appendSummarySnapshot', () => {
  afterEach(() => {
    if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
  });

  it('appends one snapshot to summaryHistory, writes to disk, and returns it', () => {
    const initialLength = summaryHistory.length;
    const snapshot = appendSummarySnapshot();
    expect(summaryHistory.length).toBe(initialLength + 1);
    expect(snapshot).toBe(summaryHistory[summaryHistory.length - 1]);
    expect(fs.existsSync(HISTORY_FILE)).toBe(true);
  });
});

describe('snapshot cycle integration', () => {
  afterEach(() => {
    if (fs.existsSync(HISTORY_FILE))      fs.unlinkSync(HISTORY_FILE);
    if (fs.existsSync(REPO_HISTORY_FILE)) fs.unlinkSync(REPO_HISTORY_FILE);
  });

  it('one cycle writes both summary and repo history files', () => {
    appendSummarySnapshot();
    appendRepoHistorySnapshot();
    expect(fs.existsSync(HISTORY_FILE)).toBe(true);
    expect(fs.existsSync(REPO_HISTORY_FILE)).toBe(true);
  });

  it('summary snapshot is unaffected by the repo history call', () => {
    const summaryBefore = summaryHistory.length;
    appendSummarySnapshot();
    appendRepoHistorySnapshot();
    expect(summaryHistory.length).toBe(summaryBefore + 1);
  });

  it('repo history grows by one entry per project per cycle', () => {
    const repoBefore = repoHistory.length;
    appendSummarySnapshot();
    appendRepoHistorySnapshot();
    expect(repoHistory.length).toBe(repoBefore + 3);
  });

  it('two cycles accumulate independent entries in both stores', () => {
    const summaryBefore = summaryHistory.length;
    const repoBefore    = repoHistory.length;
    appendSummarySnapshot(); appendRepoHistorySnapshot();
    appendSummarySnapshot(); appendRepoHistorySnapshot();
    expect(summaryHistory.length).toBe(summaryBefore + 2);
    expect(repoHistory.length).toBe(repoBefore + 6);
  });
});

describe('appendRepoHistorySnapshot', () => {
  afterEach(() => {
    if (fs.existsSync(REPO_HISTORY_FILE)) fs.unlinkSync(REPO_HISTORY_FILE);
  });

  it('returns one entry per project (seed has 3)', () => {
    const entries = appendRepoHistorySnapshot();
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBe(3);
  });

  it('each entry has the required shape: id, name, status, lastUpdated', () => {
    const entries = appendRepoHistorySnapshot();
    entries.forEach(entry => {
      expect(typeof entry.id).not.toBe('undefined');
      expect(typeof entry.name).toBe('string');
      expect(['Healthy', 'At Risk']).toContain(entry.status);
      expect(typeof entry.lastUpdated).toBe('string');
      expect(new Date(entry.lastUpdated).toString()).not.toBe('Invalid Date');
    });
  });

  it('all entries in a single call share the same lastUpdated timestamp', () => {
    const entries = appendRepoHistorySnapshot();
    const unique = new Set(entries.map(e => e.lastUpdated));
    expect(unique.size).toBe(1);
  });

  it('appends entries to repoHistory in memory', () => {
    const before = repoHistory.length;
    appendRepoHistorySnapshot();
    expect(repoHistory.length).toBe(before + 3);
  });

  it('persists all entries to disk as a JSON array', () => {
    appendRepoHistorySnapshot();
    expect(fs.existsSync(REPO_HISTORY_FILE)).toBe(true);
    const written = JSON.parse(fs.readFileSync(REPO_HISTORY_FILE, 'utf8'));
    expect(Array.isArray(written)).toBe(true);
    expect(written.length).toBeGreaterThan(0);
  });

  it('accumulates entries across successive calls', () => {
    appendRepoHistorySnapshot();
    appendRepoHistorySnapshot();
    const written = JSON.parse(fs.readFileSync(REPO_HISTORY_FILE, 'utf8'));
    expect(written.length).toBeGreaterThanOrEqual(6);
  });
});
