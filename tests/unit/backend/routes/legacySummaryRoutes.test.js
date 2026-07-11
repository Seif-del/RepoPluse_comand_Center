'use strict';

// HTTP contract tests for the legacy/demo project-summary router.
// These endpoints were moved out of backend/server.js verbatim (Coupling
// Refinement #1) — this file proves the mounted router behaves identically
// to the pre-refactor inline handlers, including the app.locals.syncedProjects
// branch and the POST /history/snapshot path that tests/unit/backend/server.test.js
// does not exercise (server.test.js never runs the GitHub sync path, so
// syncedProjects stays null there).

jest.mock('../../../../execution/summaryHistory', () => ([
  { totalProjects: 3, riskScore: 33, lastUpdated: '2026-01-01T00:00:00.000Z' },
]));

jest.mock('../../../../execution/projects', () => ([
  { id: 1, name: 'Alpha Dashboard', status: 'Healthy', reasons: [] },
]));

const mockGetProjectSummary = jest.fn();
jest.mock('../../../../execution/getProjectSummary', () => mockGetProjectSummary);

const mockAppendSummarySnapshot = jest.fn();
jest.mock('../../../../execution/appendSummarySnapshot', () => mockAppendSummarySnapshot);

const express             = require('express');
const supertest           = require('supertest');
const legacySummaryRoutes = require('../../../../backend/routes/legacySummaryRoutes');

const FULL_SUMMARY = {
  totalProjects: 3, healthyProjects: 2, atRiskProjects: 1,
  systemStatus: 'At Risk', riskScore: 33, lastUpdated: '2026-01-01T00:00:00.000Z',
  trend: 'Stable', alertState: 'Monitor',
};

function buildApp(syncedProjects) {
  const app = express();
  app.locals.syncedProjects = syncedProjects === undefined ? null : syncedProjects;
  app.use('/', legacySummaryRoutes);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message })); // eslint-disable-line no-unused-vars
  return app;
}

beforeEach(() => {
  mockGetProjectSummary.mockReset().mockReturnValue(FULL_SUMMARY);
  mockAppendSummarySnapshot.mockReset().mockReturnValue(FULL_SUMMARY);
});

// ── GET /projects ─────────────────────────────────────────────────────────────

describe('GET /projects', () => {
  test('returns 200 with the seed/file-backed project list when syncedProjects is null', async () => {
    const res = await supertest(buildApp(null)).get('/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 1, name: 'Alpha Dashboard', status: 'Healthy', reasons: [] }]);
  });

  test('returns app.locals.syncedProjects directly when it has been synced (not null)', async () => {
    const synced = [{ id: 9, name: 'Synced Repo', status: 'Healthy', reasons: [] }];
    const res = await supertest(buildApp(synced)).get('/projects');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(synced);
  });
});

// ── GET /summary ──────────────────────────────────────────────────────────────

describe('GET /summary', () => {
  test('returns 200 with the full summary shape from getProjectSummary', async () => {
    const res = await supertest(buildApp(null)).get('/summary');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FULL_SUMMARY);
  });

  test('passes app.locals.syncedProjects through to getProjectSummary', async () => {
    const synced = [{ id: 1 }];
    await supertest(buildApp(synced)).get('/summary');
    expect(mockGetProjectSummary).toHaveBeenCalledWith(synced);
  });
});

// ── GET /history ──────────────────────────────────────────────────────────────

describe('GET /history', () => {
  test('returns 200 with the summaryHistory array', async () => {
    const res = await supertest(buildApp()).get('/history');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { totalProjects: 3, riskScore: 33, lastUpdated: '2026-01-01T00:00:00.000Z' },
    ]);
  });
});

// ── POST /history/snapshot ────────────────────────────────────────────────────

describe('POST /history/snapshot', () => {
  test('returns 200 with the snapshot returned by appendSummarySnapshot', async () => {
    const res = await supertest(buildApp()).post('/history/snapshot');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FULL_SUMMARY);
    expect(mockAppendSummarySnapshot).toHaveBeenCalledTimes(1);
  });
});

// ── GET /alerts ───────────────────────────────────────────────────────────────

describe('GET /alerts', () => {
  test('returns 200 with exactly alertState, systemStatus, trend, riskScore, lastUpdated', async () => {
    const res = await supertest(buildApp(null)).get('/alerts');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      alertState: 'Monitor', systemStatus: 'At Risk', trend: 'Stable',
      riskScore: 33, lastUpdated: '2026-01-01T00:00:00.000Z',
    });
    expect(Object.keys(res.body)).toHaveLength(5);
  });

  test('passes app.locals.syncedProjects through to getProjectSummary', async () => {
    const synced = [{ id: 1 }];
    await supertest(buildApp(synced)).get('/alerts');
    expect(mockGetProjectSummary).toHaveBeenCalledWith(synced);
  });
});
