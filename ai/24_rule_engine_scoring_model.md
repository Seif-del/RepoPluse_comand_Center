ai/24_rule_engine_scoring_model.md

# Rule Engine Scoring Model

## Project Name

RepoPulse Command Center

## Scope

Production

## Purpose

This document defines the deterministic rule-based scoring model for RepoPulse Command Center.

It specifies:

* Risk scoring inputs
* Score ranges
* Rule weights
* Trigger conditions
* Recommendation mappings
* Escalation logic
* Recovery logic
* Determinism requirements
* Validation scenarios

---

# 1. Scoring Model Overview

## Model Type

Deterministic rule-based scoring.

## Score Range

| Score  | Risk Level |
| ------ | ---------- |
| 0–24   | LOW        |
| 25–49  | MEDIUM     |
| 50–74  | HIGH       |
| 75–100 | CRITICAL   |

## Core Rule

The same inputs must always produce the same score, risk level, and recommendation set.

---

# 2. Scoring Inputs

| Input                 | Source                  |
| --------------------- | ----------------------- |
| Commit frequency      | GitHub commits          |
| Repository inactivity | Last activity timestamp |
| Open pull requests    | GitHub PRs              |
| Stale pull requests   | GitHub PR age           |
| Open issues           | GitHub issues           |
| Stale issues          | GitHub issue age        |
| Active contributors   | GitHub contributors     |
| Missed milestones     | Project metadata        |
| Failed ingestion jobs | Ingestion job history   |

---

# 3. Risk Rule Weights

| Rule                       | Condition                           | Score Impact |
| -------------------------- | ----------------------------------- | ------------ |
| LOW_COMMIT_FREQUENCY       | Fewer than 3 commits in 7 days      | +15          |
| NO_RECENT_ACTIVITY         | No activity for 7 days              | +25          |
| STALE_PULL_REQUESTS        | 3 or more PRs older than 14 days    | +20          |
| STALE_ISSUES               | 5 or more issues older than 21 days | +15          |
| CONTRIBUTOR_DROP_OFF       | Active contributors reduced by 50%  | +15          |
| MISSED_MILESTONE           | Target milestone date passed        | +20          |
| REPEATED_INGESTION_FAILURE | 3 failed syncs in 24 hours          | +10          |
| CRITICAL_INACTIVITY        | No activity for 14 days             | +35          |

Maximum score: 100.

---

# 4. Score Calculation Formula

```plaintext
risk_score = min(sum(triggered_rule_scores), 100)
```

## Example

If a project triggers:

* LOW_COMMIT_FREQUENCY = 15
* STALE_PULL_REQUESTS = 20
* MISSED_MILESTONE = 20

Then:

```plaintext
risk_score = 15 + 20 + 20 = 55
risk_level = HIGH
```

---

# 5. Recovery Rules

Risk may decrease only after valid recalculation.

| Recovery Condition            | Score Reduction                   |
| ----------------------------- | --------------------------------- |
| Commit activity restored      | Remove LOW_COMMIT_FREQUENCY       |
| Repository activity resumes   | Remove NO_RECENT_ACTIVITY         |
| Stale PRs resolved            | Remove STALE_PULL_REQUESTS        |
| Stale issues resolved         | Remove STALE_ISSUES               |
| Contributor activity restored | Remove CONTRIBUTOR_DROP_OFF       |
| Ingestion succeeds            | Remove REPEATED_INGESTION_FAILURE |

---

# 6. Recommendation Mapping

| Trigger Rule               | Recommendation                                   |
| -------------------------- | ------------------------------------------------ |
| LOW_COMMIT_FREQUENCY       | Review contributor activity and confirm blockers |
| NO_RECENT_ACTIVITY         | Schedule project check-in immediately            |
| STALE_PULL_REQUESTS        | Review pending PRs and assign reviewers          |
| STALE_ISSUES               | Triage old issues and close outdated work        |
| CONTRIBUTOR_DROP_OFF       | Check intern availability and workload           |
| MISSED_MILESTONE           | Reassess timeline and intervention plan          |
| REPEATED_INGESTION_FAILURE | Verify GitHub integration health                 |
| CRITICAL_INACTIVITY        | Escalate project review immediately              |

---

# 7. Recommendation Severity

| Risk Level | Recommendation Severity |
| ---------- | ----------------------- |
| LOW        | Informational           |
| MEDIUM     | Warning                 |
| HIGH       | High                    |
| CRITICAL   | Critical                |

---

# 8. Determinism Rules

1. No random scoring.
2. No hidden weighting.
3. No non-repeatable recommendation generation.
4. Same input snapshot must produce same output.
5. Rule trigger summary must be persisted with each score.

---

# 9. Trigger Summary Format

Each risk score must store rule evidence.

```json
{
  "rulesTriggered": [
    {
      "rule": "STALE_PULL_REQUESTS",
      "scoreImpact": 20,
      "evidence": {
        "stalePrCount": 4,
        "thresholdDays": 14
      }
    }
  ],
  "finalScore": 20,
  "riskLevel": "LOW"
}
```

---

# 10. Risk Escalation Rules

## Escalation

A project escalates when recalculated score enters a higher range.

Example:

```plaintext
MEDIUM -> HIGH
HIGH -> CRITICAL
```

## Escalation Effects

1. Persist new risk score.
2. Generate recommendations.
3. Notify assigned project manager for HIGH or CRITICAL.
4. Publish real-time dashboard event.

---

# 11. Risk De-Escalation Rules

A project de-escalates only after recalculation confirms improved metrics.

Example:

```plaintext
CRITICAL -> HIGH
HIGH -> MEDIUM
MEDIUM -> LOW
```

## De-Escalation Constraints

1. GitHub API failure must not reduce risk.
2. Missing data must not count as improvement.
3. Recovery must be based on valid metrics.

---

# 12. Notification Rules

| Risk Change               | Notification Required |
| ------------------------- | --------------------- |
| LOW → MEDIUM              | Optional              |
| MEDIUM → HIGH             | Yes                   |
| HIGH → CRITICAL           | Yes                   |
| CRITICAL remains CRITICAL | Deduplicated          |
| Risk decreases            | Optional summary      |

---

# 13. Edge Cases

## Missing GitHub Data

If GitHub data is missing due to ingestion failure:

* Preserve previous valid risk score
* Add ingestion failure trigger only if failure threshold is met

## New Project

If project has insufficient history:

* Use available current metrics
* Mark confidence as limited
* Avoid contributor drop-off rule until baseline exists

## Archived Project

Archived projects do not receive active risk recalculation.

---

# 14. Acceptance Criteria

## Scenario 1: Deterministic Score

Given identical project metrics
When risk scoring runs multiple times
Then the system must produce the same score and risk level

## Scenario 2: High Risk

Given stale PRs and missed milestones exist
When scoring runs
Then the project must become HIGH risk if score reaches 50 or greater

## Scenario 3: Critical Inactivity

Given no repository activity for 14 days
When scoring runs
Then CRITICAL_INACTIVITY must add 35 points

## Scenario 4: Recovery

Given stale PRs are resolved
When scoring recalculates
Then STALE_PULL_REQUESTS must no longer contribute to risk

## Scenario 5: Explainability

Given a recommendation is generated
When a project manager views it
Then the recommendation must display the triggering rule and supporting evidence
