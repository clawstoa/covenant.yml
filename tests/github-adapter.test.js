"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText, computePolicyHash } = require("../src/core/policy-loader");
const { evaluateGitHubPayload } = require("../src/github/adapter");

const policy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
enforcement:
  deny:
    - type: close_pull_request
    - type: delete_branch
rules:
  - id: block-agent-pr-open
    actor: agent
    action: pull_request.open
    outcome: deny
routing:
  develop_bot_branch: develop-bot
  on_deny_pull_request_open: reroute
`);

const policyHash = computePolicyHash(policy);

test("pull_request opened payload maps to canonical action", () => {
  const payload = {
    action: "opened",
    sender: {
      login: "ci-bot[bot]",
      type: "Bot"
    },
    repository: {
      full_name: "acme/project",
      private: false
    },
    pull_request: {
      base: {
        ref: "main"
      },
      labels: [
        { name: "thread:human" }
      ]
    }
  };

  const result = evaluateGitHubPayload({
    policy,
    policyHash,
    eventName: "pull_request",
    payload,
  });

  assert.equal(result.supported, true);
  assert.equal(result.event.action, "pull_request.open");
  assert.equal(result.event.actor.id, "ci-bot[bot]");
  assert.equal(result.event.actor.kind, "agent");
  assert.equal(result.decision, "deny");

  // Verify routing produces reroute_to_branch with the correct target branch
  const rerouteAction = result.enforcement_actions.find((a) => a.type === "reroute_to_branch");
  assert.ok(rerouteAction, "reroute_to_branch enforcement action must be present");
  assert.equal(rerouteAction.branch, "develop-bot");

  // Verify close_pull_request is in the enforcement list (from enforcement.deny config)
  assert.ok(
    result.enforcement_actions.some((a) => a.type === "close_pull_request"),
    "close_pull_request enforcement action must be present"
  );

  // Verify GitHub plan contains matching steps
  assert.ok(result.github_plan.some((step) => step.type === "github.close_pull_request"));
  const reroutePlan = result.github_plan.find((step) => step.type === "github.reroute_pull_request");
  assert.ok(reroutePlan, "github.reroute_pull_request step must be in plan");
  assert.equal(reroutePlan.branch, "develop-bot");
});

test("unsupported event/action combination returns supported=false", () => {
  const result = evaluateGitHubPayload({
    policy,
    policyHash,
    eventName: "pull_request",
    payload: {
      action: "assigned",
      sender: {
        login: "alice",
        type: "User"
      },
      repository: {
        full_name: "acme/project",
        private: false
      },
      pull_request: {
        base: {
          ref: "main"
        }
      }
    },
  });

  assert.equal(result.supported, false);
  assert.equal(result.decision, "warn");
  assert.ok(result.reason_codes.includes("github.event.unsupported"));
});
