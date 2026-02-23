# Contributing to Covenant

This document describes in prose what `covenant.yml` enforces programmatically. The policy file at the repository root is authoritative. If any statement here contradicts `covenant.yml`, the policy file prevails.

---

## Code Contributions

1. Fork the repository and create a branch from `main`.
2. Make your changes. Ensure all tests pass: `pnpm test`.
3. Validate the policy file if modified: `node bin/covenant.js validate covenant.yml`.
4. Open a pull request against `main`.

## Current Governance Posture (Permissive)

The current repository policy is intentionally permissive:

- `defaults.unmatched: allow`
- Rule `allow-all`: `actor: any`, `action: '*'`, `outcome: allow`

As configured today, this means:

- Human, agent, and manager actors are all allowed by policy for all canonical actions.
- Provenance evidence fields are not required by the policy.
- Attestation is not required by the policy.
- No policy-level thread-intervention restrictions are applied.

This posture can change in future releases if `covenant.yml` is updated.

---

## Policy Submissions

To contribute a dissected real-world AI policy:

1. Open an issue using the **Policy Submission** template.
2. Include: project name, source URL, stance (accepting/restricting/rejecting), and a proposed `covenant.yml` mapping.
3. The submitted YAML is validated against the Covenant.yml v1.0.0 schema.
4. A maintainer reviews and merges the policy into `docs/POLICY_CATALOG.md`.

## Issues

Issues are welcome from all contributors. No special requirements apply.

## Acceptance Criteria

All pull requests must:

1. Pass `pnpm test`.
2. Pass `node bin/covenant.js validate covenant.yml` (if modifying the policy file).
3. Not introduce regressions in the schema, evaluator, enforcement engine, or site/docs consistency.

---

## Policy File as Source of Truth

Every rule stated in this document maps to a specific rule or default in `covenant.yml`. When `covenant.yml` is updated, this document must be updated to match.

Review the policy file directly for the canonical, machine-readable version of these guidelines:

```
covenant.yml (repository root)
```
