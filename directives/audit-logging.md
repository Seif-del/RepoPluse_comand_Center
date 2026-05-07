# Audit Logging

**Layer:** 1 — Directive
**Domain:** Compliance / Observability
**Status:** Active — Phase 1

---

## Goal

Define what events must be audit logged, how logs are written, and how immutability
is enforced. This directive is the authoritative reference for audit log behavior.
Audit logs must satisfy the 7-year retention requirement (DATA-002, spec) and support
Compliance Auditor review via the `audit:view` capability.

---

## Inputs

- `actorId` — the user performing the action (use `0` for system-initiated events)
- `action` — past-tense string describing the event (see Event Table below)
- `resourceType` — category of the affected entity (`user`, `session`, `project`, `repository`)
- `resourceId` — identifier of the affected entity (integer or string)
- `metadata` — optional key-value context (e.g. `{ previousRole: 'intern', newRole: 'project_manager' }`)

---

## Outputs

- A new row appended to the `audit_logs` table
- No return value — `logEvent` is fire-and-forget safe but awaitable
- If the write fails: error is logged to the application logger; the calling request is NOT blocked

---

## Events That Must Be Logged

| Trigger | Action String | Resource Type |
|---|---|---|
| User logs in | `user.login` | `user` |
| User logs out | `user.logout` | `session` |
| User account auto-created on first login | `user.created` | `user` |
| User soft-deleted | `user.deleted` | `user` |
| User role changed | `permission.changed` | `user` |
| Incoming request denied by RBAC | `permission.denied` | varies |
| Repository linked to project | `repo.linked` | `repository` |
| Repository removed from project | `repo.unlinked` | `repository` |

---

## Rules

1. The `audit_logs` table exposes no UPDATE or DELETE operations anywhere in the codebase.
2. `execution/audit/logEvent.js` is the ONLY function that writes to `audit_logs`.
   No module accesses this table via a direct SQL query.
3. An audit log write failure must NEVER block, throw, or roll back the calling operation.
4. Audit log rows must be retained for a minimum of 7 years (DATA-002). No purge job
   may reference or touch the `audit_logs` table.
5. `actorId` of `0` is reserved for system-initiated events. Never use `0` for human actions.
6. The `metadata` column stores additional context as JSONB. It is optional but encouraged
   for events where context aids future investigation (e.g. old/new role values on `permission.changed`).

---

## Edge Cases

- **Audit write fails during login:** Log the failure with the application logger.
  Do not fail the login flow. The user receives a valid session.
- **Bulk permission changes:** Each individual user change generates a separate `audit_logs` row.
- **Compliance Auditor querying logs:** Read access is enforced by RBAC (`audit:view` capability).
  The Compliance Auditor role may never write to or delete from `audit_logs`.
- **System events (e.g. automated ingestion):** Use `actorId: 0` and set `resourceType`
  to the relevant entity. Include enough metadata to reconstruct what happened.

---

## Verification

A change to audit logging is complete when:

- [ ] Unit test: `logEvent` successfully appends a row (mocked DB write succeeds)
- [ ] Unit test: `logEvent` swallows the error when the DB write fails (no throw)
- [ ] Unit test: `logEvent` accepts missing `metadata` without error
- [ ] Integration test: login event produces a corresponding `audit_logs` row
- [ ] Code review: no direct `INSERT INTO audit_logs` query exists outside of `execution/audit/logEvent.js`
- [ ] Code review: no UPDATE or DELETE on `audit_logs` exists anywhere in the codebase
- [ ] Integration test: Compliance Auditor role can read audit logs; Intern role receives HTTP 403

**Implementation files:**
- `execution/audit/logEvent.js`
- `migrations/` (audit_logs table — added in Phase 7)
