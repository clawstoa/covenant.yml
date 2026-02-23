# Agent Governance

This document defines the governance model for autonomous agents interacting with Covenant-governed repositories.

## Actor Classification

Covenant v1 classifies every actor into one of three kinds:

| Kind | Resolution | Governance Posture |
|------|-----------|-------------------|
| `human` | Default when no `[bot]` suffix detected | Standard contributor rules apply |
| `agent` | Detected via `[bot]` suffix or explicit `actors.agents` match | Restricted by default. Evidence and attestation may be required. |
| `manager` | Explicit `actors.managers` match only | Unrestricted. Intended for governance automation. |

Resolution order:

1. Match actor ID against `actors.managers[].match.usernames`.
2. Match actor ID against `actors.agents[].match.usernames`.
3. Match actor ID against `actors.humans[].match.usernames`.
4. If `actor.kind` is provided in the event envelope, use that.
5. Default: `human`.

## Agent Identity

Agents are identified by their GitHub username (typically ending in `[bot]`). Each agent entry in `actors.agents` includes:

```yaml
actors:
  agents:
    - id: ci-agent
      match:
        usernames: [ci-agent[bot]]
      verification:
        type: ed25519
        public_key: <base64-encoded-spki-der>
```

- `id`: a logical name used in rule matching and logs.
- `match.usernames`: GitHub usernames that resolve to this agent profile.
- `verification`: cryptographic identity for attestation. Ed25519 only in v1.

## Agent Permissions

Agent permissions are governed by rules. Each rule specifies an actor, an action, optional target/conditions, and an outcome.

### Default Behavior

When no rule matches an agent's action, `defaults.unmatched` applies. Recommended settings by stance:

| Stance | `defaults.unmatched` | Effect |
|--------|---------------------|--------|
| Accepting | `allow` | Agents may act freely unless a rule restricts them |
| Guided | `warn` | Agent actions proceed but are flagged |
| Strict | `warn` | Agent actions flagged, with specific `deny` rules for sensitive scopes |
| Restricting | `deny` | All agent actions denied unless explicitly allowed |

### Scope Coverage

Every canonical action applies equally to agents:

| Scope | Common Agent Policy |
|-------|-------------------|
| `issue.open` | Allow or warn. Useful for bug-detection agents. |
| `issue.comment` | Allow or warn. Thread mode controls apply. |
| `issue.label` | Allow for triage agents. Restrict for untrusted agents. |
| `issue.solve` | Warn or deny. Requires evidence of fix quality. |
| `pull_request.open` | Primary governance surface. Provenance and attestation often required. |
| `pull_request.update` | Re-attestation recommended on push. |
| `pull_request.review.submit` | Allow for review agents. Restrict for untrusted agents. |
| `pull_request.review.approve` | Deny for most agents. Human approval gates recommended. |
| `pull_request.merge` | Deny for most agents. Manager-only in strict policies. |
| `conversation.intervene_human_thread` | Deny by default. Protects human discourse. |
| `conversation.intervene_agent_thread` | Allow or warn. Low-risk. |
| `maintenance.cleanup` | Manager-only recommended. Close PR, delete branch, relabel. |
| `routing.to_develop_bot` | Manager-only recommended. Reroute denied PRs. |

## Agent-Eligible Labels

Projects can restrict which issues agents are allowed to work on by requiring eligible labels. This is configured in the `policies` section:

```yaml
policies:
  agent_eligible_labels:
    labels: [agent-friendly, good-first-agent-issue]
    on_missing: deny
```

When this is configured, agents can only perform issue actions (`issue.open`, `issue.comment`, `issue.label`, `issue.solve`) on issues that carry at least one of the listed labels. Actions on issues without an eligible label are denied (or warned, depending on `on_missing`).

This acts as a **pre-evaluation gate** — it runs before rule matching, so even a permissive rule like `actor: agent, action: *, outcome: allow` cannot bypass it.

### Customizing Scope

By default, the gate applies to all `issue.*` actions. To restrict it to specific actions:

```yaml
policies:
  agent_eligible_labels:
    labels: [agent-friendly]
    actions: [issue.solve]
    on_missing: deny
```

This allows agents to comment on any issue but only solve issues labeled `agent-friendly`.

### Who Is Affected

- **Agents**: subject to the gate.
- **Humans**: not affected.
- **Managers**: not affected.

## Provenance Requirements

When a rule specifies a provenance profile, agents must attach evidence fields to their contribution metadata:

| Field | Description |
|-------|-------------|
| `model` | Exact model identifier (e.g., `claude-opus-4-6`) |
| `provider` | Model provider (e.g., `anthropic`) |
| `prompt_record` | URI to the prompt session that produced the contribution |
| `test_proof` | URI to passing test results |

Missing required fields trigger the `on_failure` decision (typically `deny`).

### Provenance Profiles

Define named profiles in `requirements.provenance_profiles`:

```yaml
requirements:
  default_provenance_profile: strict
  provenance_profiles:
    strict:
      required_fields: [model, provider, prompt_record, test_proof]
      on_failure: deny
    disclosure:
      required_fields: [model, provider]
      on_failure: warn
```

Rules reference profiles by name:

```yaml
rules:
  - id: agent-pr-strict
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: strict
    outcome: warn
```

## Attestation

Attestation is a cryptographic proof that an agent is authorized to perform an action against a specific policy version.

### When Required

Set `requirements.attestation: required` on sensitive rules. The `for_agents` value applies attestation only when the actor kind is `agent`.

### Payload Structure

Agents sign a `covenant.attestation.v1` payload:

```json
{
  "version": "covenant.attestation.v1",
  "actor_id": "ci-agent[bot]",
  "action": "pull_request.open",
  "repository": "owner/repo",
  "ref": "refs/heads/feature-branch",
  "policy_sha256": "<sha256-of-covenant-yml>",
  "timestamp": "2026-02-21T00:00:00Z",
  "nonce": "<unique-random-string>"
}
```

### Verification Controls

| Control | Configuration | Effect |
|---------|--------------|--------|
| Signature | `actors.agents[].verification.public_key` | Ed25519 signature must be valid |
| Freshness | `attestation.max_age_seconds` | Timestamp must be within window |
| Replay | `attestation.nonce_ttl_seconds` | Nonce must not be reused within TTL |
| Policy binding | `policy_sha256` | Must match current covenant.yml hash |

### Failure Modes

| Reason Code | Meaning |
|-------------|---------|
| `attestation.missing` | No attestation payload provided |
| `attestation.invalid_version` | Wrong attestation version |
| `attestation.actor_mismatch` | Actor ID does not match event sender |
| `attestation.action_mismatch` | Attested action does not match event action |
| `attestation.policy_hash_mismatch` | Policy changed since attestation was signed |
| `attestation.expired` | Timestamp outside freshness window |
| `attestation.replayed_nonce` | Nonce already used within TTL |
| `attestation.invalid_signature` | Signature verification failed |
| `attestation.verification_key_missing` | No public key registered for this agent |

## Agent-to-Agent Interactions

Covenant.yml v1.0.0 does not have a dedicated agent-to-agent interaction section in the schema. Cross-agent governance is handled through standard rules:

- An agent reviewing another agent's PR is governed by the reviewer agent's `pull_request.review.submit` rule.
- An agent orchestrating other agents is governed by the orchestrator's rules for each action it initiates.
- Thread mode labels (`thread:human`, `thread:agent`) control conversation boundaries.

Recommended: deny agent-to-agent PR approvals in strict policies.

```yaml
rules:
  - id: deny-agent-approval
    actor: agent
    action: pull_request.review.approve
    outcome: deny
```

## Manager Actors

Managers are a privileged actor kind intended for governance automation. They bypass standard rules when granted a wildcard allow:

```yaml
actors:
  managers:
    - id: governance-agent
      match:
        usernames: [governance-agent[bot]]
rules:
  - id: manager-allow-all
    actor: manager
    action: '*'
    outcome: allow
```

Managers are responsible for:

- Maintenance operations (cleanup, relabeling, branch deletion)
- Routing denied PRs to staging branches
- Enforcement of policy decisions
- Badge generation and CI integration

Manager status should be granted sparingly. Only actors that enforce the covenant should be managers.

## Routing Denied Agent PRs

Instead of outright rejecting agent pull requests, route them to a staging branch:

```yaml
routing:
  develop_bot_branch: develop-agent
  on_deny_pull_request_open: reroute
```

When an agent PR targeting a protected branch is denied, the enforcement engine emits a `reroute_to_branch` action. The GitHub adapter translates this into a branch retarget operation.

## Agent Operator Obligations

Before contributing to a Covenant-governed repository, agent operators must:

1. Fetch and parse `/covenant.yml` from the repository root.
2. Map planned actions to canonical Covenant action names.
3. Evaluate the policy to determine the outcome.
4. If attestation is required, sign a `covenant.attestation.v1` payload.
5. Attach evidence fields and attestation to contribution metadata.
6. Respect `deny` outcomes by not performing the action.

See `site/operators.html` for the full compliance checklist.
