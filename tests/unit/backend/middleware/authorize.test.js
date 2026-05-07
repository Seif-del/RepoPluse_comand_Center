'use strict';

jest.mock('../../../../execution/rbac/checkPermission');
jest.mock('../../../../execution/audit/logEvent');

const authorize             = require('../../../../backend/middleware/authorize');
const { checkPermission }   = require('../../../../execution/rbac/checkPermission');
const { logEvent }          = require('../../../../execution/audit/logEvent');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CAP  = 'analytics:view';
const VALID_ROLE = 'project_manager';

const mockDb = {};

function makeReq(overrides = {}) {
  return {
    user: { userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' },
    app:  { locals: { db: mockDb } },
    ...overrides,
  };
}

function makeRes() {
  return {
    json:   jest.fn(),
    send:   jest.fn(),
    status: jest.fn().mockReturnThis(),
    end:    jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  checkPermission.mockReturnValue(true);
  logEvent.mockResolvedValue(null);
});

// ── Factory — invalid requiredCapability ──────────────────────────────────────

describe('authorize factory — INVALID_REQUIRED_CAPABILITY', () => {
  const cases = [
    ['null',            null],
    ['undefined',       undefined],
    ['a number',        42],
    ['an object',       {}],
    ['an empty string', ''],
    ['whitespace-only', '   '],
  ];

  cases.forEach(([label, requiredCapability]) => {
    it(`throws TypeError with code INVALID_REQUIRED_CAPABILITY when requiredCapability is ${label}`, () => {
      expect(() => authorize(requiredCapability)).toThrow(
        expect.objectContaining({
          name:    'TypeError',
          message: 'requiredCapability must be a non-empty string',
          code:    'INVALID_REQUIRED_CAPABILITY',
        })
      );
    });
  });

  it('throws before returning a middleware function', () => {
    expect(() => authorize(null)).toThrow();
    expect(checkPermission).not.toHaveBeenCalled();
  });
});

// ── Factory — valid input returns a function ──────────────────────────────────

describe('authorize factory — returns middleware', () => {
  it('returns a function when requiredCapability is valid', () => {
    expect(typeof authorize(VALID_CAP)).toBe('function');
  });

  it('returns a different function per call (no shared state)', () => {
    const mw1 = authorize('analytics:view');
    const mw2 = authorize('projects:view');
    expect(mw1).not.toBe(mw2);
  });
});

// ── Allowed ───────────────────────────────────────────────────────────────────

describe('authorize middleware — allowed', () => {
  it('calls next() with no arguments when checkPermission returns true', () => {
    checkPermission.mockReturnValue(true);
    const mw   = authorize(VALID_CAP);
    const next = jest.fn();
    mw(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls checkPermission with the correct role and capability', () => {
    const mw = authorize(VALID_CAP);
    mw(makeReq(), makeRes(), jest.fn());
    expect(checkPermission).toHaveBeenCalledTimes(1);
    expect(checkPermission).toHaveBeenCalledWith({ role: VALID_ROLE, capability: VALID_CAP });
  });

  it('does not call any res method when allowed', () => {
    const res = makeRes();
    authorize(VALID_CAP)(makeReq(), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── Denied ────────────────────────────────────────────────────────────────────

describe('authorize middleware — denied', () => {
  beforeEach(() => checkPermission.mockReturnValue(false));

  it('calls next(err) with FORBIDDEN when checkPermission returns false', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });

  it('does not call any res method when denied', () => {
    const res = makeRes();
    authorize(VALID_CAP)(makeReq(), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── Missing req.user ──────────────────────────────────────────────────────────

describe('authorize middleware — missing req.user', () => {
  it('calls next(err) with FORBIDDEN when req.user is absent', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq({ user: undefined }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });

  it('does not call checkPermission when req.user is absent', () => {
    authorize(VALID_CAP)(makeReq({ user: undefined }), makeRes(), jest.fn());
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('calls next(err) with FORBIDDEN when req.user is null', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq({ user: null }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('FORBIDDEN');
  });

  it('does not call any res method when req.user is missing', () => {
    const res = makeRes();
    authorize(VALID_CAP)(makeReq({ user: undefined }), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── Missing req.user.role ─────────────────────────────────────────────────────

describe('authorize middleware — missing req.user.role', () => {
  it('calls next(err) with FORBIDDEN when req.user.role is undefined', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1' } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Forbidden');
  });

  it('calls next(err) with FORBIDDEN when req.user.role is null', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1', role: null } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('FORBIDDEN');
  });

  it('calls next(err) with FORBIDDEN when req.user.role is empty string', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1', role: '' } }), makeRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.code).toBe('FORBIDDEN');
  });

  it('does not call checkPermission when req.user.role is missing', () => {
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1' } }), makeRes(), jest.fn());
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it('does not call any res method when req.user.role is missing', () => {
    const res = makeRes();
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1' } }), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── checkPermission error propagation ────────────────────────────────────────

describe('authorize middleware — checkPermission error propagation', () => {
  it('passes the exact error thrown by checkPermission to next()', () => {
    const permErr  = new Error('role must be a non-empty string');
    permErr.code   = 'INVALID_ROLE';
    checkPermission.mockImplementation(() => { throw permErr; });

    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBe(permErr);
  });

  it('does not swallow arbitrary errors from checkPermission', () => {
    const unexpected = new Error('unexpected internal error');
    checkPermission.mockImplementation(() => { throw unexpected; });

    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    expect(next.mock.calls[0][0]).toBe(unexpected);
  });

  it('does not call any res method when checkPermission throws', () => {
    checkPermission.mockImplementation(() => { throw new Error('boom'); });
    const res = makeRes();
    authorize(VALID_CAP)(makeReq(), res, jest.fn());
    expect(res.json).not.toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });
});

// ── req.user is not mutated ───────────────────────────────────────────────────

describe('authorize middleware — does not mutate req.user', () => {
  it('leaves req.user unchanged after an allowed request', () => {
    const user = { userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' };
    const req  = makeReq({ user });
    authorize(VALID_CAP)(req, makeRes(), jest.fn());
    expect(req.user).toEqual({ userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' });
    expect(Object.keys(req.user)).toHaveLength(3);
  });

  it('leaves req.user unchanged after a denied request', () => {
    checkPermission.mockReturnValue(false);
    const user = { userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' };
    const req  = makeReq({ user });
    authorize(VALID_CAP)(req, makeRes(), jest.fn());
    expect(req.user).toEqual({ userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' });
  });
});

// ── capability is closed over correctly ──────────────────────────────────────

describe('authorize middleware — capability is captured at factory time', () => {
  it('passes the capability given to the factory, not a later value', () => {
    const mw = authorize('projects:view');
    mw(makeReq(), makeRes(), jest.fn());
    expect(checkPermission.mock.calls[0][0].capability).toBe('projects:view');
  });

  it('two middleware instances use their own capability independently', () => {
    const mw1   = authorize('analytics:view');
    const mw2   = authorize('audit:view');
    const next1 = jest.fn();
    const next2 = jest.fn();
    mw1(makeReq(), makeRes(), next1);
    mw2(makeReq(), makeRes(), next2);
    expect(checkPermission.mock.calls[0][0].capability).toBe('analytics:view');
    expect(checkPermission.mock.calls[1][0].capability).toBe('audit:view');
  });
});

// ── Audit logging on explicit permission denial ───────────────────────────────

describe('authorize middleware — audit logging on denial', () => {
  beforeEach(() => checkPermission.mockReturnValue(false));

  it('calls logEvent once when checkPermission returns false', () => {
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent).toHaveBeenCalledTimes(1);
  });

  it('calls logEvent with action = permission.denied', () => {
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].action).toBe('permission.denied');
  });

  it('calls logEvent with resourceType = capability', () => {
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].resourceType).toBe('capability');
  });

  it('calls logEvent with resourceId = the required capability string', () => {
    authorize('audit:view')(makeReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].resourceId).toBe('audit:view');
  });

  it('calls logEvent with actorId = req.user.userId', () => {
    const req = makeReq({ user: { userId: 'user-77', role: VALID_ROLE } });
    authorize(VALID_CAP)(req, makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].actorId).toBe('user-77');
  });

  it('calls logEvent with metadata = { role: req.user.role }', () => {
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].metadata).toEqual({ role: VALID_ROLE });
  });

  it('calls logEvent with a Date instance for now', () => {
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].now).toBeInstanceOf(Date);
  });

  it('calls logEvent with db from req.app.locals.db', () => {
    const customDb = { query: jest.fn() };
    const req      = makeReq({ app: { locals: { db: customDb } } });
    authorize(VALID_CAP)(req, makeRes(), jest.fn());
    expect(logEvent.mock.calls[0][0].db).toBe(customDb);
  });

  it('still calls next(err) with FORBIDDEN after logEvent is triggered', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
    expect(next.mock.calls[0][0].message).toBe('Forbidden');
  });

  it('calls next exactly once even when logEvent is triggered', () => {
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('swallows logEvent rejection — next still called once with FORBIDDEN', async () => {
    logEvent.mockRejectedValue(new Error('audit db failure'));
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    await Promise.resolve(); // drain microtask queue so the .catch() runs
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].code).toBe('FORBIDDEN');
  });

  it('produces no unhandled rejection when logEvent rejects', async () => {
    logEvent.mockRejectedValue(new Error('db down'));
    const next = jest.fn();
    authorize(VALID_CAP)(makeReq(), makeRes(), next);
    await Promise.resolve(); // ensure the .catch() callback has executed
    // reaching here without a test failure means no unhandled rejection occurred
    expect(next).toHaveBeenCalledTimes(1);
  });
});

// ── logEvent NOT called on non-denial paths ───────────────────────────────────

describe('authorize middleware — logEvent not called outside the denial path', () => {
  it('does not call logEvent when checkPermission returns true (allowed)', () => {
    checkPermission.mockReturnValue(true);
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when req.user is absent', () => {
    authorize(VALID_CAP)(makeReq({ user: undefined }), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when req.user is null', () => {
    authorize(VALID_CAP)(makeReq({ user: null }), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when req.user.role is absent', () => {
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1' } }), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when req.user.role is empty string', () => {
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1', role: '' } }), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when req.user.role is null', () => {
    authorize(VALID_CAP)(makeReq({ user: { userId: 'u-1', role: null } }), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('does not call logEvent when checkPermission throws', () => {
    checkPermission.mockImplementation(() => { throw new Error('internal error'); });
    authorize(VALID_CAP)(makeReq(), makeRes(), jest.fn());
    expect(logEvent).not.toHaveBeenCalled();
  });
});
