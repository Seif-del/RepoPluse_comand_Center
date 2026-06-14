# PROGRESS.md
**RepoPulse Command Center — Repository Development Ledger**

This is the authoritative implementation-state and maturity tracking file for RepoPulse Command Center.  
It is maintained per the contract defined in `CLAUDE.md`.  
Last updated: **2026-06-13**

---

## Repository Status Classification

**Current Phase:** Phase 5–7 (partial) — Architecture Intelligence complete; Real-Time accepted (ADR-002); Notifications integrated + tested (worker routing verified 2026-06-12; production delivery unverified; in-app absent); Operational Resilience incomplete; CI workflow added (2026-06-13)  
**Overall Maturity:** Partially Implemented / Integrated  
**Test Status:** 6,494 / 6,519 tests passing (25 skipped = integration; 2 suites skipped = integration) — verified 2026-06-13 (local CI dry-run: `NODE_ENV=test npm test`)  
**PROGRESS.md Status:** Created 2026-06-12 (first creation — was absent, violating CLAUDE.md Creation Rule)  
**CI Status:** `.github/workflows/ci.yml` added 2026-06-13 — triggers on push to any branch and PR to main; Node 20; `npm ci` + `npm test`; `NODE_ENV=test`; no secrets; integration tests self-skip (no `TEST_INTEGRATION`)

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
| FR-008 | Notifications (in-app + email) | Integrated / Tested — email + Slack channels implemented; worker call chain verified (20/20 unit tests passing: 15 channel delivery + 5 worker routing); production end-to-end delivery unverified (no real SMTP/Slack test); in-app channel absent (spec requires it) |
| FR-009 | Search and Filtering | Partially Implemented — Healthy risk-filter path: **Integrated / Tested** (HTTP contract verified 2026-06-12); label/risk filter tested (29/29); backend riskLevel filter tested (236/236); frontend wiring tested (14/14); HTTP contract tests prove Express parses `?riskLevel=healthy` → `req.query.riskLevel` → `db.query([userId, 'healthy'])` → `{ repos: [...] }` response shape (10/10 passing 2026-06-12); At Risk semantics unchanged: client-side `critical \|\| at-risk` (by design in Option A); 5 spec dimensions still absent: repository name search, project status, assigned manager, activity recency, intern contributor |
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
- **Overall maturity:** Tested / Verified (unit layer); integration layer intentionally deferred

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
- 12 migrations applied (up to `0012_create_repo_architecture_snapshots.js`):
  `users`, `sessions`, `audit_logs`, `repositories`, `repo_metrics`, `risk_scores`, `repo_pr_metrics`, `repo_architecture_snapshots`
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
- **Capability:** Recommendations (FR-006)
  - Top Remediation Actions card in Remediation tab
  - Recent Regressions card in Remediation tab
  - Recent Version Changes card in Remediation tab
  - Top Risk Drivers (sorted by contribution)
- **Capability:** Search and Filtering (FR-009 — Partially Implemented; Healthy risk-filter path: Integrated / Tested)
  - Label filter: All / At Risk / Healthy (client-side, `applyFilter()` in `frontend/dashboard.html`)
  - Backend riskLevel filter: `GET /api/repos?riskLevel=healthy|at-risk|critical` — user-scoped SQL filter (`AND ($2::varchar IS NULL OR rs.label = $2)`); invalid values return HTTP 400 without hitting db; absent param returns all repos (backward compatible); RBAC boundary preserved
  - Frontend integration (Option A, 2026-06-12): `buildReposUrl(options)` and `filterToLoadOptions(activeFilter)` pure helpers added to `frontend/dashboard.html`; `loadRepos()` accepts optional options object; Healthy filter calls `GET /api/repos?riskLevel=healthy` on click; All and At Risk intentionally call `loadRepos()` without riskLevel (At Risk semantics preserved: client-side `critical || at-risk`)
  - Tests: `tests/unit/frontend/dashboardFilter.test.js` — **29/29 passing** (added 2026-06-12); covers All, At Risk, Healthy, empty result, count display
  - Tests: `tests/unit/backend/routes/repoRoutes.test.js` — **7 new riskLevel filter tests** (added 2026-06-12); 236/236 total passing
  - Tests: `tests/unit/frontend/dashboardFilterLoad.test.js` — **14/14 passing** (added 2026-06-12); covers `buildReposUrl` URL construction (6 tests), `filterToLoadOptions` Healthy/All/At Risk mapping (5 tests), end-to-end URL composition (3 tests)
  - Tests: `tests/unit/backend/routes/repoRoutes.http.test.js` — **10/10 passing** (added 2026-06-12); supertest HTTP contract: `GET /api/repos?riskLevel=healthy` → HTTP 200, `{ repos: Array }` body shape, `db.query([userId, 'healthy'])` parameter array, all returned repos have `label === 'healthy'`; absent param → `db.query([userId, null])`; invalid value → HTTP 400 + no `db.query` call
  - Missing: At Risk toggle intentionally uses client-side `critical || at-risk` (documented semantic mismatch with `?riskLevel=at-risk` — by design in Option A); filter by assigned manager, repository name search, activity recency, intern contributor, project status all absent; SQL filter correctness against real PostgreSQL unverified (integration test not yet written)
- **Tests:** 16 frontend unit test files; all pure renderer and filter functions covered. 6,519 total tests passing.
- **Gaps:** No Playwright / E2E tests. FR-009 multi-dimension filter not implemented. Vanilla JS frontend is accepted for Phases 1–5 (see ADR-001).

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
- **Status:** Partially Implemented
- **Capability:** Audit Logging (FR-010) — Integrated / Tested
  - `execution/audit/logEvent.js`
  - Integration test: `tests/integration/audit.integration.test.js` (skipped without live DB)
- **Capability:** Notifications (FR-008) — Integrated / Tested (email + Slack channels only; in-app absent)
  - `services/notifications/alertDecision.js` — alert routing logic
  - `services/notifications/emailNotifier.js` — nodemailer-based email
  - `services/notifications/slackNotifier.js` — Slack webhook
  - `services/notifications/sendAlert.js` — dispatches to email + Slack
  - `services/worker/snapshotWorker.js` — calls `sendAlert` after each snapshot
  - `config/paths.js` — now exports all 8 notification env vars (fixed 2026-06-12)
  - `.env.example` — now documents correct proactive alert variables (fixed 2026-06-12)
  - Tests: `tests/alertDecision.test.js` (5 tests) + `tests/notifications.test.js` (10 tests) — **15/15 passing**
  - Prior 5 notification test failures (caused by missing `config/paths.js` exports) are resolved
  - `tests/unit/services/worker/snapshotWorker.test.js` — **5/5 routing tests passing** (added 2026-06-12)
    - Verifies: `sendAlert` called after snapshot; receives exact snapshot object; rejection does not crash worker; snapshot failure prevents `sendAlert`; repo-history failure does not suppress alert dispatch
- **Gaps:**
  - No integration test verifying production end-to-end alert delivery (real SMTP / real Slack webhook)
  - `nodemailer` is only in `backend/package.json`, not root `package.json`
  - No in-app notification UI (only email + Slack channels implemented; spec FR-008 requires in-app channel)

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
- **Status:** Not Started
- No CI/CD pipeline configuration (no `.github/workflows/`, no `Dockerfile`)
- No production deployment documentation beyond README quick-start
- No secrets management beyond `.env` / `.env.example`
- No HTTPS enforcement at the application layer (expected at infrastructure level)

---

## Current Testing Status

| Layer | Test Files | Tests | Status |
|---|---|---|---|
| Frontend (pure renderers + filter) | 16 | ~893 | All passing |
| Execution — Architecture | 24 | ~2,100 | All passing |
| Execution — Risk | ~18 | ~1,800 | All passing |
| Execution — Auth/Crypto/RBAC | ~8 | ~400 | All passing |
| Execution — GitHub | ~7 | ~350 | All passing |
| Backend (routes, middleware) | ~9 | ~617 | All passing |
| Directives validation | 1 | ~12 | All passing |
| Integration (audit, auth) | 2 | 25 | **Skipped** — require live PostgreSQL |
| **Total** | **92** | **6,519** | **6,494 passing, 25 skipped, 0 failing** |

### Testing Gaps

- No Playwright / browser E2E tests for dashboard golden path (required by CLAUDE.md)
- ~~`snapshotWorker.js` has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/services/worker/snapshotWorker.test.js`, 5 routing tests, all passing)
- ~~FR-009 label filter has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilter.test.js`, 29 tests, all passing); ~~backend riskLevel filter has no tests~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.test.js`, 7 new riskLevel tests, 236/236 total passing); ~~frontend not wired to backend riskLevel parameter~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilterLoad.test.js`, 14 tests, 14/14 passing); ~~HTTP layer between URL query string and Express handler untested~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.http.test.js`, 10 supertest tests, 10/10 passing)
- `emailNotifier.js`, `slackNotifier.js` unit delivery paths tested (10 tests in `tests/notifications.test.js`); production end-to-end with real SMTP/Slack remains unverified
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
| Notification production delivery unverified | Medium | Worker routing now tested (2026-06-12) — 20/20 unit tests passing. Real SMTP / real Slack webhook delivery remains unverified (no integration test). In-app channel absent (spec FR-008 requires it). `nodemailer` only in `backend/package.json`. |
| FR-009 filter incomplete | Medium | Label/risk filter tested (29/29 passing, 2026-06-12). Backend riskLevel filter tested (236/236 passing, 2026-06-12). Frontend wiring tested (14/14, 2026-06-12). HTTP contract tests added (10/10 passing, 2026-06-12) — prove Express parses `?riskLevel=healthy` correctly and `{ repos: [...] }` response shape matches frontend expectation. **Healthy risk-filter path is now Integrated / Tested.** At Risk toggle intentionally uses client-side `critical \|\| at-risk` (by design in Option A). SQL filter correctness against real PostgreSQL unverified (no integration test yet). 5 spec dimensions still absent: repository name search, project status, assigned manager, activity recency, intern contributor. |
| NFR-007 data governance absent | Medium | User deletion, project archival, data export not found in codebase |
| No CI/CD pipeline | Medium | Tests run locally only; no automated pipeline detected |
| GitHub API rate-limit handling absent | Medium | NFR-004 requires graceful rate-limit handling; not implemented |
| `backend/tmp/analyze.js` in wrong layer | Low | Should be under `/tmp` (scratch) per CLAUDE.md folder boundaries |
| Redis not present | Low | Spec mentions Redis from Phase 3 onward; README lists it as a prerequisite; not installed or referenced |

---

## Recent Implementation History

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

### 1 — Complete FR-008 Notification Delivery Verification (Medium)
Configuration fixed and unit delivery paths tested (2026-06-12 — 15/15 passing). Remaining gaps: (a) no integration test against a real SMTP server or live Slack webhook; (b) `nodemailer` only in `backend/package.json` — should be moved to root `package.json`; (c) no in-app notification channel (spec FR-008 requires in-app alongside email).

### 2 — Complete FR-009 Filtering (Medium)
Label/risk filter tested (29/29 passing, 2026-06-12). Backend riskLevel filter tested (236/236 passing, 2026-06-12). ~~Frontend not wired to backend parameter~~ — **resolved 2026-06-12** (Healthy filter now calls `GET /api/repos?riskLevel=healthy`; wiring tested 14/14). ~~HTTP layer contract untested~~ — **resolved 2026-06-12** (10 supertest tests; Healthy path elevated to Integrated / Tested). Remaining gaps: (a) At Risk toggle intentionally uses client-side `critical || at-risk` (by design in Option A — acceptable for Phases 1–5); (b) 5 spec dimensions entirely absent: repository name search, project status, assigned manager, activity recency, intern contributor; (c) SQL filter correctness against real PostgreSQL unverified (integration test against live DB not yet written).

### 3 — Implement NFR-007 Data Governance (Medium)
User data deletion, project archival, repository disconnection, and data export are required by the spec. None are found in the repository.

### ~~4 — Add Snapshot Worker Tests~~ ✅ RESOLVED (2026-06-12)
`tests/unit/services/worker/snapshotWorker.test.js` added with 5 routing tests (all passing). Verifies `sendAlert` dispatch, exact snapshot argument, rejection isolation, snapshot failure guard, and repo-history failure isolation. All external dependencies mocked; fake timers used; no real communications sent.

### 5 — Add Playwright / E2E Tests (Medium)
CLAUDE.md specifies browser automation tools (Playwright) for UI validation. At minimum: login → sync → dashboard load → repo selection → remediation tab golden path.

### 6 — Add CI/CD Pipeline (Medium)
No `.github/workflows/` or equivalent exists. Unit tests should run automatically on every push. Integration tests should run on a scheduled basis or on merge to main.

### 7 — Implement GitHub API Rate-Limit Handling (Medium)
NFR-004 requires graceful rate-limit handling. GitHub returns HTTP 429 / 403 with `X-RateLimit-*` headers. Add retry with exponential backoff to the GitHub fetchers.

### 8 — Move `backend/tmp/analyze.js` (Low)
Violates CLAUDE.md layer boundary. Move to `/tmp` or delete if no longer needed.

---

*This file must be updated whenever features are added, tests change, architecture evolves, phases advance, or known risks materially change — per the Mandatory Update Conditions in `CLAUDE.md`.*
