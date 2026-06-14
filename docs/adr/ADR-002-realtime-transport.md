# ADR-002: FR-007 Real-Time Transport — 60-Second Polling vs WebSocket

**Status:** ACCEPTED — 2026-06-12  
**Deciders:** Seif (project owner), Claude (system hardener / orchestration layer)  
**Relates to:** `spec/01_requirements.md` FR-007 and System Constraint #8; `spec/02_system_specification.md` Section 7; ADR-001

---

## Context

### Current FR-007 Requirement

`spec/01_requirements.md`:

> **FR-007: Real-Time Dashboard Updates**  
> The system must provide real-time dashboard updates for project metrics and risk changes.
>
> Acceptance Criteria: Given project data changes, when new metrics are processed, then connected dashboard clients must receive updated values **without manual refresh**.

`spec/02_system_specification.md` Section 7 originally specified:

| Item | Original Value |
|---|---|
| Transport | WebSocket |
| Events | `dashboard.updated`, `risk.changed`, `notification.created`, `ingestion.completed` |
| Reconnect | Must use backoff strategy |
| Unauthorized clients | Must disconnect immediately |

### Current Implementation Reality

**Frontend (`frontend/dashboard.html` — lines 8319–8334):**

```js
function refresh() {
  loadSummary();
  loadPortfolioArchitecture();
  loadPortfolioForecast();
  loadPortfolioGovernance();
  loadPortfolioWatchlists();
  loadRepos();
  loadAttentionQueue();
  loadHistory();
  loadExecutiveSummary();
}

refresh();
setInterval(refresh, 60000);   // 60-second polling
```

The header label reads `Live · 60s` — the dashboard accurately presents itself as a polling system.

**Backend (`backend/server.js`):**

- Plain Express HTTP server via `app.listen(PORT, ...)`
- No `http.createServer()` wrapper
- No `ws`, `socket.io`, or SSE package in `backend/package.json`
- No WebSocket route, upgrade handler, or connection manager

**Worker (`services/worker/snapshotWorker.js`):**

- Uses `setInterval(async () => {...}, SNAPSHOT_INTERVAL_MS)` for background data collection
- No event emission — data changes are silent; no mechanism to notify clients without polling

**Infrastructure absent for WebSocket:**

- No `ws` or `socket.io` dependency
- No Redis pub/sub for multi-instance broadcast
- No per-connection authentication middleware for WS upgrades
- No IPC channel between `snapshotWorker` and the HTTP server process

---

## Options Evaluated

### Option A — Formally Accept 60-Second Polling (Phases 1–5)

Accept `setInterval(refresh, 60000)` as the production transport model for Phases 1–5. Update the spec to reflect this. Defer WebSocket to Phase 6+ with defined triggers.

**Documentation changes only.** No application code or tests modified.

### Option B — Implement WebSocket Real-Time Updates

Replace `setInterval` with a WebSocket push channel. Server emits events when data changes; frontend updates on receipt.

**Significant scope.** Requires: new dependency (`ws`/`socket.io`), `http.createServer()` refactor, per-connection auth, `snapshotWorker` IPC or Redis pub/sub, frontend WebSocket client with reconnect/backoff, new test suites.

---

## Risk/Benefit Analysis

### Option A

| Dimension | Assessment |
|---|---|
| Delivery risk | None — no code change |
| Regression risk | None |
| FR-007 satisfaction | Partial — "without manual refresh" acceptance criterion met; WebSocket transport requirement not met |
| User experience | At most 60 seconds behind live data; adequate for architecture risk monitoring |
| Test impact | None — 6,429 passing tests remain green |
| Infrastructure cost | Zero |
| CLAUDE.md Anti-Drift compliance | High — frees capacity to close notification delivery, FR-009 filtering, and NFR-007 data governance gaps |
| ADR-001 consistency | High — same Phase 6+ trigger pattern |

### Option B

| Dimension | Assessment |
|---|---|
| Delivery risk | High — new dependency, server refactor, frontend refactor, auth integration, reconnect logic, new test coverage |
| Regression risk | Medium — `backend/server.js` and `frontend/dashboard.html` (8,240 lines) both require changes |
| FR-007 satisfaction | Full |
| User experience | Sub-second push once `snapshotWorker` completes |
| Test impact | Requires new WS test suite; browser WebSocket object is not testable via the verbatim-copy Jest pattern |
| Infrastructure blocker | `snapshotWorker` runs in an isolated `setInterval` loop with no shared event bus to the HTTP layer; requires Redis pub/sub or IPC channel — neither exists today |
| CLAUDE.md Anti-Drift compliance | Low — introduces new Phase 6 infrastructure before Phases 7–9 gaps are closed |

---

## Decision

**Accept Option A.**

Rationale:

1. **FR-007 acceptance criterion is already met.** The spec states "without manual refresh." `setInterval(refresh, 60000)` satisfies this. The gap is the transport mechanism (WebSocket), not the observable user behavior. The header label `Live · 60s` accurately communicates the behavior.

2. **IPC blocker is real and non-trivial.** `snapshotWorker.js` cannot emit WebSocket events directly — it has no reference to the HTTP server or any connected clients. Solving this requires either Redis pub/sub (not present) or a process IPC channel (not architected). This is Phase 6 scope, not a documentation side-fix.

3. **CLAUDE.md Anti-Drift Rule.** Four required capabilities have higher unresolved maturity gaps: notification delivery (unverified end-to-end), FR-009 multi-dimension filtering (partial), NFR-007 data governance (not found), and CI/CD pipeline (not present). Introducing WebSocket infrastructure before these are closed violates the anti-drift principle.

4. **ADR-001 precedent.** ADR-001 accepted a similar spec-vs-implementation divergence (React vs vanilla JS) using the same Phase 6+ deferral pattern. ADR-001 explicitly names "FR-007 WebSocket implementation" as one of the three triggers for Phase 6. This ADR formalizes that same trigger from the other direction.

5. **Domain fit.** Architecture risk scores, governance grades, and portfolio health metrics are computed by `snapshotWorker` on a configurable interval. Sub-second push adds no product value until the data source itself changes faster than 60 seconds.

---

## Consequences

- `spec/01_requirements.md` System Constraint #8 added: polling satisfies FR-007 for Phases 1–5; WebSocket deferred to Phase 6+.
- `spec/02_system_specification.md` Section 7 Transport updated: "60-second polling (Phases 1–5); WebSocket deferred to Phase 6+ — see ADR-002."
- `PROGRESS.md` FR-007 deliverable row marked ACCEPTED; Phase 6 status updated; known risk row resolved; Recommended Action #1 marked resolved.
- No application code modified. No tests modified.

---

## Phase 6+ Migration Triggers

WebSocket implementation should be reconsidered when **any one** of the following is true:

1. `snapshotWorker` data change frequency drops below 60 seconds (polling latency becomes a user-visible problem)
2. Redis pub/sub infrastructure is introduced for another purpose (removes the IPC blocker at no additional cost)
3. A product requirement for sub-60-second dashboard latency is stated by a stakeholder

When implementing WebSocket, coordinate with ADR-001 — the React migration trigger and the WebSocket trigger are the same Phase 6 event.

---

*Filed: 2026-06-12*
