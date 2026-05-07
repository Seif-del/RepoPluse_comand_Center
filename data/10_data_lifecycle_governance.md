data/10_data_lifecycle_governance.md

# Data Lifecycle & Governance

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the complete data governance model for RepoPulse Command Center, including:

* Data ownership
* Data classification
* Data creation rules
* Mutation policies
* Retention requirements
* Archival behavior
* Deletion workflows
* Audit preservation
* Compliance boundaries
* Recovery expectations

The governance model ensures the system remains secure, compliant, observable, recoverable, and operationally trustworthy throughout the full data lifecycle.

---

# 1. Governance Principles

## DG-001: Data Ownership

Every persisted data entity must have:

* Defined ownership
* Defined source authority
* Defined retention policy
* Defined mutation rules
* Defined deletion constraints

---

## DG-002: Least Data Principle

The system must store only data required for operational functionality, observability, compliance, and recovery.

---

## DG-003: Audit Preservation

Critical operational and security events must remain historically traceable even after user deletion or project archival.

---

## DG-004: Deterministic Governance

Identical governance conditions must produce identical lifecycle behavior.

---

# 2. Data Classification Model

## Data Sensitivity Levels

| Classification | Description                  |
| -------------- | ---------------------------- |
| PUBLIC         | Non-sensitive display data   |
| INTERNAL       | Operational platform data    |
| SENSITIVE      | User-linked operational data |
| CRITICAL       | Security-sensitive data      |

---

## Classification Examples

| Data Type                  | Classification |
| -------------------------- | -------------- |
| Dashboard metrics          | INTERNAL       |
| GitHub repository metadata | INTERNAL       |
| User profile information   | SENSITIVE      |
| JWT secrets                | CRITICAL       |
| OAuth tokens               | CRITICAL       |
| Audit logs                 | SENSITIVE      |
| Risk recommendations       | INTERNAL       |

---

# 3. Data Ownership Model

## Ownership Rules

| Data Entity      | Owner                |
| ---------------- | -------------------- |
| User profile     | Authenticated user   |
| Project metadata | Organization / Admin |
| Repository data  | Connected project    |
| Audit logs       | System               |
| Notifications    | Target user          |
| Risk scores      | System               |
| Recommendations  | System               |

---

## Governance Constraints

1. Users cannot directly modify audit records.
2. Risk scores are system-owned.
3. OAuth tokens are system-managed.
4. Repository metrics originate from GitHub authority.

---

# 4. Data Lifecycle Stages

## Lifecycle Stages

| Stage    | Description         |
| -------- | ------------------- |
| CREATED  | Initial persistence |
| ACTIVE   | Operational usage   |
| UPDATED  | Mutation occurred   |
| ARCHIVED | Read-only retention |
| PURGED   | Permanent removal   |

---

## Lifecycle Rules

1. All mutable data begins in CREATED state.
2. Audit records bypass UPDATE state and become immutable.
3. Archived records become read-only.
4. Purged records must remain unrecoverable unless backup restoration occurs.

---

# 5. User Data Governance

## User Data Types

| Data Type        | Examples                |
| ---------------- | ----------------------- |
| Identity data    | Name, email             |
| Session data     | Tokens, session records |
| Activity data    | Dashboard usage         |
| Access data      | Role assignments        |
| Audit references | Authentication events   |

---

## User Data Mutation Rules

1. Users may update profile metadata where allowed.
2. Role assignments require administrative authorization.
3. OAuth-linked identity fields remain externally authoritative where applicable.

---

## User Deletion Workflow

### Deletion Flow

```plaintext id="7z4n43"
Deletion Request
    ->
Authorization Validation
    ->
PII Removal
    ->
Audit Preservation
    ->
Lifecycle Completion

```

---

## User Deletion Constraints

1. Audit records must preserve.
2. Historical project metrics must preserve.
3. Deleted users must not retain active sessions.
4. Deletion must anonymize personal identifiers where required.

---

# 6. Repository Data Governance

## Repository Data Sources

| Source         | Authority  |
| -------------- | ---------- |
| GitHub commits | GitHub API |
| Pull requests  | GitHub API |
| Issues         | GitHub API |
| Contributors   | GitHub API |

---

## Repository Mutation Rules

1. Repository activity originates from ingestion only.
2. Manual modification of imported GitHub activity is prohibited.
3. Duplicate ingestion must reconcile idempotently.

---

## Repository Archival Rules

Archived repositories:

* Become read-only
* Stop active ingestion
* Preserve historical metrics
* Preserve audit references

---

# 7. Risk & Recommendation Governance

## Risk Data Governance

| Entity               | Governance Rule          |
| -------------------- | ------------------------ |
| Risk score           | Deterministic generation |
| Risk history         | Historical preservation  |
| Recommendation state | Traceable lifecycle      |

---

## Mutation Constraints

1. Risk recalculation must remain deterministic.
2. Manual overrides require audit logging.
3. Recommendation dismissal must remain traceable.

---

# 8. Audit Data Governance

## Audit Requirements

Audit logs must capture:

* Authentication events
* Authorization failures
* Role changes
* Repository changes
* Configuration changes
* Deployment-sensitive actions

---

## Audit Immutability Rules

1. Audit logs are append-only.
2. Audit modification is prohibited.
3. Audit deletion is prohibited unless legally required.

---

## Audit Retention

| Data Type              | Retention |
| ---------------------- | --------- |
| Authentication logs    | 7 years   |
| Authorization failures | 7 years   |
| Configuration changes  | 7 years   |
| Deployment events      | 7 years   |

---

# 9. Notification Data Governance

## Notification Lifecycle

```plaintext id="4wzj3q"
Created
    ->
Queued
    ->
Delivered
    ->
Read
    ->
Archived
    ->
Purged

```

---

## Notification Retention

| Notification Type      | Retention |
| ---------------------- | --------- |
| Critical alerts        | 1 year    |
| Standard notifications | 90 days   |
| Failed delivery logs   | 180 days  |

---

## Notification Constraints

1. Notification deduplication must preserve auditability.
2. Failed notifications must remain observable.

---

# 10. Session Data Governance

## Session Retention

| Session Type     | Retention        |
| ---------------- | ---------------- |
| Active sessions  | Until expiration |
| Expired sessions | 30 days          |
| Revoked sessions | 90 days          |

---

## Session Constraints

1. Revoked sessions must not reactivate.
2. Expired sessions must not authorize requests.
3. Session storage must encrypt sensitive values.

---

# 11. Data Mutation Rules

## Mutation Authorization Rules

| Data Type           | Mutation Authority |
| ------------------- | ------------------ |
| User profile        | User               |
| Roles               | Admin              |
| Risk rules          | Admin              |
| Repository metadata | System             |
| Audit logs          | System only        |

---

## Mutation Constraints

1. Unauthorized mutations must fail safely.
2. Invalid state transitions must reject.
3. Partial writes must rollback safely.

---

# 12. Data Retention Policies

## Standard Retention Matrix

| Data Type          | Retention  |
| ------------------ | ---------- |
| Audit logs         | 7 years    |
| Dashboard metrics  | Indefinite |
| Archived projects  | Indefinite |
| Session records    | 30–90 days |
| Notifications      | 90 days    |
| Queue failure logs | 180 days   |

---

## Retention Enforcement Rules

1. Cleanup jobs must remain auditable.
2. Purges must preserve referential consistency.
3. Active operational data must never purge accidentally.

---

# 13. Archival Policies

## Archival Triggers

| Trigger                 | Effect           |
| ----------------------- | ---------------- |
| Project completed       | Archive eligible |
| Repository disconnected | Archive eligible |
| User inactive long-term | Archive review   |

---

## Archived State Rules

Archived entities:

* Become read-only
* Preserve historical metrics
* Preserve audit integrity
* Exclude from active ingestion

---

# 14. Data Deletion Policies

## Deletion Authorization

| Data Type    | Authorized By         |
| ------------ | --------------------- |
| User PII     | User/Admin            |
| Projects     | Admin                 |
| Audit logs   | Legal/compliance only |
| Repositories | Admin/Manager         |

---

## Deletion Constraints

1. Deletion must preserve audit relationships.
2. Cascading deletion must remain controlled.
3. Hard deletion requires authorization.

---

# 15. Backup & Recovery Governance

## Backup Scope

| Resource           | Included         |
| ------------------ | ---------------- |
| Database           | Yes              |
| Audit logs         | Yes              |
| Queue metadata     | Yes              |
| Environment config | Partial          |
| Secrets            | No direct backup |

---

## Recovery Constraints

1. Recovery operations must preserve audit integrity.
2. Recovery must not duplicate ingestion state.
3. Recovery actions must remain observable.

---

# 16. Compliance Governance

## Compliance Objectives

The system must support:

* Data minimization
* Audit traceability
* Access accountability
* Secure deletion workflows
* Historical operational integrity

---

## Governance Constraints

1. Unauthorized access attempts must remain logged.
2. Sensitive data access must remain traceable.
3. Production data exports require authorization.

---

# 17. Data Consistency Rules

## Consistency Requirements

1. Database state is authoritative.
2. Real-time cache must reconcile with persisted state.
3. Queue retries must remain idempotent.
4. Event ordering must preserve latest valid state.

---

# 18. Data Export Governance

## Export Rules

| Export Type         | Authorization             |
| ------------------- | ------------------------- |
| Project metrics     | Authorized project access |
| Audit exports       | Compliance/Admin only     |
| User profile export | User or Admin             |

---

## Export Constraints

1. Exports must respect RBAC.
2. Sensitive fields must sanitize where required.
3. Export actions must audit log.

---

# 19. Governance Monitoring

## Governance Metrics

| Metric                        | Purpose                 |
| ----------------------------- | ----------------------- |
| Deletion requests             | Compliance tracking     |
| Failed authorization attempts | Security monitoring     |
| Retention cleanup counts      | Governance verification |
| Audit growth rate             | Storage planning        |

---

## Governance Alerts

Alerts required for:

* Unauthorized export attempts
* Audit mutation attempts
* Failed cleanup workflows
* Excessive retention failures

---

# 20. Governance Acceptance Criteria

## Scenario 1: User Deletion

Given an authorized deletion request
When deletion executes
Then PII must remove while audit integrity preserves

---

## Scenario 2: Repository Archival

Given a repository becomes archived
When ingestion scheduling executes
Then ingestion must stop automatically

---

## Scenario 3: Audit Preservation

Given a user account is deleted
When historical audit logs are queried
Then operational history must remain intact

---

## Scenario 4: Retention Enforcement

Given notification retention thresholds expire
When cleanup jobs execute
Then eligible notifications must purge safely

---

## Scenario 5: Unauthorized Mutation Attempt

Given a non-admin user attempts role modification
When mutation validation executes
Then the request must fail and audit log automatically
