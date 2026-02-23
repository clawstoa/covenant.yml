"use strict";

const crypto = require("node:crypto");

const { stableStringify } = require("../lib/stable-json");

function createNonceStore() {
  return new Map();
}

function decodeBase64(input) {
  try {
    return Buffer.from(input, "base64");
  } catch (_error) {
    return null;
  }
}

function verifyAttestation({
  policy,
  policyHash,
  event,
  actorProfile,
  nonceStore,
  now = Date.now(),
}) {
  const reasons = [];

  const attestation = event.attestation;
  if (!attestation) {
    return { ok: false, reason_codes: ["attestation.missing"] };
  }

  if (attestation.version !== "covenant.attestation.v1") {
    reasons.push("attestation.invalid_version");
  }

  const expectedActorId = event.actor && event.actor.id;
  if (!expectedActorId || attestation.actor_id !== expectedActorId) {
    reasons.push("attestation.actor_mismatch");
  }

  if (attestation.action !== event.action) {
    reasons.push("attestation.action_mismatch");
  }

  if (attestation.policy_sha256 !== policyHash) {
    reasons.push("attestation.policy_hash_mismatch");
  }

  // Validate strict ISO 8601 / RFC 3339 format before parsing.
  // Date.parse() is locale-dependent and silently accepts malformed strings.
  const ISO8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
  const timestampMillis = ISO8601_RE.test(attestation.timestamp)
    ? Date.parse(attestation.timestamp)
    : NaN;
  if (Number.isNaN(timestampMillis)) {
    reasons.push("attestation.invalid_timestamp");
  } else {
    const maxAgeSeconds = policy.attestation && Number.isInteger(policy.attestation.max_age_seconds)
      ? policy.attestation.max_age_seconds
      : 900;
    if ((now - timestampMillis) / 1000 > maxAgeSeconds) {
      reasons.push("attestation.expired");
    }
  }

  if (!attestation.nonce || typeof attestation.nonce !== "string") {
    reasons.push("attestation.invalid_nonce");
  } else {
    const ttlSeconds = policy.attestation && Number.isInteger(policy.attestation.nonce_ttl_seconds)
      ? policy.attestation.nonce_ttl_seconds
      : 3600;
    const seenAt = nonceStore.get(attestation.nonce);
    if (seenAt && (now - seenAt) / 1000 < ttlSeconds) {
      reasons.push("attestation.replayed_nonce");
    }
  }

  if (!actorProfile || !actorProfile.verification) {
    reasons.push("attestation.verification_key_missing");
  } else {
    const verification = actorProfile.verification;
    if (verification.type !== "ed25519") {
      reasons.push("attestation.unsupported_verification_type");
    } else {
      const publicKeyDer = decodeBase64(verification.public_key);
      const signature = decodeBase64(attestation.signature);
      if (!publicKeyDer || !signature) {
        reasons.push("attestation.invalid_signature_encoding");
      } else {
        try {
          const publicKey = crypto.createPublicKey({
            key: publicKeyDer,
            format: "der",
            type: "spki",
          });
          const signedPayload = {
            version: "covenant.attestation.v1",
            actor_id: attestation.actor_id,
            action: attestation.action,
            repository: attestation.repository,
            ref: attestation.ref,
            policy_sha256: attestation.policy_sha256,
            timestamp: attestation.timestamp,
            nonce: attestation.nonce,
          };
          const payload = Buffer.from(stableStringify(signedPayload));
          const valid = crypto.verify(null, payload, publicKey, signature);
          if (!valid) {
            reasons.push("attestation.invalid_signature");
          }
        } catch (_error) {
          reasons.push("attestation.signature_verification_error");
        }
      }
    }
  }

  if (reasons.length > 0) {
    return { ok: false, reason_codes: reasons };
  }

  nonceStore.set(attestation.nonce, now);
  return { ok: true, reason_codes: [] };
}

module.exports = {
  createNonceStore,
  verifyAttestation,
};
