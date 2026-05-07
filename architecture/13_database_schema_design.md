architecture/13_database_schema_design.md

# Database Schema Design

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the production database schema design for RepoPulse Command Center.

It provides the persistence blueprint for:

* Users
* Roles
* Projects
* GitHub repositories
* GitHub activity
* Project metrics
* Risk scoring
* Recommendations
* Notifications
* Audit logs
* Background jobs

This file defines database structure, relationships, constraints, indexing strategy, and data integrity rules.

---

# 1. Database System

## Primary Database

PostgreSQL

## Database Role

PostgreSQL is the authoritative system of record for RepoPulse Command Center.

## Database Principles

1. Database state is authoritative over frontend cache and runtime events.
2. All sensitive relationships must enforce referential integrity.
3. Imported GitHub activity must be idempotent.
4. Audit logs must be append-only.
5. Archived entities must remain queryable.
6. Production schema changes must use migrations.

---

# 2. Core Entity Overview

| Entity          | Purpose                               |
| --------------- | ------------------------------------- |
| users           | Stores authenticated platform users   |
| roles           | Stores role definitions               |
| user_roles      | Maps users to roles                   |
| organizations   | Groups projects and users             |
| projects        | Stores project records                |
| project_members | Maps users to projects                |
| repositories    | Stores connected GitHub repositories  |
| commits         | Stores GitHub commit activity         |
| pull_requests   | Stores GitHub pull request activity   |
| issues          | Stores GitHub issue activity          |
| project_metrics | Stores calculated dashboard metrics   |
| risk_scores     | Stores risk score history             |
| recommendations | Stores generated recommendations      |
| notifications   | Stores user alerts                    |
| audit_logs      | Stores immutable audit events         |
| ingestion_jobs  | Tracks background ingestion execution |

---

# 3. Entity Relationship Summary

```plaintext
organizations
  -> users
  -> projects
  -> project_members
  -> repositories
  -> commits
  -> pull_requests
  -> issues
  -> project_metrics
  -> risk_scores
  -> recommendations
  -> notifications
  -> audit_logs
  -> ingestion_jobs
```

---

# 4. Table: organizations

## Purpose

Stores organization-level ownership boundaries.

## Columns

| Column     | Type         | Required | Notes                       |
| ---------- | ------------ | -------- | --------------------------- |
| id         | UUID         | Yes      | Primary key                 |
| name       | VARCHAR(255) | Yes      | Organization name           |
| slug       | VARCHAR(255) | Yes      | Unique URL-safe identifier  |
| status     | VARCHAR(50)  | Yes      | ACTIVE, SUSPENDED, ARCHIVED |
| created_at | TIMESTAMP    | Yes      | UTC                         |
| updated_at | TIMESTAMP    | Yes      | UTC                         |

## Constraints

* Primary key on `id`
* Unique constraint on `slug`
* `status` must use allowed values

## Indexes

* `idx_organizations_slug`
* `idx_organizations_status`

---

# 5. Table: users

## Purpose

Stores GitHub-authenticated platform users.

## Columns

| Column          | Type         | Required | Notes                               |
| --------------- | ------------ | -------- | ----------------------------------- |
| id              | UUID         | Yes      | Primary key                         |
| organization_id | UUID         | Yes      | FK to organizations                 |
| github_id       | VARCHAR(255) | Yes      | GitHub user ID                      |
| github_username | VARCHAR(255) | Yes      | GitHub username                     |
| email           | VARCHAR(255) | No       | Email from GitHub                   |
| display_name    | VARCHAR(255) | No       | User display name                   |
| avatar_url      | TEXT         | No       | GitHub avatar                       |
| status          | VARCHAR(50)  | Yes      | ACTIVE, SUSPENDED, REVOKED, DELETED |
| last_login_at   | TIMESTAMP    | No       | UTC                                 |
| created_at      | TIMESTAMP    | Yes      | UTC                                 |
| updated_at      | TIMESTAMP    | Yes      | UTC                                 |
| deleted_at      | TIMESTAMP    | No       | Soft deletion timestamp             |

## Constraints

* Primary key on `id`
* Foreign key `organization_id` references `organizations(id)`
* Unique constraint on `github_id`
* Unique constraint on `(organization_id, github_username)`

## Indexes

* `idx_users_organization_id`
* `idx_users_github_id`
* `idx_users_status`
* `idx_users_deleted_at`

---

# 6. Table: roles

## Purpose

Stores platform role definitions.

## Columns

| Column      | Type         | Required | Notes                   |
| ----------- | ------------ | -------- | ----------------------- |
| id          | UUID         | Yes      | Primary key             |
| name        | VARCHAR(100) | Yes      | Role name               |
| description | TEXT         | No       | Role description        |
| priority    | INTEGER      | Yes      | Role hierarchy priority |
| created_at  | TIMESTAMP    | Yes      | UTC                     |

## Required Roles

| Role               | Priority |
| ------------------ | -------- |
| ADMIN              | 100      |
| COMPLIANCE_AUDITOR | 80       |
| PROJECT_MANAGER    | 60       |
| STAKEHOLDER        | 40       |
| INTERN             | 20       |

## Constraints

* Primary key on `id`
* Unique constraint on `name`

---

# 7. Table: user_roles

## Purpose

Maps users to assigned roles.

## Columns

| Column      | Type      | Required | Notes       |
| ----------- | --------- | -------- | ----------- |
| id          | UUID      | Yes      | Primary key |
| user_id     | UUID      | Yes      | FK to users |
| role_id     | UUID      | Yes      | FK to roles |
| assigned_by | UUID      | No       | FK to users |
| created_at  | TIMESTAMP | Yes      | UTC         |

## Constraints

* Primary key on `id`
* Foreign key `user_id` references `users(id)`
* Foreign key `role_id` references `roles(id)`
* Unique constraint on `(user_id, role_id)`

## Indexes

* `idx_user_roles_user_id`
* `idx_user_roles_role_id`

---

# 8. Table: projects

## Purpose

Stores managed project records.

## Columns

| Column          | Type         | Required | Notes                                                 |
| --------------- | ------------ | -------- | ----------------------------------------------------- |
| id              | UUID         | Yes      | Primary key                                           |
| organization_id | UUID         | Yes      | FK to organizations                                   |
| name            | VARCHAR(255) | Yes      | Project name                                          |
| slug            | VARCHAR(255) | Yes      | URL-safe identifier                                   |
| description     | TEXT         | No       | Project description                                   |
| status          | VARCHAR(50)  | Yes      | CREATED, ACTIVE, AT_RISK, CRITICAL, ARCHIVED, DELETED |
| manager_id      | UUID         | No       | FK to users                                           |
| start_date      | DATE         | No       | Project start                                         |
| target_end_date | DATE         | No       | Planned completion                                    |
| archived_at     | TIMESTAMP    | No       | Archive timestamp                                     |
| deleted_at      | TIMESTAMP    | No       | Soft deletion timestamp                               |
| created_at      | TIMESTAMP    | Yes      | UTC                                                   |
| updated_at      | TIMESTAMP    | Yes      | UTC                                                   |

## Constraints

* Primary key on `id`
* Foreign key `organization_id` references `organizations(id)`
* Foreign key `manager_id` references `users(id)`
* Unique constraint on `(organization_id, slug)`

## Indexes

* `idx_projects_organization_id`
* `idx_projects_status`
* `idx_projects_manager_id`
* `idx_projects_archived_at`

---

# 9. Table: project_members

## Purpose

Maps users to projects.

## Columns

| Column       | Type         | Required | Notes                        |
| ------------ | ------------ | -------- | ---------------------------- |
| id           | UUID         | Yes      | Primary key                  |
| project_id   | UUID         | Yes      | FK to projects               |
| user_id      | UUID         | Yes      | FK to users                  |
| project_role | VARCHAR(100) | Yes      | MANAGER, INTERN, STAKEHOLDER |
| status       | VARCHAR(50)  | Yes      | ACTIVE, REMOVED              |
| added_by     | UUID         | No       | FK to users                  |
| created_at   | TIMESTAMP    | Yes      | UTC                          |
| removed_at   | TIMESTAMP    | No       | UTC                          |

## Constraints

* Primary key on `id`
* Foreign key `project_id` references `projects(id)`
* Foreign key `user_id` references `users(id)`
* Unique constraint on `(project_id, user_id)`

## Indexes

* `idx_project_members_project_id`
* `idx_project_members_user_id`
* `idx_project_members_status`

---

# 10. Table: repositories

## Purpose

Stores connected GitHub repositories.

## Columns

| Column          | Type         | Required | Notes                                                                 |
| --------------- | ------------ | -------- | --------------------------------------------------------------------- |
| id              | UUID         | Yes      | Primary key                                                           |
| project_id      | UUID         | Yes      | FK to projects                                                        |
| github_repo_id  | VARCHAR(255) | Yes      | GitHub repository ID                                                  |
| owner           | VARCHAR(255) | Yes      | GitHub owner                                                          |
| name            | VARCHAR(255) | Yes      | Repository name                                                       |
| full_name       | VARCHAR(512) | Yes      | owner/name                                                            |
| default_branch  | VARCHAR(255) | No       | Main branch                                                           |
| visibility      | VARCHAR(50)  | Yes      | PUBLIC, PRIVATE                                                       |
| status          | VARCHAR(50)  | Yes      | CONNECTED, SYNC_PENDING, SYNCING, SYNC_FAILED, DISCONNECTED, ARCHIVED |
| last_synced_at  | TIMESTAMP    | No       | UTC                                                                   |
| disconnected_at | TIMESTAMP    | No       | UTC                                                                   |
| archived_at     | TIMESTAMP    | No       | UTC                                                                   |
| created_at      | TIMESTAMP    | Yes      | UTC                                                                   |
| updated_at      | TIMESTAMP    | Yes      | UTC                                                                   |

## Constraints

* Primary key on `id`
* Foreign key `project_id` references `projects(id)`
* Unique constraint on `github_repo_id`
* Unique constraint on `(project_id, full_name)`

## Indexes

* `idx_repositories_project_id`
* `idx_repositories_github_repo_id`
* `idx_repositories_status`
* `idx_repositories_last_synced_at`

---

# 11. Table: commits

## Purpose

Stores imported GitHub commits.

## Columns

| Column           | Type         | Required | Notes               |
| ---------------- | ------------ | -------- | ------------------- |
| id               | UUID         | Yes      | Primary key         |
| repository_id    | UUID         | Yes      | FK to repositories  |
| github_sha       | VARCHAR(100) | Yes      | Commit SHA          |
| author_name      | VARCHAR(255) | No       | Commit author       |
| author_email     | VARCHAR(255) | No       | Commit author email |
| github_author_id | VARCHAR(255) | No       | GitHub user ID      |
| message          | TEXT         | No       | Commit message      |
| committed_at     | TIMESTAMP    | Yes      | UTC                 |
| created_at       | TIMESTAMP    | Yes      | UTC                 |

## Constraints

* Primary key on `id`
* Foreign key `repository_id` references `repositories(id)`
* Unique constraint on `(repository_id, github_sha)`

## Indexes

* `idx_commits_repository_id`
* `idx_commits_committed_at`
* `idx_commits_github_author_id`

---

# 12. Table: pull_requests

## Purpose

Stores GitHub pull request activity.

## Columns

| Column           | Type         | Required | Notes                |
| ---------------- | ------------ | -------- | -------------------- |
| id               | UUID         | Yes      | Primary key          |
| repository_id    | UUID         | Yes      | FK to repositories   |
| github_pr_id     | VARCHAR(255) | Yes      | GitHub PR ID         |
| number           | INTEGER      | Yes      | Repository PR number |
| title            | TEXT         | Yes      | PR title             |
| state            | VARCHAR(50)  | Yes      | OPEN, CLOSED, MERGED |
| author_github_id | VARCHAR(255) | No       | GitHub author ID     |
| opened_at        | TIMESTAMP    | Yes      | UTC                  |
| closed_at        | TIMESTAMP    | No       | UTC                  |
| merged_at        | TIMESTAMP    | No       | UTC                  |
| updated_at       | TIMESTAMP    | Yes      | UTC                  |
| created_at       | TIMESTAMP    | Yes      | UTC                  |

## Constraints

* Primary key on `id`
* Foreign key `repository_id` references `repositories(id)`
* Unique constraint on `(repository_id, github_pr_id)`
* Unique constraint on `(repository_id, number)`

## Indexes

* `idx_pull_requests_repository_id`
* `idx_pull_requests_state`
* `idx_pull_requests_opened_at`
* `idx_pull_requests_updated_at`

---

# 13. Table: issues

## Purpose

Stores GitHub issue activity.

## Columns

| Column           | Type         | Required | Notes                   |
| ---------------- | ------------ | -------- | ----------------------- |
| id               | UUID         | Yes      | Primary key             |
| repository_id    | UUID         | Yes      | FK to repositories      |
| github_issue_id  | VARCHAR(255) | Yes      | GitHub issue ID         |
| number           | INTEGER      | Yes      | Repository issue number |
| title            | TEXT         | Yes      | Issue title             |
| state            | VARCHAR(50)  | Yes      | OPEN, CLOSED            |
| author_github_id | VARCHAR(255) | No       | GitHub author ID        |
| opened_at        | TIMESTAMP    | Yes      | UTC                     |
| closed_at        | TIMESTAMP    | No       | UTC                     |
| updated_at       | TIMESTAMP    | Yes      | UTC                     |
| created_at       | TIMESTAMP    | Yes      | UTC                     |

## Constraints

* Primary key on `id`
* Foreign key `repository_id` references `repositories(id)`
* Unique constraint on `(repository_id, github_issue_id)`
* Unique constraint on `(repository_id, number)`

## Indexes

* `idx_issues_repository_id`
* `idx_issues_state`
* `idx_issues_opened_at`
* `idx_issues_updated_at`

---

# 14. Table: project_metrics

## Purpose

Stores calculated dashboard metrics.

## Columns

| Column                   | Type      | Required | Notes                       |
| ------------------------ | --------- | -------- | --------------------------- |
| id                       | UUID      | Yes      | Primary key                 |
| project_id               | UUID      | Yes      | FK to projects              |
| commit_count_7d          | INTEGER   | Yes      | Last 7 days                 |
| commit_count_30d         | INTEGER   | Yes      | Last 30 days                |
| open_pr_count            | INTEGER   | Yes      | Current open PRs            |
| stale_pr_count           | INTEGER   | Yes      | PRs older than threshold    |
| open_issue_count         | INTEGER   | Yes      | Current open issues         |
| stale_issue_count        | INTEGER   | Yes      | Issues older than threshold |
| active_contributor_count | INTEGER   | Yes      | Recent active contributors  |
| last_activity_at         | TIMESTAMP | No       | Latest repository activity  |
| calculated_at            | TIMESTAMP | Yes      | UTC                         |

## Constraints

* Primary key on `id`
* Foreign key `project_id` references `projects(id)`

## Indexes

* `idx_project_metrics_project_id`
* `idx_project_metrics_calculated_at`
* `idx_project_metrics_last_activity_at`

---

# 15. Table: risk_scores

## Purpose

Stores project risk score history.

## Columns

| Column          | Type        | Required | Notes                       |
| --------------- | ----------- | -------- | --------------------------- |
| id              | UUID        | Yes      | Primary key                 |
| project_id      | UUID        | Yes      | FK to projects              |
| score           | INTEGER     | Yes      | 0–100                       |
| risk_level      | VARCHAR(50) | Yes      | LOW, MEDIUM, HIGH, CRITICAL |
| trigger_summary | JSONB       | Yes      | Triggering rule details     |
| calculated_at   | TIMESTAMP   | Yes      | UTC                         |
| created_at      | TIMESTAMP   | Yes      | UTC                         |

## Constraints

* Primary key on `id`
* Foreign key `project_id` references `projects(id)`
* Check constraint: `score >= 0 AND score <= 100`

## Indexes

* `idx_risk_scores_project_id`
* `idx_risk_scores_risk_level`
* `idx_risk_scores_calculated_at`

---

# 16. Table: recommendations

## Purpose

Stores generated rule-based recommendations.

## Columns

| Column          | Type         | Required | Notes                                                   |
| --------------- | ------------ | -------- | ------------------------------------------------------- |
| id              | UUID         | Yes      | Primary key                                             |
| project_id      | UUID         | Yes      | FK to projects                                          |
| risk_score_id   | UUID         | Yes      | FK to risk_scores                                       |
| title           | VARCHAR(255) | Yes      | Recommendation title                                    |
| description     | TEXT         | Yes      | Detailed explanation                                    |
| severity        | VARCHAR(50)  | Yes      | LOW, MEDIUM, HIGH, CRITICAL                             |
| trigger_rules   | JSONB        | Yes      | Triggering rules                                        |
| status          | VARCHAR(50)  | Yes      | GENERATED, DELIVERED, ACKNOWLEDGED, DISMISSED, RESOLVED |
| created_at      | TIMESTAMP    | Yes      | UTC                                                     |
| acknowledged_at | TIMESTAMP    | No       | UTC                                                     |
| dismissed_at    | TIMESTAMP    | No       | UTC                                                     |
| resolved_at     | TIMESTAMP    | No       | UTC                                                     |

## Constraints

* Primary key on `id`
* Foreign key `project_id` references `projects(id)`
* Foreign key `risk_score_id` references `risk_scores(id)`

## Indexes

* `idx_recommendations_project_id`
* `idx_recommendations_status`
* `idx_recommendations_severity`
* `idx_recommendations_created_at`

---

# 17. Table: notifications

## Purpose

Stores user-facing notification records.

## Columns

| Column     | Type         | Required | Notes                                        |
| ---------- | ------------ | -------- | -------------------------------------------- |
| id         | UUID         | Yes      | Primary key                                  |
| user_id    | UUID         | Yes      | FK to users                                  |
| project_id | UUID         | No       | FK to projects                               |
| type       | VARCHAR(100) | Yes      | Notification category                        |
| priority   | VARCHAR(50)  | Yes      | LOW, MEDIUM, HIGH, CRITICAL                  |
| title      | VARCHAR(255) | Yes      | Notification title                           |
| body       | TEXT         | Yes      | Notification body                            |
| status     | VARCHAR(50)  | Yes      | CREATED, QUEUED, SENT, FAILED, READ, EXPIRED |
| dedupe_key | VARCHAR(255) | No       | Duplicate prevention key                     |
| created_at | TIMESTAMP    | Yes      | UTC                                          |
| sent_at    | TIMESTAMP    | No       | UTC                                          |
| read_at    | TIMESTAMP    | No       | UTC                                          |
| expires_at | TIMESTAMP    | No       | UTC                                          |

## Constraints

* Primary key on `id`
* Foreign key `user_id` references `users(id)`
* Foreign key `project_id` references `projects(id)`
* Unique constraint on `dedupe_key` where not null

## Indexes

* `idx_notifications_user_id`
* `idx_notifications_project_id`
* `idx_notifications_status`
* `idx_notifications_priority`
* `idx_notifications_created_at`

---

# 18. Table: audit_logs

## Purpose

Stores immutable audit events.

## Columns

| Column          | Type         | Required | Notes               |
| --------------- | ------------ | -------- | ------------------- |
| id              | UUID         | Yes      | Primary key         |
| organization_id | UUID         | Yes      | FK to organizations |
| actor_user_id   | UUID         | No       | FK to users         |
| target_type     | VARCHAR(100) | No       | Entity type         |
| target_id       | UUID         | No       | Entity ID           |
| action          | VARCHAR(150) | Yes      | Action name         |
| result          | VARCHAR(50)  | Yes      | SUCCESS, FAILURE    |
| ip_address      | INET         | No       | Request IP          |
| user_agent      | TEXT         | No       | Request agent       |
| correlation_id  | UUID         | Yes      | Request trace       |
| metadata        | JSONB        | No       | Sanitized metadata  |
| created_at      | TIMESTAMP    | Yes      | UTC                 |

## Constraints

* Primary key on `id`
* Foreign key `organization_id` references `organizations(id)`
* Foreign key `actor_user_id` references `users(id)`

## Indexes

* `idx_audit_logs_organization_id`
* `idx_audit_logs_actor_user_id`
* `idx_audit_logs_action`
* `idx_audit_logs_created_at`
* `idx_audit_logs_correlation_id`

## Immutability Rule

Audit records must be append-only. Updates and deletes are prohibited except through approved legal/compliance workflows.

---

# 19. Table: ingestion_jobs

## Purpose

Tracks background ingestion job execution.

## Columns

| Column        | Type         | Required | Notes                                                            |
| ------------- | ------------ | -------- | ---------------------------------------------------------------- |
| id            | UUID         | Yes      | Primary key                                                      |
| repository_id | UUID         | Yes      | FK to repositories                                               |
| job_type      | VARCHAR(100) | Yes      | github_ingestion                                                 |
| status        | VARCHAR(50)  | Yes      | QUEUED, RUNNING, COMPLETED, FAILED, RETRY_PENDING, DEAD_LETTERED |
| retry_count   | INTEGER      | Yes      | Retry attempts                                                   |
| error_message | TEXT         | No       | Sanitized error                                                  |
| started_at    | TIMESTAMP    | No       | UTC                                                              |
| completed_at  | TIMESTAMP    | No       | UTC                                                              |
| created_at    | TIMESTAMP    | Yes      | UTC                                                              |
| updated_at    | TIMESTAMP    | Yes      | UTC                                                              |

## Constraints

* Primary key on `id`
* Foreign key `repository_id` references `repositories(id)`
* Check constraint: `retry_count >= 0`

## Indexes

* `idx_ingestion_jobs_repository_id`
* `idx_ingestion_jobs_status`
* `idx_ingestion_jobs_created_at`

---

# 20. Cross-Table Integrity Rules

## Rule 1: Project Access Integrity

A user may access project data only if:

* They are Admin
* They are Compliance Auditor with audit scope
* They are assigned through `project_members`
* They are the project manager

---

## Rule 2: Repository Integrity

A repository must belong to exactly one project.

---

## Rule 3: GitHub Activity Integrity

Commit, issue, and pull request records must be unique per repository using GitHub source identifiers.

---

## Rule 4: Recommendation Integrity

Each recommendation must reference a valid risk score.

---

## Rule 5: Audit Integrity

Audit records must preserve historical traceability even when users or projects are archived.

---

# 21. Soft Deletion Strategy

## Soft-Deleted Entities

| Entity        | Soft Delete                      |
| ------------- | -------------------------------- |
| users         | Yes                              |
| projects      | Yes                              |
| repositories  | No, use disconnected or archived |
| notifications | Yes, via expiration              |
| audit_logs    | No                               |

## Rules

1. Soft-deleted users must not authenticate.
2. Soft-deleted projects must not accept writes.
3. Audit records must not be soft deleted.

---

# 22. Indexing Strategy

## Required Index Categories

| Category              | Examples                             |
| --------------------- | ------------------------------------ |
| Authorization indexes | user_id, project_id, organization_id |
| Search indexes        | project name, repository full_name   |
| Runtime indexes       | status, created_at, updated_at       |
| Metrics indexes       | calculated_at, risk_level            |
| Audit indexes         | actor_user_id, action, created_at    |

## Performance Rules

1. Dashboard queries must use indexed project and metric lookups.
2. Audit queries must support date-range filtering.
3. Ingestion upserts must use unique GitHub identifiers.

---

# 23. Data Retention Mapping

| Table           | Retention                                 |
| --------------- | ----------------------------------------- |
| users           | Until deletion request or account removal |
| projects        | Indefinite unless deleted                 |
| repositories    | Indefinite unless project deleted         |
| commits         | Indefinite while project retained         |
| pull_requests   | Indefinite while project retained         |
| issues          | Indefinite while project retained         |
| project_metrics | Indefinite                                |
| risk_scores     | Indefinite                                |
| recommendations | Indefinite or policy-based archival       |
| notifications   | 90 days standard                          |
| audit_logs      | 7 years                                   |
| ingestion_jobs  | 180 days                                  |

---

# 24. Migration Rules

1. All schema changes must use versioned migrations.
2. Destructive migrations require backup validation.
3. Production migrations must be tested in staging.
4. Migrations must avoid long-running locks where possible.
5. Rollback plans must exist for production migrations.

---

# 25. Acceptance Criteria

## Scenario 1: Duplicate GitHub Commit

Given the same commit is ingested twice
When persistence occurs
Then only one commit record must exist for the repository and SHA

---

## Scenario 2: Unauthorized Project Access

Given a user is not assigned to a project
When the user requests project metrics
Then the database query must not return unauthorized project data

---

## Scenario 3: Archived Project

Given a project is archived
When write operations are attempted
Then writes must be rejected while historical reads remain available

---

## Scenario 4: Audit Log Immutability

Given an audit entry exists
When an update or delete is attempted
Then the mutation must fail safely

---

## Scenario 5: Risk Score Traceability

Given a recommendation is generated
When it is reviewed later
Then it must reference the risk score and trigger rules that produced it
