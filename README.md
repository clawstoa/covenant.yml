# Δ covenant.yml

![covenant-enabled](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/covenant/covenant-enabled.svg)
![agent-pr-policy-allow](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/allow.svg)
![provenance-policy-none](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/provenance-policy/none.svg)
![attestation-required-none](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/attestation-required/none.svg)
![thread-intervention-policy-open](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/thread-intervention-policy/open.svg)

**Covenant** is a declarative governance contract for repositories operating in a human-agent world. It defines which actors — humans, AI agents, or trusted managers — may perform which actions, with deterministic machine-enforced outcomes and transparent reason codes.

Think of it as `CODEOWNERS` plus branch protection rules, but policy-driven, AI-aware, and capable of cryptographic attestation verification.

## Why Covenant?

AI agents are now opening pull requests, solving issues, and reviewing code across public repositories. Most governance tools were designed before autonomous contributors existed. Covenant fills that gap:

- **Deterministic** — identical event + identical policy always produce identical output.
- **Auditable** — every decision is tagged with machine-readable reason codes parseable by downstream automation.
- **Gradual** — policies range from fully open to fully locked; adoption is additive.
- **Verifiable** — agents can submit signed attestation payloads; Covenant verifies them cryptographically.

## Getting Started

See [docs/ADOPTION.md](docs/ADOPTION.md) for a step-by-step guide for maintainers. A minimal policy:

```yaml
# covenant.yml
spec_version: 1.0.0
defaults:
  unmatched: warn
rules:
  - id: agent-pr-open
    actor: agent
    action: pull_request.open
    outcome: warn
  - id: human-all
    actor: human
    action: '*'
    outcome: allow
```

## GitHub Action

Add Covenant enforcement to any repository:

```yaml
# .github/workflows/covenant.yml
name: Covenant Check
on: [pull_request, issues, issue_comment]
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
      - uses: clawstoa/covenant.yml@main
        with:
          policy-path: covenant.yml
          mode: enforce
```

Outputs: `decision`, `reason_codes`, `enforcement_actions`.

## CLI (development / CI)

Requires Node 18+ and [pnpm](https://pnpm.io).

```bash
# Validate policy schema
node bin/covenant.js validate covenant.yml

# Evaluate a single event
node bin/covenant.js eval --policy covenant.yml \
  --event '{"action":"pull_request.open","actor":{"id":"ci-agent[bot]","kind":"agent"},"target":{"branch":"main"},"evidence":{"model":"gpt-5","provider":"openai","prompt_record":"prompt://1","test_proof":"tests://1"}}'

# Generate badge descriptors
node bin/covenant.js badge --policy covenant.yml --format json

# Run deterministic simulation
node bin/covenant.js simulate \
  --policies covenant.yml,examples/strict.covenant.yml \
  --count 1000 --seed 42 --hours 96 \
  --out-json simulation-run.json --out-csv simulation-metrics.csv

# Run tests
pnpm test
```

## Policy Scope

Covenant v1 supports:

- Three actor classes: `human`, `agent`, `manager`
- 13 canonical actions across `issue`, `pull_request`, `conversation`, `maintenance`, and `routing` surfaces
- Rule specificity with 5-tuple ordering — no ambiguous precedence
- Per-rule provenance requirements with named field profiles
- Ed25519-signed attestation with replay protection and policy hash binding
- GitHub event normalization for issues, PRs, reviews, and comments
- Enforcement operations: `comment`, `label`, `close_pull_request`, `delete_branch`, `reroute_to_branch`, `fail_status`
- CI-verifiable badge descriptors

## Repository Contents

| Path | Description |
|------|-------------|
| `SPEC.md` | Normative specification v1.0.0 |
| `schema/covenant.schema.json` | JSON Schema for policy validation |
| `docs/ADOPTION.md` | Maintainer onboarding guide |
| `docs/AGENT_GOVERNANCE.md` | Agent governance and operator guide |
| `docs/GITHUB_ADAPTER.md` | GitHub event normalization reference |
| `docs/SIMULATOR.md` | Simulator usage guide |
| `docs/BADGES.md` | Badge integration guide |
| `docs/POLICY_CATALOG.md` | Real-world policy examples |
| `examples/` | Ready-to-use policy files |
| `src/` | Reference implementation (Node.js) |
| `bin/covenant.js` | CLI entry point |
| `action.yml` | GitHub Action definition |
| `docs/` | Static specification and playground site |
| `tests/` | Test suite |
| `SECURITY.md` | Security policy and key rotation guide |
| `CHANGELOG.md` | Version history |
| `CONTRIBUTING.md` | Contribution guide |

## Site

Open `docs/index.html` locally, or visit the hosted version at [clawstoa.github.io/covenant.yml](https://clawstoa.github.io/covenant.yml):

- Policy overview and interaction matrix
- Live policy playground
- Real-world policy catalog
- Deterministic simulator with timeline, metrics, and JSON/CSV export
- Agent operator compliance checklist

## License

Specification, schema, documentation, examples, and docs content are dedicated to the public domain under [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/) ([LICENSE-CC0](LICENSE-CC0)). Source code, CLI, GitHub Action, and tests are licensed under [Zero-Clause BSD (0BSD)](https://opensource.org/license/0bsd) ([LICENSE-0BSD](LICENSE-0BSD)). See [LICENSE](LICENSE) for details.
