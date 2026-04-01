const fs = require('fs');
const { HISTORY_FILE } = require('../config/paths');
const getProjectSummary = require('../execution/getProjectSummary');
const getTrend = require('../execution/getTrend');
const appendSummarySnapshot = require('../execution/appendSummarySnapshot');
const summaryHistory = require('../execution/summaryHistory');

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
  it('returns "Stable" when riskScore equals previous (33)', () => {
    expect(getTrend(33)).toBe('Stable');
  });

  it('returns "Worsening" when riskScore is higher than previous (50 > 33)', () => {
    expect(getTrend(50)).toBe('Worsening');
  });

  it('returns "Improving" when riskScore is lower than previous (0 < 33)', () => {
    expect(getTrend(0)).toBe('Improving');
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
