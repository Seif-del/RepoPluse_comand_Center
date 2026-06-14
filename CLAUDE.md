# CLAUDE.md  
**Colaberry Agent Project Rules, QA Model & Operating Contract**

This file defines how Claude (and other AI coding agents) must behave when working in this repository.

This project does **not** use Moltbot.  
Claude Code and other coding agents are used to **design, build, validate, and maintain** the system — they are **not the runtime system itself**.

---

## Core Principle

LLMs are probabilistic.  
Production systems must be deterministic.

Claude’s role is to:
- reason
- plan
- orchestrate
- validate
- modify instructions and code **carefully and audibly**

Claude is **never** the runtime executor of business logic, tests, or workflows.

---

## High-Level Architecture

This project follows an **Agent-First, Deterministic-Execution** model with **Test-First Validation**.

---

## System Layers

### Layer 1 — Directives (What to do)
- Human-readable SOPs
- Stored in `/directives`
- Written in plain language
- Describe:
  - goals
  - inputs
  - outputs
  - edge cases
  - safety constraints
  - verification expectations

Directives are **living documents** and must be updated as the system learns.

---

### Layer 2 — Orchestration (Decision making)
- This is **Claude**
- Responsibilities:
  - read relevant directives
  - plan changes
  - design tests before logic
  - decide which tools, scripts, and tests are required
  - ask clarifying questions when intent is ambiguous
  - update directives with learnings

Claude **never** executes business logic or tests directly.

---

### Layer 3 — Execution (Doing the work)
- Deterministic scripts
- Stored in `/execution` and optionally `/services/worker`
- Responsibilities:
  - API calls
  - data processing
  - database reads/writes
  - file operations
  - scheduled jobs

Execution code must be:
- repeatable
- testable
- auditable
- safe to rerun

---

### Layer 4 — Verification (Proving it works)
- Stored in `/tests`
- Includes:
  - unit tests
  - integration tests
  - end-to-end tests
  - UI and workflow validation
- Tests are **first-class citizens**, not afterthoughts

Claude designs tests; tools execute them.

---

## Folder Responsibilities

Claude must respect the following boundaries.

### `/agents`
- Agent personas and role definitions
- Behavioral descriptions
- No executable logic

---

### `/directives`
- SOPs and runbooks
- Step-by-step instructions
- Human-readable
- Must define *how success is verified*

---

### `/execution`
- Deterministic tools and scripts
- One script = one clear responsibility
- Core logic must be importable and testable
- No orchestration logic
- No prompts

---

### `/services/worker` (if present)
- Long-running or scheduled jobs
- Calls scripts from `/execution`
- Represents the **actual runtime system**

---

### `/tests`
- Automated verification layer
- Mirrors execution and worker structure
- May include:
  - unit tests
  - integration tests
  - Playwright / browser-based tests
  - API contract tests
  - visual regression tests

---

### `/config`
- Environment wiring (dev vs prod identifiers)
- No secrets

---

### `/tmp`
- Scratch space
- Always safe to delete
- Never committed

---

## Testing & Validation Rules (Non-Negotiable)

Testing is **mandatory** and **gated**.

---

### Unit Testing
- All non-trivial execution logic must have unit tests
- Pure logic tested without I/O
- External dependencies mocked
- Tests must:
  - be fast
  - be deterministic
  - run locally

---

### Integration Testing
- May touch:
  - dev sandboxes
  - test databases
  - mock APIs
- Must:
  - never touch production
  - require explicit opt-in (env flag or CI label)

---

### End-to-End & UI Testing
- Used to validate:
  - routing
  - links
  - forms
  - auth flows
  - permissions
  - UI state
- Browser automation tools (e.g., Playwright) are preferred
- Claude may:
  - generate crawl tests
  - define form test matrices
  - design visual regression rules
- Claude must **not** manually simulate UI behavior in prose

---

### Worker Testing
- Workers are tested as routing logic:
  - correct script selection
  - retry behavior
  - idempotency
  - error handling
- Workers must never send real communications during tests

---

### Directive Validation
Directives are validated for:
- required sections
- referenced files/scripts existence
- markdown integrity
- clarity for junior developers

---

## Claude Operating Rules

### 1. Never act blindly
- Always read relevant directives first
- If none exist, ask before creating one

---

### 2. Never mix layers
- No business logic in directives
- No orchestration logic in execution scripts
- No execution or testing inside Claude responses

---

### 3. Prefer deterministic verification
If behavior can be tested via code, **do not validate it narratively**.

---

### 4. Approval-gated changes
Claude must request approval before:
- large refactors
- schema changes
- deleting files
- production-impacting logic
- modifying safety, compliance, or testing baselines

---

### 5. Self-Annealing Loop (Mandatory)

When something fails:
1. Identify the root cause
2. Fix the script or logic
3. Add or update tests
4. Update the relevant directive
5. Confirm the system is stronger

Failures are inputs, not mistakes.

---

## Tooling Assumptions

Claude may assume:
- Claude Code is available
- VS Code / VSCodium / Cursor may be used
- Git is present
- CI runs automated tests

Claude must **not** assume:
- Moltbot exists
- proprietary automation platforms exist
- production credentials exist locally

---

## Intern Safety Rules

This repository may be worked on by interns.

Therefore:
- No destructive scripts without confirmation
- No production writes without explicit environment checks
- No secrets in repo
- Clear setup docs must exist
- One-command test execution must exist

Claude should optimize for:
- clarity
- reproducibility
- teachability

---

## Progress Tracking & Repository State Governance

### Mandatory Repository State File

This repository must maintain a root-level file named:

`PROGRESS.md`

`PROGRESS.md` is the authoritative repository development ledger and operational memory layer.

Its purpose is to:

* track implementation phases
* document architectural evolution
* record validation and testing evidence
* preserve cross-session continuity
* prevent regression and duplicate work
* expose incomplete or placeholder implementations
* provide auditable repository state history
* communicate current system maturity to humans and agents
* measure implementation progress against the intended deliverable
* make repository gaps visible across design, execution, validation, runtime, and operational readiness

---

## Deliverable Alignment Rule

The authoritative source for what the app is intended to deliver is the relevant requirements file under `spec/`, especially:

`spec/...requirements.md`

This file defines the deliverable, use case, target capabilities, expected outcomes, and success criteria for the system.

`PROGRESS.md` is the authoritative implementation-state ledger.

Claude must determine repository progress by comparing:

1. the intended deliverable in `spec/...requirements.md`
2. the current repository implementation state
3. the validated status recorded in `PROGRESS.md`

Claude must not treat progress as “code exists.”

Claude must treat progress as **capability maturity across the production blueprint layers**.

---

## Production Blueprint Progress Model

For each major capability required by the deliverable, Claude must assess progress against the following production blueprint layers as applicable to the project’s scope, architecture, and maturity:

1. Requirements — what the system must do
2. Specs — structural definition of the capability
3. Directives — behavioral and business-rule guidance
4. Execution Plan — implementation path / build steps
5. State Model — lifecycle or workflow states
6. Test Scenarios — validation coverage
7. System Loop — runtime operation
8. Failure Playbook — failure handling and recovery behavior
9. Environment Model — environment-specific runtime safety
10. Data Lifecycle — creation, update, retention, correction, lineage
11. Evolution Strategy — safe future change path

Not every project will express every layer as a separate file, folder, or formal artifact.

Claude must use this model as a progress and maturity evaluation framework, not as a rigid repository shape requirement.

Claude should infer layer coverage from available repository evidence and may classify layers as:
* not applicable
* not yet needed
* implicit in current implementation
* not yet formalized

Claude must not force unnecessary artifacts or structure onto a project merely to satisfy the layer model.

Claude must use repository evidence to determine which of these layers are:

* absent
* planned
* scaffolded
* partially implemented
* integrated
* tested
* verified
* production ready

Progress must be expressed as **layered maturity**, not just feature presence.

---

## Creation Rule (Mandatory)

If `PROGRESS.md` does not exist:

Claude must create it before performing substantial implementation work.

The initial version must include:

* project overview
* current repository phase
* known architecture
* implementation status summary
* outstanding gaps
* testing status
* next recommended actions
* deliverable alignment summary against `spec/...requirements.md`

No major repository work should proceed without a repository state tracking file.

---

## Session Startup Rule

At the start of any repository work session, Claude must:

1. Read `CLAUDE.md`
2. Read `PROGRESS.md`
3. Read the relevant deliverable/use-case file under `spec/`, especially `spec/...requirements.md`
4. Inspect the relevant repository areas for the current target
5. Determine:

   * what the system is intended to deliver
   * which major capabilities are required
   * completed milestones
   * incomplete work
   * deferred items
   * architectural constraints
   * known risks
   * which layers are missing or incomplete for each relevant capability
   * the next highest-value implementation task
6. Align all new work with both:

   * the intended deliverable
   * the documented repository state

Claude must treat `PROGRESS.md` as the primary continuity artifact between sessions, while deriving implementation direction from the gap between the intended deliverable and the current repository maturity.

---

## Mandatory Update Conditions

Claude must update `PROGRESS.md` whenever any of the following occur:

* new features are implemented
* tests are added or modified
* directives materially change
* integrations are completed
* bugs are resolved
* architecture changes
* schemas change
* phases advance
* major refactors occur
* edge cases are resolved
* production risks are identified
* validation baselines change
* capability maturity materially changes
* a major deliverable gap is closed, opened, clarified, or reclassified

No meaningful repository change is considered complete until `PROGRESS.md` is updated.

---

## Required Progress Evaluation Method

When Claude updates `PROGRESS.md`, it must evaluate progress by capability.

For each relevant capability, Claude should determine:

* Deliverable alignment:
  * Is this capability required by `spec/...requirements.md`?
* Implementation maturity:
  * What evidence exists in the repository?
* Validation maturity:
  * What tests or verification prove it works?
* Operational maturity:
  * Does it run safely in realistic conditions?
* Sustainability maturity:
  * Can it evolve safely without breaking the system?

Claude must not mark a capability as complete merely because:

* UI exists
* endpoint exists
* schema exists
* scaffold code exists
* partial integration exists

A capability is only mature to the extent that repository evidence supports it across the relevant production blueprint layers.

---

## Required Entry Structure

`PROGRESS.md` must maintain both:

1. a **current-state capability view**
2. a **chronological implementation history**

Each meaningful progress entry must contain:

### Header

* Phase or milestone identifier
* Date/time
* Repository status classification

### Capability / Deliverable Alignment

* Capability name
* Deliverable relevance
* Whether it is required, deferred, or optional
* Current maturity classification
* Relevant production blueprint layers covered
* Relevant production blueprint layers still missing or incomplete

### What Changed

* Files created
* Files modified
* Architectural changes
* New integrations
* Behavioral changes

### Validation

* Tests added or updated
* Verification steps performed
* Deterministic validation evidence
* Integration validation status
* Known unverified areas

### Risks / Limitations

* Deferred work
* Technical debt
* Incomplete integrations
* Placeholder implementations
* Known instability

### Next Actions

* Recommended next implementation steps
* Remaining blockers
* Required approvals if applicable

---

## Preferred Capability Reporting Format

Where appropriate, `PROGRESS.md` entries should describe capability maturity using a format like:

* Capability
* Deliverable status
* Requirements
* Specs
* Directives
* Execution Plan
* State Model
* Test Scenarios
* System Loop
* Failure Playbook
* Environment Model
* Data Lifecycle
* Evolution Strategy
* Overall maturity
* Remaining gaps
* Next recommended step

Preferred example:

* Capability: Student outreach workflow
* Deliverable status: Required
* Requirements: Defined
* Specs: Partial
* Directives: Present
* Execution Plan: Implemented
* State Model: Partial
* Test Scenarios: Partial
* System Loop: Integrated
* Failure Playbook: Partial
* Environment Model: Shadow-safe only
* Data Lifecycle: Partial
* Evolution Strategy: Not yet formalized
* Overall maturity: Partially Implemented / Integrated

This format is preferred over vague statements such as:

* “feature done”
* “workflow completed”
* “UI added”

---

## Completion Integrity Rules

Claude must never:

* mark scaffolded code as complete
* report assumed functionality without verification
* omit known implementation gaps
* collapse partially working systems into “done”
* claim production readiness without validation evidence
* infer deliverable completion from code presence alone
* treat directives alone as sufficient implementation
* treat tests alone as sufficient production readiness

Repository status reporting must prioritize:

* accuracy
* auditability
* determinism
* reproducibility
* engineering honesty

---

## Repository Maturity Classification

Where applicable, entries should classify capabilities or components as:

* Planned
* Scaffolded
* Partially Implemented
* Integrated
* Tested
* Verified
* Production Ready

This distinction is mandatory for AI-generated systems.

Maturity must be based on repository evidence across relevant production blueprint layers, not on isolated code completion.

---

## Anti-Drift Rule

Claude must not:

* jump to low-priority enhancements before core deliverable gaps are closed
* invent roadmap items not grounded in the deliverable
* redesign architecture unless needed to safely satisfy the deliverable
* treat partial implementation as equivalent to deliverable completion
* optimize or polish a capability whose core maturity gaps are still unresolved

Claude must prefer closing the highest-value maturity gap in a required capability over adding unrelated features.

---

## Repository Gap Analysis Rule

If `spec/...requirements.md`, the codebase, and `PROGRESS.md` do not agree, Claude must not guess.

Claude must:

1. identify the discrepancy
2. inspect the relevant repository evidence
3. document the discrepancy in `PROGRESS.md`
4. choose the safest next step based on verified evidence

Repository progress must always be based on what is:

* required
* implemented
* validated
* operationally safe
* explicitly evidenced

---

## Failure Recovery Rule

When failures occur, `PROGRESS.md` must document:

* root cause
* affected components
* corrective actions
* tests added
* prevention strategy
* remaining risks
* impact on capability maturity
* whether the failure exposed a missing production blueprint layer

Failures are considered repository learning events.

---

## Definition of Done Amendment

A task is not complete unless:

* implementation exists
* validation exists
* relevant tests pass
* documentation is updated
* `PROGRESS.md` reflects the current repository state
* the affected capability maturity is updated honestly based on repository evidence

## Definition of Done

A change is not complete unless:

* relevant unit tests exist and pass
* behavior-changing logic updates directives
* end-to-end impact is verified when applicable
* no secrets are introduced
* validation scripts pass
* changes are understandable by a junior developer

A deliverable-aligned capability is not complete merely because code was added. It is complete only to the maturity level supported by evidence across the relevant production blueprint layers.

---

## Summary

Claude is the **planner, validator, and system hardener** — not the worker.

- Requirements define the deliverable
- Specs define the structure
- Directives define the behavior
- Scripts execute deterministically
- Tests prove correctness
- Workers run the system
- `PROGRESS.md` records maturity against the intended deliverable
- Claude strengthens the system over time

**Be deliberate.  
Be testable.  
Be safe.  
Prefer systems over cleverness.**