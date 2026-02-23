"use strict";

const SIM_EVENT_CATALOG = {
  code_evolution: {
    label: "Code Evolution",
    default_action: "pull_request.update",
    default_labels: ["code-change", "thread:agent"],
  },
  branch_operation: {
    label: "Branch Operation",
    default_action: "pull_request.open",
    default_labels: ["branch-op", "thread:agent"],
  },
  issue_bug: {
    label: "Issue: Bug",
    default_action: "issue.open",
    default_labels: ["bug", "agent-friendly", "thread:human"],
  },
  issue_feature_request: {
    label: "Issue: Feature Request",
    default_action: "issue.open",
    default_labels: ["feature-request", "thread:human"],
  },
  discussion: {
    label: "Discussion",
    default_action: "conversation.intervene_human_thread",
    default_labels: ["thread:human"],
  },
  error_regression: {
    label: "Error Regression",
    default_action: "issue.comment",
    default_labels: ["regression", "thread:human"],
  },
  release: {
    label: "Release",
    default_action: "pull_request.merge",
    default_labels: ["release", "thread:agent"],
  },
  maintenance: {
    label: "Maintenance",
    default_action: "maintenance.cleanup",
    default_labels: ["maintenance", "thread:agent"],
  },
};

const SIM_EVENT_TYPES = Object.keys(SIM_EVENT_CATALOG);

const PROFILE_EVENT_WEIGHTS = {
  balanced: {
    code_evolution: 0.2,
    branch_operation: 0.1,
    issue_bug: 0.14,
    issue_feature_request: 0.12,
    discussion: 0.1,
    error_regression: 0.11,
    release: 0.11,
    maintenance: 0.12,
  },
  churn: {
    code_evolution: 0.26,
    branch_operation: 0.2,
    issue_bug: 0.08,
    issue_feature_request: 0.06,
    discussion: 0.05,
    error_regression: 0.19,
    release: 0.1,
    maintenance: 0.06,
  },
  "strict-stress": {
    code_evolution: 0.17,
    branch_operation: 0.16,
    issue_bug: 0.17,
    issue_feature_request: 0.13,
    discussion: 0.08,
    error_regression: 0.14,
    release: 0.07,
    maintenance: 0.08,
  },
};

const PROFILE_ACTOR_WEIGHTS = {
  balanced: {
    human: 0.45,
    agent: 0.45,
    manager: 0.1,
  },
  churn: {
    human: 0.28,
    agent: 0.64,
    manager: 0.08,
  },
  "strict-stress": {
    human: 0.2,
    agent: 0.75,
    manager: 0.05,
  },
};

const ACTOR_ID_POOL = {
  human: ["alice", "bob", "carol", "drew"],
  agent: ["ci-bot[bot]", "review-bot[bot]", "ops-bot[bot]"],
  manager: ["stoa-manager[bot]", "governance-bot[bot]"],
};

const TARGET_BRANCHES = ["main", "develop", "develop-bot", "release", "feature-x"];
const REPOSITORY_VISIBILITIES = ["public", "private"];

module.exports = {
  ACTOR_ID_POOL,
  PROFILE_ACTOR_WEIGHTS,
  PROFILE_EVENT_WEIGHTS,
  REPOSITORY_VISIBILITIES,
  SIM_EVENT_CATALOG,
  SIM_EVENT_TYPES,
  TARGET_BRANCHES,
};

