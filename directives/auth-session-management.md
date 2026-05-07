# Auth: Session Management

**Layer:** 1 — Directive
**Domain:** Authentication
**Status:** Active — Phase 1

---

## Goal

Define how the system authenticates users via GitHub OAuth, creates and manages sessions,
and enforces session expiry. This is the authoritative reference for all session-related
behavior in the system.

---

## Inputs

- GitHub OAuth authorization code (from the GitHub callback redirect)
- GitHub OAuth access token (exchanged for the authorization code)
- GitHub user profile (fetched from the GitHub API using the access token)
- Incoming HTTP request session token (from Bearer header or secure cookie)

---

## Outputs

- New `users` row (created automatically on first successful login)
- Hashed session token stored in the `sessions` table
- Raw session token returned to the client as a secure response (never stored)
- HTTP 401 response for missing, invalid, or expired tokens
- Audit log entry on every login and logout event via `execution/audit/logEvent.js`

---

## Rules

1. GitHub OAuth is the only authentication method in MVP.
2. Users are auto-created on first successful login using their GitHub profile data
   (`github_id`, `github_username`, `email`). Default role is `intern`.
3. Raw session tokens must NEVER be stored in the database. Only the SHA-256 hash
   is written, via `execution/auth/hashToken.js`.
4. Sessions use a rolling inactivity window. Every successful `validateSession` call
   sets both `last_active_at = now` and refreshes `expires_at = now + sessionExpiryHours`.
   A session is invalid when its stored `expires_at <= now`. If a session goes unused
   for `sessionExpiryHours` hours, it will not be refreshed and will expire on the next
   request. `validateSession` returns the refreshed `expiresAt`, not the previously
   stored value.
5. Tokens must be transmitted over HTTPS only (enforced at infrastructure level).
6. A soft-deleted user (`deleted_at IS NOT NULL`) must not be granted a new session.

---

## Edge Cases

- **GitHub OAuth failure:** If GitHub returns an error in the callback query string,
  do not create a session. Log the failure and return a user-facing error.
- **Duplicate GitHub login:** If a `users` row for the `github_id` already exists
  (including soft-deleted), use or restore the existing record — do not insert a duplicate.
- **Concurrent sessions:** A user may hold multiple active sessions (e.g., different browsers).
  All are valid until individually expired or the user is deleted.
- **Expired session on request:** Return HTTP 401. Do not silently extend an expired session.
- **Missing token on protected route:** Return HTTP 401. Do not reveal whether the route exists.
- **Tampered token:** SHA-256 lookup will produce no match. Return HTTP 401 with the same
  generic message as any other invalid token — never distinguish failure reasons to the client.

---

## Verification

A change to authentication is complete when:

- [ ] Unit tests for `createSession`, `validateSession`, and `hashToken` pass
- [ ] No raw token string appears in any database write query
- [ ] Integration test: full OAuth callback → session creation → authenticated request succeeds
- [ ] Integration test: expired session returns HTTP 401
- [ ] Integration test: request with no token returns HTTP 401
- [ ] Integration test: soft-deleted user cannot create a session
- [ ] All login and logout events appear as rows in `audit_logs`

**Implementation files:**
- `execution/auth/createSession.js`
- `execution/auth/validateSession.js`
- `execution/auth/hashToken.js`
- `backend/middleware/authenticate.js`
- `backend/routes/authRoutes.js`
- `migrations/0001_create_users.js`
- `migrations/0002_create_sessions.js`
