spec/02_system_specification.md

# System Specification

## Project Name

RepoPulse Command Center

## Scope

Production

## Architecture Style

Modular Monolith with Real-Time Event Processing

## Technology Stack

| Layer               | Technology                                   |
| ------------------- | -------------------------------------------- |
| Frontend            | React                                        |
| Backend API         | Node.js + Express                            |
| Database            | PostgreSQL                                   |
| Authentication      | GitHub OAuth                                 |
| Real-Time Transport | WebSocket                                    |
| Background Jobs     | Redis Queue or RabbitMQ                      |
| ORM                 | Prisma or Sequelize                          |
| Hosting             | Cloud-based deployment                       |
| API Style           | REST                                         |
| Observability       | Structured logging + metrics                 |
| Secrets Management  | Environment variables / cloud secret manager |

---

# 1. High-Level Architecture

## Overview

The system consists of:

1. React frontend dashboard
2. Express backend API
3. PostgreSQL persistence layer
4. Background ingestion workers
5. GitHub API integration layer
6. Real-time update channel
7. Audit logging subsystem
8. Rule-based recommendation engine

## Architecture Diagram

```plaintext
+-----------------------+
| React Frontend        |
| Dashboard UI          |
+----------+------------+
           |
           v
+-----------------------+
| API Gateway / Express |
| Authentication        |
| Authorization         |
| REST API              |
+----------+------------+
           |
    +------+------+-------------------+
    |             |                   |
    v             v                   v
+---------+ +-------------+ +----------------+
| Auth    | | Dashboard   | | Recommendation |
| Module  | | Service     | | Engine         |
+---------+ +-------------+ +----------------+
    |             |                   |
    +------+------+-------------------+
           |
           v
+-----------------------+
| PostgreSQL Database   |
+-----------------------+
           |
           v
+-----------------------+
| Background Workers    |
| GitHub Ingestion      |
| Risk Scoring          |
+----------+------------+
           |
           v
+-----------------------+
| GitHub API            |
+-----------------------+

```

---

# 2. Frontend Specification

## Frontend Responsibilities

The frontend must:

* Authenticate users
* Render dashboards
* Display real-time metrics
* Display notifications
* Render recommendations
* Support filtering and search
* Display audit-related visibility where authorized

## Frontend Modules

| Module         | Purpose                   |
| -------------- | ------------------------- |
| Authentication | GitHub login handling     |
| Dashboard      | Metrics and visualization |
| Projects       | Project management views  |
| Notifications  | Alerts and warnings       |
| Search         | Filtering and lookup      |
| Settings       | User preferences          |
| Audit Viewer   | Audit log visibility      |
| Admin          | Role and rule management  |

## Frontend Routing

| Route         | Purpose              |
| ------------- | -------------------- |
| /login        | Authentication       |
| /dashboard    | Main dashboard       |
| /projects     | Project list         |
| /projects/:id | Project detail       |
| /settings     | User preferences     |
| /admin        | Administrative tools |
| /audit        | Audit review         |

## Frontend Constraints

1. Dashboard must remain responsive under partial API failure.
2. Frontend must not directly access GitHub APIs.
3. Frontend must not store secrets.
4. Unauthorized routes must redirect safely.
5. WebSocket disconnects must retry automatically.

---

# 3. Backend API Specification

## API Responsibilities

The backend API must:

* Authenticate requests
* Enforce RBAC
* Serve dashboard data
* Process repository ingestion
* Execute risk scoring
* Generate recommendations
* Publish real-time updates
* Persist audit logs

## API Modules

| Module                | Responsibility       |
| --------------------- | -------------------- |
| Auth Module           | OAuth and sessions   |
| User Module           | User management      |
| Project Module        | Project lifecycle    |
| Repository Module     | GitHub repositories  |
| Dashboard Module      | Metrics aggregation  |
| Recommendation Module | Rule engine          |
| Notification Module   | Alerts               |
| Audit Module          | Audit logs           |
| Search Module         | Search and filters   |
| Admin Module          | System configuration |

---

# 4. REST API Contracts

## Authentication APIs

### POST /auth/github

Initiates GitHub OAuth login.

Response:

```json
{
  "redirectUrl": "https://github.com/login/oauth/authorize"
}
```

### GET /auth/callback

Handles GitHub OAuth callback.

Success Response:

```json
{
  "accessToken": "jwt-token",
  "user": {
    "id": "uuid",
    "role": "PROJECT_MANAGER"
  }
}
```

---

## Project APIs

### GET /projects

Returns authorized projects.

Query Parameters:

| Parameter | Type   |
| --------- | ------ |
| riskLevel | string |
| managerId | uuid   |
| search    | string |
| status    | string |

### GET /projects/:id

Returns project details and metrics.

### POST /projects

Creates project.

Authorization:

* Admin
* Project Manager

---

## Dashboard APIs

### GET /dashboard/:projectId

Returns dashboard metrics.

Response:

```json
{
  "projectId": "uuid",
  "riskLevel": "HIGH",
  "commitFrequency": 12,
  "staleIssues": 4,
  "recommendations": []
}
```

---

## Recommendation APIs

### GET /recommendations/:projectId

Returns rule-based recommendations.

---

## Audit APIs

### GET /audit/logs

Returns audit logs.

Authorization:

* Compliance Auditor
* Admin

---

# 5. Database Specification

## Core Tables

| Table           | Purpose                       |
| --------------- | ----------------------------- |
| users           | User accounts                 |
| roles           | RBAC roles                    |
| projects        | Project records               |
| repositories    | GitHub repositories           |
| commits         | Commit activity               |
| pull_requests   | PR activity                   |
| issues          | GitHub issues                 |
| project_metrics | Calculated metrics            |
| recommendations | Generated recommendations     |
| notifications   | User alerts                   |
| audit_logs      | Audit events                  |
| ingestion_jobs  | Background ingestion tracking |

---

## Example Entity Relationships

```plaintext
users
  -> projects
  -> notifications
  -> audit_logs

projects
  -> repositories
  -> project_metrics
  -> recommendations

repositories
  -> commits
  -> pull_requests
  -> issues

```

---

# 6. Authentication Specification

## Authentication Method

GitHub OAuth only.

## Session Strategy

JWT-based access token.

## Token Rules

1. Tokens must expire.
2. Refresh behavior must be controlled server-side.
3. Tokens must not be stored in localStorage if avoidable.
4. Session invalidation must revoke access immediately where supported.

## Authorization Rules

RBAC must be enforced:

* At API layer
* At route layer
* At sensitive action layer

---

# 7. Real-Time System Specification

## Transport

WebSocket

## Real-Time Events

| Event                | Trigger                |
| -------------------- | ---------------------- |
| dashboard.updated    | Metrics recalculated   |
| risk.changed         | Risk level changes     |
| notification.created | Notification generated |
| ingestion.completed  | Sync completes         |

## Connection Rules

1. Unauthorized clients must disconnect immediately.
2. Idle connections may expire.
3. Reconnect attempts must use backoff strategy.
4. Duplicate events must not corrupt frontend state.

---

# 8. Background Job Specification

## Background Jobs

| Job                       | Purpose                |
| ------------------------- | ---------------------- |
| github_ingestion          | Fetch repository data  |
| risk_scoring              | Calculate risk         |
| recommendation_generation | Create recommendations |
| notification_dispatch     | Send alerts            |
| cleanup_jobs              | Retention enforcement  |

## Scheduling Rules

| Job                       | Frequency       |
| ------------------------- | --------------- |
| github_ingestion          | Every 5 minutes |
| risk_scoring              | After ingestion |
| recommendation_generation | After scoring   |
| cleanup_jobs              | Daily           |

---

# 9. Recommendation Engine Specification

## Recommendation Model

Deterministic rule-based system.

## Inputs

* Commit activity
* Issue age
* Pull request age
* Contributor count
* Milestone status
* Repository inactivity

## Outputs

| Risk Level | Example Recommendation              |
| ---------- | ----------------------------------- |
| Medium     | Review contributor participation    |
| High       | Schedule intervention meeting       |
| Critical   | Escalate project review immediately |

## Constraints

1. Recommendations must be explainable.
2. Recommendations must reference triggering conditions.
3. No recommendation may automatically modify project state.

---

# 10. Audit Logging Specification

## Logged Events

| Event Type                 | Logged |
| -------------------------- | ------ |
| Login                      | Yes    |
| Logout                     | Yes    |
| Failed login               | Yes    |
| Role changes               | Yes    |
| Repository connection      | Yes    |
| Risk configuration changes | Yes    |
| Permission denial          | Yes    |

## Audit Log Fields

| Field     | Description            |
| --------- | ---------------------- |
| event_id  | Unique identifier      |
| actor_id  | User performing action |
| target_id | Affected resource      |
| timestamp | Event timestamp        |
| action    | Event type             |
| result    | Success or failure     |
| metadata  | Supplemental data      |

---

# 11. Search Specification

## Supported Search Domains

* Projects
* Users
* Repositories
* Recommendations

## Search Constraints

1. Search results must respect RBAC.
2. Search indexing must not expose unauthorized data.
3. Partial keyword matching must be supported.

---

# 12. Security Specification

## Security Requirements

1. HTTPS required in production.
2. Secrets encrypted at rest.
3. OAuth tokens encrypted at rest.
4. Audit logs immutable where possible.
5. Sensitive actions require authorization validation.
6. API rate limiting required.
7. CSRF protections required where applicable.
8. Input validation required for all API requests.

---

# 13. Observability Specification

## Logging

The system must log:

* API failures
* Authentication failures
* Job failures
* WebSocket disconnects
* GitHub rate-limit events

## Metrics

The system must expose:

* API latency
* Dashboard render latency
* Background job success rate
* Ingestion duration
* Notification delivery success

---

# 14. External Dependency Specification

## GitHub API

Used for:

* Repository metadata
* Commits
* Pull requests
* Issues
* Contributors

## Failure Constraints

1. GitHub outages must not crash the application.
2. Partial ingestion failures must preserve prior data.
3. Rate-limit exhaustion must trigger retry behavior.

---

# 15. Acceptance Criteria

## Scenario 1: Dashboard Load

Given a valid authenticated user
When the dashboard loads
Then the system must return authorized project metrics

## Scenario 2: Risk Recalculation

Given ingestion updates project data
When risk scoring executes
Then the dashboard must receive updated risk values

## Scenario 3: Unauthorized Access

Given a user lacks permissions
When protected resources are requested
Then access must be denied and logged

## Scenario 4: GitHub Failure

Given GitHub API becomes unavailable
When ingestion jobs execute
Then the system must retry safely without deleting existing metrics

## Scenario 5: Real-Time Updates

Given dashboard metrics change
When recalculation completes
Then connected clients must receive updates without page refresh
