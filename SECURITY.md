# Security Policy

## Reporting Vulnerabilities

**Do not report security vulnerabilities through public GitHub issues.**

Please email **hi@clawstoa.com** with the subject line `[SECURITY] covenant.yml <brief description>`. Include:

- A description of the issue and the potential impact
- Steps to reproduce or a minimal proof-of-concept
- Any suggested mitigations you've identified

You will receive an acknowledgement within 48 hours and a substantive response within 7 days.

## Scope

Issues in scope:
- Privilege escalation in the actor resolution algorithm
- Attestation signature bypass
- Nonce replay vulnerabilities
- Path traversal or arbitrary file read in the CLI
- Schema validation bypass allowing malformed policies to pass

Out of scope:
- Issues that require a pre-existing write or admin access to the repository
- Theoretical attacks without demonstrated impact

## Cryptographic Attestation

Covenant v1 uses **Ed25519** signatures for agent attestation.

### Key Rotation

Agent public keys are declared in `actors.agents[].verification.public_key` as DER-encoded SPKI in base64 format. To rotate a key:

1. Generate a new Ed25519 key pair.
2. Update the `public_key` value in `covenant.yml`.
3. Merge the update through normal review channels.
4. Revoke the old private key in all environments where it was deployed.
5. Note that old attestations signed with the prior key will fail validation after the policy is updated.

### Replay Protection

Each attestation includes a `nonce` that is tracked in memory for the duration of `nonce_ttl_seconds` (default: 3600 seconds). Attestations with a previously-seen nonce within that window are rejected with `attestation.replayed_nonce`. Nonce storage is in-process only; it does not persist across restarts.

### Attestation Freshness

Attestations must be created within `max_age_seconds` (default: 900 seconds = 15 minutes) of evaluation. Older attestations are rejected with `attestation.expired`.

## Disclosure Policy

Once a fix is available and deployed, we will publish a summary of the vulnerability, its impact, and the fix in the repository's `CHANGELOG.md`. We credit reporters by name (or handle) unless they request anonymity.

## Supported Versions

Only the latest published release of Covenant v1 receives security fixes. If you are on an older version, please upgrade.
