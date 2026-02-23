"use strict";

function colorForMessage(message) {
  if (message === "enabled" || message === "required" || message === "controlled") {
    return "2f855a";
  }
  if (message === "none" || message === "open") {
    return "718096";
  }
  if (message === "warn") {
    return "b7791f";
  }
  if (message === "deny") {
    return "c53030";
  }
  return "2b6cb0";
}

function summarizeAgentPrPolicy(policy) {
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  const direct = rules.filter((rule) => {
    const actorMatch = rule.actor === "agent" || rule.actor === "any";
    const actionMatch = rule.action === "pull_request.open" || rule.action === "pull_request.*" || rule.action === "*";
    return actorMatch && actionMatch;
  });
  if (direct.length === 0) {
    return "none";
  }
  const strictness = { allow: 0, warn: 1, deny: 2 };
  direct.sort((a, b) => strictness[b.outcome] - strictness[a.outcome]);
  return direct[0].outcome;
}

function summarizeProvenance(policy) {
  const requirements = policy.requirements;
  if (!requirements || !requirements.provenance_profiles) {
    return "none";
  }
  const profileName = requirements.default_provenance_profile;
  if (!profileName) {
    return "configured";
  }
  const profile = requirements.provenance_profiles[profileName];
  if (!profile || !Array.isArray(profile.required_fields) || profile.required_fields.length === 0) {
    return "configured";
  }
  return "required";
}

function summarizeAttestation(policy) {
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  if (rules.some((rule) => rule.requirements && rule.requirements.attestation === "required")) {
    return "required";
  }
  if (rules.some((rule) => rule.requirements && rule.requirements.attestation === "for_agents")) {
    return "agents";
  }
  return "none";
}

function summarizeThreadIntervention(policy) {
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  const guarded = rules.some((rule) =>
    rule.action === "conversation.intervene_human_thread"
      && (rule.outcome === "warn" || rule.outcome === "deny")
  );
  return guarded ? "controlled" : "open";
}

function toBadge(label, message, verified) {
  return {
    label,
    message,
    color: colorForMessage(message),
    verified,
  };
}

function generateBadges(policy, options = {}) {
  const verified = options.verified !== false;
  return {
    "covenant-enabled": toBadge("covenant", "enabled", verified),
    "agent-pr-policy": toBadge("agent-pr", summarizeAgentPrPolicy(policy), verified),
    "provenance-policy": toBadge("provenance", summarizeProvenance(policy), verified),
    "attestation-required": toBadge("attestation", summarizeAttestation(policy), verified),
    "thread-intervention-policy": toBadge("thread-mode", summarizeThreadIntervention(policy), verified),
  };
}

function toShieldsEndpoint(badge) {
  return {
    schemaVersion: 1,
    label: badge.label,
    message: badge.message,
    color: `#${badge.color}`,
  };
}

module.exports = {
  generateBadges,
  toShieldsEndpoint,
};
