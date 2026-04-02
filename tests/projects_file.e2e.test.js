/**
 * End-to-end validation that PROJECTS_FILE env var loads an external fixture
 * and flows correctly through /projects and /summary.
 *
 * MUST run in its own Jest module registry (default behaviour) so that
 * process.env.PROJECTS_FILE is set before execution/projects.js is required.
 */

const path = require('path');

// Set env var before any app requires — module registry is fresh per Jest file.
process.env.PROJECTS_FILE = path.resolve(
  __dirname,
  'fixtures/projects.alt.json'
);

const request = require('supertest');
const app = require('../backend/server');

describe('PROJECTS_FILE end-to-end — projects.alt.json (4 projects, 2 Healthy, 2 At Risk)', () => {
  describe('GET /projects', () => {
    it('returns all 4 fixture records', async () => {
      const res = await request(app).get('/projects');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(4);
    });

    it('contains exactly the fixture project names', async () => {
      const res = await request(app).get('/projects');
      const names = res.body.map(p => p.name);
      expect(names).toContain('Alpha Dashboard');
      expect(names).toContain('Beta API Integration');
      expect(names).toContain('Gamma Reporting');
      expect(names).toContain('Delta Pipeline');
    });
  });

  describe('GET /summary', () => {
    let summary;

    beforeAll(async () => {
      const res = await request(app).get('/summary');
      summary = res.body;
    });

    it('returns 200', async () => {
      const res = await request(app).get('/summary');
      expect(res.status).toBe(200);
    });

    it('totalProjects = 4', () => {
      expect(summary.totalProjects).toBe(4);
    });

    it('healthyProjects = 2', () => {
      expect(summary.healthyProjects).toBe(2);
    });

    it('atRiskProjects = 2', () => {
      expect(summary.atRiskProjects).toBe(2);
    });

    it('riskScore = 50', () => {
      expect(summary.riskScore).toBe(50);
    });
  });
});
