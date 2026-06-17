'use strict';

// Set SNAPSHOT_INTERVAL_MS before any require() so config/paths.js reads the
// test value (50 ms) rather than the 1-hour production default.
// Saved and restored in afterAll so sibling test files are unaffected.
const _savedInterval = process.env.SNAPSHOT_INTERVAL_MS;
process.env.SNAPSHOT_INTERVAL_MS = '50';

// ── Module mocks ──────────────────────────────────────────────────────────────
// All external I/O is replaced with jest.fn() stubs.
// Per CLAUDE.md Worker Testing rules: workers must never send real
// communications during tests.

jest.mock('../../../../execution/appendSummarySnapshot');
jest.mock('../../../../execution/appendRepoHistorySnapshot');
jest.mock('../../../../execution/syncGithubProjects');
jest.mock('../../../../services/notifications/sendAlert', () => ({
  sendAlert: jest.fn(),
  _sent:     new Set(),
}));

// ── Imports ───────────────────────────────────────────────────────────────────

const appendSummarySnapshot     = require('../../../../execution/appendSummarySnapshot');
const appendRepoHistorySnapshot = require('../../../../execution/appendRepoHistorySnapshot');
const { sendAlert }             = require('../../../../services/notifications/sendAlert');
const startSnapshotWorker       = require('../../../../services/worker/snapshotWorker');

// ── Fixture ───────────────────────────────────────────────────────────────────

const SNAPSHOT = {
  alertState:     'Critical',
  trend:          'Worsening',
  riskScore:      80,
  atRiskProjects: 8,
  totalProjects:  10,
  lastUpdated:    '2026-06-12T00:00:00.000Z',
};

// ── Lifecycle ─────────────────────────────────────────────────────────────────

afterAll(() => {
  if (_savedInterval === undefined) {
    delete process.env.SNAPSHOT_INTERVAL_MS;
  } else {
    process.env.SNAPSHOT_INTERVAL_MS = _savedInterval;
  }
});

beforeEach(() => {
  jest.useFakeTimers();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});

  // Default happy-path stubs
  appendSummarySnapshot.mockReturnValue(SNAPSHOT);
  appendRepoHistorySnapshot.mockReturnValue([]);
  sendAlert.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  sendAlert.mockReset();
  appendSummarySnapshot.mockReset();
  appendRepoHistorySnapshot.mockReset();
});

// ── Worker routing tests ──────────────────────────────────────────────────────

describe('snapshotWorker — notification dispatch routing', () => {

  it('calls sendAlert after appendSummarySnapshot succeeds', () => {
    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    expect(sendAlert).toHaveBeenCalledTimes(1);
  });

  it('passes the exact snapshot returned by appendSummarySnapshot to sendAlert', () => {
    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    expect(sendAlert).toHaveBeenCalledWith(SNAPSHOT, { db: undefined });
  });

  it('does not crash the worker when sendAlert rejects', async () => {
    sendAlert.mockRejectedValue(new Error('network error'));

    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    // Flush the .catch() microtask — confirms rejection was consumed, not re-thrown
    await Promise.resolve();

    // Worker is still alive: second tick fires normally
    jest.advanceTimersByTime(50);
    expect(sendAlert).toHaveBeenCalledTimes(2);
  });

  it('does not call sendAlert when appendSummarySnapshot throws', () => {
    appendSummarySnapshot.mockImplementation(() => {
      throw new Error('snapshot failed');
    });

    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    expect(sendAlert).not.toHaveBeenCalled();
  });

  it('calls sendAlert even when appendRepoHistorySnapshot throws', () => {
    appendRepoHistorySnapshot.mockImplementation(() => {
      throw new Error('repo history failed');
    });

    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    // sendAlert is dispatched before the inner try/catch that guards repoHistory
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(SNAPSHOT, { db: undefined });
  });

});

// ── DB wiring tests ───────────────────────────────────────────────────────────

describe('snapshotWorker — db wiring', () => {

  it('passes { db } to sendAlert when db is provided to startSnapshotWorker', () => {
    const mockDb = { query: jest.fn() };

    startSnapshotWorker(mockDb);
    jest.advanceTimersByTime(50);

    expect(sendAlert).toHaveBeenCalledWith(SNAPSHOT, { db: mockDb });
  });

  it('passes { db: undefined } to sendAlert when no db is provided (backward compat)', () => {
    startSnapshotWorker();
    jest.advanceTimersByTime(50);

    expect(sendAlert).toHaveBeenCalledWith(SNAPSHOT, { db: undefined });
  });

});
