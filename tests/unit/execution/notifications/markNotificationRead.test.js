'use strict';

const { markNotificationRead } = require('../../../../execution/notifications/markNotificationRead');

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDb(rowCount = 1) {
  return { query: jest.fn().mockResolvedValue({ rowCount }) };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('markNotificationRead — return value', () => {
  test('returns 1 when the notification is found and owned by the user', async () => {
    const db = makeDb(1);
    const result = await markNotificationRead({ db, userId: 1, notifId: 5 });
    expect(result).toBe(1);
  });

  test('returns 0 when the notification belongs to a different user', async () => {
    const db = makeDb(0);
    const result = await markNotificationRead({ db, userId: 99, notifId: 5 });
    expect(result).toBe(0);
  });

  test('returns 0 when the notification id does not exist', async () => {
    const db = makeDb(0);
    const result = await markNotificationRead({ db, userId: 1, notifId: 9999 });
    expect(result).toBe(0);
  });
});

describe('markNotificationRead — SQL correctness', () => {
  test('WHERE clause scopes to both notifId ($1) and userId ($2)', async () => {
    const db = makeDb(1);
    await markNotificationRead({ db, userId: 3, notifId: 7 });
    const [sql, params] = db.query.mock.calls[0];
    const flat = sql.replace(/\s+/g, ' ').toUpperCase();
    expect(flat).toContain('WHERE ID = $1 AND USER_ID = $2');
    expect(params[0]).toBe(7);   // notifId is $1
    expect(params[1]).toBe(3);   // userId  is $2
  });

  test("SQL sets status = 'READ'", async () => {
    const db = makeDb(1);
    await markNotificationRead({ db, userId: 1, notifId: 1 });
    const [sql] = db.query.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ').toUpperCase()).toContain("STATUS = 'READ'");
  });

  test('SQL sets read_at = NOW()', async () => {
    const db = makeDb(1);
    await markNotificationRead({ db, userId: 1, notifId: 1 });
    const [sql] = db.query.mock.calls[0];
    expect(sql.replace(/\s+/g, ' ').toUpperCase()).toContain('READ_AT = NOW()');
  });

  test('makes exactly one db.query call', async () => {
    const db = makeDb(1);
    await markNotificationRead({ db, userId: 1, notifId: 1 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });
});

describe('markNotificationRead — error handling', () => {
  test('propagates a db error as a thrown error', async () => {
    const db = { query: jest.fn().mockRejectedValue(new Error('DB down')) };
    await expect(markNotificationRead({ db, userId: 1, notifId: 1 })).rejects.toThrow('DB down');
  });
});
