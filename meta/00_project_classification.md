meta/00_project_classification.md

# Project Classification

## Project Name

RepoPulse Command Center

## Scope Mode

PRODUCTION

## Project Type

Web App (Full-stack SaaS Dashboard)

## Classification

RepoPulse Command Center is a production-grade, cloud-based project monitoring and intern performance insight platform for project managers.

The system provides real-time project health visibility, GitHub activity monitoring, role-based access, dashboard analytics, and rule-based AI-style recommendations for early risk detection.

## System Characteristics

| Characteristic        | Value                                   |
| --------------------- | --------------------------------------- |
| Backend Present       | Yes                                     |
| Frontend Present      | Yes                                     |
| Persistent Data       | Yes                                     |
| API Exists            | Yes                                     |
| Uses AI / LLMs        | Yes, rule-based recommendations for MVP |
| Multi-user            | Yes                                     |
| Real-time Features    | Yes                                     |
| External Integrations | GitHub API                              |
| Authentication        | GitHub OAuth                            |
| Primary Stack         | React, Node.js, Express, PostgreSQL     |
| Complexity            | Large                                   |
| Scope                 | Production                              |

## Primary Users

| User               | Purpose                                                           |
| ------------------ | ----------------------------------------------------------------- |
| Project Manager    | Monitor project health, identify risks, review intern performance |
| Intern             | View assigned work, progress, feedback, and status                |
| Stakeholder        | View high-level project metrics and reports                       |
| Compliance Auditor | Review audit logs, access records, and compliance evidence        |

## Primary Business Goal

Provide project managers with real-time, centralized insight into project health and intern activity so they can identify risks early and intervene before projects fail or fall behind.

## System Goal

Build a secure, observable, scalable full-stack dashboard that collects project activity from GitHub, stores normalized project data, calculates risk indicators, displays real-time metrics, and provides actionable rule-based recommendations.

## Key Production Priorities

1. Security-first authentication through GitHub OAuth.
2. Role-based access control for all protected resources.
3. Reliable GitHub API ingestion with rate-limit handling.
4. Real-time dashboard updates for project health indicators.
5. Persistent audit logging for sensitive actions.
6. Rule-based recommendation engine for MVP risk detection.
7. Clear failure handling, retries, and fallback behavior.
8. Environment-specific configuration for local, staging, and production.
9. Data retention, deletion, and governance policies.
10. Safe evolution through versioning, migrations, and rollback plans.

## Architecture Summary

The system uses a React frontend, Node.js/Express backend API, PostgreSQL database, GitHub OAuth authentication, GitHub API integration, background jobs for data ingestion, and WebSocket-based real-time dashboard updates.

## Assumptions

ASSUMPTION: The MVP uses GitHub OAuth only for authentication.
Alternative: Google OAuth and email/password authentication can be added later.

ASSUMPTION: The MVP recommendation engine uses deterministic rule-based scoring.
Alternative: ML or LLM-based recommendations may be introduced after baseline data quality is proven.

ASSUMPTION: PostgreSQL is the primary system of record.
Alternative: Additional analytical stores may be added later for reporting scale.

ASSUMPTION: Real-time updates are required for dashboard metrics, not for every user interaction.
Alternative: Full collaborative real-time editing is out of scope unless added later.

## Initial File Map

| Folder      | File                                    |
| ----------- | --------------------------------------- |
| meta        | 00_project_classification.md            |
| spec        | 01_requirements.md                      |
| spec        | 02_system_specification.md              |
| directives  | 03_behavior_directives.md               |
| execution   | 04_execution_plan.md                    |
| state       | 05_state_model.md                       |
| tests       | 06_test_scenarios.md                    |
| runtime     | 07_system_loop.md                       |
| failure     | 08_failure_playbook.md                  |
| environment | 09_environment_configuration.md         |
| data        | 10_data_lifecycle_governance.md         |
| evolution   | 11_evolution_change_strategy.md         |
| ux          | 12_user_experience_interaction_model.md |

## Classification Acceptance Criteria

### Scenario 1: Project Type Is Correctly Identified

Given the project requires a frontend dashboard, backend API, database, authentication, GitHub integration, and real-time updates
When the system is classified
Then it must be classified as a full-stack web application

### Scenario 2: Scope Is Production

Given the selected scope is Production
When project files are generated
Then they must include security, failure handling, environment configuration, governance, testing, and evolution strategy

### Scenario 3: MVP AI Behavior Is Deterministic

Given AI recommendations are rule-based for the MVP
When recommendations are generated
Then the system must produce explainable outputs based on predefined scoring rules

### Scenario 4: Authentication Is GitHub OAuth

Given GitHub OAuth is selected
When users authenticate
Then the system must not require email/password login for the MVP

## Out of Scope for Initial MVP

1. Google OAuth.
2. Email/password authentication.
3. Fully trained machine learning recommendation engine.
4. LLM-generated automated project decisions.
5. Native mobile applications.
6. Offline-first behavior.
7. Multi-tenant enterprise SSO.
8. Advanced billing and subscription management.
9. Full project management replacement features.
10. Automatic remediation without manager approval.
