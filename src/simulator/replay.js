"use strict";

const { computePolicyHash } = require("../core/policy-loader");
const { evaluatePolicy } = require("../core/evaluator");
const { buildEnforcementActions } = require("../core/enforcement");
const { createSimulatedAttestationVerifier } = require("./attestation-sim");

function normalizePolicies(inputPolicies = []) {
  if (!Array.isArray(inputPolicies) || inputPolicies.length === 0) {
    throw new Error("at least one policy is required for replay");
  }

  return inputPolicies.map((entry, index) => {
    const rawPolicy = entry && entry.policy ? entry.policy : entry;
    if (!rawPolicy || typeof rawPolicy !== "object" || Array.isArray(rawPolicy)) {
      throw new Error(`policy at index ${index} is invalid`);
    }

    return {
      id: entry && entry.id ? String(entry.id) : `policy-${index + 1}`,
      policy: rawPolicy,
      policy_hash: entry && entry.policy_hash ? entry.policy_hash : computePolicyHash(rawPolicy),
      source: entry && entry.source ? entry.source : null,
    };
  });
}

function replayPolicies({ policies, generated_events, attestation_mode = "simulated" }) {
  const normalizedPolicies = normalizePolicies(policies);
  const verifierByPolicyId = new Map();

  for (const policyEntry of normalizedPolicies) {
    if (attestation_mode === "simulated") {
      verifierByPolicyId.set(
        policyEntry.id,
        createSimulatedAttestationVerifier()
      );
    } else {
      verifierByPolicyId.set(policyEntry.id, null);
    }
  }

  const logs = [];
  for (const timelineItem of generated_events || []) {
    const decisions = [];
    const now = Date.parse(timelineItem.timestamp);
    for (const policyEntry of normalizedPolicies) {
      const options = {
        policyHash: policyEntry.policy_hash,
        now: Number.isFinite(now) ? now : Date.now(),
      };
      const verifier = verifierByPolicyId.get(policyEntry.id);
      if (typeof verifier === "function") {
        options.attestationVerifier = verifier;
      }
      const evaluation = evaluatePolicy(policyEntry.policy, timelineItem.event, options);
      const enforcement = buildEnforcementActions(policyEntry.policy, evaluation, timelineItem.event);

      decisions.push({
        policy_id: policyEntry.id,
        decision: evaluation.decision,
        selected_rule_id: evaluation.selected_rule_id,
        matched_rule_count: evaluation.matched_rule_count,
        reason_codes: evaluation.reason_codes,
        enforcement_actions: enforcement,
      });
    }

    logs.push({
      id: timelineItem.id,
      index: timelineItem.index,
      timestamp: timelineItem.timestamp,
      simulator_type: timelineItem.simulator_type,
      canonical_action: timelineItem.canonical_action,
      faults_applied: timelineItem.faults_applied,
      event: timelineItem.event,
      decisions,
    });
  }

  return {
    policies: normalizedPolicies.map((policyEntry) => ({
      id: policyEntry.id,
      policy_hash: policyEntry.policy_hash,
      source: policyEntry.source,
    })),
    logs,
  };
}

module.exports = {
  replayPolicies,
};

