"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText, computePolicyHash } = require("../src/core/policy-loader");
const { evaluatePolicy } = require("../src/core/evaluator");

const POLICY_TEXT = `
spec_version: 1.0.0
defaults:
  unmatched: warn
requirements:
  on_failure: deny
  default_provenance_profile: strict
  provenance_profiles:
    strict:
      required_fields: [model, provider, prompt_record, test_proof]
rules:
  - id: broad-agent-pr
    actor: agent
    action: pull_request.*
    outcome: allow
  - id: strict-agent-pr-main
    actor: agent
    action: pull_request.open
    target:
      branch: main
    requirements:
      provenance_profile: strict
      on_failure: deny
    outcome: warn
  - id: deny-any-pr-main
    actor: any
    action: pull_request.open
    target:
      branch: main
    outcome: deny
`;

const policy = parsePolicyText(POLICY_TEXT);
const policyHash = computePolicyHash(policy);

test("specific rule beats broad wildcard rule", () => {
  const result = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "bot-1", kind: "agent" },
      target: { branch: "main" },
      evidence: {
        model: "gpt-5",
        provider: "openai",
        prompt_record: "prompt://123",
        test_proof: "tests://ok"
      }
    },
    { policyHash }
  );

  assert.equal(result.selected_rule_id, "strict-agent-pr-main");
  assert.equal(result.decision, "warn");
});

test("tie on specificity resolves by outcome strictness", () => {
  const tiePolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
rules:
  - id: allow-main
    actor: any
    action: pull_request.open
    target:
      branch: main
    outcome: allow
  - id: deny-main
    actor: any
    action: pull_request.open
    target:
      branch: main
    outcome: deny
`);

  const result = evaluatePolicy(
    tiePolicy,
    {
      action: "pull_request.open",
      actor: { id: "alice", kind: "human" },
      target: { branch: "main" }
    },
    { policyHash: computePolicyHash(tiePolicy) }
  );

  assert.equal(result.selected_rule_id, "deny-main");
  assert.equal(result.decision, "deny");
});

test("unmatched action returns warn by default", () => {
  const result = evaluatePolicy(
    policy,
    {
      action: "issue.comment",
      actor: { id: "alice", kind: "human" },
      target: {}
    },
    { policyHash }
  );

  assert.equal(result.selected_rule_id, null);
  assert.equal(result.decision, "warn");
  assert.ok(result.reason_codes.includes("defaults.unmatched"));
});

test("missing strict provenance fields escalates to deny", () => {
  const result = evaluatePolicy(
    policy,
    {
      action: "pull_request.open",
      actor: { id: "bot-1", kind: "agent" },
      target: { branch: "main" },
      evidence: {
        model: "gpt-5",
        provider: "openai"
      }
    },
    { policyHash }
  );

  assert.equal(result.selected_rule_id, "strict-agent-pr-main");
  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("requirements.provenance.missing.prompt_record"));
  assert.ok(result.reason_codes.includes("requirements.provenance.missing.test_proof"));
});

// --- Agent-eligible-labels gate tests ---

const ELIGIBLE_LABELS_POLICY_TEXT = `
spec_version: 1.0.0
defaults:
  unmatched: allow
policies:
  agent_eligible_labels:
    labels: [agent-friendly, good-first-bot-issue]
    on_missing: deny
rules:
  - id: agent-issue-allow
    actor: agent
    action: issue.*
    outcome: allow
  - id: human-all
    actor: human
    action: '*'
    outcome: allow
`;

const eligibleLabelsPolicy = parsePolicyText(ELIGIBLE_LABELS_POLICY_TEXT);

test("agent denied on issue without eligible label", () => {
  const result = evaluatePolicy(
    eligibleLabelsPolicy,
    {
      action: "issue.solve",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: [] }
    }
  );

  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("policies.agent_eligible_labels.missing"));
  assert.equal(result.selected_rule_id, null);
});

test("agent allowed on issue with eligible label", () => {
  const result = evaluatePolicy(
    eligibleLabelsPolicy,
    {
      action: "issue.solve",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: ["agent-friendly"] }
    }
  );

  assert.equal(result.decision, "allow");
  assert.equal(result.selected_rule_id, "agent-issue-allow");
});

test("human not affected by agent-eligible-labels gate", () => {
  const result = evaluatePolicy(
    eligibleLabelsPolicy,
    {
      action: "issue.solve",
      actor: { id: "alice", kind: "human" },
      target: { labels: [] }
    }
  );

  assert.equal(result.decision, "allow");
  assert.equal(result.selected_rule_id, "human-all");
});

test("agent on out-of-scope action not affected by eligible labels", () => {
  const result = evaluatePolicy(
    eligibleLabelsPolicy,
    {
      action: "pull_request.open",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: [] }
    }
  );

  assert.notEqual(result.decision, "deny");
  assert.ok(!result.reason_codes.includes("policies.agent_eligible_labels.missing"));
});

test("custom actions scope restricts eligible labels gate", () => {
  const customActionsPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
policies:
  agent_eligible_labels:
    labels: [agent-friendly]
    actions: [issue.solve]
    on_missing: deny
rules:
  - id: agent-all
    actor: agent
    action: '*'
    outcome: allow
`);

  const commentResult = evaluatePolicy(
    customActionsPolicy,
    {
      action: "issue.comment",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: [] }
    }
  );
  assert.equal(commentResult.decision, "allow");

  const solveResult = evaluatePolicy(
    customActionsPolicy,
    {
      action: "issue.solve",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: [] }
    }
  );
  assert.equal(solveResult.decision, "deny");
  assert.ok(solveResult.reason_codes.includes("policies.agent_eligible_labels.missing"));
});

test("custom on_missing warn returns warn instead of deny", () => {
  const warnPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
policies:
  agent_eligible_labels:
    labels: [agent-friendly]
    on_missing: warn
rules:
  - id: agent-all
    actor: agent
    action: '*'
    outcome: allow
`);

  const result = evaluatePolicy(
    warnPolicy,
    {
      action: "issue.solve",
      actor: { id: "bot-1", kind: "agent" },
      target: { labels: [] }
    }
  );

  assert.equal(result.decision, "warn");
  assert.ok(result.reason_codes.includes("policies.agent_eligible_labels.missing"));
});

test("fully tied rules resolve by rule id lexicographic order", () => {
  const tiedPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
rules:
  - id: z-rule
    actor: agent
    action: pull_request.open
    target:
      branch: main
    outcome: warn
  - id: a-rule
    actor: agent
    action: pull_request.open
    target:
      branch: main
    outcome: warn
`);

  const result = evaluatePolicy(
    tiedPolicy,
    {
      action: "pull_request.open",
      actor: { id: "bot", kind: "agent" },
      target: { branch: "main" }
    }
  );

  assert.equal(result.selected_rule_id, "a-rule");
  assert.equal(result.decision, "warn");
});

test("multi-target conditions each contribute to specificity score", () => {
  const multiTargetPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
rules:
  - id: branch-only
    actor: agent
    action: pull_request.open
    target:
      branch: main
    outcome: warn
  - id: branch-and-thread
    actor: agent
    action: pull_request.open
    target:
      branch: main
      thread_mode: agent
    outcome: allow
`);

  // Event matches both rules on branch, but only branch-and-thread on thread_mode
  const result = evaluatePolicy(
    multiTargetPolicy,
    {
      action: "pull_request.open",
      actor: { id: "bot", kind: "agent" },
      target: { branch: "main", thread_mode: "agent" }
    }
  );

  assert.equal(result.selected_rule_id, "branch-and-thread");
});

test("rule-level requirements.on_failure overrides global requirements.on_failure", () => {
  // Profile has no on_failure; rule-level deny should override global warn.
  const overridePolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
requirements:
  on_failure: warn
  provenance_profiles:
    strict:
      required_fields: [model, provider]
rules:
  - id: strict-rule
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: strict
      on_failure: deny
    outcome: allow
`);

  const result = evaluatePolicy(
    overridePolicy,
    {
      action: "pull_request.open",
      actor: { id: "bot", kind: "agent" },
      target: {},
      evidence: { model: "gpt-5" }
    }
  );

  assert.equal(result.selected_rule_id, "strict-rule");
  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("requirements.provenance.missing.provider"));
});

test("profile-level on_failure takes precedence over rule-level on_failure", () => {
  // When the profile itself declares on_failure, it controls provenance failure escalation.
  const profileWinsPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: allow
requirements:
  on_failure: allow
  provenance_profiles:
    strict:
      required_fields: [model, provider]
      on_failure: deny
rules:
  - id: strict-rule
    actor: agent
    action: pull_request.open
    requirements:
      provenance_profile: strict
      on_failure: warn
    outcome: allow
`);

  const result = evaluatePolicy(
    profileWinsPolicy,
    {
      action: "pull_request.open",
      actor: { id: "bot", kind: "agent" },
      target: {},
      evidence: { model: "gpt-5" }
    }
  );

  assert.equal(result.selected_rule_id, "strict-rule");
  assert.equal(result.decision, "deny");
  assert.ok(result.reason_codes.includes("requirements.provenance.missing.provider"));
});

test("event-envelope kind manager is not trusted — actor falls back to human", () => {
  const privilegedPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: deny
rules:
  - id: manager-allow
    actor: manager
    action: '*'
    outcome: allow
  - id: human-deny
    actor: human
    action: pull_request.open
    outcome: deny
`);

  const result = evaluatePolicy(
    privilegedPolicy,
    {
      action: "pull_request.open",
      actor: { id: "attacker", kind: "manager" },
      target: {}
    }
  );

  // "attacker" is not in any manager profile, so kind: manager from event is ignored
  // Should be treated as human → deny, not manager → allow
  assert.notEqual(result.decision, "allow");
  assert.equal(result.actor.kind, "human");
});

test("attestation verifier hook can override default verifier", () => {
  const hookPolicy = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: deny
actors:
  agents:
    - id: ci-bot
      match:
        usernames: [ci-bot[bot]]
rules:
  - id: require-attestation-hook
    actor: agent
    action: pull_request.open
    requirements:
      attestation: required
      on_failure: deny
    outcome: allow
`);

  let called = false;
  const result = evaluatePolicy(
    hookPolicy,
    {
      action: "pull_request.open",
      actor: { id: "ci-bot[bot]", kind: "agent" },
      target: { branch: "main" },
    },
    {
      policyHash: computePolicyHash(hookPolicy),
      attestationVerifier() {
        called = true;
        return { ok: true, reason_codes: [] };
      },
    }
  );

  assert.equal(called, true);
  assert.equal(result.decision, "allow");
  assert.equal(result.selected_rule_id, "require-attestation-hook");
});
