# ADR-001: Frontend Technology — Vanilla JS vs React

**Status:** ACCEPTED — 2026-06-12  
**Deciders:** Seif (project owner), Claude (system hardener / orchestration layer)  
**Relates to:** `spec/01_requirements.md` System Constraint #4; `spec/02_system_specification.md` Technology Stack

---

## Context

### Current Requirement

`spec/01_requirements.md` System Constraint #4 originally stated:

> "Frontend must use React."

`spec/02_system_specification.md` Technology Stack table originally listed:

> `| Frontend | React |`

### Current Implementation Reality

The dashboard frontend is a single vanilla HTML/JS file: `frontend/dashboard.html` (~8,240 lines as of 2026-06-12).

- No React, no JSX, no build toolchain, no `node_modules` in the frontend layer
- Pure renderer functions (e.g. `buildPortfolioBriefingHtml`, `buildTopRemediationActionsHtml`) are directly testable via verbatim copy into Jest test files — no DOM or browser required
- 14 frontend unit test files; ~850 tests; all passing
- 154+ commits invested in this architecture

No React code exists anywhere in the repository.

---

## Options Evaluated

### Option A — Accept Vanilla JS (Phases 1–5); React Deferred to Phase 6+

Accept the current implementation. Update the spec to reflect vanilla JS for the current release. Formally defer React migration to Phase 6+ with defined triggers.

**Documentation changes only.** No application code or tests modified.

### Option B — Migrate to React

Rewrite `frontend/dashboard.html` as a React application. Introduce a build toolchain (Vite or Create React App). Replace verbatim-copy Jest tests with React Testing Library tests.

**Significant scope.** Estimated: multi-week rewrite; all 850 frontend tests require migration; breaks the verbatim-copy test pattern.

---

## Risk/Benefit Analysis

### Option A

| Dimension | Assessment |
|---|---|
| Delivery risk | None — no code change |
| Regression risk | None |
| Test impact | None — 850 tests remain green |
| CLAUDE.md Anti-Drift compliance | High — closes spec divergence without diverting from core capability gaps |
| Consistency | Sets the Phase 6+ trigger pattern used by ADR-002 |
| Risk | One: "vanilla JS" in the spec may surprise new contributors expecting React — addressed by honest spec wording and this ADR |

### Option B

| Dimension | Assessment |
|---|---|
| Delivery risk | High — full rewrite of 8,240-line dashboard |
| Regression risk | High — all 850 frontend tests must be re-written |
| Test impact | Breaks verbatim-copy Jest pattern; requires React Testing Library |
| CLAUDE.md Anti-Drift compliance | Low — introduces Phase 6 migration scope before FR-007, FR-009, NFR-007 gaps are closed |
| Infrastructure | Requires build toolchain (Vite/CRA), `package.json` changes, CI build step |

---

## Decision

**Accept Option A.**

Rationale:

1. **CLAUDE.md Anti-Drift Rule.** Core maturity gaps (real-time transport, notifications delivery, FR-009 filtering, NFR-007 data governance) must be closed before a frontend technology migration.
2. **Test investment.** 154 commits and 850 passing tests are built on the verbatim-copy pattern. Migration to React Testing Library would require rewriting all of them with no functional benefit.
3. **Spec constraint origin.** The React constraint was written as a forward-looking technology preference, not a delivered capability. The dashboard has never used React. Accepting vanilla JS aligns the spec with reality.
4. **Phase 6+ trigger.** Natural triggers for React migration — WebSocket implementation (FR-007), multi-page shared-component requirements, or dashboard complexity crossing a maintainability threshold — are well-defined and preserved.

---

## Consequences

- `spec/01_requirements.md` System Constraint #4 updated to state vanilla JS for Phases 1–5; React deferred to Phase 6+.
- `spec/02_system_specification.md` Technology Stack table updated; Overview list item 1 updated; Architecture diagram label updated.
- `PROGRESS.md` divergence table row marked ACCEPTED; known risk row resolved.
- No application code modified. No tests modified.

---

## Phase 6+ Migration Triggers

React migration should be re-evaluated when **any one** of the following is true:

1. FR-007 WebSocket real-time transport is implemented (requires component-level re-render on push events — React's strength)
2. `frontend/dashboard.html` exceeds a maintainable complexity threshold (subjective; suggest >12,000 lines or >20 distinct rendering contexts as a guideline)
3. Multi-page shared-component requirements arise that cannot be met without a component model

---

*Filed: 2026-06-12*
