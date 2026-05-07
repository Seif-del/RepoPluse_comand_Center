# RepoPulse Command Center

AI-assisted project intelligence platform for GitHub repository monitoring.

See `CLAUDE.md` for full architecture rules and agent operating contract.

---

## Prerequisites

- Node.js 18+
- PostgreSQL 14+
- Redis 6+ (required from Phase 3 onward)

---

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**
```bash
cp .env.example .env
# Open .env and fill in all required values before continuing.
```

**3. Run database migrations**
```bash
npm run db:migrate
```

**4. Start the development server**
```bash
npm run dev
```

---

## Running Tests

```bash
# Unit tests — no database or network required, safe to run anywhere
npm test

# Integration tests — requires a running PostgreSQL test database
# 1. Apply migrations against your test database first:
#      DATABASE_URL=postgres://...@localhost/repopulse_test npm run db:migrate
#
# 2. Set TEST_DATABASE_URL in .env to point at that test database.
#    The URL must contain 'test', 'local', or 'localhost' — integration tests
#    refuse to run against any other URL to protect production data.
#
#      TEST_DATABASE_URL=postgres://repopulse:password@localhost:5432/repopulse_test
#
# 3. Run:
npm run test:integration
#
# .env is loaded automatically via Node's --env-file flag — no manual export
# of TEST_DATABASE_URL is needed. TEST_INTEGRATION=true is set automatically
# by cross-env. When TEST_INTEGRATION is not set, integration tests are
# skipped (not failed) during normal npm test runs.
```

---

## Database Migrations

```bash
npm run db:migrate         # Apply all pending migrations
npm run db:migrate:down    # Roll back the most recent migration
npm run db:migrate:status  # Show which migrations have been applied
```

---

## Project Structure

```
agents/           Agent persona definitions (no executable code)
backend/          Express HTTP layer — routes and middleware only
config/           Environment wiring (no secrets)
directives/       SOPs and runbooks for each domain
execution/        All deterministic business logic
migrations/       Ordered database schema migrations
services/worker/  Background job workers (Phase 3+)
spec/             Requirements specification documents
tests/            All automated tests
tmp/              Scratch space — never committed
```

See `CLAUDE.md` for the rules governing each layer.
