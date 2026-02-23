# Changelog

All notable changes to the Covenant specification and tooling are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Covenant v1 tooling uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-02-23

### Added

**Specification**
- Covenant v1 specification (`SPEC.md`) with deterministic resolution algorithm, actor model, attestation contract, and conformance requirements.
- JSON Schema for policy validation (`schema/covenant.schema.json`).
- Canonical action list: 13 interaction surfaces across `issue`, `pull_request`, `conversation`, `maintenance`, and `routing` namespaces.
- Three-tier actor model: `human`, `agent`, `manager`.
- Specificity-based rule selection with 5-tuple ordering (actor, action, target, conditions, outcome strictness) and lexicographic tie-break by rule ID.
- `policies.agent_eligible_labels` cross-cutting gate: restricts agents to labeled issues before rule matching.
- `attestation` contract (`covenant.attestation.v1`) with Ed25519 signature verification, timestamp freshness checks, and nonce replay protection.
- Provenance profiles (`requirements.provenance_profiles`) with per-profile required evidence fields and `on_failure` overrides.
- Thread mode (`human` / `agent` / `mixed`) targeting for conversation surface rules.
- Full reason code enumeration — see SPEC.md §13.
- Glossary — see SPEC.md §14.

**Tooling**
- CLI: `covenant validate`, `covenant eval`, `covenant badge`, `covenant simulate`.
- GitHub Action (`action.yml`): policy evaluation inside CI/CD with `decision`, `reason_codes`, and `enforcement_actions` outputs.
- GitHub event normalization adapter (`src/github/adapter.js`): maps GitHub webhooks to canonical event envelopes.
- Badge generator (`src/core/badges.js`): produces JSON and Shields.io badge descriptors.
- Simulator (`src/simulator/`): generates synthetic event streams, story-mode guided scenarios, and exports JSON/CSV metrics.
- Browser-based policy playground (`site/index.html`) and simulation lab (`site/simulator.html`).

**Site**
- Public specification site (`site/`) with overview, catalog, operator guide, spec, simulator, and contribution pages.
- Policy catalog with real-world stance examples (accepting, restricting, rejecting).
- Spec page improvements: sticky in-page TOC, didactic section guidance, and explanatory field tables/tooltips.
- LLM discovery index at `site/llm.txt`.

**Documentation**
- Agent governance guide consolidated at `docs/AGENT_GOVERNANCE.md`.

**Examples**
- `examples/minimal.covenant.yml` — minimal guided policy.
- `examples/polars.covenant.yml` — Polars-style open policy.
- `examples/strict.covenant.yml` — full-featured strict policy with attestation.
- `examples/gentoo.covenant.yml` — Gentoo-style rejecting policy.
- `examples/netbsd.covenant.yml` — NetBSD-style restricting policy with manager override.
- `examples/open.covenant.yml` — permissive policy without agent restrictions.

### Known Limitations

- GitHub is the only supported platform in v1. GitLab and Bitbucket parity are deferred.
- Nonce store is in-process only; replay protection does not persist across service restarts.
- `actor.kind: "manager"` cannot be asserted from the event envelope; manager actors must be declared in the policy.

### Breaking Change Policy

Covenant v1 follows a strict compatibility commitment:
- Patch releases (`1.0.x`): bug fixes and documentation only; no schema changes.
- Minor releases (`1.x.0`): additive schema extensions; existing valid policies remain valid.
- Major releases (`2.0.0`): may include breaking schema changes; migration guide will be provided.

---

*Earlier internal development history is in `.internal/covenant-plan.md`.*
