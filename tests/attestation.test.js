"use strict";

const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText, computePolicyHash } = require("../src/core/policy-loader");
const { evaluatePolicy } = require("../src/core/evaluator");
const { createNonceStore } = require("../src/core/attestation");
const { stableStringify } = require("../src/lib/stable-json");

function buildSignedAttestation({ privateKey, payload }) {
  const message = Buffer.from(stableStringify(payload));
  const signature = crypto.sign(null, message, privateKey).toString("base64");
  return {
    ...payload,
    signature,
  };
}

test("valid attestation for agent action passes", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
      verification:
        type: ed25519
        public_key: ${publicKeyDer}
requirements:
  on_failure: deny
attestation:
  contract: covenant.attestation.v1
  max_age_seconds: 3600
  nonce_ttl_seconds: 3600
rules:
  - id: require-attestation
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  const policyHash = computePolicyHash(policy);
  const payload = {
    version: "covenant.attestation.v1",
    actor_id: "ci-bot[bot]",
    action: "pull_request.open",
    repository: "acme/project",
    ref: "refs/heads/main",
    policy_sha256: policyHash,
    timestamp: "2026-02-20T12:00:00.000Z",
    nonce: "nonce-1"
  };

  const attestation = buildSignedAttestation({
    privateKey: keyPair.privateKey,
    payload,
  });

  const result = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      repository: { name: "acme/project", visibility: "public" },
      target: { branch: "main" },
      attestation,
    },
    {
      policyHash,
      now: Date.parse("2026-02-20T12:01:00.000Z"),
      nonceStore: createNonceStore(),
    }
  );

  assert.equal(result.decision, "allow");
  assert.ok(!result.reason_codes.some((code) => code.startsWith("attestation.")));
});

test("replayed nonce is denied", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
      verification:
        type: ed25519
        public_key: ${publicKeyDer}
requirements:
  on_failure: deny
attestation:
  contract: covenant.attestation.v1
  max_age_seconds: 3600
  nonce_ttl_seconds: 3600
rules:
  - id: require-attestation
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  const policyHash = computePolicyHash(policy);
  const payload = {
    version: "covenant.attestation.v1",
    actor_id: "ci-bot[bot]",
    action: "pull_request.open",
    repository: "acme/project",
    ref: "refs/heads/main",
    policy_sha256: policyHash,
    timestamp: "2026-02-20T12:00:00.000Z",
    nonce: "nonce-replay"
  };

  const attestation = buildSignedAttestation({
    privateKey: keyPair.privateKey,
    payload,
  });

  const nonceStore = createNonceStore();
  const first = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      repository: { name: "acme/project", visibility: "public" },
      target: { branch: "main" },
      attestation,
    },
    {
      policyHash,
      now: Date.parse("2026-02-20T12:01:00.000Z"),
      nonceStore,
    }
  );

  const second = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      repository: { name: "acme/project", visibility: "public" },
      target: { branch: "main" },
      attestation,
    },
    {
      policyHash,
      now: Date.parse("2026-02-20T12:02:00.000Z"),
      nonceStore,
    }
  );

  assert.equal(first.decision, "allow");
  assert.equal(second.decision, "deny");
  assert.ok(second.reason_codes.includes("attestation.replayed_nonce"));
});

test("malformed timestamp string is rejected as invalid_timestamp", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
      verification:
        type: ed25519
        public_key: ${publicKeyDer}
requirements:
  on_failure: deny
attestation:
  contract: covenant.attestation.v1
rules:
  - id: require-attestation
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  const policyHash = computePolicyHash(policy);
  // Not a valid ISO 8601 — Date.parse might accept this on some platforms, but
  // the strict regex in attestation.js should reject it.
  const payload = {
    version: "covenant.attestation.v1",
    actor_id: "ci-bot[bot]",
    action: "pull_request.open",
    repository: "acme/project",
    ref: "refs/heads/main",
    policy_sha256: policyHash,
    timestamp: "Feb 20 2026 12:00:00",
    nonce: "nonce-ts-test"
  };

  const attestation = buildSignedAttestation({
    privateKey: keyPair.privateKey,
    payload,
  });

  const result = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      repository: { name: "acme/project", visibility: "public" },
      target: { branch: "main" },
      attestation,
    },
    {
      policyHash,
      now: Date.parse("2026-02-20T12:01:00.000Z"),
      nonceStore: createNonceStore(),
    }
  );

  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("attestation.invalid_timestamp"));
});

test("expired nonce at exactly TTL boundary is accepted (boundary is exclusive)", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
      verification:
        type: ed25519
        public_key: ${publicKeyDer}
requirements:
  on_failure: deny
attestation:
  contract: covenant.attestation.v1
  max_age_seconds: 7200
  nonce_ttl_seconds: 60
rules:
  - id: require-attestation
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  const policyHash = computePolicyHash(policy);
  const baseNow = Date.parse("2026-02-20T12:00:00.000Z");

  const payload = {
    version: "covenant.attestation.v1",
    actor_id: "ci-bot[bot]",
    action: "pull_request.open",
    repository: "acme/project",
    ref: "refs/heads/main",
    policy_sha256: policyHash,
    timestamp: "2026-02-20T12:00:00.000Z",
    nonce: "nonce-boundary"
  };

  const attestation = buildSignedAttestation({ privateKey: keyPair.privateKey, payload });

  const nonceStore = createNonceStore();
  // First use: registers nonce at baseNow
  evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      target: { branch: "main" },
      attestation,
    },
    { policyHash, now: baseNow, nonceStore }
  );

  // Second use: exactly at TTL boundary (60 000 ms later) — should be ACCEPTED (expired nonce, not replayed)
  const newPayload = { ...payload, nonce: "nonce-boundary" };
  const reuse = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      target: { branch: "main" },
      attestation: buildSignedAttestation({ privateKey: keyPair.privateKey, payload: newPayload }),
    },
    { policyHash, now: baseNow + 60 * 1000, nonceStore }
  );

  // At exactly TTL seconds the nonce window is closed (< not <=), so this is treated as a new use
  assert.ok(!reuse.reason_codes.includes("attestation.replayed_nonce"),
    "nonce at exactly TTL boundary should not be treated as replayed");
});

test("policy hash mismatch is denied", () => {
  const keyPair = crypto.generateKeyPairSync("ed25519");
  const publicKeyDer = keyPair.publicKey.export({ format: "der", type: "spki" }).toString("base64");

  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
      verification:
        type: ed25519
        public_key: ${publicKeyDer}
requirements:
  on_failure: deny
attestation:
  contract: covenant.attestation.v1
rules:
  - id: require-attestation
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  const policyHash = computePolicyHash(policy);
  const payload = {
    version: "covenant.attestation.v1",
    actor_id: "ci-bot[bot]",
    action: "pull_request.open",
    repository: "acme/project",
    ref: "refs/heads/main",
    policy_sha256: "deadbeef",
    timestamp: "2026-02-20T12:00:00.000Z",
    nonce: "nonce-unique"
  };

  const attestation = buildSignedAttestation({
    privateKey: keyPair.privateKey,
    payload,
  });

  const result = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      repository: { name: "acme/project", visibility: "public" },
      target: { branch: "main" },
      attestation,
    },
    {
      policyHash,
      now: Date.parse("2026-02-20T12:01:00.000Z"),
      nonceStore: createNonceStore(),
    }
  );

  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("attestation.policy_hash_mismatch"));
});
