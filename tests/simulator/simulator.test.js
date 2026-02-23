"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parsePolicyText } = require("../../src/core/policy-loader");
const {
  buildStoryChoices,
  exportMetricsCsv,
  replayPolicies,
  simulateRun,
} = require("../../src/simulator");
const { generateTimelineEvents } = require("../../src/simulator/generator");
const { validateMapping } = require("../../src/simulator/mapping");

const SIMPLE_POLICY = parsePolicyText(`
spec_version: 1.0.0
defaults:
  unmatched: warn
policies:
  agent_eligible_labels:
    labels: [agent-friendly]
    on_missing: deny
rules:
  - id: any-issues
    actor: any
    action: issue.*
    outcome: allow
  - id: any-prs
    actor: any
    action: pull_request.*
    outcome: warn
  - id: any-conversation
    actor: any
    action: conversation.*
    outcome: warn
  - id: any-maintenance
    actor: any
    action: maintenance.*
    outcome: deny
  - id: routing
    actor: any
    action: routing.*
    outcome: allow
`);

test("mapping validator rejects unknown canonical action", () => {
  const validation = validateMapping({
    issue_bug: "not.valid.action",
  });
  assert.equal(validation.valid, false);
  assert.ok(validation.errors.some((entry) => entry.includes("unsupported canonical action")));
});

test("timeline generation is deterministic for same seed and start_time", () => {
  const one = generateTimelineEvents({
    count: 25,
    seed: "12345",
    hours: 10,
    start_time: "2026-02-21T00:00:00.000Z",
    profile: "balanced",
  });
  const two = generateTimelineEvents({
    count: 25,
    seed: "12345",
    hours: 10,
    start_time: "2026-02-21T00:00:00.000Z",
    profile: "balanced",
  });

  assert.deepEqual(
    one.events.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.canonical_action,
      actor: entry.event.actor,
      labels: entry.event.target.labels,
    })),
    two.events.map((entry) => ({
      id: entry.id,
      timestamp: entry.timestamp,
      action: entry.canonical_action,
      actor: entry.event.actor,
      labels: entry.event.target.labels,
    }))
  );
});

test("simulateRun returns logs, metrics and CSV export", () => {
  const result = simulateRun({
    policies: [{ id: "simple", policy: SIMPLE_POLICY }],
    count: 75,
    seed: "sim-run",
    hours: 24,
    start_time: "2026-02-20T00:00:00.000Z",
    profile: "strict-stress",
  });

  assert.equal(result.events.length, 75);
  assert.equal(result.logs.length, 75);
  assert.equal(result.metrics.by_policy.simple.total_events, 75);

  const totals = result.metrics.by_policy.simple.totals;
  assert.equal(totals.allow + totals.warn + totals.deny, 75);

  const csv = exportMetricsCsv(result.metrics);
  assert.ok(csv.includes("policy_id,total_events,allow,warn,deny"));
  assert.ok(csv.includes("simple,75"));
});

test("story choices include remediation for label-gate denials", () => {
  const generated = generateTimelineEvents({
    count: 1,
    seed: "story-seed",
    hours: 1,
    start_time: "2026-02-21T00:00:00.000Z",
    mapping_overrides: {
      issue_bug: "issue.solve",
    },
    event_weights: {
      issue_bug: 1,
    },
    actor_weights: {
      agent: 1,
    },
    fault_rates: {
      missing_evidence: 0,
      missing_attestation: 0,
      invalid_attestation: 0,
      ineligible_label: 1,
      thread_mode_mismatch: 0,
    },
  });

  const replay = replayPolicies({
    policies: [{ id: "simple", policy: SIMPLE_POLICY }],
    generated_events: generated.events,
  });
  const onlyDecision = replay.logs[0].decisions[0];
  assert.equal(onlyDecision.decision, "deny");
  assert.ok(onlyDecision.reason_codes.includes("policies.agent_eligible_labels.missing"));

  const choices = buildStoryChoices({
    event: replay.logs[0].event,
    policy_decision: onlyDecision,
  });

  assert.ok(choices.some((choice) => choice.id === "add_agent_eligible_label"));
});

