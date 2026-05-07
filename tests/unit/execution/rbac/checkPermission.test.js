'use strict';

const { checkPermission }  = require('../../../../execution/rbac/checkPermission');
const { ROLES, ROLE_CAPABILITIES } = require('../../../../execution/rbac/roles');

// Shorthand to reduce repetition in permission assertions.
const allows = (role, capability) => checkPermission({ role, capability });

// ── Project Manager ───────────────────────────────────────────────────────────

describe('checkPermission — Project Manager', () => {
  const PM = ROLES.PROJECT_MANAGER;

  it.each([
    'projects:view',
    'projects:configure',
    'repositories:configure',
    'analytics:view',
    'risk:view',
    'recommendations:view',
    'interns:manage',
    'notifications:receive',
    'dashboard:view',
  ])('returns true for %s', (cap) => {
    expect(allows(PM, cap)).toBe(true);
  });

  it.each([
    'audit:view',
    'permissions:view',
    'access-history:view',
    'analytics:summary:view',
    'metrics:view',
    'projects:status:view',
  ])('returns false for %s', (cap) => {
    expect(allows(PM, cap)).toBe(false);
  });
});

// ── Intern ────────────────────────────────────────────────────────────────────

describe('checkPermission — Intern', () => {
  const INTERN = ROLES.INTERN;

  it.each([
    'projects:view',
    'metrics:view',
    'feedback:view',
    'activity:view',
    'dashboard:view',
  ])('returns true for %s', (cap) => {
    expect(allows(INTERN, cap)).toBe(true);
  });

  it.each([
    'projects:configure',
    'repositories:configure',
    'analytics:view',
    'audit:view',
    'permissions:view',
    'interns:manage',
    'notifications:receive',
    'analytics:summary:view',
  ])('returns false for %s', (cap) => {
    expect(allows(INTERN, cap)).toBe(false);
  });
});

// ── Stakeholder ───────────────────────────────────────────────────────────────

describe('checkPermission — Stakeholder', () => {
  const SH = ROLES.STAKEHOLDER;

  it.each([
    'dashboard:view',
    'analytics:summary:view',
    'projects:status:view',
  ])('returns true for %s', (cap) => {
    expect(allows(SH, cap)).toBe(true);
  });

  it.each([
    'projects:view',
    'projects:configure',
    'repositories:configure',
    'analytics:view',
    'audit:view',
    'metrics:view',
    'interns:manage',
  ])('returns false for %s', (cap) => {
    expect(allows(SH, cap)).toBe(false);
  });
});

// ── Compliance Auditor ────────────────────────────────────────────────────────

describe('checkPermission — Compliance Auditor', () => {
  const CA = ROLES.COMPLIANCE_AUDITOR;

  it.each([
    'audit:view',
    'access-history:view',
    'permissions:view',
  ])('returns true for %s', (cap) => {
    expect(allows(CA, cap)).toBe(true);
  });

  it.each([
    'projects:view',
    'projects:configure',
    'repositories:configure',
    'analytics:view',
    'dashboard:view',
    'metrics:view',
    'interns:manage',
  ])('returns false for %s', (cap) => {
    expect(allows(CA, cap)).toBe(false);
  });
});

// ── Unknown role and capability (fail-closed) ─────────────────────────────────

describe('checkPermission — unknown role or capability', () => {
  it('returns false for a completely unknown role string', () => {
    expect(allows('super_admin', 'projects:view')).toBe(false);
  });

  it('returns false for a role string that is a substring of a real role', () => {
    expect(allows('intern_plus', 'projects:view')).toBe(false);
  });

  it('returns false for an unknown capability on a known role', () => {
    expect(allows(ROLES.PROJECT_MANAGER, 'nonexistent:action')).toBe(false);
  });

  it('returns false for a capability that is a substring of a real capability', () => {
    expect(allows(ROLES.PROJECT_MANAGER, 'projects')).toBe(false);
  });

  it('returns false for an unknown role AND unknown capability (does not throw)', () => {
    expect(() => allows('ghost', 'ghost:action')).not.toThrow();
    expect(allows('ghost', 'ghost:action')).toBe(false);
  });

  it('returns false, not null or undefined, for unknown role', () => {
    expect(allows('unknown_role', 'projects:view')).toBe(false);
  });

  it('returns false, not null or undefined, for unknown capability', () => {
    expect(allows(ROLES.INTERN, 'no:such:capability')).toBe(false);
  });
});

// ── INVALID_ROLE ──────────────────────────────────────────────────────────────

describe('checkPermission — INVALID_ROLE', () => {
  const VALID_CAP = 'projects:view';

  const cases = [
    ['null',           null],
    ['undefined',      undefined],
    ['a number',       42],
    ['a boolean',      true],
    ['an object',      {}],
    ['an empty string', ''],
    ['whitespace-only', '   '],
  ];

  cases.forEach(([label, role]) => {
    it(`throws with code INVALID_ROLE when role is ${label}`, () => {
      expect(() => checkPermission({ role, capability: VALID_CAP }))
        .toThrow(expect.objectContaining({ code: 'INVALID_ROLE', message: 'role must be a non-empty string' }));
    });
  });
});

// ── INVALID_CAPABILITY ────────────────────────────────────────────────────────

describe('checkPermission — INVALID_CAPABILITY', () => {
  const VALID_ROLE = ROLES.PROJECT_MANAGER;

  const cases = [
    ['null',           null],
    ['undefined',      undefined],
    ['a number',       0],
    ['a boolean',      false],
    ['an array',       []],
    ['an empty string', ''],
    ['whitespace-only', '\t\n'],
  ];

  cases.forEach(([label, capability]) => {
    it(`throws with code INVALID_CAPABILITY when capability is ${label}`, () => {
      expect(() => checkPermission({ role: VALID_ROLE, capability }))
        .toThrow(expect.objectContaining({ code: 'INVALID_CAPABILITY', message: 'capability must be a non-empty string' }));
    });
  });
});

// ── Validation ordering: role is checked before capability ────────────────────

describe('checkPermission — validation is ordered role then capability', () => {
  it('throws INVALID_ROLE (not INVALID_CAPABILITY) when both are invalid', () => {
    let caught;
    try { checkPermission({ role: null, capability: null }); } catch (err) { caught = err; }
    expect(caught.code).toBe('INVALID_ROLE');
  });
});

// ── Called with no arguments ──────────────────────────────────────────────────

describe('checkPermission — called with no arguments', () => {
  it('throws INVALID_ROLE when called with no argument', () => {
    expect(() => checkPermission())
      .toThrow(expect.objectContaining({ code: 'INVALID_ROLE' }));
  });

  it('throws INVALID_ROLE when called with an empty object', () => {
    expect(() => checkPermission({}))
      .toThrow(expect.objectContaining({ code: 'INVALID_ROLE' }));
  });
});

// ── No mutation of role definitions ──────────────────────────────────────────

describe('checkPermission — does not mutate role definitions', () => {
  it('does not change the size of any capability set after a true result', () => {
    const sizesBefore = Object.fromEntries(
      Object.entries(ROLE_CAPABILITIES).map(([r, s]) => [r, s.size])
    );
    allows(ROLES.PROJECT_MANAGER, 'projects:view');
    allows(ROLES.INTERN, 'metrics:view');
    allows(ROLES.STAKEHOLDER, 'dashboard:view');
    allows(ROLES.COMPLIANCE_AUDITOR, 'audit:view');
    const sizesAfter = Object.fromEntries(
      Object.entries(ROLE_CAPABILITIES).map(([r, s]) => [r, s.size])
    );
    expect(sizesAfter).toEqual(sizesBefore);
  });

  it('does not change the size of any capability set after a false result', () => {
    const sizesBefore = Object.fromEntries(
      Object.entries(ROLE_CAPABILITIES).map(([r, s]) => [r, s.size])
    );
    allows(ROLES.INTERN, 'audit:view');
    allows(ROLES.STAKEHOLDER, 'repositories:configure');
    allows('unknown_role', 'projects:view');
    const sizesAfter = Object.fromEntries(
      Object.entries(ROLE_CAPABILITIES).map(([r, s]) => [r, s.size])
    );
    expect(sizesAfter).toEqual(sizesBefore);
  });

  it('known capabilities still resolve correctly after multiple calls', () => {
    for (let i = 0; i < 5; i++) {
      expect(allows(ROLES.PROJECT_MANAGER, 'analytics:view')).toBe(true);
      expect(allows(ROLES.INTERN, 'analytics:view')).toBe(false);
    }
  });
});
