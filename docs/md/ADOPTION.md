# Adoption Guide

## 1. Choose a policy stance

Determine where your project falls on the governance spectrum.

| Stance | Default | When to use |
|--------|---------|-------------|
| Accepting | `defaults.unmatched: allow` | Agent contributions welcome. Standard review applies. |
| Guided | `defaults.unmatched: warn` | Agent contributions flagged for review. Provenance recommended. |
| Strict | `defaults.unmatched: warn` with agent-specific `deny` rules | Agent contributions require strict provenance and attestation. |
| Restricting | `defaults.unmatched: deny` with manager overrides | Agent contributions denied unless explicitly authorized. |
| Rejecting | `defaults.unmatched: deny` | No agent contributions accepted. |

See `docs/POLICY_CATALOG.md` for real-world examples mapped to each stance.

## 2. Add policy file

Create `/covenant.yml` at repository root.

Start from an example:

| Example | Stance | File |
|---------|--------|------|
| Minimal | Guided | `examples/minimal.covenant.yml` |
| Open | Accepting | `examples/open.covenant.yml` |
| Strict | Strict | `examples/strict.covenant.yml` |
| Polars-style | Accepting | `examples/polars.covenant.yml` |
| NetBSD-style | Restricting | `examples/netbsd.covenant.yml` |
| Gentoo-style | Rejecting | `examples/gentoo.covenant.yml` |

## 3. Validate on every change

Run:

```bash
node bin/covenant.js validate covenant.yml
```

Add this to CI for pull requests and default branch pushes.

## 4. Evaluate events in GitHub Actions

Use the action interface (`action.yml`) to enforce policy on repository events.

```yaml
name: Covenant Check
on:
  pull_request:
  issues:
  issue_comment:
jobs:
  covenant:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
      statuses: write
    steps:
      - uses: actions/checkout@v4
      - uses: ./.
        with:
          policy-path: covenant.yml
          mode: enforce
```

Modes:

- `report`: evaluate and emit outputs without blocking.
- `enforce`: evaluate and exit with code 2 on `deny`.

## 5. Emit verified badges

Generate badge descriptors from default-branch CI:

```bash
node bin/covenant.js badge --policy covenant.yml --format shields
```

Only publish badges from successful default-branch runs. See `docs/BADGES.md` for the full badge contract.

## 6. Define provenance requirements

Set provenance profile requirements in policy:

- `model`: exact model identifier
- `provider`: model provider
- `prompt_record`: reference to the prompt session
- `test_proof`: reference to passing tests

Configure via `requirements.provenance_profiles` in your `covenant.yml`. See the strict example for a complete configuration.

## 7. Require agent attestation where needed

Set `requirements.attestation: required` on sensitive rules.

Recommended for:

- `pull_request.open` on protected branches
- `pull_request.update` (force re-attestation on push)
- `conversation.intervene_human_thread`
- `pull_request.merge`

Attestation requires agent operators to register an Ed25519 public key in `actors.agents[].verification`. See `docs/AGENT_GOVERNANCE.md` for the agent governance model.

## 8. Configure enforcement actions

Define what happens on each decision:

```yaml
enforcement:
  warn:
    - type: comment
      message: Policy warning for ${actor} on ${action}. reason=${reason_codes}
  deny:
    - type: comment
      message: Policy denied for ${actor} on ${action}. reason=${reason_codes}
    - type: fail_status
      context: covenant/policy
      description: Covenant decision is ${decision}
```

Available enforcement types: `comment`, `label`, `close_pull_request`, `delete_branch`, `reroute_to_branch`, `fail_status`.

## 9. Set up routing for denied agent PRs

Optionally reroute denied agent pull requests to a staging branch instead of rejecting them outright:

```yaml
routing:
  develop_bot_branch: develop-agent
  on_deny_pull_request_open: reroute
```

## 10. Use reason codes as automation contract

Downstream jobs should use machine reason codes for deterministic handling, not free text parsing. Reason codes follow the pattern:

- `rule.selected.<rule-id>` — a specific rule matched
- `defaults.unmatched` — no rule matched
- `requirements.provenance.missing.<field>` — missing evidence field
- `attestation.<reason>` — attestation failure

## 11. Add CONTRIBUTING.md

Write a CONTRIBUTING.md that mirrors your `covenant.yml` in prose. Every stated rule should trace to a specific rule or default in the policy file. See this project's own `CONTRIBUTING.md` as a reference.
