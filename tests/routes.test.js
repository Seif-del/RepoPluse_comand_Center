const fs = require('fs');
const { HISTORY_FILE, REPO_HISTORY_FILE } = require('../config/paths');
const request = require('supertest');
const app = require('../backend/server');

describe('GET /summary', () => {
  it('returns 200 with all expected fields', async () => {
    const res = await request(app).get('/summary');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalProjects');
    expect(res.body).toHaveProperty('healthyProjects');
    expect(res.body).toHaveProperty('atRiskProjects');
    expect(res.body).toHaveProperty('systemStatus');
    expect(res.body).toHaveProperty('riskScore');
    expect(res.body).toHaveProperty('lastUpdated');
    expect(res.body).toHaveProperty('trend');
    expect(res.body).toHaveProperty('alertState');
  });
});

describe('GET /health', () => {
  it('returns 200 with exactly status, systemStatus, alertState, lastUpdated', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('systemStatus');
    expect(res.body).toHaveProperty('alertState');
    expect(res.body).toHaveProperty('lastUpdated');
    expect(Object.keys(res.body)).toHaveLength(4);
  });
});

describe('GET /history', () => {
  it('returns 200 and an array', async () => {
    const res = await request(app).get('/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('POST /history/snapshot', () => {
  afterEach(() => {
    if (fs.existsSync(HISTORY_FILE)) fs.unlinkSync(HISTORY_FILE);
  });

  it('returns 200 with full snapshot shape and increases history length by 1', async () => {
    const before = await request(app).get('/history');
    const initialLength = before.body.length;

    const post = await request(app).post('/history/snapshot');
    expect(post.status).toBe(200);
    expect(post.body).toHaveProperty('totalProjects');
    expect(post.body).toHaveProperty('healthyProjects');
    expect(post.body).toHaveProperty('atRiskProjects');
    expect(post.body).toHaveProperty('systemStatus');
    expect(post.body).toHaveProperty('riskScore');
    expect(post.body).toHaveProperty('lastUpdated');
    expect(post.body).toHaveProperty('trend');
    expect(post.body).toHaveProperty('alertState');

    const after = await request(app).get('/history');
    expect(after.body.length).toBe(initialLength + 1);

    expect(fs.existsSync(HISTORY_FILE)).toBe(true);
  });
});

describe('GET /repo-history/:id', () => {
  const appendRepoHistorySnapshot = require('../execution/appendRepoHistorySnapshot');
  const repoHistory = require('../execution/repoHistory');

  beforeAll(() => {
    appendRepoHistorySnapshot();
  });

  afterAll(() => {
    if (fs.existsSync(REPO_HISTORY_FILE)) fs.unlinkSync(REPO_HISTORY_FILE);
    repoHistory.splice(0);
  });

  it('returns 200 and matching entries for a known repo id', async () => {
    const res = await request(app).get('/repo-history/1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('returns only entries for the requested repo id', async () => {
    const res = await request(app).get('/repo-history/1');
    res.body.forEach(entry => expect(entry.id).toBe(1));
  });

  it('each entry has the required shape', async () => {
    const res = await request(app).get('/repo-history/1');
    res.body.forEach(entry => {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('status');
      expect(entry).toHaveProperty('lastUpdated');
    });
  });

  it('returns an empty array for an unknown repo id', async () => {
    const res = await request(app).get('/repo-history/9999');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns an empty array for a non-numeric id', async () => {
    const res = await request(app).get('/repo-history/foo');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('entries are ordered oldest-first (ascending lastUpdated)', async () => {
    appendRepoHistorySnapshot();
    const res = await request(app).get('/repo-history/1');
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    for (let i = 1; i < res.body.length; i++) {
      const prev = new Date(res.body[i - 1].lastUpdated).getTime();
      const curr = new Date(res.body[i].lastUpdated).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });
});

describe('GET /alerts', () => {
  it('returns 200 with exactly alertState, systemStatus, trend, riskScore, lastUpdated', async () => {
    const res = await request(app).get('/alerts');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('alertState');
    expect(res.body).toHaveProperty('systemStatus');
    expect(res.body).toHaveProperty('trend');
    expect(res.body).toHaveProperty('riskScore');
    expect(res.body).toHaveProperty('lastUpdated');
    expect(Object.keys(res.body)).toHaveLength(5);
  });
});

describe('POST /test-alert', () => {
  it('returns 200 with ok, attempted, and correct synthetic summary', async () => {
    const res = await request(app).post('/test-alert');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.attempted).toBe(true);
    expect(res.body.summary).toMatchObject({
      alertState: 'Critical',
      trend: 'Worsening',
      totalProjects: 30,
      atRiskProjects: 20,
      riskScore: 67,
    });
  });

  it('returns 403 when NODE_ENV is production', async () => {
    const original = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    const res = await request(app).post('/test-alert');
    process.env.NODE_ENV = original;
    expect(res.status).toBe(403);
    expect(res.body.ok).toBe(false);
  });
});
