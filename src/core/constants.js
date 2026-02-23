"use strict";

const DECISIONS = ["allow", "warn", "deny"];

const OUTCOME_SEVERITY = {
  allow: 0,
  warn: 1,
  deny: 2,
};

const ACTOR_KINDS = ["human", "agent", "manager"];

const THREAD_MODES = ["human", "agent", "mixed"];

const ACTIONS = [
  "issue.open",
  "issue.comment",
  "issue.label",
  "issue.solve",
  "pull_request.open",
  "pull_request.update",
  "pull_request.review.submit",
  "pull_request.review.approve",
  "pull_request.merge",
  "conversation.intervene_human_thread",
  "conversation.intervene_agent_thread",
  "maintenance.cleanup",
  "routing.to_develop_bot",
];

const EVIDENCE_FIELDS = ["model", "provider", "prompt_record", "test_proof"];

const AGENT_ELIGIBLE_LABEL_DEFAULT_ACTIONS = [
  "issue.open",
  "issue.comment",
  "issue.label",
  "issue.solve",
];

const ENFORCEMENT_TYPES = [
  "comment",
  "label",
  "close_pull_request",
  "delete_branch",
  "reroute_to_branch",
  "fail_status",
];

module.exports = {
  ACTIONS,
  ACTOR_KINDS,
  AGENT_ELIGIBLE_LABEL_DEFAULT_ACTIONS,
  DECISIONS,
  ENFORCEMENT_TYPES,
  EVIDENCE_FIELDS,
  OUTCOME_SEVERITY,
  THREAD_MODES,
};
