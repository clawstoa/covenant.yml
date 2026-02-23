"use strict";

function cloneEvent(event) {
  return JSON.parse(JSON.stringify(event));
}

function buildBaseChoices() {
  return [
    {
      id: "switch_to_human",
      label: "Retry as human",
      explanation: "Replays the same action with a human actor to test actor-specific restrictions.",
      apply(event) {
        const next = cloneEvent(event);
        next.actor = { id: "alice", kind: "human" };
        next.attestation = null;
        return next;
      },
    },
    {
      id: "switch_branch_to_develop_bot",
      label: "Retarget to develop-bot",
      explanation: "Moves the target branch to develop-bot to explore routing and protected-branch policy impact.",
      apply(event) {
        const next = cloneEvent(event);
        next.target = {
          ...next.target,
          branch: "develop-bot",
        };
        return next;
      },
    },
  ];
}

function buildStoryChoices({ event, policy_decision }) {
  const decisions = [];
  const reasons = new Set(policy_decision && Array.isArray(policy_decision.reason_codes)
    ? policy_decision.reason_codes
    : []);

  if ([...reasons].some((code) => code.startsWith("requirements.provenance.missing."))) {
    decisions.push({
      id: "add_provenance",
      label: "Attach complete provenance",
      explanation: "Adds all standard evidence fields to satisfy strict provenance profiles.",
      apply(currentEvent) {
        const next = cloneEvent(currentEvent);
        next.evidence = {
          model: "gpt-5",
          provider: "openai",
          prompt_record: "prompt://story/retry",
          test_proof: "tests://story/retry",
        };
        return next;
      },
    });
  }

  if ([...reasons].some((code) => code.startsWith("attestation."))) {
    decisions.push({
      id: "refresh_attestation",
      label: "Refresh attestation",
      explanation: "Generates a fresh simulated attestation payload with matching fields and nonce.",
      apply(currentEvent) {
        const next = cloneEvent(currentEvent);
        next.attestation = {
          version: "covenant.attestation.v1",
          actor_id: next.actor.id,
          action: next.action,
          repository: (next.repository && next.repository.name) || "acme/project",
          ref: `refs/heads/${(next.target && next.target.branch) || "main"}`,
          policy_sha256: "__SIM_POLICY_HASH__",
          timestamp: new Date().toISOString(),
          nonce: `story-${Date.now()}`,
          signature: "simulated-signature",
        };
        return next;
      },
    });
  }

  if (reasons.has("policies.agent_eligible_labels.missing")) {
    decisions.push({
      id: "add_agent_eligible_label",
      label: "Add agent-friendly label",
      explanation: "Adds an eligible label so the agent-label gate no longer blocks issue actions.",
      apply(currentEvent) {
        const next = cloneEvent(currentEvent);
        const labels = Array.isArray(next.target && next.target.labels) ? next.target.labels.slice() : [];
        if (!labels.includes("agent-friendly")) {
          labels.push("agent-friendly");
        }
        next.target = {
          ...next.target,
          labels,
        };
        return next;
      },
    });
  }

  decisions.push(...buildBaseChoices());

  return decisions.slice(0, 4).map((choice) => ({
    id: choice.id,
    label: choice.label,
    explanation: choice.explanation,
    apply: choice.apply,
  }));
}

function applyStoryChoice({ event, choices, choice_id }) {
  const choice = (choices || []).find((candidate) => candidate.id === choice_id);
  if (!choice) {
    return cloneEvent(event);
  }
  return choice.apply(event);
}

module.exports = {
  applyStoryChoice,
  buildStoryChoices,
};

