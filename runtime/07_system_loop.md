runtime/07_system_loop.md

# System Loop

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the runtime orchestration model for RepoPulse Command Center, including:

* Real-time runtime behavior
* Event flows
* Background processing
* Trigger systems
* Scheduling behavior
* Runtime synchronization
* Recovery loops
* Queue orchestration
* Operational heartbeat rules

The runtime model defines how the system behaves continuously during operation.

---

# 1. Runtime Architecture Overview

## Runtime Objectives

The runtime system must:

1. Continuously ingest repository activity
2. Recalculate project health metrics
3. Detect project risks
4. Generate recommendations
5. Notify users of critical events
6. Synchronize dashboard updates in real time
7. Recover safely from transient failures
8. Preserve consistency under concurrency

---

# 2. Core Runtime Loops

| Loop                | Purpose                    |
| ------------------- | -------------------------- |
| Authentication Loop | Session validation         |
| Ingestion Loop      | GitHub synchronization     |
| Metrics Loop        | Project metric aggregation |
| Risk Loop           | Risk scoring               |
| Recommendation Loop | Recommendation generation  |
| Notification Loop   | Alert dispatch             |
| Real-Time Sync Loop | Dashboard synchronization  |
| Cleanup Loop        | Retention and archival     |
| Recovery Loop       | Failure recovery           |
| Monitoring Loop     | Operational observability  |

---

# 3. Authentication Runtime Loop

## Purpose

Continuously validate authenticated user sessions.

---

## Runtime Flow

```plaintext id="xjlwmj"
User Request
    ->
Token Validation
    ->
Session Verification
    ->
Authorization Check
    ->
Request Processing

```

---

## Runtime Rules

1. Every protected request requires session validation.
2. Expired sessions terminate immediately.
3. Revoked users lose access immediately where supported.
4. Failed validation generates audit events.

---

## Trigger Sources

| Trigger              | Source   |
| -------------------- | -------- |
| API request          | User     |
| WebSocket connection | Frontend |
| Session refresh      | Frontend |

---

# 4. GitHub Ingestion Loop

## Purpose

Continuously synchronize GitHub repository activity.

---

## Runtime Flow

```plaintext id="e3c0c7"
Scheduler Trigger
    ->
Queue Job Creation
    ->
GitHub API Fetch
    ->
Normalization
    ->
Persistence
    ->
Metrics Recalculation Trigger

```

---

## Scheduling Rules

| Job                  | Frequency           |
| -------------------- | ------------------- |
| Repository ingestion | Every 5 minutes     |
| Manual sync          | On-demand           |
| Retry sync           | Exponential backoff |

---

## Ingestion Runtime Rules

1. Ingestion must be idempotent.
2. Duplicate jobs must not create duplicate records.
3. Failed ingestion must preserve previous metrics.
4. Rate-limit detection must reduce polling frequency.

---

## Failure Handling

| Failure              | Runtime Response         |
| -------------------- | ------------------------ |
| GitHub unavailable   | Retry with backoff       |
| Rate limit exceeded  | Delay ingestion          |
| Partial data failure | Preserve valid data      |
| Queue failure        | Trigger degraded runtime |

---

# 5. Metrics Aggregation Loop

## Purpose

Calculate project health indicators continuously.

---

## Runtime Flow

```plaintext id="s4vxrk"
Ingestion Complete
    ->
Metrics Aggregation
    ->
Metric Persistence
    ->
Risk Evaluation Trigger

```

---

## Calculated Metrics

| Metric                | Source           |
| --------------------- | ---------------- |
| Commit frequency      | Commits          |
| Contributor activity  | Contributors     |
| Open issue age        | Issues           |
| Pull request age      | Pull requests    |
| Milestone completion  | Project metadata |
| Repository inactivity | Timestamps       |

---

## Runtime Rules

1. Metrics must calculate deterministically.
2. Invalid metrics must reject safely.
3. Aggregation must not block dashboard reads.

---

# 6. Risk Scoring Loop

## Purpose

Continuously evaluate project health risk.

---

## Runtime Flow

```plaintext id="y0ujko"
Metrics Updated
    ->
Risk Rule Evaluation
    ->
Risk Score Persistence
    ->
Recommendation Trigger
    ->
Notification Trigger

```

---

## Runtime Rules

1. Risk evaluation must be deterministic.
2. Identical inputs must produce identical outputs.
3. Risk recalculation must be traceable.
4. Risk updates must publish real-time events.

---

## Escalation Triggers

| Trigger               | Risk Impact |
| --------------------- | ----------- |
| Repository inactivity | Increase    |
| Stale PRs             | Increase    |
| Failed ingestion      | Increase    |
| Missed milestones     | Increase    |
| Contributor decline   | Increase    |

---

# 7. Recommendation Generation Loop

## Purpose

Generate explainable recommendations.

---

## Runtime Flow

```plaintext id="k6ftmq"
Risk Score Updated
    ->
Recommendation Rules Evaluated
    ->
Recommendation Persisted
    ->
Dashboard Update Trigger

```

---

## Recommendation Rules

1. Recommendations must reference triggering conditions.
2. Recommendations must remain explainable.
3. Recommendations must not execute actions automatically.

---

## Runtime Constraints

1. Recommendation generation must remain deterministic.
2. Duplicate recommendations must deduplicate where possible.

---

# 8. Notification Dispatch Loop

## Purpose

Notify project managers of important runtime events.

---

## Runtime Flow

```plaintext id="31zqjm"
Risk Escalation
    ->
Notification Queue
    ->
Dispatch Attempt
    ->
Delivery Result
    ->
Audit Logging

```

---

## Notification Channels

| Channel | Purpose          |
| ------- | ---------------- |
| In-app  | Primary alerts   |
| Email   | Secondary alerts |

---

## Notification Rules

1. Critical risk generates immediate alerts.
2. Duplicate notifications must collapse.
3. Failed delivery retries safely.
4. Notification delivery must not block scoring.

---

# 9. Real-Time Synchronization Loop

## Purpose

Synchronize dashboard state across active clients.

---

## Runtime Flow

```plaintext id="03eh5j"
State Change
    ->
Event Publication
    ->
WebSocket Broadcast
    ->
Frontend Reconciliation
    ->
Dashboard Update

```

---

## Real-Time Events

| Event                  | Trigger                  |
| ---------------------- | ------------------------ |
| dashboard.updated      | Metrics recalculated     |
| risk.changed           | Risk updated             |
| recommendation.created | Recommendation generated |
| notification.created   | Notification queued      |

---

## Synchronization Rules

1. Out-of-order events must reject safely.
2. Duplicate events must merge safely.
3. Last valid state must preserve during disconnects.
4. Reconnection must reconcile stale events.

---

# 10. Background Queue Runtime Loop

## Purpose

Coordinate asynchronous processing.

---

## Queue Flow

```plaintext id="1drz7m"
Job Created
    ->
Queue Persisted
    ->
Worker Assigned
    ->
Execution
    ->
Completion or Retry

```

---

## Queue Runtime Rules

1. Jobs must support retry safety.
2. Failed jobs must move to dead-letter handling after retry exhaustion.
3. Queue overload must trigger alerts.
4. Long-running jobs must isolate safely.

---

## Queue Types

| Queue                | Purpose                   |
| -------------------- | ------------------------- |
| ingestion_queue      | GitHub synchronization    |
| risk_queue           | Risk scoring              |
| recommendation_queue | Recommendation generation |
| notification_queue   | Alert delivery            |
| cleanup_queue        | Retention enforcement     |

---

# 11. Cleanup & Retention Loop

## Purpose

Enforce data governance and retention policies.

---

## Runtime Flow

```plaintext id="i7vq2n"
Scheduled Cleanup
    ->
Retention Evaluation
    ->
Archive or Purge
    ->
Audit Preservation

```

---

## Retention Rules

| Data Type         | Retention  |
| ----------------- | ---------- |
| Audit logs        | 7 years    |
| Notifications     | 90 days    |
| Sessions          | 30 days    |
| Archived projects | Indefinite |

---

## Cleanup Constraints

1. Audit integrity must preserve.
2. Active projects must never purge accidentally.
3. Cleanup must remain reversible where possible.

---

# 12. Recovery Runtime Loop

## Purpose

Recover from transient and operational failures.

---

## Runtime Flow

```plaintext id="d9trvh"
Failure Detection
    ->
Failure Classification
    ->
Retry or Recovery
    ->
Health Verification
    ->
Normal Operation

```

---

## Recovery Rules

1. Recovery must preserve valid persisted state.
2. Recovery retries must remain capped.
3. Critical failures must trigger alerts.
4. Recovery actions must audit where applicable.

---

## Recovery Triggers

| Trigger              | Recovery Action    |
| -------------------- | ------------------ |
| Queue failure        | Restart workers    |
| WebSocket disconnect | Reconnect          |
| GitHub outage        | Backoff retry      |
| Notification failure | Retry delivery     |
| Database reconnect   | Resume queued jobs |

---

# 13. Monitoring & Observability Loop

## Purpose

Continuously observe operational health.

---

## Runtime Flow

```plaintext id="u7s6v8"
Metric Collection
    ->
Aggregation
    ->
Threshold Evaluation
    ->
Alert Generation

```

---

## Collected Metrics

| Metric                | Purpose                    |
| --------------------- | -------------------------- |
| API latency           | Performance                |
| Queue depth           | Capacity                   |
| WebSocket disconnects | Runtime health             |
| Ingestion duration    | External dependency health |
| Notification failures | Delivery health            |

---

## Monitoring Rules

1. Critical failures trigger alerts immediately.
2. Missing heartbeat metrics trigger degraded state.
3. Monitoring failures must not crash runtime.

---

# 14. Runtime Heartbeat Model

## Purpose

Detect unhealthy services.

---

## Heartbeat Rules

| Service               | Heartbeat Interval |
| --------------------- | ------------------ |
| API service           | 30 seconds         |
| Queue workers         | 30 seconds         |
| WebSocket runtime     | 15 seconds         |
| Database health check | 60 seconds         |

---

## Heartbeat Failure Handling

1. Missing heartbeats trigger degraded runtime state.
2. Consecutive failures trigger operational alerts.
3. Recovery clears degraded status automatically where safe.

---

# 15. Runtime Concurrency Rules

## Concurrency Constraints

1. Duplicate ingestion jobs for same repository must lock safely.
2. Concurrent role updates require consistency validation.
3. Simultaneous dashboard updates must reconcile deterministically.
4. Queue retries must remain idempotent.

---

# 16. Runtime Degraded Mode Behavior

## Degraded Mode Triggers

| Trigger               | Effect                            |
| --------------------- | --------------------------------- |
| Database instability  | Read-only fallback where possible |
| GitHub outage         | Cached metrics remain visible     |
| Queue outage          | Async jobs paused                 |
| WebSocket instability | Polling fallback allowed          |

---

## Runtime Rules

1. Partial functionality must remain available where safe.
2. Existing dashboard data must remain visible.
3. Degraded mode must remain observable.

---

# 17. Runtime Shutdown Sequence

## Shutdown Flow

```plaintext id="2it3ws"
Stop New Requests
    ->
Drain Active Requests
    ->
Pause Queue Intake
    ->
Persist Final State
    ->
Close Connections

```

---

## Shutdown Rules

1. Active requests must complete safely where possible.
2. Queue integrity must preserve.
3. Partial writes must avoid corruption.

---

# 18. Runtime Acceptance Criteria

## Scenario 1: Continuous Synchronization

Given active repositories exist
When runtime loops execute
Then repository metrics must remain current

---

## Scenario 2: Risk Escalation Runtime

Given repository inactivity increases
When scoring loop executes
Then risk updates and recommendations must publish automatically

---

## Scenario 3: Queue Retry Recovery

Given temporary ingestion failure occurs
When retry executes
Then valid data must preserve without duplication

---

## Scenario 4: Real-Time Dashboard Synchronization

Given connected dashboard clients exist
When metrics update
Then synchronized dashboard updates must occur automatically

---

## Scenario 5: Runtime Recovery

Given temporary infrastructure failure occurs
When recovery loop executes
Then runtime must return safely to operational state
