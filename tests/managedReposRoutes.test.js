'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');

// Isolate persistence to a temp file for every test run.
const TEST_FILE = path.join(os.tmpdir(), `repopulse-managedRepos-routes-${Date.now()}.json`);
process.env.MANAGED_REPOS_FILE = TEST_FILE;

// Clear cached modules so the server picks up the env override.
[
  '../backend/server',
  '../execution/managedRepos',
  '../config/paths',
].forEach(m => { try { delete require.cache[require.resolve(m)]; } catch (_) {} });

const app = require('../backend/server');

afterEach(() => {
  if (fs.existsSync(TEST_FILE)) fs.unlinkSync(TEST_FILE);
  // Bust the managedRepos module cache so each test starts with a clean file.
  try { delete require.cache[require.resolve('../execution/managedRepos')]; } catch (_) {}
});

// ── GET /manage ───────────────────────────────────────────────────────────────

describe('GET /manage', () => {
  it('returns 200 and serves HTML', async () => {
    const res = await request(app).get('/manage');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ── GET /managed-repos ────────────────────────────────────────────────────────

describe('GET /managed-repos', () => {
  it('returns 200 and an empty array when no repos registered', async () => {
    const res = await request(app).get('/managed-repos');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it('returns registered repos after a successful POST', async () => {
    await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });

    const res = await request(app).get('/managed-repos');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].fullName).toBe('vercel/next.js');
  });
});

// ── POST /managed-repos ───────────────────────────────────────────────────────

describe('POST /managed-repos', () => {
  it('returns 201 with the registered repo for a valid URL', async () => {
    const res = await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });

    expect(res.status).toBe(201);
    expect(res.body.ok).toBe(true);
    expect(res.body.repo).toMatchObject({
      owner: 'vercel',
      repo: 'next.js',
      fullName: 'vercel/next.js',
      url: 'https://github.com/vercel/next.js',
    });
    expect(typeof res.body.repo.id).toBe('number');
    expect(typeof res.body.repo.registeredAt).toBe('string');
  });

  it('returns 400 for an empty body', async () => {
    const res = await request(app)
      .post('/managed-repos')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for a whitespace-only URL', async () => {
    const res = await request(app)
      .post('/managed-repos')
      .send({ url: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for a non-GitHub URL', async () => {
    const res = await request(app)
      .post('/managed-repos')
      .send({ url: 'https://gitlab.com/foo/bar' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/invalid/i);
  });

  it('returns 400 for a URL missing the repo segment', async () => {
    const res = await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel' });
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it('returns 400 for a duplicate registration', async () => {
    await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });

    const res = await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
    expect(res.body.error).toMatch(/already registered/i);
  });

  it('creates the persistence file on first valid registration', async () => {
    expect(fs.existsSync(TEST_FILE)).toBe(false);
    await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });
    expect(fs.existsSync(TEST_FILE)).toBe(true);
  });

  it('accumulates multiple distinct repos', async () => {
    await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/vercel/next.js' });
    await request(app)
      .post('/managed-repos')
      .send({ url: 'https://github.com/facebook/react' });

    const res = await request(app).get('/managed-repos');
    expect(res.body).toHaveLength(2);
  });
});
