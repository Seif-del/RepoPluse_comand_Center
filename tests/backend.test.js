const request = require('supertest');
const app = require('../backend/server');

describe('Backend entry point', () => {
  it('GET / returns correct message', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toBe('RepoPulse backend is running');
  });

  it('GET /projects returns an array of projects', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toEqual([
      { id: 1, name: 'Alpha Dashboard', status: 'Healthy' },
      { id: 2, name: 'Beta API Integration', status: 'At Risk' },
      { id: 3, name: 'Gamma Reporting', status: 'Healthy' },
    ]);
  });
});
