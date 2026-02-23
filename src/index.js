"use strict";

const { loadPolicy, parsePolicyText, computePolicyHash, PolicyValidationError } = require("./core/policy-loader");
const { validatePolicyObject } = require("./core/validate-policy");
const { evaluatePolicy } = require("./core/evaluator");
const { buildEnforcementActions } = require("./core/enforcement");
const { evaluateGitHubPayload } = require("./github/adapter");
const { generateBadges, toShieldsEndpoint } = require("./core/badges");
const {
  applyStoryChoice,
  buildStoryChoices,
  computeMetrics,
  exportMetricsCsv,
  exportRunJson,
  replayPolicies,
  simulateRun,
} = require("./simulator");

module.exports = {
  buildEnforcementActions,
  PolicyValidationError,
  computePolicyHash,
  evaluateGitHubPayload,
  evaluatePolicy,
  applyStoryChoice,
  buildStoryChoices,
  computeMetrics,
  exportMetricsCsv,
  exportRunJson,
  generateBadges,
  loadPolicy,
  parsePolicyText,
  replayPolicies,
  simulateRun,
  toShieldsEndpoint,
  validatePolicyObject,
};
