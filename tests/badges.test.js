"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText } = require("../src/core/policy-loader");
const { generateBadges } = require("../src/core/badges");

test("badge generation reflects configured policies", () => {
  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  default_provenance_profile: strict
  provenance_profiles:
    strict:
      required_fields: [model, provider, prompt_record, test_proof]
rules:
  - id: agent-pr
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
    outcome: warn
  - id: block-human-thread-intervention
    actor: agent
    action: conversation.intervene_human_thread
    outcome: deny
`);

  const badges = generateBadges(policy, { verified: true });
  assert.equal(badges["covenant-enabled"].message, "enabled");
  assert.equal(badges["agent-pr-policy"].message, "warn");
  assert.equal(badges["provenance-policy"].message, "required");
  assert.equal(badges["attestation-required"].message, "required");
  assert.equal(badges["thread-intervention-policy"].message, "controlled");
});
