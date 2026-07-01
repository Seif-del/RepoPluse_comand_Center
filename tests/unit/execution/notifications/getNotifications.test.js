'use strict';

const { getNotifications } = require('../../../../execution/notifications/getNotifications');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOTIF_ROW = {
  id: 1, type: 'portfolio_alert', priority: 'CRITICAL',
  title: '[RepoPulse] Critical Alert', body: 'body', status: 'CREATED',
  dedupe_key: 'Critical:Worsening', created_at: '2026-06-01T00:00:00.000Z',
  sent_at: null, read_at: null, expires_at: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// Builds a mock db that returns `listRows` for the first query (list) and
// `unreadCountStr` for the second (count). Matches the Promise.all call order
// in getNotifications: list query is initiated first, count query second.
function makeDb(listRows = [], unreadCountStr = '0') {
  const query = jest.fn();
  query
    .mockResolvedValueOnce({ rows: listRows })
    .mockResolvedValueOnce({ rows: [{ unread_count: unreadCountStr }] });
  return { query };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('getNotifications — return shape', () => {
  test('returns an object with a notifications array and unreadCount number', async () => {
    const db = makeDb([], '0');
    const result = await getNotifications({ db, userId: 1 });
    expect(Array.isArray(result.notifications)).toBe(true);
    expect(typeof result.unreadCount).toBe('number');
  });

  test('returns empty notifications array when no rows exist', async () => {
    const db = makeDb([], '0');
    const result = await getNotifications({ db, userId: 1 });
    expect(result.notifications).toHaveLength(0);
    expect(result.unreadCount).toBe(0);
  });

  test('returns notification rows from the list query', async () => {
    const db = makeDb([NOTIF_ROW], '1');
    const result = await getNotifications({ db, userId: 1 });
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0].id).toBe(1);
    expect(result.notifications[0].priority).toBe('CRITICAL');
  });

  test('unreadCount is an integer — not a string — parsed from the DB count', async () => {
    const db = makeDb([], '7');
    const result = await getNotifications({ db, userId: 5 });
    expect(result.unreadCount).toBe(7);
    expect(Number.isInteger(result.unreadCount)).toBe(true);
  });

  test('unreadCount of 0 is an integer', async () => {
    const db = makeDb([], '0');
    const result = await getNotifications({ db, userId: 1 });
    expect(result.unreadCount).toBe(0);
    expect(Number.isInteger(result.unreadCount)).toBe(true);
  });
});

describe('getNotifications — SQL correctness', () => {
  test('both queries are scoped to the provided userId', async () => {
    const db = makeDb([], '0');
    await getNotifications({ db, userId: 42 });
    db.query.mock.calls.forEach(([, params]) => {
      expect(params[0]).toBe(42);
    });
  });

  test('list query uses ORDER BY created_at DESC', async () => {
    const db = makeDb([], '0');
    await getNotifications({ db, userId: 1 });
    const [listSql] = db.query.mock.calls[0];
    expect(listSql.replace(/\s+/g, ' ').toUpperCase()).toContain('ORDER BY CREATED_AT DESC');
  });

  test('list query is limited to 20 rows', async () => {
    const db = makeDb([], '0');
    await getNotifications({ db, userId: 1 });
    const [listSql] = db.query.mock.calls[0];
    expect(listSql.toUpperCase()).toContain('LIMIT 20');
  });

  test('count query filters by status NOT IN (READ, EXPIRED)', async () => {
    const db = makeDb([], '0');
    await getNotifications({ db, userId: 1 });
    const [countSql] = db.query.mock.calls[1];
    const flat = countSql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain('NOT IN');
    expect(flat).toContain("'READ'");
    expect(flat).toContain("'EXPIRED'");
  });
});

describe('getNotifications — concurrency and error handling', () => {
  test('makes exactly two db.query calls (one list, one count)', async () => {
    const db = makeDb([], '0');
    await getNotifications({ db, userId: 1 });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  test('propagates a db error as a thrown error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('connection refused')) };
    await expect(getNotifications({ db, userId: 1 })).rejects.toThrow('connection refused');
  });
});
