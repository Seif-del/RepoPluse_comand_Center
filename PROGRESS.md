# PROGRESS.md
**RepoPulse Command Center — Repository Development Ledger**

This is the authoritative implementation-state and maturity tracking file for RepoPulse Command Center.  
It is maintained per the contract defined in `CLAUDE.md`.  
Last updated: **2026-06-17** (FR-009 repository name search — backend + frontend integrated)

---

## Repository Status Classification

**Current Phase:** Phase 5–7 (partial) — Architecture Intelligence complete; Real-Time accepted (ADR-002); Notifications integrated + partially verified (worker routing verified 2026-06-12; positive send paths + payload content unit-tested 2026-06-14; nodemailer dependency placement resolved 2026-06-15; SMTP sandbox delivery verified via Mailhog 2026-06-15; production relay unverified; in-app persistence layer scaffolded + unit-tested 2026-06-16; sendAlert.js wired to writeNotification 2026-06-16; snapshotWorker wired to pass db pool 2026-06-16 — in-app channel runtime-active when DATABASE_URL configured; notification API routes added 2026-06-16; dashboard notification UI added 2026-06-16 — in-app channel fully implemented across all layers); Operational Resilience incomplete; CI workflow operational (2026-06-13); Playwright E2E toolchain scaffolded 2026-06-16 (`@playwright/test` installed, `playwright.config.js` created, `test:e2e` script added); Playwright webServer startup hardened 2026-06-16 (`cross-env PROJECT_SOURCE=file npm run dev`); first Playwright dashboard smoke tests passing 2026-06-16 (`tests/e2e/dashboard.smoke.spec.js` — 8/8 tests passing; unauthenticated path verified in Chromium headless; authenticated E2E and DB-seeded notification E2E absent); Playwright authenticated session bootstrap complete 2026-06-17 (`tests/e2e/globalSetup.js` added — seeds `upsertUser` + `createSession` against test DB; storageState saved to `tests/e2e/.auth/user.json`; `playwright.config.js` wired; `tests/e2e/.auth/` gitignored; no test-only route added; no production auth logic modified; verified `node tests/e2e/globalSetup.js` → exit 0); **authenticated notification E2E browser-tested 2026-06-17** (`tests/e2e/notifications.authenticated.spec.js` — 2/2 passing in Chromium headless: unread badge visible + count=1 verified, panel opens + title + HIGH badge visible, mark-read PATCH 200 verified, badge `hidden=""` + empty text verified on re-fetch; real session cookie via storageState; real DB-seeded notification row; real `GET /api/notifications` + `PATCH /api/notifications/:id/read` exercised; no production code changed; `#notif-badge` CSS visual-hide defect **resolved 2026-06-17** — added `#notif-badge[hidden] { display: none !important }` CSS rule; `not.toBeVisible()` assertion now passes; 10/10 E2E passing); **FR-009 repository name search integrated 2026-06-17** — backend `?search=` param with ILIKE + 200-char limit + HTTP 400 on invalid; frontend `#repo-search-input` in filter bar; `buildReposUrl` supports riskLevel + search composition; 260/260 backend route tests + 53/53 frontend filter tests passing  
**Overall Maturity:** Partially Implemented / Integrated  
**Test Status:** 6,642 / 6,674 passing under `npm test` (32 skipped = 25 integration DB + 7 SMTP opt-in; 0 failing) — updated 2026-06-17 (+24 new tests: 8 backend search unit + 6 backend search HTTP contract + 10 frontend search filter/load); SMTP integration suite (`tests/integration/notifications.smtp.integration.test.js`, 7 tests) adds 7 opt-in tests (skipped under `npm test`, 7/7 passing with `TEST_INTEGRATION=true` + Mailhog running)  
**PROGRESS.md Status:** Created 2026-06-12 (first creation — was absent, violating CLAUDE.md Creation Rule)  
**CI Status:** `.github/workflows/ci.yml` added 2026-06-13 — triggers on push to any branch and PR to main; Node 20; `npm ci` + `npm test`; `NODE_ENV=test`; no secrets; integration tests self-skip (no `TEST_INTEGRATION`) — **first successful run 2026-06-13** (commit `4e58590`, push trigger, 32 s, 6,494/6,519 tests passed on ubuntu-latest)

---

## Deliverable Alignment Summary

**Authoritative spec:** `spec/01_requirements.md`, `spec/02_system_specification.md`  
**Stated purpose:** Provide project managers with real-time visibility into project health, GitHub activity, intern performance signals, and risk indicators.

| Requirement | Description | Status |
|---|---|---|
| FR-001 | GitHub OAuth Authentication | Integrated |
| FR-002 | Role-Based Access Control | Integrated |
| FR-003 | Project Dashboard | Integrated (architecture intelligence far exceeds MVP scope) |
| FR-004 | GitHub Data Ingestion | Integrated |
| FR-005 | Rule-Based Risk Scoring | Integrated |
| FR-006 | Recommendations | Integrated |
| FR-007 | Real-Time Dashboard Updates | ✅ **ACCEPTED (2026-06-12)** — 60-second polling satisfies "no manual refresh" acceptance criterion for Phases 1–5; WebSocket deferred to Phase 6+ — see ADR-002 |
| FR-008 | Notifications (in-app + email) | **Integrated / Partially Verified** — email + Slack channels implemented; SMTP delivery verified via Mailhog sandbox 2026-06-15 (7/7 integration tests); production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only); **in-app persistence layer scaffolded 2026-06-16** (`migrations/0013_create_notifications.js` + `execution/notifications/writeNotification.js`; 54 unit tests); **sendAlert.js wired to in-app 2026-06-16** (fans out `writeNotification` per active user; 16 unit tests; failure-isolated); **snapshotWorker wired to pass db 2026-06-16** (`startSnapshotWorker(db)` → `sendAlert(snapshot, { db })`; in-app channel runtime-active; 7/7 worker tests); **notification API routes added 2026-06-16** (`GET /api/notifications` user-scoped + unreadCount, `PATCH /api/notifications/:id/read` marks owned notifications READ, 17/17 route tests); **dashboard notification UI added 2026-06-16** (topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in 60-second `refresh()` loop, `markNotificationRead(id)` → PATCH, `toggleNotificationPanel()`, 29/29 frontend tests; unauthenticated users see no error; **unauthenticated E2E smoke verified 2026-06-16** (bell visible, panel hidden, bell toggle, no JS errors — 8/8 passing in Chromium headless); **authenticated notification UI E2E browser-tested 2026-06-17** (`tests/e2e/notifications.authenticated.spec.js`; 2/2 passing in Chromium headless: unread badge visible + count=1, panel opens, title + `.aq-badge.severity-high` visible, mark-read PATCH 200 verified, badge `hidden=""` + empty text on re-fetch; real session cookie, real DB-seeded notification row, real `GET /api/notifications` + `PATCH /api/notifications/:id/read` exercised; no production code changed); ~~`#notif-badge` visual-hide CSS defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added to `frontend/dashboard.html`; Playwright `not.toBeVisible()` assertion now passes (10/10 E2E); remaining: no production SMTP relay verification, no Slack webhook verification) |
| FR-009 | Search and Filtering | Partially Implemented — Risk-level filtering + Repository name search: **Integrated / Tested** (2026-06-17); label/risk filter tested (29/29); backend route tests 260/260; frontend filter/load tests 53/53; At Risk semantics unchanged: client-side `critical \|\| at-risk` (by design in Option A); **repository name search added 2026-06-17**: `?search=` param with ILIKE on `github_full_name`, 200-char limit, HTTP 400 on invalid, `#repo-search-input` in filter bar, `buildReposUrl` supports riskLevel + search composition; 4 spec dimensions still absent: project status, assigned manager, activity recency, intern contributor |
| FR-010 | Audit Logging | Integrated |
| NFR-001 | Performance | Partially Verified — no load tests; dashboard polls every 60 s |
| NFR-002 | Availability | Not formalized — no uptime monitoring, no SLA tooling |
| NFR-003 | Security | Integrated — OAuth, encrypted tokens, RBAC, HTTPS-ready |
| NFR-004 | Reliability | Partial — no retry/backoff on snapshot worker; no queue durability |
| NFR-005 | Observability | Partial — structured logger exists; no metrics pipeline |
| NFR-006 | Scalability | Not verified — single-instance architecture |
| NFR-007 | Data Governance (deletion, archival, export) | Not found in repository |

---

## Architecture Divergences from Spec

These are known, documented divergences between `spec/` and the current implementation.  
They are not bugs — they are implementation decisions that have been formally accepted or are pending acceptance.

| Spec Constraint | Spec Says | Current Implementation | Decision |
|---|---|---|---|
| Constraint #4 | "Frontend must use React" | Vanilla HTML + JS (`frontend/dashboard.html`) | ✅ **ACCEPTED (2026-06-12)** — vanilla JS for Phases 1–5; React migration deferred to Phase 6+. Trigger: FR-007 WebSocket implementation, dashboard complexity threshold, or shared multi-page components. See `docs/adr/ADR-001-frontend-technology.md`. |
| FR-007 / spec | WebSocket for real-time updates | `setInterval(refresh, 60000)` — polling | Accept polling or implement WebSocket |
| Spec tech stack | "Redis Queue or RabbitMQ" for background jobs | `setInterval` in `snapshotWorker.js` | Accept polling worker or introduce queue |
| Spec tech stack | "ORM: Prisma or Sequelize" | Raw `pg` queries | Accept raw pg or introduce ORM |

---

## Capability Inventory

### Phase 0 — Foundation Setup
- **Status:** Production Ready
- Repository structure, layer boundaries, environment configuration, migration tooling, `.env.example`, one-command test execution (`npm test`) all in place.
- `PROGRESS.md` was absent until 2026-06-12 — now created.
- `.github/workflows/ci.yml` added 2026-06-13 — minimal GitHub Actions CI; no secrets; no DB/Redis/Slack/SMTP dependencies; integration tests excluded by design (self-skip without `TEST_INTEGRATION`).

#### CI Workflow — `.github/workflows/ci.yml`
- **Deliverable status:** Required (operational readiness layer)
- **Trigger:** push to any branch; pull_request to main
- **Runtime:** ubuntu-latest, Node 20
- **Steps:** `actions/checkout@v4` → `actions/setup-node@v4` (npm cache) → `npm ci` → `npm test`
- **Environment:** `NODE_ENV=test` (no database, no external service secrets)
- **Integration tests:** excluded — jest.config.js discovers them but they self-skip when `TEST_INTEGRATION` is unset
- **Local dry-run (2026-06-13):** `NODE_ENV=test npm test` → 6,494/6,519 passing; 25 skipped (integration); 2 suites skipped (integration); all coverage thresholds met (≥80% across branches/functions/lines/statements)
- **First GitHub Actions run (2026-06-13):** commit `4e58590`; push trigger; ubuntu-latest; Node 20; `npm ci` + `npm test`; status: **Success**; runtime: 32 s; 6,494/6,519 tests passed; 25 skipped (integration, self-skipped — no `TEST_INTEGRATION`); no secrets used; coverage thresholds met
- **Integration tests in CI:** opt-in only — not part of CI run; require live PostgreSQL via `TEST_INTEGRATION=true`; always self-skip in current workflow
- **Overall maturity:** Verified — unit tests pass on GitHub-hosted runners; integration layer intentionally opt-in and not yet automated in CI

---

### Phase 1 — Authentication & RBAC
- **Status:** Integrated / Tested
- **Capability:** GitHub OAuth Authentication (FR-001)
  - `execution/auth/exchangeOAuthCode.js` — OAuth code exchange
  - `execution/auth/upsertUser.js` — user creation/update
  - `execution/auth/createSession.js`, `validateSession.js`, `invalidateSession.js`
  - `execution/crypto/encryptToken.js` — token encryption at rest
  - `backend/routes/authRoutes.js` — `/auth/github`, `/auth/github/callback`, `/auth/logout`
  - `backend/middleware/authenticate.js`, `authorize.js`
- **Capability:** RBAC (FR-002)
  - `execution/rbac/roles.js` — role definitions (Admin, Project Manager, Intern, Stakeholder, Compliance Auditor)
  - `execution/rbac/checkPermission.js`
- **Tests:** Unit tests pass for all auth and RBAC modules.
- **Gaps:** No Playwright tests for OAuth flow; integration tests require live PostgreSQL.

---

### Phase 2 — Core Data Layer
- **Status:** Integrated / Tested
- 13 migrations defined (up to `0013_create_notifications.js`; 0013 not yet applied to any environment — DDL only):
  `users`, `sessions`, `audit_logs`, `repositories`, `repo_metrics`, `risk_scores`, `repo_pr_metrics`, `repo_architecture_snapshots`, `notifications`
- Raw `pg` query layer (`execution/db.js`)
- `execution/audit/logEvent.js` — audit logging (FR-010)
- **Tests:** Unit tests for db module and logEvent pass.
- **Gaps:** No ORM (spec says Prisma or Sequelize — accepted divergence). Integration tests skip unless `TEST_DATABASE_URL` is configured.

---

### Phase 3 — GitHub Integration
- **Status:** Integrated / Tested
- **Capability:** GitHub Data Ingestion (FR-004)
  - `execution/github/fetchRepo.js`, `fetchRepoMetrics.js`, `fetchCiStatus.js`, `fetchContributorInfo.js`, `fetchPullRequestHealth.js`, `fetchReleaseInfo.js`, `fetchRepositoryFiles.js`, `fetchUserRepos.js`
  - `execution/github/syncUserRepos.js` — sync repos to DB
  - `execution/syncGithubProjects.js` — full project sync pipeline
  - `backend/routes/repoRoutes.js` — `POST /api/repos/sync`, `POST /api/repos/register`
- **Tests:** Unit tests pass for all GitHub fetchers and sync logic.
- **Gaps:** No rate-limit retry/backoff for GitHub API (NFR-004 partial). No integration tests for live GitHub calls.

---

### Phase 4 — Dashboard & Metrics
- **Status:** Integrated / Tested
- **Capability:** Project Dashboard (FR-003)
  - `frontend/dashboard.html` — single-file dashboard (~8,240 lines, vanilla JS)
  - Summary KPI cards (architecture, governance, forecast, watchlist, critical repos, snapshot coverage)
  - Portfolio tabs: Architecture, Portfolio Forecast, Engineering Governance, Architecture Watchlists
  - Repository table with label/priority display and filtering
  - Repository detail tabs: Overview, Architecture, Forecast, Timeline, Remediation
  - Risk score history chart
  - Operational changes and anomaly feed
  - Executive Briefing card (verbose multi-column, below portfolio tabs)
  - Portfolio Briefing card (compact bullets, above portfolio tabs)
  - Auto-refresh every 60 seconds
  - Notification bell (`#notif-btn`) + unread badge (`#notif-badge`) in topbar; `#notification-section` panel in page flow; `loadNotifications()` wired into 60-second `refresh()` loop; `markNotificationRead(id)` → `PATCH /api/notifications/:id/read`; `toggleNotificationPanel()` shows/hides panel; `notificationPriorityClass()`, `buildNotificationBadgeText()`, `buildNotificationListHtml()` pure renderers (added 2026-06-16)
- **Capability:** Recommendations (FR-006)
  - Top Remediation Actions card in Remediation tab
  - Recent Regressions card in Remediation tab
  - Recent Version Changes card in Remediation tab
  - Top Risk Drivers (sorted by contribution)
- **Capability:** Search and Filtering (FR-009 — Partially Implemented; risk-level filtering + repository name search: Integrated / Tested)
  - Label filter: All / At Risk / Healthy (client-side, `applyFilter()` in `frontend/dashboard.html`)
  - Backend riskLevel filter: `GET /api/repos?riskLevel=healthy|at-risk|critical` — user-scoped SQL filter (`AND ($2::varchar IS NULL OR rs.label = $2)`); invalid values return HTTP 400 without hitting db; absent param returns all repos (backward compatible); RBAC boundary preserved
  - **Backend repository name search (added 2026-06-17):** `GET /api/repos?search=<term>` — `search` extracted from `req.query`; validated (non-string → 400; trimmed length > 200 → 400; db.query not called for invalid); trimmed before SQL; SQL clause `AND ($3::varchar IS NULL OR r.github_full_name ILIKE '%' || $3 || '%')`; `$2` (riskLevel) position preserved; `riskLevel + search` can be combined; authorization unchanged (`WHERE r.user_id = $1 AND r.is_active = true`)
  - Frontend integration (Option A, 2026-06-12): `buildReposUrl(options)` and `filterToLoadOptions(activeFilter)` pure helpers; Healthy filter calls `GET /api/repos?riskLevel=healthy`; All and At Risk intentionally call without riskLevel (At Risk semantics preserved: client-side `critical || at-risk`)
  - **Frontend repository search (added 2026-06-17):** `<input type="search" id="repo-search-input" placeholder="Search repositories…">` added to `.filter-bar`; `buildReposUrl` rewritten to build `params[]` array — appends `riskLevel=<encoded>` then `search=<encoded>`; trims search before encoding; omits when empty after trim; filter button click handler merges current search value with `filterToLoadOptions` result; `input` event listener on `#repo-search-input` calls `loadRepos()` on every keystroke; At Risk + search passes `{ search: term }` (no riskLevel) — client-side predicate still applies
  - Tests: `tests/unit/frontend/dashboardFilter.test.js` — **29/29 passing** (added 2026-06-12); covers All, At Risk, Healthy, empty result, count display
  - Tests: `tests/unit/backend/routes/repoRoutes.test.js` — **244/244 passing** (updated 2026-06-17: 8 new search filter tests added; 4 existing riskLevel parameter array assertions updated from 2-element to 3-element)
  - Tests: `tests/unit/frontend/dashboardFilterLoad.test.js` — **24/24 passing** (updated 2026-06-17: `buildReposUrl` verbatim copy updated; 7 new search-parameter tests + 3 new filter+search composition tests; was 14/14)
  - Tests: `tests/unit/backend/routes/repoRoutes.http.test.js` — **16/16 passing** (updated 2026-06-17: 6 new search HTTP contract tests added; 2 existing param array assertions updated to 3-element; was 10/10)
  - Missing: At Risk toggle intentionally uses client-side `critical || at-risk` (by design in Option A); filter by assigned manager, activity recency, intern contributor, project status absent; SQL filter correctness against real PostgreSQL unverified (no integration test yet — both `rs.label = $2` and `ILIKE '%' || $3 || '%'` clauses unproven against live DB)
- **Tests:** 17 frontend unit test files; all pure renderer and filter functions covered.
- **Gaps:** ~~No Playwright / E2E toolchain~~ — **scaffolded 2026-06-16** (`@playwright/test` installed, `playwright.config.js` created, `test:e2e` script added); ~~no E2E test files~~ — **first smoke tests passing 2026-06-16** (`tests/e2e/dashboard.smoke.spec.js`; 8/8 unauthenticated; Chromium headless; `npm run test:e2e` exits 0 in 14.8 s); ~~authenticated E2E requires a session seeding strategy~~ — **session bootstrap complete 2026-06-17** (`tests/e2e/globalSetup.js` seeds `upsertUser` + `createSession`; storageState to `tests/e2e/.auth/user.json`; gitignored; no backend route added); ~~authenticated dashboard E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` added (2/2 passing); ~~DB-seeded notification panel E2E not yet written~~ — **resolved 2026-06-17**: direct SQL seeding + storageState + badge count + mark-read PATCH flow verified in Chromium headless; ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` added; `not.toBeVisible()` passes; 10/10 E2E. FR-009 multi-dimension filter not implemented. Vanilla JS frontend is accepted for Phases 1–5 (see ADR-001).

---

### Phase 5 — Risk Engine
- **Status:** Integrated / Tested
- **Capability:** Rule-Based Risk Scoring (FR-005)
  - `execution/risk/scoreRepo.js` — deterministic risk scoring
  - `execution/risk/getRepoRiskFactors.js` — risk factor decomposition
  - `execution/risk/scorePullRequestHealth.js`, `getTrendIndicator.js`
  - `execution/risk/getEscalationSignals.js`, `getOperationalForecast.js`, `getOperationalChanges.js`
  - `execution/risk/detectOperationalAnomalies.js`, `detectEngineeringVolatility.js`
  - `execution/risk/clusterOperationalAnomalies.js`, `buildBehavioralStabilityIndex.js`
  - `execution/risk/buildExecutiveSummary.js`, `getPortfolioForecast.js`
  - `execution/risk/buildPortfolioMaturityIndex.js`, `buildTelemetryCoverageSummary.js`
  - `execution/risk/scoreRepositoryMaturity.js`, `getRepositoryMaturityTrend.js`
  - `execution/risk/getAttentionQueue.js`, `getOperationalConfidence.js`
  - `backend/routes/repoRoutes.js` — `GET /api/repos/:id/risk`, `/escalation`, `/forecast`, `/confidence`, `/maturity`, `/maturity-trend`, `/engineering-volatility`, `/pr-health`, `/events`
- **Architecture Intelligence** (extends Phase 5 into deep analysis):
  - 24 architecture execution modules in `execution/architecture/`:
    - `buildRepositoryArchitectureSnapshot.js`, `syncRepositoryArchitectureSnapshots.js`
    - `buildImportDependencyGraph.js`, `buildRepositoryStructureInventory.js`
    - `extractRouteApiStructure.js`, `linkFrontendBackendApis.js`
    - `analyzeArchitectureDrift.js`, `diffArchitectureSnapshots.js`
    - `detectArchitectureRegressions.js`, `detectArchitectureAnomalies.js`
    - `detectCouplingGrowthAlerts.js`, `forecastStructuralDegradation.js`
    - `buildArchitectureTrendTimeline.js`, `buildArchitectureWatchlists.js`
    - `buildPortfolioArchitectureIntelligence.js`, `buildPortfolioForecastingIntelligence.js`
    - `scoreEngineeringGovernance.js`
    - `buildRemediationRecommendations.js`, `deduplicateRecommendations.js`, `normalizeRecommendationWording.js`
    - `predictChangeRisk.js`, `verifyArchitectureBoundaries.js`
    - `assessImplementationCompleteness.js`, `deduplicateTopFindings.js`
  - `backend/routes/repoRoutes.js` — `GET /api/repos/:id/architecture`, `/architecture/forecast`, `/remediation`, `POST /:id/change-risk`
  - `backend/routes/portfolioRoutes.js` — `GET /api/portfolio/architecture`, `/forecast`, `/governance`, `/watchlists`, `/executive-summary`, `/history`, `/changes`, `/anomalies`, `/anomaly-clusters`, `/telemetry-coverage`, `/behavioral-stability`, `/maturity`
- **Tests:** 24 architecture unit test files. All pass.
- **Gaps:** No integration tests for architecture snapshot sync against a live database.

---

### Phase 6 — Real-Time Runtime
- **Status:** Accepted / Deferred — ADR-002 accepted 2026-06-12
- **Requirement:** FR-007 — real-time dashboard updates
- **Current behavior:** `setInterval(refresh, 60000)` in `frontend/dashboard.html` — polling every 60 seconds; header label `Live · 60s` accurately reflects this
- **Decision:** ✅ Polling accepted for Phases 1–5 via ADR-002. Satisfies FR-007 acceptance criterion ("without manual refresh"). WebSocket transport deferred to Phase 6+ with defined triggers (Redis/pub-sub availability, sub-60s data frequency, or product latency requirement).
- **See:** `docs/adr/ADR-002-realtime-transport.md`, `spec/01_requirements.md` Constraint #8

---

### Phase 7 — Notifications & Audit
- **Status:** Integrated / Partially Verified
- **Capability:** Audit Logging (FR-010) — Integrated / Tested
  - `execution/audit/logEvent.js`
  - Integration test: `tests/integration/audit.integration.test.js` (skipped without live DB)
- **Capability:** Notifications (FR-008) — **Integrated / Partially Verified** (email + Slack: unit-tested; SMTP sandbox verified via Mailhog 2026-06-15; production relay unverified; Slack webhook unverified; in-app channel: persistence layer, write path, API routes, and dashboard UI all implemented + unit-tested 2026-06-16; unauthenticated E2E smoke verified 2026-06-16 (bell visible, panel hidden on load, toggle works, no JS errors — 8/8 in Chromium headless); **authenticated session bootstrap complete 2026-06-17** (`tests/e2e/globalSetup.js`; no test-only route; storageState gitignored); **authenticated notification E2E browser-tested 2026-06-17** (`tests/e2e/notifications.authenticated.spec.js`; 2/2 passing in Chromium headless: unread render + mark-read PATCH flow; real session/DB/API exercised); ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: CSS rule `#notif-badge[hidden] { display: none !important }` added; `not.toBeVisible()` assertion used in test B; 10/10 E2E passing)
  - `services/notifications/alertDecision.js` — alert routing logic
  - `services/notifications/emailNotifier.js` — nodemailer-based email
  - `services/notifications/slackNotifier.js` — Slack webhook
  - `services/notifications/sendAlert.js` — dispatches to email + Slack + in-app (wired 2026-06-16; accepts `sendAlert(summary, { db } = {})`; queries `SELECT id FROM users WHERE deleted_at IS NULL`; calls `writeNotification` per user; in-app failures isolated via `.catch()` and do not block email/Slack)
  - `services/worker/snapshotWorker.js` — now accepts `startSnapshotWorker(db)` (wired 2026-06-16); calls `sendAlert(snapshot, { db })` after each snapshot; `backend/server.js` passes the existing `pg.Pool` singleton; in-app write failures remain isolated from email/Slack delivery
  - **`backend/routes/notificationRoutes.js`** — notification API layer (added 2026-06-16; registered at `/api/notifications` in `backend/server.js`); `GET /` returns user-scoped notifications newest-first LIMIT 20 + unreadCount from separate count query; `PATCH /:id/read` sets status=READ and read_at=NOW() scoped by both id and user_id — returns 404 if not owned or not found, 400 for non-integer id, idempotent (re-PATCH returns `{ success: true }`); both endpoints route DB failures through `next(err)` → existing `errorHandler` middleware
  - **`frontend/dashboard.html`** — notification UI layer (added 2026-06-16): topbar bell button (`#notif-btn`) with animated `#notif-badge` (shows count 1–9 or `9+`, `hidden` attribute when count=0); `#notification-section` panel inserted after `#portfolio-briefing` in page flow (uses existing `.section`, `.panel`, `.panel-head`, `.panel-body` CSS classes); `_notifications = []` and `_unreadCount = 0` module state vars; `loadNotifications()` fetches `GET /api/notifications`, updates badge and panel HTML, routes errors through `showError()`; `toggleNotificationPanel()` shows/hides panel (`section.hidden = !section.hidden` matching existing `#repo-detail` pattern); `markNotificationRead(id)` calls `PATCH /api/notifications/:id/read` then re-fetches; `loadNotifications()` wired into `refresh()` — runs on page load and every 60 seconds; 401/403 responses silently no-op (panel stays hidden for unauthenticated users); pure renderers: `notificationPriorityClass(priority)`, `buildNotificationBadgeText(unreadCount)`, `buildNotificationListHtml(notifications)`
  - `config/paths.js` — exports all 8 notification env vars (fixed 2026-06-12)
  - `.env.example` — documents correct proactive alert variables (fixed 2026-06-12)
  - **`migrations/0013_create_notifications.js`** — DDL migration for notifications table (added 2026-06-16; Option B per-user ownership; user_id NOT NULL FK → users ON DELETE CASCADE; partial unique index `notifications_user_dedupe_key_uidx` on (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL; status: CREATED/QUEUED/SENT/FAILED/READ/EXPIRED; priority: LOW/MEDIUM/HIGH/CRITICAL; expires_at = NOW() + 90 days)
  - **`execution/notifications/writeNotification.js`** — single-responsibility DB write (added 2026-06-16; INSERT with ON CONFLICT ON CONSTRAINT notifications_user_dedupe_key_uidx DO NOTHING RETURNING; priority derived from alertState/trend; dedupe_key = alertState:trend; 90-day expires_at)
  - Tests: `tests/alertDecision.test.js` (5) + `tests/notifications.test.js` (10) — **15/15 passing**
  - `tests/unit/services/worker/snapshotWorker.test.js` — **7/7 passing** (5 routing tests added 2026-06-12; updated 2026-06-16: 2 call-signature assertions corrected from `toHaveBeenCalledWith(SNAPSHOT)` → `toHaveBeenCalledWith(SNAPSHOT, { db: undefined })`; 2 new db-wiring tests added: passes `{ db: mockDb }` when db provided, passes `{ db: undefined }` when no db provided)
  - `tests/unit/services/notifications/emailNotifier.test.js` — **4/4 passing** (added 2026-06-14; `{ virtual: true }` removed 2026-06-15)
  - `tests/unit/services/notifications/slackNotifier.test.js` — **2/2 passing** (added 2026-06-14)
  - `tests/integration/notifications.smtp.integration.test.js` — **7/7 passing** (added 2026-06-15; opt-in: `TEST_INTEGRATION=true` + Mailhog on localhost:1025)
  - **`tests/unit/migrations/0013_notifications.test.js`** — **24/24 passing** (added 2026-06-16): module structure, createTable column specs, status/priority check constraints, 4+ sql calls, all 4 index names, partial unique constraint structure (UNIQUE INDEX, user_id+dedupe_key, WHERE dedupe_key IS NOT NULL), down drops table
  - **`tests/unit/execution/notifications/writeNotification.test.js`** — **30/30 passing** (added 2026-06-16): guards (6), DB call shape (6), priority mapping (4), dedupe_key format (3), expires_at Date + 90 days (2), title/body content (3), return row vs null (3) — covers all decision branches in `writeNotification.js`
  - **`tests/unit/backend/routes/notificationRoutes.test.js`** — **17/17 passing** (added 2026-06-16): HTTP 200 shape (2); both queries scoped to userId (1); ORDER BY created_at DESC (1); LIMIT 20 (1); rows in response (1); unreadCount integer from count query (1); count query filters NOT IN (READ, EXPIRED) (1); GET DB failure → 500 (1); PATCH { success: true } for owned notification (1); UPDATE SQL scoped to id + user_id (1); UPDATE sets status=READ + read_at=NOW() (1); 404 on wrong user (1); 404 on non-existent id (1); idempotent second PATCH (1); 400 + no db.query for non-integer id (1); PATCH DB failure → 500 (1)
  - **`tests/unit/services/notifications/sendAlert.inapp.test.js`** — **16/16 passing** (added 2026-06-16): db provided → correct SQL query (1), writeNotification called per user (2), correct {db, userId, summary} args (2), empty user list (1); db absent → no write (4); failure isolation → writeNotification reject does not throw (1), email still fires (1), Slack still fires (1), db.query reject does not throw (1), email+Slack still fire (1); dedup preserved → second call suppressed (1), fires again after _sent.clear() (1)
  - **`tests/unit/frontend/dashboardNotifications.test.js`** — **29/29 passing** (added 2026-06-16): `notificationPriorityClass` all 4 priority→class mappings + unknown + undefined (6); `buildNotificationBadgeText` 0/undefined/negative→'', 1–9→digit string, 10+→'9+' (7); `buildNotificationListHtml` empty array + null → empty-state paragraph (2); CRITICAL/HIGH/MEDIUM/LOW priority CSS classes in output (4); title `<` escaped to `&lt;`, body `&` escaped to `&amp;` (2); unread CREATED notification renders `markNotificationRead` button with correct id (2); READ + EXPIRED notifications render no Mark read button (2); READ has `opacity:0.55`, unread does not (2); mixed list: both titles present, only unread has button (2)
- **Gaps:**
  - ~~No integration test verifying SMTP delivery~~ — **resolved 2026-06-15**: 7/7 Mailhog integration tests passing
  - ~~`nodemailer` is only in `backend/package.json`, not root `package.json`~~ — **resolved 2026-06-15**: `nodemailer` moved to root `package.json`
  - ~~`sendAlert.js` not yet wired to `writeNotification`~~ — **resolved 2026-06-16**: `sendAlert(summary, { db } = {})` fans out `writeNotification` per active user; 16 unit tests
  - ~~`snapshotWorker.js` not yet wired to pass `db`~~ — **resolved 2026-06-16**: `startSnapshotWorker(db)` accepts `pg.Pool`; `backend/server.js` passes existing pool; `sendAlert(snapshot, { db })` called on every interval tick; 7/7 worker unit tests passing
  - ~~No notification routes~~ — **resolved 2026-06-16**: `GET /api/notifications` + `PATCH /api/notifications/:id/read` implemented in `backend/routes/notificationRoutes.js`; registered in `backend/server.js`; 17/17 route tests passing
  - Production SMTP relay delivery unverified (Mailhog ≠ production relay; TLS/auth/routing not tested)
  - Slack webhook delivery unverified against a real webhook endpoint (unit-tested only)
  - ~~No in-app notification UI in `frontend/dashboard.html`~~ — **resolved 2026-06-16**: topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in `refresh()` loop, `markNotificationRead(id)`, `toggleNotificationPanel()`; 29/29 frontend unit tests passing
  - ~~No real browser/E2E verification of the notification UI~~ — **resolved 2026-06-17**: `tests/e2e/dashboard.smoke.spec.js` (8/8 passing) verifies unauthenticated path; `tests/e2e/notifications.authenticated.spec.js` (2/2 passing) verifies authenticated path — unread notification renders with badge count=1 + panel + HIGH badge; mark-read PATCH 200 fires, button disappears, badge hides; real session cookie via storageState, real DB-seeded notification row, real `GET /api/notifications` + `PATCH /api/notifications/:id/read` exercised; no production code changed. Open defect: `#notif-badge` inline `display:inline-flex` overrides `[hidden] { display:none }` — badge does not visually hide; tests assert `toHaveText('')` + `toHaveAttribute('hidden', '')`; production CSS fix pending CLAUDE.md §4 approval
  - No integration test for the full worker → `writeNotification` → DB row path against a real PostgreSQL instance

---

### Phase 8 — Resilience & Recovery
- **Status:** Not Implemented / Partially Specified
- `failure/08_failure_playbook.md` exists as a directive but no execution-layer implementation of retry/backoff logic found
- `snapshotWorker.js` has a `try/catch` but no retry, no exponential backoff, no dead-letter mechanism
- GitHub API rate-limit handling: not implemented (NFR-004)
- Failed snapshot jobs are logged but not retried

---

### Phase 9 — Observability & Operations
- **Status:** Partial
- `execution/logger.js` — structured logger in place
- `backend/middleware/requestLogger.js` — HTTP request logging
- `backend/middleware/errorHandler.js` — centralized error handling
- No metrics pipeline (no Prometheus, no StatsD, no APM)
- No centralized log aggregation

---

### Phase 10 — Production Readiness
- **Status:** Partially Started
- ~~No CI/CD pipeline configuration~~ — **CI workflow operational (2026-06-13)**: `.github/workflows/ci.yml` runs `npm ci` + `npm test` on every push and PR to main; first successful run verified (commit `4e58590`, 32 s, 6,494 tests passed, no secrets)
- Integration tests not yet automated in CI — require `TEST_INTEGRATION=true` and a live PostgreSQL instance; currently opt-in locally only
- ~~No Playwright / E2E toolchain~~ — **scaffolded 2026-06-16**: `@playwright/test ^1.61.0` added to root `devDependencies`; `playwright.config.js` created at repo root (`testDir: tests/e2e`, Chromium only, `headless: true`, `baseURL` from `E2E_BASE_URL || http://localhost:3000`, `webServer: cross-env PROJECT_SOURCE=file npm run dev`, `reuseExistingServer: true`); `test:e2e` script added to root `package.json`; Jest isolated from `tests/e2e/` by existing `testMatch` allowlist (no `jest.config.js` changes needed). **webServer startup hardened 2026-06-16** (command changed from `npm run dev` to `cross-env PROJECT_SOURCE=file npm run dev` — prevents GitHub API timeout from crashing server before `app.listen()`; production runtime unaffected; verified via `npx playwright test --list` → `0 tests in 0 files`). **Dashboard unauthenticated smoke tests passing 2026-06-16** (`tests/e2e/dashboard.smoke.spec.js` — 8/8 Playwright tests; Chromium headless; `npm run test:e2e` exits 0 in 14.8 s). **Authenticated session bootstrap complete 2026-06-17** (`tests/e2e/globalSetup.js` added; `playwright.config.js` wired with `globalSetup: require.resolve('./tests/e2e/globalSetup')`; `tests/e2e/.auth/` gitignored; no backend changes; verified `node tests/e2e/globalSetup.js` → userId=36 (e2e-test-user), exit 0). Remaining: ~~authenticated E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` (2/2 passing); ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added; E2E not yet wired in CI
- No `Dockerfile` or container build step
- No production deployment documentation beyond README quick-start
- No secrets management beyond `.env` / `.env.example`
- No HTTPS enforcement at the application layer (expected at infrastructure level)

---

## Current Testing Status

| Layer | Test Files | Tests | Status |
|---|---|---|---|
| Frontend (pure renderers + filter) | 17 | ~932 | All passing |
| Execution — Architecture | 24 | ~2,100 | All passing |
| Execution — Risk | ~18 | ~1,800 | All passing |
| Execution — Auth/Crypto/RBAC | ~8 | ~400 | All passing |
| Execution — GitHub | ~7 | ~350 | All passing |
| Backend (routes, middleware) | ~10 | ~660 | All passing |
| Directives validation | 1 | ~12 | All passing |
| Integration — DB (audit, auth) | 2 | 25 | **Skipped** under `npm test` — require live PostgreSQL (`TEST_INTEGRATION=true`) |
| Integration — SMTP notifications | 1 | 7 | **7/7 passing** opt-in — require Mailhog on localhost:1025 + `TEST_INTEGRATION=true`; skipped under `npm test` |
| Execution — Notifications | 3 | 70 | All passing |
| Services — Worker | 1 | 7 | All passing (updated 2026-06-16) |
| E2E / Playwright (`npm run test:e2e`) | 2 test files + 1 globalSetup | 10 | **Partially Tested** — toolchain installed + webServer hardened 2026-06-16; `tests/e2e/dashboard.smoke.spec.js` 8/8 passing (Chromium headless, 14.8 s; unauthenticated path); `tests/e2e/notifications.authenticated.spec.js` 2/2 passing (Chromium headless, 23.8 s; authenticated: unread render + mark-read PATCH flow; real session/DB/API); open defect: `#notif-badge` CSS visual-hide (inline `display:inline-flex` overrides `[hidden]`); CI E2E wiring absent; self-skips under `npm test` |
| **Total (`npm test`)** | **97 passing + 3 skipped = 100** | **6,674** | **6,642 passing, 32 skipped (25 DB + 7 SMTP, all opt-in), 0 failing** |

### Testing Gaps

- ~~No Playwright / E2E toolchain~~ — **scaffolded 2026-06-16**: `@playwright/test` installed, `playwright.config.js` configured, `test:e2e` opt-in script added; Jest does not discover `tests/e2e/`. ~~webServer crashes on GitHub API timeout~~ — **resolved 2026-06-16**: webServer command changed to `cross-env PROJECT_SOURCE=file npm run dev`. ~~No E2E test files~~ — **resolved 2026-06-16**: `tests/e2e/dashboard.smoke.spec.js` created; 8/8 unauthenticated smoke tests passing in Chromium headless (`npm run test:e2e` exits 0, 14.8 s): /dashboard loads, page title verified, `#notif-btn` visible, `#notification-section` hidden on load, bell toggle shows/hides panel, Login with GitHub link visible (unauthenticated 401 path), no uncaught JS errors. ~~Authenticated E2E requires a session seeding strategy~~ — **resolved 2026-06-17**: `tests/e2e/globalSetup.js` added; uses `upsertUser()` + `createSession()` directly against test DB; storageState written to `tests/e2e/.auth/user.json`; `playwright.config.js` wired with `globalSetup`; `tests/e2e/.auth/` gitignored; no test-only backend route; no production auth changes; verified `node tests/e2e/globalSetup.js` → exit 0. ~~Authenticated E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` created; ~~DB-seeded notification panel E2E (badge count, mark-read flow) not yet written~~ — **resolved 2026-06-17**: real SQL seeding + storageState + badge count + mark-read PATCH flow verified (2/2 passing). ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added to `frontend/dashboard.html`; Playwright `not.toBeVisible()` assertion now passes (10/10 E2E). E2E CI wiring still absent
- ~~`snapshotWorker.js` has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/services/worker/snapshotWorker.test.js`, 5 routing tests, all passing)
- ~~FR-009 label filter has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilter.test.js`, 29 tests, all passing); ~~backend riskLevel filter has no tests~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.test.js`, 7 new riskLevel tests, 236/236 total passing); ~~frontend not wired to backend riskLevel parameter~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilterLoad.test.js`, 14 tests, 14/14 passing); ~~HTTP layer between URL query string and Express handler untested~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.http.test.js`, 10 supertest tests, 10/10 passing); ~~repository name search absent from backend and frontend~~ — **resolved 2026-06-17** (backend: 8 new search filter unit tests in `repoRoutes.test.js` + 6 new HTTP contract tests in `repoRoutes.http.test.js`; 4 existing riskLevel param array assertions updated to 3-element; frontend: `buildReposUrl` verbatim copy updated + 10 new tests in `dashboardFilterLoad.test.js`; **260/260 backend route tests + 53/53 frontend filter tests all passing**)
- ~~`emailNotifier.js` positive send path untested~~ — **resolved 2026-06-14** (`tests/unit/services/notifications/emailNotifier.test.js`, 4 tests: `sendMail` called; `{ from, to, subject, text }` shape; subject + body contain `alertState` and `trend`). ~~`slackNotifier.js` body content untested~~ — **resolved 2026-06-14** (`tests/unit/services/notifications/slackNotifier.test.js`, 2 tests: JSON `{ text }` shape; `text` contains `alertState` and `trend`). ~~SMTP delivery untested against a real SMTP sink~~ — **resolved 2026-06-15** (`tests/integration/notifications.smtp.integration.test.js`, 7 tests: direct delivery, To/From, subject, body, sendAlert orchestration, dedup, shouldAlert gate; 7/7 passing with Mailhog). Remaining: production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only).
- Integration tests always skip during `npm test` (no CI automation to run them with live DB)
- No load or performance tests (NFR-001: "Dashboard initial load within 2 seconds under normal load" — unverified)

---

## Known Risks and Gaps

| Risk | Severity | Detail |
|---|---|---|
| `PROGRESS.md` was absent | Resolved | Created 2026-06-12 per CLAUDE.md Creation Rule |
| Frontend not React | ~~High~~ **Resolved** | ✅ ADR-001 accepted 2026-06-12. Vanilla JS accepted for Phases 1–5. React migration deferred to Phase 6+ with defined triggers. `spec/01_requirements.md` and `spec/02_system_specification.md` updated. |
| FR-007 polling accepted | ~~High~~ **Resolved** | ✅ ADR-002 accepted 2026-06-12. 60-second polling accepted for Phases 1–5; satisfies "no manual refresh" acceptance criterion. WebSocket deferred to Phase 6+ with defined triggers. See `docs/adr/ADR-002-realtime-transport.md`. |
| No queue/durability for background jobs | Medium | `snapshotWorker.js` uses `setInterval`; no retry, no persistence on crash |
| Notification production delivery unverified | Medium | Worker routing tested (2026-06-12, 20/20). Unit delivery paths tested (2026-06-14, 26/26). ~~`nodemailer` absent from root `package.json`~~ — **resolved 2026-06-15**. ~~SMTP delivery untested against real sink~~ — **resolved 2026-06-15**: Mailhog integration tests (7/7 passing). ~~`sendAlert` not wired to in-app~~ — **resolved 2026-06-16**: 16 unit tests. ~~`snapshotWorker` not wired to pass `db`~~ — **resolved 2026-06-16**: `startSnapshotWorker(db)` passes `pg.Pool` to `sendAlert`; 7/7 worker tests. ~~no notification API routes~~ — **resolved 2026-06-16**: `GET /api/notifications` + `PATCH /api/notifications/:id/read`; 17 route tests. ~~no frontend notification UI~~ — **resolved 2026-06-16**: topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in refresh loop, `markNotificationRead(id)`, 29/29 frontend unit tests. Remaining: production SMTP relay delivery unverified; Slack webhook unverified (unit-tested only); no integration test for worker → DB row path; unauthenticated smoke verified 2026-06-16 (8/8 Chromium headless); authenticated session bootstrap complete 2026-06-17 (`tests/e2e/globalSetup.js`; storageState gitignored); ~~authenticated E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` 2/2 passing (unread render + mark-read PATCH flow; real session/DB/API; no production code changed). |
| ~~`#notif-badge` visual-hide CSS defect~~ | ~~Medium~~ **Resolved** | **Discovered 2026-06-17** — inline `display:inline-flex` overrode UA `[hidden] { display:none }` because all author CSS beats UA CSS in the cascade (regardless of specificity); inline styles are author-origin. **Resolved 2026-06-17**: added `#notif-badge[hidden] { display: none !important }` to `frontend/dashboard.html` style block (1 line). `!important` overrides the inline style, making the `hidden` attribute visually effective. Playwright `not.toBeVisible()` assertion in test B updated to use `not.toBeVisible()`; 10/10 E2E passing. |
| FR-009 filter incomplete | Medium | Label/risk filter tested (29/29 passing, 2026-06-12). Backend riskLevel filter tested (260/260 passing, updated 2026-06-17). Frontend filter/load tests (53/53 passing, updated 2026-06-17). **Risk-level filtering + Repository name search are now Integrated / Tested.** ~~repository name search absent~~ — **resolved 2026-06-17**: `?search=` param with ILIKE on `github_full_name`; 200-char limit + HTTP 400 on invalid; `#repo-search-input` in filter bar; 260/260 backend + 53/53 frontend tests passing. At Risk toggle intentionally uses client-side `critical \|\| at-risk` (by design in Option A). SQL filter correctness against real PostgreSQL unverified (no integration test yet — ILIKE clause unproven against live DB). 4 spec dimensions still absent: project status, assigned manager, activity recency, intern contributor. |
| NFR-007 data governance absent | Medium | User deletion, project archival, data export not found in codebase |
| ~~No CI/CD pipeline~~ | ~~Medium~~ **Resolved** | ✅ `.github/workflows/ci.yml` operational (2026-06-13). First successful GitHub Actions run: commit `4e58590`, push trigger, ubuntu-latest, Node 20, 32 s, 6,494/6,519 tests passed, no secrets. Integration tests self-skip (opt-in only). |
| GitHub API rate-limit handling absent | Medium | NFR-004 requires graceful rate-limit handling; not implemented |
| `backend/tmp/analyze.js` in wrong layer | Low | Should be under `/tmp` (scratch) per CLAUDE.md folder boundaries |
| Redis not present | Low | Spec mentions Redis from Phase 3 onward; README lists it as a prerequisite; not installed or referenced |

---

## Recent Implementation History

### 2026-06-17 — FR-009 Repository Name Search (Backend + Frontend)

**Capability:** Search and Filtering (FR-009) — Repository Name Search dimension  
**Deliverable status:** Required (`spec/01_requirements.md` FR-009 "Repository" dimension; `spec/02_system_specification.md` `search` query param; Section 11 — Repositories is a named search domain; partial keyword matching required; RBAC-scoped)

#### What Changed

- **`backend/routes/repoRoutes.js`** — `GET /api/repos` handler extended:
  - Extracts `search` from `req.query` alongside existing `riskLevel`
  - Validates: non-string `search` → HTTP 400 (no db.query); trimmed length > 200 → HTTP 400 (no db.query)
  - Trims whitespace before SQL; empty-after-trim → null (treated as absent)
  - Parameter array extended from 2 to 3 elements: `[req.user.userId, riskLevel || null, trimmedSearch || null]`
  - SQL WHERE clause added: `AND ($3::varchar IS NULL OR r.github_full_name ILIKE '%' || $3 || '%')`
  - `$2` (riskLevel) position unchanged — no regression to existing riskLevel filtering
  - RBAC boundary unchanged: `WHERE r.user_id = $1 AND r.is_active = true` scoped first; search only narrows results within that authorized set
- **`frontend/dashboard.html`** — filter bar extended:
  - `<input type="search" id="repo-search-input" placeholder="Search repositories…">` added inside `.filter-bar`
  - CSS added for `#repo-search-input` and `#repo-search-input:focus` (font/padding/border-radius matching filter buttons)
  - `buildReposUrl(options)` rewritten: builds `params[]` array; appends `riskLevel=<encoded>` first, `search=<encoded>` second; trims search before encoding; omits when empty after trim; returns `/api/repos` with no `?` when params is empty
  - Filter bar click handler updated: reads `#repo-search-input` current value; merges with `filterToLoadOptions(_activeFilter)`; passes combined options to `loadRepos()`
  - New `input` event listener on `#repo-search-input`: reads current value on every keystroke; combines with active filter options; calls `loadRepos()`
  - At Risk semantics preserved: click passes `{ search: 'term' }` (no riskLevel) — server returns all repos matching name; client-side `critical || at-risk` predicate still applied by `applyFilter()`

#### Validation

- **`tests/unit/backend/routes/repoRoutes.test.js`** — new `describe('repoRoutes GET / — search filter')` block, 8 tests:
  - absent search → `[userId, null, null]`
  - search=myrepo → `[userId, null, 'myrepo']`
  - leading/trailing whitespace trimmed → `'myrepo'`
  - whitespace-only search → `[userId, null, null]`
  - riskLevel + search combined → `[userId, 'healthy', 'myrepo']`
  - search > 200 chars → HTTP 400; db.query not called
  - SQL clause matches `$3 IS NULL OR github_full_name ILIKE`
  - Existing 4 riskLevel param-array assertions updated from 2-element to 3-element
  - **244/244 passing** in repoRoutes.test.js (was 236)
- **`tests/unit/backend/routes/repoRoutes.http.test.js`** — new `describe('GET /api/repos?search=<term>')` block, 6 tests:
  - HTTP 200; `{ repos: Array }` body; `db.query([userId, null, 'myrepo'])` for search-only
  - `db.query([userId, 'healthy', 'myrepo'])` for combined riskLevel + search
  - HTTP 400 + no db.query for search > 200 chars
  - Existing 2 param-array assertions updated from 2-element to 3-element
  - **16/16 passing** in repoRoutes.http.test.js (was 10)
- **`tests/unit/frontend/dashboardFilterLoad.test.js`** — `buildReposUrl` verbatim copy updated; 2 new describe blocks, 10 new tests:
  - `buildReposUrl — search parameter` (7): search-only URL; trim; empty string omitted; whitespace-only omitted; space URL-encoded; riskLevel + search ordering; combined URL-encoding
  - `filterToLoadOptions + buildReposUrl — filter with search composition` (3): Healthy + search; All + search; At Risk + search (no riskLevel in URL)
  - **24/24 passing** in dashboardFilterLoad.test.js (was 14)
- **Combined backend run:** `npx jest --testPathPattern="repoRoutes" --no-coverage` → **260/260 passing** (2 suites, 11.5 s)
- **Combined frontend run:** `npx jest --testPathPattern="dashboardFilterLoad|dashboardFilter\\b" --no-coverage` → **53/53 passing** (2 suites, 0.6 s)
- **Existing tests unaffected:** `tests/unit/frontend/dashboardFilter.test.js` — 29/29 passing; `applyFilter()` and `filterRepos()` logic unchanged

#### Risks / Limitations

- SQL `ILIKE` clause correctness against real PostgreSQL unverified — unit tests mock `db.query`; case-insensitive substring match on `github_full_name` (`owner/repo` format) not proven against a live DB instance
- Frontend `input` event fires on every keystroke without debouncing — acceptable for MVP phase; may generate rapid fetch calls on slow connections
- 4 FR-009 spec dimensions remain absent: project status, assigned manager, activity recency, intern contributor

#### Next Actions

- Add `tests/integration/filter.db.integration.test.js` (opt-in, `TEST_INTEGRATION=true` + live PostgreSQL) — verify `ILIKE` substring matching against real data
- Implement next FR-009 dimension (project status or assigned manager per spec priority)

---

### 2026-06-17 — #notif-badge CSS Visual-Hide Defect Fix
- **Root cause:** All author CSS beats UA CSS in the cascade regardless of specificity. The `[hidden] { display:none }` rule lives in the UA stylesheet; the inline `style="display:inline-flex;..."` on `#notif-badge` is an author declaration. Inline styles always win over UA rules — so `badge.hidden = true` set `hidden=""` but the badge remained visually visible as a small empty red circle.
- **Fix (1 CSS rule added):**
  - `frontend/dashboard.html` — added inside `<style>` block, after `.aq-badge` severity classes:
    ```
    /* ── Notification count badge (overrides inline display to respect [hidden]) */
    #notif-badge[hidden] { display: none !important; }
    ```
  - `!important` is the correct tool here: it elevates an author rule above another author declaration (inline style). Scoped precisely to `#notif-badge[hidden]` — no other element affected.
- **Playwright assertion updated:**
  - `tests/e2e/notifications.authenticated.spec.js` — test B final assertion changed from `toHaveText('') + toHaveAttribute('hidden', '')` to `not.toBeVisible()`. The workaround comment was replaced with an explanation of the CSS fix.
- **Production code changed:** Yes. `frontend/dashboard.html` style block modified (1 CSS rule added). No JS changes. No HTML structure changes. No route changes. No schema changes.
- **Notification behavior unchanged:** Badge still uses `badge.hidden = _unreadCount === 0` in `loadNotifications()`. The fix makes the `hidden` attribute work as intended — it now visually hides the badge, which is the correct behavior.
- **Verification:**
  - `npm run test:e2e` → **10/10 passing** (8/8 smoke + 2/2 authenticated; 21.6 s)
  - `npx jest --testPathPattern="dashboardNotifications" --no-coverage` → **29/29 passing** (0.348 s)
- **E2E maturity change:** Authenticated notification workflow — **Partially Tested → Tested**: `not.toBeVisible()` assertion now correctly verifies the visual hide behavior. No workarounds in tests. CI E2E wiring still absent.

---

### 2026-06-17 — Playwright Authenticated Session Bootstrap (globalSetup.js)
- **Files created:**
  - `tests/e2e/globalSetup.js` — Playwright `globalSetup` export; loads `.env` non-destructively (Playwright test runner does not auto-load `.env`); verifies `DATABASE_URL` or `TEST_DATABASE_URL` is safe (must contain `test`, `local`, or `localhost`; fails with a clear error if absent or unsafe); creates `pg.Pool` via `createTestPool()` from `tests/integration/helpers/dbTestHelper.js`; calls `upsertUser()` (githubId: 99001, username: `e2e-test-user`, defaultRole: `intern`) + `createSession()` (24-hour expiry); writes Playwright `storageState` to `tests/e2e/.auth/user.json` (session_token cookie: HttpOnly, SameSite=Lax, domain=localhost); closes pool; also supports direct invocation (`node tests/e2e/globalSetup.js`) for smoke-testing the setup step without running the full suite
- **Files modified:**
  - `playwright.config.js` — added `globalSetup: require.resolve('./tests/e2e/globalSetup')` (1 line; runs once before all test suites)
  - `.gitignore` — added `tests/e2e/.auth/` entry (prevents live session tokens from entering the repository)
- **Production code changed:** No. `authRoutes.js`, `authenticate.js`, `createSession.js`, `upsertUser.js`, `backend/server.js`, and all other production paths are unmodified. No test-only login route was added. The E2E test user's session is validated by the real `validateSession()` path — no backdoor exists.
- **Design:** Reuses existing execution modules and test helpers — `upsertUser`, `createSession` (from `execution/auth/`), `createTestPool`, `closeTestPool` (from `tests/integration/helpers/dbTestHelper.js`) — matching the exact patterns used in `tests/integration/auth.integration.test.js`. Authenticated test specs load `use: { storageState: 'tests/e2e/.auth/user.json' }` to start with a valid session cookie; unauthenticated specs (`dashboard.smoke.spec.js`) are unaffected.
- **Verification command:** `node tests/e2e/globalSetup.js`
- **Output:** `[globalSetup] Session created → userId=36 (e2e-test-user), expires=2026-06-18T16:49:35.370Z, state → …/tests/e2e/.auth/user.json` (exit code 0)
- **Gitignored:** Confirmed — `git check-ignore -v tests/e2e/.auth/user.json` → `.gitignore:22:tests/e2e/.auth/`. Session token cannot be accidentally committed.
- **E2E maturity change:** Authenticated session bootstrap — **Absent → Ready**. Infrastructure in place for authenticated E2E test specs. No authenticated test specs written yet.

---

### 2026-06-17 — Authenticated Notification E2E (tests/e2e/notifications.authenticated.spec.js — 2/2 passing)
- **Files created:**
  - `tests/e2e/notifications.authenticated.spec.js` — 2 Playwright tests in Chromium headless; outer `test.describe` uses `test.use({ storageState: 'tests/e2e/.auth/user.json' })` (real session cookie injected from globalSetup); two independent inner describes (A and B) each with their own `beforeAll` DB setup and `afterAll` pool teardown; `setupDb()` loads `.env` non-destructively, resolves E2E test user by `github_id = 99001`; `seedNotification()` deletes all notifications for that user then inserts one CREATED HIGH row with `dedupe_key = NULL` (bypasses partial-unique constraint); `beforeEach` navigates to `/dashboard` and waits for `networkidle` before each assertion
- **Production code changed:** No. `authRoutes.js`, `authenticate.js`, `notificationRoutes.js`, `dashboard.html`, `server.js`, and all other production paths are unmodified.
- **Test A — Authenticated unread notification renders:**
  - `#notif-badge` is visible (badge.hidden = false; `loadNotifications()` returned unreadCount=1)
  - `#notif-badge` text is `'1'` (`buildNotificationBadgeText(1)` → `'1'`)
  - Clicking `#notif-btn` makes `#notification-section` visible
  - `#notification-list` contains `'[RepoPulse] High Alert — Worsening trend'`
  - `#notification-list .aq-badge.severity-high` is visible (`notificationPriorityClass('HIGH')` → `'severity-high'`)
- **Test B — Authenticated mark-read flow:**
  - `#notif-btn` click opens panel; `button:has-text("Mark read")` is visible
  - `page.waitForResponse()` intercept registered before click (predicate: URL includes `/api/notifications/` + `/read`, method `PATCH`)
  - Click fires PATCH; response status is 200 (`{ success: true }`)
  - After `waitForLoadState('networkidle')`: Mark read button not visible; `#notif-badge` text is `''`; `#notif-badge` has `hidden=""` attribute
- **Self-Annealing Loop applied:** Test B failed on first run — `not.toBeVisible()` on `#notif-badge` failed even with `hidden=""` present because inline `display:inline-flex` overrides UA `[hidden] { display:none }` (CSS specificity: inline > UA). Root cause identified. Fix: replaced final assertion with `toHaveText('')` + `toHaveAttribute('hidden', '')` — asserts the two DOM properties the code actually sets. Second run: 10/10 passed (8/8 smoke + 2/2 authenticated). Defect documented as open (production CSS fix pending §4 approval).
- **Command run:** `npm run test:e2e` → `cross-env RUN_E2E=true playwright test`; globalSetup ran before suite; Chromium headless; 1 worker; 10/10 passing in 23.8 s
- **E2E maturity change:** Authenticated notification workflow — **Absent → Partially Tested**: the authenticated notification UI path (badge count, panel content, mark-read PATCH flow) is now verified in a real browser with a real session and real DB-seeded data. `#notif-badge` CSS visual-hide defect later resolved 2026-06-17 (see below). Remaining: CI E2E wiring absent; `notifications.db.integration.test.js` (worker → DB row path) not yet written.

---

### 2026-06-16 — First Playwright E2E Dashboard Smoke Tests (8/8 passing)
- **Files created:**
  - `tests/e2e/dashboard.smoke.spec.js` — 8 unauthenticated Playwright smoke tests (Chromium headless); no DB seeding, no session fixtures, no auth wiring required
- **Production code changed:** No. No backend, frontend, configuration, or Jest test files were modified.
- **Test matrix (all 8 passing in 14.8 s):**
  1. `/dashboard loads without navigation error` — `page.goto('/dashboard')` succeeds; URL contains `/dashboard`
  2. `page title is "RepoPulse Dashboard"` — `<title>` element matches `RepoPulse Dashboard`
  3. `notification bell #notif-btn is visible` — topbar bell is present and rendered; not hidden
  4. `#notification-section is hidden on load` — panel starts with `hidden` attribute; `loadNotifications()` 401 silent no-op leaves it hidden
  5. `clicking the bell shows the notification panel` — `toggleNotificationPanel()` removes `hidden`; panel becomes visible
  6. `clicking the bell a second time hides the notification panel` — second click re-sets `hidden`; panel not visible
  7. `"Login with GitHub" link is visible for unauthenticated access` — `GET /api/repos` returns 401 → errorHandler sends `{ ok: false }` → `loadRepos()` renders `<a href="/auth/github">Login with GitHub</a>` in `#projects-container`; `networkidle` in `beforeEach` guarantees fetch has completed before assertion
  8. `no uncaught JavaScript errors on page load` — `page.on('pageerror', …)` listener accumulated zero events; 401 API responses are handled by `.catch()` / `if (!r.ok) return` paths, not uncaught exceptions
- **Command run:** `npm run test:e2e` → `cross-env RUN_E2E=true playwright test`; server reused via `reuseExistingServer: true`; Chromium headless; 1 worker; retries: 0
- **E2E maturity change:** E2E / Playwright — **Scaffolded → Partially Tested**: the unauthenticated dashboard path is now verified in a real browser. Remaining gaps: authenticated E2E (requires session seeding), DB-seeded notification panel (badge count + mark-read flow), E2E CI wiring.

---

### 2026-06-16 — Playwright webServer Startup Hardening
- **Files modified:**
  - `playwright.config.js` — webServer `command` changed from `'npm run dev'` to `'cross-env PROJECT_SOURCE=file npm run dev'`
- **Production code changed:** No. `playwright.config.js` is only executed when `npm run test:e2e` runs. No backend, frontend, database, or test files were modified.
- **Root cause fixed:** `npm run dev` (i.e. `node --env-file=.env backend/server.js`) loads `.env` which sets `PROJECT_SOURCE=github`. When `GITHUB_ORG` is also set, `fetchGithubProjects()` calls `https://api.github.com/…` which times out after 10 s (Node.js undici default). Because `server.js` startup IIFE has no `try/catch`, this uncaught rejection kills the process before `app.listen()` is reached — Playwright's webServer health check (`GET /health`) never returns 200, and the E2E run fails before any test executes.
- **Fix mechanism:** Node.js `--env-file` does NOT override environment variables already present in the process environment. `cross-env PROJECT_SOURCE=file` sets `PROJECT_SOURCE=file` before Node loads `.env`, so `.env`'s `PROJECT_SOURCE=github` is silently ignored. `server.js` sees `PROJECT_SOURCE !== 'github'` and skips `syncGithubProjects()` entirely — the server reaches `app.listen()` immediately. `cross-env` is already a root devDependency (`^7.0.3`); no new package added.
- **Verification:** `npx playwright test --list` → `Total: 0 tests in 0 files` (exit 1 expected — no test files exist yet; config parsed without error; a config error would produce a syntax/module error, not "No tests found")
- **Maturity change:** Playwright E2E startup config — **Fragile (crashes on GitHub API timeout) → Stable (startup deterministic in all environments)**. E2E maturity classification remains **Scaffolded** — no test files exist and Chromium binary is not installed.

---

### 2026-06-16 — Playwright E2E Toolchain Scaffolding
- **Files created:**
  - `playwright.config.js` — Playwright configuration at repo root: `testDir: 'tests/e2e'`; Chromium only (`devices['Desktop Chrome']`); `headless: true`; `baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000'`; `webServer: { command: 'npm run dev', url: 'http://localhost:3000/health', reuseExistingServer: true, timeout: 30_000 }`; `workers: 1`, `fullyParallel: false`; `retries: process.env.CI ? 1 : 0`; JSON reporter outputs to `tmp/playwright-results.json`; trace captured on first retry
- **Files modified:**
  - `package.json` — added `"@playwright/test": "^1.61.0"` to `devDependencies`; added `"test:e2e": "cross-env RUN_E2E=true playwright test"` to scripts
  - `package-lock.json` — updated by npm (3 packages added: `@playwright/test`, `playwright`, `playwright-core`)
- **Production code changed:** No. No server, dashboard, or existing test files were modified. `jest.config.js` unchanged — its explicit `testMatch` allowlist (`tests/unit/**`, `tests/directives/**`, `tests/integration/**`) already excludes `tests/e2e/` without requiring `testPathIgnorePatterns`.
- **Verification performed:**
  - `npx playwright test --list` → `Total: 0 tests in 0 files` (exit 1 — expected for empty `testDir`; config parsed without error)
  - `npx jest --listTests | grep e2e` → no output (Jest discovery confirmed isolated from `tests/e2e/`)
- **Maturity change:** E2E / Playwright — **Not Present → Scaffolded**
- **Remaining blockers before first test can run:**
  1. `npx playwright install chromium` — Chromium browser binary not yet installed (one-time developer step + required CI step)
  2. Create `tests/e2e/` directory and at least one `.spec.js` test file
  3. ~~Authenticated E2E requires a session seeding strategy~~ — **resolved 2026-06-17**: `tests/e2e/globalSetup.js` added; `playwright.config.js` wired; storageState to `tests/e2e/.auth/user.json`; gitignored; no backend changes

---

### 2026-06-16 — FR-008 Dashboard Notification UI (topbar bell + panel + loadNotifications wired into refresh)
- **Files modified:**
  - `frontend/dashboard.html` — 6 insertions: (1) topbar bell button `#notif-btn` with animated `#notif-badge` span; (2) `#notification-section` panel inserted after `#portfolio-briefing`, before portfolio tabs — contains `#notif-count`, `#notification-list`, and a "Close" button; (3) three pure renderer functions after `esc()` definition: `notificationPriorityClass(priority)`, `buildNotificationBadgeText(unreadCount)`, `buildNotificationListHtml(notifications)`; (4) `_notifications = []` and `_unreadCount = 0` module state vars alongside `_repos`/`_activeFilter`; (5) `loadNotifications()`, `toggleNotificationPanel()`, `markNotificationRead(id)` DOM+fetch functions inserted after `loadAttentionQueue()`; (6) `loadNotifications()` call added to `refresh()` between `loadAttentionQueue()` and `loadHistory()`
- **Files created:**
  - `tests/unit/frontend/dashboardNotifications.test.js` — 29 pure-logic unit tests (verbatim-copy pattern; Jest node env; no DOM): `notificationPriorityClass` (6), `buildNotificationBadgeText` (7), `buildNotificationListHtml` empty state (2), priority CSS classes (4), XSS escaping (2), read/unread rendering (6), multiple notifications (2)
- **Production code changed:** Yes. `loadNotifications()` is now called on every `refresh()` cycle (page load + every 60 seconds). Bell badge and notification panel update automatically. `markNotificationRead(id)` issues a live `PATCH` request.
- **Functional behavior (unit-test-verified):**
  - Unread badge: `buildNotificationBadgeText(0)` → `''` (hidden); 1–9 → digit string; 10+ → `'9+'`
  - Priority badge CSS class: CRITICAL → `severity-critical`; HIGH → `severity-high`; MEDIUM → `severity-medium`; LOW → `severity-healthy`; unknown → `severity-unknown`
  - Read/Expired notifications: `opacity:0.55`, no Mark read button
  - Unread notifications: no opacity style, Mark read button with `onclick="markNotificationRead(N)"` where N = `Number(n.id)`
  - XSS escaping: title `<script>` → `&lt;script&gt;`; body `& growing` → `&amp; growing` (4-replacement `esc()` — no single-quote escaping, matches dashboard.html exactly)
  - Empty state: `[]` or `null` → `<p>No new notifications.</p>`
  - 401/403 from `GET /api/notifications` → silent no-op (panel stays hidden; no error shown to unauthenticated users)
  - Network failure → `showError('notification-list', e.message)`
- **Tests:** 29/29 passing. Full suite: **6,618 passing, 32 skipped, 0 failing** (was 6,589; +29 new tests, 0 regressions).
- **Capability maturity change:** FR-008 in-app channel — all four layers now implemented and unit-tested: persistence (`migrations/0013` + `writeNotification.js`), write path (`sendAlert.js` fan-out), API (`notificationRoutes.js`), and dashboard UI (`dashboard.html`). Remaining gaps: no Playwright/E2E test, no integration test for worker → DB row path, production SMTP relay and Slack webhook unverified.

---

### 2026-06-16 — FR-008 Notification API Layer (GET /api/notifications + PATCH /api/notifications/:id/read)
- **Files added:**
  - `backend/routes/notificationRoutes.js` — authenticated Express router with two endpoints; `'use strict'`; `router.use(authenticate)`; uses `req.app.locals.db.query()`; errors routed to `next(err)`
  - `tests/unit/backend/routes/notificationRoutes.test.js` — 17 HTTP contract tests using supertest; `jest.mock` stubs `authenticate` to inject `req.user = { userId: 1 }`; `makeDb(...results)` helper queues `mockResolvedValueOnce` results; `buildApp(db)` creates isolated Express instances per test with an inline error handler
- **Files modified:**
  - `backend/server.js` — added `require('./routes/notificationRoutes')` and `app.use('/api/notifications', notificationRoutes)`; no other changes
- **Production code changed:** Yes. `GET /api/notifications` and `PATCH /api/notifications/:id/read` are now live HTTP endpoints when the server is running.
- **`GET /api/notifications` behavior:** Issues two parallel queries via `Promise.all`. List query: `SELECT id, type, priority, title, body, status, dedupe_key, created_at, sent_at, read_at, expires_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 20`. Count query: `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND status NOT IN ('READ', 'EXPIRED')`. Returns `{ notifications: [...rows], unreadCount: N }`. Both queries are scoped to `req.user.userId` — no cross-user data exposure possible.
- **`PATCH /api/notifications/:id/read` behavior:** Parses `req.params.id` as integer — returns HTTP 400 immediately (no DB call) for non-integer values. Issues `UPDATE notifications SET status = 'READ', read_at = NOW() WHERE id = $1 AND user_id = $2`. `rowCount === 0` → HTTP 404 (not owned or non-existent). `rowCount >= 1` → HTTP 200 `{ success: true }`. Idempotent: an already-READ row still matches the WHERE clause and returns `{ success: true }`.
- **Test coverage (17 tests):**
  - *GET (9):* HTTP 200; response shape `{ notifications: Array, unreadCount: Number }`; both queries scoped to userId; ORDER BY created_at DESC in list SQL; LIMIT 20 in list SQL; notification rows from list query in response; unreadCount matches count query integer; count SQL filters NOT IN ('READ', 'EXPIRED'); DB failure → 500
  - *PATCH (8):* HTTP 200 + `{ success: true }` for owned notification; UPDATE SQL WHERE id=$1 AND user_id=$2; UPDATE SQL sets status=READ and read_at=NOW(); 404 for wrong user; 404 for non-existent id; idempotent second PATCH returns `{ success: true }`; 400 + no db.query for non-integer id; DB failure → 500
- **Tests:** 17/17 passing. Full suite: **6,589 passing, 32 skipped, 0 failing** (was 6,572; +17 new tests, 0 regressions).
- **Capability maturity change:** FR-008 Notifications — **Integrated (write path end-to-end) → Integrated / Read path added**. The notification read layer is now implemented and HTTP contract-tested. Active users will receive notification rows written to DB (via snapshotWorker → sendAlert → writeNotification); they can now retrieve them via `GET /api/notifications` and acknowledge them via `PATCH /api/notifications/:id/read`. Remaining gaps before "Verified": no frontend notification UI (unread badge, panel, markRead wiring); no integration test against a live PostgreSQL instance for the full worker → DB row path.

### 2026-06-16 — FR-008 snapshotWorker DB Wiring (startSnapshotWorker(db) → sendAlert(snapshot, { db }))
- **Files changed:**
  - `services/worker/snapshotWorker.js` — `function startSnapshotWorker()` → `function startSnapshotWorker(db)`; `sendAlert(snapshot).catch(...)` → `sendAlert(snapshot, { db }).catch(...)`
  - `backend/server.js` — `startSnapshotWorker()` → `startSnapshotWorker(db)` (one-line call-site change; `db` was already in scope as the `pg.Pool` singleton from `execution/db.js`)
  - `tests/unit/services/worker/snapshotWorker.test.js` — 2 assertion updates + 2 new tests added
- **Production code changed:** Yes. When `ENABLE_SNAPSHOT_WORKER=true` and `DATABASE_URL` is configured, each `setInterval` tick now calls `sendAlert(snapshot, { db: pool })` instead of `sendAlert(snapshot)`. This activates `_writeInAppNotifications` in `sendAlert.js` — one `notifications` row is written per active user (`WHERE deleted_at IS NULL`) whenever `shouldAlert(snapshot)` returns true and the `_sent` dedup key has not been seen this process lifetime. All existing behavior is preserved: snapshot scheduling, `appendSummarySnapshot`, `appendRepoHistorySnapshot`, GitHub sync, `try/catch` isolation, and the fire-and-forget `.catch()` on `sendAlert`.
- **How db is obtained:** `execution/db.js` exports a `pg.Pool` singleton that throws at module load if `DATABASE_URL` is unset. `server.js` already holds this pool (`const db = require('../execution/db')` on line 9). The pool is passed as an explicit parameter — matching the pattern used everywhere else (routes receive db via `req.app.locals.db`). No new import is added to `snapshotWorker.js`.
- **Failure isolation preserved:** The `sendAlert(snapshot, { db }).catch(err => ...)` call is fire-and-forget. If `db.query` fails (e.g. DB unreachable), or if any `writeNotification` call rejects, the error is caught by `sendAlert`'s internal `.catch()` and logged. The worker `setInterval` callback does not throw; the next tick fires normally.
- **Test changes (snapshotWorker.test.js):**
  - Updated assertion in test 2: `toHaveBeenCalledWith(SNAPSHOT)` → `toHaveBeenCalledWith(SNAPSHOT, { db: undefined })` (reflects two-argument call when no db passed to worker in tests)
  - Updated assertion in test 5 (appendRepoHistory throws): same correction
  - Added `describe('snapshotWorker — db wiring')` with 2 new tests:
    - `passes { db } to sendAlert when db is provided to startSnapshotWorker` — creates `mockDb = { query: jest.fn() }`, calls `startSnapshotWorker(mockDb)`, asserts `sendAlert.toHaveBeenCalledWith(SNAPSHOT, { db: mockDb })`
    - `passes { db: undefined } to sendAlert when no db is provided (backward compat)` — confirms `startSnapshotWorker()` still works without argument
- **Tests:** 7/7 passing (was 5/5 before this session). Full suite: **6,572 passing, 32 skipped, 0 failing** (was 6,570; +2 new tests, 0 regressions).
- **Capability maturity change:** FR-008 Notifications — in-app channel: **Partially Integrated → Integrated** (write path end-to-end). The full chain `snapshotWorker → sendAlert → writeNotification` is now wired in production code and unit-tested. In-app notifications are written to the `notifications` table at runtime for every active user when an alert condition fires. Remaining gaps before "Verified": no notification API routes, no frontend UI, no integration test against a live PostgreSQL instance.

### 2026-06-16 — FR-008 sendAlert In-App Wiring (sendAlert → writeNotification fan-out)
- **Files changed:**
  - `services/notifications/sendAlert.js` — modified: signature changed from `sendAlert(summary)` to `sendAlert(summary, { db } = {})`; added `require('../../execution/notifications/writeNotification')`; added `_writeInAppNotifications(db, summary)` private helper; added `inAppWrites` as third entry in `Promise.allSettled`
- **Files added:**
  - `tests/unit/services/notifications/sendAlert.inapp.test.js` — 16 wiring unit tests
- **Production code changed:** `sendAlert.js` behavior changed when `db` is provided. Behavior is unchanged when `db` is absent (all existing callers pass no second argument — `snapshotWorker.js` unaffected). `'use strict'` added (was missing from the original file).
- **Design:** When `db` is truthy, `_writeInAppNotifications(db, summary)` issues `SELECT id FROM users WHERE deleted_at IS NULL`, then fans out `writeNotification({ db, userId: row.id, summary })` for each active user via `Promise.all`. This promise is wrapped with `.catch(err => console.error(...))` before entering `Promise.allSettled` — isolating in-app write failures from email and Slack delivery. When `db` is falsy, `inAppWrites = Promise.resolve()` — effectively a no-op. The existing `_sent` Set dedup gate fires before either channel path, so in-app writes are also suppressed on duplicates.
- **Two-layer dedup preserved:** (1) `_sent` Set (process-lifetime, in-memory): prevents `_writeInAppNotifications` from being called at all for a repeated key. (2) `notifications_user_dedupe_key_uidx` partial unique index (persistent DB): ON CONFLICT DO NOTHING in `writeNotification.js` handles cross-restart duplicates.
- **Test coverage (16 tests across 4 describe blocks):**
  - *db provided (5):* queries `SELECT id FROM users WHERE deleted_at IS NULL`; calls writeNotification N times for N users; passes `{db, userId, summary}` exactly; calls for each specific user id; does not call when user list is empty
  - *db absent (4):* no writeNotification when second arg omitted; no throw when second arg omitted; no writeNotification when db is null; no writeNotification when db is undefined
  - *failure isolation (5):* writeNotification rejection does not throw; email still fires when writeNotification rejects; Slack still fires when writeNotification rejects; db.query rejection does not throw; email and Slack still fire when db.query rejects
  - *dedup preserved (2):* second call with same key is suppressed (writeNotification not called); after `_sent.clear()`, writeNotification is called again
- **Tests:** 16/16 passing. Full suite: **6,570 passing, 32 skipped, 0 failing** (was 6,554; +16 new tests, 0 regressions).
- **Capability maturity change:** FR-008 Notifications — in-app channel: **Scaffolded / Unit-Tested → Partially Integrated**. The `sendAlert → writeNotification` write path is wired and unit-tested. In-app notifications will be written per active user when `db` is supplied to `sendAlert`. The channel is not end-to-end active yet: `snapshotWorker.js` still calls `sendAlert(snapshot)` without `db`, so no notifications are written at runtime until the worker is wired.

### 2026-06-16 — FR-008 In-App Notification Persistence Layer (Migration 0013 + writeNotification.js)
- **Files added:**
  - `migrations/0013_create_notifications.js` — DDL migration
  - `execution/notifications/writeNotification.js` — DB write execution script
  - `tests/unit/migrations/0013_notifications.test.js` — 24 migration unit tests
  - `tests/unit/execution/notifications/writeNotification.test.js` — 30 write-path unit tests
- **Production code changed:** None. `sendAlert.js` and `snapshotWorker.js` are not yet wired. No routes added. No frontend changes.
- **Design:** Option B — per-user ownership. `user_id NOT NULL FK → users(id) ON DELETE CASCADE`. One notification row per user per alert condition. Per-user deduplication via partial unique index `notifications_user_dedupe_key_uidx ON (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL`. `writeNotification` uses `ON CONFLICT ON CONSTRAINT notifications_user_dedupe_key_uidx DO NOTHING RETURNING` — returns inserted row or null (duplicate). Priority mapping: `alertState === 'Critical'` → `CRITICAL`; `trend === 'Worsening'` → `HIGH`; otherwise `MEDIUM`. dedupe_key format: `alertState:trend` (e.g., `Critical:Worsening`). expires_at = NOW() + 90 days.
- **Deliberate omissions:** `project_id` FK omitted — no `projects` table exists yet. `id` uses `serial` (not UUID) to match FK type convention in all other tables. `sent_at` column present but not set by `writeNotification` (set by future dispatch step).
- **Migration 0013 test coverage (24 tests):** module structure (up/down/shorthands exported); `notifications` table name; user_id notNull + references `"users"(id)` + ON DELETE CASCADE; status notNull + default CREATED + all 6 lifecycle values in check; priority notNull + all 4 priority values in check; title notNull varchar(255); body notNull text; dedupe_key nullable; created_at notNull timestamptz; read_at nullable; expires_at nullable; 4+ pgm.sql calls; all 4 index names present; `notifications_user_id_created_at_idx` DESC; `notifications_user_id_status_idx`; `notifications_user_dedupe_key_uidx` is UNIQUE INDEX + covers user_id+dedupe_key + WHERE dedupe_key IS NOT NULL; down drops notifications table.
- **writeNotification test coverage (30 tests):** guards throw for missing/null/falsy db, userId, summary; db.query called exactly once; INSERT INTO notifications statement; ON CONFLICT + DO NOTHING; RETURNING clause; userId is first parameter; portfolio_alert type; all priority mappings (Critical→CRITICAL, non-critical Worsening→HIGH, Critical+Stable stays CRITICAL, Normal/Stable→MEDIUM); dedupe_key = alertState:trend for all 3 fixtures; expires_at is a Date instance; expires_at is approximately 90 days from now; title contains [RepoPulse] + alertState + trend; body contains Alert State, trend, riskScore%, atRisk/total; returns inserted row; returns null when ON CONFLICT fires; different userId + same dedupe_key returns a row (users are independent).
- **Tests:** 54 new unit tests added; all 54 passing. Full suite: **6,554 passing, 32 skipped, 0 failing**. No regressions.
- **Capability maturity change:** FR-008 Notifications — in-app channel: **Absent → Scaffolded / Unit-Tested**. Schema + write path + full unit test coverage are in place. Channel is not integrated yet: `sendAlert.js` not wired, `snapshotWorker.js` not wired, no API routes, no frontend UI.

### 2026-06-15 — FR-008 SMTP Sandbox Integration Test (Mailhog)
- **Files:** `tests/integration/notifications.smtp.integration.test.js` (new, 7 tests)
- **Production code changed:** None.
- **What changed:** Added opt-in SMTP integration test suite that verifies email delivery end-to-end against a live Mailhog SMTP sink (`localhost:1025`). Assertions are made via the Mailhog REST API (`GET /api/v2/messages`). Self-skips under `npm test` when `TEST_INTEGRATION` is not set; consistent with the existing integration test pattern (`describeSmtp = RUN ? describe : describe.skip`). Env vars (`SMTP_HOST`, `SMTP_PORT`, `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `ENABLE_PROACTIVE_ALERTS`) are set programmatically before the first `require()` so they are captured by `config/paths.js` on module load. An `rfc2047Decode()` helper is included to handle RFC 2047 Q-encoded subject headers produced by nodemailer when the em dash (`—`) in the subject template is encoded for MIME transport.
- **`sendEmailAlert` tests (4):**
  - Captures exactly one message in Mailhog inbox
  - Delivers to correct recipient (`oncall@test.local`) and sender (`repopulse@test.local`)
  - Subject contains `[RepoPulse]`, `Critical`, and `Worsening` (decoded from RFC 2047)
  - Body contains `Critical`, `Worsening`, `80%`, and `8 / 10`
- **`sendAlert` orchestration tests (3):**
  - Critical/Worsening snapshot delivers one email to Mailhog
  - Second identical `sendAlert` call is deduped — inbox count remains 1 (proves `_sent` Set gate)
  - Normal/Stable snapshot sends no email — inbox count remains 0 (proves `shouldAlert` gate)
- **Slack:** Intentionally not tested. `SLACK_WEBHOOK_URL` is absent from sandbox env; `slackNotifier` self-skips with a logged message. This proves the `Promise.allSettled` isolation in `sendAlert` — email fires even when Slack is unconfigured.
- **Exact command:** `$env:TEST_INTEGRATION = "true"; npx jest tests/integration/notifications.smtp.integration.test.js --no-coverage`
- **Test results:** 7/7 passing (0.557 s). SMTP and REST API both confirmed live.
- **Mid-run fix:** Initial subject assertion failed because Mailhog stores raw MIME headers — nodemailer encodes subjects containing the em dash as RFC 2047 quoted-printable (`=?UTF-8?Q?...?=`). Added `rfc2047Decode()` helper; test corrected in the same session before the final passing run.
- **Capability maturity change:** FR-008 Notifications — **Integrated / Tested → Integrated / Partially Verified**. The SMTP transport path is now verified against a real SMTP server process (not a mock). Remaining gaps to "Verified": production SMTP relay test; Slack webhook integration test; in-app channel implementation.

### 2026-06-15 — FR-008 nodemailer Dependency Placement Fix
- **Files changed:**
  - `package.json` — `nodemailer@^8.0.5` added to root `dependencies`
  - `backend/package.json` — `nodemailer` removed from `dependencies`
  - `package-lock.json` — updated (`npm install`; added 1 package, 388 audited)
  - `services/notifications/emailNotifier.js` — `requireNodemailer()` wrapper and `Module.createRequire` fallback fully removed; replaced with `const nodemailer = require('nodemailer')` at top of file
  - `tests/unit/services/notifications/emailNotifier.test.js` — `{ virtual: true }` option and its explanatory comment removed from `jest.mock('nodemailer', ...)`
- **Production code behavior changed:** No. `sendEmailAlert` produces identical output — same `createTransport` arguments, same `sendMail` payload, same logging. Resolution path changes: `require('nodemailer')` now resolves from root `node_modules` on first attempt; no try/catch fallback.
- **Tests:** No new tests added. All 6,500 tests continue to pass. `emailNotifier.test.js` now mocks `nodemailer` via standard `jest.mock()` — Jest resolves the real module from root `node_modules` before substituting the factory, proving the dependency is correctly installed.
- **CI-equivalent run:** `NODE_ENV=test npm test` — 6,500 / 6,525 passing; 25 skipped (integration, unchanged); 0 failing; all global coverage thresholds met (statements 96.44%, branches 89.33%, functions 98.21%, lines 97.80%).
- **Capability maturity change:** FR-008 Notifications — structural dependency risk resolved; `nodemailer` dependency placement is now correct and standard. Remaining gaps to next maturity level (Integrated / Partially Verified): Mailhog or Ethereal SMTP integration test; in-app notification channel.

### 2026-06-14 — FR-008 Mocked Notification Channel Coverage
- **Files:** `tests/unit/services/notifications/emailNotifier.test.js` (new, 4 tests), `tests/unit/services/notifications/slackNotifier.test.js` (new, 2 tests)
- **Production code changed:** None
- **What changed:** Added positive-path and payload-content unit tests for `emailNotifier.js` and `slackNotifier.js` that run under `npm test` (placed in `tests/unit/services/notifications/` to match `jest.config.js` `testMatch` — `tests/notifications.test.js` falls outside the pattern and was not modified)
- **`emailNotifier.test.js` — 4 tests:**
  - `sendMail` is called when `SMTP_HOST` and `ALERT_EMAIL_TO` are both configured (positive send path — previously untested; if the `sendMail` call were deleted, all prior tests would still pass)
  - `sendMail` receives `{ from, to, subject, text }` with correct types
  - `subject` contains `alertState` (`'Critical'`) and `trend` (`'Worsening'`)
  - `text` body contains `alertState` and `trend` values
- **`slackNotifier.test.js` — 2 tests:**
  - `fetch` body is valid JSON with a top-level `text` field (proves `JSON.stringify({ text })` shape)
  - `text` contains `alertState` and `trend` values
- **Structural risk surfaced:** `jest.mock('nodemailer', factory)` requires `{ virtual: true }` because `nodemailer` is absent from root `node_modules`. This confirms the `nodemailer`-in-`backend/package.json`-only risk is real and will block any Mailhog/Ethereal integration test until the dependency is moved to root `package.json`.
- **Tests:** 6/6 new tests passing. Full suite: **6,500/6,525** (was 6,494/6,519; +6 tests, 0 new failures, 25 skipped unchanged)
- **Capability maturity change:** FR-008 Notifications — **Integrated / Tested** classification maintained; coverage is now more honest: positive send path and payload content are verified at the unit layer. Remaining gap to next maturity level (Integrated / Partially Verified): Mailhog or Ethereal SMTP integration test, and `nodemailer` dependency relocation.

### 2026-06-13 — CI Workflow First Successful Run
- **Workflow:** CI (`.github/workflows/ci.yml`)
- **Commit:** `4e58590` — "Add CI workflow, notification fixes, FR-009 filtering, and ADR records"
- **Trigger:** push to `main`
- **Runner:** ubuntu-latest, Node 20
- **Steps executed:** `actions/checkout@v4` → `actions/setup-node@v4` (npm cache) → `npm ci` → `npm test`
- **Status:** Success
- **Runtime:** 32 seconds
- **Test results:** 6,494 passed / 6,519 total; 25 skipped (integration, self-skipped — no `TEST_INTEGRATION`); 2 suites skipped (integration); 0 failing
- **Coverage thresholds:** Met (≥80% branches/functions/lines/statements — same as verified locally 2026-06-13)
- **Secrets used:** None — no database, no Redis, no Slack, no SMTP, no GitHub token
- **Integration tests:** Self-skipped by design; not yet part of automated CI
- **Files changed:** None — this entry records CI execution evidence only
- **Capability maturity change:** CI/CD — **Scaffolded / Locally Verified → Verified** — unit tests now run on GitHub-hosted runners on every push; first remote execution confirms workflow syntax, Node 20 compatibility, and test suite stability in a clean environment

### 2026-06-12 — FR-009 HTTP Contract Tests (supertest)
- **Files:** `tests/unit/backend/routes/repoRoutes.http.test.js` (new)
- **Change:** Added 10 supertest-based HTTP contract tests that mount the repo Express router in a minimal test app with a mocked `db` and a stub authenticate middleware that injects `req.user = { userId: 1 }`. Tests issue real HTTP requests through the Express routing layer — not direct handler calls. No real database used; no production code changed.
- **What is now proven that was not before:** Express parses `?riskLevel=healthy` into `req.query.riskLevel === 'healthy'` correctly (Gap A from the FR-009 Integration Test Design Report). The response body shape is `{ repos: [...] }` as `loadRepos()` expects (Gap B). These two gaps existed even though the handler-level unit tests in `repoRoutes.test.js` all passed — those tests bypass Express routing entirely.
- **Dependency changes:** None. `supertest@7.2.2` was already present in `backend/package.json` devDependencies and installed.
- **Tests — `GET /api/repos?riskLevel=healthy` (4 tests):** HTTP 200; `{ repos: Array }` body; `db.query` called with `[userId, 'healthy']`; all returned repos have `label === 'healthy'`.
- **Tests — `GET /api/repos` no param (3 tests):** HTTP 200; `db.query` called with `[userId, null]`; mixed-label repos returned as-is.
- **Tests — `GET /api/repos?riskLevel=<invalid>` (3 tests):** HTTP 400; `error` key in body; `db.query` not called.
- **Tests:** 10/10 passing. Full suite: 6,494/6,519 passing.
- **Capability maturity change:** FR-009 Search and Filtering — Healthy risk-filter path: **Partially Implemented / Frontend + Backend Integrated → Integrated / Tested**. Overall FR-009 remains Partially Implemented because 5 spec dimensions (repository name search, project status, assigned manager, activity recency, intern contributor) are still absent. SQL filter correctness against real PostgreSQL remains unverified (integration test not yet written).

### 2026-06-12 — FR-009 Frontend Backend-Filter Integration (Option A)
- **Files:** `frontend/dashboard.html` (modified), `tests/unit/frontend/dashboardFilterLoad.test.js` (new)
- **Change:** Added `buildReposUrl(options)` pure helper — returns `/api/repos` with `?riskLevel=<encoded>` appended when `options.riskLevel` is truthy. Added `filterToLoadOptions(activeFilter)` pure helper — maps `'Healthy'` → `{ riskLevel: 'healthy' }`, all other filters → `null`. Updated `loadRepos()` to accept optional options argument (previously no parameters). Updated filter click handler to call `loadRepos(filterToLoadOptions(_activeFilter))` instead of `applyFilter()`. Healthy filter now issues `GET /api/repos?riskLevel=healthy` on every click. All and At Risk filters call `loadRepos()` with no argument — backend receives no `riskLevel` param, returns all active repos. `applyFilter()` is still called inside `loadRepos()` after the fetch resolves (unchanged path). At Risk client-side semantics unchanged: `r.label === 'critical' || r.label === 'at-risk'`.
- **Semantic mismatch (by design):** `?riskLevel=at-risk` would return only `at-risk` rows; the "At Risk" toggle requires `critical || at-risk`. Option A preserves the correct user-visible behavior by keeping At Risk client-side. Documented in Known Risks.
- **Side effect (documented):** When the Healthy filter is active, `_repos` is replaced with only healthy repos from the server. Count display shows `N/N` instead of `N/M`. Accepted — no regression in filter semantics.
- **Tests:** 14 new tests in `tests/unit/frontend/dashboardFilterLoad.test.js` — all passing. Covers: `buildReposUrl` with absent/null/empty options, healthy/at-risk/critical riskLevel values; `filterToLoadOptions` Healthy result shape, All returns null, At Risk returns null; end-to-end composition Healthy→URL, All→base URL, At Risk→base URL.
- **Tests:** 14/14 passing. Full suite: 6,484/6,509 passing.
- **Capability maturity change:** FR-009 Search and Filtering: **Partially Implemented / Backend Integrated → Partially Implemented / Frontend + Backend Integrated (Healthy path)** — Healthy path is now integrated and tested end-to-end (frontend → backend → SQL). Remaining gaps: At Risk semantic mismatch (by design, Option A); 5 spec dimensions absent.

### 2026-06-12 — FR-009 Backend riskLevel Filter
- **Files:** `backend/routes/repoRoutes.js` (modified), `tests/unit/backend/routes/repoRoutes.test.js` (modified)
- **Change:** `GET /api/repos` now accepts an optional `?riskLevel=` query parameter. Valid values: `healthy`, `at-risk`, `critical`. Invalid values return HTTP 400 without calling `db.query`. Absent param returns all active repos (backward compatible — existing behavior preserved). SQL filtering added as `AND ($2::varchar IS NULL OR rs.label = $2)` inside the existing user-scoped query (`WHERE r.user_id = $1 AND r.is_active = true`). RBAC boundary is unchanged. Frontend behavior unchanged — existing At Risk toggle continues to use client-side `critical || at-risk` predicate; not yet wired to the backend parameter.
- **Tests:** 7 new tests added to `describe('repoRoutes GET / — riskLevel filter', ...)`: absent param passes `null` as `$2`; `healthy`/`at-risk`/`critical` each passed as the second SQL parameter; SQL clause matches `$2 IS NULL OR rs.label = $2` pattern; HTTP 400 returned for invalid value; `db.query` not called for invalid value. All 5 pre-existing `GET /` tests pass unchanged (none assert on SQL parameter array).
- **Tests:** 236/236 passing (was 229/229). Full suite: 6,470/6,495 passing.
- **Capability maturity change:** FR-009 Search and Filtering: **Partially Implemented → Partially Implemented / Backend Integrated** — server-side risk-level filtering is now implemented, tested, and RBAC-scoped. Remaining gaps: frontend not wired to backend parameter; At Risk toggle semantic mismatch with `?riskLevel=at-risk` documented; 5 spec dimensions absent.

### 2026-06-12 — FR-009 Label Filter Tests
- **Files:** `tests/unit/frontend/dashboardFilter.test.js` (new)
- **Change:** Added 29 unit tests covering the client-side label filter in `frontend/dashboard.html`. No production code changed. Tests cover: All filter returns complete list; At Risk filter includes `critical` and `at-risk` labels only; Healthy filter includes `healthy` label only; empty-result cases (At Risk on all-healthy list, Healthy on all-critical/at-risk list); count display logic (singular/plural for All, `filtered / total` format for non-All).
- **Tests:** 29/29 passing. Full suite: 6,463/6,488 passing.
- **Capability maturity change:** FR-009 Search and Filtering: **Scaffolded → Partially Implemented** — the one implemented dimension (label/risk filter) is now provably correct and regression-protected. Prior gap: if the filter predicate were changed to return all repos for every filter value, all prior tests would still pass. That gap is now closed for the implemented dimension. Remaining gaps: 5 of 6 spec dimensions absent; no backend filter API; no RBAC-aware server-side search.

### 2026-06-12 — snapshotWorker Routing Test
- **Files:** `tests/unit/services/worker/snapshotWorker.test.js` (new)
- **Change:** Added 5 worker routing tests using Jest fake timers and full dependency mocking. No production code changed. Verifies: `sendAlert` is called after `appendSummarySnapshot` succeeds; `sendAlert` receives the exact snapshot object; `sendAlert` rejection does not crash the worker (fire-and-forget `.catch()` is tested); `appendSummarySnapshot` failure prevents `sendAlert`; `appendRepoHistorySnapshot` failure does not suppress alert dispatch (inner `try/catch` isolation confirmed by test).
- **Tests:** 5/5 passing. Full suite: 6,434/6,459 passing.
- **Capability maturity change:** FR-008 Notifications: **Partially Implemented / Unit-Tested → Integrated / Tested** — worker call chain `snapshotWorker → sendAlert` is now verified. Prior gap: if `sendAlert(snapshot)` were deleted from worker code, all 15 previous notification tests would still pass. That gap is now closed. Remaining gaps: production end-to-end delivery unverified; in-app channel absent; `nodemailer` dependency placement fragile.

### 2026-06-12 — FR-008 Notification Configuration Fix
- **Files:** `config/paths.js`, `.env.example`
- **Change:** `config/paths.js` now exports all 8 notification-related environment variables (`ENABLE_PROACTIVE_ALERTS`, `SLACK_WEBHOOK_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `ALERT_EMAIL_TO`, `ALERT_EMAIL_FROM`). `ENABLE_PROACTIVE_ALERTS` is exported as a boolean (`=== 'true'`). `.env.example` email provider section replaced with correct `Proactive Alerts` section; orphaned vars `EMAIL_PROVIDER_API_KEY` and `EMAIL_FROM_ADDRESS` removed. No notification logic, worker code, tests, specs, or ADRs modified.
- **Root cause resolved:** All 8 vars were previously absent from `config/paths.js` exports, causing `sendAlert` to always exit at the `ENABLE_PROACTIVE_ALERTS !== true` guard and both channel notifiers to always skip. Delivery was structurally disabled in every environment.
- **Tests:** 15/15 notification tests now pass (was 10/15 — 5 failures resolved). Prior failures: `sendSlackAlert` calls fetch, throws on non-ok; `sendAlert` fires for Critical/Worsening, dedup fires once, resends after `_sent.clear()`.
- **Capability maturity change:** FR-008 Notifications: Scaffolded/Broken → Partially Implemented / Unit-Tested

### 2026-06-12 — Executive Portfolio Briefing Card
- **Files:** `frontend/dashboard.html`, `tests/unit/frontend/dashboardPortfolioBriefing.test.js` (new)
- **Change:** Added `buildPortfolioBriefingHtml(kpi, repos, repoIntel)` pure renderer; `renderPortfolioBriefing()` caller; HTML container `#portfolio-briefing` inserted between summary cards and portfolio tabs; 5 call sites wired to existing portfolio loaders and `loadRepos`.
- **Tests added:** 48 (all passing)
- **Capability maturity:** Dashboard — Portfolio Briefing: Tested

### 2026-06-12 — Recent Version Changes Card (P4)
- **Files:** `frontend/dashboard.html`, `tests/unit/frontend/dashboardRemediation.test.js`
- **Change:** `buildRecentVersionChangesHtml(fc, esc)` + `loadRecentVersionChanges(repoId)` + container `#repo-version-changes-content` in Remediation tab; displays `version_change` drift events from `_archForecastDataByRepoId`.
- **Tests added:** 27 (total dashboardRemediation: 173 passing)

### 2026-06-12 — Top Risk Drivers Refinement (P3)
- **Files:** `frontend/dashboard.html`, `tests/unit/frontend/dashboardRepoPriority.test.js`
- **Change:** Renamed "Attention Drivers" → "Top Risk Drivers"; added sort by contribution descending; capped at 5. Refine of existing `buildAttentionDriversHtml(aq)`.
- **Tests added:** 10 new tests (total dashboardRepoPriority: 23 passing)

### 2026-06-12 — Recent Regressions Card (P2)
- **Files:** `frontend/dashboard.html`, `tests/unit/frontend/dashboardRemediation.test.js`
- **Change:** `buildRecentRegressionsHtml(fc, esc)` + `loadRecentRegressions(repoId)` + container `#repo-regressions-content`; filters regression-type drift events, sorted most-recent-first, capped at 5.
- **Tests added:** 46 (cumulative total grew to 146 before P4)

### 2026-06-12 — Top Remediation Actions Card (P1)
- **Files:** `frontend/dashboard.html`, `tests/unit/frontend/dashboardRemediation.test.js`
- **Change:** `buildTopRemediationActionsHtml(data, esc)` pure renderer; priority sort (critical→high→medium→low); cap at 5; fallback to `actionPlan.immediate` then `actionPlan.shortTerm`.
- **Tests added:** 27

### 2026-06-11 — Portfolio Tabs & Dashboard Restructure
- **Files:** `frontend/dashboard.html`
- **Change:** Converted flat portfolio sections to tabbed layout (Architecture / Portfolio Forecast / Engineering Governance / Architecture Watchlists).

### 2026-06-12 — History Chart Tests
- **Files:** `tests/unit/frontend/dashboardHistoryChart.test.js` (new)
- **Change:** Added empty-state tests for history chart renderer.

*(Earlier May–June 2026 history: ~130 commits covering architecture intelligence modules, portfolio forecasting, governance scoring, watchlist system, remediation explainability, change risk API, maturity index.)*

---

## Recommended Next Actions

Listed by priority (CLAUDE.md Anti-Drift Rule: close highest-value maturity gaps in required capabilities first).

### ~~1 — Resolve Frontend Architecture Divergence~~ ✅ RESOLVED (2026-06-12)
ADR-001 accepted. Vanilla JS frontend accepted for Phases 1–5. Spec updated. React migration formally deferred to Phase 6+ with defined triggers. See `docs/adr/ADR-001-frontend-technology.md`.

### ~~1 — Resolve FR-007 Real-Time Updates~~ ✅ RESOLVED (2026-06-12)
ADR-002 accepted. 60-second polling accepted for Phases 1–5; satisfies "no manual refresh" acceptance criterion. WebSocket transport deferred to Phase 6+ with defined triggers. Spec and PROGRESS.md updated. See `docs/adr/ADR-002-realtime-transport.md`.

### 1 — Complete FR-008 In-App Notification Channel Integration (Medium)
Configuration fixed (2026-06-12). Email/Slack unit paths tested (2026-06-14, 26/26). ~~`nodemailer` must be moved to root~~ — **resolved 2026-06-15**. ~~No SMTP integration test~~ — **resolved 2026-06-15** (7/7 Mailhog tests passing). ~~No in-app persistence layer~~ — **resolved 2026-06-16** (`migrations/0013_create_notifications.js` + `execution/notifications/writeNotification.js`; 54 unit tests). ~~Wire `sendAlert.js`~~ — **resolved 2026-06-16** (`sendAlert(summary, { db })` fans out `writeNotification` per active user; 16 unit tests; failure-isolated). ~~Wire `snapshotWorker.js`~~ — **resolved 2026-06-16** (`startSnapshotWorker(db)` passes `pg.Pool`; 7/7 worker tests; in-app channel runtime-active). **Remaining steps to close FR-008:**
- ~~**(c) Add `backend/routes/notificationRoutes.js`**~~ — **resolved 2026-06-16**: `GET /api/notifications` + `PATCH /api/notifications/:id/read` implemented; 17/17 route tests passing; registered in `backend/server.js`
- ~~**(d) Add notification UI to `frontend/dashboard.html`**~~ — **resolved 2026-06-16**: topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in `refresh()` loop, `markNotificationRead(id)`, `toggleNotificationPanel()`; 29/29 frontend unit tests passing; in-app channel now fully implemented across all four layers (persistence, write path, API, UI)
- **(e) Add `tests/integration/notifications.db.integration.test.js`** (opt-in, requires TEST_INTEGRATION=true + live PostgreSQL) — proves the full worker → DB row path end-to-end against a real PostgreSQL instance; currently the only unverified link in the in-app chain
- ~~**(f) Add Playwright E2E test for notification UI (unauthenticated + authenticated)**~~ — **resolved 2026-06-17**: unauthenticated path verified via `tests/e2e/dashboard.smoke.spec.js` (8/8 passing, 2026-06-16); authenticated notification UI verified via `tests/e2e/notifications.authenticated.spec.js` (2/2 passing, 2026-06-17: badge count=1 visible, panel opens + title + HIGH badge, mark-read PATCH 200, badge hides on re-fetch; real session/DB/API exercised; no production code changed). Open defect: `#notif-badge` CSS visual-hide (inline `display:inline-flex` overrides `[hidden]`); production fix pending CLAUDE.md §4 approval
- Remaining delivery gaps: production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only)

### 2 — Complete FR-009 Filtering (Medium)
Label/risk filter tested (29/29 passing, 2026-06-12). Backend riskLevel filter tested (2026-06-12). ~~Frontend not wired to backend parameter~~ — **resolved 2026-06-12** (Healthy filter calls `GET /api/repos?riskLevel=healthy`; wiring tested). ~~HTTP layer contract untested~~ — **resolved 2026-06-12** (supertest HTTP contract tests). ~~Repository name search absent~~ — **resolved 2026-06-17** (backend `?search=` with ILIKE + 200-char limit + HTTP 400 on invalid; `#repo-search-input` in filter bar; `buildReposUrl` supports riskLevel + search composition; 260/260 backend route tests + 53/53 frontend filter tests passing). Remaining gaps: (a) At Risk toggle intentionally uses client-side `critical || at-risk` (by design in Option A — acceptable for Phases 1–5); (b) 4 spec dimensions still absent: project status, assigned manager, activity recency, intern contributor; (c) SQL ILIKE correctness against real PostgreSQL unverified (no integration test against live DB yet).

### 3 — Implement NFR-007 Data Governance (Medium)
User data deletion, project archival, repository disconnection, and data export are required by the spec. None are found in the repository.

### ~~4 — Add Snapshot Worker Tests~~ ✅ RESOLVED (2026-06-12)
`tests/unit/services/worker/snapshotWorker.test.js` added with 5 routing tests (all passing). Verifies `sendAlert` dispatch, exact snapshot argument, rejection isolation, snapshot failure guard, and repo-history failure isolation. All external dependencies mocked; fake timers used; no real communications sent.

### 5 — Add Playwright / E2E Tests (Medium)
~~Playwright toolchain absent~~ — **scaffolded 2026-06-16**: `@playwright/test` installed; `playwright.config.js` created; `test:e2e` script added; Jest isolation confirmed. ~~webServer crashes on GitHub API timeout~~ — **resolved 2026-06-16**: webServer command updated to `cross-env PROJECT_SOURCE=file npm run dev`; startup config is now stable. ~~No E2E test files~~ — **resolved 2026-06-16**: `tests/e2e/dashboard.smoke.spec.js` added; 8/8 unauthenticated smoke tests passing in Chromium headless (`npm run test:e2e` exits 0, 14.8 s). Remaining steps:
- ~~Install Chromium binary~~ — **done 2026-06-16** (`npx playwright install chromium`; `chromium-1228` + `chromium_headless_shell-1228` installed to `%LOCALAPPDATA%\ms-playwright\`)
- ~~Write `tests/e2e/dashboard.smoke.spec.js`~~ — **done 2026-06-16** (8/8 passing: /dashboard loads, page title, `#notif-btn` visible, panel hidden, bell toggle, Login link, no JS errors)
- ~~Solve authenticated E2E session seeding~~ — **resolved 2026-06-17**: `tests/e2e/globalSetup.js` uses `upsertUser()` + `createSession()` directly against test DB; storageState saved to `tests/e2e/.auth/user.json`; `playwright.config.js` wired with `globalSetup`; `tests/e2e/.auth/` gitignored; no backend route added; verified `node tests/e2e/globalSetup.js` → exit 0
- ~~Write authenticated E2E test specs~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` added (2/2 passing). ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added; `not.toBeVisible()` assertion used; 10/10 E2E passing.
- Wire E2E job in `.github/workflows/ci.yml`: requires PostgreSQL service container, `npx playwright install chromium` step, `DATABASE_URL` secret, opt-in guard (`RUN_E2E=true`)

### ~~6 — Add CI/CD Pipeline~~ ✅ RESOLVED (2026-06-13)
`.github/workflows/ci.yml` created and verified. First successful GitHub Actions run on commit `4e58590` (push trigger, ubuntu-latest, Node 20, 32 s, 6,494/6,519 passing). Unit tests now run automatically on every push and every PR to main. Integration tests remain opt-in (not yet automated — require live PostgreSQL).

### 7 — Implement GitHub API Rate-Limit Handling (Medium)
NFR-004 requires graceful rate-limit handling. GitHub returns HTTP 429 / 403 with `X-RateLimit-*` headers. Add retry with exponential backoff to the GitHub fetchers.

### 8 — Move `backend/tmp/analyze.js` (Low)
Violates CLAUDE.md layer boundary. Move to `/tmp` or delete if no longer needed.

---

*This file must be updated whenever features are added, tests change, architecture evolves, phases advance, or known risks materially change — per the Mandatory Update Conditions in `CLAUDE.md`.*
