'use strict';

jest.mock('../../../../execution/rbac/checkPermission');

const authorize             = require('../../../../backend/middleware/authorize');
const { checkPermission }   = require('../../../../execution/rbac/checkPermission');

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_CAP  = 'analytics:view';
const VALID_ROLE = 'project_manager';

function makeReq(overrides = {}) {
  return {
    user: { userId: 'u-1', role: VALID_ROLE, githubUsername: 'dev' },
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
