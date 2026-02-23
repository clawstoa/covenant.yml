"use strict";

const {
  ACTIONS,
  ACTOR_KINDS,
  DECISIONS,
  ENFORCEMENT_TYPES,
  EVIDENCE_FIELDS,
  THREAD_MODES,
} = require("./constants");

const TOP_LEVEL_KEYS = new Set([
  "spec_version",
  "defaults",
  "actors",
  "surfaces",
  "rules",
  "requirements",
  "attestation",
  "enforcement",
  "routing",
  "policies",
  "metadata",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pushError(errors, path, message) {
  errors.push({ path, message });
}

function validateString(errors, path, value, required = true) {
  if (value === undefined || value === null) {
    if (required) {
      pushError(errors, path, "is required");
    }
    return false;
  }
  if (typeof value !== "string" || value.length === 0) {
    pushError(errors, path, "must be a non-empty string");
    return false;
  }
  return true;
}

function validateStringArray(errors, path, value, required = true) {
  if (value === undefined || value === null) {
    if (required) {
      pushError(errors, path, "is required");
    }
    return false;
  }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.length === 0)) {
    pushError(errors, path, "must be a non-empty array of strings");
    return false;
  }
  return true;
}

function validateOutcome(errors, path, value) {
  if (!validateString(errors, path, value)) {
    return;
  }
  if (!DECISIONS.includes(value)) {
    pushError(errors, path, `must be one of: ${DECISIONS.join(", ")}`);
  }
}

function validateSpecVersion(errors, policy) {
  const path = "spec_version";
  if (!validateString(errors, path, policy.spec_version)) {
    return;
  }
  if (!/^\d+\.\d+\.\d+$/.test(policy.spec_version)) {
    pushError(errors, path, "must be semantic version format x.y.z");
    return;
  }
  const [major] = policy.spec_version.split(".");
  if (major !== "1") {
    pushError(errors, path, "major version must be 1 for covenant v1");
  }
}

function validateDefaults(errors, policy) {
  if (!isObject(policy.defaults)) {
    pushError(errors, "defaults", "must be an object");
    return;
  }
  validateOutcome(errors, "defaults.unmatched", policy.defaults.unmatched);
}

function validateActors(errors, actors) {
  if (actors === undefined) {
    return;
  }
  if (!isObject(actors)) {
    pushError(errors, "actors", "must be an object");
    return;
  }

  for (const kind of ACTOR_KINDS) {
    const entries = actors[`${kind}s`];
    if (entries === undefined) {
      continue;
    }
    const path = `actors.${kind}s`;
    if (!Array.isArray(entries)) {
      pushError(errors, path, "must be an array");
      continue;
    }
    entries.forEach((actor, index) => {
      const actorPath = `${path}[${index}]`;
      if (!isObject(actor)) {
        pushError(errors, actorPath, "must be an object");
        return;
      }
      validateString(errors, `${actorPath}.id`, actor.id);
      if (!isObject(actor.match)) {
        pushError(errors, `${actorPath}.match`, "must be an object");
      } else {
        validateStringArray(errors, `${actorPath}.match.usernames`, actor.match.usernames);
      }
      if (kind === "agent" && actor.verification !== undefined) {
        if (!isObject(actor.verification)) {
          pushError(errors, `${actorPath}.verification`, "must be an object");
        } else {
          validateString(errors, `${actorPath}.verification.type`, actor.verification.type);
          if (actor.verification.type !== undefined && actor.verification.type !== "ed25519") {
            pushError(errors, `${actorPath}.verification.type`, "must be 'ed25519'");
          }
          validateString(errors, `${actorPath}.verification.public_key`, actor.verification.public_key);
        }
      }
    });
  }
}

function isValidActionPattern(value) {
  if (value === "*") {
    return true;
  }
  if (ACTIONS.includes(value)) {
    return true;
  }
  if (/^[a-z_]+\.\*$/.test(value)) {
    const prefix = value.slice(0, -2);
    return ACTIONS.some((action) => action.startsWith(`${prefix}.`));
  }
  return false;
}

function validateRuleTarget(errors, path, target) {
  if (!isObject(target)) {
    pushError(errors, path, "must be an object");
    return;
  }
  const allowedKeys = new Set(["branch", "thread_mode"]);
  for (const key of Object.keys(target)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "is not supported");
    }
  }
  if (target.branch !== undefined) {
    validateString(errors, `${path}.branch`, target.branch);
  }
  if (target.thread_mode !== undefined) {
    validateString(errors, `${path}.thread_mode`, target.thread_mode);
    if (target.thread_mode !== undefined && !THREAD_MODES.includes(target.thread_mode)) {
      pushError(errors, `${path}.thread_mode`, `must be one of: ${THREAD_MODES.join(", ")}`);
    }
  }
}

function validateRuleConditions(errors, path, conditions) {
  if (!isObject(conditions)) {
    pushError(errors, path, "must be an object");
    return;
  }
  const allowedKeys = new Set(["labels_any", "labels_all", "repository_visibility", "thread_mode"]);
  for (const key of Object.keys(conditions)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "is not supported");
    }
  }
  if (conditions.labels_any !== undefined) {
    validateStringArray(errors, `${path}.labels_any`, conditions.labels_any);
  }
  if (conditions.labels_all !== undefined) {
    validateStringArray(errors, `${path}.labels_all`, conditions.labels_all);
  }
  if (conditions.repository_visibility !== undefined) {
    validateString(errors, `${path}.repository_visibility`, conditions.repository_visibility);
    if (conditions.repository_visibility !== undefined && !["public", "private"].includes(conditions.repository_visibility)) {
      pushError(errors, `${path}.repository_visibility`, "must be 'public' or 'private'");
    }
  }
  if (conditions.thread_mode !== undefined) {
    validateString(errors, `${path}.thread_mode`, conditions.thread_mode);
    if (conditions.thread_mode !== undefined && !THREAD_MODES.includes(conditions.thread_mode)) {
      pushError(errors, `${path}.thread_mode`, `must be one of: ${THREAD_MODES.join(", ")}`);
    }
  }
}

function validateRuleRequirements(errors, path, requirements) {
  if (!isObject(requirements)) {
    pushError(errors, path, "must be an object");
    return;
  }
  const allowedKeys = new Set(["provenance_profile", "attestation", "on_failure"]);
  for (const key of Object.keys(requirements)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "is not supported");
    }
  }
  if (requirements.provenance_profile !== undefined) {
    validateString(errors, `${path}.provenance_profile`, requirements.provenance_profile);
  }
  if (requirements.attestation !== undefined) {
    validateString(errors, `${path}.attestation`, requirements.attestation);
    if (!["required", "optional", "for_agents"].includes(requirements.attestation)) {
      pushError(errors, `${path}.attestation`, "must be one of: required, optional, for_agents");
    }
  }
  if (requirements.on_failure !== undefined) {
    validateOutcome(errors, `${path}.on_failure`, requirements.on_failure);
  }
}

function validateRules(errors, policy) {
  if (!Array.isArray(policy.rules) || policy.rules.length === 0) {
    pushError(errors, "rules", "must be a non-empty array");
    return;
  }
  const ruleIds = new Set();
  policy.rules.forEach((rule, index) => {
    const path = `rules[${index}]`;
    if (!isObject(rule)) {
      pushError(errors, path, "must be an object");
      return;
    }
    validateString(errors, `${path}.id`, rule.id);
    if (rule.id && ruleIds.has(rule.id)) {
      pushError(errors, `${path}.id`, "must be unique");
    }
    if (rule.id) {
      ruleIds.add(rule.id);
    }
    validateString(errors, `${path}.actor`, rule.actor);
    validateString(errors, `${path}.action`, rule.action);
    if (typeof rule.action === "string" && !isValidActionPattern(rule.action)) {
      pushError(errors, `${path}.action`, "must be a canonical action, prefix wildcard, or '*'");
    }
    validateOutcome(errors, `${path}.outcome`, rule.outcome);

    if (rule.target !== undefined) {
      validateRuleTarget(errors, `${path}.target`, rule.target);
    }
    if (rule.conditions !== undefined) {
      validateRuleConditions(errors, `${path}.conditions`, rule.conditions);
    }
    if (rule.requirements !== undefined) {
      validateRuleRequirements(errors, `${path}.requirements`, rule.requirements);
    }
  });
}

function validateRequirements(errors, requirements) {
  if (requirements === undefined) {
    return;
  }
  if (!isObject(requirements)) {
    pushError(errors, "requirements", "must be an object");
    return;
  }

  const allowedKeys = new Set(["on_failure", "default_provenance_profile", "provenance_profiles"]);
  for (const key of Object.keys(requirements)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `requirements.${key}`, "is not supported");
    }
  }

  if (requirements.on_failure !== undefined) {
    validateOutcome(errors, "requirements.on_failure", requirements.on_failure);
  }
  if (requirements.default_provenance_profile !== undefined) {
    validateString(errors, "requirements.default_provenance_profile", requirements.default_provenance_profile);
  }
  if (requirements.provenance_profiles !== undefined) {
    if (!isObject(requirements.provenance_profiles)) {
      pushError(errors, "requirements.provenance_profiles", "must be an object");
    } else {
      for (const [name, profile] of Object.entries(requirements.provenance_profiles)) {
        const path = `requirements.provenance_profiles.${name}`;
        if (!isObject(profile)) {
          pushError(errors, path, "must be an object");
          continue;
        }
        validateStringArray(errors, `${path}.required_fields`, profile.required_fields);
        if (Array.isArray(profile.required_fields)) {
          for (const field of profile.required_fields) {
            if (!EVIDENCE_FIELDS.includes(field)) {
              pushError(errors, `${path}.required_fields`, `contains unknown field '${field}'`);
            }
          }
        }
        if (profile.on_failure !== undefined) {
          validateOutcome(errors, `${path}.on_failure`, profile.on_failure);
        }
      }
    }
  }
}

function validateAttestation(errors, attestation) {
  if (attestation === undefined) {
    return;
  }
  if (!isObject(attestation)) {
    pushError(errors, "attestation", "must be an object");
    return;
  }
  const allowedKeys = new Set(["contract", "max_age_seconds", "nonce_ttl_seconds", "on_failure"]);
  for (const key of Object.keys(attestation)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `attestation.${key}`, "is not supported");
    }
  }
  if (attestation.contract !== undefined) {
    validateString(errors, "attestation.contract", attestation.contract);
    if (attestation.contract !== "covenant.attestation.v1") {
      pushError(errors, "attestation.contract", "must be covenant.attestation.v1");
    }
  }
  if (attestation.max_age_seconds !== undefined) {
    if (!Number.isInteger(attestation.max_age_seconds) || attestation.max_age_seconds <= 0) {
      pushError(errors, "attestation.max_age_seconds", "must be a positive integer");
    }
  }
  if (attestation.nonce_ttl_seconds !== undefined) {
    if (!Number.isInteger(attestation.nonce_ttl_seconds) || attestation.nonce_ttl_seconds <= 0) {
      pushError(errors, "attestation.nonce_ttl_seconds", "must be a positive integer");
    }
  }
  if (attestation.on_failure !== undefined) {
    validateOutcome(errors, "attestation.on_failure", attestation.on_failure);
  }
}

function validateEnforcementAction(errors, path, action) {
  if (!isObject(action)) {
    pushError(errors, path, "must be an object");
    return;
  }
  validateString(errors, `${path}.type`, action.type);
  if (!ENFORCEMENT_TYPES.includes(action.type)) {
    pushError(errors, `${path}.type`, `must be one of: ${ENFORCEMENT_TYPES.join(", ")}`);
    return;
  }

  switch (action.type) {
    case "comment":
      validateString(errors, `${path}.message`, action.message);
      break;
    case "label":
      validateStringArray(errors, `${path}.labels`, action.labels);
      break;
    case "reroute_to_branch":
      validateString(errors, `${path}.branch`, action.branch);
      break;
    case "fail_status":
      validateString(errors, `${path}.context`, action.context);
      validateString(errors, `${path}.description`, action.description, false);
      break;
    default:
      break;
  }
}

function validateEnforcement(errors, enforcement) {
  if (enforcement === undefined) {
    return;
  }
  if (!isObject(enforcement)) {
    pushError(errors, "enforcement", "must be an object");
    return;
  }

  for (const outcome of DECISIONS) {
    const actions = enforcement[outcome];
    if (actions === undefined) {
      continue;
    }
    const path = `enforcement.${outcome}`;
    if (!Array.isArray(actions)) {
      pushError(errors, path, "must be an array");
      continue;
    }
    actions.forEach((action, index) => {
      validateEnforcementAction(errors, `${path}[${index}]`, action);
    });
  }
}

function validateRouting(errors, routing) {
  if (routing === undefined) {
    return;
  }
  if (!isObject(routing)) {
    pushError(errors, "routing", "must be an object");
    return;
  }

  const allowedKeys = new Set(["develop_bot_branch", "on_deny_pull_request_open"]);
  for (const key of Object.keys(routing)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `routing.${key}`, "is not supported");
    }
  }
  if (routing.develop_bot_branch !== undefined) {
    validateString(errors, "routing.develop_bot_branch", routing.develop_bot_branch);
  }
  if (routing.on_deny_pull_request_open !== undefined) {
    validateString(errors, "routing.on_deny_pull_request_open", routing.on_deny_pull_request_open);
    if (!["none", "reroute"].includes(routing.on_deny_pull_request_open)) {
      pushError(errors, "routing.on_deny_pull_request_open", "must be one of: none, reroute");
    }
  }
}

function validateSurfaces(errors, surfaces) {
  if (surfaces === undefined) {
    return;
  }
  if (!isObject(surfaces)) {
    pushError(errors, "surfaces", "must be an object");
    return;
  }
  if (surfaces.actions !== undefined) {
    if (!validateStringArray(errors, "surfaces.actions", surfaces.actions)) {
      return;
    }
    for (const action of surfaces.actions) {
      if (!ACTIONS.includes(action)) {
        pushError(errors, "surfaces.actions", `contains unknown action '${action}'`);
      }
    }
  }
}

function validateAgentEligibleLabels(errors, path, config) {
  if (!isObject(config)) {
    pushError(errors, path, "must be an object");
    return;
  }
  const allowedKeys = new Set(["labels", "actions", "on_missing"]);
  for (const key of Object.keys(config)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `${path}.${key}`, "is not supported");
    }
  }
  validateStringArray(errors, `${path}.labels`, config.labels);
  if (config.actions !== undefined) {
    validateStringArray(errors, `${path}.actions`, config.actions, false);
    if (Array.isArray(config.actions)) {
      for (const action of config.actions) {
        if (!ACTIONS.includes(action)) {
          pushError(errors, `${path}.actions`, `contains unknown action '${action}'`);
        }
      }
    }
  }
  if (config.on_missing !== undefined) {
    validateOutcome(errors, `${path}.on_missing`, config.on_missing);
  }
}

function validatePolicies(errors, policies) {
  if (policies === undefined) {
    return;
  }
  if (!isObject(policies)) {
    pushError(errors, "policies", "must be an object");
    return;
  }
  const allowedKeys = new Set(["agent_eligible_labels"]);
  for (const key of Object.keys(policies)) {
    if (!allowedKeys.has(key)) {
      pushError(errors, `policies.${key}`, "is not supported");
    }
  }
  if (policies.agent_eligible_labels !== undefined) {
    validateAgentEligibleLabels(errors, "policies.agent_eligible_labels", policies.agent_eligible_labels);
  }
}

function validatePolicyObject(policy) {
  const errors = [];

  if (!isObject(policy)) {
    return {
      valid: false,
      errors: [{ path: "$", message: "policy must be an object" }],
    };
  }

  for (const key of Object.keys(policy)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      pushError(errors, key, "is not allowed at top level");
    }
  }

  validateSpecVersion(errors, policy);
  validateDefaults(errors, policy);
  validateActors(errors, policy.actors);
  validateSurfaces(errors, policy.surfaces);
  validateRules(errors, policy);
  validateRequirements(errors, policy.requirements);
  validateAttestation(errors, policy.attestation);
  validateEnforcement(errors, policy.enforcement);
  validateRouting(errors, policy.routing);
  validatePolicies(errors, policy.policies);

  if (policy.metadata !== undefined && !isObject(policy.metadata)) {
    pushError(errors, "metadata", "must be an object");
  }

  if (policy.requirements && policy.requirements.default_provenance_profile && policy.requirements.provenance_profiles) {
    if (!policy.requirements.provenance_profiles[policy.requirements.default_provenance_profile]) {
      pushError(
        errors,
        "requirements.default_provenance_profile",
        "must reference an existing requirements.provenance_profiles entry"
      );
    }
  }

  if (Array.isArray(policy.rules) && policy.requirements && policy.requirements.provenance_profiles) {
    for (let i = 0; i < policy.rules.length; i += 1) {
      const rule = policy.rules[i];
      if (!rule || !rule.requirements || !rule.requirements.provenance_profile) {
        continue;
      }
      if (!policy.requirements.provenance_profiles[rule.requirements.provenance_profile]) {
        pushError(
          errors,
          `rules[${i}].requirements.provenance_profile`,
          "must reference an existing requirements.provenance_profiles entry"
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  validatePolicyObject,
};
