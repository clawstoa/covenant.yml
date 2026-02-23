"use strict";

function createSimulatedAttestationVerifier(options = {}) {
  const nonceStore = options.nonceStore || new Map();

  return function verifySimulatedAttestation({
    policy,
    policyHash,
    event,
    now = Date.now(),
  }) {
    const reasons = [];
    const attestation = event && event.attestation;

    if (!attestation) {
      return {
        ok: false,
        reason_codes: ["attestation.missing"],
      };
    }

    if (attestation.version !== "covenant.attestation.v1") {
      reasons.push("attestation.invalid_version");
    }

    if (!event.actor || attestation.actor_id !== event.actor.id) {
      reasons.push("attestation.actor_mismatch");
    }

    if (attestation.action !== event.action) {
      reasons.push("attestation.action_mismatch");
    }

    if (
      policyHash
      && attestation.policy_sha256
      && attestation.policy_sha256 !== "__SIM_POLICY_HASH__"
      && attestation.policy_sha256 !== policyHash
    ) {
      reasons.push("attestation.policy_hash_mismatch");
    }

    const timestampMillis = Date.parse(attestation.timestamp);
    if (Number.isNaN(timestampMillis)) {
      reasons.push("attestation.invalid_timestamp");
    } else {
      const maxAgeSeconds = policy && policy.attestation && Number.isInteger(policy.attestation.max_age_seconds)
        ? policy.attestation.max_age_seconds
        : 900;
      if ((now - timestampMillis) / 1000 > maxAgeSeconds) {
        reasons.push("attestation.expired");
      }
    }

    if (!attestation.nonce || typeof attestation.nonce !== "string") {
      reasons.push("attestation.invalid_nonce");
    } else {
      const nonceTtlSeconds = policy && policy.attestation && Number.isInteger(policy.attestation.nonce_ttl_seconds)
        ? policy.attestation.nonce_ttl_seconds
        : 3600;
      const seenAt = nonceStore.get(attestation.nonce);
      if (seenAt && (now - seenAt) / 1000 <= nonceTtlSeconds) {
        reasons.push("attestation.replayed_nonce");
      }
    }

    if (attestation.signature === "invalid") {
      reasons.push("attestation.invalid_signature");
    }

    if (Array.isArray(attestation.force_reason_codes)) {
      reasons.push(...attestation.force_reason_codes);
    }

    if (reasons.length > 0) {
      return {
        ok: false,
        reason_codes: reasons,
      };
    }

    if (attestation.nonce) {
      nonceStore.set(attestation.nonce, now);
    }

    return {
      ok: true,
      reason_codes: [],
    };
  };
}

module.exports = {
  createSimulatedAttestationVerifier,
};

