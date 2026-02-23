"use strict";

const { ACTOR_KINDS, AGENT_ELIGIBLE_LABEL_DEFAULT_ACTIONS, DECISIONS, OUTCOME_SEVERITY } = require("./constants");
const { createNonceStore, verifyAttestation } = require("./attestation");

function toArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  return [];
}

function maxDecision(first, second) {
  return OUTCOME_SEVERITY[first] >= OUTCOME_SEVERITY[second] ? first : second;
}

function collectProfiles(policy, kind) {
  const group = policy.actors && policy.actors[`${kind}s`];
  return Array.isArray(group) ? group : [];
}

function resolveActorContext(policy, eventActor = {}) {
  const id = typeof eventActor.id === "string" ? eventActor.id : "";

  for (const kind of ACTOR_KINDS) {
    const profiles = collectProfiles(policy, kind);
    for (const profile of profiles) {
      const usernames = profile.match && Array.isArray(profile.match.usernames) ? profile.match.usernames : [];
      if (profile.id === id || usernames.includes(id)) {
        return {
          id,
          kind,
          profile,
        };
      }
    }
  }

  // Only trust event-provided kind for non-privileged actor classes.
  // "manager" kind must always be established via explicit policy profile match,
  // never from the event envelope, to prevent privilege escalation.
  const UNTRUSTED_KINDS = ["human", "agent"];
  if (eventActor.kind && UNTRUSTED_KINDS.includes(eventActor.kind)) {
    return {
      id,
      kind: eventActor.kind,
      profile: null,
    };
  }

  return {
    id,
    kind: "human",
    profile: null,
  };
}

function actorMatchScore(ruleActor, actorContext) {
  if (ruleActor === "any") {
    return 0;
  }
  if (ACTOR_KINDS.includes(ruleActor)) {
    return ruleActor === actorContext.kind ? 1 : -1;
  }
  if (ruleActor === actorContext.id) {
    return 2;
  }
  if (actorContext.profile && ruleActor === actorContext.profile.id) {
    return 2;
  }
  return -1;
}

function actionMatchScore(pattern, action) {
  if (pattern === "*") {
    return 0;
  }
  if (pattern === action) {
    return 2;
  }
  if (pattern.endsWith(".*")) {
    const prefix = pattern.slice(0, -1);
    if (action.startsWith(prefix)) {
      return 1;
    }
  }
  return -1;
}

function targetMatchScore(ruleTarget, eventTarget = {}) {
  if (!ruleTarget) {
    return { matched: true, score: 0 };
  }
  let score = 0;
  for (const [key, expected] of Object.entries(ruleTarget)) {
    if (eventTarget[key] !== expected) {
      return { matched: false, score: 0 };
    }
    score += 1;
  }
  return { matched: true, score };
}

function includesAll(haystack, needles) {
  return needles.every((needle) => haystack.includes(needle));
}

function includesAny(haystack, needles) {
  return needles.some((needle) => haystack.includes(needle));
}

function conditionsMatchScore(ruleConditions, event) {
  if (!ruleConditions) {
    return { matched: true, score: 0 };
  }

  const labels = toArray(event.target && event.target.labels);

  if (ruleConditions.labels_any && !includesAny(labels, ruleConditions.labels_any)) {
    return { matched: false, score: 0 };
  }
  if (ruleConditions.labels_all && !includesAll(labels, ruleConditions.labels_all)) {
    return { matched: false, score: 0 };
  }
  if (
    ruleConditions.repository_visibility
    && (!event.repository || event.repository.visibility !== ruleConditions.repository_visibility)
  ) {
    return { matched: false, score: 0 };
  }
  if (ruleConditions.thread_mode && (!event.target || event.target.thread_mode !== ruleConditions.thread_mode)) {
    return { matched: false, score: 0 };
  }

  return {
    matched: true,
    score: Object.keys(ruleConditions).length,
  };
}

function compareCandidates(a, b) {
  const tupleKeys = ["actorScore", "actionScore", "targetScore", "conditionScore", "outcomeScore"];
  for (const key of tupleKeys) {
    if (a[key] !== b[key]) {
      return b[key] - a[key];
    }
  }
  return a.rule.id.localeCompare(b.rule.id);
}

function resolveRule(policy, event, actorContext) {
  const candidates = [];
  for (const rule of policy.rules) {
    const actorScore = actorMatchScore(rule.actor, actorContext);
    if (actorScore < 0) {
      continue;
    }

    const actionScore = actionMatchScore(rule.action, event.action);
    if (actionScore < 0) {
      continue;
    }

    const targetResult = targetMatchScore(rule.target, event.target);
    if (!targetResult.matched) {
      continue;
    }

    const conditionResult = conditionsMatchScore(rule.conditions, event);
    if (!conditionResult.matched) {
      continue;
    }

    candidates.push({
      rule,
      actorScore,
      actionScore,
      targetScore: targetResult.score,
      conditionScore: conditionResult.score,
      outcomeScore: OUTCOME_SEVERITY[rule.outcome],
    });
  }

  candidates.sort(compareCandidates);

  return {
    selected: candidates.length > 0 ? candidates[0].rule : null,
    matchedCount: candidates.length,
  };
}

function resolveRequirements(policy, rule) {
  const base = {
    provenance_profile: policy.requirements && policy.requirements.default_provenance_profile,
    attestation: "optional",
    on_failure:
      (policy.requirements && policy.requirements.on_failure)
      || (policy.attestation && policy.attestation.on_failure)
      || "deny",
  };

  if (!rule || !rule.requirements) {
    return base;
  }

  if (rule.requirements.provenance_profile !== undefined) {
    base.provenance_profile = rule.requirements.provenance_profile;
  }
  if (rule.requirements.attestation !== undefined) {
    base.attestation = rule.requirements.attestation;
  }
  if (rule.requirements.on_failure !== undefined) {
    base.on_failure = rule.requirements.on_failure;
  }

  return base;
}

function evaluateProvenance({ policy, requirements, event }) {
  const reasonCodes = [];
  let onFailure = requirements.on_failure;

  if (!requirements.provenance_profile) {
    return {
      ok: true,
      reason_codes: reasonCodes,
      on_failure: onFailure,
    };
  }

  const profiles = policy.requirements && policy.requirements.provenance_profiles;
  const profile = profiles && profiles[requirements.provenance_profile];
  if (!profile) {
    return {
      ok: false,
      reason_codes: ["requirements.provenance_profile_missing"],
      on_failure: onFailure,
    };
  }

  if (profile.on_failure) {
    onFailure = profile.on_failure;
  }

  const evidence = event.evidence && typeof event.evidence === "object" ? event.evidence : {};
  const requiredFields = Array.isArray(profile.required_fields) ? profile.required_fields : [];
  for (const field of requiredFields) {
    if (evidence[field] === undefined || evidence[field] === null || evidence[field] === "") {
      reasonCodes.push(`requirements.provenance.missing.${field}`);
    }
  }

  return {
    ok: reasonCodes.length === 0,
    reason_codes: reasonCodes,
    on_failure: onFailure,
  };
}

function shouldVerifyAttestation(requirements, actorContext) {
  if (requirements.attestation === "required") {
    return true;
  }
  if (requirements.attestation === "for_agents" && actorContext.kind === "agent") {
    return true;
  }
  return false;
}

function evaluateAgentEligibleLabels(policy, event, actorContext) {
  if (actorContext.kind !== "agent") {
    return { applies: false };
  }

  const config = policy.policies && policy.policies.agent_eligible_labels;
  if (!config) {
    return { applies: false };
  }

  const actions = Array.isArray(config.actions) && config.actions.length > 0
    ? config.actions
    : AGENT_ELIGIBLE_LABEL_DEFAULT_ACTIONS;

  if (!actions.includes(event.action)) {
    return { applies: false };
  }

  const labels = toArray(event.target && event.target.labels);
  const eligible = includesAny(labels, config.labels);

  if (eligible) {
    return { applies: true, ok: true };
  }

  return {
    applies: true,
    ok: false,
    decision: config.on_missing || "deny",
    reason_code: "policies.agent_eligible_labels.missing",
  };
}

function evaluatePolicy(policy, event, options = {}) {
  const reasonCodes = [];
  const actorContext = resolveActorContext(policy, event.actor || {});
  const nonceStore = options.nonceStore || createNonceStore();
  const attestationVerifier = typeof options.attestationVerifier === "function"
    ? options.attestationVerifier
    : verifyAttestation;

  const eligibleResult = evaluateAgentEligibleLabels(policy, event, actorContext);
  if (eligibleResult.applies && !eligibleResult.ok) {
    return {
      decision: eligibleResult.decision,
      actor: {
        id: actorContext.id,
        kind: actorContext.kind,
        profile_id: actorContext.profile ? actorContext.profile.id : null,
      },
      matched_rule_count: 0,
      selected_rule_id: null,
      reason_codes: [eligibleResult.reason_code],
    };
  }

  const ruleResolution = resolveRule(policy, event, actorContext);
  let decision = ruleResolution.selected ? ruleResolution.selected.outcome : policy.defaults.unmatched;

  if (ruleResolution.selected) {
    reasonCodes.push(`rule.selected.${ruleResolution.selected.id}`);
  } else {
    reasonCodes.push("defaults.unmatched");
  }

  if (ruleResolution.selected) {
    const requirements = resolveRequirements(policy, ruleResolution.selected);

    const provenanceResult = evaluateProvenance({ policy, requirements, event });
    if (!provenanceResult.ok) {
      reasonCodes.push(...provenanceResult.reason_codes);
      decision = maxDecision(decision, provenanceResult.on_failure);
    }

    if (shouldVerifyAttestation(requirements, actorContext)) {
      const attestationResult = attestationVerifier({
        policy,
        policyHash: options.policyHash,
        event,
        actorProfile: actorContext.profile,
        nonceStore,
        now: options.now,
      });

      if (!attestationResult.ok) {
        reasonCodes.push(...attestationResult.reason_codes);
        decision = maxDecision(decision, requirements.on_failure);
      }
    }
  }

  return {
    decision,
    actor: {
      id: actorContext.id,
      kind: actorContext.kind,
      profile_id: actorContext.profile ? actorContext.profile.id : null,
    },
    matched_rule_count: ruleResolution.matchedCount,
    selected_rule_id: ruleResolution.selected ? ruleResolution.selected.id : null,
    reason_codes: reasonCodes,
  };
}

module.exports = {
  evaluatePolicy,
  resolveActorContext,
  resolveRule,
};
