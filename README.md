# RepoPulse Command Center

AI-assisted project intelligence platform for GitHub repository monitoring.

See `CLAUDE.md` for full architecture rules and agent operating contract.

---

## Quick Start

Get a fully working RepoPulse instance running locally in under 10 minutes.

### 1. Clone the repository

```bash
git clone <repo-url>
cd RepoPluse_Comand_Center
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in the following required values:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string — `postgres://user:pass@localhost:5432/repopulse_dev` |
| `TOKEN_ENCRYPTION_KEY` | 32-byte hex key for encrypting GitHub tokens at rest (generate below) |
| `GITHUB_CLIENT_ID` | OAuth App client ID from GitHub |
| `GITHUB_CLIENT_SECRET` | OAuth App client secret from GitHub |
| `GITHUB_CALLBACK_URL` | Must match the callback URL registered in your GitHub OAuth App |

**Generate `TOKEN_ENCRYPTION_KEY`:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
Copy the output into `.env`. Keep this value secret — rotating it invalidates all stored tokens.

### 4. Create the database and run migrations

**macOS / Linux (bash):**
```bash
# Create the database (if it does not exist yet)
# The name must match the database in DATABASE_URL (repopulse_dev by default in .env.example)
createdb repopulse_dev

# Load env vars, then apply all migrations
export $(grep -v '^#' .env | xargs) && npm run db:migrate
```

**Windows (PowerShell):**
```powershell
# Create the database — run in a psql session or pgAdmin query tool:
#   CREATE DATABASE repopulse_dev;

# Set DATABASE_URL for this shell session, then migrate
$env:DATABASE_URL = "postgres://repopulse:yourpassword@localhost:5432/repopulse_dev"
npm run db:migrate
```

> **Node.js 20.6+ alternative (cross-platform):**
> ```bash
> node --env-file=.env ./node_modules/.bin/node-pg-migrate -m migrations up
> ```

This creates seven tables: `users`, `sessions`, `audit_logs`, `repositories`, `repo_metrics`, `risk_scores`, and the migration tracking table (`pgmigrations`).

> **Already ran some migrations?** That is fine — `npm run db:migrate` only applies unapplied ones. Run `npm run db:migrate:status` to see which have been applied.

### 5. Register a GitHub OAuth App

1. Go to **GitHub → Settings → Developer Settings → OAuth Apps → New OAuth App**
2. Set **Authorization callback URL** to `http://localhost:3000/auth/github/callback`
3. Copy the **Client ID** and generate a **Client Secret**
4. Paste both into `.env` as `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`

### 6. Start the development server

```bash
# Load .env into the shell, then start
export $(grep -v '^#' .env | xargs) && npm run dev
```

The server starts on `http://localhost:3000` (or the port set in `PORT`).

> **Note for Node.js 20.6+:** You can use `node --env-file=.env backend/server.js` instead of the `export` approach.

### 7. Log in and sync your repositories

1. Open `http://localhost:3000/auth/github` in your browser to start the OAuth flow
2. Authorize the app on GitHub — you will be redirected back to the dashboard
3. Click **Sync Now** on the dashboard
4. RepoPulse will fetch your repositories, compute risk scores, and display results

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
