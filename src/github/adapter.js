"use strict";

const { evaluatePolicy } = require("../core/evaluator");
const { buildEnforcementActions, toGitHubPlan } = require("../core/enforcement");
const { normalizeGitHubEvent } = require("./normalize");

function evaluateGitHubPayload({ policy, policyHash, eventName, payload, nonceStore, now }) {
  const normalized = normalizeGitHubEvent({ eventName, payload });
  if (!normalized.supported) {
    return {
      supported: false,
      decision: "warn",
      reason_codes: ["github.event.unsupported"],
      error: normalized.error,
      enforcement_actions: [],
      github_plan: [],
    };
  }

  const evaluation = evaluatePolicy(policy, normalized.event, {
    policyHash,
    nonceStore,
    now,
  });

  const enforcementActions = buildEnforcementActions(policy, evaluation, normalized.event);

  return {
    supported: true,
    event: normalized.event,
    ...evaluation,
    enforcement_actions: enforcementActions,
    github_plan: toGitHubPlan(normalized.event, enforcementActions),
  };
}

module.exports = {
  evaluateGitHubPayload,
};
