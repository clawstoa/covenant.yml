"use strict";

function labelNames(labels) {
  if (!Array.isArray(labels)) {
    return [];
  }
  return labels.map((label) => {
    if (typeof label === "string") {
      return label;
    }
    if (label && typeof label.name === "string") {
      return label.name;
    }
    return "";
  }).filter(Boolean);
}

function detectThreadMode(labels) {
  if (labels.includes("thread:human")) {
    return "human";
  }
  if (labels.includes("thread:agent")) {
    return "agent";
  }
  return "mixed";
}

function mapAction(eventName, payload) {
  switch (eventName) {
    case "issues":
      if (payload.action === "opened") return "issue.open";
      if (payload.action === "closed") return "issue.solve";
      if (payload.action === "labeled" || payload.action === "unlabeled") return "issue.label";
      return null;
    case "issue_comment":
      if (payload.action === "created" || payload.action === "edited") return "issue.comment";
      return null;
    case "pull_request":
      if (payload.action === "opened") return "pull_request.open";
      if (["synchronize", "edited", "reopened"].includes(payload.action)) return "pull_request.update";
      if (payload.action === "closed" && payload.pull_request && payload.pull_request.merged) return "pull_request.merge";
      return null;
    case "pull_request_review":
      if (payload.action !== "submitted") return null;
      if (payload.review && payload.review.state === "approved") return "pull_request.review.approve";
      return "pull_request.review.submit";
    case "pull_request_review_comment":
      if (payload.action === "created") return "pull_request.review.submit";
      return null;
    case "discussion_comment": {
      if (payload.action !== "created") return null;
      const labels = labelNames(payload.discussion && payload.discussion.labels);
      const threadMode = detectThreadMode(labels);
      if (threadMode === "human") {
        return "conversation.intervene_human_thread";
      }
      return "conversation.intervene_agent_thread";
    }
    default:
      return null;
  }
}

function getBranch(payload) {
  if (payload.pull_request && payload.pull_request.base && payload.pull_request.base.ref) {
    return payload.pull_request.base.ref;
  }
  if (payload.ref && payload.ref.startsWith("refs/heads/")) {
    return payload.ref.slice("refs/heads/".length);
  }
  return null;
}

function getLabels(payload) {
  if (payload.pull_request && payload.pull_request.labels) {
    return labelNames(payload.pull_request.labels);
  }
  if (payload.issue && payload.issue.labels) {
    return labelNames(payload.issue.labels);
  }
  if (payload.discussion && payload.discussion.labels) {
    return labelNames(payload.discussion.labels);
  }
  return [];
}

function normalizeGitHubEvent({ eventName, payload }) {
  const action = mapAction(eventName, payload);
  if (!action) {
    return {
      supported: false,
      error: `Unsupported event/action combination: ${eventName}:${payload.action}`,
    };
  }

  const labels = getLabels(payload);
  return {
    supported: true,
    event: {
      action,
      actor: {
        id: payload.sender && payload.sender.login ? payload.sender.login : "unknown",
        kind: payload.sender && payload.sender.type === "Bot" ? "agent" : "human",
      },
      repository: {
        name: payload.repository && payload.repository.full_name ? payload.repository.full_name : "unknown/unknown",
        visibility: payload.repository && payload.repository.private ? "private" : "public",
      },
      target: {
        branch: getBranch(payload),
        labels,
        thread_mode: detectThreadMode(labels),
      },
      evidence: {
        model: payload.inputs && payload.inputs.model,
        provider: payload.inputs && payload.inputs.provider,
        prompt_record: payload.inputs && payload.inputs.prompt_record,
        test_proof: payload.inputs && payload.inputs.test_proof,
      },
      attestation: payload.inputs && payload.inputs.attestation,
      source: {
        event_name: eventName,
        event_action: payload.action,
      },
    },
  };
}

module.exports = {
  normalizeGitHubEvent,
};
