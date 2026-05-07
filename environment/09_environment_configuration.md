environment/09_environment_configuration.md

# Environment & Configuration

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the environment architecture, configuration strategy, secrets management, runtime configuration rules, infrastructure separation, and operational environment behavior for RepoPulse Command Center.

The environment model must support:

* Secure deployment
* Environment isolation
* Deterministic runtime behavior
* Operational safety
* Scalable infrastructure evolution
* Reliable rollback capability

---

# 1. Environment Architecture

## Supported Environments

| Environment | Purpose                    |
| ----------- | -------------------------- |
| Local       | Developer execution        |
| Development | Shared integration testing |
| Staging     | Production-like validation |
| Production  | Live operational system    |

---

## Environment Isolation Rules

1. Environments must remain fully isolated.
2. Production credentials must never exist in local environments.
3. Databases must never be shared across environments.
4. Queue infrastructure must remain isolated.
5. WebSocket infrastructure must remain isolated.

---

# 2. Environment Objectives

## Local Environment

Purpose:

* Developer execution
* Safe experimentation
* Integration validation

Constraints:

* Non-production credentials only
* Mock or sandbox integrations allowed
* Local-only runtime behavior allowed where safe

---

## Development Environment

Purpose:

* Shared feature integration
* API integration testing
* Queue validation

Constraints:

* Shared team environment
* Non-production secrets
* Lower operational guarantees

---

## Staging Environment

Purpose:

* Production simulation
* Deployment validation
* Load testing
* Rollback verification

Constraints:

* Production-like infrastructure
* Production-like topology
* Sanitized test data only

---

## Production Environment

Purpose:

* Live operational system

Constraints:

* Full security enforcement
* Full monitoring
* Full audit logging
* Backup enforcement
* Recovery guarantees

---

# 3. Configuration Principles

## ENV-001: Explicit Configuration

All runtime behavior must originate from explicit configuration.

---

## ENV-002: Immutable Infrastructure Preference

Infrastructure changes should favor redeployment over manual mutation.

---

## ENV-003: Secret Isolation

Secrets must never:

* Exist in frontend bundles
* Appear in logs
* Exist in source control
* Appear in screenshots or telemetry

---

## ENV-004: Environment Determinism

Identical environment configurations must produce identical runtime behavior.

---

# 4. Core Environment Variables

## Application Runtime

```plaintext id="omvcpm"
APP_ENV=production
APP_NAME=repopulse-command-center
APP_PORT=3000
API_BASE_URL=https://api.example.com
FRONTEND_BASE_URL=https://app.example.com

```

---

## Database Configuration

```plaintext id="l4h6qc"
DB_HOST=localhost
DB_PORT=5432
DB_NAME=repopulse
DB_USER=postgres
DB_PASSWORD=secure_password
DB_SSL=true

```

---

## GitHub OAuth Configuration

```plaintext id="vggg3m"
GITHUB_CLIENT_ID=github_client_id
GITHUB_CLIENT_SECRET=github_client_secret
GITHUB_CALLBACK_URL=https://api.example.com/auth/callback

```

---

## JWT Configuration

```plaintext id="e95g0v"
JWT_SECRET=super_secret_key
JWT_EXPIRATION=1h
JWT_REFRESH_EXPIRATION=7d

```

---

## Queue Configuration

```plaintext id="c6ck8o"
QUEUE_PROVIDER=redis
QUEUE_HOST=localhost
QUEUE_PORT=6379
QUEUE_RETRY_LIMIT=4

```

---

## WebSocket Configuration

```plaintext id="m69i2g"
WS_HEARTBEAT_INTERVAL=15000
WS_RECONNECT_BACKOFF=5000

```

---

## Notification Configuration

```plaintext id="6z3rcz"
EMAIL_PROVIDER=smtp
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USERNAME=user
EMAIL_PASSWORD=password

```

---

## Monitoring & Logging Configuration

```plaintext id="2v6nsn"
LOG_LEVEL=info
ENABLE_METRICS=true
METRICS_PORT=9090
ALERT_WEBHOOK_URL=https://alerts.example.com

```

---

# 5. Secret Management Rules

## Secret Categories

| Secret               | Type      |
| -------------------- | --------- |
| GitHub OAuth Secret  | Critical  |
| JWT Secret           | Critical  |
| Database Password    | Critical  |
| SMTP Password        | Sensitive |
| Alert Webhook Tokens | Sensitive |

---

## Secret Storage Rules

1. Secrets must exist outside source control.
2. Secrets must rotate periodically.
3. Production secrets must use secure secret storage.
4. Secret access must remain auditable.

---

## Prohibited Secret Behavior

The following are prohibited:

1. Hardcoded secrets
2. Shared production secrets
3. Logging secrets
4. Storing secrets in frontend runtime
5. Storing secrets in GitHub repositories

---

# 6. Frontend Environment Configuration

## Frontend Runtime Variables

| Variable     | Purpose                    |
| ------------ | -------------------------- |
| API_BASE_URL | Backend API endpoint       |
| WS_BASE_URL  | WebSocket endpoint         |
| APP_ENV      | Environment identification |

---

## Frontend Constraints

1. Frontend must not access private secrets.
2. Frontend must not contain backend credentials.
3. Public environment variables must remain non-sensitive.

---

# 7. Backend Environment Configuration

## Backend Runtime Responsibilities

The backend must:

* Validate environment configuration at startup
* Refuse startup on missing critical configuration
* Encrypt sensitive runtime data
* Enforce HTTPS in production

---

## Startup Validation Rules

Startup must fail if:

* Database configuration missing
* JWT secret missing
* GitHub OAuth configuration invalid
* Queue configuration invalid

---

# 8. Database Environment Rules

## Database Isolation

| Environment | Database Requirement          |
| ----------- | ----------------------------- |
| Local       | Local database allowed        |
| Development | Shared development database   |
| Staging     | Isolated staging database     |
| Production  | Dedicated production database |

---

## Database Safety Rules

1. Production database access must require authorization.
2. Destructive operations require backup validation.
3. Database migrations must remain reversible where safe.

---

# 9. Queue Environment Rules

## Queue Isolation

Queue infrastructure must remain environment-specific.

---

## Queue Safety Rules

1. Queue retries must remain capped.
2. Dead-letter queues required in staging and production.
3. Queue persistence required for production runtime.

---

# 10. Logging Configuration

## Log Levels

| Level | Purpose                   |
| ----- | ------------------------- |
| DEBUG | Local debugging           |
| INFO  | Operational visibility    |
| WARN  | Recoverable failures      |
| ERROR | Critical runtime failures |

---

## Logging Rules

1. Structured logging required.
2. Correlation IDs required.
3. Secrets must redact automatically.
4. Production logs must persist centrally.

---

# 11. Monitoring & Alerting Configuration

## Required Monitoring

| Monitoring Area         | Required |
| ----------------------- | -------- |
| API latency             | Yes      |
| Queue depth             | Yes      |
| WebSocket disconnects   | Yes      |
| Ingestion failure rate  | Yes      |
| Database health         | Yes      |
| Authentication failures | Yes      |

---

## Alert Threshold Examples

| Event                      | Threshold      |
| -------------------------- | -------------- |
| API failure spike          | >10%           |
| Queue retry spike          | >100/hour      |
| DB reconnect failures      | >3 consecutive |
| WebSocket disconnect spike | >25%           |

---

# 12. Deployment Configuration

## Deployment Strategy

| Environment | Strategy             |
| ----------- | -------------------- |
| Local       | Manual               |
| Development | CI deployment        |
| Staging     | Automated validation |
| Production  | Controlled rollout   |

---

## Deployment Rules

1. Production deployments require rollback capability.
2. Database backups required before destructive migrations.
3. Staging validation required before production deployment.

---

# 13. Backup & Recovery Configuration

## Backup Rules

| Resource          | Frequency           |
| ----------------- | ------------------- |
| Database          | Daily               |
| Audit logs        | Continuous or daily |
| Queue persistence | Periodic snapshots  |

---

## Recovery Rules

1. Backup restoration must be tested periodically.
2. Recovery operations must preserve audit integrity.
3. Recovery actions must remain observable.

---

# 14. Feature Flag Configuration

## Feature Flag Purpose

Feature flags control:

* Experimental features
* Controlled rollout
* Emergency feature disablement

---

## Feature Flag Rules

1. Flags must default safely.
2. Flags must remain environment-specific.
3. Production emergency disablement must be immediate.

---

## Example Feature Flags

```plaintext id="7m12pj"
FEATURE_REALTIME_DASHBOARD=true
FEATURE_EMAIL_NOTIFICATIONS=true
FEATURE_AI_RECOMMENDATIONS=true

```

---

# 15. Infrastructure Requirements

## Minimum Production Infrastructure

| Component   | Requirement                 |
| ----------- | --------------------------- |
| API runtime | Redundant instances         |
| Database    | Managed PostgreSQL          |
| Queue       | Persistent Redis/RabbitMQ   |
| Monitoring  | Centralized metrics         |
| Logging     | Centralized structured logs |

---

## Infrastructure Constraints

1. Single points of failure should be minimized.
2. Infrastructure changes must remain traceable.
3. Infrastructure provisioning should support automation.

---

# 16. Operational Runtime Configuration

## Runtime Configuration Rules

1. Runtime changes must remain auditable.
2. Environment drift must be monitored.
3. Invalid runtime configuration must trigger alerts.

---

## Health Check Endpoints

| Endpoint      | Purpose          |
| ------------- | ---------------- |
| /health       | General health   |
| /health/db    | Database health  |
| /health/queue | Queue health     |
| /health/ws    | WebSocket health |

---

# 17. Environment Security Rules

## Security Requirements

1. HTTPS mandatory in production.
2. Production secrets encrypted at rest.
3. TLS required for production database connections.
4. Queue infrastructure access restricted.

---

## Security Constraints

The following are prohibited:

1. Shared admin credentials
2. Public production database exposure
3. Logging authentication tokens
4. Weak JWT secrets

---

# 18. Environment Acceptance Criteria

## Scenario 1: Startup Validation

Given critical configuration is missing
When backend startup executes
Then startup must fail safely

---

## Scenario 2: Environment Isolation

Given local configuration changes occur
When production runtime operates
Then production state must remain unaffected

---

## Scenario 3: Secret Protection

Given structured logs generate
When authentication operations execute
Then secrets must remain redacted

---

## Scenario 4: Deployment Rollback

Given production deployment failure occurs
When rollback executes
Then prior stable runtime configuration must restore safely

---

## Scenario 5: Monitoring Failure Detection

Given queue retries exceed threshold
When monitoring evaluates metrics
Then operational alerts must trigger automatically
