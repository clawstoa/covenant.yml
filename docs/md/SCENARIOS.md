# Scenario Catalog

This table is the reference interaction catalog for Covenant v1 policy authoring.

## Core Interaction Matrix

Use this as a quick policy-authoring reference. Hover the header labels for field definitions.

| <abbr title="High-level interaction category in the repository">Surface</abbr> | <abbr title="Canonical Covenant action name evaluated by policy rules">Action</abbr> | <abbr title="Resolved actor kind: human, agent, or manager">Actor</abbr> | <abbr title="Typical event fields required to evaluate the action">Typical Inputs</abbr> | <abbr title="Common provenance/attestation posture used for this interaction">Common Requirement Profile</abbr> | <abbr title="Frequent enforcement outcomes or follow-up actions">Typical Enforcement</abbr> |
|---|---|---|---|---|---|
| Issues | `issue.open` | human | title, body, labels | optional provenance | allow |
| Issues | `issue.open` | agent | title, body, labels, attestation | strict provenance + attestation | warn or deny, auto-label |
| Issues | `issue.open` | manager | title, body, labels | none | allow |
| Issues | `issue.comment` | human | comment body | none | allow |
| Issues | `issue.comment` | agent | comment body, attestation | attestation for sensitive repos | warn or deny |
| Issues | `issue.comment` | manager | comment body | none | allow |
| Issues | `issue.label` | human | label set | none | allow |
| Issues | `issue.label` | agent | label set | optional attestation | allow or deny |
| Issues | `issue.label` | manager | label set | none | allow |
| Issues | `issue.solve` | human | close action, linked proof | provenance optional | allow or warn |
| Issues | `issue.solve` | agent | close action, linked proof, attestation | strict provenance + attestation | deny, reopen |
| Issues | `issue.solve` | manager | close action | none | allow |
| Pull Requests | `pull_request.open` | human | PR body, evidence fields | provenance strict or optional | allow or warn |
| Pull Requests | `pull_request.open` | agent | PR body, evidence fields, attestation | strict provenance + attestation | warn, deny, reroute |
| Pull Requests | `pull_request.open` | manager | PR body | none | allow |
| Pull Requests | `pull_request.update` | human | new commits | provenance optional | allow or warn |
| Pull Requests | `pull_request.update` | agent | new commits, refreshed attestation | strict provenance + attestation | fail status |
| Pull Requests | `pull_request.update` | manager | new commits | none | allow |
| PR Reviews | `pull_request.review.submit` | human | review state/comments | none | allow |
| PR Reviews | `pull_request.review.submit` | agent | review state/comments, attestation | configurable | warn or deny |
| PR Reviews | `pull_request.review.submit` | manager | review state/comments | none | allow |
| PR Reviews | `pull_request.review.approve` | human | approve state | none | allow |
| PR Reviews | `pull_request.review.approve` | agent | approve state, attestation | often denied | deny |
| PR Reviews | `pull_request.review.approve` | manager | approve state | none | allow |
| Merge | `pull_request.merge` | human | merge intent | branch/ruleset checks | allow or warn |
| Merge | `pull_request.merge` | agent | merge intent, attestation | strict in protected branches | deny |
| Merge | `pull_request.merge` | manager | merge intent | none | allow |
| Conversation | `conversation.intervene_human_thread` | human | comment/review/discussion | none | allow |
| Conversation | `conversation.intervene_human_thread` | agent | comment/review/discussion, attestation | required | deny |
| Conversation | `conversation.intervene_human_thread` | manager | comment/review/discussion | none | allow |
| Conversation | `conversation.intervene_agent_thread` | human | comment/review/discussion | none | allow |
| Conversation | `conversation.intervene_agent_thread` | agent | comment/review/discussion | optional attestation | allow or warn |
| Conversation | `conversation.intervene_agent_thread` | manager | comment/review/discussion | none | allow |
| Maintenance | `maintenance.cleanup` | human | close/relabel/delete operations | none | allow or warn |
| Maintenance | `maintenance.cleanup` | agent | close/relabel/delete operations | strict + attestation | deny |
| Maintenance | `maintenance.cleanup` | manager | close/relabel/delete operations | none | allow |
| Routing | `routing.to_develop_bot` | human | reroute operation | none | allow |
| Routing | `routing.to_develop_bot` | agent | reroute operation + attestation | usually controlled | deny or reroute |
| Routing | `routing.to_develop_bot` | manager | reroute operation | none | allow |

## Thread Mode Labels

- `thread:human` — human-only conversation. Agent intervention governed by `conversation.intervene_human_thread`.
- `thread:agent` — agent-primary conversation. Governed by `conversation.intervene_agent_thread`.
- No label — `mixed` mode. Both actions may apply depending on rule configuration.

## Agent-Eligible Labels Scenarios

### Agent Acts on Issue Without Eligible Label

An agent attempts `issue.solve` on an issue that does not carry any label listed in `policies.agent_eligible_labels.labels`. The agent-eligible-labels gate fires before rule matching and returns `deny` (or the configured `on_missing` decision) with reason code `policies.agent_eligible_labels.missing`.

### Agent Acts on Issue With Eligible Label

An agent attempts `issue.comment` on an issue labeled `agent-friendly`, which is listed in the policy's eligible labels. The gate passes, and normal rule evaluation proceeds.

### Human Acts on Issue Without Eligible Label

A human performs `issue.solve` on an issue without any agent-eligible label. The gate does not apply to humans — normal rule evaluation proceeds.

## Cross-Actor Scenarios

### Agent Reviews Agent PR

An agent submitting a review on another agent's pull request. Governed by the reviewer agent's `pull_request.review.submit` rule. Recommended: `warn` or `deny` to prevent circular rubber-stamping.

### Agent Approves Agent PR

An agent approving another agent's pull request. Governed by `pull_request.review.approve`. Recommended: `deny` in all policies.

### Manager Overrides Agent Denial

A manager actor performing an action that would be denied for an agent. Manager rules take precedence when the manager is the actor. The manager is not bypassing rules — the manager has its own rule (`actor: manager, action: *, outcome: allow`).

### Agent Orchestrator Delegates to Sub-Agent

An orchestrator agent assigning tasks to other agents. Each sub-agent action is evaluated independently against the sub-agent's own identity. The orchestrator's authorization does not transfer.

### Human-Agent Pair Programming

A human and agent co-authoring a commit. The human is the primary author. The agent is declared via `Co-Authored-By` or equivalent. The PR is evaluated against the human's rules since the human is the sender.

### Agent Rerouted to Staging Branch

An agent PR denied on a protected branch is rerouted to `develop-agent` via routing configuration. The agent's PR is not rejected — it is retargeted. A human reviews the staged PR before merging to the protected branch.

## Enforcement Action Reference

| Enforcement Type | Trigger | Effect |
|-----------------|---------|--------|
| `comment` | `warn` or `deny` | Posts a templated comment on the issue or PR |
| `label` | `warn` or `deny` | Adds labels to the issue or PR |
| `close_pull_request` | `deny` | Closes the pull request |
| `delete_branch` | `deny` | Deletes the source branch |
| `reroute_to_branch` | `deny` (with routing config) | Retargets the PR to the staging branch |
| `fail_status` | `warn` or `deny` | Reports a failing commit status check |

## Simulation Lab Type Mapping

The static simulator (`site/simulator.html`) uses higher-level contribution types and maps them into canonical Covenant actions before replay:

| Simulator Type | Default Canonical Action |
|---|---|
| `code_evolution` | `pull_request.update` |
| `branch_operation` | `pull_request.open` |
| `issue_bug` | `issue.open` |
| `issue_feature_request` | `issue.open` |
| `discussion` | `conversation.intervene_human_thread` |
| `error_regression` | `issue.comment` |
| `release` | `pull_request.merge` |
| `maintenance` | `maintenance.cleanup` |

This map is editable in simulator configuration, but mapped actions must remain valid Covenant canonical actions.

See `docs/SIMULATOR.md` for full simulator configuration, CLI flags, and output artifact details.
