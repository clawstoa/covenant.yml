"use strict";

function templateMessage(message, context) {
  if (typeof message !== "string") {
    return "";
  }
  return message
    .replaceAll("${decision}", context.decision || "")
    .replaceAll("${action}", context.event && context.event.action ? context.event.action : "")
    .replaceAll("${actor}", context.event && context.event.actor && context.event.actor.id ? context.event.actor.id : "")
    .replaceAll("${reason_codes}", Array.isArray(context.reason_codes) ? context.reason_codes.join(",") : "");
}

function buildEnforcementActions(policy, evaluation, event) {
  const planned = [];
  const actions = policy.enforcement && Array.isArray(policy.enforcement[evaluation.decision])
    ? policy.enforcement[evaluation.decision]
    : [];

  for (const action of actions) {
    const base = {
      type: action.type,
    };

    if (action.type === "comment") {
      base.message = templateMessage(action.message, {
        decision: evaluation.decision,
        event,
        reason_codes: evaluation.reason_codes,
      });
      base.target = "issue_or_pull_request";
    }

    if (action.type === "label") {
      base.labels = Array.isArray(action.labels) ? action.labels.slice() : [];
    }

    if (action.type === "fail_status") {
      base.context = action.context;
      base.description = templateMessage(action.description || "Covenant policy decision: ${decision}", {
        decision: evaluation.decision,
        event,
        reason_codes: evaluation.reason_codes,
      });
    }

    if (action.type === "reroute_to_branch") {
      base.branch = action.branch;
    }

    planned.push(base);
  }

  if (
    evaluation.decision === "deny"
    && event.action === "pull_request.open"
    && policy.routing
    && policy.routing.on_deny_pull_request_open === "reroute"
    && policy.routing.develop_bot_branch
  ) {
    planned.push({
      type: "reroute_to_branch",
      branch: policy.routing.develop_bot_branch,
    });
  }

  return planned;
}

function toGitHubPlan(event, enforcementActions) {
  return enforcementActions.map((action) => {
    switch (action.type) {
      case "comment":
        return {
          type: "github.comment",
          body: action.message,
          target: action.target,
        };
      case "label":
        return {
          type: "github.add_labels",
          labels: action.labels,
        };
      case "close_pull_request":
        return {
          type: "github.close_pull_request",
        };
      case "delete_branch":
        return {
          type: "github.delete_branch",
          branch: event.target && event.target.branch ? event.target.branch : null,
        };
      case "reroute_to_branch":
        return {
          type: "github.reroute_pull_request",
          branch: action.branch,
        };
      case "fail_status":
        return {
          type: "github.fail_status",
          context: action.context,
          description: action.description,
        };
      default:
        return {
          type: "github.unknown",
          raw: action,
        };
    }
  });
}

module.exports = {
  buildEnforcementActions,
  toGitHubPlan,
};
