"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const { parseYaml } = require("../lib/simple-yaml");
const { stableStringify } = require("../lib/stable-json");
const { validatePolicyObject } = require("./validate-policy");

class PolicyValidationError extends Error {
  constructor(errors) {
    super(`Policy validation failed with ${errors.length} error(s)`);
    this.name = "PolicyValidationError";
    this.errors = errors;
  }
}

function parsePolicyText(text) {
  const policy = parseYaml(text);
  const validation = validatePolicyObject(policy);
  if (!validation.valid) {
    throw new PolicyValidationError(validation.errors);
  }
  return policy;
}

function computePolicyHash(policy) {
  const canonical = stableStringify(policy);
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function loadPolicy(policyPath = "covenant.yml") {
  const absolutePath = path.resolve(policyPath);
  const raw = fs.readFileSync(absolutePath, "utf8");
  const policy = parsePolicyText(raw);
  return {
    path: absolutePath,
    raw,
    policy,
    policy_hash: computePolicyHash(policy),
  };
}

module.exports = {
  PolicyValidationError,
  computePolicyHash,
  loadPolicy,
  parsePolicyText,
};
