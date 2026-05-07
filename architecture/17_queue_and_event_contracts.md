architecture/17_queue_and_event_contracts.md

# Queue & Event Contracts

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the asynchronous runtime communication model for RepoPulse Command Center.

It specifies:

* Queue contracts
* Background job payloads
* Retry metadata
* Event schemas
* WebSocket event contracts
* Delivery guarantees
* Idempotency requirements
* Event ordering rules
* Dead-letter behavior
* Runtime synchronization guarantees

This document is the authoritative source-of-truth for async processing and event-driven communication.

---

# 1. Runtime Messaging Overview

## Messaging Objectives

The runtime messaging layer exists to:

1. Decouple expensive operations
2. Enable asynchronous processing
3. Support real-time updates
4. Improve runtime resilience
5. Support retry-safe workflows
6. Preserve operational consistency

---

# 2. Messaging Architecture

## Core Messaging Components

| Component         | Purpose                            |
| ----------------- | ---------------------------------- |
| Queue Runtime     | Background processing              |
| Worker Runtime    | Async execution                    |
| Event Bus         | Internal runtime communication     |
| WebSocket Layer   | Real-time frontend synchronization |
| Dead-Letter Queue | Failure isolation                  |

---

# 3. Queue Types

| Queue                | Purpose                   |
| -------------------- | ------------------------- |
| ingestion_queue      | GitHub synchronization    |
| metrics_queue        | Metric aggregation        |
| risk_queue           | Risk scoring              |
| recommendation_queue | Recommendation generation |
| notification_queue   | Notification dispatch     |
| cleanup_queue        | Retention enforcement     |
| audit_queue          | Async audit persistence   |

---

# 4. Queue Payload Principles

## QUEUE-001: Deterministic Payloads

Payloads must contain sufficient information for deterministic retry execution.

---

## QUEUE-002: Idempotency

All queue jobs must support safe retries.

---

## QUEUE-003: Correlation Tracking

All queue payloads must include correlation identifiers.

---

## QUEUE-004: Sanitization

Sensitive runtime data must not appear in queue payloads unnecessarily.

---

# 5. Base Queue Job Contract

## Standard Job Envelope

```json
{
  "jobId": "uuid",
  "jobType": "github.ingestion",
  "correlationId": "uuid",
  "createdAt": "2026-05-07T10:00:00Z",
  "retryCount": 0,
  "maxRetries": 4,
  "payload": {}
}
```

---

## Required Fields

| Field         | Required |
| ------------- | -------- |
| jobId         | Yes      |
| jobType       | Yes      |
| correlationId | Yes      |
| createdAt     | Yes      |
| retryCount    | Yes      |
| payload       | Yes      |

---

# 6. GitHub Ingestion Queue Contract

## Job Type

```plaintext
github.ingestion
```

---

## Purpose

Synchronize repository activity from GitHub.

---

## Payload Schema

```json
{
  "repositoryId": "uuid",
  "githubRepositoryId": "123456",
  "requestedBy": "uuid",
  "syncReason": "scheduled"
}
```

---

## Allowed Sync Reasons

| Reason    |
| --------- |
| scheduled |
| manual    |
| retry     |
| recovery  |

---

## Runtime Rules

1. Duplicate repository ingestion jobs must deduplicate safely.
2. GitHub ingestion retries must remain idempotent.
3. Partial ingestion failures must preserve valid persisted data.

---

# 7. Metrics Aggregation Queue Contract

## Job Type

```plaintext
metrics.aggregate
```

---

## Payload Schema

```json
{
  "projectId": "uuid",
  "repositoryIds": [
    "uuid"
  ],
  "triggeredBy": "github.ingestion.completed"
}
```

---

## Runtime Rules

1. Metrics recalculation must remain deterministic.
2. Missing repositories must reject safely.
3. Metrics recalculation must not overwrite valid state with incomplete data.

---

# 8. Risk Scoring Queue Contract

## Job Type

```plaintext
risk.calculate
```

---

## Payload Schema

```json
{
  "projectId": "uuid",
  "metricsSnapshotId": "uuid",
  "triggeredBy": "metrics.aggregate.completed"
}
```

---

## Runtime Rules

1. Risk calculations must remain deterministic.
2. Same metrics snapshot must produce identical output.
3. Risk recalculation failures must preserve prior valid score.

---

# 9. Recommendation Queue Contract

## Job Type

```plaintext
recommendation.generate
```

---

## Payload Schema

```json
{
  "projectId": "uuid",
  "riskScoreId": "uuid",
  "riskLevel": "HIGH"
}
```

---

## Runtime Rules

1. Recommendations must remain explainable.
2. Duplicate recommendation generation must deduplicate safely.

---

# 10. Notification Queue Contract

## Job Type

```plaintext
notification.dispatch
```

---

## Payload Schema

```json
{
  "notificationId": "uuid",
  "deliveryChannel": "email",
  "priority": "HIGH"
}
```

---

## Supported Delivery Channels

| Channel |
| ------- |
| in_app  |
| email   |

---

## Runtime Rules

1. Failed delivery attempts must retry safely.
2. Duplicate notification delivery must collapse safely.

---

# 11. Cleanup Queue Contract

## Job Type

```plaintext
retention.cleanup
```

---

## Payload Schema

```json
{
  "cleanupTarget": "notifications",
  "retentionWindowDays": 90
}
```

---

## Runtime Rules

1. Cleanup operations must remain auditable.
2. Cleanup failures must never corrupt retained data.

---

# 12. Dead-Letter Queue Contract

## Purpose

Stores permanently failed jobs.

---

## Dead-Letter Payload

```json
{
  "originalJobId": "uuid",
  "jobType": "github.ingestion",
  "failedAt": "2026-05-07T10:00:00Z",
  "retryCount": 4,
  "error": {
    "code": "GITHUB_TIMEOUT",
    "message": "GitHub API timeout"
  },
  "payload": {}
}
```

---

## Dead-Letter Rules

1. Dead-letter jobs require manual review.
2. Dead-letter payloads must preserve original correlation IDs.
3. Dead-letter jobs must remain searchable.

---

# 13. Retry Behavior

## Retry Schedule

| Attempt | Delay      |
| ------- | ---------- |
| Retry 1 | 30 seconds |
| Retry 2 | 2 minutes  |
| Retry 3 | 10 minutes |
| Retry 4 | 30 minutes |

Maximum retries: 4

---

## Retry Rules

1. Retries must remain idempotent.
2. Retry exhaustion routes to dead-letter queue.
3. Retry state must persist.

---

# 14. Event Bus Contracts

## Internal Runtime Events

| Event                       | Trigger                  |
| --------------------------- | ------------------------ |
| github.ingestion.completed  | Ingestion success        |
| github.ingestion.failed     | Ingestion failure        |
| metrics.aggregate.completed | Metrics recalculated     |
| risk.changed                | Risk updated             |
| recommendation.created      | Recommendation generated |
| notification.sent           | Notification delivered   |

---

# 15. Base Event Envelope

## Standard Event Contract

```json
{
  "eventId": "uuid",
  "eventType": "risk.changed",
  "timestamp": "2026-05-07T10:00:00Z",
  "correlationId": "uuid",
  "payload": {}
}
```

---

# 16. GitHub Ingestion Event Contracts

## Event

```plaintext
github.ingestion.completed
```

---

## Payload

```json
{
  "repositoryId": "uuid",
  "commitCount": 12,
  "pullRequestCount": 4,
  "issueCount": 8,
  "completedAt": "2026-05-07T10:00:00Z"
}
```

---

## Failure Event

```plaintext
github.ingestion.failed
```

---

## Failure Payload

```json
{
  "repositoryId": "uuid",
  "errorCode": "RATE_LIMITED",
  "retryScheduled": true
}
```

---

# 17. Metrics Events

## Event

```plaintext
metrics.aggregate.completed
```

---

## Payload

```json
{
  "projectId": "uuid",
  "metricsSnapshotId": "uuid",
  "calculatedAt": "2026-05-07T10:00:00Z"
}
```

---

# 18. Risk Events

## Event

```plaintext
risk.changed
```

---

## Payload

```json
{
  "projectId": "uuid",
  "previousRiskLevel": "MEDIUM",
  "newRiskLevel": "HIGH",
  "score": 67,
  "riskScoreId": "uuid"
}
```

---

## Runtime Rules

1. Risk events publish only after persistence succeeds.
2. Duplicate risk events must deduplicate safely.

---

# 19. Recommendation Events

## Event

```plaintext
recommendation.created
```

---

## Payload

```json
{
  "recommendationId": "uuid",
  "projectId": "uuid",
  "severity": "HIGH"
}
```

---

# 20. Notification Events

## Event

```plaintext
notification.sent
```

---

## Payload

```json
{
  "notificationId": "uuid",
  "deliveryChannel": "email",
  "deliveredAt": "2026-05-07T10:00:00Z"
}
```

---

# 21. WebSocket Event Contracts

## WebSocket Endpoint

```plaintext
/ws
```

---

## Authentication

JWT required before subscription.

---

## WebSocket Event Types

| Event                  | Purpose                       |
| ---------------------- | ----------------------------- |
| dashboard.updated      | Dashboard metrics changed     |
| risk.changed           | Risk level changed            |
| recommendation.created | Recommendation generated      |
| notification.created   | Notification created          |
| runtime.degraded       | Runtime entered degraded mode |

---

# 22. WebSocket Event Envelope

```json
{
  "event": "risk.changed",
  "timestamp": "2026-05-07T10:00:00Z",
  "data": {}
}
```

---

# 23. Dashboard Update Event

## Event

```plaintext
dashboard.updated
```

---

## Payload

```json
{
  "projectId": "uuid",
  "metricsSnapshotId": "uuid",
  "updatedAt": "2026-05-07T10:00:00Z"
}
```

---

# 24. Runtime Degraded Event

## Event

```plaintext
runtime.degraded
```

---

## Payload

```json
{
  "service": "github",
  "status": "DEGRADED",
  "detectedAt": "2026-05-07T10:00:00Z"
}
```

---

# 25. Event Ordering Rules

## Ordering Guarantees

1. Persisted state is authoritative.
2. Events publish only after successful persistence.
3. Newer events supersede older events.
4. Clients must reject stale events where possible.

---

## Sequence Rules

| Event Sequence                          | Required |
| --------------------------------------- | -------- |
| ingestion.completed → metrics.aggregate | Yes      |
| metrics.aggregate → risk.changed        | Yes      |
| risk.changed → recommendation.created   | Yes      |

---

# 26. Event Deduplication Rules

## Deduplication Requirements

Events may deduplicate using:

* eventId
* correlationId
* entityId + timestamp

---

## Deduplication Constraints

1. Duplicate events must not corrupt state.
2. Duplicate notifications must collapse safely.

---

# 27. Concurrency Rules

## Concurrency Constraints

1. Multiple ingestion jobs for same repository must serialize safely.
2. Risk scoring must operate on immutable metrics snapshots.
3. Event replay must not duplicate persistence.

---

# 28. Queue Monitoring Requirements

## Required Metrics

| Metric             | Purpose             |
| ------------------ | ------------------- |
| Queue depth        | Capacity visibility |
| Retry rate         | Failure detection   |
| Dead-letter volume | Operational risk    |
| Worker concurrency | Runtime scaling     |

---

## Alert Thresholds

| Event                | Threshold         |
| -------------------- | ----------------- |
| Retry spike          | >100/hour         |
| Dead-letter increase | >20/hour          |
| Queue backlog        | >1000 queued jobs |

---

# 29. Acceptance Criteria

## Scenario 1: Idempotent Retry

Given an ingestion retry occurs
When persistence executes
Then duplicate commit records must not be created

---

## Scenario 2: Risk Event Ordering

Given metrics aggregation completes
When risk scoring executes
Then risk.changed must publish only after score persistence succeeds

---

## Scenario 3: WebSocket Synchronization

Given a connected dashboard client exists
When risk changes
Then the client must receive a real-time risk.changed event

---

## Scenario 4: Dead-Letter Routing

Given retry exhaustion occurs
When a job fails repeatedly
Then the job must move to the dead-letter queue

---

## Scenario 5: Duplicate Notification Prevention

Given repeated identical alerts occur
When notification dispatch executes
Then duplicate notifications must collapse safely
