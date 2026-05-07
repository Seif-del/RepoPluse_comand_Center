architecture/14_api_contracts_openapi.md

# API Contracts & OpenAPI Specification

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the authoritative REST API contract layer for RepoPulse Command Center.

It provides:

* Endpoint definitions
* Request schemas
* Response schemas
* Authorization requirements
* Pagination contracts
* Error handling models
* Real-time synchronization APIs
* Security expectations
* OpenAPI alignment rules

This document is the frontend/backend integration contract source-of-truth.

---

# 1. API Architecture Principles

## API-001: RESTful Structure

The platform must use RESTful API conventions.

---

## API-002: Deterministic Responses

Identical valid requests must produce structurally consistent responses.

---

## API-003: RBAC Enforcement

All protected endpoints must enforce authorization before returning data.

---

## API-004: Versioned Contracts

All public APIs must support explicit versioning.

---

# 2. API Base Configuration

## Base URL Structure

```plaintext
/api/v1
```

---

## API Formats

| Type          | Format       |
| ------------- | ------------ |
| Request body  | JSON         |
| Response body | JSON         |
| Error body    | JSON         |
| Time format   | ISO 8601 UTC |

---

## Standard Headers

| Header           | Required         | Purpose          |
| ---------------- | ---------------- | ---------------- |
| Authorization    | Protected routes | Bearer JWT       |
| Content-Type     | Yes              | application/json |
| X-Correlation-ID | Recommended      | Request tracing  |

---

# 3. Authentication APIs

## POST `/api/v1/auth/github`

### Purpose

Initiates GitHub OAuth authentication.

---

## Request

No body required.

---

## Success Response

```json
{
  "redirectUrl": "https://github.com/login/oauth/authorize?...",
  "provider": "github"
}
```

---

## Failure Response

```json
{
  "error": {
    "code": "AUTH_PROVIDER_UNAVAILABLE",
    "message": "GitHub authentication is temporarily unavailable."
  }
}
```

---

## GET `/api/v1/auth/callback`

### Purpose

Handles GitHub OAuth callback.

---

## Query Parameters

| Parameter | Required |
| --------- | -------- |
| code      | Yes      |
| state     | Yes      |

---

## Success Response

```json
{
  "accessToken": "jwt-token",
  "expiresIn": 3600,
  "user": {
    "id": "uuid",
    "githubUsername": "octocat",
    "role": "PROJECT_MANAGER"
  }
}
```

---

## Failure Response

```json
{
  "error": {
    "code": "AUTH_CALLBACK_FAILED",
    "message": "Authentication failed."
  }
}
```

---

## POST `/api/v1/auth/logout`

### Authorization

Required

---

## Purpose

Terminates active session.

---

## Success Response

```json
{
  "success": true
}
```

---

# 4. User APIs

## GET `/api/v1/users/me`

### Authorization

Required

---

## Success Response

```json
{
  "id": "uuid",
  "githubUsername": "octocat",
  "displayName": "Octo Cat",
  "email": "octo@example.com",
  "roles": [
    "PROJECT_MANAGER"
  ],
  "organizationId": "uuid"
}
```

---

## PATCH `/api/v1/users/me`

### Authorization

Required

---

## Request Body

```json
{
  "displayName": "Updated Name"
}
```

---

## Validation Rules

| Field       | Rules         |
| ----------- | ------------- |
| displayName | max 255 chars |

---

# 5. Project APIs

## GET `/api/v1/projects`

### Authorization

Required

---

## Query Parameters

| Parameter | Type    |
| --------- | ------- |
| riskLevel | string  |
| status    | string  |
| managerId | uuid    |
| search    | string  |
| page      | integer |
| limit     | integer |

---

## Success Response

```json
{
  "data": [
    {
      "id": "uuid",
      "name": "RepoPulse",
      "riskLevel": "HIGH",
      "status": "ACTIVE"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 1
  }
}
```

---

## Authorization Rules

1. Users only see authorized projects.
2. Unauthorized projects must never appear in results.

---

## GET `/api/v1/projects/:projectId`

### Authorization

Required

---

## Success Response

```json
{
  "id": "uuid",
  "name": "RepoPulse",
  "status": "ACTIVE",
  "riskLevel": "HIGH",
  "manager": {
    "id": "uuid",
    "displayName": "Jane Doe"
  }
}
```

---

## POST `/api/v1/projects`

### Authorization

Admin or Project Manager

---

## Request Body

```json
{
  "name": "RepoPulse",
  "description": "Project monitoring platform",
  "targetEndDate": "2026-12-01"
}
```

---

## Validation Rules

| Field         | Rules             |
| ------------- | ----------------- |
| name          | required, max 255 |
| description   | optional          |
| targetEndDate | valid ISO date    |

---

## PATCH `/api/v1/projects/:projectId`

### Authorization

Admin or assigned Project Manager

---

## DELETE `/api/v1/projects/:projectId`

### Authorization

Admin only

---

## Behavior

Uses soft deletion workflow.

---

# 6. Repository APIs

## GET `/api/v1/projects/:projectId/repositories`

### Authorization

Project access required

---

## Success Response

```json
{
  "data": [
    {
      "id": "uuid",
      "fullName": "org/repo",
      "status": "CONNECTED",
      "lastSyncedAt": "2026-05-07T10:00:00Z"
    }
  ]
}
```

---

## POST `/api/v1/projects/:projectId/repositories`

### Authorization

Admin or Project Manager

---

## Request Body

```json
{
  "owner": "organization",
  "repository": "repo-name"
}
```

---

## Validation Rules

1. Repository ownership must validate.
2. Duplicate repositories prohibited.

---

## POST `/api/v1/repositories/:repositoryId/sync`

### Authorization

Admin or Project Manager

---

## Purpose

Triggers manual repository synchronization.

---

## Success Response

```json
{
  "queued": true,
  "jobId": "uuid"
}
```

---

# 7. Dashboard APIs

## GET `/api/v1/dashboard/:projectId`

### Authorization

Project access required

---

## Success Response

```json
{
  "projectId": "uuid",
  "riskLevel": "HIGH",
  "metrics": {
    "commitCount7d": 12,
    "stalePrCount": 4,
    "staleIssueCount": 2,
    "activeContributorCount": 3
  },
  "recommendations": []
}
```

---

## Runtime Rules

1. Dashboard data must remain eventually consistent.
2. Partial metric failure must not fail full response.

---

# 8. Risk APIs

## GET `/api/v1/projects/:projectId/risk`

### Authorization

Project access required

---

## Success Response

```json
{
  "score": 78,
  "riskLevel": "CRITICAL",
  "triggerSummary": {
    "stalePullRequests": true,
    "lowCommitFrequency": true
  },
  "calculatedAt": "2026-05-07T10:00:00Z"
}
```

---

## GET `/api/v1/projects/:projectId/risk/history`

### Authorization

Project access required

---

## Success Response

```json
{
  "data": [
    {
      "score": 72,
      "riskLevel": "HIGH",
      "calculatedAt": "2026-05-01T10:00:00Z"
    }
  ]
}
```

---

# 9. Recommendation APIs

## GET `/api/v1/projects/:projectId/recommendations`

### Authorization

Project access required

---

## Success Response

```json
{
  "data": [
    {
      "id": "uuid",
      "severity": "HIGH",
      "title": "Review stale pull requests",
      "status": "DELIVERED",
      "triggerRules": [
        "STALE_PULL_REQUESTS"
      ]
    }
  ]
}
```

---

## PATCH `/api/v1/recommendations/:recommendationId`

### Authorization

Project access required

---

## Request Body

```json
{
  "status": "ACKNOWLEDGED"
}
```

---

## Allowed Status Transitions

| Current      | Allowed      |
| ------------ | ------------ |
| DELIVERED    | ACKNOWLEDGED |
| ACKNOWLEDGED | RESOLVED     |
| ACKNOWLEDGED | DISMISSED    |

---

# 10. Notification APIs

## GET `/api/v1/notifications`

### Authorization

Required

---

## Success Response

```json
{
  "data": [
    {
      "id": "uuid",
      "priority": "CRITICAL",
      "title": "Critical project risk detected",
      "status": "SENT",
      "createdAt": "2026-05-07T10:00:00Z"
    }
  ]
}
```

---

## PATCH `/api/v1/notifications/:notificationId/read`

### Authorization

Required

---

## Success Response

```json
{
  "success": true
}
```

---

# 11. Audit APIs

## GET `/api/v1/audit/logs`

### Authorization

Admin or Compliance Auditor

---

## Query Parameters

| Parameter | Type          |
| --------- | ------------- |
| actorId   | uuid          |
| action    | string        |
| from      | ISO timestamp |
| to        | ISO timestamp |
| page      | integer       |
| limit     | integer       |

---

## Success Response

```json
{
  "data": [
    {
      "id": "uuid",
      "action": "LOGIN_SUCCESS",
      "actorUserId": "uuid",
      "createdAt": "2026-05-07T10:00:00Z"
    }
  ]
}
```

---

## Constraints

1. Audit records immutable.
2. Audit visibility RBAC-protected.

---

# 12. Search APIs

## GET `/api/v1/search`

### Authorization

Required

---

## Query Parameters

| Parameter | Required |
| --------- | -------- |
| query     | Yes      |
| type      | No       |

---

## Supported Types

| Type            |
| --------------- |
| projects        |
| repositories    |
| recommendations |
| users           |

---

## Success Response

```json
{
  "data": []
}
```

---

## Search Rules

1. Search must remain RBAC-aware.
2. Unauthorized entities excluded.

---

# 13. Admin APIs

## GET `/api/v1/admin/system-health`

### Authorization

Admin only

---

## Success Response

```json
{
  "runtime": "HEALTHY",
  "queueDepth": 12,
  "activeConnections": 144
}
```

---

## PATCH `/api/v1/admin/risk-rules`

### Authorization

Admin only

---

## Request Body

```json
{
  "stalePrThresholdDays": 14
}
```

---

## Governance Rules

1. Configuration changes audit logged.
2. Invalid rule updates rejected safely.

---

# 14. Health Check APIs

## GET `/health`

### Purpose

General runtime health.

---

## Success Response

```json
{
  "status": "HEALTHY"
}
```

---

## GET `/health/db`

### Purpose

Database health verification.

---

## GET `/health/queue`

### Purpose

Queue runtime verification.

---

## GET `/health/ws`

### Purpose

WebSocket runtime verification.

---

# 15. WebSocket Contracts

## WebSocket Endpoint

```plaintext
/ws
```

---

## Authentication

JWT required during connection.

---

## Runtime Events

| Event                  | Purpose                  |
| ---------------------- | ------------------------ |
| dashboard.updated      | Metrics changed          |
| risk.changed           | Risk updated             |
| recommendation.created | Recommendation generated |
| notification.created   | Notification dispatched  |

---

## Example Event Payload

```json
{
  "event": "risk.changed",
  "projectId": "uuid",
  "riskLevel": "HIGH",
  "timestamp": "2026-05-07T10:00:00Z"
}
```

---

# 16. Standard Error Contract

## Error Structure

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

---

## Error Categories

| Code                  | Purpose                    |
| --------------------- | -------------------------- |
| VALIDATION_ERROR      | Invalid request            |
| AUTHENTICATION_FAILED | Invalid session            |
| AUTHORIZATION_FAILED  | Permission denied          |
| RESOURCE_NOT_FOUND    | Missing resource           |
| RATE_LIMITED          | Too many requests          |
| INTERNAL_ERROR        | Unexpected runtime failure |

---

# 17. Pagination Contract

## Standard Pagination

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "hasNextPage": true
  }
}
```

---

## Pagination Rules

1. Maximum limit configurable.
2. Invalid page requests reject safely.

---

# 18. Validation Rules

## Global Validation Requirements

1. Input validation required for all requests.
2. Unknown fields rejected where configured.
3. Invalid enum values rejected.
4. Invalid UUIDs rejected safely.

---

# 19. Rate Limiting Rules

## Protected Endpoint Limits

| Endpoint Category | Limit    |
| ----------------- | -------- |
| Authentication    | Strict   |
| Search            | Medium   |
| Dashboard reads   | Moderate |
| Admin actions     | Strict   |

---

## Rate-Limit Response

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests."
  }
}
```

---

# 20. Security Rules

## API Security Constraints

1. HTTPS required in production.
2. JWT tokens must validate for protected routes.
3. Sensitive fields must sanitize in responses.
4. RBAC required before data retrieval.

---

# 21. OpenAPI Alignment Rules

## OpenAPI Requirements

The API contract should support OpenAPI 3.x generation.

---

## OpenAPI Requirements Include

1. Typed schemas
2. Reusable components
3. Security definitions
4. Enum definitions
5. Standardized responses

---

# 22. API Evolution Rules

## Non-Breaking Changes

Allowed:

* Add optional fields
* Add endpoints
* Add filters

---

## Breaking Changes

Require:

* Version increment
* Migration strategy
* Deprecation notice

---

# 23. Acceptance Criteria

## Scenario 1: Unauthorized Access

Given a user lacks project access
When project APIs are requested
Then protected data must not return

---

## Scenario 2: Duplicate Repository Connection

Given a repository already exists
When connection API executes
Then duplicate insertion must fail safely

---

## Scenario 3: Real-Time Event Delivery

Given project risk changes
When dashboard clients are connected
Then WebSocket events must broadcast successfully

---

## Scenario 4: Validation Failure

Given invalid payload data
When API validation executes
Then request must reject with VALIDATION_ERROR

---

## Scenario 5: Audit Protection

Given an Intern role user
When audit APIs are requested
Then authorization must fail safely
