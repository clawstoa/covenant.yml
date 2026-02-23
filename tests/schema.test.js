"use strict";

const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText, PolicyValidationError } = require("../src/core/policy-loader");

function fixturePath(...segments) {
  return path.join(__dirname, "fixtures", ...segments);
}

test("valid minimal fixture passes", () => {
  const raw = fs.readFileSync(fixturePath("valid", "minimal.yml"), "utf8");
  const policy = parsePolicyText(raw);
  assert.equal(policy.spec_version, "1.0.0");
});

test("unknown top-level key fails", () => {
  const raw = fs.readFileSync(fixturePath("invalid", "unknown-top-level.yml"), "utf8");
  assert.throws(() => parsePolicyText(raw), PolicyValidationError);
});

test("invalid action fails", () => {
  const raw = fs.readFileSync(fixturePath("invalid", "invalid-action.yml"), "utf8");
  assert.throws(() => parsePolicyText(raw), PolicyValidationError);
});

test("valid policy with agent_eligible_labels passes", () => {
  const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
policies:
  agent_eligible_labels:
    labels: [agent-friendly, good-first-bot-issue]
    actions: [issue.solve, issue.comment]
    on_missing: deny
rules:
  - id: default-allow
    actor: any
    action: '*'
    outcome: allow
`);
  assert.equal(policy.spec_version, "1.0.0");
  assert.deepEqual(policy.policies.agent_eligible_labels.labels, ["agent-friendly", "good-first-bot-issue"]);
});

test("invalid key in agent_eligible_labels fails", () => {
  assert.throws(() => parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
policies:
  agent_eligible_labels:
    labels: [agent-friendly]
    unknown_key: true
rules:
  - id: default-allow
    actor: any
    action: '*'
    outcome: allow
`), PolicyValidationError);
});
