# PROGRESS.md
**RepoPulse Command Center — Repository Development Ledger**

This is the authoritative implementation-state and maturity tracking file for RepoPulse Command Center.  
It is maintained per the contract defined in `CLAUDE.md`.  
Last updated: **2026-06-30** (API Linkage Improvement — Wave 1: connect per-repo operational endpoints to Overview tab: `frontend/dashboard.html` — 4 pure build functions (`buildRepoMetricsHtml`, `buildRepoRiskHtml`, `buildRepoPrHealthHtml`, `buildRepoEventsHtml`) added before `loadRepoArchitecture`; 4 load functions (`loadRepoMetrics`, `loadRepoRisk`, `loadRepoPrHealth`, `loadRepoEvents`) added after `loadRepoRemediation`; 4 DOM section containers (`#repo-ops-metrics-content`, `#repo-ops-risk-content`, `#repo-ops-pr-health-content`, `#repo-ops-events-content`) injected into the Overview tab panel in `selectRepo`, positioned after `overviewCards` and before `buildAttentionDriversHtml`; 4 loader calls wired into `selectRepo` alongside existing loaders; endpoints wired: `GET /api/repos/:id/metrics` (commits7d, openPrs, stalePrs, openIssues — 404 → null → empty state), `GET /api/repos/:id/risk` (current score/label/delta vs prior — 404 → null → empty state), `GET /api/repos/:id/pr-health` (label + reasons, up to 2 reasons; none/unknown → dedicated messages), `GET /api/repos/:id/events` (up to 3 events, type → human label, severity → aq-badge class); all load functions use identical fetch guard pattern (401/403/404 → null, !r.ok → null, parse error → null, network error → null) for graceful empty states; all build functions are pure (no DOM/I/O) — testable in Jest node env without browser; badge classes use `aq-badge severity-*` consistent with existing dashboard patterns; **new test file `tests/unit/frontend/dashboardOperationalStatus.test.js`**: 59 tests across 12 describe blocks covering `buildRepoMetricsHtml` (null empty state, all 4 values, null fields → em dash, zero values vs em dash, grid layout), `buildRepoRiskHtml` (null/no-current empty states, score render, 5 label → class mappings, null score → em dash, positive/negative/zero delta, no-previous → no delta, previous-without-score → no delta), `buildRepoPrHealthHtml` (null/none/unknown/missing-label empty states, 4 label → class mappings, no-reasons → no-issues text, 1/2 reasons, >2 reasons → only 2 shown, null reasons), `buildRepoEventsHtml` (null/empty-array/missing-events/null-events empty states, 9 known event type → label mappings, unknown type → underscore-replaced fallback, 5 severity → class mappings, description render, empty-description → no span, >3 events → only 3 shown, exactly-3, single event); 59/59 passing; no regressions in remaining 7,086 tests; total 7,145 / 7,215 passing (70 skipped); net test delta: +59; prior: Architecture Risk Reduction Step #12 — Fix final false-positive placeholder/stub hint caused by `frontend/dashboard.html`: **root cause**: after Step #9 suppressed all 16 pure-function JS execution modules and excluded `.md` files from Heuristic C scanning, one file remained flagged — `frontend/dashboard.html`; the HTML file matched `/\bplaceholder\b/i` via standard HTML `placeholder="..."` input attributes (lines 2073, 6320, 6325, 6329, 6344) and a UI label string `'placeholder hint'` (line 4933), and matched `/\breturn\s+null\b/` via ~20 legitimate HTTP guard clauses in frontend fetch wrappers (e.g. `if (!r.ok) return null;`, `if (r.status === 401) return null;`); none of these are code stubs — `placeholder` is an HTML UI attribute for input hint text, and the `return null` patterns are standard defensive coding in `.then()` callbacks; `frontend/dashboard.html` has zero `async`/`await`, zero `require(`, zero `import`, and no `module.exports`, so `_isRichCode()` returned `false` and `_hasPlaceholderHint()` returned `true`; **fix — extend Heuristic C to exclude `.html` files**: added `if (/\.html$/i.test(f.path)) return;` immediately after the existing `.md` exclusion (`if (/\.md$/i.test(f.path)) return;`) in the Heuristic C `files.forEach` loop of `execution/architecture/assessImplementationCompleteness.js`; rationale: HTML files are UI/template assets — the word `placeholder` is a standard HTML attribute semantically unrelated to stub code, and the analyzer is designed to detect scaffold/placeholder signals in execution-layer JS modules, not frontend markup; consistent with the `.md` exclusion rationale (non-JS assets where placeholder vocabulary has non-stub semantic meaning); **no other changes**: `frontend/dashboard.html` untouched; production execution modules untouched; PLACEHOLDER_PATTERNS unchanged; `_isRichCode()` unchanged; route files, scoring thresholds, backend APIs, database schema all untouched; **test delta: +4** in new `describe('assessImplementationCompleteness — false-positive suppression (Step #12)')` block in `tests/unit/execution/architecture/assessImplementationCompleteness.test.js`: (1) HTML file with placeholder= attributes and return null guards is not flagged — simulates `frontend/dashboard.html` pattern; (2) manage-repos.html with placeholder= attribute is not flagged — covers `.html` exclusion at a different path; (3) markdown exclusion still works after adding html exclusion — regression guard for Step #9 Fix B; (4) real JavaScript stub is still flagged after adding html exclusion — regression guard confirming real stubs in `.js` files still fire; **snapshot note**: the `placeholder_code_hint` count in `implementationCompleteness.placeholderAssessment` will only drop to 0 in the live UI after a new `repo_architecture_snapshot` is generated for each affected repo; the officially supported path is `GET /api/repos/:id/architecture` (the route serves a fresh snapshot when the cached snapshot is stale or absent — 6-hour TTL `ARCH_CACHE_TTL_MS`); to force immediate regeneration for repoId=80, delete the existing row from `repo_architecture_snapshots` or wait for TTL expiry, then call the route; **prior step**: Architecture Risk Reduction Step #9 — Fix placeholder/scaffold false positives in implementation completeness analyzer: **root cause**: `assessImplementationCompleteness.js` `_hasPlaceholderHint` was firing on 19 files in repo #80 that had zero real stub implementations; three false-positive sources were identified in Step #8: (1) pure computation modules with valid `return null`/`return []` guard clauses — these are legitimate defensive patterns, but `_isRichCode()` only suppressed signals when files contained `require()`, `import`, `async/await`, `Service.method()`, or `db.` — pure synchronous functions with no I/O dependencies had no suppression path; (2) architecture domain-vocabulary strings — modules like `analyzeArchitectureDrift.js` emit recommendation strings such as `'resolve placeholder or scaffold patterns.'` — the word "placeholder" fires `/\bplaceholder\b/i` but the string is documenting the anti-pattern, not being one; (3) markdown documentation files — `PROGRESS.md`, `CLAUDE.md`, `frontend/27_dashboard_wireframe_spec.md` are included in the file snapshot and scanned identically to JS source code; the word "placeholder" in prose, wireframe tables, and progress entries triggered signals with no suppression; **fix 1 — `_isRichCode()` extended with named-function + module.exports check**: added final condition `if (/\bfunction\s+[A-Za-z_$]\w*\s*\(/.test(nonCommentCode) && /\bmodule\.exports\b/.test(nonCommentCode)) return true;` — a file that defines at least one named function AND exports it via CommonJS is treated as a rich implemented module and suppresses all placeholder signals; the condition requires BOTH predicates to prevent over-suppression: (a) empty stubs (`module.exports = {}` with FIXME comment) fail the named-function predicate; (b) arrow-function stubs (`module.exports = { fn: () => { throw new Error('Not implemented') } }`) also fail because arrow functions have no `function name(` declaration; (c) named functions without exports (standalone throw stubs) fail the module.exports predicate; only fully implemented, named, exported pure modules are suppressed — all 16 false-positive JS files had named function definitions + module.exports; all 2 previously failing stub tests continue to flag correctly; **fix 2 — `.md` file exclusion from Heuristic C**: added `if (/\.md$/i.test(f.path)) return;` guard in the Heuristic C `files.forEach` loop (before calling `_hasPlaceholderHint`) — markdown files are documentation, not executable code, and can never be stub implementations regardless of their text content; excludes `PROGRESS.md`, `CLAUDE.md`, all wireframe and spec markdown files from placeholder scanning; **no other changes**: PLACEHOLDER_PATTERNS unchanged; `return null`/`return []` patterns remain in the list (they correctly fire for genuine stubs without named exports); scoring thresholds, penalty caps, signal text, route files, execution modules, API contracts, database schema all untouched; **test delta: +8** in new `describe('assessImplementationCompleteness — false-positive suppression (Step #9)')` block in `tests/unit/execution/architecture/assessImplementationCompleteness.test.js`: (1) exported pure function with `return []` is not flagged; (2) exported pure function with `return null` is not flagged; (3) module containing "placeholder" in a recommendation string is not flagged when exported; (4) markdown file containing "Placeholder charts" is not flagged; (5) PROGRESS.md mentioning placeholder in prose is not flagged; (6) real stub — throw Not implemented without module.exports — is still flagged; (7) real stub — TODO in a file without exports — is still flagged; (8) named exported function with return null guard is not flagged (combined suppression test); **snapshot note**: the placeholder/scaffold signal count will only drop in the live UI after a new `repo_architecture_snapshot` is generated for each affected repo; no snapshot regeneration was triggered in this step (out of scope); **prior step**: Architecture Risk Reduction Step #7 — Fix route-to-service coverage detection to recognize `execution/*` imports as valid service-layer imports: **root cause**: `assessImplementationCompleteness.js` used `/services?\//i` in three places to detect whether a route file delegates to a service/orchestration layer — this regex matched only `service/` or `services/` path segments and was incompatible with this repo's documented `execution/` convention; all four route files in `backend/routes/` import exclusively from `execution/*`, so all four were permanently counted as lacking service-layer imports regardless of snapshot freshness; **fix — three regex changes in `execution/architecture/assessImplementationCompleteness.js`**: (1) `_isScaffoldLike` service-edge short-circuit (line 105): `/services?\//i` → `/(services?|execution)\//i` — a route file with an `execution/` import edge now correctly escapes scaffold detection; (2) Heuristic A Mode 1 inner edge check (line 261, fires when `hints.hasServiceLayer` is true): same regex update — routes with `execution/` edges are now counted as having a service-layer import and are excluded from `routesWithoutServiceList`; (3) Heuristic A Mode 2 fallback edge check (line 273, fires when `hints.hasServiceLayer` is false): same regex update — `execution/` edges now increment `routeFilesWithServiceImportCount` for coverage reporting even in the no-service-layer-detected path; **no other changes**: scoring thresholds, penalty caps, signal text, route files, execution modules, API contracts, database schema all untouched; the alternation `(services?|execution)` is purely additive — existing `services/`-based repos are unaffected; **test delta: +6** in new `describe('assessImplementationCompleteness — execution/* service-layer detection')` block in `tests/unit/execution/architecture/assessImplementationCompleteness.test.js`: (1) route importing `execution/*` does NOT emit `route_without_service_path` (Mode 1 positive case); (2) route importing `execution/*` is counted as having a service import (`routeFilesWithServiceImport = 1`); (3) all routes using `execution/*` produce 100% `routeServiceCoverage` (coveragePercent = 100, no signal); (4) `execution/*` edge prevents scaffold-like classification (`_isScaffoldLike` returns false); (5) `services/*` paths still recognized after regex update (regression guard — existing behavior preserved); (6) mixed routes using both `execution/*` and `services/*` both count toward coverage (routeFilesWithServiceImport = 2, coveragePercent = 100); **snapshot note**: the architecture analyzer now correctly recognizes `execution/` imports — however, the `routeServiceCoverage` metric and `route_without_service_path` signal in the live UI will only reflect the corrected detection after a new `repo_architecture_snapshot` is generated for each affected repo; no snapshot regeneration was triggered in this step (out of scope); **prior step**: Architecture Risk Reduction Step #5 — Extract notification route SQL into execution modules: `backend/routes/notificationRoutes.js` had zero imports from `execution/` or `services/` — all SQL lived directly in route handlers; **created `execution/notifications/getNotifications.js`**: wraps the `Promise.all([listQuery, countQuery])` block from `GET /api/notifications`; list query (SELECT 20 rows ORDER BY created_at DESC) and count query (SELECT COUNT(*) WHERE status NOT IN ('READ','EXPIRED')) run concurrently; `parseInt` of the count string applied before return; function signature `getNotifications({ db, userId })` → `{ notifications, unreadCount }`; follows existing pattern of `execution/notifications/writeNotification.js` (db injected as param); **created `execution/notifications/markNotificationRead.js`**: wraps the UPDATE query from `PATCH /api/notifications/:id/read`; SQL `WHERE id = $1 AND user_id = $2` preserved verbatim; returns `result.rowCount` so the route can distinguish found (1) from not-found/wrong-user (0); function signature `markNotificationRead({ db, userId, notifId })` → `number`; **updated `backend/routes/notificationRoutes.js`**: adds `require` for both new modules; `GET /` handler reduced to `res.json(await getNotifications({ db: req.app.locals.db, userId: req.user.userId }))`; `PATCH /:id/read` handler retains integer validation (`parseInt` + `!Number.isInteger` + `<= 0` → 400) and 404 check (`rowCount === 0`), then delegates to `markNotificationRead`; all HTTP concerns (auth middleware, req/res, id parsing, 400/404/500) remain in the route file; no API contract change (route paths, response shapes, SQL semantics, auth behavior all preserved); **all 17 existing `notificationRoutes.test.js` tests pass unmodified** — supertest drives real HTTP through Express + the same `app.locals.db` mock; `db.query` is still what gets called (now via the execution modules), so call-order assertions and SQL-string assertions all continue to hold; `execution/notifications` coverage now 100% across all three modules (`getNotifications.js`, `markNotificationRead.js`, `writeNotification.js`); **new `tests/unit/execution/notifications/getNotifications.test.js`** (11 tests: return shape has notifications array + number unreadCount; empty DB → [], 0; rows returned from list query; unreadCount is integer not string; unreadCount 0 is integer; both queries scoped to userId; ORDER BY created_at DESC; LIMIT 20; NOT IN READ/EXPIRED; exactly 2 db.query calls; DB error propagates); **new `tests/unit/execution/notifications/markNotificationRead.test.js`** (8 tests: returns 1 when found+owned; returns 0 for wrong user; returns 0 for non-existent id; WHERE clause scoped to notifId=$1 and userId=$2; SQL sets status='READ'; SQL sets read_at=NOW(); exactly 1 db.query call; DB error propagates); net test delta: +19; 7,068/7,138 passing (70 skipped, 0 failing); prior: Architecture Risk Reduction Step #3 — Improve architecture snapshot completeness by preventing GitHub content-fetch attrition: root cause identified in Step #2 was `execution/github/fetchRepositoryFiles.js` firing unbounded parallel `Promise.allSettled` blob-content requests, triggering GitHub secondary rate limiting and silently dropping a large fraction of eligible files (measured 150 eligible vs. 51 fetched, 66% loss, on the dogfooded RepoPluse_Command_Center repo) with no aggregated visibility for the caller; **fix 1 — throttled concurrency**: new `_runWithConcurrency(items, limit, worker)` helper added — a small worker-pool runner (index cursor + `Promise.all` over `Math.min(CONCURRENCY_LIMIT, items.length)` concurrent runners) that returns `Promise.allSettled`-shaped results aligned by index, so Stage 4 collection logic stays structurally similar; Stage 3 blob-content fetch now calls `_runWithConcurrency(eligible, CONCURRENCY_LIMIT, ...)` instead of `Promise.allSettled(eligible.map(...))`; `CONCURRENCY_LIMIT = 8`; filter order/logic (Stage 2), `MAX_FILES` (300), `MAX_FILE_SIZE_BYTES` (400 KB), and the returned file shape (`{path, content, sizeBytes, language, lastModified}`) all unchanged; **fix 2 — visibility counters**: per-item worker now returns a tagged outcome (`{outcome:'ok', file}` / `{outcome:'failed', path, status}` / `{outcome:'large', path}`) instead of `null`; Stage 4 splits outcomes into `failedFetchCount` (HTTP/non-OK responses, non-base64/malformed content, and rejected promises) and `skippedLargeFileCount` (`sizeBytes > MAX_FILE_SIZE_BYTES`); `debug.skippedFileCount` preserved as `failedFetchCount + skippedLargeFileCount` for backward compatibility with existing tests/callers; `debug` now also exposes `eligibleFileCount`/`fetchedFileCount` (already existed) plus the two new counters; **fix 3 — reasonable logging**: per-file `console.warn('[architecture] github blob fetch failed', ...)` capped to the first `MAX_BLOB_WARNINGS = 10` failures (was: one warn per failed file unconditionally, which could flood logs at scale during a rate-limit event); when failures exceed the cap, one additional summary warning `'[architecture] github blob fetch failures summary'` is emitted with `{repo, branch, failedFetchCount, additionalFailuresNotLogged}`; **fix 4 — low-coverage warning in the caller**: `execution/architecture/syncRepositoryArchitectureSnapshots.js` now reads `fetchResult.debug.eligibleFileCount`/`fetchedFileCount` immediately after a successful fetch and calls `logger.warn('[syncArchSnapshots] low file fetch coverage for repo', repoId, fullName, {eligibleFileCount, fetchedFileCount, failedFetchCount, skippedLargeFileCount})` when `eligibleFileCount > 0 && fetchedFileCount/eligibleFileCount < MIN_FETCH_COVERAGE_RATIO (0.8)`; this is a warning only — execution falls through to snapshot build and persistence unchanged; no repo is marked `failed`/`no_files`/skipped due to low coverage; **explicitly not touched in this step** (per requirements): `_confidenceLevel()` in `buildRepositoryArchitectureSnapshot.js`, `assessImplementationCompleteness.js` heuristics, API linkage scoring, `_isTestFile` exclusion logic (the filter itself is untouched — only the fetch mechanism around it changed); **tests added**: `tests/unit/execution/github/fetchRepositoryFiles.test.js` new `'fetchRepositoryFiles — throttled concurrency'` describe block (5 tests: returns all successful files when eligible count exceeds the concurrency limit; never has more than CONCURRENCY_LIMIT content requests in flight at once — verified via an in-flight counter on a custom `fetchFn`; failed fetches increment `debug.failedFetchCount`; large files increment `debug.skippedLargeFileCount` not `failedFetchCount`; caps individual blob-failure warnings at 10 and emits one summary warning beyond the cap); `tests/unit/execution/architecture/syncRepositoryArchitectureSnapshots.test.js` new 4 tests (logs low-coverage warning when ratio <80% but still refreshes/inserts; does not log when ratio ≥80%; does not log when `eligibleFileCount` is 0; does not fail or skip the snapshot when coverage is low — insert still occurs); all existing `fetchRepositoryFiles` tests (debug.skippedFileCount-based assertions, diagnostic-logging blob-failure warning assertion, blob fetch resilience block) pass unmodified against the new implementation — confirms the restructuring preserved observable behavior for previously-tested cases; net test delta: +9; 7,049/7,119 passing (70 skipped, 0 failing); prior: Repository Status Refinement #9: `frontend/dashboard.html` + `tests/unit/frontend/dashboardRepoPriority.test.js` — **Replace Architecture Drivers em dash with one weak architectural signal when no stronger drivers exist**: `buildArchDriversHtml` updated — new fallback block added as final step before the em dash return (fires only when `items.length === 0` after all strong signals and Coverage Gap checks); fallback priority order (only one chip rendered): (1) Weak Coupling: `archCache.couplingRisk === 'watch'` → "Weak Coupling" severity-watch chip (repos with acceptable but non-optimal coupling now get a signal instead of em dash); (2) Forecast Watch: `fcData.forecastLevel === 'medium' || 'watch'` → "Forecast Watch" severity-watch chip (moved from strong slot — was `items.length < 2` — to fallback-only `items.length === 0`; this corrects the prior behavior where "Forecast Watch" could coexist with a strong signal and consume a slot); (3) Low Confidence: `archCache.confidenceLevel === 'low'` → "Low Confidence" severity-watch chip (moved from strong signal block to lowest-priority fallback; repos with a known architecture level but low analysis confidence now only show Low Confidence when absolutely no other signal exists); **coverage gap interaction**: Coverage Gap fires before the fallback block — when archData is null/missing/unknown-level (no architecture snapshot), Coverage Gap chip is added (items.length=1) and the fallback block is skipped entirely; this means Low Confidence fallback is only reachable when archData has a known valid level (risky/weak/watch/healthy) but confidence is still low — a more accurate and less alarming signal; **strong signal precedence preserved**: API Gaps, Implementation Gaps, Boundary Violations, High Coupling, Forecast Critical, Forecast Degrading all remain in the `items.length < 2` strong slot and suppress the fallback entirely when any fires; **one-only constraint**: fallback block exits after the first matching condition via `else if` chain — only one fallback chip can ever render; **before/after examples**: score=66 couplingRisk=watch → was `—` now shows "Weak Coupling"; score=80 forecastLevel=watch healthy arch → was `—` now shows "Forecast Watch"; score=80 confidenceLevel=low healthy arch → was `—` now shows "Low Confidence"; repo with unresolvedApiCalls=5 + couplingRisk=watch → shows "API Gaps" only (strong signal suppresses fallback); **verbatim copy in test file updated identically**; test updates: 4 existing tests updated — `confidenceLevel='low' → Low Confidence fallback chip` (description updated to clarify fallback; archData changed from `null` to `{ architectureHealthLevel: 'risky' }` to prevent Coverage Gap preemption); Bug Fix #2 test updated (same archData fix); Bug Fix #4 "Bug A fires" test updated (archData changed to `{ architectureHealthLevel: 'watch' }`); Bug Fix #4 combined test rewritten (`archData.architectureHealthLevel='unknown'` → Coverage Gap preempts fallback → expect Coverage Gap not Low Confidence); **10 new tests** in new `describe('buildArchDriversHtml — fallback signals (Refinement #9)')` block: (1) couplingRisk=watch + no strong signals → Weak Coupling chip; (2) fcData.forecastLevel=watch + no strong signals → Forecast Watch chip; (3) fcData.forecastLevel=medium + no strong signals → Forecast Watch chip; (4) confidenceLevel=low + no strong signals → Low Confidence chip; (5) strong signal present + fallback condition → only strong signal fires; (6) Weak Coupling priority over Forecast Watch; (7) Forecast Watch priority over Low Confidence; (8) all three fallback conditions → only 1 chip renders (Weak Coupling wins); (9) Coverage Gap takes priority over all fallback signals (archData=null → Coverage Gap preempts fallback block); (10) no fallback condition present → em dash; net test delta: +10 (4 updates, 10 new); 7,040 passing / 7,110 total (70 skipped, 0 failing); prior: Repository Status Bug Fix #4: `frontend/dashboard.html` — two surgical fixes to Architecture Drivers column rendering: **Bug A (case fix)**: `buildArchDriversHtml` checked `archCache.confidenceLevel === 'Low'` (capital L) but backend `_confidenceLevel()` always returns lowercase `'low'`/`'medium'`/`'high'` — Low Confidence chip never fired for any repo; fix: comparison changed to `=== 'low'`; **Bug B (unknown-level fix)**: `loadPortfolioArchitecture()`'s `_mergeIntelByName` call recomputed `architectureHealthLevel` via `_archLevelFromScore(hs)` instead of using the API-provided `r.architectureHealthLevel`; for repos without a snapshot `_unknownArchRepo()` sets `architectureHealthScore: 0` and `architectureHealthLevel: 'unknown'`; `_archLevelFromScore(0)` returns `'risky'` (not `'unknown'`); `'risky'` is in the valid set checked by Coverage Gap (`['risky','weak','watch','healthy']`) so `covGap` stayed `false` and em dash showed instead of Coverage Gap chip; fix: `architectureHealthLevel: r.architectureHealthLevel || _archLevelFromScore(hs)` — prefers the API-provided level (`'unknown'` for no-snapshot repos) over the locally recomputed one; **combined behavior after both fixes**: no-snapshot repos with portfolio-seeded archCache get Low Confidence chip (archCache.confidenceLevel='low' now fires); no-snapshot repos without archCache get Coverage Gap chip (archData.architectureHealthLevel='unknown' triggers covGap=true); repos with genuine risky/weak/watch/healthy architecture and no driver signals correctly show em dash; test changes in `tests/unit/frontend/dashboardRepoPriority.test.js`: verbatim copy updated (line 146: `=== 'Low'` → `=== 'low'`); existing test updated (`confidenceLevel='Low' → Low Confidence` renamed and input changed to lowercase `'low'`); Bug Fix #2 test updated (`confidenceLevel: 'Low'` → `'low'`); 1 new regression guard test in per-click archCache describe (`'Low'` capital no longer fires chip); 5 new tests in new `buildArchDriversHtml — Bug Fix #4` describe block (Bug A lowercase fires chip, Bug A capital does not fire chip, Bug B unknown level → Coverage Gap, Bug B pre-fix risky suppression documents baseline, Bug A+B combined no-snapshot scenario → Low Confidence chip); net test delta: +6; 7,030 passing / 7,100 total (70 skipped, 0 failing); prior: Repository Status Bug Fix #3: `frontend/dashboard.html` — removed `if (_repos.length) applyFilter()` (Bug Fix #1 line) from `loadRepoArchitecture()`'s `.then()` callback; that single line caused `applyFilter()` → `renderReposTable()` → `selectRepo(same repo)` → `loadRepoArchitecture()` — an infinite same-repo fetch loop; every iteration orphaned the `#repo-architecture-content` DOM element captured at fetch start (because `selectRepo` rebuilds `detail.innerHTML` synchronously during the loop), so line `container.innerHTML = architectureHtml` always wrote to a detached element — Architecture tab was permanently "Loading…"; detail panel was destroyed and rebuilt every 1–3 s — user interaction lost on every iteration; fix: removing the line breaks the loop, `container` stays attached, `container.innerHTML` correctly renders architecture data, `updateOverviewArchCards()` correctly updates overview cards, clicks are stable; Bug Fix #2 (`loadPortfolioArchitecture` seeding `_archDataByRepoId` + its own `applyFilter()`) remains intact — chips still appear on initial load; per-click richer chip updates now propagate on the next 60-second refresh cycle instead of immediately; 0 net test delta; 7,094 total (7,024 passing, 70 skipped, 0 failing); prior: Repository Status Bug Fix #2: `execution/architecture/buildPortfolioArchitectureIntelligence.js` — `_benchmarkedRepositories()` extended with 5 driver signal fields (`unresolvedApiCalls`, `implementationCompleteness`, `couplingRisk`, `boundaryViolationCount`, `confidenceLevel`); `frontend/dashboard.html` — `loadPortfolioArchitecture()` seeds `_archDataByRepoId[r.repoId]` from portfolio response with guard against overwriting per-click entries + `applyFilter()` for immediate re-render; 18 new backend tests in `buildPortfolioArchitectureIntelligence.test.js`; 11 new frontend tests in `dashboardRepoPriority.test.js`; 7,094 total (7,024 passing, 70 skipped, 0 failing); prior: Repository Status Bug Fix #1: `frontend/dashboard.html` — `loadRepoArchitecture()` success callback: added `if (_repos.length) applyFilter();` immediately after `_archDataByRepoId[repoId] = { ... };` closes; fix ensures the repository table row re-renders with newly available per-click architecture signals (API Gaps, Implementation Gaps, High Coupling, Boundary Violations, Low Confidence) as soon as a user clicks a repo, instead of waiting up to 60 seconds for the next `refresh()` cycle; mirrors identical pattern used by `loadPortfolioArchitecture` and `loadAttentionQueue`; no test file changes required — no existing test covers `loadRepoArchitecture` or table re-render after per-click architecture load; behavioral contract verified by existing `buildArchDriversHtml — per-click architecture signals (archCache)` describe block (9 tests); 7,065/7,065 passing (70 skipped; 0 failing) — no regression; prior: Repository Status Refinement #8: `frontend/dashboard.html` + `tests/unit/frontend/dashboardRepoPriority.test.js` — **(#8) Remove generic health-label fallbacks from Architecture Drivers**: `buildArchDriversHtml` updated — removed "Health level fallback" block (Low Health/Weak Health/Health Watch derived from archData.level or legacy repo.score) and "Healthy fallback" block; replaced both with a single early-return when `items.length === 0`: `'<div class="tbl-reasons"><span style="color:var(--text-muted);">&mdash;</span></div>'`; allowed drivers remain: API Gaps, Implementation Gaps, High Coupling, Boundary Violations, Low Confidence (from archCache), Coverage Gap (from missing intel), Forecast Critical/Forecast Degrading/Forecast Watch (from fcData.forecastLevel); health level (risky/weak/watch/healthy) and legacy score thresholds no longer produce any chip; repos with valid architecture intel and no forecast signal now render `—`; Coverage Gap logic unchanged (still fires for archData=null, unknown/missing level, or undefined with null score); comment block updated to describe new preference order "per-click signals → Coverage Gap → Forecast → — (em dash)"; verbatim copy in test file updated identically; 11 tests updated: 4 in `architecture health level mapping` (risky/weak/watch/healthy → em dash, `not.toContain('reason-tag ')`) + 4 in `legacy path` (score=20/60/75/90 → em dash) + 1 in `forecast slot` (healthy+stable → em dash) + 1 in `max 2 chips` (healthy+no forecast → 0 chips, `&mdash;`) + 1 in `per-click archCache` (archCache=null → em dash); net test delta: 0; 7,065/7,065 passing (70 skipped; 0 failing); 352/352 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinements #5–#7: `frontend/dashboard.html` + `tests/unit/frontend/dashboardRepoPriority.test.js` — **(#5) Architecture Drivers — per-click signals preferred**: `buildArchDriversHtml` rewritten with 4th `archCache` param; per-click signals from `_archDataByRepoId[r.id]` now take priority: `unresolvedApiCalls>0` → "API Gaps" (severity-elevated); `implementationCompleteness<70` → "Implementation Gaps" (severity-watch); `couplingRisk∈[risky,weak,elevated,high]` → "High Coupling" (severity-watch); `boundaryViolationCount>0` → "Boundary Violations" (severity-elevated); `confidenceLevel=Low` → "Low Confidence" (severity-watch); max 2 from archCache signals; Coverage Gap check moved to items.length===0 after archCache block (not after forecast); forecast fills remaining slot; health level ("Low Health"/"Weak Health"/"Health Watch") is now a true last-resort fallback only when items.length===0 after all other checks; "Low Health" no longer appears alongside "Forecast Critical" for risky arch — health level is suppressed when forecast fills the slot; table row call updated to pass `_archDataByRepoId[r.id] || null` as 4th arg; **(#6) Rename "Top Risk Drivers" → "Operational Risk Drivers"**: `buildAttentionDriversHtml` section label updated — `return '<div class="repo-detail-label section-secondary" style="margin-top:18px;">Operational Risk Drivers</div>'`; **(#7) Architecture Assessment evidence-based text**: `buildArchitectureAssessment(opts)` updated — new evidence opts fields: `unresolvedApiCalls`, `boundaryViolationCount`, `implementationCompleteness`, `couplingRisk`; evidence array built: boundary violations (singular/plural), unresolved API linkages (singular/plural), implementation completeness at N%, coupling concentration elevated; for critical/elevated tiers with evidence: "Detected: X, Y, Z." appended instead of generic text; for watch tier with evidence: "Architecture is under observation. Detected: ..." instead of stable-text; no-evidence path preserves exact prior generic text (backwards-compatible); `buildArchitectureAssessmentHtml` wrapper updated: reads `_archDataByRepoId[repo.id] || null` and passes `unresolvedApiCalls`, `boundaryViolationCount`, `implementationCompleteness`, `couplingRisk` to `buildArchitectureAssessment`; test file: verbatim `buildArchDriversHtml` copy replaced with 4-param version; verbatim `buildAttentionDriversHtml` copy updated (Top Risk → Operational Risk Drivers); verbatim `buildArchitectureAssessment` copy updated with evidence fields; 2 existing tests fixed: "risky arch + fcData=critical" → 1 chip only (Forecast Critical; Low Health suppressed); "max 2 chips" scenario changed to `archData=null + fcData=critical` → Coverage Gap + Forecast Critical; 1 existing test fixed: "Top Risk Drivers" → "Operational Risk Drivers"; 1 new describe block: `buildArchDriversHtml — per-click architecture signals (archCache)` (9 tests); 1 new describe block: `buildArchitectureAssessment — evidence-based text` (8 tests); net test delta: +17; 7,065/7,065 passing (70 skipped; 0 failing); 352/352 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinement #4: `frontend/dashboard.html` + `tests/unit/frontend/dashboardRepoPriority.test.js` — **(#4) Architecture Score column**: "Risk Factors" column renamed "Architecture Score"; cell now renders `archData.architectureHealthScore` as a plain number via `<span class="tbl-arch-score">N</span>` or `&mdash;` when null; `rfCount`/`tbl-risk-count` removed; `archScore` variable added; **(#4) Architecture Drivers column**: "Reasons" column renamed "Architecture Drivers"; `buildRepoPriorityReasons` function deleted (was ~107 lines including comment block; used REASON_TAGS/REASON_PRIORITY_MAP/`aq.reasons`/governance/forecast/operational signals); replaced by new `buildArchDriversHtml(repo, archData, fcData)` function (~63 lines): slot 1 — architecture health level (archData.architectureHealthLevel: risky → "Low Health" severity-critical; weak → "Weak Health" severity-elevated; watch → "Health Watch" severity-watch; healthy → no driver; missing/null/unknown → "Coverage Gap" severity-watch); legacy path (archData=undefined) — derives from `repo.score` using `_archLevelFromScore` thresholds (≥85 → no driver, ≥70 → "Health Watch", ≥45 → "Weak Health", else → "Low Health"); slot 2 — architecture forecast (fcData.forecastLevel: critical → "Forecast Critical"; high → "Forecast Degrading"; medium|watch → "Forecast Watch"; else no driver); fallback — "Healthy" when items=0; no operational signals (`aq.reasons`, governance, aq.attentionLevel, repo.label all removed from driver computation); max 2 chips; `aqLevel` variable kept (still used for `HEAT_CLS[aqLevel]` row heat); **(#4) Table header**: `<th>Risk Factors</th><th>Reasons</th>` → `<th>Architecture Score</th><th>Architecture Drivers</th>`; test file: REASON_TAGS/REASON_PRIORITY_MAP/`_reasonPriority` verbatim copies deleted (lines 127–203); `buildRepoPriorityReasons` verbatim copy replaced with `buildArchDriversHtml` (lines 205–297 replaced); all 8 `buildRepoPriorityReasons` describe blocks removed (42 tests: architecture dimension 9, governance dimension 4, forecast dimension 4, priority ordering 3, operational fallback 5, archData parameter 4, fcData parameter 7, severity vocabulary alignment 6); 5 new `buildArchDriversHtml` describe blocks added (28 tests: architecture health level mapping 7, legacy path 6, forecast slot 7, no operational signals 5, max 2 chips and structure 3); net test delta: −14; 6,978/7,048 passing (70 skipped; 0 failing); 335/335 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinements #1–#3: `frontend/dashboard.html` + `tests/unit/frontend/dashboardRepoPriority.test.js` — **(#1) ATTENTION column → Risk Factors**: cell now renders plain numeric count (`aq.reasons.length`) via `<span class="tbl-risk-count">N</span>`; column header renamed "Attention" → "Risk Factors"; `aqLevel`/`aqScore`/`aqTraj`/`marker`/`aqCls`/`aqHtml` vars removed; `rfCount` var added; **(#2) REASONS column — arch-level labels banned**: `buildRepoPriorityReasons` rewritten; "Architecture Risky/Weak/Watch" no longer emitted for any input; new behavior: Coverage Gap (missing/null/unknown arch), then `aq.reasons` via `REASON_TAGS`+`REASON_PRIORITY_MAP` fill up to 2-item cap (was 3), then Governance slot, then Forecast slot, then Operational only when items=0, then "No Significant Issues" fallback; `REASON_TAGS`+`REASON_PRIORITY_MAP`+`_reasonPriority` verbatim copies added to test file; **(#3) Overview "Architectural Priority" card removed**: `ovPriKey`/`ovPriVal`/`ovPriCls` vars and `card('Architectural Priority', ...)` removed from `buildOverviewCardsHtml`; 5 cards remain (Architecture Health, Forecast, Governance, Snapshot Coverage, Architecture Confidence); `computeRepoPriority` and table "Architectural Priority" column header unchanged; test file: 12 test assertions updated + 5 tests rewritten across 6 describe blocks (arch dimension banned-label checks, priority ordering 3→2 cap, operational fallback flip, archData risky/weak → No Significant Issues, fcData risky+critical → Forecast Critical only, severity vocabulary alignment for banned labels); "Architectural Priority badge vocabulary alignment" describe block replaced with "Architectural Priority card removed" (4 tests: not.toContain label, arch health still present, Risky/Healthy level); 1 overview priority test updated (Critical → Risky); net test delta: +3; 6,992/7,062 passing (70 skipped; 0 failing); prior: Dashboard Refinements #9–#12 — five executive UX consistency fixes applied to `buildExecutiveBriefing()` in `frontend/dashboard.html` and `tests/unit/frontend/dashboardExecutiveBriefing.test.js`; **(#9) Section header removed**: HTML `<div class="section-header">` block containing `<span class="section-title">Executive Briefing</span>` and `<span id="exec-summary-conf">` removed; outer `<div class="section">` and `<div id="executive-summary">` retained; HTML comment updated from `<!-- Executive Briefing -->` to `<!-- Portfolio Assessment -->`; no JS changes (the `if (confEl)` null-check in `renderExecutiveBriefing()` already handles absent element safely); **(#10) "Repositories at Risk" label**: `'Requiring Improvement'` → `'Repositories at Risk'` in the metrics array `{ label: ... }` object; **(#11) Architecture Health vocabulary aligned to `_archLevelFromScore` thresholds**: `archMetricVal` computation updated from `(≥80 → 'Healthy' | ≥60 → 'Watch' | else → 'At Risk')` to `(≥85 → 'Healthy' | ≥70 → 'Watch' | ≥45 → 'Weak' | else → 'Risky')` — matching the backend-derived `_archLevelFromScore` function (from `buildRepositoryArchitectureSnapshot.js`) used throughout the rest of the frontend; dot severity color (`scoreSev()`) unchanged; **(#12) Next Action text shortened**: `'Review the Highest-Risk Repositories section in Portfolio Architecture and prioritize remediation.'` → `'Prioritize remediation for the highest-risk repositories.'`; **(#5) Assessment sentences strengthened**: `needs_attention`: construction changed from `'Portfolio requires immediate attention — ' + reasons.join(', ')` to `'Portfolio requires immediate attention due to ' + reasons.join(' and ')` with richer reason phrases (`'critical structural degradation forecast'`, `criticalRepos + ' critical repositor(y/ies) requiring remediation'`, `'architecture score below threshold (N)'`, `'governance score below threshold (N)'`); `watch`: changed from `'Portfolio is stable with signals requiring monitoring — '` to `'Portfolio requires monitoring — '`; `healthy` and `stable` assessment text unchanged; **test sync**: verbatim function copy updated for all 5 JS changes; 6 test updates (Key Metrics label 'Requiring Improvement' → 'Repositories at Risk'; `arch 65 shows Watch` → `arch 65 shows Weak`; `arch 45 shows At Risk` → `arch 45 shows Weak`; two `riskConcentration` test descriptions updated to 'Repositories at Risk'; Next Action assertions updated from `'Highest-Risk Repositories'`/`'Portfolio Architecture'` to `'Prioritize remediation'`/`'highest-risk repositories'`); 1 new test added (`arch 44 shows Risky in Architecture Health metric`); net test delta: +1; 6,750/6,820 passing (70 skipped; 0 failing); prior: Dashboard Refinement #8 — `buildExecutiveBriefing()` in `frontend/dashboard.html` refactored to compact executive assessment card; removed: Key Signals section (5 signal vars + govSignal/archSignal/attnSignal/riskSignal/covSignal build blocks + `signals` array), Primary Risks section (`risks` array + 6 push conditions), Recommended Actions section (`recs` array + 7 push conditions); replaced render with two compact blocks: **Key Metrics** (4 rows: Architecture Health score+level label, Critical Repos count, Requiring Improvement count, Snapshot Coverage pct+ratio — each with colored dot indicator + label + value, same dot-label-value row structure as former Key Signals) and **Next Action** (single fixed static string: "Review the Highest-Risk Repositories section in Portfolio Architecture and prioritize remediation."); `scoreSev()` helper renamed-context comment from `Signal helpers` → `Key Metrics` but function body unchanged; `hasCov`/`covPct`/`covRatio` retained (used by Key Metrics coverage row); `execStatus()`, STATUS_LABELS/SEV, `statusLabel`/`statusSev`, and all four assessment text branches (`needs_attention`/`watch`/`healthy`/`stable`) preserved verbatim; `_execKpi.topRiskRepos` field still exists in state object and is still computed in `loadPortfolioArchitecture()` but no longer rendered; `dataPresent` guard unchanged; Portfolio Architecture tab, Repository Status, scoring logic, backend APIs untouched; **`tests/unit/frontend/dashboardExecutiveBriefing.test.js`**: verbatim function copy synced (Key Signals → Key Metrics; Primary Risks/Recommended Actions removed); HTML structure describe: 2 tests updated (`Key Signals` → `Key Metrics`, `Recommended Actions` → `Next Action`); 4 describe blocks removed: `Key Signals labels` (6 tests), `Key Signals values` (12 tests), `Primary Risks` (9 tests), `Recommended Actions` (11 tests); 2 new describe blocks added: `Key Metrics` (13 tests: section label, 4 metric labels, arch 85/65/45 level labels, criticalRepos=2 count, criticalRepos=0 None, riskConcentration=4 count, riskConcentration=0 None, 7/16 coverage 44%+ratio) and `Next Action` (2 tests: section label, remediation text contains "Highest-Risk Repositories" + "Portfolio Architecture"); net test delta: -23; prior: Dashboard Refinement #7 — Executive Recommended Actions now reference top 3 highest-risk repositories by name in `buildExecutiveBriefing()` in `frontend/dashboard.html`; data source: `benchmarkedRepositories` filtered to `relativePosition === 'lagging' || 'below_average'`, sorted by the same `_archTier` priority order used by `_archNeedsAttentionHtml` (critical score<45 → elevated 45-69 → watch 70-84 → healthy ≥85; lower score first within tier), sliced to top 3, mapped to `repoName`; stored as `_execKpi.topRiskRepos` (array of up to 3 name strings); changes: (1) `_execKpi` init: `topRiskRepos: null` added; (2) `loadPortfolioArchitecture`: lagging filter refactored into `var _lagging` used for both `riskConcentration` count and `topRiskRepos` names; sort uses `_lagging.slice().sort(...)` (non-mutating) then `.slice(0,3).map(repoName).filter(Boolean)`; computed before `renderExecutiveBriefing()` call; (3) `buildExecutiveBriefing` Recommended Actions: new block added at top of `recs` — fires when `kpi.topRiskRepos != null && kpi.topRiskRepos.length > 0`, pushes `'Prioritize remediation for the highest-risk repositories: repo-a, repo-b, repo-c.'`; existing recommendations unchanged and serve as fallback when `topRiskRepos` is null/empty; existing recs cap at 3 unchanged; `tests/unit/frontend/dashboardExecutiveBriefing.test.js`: verbatim copy synced (topRiskRepos block added to Recommended Actions); 4 new tests added: topRiskRepos shows named recommendation, topRiskRepos=[] no recommendation, topRiskRepos=null no recommendation, topRiskRepos appears before other recs; net test delta: +4; 6,772/6,842 passing (70 skipped; 0 failing); prior: Dashboard Refinement #6 — title renamed: "Architecture Intelligence Briefing" → "Portfolio Assessment" in `buildExecutiveBriefing()` render block in `frontend/dashboard.html`; text-only change — no logic, layout, styling, or API changes; `tests/unit/frontend/dashboardExecutiveBriefing.test.js`: verbatim copy render line updated, test description and assertion updated from "Architecture Intelligence Briefing" → "Portfolio Assessment"; net test delta: 0; 6,768/6,838 passing (70 skipped; 0 failing); prior: Dashboard Refinement #5 — Executive Briefing Key Signals split: "Attention Required" replaced with two separate signals "Critical Repos" and "Requiring Improvement" in `buildExecutiveBriefing()` in `frontend/dashboard.html`; data source for "Requiring Improvement": `benchmarkedRepositories.filter(r => r.relativePosition === 'lagging' || r.relativePosition === 'below_average').length` — the same source used by "Architecture risk concentrated in N repositories" text in `_archRiskDriversHtml`; new `_execKpi.riskConcentration` field added to state object; computed and stored in `loadPortfolioArchitecture()` before `renderExecutiveBriefing()` call, using `benched` variable now declared before render calls (moved up from below); changes: (1) `_execKpi` init: `riskConcentration: null` added; (2) `loadPortfolioArchitecture`: `var benched = ...` moved above `renderExecutiveKpis()/renderExecutiveBriefing()`, `riskConcentration` computed from `benched.filter(lagging || below_average).length` before renders; (3) `buildExecutiveBriefing`: `riskSignal` added to var declarations; old `attnSignal` block (attnParts/attnHasData/attnText/attnSev/"Attention Required") replaced with two blocks — `attnSignal = { label: 'Critical Repos', text: critText, sev: critSev }` (criticalRepos count: "N" or "None" or "—", sev: critical/healthy/unknown) and `riskSignal = { label: 'Requiring Improvement', text: riskText, sev: riskSev }` (riskConcentration count: "N" or "None" or "—", sev: high/healthy/unknown); signals array: `[govSignal, archSignal, attnSignal, riskSignal, covSignal]` (5 signals, up from 4); execStatus/dataPresent/Primary Risks/Recommended Actions/summary cards/backend APIs unchanged; `tests/unit/frontend/dashboardExecutiveBriefing.test.js`: verbatim copy synced (riskSignal var added, attnSignal/riskSignal blocks updated, signals array updated); Key Signals labels describe: const updated with `riskConcentration: 2`, "Attention Required" test removed, "Critical Repos" test added, "Requiring Improvement" test added, "does not render Attention Required label" inverse test added; Key Signals values describe: `criticalRepos=2 → shows "2 critical repos" in Attention Required` updated to `criticalRepos=2 → shows count in Critical Repos signal` (assertion changed from `toContain('2 critical')` to `toContain('Critical Repos')`); `criticalRepos=0 → shows None` description updated; 5 new tests added (riskConcentration=4 shows ">4<", riskConcentration=0 shows None, riskConcentration null shows Requiring Improvement label, Critical Repos label absent after Attention Required removed, inverse label check); net test delta: +5; 6,768/6,838 passing (70 skipped; 0 failing); prior: Dashboard Refinement #4 — Forecast key signal row removed from `buildExecutiveBriefing()` in `frontend/dashboard.html`; changes: (1) `dataPresent` guard: `|| kpi.forecastLevel != null` removed — briefing now requires architectureScore, governanceScore, or criticalRepos to render; (2) `forecastSev()` helper function removed (7 lines) — was only used to compute `fcSignal.sev`; (3) `var govSignal, archSignal, fcSignal, attnSignal, covSignal` → `var govSignal, archSignal, attnSignal, covSignal` (fcSignal declaration removed); (4) `fcLabels`/`fcText`/`fcSignal` assignment block removed (3 lines); (5) signals array: `[govSignal, archSignal, fcSignal, attnSignal, covSignal]` → `[govSignal, archSignal, attnSignal, covSignal]`; (6) healthy assessment text updated: "Governance, forecast, and coverage are within acceptable thresholds." → "Governance and coverage are within acceptable thresholds."; unchanged: `execStatus()` function (still uses forecastLevel for needs_attention/watch/allLoaded), Portfolio Assessment naReasons/wReasons referencing forecastLevel, Primary Risks forecast entries, Recommended Actions forecast entries, all backend APIs; `tests/unit/frontend/dashboardExecutiveBriefing.test.js`: verbatim function copy synced (all 6 changes mirrored); 3 test assertions updated to add second field making dataPresent=true when forecastLevel was the sole trigger: `{ forecastLevel: 'critical' }` → `{ forecastLevel: 'critical', architectureScore: 85 }` (4 tests), `{ forecastLevel: 'degrading' }` → `{ forecastLevel: 'degrading', architectureScore: 85 }` (3 tests), `{ forecastLevel: 'watch' }` → `{ forecastLevel: 'watch', architectureScore: 85 }` (2 tests), `{ snapshotCount: 7, repoCount: 9, forecastLevel: 'stable' }` → `criticalRepos: 0` added (2 tests), `{ snapshotCount: 7, repoCount: 16, forecastLevel: 'stable' }` → `criticalRepos: 0` added (1 test); 3 tests deleted: `renders Forecast signal`, `forecast stable → Stable in signal`, `forecast degrading → Degrading in signal`; net test delta: -3; 6,763/6,833 passing (70 skipped; 0 failing); prior: Dashboard Alignment #6 — `loadPortfolioWatchlists()` deleted from `frontend/dashboard.html`; all frontend watchlist dependencies removed; `GET /api/portfolio/watchlists` backend API untouched; changes: (1) `_resolveOverviewArchData()`: removed `var wle`/`var wlr` declarations and `watchlistEscalationLevel`/`watchlistReasons` fields from return object — these fields were passed through but never consumed by any rendering function; (2) stale weight comment updated: `Watchlist 5%, Op Risk 5%` → `Op Risk 5%`; (3) `loadPortfolioWatchlists()` function (26 lines, `GET /api/portfolio/watchlists` fetch + `mergeRepoIntelligence` calls for `watchlistEscalationLevel`/`watchlistPriorityScore`/`watchlistReasons`) deleted entirely; (4) `loadPortfolioWatchlists()` call removed from `refresh()`; `buildActiveArchitectureRisks` analysis: function never used watchlist fields — risk items are derived from `unresolvedApiCalls`, `implementationCompleteness`, `couplingRisk`, `forecastLevel`, `hasArchitectureSnapshot`, `architectureConfidence` only; frontend now has zero watchlist dependencies; `tests/unit/frontend/dashboardRepoPriority.test.js`: verbatim copy of `_resolveOverviewArchData` updated (wle/wlr/watchlistEscalationLevel/watchlistReasons removed); `'intel without arch data but exists'` test: setup changed from `watchlistEscalationLevel: 'critical'` to `hasArchitectureSnapshot: false`, stale watchlistEscalationLevel assertion removed; `'watchlistEscalationLevel from intel propagated'` test deleted; net test delta: -1; 6,766/6,836 passing (70 skipped; 0 failing); watchlist-only intel tests in `buildOverviewCardsHtml — Architecture Health card precedence` (lines 1726-1741) still pass unmodified — they simulate non-arch intel via `watchlistEscalationLevel` in test setup only (`mergeRepoIntelligence` accepts any field) and the behavior under test (Coverage Gap vs Architecture Loading) remains correct; prior: Dashboard Alignment #5 — Watchlist dimension (5% weight) removed from `computeRepoPriority()` in `frontend/dashboard.html`; new weighted sum: Architecture 50% + Governance 20% + Forecast 20% + Op Risk 5% = 95% max; score thresholds (critical ≥ 0.50, elevated ≥ 0.25, watch ≥ 0.10) unchanged and still reachable; `wlSev` block removed from `computeRepoPriority`; `wlSev` variable, watchlist archData read, and weighted-sum line updated; Watchlist badge block removed from `buildRepoPriorityReasons`; `watchlistEscalationLevel` removed from both `archDataForPri` construction sites (detail panel + recommendations panel); table row `archData` construction: watchlist `else if` branch removed — now only sets `architectureHealthLevel`/`architectureHealthScore` from intel when present, else `archData = null`; `loadPortfolioWatchlists()` status: NOT removable — still feeds per-repo `watchlistEscalationLevel`/`watchlistPriorityScore`/`watchlistReasons` used by `buildActiveArchitectureRisks` badge in repo detail card; `tests/unit/frontend/dashboardRepoPriority.test.js`: verbatim `computeRepoPriority` copy updated (wlSev block removed, weighted sum updated); verbatim `buildRepoPriorityReasons` copy updated (watchlist block removed); 3 stale expected-value tests updated (arch elevated+aq=high: critical→elevated; label=at-risk+aq=critical: elevated→watch; governance critical alone: elevated→watch); describe block renamed 50/20/20/5/5→50/20/20/5; 12 watchlist-specific tests deleted (`computeRepoPriority — watchlist escalation via archData` describe block: 5 tests; `buildRepoPriorityReasons — watchlist escalation` describe block: 6 tests; `severity vocabulary alignment › urgent and elevated watchlist...`: 1 test); net test delta: -12; 6,767/6,837 passing (70 skipped; 0 failing); Repository Status ordering now depends solely on Portfolio Architecture health level + governance attention queue + forecast level + operational risk label; prior: Dashboard Alignment #4 — `_execKpi.criticalRepos` source migrated from `loadPortfolioWatchlists()` to `loadPortfolioArchitecture()`; new source: `d.distribution.risky` from `GET /api/portfolio/architecture` response — `distribution.risky` is the count of repos with `architectureHealthLevel === 'risky'` computed by `buildPortfolioArchitectureIntelligence.js`:`_distribution()`; `loadPortfolioArchitecture()` now sets `_execKpi.criticalRepos = _dist.risky` immediately after `architectureScore`/`snapshotCount`/`repoCount`, triggering `renderExecutiveKpis()` + `renderExecutiveBriefing()` on the same callback that already exists; `loadPortfolioWatchlists()` changes: `var wlEsc = d.escalationSummary || {};` removed, `if (wlEsc.critical != null) _execKpi.criticalRepos = wlEsc.critical;` removed, `renderExecutiveKpis()` removed, `renderExecutiveBriefing()` removed — function now only populates per-repo watchlist intel (watchlistEscalationLevel, watchlistPriorityScore, watchlistReasons) and calls `applyFilter()`; `loadPortfolioWatchlists()` NOT removable — per-repo `watchlistEscalationLevel` still feeds `computeRepoPriority` Watchlist dimension (5% weight), required by Repository Status ordering; `buildExecutiveBriefing` Primary Risks text updated: `' flagged as critical in the architecture watchlist.'` → `' at critical architecture risk level.'`; `tests/unit/frontend/dashboardExecutiveBriefing.test.js`: verbatim copy updated (Primary Risks text), 2 test assertions updated (`'1 repository flagged as critical'` → `'1 repository at critical architecture risk level'`; `'2 repositories flagged'` → `'2 repositories at critical architecture risk level'`); net test delta: 0; 6,779/6,849 passing (70 skipped; 0 failing); prior: Dashboard Alignment #3 — Architecture Watchlists tab UI removed from `frontend/dashboard.html`; tab button `data-ptab="watchlists"` removed from `id="portfolio-tab-bar"`; `<div class="repo-tab-panel" data-ppanel="watchlists">` and `id="portfolio-watchlists-panel"` inner div removed; entire `buildPortfolioWatchlistsHtml(data)` function (~200 lines) removed including `// ── Architecture Watchlists` comment header; `loadPortfolioWatchlists()` rewritten — all DOM/panel rendering removed, fetch + `_execKpi.criticalRepos` write + `renderExecutiveKpis()` + `renderExecutiveBriefing()` + per-repo intel merge + `applyFilter()` all retained (function now operates as a silent data loader with no UI side-effects); `GET /api/portfolio/watchlists` API untouched; `_execKpi.criticalRepos` logic untouched; no backend/API changes; `tests/unit/frontend/dashboardPortfolioTabs.test.js` updated: tab/panel count assertions 3→2; label test: `'>Architecture Watchlists<'` moved to `not.toContain`; `role="tab"` count 3→2; absence test renamed to "removed tabs and panels are absent (Forecast and Watchlists)" with 4 watchlists assertions added (`data-ptab="watchlists"`, `data-ppanel="watchlists"`, `id="portfolio-watchlists-panel"`, `>Architecture Watchlists<`); inner-container IDs test simplified to 2-panel check; `buildMockDom()` reduced from 3-element to 2-element structure (btnWl/panWl removed; `bar._children = [btnArch, btnGov]`; `section._children = [panArch, panGov]`; return object: `btn: { architecture, governance }`, `pan: { architecture, governance }`); switcher tests: all `watchlists` references removed; `'switching to watchlists activates only watchlists button'` test deleted; `'exactly one panel is active'` and `'switching back to architecture'` tests updated to use `governance` instead of `watchlists`; net test delta: -1; 6,779/6,849 passing (70 skipped; 0 failing); prior: Dashboard Alignment #2 — `watchlistCount` removed from `buildExecutiveBriefing` logic in `frontend/dashboard.html`; changes: (1) `dataPresent` guard no longer includes `|| kpi.watchlistCount != null`; (2) `execStatus()` `isWatch` condition no longer includes `watchlistCount > 0`; (3) `attnParts` no longer pushes "N watchlisted", `attnHasData` simplified to `criticalRepos != null`, `attnSev` fallback to watchlistCount removed; (4) `wReasons` no longer pushes "N repo(s) on watchlist"; (5) Primary Risks: "N repositories are on the architecture watchlist and require attention." block removed (was watchlistCount >= 5 threshold); (6) Recommended Actions: "Triage architecture watchlist..." line removed (was watchlistCount >= 5 threshold); (7) `watchlistCount` field removed from `_execKpi` state object; (8) `_execKpi.watchlistCount = wlMeta.watchlistedRepoCount` write removed from `loadPortfolioWatchlists()`; `criticalRepos` intact; `loadPortfolioWatchlists()` intact (still populates `_execKpi.criticalRepos` and per-repo intel); Architecture Watchlists tab intact; no backend/API changes; `tests/unit/frontend/dashboardExecutiveBriefing.test.js` updated: verbatim function copy aligned (all 6 logic changes mirrored), 5 watchlistCount-specific tests replaced/removed (watchlistCount=1 Watch → loading regression; criticalRepos=2+watchlistCount=3 → criticalRepos=2 only; watchlistCount=5 risk → not.toContain inverse; watchlistCount=4 NOT risk removed; watchlistCount=5 Triage → not.toContain inverse); net test delta: -1; 6,780/6,850 passing (70 skipped; 0 failing); prior: Dashboard Refinement #3 — Forecast Risk and Watchlists summary cards removed from `frontend/dashboard.html`; `fcCls`, `wlCls` helper functions removed; `fcVal`, `wlVal` variable declarations removed; `['Forecast Risk', ...]` and `['Watchlists', ...]` entries removed from `fields` array in `buildExecutiveKpiCards`; remaining cards: Architecture Health, Governance, Critical Repos, Snapshot Coverage (4 total); `tests/unit/frontend/dashboardExecutiveKpis.test.js` updated: verbatim function copy aligned (fcCls/wlCls/fcVal/wlVal removed), 2 label tests removed, card count assertion updated 6→4, 2 inverse label assertions added ("does NOT render Forecast Risk/Watchlists"), "Forecast Risk color" describe block removed (6 tests), "Watchlists color" describe block removed (6 tests), XSS forecastLevel test removed (1 test); backend forecast APIs, watchlist intelligence, Architecture Watchlists tab, Executive Briefing, all calculations untouched; net test delta: -13 (15 removed, 2 added); 6,781/6,851 passing (70 skipped; 0 failing); prior: Dashboard Refinement #2 — Executive Briefing section moved immediately after Summary cards in `frontend/dashboard.html`; new order: Summary → Executive Briefing → Notifications → Portfolio tabs → Projects; pure HTML reorder — no JS, CSS, API, or backend changes; all tests pass: 6,794/6,864 (70 skipped; 0 failing); prior: Dashboard Refinement #1 — Portfolio Briefing panel and Portfolio Forecast tab removed from `frontend/dashboard.html`; `buildPortfolioBriefingHtml`, `renderPortfolioBriefing`, `buildPortfolioForecastHtml`, and `loadPortfolioForecast` functions removed; all `renderPortfolioBriefing()` call sites removed (loadRepos, loadPortfolioArchitecture, loadPortfolioGovernance, loadPortfolioWatchlists, loadExecutiveSummary); `loadPortfolioForecast()` removed from `refresh()`; `#portfolio-briefing` div and Portfolio Forecast tab button + panel removed from HTML; `pf-*` CSS comment header updated (CSS rules kept — classes reused by other renderers); `tests/unit/frontend/dashboardPortfolioTabs.test.js` updated to 3-tab structure; backend APIs and execution modules untouched; Executive Briefing untouched; summary cards untouched; 6,794/6,864 passing (70 skipped; 0 failing); prior: Alignment Fix #8 — Primary Risk Drivers text for architecture concentration now appends "(top 3 shown)" when total lagging count exceeds display limit of 3; count ≤ 3 keeps original wording; `ARCH_DISPLAY_LIMIT` constant makes the threshold explicit; no ranking, scoring, API, or layout changes; `frontend/dashboard.html` only file changed; prior: Alignment Fix #7 — API Integration Health health-first row now driven by `integrationLevel` (same source as the badge) instead of derived counts; logic: weak/risky/critical/none/below_average → Risky, partial/watch/medium → Watch, else → Healthy; within Risky and Watch tiers, unresolved/feCalls metrics still refine the message text; previously broken case (integrationLevel='weak', no unresolved, linked>0) now correctly shows Risky; raw metrics, coverage lines, integration-level badge unchanged; `frontend/dashboard.html` only file changed; prior: Alignment Fix #6 — Portfolio Coupling health-first row now derives from `couplingLevel` (same source as the badge below) instead of derived metrics; logic: couplingLevel high/risky/critical → Risky, watch/medium/moderate → Watch, else → Healthy; "No circular dependency cycles detected." line and raw metrics unchanged; `frontend/dashboard.html` only file changed; prior: Alignment Fix #3 + #4 + #5 — `_archRepoRecommendationsHtml` now sorts lagging repos by the same `_archTier` priority order used by `_archNeedsAttentionHtml` and Repository Status (critical→elevated→watch→healthy, lower score first within tier) before slicing to top-3; recommendation content, top-3 limit, fallback path, and all other logic unchanged; `frontend/dashboard.html` only file changed; prior: Alignment Fix #2 — Architecture Risk Concentration sort order aligned to Repository Status PRIORITY_ORDER; new `_archTier` helper inside `_archNeedsAttentionHtml` maps architectureHealthScore to critical(score<45)/elevated(45-69)/watch(70-84)/healthy(≥85); `.sort()` applied before `.slice(0,3)` — critical first, then elevated, then watch; within same tier lower score (worse) appears first; previous behaviour: API response order unchanged; recommendations sort unchanged (deferred); no score/API/schema changes; `frontend/dashboard.html` only file changed; prior: Alignment Fix #1 text rename + Portfolio Architecture refinements #1–#11 — Recommendations section converted from portfolio-generic to repo-specific: new `_archRepoRecommendationsHtml(data)` function replaces `_archRecommendationsHtml(data.recommendations)` call; for each lagging/below_average repo (top 3 by rank) generates "Priority #N — repo-name" header + Detected bullets (low score, boundary violations naming that repo) + Recommended actions; portfolio-level signals (integrity/API/coupling) attributed to top-ranked repo only; original `_archRecommendationsHtml` preserved and used as fallback when no lagging repos exist; no new API calls, no score changes, no schema changes; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #10 — API Integration Health health-label logic updated to resolve Healthy/PARTIAL contradiction: `integrationLevel === 'partial'` branch added between feCalls/linked check and else-Healthy, mapping to Watch + "API mappings are partially linked."; evaluation order: unresolved>0 → Watch, feCalls>0&&linked===0 → Risky, integrationLevel=partial → Watch, else → Healthy; raw metrics, integration-level badge, coverage lines, scoring, and API shape unchanged; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #9 — Architecture Risk Concentration repo rows converted from single-line (name + bare number) to two-line (name on top, "Architecture Risk Score: N" label+value below in muted text); score value, severity color, top-3 limit, and ranking logic unchanged; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #8 — "Primary Risk Drivers" block added after progress bar in `buildPortfolioArchitectureHtml`; new `_archRiskDriversHtml(data)` helper derives up to 4 bullet drivers from existing data fields: (1) lagging/below_average repo count → red dot "Architecture risk concentrated in N repositories"; (2) scaffoldFiles/placeholderHints/avgCompleteness<70 → orange dot "Implementation integrity weaknesses detected"; (3) boundary violations absent → green dot / present → red dot; (4) circDeps/reposCyc/avgEdges≥30 → coupling pressure dot; compact bordered panel with colored 7px dot indicators; no score calculations, API shape, data model, or scoring logic changed; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #7 — Implementation Integrity card reframed health-first: "Implementation Health:" label + badge (Watch/Risky/Healthy) + plain-language message added above existing integrity-level badge and raw metrics; logic: scaffoldFiles>0 or placeholderHints>0 → Watch, avgCompleteness<70 → Risky, else → Healthy; all existing calculations, raw metric values, integrity-level badge, weak-completeness line, and styling preserved; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #6 — API Integration Health card reframed health-first: "API Health:" label + badge (Watch/Risky/Healthy) + plain-language message added above existing integration-level badge and raw metrics; logic: unresolved>0 → Watch, feCalls>0 && linked===0 → Risky, else → Healthy; all existing calculations, raw metric values, integration-level badge, coverage lines, and styling preserved; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #5 — Boundary Violations empty-state upgraded: no-violations branch now renders "Boundary Health: Healthy" label+badge row above the existing "No systemic boundary violations detected." message; violations-present path unchanged; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #4 — API Integration Health and Implementation Integrity moved into a "Supporting Signals" labelled section below the primary Boundary Violations + Portfolio Coupling grid; "Supporting Signals" section-header + subtitle "These indicators support architecture review but are not primary structural risk signals." added; both cards and all their values/styles fully preserved; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #3 — Portfolio Coupling card reframed health-first: "Coupling Health:" label + badge (Risky/Watch/Healthy) + plain-language message added above existing coupling-level badge and raw metrics; logic: circDeps>0 or reposCyc>0 → Risky, avgEdgesPerRepo≥30 → Watch, else → Healthy; "No circular dependency cycles detected." confirmation line shown when circDeps===0; all existing calculations, raw metric values, couplingLevel badge, and styling preserved; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture refinement #2 — "Needs Attention" section title renamed to "Architecture Risk Concentration"; explanatory subtitle "The repositories below contribute the largest share of portfolio architecture risk." added below title; ranking logic, score values, top-3 limit, and styling preserved; `frontend/dashboard.html` only file changed; prior: Portfolio Architecture layout refinement #1 — "Needs Attention" repo list extracted from `_archBenchmarkingHtml` into new standalone `_archNeedsAttentionHtml` function and moved directly below the score/header section in `buildPortfolioArchitectureHtml`; filtering and ranking logic (lagging/below_average, slice(0,3)) preserved; "Architecture Benchmarking" panel (Leading + Needs Attention 2-column grid) removed; new render order: Score/Header → Needs Attention → Boundary Violations → Portfolio Coupling → API Integration Health → Implementation Integrity → Recommendations; visual/layout change only — no score calculations, API endpoints, or data models changed; no existing tests broken; `frontend/dashboard.html` only file changed; prior: Portfolio Forecast distribution-based response guard — `GET /api/portfolio/forecast` route now evaluates `buildPortfolioForecastingIntelligence`'s returned `forecastDistribution` immediately before `res.json()`; if `totalForecasts > 0 && knownForecasts === 0` (stable+watch+degrading+critical all zero), response is overridden to `portfolioForecastLevel: 'unknown'`, `confidenceLevel: 'low'`, `summary: 'Portfolio forecast unavailable due to insufficient architecture history.'`, `projectedCouplingPressure: 'unknown'`, `projectedGovernanceRisk: 'unknown'`, `trendForecast: 'unknown'`; this guard runs AFTER `buildPortfolioForecastingIntelligence` (line 185 in `backend/routes/portfolioRoutes.js`) and catches the false-signal case where score=0 maps to `_portfolioLevel → 'stable'` and n≥5 repos default `_confidenceLevel → 'medium'` despite no forecastable history; 11 new tests added in "distribution-based response guard" describe block in `portfolioRoutes.test.js` (portfolioForecastLevel/confidenceLevel/summary correctness, false-signal guards for stable/medium, projectedCouplingPressure/projectedGovernanceRisk/trendForecast set to 'unknown', distribution preserved, guard-not-fire when known>0, guard-not-fire when totalForecasts=0); **why previous changes did not affect the live API**: (1) the pure-function fix in `buildPortfolioForecastingIntelligence.js` was never exercised by route tests (function is mocked); (2) the pre-function guard added in prior session checks `forecastedRepoCount === 0` BEFORE calling the function — correct logic but not the user-specified check against the actual distribution; (3) Node.js server process was never restarted — `require()` cache held pre-fix code for all edited files; fix now at response level using actual distribution from function output; 6786/6856 passing serially (70 skipped; pre-existing Jest parallel-worker race documented separately); prior: Portfolio Forecast route-level readiness guard — `GET /api/portfolio/forecast` (`backend/routes/portfolioRoutes.js`) now short-circuits before calling `buildPortfolioForecastingIntelligence` when `repoCount > 0 && forecastedRepoCount === 0`, returning `portfolioForecastLevel: 'unknown'`, `confidenceLevel: 'low'`, `portfolioForecastScore: 0`, `summary: 'Portfolio forecast unavailable due to insufficient architecture history.'`, and `forecastDistribution: { unknown: repoCount }`; 14 new route-level tests added to `portfolioRoutes.test.js` in "all-unknown readiness guard" describe block (includes: portfolioForecastLevel/confidenceLevel/score/summary correctness, buildPortfolioForecastingIntelligence not called (short-circuit verified), distribution.unknown = repoCount, _cache shape, repoForecasts still present, false-signal guards, single-repo boundary, empty-portfolio boundary, mixed-repo boundary); 3 pre-existing tests updated to read from `res.json.mock.calls[0][0].repoForecasts` instead of `buildPortfolioForecastingIntelligence.mock.calls` (they broke because the route now short-circuits for single-unknown-repo cases); **why prior pure-function fix did not affect live API**: route tests mock `buildPortfolioForecastingIntelligence` entirely — the all-unknown case was never tested at route level; live server also had old module in require() cache (no restart since file edit); fix now enforced at route level, testable independently of pure function; 6775/6845 passing (70 skipped); prior: Portfolio Forecast readiness guard implemented — `buildPortfolioForecastingIntelligence` now returns `portfolioForecastLevel: 'unknown'` when all repos have insufficient snapshot history (forecastableCount === 0), preventing the misleading "Stable Forecast Risk / Medium Confidence / Risk Score 0" false signal; `buildPortfolioForecastHtml` updated to display "FORECAST UNAVAILABLE" badge + "Insufficient architecture history" when `portfolioForecastLevel === 'unknown'`, suppressing forecast level labels, confidence badges, and risk scores; 7 tests added to `buildPortfolioForecastingIntelligence.test.js` (all-unknown readiness guard block); new `tests/unit/frontend/dashboardPortfolioForecast.test.js` created (34 tests covering unavailable states, message display, label suppression, valid data rendering, partial snapshot warning); 6761/6831 passing (70 skipped); prior: manual register path fixed — POST /register `backend/routes/repoRoutes.js` INSERT now explicitly includes `project_status` in column list with literal `'active'` in VALUES; previously only the ON CONFLICT DO UPDATE path set `project_status`, causing `repositories_project_status_check` violation on fresh INSERT; SQL-guard test expanded from 3 to 5 assertions covering INSERT column list, VALUES clause, DO UPDATE SET, exact literal match, and no-triple-quote guard; 6727/6797 passing (70 skipped); prior: `_upsertRepository` same fix + migration 0014 default fix + fetchUserRepos affiliation/pagination/error-logging fixes)

---

## Repository Status Classification

**Current Phase:** Phase 5–7 (partial) — Analyzer Improvement Step #8 complete 2026-07-09 (Next.js App Router path matcher extended in extractRouteApiStructure.js to recognize apps/*/, packages/*/, services/*/, libs/*/ workspace/monorepo layouts, each with or without a further src/ segment; dynamic/catch-all normalization and Step #5 backendRoutes merge unchanged; pages/api intentionally left root-anchored only; zero scoring/linking/UI/frontend-call-extraction changes); Analyzer Improvement Step #7 complete 2026-07-09 (app.setGlobalPrefix() detection added to extractRouteApiStructure.js, applied only to framework:'nestjs' backendRoutes via the existing _joinNestPath helper — closes the gap explicitly flagged in Step #6, confirmed end-to-end against the real repo_id=98 main.ts + AuthController now resolving to POST /api/v1/auth/login and linking; zero scoring/UI changes); Analyzer Improvement Step #6 complete 2026-07-09 (NestJS object-form @Controller({path, version}) decorator support added to extractRouteApiStructure.js — directly closes the root cause proven in the 2026-07-08 repo_id=98 investigation, where 14/15 real NestJS controllers used this syntax and were silently skipped; version+path resolved independent of key order, array/imported-constant/computed-expression values still safely skipped; zero scoring/linking/UI changes); Analyzer Improvement Step #5 complete 2026-07-08 (Next.js App Router routes now merged into backendRoutes in extractRouteApiStructure.js and therefore participate in linkFrontendBackendApis matching — root cause was that nextRoutes was computed but never passed into linkage; pages/api still excluded, preserved unchanged; zero changes needed to linkFrontendBackendApis.js/verifyArchitectureBoundaries.js/assessImplementationCompleteness.js/buildRepositoryArchitectureSnapshot.js/UI); Analyzer Improvement Step #4 complete 2026-07-08 (analyzerCoverage measurement-confidence metadata added — framework-hint detection (NestJS decorators, Next.js App Router files, BFF fetch wrappers) vs. actual extraction success, 4 warning conditions, unsupportedRisk low/medium/high, surfaced at snapshot top level and rendered as a neutral-styled "Analyzer Coverage" panel in the Architecture tab; zero scoring/linkage-formula changes, verified by formula-equality test); Analyzer Improvement Step #3 complete 2026-07-08 (serverFetch/apiFetch/internalFetch/backendFetch BFF call detection added to extractRouteApiStructure.js — same path forms as fetch() incl. concatenation/template interpolation/method options, reuses existing frontendApiCalls.client field, zero scoring/linking/route-extraction/UI changes); Analyzer Improvement Step #2 complete 2026-07-08 (Next.js App Router route-handler detection extended in extractRouteApiStructure.js — src/app/api prefix, export const PATCH/DELETE arrow-and-function-expression exports, export { GET, POST } list form incl. aliasing, method-less route.ts now safely skipped instead of wildcard-guessed; zero scoring/UI changes); Analyzer Improvement Step #1 complete 2026-07-08 (NestJS decorator-based route detection added to extractRouteApiStructure.js — @Controller/@Get/@Post/@Put/@Patch/@Delete resolved via regex + brace-depth class-body scan, dynamic paths skipped safely, wired into existing backendRoutes contract with zero scoring/UI changes); Repository Overview Refinement #10 complete 2026-07-07 (Overview tab simplified: Operational Metrics reduced to Commits (7d) only; Risk Score/PR Health/Recent Events sections and their build/load functions removed as dead weight; Operational Risk Drivers confirmed already-conditional, no change needed); Architecture Intelligence complete; Real-Time accepted (ADR-002); Notifications integrated + partially verified (worker routing verified 2026-06-12; positive send paths + payload content unit-tested 2026-06-14; nodemailer dependency placement resolved 2026-06-15; SMTP sandbox delivery verified via Mailhog 2026-06-15; production relay unverified; in-app persistence layer scaffolded + unit-tested 2026-06-16; sendAlert.js wired to writeNotification 2026-06-16; snapshotWorker wired to pass db pool 2026-06-16 — in-app channel runtime-active when DATABASE_URL configured; notification API routes added 2026-06-16; dashboard notification UI added 2026-06-16 — in-app channel fully implemented across all layers); Operational Resilience incomplete; CI workflow operational (2026-06-13); Playwright E2E toolchain scaffolded 2026-06-16 (`@playwright/test` installed, `playwright.config.js` created, `test:e2e` script added); Playwright webServer startup hardened 2026-06-16 (`cross-env PROJECT_SOURCE=file npm run dev`); first Playwright dashboard smoke tests passing 2026-06-16 (`tests/e2e/dashboard.smoke.spec.js` — 8/8 tests passing; unauthenticated path verified in Chromium headless; authenticated E2E and DB-seeded notification E2E absent); Playwright authenticated session bootstrap complete 2026-06-17 (`tests/e2e/globalSetup.js` added — seeds `upsertUser` + `createSession` against test DB; storageState saved to `tests/e2e/.auth/user.json`; `playwright.config.js` wired; `tests/e2e/.auth/` gitignored; no test-only route added; no production auth logic modified; verified `node tests/e2e/globalSetup.js` → exit 0); **authenticated notification E2E browser-tested 2026-06-17** (`tests/e2e/notifications.authenticated.spec.js` — 2/2 passing in Chromium headless: unread badge visible + count=1 verified, panel opens + title + HIGH badge visible, mark-read PATCH 200 verified, badge `hidden=""` + empty text verified on re-fetch; real session cookie via storageState; real DB-seeded notification row; real `GET /api/notifications` + `PATCH /api/notifications/:id/read` exercised; no production code changed; `#notif-badge` CSS visual-hide defect **resolved 2026-06-17** — added `#notif-badge[hidden] { display: none !important }` CSS rule; `not.toBeVisible()` assertion now passes; 10/10 E2E passing); **FR-009 repository name search integrated 2026-06-17** — backend `?search=` param with ILIKE + 200-char limit + HTTP 400 on invalid; frontend `#repo-search-input` in filter bar; `buildReposUrl` supports riskLevel + search composition; 260/260 backend route tests + 53/53 frontend filter tests passing; **FR-009 activity recency filter integrated 2026-06-17** — backend `?activeSince=` param (7d/30d/90d/stale); stale includes `last_synced_at IS NULL`; frontend `#repo-recency-select` dropdown + change listener; `buildReposUrl` supports riskLevel + search + activeSince ordering; 282/282 backend route tests + 65/65 frontend filter tests passing  
**Overall Maturity:** Partially Implemented / Integrated  
**Test Status:** 7,240 / 7,310 passing serially under `npm test --runInBand` (70 skipped = 63 integration DB + 7 SMTP opt-in; 0 failing) — updated 2026-07-09 (Analyzer Improvement Step #8: net +21 tests — monorepo App Router workspace-layout tests added, incl. full linkage verification; 7,240/7,240 non-skipped passing; prior: Analyzer Improvement Step #7: net +16 tests — global prefix detection tests added, incl. repo_id=98 end-to-end linkage closure; 7,219/7,219 non-skipped passing; prior: Analyzer Improvement Step #6: net +20 tests — NestJS object-form controller tests added, incl. two exact repo_id=98 controller-body regressions; 7,203/7,203 non-skipped passing; prior: Analyzer Improvement Step #5: net +14 tests — App Router linkage tests added, 1 pre-existing Step #4 assertion corrected to reflect the now-fixed backendRoutes count; 7,183/7,183 non-skipped passing; prior: Analyzer Improvement Step #4: net +36 tests — analyzerCoverage warning/UI tests added across extractRouteApiStructure, buildRepositoryArchitectureSnapshot, and dashboardArchitectureTab; 7,169/7,169 non-skipped passing; prior: Analyzer Improvement Step #3: net +11 tests — serverFetch/BFF wrapper detection tests added; 7,133/7,133 non-skipped passing; prior: Analyzer Improvement Step #2: net +12 tests — Next.js App Router route-handler tests added; 7,122/7,122 non-skipped passing; prior: Analyzer Improvement Step #1: net +16 tests — NestJS route detection tests added; 7,110/7,110 non-skipped passing; prior: 2026-07-07 (Repository Overview Refinement #10: net -51 tests — dead-function test coverage removed for buildRepoRiskHtml/buildRepoPrHealthHtml/buildRepoEventsHtml, buildRepoMetricsHtml trimmed to Commits (7d) only; 7,094/7,094 non-skipped passing; prior: 2026-06-30 (API Linkage Improvement Wave 1: net +59 tests; 7,145/7,145 non-skipped passing; prior: Architecture Risk Reduction Step #12: net +4 tests; 7,086/7,086 non-skipped passing; prior: Architecture Risk Reduction Step #9: net +8 tests; 7,082/7,082 non-skipped passing; prior: Architecture Risk Reduction Step #7: net +6 tests; 7,074/7,074 non-skipped passing; prior: Architecture Risk Reduction Step #5: net +19 tests; 7,068/7,068 non-skipped passing; prior: Architecture Risk Reduction Step #3: net +9 tests; 7,049/7,049 non-skipped passing; prior: Repository Status Refinement #9: net +10 tests; 7,040/7,040 non-skipped passing; prior: Repository Status Bug Fix #4: net +6 tests; 7,030/7,030 non-skipped passing; prior: Repository Status Bug Fix #2: net +29 tests (18 backend + 11 frontend); 7,024/7,024 non-skipped passing; prior: Repository Status Bug Fix #1: net 0 tests; 7,065/7,065 passing; prior: Repository Status Refinement #8: net 0 tests (11 replacements); 352/352 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinements #5–#7: net +17 tests; 352/352 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinement #4: net −14 tests; 335/335 in `dashboardRepoPriority.test.js`; prior: Repository Status Refinements #1–#3: net +3 tests; 349/349 in `dashboardRepoPriority.test.js`; prior: Engineering Governance Refinements #5–#7: `dashboardGovernance.test.js` rewritten — grammar fix for plural noun subjects (`gaps`/`concerns`/`anomalies`/etc. → "require" even when alone; singular nouns → "requires"); new `_govLabel(key)` standalone function maps 30+ backend camelCase and snake_case identifiers to executive display labels (e.g. `architectureRegressions` → "Architecture Regressions", `couplingAlerts` → "Dependency Coupling", `stable_forecast` → "Stable Forecast"); new `_govCleanRec(text)` standalone function cleans "Immediately address critical governance risks: code1, code2" recommendation pattern by translating internal codes to labels via `_govLabel`; Key Governance Findings capped to top-3 risks + top-3 strengths (was 5 each); risk `source` and strength `sType` rendered via `_govLabel`; recommendations rendered via `_govCleanRec`; test file rewritten: 99 total tests (up from 62) — 21 `_govLabel` tests, 5 `_govCleanRec` tests, 55 `_govSummaryHtml` tests (updated grammar assertions: "architecture gaps" → "require", "maturity gaps" → "require"; singular "forecast instability" → "requires"), 18 `buildPortfolioGovernanceHtml` integration tests (top-3 cap, identifier translation for source/sType, recommendation cleaning); net +37; prior: Engineering Governance Refinement #4: `dashboardGovernance.test.js` rewritten — "Governance Risks" and "Governance Strengths" merged into "Key Governance Findings" section with Risks/Strengths subsections; grammar fixed in `_govSummaryHtml` (single concern → "requires", multiple → "require"); net +15 (62 total in file vs. 47 before); prior: Engineering Governance Refinements #1–#3: new `dashboardGovernance.test.js` net +47 — `_govSummaryHtml` 24 tests + `buildPortfolioGovernanceHtml` integration 23 tests; Executive Signals section removed, intervention banner replaced with Portfolio Governance Summary, driver paragraphs removed; prior: Portfolio Architecture Refinement #16: new `dashboardPortfolioApiIntegration.test.js` net +27; prior: Portfolio Architecture Refinement #15: new `dashboardPortfolioRecommendations.test.js` net +44; prior: Portfolio Architecture Refinement #14: new `dashboardPortfolioCoupling.test.js` net +35; prior: Portfolio Architecture Refinement #13: new `dashboardPortfolioRiskSummary.test.js` net +34; prior: Dashboard Refinements #9–#12: `dashboardExecutiveBriefing.test.js` net +1; prior: Dashboard Refinement #8: `dashboardExecutiveBriefing.test.js` net -23; prior: Dashboard Refinement #7: `dashboardExecutiveBriefing.test.js` net +4; prior: Dashboard Refinement #5: `dashboardExecutiveBriefing.test.js` net +5; prior: Dashboard Refinement #4: `dashboardExecutiveBriefing.test.js` net -3; prior: Dashboard Alignment #3: `dashboardPortfolioTabs.test.js` updated to 2-tab structure, net -1; prior: Dashboard Alignment #2: `dashboardExecutiveBriefing.test.js` 5 watchlistCount tests replaced/removed, net -1; prior: Dashboard Refinement #3: `dashboardExecutiveKpis.test.js` net -13; prior: Dashboard Refinement #1: `dashboardPortfolioTabs.test.js` updated to 3-tab structure, net +8; prior: 6,786 / 6,856 passing 2026-06-19 +11 distribution-based response guard tests); DB integration suite total: 63 opt-in tests across 4 files; SMTP integration suite 7 opt-in tests (skipped under `npm test`, 7/7 passing with `TEST_INTEGRATION=true` + Mailhog running)  
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
| FR-008 | Notifications (in-app + email) | **Integrated / Partially Verified** — email + Slack channels implemented; SMTP delivery verified via Mailhog sandbox 2026-06-15 (7/7 integration tests); production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only); **in-app persistence layer scaffolded 2026-06-16** (`migrations/0013_create_notifications.js` + `execution/notifications/writeNotification.js`; 54 unit tests); **sendAlert.js wired to in-app 2026-06-16** (fans out `writeNotification` per active user; 16 unit tests; failure-isolated); **snapshotWorker wired to pass db 2026-06-16** (`startSnapshotWorker(db)` → `sendAlert(snapshot, { db })`; in-app channel runtime-active; 7/7 worker tests); **notification API routes added 2026-06-16** (`GET /api/notifications` user-scoped + unreadCount, `PATCH /api/notifications/:id/read` marks owned notifications READ, 17/17 route tests); **dashboard notification UI added 2026-06-16** (topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in 60-second `refresh()` loop, `markNotificationRead(id)` → PATCH, `toggleNotificationPanel()`, 29/29 frontend tests; unauthenticated users see no error; **unauthenticated E2E smoke verified 2026-06-16** (bell visible, panel hidden, bell toggle, no JS errors — 8/8 passing in Chromium headless); **authenticated notification UI E2E browser-tested 2026-06-17** (`tests/e2e/notifications.authenticated.spec.js`; 2/2 passing in Chromium headless: unread badge visible + count=1, panel opens, title + `.aq-badge.severity-high` visible, mark-read PATCH 200 verified, badge `hidden=""` + empty text on re-fetch; real session cookie, real DB-seeded notification row, real `GET /api/notifications` + `PATCH /api/notifications/:id/read` exercised; no production code changed); ~~`#notif-badge` visual-hide CSS defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added to `frontend/dashboard.html`; Playwright `not.toBeVisible()` assertion now passes (10/10 E2E); ~~no integration test for worker → writeNotification → DB row path~~ — **resolved 2026-06-17**: `tests/integration/notifications.db.integration.test.js` added (14/14 passing in isolation — row shape, deduplication, `sendAlert` fan-out, column integrity verified against real PostgreSQL); `writeNotification.js` PostgreSQL conflict-target bug fixed (`ON CONFLICT ON CONSTRAINT` replaced with partial-index inference form `ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`); remaining: no production SMTP relay verification; no Slack webhook verification; full integration-suite run exposes DB truncation race condition across parallel Jest workers — pre-existing test-setup issue, not a production code defect) |
| FR-009 | Search and Filtering | Partially Implemented — Risk-level filtering + Repository name search + Activity recency + **Project status (backend only, 2026-06-18)**: **Integrated / Tested**; label/risk filter tested (29/29); backend route tests 268/268; frontend filter/load tests 65/65; At Risk semantics unchanged: client-side `critical \|\| at-risk` (by design in Option A); **activity recency filter added 2026-06-17**: `?activeSince=` param (7d/30d/90d/stale); stale includes `last_synced_at IS NULL` or older than 30 days; `#repo-recency-select` dropdown in filter bar; `buildReposUrl` supports riskLevel + search + activeSince ordering; ~~SQL clause correctness against real PostgreSQL unverified~~ — **resolved 2026-06-18**: `tests/integration/repoFilters.db.integration.test.js` (24 opt-in tests — riskLevel, ILIKE, `timestamptz` bounds, projectStatus, 5 combined; 24/24 passing in isolation); **`?projectStatus=` backend filter added 2026-06-18**: migration 0014 + `$6` SQL clause + validation; 2 spec dimensions still absent: assigned manager, intern contributor |
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
- 14 migrations defined (up to `0014_add_project_status_to_repositories.js`; 0013–0014 not yet applied to any environment — DDL only):
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
  - `backend/routes/repoCoreRoutes.js` (mounted via `repoRoutes.js`, split 2026-07-11) — `POST /api/repos/sync`, `POST /api/repos/register`
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
- **Capability:** Search and Filtering (FR-009 — Partially Implemented; risk-level filtering + repository name search + activity recency: Integrated / Tested)
  - Label filter: All / At Risk / Healthy (client-side, `applyFilter()` in `frontend/dashboard.html`)
  - Backend riskLevel filter: `GET /api/repos?riskLevel=healthy|at-risk|critical` — user-scoped SQL filter (`AND ($2::varchar IS NULL OR rs.label = $2)`); invalid values return HTTP 400 without hitting db; absent param returns all repos (backward compatible); RBAC boundary preserved
  - **Backend repository name search (added 2026-06-17):** `GET /api/repos?search=<term>` — `search` extracted from `req.query`; validated (non-string → 400; trimmed length > 200 → 400; db.query not called for invalid); trimmed before SQL; SQL clause `AND ($3::varchar IS NULL OR r.github_full_name ILIKE '%' || $3 || '%')`; `$2` (riskLevel) position preserved; `riskLevel + search` can be combined; authorization unchanged (`WHERE r.user_id = $1 AND r.is_active = true`)
  - Frontend integration (Option A, 2026-06-12): `buildReposUrl(options)` and `filterToLoadOptions(activeFilter)` pure helpers; Healthy filter calls `GET /api/repos?riskLevel=healthy`; All and At Risk intentionally call without riskLevel (At Risk semantics preserved: client-side `critical || at-risk`)
  - **Frontend repository search (added 2026-06-17):** `<input type="search" id="repo-search-input" placeholder="Search repositories…">` added to `.filter-bar`; `buildReposUrl` rewritten to build `params[]` array — appends `riskLevel=<encoded>` then `search=<encoded>`; trims search before encoding; omits when empty after trim; filter button click handler merges current search value with `filterToLoadOptions` result; `input` event listener on `#repo-search-input` calls `loadRepos()` on every keystroke; At Risk + search passes `{ search: term }` (no riskLevel) — client-side predicate still applies
  - **Backend activity recency filter (added 2026-06-17):** `GET /api/repos?activeSince=<value>` — `activeSince` extracted from `req.query`; validated against allowlist `Set(['7d', '30d', '90d', 'stale'])`; empty string treated as absent; invalid values → HTTP 400 (no db.query); maps to lowerBound/upperBound UTC ISO timestamps; SQL clauses `AND ($4::timestamptz IS NULL OR r.last_synced_at >= $4::timestamptz)` and `AND ($5::timestamptz IS NULL OR r.last_synced_at IS NULL OR r.last_synced_at < $5::timestamptz)`; stale includes `last_synced_at IS NULL` (never-synced repos always stale); parameter array extended from 3 to 5 elements
  - **Frontend activity recency filter (added 2026-06-17):** `<select id="repo-recency-select">` added after `#repo-search-input` in `.filter-bar`; options: Any time (empty), Last 7 days (7d), Last 30 days (30d), Last 90 days (90d), Stale 30+ days (stale); CSS pill style mirrors `#repo-search-input`; `buildReposUrl` extended with third `activeSince` branch (ordering: riskLevel, search, activeSince); filter button click handler + search `input` listener both read recency value; new `change` event listener on `#repo-recency-select` calls `loadRepos()` with combined opts; existing At Risk / Healthy / All behavior preserved
  - Tests: `tests/unit/frontend/dashboardFilter.test.js` — **29/29 passing** (added 2026-06-12); covers All, At Risk, Healthy, empty result, count display
  - **Backend project status filter (added 2026-06-18):** `GET /api/repos?projectStatus=active|inactive|archived|unknown` — `projectStatus` extracted from `req.query`; validated against `Set(['active','inactive','archived','unknown'])` (invalid → HTTP 400, db.query not called); SQL clause `AND ($6::varchar IS NULL OR r.project_status = $6)` appended; `r.project_status AS "projectStatus"` added to SELECT; parameter array extended from 5 to 6 elements; absent `projectStatus` passes `null` → filter is no-op (all existing filters unaffected); `projectStatus` can be combined with all existing filters; `migration/0014_add_project_status_to_repositories.js` adds `project_status varchar(20) NOT NULL DEFAULT 'active' CHECK(IN 'active','inactive','archived','unknown')` with reversible `down()`; no data migration required (default covers all existing rows)
  - Tests: `tests/unit/backend/routes/repoRoutes.test.js` — **268/268 passing** (updated 2026-06-18: 11 new projectStatus unit tests added; all 5-element param arrays updated to 6-element)
  - Tests: `tests/unit/frontend/dashboardFilterLoad.test.js` — **36/36 passing** (updated 2026-06-17: `buildReposUrl` verbatim copy updated; 9 new activeSince-parameter tests + 3 new filter+activeSince composition tests added; was 24/24)
  - Tests: `tests/unit/backend/routes/repoRoutes.http.test.js` — **35/35 passing** (updated 2026-06-18: 9 new projectStatus HTTP contract tests added; all 5-element param arrays updated to 6-element; was 26/26)
  - Tests: `tests/unit/migrations/0014_project_status.test.js` — **9/9 passing** (added 2026-06-18): module structure (up/down/shorthands), addColumn called once, targets repositories table, notNull, default contains 'active', check constraint contains all four allowed values, down calls dropColumn
  - Tests: `tests/integration/repoFilters.db.integration.test.js` — **24/24 passing in isolation** (updated 2026-06-18: 5 new projectStatus integration tests added to Block 5; `buildParams` extended to 6-element; `seedRepo` accepts `projectStatus`; fixtures assigned projectStatus values; was 19 tests)
  - Missing: At Risk toggle intentionally uses client-side `critical || at-risk` (by design in Option A); filter by assigned manager, intern contributor absent; no frontend `projectStatus` UI control (backend-only implementation per approved scope)
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
  - `backend/routes/repoRiskRoutes.js` (mounted via `repoRoutes.js`, split 2026-07-11) — `GET /api/repos/:id/risk`, `/escalation`, `/forecast`, `/confidence`, `/maturity`, `/maturity-trend`, `/engineering-volatility`, `/pr-health`, `/events`
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
  - `backend/routes/repoArchitectureRoutes.js` (mounted via `repoRoutes.js`, split 2026-07-11) — `GET /api/repos/:id/architecture`, `/architecture/forecast`, `/remediation`, `POST /:id/change-risk`
  - `backend/routes/portfolioArchitectureRoutes.js` (mounted via `portfolioRoutes.js`, split 2026-07-11) — `GET /api/portfolio/architecture`, `/forecast`, `/watchlists`, `/anomalies`, `/anomaly-clusters`, `/telemetry-coverage`
  - `backend/routes/portfolioGovernanceRoutes.js` (mounted via `portfolioRoutes.js`, split 2026-07-11) — `GET /api/portfolio/governance`, `/executive-summary`, `/history`, `/changes`, `/behavioral-stability`, `/maturity`
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
  - ~~No integration test for the full worker → `writeNotification` → DB row path~~ — **resolved 2026-06-17**: `tests/integration/notifications.db.integration.test.js` added (14/14 passing in isolation — row shape, deduplication constraint, `sendAlert` fan-out, column integrity); `writeNotification.js` `ON CONFLICT ON CONSTRAINT` PostgreSQL bug fixed (partial-index inference form); full integration-suite run shows DB truncation race across parallel workers — pre-existing test-setup isolation issue, not a code defect

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
| Frontend (pure renderers + filter) | 17 | ~944 | All passing |
| Execution — Architecture | 24 | ~2,100 | All passing |
| Execution — Risk | ~18 | ~1,800 | All passing |
| Execution — Auth/Crypto/RBAC | ~8 | ~400 | All passing |
| Execution — GitHub | ~7 | ~361 | All passing (fetchUserRepos.test.js → 25, +11 from org_member + pagination) |
| Backend (routes, middleware, migrations) | ~11 | ~715 | All passing (repoRoutes.test.js → 271, +3 from sync error logging) |
| Directives validation | 1 | ~12 | All passing |
| Integration — DB (audit, auth, notifications, repo filters) | 4 | 63 | **Skipped** under `npm test` — require live PostgreSQL (`TEST_INTEGRATION=true`); `notifications.db.integration.test.js` **14/14 passing in isolation** (2026-06-17); `repoFilters.db.integration.test.js` **24/24 passing in isolation** (2026-06-18 — 19 original + 5 projectStatus tests) |
| Integration — SMTP notifications | 1 | 7 | **7/7 passing** opt-in — require Mailhog on localhost:1025 + `TEST_INTEGRATION=true`; skipped under `npm test` |
| Execution — Notifications | 3 | 70 | All passing |
| Services — Worker | 1 | 7 | All passing (updated 2026-06-16) |
| E2E / Playwright (`npm run test:e2e`) | 2 test files + 1 globalSetup | 10 | **Partially Tested** — toolchain installed + webServer hardened 2026-06-16; `tests/e2e/dashboard.smoke.spec.js` 8/8 passing (Chromium headless, 14.8 s; unauthenticated path); `tests/e2e/notifications.authenticated.spec.js` 2/2 passing (Chromium headless, 23.8 s; authenticated: unread render + mark-read PATCH flow; real session/DB/API); open defect: `#notif-badge` CSS visual-hide (inline `display:inline-flex` overrides `[hidden]`); CI E2E wiring absent; self-skips under `npm test` |
| **Total (`npm test`)** | **98 passing + 5 skipped = 103** | **6,791** | **6,721 passing, 70 skipped (63 DB + 7 SMTP, all opt-in), 0 failing** |

### Testing Gaps

- ~~No Playwright / E2E toolchain~~ — **scaffolded 2026-06-16**: `@playwright/test` installed, `playwright.config.js` configured, `test:e2e` opt-in script added; Jest does not discover `tests/e2e/`. ~~webServer crashes on GitHub API timeout~~ — **resolved 2026-06-16**: webServer command changed to `cross-env PROJECT_SOURCE=file npm run dev`. ~~No E2E test files~~ — **resolved 2026-06-16**: `tests/e2e/dashboard.smoke.spec.js` created; 8/8 unauthenticated smoke tests passing in Chromium headless (`npm run test:e2e` exits 0, 14.8 s): /dashboard loads, page title verified, `#notif-btn` visible, `#notification-section` hidden on load, bell toggle shows/hides panel, Login with GitHub link visible (unauthenticated 401 path), no uncaught JS errors. ~~Authenticated E2E requires a session seeding strategy~~ — **resolved 2026-06-17**: `tests/e2e/globalSetup.js` added; uses `upsertUser()` + `createSession()` directly against test DB; storageState written to `tests/e2e/.auth/user.json`; `playwright.config.js` wired with `globalSetup`; `tests/e2e/.auth/` gitignored; no test-only backend route; no production auth changes; verified `node tests/e2e/globalSetup.js` → exit 0. ~~Authenticated E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` created; ~~DB-seeded notification panel E2E (badge count, mark-read flow) not yet written~~ — **resolved 2026-06-17**: real SQL seeding + storageState + badge count + mark-read PATCH flow verified (2/2 passing). ~~`#notif-badge` CSS visual-hide defect~~ — **resolved 2026-06-17**: `#notif-badge[hidden] { display: none !important }` CSS rule added to `frontend/dashboard.html`; Playwright `not.toBeVisible()` assertion now passes (10/10 E2E). E2E CI wiring still absent
- ~~`snapshotWorker.js` has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/services/worker/snapshotWorker.test.js`, 5 routing tests, all passing)
- ~~FR-009 label filter has no unit tests~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilter.test.js`, 29 tests, all passing); ~~backend riskLevel filter has no tests~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.test.js`, 7 new riskLevel tests, 236/236 total passing); ~~frontend not wired to backend riskLevel parameter~~ — **resolved 2026-06-12** (`tests/unit/frontend/dashboardFilterLoad.test.js`, 14 tests, 14/14 passing); ~~HTTP layer between URL query string and Express handler untested~~ — **resolved 2026-06-12** (`tests/unit/backend/routes/repoRoutes.http.test.js`, 10 supertest tests, 10/10 passing); ~~repository name search absent from backend and frontend~~ — **resolved 2026-06-17** (backend: 8 new search filter unit tests in `repoRoutes.test.js` + 6 new HTTP contract tests in `repoRoutes.http.test.js`; 4 existing riskLevel param array assertions updated to 3-element; frontend: `buildReposUrl` verbatim copy updated + 10 new tests in `dashboardFilterLoad.test.js`; 260/260 backend route tests + 53/53 frontend filter tests passing); ~~activity recency filter absent~~ — **resolved 2026-06-17** (backend: 12 new activeSince unit tests in `repoRoutes.test.js` + 10 new HTTP contract tests in `repoRoutes.http.test.js`; 9 existing riskLevel/search param array assertions updated to 5-element; frontend: 9 new activeSince-parameter tests + 3 new filter+activeSince composition tests in `dashboardFilterLoad.test.js`; **282/282 backend route tests + 65/65 frontend filter tests all passing**); ~~SQL clause correctness against real PostgreSQL unverified~~ — **resolved 2026-06-18**: `tests/integration/repoFilters.db.integration.test.js` added (24 opt-in tests — riskLevel LATERAL join, ILIKE bidirectional case folding, `timestamptz` activeSince bounds + IS NULL/stale clause, 4 combined-filter scenarios, 5 projectStatus scenarios; 24/24 passing in isolation; run with `$env:TEST_INTEGRATION = "true"; npx jest tests/integration/repoFilters.db.integration.test.js --no-coverage`); ~~project status filter absent from backend~~ — **resolved 2026-06-18**: migration 0014 + `?projectStatus=` validation + `$6` SQL clause; 8 migration unit tests + 11 repoRoutes.test.js + 9 repoRoutes.http.test.js + 5 DB integration tests; **268/268 backend route tests passing**; no frontend UI control (backend-only per approved scope)
- ~~`emailNotifier.js` positive send path untested~~ — **resolved 2026-06-14** (`tests/unit/services/notifications/emailNotifier.test.js`, 4 tests: `sendMail` called; `{ from, to, subject, text }` shape; subject + body contain `alertState` and `trend`). ~~`slackNotifier.js` body content untested~~ — **resolved 2026-06-14** (`tests/unit/services/notifications/slackNotifier.test.js`, 2 tests: JSON `{ text }` shape; `text` contains `alertState` and `trend`). ~~SMTP delivery untested against a real SMTP sink~~ — **resolved 2026-06-15** (`tests/integration/notifications.smtp.integration.test.js`, 7 tests: direct delivery, To/From, subject, body, sendAlert orchestration, dedup, shouldAlert gate; 7/7 passing with Mailhog). ~~No integration test for worker → `writeNotification` → DB row path~~ — **resolved 2026-06-17**: `tests/integration/notifications.db.integration.test.js` added (14 tests, 14/14 passing in isolation); `writeNotification.js` `ON CONFLICT ON CONSTRAINT` bug fixed (partial-index inference form). Remaining: production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only); full integration-suite run has DB truncation race across parallel workers (pre-existing test-setup issue).
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
| Notification production delivery unverified | Medium | Worker routing tested (2026-06-12, 20/20). Unit delivery paths tested (2026-06-14, 26/26). ~~`nodemailer` absent from root `package.json`~~ — **resolved 2026-06-15**. ~~SMTP delivery untested against real sink~~ — **resolved 2026-06-15**: Mailhog integration tests (7/7 passing). ~~`sendAlert` not wired to in-app~~ — **resolved 2026-06-16**: 16 unit tests. ~~`snapshotWorker` not wired to pass `db`~~ — **resolved 2026-06-16**: `startSnapshotWorker(db)` passes `pg.Pool` to `sendAlert`; 7/7 worker tests. ~~no notification API routes~~ — **resolved 2026-06-16**: `GET /api/notifications` + `PATCH /api/notifications/:id/read`; 17 route tests. ~~no frontend notification UI~~ — **resolved 2026-06-16**: topbar bell + `#notif-badge`, `#notification-section` panel, `loadNotifications()` in refresh loop, `markNotificationRead(id)`, 29/29 frontend unit tests. Remaining: production SMTP relay delivery unverified; Slack webhook unverified (unit-tested only); unauthenticated smoke verified 2026-06-16 (8/8 Chromium headless); authenticated session bootstrap complete 2026-06-17 (`tests/e2e/globalSetup.js`; storageState gitignored); ~~authenticated E2E test specs not yet written~~ — **resolved 2026-06-17**: `tests/e2e/notifications.authenticated.spec.js` 2/2 passing (unread render + mark-read PATCH flow; real session/DB/API; no production code changed); ~~no integration test for worker → DB row path~~ — **resolved 2026-06-17**: `tests/integration/notifications.db.integration.test.js` 14/14 passing in isolation; `writeNotification.js` PostgreSQL conflict-target bug fixed (partial-index inference form). |
| ~~`#notif-badge` visual-hide CSS defect~~ | ~~Medium~~ **Resolved** | **Discovered 2026-06-17** — inline `display:inline-flex` overrode UA `[hidden] { display:none }` because all author CSS beats UA CSS in the cascade (regardless of specificity); inline styles are author-origin. **Resolved 2026-06-17**: added `#notif-badge[hidden] { display: none !important }` to `frontend/dashboard.html` style block (1 line). `!important` overrides the inline style, making the `hidden` attribute visually effective. Playwright `not.toBeVisible()` assertion in test B updated to use `not.toBeVisible()`; 10/10 E2E passing. |
| FR-009 filter incomplete | Medium | Label/risk filter tested (29/29 passing, 2026-06-12). Backend route tests (293/293 passing, updated 2026-06-18). Frontend filter/load tests (65/65 passing, updated 2026-06-17). **Risk-level filtering + Repository name search + Activity recency + Project status (backend) are now Integrated / Tested.** ~~repository name search absent~~ — **resolved 2026-06-17**: `?search=` param with ILIKE; 200-char limit + HTTP 400 on invalid; `#repo-search-input` in filter bar. ~~activity recency filter absent~~ — **resolved 2026-06-17**: `?activeSince=` param; stale includes `last_synced_at IS NULL`; `#repo-recency-select` dropdown; 293/293 backend + 65/65 frontend tests passing. ~~SQL filter clauses unverified against real PostgreSQL~~ — **resolved 2026-06-18**: `tests/integration/repoFilters.db.integration.test.js` (24 opt-in tests; 24/24 passing in isolation). ~~project status filter absent from backend~~ — **resolved 2026-06-18**: migration 0014 + `?projectStatus=` (active/inactive/archived/unknown) + `$6` SQL clause; 28 new unit tests + 5 DB integration tests. At Risk toggle intentionally uses client-side `critical \|\| at-risk` (by design in Option A). 2 spec dimensions still absent: assigned manager, intern contributor. |
| NFR-007 data governance absent | Medium | User deletion, project archival, data export not found in codebase |
| ~~No CI/CD pipeline~~ | ~~Medium~~ **Resolved** | ✅ `.github/workflows/ci.yml` operational (2026-06-13). First successful GitHub Actions run: commit `4e58590`, push trigger, ubuntu-latest, Node 20, 32 s, 6,494/6,519 tests passed, no secrets. Integration tests self-skip (opt-in only). |
| GitHub API rate-limit handling absent | Medium | NFR-004 requires graceful rate-limit handling; not implemented |
| Sync has no persisted status | Medium | Background sync errors now logged to server stdout (`sync:background:failed`), but no `last_sync_status` DB column and no `GET /api/repos/sync/status` endpoint — client cannot distinguish "syncing" from "sync failed" from "sync returned 0 repos"; logs lost on server restart |
| ~~`fetchUserRepos` excluded org repos~~ | ~~High~~ **Resolved** | **Root cause of sync returning 0 repos for org members (2026-06-19)**: `affiliation=owner,collaborator` excluded `organization_member`. Fixed: added `organization_member` to affiliation param. Tested: 4 URL-param tests. |
| ~~`fetchUserRepos` had no pagination~~ | ~~Medium~~ **Resolved** | **Silent data loss for >100-repo accounts (2026-06-19)**: single-page fetch silently dropped repos beyond 100. Fixed: pagination loop following `Link: rel=next` header with 50-page safety cap. Tested: 7 pagination tests. |
| ~~Sync errors silently swallowed~~ | ~~High~~ **Resolved** | **`.catch(() => {})` discarded all background sync errors (2026-06-19)**: GitHub API failures (401/403/429), decryption mismatch, network errors were invisible. Fixed: `logger.error({ msg: 'sync:background:failed', ... })` in `.catch()`. Tested: 3 route unit tests. |
| `backend/tmp/analyze.js` in wrong layer | Low | Should be under `/tmp` (scratch) per CLAUDE.md folder boundaries |
| Redis not present | Low | Spec mentions Redis from Phase 3 onward; README lists it as a prerequisite; not installed or referenced |

---

## Recent Implementation History

### 2026-07-12 — Analyzer Improvement: Composition-Router Awareness for route_without_service_path

**Capability:** Architecture Intelligence data-quality fix (`execution/architecture/assessImplementationCompleteness.js`) — live repoId=80 snapshot #202 validated the prior turn's test-file-exclusion fix exactly as projected: `architectureHealthScore` rose 58 → 70 with `backend_routes`/`linked_endpoints`/`unresolved_calls`/`api_linkage_score` all unchanged, confirming the entire movement came from `placeholder_code_hint` dropping to 0. The one remaining `route_without_service_path` signal (count 2) was traced in that same snapshot to exactly `backend/routes/repoRoutes.js` and `backend/routes/portfolioRoutes.js` — both composition-only routers (own zero HTTP handlers, only `router.use(...)` child mounts) that structurally have no business-logic boundary to delegate to a service, making "no direct service/execution import" a false completeness gap rather than a real one.
**Deliverable status:** Narrow heuristic-scope fix — `PENALTY` weights, the completeness/architecture scoring formulas, `routeServiceCoverage`'s service-layer path-matching rules (`/(services?|execution)\//i`), `buildRepositoryStructureInventory.js`, `extractRouteApiStructure.js`, `buildImportDependencyGraph.js`, backend route files, execution modules, services, and `frontend/dashboard.html` are all untouched. Snapshot not regenerated in this step.

#### Confirmed Pre-Change Flow

`routeFiles` = `inventory.categories.routes`, evaluated uniformly with no concept of composition vs. handler-owning routers. The heuristic already has `files` (raw content) available in the function signature but wasn't using it for this loop — only `dependencyGraph.edges` (import-edge presence) drove the signal. `routeApiStructure`/`backendRoutes`/`routeHandlers` are separately available to the function but intentionally not used for this fix, keeping it content-based and decoupled from the extraction pipeline (also honoring the "do not modify `extractRouteApiStructure.js`" scope boundary).

#### Composition-Only Semantic Rule

A route file is composition-only, for `route_without_service_path` only, when its (comment-stripped) content contains at least one generic-identifier `.use(` mount call **and** zero handler-owning HTTP method calls (`.get(`/`.post(`/`.put(`/`.patch(`/`.delete(`, any identifier — not hard-coded to `router`/`app`). Filename alone (`fooRoutes.js`) is never sufficient; comments/strings are never the primary signal (existing `_stripComments` is reused, no new parser).

#### What Changed

- **`execution/architecture/assessImplementationCompleteness.js`**: added `_isCompositionOnlyRouter(content)` (plus `MOUNT_CALL_RE`/`HANDLER_ROUTE_RE` module constants) — returns `false` immediately for missing content (safe default: files without supplied content remain eligible, preserving prior behavior for every existing inventory-only test fixture). In the `route_without_service_path` loop, `routeFiles` is filtered through a new `eligibleRouteFiles = routeFiles.filter(rf => !_isCompositionOnlyRouter(fileContentByPath.get(rf)))` (built from a `files`-derived `Map`) before either the `hints.hasServiceLayer` or the coverage-only branch runs. `routeServiceCoveragePercent`'s denominator changed from `routeFiles.length` to `eligibleRouteFiles.length`.
- **`routeServiceCoverage.routeFileCount`**: redefined from "all `categories.routes` files" to "route files eligible for route-to-service coverage" (excludes composition-only routers). Checked before changing: `routeFileCount` has no consumer outside this module and its own test file (`frontend/dashboard.html` only reads `routeServiceCoverage.coveragePercent`, confirmed by grep; `buildRepositoryArchitectureSnapshot.js`/its test suite never reference `routeFileCount` at all) — safe to redefine, not a breaking public-contract change. The metric and the signal now share the same eligible-file population, so a redefined-but-still-misleading 8/10 denominator never occurs.

#### Not Changed

- `PENALTY` weights, `_calcScore`, `architectureHealthScore` formula — untouched
- `routeServiceCoverage`'s `/(services?|execution)\//i` service-path matching — untouched
- `routeFilesWithServiceImportCount` computation logic itself (still edge-presence based) — untouched, just now iterates the filtered list
- NestJS/Fastify extraction and service-coverage evaluation — unaffected structurally: NestJS decorator syntax (`@Get()`) and Fastify's `fastify.route({...})` object form contain no generic `.use(` mount call, so `_isCompositionOnlyRouter` never returns `true` for them (verified by regression tests, not assumed)
- Mixed files (`.use(childRouter)` + `.get('/x', handler)` in the same file) — remain handler-owning, remain flagged when no service edge exists

#### Validation

- **New `describe('assessImplementationCompleteness — composition-router awareness')` block** (9 tests, A–I): `router.use(childRouter)`/`router.use('/', childRouter)`/`app.use('/api', childRouter)` (generic identifier, all three forms) all excluded from both the signal and the denominator; a handler-owning file with no service import remains flagged (denominator 1, coverage 0%); a handler-owning file with an `execution/` edge is covered (denominator 1, coverage 100%); a mixed file (`.use(...)` + `.get(...)`, no service edge) remains flagged; a `fooRoutes.js`-named file with neither `.use(` nor a handler call is **not** composition-only by filename alone; `.use(` text inside a comment does not suppress real handler detection; `.get(` text inside a comment does not turn a genuine composition router into a mixed one (both reuse the existing `_stripComments` helper, no new parser).
- **New `describe('assessImplementationCompleteness — repoId=80-shaped composition-router fixtures')` block** (3 tests): the exact `repoRoutes.js` and `portfolioRoutes.js` composition shapes from the live repository — both excluded; a child/domain route shape (`repoRiskRoutes.js`-style, with an `execution/` edge) is handler-owning, included, and covered.
- **New `describe('assessImplementationCompleteness — full completeness regression (2 composition + 8 handler-owning)')` block**: a 10-route-file fixture (2 composition-only + 8 handler-owning, all 8 with a service/execution edge, tests present, boundary healthy) — `routeServiceCoverage` is `{ routeFileCount: 8, routeFilesWithServiceImport: 8, coveragePercent: 100 }`, `route_without_service_path` absent, no other signals present.
- **New `describe('assessImplementationCompleteness — framework preservation (NestJS/Fastify unaffected)')` block**: a NestJS decorator-based controller and a `fastify.route({...})` registration are both evaluated exactly as before (neither contains a `.use(` mount call, so the composition-only exclusion never applies to them).
- All 97 pre-existing tests in this file re-run **unmodified** and pass — confirmed via source inspection before writing new tests that no existing fixture supplies a composition-only-shaped route file with content, and that inventory-only fixtures (no `files` entry) safely default to eligible.
- `npx jest tests/unit/execution/architecture/assessImplementationCompleteness.test.js --runInBand` → **1/1 suite passing, 112/112 tests passing** (97 pre-existing + 15 new)
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files) → **24/24 suites passing, 2363/2363 tests passing**
- `npx jest tests/unit/frontend/dashboardArchitectureTab.test.js --runInBand` → **1/1 suite passing, 32/32 tests passing** — confirms no frontend rendering depends on the redefined `routeFileCount` field
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7316/7386 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 110/115 suites, 7301/7371 tests — net +15 tests, no new suites)
- Coverage: `assessImplementationCompleteness.js` 92.39% statements / 91.31% branches / 100% functions / 100% lines

#### Expected repoId=80 Snapshot Impact (not regenerated in this step, per scope)

`backend/routes/repoRoutes.js` and `backend/routes/portfolioRoutes.js` match the composition-only shape exactly (verified against their real current content). On the next live refresh: `route_without_service_path` 2 → 0, `routeServiceCoverage` 80% (8/10) → 100% (8/8), `placeholder_code_hint` remains 0. Recalculating from the actual current formula rather than assuming a clean 100: with `route_without_service_path`'s 20-point penalty removed and the boundary-weak cross-penalty (8, assuming `boundaryHealthLevel` remains `weak`) still applying, total penalty drops from 28 to 8, so `completenessScore` 72 → 92 (not 100). `architectureHealthScore = 0.40×65 + 0.40×92 + 0.20×75 = 26 + 36.8 + 15 = 77.8 → 78` (assuming boundary=65 and linkage=75 remain stable).

---

### 2026-07-12 — Analyzer Improvement: Exclude Test Files from Implementation Placeholder/Scaffold Heuristics

**Capability:** Architecture Intelligence data-quality fix (`execution/architecture/assessImplementationCompleteness.js`) — confirmed root cause (investigated in the prior session turn) of why restoring test-file visibility only partially recovered `architectureHealthScore` (54 → 58, not the ~70 projected): live repoId=80 snapshot #201 showed `route_without_tests`/`service_without_tests` correctly dropped to zero, but a **new** `placeholder_code_hint` signal appeared, flagging exactly the 9 `tests/unit/frontend/*.test.js` files newly visible to the analyzer. All 9 use this repository's established verbatim-copy test convention (the pure function under test is copied directly into the test file, so there is no `require()`/`import` to satisfy `_isRichCode()`'s suppression) and legitimately contain `return null;` guard clauses or the word "placeholder" as UI/domain vocabulary — 100% test-file false positives, verified by direct inspection of all 9 files (zero `require`/`import` occurrences in any of them).
**Deliverable status:** Scanner-scope fix only — `PLACEHOLDER_PATTERNS`, `_hasPlaceholderHint`, `_isRichCode`, scaffold pattern logic/thresholds, `PENALTY` weights, the completeness/architecture scoring formulas, `route_without_service_path` logic, route/service test heuristics, `buildRepositoryStructureInventory.js`, `fetchRepositoryFiles.js`, `extractRouteApiStructure.js`, and `frontend/dashboard.html` are all untouched. Snapshot not regenerated in this step.

#### Confirmed Pre-Change Flow

Heuristic C (`placeholder_code_hint`) and Heuristic D (`scaffold_like_file`) both iterate `files.forEach(...)` directly. Heuristic C had `.md`/`.html` early-return guards only; Heuristic D had **no guard of any kind**. Neither had a test-file exclusion, and no test-file predicate existed anywhere in this module before this change (confirmed by inspection — the module has no local convention analogous to `extractRouteApiStructure.js`'s `_isTestFile`).

#### What Changed

- **`execution/architecture/assessImplementationCompleteness.js`**:
  1. Added `_isTestFile(path)` — the identical pattern shape already used in `extractRouteApiStructure.js` (`^(?:tests?|__tests__)\/`, nested `\/(?:tests?|__tests__)\/`, `\.(?:test|spec)\.[jt]sx?$`, case-insensitive, segment-boundary-anchored) — placed locally in this module, not extracted to a shared utility, per scope.
  2. Heuristic C: added `if (_isTestFile(f.path)) return;` alongside the existing `.md`/`.html` guards, before `_hasPlaceholderHint(f.content)` is called.
  3. Heuristic D: added `if (_isTestFile(f.path)) return;` as the first line of the `forEach` callback, before `_isScaffoldLike(...)` is called — defensive consistency, since snapshot #201 currently shows `scaffold_like_file: 0` (not yet proven to be firing), but this heuristic scans the identical newly-visible file set with the same missing-guard shape.

#### Not Changed

- `PLACEHOLDER_PATTERNS`, `_hasPlaceholderHint`, `_isRichCode`, `_isStaticJsxOnly`/`_isStaticJsonRoute`/`_isConsoleLogOnlyHandler`, scaffold thresholds — zero lines touched; this is scanner scope, not pattern semantics
- `PENALTY` weights, `_calcScore`, `architectureHealthScore` formula, `route_without_service_path` logic, `routeWithoutTests`/`serviceWithoutTests` logic — untouched
- `buildRepositoryStructureInventory.js`, `fetchRepositoryFiles.js`, `extractRouteApiStructure.js`, route files, service files, execution business modules, `frontend/dashboard.html` — untouched

#### Validation

- **New `describe('assessImplementationCompleteness — placeholder_code_hint excludes test files')` block** (9 tests, A–I): `.test.js` fixture with `return null`/placeholder/dummy/mock-data text and zero require/import → no signal; `.spec.ts` variant excluded; `__tests__/renderer.js` (plain basename, no `.test`/`.spec`) excluded; nested `packages/web/tests/fixture.js` excluded; a representative reproduction of the actual snapshot #201 shape (verbatim-copy dashboard test with `return null;` guards) produces no signal; a real production stub (`frontend/renderDashboard.js`, object-literal arrow-stub form so it isn't independently suppressed by `_isRichCode`'s named-function-declaration rule) is still flagged; the three false-positive-substring path controls (`contest`/`latest`/`testimonials`) remain scanned; `.md` and `.html` exclusions re-verified unchanged.
- **New `describe('assessImplementationCompleteness — scaffold_like_file excludes test files')` block** (5 tests, A–E): `.test.jsx` static-JSX fixture excluded; `.spec.ts` static-JSON-route fixture excluded; bare `tests/` directory file excluded; a genuine production component (`src/components/Empty.jsx`) remains counted (regression); a `frontend/latest/Widget.jsx` false-positive-substring control remains eligible.
- **New combined end-to-end `describe` block**: wires the real `buildRepositoryStructureInventory` into `assessImplementationCompleteness` with a real route+service+test-file fixture (`hasTests: true` confirmed), a test file with placeholder-pattern content, a test file with scaffold-pattern content, a genuine production placeholder file, and a genuine production scaffold-like file — proves `route_without_tests`/`service_without_tests` stay absent, test-file placeholder/scaffold content is excluded, and production placeholder/scaffold content is still flagged, all in one real pipeline run.
- **Step #9 and Step #12 false-positive-suppression tests re-run unmodified** — exported pure functions with `return []`/`return null` remain suppressed, Markdown/HTML exclusions remain unchanged, real JavaScript stubs remain flagged. Not rewritten.
- `npx jest tests/unit/execution/architecture/assessImplementationCompleteness.test.js --runInBand` → **1/1 suite passing, 97/97 tests passing** (80 pre-existing + 17 new)
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files) → **24/24 suites passing, 2348/2348 tests passing**
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7301/7371 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 110/115 suites, 7284/7354 tests — net +17 tests, no new suites)
- Coverage: `assessImplementationCompleteness.js` 91.57% statements / 90.78% branches / 100% functions / 100% lines

#### Expected repoId=80 Snapshot Impact (not regenerated in this step, per scope)

Test files remain fully visible to structure inventory and `architectureHints.hasTests` (unaffected by this change — that fix already landed and is confirmed working). Only the newly-visible test files' *content* is now excluded from placeholder/scaffold evidence. Per the prior turn's quantification: `placeholder_code_hint` should drop from 9 → 0 on the next live refresh (removing its 30-point capped penalty), while `route_without_service_path` (2, a separate confirmed composition-router false positive — not addressed in this step) remains. Projected: `completenessScore` 42 → 72 (penalty 58 → 28: `route_without_service_path` 20 + boundary-weak cross-penalty 8), and `architectureHealthScore` 58 → 70 (`0.40×65 + 0.40×72 + 0.20×75 = 26 + 28.8 + 15 = 69.8 → 70`, assuming boundary/linkage stay stable). The `route_without_service_path` composition-router false positive (`backend/routes/repoRoutes.js`, `backend/routes/portfolioRoutes.js`) remains open, identified as the next candidate fix.

---

### 2026-07-11 — Analyzer Improvement: Restore Test-File Visibility Without Scanning Test Fixtures as Architecture

**Capability:** Architecture Intelligence data-quality fix — confirmed root cause (investigated in the prior session turn) of `route_without_tests: 10` and `service_without_tests: 5` in live repoId=80 snapshot #195, despite the repository having real, dedicated test coverage for every one of those files: `fetchRepositoryFiles.js` excluded every test-file-shaped path from the GitHub fetch entirely, so `inventory.categories.tests` was structurally always empty and `architectureHints.hasTests` was structurally always `false` for any repo this analyzer ever processed — a systemic, always-on false positive, not specific to repo_id=80's recent refactors.
**Deliverable status:** Ingestion/extraction fix only — `assessImplementationCompleteness.js`'s heuristic design, PENALTY weights, architecture scoring formulas, `buildRepositoryStructureInventory.js`'s category rules, `linkFrontendBackendApis.js`, backend routes, services, execution business modules, and `frontend/dashboard.html` are all untouched. Snapshot not regenerated in this step.

#### Confirmed Pre-Change Flow

`fetchRepositoryFiles.js` filtered `!_isTestFile(item.path)` before the `MAX_FILES` slice — test files never reached any consumer, including `buildRepositoryStructureInventory.js` (whose `categories.tests` classifier, and `_extractRequireAssignments`-style conventions, were already correct and unused for lack of input) and `assessImplementationCompleteness.js` (whose `route_without_tests`/`service_without_tests` signals are a single repo-wide `hints.hasTests` boolean, not a per-file matcher — confirmed by direct source inspection, not assumed). `extractRouteApiStructure.js` had no test-file guard of its own — only the `.md`/`.mdx` documentation guard added last turn — so simply removing the fetch-time exclusion without adding a replacement would have reintroduced the exact false-positive class (test fixture strings like `"app.get('/api/foo', handler)"` or `"fetch('/api/ghost')"` scanned as real routes/calls) that the original exclusion existed to prevent.

#### What Changed

- **`execution/github/fetchRepositoryFiles.js`**: removed the `.filter(item => !_isTestFile(item.path))` eligibility filter (Stage 2), and deleted `_isTestFile`/`TEST_FILE_PATTERNS` along with their comment block — confirmed via full-file grep that this filter was their only caller anywhere in the codebase, so nothing else needed preserving. Test files now flow through the same `MAX_FILES` slice and content-fetch pipeline as every other supported file — no second/separate fetch pass was introduced.
- **`execution/architecture/extractRouteApiStructure.js`**: added `_isTestFile(path)` — a segment-boundary-anchored, case-insensitive predicate recognizing `^(?:tests?|__tests__)\/`, nested `\/(?:tests?|__tests__)\/` anywhere in the path (a strict superset of the old fetcher's patterns, which only recognized nested `__tests__`, not nested `tests`/`test`), and `\.(?:test|spec)\.[jt]sx?$`. Segment-boundary anchoring means a directory merely *containing* the substring "test" — `backend/contest/routes.js`, `frontend/latest/dashboard.js`, `services/testimonials/send.js` — is never misclassified. In the main extraction loop, replaced the single `isDocumentation`-only gate with three booleans per file — `isDocumentation`, `isTestFile`, `isArchitectureSource = !isDocumentation && !isTestFile` — and gated Express/Fastify extraction, NestJS extraction, and frontend/BFF API-call extraction on `isArchitectureSource` (one shared condition, not a duplicated regex around each extractor). Next.js route extraction (`_extractNextRoutes`) was left ungated: `_nextUrlFromPath`'s anchored regexes only allow an optional `apps|packages|services|libs` workspace-root segment before `app/api/`, and `pages/api/` must appear at the very start — a test-marked prefix (`tests/`, `apps/web/__tests__/`) structurally cannot satisfy either anchor, proven by dedicated regression tests rather than assumed.

#### Extraction Blocks Now Gated

| Extraction | Gate |
|---|---|
| Express/Fastify routes | `isArchitectureSource` (documentation OR test file → skipped) |
| NestJS routes | `isArchitectureSource` |
| Frontend/BFF API calls | `isArchitectureSource` |
| Next.js routes | Ungated — structurally cannot match a test-marked path (verified) |

#### Not Changed

- `FETCH_*`/`BFF_*`/Express/NestJS/Next.js regexes, nested router mount resolution, path normalization, `linkFrontendBackendApis.js` matching rules — zero lines touched
- `assessImplementationCompleteness.js` heuristic design, `PENALTY` weights, `architectureHealthScore` formula, `buildRepositoryStructureInventory.js` category rules (proven correct by the new end-to-end test, not modified) — untouched
- `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs`/`.html` production extraction — unaffected when not under a test path (verified)
- Secret-file (`.env`/`.pem`/`.key`/credentials/secrets) and unsupported-extension filtering in `fetchRepositoryFiles.js` — unaffected, re-verified

#### Validation

- **`tests/unit/execution/github/fetchRepositoryFiles.test.js`**: the "test file exclusion" describe block was rewritten to "test file inclusion" (assertions flipped — test files are now returned, not filtered), including new coverage for `.spec.js`, `__tests__/`, secret-file filtering still applying to test-shaped paths, unsupported-extension filtering still applying under `tests/`, and test files sharing the same `MAX_FILES` eligibility pool as production files (no second fetch pass). The "regression: test fixture paths excluded from architecture" block was updated to assert the fixture file *is* now fetched but its content still contributes no `unresolvedApiCalls`/`frontendApiCalls` once it reaches the (updated) extractor.
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`**: new `describe('extractRouteApiStructure — test-file exclusion from architecture extraction')` block (15 tests): `.test.js` fixture with Express+fetch+BFF strings → zero routes/calls; `.spec.ts` fixture with NestJS decorators → zero NestJS routes; bare `tests/`/`test/`/`__tests__/` directory files excluded even without a `.test`/`.spec` basename; nested `packages/web/tests/fixture.js` excluded; the three false-positive-substring paths (`contest`/`latest`/`testimonials`) remain fully scanned; a real production route file survives alongside an ignored co-located test-fixture file; `.html` production extraction unaffected; `.md`/`.mdx` documentation exclusion unaffected by the new guard; three Next.js interaction tests proving `tests/app/api/users/route.ts` and `apps/web/__tests__/app/api/users/route.ts` never become routes while the equivalent real (non-test) path still does.
- **`tests/unit/execution/architecture/assessImplementationCompleteness.test.js`**: new end-to-end describe block wiring the *real* `buildRepositoryStructureInventory` into `assessImplementationCompleteness` (not the hand-crafted `makeInventory` fixture used elsewhere in this file) — proves `categories.routes`/`categories.services`/`categories.tests` and `hasTests` all populate correctly from real file paths, and that `route_without_tests`/`service_without_tests` are then absent; plus a negative control (no test files anywhere) proving both signals still fire at their real counts for genuinely untested repos. Explicitly scoped as validating the current repo-wide `hasTests` boolean only — no per-file production-to-test matcher exists or was added.
- `npx jest tests/unit/execution/github/fetchRepositoryFiles.test.js tests/unit/execution/architecture/extractRouteApiStructure.test.js tests/unit/execution/architecture/buildRepositoryStructureInventory.test.js tests/unit/execution/architecture/assessImplementationCompleteness.test.js --runInBand` → **4/4 suites passing, 551/551 tests passing**
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files) → **24/24 suites passing, 2331/2331 tests passing**
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7284/7354 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 110/115 suites, 7262/7332 tests — net +22 tests, no new suites)
- Coverage: `extractRouteApiStructure.js` 91.02% stmts / 81.05% branches; `fetchRepositoryFiles.js` 94.35% stmts / 87.14% branches; `buildRepositoryStructureInventory.js` 100% stmts / 98.6% branches; `assessImplementationCompleteness.js` 91.3% stmts / 90.94% branches (uncovered lines are pre-existing defensive branches unrelated to this change)

#### Expected repoId=80 Snapshot Impact (not regenerated in this step, per scope)

Since repo_id=80 genuinely has dedicated tests for every one of the 10 route files and 5 service files flagged in snapshot #195 (confirmed by direct filesystem inspection in the prior investigation), the next live refresh should see `inventory.categories.tests` populate with real entries and `architectureHints.hasTests` flip to `true`, dropping `route_without_tests` and `service_without_tests` from `implementationCompleteness.signals` entirely (their combined 40-point penalty removed). Per the prior turn's quantification, this alone would move `completenessScore` from 32 toward ~72 and `architectureHealthScore` from 54 toward ~70 — `route_without_service_path` (2 files) and the boundary-level cross-penalty remain independent, unaffected contributors. This heuristic remains repo-wide (not per-file), so it does not newly distinguish composition routers from handler-owning routers, or genuinely-untested files from tested ones within a repo that has *some* tests — that precision gap remains open, out of scope for this step.

---

### 2026-07-11 — Analyzer Improvement: Exclude Documentation from Frontend/BFF API-Call Extraction

**Capability:** Architecture Intelligence data-quality fix (`execution/architecture/extractRouteApiStructure.js`) — confirmed root cause of all 6 `unresolvedFrontendCalls` in live repoId=80 snapshot #194 (investigated in the prior session turn): `_extractFrontendCalls` ran unconditionally on every fetched file, including Markdown, while only backend-route extraction had a (`.md`-only, backend-route-scoped) guard. PROGRESS.md's own "Example Extracted Calls" table (documenting `serverFetch`/`apiFetch`/`internalFetch`/`backendFetch` support) was parsed as 9 real frontend calls, 6 of which stayed unresolved and 2 of which coincidentally matched real routes as false-positive links.
**Deliverable status:** Analyzer-only bug fix — extraction input filtering only; no backend route files, routes, scoring formulas, `linkFrontendBackendApis.js`, or `frontend/dashboard.html` changed. Snapshot not regenerated in this step.

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. Added `_isDocumentationFile(path)` — a single small predicate (`/\.mdx?$/i.test(path)`), case-insensitive, extension-only. Deliberately narrow per scope: no repository category metadata, no docs-directory classification (unlike `buildImportDependencyGraph.js`'s broader `_isDocumentationFile`), no HTML exclusion, no new shared module — placed directly in this file next to the existing path-normalization helpers.
  2. In `extractRouteApiStructure`'s main per-file loop, replaced the old `if (!f.path.endsWith('.md'))` guard (which wrapped only `_extractExpressRoutes`/`_extractNestRoutes`) with `if (!_isDocumentationFile(f.path))`, and moved `_extractFrontendCalls` *inside* that same guard. All three extraction calls — Express/Fastify route extraction, NestJS route extraction, and frontend/BFF API-call extraction — are now gated by one consistent predicate that also covers `.mdx` (previously unguarded for backend routes too).
  3. Next.js route extraction (`_extractNextRoutes`) was left ungated, unchanged — it's driven entirely by file-path pattern matching (`app/api/**/route.*`, `pages/api/**`), which a `.md`/`.mdx` path can never satisfy, so gating it would be a no-op; adding an unnecessary check there was avoided per requirement 4's "unless clearly required for consistency."

#### Extraction Blocks Now Gated by `_isDocumentationFile`

| Extraction | Before | After |
|---|---|---|
| Express/Fastify routes (`_extractExpressRoutes`) | Guarded by `.md`-only check | Guarded by `_isDocumentationFile` (`.md` + `.mdx`) |
| NestJS routes (`_extractNestRoutes`) | Guarded by the same `.md`-only check | Guarded by `_isDocumentationFile` |
| Frontend/BFF API calls (`_extractFrontendCalls`) | **Unguarded — ran on every file** | Guarded by `_isDocumentationFile` |
| Next.js routes (`_extractNextRoutes`) | Unguarded | Unguarded (no-op guard would be redundant — path-pattern-driven) |

#### Not Changed

- `FETCH_*`/`BFF_*`/`AXIOS_*`/`CLIENT_REQ_*` regexes, `_extractFrontendCalls`'s internal normalization (`_normRoutePath`, `_normTemplateParams`, concat-path handling) — zero lines touched
- `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs` frontend-call extraction — unaffected; `.html` — unaffected and still fully scanned (verified: a real `fetch()` call in an `.html` file still extracts and still links via the unmodified `linkFrontendBackendApis.js`)
- `execution/architecture/linkFrontendBackendApis.js`, `execution/architecture/assessImplementationCompleteness.js`, architecture scoring formulas, backend route files, `frontend/dashboard.html` — none touched
- Mount-prefix resolution (prior turn's fix) — untouched, still in place

#### Validation

- **New `describe('extractRouteApiStructure — documentation exclusion from frontend/BFF API-call extraction')` block** (11 tests) in `tests/unit/execution/architecture/extractRouteApiStructure.test.js` (246 → 257 tests): A (`.md` file with all 6 call forms — `fetch`/`axios`/`serverFetch`/`apiFetch`/`internalFetch`/`backendFetch` — produces zero `frontendApiCalls`), B (same for `.mdx`), C (a verbatim reproduction of PROGRESS.md's actual "Example Extracted Calls" table plus the 3-segment-concatenation caveat sentence — the exact fixture that caused the live regression — contributes zero `frontendApiCalls` and zero `unresolvedApiCalls`, checked against all 7 previously-false paths including the partial-match `/api/:_p` artifact), D (parameterized across `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs` — identical call syntax still extracts all 6 calls correctly in real code files), E (a real `.html` `fetch()` call still extracts and still links end-to-end through the unmodified `linkFrontendBackendApis`), F (the pre-existing Markdown backend-route exclusion behavior — now proven for both `.md` and `.mdx` — still produces zero `backendRoutes` for Express/NestJS-looking documentation examples).
- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js --runInBand` → **1/1 suite passing, 257/257 tests passing** (all 246 pre-existing tests pass unchanged)
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files) → **24/24 suites passing, 2314/2314 tests passing** — no regression in any downstream consumer
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7262/7332 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 110/115 suites, 7251/7321 tests — net +11 tests, no new suites)
- `extractRouteApiStructure.js` coverage: 90.93% statements / 81.11% branches / 100% functions / 93.77% lines (uncovered lines are pre-existing defensive branches unrelated to this change)

#### Expected repoId=80 Snapshot Impact (not regenerated in this step, per scope)

All 6 of snapshot #194's `unresolvedFrontendCalls` (`GET /api/:_p`, `POST /api/repos`, `GET /api/repos/:param`, `PATCH /api/x`, `GET /api/y`, `GET /api/z`) originated from PROGRESS.md and should disappear entirely on the next live refresh, since `PROGRESS.md` will now contribute zero entries to `frontendApiCalls`. The two coincidental false-positive links identified in the same investigation (`GET /api/repos`, `GET /api/repos/:id/metrics`-shaped) should also no longer be inflated by documentation-derived calls (the *real* dashboard.html calls to those same paths remain and continue to link correctly). `implementationCompleteness`'s `unresolvedFrontendApi` penalty (36/36, capped, in snapshot #194) should drop to 0/36 for this cause specifically — per the same investigation's analysis, this alone will not raise `architectureHealthScore` to "healthy," since `routeWithoutServicePath`, `routeWithoutTests`, `serviceWithoutTests`, and the boundary-level cross-penalty remain independent, non-documentation-related contributors. Per instructions, repoId=80's live snapshot was not regenerated as part of this change.

---

### 2026-07-11 — Analyzer Improvement: Nested Express Router Mount Prefix Resolution

**Capability:** Architecture Intelligence data-quality fix (`execution/architecture/extractRouteApiStructure.js`) — confirmed live regression found during the post-Coupling-Refinement repoId=80 snapshot validation: after `repoRoutes.js`/`portfolioRoutes.js` were split into composition routers (Coupling Refinements #2–#3), routes defined in the *child* domain routers lost their real `/api/repos`/`/api/portfolio` public prefixes, driving `apiLinkage.linkageScore` from 77→43 and `implementationCompleteness.completenessScore` from 52→0 in that validation run.
**Deliverable status:** Analyzer-only bug fix — route extraction accuracy; no backend route files, `server.js`, route composition, API paths, `linkFrontendBackendApis.js`, `assessImplementationCompleteness.js`, scoring formulas, or `frontend/dashboard.html` changed.

#### Root Cause (inspected before modifying)

The pre-existing pipeline had three relevant pieces:
1. **`app.use('/prefix', routerVar)` detection** — `USE_RE` (a regex requiring a literal quoted path *and* a bare identifier) captured these into a flat `routeHandlers` list per file. This only ever matched the two-argument form.
2. **`router.use(...)` composition detection** — did not exist for the single-argument form at all. `router.use(childRoutes)` (no path argument) was syntactically invisible to `USE_RE`, so `portfolioRoutes.js`'s `router.use(portfolioArchitectureRoutes)` / `router.use(portfolioGovernanceRoutes)` produced zero `routeHandlers` entries.
3. **Router-variable → file association** — `_extractRequireAssignments`/`_resolveRequirePath` already correctly traced `const X = require('./path')` per file (reused unchanged in this fix).
4. **Where prefixes were applied** — `_buildMountPrefixMap` built a **flat, one-hop** `Map<childFile, mountPrefix>`: for each `routeHandlers` entry, it resolved the identifier to a file and recorded *only that one hop's* prefix, with no propagation through further mounts. Since `repoRoutes.js`/`portfolioRoutes.js` (the composition routers) contain **no route definitions of their own** after the split, the `/api/repos`/`/api/portfolio` prefix captured from `server.js`'s `app.use(...)` was associated with a file that has zero routes — a dead map entry — while the child files holding the real routes (`repoCoreRoutes.js`, etc.) only ever received the *local* prefix from whichever router mounted them directly (e.g. `'/'` from `repoRoutes.js`'s own `router.use('/', repoCoreRoutes)`), never the outer `/api/repos`. Applying `_joinRoutePaths('/', '/summary')` (prefix `'/'` + route path `'/summary'`) also had its own bug — naive `prefix + routerPath` string concatenation produced `'//summary'` rather than collapsing the redundant slash.

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. Added `USE_NO_PREFIX_RE` — a second mount regex recognizing the omitted-prefix composition form `router.use(childRoutes)` / `app.use(childRoutes)` (single bare-identifier argument, immediately closed by `)`, so it can never match the two-argument form or a call expression like `express.json()`/`cors()`). Wired into `_extractExpressRoutes` to push a `{ file, mountPath: '/', routerName }` entry into the same raw, unfiltered `handlers` array as the existing two-argument form — `routeHandlers`'s existing contract (a raw syntactic capture, independent of whether the identifier resolves to anything) is unchanged.
  2. Replaced `_buildMountPrefixMap` (flat one-hop map) with **`_buildMountEdges`**, which builds mount-graph *edges* `{ parentFile, childFile, prefix }`. An edge is only kept when the resolved child file is among the analyzed files **and** the analyzer already found routes or further `use()` mounts in it (checked via membership in the already-computed `backendRoutes`/`routeHandlers`, not a new content- or filename-based heuristic) — this is what distinguishes `router.use(childRoutes)` (composition) from `router.use(authenticate)` / `app.use(express.json())` (ordinary middleware, which extract zero routes/handlers and therefore never qualify).
  3. Added **`_groupIncomingEdges`** (index edges by child file) and **`_resolveEffectivePrefixes(file, incomingByFile, visiting)`** — a backward DFS that walks from a file to every root (a file with no incoming mount edge) through the mount graph, returning the *set* of effective prefixes that file is reachable at. Supports arbitrary transitive depth (no hard-coded 2/3-hop limit — bounded only by cycle protection) and multiple distinct mounts of the same file (e.g. `/v1` and `/v2` both preserved, not collapsed). `visiting` is a per-resolution-path set: encountering a file already on the current path (a mount cycle, e.g. `aRoutes.js` ↔ `bRoutes.js`) stops that branch immediately rather than recursing — guarantees termination without throwing or emitting infinite duplicate routes.
  4. Replaced the buggy `_joinRoutePaths` (naive two-string concatenation) with **`_joinPrefixSegments(...segments)`** — trims each segment's leading/trailing slashes and joins the non-empty atoms with exactly one leading slash (generalizes the existing `_joinNestPath` trim-and-join convention from N=2 to N=arbitrary segments) — and **`_combinePrefix(parentPrefix, hopPrefix)`**, which canonicalizes the bare-root result back to `''` so `''` consistently means "no prefix" throughout resolution.
  5. In `extractRouteApiStructure`'s main body, `backendRoutes` changed from `const` to `let` (now reassigned, not mutated in place) because a single route definition can now **expand into more than one output route** when its containing file is reachable via more than one distinct effective prefix (requirement 9's `/v1`+`/v2` case). The expansion loop computes `_resolveEffectivePrefixes` per route's file, joins each returned prefix with the route's own relative path, and deduplicates on `(method, finalPath, file)` identity so a route reached twice via equivalent paths isn't double-emitted, while genuinely distinct prefixes both survive. This slots into the exact same pipeline position as the code it replaced — after Express/Fastify/NestJS extraction, before the NestJS-global-prefix step and before Next.js App Router routes are merged into `backendRoutes` — so neither of those is affected by this change (verified by the full existing regression suite, unchanged).

#### Supported Nested-Mount Patterns

| Pattern | Example | Resolves to |
|---|---|---|
| Direct mount (unchanged) | `app.use('/api/auth', authRoutes)` → `router.get('/github', ...)` | `GET /api/auth/github` |
| Two-hop, explicit child prefix | `server.js →(/api/repos)→ repoRoutes.js →(/)→ repoCoreRoutes.js` → `router.get('/summary', ...)` | `GET /api/repos/summary` |
| Two-hop, omitted child prefix | `server.js →(/api/portfolio)→ portfolioRoutes.js →(none)→ portfolioArchitectureRoutes.js` → `router.get('/architecture', ...)` | `GET /api/portfolio/architecture` |
| Three-hop | `app →(/api)→ apiRouter →(/repos)→ repoRouter →(/risk)→ riskRouter` → `router.get('/:id', ...)` | `GET /api/repos/risk/:id` |
| N-hop (arbitrary depth) | any further chain | resolved via the same recursive traversal, no depth cap |
| Same router, multiple prefixes | `app.use('/v1', apiRoutes); app.use('/v2', apiRoutes);` | both `GET /v1/x` and `GET /v2/x` retained |
| Mount cycle | `aRoutes.js ↔ bRoutes.js` (mutual `router.use`) | terminates safely; each file's own routes still extracted once, with a safe root-prefix fallback for the cut cycle edge |

#### Cycle Protection

Per-resolution-path `visiting` `Set` passed through the recursive `_resolveEffectivePrefixes` calls (not a global "ever visited" set, so unrelated diamond-shaped mount graphs aren't over-pruned). A file already in the current path's `visiting` set contributes an empty prefix-set for that branch; if *all* of a file's parent branches are cut this way, it falls back to `''` (root/no-prefix) rather than an empty result — bounded recursion depth (at most the total file count), so termination is guaranteed with no `RangeError`/infinite loop and no unbounded route duplication.

#### Deduplication Identity

`method + ':' + finalPath + ':' + file` (HTTP method, normalized effective path, source file) — matches requirement 9 exactly: a route reached via two *different* effective prefixes (the `/v1`/`/v2` case) produces two distinct identities and both survive; the same `(method, path, file)` reached redundantly through equivalent graph paths collapses to one.

#### Before/After Examples

```
server.js:            app.use('/api/repos', repoRoutes)
repoRoutes.js:         router.use('/', repoCoreRoutes)
repoCoreRoutes.js:     router.get('/summary', ...)  router.get('/:id/metrics', ...)

BEFORE:  GET /summary            GET /:id/metrics
AFTER:   GET /api/repos/summary  GET /api/repos/:id/metrics
```
```
server.js:              app.use('/api/portfolio', portfolioRoutes)
portfolioRoutes.js:      router.use(portfolioArchitectureRoutes)   // omitted prefix
portfolioArchitectureRoutes.js: router.get('/architecture', ...)  router.get('/watchlists', ...)

BEFORE:  GET /architecture            GET /watchlists
AFTER:   GET /api/portfolio/architecture  GET /api/portfolio/watchlists
```

#### Not Changed

- Backend route files (`repoCoreRoutes.js`, `portfolioArchitectureRoutes.js`, etc.), `backend/server.js`, route composition, actual API paths — zero lines touched in any of these; this is a read-only analyzer fix
- `execution/architecture/linkFrontendBackendApis.js`, `execution/architecture/assessImplementationCompleteness.js` — not modified; two new tests (K, L below) exercise `linkFrontendBackendApis` as an unmodified downstream consumer to prove the fix flows through to real linkage, following the established precedent already used by the Step #5/#8 App Router linkage tests in this same test file
- `frontend/dashboard.html`, architecture scoring formulas — untouched
- NestJS `app.setGlobalPrefix(...)` handling, Next.js App Router path-from-file-location handling — both apply at a later pipeline stage, after this fix's expansion step, exactly as before

#### Validation

- **New `describe('extractRouteApiStructure — nested router mount-prefix resolution')` block** (13 tests) in `tests/unit/execution/architecture/extractRouteApiStructure.test.js` (233 → 246 tests): A (repoRoutes composition inherits `/api/repos`), B (portfolioRoutes composition inherits `/api/portfolio`), C (omitted-prefix `router.use(childRoutes)` equals `router.use('/', childRoutes)` byte-for-byte), D (explicit child prefix `/risk`), E (three-hop chain resolves the full transitive prefix, no depth cap), F (direct-mount regression: `app.use('/api/auth', authRoutes)` unaffected), G (`router.use(authenticate)`/`app.use(express.json())` never treated as mounts — `authenticate.js` never appears as a `backendRoutes` file), H (mutual `aRoutes.js`↔`bRoutes.js` cycle terminates without throwing, each route extracted exactly once), I (same router at `/v1` and `/v2` — both route sets retained, `filter().toHaveLength(2)`), J (no `//` in any resolved path at any composition depth), K (a template-literal frontend call to a nested child-router route links via the real, unmodified `linkFrontendBackendApis` — the `unresolvedFrontendCalls` false-negative found live is now resolved), L (the exact false-positive found live — `GET /api/repos/summary` no longer accidentally exact-links to `fetch('/summary')` — confirmed the legacy `/summary` link only ever carries `server.js`'s own route), and a **repoId=80-shaped fixture** (requirement 11) reproducing the real 5-file repo/portfolio composition at its actual route counts (7+9+3+6+6=31) proving `backendRoutes.length` is unchanged by nested resolution — only each route's effective path is corrected, with every one of the 31 correctly prefixed.
- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js --runInBand` → **1/1 suite passing, 246/246 tests passing** (all 233 pre-existing tests pass unchanged, including every existing one-hop "mount prefix resolution" test)
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files, including `buildRepositoryArchitectureSnapshot.test.js`, `assessImplementationCompleteness.test.js`, `verifyArchitectureBoundaries.test.js`, and `linkFrontendBackendApis.test.js` — every downstream consumer of `routeApiStructure`/`backendRoutes`) → **24/24 suites passing, 2290/2290 tests passing** — no regression in any consumer
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7251/7321 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 110/115 suites, 7238/7308 tests — net +13 tests, no new suites, from the new nested-mount-resolution test block)
- `extractRouteApiStructure.js` coverage: 90.92% statements / 81.26% branches / 100% functions / 93.76% lines (uncovered lines are pre-existing defensive branches unrelated to this change)

#### Expected repoId=80 Snapshot Impact (not regenerated in this step, per scope)

Based on the live validation findings this fix directly targets: `apiLinkage.linkageScore` and `implementationCompleteness.completenessScore` should recover substantially toward (or above) the pre-split 77/52 baseline, since the 36-of-39 `orphanedBackendRoutes` entries that were real routes with lost prefixes (`repoCoreRoutes.js`, `repoRiskRoutes.js`, `repoArchitectureRoutes.js`, `portfolioArchitectureRoutes.js`, `portfolioGovernanceRoutes.js`, `legacySummaryRoutes.js`) should now resolve to their correct `/api/repos`/`/api/portfolio`/root prefixes and match the real frontend calls that were already correctly extracted. The one confirmed false-positive link (`repoCoreRoutes.js`'s `/api/repos/summary` incorrectly exact-linking to the unrelated legacy `fetch('/summary')` call) is also directly fixed (test L). This fix does **not** address the separate, still-open finding from that same validation — `PROGRESS.md` prose being misread as real frontend `fetch()` calls by this module's own frontend-call extractor (9 of that run's 22 `unresolvedFrontendCalls`) — which remains a candidate follow-up, out of scope for this step. Per instructions, repoId=80's live snapshot was not regenerated as part of this change; the next architecture-coupling-validation pass should confirm these figures directly.

---

### 2026-07-11 — Coupling Refinement #4: Exclude Documentation from Dependency Extraction

**Capability:** Architecture Intelligence data-quality fix (`execution/architecture/buildImportDependencyGraph.js`) — confirmed issue, not part of the original three coupling-review refactoring opportunities: `buildImportDependencyGraph` was scanning Markdown/documentation content as executable source, so `require(...)`/`import ...` syntax appearing as illustrative code samples inside README/PROGRESS.md/CLAUDE.md-style files was parsed as real dependency edges and unresolved imports.
**Deliverable status:** Bug fix / analyzer accuracy improvement — extraction only; route extraction, API linkage, architecture scoring formulas, and dependency resolution for real source files are untouched.

#### What Changed

- **`execution/architecture/buildImportDependencyGraph.js`**:
  1. Added `DOC_EXTENSIONS = new Set(['.md', '.mdx'])` and `CODE_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])` constants.
  2. Added `_extname(path)` and `_isDocumentationFile(path, category)` helpers, placed directly after the existing `_category(path)` classifier. A file is documentation when its extension is `.md`/`.mdx` (requirement minimum), **or** when the repository's own pre-existing category convention already classifies it `'docs'` (e.g. any non-code file under a `docs/` folder — `_category` already treats `^docs/` as documentation regardless of extension) **and** its extension is not one of `CODE_EXTENSIONS`. The `CODE_EXTENSIONS` guard is unconditional — a `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs` file is never treated as documentation even if it physically lives under a `docs/` folder, so requirement 5 ("preserve import extraction for these six extensions") holds in all cases, not just the common one.
  3. In the main `-- Parse imports --` loop inside `buildImportDependencyGraph()`, added a single guard: `if (_isDocumentationFile(f.path, catMap.get(f.path))) continue;` before `_extractImports(f.content)` is called. This is the only control-flow change — the node-building, resolution, boundary-hint, cycle-detection, and coupling-metrics logic below it are untouched.
- No changes to `_extractImports`, `_resolve`, `_category`, `_stripComments`, `IMPORT_PATTERNS`, `SUPPORTED_EXTENSIONS`, `_findCycles`, `_buildBoundaryHints`, or `_buildSummary` — every other code path in the file is byte-for-byte unchanged.

#### Node-Retention Decision (requirement 3)

**Chosen behavior: retain documentation files as graph nodes with zero outbound edges and zero unresolved imports, rather than removing them from `nodes` entirely.**

Before deciding, both downstream consumers of `dependencyGraph.nodes` were located and inspected:
- `execution/architecture/assessImplementationCompleteness.js` (`_hasStructure`, line ~136) — ORs `nodes.length > 0` together with category/hint/route signals to decide whether *any* architectural structure was detected at all.
- `execution/architecture/verifyArchitectureBoundaries.js` (`hasStructure`, line ~376) — the same pattern, ORing `dependencyGraph.nodes.length > 0` with several other structural-presence signals.

Both treat a non-empty `nodes` array as one of several independent "this repository has *some* structure" signals. Fully removing documentation files from `nodes` would change this signal specifically for the edge case of a repository (or file subset) containing only documentation and no other structural evidence — a real, if narrow, behavior change to two modules explicitly out of scope for this task ("do not change architecture scoring formulas"). Retaining doc nodes with `outboundCount: 0` and no `unresolvedImports` entries satisfies every other part of the preferred contract (no fake edges, no fake unresolved imports, no doc paths in `highFanOutFiles`) while leaving `nodes.length` semantics exactly as they were, per the task's explicit fallback instruction ("retain them with zero outbound edges only if tests or downstream consumers require it").

One consequence of retention, verified as correct rather than incidental: a *real* source file that legitimately `require()`s a documentation file (e.g. `require('./README.md')` to load raw text) still resolves to an edge — the doc file remains in `fileSet` and is a valid resolution target. Only a documentation file's own content is excluded from being *parsed* for outbound imports.

#### Not Changed

- Repository file fetching, route extraction (`extractRouteApiStructure.js`), API linkage extraction (`linkFrontendBackendApis.js`), architecture scoring formulas (`scoreEngineeringGovernance.js`, `assessImplementationCompleteness.js`, `verifyArchitectureBoundaries.js`) — zero lines touched in any of these files
- Dependency resolution for real source files — `_resolve()` is unmodified; a `.js`/`.ts`/etc. file's imports resolve exactly as before, including when the import target happens to be a documentation file
- `.json`, `.yml`/`.yaml`, `.sql`, `.html` — none of these extensions are touched by `_isDocumentationFile`; the only way a non-`.md`/`.mdx` file is excluded is via the pre-existing `'docs'` category (i.e. living under a `docs/` folder) combined with not having a code extension — this is scoped narrowly to the existing documentation convention, not a blanket exclusion of these file types anywhere in a repository
- `.js`/`.jsx`/`.ts`/`.tsx`/`.mjs`/`.cjs` import extraction — unconditionally preserved, including for such files placed under a `docs/` folder (verified by a dedicated test)

#### Validation

- **`tests/unit/execution/architecture/buildImportDependencyGraph.test.js`** — 12 new tests added in a new `describe('buildImportDependencyGraph — documentation exclusion')` block (was 69 tests, now 81): Markdown file with `require(...)` produces no edge; Markdown file with ES `import` syntax produces no edge; MDX file with import/require snippets produces no edge; documentation files produce no `unresolvedImports` (external, non-relative, and missing-relative varieties all suppressed); a `.js` file with the identical require/import text still produces the expected edge (proves the guard is content-blind and extension/category-driven, not text-pattern-driven); TypeScript import extraction unchanged; `highFanOutFiles` excludes a documentation file even when it superficially references 6 distinct paths; total edge count excludes documentation-derived edges while still counting a real file's edge in the same input; the task's own realistic regression snippet (`PROGRESS.md`-style content with two `require()` calls) contributes zero edges/unresolved imports; documentation files still appear as nodes with `outboundCount: 0` and `category: 'docs'` (locks in the node-retention decision above); a real source file importing a documentation file still resolves to an edge; a `.js` file physically placed under a `docs/` folder still has its imports extracted (proves the `CODE_EXTENSIONS` guard wins over the `'docs'` category).
- `npx jest tests/unit/execution/architecture/buildImportDependencyGraph.test.js --runInBand` → **1/1 suite passing, 81/81 tests passing**
- `npx jest tests/unit/execution/architecture --runInBand` (all 24 architecture unit test files, including `assessImplementationCompleteness.test.js` and `verifyArchitectureBoundaries.test.js`, the two downstream consumers of `dependencyGraph.nodes`) → **24/24 suites passing, 2290/2290 tests passing** — no regression in either downstream consumer from the node-retention decision
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7238/7308 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline after Refinement #3 was 110/115 suites, 7226/7296 tests — net +12 tests, no new suites, from the new documentation-exclusion test block)
- `buildImportDependencyGraph.js` coverage: 96.17% statements / 89.36% branches / 100% functions / 97.64% lines (uncovered lines are pre-existing defensive branches unrelated to this change)

#### Capability Maturity Change

Architecture Intelligence (`buildImportDependencyGraph.js`): data-quality defect resolved — documentation content no longer contributes false dependency-graph edges, false unresolved-import findings, or false high-fan-out signals to any downstream architecture snapshot, portfolio aggregation, or dashboard view that consumes `dependencyGraph.edges` / `.unresolvedImports` / `.couplingMetrics.highFanOutFiles`. No capability newly delivered; existing Architecture Intelligence maturity (Integrated / Tested) is unchanged, with one known accuracy gap closed.

---

### 2026-07-11 — Coupling Refinement #3: Split portfolioRoutes.js by Domain

**Capability:** Architecture coupling reduction (third of the three lowest-risk refactoring opportunities identified in the 2026-07-10 Architecture Coupling Review of repo_id=80, after [[Coupling Refinement #1]] and [[Coupling Refinement #2]] — this one targeting the 1462-line monolithic `backend/routes/portfolioRoutes.js`, which had a 25-direct-import fan-out, the highest of any single route file in the repo)
**Deliverable status:** Structural refactor only — no behavior, contract, auth, DB, scoring, caching, ordering, or dedup/fallback logic change; all public URLs remain under `/api/portfolio`

#### Actual Route Inventory (verified before moving anything)

Before writing any new file, every `router.get(...)` in the original `portfolioRoutes.js` was inventoried directly from source (not assumed from the task brief): **12 endpoints, all `GET`, all static paths (no `:id`/params), no wildcards, no duplicate path+method pairs** — `/forecast`, `/executive-summary`, `/history`, `/changes`, `/anomalies`, `/anomaly-clusters`, `/telemetry-coverage`, `/behavioral-stability`, `/maturity`, `/architecture`, `/governance`, `/watchlists`. This matched the task brief's suggested 6-and-6 grouping exactly by endpoint name — no renamed or missing endpoints — so the suggested classification was adopted as the actual mapping.

#### What Changed

- **New file `backend/routes/portfolioArchitectureRoutes.js`** (684 lines, 14 direct requires) — architecture/structural-intelligence endpoints, handler bodies moved verbatim: `GET /forecast`, `/anomalies`, `/anomaly-clusters`, `/telemetry-coverage`, `/architecture`, `/watchlists`. Handler-local helpers `_unknownArchRepo` (inside `/architecture`) and `_GOV_LEVEL_MAP` (inside `/watchlists`) were already function-scoped in the original file and moved as-is — no extraction needed.
- **New file `backend/routes/portfolioGovernanceRoutes.js`** (812 lines, 18 direct requires) — governance/portfolio-operating endpoints, handler bodies moved verbatim: `GET /executive-summary`, `/history`, `/changes`, `/behavioral-stability`, `/maturity`, `/governance`. Two module-scope helper groups moved here as private locals, each verified (via grep) to have exactly one consumer in the original file: `_mapRepoRow` (used only by `/executive-summary`) and `_REGR_RANK`/`_COUP_RANK`/`_worstLevel`/`_aggregateRegressions`/`_aggregateCouplingAlerts` (used only by `/governance`).
- **`backend/routes/portfolioRoutes.js`** (1462 → 31 lines) — reduced to a composition router: applies `authenticate` once (exactly as the original applied it once, immediately after the removed helper block), then mounts the two domain routers directly (`router.use(portfolioArchitectureRoutes)`, `router.use(portfolioGovernanceRoutes)` — no path prefix argument, matching the task's explicit "must NOT become `/api/portfolio/architecture/architecture`" requirement). `backend/server.js` required zero changes — `app.use('/api/portfolio', portfolioRoutes)` still resolves to one router.
- No shared-helper module was created (no `portfolioUtils.js`/`common.js`/`helpers.js`): every private helper had exactly one real consumer, so per requirement 5 each stayed local to the router that uses it.

#### Cross-Router Import Overlap (expected, not a violation)

`GET /governance` (governance router) independently re-runs the same per-repo architecture forecast pipeline that `GET /forecast` and `GET /watchlists` (architecture router) use, so `portfolioGovernanceRoutes.js` also imports `buildArchitectureTrendTimeline`, `detectArchitectureRegressions`, `detectCouplingGrowthAlerts`, `forecastStructuralDegradation`, `buildPortfolioForecastingIntelligence`, `detectArchitectureAnomalies`, and `buildPortfolioArchitectureIntelligence` from `execution/architecture/*` — the same modules the architecture router imports. This is independent execution-module reuse across two routers (each doing its own aggregation), not a duplicated local helper function, and is explicitly allowed by requirement 6 ("move each execution import to the router that actually uses it" — both routers actually use these).

#### Route-Order Findings

No route-order collision exists. All 12 original routes are `GET`-only, static (zero `:id`/wildcard segments), and path-distinct across both new files, so no ordering choice between `portfolioArchitectureRoutes` and `portfolioGovernanceRoutes` in the composition router can change which handler serves a given request — mount order (architecture, then governance) simply mirrors the original file's top-to-bottom grouping as a defensive convention, not a functional requirement.

#### Not Changed

- Route paths, HTTP methods, SQL (including all `JSON_AGG`/`LEFT JOIN LATERAL` queries), execution-module call arguments, `Promise.all`-adjacent sequential-query ordering (the two-query `/governance` and `/anomalies`/`/anomaly-clusters` handlers still issue their queries in the exact original order), response payload shapes, status codes, `next(err)` error propagation, cache `_meta`/`_cache` metadata blocks, the < 2-snapshot "unknown forecast" fallback branches, `deduplicateTopFindings`/`deduplicateRecommendations` dedup calls in `/architecture`, and the `.slice(0, 50)`/`.slice(0, 20)`/`.slice(0, 10)` result-limiting behavior in `/anomalies`, `/anomaly-clusters`, and the governance aggregation helpers — all preserved exactly across all 12 moved handlers
- `authenticate` middleware — applied exactly once, only in the composition router; neither domain router re-applies or weakens it (verified structurally: every layer on each domain router's own `.stack` is a route layer, not a `router.use` layer)
- `backend/routes/repoRoutes.js`, `repoCoreRoutes.js`, `repoRiskRoutes.js`, `repoArchitectureRoutes.js` — out of scope, not touched

#### Validation

- **New test file `tests/unit/backend/routes/portfolioRoutes.composition.test.js`** (16 tests, 5 `describe` blocks), modeled on the established `repoRoutes.composition.test.js` pattern: composition structure (router export shape, both domain routers are independent Express Routers, `portfolioRoutes.stack` is exactly `[authenticate, architectureRouter, governanceRouter]`, neither domain router registers its own auth-style `router.use`, `authenticate` fires exactly once per request and runs before the matched handler); representative end-to-end HTTP requests (`GET /architecture` and `/watchlists` → architecture router; `GET /governance`, `/maturity`, `/executive-summary` → governance router); public-path stability (all 12 original paths remain reachable, none 404); no accidental double-prefixing (`/api/portfolio/architecture/architecture` and `/api/portfolio/governance/governance` both 404); unknown portfolio path retains its pre-existing 404 (no catch-all handler existed before or after); backward-compatibility (`require('../routes/portfolioRoutes')` still mounts without throwing).
- **`tests/unit/backend/routes/portfolioRoutes.test.js`** — `extractHandler` helper made recursive (checks `layer.handle.stack` and descends into nested routers), the same fix applied to `repoRoutes.test.js` in Coupling Refinement #2, so all 233 pre-existing handler-extraction tests keep resolving to the same handler functions across the new nested-router structure without rewriting any test body or assertion.
- `npx jest tests/unit/backend/routes/portfolioRoutes --runInBand` → **2/2 suites passing, 233/233 tests passing** (217 pre-existing + 16 new composition tests)
- `npx jest tests/unit/backend/routes --runInBand` → **8/8 suites passing, 692/692 tests passing**
- `npm test -- --runInBand` (full suite) → **110/115 suites passing, 7226/7296 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline after Refinement #2 was 109/114 suites, 7210/7280 tests — net +1 suite / +16 tests from the new composition test file); `portfolioRoutes.js` itself: **100% statements/branches/functions/lines**; the two new domain routers: 94.3–95.13% statements (uncovered lines are pre-existing defensive branches inherited unchanged from the original monolithic file, not new code)

#### Coupling Validation

| Metric | Value |
|---|---|
| Old `portfolioRoutes.js` line count | 1462 |
| New `portfolioRoutes.js` line count | 31 |
| Composition router (`portfolioRoutes.js`) direct requires | 4 (`express`, `authenticate`, `portfolioArchitectureRoutes`, `portfolioGovernanceRoutes`) |
| `portfolioArchitectureRoutes.js` direct requires | 14 (`express` + 13 execution modules) |
| `portfolioGovernanceRoutes.js` direct requires | 18 (`express` + 17 execution modules) |
| Original `portfolioRoutes.js` direct requires (baseline) | 25 |

Per requirement 8, this does **not** claim the portfolio-domain dependency-graph edge count decreased — the same 24 execution-module edges that existed before (minus duplication, since 7 modules are now imported by both new files rather than once each) still exist, just redistributed across two bounded files instead of concentrated in one. The objective met is fan-out-per-file and blast-radius reduction: a change to a governance-only execution module (e.g. `scoreEngineeringGovernance`) now only requires reasoning about a 812-line file with a single governance-shaped responsibility, not a 1462-line file mixing governance and architecture-forecast concerns.

#### Capability Maturity Change

Architecture coupling (repo_id=80 self-analysis): `backend/routes/portfolioRoutes.js` reduced from 1462 lines / one file / 25-import fan-out to a 31-line composition router + 2 focused domain routers (684 + 812 lines). The "highest-fan-out single route file" issue flagged in the 2026-07-10 coupling review is resolved for this file — all three flagged refactoring opportunities from that review are now complete. No public API, auth, or scoring surface changed — this is a pure structural maturity improvement (Integrated / Tested), not a new capability.

---

### 2026-07-11 — Coupling Refinement #2: Split repoRoutes.js by Domain

**Capability:** Architecture coupling reduction (follow-up to the 2026-07-10 Architecture Coupling Review of repo_id=80, which flagged the 1526-line monolithic `backend/routes/repoRoutes.js` as a single-file out-degree/mixed-responsibility risk — the second of the three lowest-risk refactoring opportunities identified, after [[Coupling Refinement #1]])
**Deliverable status:** Structural refactor only — no behavior, contract, auth, DB, scoring, caching, or route-order change; all public URLs remain under `/api/repos`

#### What Changed

- **New file `backend/routes/repoCoreRoutes.js`** (501 lines) — core collection endpoints, handler bodies moved verbatim: `GET /`, `GET /:id/metrics`, `GET /attention`, `GET /summary`, `POST /register`, `POST /:id/change-risk`, `POST /sync`.
- **New file `backend/routes/repoRiskRoutes.js`** (629 lines) — per-repo operational risk endpoints, handler bodies moved verbatim: `GET /:id/risk`, `/:id/events`, `/:id/escalation`, `/:id/forecast`, `/:id/confidence`, `/:id/pr-health`, `/:id/engineering-volatility`, `/:id/maturity`, `/:id/maturity-trend`.
- **New file `backend/routes/repoArchitectureRoutes.js`** (428 lines) — per-repo architecture intelligence endpoints, handler bodies (and the module-scope `_withDedupedFindings` helper, `ARCH_HEALTH_TO_GOV_LEVEL` map, and `ARCH_CACHE_TTL_MS` constant — each used only by handlers within this file) moved verbatim: `GET /:id/architecture/forecast`, `/:id/remediation`, `/:id/architecture`.
- **`backend/routes/repoRoutes.js`** (1526 → 36 lines) — reduced to a composition router: applies `authenticate` once (exactly as the original applied it once at the top of the monolithic file), then mounts the three domain routers at `/` in core → risk → architecture order (matching the original file's top-to-bottom static-route order; documented in-file as defensive convention since no domain router in this endpoint set contains a bare `/:id` route, so no literal shadowing is structurally possible regardless of mount order).
- Endpoint-to-router mapping deliberately follows the task's *actual current* route paths rather than the task brief's suggested `:id`-prefixed shapes for `/summary`, `/attention`, and `/sync` — the pre-existing repository confirms these three are collection-level (not per-repo) endpoints (`router.get('/attention', ...)`, `router.get('/summary', ...)`, `router.post('/sync', ...)` in the original file, predating this refactor), so they were moved into `repoCoreRoutes.js` at their real paths, not renamed to match the brief.
- No shared-helper module was introduced: every constant/helper used by more than one handler is used only within a single new domain router file, so per requirement 5 nothing was extracted to a shared module.

#### Not Changed

- Route paths, HTTP methods, SQL, response shapes, status codes, and error-propagation (`next(err)` → the same `app.use(errorHandler)` in `backend/server.js`) — preserved exactly in all 20 moved handlers
- `authenticate` middleware — applied exactly once, only in the composition router; no domain router re-applies or weakens it (verified structurally: every layer on each domain router's own `.stack` is a route layer, not a `router.use` layer)
- `authorize('repositories:configure')` on `POST /register` and `POST /sync` — preserved exactly, at the handler level, in `repoCoreRoutes.js`
- Lazy `require` behavior — none existed in the original `repoRoutes.js` handlers (unlike `legacySummaryRoutes.js` from Coupling Refinement #1); all requires here were already module-scope and remain module-scope in their new files
- Caching behavior (`GET /:id/architecture`'s 6-hour `ARCH_CACHE_TTL_MS` stale-cache/live-refresh logic) and request-sequence behavior (`Promise.all` parallel query pairs/triples in the risk and architecture handlers) — moved verbatim, untouched
- `backend/server.js` — no mounting change needed; `app.use('/api/repos', repoRoutes)` continues to resolve to a single mountable Express Router, so no import-site changes were required anywhere
- `backend/routes/portfolioRoutes.js` — out of scope, not touched

#### Validation

- **New test file `tests/unit/backend/routes/repoRoutes.composition.test.js`** (12 tests, 4 `describe` blocks): composition structure (router export shape, each domain router is an independent Express Router, `repoRoutes.stack` is exactly `[authenticate, coreRouter, riskRouter, architectureRouter]`, no domain router registers its own auth-style `router.use`, `authenticate` fires exactly once per request end-to-end); route-order safety (`POST /register` resolves to the register handler and not a `:id`-shaped 400, `GET /summary` and `GET /attention` resolve to their static handlers, not captured as `:id`); one representative end-to-end HTTP request per domain router (`GET /api/repos` → core, `GET /api/repos/:id/risk` → risk, `GET /api/repos/:id/architecture` → architecture); backward-compatibility (`require('../routes/repoRoutes')` still mounts without throwing).
- **`tests/unit/backend/routes/repoRoutes.test.js`** — `extractHandler` helper made recursive (checks `layer.handle.stack` and descends into nested routers) so all 307 existing handler-extraction tests keep resolving to the same handler functions across the new nested-router structure, without rewriting any test body or assertion.
- `npx jest tests/unit/backend/routes --runInBand` → **7/7 suites passing, 676/676 tests passing** (includes `repoRoutes.test.js`, `repoRoutes.http.test.js`, `repoRoutes.composition.test.js`, `portfolioRoutes.test.js`, `notificationRoutes.test.js`, `legacySummaryRoutes.test.js`, `authRoutes.test.js`)
- `npm test -- --runInBand` (full suite) → **109/114 suites passing, 7210/7280 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated); `repoRoutes.js` itself: **100% statements/branches/functions/lines**; the three new domain routers: 94.28–94.53% statements (uncovered lines are pre-existing defensive branches inherited unchanged from the original monolithic file, not new code)
- Manual verification: no duplicate route definitions across the three new routers (each handler moved to exactly one file); no bare `/:id` route exists anywhere in this endpoint set, so static-vs-parameterized shadowing was structurally impossible even before the explicit route-order tests were added

#### Capability Maturity Change

Architecture coupling (repo_id=80 self-analysis): `backend/routes/repoRoutes.js` reduced from 1526 lines / one file to a 36-line composition router + 3 focused domain routers (501 + 629 + 428 lines). The "single large mixed-responsibility route file" issue flagged in the 2026-07-10 coupling review is resolved for this file. No public API, auth, or scoring surface changed — this is a pure structural maturity improvement (Integrated / Tested), not a new capability.

---

### 2026-07-10 — Coupling Refinement #1: Extract Legacy Summary Routes

**Capability:** Architecture coupling reduction (follow-up to the 2026-07-10 Architecture Coupling Review of repo_id=80, which identified `backend/server.js` mixing bootstrap concerns with inline route/orchestration logic as one of the three lowest-risk refactoring opportunities)
**Deliverable status:** Structural refactor only — no behavior, contract, auth, DB, or scoring change

#### What Changed

- **New file `backend/routes/legacySummaryRoutes.js`** — an `express.Router()` hosting the five legacy/demo endpoints previously defined inline in `backend/server.js`:
  - `GET /projects`, `GET /summary`, `GET /history`, `POST /history/snapshot`, `GET /alerts`
  - Handler bodies moved verbatim, including the lazy `require('../../execution/projects')`, `require('../../execution/getProjectSummary')`, and `require('../../execution/appendSummarySnapshot')` calls inside each handler (unchanged caching semantics — first request per process loads the module, Node's require cache serves the rest)
  - `execution/summaryHistory` moved to a module-scope `require` in the new router file (was module-scope in `server.js`)
- **`backend/server.js`** — the module-level `let _syncedProjects = null` closure variable (read by 3 of the 5 handlers, written once by the async GitHub-sync startup block) was replaced with `app.locals.syncedProjects`, mirroring the existing `app.locals.db` / `app.locals.config` pattern already used in this file. This is the only behavioral wiring change: the new router reads `req.app.locals.syncedProjects` at request time instead of closing over a local variable — functionally identical, since `req.app` is the same mounted `app` instance either way. New router mounted via `app.use('/', legacySummaryRoutes)` — no path prefix added, so all five public URLs are byte-for-byte unchanged. `server.js` now contains only: app/middleware setup, 4 pre-existing route-file mounts + the new legacy router mount, 4 small always-legitimate inline handlers not in scope for this task (`/`, `/dashboard`, `/manage/repos`, `/health`), error handler, and startup/listen block.
- **New test file `tests/unit/backend/routes/legacySummaryRoutes.test.js`** (8 tests) — isolated supertest coverage against the router directly (mocked `execution/summaryHistory`, `execution/projects`, `execution/getProjectSummary`, `execution/appendSummarySnapshot`), added because `tests/unit/backend/server.test.js`'s existing "legacy dashboard routes" describe block never exercises the `app.locals.syncedProjects !== null` branch (the wired-in test never runs the GitHub-sync startup path) or `POST /history/snapshot` at all — coverage was 82.6%/50%/80%/86.36% (stmts/branch/func/line) on the new file before this addition, now 100%/100%/100%/100%.

#### Not Changed

- Route paths, HTTP methods, response body shapes, status codes, and error-propagation behavior (synchronous throws inside handlers still bubble to the same `app.use(errorHandler)`, registered after the new router exactly as it was after the old inline handlers) — all preserved exactly
- `execution/projects.js`, `execution/getProjectSummary.js`, `execution/appendSummarySnapshot.js`, `execution/summaryHistory.js`, `execution/repoHistory.js` — zero changes to any execution module
- Authentication behavior, database access, scoring/risk logic — untouched (these endpoints never touched auth/DB/scoring to begin with)
- `/`, `/dashboard`, `/manage/repos`, `/health` inline handlers in `server.js` — out of scope, left exactly as-is
- `tests/routes.test.js`, `tests/backend.test.js`, `tests/projects_file.*.test.js` (root-level, **not** matched by `jest.config.js`'s `testMatch` and therefore not part of `npm test`) — re-run directly for verification; baseline preserved exactly: 8/9 suites passing both before and after, same 9 pre-existing failing tests in `tests/routes.test.js` (`/health` shape assertion + `/repo-history/:id` + `POST /test-alert` — none of these three routes exist in `server.js` today and none are part of the 5 endpoints moved by this task, confirmed via a baseline run before touching any file)

#### Validation

- `npm test -- --runInBand` → **108/113 suites passing, 7198/7268 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated; prior baseline was 107/112 suites, 7190/7260 tests — net +1 suite / +8 tests from the new focused router test)
- `backend/routes/legacySummaryRoutes.js` coverage: **100% statements / 100% branches / 100% functions / 100% lines**
- Direct re-run of `tests/unit/backend/server.test.js` (the actually-wired-in coverage for these endpoints, under "server — legacy dashboard routes") → **37/37 passing**, including `GET /projects`, `GET /summary`, `GET /history`, `GET /alerts` through the fully mounted app
- Direct re-run of the non-wired root-level `tests/routes.test.js` + `tests/backend.test.js` + `tests/projects_file.*.test.js` (9 files) → **8/9 suites passing, 36/45 tests passing** — identical to the pre-refactor baseline captured before any file was touched
- Manual sanity load: `require('./backend/server')` resolves cleanly; `app.locals` contains `db`, `config`, `syncedProjects` (initial value `null`)

#### Capability Maturity Change

Architecture coupling (repo_id=80 self-analysis): `backend/server.js` out-degree reduced from 15 to 11 direct requires (`legacySummaryRoutes.js` replaces 4 direct execution requires — `execution/projects.js`, `execution/getProjectSummary.js`, `execution/summaryHistory.js`, `execution/appendSummarySnapshot.js` — with 1 router require); the "inline orchestration logic in the bootstrap file" issue flagged in the 2026-07-10 coupling review (category D) is resolved — `server.js` now contains only bootstrap/mounting concerns for these five endpoints. Total dependency-graph edge count is expected to remain ~139 (edges relocated to the new router file, not removed) — to be confirmed against the next architecture snapshot for repo_id=80.

---

### 2026-07-10 — Dashboard Executive Refinement #1: Remove Portfolio Assessment Section

**Capability:** FR-003 Project Dashboard — UI surface area reduction  
**Deliverable status:** UI-only cleanup — backend routes, scoring logic, and other dashboard sections untouched

#### What Changed

- **`frontend/dashboard.html`** — removed the "Portfolio Assessment" briefing card (internally named `Executive Briefing`), which duplicated the Summary cards and Portfolio Architecture/Governance panels:
  1. **HTML**: `<!-- Portfolio Assessment -->` comment + `<div class="section"><div id="executive-summary">...</div></div>` wrapper removed (no placeholder spacing left behind — Summary section now sits directly above Notifications)
  2. **CSS**: entire `/* ── Executive Summary briefing card ── */` block removed (`.exec-brief`, `.exec-brief.sev-*`, `.exec-brief-header`, `.exec-brief-badge`, `.exec-brief-label`, `.exec-brief-headline`, `.exec-brief-summary`, `.exec-brief-body`, `.exec-brief-col`, `.exec-brief-col-label`, `.exec-brief-list`, `.exec-brief-item`, `.exec-brief-rec-item` and their `::before` rules) — confirmed unused elsewhere (only consumer was the removed briefing function)
  3. **JS functions removed**: `buildExecutiveBriefing()`, `renderExecutiveBriefing()`, `loadExecutiveSummary()`
  4. **JS call sites removed**: `renderExecutiveBriefing()` call sites in `loadPortfolioArchitecture()` and `loadPortfolioGovernance()`; `loadExecutiveSummary()` call removed from `refresh()`
  5. `_execKpi` state object and `buildExecutiveKpiCards()` / `renderExecutiveKpis()` (Summary cards: Architecture Health, Governance, Critical Repos, Snapshot Coverage) are shared state consumers — left fully intact per scope
- **`tests/unit/frontend/dashboardExecutiveBriefing.test.js`** — deleted; its only purpose was verifying `buildExecutiveBriefing()` (copied verbatim into the test), which no longer exists in `dashboard.html`

#### Not Changed

- Summary cards (Architecture Health, Governance, Critical Repositories, Snapshot Coverage), Portfolio Architecture panel, Engineering Governance panel, Recommended Actions — all untouched
- `tests/unit/frontend/dashboardPortfolioBriefing.test.js` — retained; unrelated self-contained test for a different, already-removed function (`buildPortfolioBriefingHtml`, removed in the 2026-06-25 Dashboard Refinement #1 entry below), kept per the established pattern of self-contained verbatim-copy tests
- No backend routes, scoring/analysis logic (`execution/architecture/*`), or APIs modified

#### Dead Code Left Intentionally

None. All removed functions, call sites, and CSS classes were confirmed to have no other consumers via full-file grep before deletion.

#### Validation

- `npx jest tests/unit/frontend --silent` → **23/23 suites, 1491/1491 tests passing**
- `npx jest --silent` (full suite) → **107/112 suites passing, 7190/7260 tests passing** (5 suites / 70 tests skipped — pre-existing opt-in integration tests, unrelated to this change)
- Verified via grep: no remaining references to `Portfolio Assessment`, `exec-brief`, `executive-summary`, `buildExecutiveBriefing`, `renderExecutiveBriefing`, `loadExecutiveSummary`, or `exec-summary-conf` in `dashboard.html`

#### Capability Maturity Change

FR-003 Dashboard: **Integrated / Tested** — Portfolio Assessment surface removed as a duplicate of existing Summary/Architecture/Governance views; no regression to remaining dashboard capabilities.

---

### 2026-07-09 — Analyzer Improvement Step #8: Monorepo Next.js App Router Detection

**Capability:** Architecture Intelligence — backend route discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — extraction only; scoring/linking/UI/frontend-call-extraction untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. `_nextUrlFromPath`'s `appMatch` regex extended from `^(?:src\/)?app\/api\/(.+)\/route\.[jt]sx?$` to `^(?:(?:apps|packages|services|libs)\/[^/]+\/)?(?:src\/)?app\/api\/(.+)\/route\.[jt]sx?$` — an optional leading `{apps|packages|services|libs}/<single-segment-package-name>/` group, still followed by the existing optional `src/` and the unchanged `app/api/.../route.*` tail. `[^/]+` matches exactly one path segment (the workspace/package name — `web`, `admin`, `frontend`, `demo`, etc.), so a repo with deeper nesting under the package name still requires that `app/api/` immediately follow (optionally via `src/`), matching the exact shapes named in the requirements.
  2. `pagesMatch` (the separate `pages/api/...` regex) was **not** touched — it remains root-anchored only, exactly as before. Workspace-nested `pages/api` (e.g. `apps/web/pages/api/users.js`) is out of scope per the requirements (only the four `app/api` workspace roots were listed) and is confirmed still undetected by a dedicated regression test.
  3. Everything downstream of `_nextUrlFromPath` — the dynamic-segment normalization (`.replace(/\[([^\]]+)\]/g, ':$1')`), the exported-HTTP-method detection (`NEXT_EXPORT_FUNCTION_RE`/`NEXT_EXPORT_CONST_RE`/`NEXT_EXPORT_LIST_RE`, requirement 4's "no route without an export" rule), and the Step #5 merge of `type: 'app'` `nextRoutes` entries into `backendRoutes` (requirement 5) — is completely unchanged. A workspace-detected route flows through the exact same pipeline as a root-detected one from this point forward, so no additional wiring was needed to satisfy requirements 4, 5, or 7.
  4. Catch-all segment normalization (`[...slug]` → `:...slug`, `[[...slug]]` → `:[...slug]` — the latter's slightly unusual leftover-bracket output is pre-existing, unmodified behavior, not something this step changes or "fixes") was verified byte-for-byte identical between a root `app/api/docs/[...slug]/route.ts` and a workspace `apps/web/src/app/api/docs/[...slug]/route.ts`, via a direct cross-check test, before any test asserting a specific catch-all output string was written — the actual current output was captured via a standalone script first rather than assumed, per requirement 2's "continue using the current normalization rules."
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — 21 new tests across 6 `describe` blocks inserted directly after the existing "Next.js App Router (src/app/api and dynamic segments)" block: all 6 named workspace layouts from the requirements (`apps/web/src/app/api`, `apps/admin/app/api`, `packages/web/src/app/api`, `packages/frontend/src/app/api`, `services/frontend/src/app/api`, `libs/demo/src/app/api`) plus a Step #5 backendRoutes-merge confirmation; dynamic/catch-all preservation (4 — nested dynamic segment, catch-all, optional catch-all, and a root-vs-workspace catch-all identical-output cross-check); route.\* extension/export-requirement preservation (3 — non-route.\* file ignored, `.jsx`/`.tsx` extensions recognized, methodless route.ts still produces nothing); existing-behavior regressions (4 — root `app/api`, root `src/app/api`, workspace-nested `pages/api` confirmed still NOT detected, root `pages/api` regression); and full `linkFrontendBackendApis` linkage verification (3 — static route links, dynamic `[id]` route links via template-literal call, and two separate workspace apps in the same repo both linking independently).

#### Workspace Layouts Supported

| Prefix | Example |
|---|---|
| `app/api/` (root, unchanged) | `app/api/users/route.ts` → `/api/users` |
| `src/app/api/` (root, unchanged) | `src/app/api/users/route.ts` → `/api/users` |
| `apps/*/app/api/` | `apps/admin/app/api/users/route.ts` → `/api/users` |
| `apps/*/src/app/api/` | `apps/web/src/app/api/users/route.ts` → `/api/users` |
| `packages/*/app/api/` | `packages/web/app/api/users/route.ts` → `/api/users` |
| `packages/*/src/app/api/` | `packages/frontend/src/app/api/users/route.ts` → `/api/users` |
| `services/*/app/api/` | `services/web/app/api/users/route.ts` → `/api/users` |
| `services/*/src/app/api/` | `services/frontend/src/app/api/users/route.ts` → `/api/users` |
| `libs/*/app/api/` | `libs/demo/app/api/users/route.ts` → `/api/users` |
| `libs/*/src/app/api/` | `libs/demo/src/app/api/users/route.ts` → `/api/users` |

`pages/api/...` remains root-anchored only — no workspace variant was added, per scope.

#### Example Extracted Routes

`apps/web/src/app/api/users/route.ts` + `export async function GET` → `GET /api/users`, merged into `backendRoutes` with `framework: 'nextjs-app-router'` exactly as a root-level App Router route would be (Step #5 behavior, unchanged).
`apps/web/src/app/api/users/[id]/edit/route.ts` → `/api/users/:id/edit` (nested dynamic segment, unchanged normalization).
Two independent workspace apps in the same monorepo (`apps/web` and `apps/admin`) both extract and link correctly in the same pass — verified end-to-end through `linkFrontendBackendApis`.

#### Not Changed

- Linkage scoring (`linkFrontendBackendApis.js`), architecture scoring (`buildRepositoryArchitectureSnapshot.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`) — no lines touched
- `frontend/dashboard.html` — untouched
- Frontend call extraction (`fetch`/`axios`/`apiClient`/`client.request`/serverFetch-family regexes) — untouched, per explicit scope; only the *backend* App Router path matcher changed
- `pages/api` detection, Express/Fastify extraction, NestJS extraction (Steps #1/#6/#7, including global-prefix detection) — unaffected, verified by full regression run
- Dynamic-segment and catch-all normalization logic itself — not modified; only the *file-path matcher feeding into it* was extended

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **233/233 passing** (21 new + all 212 pre-existing tests, including Steps #1/#2/#3/#5/#6/#7, unchanged and passing)
- `npx jest tests/unit/execution/architecture` (24 files) → **2,257/2,257 passing** — confirms zero regressions in linking/scoring/snapshot modules
- `npm test --runInBand` → **7,240 / 7,310 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +21 tests vs. prior 7,219/7,289)
- Manually verified via a standalone script before formalizing as tests: all 6 named workspace layouts, root regressions, nested dynamic segments, catch-all/optional-catch-all (captured real current output first, not assumed), non-route.\* file rejection, methodless-route skip, workspace-nested `pages/api` non-detection, and full linkage through `linkFrontendBackendApis`

#### Next Actions

- None identified specific to workspace App Router detection. Combined with Steps #5–#8, RepoPulse now recognizes NestJS routes (incl. object-form controllers and global prefixes) and Next.js App Router BFF routes (incl. common monorepo layouts) as first-class `backendRoutes` participating in real linkage — the repo_id=98 investigation's two root causes (NestJS object-form decorators, and App Router routes not feeding linkage at all) are both now addressed in code; a fresh snapshot of that repository was not re-fetched as part of this step.

---

### 2026-07-09 — Analyzer Improvement Step #7: NestJS Global Prefix Detection

**Capability:** Architecture Intelligence — backend route discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — extraction only; scoring/linking/UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. **Closes the last remaining gap explicitly flagged in Step #6's own PROGRESS.md entry:** RepoPulse could resolve `@Controller({ version: '1', path: 'auth' })` to `/v1/auth/...` but had no visibility into `app.setGlobalPrefix('api', ...)` in `main.ts`/bootstrap files — so the extractor's `/v1/auth/login` never matched the real runtime path `/api/v1/auth/login`, which is exactly what repo_id=98's frontend calls. This step adds that missing piece.
  2. Added `NEST_GLOBAL_PREFIX_RE` and `_detectNestGlobalPrefix(normalizedFiles)`. The regex matches `app.setGlobalPrefix(` followed immediately by a quoted (single/double/backtick) argument; a variable, function call, or any other non-literal argument simply never matches the regex at all — there is no special-case branch needed to "ignore" a dynamic argument, it is structurally invisible to the pattern, exactly satisfying requirement 4 with no extra logic.
  3. `_detectNestGlobalPrefix` scans every fetched file (no filename restriction, consistent with this module's existing scan-everything approach — e.g. Step #4's framework hints), and for each file scans every `setGlobalPrefix(...)` occurrence left to right. The first occurrence that resolves to a **non-empty literal** (after slash-trimming) is returned immediately; an occurrence with an interpolated template literal (`` `${env}/api` ``) is skipped and scanning continues — this is what makes "use the first static literal prefix" (requirement 3) hold even when a dynamic or empty-string call appears earlier in scan order.
  4. In `extractRouteApiStructure`, a new pass runs after the existing Express `app.use()` mount-prefix resolution and before the Step #5 Next.js App Router merge: if `_detectNestGlobalPrefix` returns a prefix, every `backendRoutes[i]` with `framework === 'nestjs'` gets its `path` rewritten via the existing `_joinNestPath(globalPrefix, route.path)` helper (reused as-is — no new join/normalization logic needed). The filter on `framework === 'nestjs'` is what satisfies requirement 6: Express routes (already handled by the separate mount-prefix pass above), Fastify routes, Next.js routes (merged afterward, untouched), and frontend calls (never touched by any backend-route pass) are structurally excluded from this rewrite.
  5. `setGlobalPrefix`'s optional second argument (e.g. NestJS's `{ exclude: [...] }` option, present verbatim in repo_id=98's real `main.ts`) does not interfere — the regex only captures the first quoted argument and stops, exactly like every other multi-argument call pattern already handled elsewhere in this file (e.g. `CLIENT_REQ_RE`).
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — 16 new tests across 6 `describe` blocks inserted after the Step #6 "real-world repo_id=98 shapes" block: supported literal forms (4 — single-quote, double-quote + leading slash, template literal, and the exact `POST /api/v1/auth/login` example from the requirements), dynamic/unsupported forms ignored (4 — variable, function call, interpolated template, plus a no-throw check), multiple-declarations-use-the-first-literal (3 — dynamic-then-literal, two-literals-first-wins, two-literals-across-separate-files), applies-only-to-NestJS (2 — Express/Fastify/Next.js untouched, frontend calls untouched), no-prefix-present regression (1), and a repo_id=98 end-to-end closure block (2 — the exact `main.ts` + `AuthController` + BFF-proxy-call reproduced from the live GitHub investigation now fully links via `linkFrontendBackendApis`, plus a dedicated check that the `{ exclude: [...] }` second argument doesn't interfere). Also corrected a comment in one pre-existing Step #6 test (`EmployeeController` test) that had described the global-prefix gap as "out-of-scope" — now accurate, since this step closes it (the test's own assertions were unaffected, since its fixture has no `setGlobalPrefix` call).

#### Global Prefix Patterns Supported

| Pattern | Behavior |
|---|---|
| `app.setGlobalPrefix('api')` | prefix `api` |
| `app.setGlobalPrefix("/api")` | prefix `api` (leading slash stripped) |
| `` app.setGlobalPrefix(`api`) `` (no `${...}`) | prefix `api` |
| `app.setGlobalPrefix('api', { exclude: [...] })` | prefix `api` (second argument ignored, doesn't interfere) |
| `app.setGlobalPrefix(PREFIX_VAR)` | **ignored** — variable unsupported |
| `app.setGlobalPrefix(getPrefix())` | **ignored** — function call unsupported |
| `` app.setGlobalPrefix(`${env}/api`) `` | **ignored** — interpolated template unsupported |
| Multiple `setGlobalPrefix(...)` calls | first **literal** one (in file-then-position scan order) wins; dynamic/empty ones are transparently skipped |
| No `setGlobalPrefix(...)` call anywhere | unchanged — NestJS routes resolve exactly as Step #6 left them |

#### Example Extracted Routes

`app.setGlobalPrefix('api')` + `@Controller({ version: '1', path: 'auth' })` + `@Post('login')` → **`POST /api/v1/auth/login`** (the exact requirements example; previously `/v1/auth/login`).
`app.setGlobalPrefix('/api')` + `@Controller('health')` + `@Get()` → **`GET /api/health`** (the exact requirements example; previously `/health`).

**repo_id=98 closure:** with the real `main.ts` (`app.setGlobalPrefix('api', { exclude: [...] })`) and the real `AuthController` (`@Controller({ version: '1', path: 'auth' })` + `@Post('login')`) both included, the extracted route is now `POST /api/v1/auth/login` — which is exactly what the real frontend BFF proxy calls. Running the result through `linkFrontendBackendApis` in the new test confirms it links with zero `unresolvedFrontendCalls`, closing the loop opened by the 2026-07-08 investigation.

#### Not Changed

- Scoring formulas (`architectureHealthScore`, `linkageScore`, `boundaryHealthScore`, `completenessScore`) — no lines touched outside `extractRouteApiStructure.js`
- `frontend/dashboard.html` — untouched
- Express `app.use()` mount-prefix resolution, Fastify extraction, Next.js pages/app-router extraction (incl. Step #5's backendRoutes merge), BFF fetch-wrapper extraction (Step #3), NestJS object-form controller parsing (Step #6) — all unaffected, verified by full regression run; the global-prefix pass is a separate, additive rewrite step scoped strictly to `framework === 'nestjs'` entries

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **212/212 passing** (16 new + all 196 pre-existing tests, including Steps #1/#2/#3/#5/#6, unchanged and passing)
- `npx jest tests/unit/execution/architecture` (24 files) → **2,241/2,241 passing** — confirms zero regressions in linking/scoring/snapshot modules
- `npm test --runInBand` → **7,219 / 7,289 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +16 tests vs. prior 7,203/7,273)
- Manually verified via a standalone script before formalizing as tests, including the exact repo_id=98 `main.ts` content (with the `{ exclude: [...] }` option object) fetched during the prior investigation, confirming all three of its real controllers now resolve to their true runtime paths (`/api/health`, `/api/v1/auth/login`, `/api/v1/auth/logout`)

#### Next Actions

- None identified specific to global prefix detection. Combined with Steps #6 and #5, RepoPulse's NestJS + Next.js App Router coverage for repo_id=98's actual architecture is now materially more complete than at the time of the original investigation; a fresh snapshot of that repository would be needed to confirm the real-world `backendRouteCount`/`linkageScore` improvement (not performed here — no live re-fetch was requested and none was undertaken as part of this code-only step).

---

### 2026-07-09 — Analyzer Improvement Step #6: NestJS Object-Form Controller Support

**Capability:** Architecture Intelligence — backend route discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — extraction only; scoring/linking/UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. **Directly closes the root cause proven in the 2026-07-08 repo_id=98 investigation:** 14 of 15 NestJS controllers in that real repository use the object-form `@Controller({ version: '1' [, path: '...'] })` decorator (NestJS URI versioning), which `_parseNestPathArg` (Step #1) could not parse — an object literal fails its bare-string/empty-parens match, so it returned `null` and the entire controller was skipped. Only the one controller using a plain string (`@Controller('health')`) survived.
  2. Added `_parseNestControllerPrefix(inner)` — the new entry point for controller-prefix resolution (method decorators `@Get`/`@Post`/`@Put`/`@Patch`/`@Delete` are untouched and continue to use `_parseNestPathArg` directly, since NestJS never uses object-form arguments for method decorators). It dispatches on the trimmed argument's first/last character: `{...}` → `_parseNestControllerObject`; anything else → the existing `_parseNestPathArg` (bare string/template-literal/empty, unchanged).
  3. Added `_parseNestControllerObject(objText)`, `_extractNestObjectPropRaw(objInner, key)`, and `_resolveNestLiteralValue(raw)`:
     - `_extractNestObjectPropRaw` finds a `key: <value>` clause inside the object body and extracts its raw (unparsed) value text, using a bracket/brace/paren depth counter so an array or nested-call value isn't truncated at an internal comma. Looks up `path` and `version` independently by key — **not by position** — so `{ path: 'auth', version: '1' }` and `{ version: '1', path: 'auth' }` resolve identically.
     - `_resolveNestLiteralValue` accepts a bare string/template literal (non-interpolated) or a bare numeric literal (for `version: 1`); anything else (array `[...]`, identifier, call expression, imported constant) resolves to `null`.
     - `_parseNestControllerObject` combines the results: if a key is *present* but its value doesn't resolve to a literal, the **whole controller prefix returns `null`** (safe skip, same "dynamic → skip entire controller" behavior established in Step #1) — this is the mechanism behind requirement 3's array-path/imported-constant/complex-expression rejection. When `version` resolves, it becomes route segment `v{version}`; when `path` resolves, it's appended (leading/trailing slashes stripped, consistent with the pre-existing `_joinNestPath` normalization). Segment order is always `v{version}` then `path`, regardless of which order the two keys appeared in the source, per requirement 2's examples.
  4. Only the controller-prefix call site in `_extractNestRoutes` was changed (`_parseNestPathArg(cm[1])` → `_parseNestControllerPrefix(cm[1])`); everything else in the module (Express/Fastify extraction, Next.js pages/app-router extraction incl. Step #5's merge-into-backendRoutes, BFF wrapper extraction, class-body brace matching, method-decorator parsing) is untouched.
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — 20 new tests across 7 `describe` blocks inserted after the existing "NestJS dynamic decorator paths are skipped safely" block: object path only (3 tests — single/double-quote/template-literal), object version only (2 — with and without a method path), object path + version in both key orders (3, including a byte-identical-output cross-check), leading slash normalization (1), dynamic/unsupported values skipped (6 — array path, imported-constant path, computed-expression path, imported-constant version, interpolated template-literal path, plus a no-throw/other-files-still-process check), existing string-literal/no-arg/dynamic-identifier support preserved (3 regression checks), and 2 tests reproducing the exact real-world repo_id=98 controller shapes (`EmployeeController`'s `{ version: '1' }` + method-level path, and `AuthController`'s `{ version: '1', path: 'auth' }` with two methods), including one that runs the result through `linkFrontendBackendApis` to confirm the resolved route actually links.

#### Object-Form Patterns Supported

| Pattern | Resolves to |
|---|---|
| `@Controller({ path: 'users' })` | prefix `users` |
| `@Controller({ path: "/users" })` | prefix `users` (leading slash stripped) |
| `` @Controller({ path: `users` }) `` (no `${...}`) | prefix `users` |
| `@Controller({ version: '1' })` | prefix `v1` |
| `@Controller({ path: 'auth', version: '1' })` | prefix `v1/auth` |
| `@Controller({ version: '1', path: 'auth' })` (reversed key order) | prefix `v1/auth` (identical result) |
| `@Controller({ path: ['users', 'members'], version: '1' })` | **skipped** — array path unsupported |
| `@Controller({ path: ROUTE_PREFIX })` | **skipped** — imported constant unsupported |
| `@Controller({ path: getPrefix() })` | **skipped** — computed expression unsupported |
| `` @Controller({ path: `${prefix}/users` }) `` | **skipped** — interpolated template literal unsupported |
| `@Controller('health')`, `@Controller()` | unchanged — still resolve exactly as before Step #1 |

#### Example Extracted Routes

`@Controller({ version: '1' })` + `@Post('employees')` → `POST /v1/employees` (repo_id=98's `EmployeeController`, previously produced **zero** routes).
`@Controller({ version: '1', path: 'auth' })` + `@Post('login')` / `@Post('logout')` → `POST /v1/auth/login`, `POST /v1/auth/logout` (repo_id=98's `AuthController`, previously produced **zero** routes).

#### Not Changed

- Scoring formulas (`architectureHealthScore`, `linkageScore`, `boundaryHealthScore`, `completenessScore`) — no lines touched in `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, or `buildRepositoryArchitectureSnapshot.js`
- `frontend/dashboard.html` — untouched
- Method-decorator parsing (`@Get`/`@Post`/`@Put`/`@Patch`/`@Delete`) — still exclusively `_parseNestPathArg`, unchanged
- Express, Fastify, Next.js pages/app-router (Step #2/#5), BFF fetch wrappers (Step #3) — unaffected, verified by full regression run

#### Known Remaining Gap (explicitly out of scope, confirmed again by this step's own tests)

RepoPulse still has **no visibility into `main.ts`'s `app.setGlobalPrefix('api', ...)`**. For repo_id=98, the real runtime path for `EmployeeController`'s create-employee endpoint is `/api/v1/employees`; this extractor resolves it to `/v1/employees` (correct given only the `@Controller()`/`@Get()`/etc. decorators are readable — the global prefix is applied imperatively in `main.ts`, invisible to a decorator-only static scan). The new repo_id=98-shaped regression test in this step deliberately targets `/v1/employees` (not `/api/v1/employees`) to isolate verification of the version+path parsing added here from that separate, still-open gap.

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **196/196 passing** (20 new + all 176 pre-existing tests, including Steps #1/#2/#3/#5, unchanged and passing)
- `npx jest tests/unit/execution/architecture` (24 files) → **2,221/2,221 passing** — confirms zero regressions in linking/scoring/snapshot modules
- `npm test --runInBand` → **7,203 / 7,273 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +20 tests vs. prior 7,183/7,253)
- Manually verified via a standalone script before formalizing as tests, including the two exact repo_id=98 controller bodies (`EmployeeController`, `AuthController`) reproduced from the live GitHub content fetched during the prior investigation — both now resolve to the expected `/v1/...` paths

#### Next Actions

- `app.setGlobalPrefix()` awareness (reading `main.ts`/bootstrap files for a global prefix string) would be a natural, separately-scoped follow-up now that version+path object-form parsing is in place — not undertaken here per this step's explicit scope
- No other gaps identified specific to object-form controller parsing

---

### 2026-07-08 — Analyzer Improvement Step #5: Feed Next.js App Router Routes Into API Linkage

**Capability:** Architecture Intelligence — API linkage accuracy (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer pipeline fix — linkage/scoring formulas untouched, backend APIs and frontend UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. **Root cause confirmed by inspection (requirement 1):** `linkFrontendBackendApis()` has only ever received `routeApiStructure.backendRoutes` (Express/Fastify/NestJS) — `nextRoutes` (Next.js pages/app-router) was computed but never passed into linkage at all, in either `extractRouteApiStructure.js` or `buildRepositoryArchitectureSnapshot.js`. This is exactly the gap Step #4's analyzerCoverage warnings 1 and 2 were surfacing (visible, but until now unfixed).
  2. Added a merge step, placed after mount-prefix resolution and before the deterministic sort: for every `nextRoutes` entry with `type === 'app'`, one flattened `{ method, path, file, framework: 'nextjs-app-router', handlerType: 'unknown', handlerName: null }` object is pushed into `backendRoutes` per exported method (Option A from the brief — normalize into `backendRoutes` before `linkFrontendBackendApis()` is ever called, which happens later in `buildRepositoryArchitectureSnapshot.js`'s Stage 4). No changes were needed to `buildRepositoryArchitectureSnapshot.js` at all — it already passes `routeApiStructure.backendRoutes` straight through, so the merged routes flow into `linkFrontendBackendApis`, `verifyArchitectureBoundaries`, `assessImplementationCompleteness`, and `metrics.backendRouteCount` automatically, with zero code changes to any of those four consumers.
  3. Only `type: 'app'` entries are merged. `type: 'pages'` entries are deliberately left out of `backendRoutes`, exactly preserving pre-existing `pages/api` behavior (requirement 4) — a `pages/api` route still does not participate in linkage, same as before this step.
  4. Requirement 3 ("do not include methodless App Router files") required no new guard: Step #2's extraction already guarantees a `route.ts` file with no recognized exported HTTP method produces zero `nextRoutes` entries in the first place, so there is nothing methodless for this merge step to ever pick up.
  5. `nextRoutes` itself is returned completely unchanged (still contains both `'pages'` and `'app'` type entries, verbatim, for backward compatibility with every existing Step #2 test that inspects it directly). To prevent each App Router route from being double-represented once it also exists in `backendRoutes`, a new `pageRoutesOnly = nextRoutes.filter(nr => nr.type !== 'app')` array was introduced and substituted in place of the raw `nextRoutes` argument for exactly three downstream computations that would otherwise have double-counted: the second `unusedBackendRoutes` loop (previously iterated all of `nextRoutes`; now only `pageRoutesOnly`, since `'app'` routes are now covered by the first loop over `backendRoutes`), `_buildEndpointInventory(backendRoutes, pageRoutesOnly, frontendCalls)` (previously would have pushed two `sources` entries — one `'backend'`, one `'next'` — for the same App Router route), and `_buildSummary(backendRoutes, pageRoutesOnly, ...)` (previously would have double-counted App Router routes in the "N backend routes detected" sentence's `backendRoutes.length + nextRoutes.length` total). `_buildRouteKeySet` was left receiving `pageRoutesOnly` too for the same single-representation reasoning, though it would have been harmless either way (Set-based, duplicate key adds are no-ops). `_buildAnalyzerCoverage` continues to receive the full, unfiltered `nextRoutes` (it specifically needs to see `type === 'app'` entries to compute `nextAppRoutesExtracted`, independent of the backendRoutes merge).
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`**:
  - Updated one existing Step #4 test ("backendRoutes/frontendApiCalls/nextRoutes are unaffected by analyzerCoverage computation") whose fixture happened to include both an Express route and an App Router route — its assertion `expect(r.backendRoutes).toHaveLength(1)` was asserting the *old, buggy* behavior (App Router route excluded); updated to `toHaveLength(2)` with explicit checks that both the `express` and `nextjs-app-router` framework entries are present. This is a correctness fix to the test's expectation, not a weakening — the test's actual intent (analyzerCoverage doesn't itself alter extraction results) is unchanged and still verified.
  - 14 new tests across two `describe` blocks: "App Router routes are merged into backendRoutes" (7 tests — merged entry shape/framework tag, `nextRoutes` still populated unchanged, multi-method expansion produces one entry per method, `pages/api` confirmed NOT merged, methodless `route.ts` contributes nothing, no duplication in `unusedBackendRoutes` or `endpointInventory`) and "App Router linkage via linkFrontendBackendApis" (7 tests — the exact scenarios requirement 6 lists: `/api/example` frontend call links to `app/api/example/route.ts` GET; dynamic `app/api/users/[id]/route.ts` links to a template-literal `` fetch(`/api/users/${id}`) `` call; method mismatch (GET-only route + POST call) still produces a `methodMismatches` entry and leaves the call unresolved/route orphaned; a methodless `route.ts` still does not link; existing Express linkage unaffected; existing NestJS linkage unaffected; and a combined scenario with Express + NestJS + App Router all linking simultaneously in one repo)

#### How nextRoutes Are Fed Into Linkage

```
extractRouteApiStructure()
  1. _extractNextRoutes() populates nextRoutes[] (type: 'pages' | 'app'), as in Step #2 — unchanged
  2. NEW: for each nextRoutes entry where type === 'app':
       for each method in entry.methods:
         backendRoutes.push({ method, path: entry.urlPattern, file: entry.file,
                               framework: 'nextjs-app-router', handlerType: 'unknown', handlerName: null })
  3. backendRoutes.sort(...) — App Router entries sort in deterministically with Express/Fastify/NestJS
  4. pageRoutesOnly = nextRoutes.filter(type !== 'app')  — used for unusedBackendRoutes/endpointInventory/summary
       to avoid double-representation; nextRoutes itself returned unfiltered

buildRepositoryArchitectureSnapshot() — UNCHANGED
  linkFrontendBackendApis({ backendRoutes: routeApiStructure.backendRoutes, ... })
    → App Router routes now compete for matches exactly like Express/Fastify/NestJS routes
```

#### Example Before/After Linkage Result

Input: `app/api/example/route.ts` with `export async function GET(req) {}`, plus a frontend `fetch('/api/example')`.

**Before this step:**
```js
apiLinkage.linkedEndpoints          // []
apiLinkage.unresolvedFrontendCalls  // [{ from: 'frontend/app.js', method: 'GET', path: '/api/example' }]
apiLinkage.coverage.backendRouteCount  // 0   ← App Router route invisible to linkage
apiLinkage.linkageScore              // 0
```

**After this step:**
```js
apiLinkage.linkedEndpoints          // [{ method: 'GET', path: '/api/example', ... }]
apiLinkage.unresolvedFrontendCalls  // []
apiLinkage.coverage.backendRouteCount  // 1
apiLinkage.linkageScore              // 90
```

Dynamic-route example: `app/api/users/[id]/route.ts` (→ backend path `/api/users/:id`) now correctly links to `` fetch(`/api/users/${id}`) `` (→ frontend path `/api/users/:param`, param-masked to `/api/users/:_p` by `linkFrontendBackendApis`, matching the backend's `:id`→`:_p` mask) — `linkedEndpoints` contains the match, `unresolvedFrontendCalls` is empty.

#### Not Changed

- `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, `buildRepositoryArchitectureSnapshot.js` — zero lines touched; they already operate generically on whatever `routeApiStructure.backendRoutes` contains
- `linkFrontendBackendApis`'s scoring formula (`_score`), `architectureHealthScore`'s weighted-sum formula — unchanged; only the *inputs* (backendRouteCount, linkageScore) now reflect reality more accurately for App Router repos, exactly as intended
- `frontend/dashboard.html` — untouched; the existing "Backend Routes"/"Linked Endpoints"/"API Linkage Score" metric-grid tiles now simply display more accurate numbers for App Router repos as a byproduct, with no UI code changes
- `pages/api` handling — still excluded from `backendRoutes`/linkage, unchanged
- Express, Fastify, NestJS (Step #1) extraction and linkage — unchanged, verified by dedicated regression tests

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **176/176 passing** (14 new tests + 1 corrected pre-existing assertion + all other pre-existing tests unchanged and passing)
- `npx jest tests/unit/execution/architecture` (full architecture suite, 24 files) → **2,207/2,207 passing** — confirms `linkFrontendBackendApis.test.js`, `verifyArchitectureBoundaries.test.js`, `assessImplementationCompleteness.test.js`, and `buildRepositoryArchitectureSnapshot.test.js` all pass unmodified
- `npx jest tests/unit/frontend` (24 files) → **1,541/1,541 passing** — confirms zero UI regressions despite metric values changing for App Router repos
- `npm test --runInBand` → **7,183 / 7,253 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +14 tests vs. prior 7,169/7,239)
- Manually verified via a standalone script before formalizing as tests: static route + matching fetch (linked, score 90), dynamic `[id]` route + template-literal fetch (linked via param masking), method mismatch (POST call against GET-only route → methodMismatches + orphaned + unresolved), methodless `route.ts` (zero routes, call stays unresolved), Express/NestJS linkage (unaffected), `pages/api` (still not merged into backendRoutes)

#### Risks / Limitations

- The param-masking discrepancy between `extractRouteApiStructure`'s own module-local `unusedBackendRoutes`/`unresolvedApiCalls` (exact-string matching, no `:param`-vs-`:id` normalization) and `linkFrontendBackendApis`'s param-aware matching is pre-existing behavior (already present for Express dynamic routes before this step) and applies identically to the newly-merged App Router routes — a dynamic App Router route that *does* link correctly via `linkFrontendBackendApis` can still appear in the module-local `unusedBackendRoutes` list due to the literal `:id` vs `:param` string mismatch at that layer. Not a regression introduced by this step; not in scope to fix here.
- `framework: 'nextjs-app-router'` is a new, distinct string from the pre-existing `'next'` framework tag used for `pages/api` entries and for `nextRoutes` objects generally — intentional, per requirement 2's explicit guidance to preserve this metadata distinctly.

#### Next Actions

- None identified specific to this step; Step #4's analyzerCoverage warnings 1 and 2 should now fire less often for working App Router repos as a natural consequence — no further action needed for that interaction.

---

### 2026-07-08 — Analyzer Improvement Step #4: Framework Support Confidence Warning

**Capability:** Architecture Intelligence — analyzer measurement-confidence metadata (`execution/architecture/extractRouteApiStructure.js`, `execution/architecture/buildRepositoryArchitectureSnapshot.js`, `frontend/dashboard.html`)
**Deliverable status:** Metadata/warnings only, as scoped — architecture scoring thresholds and linkage scoring formulas untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. Added `_buildAnalyzerCoverage(normalized, backendRoutes, nextRoutes, frontendCalls)` plus three new regex/constant hint-detectors: `NEST_HINT_RE` (`@Controller|@Get|@Post|@Put|@Patch|@Delete|@Module|@Injectable`), `BFF_HINT_RE` (`serverFetch(`/`apiFetch(`/`internalFetch(`/`backendFetch(`), and `NEXT_APP_ROUTER_FILE_RE` (`(src/)?app/api/**/route.*` — path existence only, independent of whether an HTTP handler was actually recognized)
  2. These hints are raw signals scanned once per file (comment-stripped) alongside a second, independent read of already-computed `backendRoutes`/`nextRoutes`/`frontendApiCalls` to determine what was *actually extracted* (`nestRoutesExtracted`, `nextAppRoutesExtracted`, `bffCallsExtracted`) — hints and extraction results are deliberately kept separate so the warnings can compare "looks like this framework" against "did extraction succeed"
  3. Four warning conditions implemented exactly as specified (see below), collected into a `warnings` array; `unsupportedRisk` derived as `warnings.length === 0 ? 'low' : warnings.length === 1 ? 'medium' : 'high'` (no formula was mandated — this is a simple, deterministic, monotonic mapping); `supportedPatterns` lists which of `express`/`fastify`/`nestjs-decorators`/`nextjs-pages`/`nextjs-app-router`/`bff-fetch-wrappers` were actually found working in this repo
  4. Returned as a new `analyzerCoverage` key on `extractRouteApiStructure`'s output, alongside the pre-existing `frameworkHints` object (left untouched — `analyzerCoverage.frameworkHints` is a distinct, differently-named nested object: `{ nestjs, nextAppRouter, bffFetchWrappers }` vs. the existing `{ hasExpressRoutes, hasFastifyRoutes, hasNextApiRoutes, hasFrontendApiCalls, likelyFullStackApiIntegration }`)
  5. **Notable existing-architecture finding surfaced by this work:** `nextRoutes` (Next.js pages/app-router routes) have never been passed into `linkFrontendBackendApis` — only `routeApiStructure.backendRoutes` (Express/Fastify/NestJS) feeds the actual linkage/scoring engine (confirmed by re-reading `buildRepositoryArchitectureSnapshot.js` stage 4). This means a Next.js App Router repo whose own frontend calls its own App Router API will *always* show `backendRoutes === 0` to the linkage engine even when Step #2's extraction is working correctly and `nextRoutes` is populated. This is precisely the scenario warning 1 and warning 2 are designed to catch — the warnings correctly fire in that case, surfacing the known gap as a measurement-confidence note rather than silently mis-scoring the repo. Fixing that gap (wiring `nextRoutes` into `backendRoutes`/linkage) would be a linking/scoring change and is out of scope for this step.
- **`execution/architecture/buildRepositoryArchitectureSnapshot.js`**: added one line — `analyzerCoverage: routeApiStructure.analyzerCoverage` — to the top-level snapshot return object, sibling to `apiLinkage`/`routeApiStructure`/`metrics`. No other line in this file was touched; `_calcHealthScore`, `_metrics()`, and every other scoring/aggregation function are unchanged and verified via a test asserting `architectureHealthScore` still equals the documented `boundary*0.40 + completeness*0.40 + linkage*0.20` formula regardless of whether `analyzerCoverage` has warnings
- **`frontend/dashboard.html`**: added `buildAnalyzerCoverageHtml(coverage)` (pure renderer, returns `''` when there are no warnings) and one call site — `html += buildAnalyzerCoverageHtml(data.analyzerCoverage);` — inserted into `buildRepositoryArchitectureHtml` immediately after the existing API Linkage panel closes and before the Circular Dependencies panel. Styled with a neutral `aq-badge severity-neutral` badge (never `severity-critical`/`severity-high`) and an explicit muted-text framing sentence ("These notes describe scanner measurement confidence, not application architecture risk.") per the UI guidance
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — 16 new tests across 6 `describe` blocks: `analyzerCoverage` shape/defaults, NestJS hint-vs-extraction warning (including the "supported routes extracted avoids the warning" case and an `@Injectable`/`@Module`-only-hints-elsewhere-with-a-working-controller non-warning case), Next.js App Router hint-vs-extraction warning (including `src/app/api`), frontend/BFF-without-backend warning (including that plain `fetch()` alone does *not* set the `bffFetchWrappers` hint — only the four named wrappers do), `unsupportedRisk` scaling (0/1/2+ warnings → low/medium/high), and a regression check that `backendRoutes`/`frontendApiCalls`/`nextRoutes` are byte-identical whether or not `analyzerCoverage` runs
- **`tests/unit/execution/architecture/buildRepositoryArchitectureSnapshot.test.js`** — 5 new tests: `analyzerCoverage` present at the top level with the expected keys, same object reference as `routeApiStructure.analyzerCoverage`, a NestJS-hints-no-routes repo surfaces a warning at the top level, a fully working full-stack repo has zero warnings, and `architectureHealthScore` matches the documented weighted-sum formula identically whether or not warnings are present
- **`tests/unit/frontend/dashboardArchitectureTab.test.js`** — verbatim copy of `buildAnalyzerCoverageHtml` added and wired into the verbatim copy of `buildRepositoryArchitectureHtml` at the same call site as production; 15 new tests: 11 direct unit tests on `buildAnalyzerCoverageHtml` (null/undefined/empty/missing/non-array warnings all render `''`; label renders; every warning becomes an `<li>`; `unsupportedRisk` renders in the confidence badge and defaults to `'low'`; explicitly asserts `severity-critical`/`severity-high` classes are never used; asserts the measurement-confidence framing sentence is present) + 4 integration tests through `buildRepositoryArchitectureHtml` (renders when warnings exist, renders nothing when warnings are empty, renders nothing when `analyzerCoverage` is absent entirely for older cached snapshots, and the "supported NestJS routes avoid the warning" case end-to-end)

#### Analyzer Coverage Object Shape

```js
analyzerCoverage: {
  frameworkHints: {
    nestjs: boolean,            // @Controller/@Get/@Post/@Put/@Patch/@Delete/@Module/@Injectable found anywhere
    nextAppRouter: boolean,     // (src/)?app/api/**/route.* file path found anywhere
    bffFetchWrappers: boolean,  // serverFetch(/apiFetch(/internalFetch(/backendFetch( found anywhere
  },
  supportedPatterns: string[],  // subset of: express, fastify, nestjs-decorators, nextjs-pages, nextjs-app-router, bff-fetch-wrappers
  unsupportedRisk: 'low' | 'medium' | 'high',  // by warnings.length: 0 / 1 / 2+
  warnings: string[],           // 0–4 of the exact strings below
}
```

#### Warning Conditions Implemented (verbatim strings, exactly as specified)

1. `(nestjs || nextAppRouter || bffFetchWrappers hint) && backendRoutes.length === 0` → "Framework patterns detected but no backend routes were extracted; architecture linkage may be underreported."
2. `frontendApiCalls.length > 0 && backendRoutes.length === 0` → "Frontend/BFF API calls were detected without matching backend route extraction; verify framework support before treating unresolved calls as architecture debt."
3. `nextAppRouter hint && !nextAppRoutesExtracted` (no `nextRoutes` entry of `type: 'app'`) → "Next.js App Router files were detected but no exported HTTP handlers were recognized."
4. `nestjs hint && !nestRoutesExtracted` (no `backendRoutes` entry with `framework: 'nestjs'`) → "NestJS decorators were detected but no routes were extracted."

#### UI Rendering Behavior

An "Analyzer Coverage" sub-panel appears in the Architecture tab, directly below API Linkage, **only when `analyzerCoverage.warnings.length > 0`** — otherwise `buildAnalyzerCoverageHtml` returns `''` and nothing is added to the panel (verified for both an empty-warnings `analyzerCoverage` object and a snapshot with no `analyzerCoverage` field at all, for backward compatibility with older cached snapshots). When present, it shows: a muted framing sentence explicitly disclaiming application-risk framing, a `severity-neutral` "Coverage confidence: {low|medium|high}" badge, and each warning as a plain `<li>` in muted secondary text — no red/orange/critical styling anywhere.

#### Not Changed

- `linkFrontendBackendApis.js` linkage/scoring formulas — untouched (verified: `architectureHealthScore` still equals the documented weighted-sum formula in every test, with or without `analyzerCoverage` warnings present)
- `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js` scoring — untouched
- Route/API extraction behavior from Steps #1–#3 (NestJS, Next.js App Router, serverFetch/BFF) — untouched; regression test confirms `backendRoutes`/`frontendApiCalls`/`nextRoutes` are identical with or without the new hint-scanning pass
- Existing `frameworkHints` object on `routeApiStructure` — untouched; the new hint data lives in a separately-named nested object under `analyzerCoverage` to avoid any collision
- Existing recommendations (`_recommendations` in `linkFrontendBackendApis.js`, `assessImplementationCompleteness.js`, `verifyArchitectureBoundaries.js`) — untouched; `analyzerCoverage.warnings` are a separate list, never merged into `recommendations`

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js tests/unit/execution/architecture/buildRepositoryArchitectureSnapshot.test.js tests/unit/frontend/dashboardArchitectureTab.test.js` → **162 + (existing suite, +5 new) + 32 passing**, all new and pre-existing tests green
- `npm test --runInBand` → **7,169 / 7,239 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +36 tests vs. prior 7,133/7,203)
- Manually verified every warning-condition combination via a standalone script before formalizing as tests (dynamic-prefix NestJS controller, method-less Next.js route.ts, frontend-calls-only repo, working NestJS controller with `@Module`/`@Injectable` hints elsewhere, plain repo with no hints, fully working Express+fetch repo)

#### Risks / Limitations

- Hint detection is repo-wide (any file), while extraction-success checks are also repo-wide — a large monorepo with one broken NestJS module and one working one would not warn (correctly, since *some* NestJS routes were extracted), which is the intended coarse-grained behavior; per-file/per-module granularity was not requested and would be a larger change
- `unsupportedRisk`'s warnings-count-based mapping is a simple heuristic, not a calibrated formula — acceptable since requirement 2 only "suggested" a shape and did not mandate an exact calculation
- The Next.js `nextRoutes`-not-fed-into-`backendRoutes` architectural gap identified above is now *visible* via warnings but still *unfixed* — intentionally, per scope ("do not change... linkage scoring in this step")

#### Next Actions

- Consider (in a future, separately-scoped step) whether `nextRoutes` should be wired into the actual `linkFrontendBackendApis` linkage engine, now that its absence is a known, warned-about gap rather than a silent one
- Consider surfacing `analyzerCoverage.supportedPatterns` in the UI as a positive/informational complement to the warnings, if user feedback indicates it would help interpret the confidence badge

---

### 2026-07-08 — Analyzer Improvement Step #3: serverFetch / BFF API Call Detection

**Capability:** FR-004/Architecture Intelligence — frontend/BFF API call discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — call extraction only; scoring/linking/route extraction/UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. Added four new regex constants mirroring the existing `FETCH_*` set exactly, but matching `serverFetch`, `apiFetch`, `internalFetch`, or `backendFetch` in place of `fetch`, with the wrapper name captured in group 1: `BFF_SQ_RE` (single-quoted), `BFF_DQ_RE` (double-quoted), `BFF_TMPL_RE` (template literal, with or without `${...}` interpolation via the existing `_normTemplateParams`), and `BFF_CONCAT_RE` (two-segment string concatenation, e.g. `serverFetch('/api/repos/' + id + '/metrics')`)
  2. Added a matching extraction block inside `_extractFrontendCalls`, placed after the existing `client.request()` block — same processing order/logic as the `fetch()` block: concatenation form runs first (tracked via its own `bffConcatPositions` Set, mirroring `concatPositions`, so `BFF_SQ_RE` doesn't also emit the truncated prefix), then single-quoted, then double-quoted, then template-literal forms
  3. Default method is `GET` when no options object is present; `FETCH_OPTS_RE` (already generic, not fetch-specific despite its name) is reused unchanged to detect `{ method: 'POST' }`-style options following any of the four wrapper calls
  4. Every extracted call carries `client: <wrapperName>` (`'serverFetch'`, `'apiFetch'`, `'internalFetch'`, or `'backendFetch'`) — reusing the existing `frontendApiCalls[].client` field that already served this exact source/type role for `fetch`/`axios`/`apiClient`/`client` calls, per requirement 6; no new field was introduced
  5. Only paths starting with `/` are captured (`if (!rawPath.startsWith('/')) continue;`, identical guard to every other call-extraction pattern in this file) — absolute external URLs (`serverFetch('https://example.com/...')`) and calls to any identifier other than the four named wrappers are structurally invisible to these regexes and require no separate exclusion logic
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — new `describe` block "serverFetch/apiFetch/internalFetch/backendFetch" inserted directly after the existing `client.request` block (11 new tests): each of the four wrapper names, all four path forms (single-quote, template literal with interpolation, string concatenation, method-option object with both single- and double-quoted method values), external-URL rejection, unsupported-wrapper-name rejection, a same-file regression check that `fetch()`/`axios.*` extraction is unaffected when `serverFetch` calls are also present, and a full-pipeline check that a `serverFetch` call links to a matching backend route via `linkFrontendBackendApis`

#### Wrapper Names Supported

`serverFetch`, `apiFetch`, `internalFetch`, `backendFetch` — matched as literal identifiers immediately followed by `(`; a differently-named custom helper (e.g. `randomHelper('/api/x')`) is not recognized, per requirement 5.

#### Example Extracted Calls

| Input | Extracted call |
|---|---|
| `serverFetch('/api/repos')` | `{ method: 'GET', path: '/api/repos', client: 'serverFetch' }` |
| `` serverFetch(`/api/repos/${id}`) `` | `{ method: 'GET', path: '/api/repos/:param', client: 'serverFetch' }` |
| `serverFetch('/api/repos/' + id + '/metrics')` | `{ method: 'GET', path: '/api/repos/:_p/metrics', client: 'serverFetch' }` |
| `serverFetch('/api/repos', { method: 'POST' })` | `{ method: 'POST', path: '/api/repos', client: 'serverFetch' }` |
| `apiFetch('/api/x', { method: "PATCH" })` | `{ method: 'PATCH', path: '/api/x', client: 'apiFetch' }` |
| `internalFetch('/api/y')` | `{ method: 'GET', path: '/api/y', client: 'internalFetch' }` |
| `backendFetch('/api/z')` | `{ method: 'GET', path: '/api/z', client: 'backendFetch' }` |
| `serverFetch('https://example.com/api/x')` | *not captured — absolute URL* |
| `randomHelper('/api/x')` | *not captured — unsupported wrapper name* |

#### Not Changed

- Backend route extraction (Express/Fastify/NestJS/Next.js pages+app router, Steps #1 and #2) — untouched; all pre-existing tests for these re-run and passing unmodified
- `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, `buildRepositoryArchitectureSnapshot.js`, `frontend/dashboard.html` — no changes; BFF calls flow through the existing `frontendApiCalls` contract (same `{ method, path, file, client }` shape already produced by `fetch`/`axios`/`apiClient`/`client.request`), so linking, scoring, and UI display all work on these calls automatically with zero additional wiring
- `fetch()`, `axios.*`, `apiClient.*`, `client.request()` extraction — unchanged; explicit same-file regression test added confirming all four continue to coexist correctly

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **146/146 passing** (11 new serverFetch/BFF tests + all 135 pre-existing tests, including Steps #1 and #2, unchanged and passing)
- `npm test --runInBand` → **7,133 / 7,203 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +11 tests vs. prior 7,122/7,192)
- Manually verified every pattern from the requirements via a standalone script before formalizing as tests, including the external-URL and non-wrapper rejection cases

#### Risks / Limitations

- `BFF_CONCAT_RE` inherits the same "exactly two string segments joined by exactly one non-string expression" shape as `FETCH_CONCAT_RE` — a three-segment concatenation (`serverFetch('/api/' + a + '/' + b)`) is not handled, consistent with the existing fetch-concatenation limitation noted in the prior architecture-linkage investigation
- Wrapper detection is name-based, not import-aware — a local variable or unrelated function coincidentally named `serverFetch`/`apiFetch`/`internalFetch`/`backendFetch` that isn't actually an HTTP call wrapper would be misclassified as an API call; considered an acceptable false-positive risk given the specificity of these names, consistent with this module's existing approach of trusting conventional naming (e.g. `axios`, `apiClient`, `client`) rather than verifying imports

#### Next Actions

- Consider adding further wrapper name aliases if repos are found using other common naming conventions (e.g. `serverApi`, `bffFetch`) once observed in practice, rather than speculatively

---

### 2026-07-08 — Analyzer Improvement Step #2: Next.js App Router Route Handler Detection

**Capability:** FR-004/Architecture Intelligence — backend route discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — extraction only; scoring/linking/UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. `_nextUrlFromPath`'s `appMatch` regex extended from `^app\/api\/(.+)\/route\.[jt]sx?$` to `^(?:src\/)?app\/api\/(.+)\/route\.[jt]sx?$` — now recognizes `src/app/api/**/route.{js,ts,jsx,tsx}` in addition to `app/api/**/route.{js,ts,jsx,tsx}` (the `.jsx`/`.tsx` extensions were already covered by the existing `[jt]sx?` character class, only the `src/` prefix was missing)
  2. Added two new export-detection regexes alongside the existing `export (async)? function GET(...)` pattern (renamed `NEXT_EXPORT_METHOD_RE` → `NEXT_EXPORT_FUNCTION_RE` for clarity, no behavior change to that pattern itself):
     - `NEXT_EXPORT_CONST_RE` — `export const PATCH = async (...) => {}` / `export const DELETE = function (...) {}` (matches the `const NAME =` assignment form regardless of whether the right-hand side is an arrow function, a function expression, async or not — the method name is all that's captured)
     - `NEXT_EXPORT_LIST_RE` + `_parseNextExportListMethods` — `export { GET, POST }` and the aliased form `export { someHandler as GET }`; splits the brace contents on commas and resolves `name as ALIAS` pairs to the alias, since that's the externally-visible name Next.js's route-handler convention actually dispatches on
  3. All three regexes' matches are unioned into the same `methods` array before deduplication (`[...new Set(methods)].sort()`), so a file mixing patterns (e.g. one method as a function export, another as a `const` arrow export) is fully detected
  4. **Behavior change, in scope per requirement 5:** for `type === 'app'` files, if none of the three regexes find any exported HTTP method, `_extractNextRoutes` now returns `[]` (no route emitted) instead of the previous fallback of `methods: ['*']`. This prevents inventing all-methods coverage for a `route.ts` file that doesn't actually export a recognized HTTP handler (e.g. a file only exporting `revalidate`/`dynamic` config constants). The `pages/api` wildcard-fallback branch (`methods.push('*')`) is untouched — this change only affects the `app` Router type branch
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — new `describe` block "Next.js App Router (src/app/api and dynamic segments)" inserted directly after the existing "Next.js app/api" block (12 new tests): `src/app/api` prefix detection, dynamic segment `[id]` → `:id` combined with a nested static segment (`/edit`), `export const PATCH = async`, `export const DELETE = function`, `export const PUT` mixed with a function-form `GET` in the same file, `export { GET, POST }` both aliased and bare-identifier forms, a `route.ts` with no exported HTTP method producing zero routes (and confirmed absent from `unusedBackendRoutes`/`endpointInventory` too), and an explicit regression check that the `pages/api` wildcard-fallback (`methods: ['*']`) is unchanged

#### Next.js App Router Patterns Supported

| Input | Resolved route(s) |
|---|---|
| `app/api/auth/login/route.ts` + `export async function GET(req) {}` | `GET /api/auth/login` |
| `src/app/api/candidates/[id]/edit/route.ts` + `export async function GET/POST` | `GET, POST /api/candidates/:id/edit` |
| `app/api/health/route.js` + `export function GET() {}` | `GET /api/health` |
| `export const PATCH = async (req) => {...}` | `PATCH` on that file's route |
| `export const DELETE = function (req) {...}` | `DELETE` on that file's route |
| `export { GET, POST }` (bare identifiers) | `GET, POST` on that file's route |
| `export { handleGet as GET, handlePost as POST }` (aliased) | `GET, POST` on that file's route |
| `route.ts` exporting only `CONFIG`/`revalidate` (no HTTP method) | *no route emitted — was previously `methods: ['*']`* |

#### Not Changed

- `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, `buildRepositoryArchitectureSnapshot.js`, `frontend/dashboard.html` — no changes; Next.js App Router routes flow through the existing `nextRoutes` → route-key-set → `backendRoutes`-equivalent matching contract unmodified
- `pages/api` detection — regex, behavior, and wildcard-fallback (`methods: ['*']`) all unchanged; explicit regression test added
- Express, Fastify, and NestJS (Step #1) detection — unchanged; full pre-existing test suite for all three re-run and passing unmodified

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **135/135 passing** (12 new App Router tests + all 123 pre-existing tests, including the 16 NestJS tests from Step #1, unchanged and passing)
- `npm test --runInBand` → **7,122 / 7,192 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +12 tests vs. prior 7,110/7,180)
- Manually verified both literal examples from the requirements via a standalone script before formalizing as tests: `app/api/auth/login/route.ts` → `/api/auth/login`; `src/app/api/candidates/[id]/edit/route.ts` → `/api/candidates/:id/edit`; `app/api/health/route.js` → `/api/health`

#### Risks / Limitations

- `NEXT_EXPORT_LIST_RE`'s `[^}]*` capture does not handle a nested object literal inside the export list (not a valid JS export-list shape in practice, so not a real-world gap)
- `export const GET: RouteHandler = async (...) => {}` (explicit TypeScript type annotation between the name and `=`) is **not** matched — `NEXT_EXPORT_CONST_RE` requires `=` to immediately follow the method name (optional whitespace only); a type-annotated const export would be skipped, understating coverage for repos using that style. Not covered by this step; flagged for a possible future refinement
- The requirement-5 skip behavior for method-less `route.ts` files means a route handler file whose only exports are non-standard (e.g., a custom-named handler never wired to `GET`/`POST`/etc.) is invisible to the analyzer — same "prefer silence over a wrong guess" tradeoff already accepted for NestJS dynamic paths in Step #1

#### Next Actions

- Consider TypeScript type-annotated `const` export support (`export const GET: RouteHandler = ...`) if encountered in real repos
- Consider catch-all segment (`[...slug]`) normalization if portfolio analysis surfaces App Router repos using it

---

### 2026-07-08 — Analyzer Improvement Step #1: NestJS Route Detection

**Capability:** FR-004/Architecture Intelligence — backend route discovery (`execution/architecture/extractRouteApiStructure.js`)
**Deliverable status:** Analyzer accuracy improvement — extraction only; scoring/linking/UI untouched

#### What Changed

- **`execution/architecture/extractRouteApiStructure.js`**:
  1. Added `_extractNestRoutes(filePath, src)` and supporting helpers (`_parseNestPathArg`, `_matchingBraceIndex`, `_joinNestPath`) — regex-based detection of NestJS decorator-based controllers, matching the existing text-scanning approach used for Express/Fastify (no AST parser introduced)
  2. Recognizes `@Controller()` (with optional string-literal prefix) and the five method decorators named in scope: `@Get()`, `@Post()`, `@Put()`, `@Patch()`, `@Delete()` (`@Head`/`@Options`/`@All`/custom decorators intentionally out of scope)
  3. Controller prefix + method path are resolved independently (single-quote, double-quote, and non-interpolated template-literal arguments all supported; empty arguments resolve to `''`), then combined via `_joinNestPath` with leading/trailing slash normalization
  4. Class body boundary is found via a plain brace-depth counter (`_matchingBraceIndex`) over comment-stripped source, starting from the first `{` after the `class` keyword following each `@Controller` match — supports multiple independent controllers per file
  5. Dynamic arguments (bare identifiers, expressions, or template literals containing `${...}`) resolve to `null` from `_parseNestPathArg` and are skipped safely: a dynamic **method** path skips only that one route; a dynamic **controller** prefix skips the entire controller (since no safe path can be derived for any of its routes)
  6. Wired into the main extraction loop (line ~615) alongside `_extractExpressRoutes`, under the same `!f.path.endsWith('.md')` guard; extracted routes are pushed directly into the existing `backendRoutes` array with `framework: 'nestjs'` — no changes needed to `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, `buildRepositoryArchitectureSnapshot.js`, or `frontend/dashboard.html`, since all of them already operate generically on `routeApiStructure.backendRoutes` by method+path
- **`tests/unit/execution/architecture/extractRouteApiStructure.test.js`** — 6 new `describe` blocks added after the existing Next.js `app/api` section (16 new tests): controller-prefix + method-path resolution (incl. both quote styles and non-interpolated template literals), empty decorator paths, root controller path, multiple methods/multiple controllers in one file, dynamic-path skip behavior (method-level and controller-level), and NestJS routes correctly participating in `endpointInventory`/`unusedBackendRoutes`/`linkFrontendBackendApis` linkage

#### NestJS Patterns Supported

| Input | Resolved route |
|---|---|
| `@Controller('api/auth')` + `@Get('login')` | `GET /api/auth/login` |
| `@Controller('/api/users')` + `@Post()` | `POST /api/users` |
| `@Controller()` + `@Get('/health')` | `GET /health` |
| `@Controller()` + `@Get()` | `GET /` |
| `` @Controller(`api/items`) `` + `` @Put(`:id`) `` (template literal, no interpolation) | `PUT /api/items/:id` |
| `@Controller('api/dyn')` + `@Get(someVar)` (dynamic identifier) | *skipped — no route emitted* |
| `` @Get(`${prefix}/x`) `` (template literal with interpolation) | *skipped — no route emitted* |
| `@Controller(basePath)` (dynamic controller prefix) | *entire controller skipped — no routes emitted* |

#### Not Changed

- `linkFrontendBackendApis.js`, `verifyArchitectureBoundaries.js`, `assessImplementationCompleteness.js`, `buildRepositoryArchitectureSnapshot.js` — no changes; NestJS routes flow through the existing `backendRoutes` contract unmodified
- `frontend/dashboard.html` — no changes; Backend Routes / Linked Endpoints / API Linkage Score displays now populate correctly for NestJS repos purely as a byproduct of `backendRoutes` no longer being empty
- `routeApiStructure.frameworkHints` — left as-is (`hasExpressRoutes`/`hasFastifyRoutes`/`hasNextApiRoutes` unchanged); no `hasNestRoutes` hint added — out of scope for this step
- `@Head`, `@Options`, `@All`, and custom NestJS route decorators — not recognized, per explicit scope

#### Validation

- `npx jest tests/unit/execution/architecture/extractRouteApiStructure.test.js` → **123/123 passing** (16 new NestJS tests + all 107 pre-existing Express/Fastify/Next.js/fetch/axios/linkage tests unchanged and passing)
- `npm test --runInBand` → **7,110 / 7,180 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net +16 tests vs. prior 7,094/7,164)
- Manually verified both literal examples from the requirements (`@Controller('api/auth')` + `@Get('login')` → `GET /api/auth/login`; `@Controller('/api/users')` + `@Post()` → `POST /api/users`) via a standalone script before formalizing as tests
- Verified existing Express (`app.get`), Fastify, and Next.js (`app/api`) extraction is byte-for-byte unaffected by re-running the full `extractRouteApiStructure.test.js` suite (all pre-existing assertions still pass unmodified)

#### Risks / Limitations

- Class-body boundary detection uses a naive brace-depth counter with no string/template-literal awareness — a `{`/`}` character inside a string literal within the controller class body could in principle throw off the boundary (same class of limitation as the rest of this module's text-based parsing, e.g. mount-prefix resolution's naive path splitting); not observed in the test cases but not structurally impossible for pathological input
- Only one level of decorator argument parsing — a computed prefix built from multiple concatenated literals (e.g. `@Controller('api/' + 'users')`) is treated as dynamic and skipped, even though it's technically static
- Router variable naming is irrelevant for NestJS (class-decorator-based, not variable-based), so this closes the specific false-negative class identified in the prior architecture-linkage investigation for NestJS repos specifically — Koa/Hapi/tRPC/GraphQL/non-Node backends remain undetected (unchanged, out of scope for this step)

#### Next Actions

- Consider a future step adding `@Head`/`@Options`/`@All` if NestJS repos are found using them
- Consider surfacing a `hasNestRoutes` framework hint if portfolio-level framework visibility becomes valuable

---

### 2026-07-07 — Repository Overview Refinement #10: Simplify Operational Status Sections

**Capability:** FR-003 Project Dashboard — Overview tab simplification (removal of low-value operational sections)
**Deliverable status:** UI refinement — backend APIs and risk-engine modules untouched

#### What Changed

- **`frontend/dashboard.html`**:
  1. `buildRepoMetricsHtml(data)` simplified — now renders only **Commits (7d)**; `openPrs`, `stalePrs`, `openIssues` fields and the 2-column CSS grid layout removed (single-line output)
  2. `buildRepoRiskHtml()`, `buildRepoPrHealthHtml()`, `buildRepoEventsHtml()` — **deleted entirely** (Risk Score, PR Health, Recent Events build functions no longer exist)
  3. `loadRepoRisk()`, `loadRepoPrHealth()`, `loadRepoEvents()` — **deleted entirely** (their fetch calls to `/api/repos/:id/risk`, `/pr-health`, `/events` from the Overview tab no longer fire); `loadRepoMetrics()` retained unchanged
  4. Overview tab panel HTML — `Risk Score`, `PR Health`, `Recent Events` section headers and their `#repo-ops-risk-content`, `#repo-ops-pr-health-content`, `#repo-ops-events-content` containers removed from the panel template; `Operational Metrics` header + `#repo-ops-metrics-content` container retained
  5. `selectRepo()` — call sites for `loadRepoRisk(repo.id)`, `loadRepoPrHealth(repo.id)`, `loadRepoEvents(repo.id)` removed; `loadRepoMetrics(repo.id)` call retained
  6. `buildAttentionDriversHtml(aq)` (Operational Risk Drivers) — **no code change**; already returns `''` when `aq.drivers` is empty, which satisfies "only render when a meaningful change or active operational risk needs attention" (drivers are only appended by `getAttentionQueue.js` when a real threshold condition fires — see `execution/risk/getAttentionQueue.js` weight table)
- **`tests/unit/frontend/dashboardOperationalStatus.test.js`** — rewritten to cover only the simplified `buildRepoMetricsHtml`; all `buildRepoRiskHtml`/`buildRepoPrHealthHtml`/`buildRepoEventsHtml` describe blocks removed; `buildRepoMetricsHtml` value tests updated to assert `openPrs`/`stalePrs`/`openIssues` are absent from output

#### Not Changed

- `backend/routes/repoRoutes.js` — `GET /api/repos/:id/metrics`, `/risk`, `/pr-health`, `/events` endpoints untouched (all four Backend APIs preserved per scope)
- Architecture Health, Forecast, Governance, Snapshot Coverage, and Architecture Confidence overview cards — untouched
- Architecture Assessment and Architecture Recommendations sections — untouched
- `tests/unit/frontend/dashboardRepoPriority.test.js` — `buildAttentionDriversHtml` tests (guard conditions, render, sort, cap-at-5) untouched; function behavior unchanged

#### Dead Code Left Intentionally

None. `buildRepoRiskHtml`, `buildRepoPrHealthHtml`, `buildRepoEventsHtml`, `loadRepoRisk`, `loadRepoPrHealth`, `loadRepoEvents` had no remaining consumers after the Overview containers were removed (each `loadRepoX` guards on `document.getElementById(...)` and would have silently no-op'd forever) — cleanly deleted rather than left as dead code, per CLAUDE.md's guidance against half-finished/unused code paths.

#### Validation

- `npm test --runInBand` → **7,094 / 7,164 passing** (70 skipped — 63 integration DB + 7 SMTP opt-in; 0 failing; net −51 tests vs. prior 7,145/7,215, all from deleted dead-function test coverage)
- Verified: no remaining references to `buildRepoRiskHtml`, `buildRepoPrHealthHtml`, `buildRepoEventsHtml`, `loadRepoRisk`, `loadRepoPrHealth`, `loadRepoEvents`, `repo-ops-risk-content`, `repo-ops-pr-health-content`, `repo-ops-events-content` anywhere in `frontend/dashboard.html` or `tests/`
- Verified: empty-state strings "No pull request activity detected.", "No recent operational events detected.", and risk-delta "unchanged" text no longer render anywhere (their owning sections are gone)
- Not verified: no browser/Playwright pass performed for this refinement (unit tests only, per CLAUDE.md E2E tooling being Playwright-driven and out of scope for this text-only structural change)

#### Capability Maturity Change

FR-003 Project Dashboard — Overview tab: no change to overall Integrated/Tested status; scope reduced (fewer, higher-signal sections) rather than functionality added. `execution/risk/getAttentionQueue.js` (Operational Risk Drivers source) unaffected.

---

### 2026-06-25 — Dashboard Refinement #1: Remove Portfolio Briefing + Portfolio Forecast Tab

**Capability:** FR-003 Project Dashboard — UI surface area reduction  
**Deliverable status:** UI refinement — backend APIs and intelligence modules untouched

#### What Changed

- **`frontend/dashboard.html`** — 6 categories of removal:
  1. **HTML**: `<!-- Portfolio Briefing -->` comment + `<div id="portfolio-briefing"></div>` removed
  2. **HTML**: `<button data-ptab="forecast">Portfolio Forecast</button>` tab button removed; tab count reduced from 4 → 3
  3. **HTML**: `<div class="repo-tab-panel" data-ppanel="forecast"><div id="portfolio-forecast"></div></div>` panel removed
  4. **CSS**: `/* ── Portfolio Forecast panel */` comment updated to `/* ── pf-* shared badge/signal/count classes */` (CSS rules preserved — `pf-badge`, `pf-panel`, `pf-signals`, `pf-signal`, `pf-counts`, `pf-count-*`, `pf-summary` are reused by architecture, confidence, and other per-repo renderers)
  5. **JS functions removed**: `buildPortfolioForecastHtml()`, `buildPortfolioBriefingHtml()`, `renderPortfolioBriefing()`, `loadPortfolioForecast()`
  6. **JS call sites removed**: `renderPortfolioBriefing()` removed from `loadRepos`, `loadPortfolioArchitecture`, `loadPortfolioGovernance`, `loadPortfolioWatchlists`, `loadExecutiveSummary`; `loadPortfolioForecast()` removed from `refresh()`
- **`tests/unit/frontend/dashboardPortfolioTabs.test.js`** — updated from 4-tab to 3-tab structure:
  - Structure tests: count assertions updated (4→3 buttons, 4→3 panels); `>Portfolio Forecast<` label removed; `data-ptab="forecast"` assertions removed; nesting test rewritten without forecast entries
  - Mock DOM rebuilt with 3 buttons/panels (forecast removed)
  - Switcher `describe` blocks for `forecast` tab removed; remaining governance/watchlists/architecture describe blocks retained
  - Test count: 32 tests (was 37 — 5 forecast-specific switcher tests removed as they tested a removed UI element)

#### Not Changed

- `backend/routes/portfolioRoutes.js` — `GET /api/portfolio/forecast` endpoint untouched
- `execution/architecture/buildPortfolioForecastingIntelligence.js` — untouched
- `frontend/dashboard.html` — `buildExecutiveBriefing()`, `renderExecutiveBriefing()`, Executive Briefing DOM, summary cards all untouched
- `tests/unit/frontend/dashboardPortfolioBriefing.test.js` — 48 tests retained; they copy `buildPortfolioBriefingHtml` verbatim and remain self-contained passing tests (function removed from dashboard.html but test has its own copy)
- `tests/unit/frontend/dashboardPortfolioForecast.test.js` — retained; same self-contained pattern

#### Dead Code Left Intentionally

None. All removed functions are cleanly deleted. Backend forecast APIs and execution modules are intact for future reactivation at the API/intelligence layer.

#### Validation

- `npm test --runInBand` → **6,794 / 6,864 passing** (70 skipped; 0 failing; 100/105 suites passing; 5 skipped = integration)
- Verified: no `portfolio-briefing`, `portfolio-forecast`, `data-ptab="forecast"`, `data-ppanel="forecast"`, `buildPortfolioBriefingHtml`, `renderPortfolioBriefing`, `loadPortfolioForecast`, `buildPortfolioForecastHtml` remain in `dashboard.html`
- Verified: `pf-*` CSS classes retained — still used at lines ~4080, 4192, 4818-4835, 7023-7064 by architecture, confidence, and watchlist renderers

#### Capability Maturity Change

FR-003 Dashboard: **Integrated / Tested** — tab structure reduced from 4 to 3; Portfolio Briefing surface removed; no regression to other dashboard capabilities.

---

### 2026-06-19 — Sync Empty-Result Bug Fix (fetchUserRepos affiliation + pagination + error logging)

**Capability:** GitHub Data Ingestion (FR-004) — repository sync reliability  
**Deliverable status:** Required — sync returning `{"repos":[]}` despite valid token was a silent runtime failure

#### Root Causes

1. **`fetchUserRepos` — `affiliation=owner,collaborator` excluded org repos (PRIMARY)**: The GitHub `/user/repos` endpoint's own default includes `organization_member`. The hardcoded value was more restrictive. Users whose repos are in a GitHub org where they're a member but not an explicit per-repo collaborator received an empty array. Sync completed with `synced:0, errors:[]` — indistinguishable from a legitimate empty account.

2. **`POST /api/repos/sync` `.catch(() => {})` — all background errors silently swallowed (STRUCTURAL)**: If `fetchUserRepos` throws (GitHub 401/403/429, decryption mismatch, network failure), the entire sync fails with no log entry, no stored error state, no client feedback. `GET /api/repos` returns `{"repos":[]}` indefinitely with no way to diagnose the cause.

3. **No pagination (MISSING FEATURE)**: `fetchUserRepos` fetched exactly one page (max 100 repos). Users with >100 repos silently lost the remainder.

#### What Changed

- **`execution/github/fetchUserRepos.js`** — three changes:
  - `affiliation=owner,collaborator` → `affiliation=owner,collaborator,organization_member` (matches GitHub API default; exposes org repos to members)
  - Pagination loop: follows `Link: <url>; rel="next"` header until no next link or 50-page safety cap
  - `_parseNextLink(linkHeader)` private helper: regex match on `<url>; rel="next"` Link header format; null-safe (handles missing `headers.get`)
  - Headers block extracted to a `const headers` variable shared across paginated requests
- **`backend/routes/repoRoutes.js`** — two changes:
  - Added `const logger = require('../../execution/logger')` import
  - Replaced `.catch(() => {})` with `.catch((err) => { logger.error({ msg: 'sync:background:failed', userId, code, error }) })` — sync failures now appear in server logs with `[ERROR] sync:background:failed`

#### Validation

- `tests/unit/execution/github/fetchUserRepos.test.js` — **+11 new tests** (URL params: `organization_member` present, `collaborator` present, `owner` present, `per_page=100`; pagination: 1 call when no Link header, 2 calls when rel=next present, second call uses Link URL, repos accumulated across pages, last-page repos correctly mapped, 3-page chained pagination + count, non-OK on page 2 throws GITHUB_REPOS_FETCH_FAILED, no-headers-object guard); total → **25/25**
- `tests/unit/backend/routes/repoRoutes.test.js` — **+3 new tests** (logger mocked with `jest.mock`; `logger.error` called with `msg: 'sync:background:failed'` when `syncUserRepos` rejects; `logger.error` includes `code: 'GITHUB_REPOS_FETCH_FAILED'`; still returns 202 when sync will fail); total → **271/271**
- **Full suite:** `npm test` → **6,721/6,791 passing** (70 skipped = 63 DB + 7 SMTP, all opt-in; 0 failing; 0 regressions; +15 tests from this fix)

#### Risks / Limitations

- `_upsertRepository` ON CONFLICT on `github_repo_id` does NOT update `user_id` — if test fixture rows share a `github_repo_id` with real repos, those repos remain invisible to other users. Test fixture IDs (small integers like 1001) are extremely unlikely to collide with real GitHub repo IDs (8–9 digit integers). Not changed per scope constraint (do not change repository ownership rules).
- Background sync still produces no persisted status — `GET /api/repos/sync/status` does not exist. A server restart loses any log evidence of past sync failures. A `last_sync_status` column on `users` or a `sync_logs` table would give the UI visibility.
- Pagination safety cap is 50 pages (5,000 repos). Users with >5,000 repos still lose the remainder — acceptable for current maturity.

#### Capability Maturity Change

FR-004 GitHub Data Ingestion — repository list fetch: **Integrated / Tested → Integrated / Tested** (maturity unchanged in label, but two critical failure modes closed: org repos now visible; sync errors now observable in logs; pagination now correct for >100-repo accounts).

---

### 2026-06-18 — FR-009 Project Status Backend Filter

**Capability:** Search and Filtering (FR-009) — project_status column + `?projectStatus=` query param  
**Deliverable status:** Required — closes the "project status" spec dimension for FR-009 at the backend layer

#### What Changed

- **`migrations/0014_add_project_status_to_repositories.js`** — new reversible migration: adds `project_status varchar(20) NOT NULL DEFAULT 'active' CHECK(project_status IN ('active','inactive','archived','unknown'))` to `repositories`; `down()` calls `dropColumn`; no data migration required (default 'active' satisfies NOT NULL for all existing rows)
- **`backend/routes/repoRoutes.js`** — GET / handler extended:
  - `projectStatus` destructured from `req.query`
  - Validated against `Set(['active','inactive','archived','unknown'])` — invalid values return HTTP 400 without calling db.query
  - `r.project_status AS "projectStatus"` added to SELECT
  - `AND ($6::varchar IS NULL OR r.project_status = $6)` added to WHERE
  - Parameter array extended from 5 to 6 elements: `[userId, riskLevel||null, search||null, lowerBound, upperBound, projectStatus||null]`
- **`tests/unit/migrations/0014_project_status.test.js`** — 9 new unit tests: module structure (up/down/shorthands), `addColumn` called once, targets `repositories`, `project_status` is notNull, default contains 'active', check contains all four values, `down` calls `dropColumn`
- **`tests/unit/backend/routes/repoRoutes.test.js`** — 11 new tests in a new `describe('repoRoutes GET / — projectStatus filter')` block: absent→null, active/inactive/archived/unknown each pass as $6, invalid→400, db.query not called on invalid, SQL clause pattern `$6.*IS NULL.*OR.*project_status.*=.*$6`, combined with riskLevel, combined with search, combined with activeSince, combined with all three; all existing 5-element param arrays updated to 6-element (10 replace_all operations); total: **268/268 passing**
- **`tests/unit/backend/routes/repoRoutes.http.test.js`** — 9 new HTTP contract tests (projectStatus=active/inactive/archived/unknown return 200, invalid→400, db.query not called on invalid, combined with riskLevel, combined with search); all existing 5-element param arrays updated to 6-element; total: **35/35 passing**
- **`tests/integration/repoFilters.db.integration.test.js`** — updated to support projectStatus: `REPOS_SQL` extended with `r.project_status AS "projectStatus"` in SELECT and `AND ($6::varchar IS NULL OR r.project_status = $6)` in WHERE; `buildParams()` accepts and returns `projectStatus` as 6th element; `seedRepo()` accepts and inserts `projectStatus`; `FIXTURES` updated (beta→inactive, delta→archived, others→active); new Block 5 (5 tests): active→4 repos, inactive→1, archived→1, absent→all 6, active+healthy→alpha+zeta; total: **24/24 passing in isolation**

#### Validation

- **Unit suite:** `npm test` → 6,706/6,706 non-skipped passing; 70 skipped (63 DB + 7 SMTP, all opt-in); 0 failing; 0 regressions
- **DB integration in isolation:** `$env:TEST_INTEGRATION = "true"; npx jest tests/integration/repoFilters.db.integration.test.js --no-coverage` → **24/24 passing** (requires live PostgreSQL with migration 0014 applied; no SMTP/Slack/GitHub token required)
- **No secrets introduced; no production writes in tests; integration tests self-skip under `npm test`**

#### Risks / Limitations

- Migration 0014 not yet applied to any environment (DDL only, no environment has run `db-migrate up`)
- No frontend `?projectStatus=` UI control — backend-only per approved scope; requires a new filter dropdown + `buildReposUrl` extension to expose in the UI
- Full integration-suite parallelism race (pre-existing issue) still applies; run this file in isolation

#### Capability Maturity Change

FR-009 project status dimension: **Absent → Integrated / Tested (backend only)**. The `project_status` column, migration, `?projectStatus=` filter, and full test suite (unit + HTTP contract + DB integration) are now in place. No frontend UI control yet.

---

### 2026-06-18 — FR-009 SQL Filter Integration Test

**Capability:** Search and Filtering (FR-009) — SQL clause verification against real PostgreSQL  
**Deliverable status:** Required — closes the last unverified SQL gap in the three implemented FR-009 filter dimensions

#### What Changed

- **`tests/integration/repoFilters.db.integration.test.js`** — new opt-in integration test suite (19 tests across 4 blocks):
  - Block 1 — riskLevel filter (5 tests): `healthy` returns 3 repos; `at-risk` returns 1; `critical` returns 1; absent riskLevel returns all 6 repos including the no-score repo; repos with no `risk_scores` row are excluded when any `riskLevel` is applied (proves NULL LATERAL result filtering)
  - Block 2 — search filter (5 tests): substring match; common-prefix match returns all 6; ILIKE case-insensitive (lowercase search matches UPPERCASE stored value); ILIKE case-insensitive reverse (UPPERCASE search matches lowercase stored value); no-match returns empty set
  - Block 3 — activeSince filter (5 tests): `7d` returns 3 repos (1d/3d/5d old); `30d` returns 4 (adds 10d); `90d` returns 5 (adds 60d); `stale` returns delta (60d) and excludes active repos; `stale` explicitly includes repos with `last_synced_at IS NULL` — proves the `IS NULL` branch in the SQL clause
  - Block 4 — combined filters (4 tests): riskLevel+search; search+activeSince; riskLevel+activeSince; all three simultaneously

#### Utilities Reused

- `requireIntegrationEnv()`, `createTestPool()`, `closeTestPool()` from `tests/integration/helpers/dbTestHelper.js` — no changes to helper
- `upsertUser()` from `execution/auth/upsertUser.js` for user seeding
- Same opt-in pattern (`describeIntegration = INTEGRATION_URL ? describe : describe.skip`) as `auth.integration.test.js` and `notifications.db.integration.test.js`

#### Test Design

- Direct SQL testing (verbatim `REPOS_SQL` constant copied from `backend/routes/repoRoutes.js`); no Express layer required — tests the clauses, not the HTTP route
- `buildParams()` mirrors `lowerBound`/`upperBound` computation from the route handler exactly
- All 6 fixture repos seeded once in `beforeAll`; all 19 tests are read-only queries — no `beforeEach` reset needed
- Fixture timestamps use minimum 2-day cushion from every filter boundary to prevent timing-drift failures
- `queryFullNames()` sorts results before assertion — makes assertions independent of `ORDER BY rs.score DESC NULLS LAST` ordering

#### Validation

- **Target file in isolation:** `$env:TEST_INTEGRATION = "true"; npx jest tests/integration/repoFilters.db.integration.test.js --no-coverage` → **19/19 passing** (requires live PostgreSQL; no SMTP, no Slack, no GitHub token)
- **No production code changed** — no routes, no migrations, no execution scripts modified
- **Unit test suite unchanged** — all 19 new tests self-skip under `npm test`; 0 regressions

#### Risks / Limitations

- SQL constant must be kept in sync with `backend/routes/repoRoutes.js` manually — a comment in the file documents this obligation
- Full integration-suite parallelism race (pre-existing issue from notifications suite) still applies; run this file in isolation to avoid it
- 3 FR-009 spec dimensions (project status, assigned manager, intern contributor) remain absent — no DB backing exists; require new migrations before they can be implemented

#### Capability Maturity Change

FR-009 Search and Filtering — riskLevel / search / activeSince SQL clauses: **Integrated / Tested → Integrated / Verified (in isolation)**. The three WHERE-clause predicates are now provably correct against real PostgreSQL, not only against mocked `db.query` calls.

---

### 2026-06-17 — FR-008 writeNotification.js PostgreSQL Conflict-Target Fix + DB Integration Test

**Capability:** Notifications (FR-008) — In-App DB write path  
**Deliverable status:** Required — closes the last unverified link in the FR-008 in-app channel

#### What Changed

- **`execution/notifications/writeNotification.js`** — one SQL clause corrected:
  - Before: `ON CONFLICT ON CONSTRAINT notifications_user_dedupe_key_uidx DO NOTHING`
  - After: `ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`
  - Root cause: PostgreSQL allows `ON CONFLICT ON CONSTRAINT` only for named unique constraints declared via `CREATE UNIQUE CONSTRAINT` or `ADD CONSTRAINT`. Partial unique indexes (created with a `WHERE` predicate, as migration 0013 does via `pgm.createIndex … { unique: true, where: … }`) are not referenceable by name in `ON CONFLICT`; they must use the column-list + predicate inference form. The old clause caused every insert to throw a `syntax error` or `constraint does not exist` at the PostgreSQL level, meaning all deduplication inserts were failing with an unhandled error — silently swallowed by `sendAlert`'s `.catch()`.
  - Inline docstring updated: replaced named-constraint description with explanation of partial-index inference semantics and why `ON CONFLICT ON CONSTRAINT` is invalid for partial indexes.
- **`tests/integration/notifications.db.integration.test.js`** — new opt-in integration test suite (14 tests across 4 blocks):
  - Block 1 — `writeNotification` row shape (6 tests): integer id, type=`portfolio_alert`, status=`CREATED`, priority derivation (Critical→CRITICAL, Warning+Worsening→HIGH, Normal+Stable→MEDIUM), title/body content, raw `SELECT` confirms RETURNING and live table agree
  - Block 2 — Deduplication constraint (3 tests): second call with same user+dedupe_key returns null and writes 0 rows; same dedupe_key for different user inserts separate row (constraint is per-user); stored dedupe_key equals `"${alertState}:${trend}"`
  - Block 3 — `sendAlert` fan-out (3 tests): 2 active users → 2 rows; 0 users → 0 rows; 1 active + 1 soft-deleted → 1 row scoped to active user only
  - Block 4 — Column integrity (2 tests): expires_at within 10 s of 90 days from now; priority check constraint rejects `EXTREME` with PG error code 23514

#### Validation

- **Target file in isolation:** `node --env-file=.env node_modules/jest/bin/jest.js "tests/integration/notifications.db.integration.test.js" --no-coverage` → **14/14 passing** (1.174 s; requires `TEST_INTEGRATION=true` + live PostgreSQL; no Mailhog, no SMTP, no Slack)
- **No migrations changed** — migration 0013 is correct; the bug was only in how `writeNotification.js` referenced the partial index
- **No tests modified** — the 14 new tests are all new files; no existing test files were changed
- **Unit test suite unchanged** — `npm test` still passes 6,676/6,722 (14 new tests self-skip as opt-in); 0 regressions
- **Production behavior change:** narrowly scoped — the `ON CONFLICT` path in `writeNotification` now resolves correctly against the partial unique index; deduplication semantics (same user + same alertState:trend key → no-op, returns null) are unchanged

#### Risks / Limitations

- Full integration-suite run (`npm run test:integration`) exposes a pre-existing DB truncation race condition: when Jest runs `auth.integration.test.js` and `notifications.db.integration.test.js` in parallel workers against the same PostgreSQL instance, interleaved `TRUNCATE users … CASCADE` calls leave Block 3 (`sendAlert` fan-out) with 0 users mid-test. This is a test-setup isolation issue, not a production code defect. Mitigation: run the file in isolation or add `--runInBand` to the integration script.
- Production SMTP relay delivery remains unverified
- Slack webhook delivery remains unverified (unit-tested only)

#### Capability Maturity Change

FR-008 Notifications — In-App DB write path: **Integrated / Partially Verified → Integrated / Verified (in isolation)**. The full chain `snapshotWorker → sendAlert → writeNotification → notifications table` is now end-to-end verified against a real PostgreSQL instance. Remaining verification gaps: production SMTP relay, Slack webhook, full integration-suite parallelism cleanup.

---

### 2026-06-17 — FR-009 Activity Recency Filter (Backend + Frontend)

**Capability:** Search and Filtering (FR-009) — Activity Recency dimension  
**Deliverable status:** Required (`spec/01_requirements.md` FR-009 "Activity recency" dimension; `r.last_synced_at` field is the authoritative freshness signal)

#### What Changed

- **`backend/routes/repoRoutes.js`** — `GET /api/repos` handler extended:
  - Extracts `activeSince` from `req.query` alongside `riskLevel` and `search`
  - Validates against allowlist `Set(['7d', '30d', '90d', 'stale'])`; empty string treated as absent; invalid values → HTTP 400 (no db.query)
  - Maps `activeSince` to `{ lowerBound, upperBound }` UTC ISO timestamps: `7d/30d/90d` → lowerBound = `now - N days`, upperBound = null; `stale` → lowerBound = null, upperBound = `now - 30 days`
  - Parameter array extended from 3 to 5 elements: `[userId, riskLevel||null, trimmedSearch||null, lowerBound, upperBound]`
  - SQL WHERE extended: `AND ($4::timestamptz IS NULL OR r.last_synced_at >= $4::timestamptz)` (lower bound) and `AND ($5::timestamptz IS NULL OR r.last_synced_at IS NULL OR r.last_synced_at < $5::timestamptz)` (upper bound; stale explicitly includes `IS NULL` repos)
  - All three filters (riskLevel, search, activeSince) are AND-combined; fully independent
- **`frontend/dashboard.html`** — filter bar extended:
  - CSS added for `#repo-recency-select` and `#repo-recency-select:focus` (same pill style as `#repo-search-input`)
  - `<select id="repo-recency-select">` added after `#repo-search-input`; options: Any time (empty), Last 7 days (7d), Last 30 days (30d), Last 90 days (90d), Stale 30+ days (stale)
  - `buildReposUrl(options)` extended: third branch appends `activeSince=<encoded>` when truthy; ordering: riskLevel, search, activeSince
  - Filter bar click handler + search `input` listener updated: both read `#repo-recency-select` value and add to opts when non-empty
  - New `change` event listener on `#repo-recency-select`: calls `loadRepos()` with combined filter/search/recency opts
  - At Risk, Healthy, All, and search behavior preserved without regression

#### Validation

- **`tests/unit/backend/routes/repoRoutes.test.js`** — new `describe('repoRoutes GET / — activeSince filter')` block, 12 tests; 9 existing param-array assertions updated from 3-element to 5-element; **256/256 passing** (was 244)
- **`tests/unit/backend/routes/repoRoutes.http.test.js`** — new `describe('GET /api/repos?activeSince=<value>')` block, 10 tests; 4 existing param-array assertions updated to 5-element; **26/26 passing** (was 16)
- **`tests/unit/frontend/dashboardFilterLoad.test.js`** — `buildReposUrl` verbatim copy updated; 9 new activeSince-parameter tests + 3 new filter+activeSince composition tests; **36/36 passing** (was 24)
- Combined backend: `npx jest --testPathPattern="repoRoutes"` → **282/282 passing** (2 suites)
- Combined frontend: `npx jest --testPathPattern="dashboardFilterLoad|dashboardFilter\b"` → **65/65 passing** (2 suites)
- Existing `tests/unit/frontend/dashboardFilter.test.js` — 29/29 passing; At Risk, Healthy, All client-side logic unchanged
- Clock spy: `jest.spyOn(Date, 'now').mockReturnValue(1000000000000)` in both backend suites produces deterministic ISO timestamp assertions; restored in `afterEach`

#### Risks / Limitations

- `last_synced_at` timestamp clause correctness against real PostgreSQL unverified — `$4::timestamptz` and `$5::timestamptz` casts unproven against a live DB instance
- `stale` cutoff hardcoded at 30 days in the handler
- 3 FR-009 spec dimensions remain absent: project status, assigned manager, intern contributor

---

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

### 2026-06-28 — Portfolio Architecture Refinement #16 (API Integration Health Messaging)
- **Files modified:**
  - `frontend/dashboard.html` — in `_archApiIntegrationHtml`: added `unresolvedMsg` variable computing the count-driven message; replaced both `'Unresolved frontend/backend API mappings detected.'` occurrences (Risky branch and Watch branch) with `unresolvedMsg`. All other health logic, coverage level badge, raw metrics, and fallback messages unchanged.
- **Files created:**
  - `tests/unit/frontend/dashboardPortfolioApiIntegration.test.js` — 27 new unit tests: no data (2), section label (1), singular unresolved message (3), plural unresolved message (3), old wording removed (2), Risky health state (4), Watch health state (3), Healthy health state (2), raw metrics (7).
- **Before (unresolved > 0):** "Unresolved frontend/backend API mappings detected." (both Risky and Watch branches)
- **After:**
  - `unresolved = 1` → "1 frontend API call is not linked to a backend route."
  - `unresolved = 17` → "17 frontend API calls are not linked to backend routes."
- **Validation:** `npm test --runInBand` → **6,890 / 6,960 passing** (net +27; 70 skipped; 0 failing).

---

### 2026-06-28 — Portfolio Architecture Refinement #15 (Recommended Actions)
- **Files modified:**
  - `frontend/dashboard.html` — rewrote `_archRepoRecommendationsHtml(data)`: removed per-repo Priority #1/#2/#3 blocks (repo names, DETECTED, RECOMMENDED subsections, `_archTier` nested helper, lagging-sort logic); replaced with a single deduplicated portfolio-level action list (max 5, ordered by impact). Also renamed label in `_archRecommendationsHtml` from "Recommendations" → "Recommended Actions".
- **Files created:**
  - `tests/unit/frontend/dashboardPortfolioRecommendations.test.js` — 44 new unit tests: section label (2), empty/no signals (3), critical repos action (5), boundary violations action (3), placeholder/scaffold action (4), completeness action (3), API integration gaps action (6), coupling action (4), max 5 cap (3), old structure removed (5), fallback renderer (6).
- **Old structure:** Per-repo blocks with "Priority #1 — repo-name", "Detected" subsection, "Recommended" subsection; portfolio signals attributed to Priority #1 repo only.
- **New structure:** Single flat `<ul class="arch-rec">` list under "Recommended Actions"; portfolio signals each generate one deduplicated action item.
- **Action priority order (impact-descending):**
  1. `dist.risky > 0` → "Prioritize remediation for N critical repositories with Risky architecture health."
  2. `violations.length > 0` → "Resolve N boundary violations to reduce structural risk."
  3. `integrity: placeholders/scaffold > 0` → "Replace placeholder implementations with production-ready code."
  4. `integrity: avgCompleteness < 70` → "Increase portfolio implementation completeness above 70%."
  5. `api: unresolved > 0` → "Link N unresolved frontend calls to backend route definitions."
     `api: weak level (no unresolved)` → "Improve API integration coverage — frontend-to-backend route mappings are insufficient."
  6. `coupling: circDeps > 0 or avgEdges ≥ 30` → "Reduce dependency coupling by extracting shared interfaces or splitting high-coupling modules."
  - If no signals: falls back to `_archRecommendationsHtml(data.recommendations)`.
- **Example output (typical dataset with coupling pressure + 3 critical repos):**
  1. "Prioritize remediation for 3 critical repositories with Risky architecture health."
  2. "Reduce dependency coupling by extracting shared interfaces or splitting high-coupling modules."
- **Validation:** `npm test --runInBand` → **6,863 / 6,933 passing** (net +44; 70 skipped; 0 failing).

---

### 2026-06-28 — Portfolio Architecture Refinement #14 (Portfolio Coupling Card)
- **Files modified:**
  - `frontend/dashboard.html` — rewrote `healthMsg` logic in `_archCouplingHtml`: Watch/Risky messages now explain the cause (circDeps > 0 / reposCyc > 0 → circular dependency message; avgEdges ≥ 30 → density message with value; else → generic); removed secondary coupling-level badge block (`pf-badges` div + `pf-badge` span + `_archCouplingLevelSev` call).
- **Files created:**
  - `tests/unit/frontend/dashboardPortfolioCoupling.test.js` — 35 new unit tests (verbatim copy pattern): no data (3), section label (1), Healthy state (3), Watch + circular deps (3), Watch + high density (4), Watch + low density (2), Risky + circular deps (3), Risky + high density (2), Risky + no specific cause (1), no secondary badge (3), zero circDeps indicator (2), raw metrics (6), avgEdges message formatting (2).
- **Before (Watch + high density):** "Coupling Health: Watch — Portfolio coupling should be monitored." + separate WATCH pf-badge
- **After (Watch + high density):** "Coupling Health: Watch — High dependency density detected — 37.5 average edges per repository." (no secondary badge)
- **Message logic (new):**
  - Risky/high/critical + circDeps > 0 or reposCyc > 0 → "Circular dependency cycles detected — high coupling risk."
  - Risky/high/critical + avgEdges ≥ 30 → "High dependency density detected — X.X average edges per repository."
  - Risky/high/critical + neither → "High coupling risk detected — review dependency structure."
  - Watch/medium/moderate + circDeps > 0 or reposCyc > 0 → "Circular dependency risk detected — coupling elevated."
  - Watch/medium/moderate + avgEdges ≥ 30 → "High dependency density detected — X.X average edges per repository."
  - Watch/medium/moderate + neither → "Portfolio coupling elevated — monitor dependency structure."
  - Healthy → "No major portfolio coupling risks detected."
- **Validation:** `npm test --runInBand` → **6,819 / 6,889 passing** (net +35; 70 skipped; 0 failing).

---

### 2026-06-28 — Portfolio Architecture Refinement #13 (Portfolio Risk Summary)
- **Files modified:**
  - `frontend/dashboard.html` — rewrote `_archRiskDriversHtml(data)` function: renamed section label "Primary Risk Drivers" → "Portfolio Risk Summary"; replaced priority logic (P1: critical repos from `distribution.risky`, P2: implementation completeness, P3: API integration gaps, fallback: coupling, boundary violations only when violations exist); reduced max bullets from 4 → 3; removed healthy-state boundary bullet ("No significant boundary violations detected").
- **Files created:**
  - `tests/unit/frontend/dashboardPortfolioRiskSummary.test.js` — 34 new unit tests (verbatim copy pattern; Jest node env; no DOM): section label (2), empty state (2), P1 critical repos (5), P2 implementation integrity (5), P3 API integration gaps (7), fallback coupling (5), fallback boundary violations (4), max 3 bullets (2), priority order (2).
- **Old bullet logic:**
  1. Architecture risk concentrated in N repositories (from `benchmarkedRepositories` lagging/below_average)
  2. Implementation integrity weaknesses detected
  3. No significant boundary violations detected (healthy state) OR Boundary violations contributing to portfolio risk
  4. Portfolio coupling pressure detected
  - Max 4 bullets shown.
- **New bullet logic (prioritized):**
  1. P1: N critical repositories requiring remediation (from `distribution.risky` count; only when > 0)
  2. P2: Implementation integrity weaknesses detected (same condition)
  3. P3: API integration gaps detected (unresolved calls > 0, or weak/risky/critical/none/below_average level; partial/watch/medium → medium severity)
  4. Fallback: Portfolio coupling pressure detected (same condition)
  5. Fallback: Boundary violations contributing to portfolio risk (only when violations exist)
  - Max 3 bullets shown; no healthy-state bullets.
- **Validation:** `npm test --runInBand` → **6,784 / 6,854 passing** (net +34; 70 skipped; 0 failing). New test file covers all priority branches, max-3 cap, healthy-state omission, and section label rename.
- **Risks / Limitations:** No existing tests covered `_archRiskDriversHtml` or `buildPortfolioArchitectureHtml` — coverage was absent before this refinement; the new file closes that gap. `distribution.risky` used for P1 (matches `_execKpi.criticalRepos` source in `loadPortfolioArchitecture`). API integration gap severity uses `high` for unresolved/weak levels; `medium` for partial — matches `_archApiIntegrationHtml` health classification logic.

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

### 2026-06-29 — Repository Status Bug Fix #3: Restore Repository Click / Detail Behavior

**Capability:** FR-003 Project Dashboard — Repository Status table — row click / detail panel  
**Deliverable status:** Required — clicking a repo row was not reliably opening or updating the detail panel

#### Root Cause

Bug Fix #1 (prior session) added `if (_repos.length) applyFilter()` inside `loadRepoArchitecture()`'s `.then()` callback, immediately after assigning `_archDataByRepoId[repoId]`. This created an **infinite same-repo fetch loop**:

```
User click → selectRepo(A) → loadRepoArchitecture(A, seq=N)
  [fetch resolves]
  _archDataByRepoId[A] = { ... }
  applyFilter()                           ← Bug Fix #1 (REMOVED)
    → renderReposTable()
    → selectRepo(A)                       ← nested, unconditional re-selection
        detail.innerHTML = '...'         ← DESTROYS #repo-architecture-content
        loadRepoArchitecture(A, seq=N+1) ← loop continues
  container.innerHTML = architectureHtml ← writes to DETACHED element (orphaned above)
  updateOverviewArchCards()
[N+1 fetch resolves — same sequence, same outcome, forever]
```

Two simultaneous effects:
1. **Architecture tab permanently "Loading…"**: `container` (captured at fetch start) is orphaned by `selectRepo`'s `detail.innerHTML` rebuild before line 5286 executes. Every write goes to a detached DOM element.
2. **Detail panel reset every 1–3 seconds**: `selectRepo` rebuilds the entire `#repo-detail` on every loop iteration, destroying any user interaction (scroll position, form input, tab selection).

#### What Changed

**`frontend/dashboard.html`** — removed 2 lines from `loadRepoArchitecture()`'s `.then()` callback (the comment + the guard):

```js
// REMOVED:
// Re-render the repository table so Architecture Drivers chips reflect
// the newly available per-click signals immediately (Bug Fix #1).
if (_repos.length) applyFilter();
```

Nothing else changed. `buildArchDriversHtml`, `loadPortfolioArchitecture`, table rendering, backend APIs, and Bug Fix #2 are all intact.

#### Why Click Behavior Is Restored

With the line removed:
- `loadRepoArchitecture()`'s `.then()` no longer calls `applyFilter()`
- `renderReposTable()` and the nested `selectRepo()` inside it are never called from within the fetch callback
- `container` (line 5223) remains attached throughout the callback — `container.innerHTML = architectureHtml` (line 5285) writes to the live `#repo-architecture-content` element
- `updateOverviewArchCards(repoId)` (line 5296) correctly updates the overview cards
- The Architecture tab shows actual architecture data instead of perpetual "Loading…"
- The detail panel is not destroyed mid-interaction
- Bug Fix #2's `applyFilter()` (in `loadPortfolioArchitecture`) still fires on the 60-second cycle, providing the initial portfolio-seeded chips and the next refresh of per-click richer data

#### Validation

- `npm test --runInBand` → **7,094 total (7,024 passing, 70 skipped, 0 failing)** — 0 net test delta; 0 regressions
- No frontend unit tests cover `loadRepoArchitecture` directly (DOM-dependent fetch function) — behavioral fix verified by code trace and absence of regression

#### Risks / Limitations

- Per-click Architecture Drivers chips (richer than portfolio-seeded values) now update on the next 60-second `refresh()` cycle rather than immediately. This is acceptable: Bug Fix #2 ensures chips are visible on initial load; the richer per-click values are a refinement, not a correction.
- The 60-second cycle still calls `selectRepo` once per refresh from `loadRepos()` and `loadAttentionQueue()` and `loadPortfolioArchitecture()` — three separate async callbacks that each fire `applyFilter()`. This is a pre-existing design, not introduced here.

#### Capability Maturity Change

FR-003 Repository Status — row click / detail panel: **Broken (infinite loop) → Integrated / Tested**

---

### 2026-06-29 — Repository Status Bug Fix #2: Architecture Drivers on Initial Page Load

**Capability:** FR-003 Project Dashboard — Repository Status table — Architecture Drivers column  
**Deliverable status:** Required — Architecture Drivers column showed `—` for all repos on initial page load; chips only appeared after a user clicked each repo individually

#### Root Cause

`buildArchDriversHtml(repo, archData, fcData, archCache)` renders chips from `archCache = _archDataByRepoId[r.id]`. That map was only populated by `loadRepoArchitecture()` (per-click). `loadPortfolioArchitecture()` (runs on page load and every 60-second `refresh()` cycle) never wrote to `_archDataByRepoId` — it only wrote architecture intel to `_repoIntelligenceById` (a separate keyed map). On first render `archCache` was null for every row → per-click signal block skipped → `items = []` → em dash.

Bug Fix #1 (prior session) added `applyFilter()` after a per-click `_archDataByRepoId` write — this fixed re-render for a single clicked repo but did not solve the root cause: `loadPortfolioArchitecture()` never seeds the map.

#### What Changed

**Backend — `execution/architecture/buildPortfolioArchitectureIntelligence.js`**

Extended `_benchmarkedRepositories()` sorted `.map()` to project 5 additional driver signal fields from the raw repo sub-objects (which were already available in the input but not forwarded to the output). New per-repo fields added to the return shape:

| Field | Source | Notes |
|---|---|---|
| `unresolvedApiCalls` | `repo.apiLinkage.coverage.unresolvedFrontendCallCount` | `_safeNumber()` guard; 0 when absent |
| `implementationCompleteness` | `repo.implementationCompleteness.completenessScore` | null when absent |
| `couplingRisk` | `repo.dependencyGraph.couplingMetrics` | derived via same thresholds as `_deriveCouplingLevel()` |
| `boundaryViolationCount` | `repo.boundaryVerification.violations.length` | 0 when absent |
| `confidenceLevel` | `repo.confidenceLevel` | `'unknown'` when absent |

Coupling risk derivation mirrors frontend thresholds exactly: `circular>5||avgOut>8||fanOut>5` → risky, `>2||>5||>2` → weak, `>0||>3||>0` → watch, else → healthy.

**Frontend — `frontend/dashboard.html`**

In `loadPortfolioArchitecture()`, a second `benched.forEach` loop was added after the existing `_mergeIntelByName` loop. It seeds `_archDataByRepoId[r.repoId]` with the 5 portfolio-sourced driver signal fields. Guard: `if (_archDataByRepoId[r.repoId]) return` — never overwrites a richer per-click entry. Null-placeholder fields (`apiLinkageLevel`, `implementationLevel`, `boundaryHealthScore`, `linkageScore`) included so `buildArchDriversHtml` never reads undefined. `if (_repos.length) applyFilter()` appended after the loop — table re-renders immediately with driver chips visible.

**Backend tests — `tests/unit/execution/architecture/buildPortfolioArchitectureIntelligence.test.js`**

New describe block appended: `buildPortfolioArchitectureIntelligence — benchmarkedRepositories driver signal fields`. 18 new tests:

- `unresolvedApiCalls` from `apiLinkage.coverage.unresolvedFrontendCallCount`: value present → correct; coverage missing → 0
- `implementationCompleteness` from `.completenessScore`: value → correct; absent → null
- `boundaryViolationCount`: 2 violations → 2; empty array → 0; missing `boundaryVerification` → 0
- `confidenceLevel`: passthrough; missing → 'unknown'
- `couplingRisk` thresholds: no signals → healthy; circular=1 → watch; circular=3 → weak; circular=6 → risky; fanOut=6 → risky; missing `dependencyGraph` → healthy
- Integration: `makeRiskyRepo` → all 5 fields at expected risky values
- Integration: `makeHealthyRepo` → all 5 fields at expected healthy values
- Structural: all 5 fields present on every entry in the returned array

**Frontend tests — `tests/unit/frontend/dashboardRepoPriority.test.js`**

New describe block appended after line 3381 (end of file): `buildArchDriversHtml — portfolio-seeded archCache (Bug Fix #2)`. 11 new tests:

- `unresolvedApiCalls > 0` → API Gaps chip + severity-elevated
- `implementationCompleteness < 70` → Implementation Gaps chip + severity-watch
- `couplingRisk='weak'` → High Coupling chip
- `couplingRisk='risky'` → High Coupling chip
- `boundaryViolationCount > 0` → Boundary Violations chip + severity-elevated
- `confidenceLevel='Low'` → Low Confidence chip
- All-clean portfolio signals → em dash (no chips)
- Risky portfolio signals → max-2-chip cap applies; top 2 chips correct
- archCache preferred over health level: risky health + portfolio archCache signals → chips, not `Low Health`
- `implementationCompleteness=null` → no Implementation Gaps chip
- Guard demo: pre-seeded `_archDataByRepoId[99]` drives chips without per-click fetch; delete after

#### Validation

- `npm test --runInBand` → **7,094 total (7,024 passing, 70 skipped = 63 DB + 7 SMTP, 0 failing)** — net +29 tests (18 backend + 11 frontend); 0 regressions
- All 5 new driver signal fields verified in both the backend pure function and the frontend renderer
- Portfolio-seeded archCache confirmed to produce the same chip output as per-click archCache

#### Risks / Limitations

- `couplingRisk` derivation in `_benchmarkedRepositories` must remain in sync with `_deriveCouplingLevel()` in `frontend/dashboard.html` — same thresholds but duplicated logic; a future threshold change must update both
- The 5 portfolio-sourced fields are less rich than the full per-click `/api/repos/:id/architecture` response (missing `apiLinkageLevel`, `linkageScore`, `boundaryHealthScore`, `implementationLevel`) — chips may show slightly different precision until a per-click fetch replaces the portfolio-seeded entry
- No browser E2E test added; visual verification deferred to existing authenticated Playwright spec

#### Capability Maturity Change

FR-003 Repository Status — Architecture Drivers column: **Partially Integrated → Integrated / Tested** — chips now appear on initial page load for all repos in the portfolio, driven by the portfolio architecture response. Per-click richer data still correctly overrides the portfolio-seeded entry.

---

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
- ~~**(e) Add `tests/integration/notifications.db.integration.test.js`**~~ — **resolved 2026-06-17**: 14 opt-in tests added (14/14 passing in isolation — row shape, deduplication, `sendAlert` fan-out, column integrity against real PostgreSQL); `writeNotification.js` `ON CONFLICT` PostgreSQL bug fixed simultaneously; full integration-suite run shows DB truncation race across parallel workers (pre-existing test-setup issue — not a code defect; mitigation: run this file in isolation or add `--runInBand` to integration script)
- ~~**(f) Add Playwright E2E test for notification UI (unauthenticated + authenticated)**~~ — **resolved 2026-06-17**: unauthenticated path verified via `tests/e2e/dashboard.smoke.spec.js` (8/8 passing, 2026-06-16); authenticated notification UI verified via `tests/e2e/notifications.authenticated.spec.js` (2/2 passing, 2026-06-17: badge count=1 visible, panel opens + title + HIGH badge, mark-read PATCH 200, badge hides on re-fetch; real session/DB/API exercised; no production code changed). Open defect: `#notif-badge` CSS visual-hide (inline `display:inline-flex` overrides `[hidden]`); production fix pending CLAUDE.md §4 approval
- Remaining delivery gaps: production SMTP relay unverified; Slack webhook delivery unverified (unit-tested only)

### 2 — Complete FR-009 Filtering (Medium)
Label/risk filter tested (29/29 passing, 2026-06-12). Backend riskLevel filter tested (2026-06-12). ~~Frontend not wired to backend parameter~~ — **resolved 2026-06-12** (Healthy filter calls `GET /api/repos?riskLevel=healthy`; wiring tested). ~~HTTP layer contract untested~~ — **resolved 2026-06-12** (supertest HTTP contract tests). ~~Repository name search absent~~ — **resolved 2026-06-17** (backend `?search=` with ILIKE + 200-char limit + HTTP 400 on invalid; `#repo-search-input` in filter bar; `buildReposUrl` supports riskLevel + search composition; 260/260 backend route tests + 53/53 frontend filter tests passing). ~~Activity recency filter absent~~ — **resolved 2026-06-17** (backend `?activeSince=` param with 7d/30d/90d/stale; stale includes `last_synced_at IS NULL`; `#repo-recency-select` dropdown + change listener; `buildReposUrl` supports riskLevel + search + activeSince ordering; 282/282 backend route tests + 65/65 frontend filter tests passing). ~~SQL clause correctness against real PostgreSQL unverified~~ — **resolved 2026-06-18** (`tests/integration/repoFilters.db.integration.test.js` added; 19 opt-in tests; riskLevel LATERAL join, ILIKE bidirectional case folding, `timestamptz` activeSince bounds + IS NULL/stale clause, 4 combined-filter scenarios; 19/19 passing in isolation). Remaining gaps: (a) At Risk toggle intentionally uses client-side `critical || at-risk` (by design in Option A — acceptable for Phases 1–5); (b) 3 spec dimensions still absent: project status, assigned manager, intern contributor — require new migrations before implementation.

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
