# RBAC: Permission Model

**Layer:** 1 — Directive
**Domain:** Access Control
**Status:** Active — Phase 1

---

## Goal

Define the role-based access control model for the MVP. Specify the four user roles,
their permitted capabilities, and how unauthorized access is handled. This is the
authoritative reference for all permission decisions in the system.

---

## Inputs

- Authenticated user object attached to `req.user` by `authenticate` middleware
- Required capability string declared on the route (e.g. `'analytics:view'`)
- Role-to-capability mapping defined in `execution/rbac/roles.js`

---

## Outputs

- **Access granted:** request proceeds to the route handler, `next()` called
- **Access denied:** HTTP 403 response with consistent JSON error shape
- Audit log entry for every permission denial via `execution/audit/logEvent.js`
  (action: `permission.denied`)

---

## Roles and Capabilities

### Project Manager (`project_manager`)
**Capabilities:** `projects:view`, `projects:configure`, `repositories:configure`,
`analytics:view`, `risk:view`, `recommendations:view`, `interns:manage`,
`notifications:receive`, `dashboard:view`
**Restriction:** Cannot modify system-level settings.

### Intern (`intern`)
**Capabilities:** `projects:view`, `metrics:view`, `feedback:view`, `activity:view`,
`dashboard:view`
**Restrictions:** Cannot access system analytics, cannot configure repositories,
cannot manage users.

### Stakeholder (`stakeholder`)
**Capabilities:** `dashboard:view`, `analytics:summary:view`, `projects:status:view`
**Restrictions:** No editing permissions. No repository configuration permissions.

### Compliance Auditor (`compliance_auditor`)
**Capabilities:** `audit:view`, `access-history:view`, `permissions:view`
**Restrictions:** No operational editing permissions.

---

## Rules

1. All protected routes must declare their required capability string explicitly when
   registering the `authorize` middleware.
2. Unauthorized access returns HTTP 403 — never 401 (reserved for missing authentication).
3. HTTP 403 responses must not reveal the route path, resource, or missing capability.
4. Permission checks are enforced on the server. Frontend role-based UI hiding is for
   user experience only and must never be relied upon as a security boundary.
5. Role assignments are stored on the `users.role` column. Any change to a user's role
   must be audit logged (action: `permission.changed`).
6. The capability list is static in MVP. It lives in `execution/rbac/roles.js` as code
   constants — not in the database.
7. If a route is added without an explicit `authorize` call, it must default to denying
   access (fail closed), not granting it (fail open).

---

## Edge Cases

- **Unknown role in token:** Treat as no-role. Return HTTP 403.
- **Soft-deleted user:** The `authenticate` middleware detects `deleted_at` and returns
  HTTP 401 before RBAC is evaluated. RBAC never sees a deleted user.
- **Public route with authorize applied:** Do not apply `authorize` to public routes
  (e.g., `/api/auth/*`). This must be caught in code review.
- **Unrecognised capability string:** `checkPermission` returns `false` (fail closed).

---

## Verification

A change to RBAC is complete when:

- [ ] Unit tests for `checkPermission` cover all four roles against capabilities they
      hold and do not hold
- [ ] Unit test: `checkPermission` returns `false` for an unknown role (does not throw)
- [ ] Unit test: `checkPermission` returns `false` for an unrecognised capability string
- [ ] Integration test: HTTP 403 returned for each role attempting a restricted action
- [ ] Integration test: soft-deleted user is rejected before RBAC is evaluated (HTTP 401)
- [ ] Integration test: permission denial produces a row in `audit_logs`

**Implementation files:**
- `execution/rbac/roles.js`
- `execution/rbac/checkPermission.js`
- `backend/middleware/authorize.js`
