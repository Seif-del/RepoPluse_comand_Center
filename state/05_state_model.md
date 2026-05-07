state/05_state_model.md

# State Model

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the complete runtime state model for RepoPulse Command Center, including:

* System states
* Entity lifecycle states
* Valid transitions
* Invalid transitions
* Invariants
* Recovery behavior
* Real-time synchronization rules

The state model defines authoritative system behavior and consistency expectations.

---

# 1. Global State Principles

## SP-001: Explicit State Ownership

Every mutable entity must have:

* A defined current state
* Valid transition rules
* Transition triggers
* Failure handling behavior

---

## SP-002: Invalid Transition Rejection

Invalid state transitions must fail safely.

### Required Behavior

1. Invalid transitions must not mutate state.
2. Invalid transitions must be logged where relevant.
3. Unauthorized transitions must trigger audit events.

---

## SP-003: State Consistency

The system must preserve consistency across:

* Database state
* Dashboard state
* Queue state
* Real-time state

---

# 2. User Lifecycle State Model

## User States

| State         | Description                  |
| ------------- | ---------------------------- |
| CREATED       | User record initialized      |
| AUTHENTICATED | Active authenticated session |
| ACTIVE        | Authorized operational user  |
| SUSPENDED     | Temporarily blocked          |
| REVOKED       | Access permanently removed   |
| DELETED       | User anonymized or removed   |

---

## Valid User Transitions

```plaintext id="rcl7tl"
CREATED -> AUTHENTICATED
AUTHENTICATED -> ACTIVE
ACTIVE -> SUSPENDED
SUSPENDED -> ACTIVE
ACTIVE -> REVOKED
REVOKED -> DELETED

```

---

## Invalid User Transitions

| Invalid Transition       | Reason                            |
| ------------------------ | --------------------------------- |
| DELETED -> ACTIVE        | Deleted users cannot reactivate   |
| REVOKED -> AUTHENTICATED | Revoked users cannot authenticate |
| SUSPENDED -> DELETED     | Requires revocation workflow      |

---

## User Invariants

1. Revoked users must not access APIs.
2. Deleted users must not own active sessions.
3. Suspended users must retain audit history.
4. User role assignments must remain auditable.

---

# 3. Authentication Session State Model

## Session States

| State       | Description           |
| ----------- | --------------------- |
| CREATED     | Session initialized   |
| ACTIVE      | Authenticated session |
| EXPIRED     | Token expired         |
| INVALIDATED | Session revoked       |
| TERMINATED  | Explicit logout       |

---

## Session Transitions

```plaintext id="v3gz5s"
CREATED -> ACTIVE
ACTIVE -> EXPIRED
ACTIVE -> INVALIDATED
ACTIVE -> TERMINATED

```

---

## Session Rules

1. Expired sessions cannot reactivate.
2. Invalidated sessions require re-authentication.
3. Concurrent active sessions may be allowed based on policy.

---

# 4. Project Lifecycle State Model

## Project States

| State    | Description                |
| -------- | -------------------------- |
| CREATED  | Project initialized        |
| ACTIVE   | Project operational        |
| AT_RISK  | Elevated risk detected     |
| CRITICAL | Severe risk detected       |
| ARCHIVED | Read-only historical state |
| DELETED  | Removed from active system |

---

## Project Transitions

```plaintext id="jv34qn"
CREATED -> ACTIVE
ACTIVE -> AT_RISK
AT_RISK -> CRITICAL
CRITICAL -> AT_RISK
AT_RISK -> ACTIVE
ACTIVE -> ARCHIVED
ARCHIVED -> ACTIVE
ARCHIVED -> DELETED

```

---

## Invalid Project Transitions

| Invalid Transition  | Reason                                   |
| ------------------- | ---------------------------------------- |
| DELETED -> ACTIVE   | Deleted projects cannot restore directly |
| CREATED -> CRITICAL | Requires scoring lifecycle               |
| ACTIVE -> DELETED   | Must archive first                       |

---

## Project Invariants

1. Archived projects are read-only.
2. Deleted projects must preserve audit records.
3. Risk state changes must generate recalculation events.
4. Risk state changes must remain historically traceable.

---

# 5. Repository Lifecycle State Model

## Repository States

| State        | Description         |
| ------------ | ------------------- |
| CONNECTED    | Repository active   |
| SYNC_PENDING | Awaiting ingestion  |
| SYNCING      | Active ingestion    |
| SYNC_FAILED  | Ingestion failed    |
| DISCONNECTED | Repository detached |
| ARCHIVED     | Repository archived |

---

## Repository Transitions

```plaintext id="4i6yo4"
CONNECTED -> SYNC_PENDING
SYNC_PENDING -> SYNCING
SYNCING -> CONNECTED
SYNCING -> SYNC_FAILED
SYNC_FAILED -> SYNC_PENDING
CONNECTED -> DISCONNECTED
CONNECTED -> ARCHIVED

```

---

## Repository Invariants

1. Disconnected repositories must stop ingestion immediately.
2. Archived repositories must become read-only.
3. Failed sync state must preserve prior metrics.
4. Duplicate sync jobs must not corrupt repository state.

---

# 6. Ingestion Job State Model

## Job States

| State         | Description          |
| ------------- | -------------------- |
| QUEUED        | Awaiting execution   |
| RUNNING       | Active processing    |
| COMPLETED     | Successful execution |
| FAILED        | Execution failed     |
| RETRY_PENDING | Awaiting retry       |
| DEAD_LETTERED | Retry exhaustion     |

---

## Job Transitions

```plaintext id="blxvhi"
QUEUED -> RUNNING
RUNNING -> COMPLETED
RUNNING -> FAILED
FAILED -> RETRY_PENDING
RETRY_PENDING -> RUNNING
FAILED -> DEAD_LETTERED

```

---

## Job Invariants

1. Completed jobs must not re-run automatically.
2. Dead-lettered jobs require manual review.
3. Retry attempts must remain capped.
4. Jobs must support idempotent execution.

---

# 7. Risk Engine State Model

## Risk States

| State    | Description                     |
| -------- | ------------------------------- |
| LOW      | Minimal concern                 |
| MEDIUM   | Elevated concern                |
| HIGH     | Significant concern             |
| CRITICAL | Immediate intervention required |

---

## Risk Transition Rules

### Escalation Triggers

| Trigger               | Effect        |
| --------------------- | ------------- |
| Repository inactivity | Increase risk |
| Stale pull requests   | Increase risk |
| Missed milestones     | Increase risk |
| Contributor drop-off  | Increase risk |
| Failed ingestion      | Increase risk |

---

### Recovery Triggers

| Trigger                  | Effect      |
| ------------------------ | ----------- |
| New contributor activity | Reduce risk |
| Recent commits           | Reduce risk |
| Resolved issues          | Reduce risk |
| Successful ingestion     | Reduce risk |

---

## Risk Invariants

1. Risk calculations must be deterministic.
2. Risk changes must generate audit entries where configured.
3. Critical risk must trigger notifications.
4. Risk cannot bypass recalculation rules.

---

# 8. Recommendation State Model

## Recommendation States

| State        | Description                |
| ------------ | -------------------------- |
| GENERATED    | Recommendation created     |
| DELIVERED    | Visible to user            |
| ACKNOWLEDGED | User reviewed              |
| DISMISSED    | User rejected              |
| RESOLVED     | Trigger condition resolved |

---

## Recommendation Transitions

```plaintext id="r2yn7z"
GENERATED -> DELIVERED
DELIVERED -> ACKNOWLEDGED
ACKNOWLEDGED -> RESOLVED
ACKNOWLEDGED -> DISMISSED

```

---

## Recommendation Invariants

1. Recommendations must remain explainable.
2. Resolved recommendations cannot reactivate.
3. Dismissed recommendations remain auditable.

---

# 9. Notification State Model

## Notification States

| State   | Description                    |
| ------- | ------------------------------ |
| CREATED | Notification initialized       |
| QUEUED  | Awaiting delivery              |
| SENT    | Successfully delivered         |
| FAILED  | Delivery failure               |
| READ    | User opened notification       |
| EXPIRED | Notification retention elapsed |

---

## Notification Transitions

```plaintext id="jv2v0h"
CREATED -> QUEUED
QUEUED -> SENT
QUEUED -> FAILED
SENT -> READ
READ -> EXPIRED

```

---

## Notification Invariants

1. Duplicate notifications must deduplicate where applicable.
2. Failed notifications must support retry.
3. Expired notifications must preserve audit traceability.

---

# 10. Audit Log State Model

## Audit States

| State    | Description                |
| -------- | -------------------------- |
| CREATED  | Audit entry generated      |
| STORED   | Persisted successfully     |
| ARCHIVED | Historical retention state |

---

## Audit Rules

1. Audit records are append-only.
2. Audit entries cannot transition backward.
3. Audit deletion is prohibited unless legally required.

---

# 11. Dashboard Runtime State Model

## Dashboard States

| State        | Description               |
| ------------ | ------------------------- |
| INITIALIZING | Loading initial state     |
| ACTIVE       | Receiving updates         |
| DEGRADED     | Partial backend failure   |
| DISCONNECTED | Real-time connection lost |
| RECOVERING   | Resynchronizing state     |
| TERMINATED   | User session ended        |

---

## Dashboard Transitions

```plaintext id="74h0sj"
INITIALIZING -> ACTIVE
ACTIVE -> DEGRADED
ACTIVE -> DISCONNECTED
DISCONNECTED -> RECOVERING
RECOVERING -> ACTIVE
ACTIVE -> TERMINATED

```

---

## Dashboard Invariants

1. Dashboard must preserve last valid state during disconnect.
2. Invalid real-time events must reject safely.
3. Reconnection must reconcile stale updates safely.

---

# 12. WebSocket Connection State Model

## WebSocket States

| State          | Description                   |
| -------------- | ----------------------------- |
| CONNECTING     | Establishing connection       |
| AUTHENTICATING | Validating session            |
| CONNECTED      | Active connection             |
| DEGRADED       | Partial transport instability |
| RECONNECTING   | Attempting recovery           |
| CLOSED         | Connection terminated         |

---

## WebSocket Transitions

```plaintext id="ozb3s0"
CONNECTING -> AUTHENTICATING
AUTHENTICATING -> CONNECTED
CONNECTED -> DEGRADED
CONNECTED -> CLOSED
DEGRADED -> RECONNECTING
RECONNECTING -> CONNECTED

```

---

## WebSocket Invariants

1. Unauthorized sockets must disconnect immediately.
2. Duplicate events must merge safely.
3. Out-of-order events must not overwrite newer state.

---

# 13. System Runtime State Model

## Runtime States

| State         | Description                     |
| ------------- | ------------------------------- |
| STARTING      | System boot sequence            |
| HEALTHY       | All critical services available |
| DEGRADED      | Partial subsystem failure       |
| RECOVERING    | Recovery workflow active        |
| MAINTENANCE   | Planned operational mode        |
| SHUTTING_DOWN | Graceful termination            |
| OFFLINE       | System unavailable              |

---

## Runtime Transitions

```plaintext id="50g5du"
STARTING -> HEALTHY
HEALTHY -> DEGRADED
DEGRADED -> RECOVERING
RECOVERING -> HEALTHY
HEALTHY -> MAINTENANCE
MAINTENANCE -> HEALTHY
HEALTHY -> SHUTTING_DOWN
SHUTTING_DOWN -> OFFLINE

```

---

## Runtime Invariants

1. Database unavailability prevents HEALTHY state.
2. Critical queue failure triggers DEGRADED state.
3. Recovery must not destroy valid persisted state.

---

# 14. Invalid Global States

The following states are prohibited:

| Invalid State                                                  | Reason                   |
| -------------------------------------------------------------- | ------------------------ |
| Active user with revoked session                               | Security violation       |
| Dashboard active without authorization                         | Unauthorized visibility  |
| Repository syncing after disconnection                         | Data integrity violation |
| Archived project accepting writes                              | Governance violation     |
| Duplicate ingestion running simultaneously for same repository | Consistency risk         |

---

# 15. Recovery Rules

## RR-001: Safe Recovery

Recovery operations must:

1. Preserve prior valid data.
2. Avoid duplicate writes.
3. Reconcile event ordering safely.

---

## RR-002: Retry Safety

Retries must:

1. Remain idempotent.
2. Preserve audit integrity.
3. Respect retry limits.

---

# 16. State Consistency Rules

## SCR-001: Database Authority

Persistent database state is authoritative over:

* Frontend cache
* Real-time transient state
* Queue memory state

---

## SCR-002: Event Ordering

Newer events must always supersede older events.

---

## SCR-003: Audit Preservation

No state transition may bypass audit requirements.

---

# 17. Acceptance Criteria

## Scenario 1: Repository Failure Recovery

Given ingestion fails during synchronization
When retry executes
Then duplicate records must not be created

---

## Scenario 2: Dashboard Disconnect

Given WebSocket disconnect occurs
When reconnection succeeds
Then stale events must not overwrite newer metrics

---

## Scenario 3: Risk Escalation

Given repository inactivity exceeds thresholds
When scoring recalculates
Then project state must escalate appropriately

---

## Scenario 4: Invalid Authorization

Given a revoked user attempts access
When API authorization executes
Then access must fail immediately

---

## Scenario 5: Project Archival

Given a project becomes archived
When users attempt modifications
Then write operations must be denied safely
