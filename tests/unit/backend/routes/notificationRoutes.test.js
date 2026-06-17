'use strict';

// HTTP contract tests for the notification API layer.
// Uses supertest to drive real HTTP requests through Express routing.
// db.query is a jest.fn() throughout — no real database.
// authenticate is stubbed to inject req.user = { userId: 1 }.

jest.mock('../../../../backend/middleware/authenticate', () => (req, res, next) => {
  req.user = { userId: 1 };
  next();
});

const express            = require('express');
const supertest          = require('supertest');
const notificationRoutes = require('../../../../backend/routes/notificationRoutes');

const TEST_USER_ID = 1;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(...results) {
  const fn = jest.fn();
  results.forEach(r => fn.mockResolvedValueOnce(r));
  return { query: fn };
}

function buildApp(db) {
  const app = express();
  app.use(express.json());
  app.locals.db = db;
  app.use('/api/notifications', notificationRoutes);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW   = new Date().toISOString();
const OLDER = new Date(Date.now() - 60_000).toISOString();

const ROW_UNREAD = {
  id: 1, type: 'portfolio_alert', priority: 'CRITICAL',
  title: '[RepoPulse] Critical Alert', body: 'body', status: 'CREATED',
  dedupe_key: 'Critical:Worsening', created_at: NOW,
  sent_at: null, read_at: null, expires_at: null,
};

const ROW_READ = {
  id: 2, type: 'portfolio_alert', priority: 'HIGH',
  title: '[RepoPulse] High Alert', body: 'body', status: 'READ',
  dedupe_key: 'High:Worsening', created_at: OLDER,
  sent_at: null, read_at: NOW, expires_at: null,
};

// ── GET /api/notifications ────────────────────────────────────────────────────

describe('GET /api/notifications', () => {

  test('returns HTTP 200', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    const res = await supertest(buildApp(db)).get('/api/notifications');
    expect(res.status).toBe(200);
  });

  test('response shape contains notifications array and unreadCount number', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    const res = await supertest(buildApp(db)).get('/api/notifications');
    expect(Array.isArray(res.body.notifications)).toBe(true);
    expect(typeof res.body.unreadCount).toBe('number');
  });

  test('returns only the authenticated user\'s notifications — both queries scoped to userId', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    await supertest(buildApp(db)).get('/api/notifications');
    db.query.mock.calls.forEach(([, params]) => {
      expect(params[0]).toBe(TEST_USER_ID);
    });
  });

  test('list query uses ORDER BY created_at DESC', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    await supertest(buildApp(db)).get('/api/notifications');
    const [listSql] = db.query.mock.calls[0];
    expect(listSql.replace(/\s+/g, ' ').toUpperCase()).toContain('ORDER BY CREATED_AT DESC');
  });

  test('list query is limited to 20 rows', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    await supertest(buildApp(db)).get('/api/notifications');
    const [listSql] = db.query.mock.calls[0];
    expect(listSql.toUpperCase()).toContain('LIMIT 20');
  });

  test('notification rows from the list query appear in the response', async () => {
    const db = makeDb({ rows: [ROW_UNREAD, ROW_READ] }, { rows: [{ unread_count: '1' }] });
    const res = await supertest(buildApp(db)).get('/api/notifications');
    expect(res.body.notifications).toHaveLength(2);
    expect(res.body.notifications[0].id).toBe(1);
  });

  test('unreadCount in response equals the integer value from the count query', async () => {
    const db = makeDb({ rows: [ROW_UNREAD] }, { rows: [{ unread_count: '3' }] });
    const res = await supertest(buildApp(db)).get('/api/notifications');
    expect(res.body.unreadCount).toBe(3);
  });

  test('count query filters by status NOT IN (READ, EXPIRED)', async () => {
    const db = makeDb({ rows: [] }, { rows: [{ unread_count: '0' }] });
    await supertest(buildApp(db)).get('/api/notifications');
    const [countSql] = db.query.mock.calls[1];
    const flat = countSql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain('NOT IN');
    expect(flat).toContain("'READ'");
    expect(flat).toContain("'EXPIRED'");
  });

  test('DB failure returns HTTP 500', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    const res = await supertest(buildApp(db)).get('/api/notifications');
    expect(res.status).toBe(500);
  });

});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────

describe('PATCH /api/notifications/:id/read', () => {

  test('returns HTTP 200 with { success: true } for an owned notification', async () => {
    const db = makeDb({ rowCount: 1 });
    const res = await supertest(buildApp(db)).patch('/api/notifications/1/read');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
  });

  test('UPDATE SQL is scoped to both notification id and owner user_id', async () => {
    const db = makeDb({ rowCount: 1 });
    await supertest(buildApp(db)).patch('/api/notifications/7/read');
    const [sql, params] = db.query.mock.calls[0];
    const flat = sql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain('WHERE ID = $1 AND USER_ID = $2');
    expect(params[0]).toBe(7);
    expect(params[1]).toBe(TEST_USER_ID);
  });

  test('UPDATE SQL sets status = READ and read_at = NOW()', async () => {
    const db = makeDb({ rowCount: 1 });
    await supertest(buildApp(db)).patch('/api/notifications/1/read');
    const [sql] = db.query.mock.calls[0];
    const flat = sql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain("STATUS = 'READ'");
    expect(flat).toContain('READ_AT = NOW()');
  });

  test('returns HTTP 404 when notification belongs to a different user', async () => {
    const db = makeDb({ rowCount: 0 });
    const res = await supertest(buildApp(db)).patch('/api/notifications/99/read');
    expect(res.status).toBe(404);
  });

  test('returns HTTP 404 when notification id does not exist', async () => {
    const db = makeDb({ rowCount: 0 });
    const res = await supertest(buildApp(db)).patch('/api/notifications/9999/read');
    expect(res.status).toBe(404);
  });

  test('idempotent — second PATCH on an already-READ notification also returns { success: true }', async () => {
    const db = makeDb({ rowCount: 1 }, { rowCount: 1 });
    const app = buildApp(db);
    const res1 = await supertest(app).patch('/api/notifications/1/read');
    const res2 = await supertest(app).patch('/api/notifications/1/read');
    expect(res1.body).toEqual({ success: true });
    expect(res2.body).toEqual({ success: true });
  });

  test('returns HTTP 400 and skips DB call for a non-integer id', async () => {
    const db = { query: jest.fn() };
    const res = await supertest(buildApp(db)).patch('/api/notifications/abc/read');
    expect(res.status).toBe(400);
    expect(db.query).not.toHaveBeenCalled();
  });

  test('DB failure returns HTTP 500', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
    const res = await supertest(buildApp(db)).patch('/api/notifications/1/read');
    expect(res.status).toBe(500);
  });

});
