const fs = require('fs');
const { HISTORY_FILE } = require('../config/paths');
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
  it('returns 200 and an array of length 2', async () => {
    const res = await request(app).get('/history');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
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
