spec/01_requirements.md

# Requirements

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

RepoPulse Command Center must provide project managers with real-time visibility into project health, GitHub activity, intern performance signals, and risk indicators.

## Functional Requirements

### FR-001: GitHub OAuth Authentication

The system must allow users to sign in using GitHub OAuth.

Acceptance Criteria:

Given a user has a valid GitHub account
When the user selects GitHub sign-in
Then the system must authenticate the user and create or update the user profile

Given GitHub OAuth fails
When the user attempts to sign in
Then the system must show an authentication failure message and deny access

### FR-002: Role-Based Access Control

The system must support the following roles:

| Role               | Access                                          |
| ------------------ | ----------------------------------------------- |
| Admin              | Full system access                              |
| Project Manager    | Manage assigned projects and users              |
| Intern             | View assigned work and personal progress        |
| Stakeholder        | Read-only access to assigned project dashboards |
| Compliance Auditor | Read-only audit and compliance access           |

Acceptance Criteria:

Given a user has a role
When the user requests a protected resource
Then the system must allow or deny access based on permissions

### FR-003: Project Dashboard

The system must display project health metrics including:

* Project status
* Commit activity
* Recent GitHub activity
* Risk score
* Active contributors
* Open issues
* Closed issues
* Stale work indicators
* Milestone progress

Acceptance Criteria:

Given a project has available data
When a project manager opens the dashboard
Then the dashboard must display the latest available project metrics

### FR-004: GitHub Data Ingestion

The system must collect project data from the GitHub API.

Required data includes:

* Repository metadata
* Commits
* Pull requests
* Issues
* Contributors
* Branch activity
* Review activity
* Timestamps for activity recency

Acceptance Criteria:

Given a repository is connected
When the ingestion process runs
Then the system must fetch and persist normalized GitHub activity data

### FR-005: Rule-Based Risk Scoring

The system must calculate project risk using deterministic rules.

Required risk factors include:

* Low commit frequency
* Open pull requests older than threshold
* Open issues older than threshold
* No activity within threshold
* Missed milestones
* Low contributor participation
* Repeated failed ingestion

Acceptance Criteria:

Given project metrics exist
When risk scoring runs
Then the system must assign a risk level of Low, Medium, High, or Critical

### FR-006: Recommendations

The system must generate rule-based recommendations for project managers.

Acceptance Criteria:

Given a project has a High or Critical risk score
When the dashboard loads
Then the system must display at least one recommended intervention

### FR-007: Real-Time Dashboard Updates

The system must provide real-time dashboard updates for project metrics and risk changes.

Acceptance Criteria:

Given project data changes
When new metrics are processed
Then connected dashboard clients must receive updated values without manual refresh

### FR-008: Notifications

The system must notify project managers when projects become High or Critical risk.

Notification channels:

* In-app notification
* Email notification, if enabled

Acceptance Criteria:

Given a project risk level changes to High or Critical
When notification rules evaluate
Then the assigned project manager must receive a notification

### FR-009: Search and Filtering

The system must allow users to search and filter projects.

Supported filters:

* Project status
* Risk level
* Assigned manager
* Repository
* Activity recency
* Intern contributor

Acceptance Criteria:

Given a user has project access
When the user applies filters
Then the system must return only matching authorized projects

### FR-010: Audit Logging

The system must log sensitive actions.

Logged actions include:

* Login
* Logout
* Role changes
* Project assignment changes
* Repository connection changes
* Risk rule configuration changes
* Failed authorization attempts

Acceptance Criteria:

Given a sensitive action occurs
When the action completes or fails
Then the system must write an audit log entry

## Non-Functional Requirements

### NFR-001: Performance

* Dashboard initial load must complete within 2 seconds for cached project data.
* API responses must complete within 500 ms for standard read operations under normal load.
* Background GitHub ingestion must not block dashboard usage.

### NFR-002: Availability

* Production system target availability must be 99.5% monthly uptime.
* Planned maintenance must be announced before deployment.
* Failed background jobs must retry automatically where safe.

### NFR-003: Security

* Secrets must never be committed to the repository.
* OAuth tokens must be encrypted at rest.
* All production traffic must use HTTPS.
* Protected API endpoints must enforce authentication and authorization.
* Audit logs must be tamper-resistant.

### NFR-004: Reliability

* GitHub ingestion must handle rate limits gracefully.
* Failed jobs must retry with exponential backoff.
* Duplicate ingestion events must not create duplicate records.
* The system must preserve existing dashboard data when GitHub is temporarily unavailable.

### NFR-005: Observability

The system must provide:

* Application logs
* API error logs
* Background job logs
* Authentication failure logs
* Ingestion success and failure metrics
* Dashboard performance metrics

### NFR-006: Scalability

The system must support:

* Multiple organizations
* Multiple projects per organization
* Multiple users per project
* Multiple repositories per project
* Background ingestion without blocking user activity

### NFR-007: Data Governance

The system must support:

* User data deletion requests
* Audit log retention
* Project archival
* Repository disconnection
* Access review
* Data export for authorized roles

## System Constraints

1. Authentication must use GitHub OAuth for the MVP.
2. Recommendations must be rule-based for the MVP.
3. PostgreSQL must be the primary database.
4. Frontend must use React.
5. Backend must use Node.js and Express.
6. GitHub API availability is an external dependency.
7. No automatic project intervention may occur without project manager approval.

## Assumptions

ASSUMPTION: GitHub is the primary source of repository activity.
Alternative: Additional integrations such as Jira, Slack, or Linear may be added later.

ASSUMPTION: Project managers are the main decision-makers.
Alternative: Admins may configure automated escalation later.

ASSUMPTION: Risk scoring thresholds are configurable by Admins.
Alternative: Fixed thresholds may be used for the first internal release.

ASSUMPTION: Real-time behavior applies to dashboard updates and notifications only.
Alternative: Full collaborative real-time features may be added later.

## Requirement Acceptance Summary

The requirements are satisfied when:

1. Users can authenticate through GitHub OAuth.
2. Authorized users can access dashboards based on role.
3. GitHub repository activity is ingested and stored.
4. Project health metrics are calculated and displayed.
5. Risk scores are generated deterministically.
6. Recommendations explain why a project is at risk.
7. High-risk changes trigger notifications.
8. Sensitive actions are audit logged.
9. The system remains usable during external GitHub API failures.
10. Production configuration supports security, observability, and recovery.
