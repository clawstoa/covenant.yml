"use strict";

const { normalizeSimulationConfig } = require("./config");
const { generateTimelineEvents } = require("./generator");
const { replayPolicies } = require("./replay");
const { computeMetrics } = require("./metrics");
const { applyStoryChoice, buildStoryChoices } = require("./story");
const { exportMetricsCsv, exportRunJson } = require("./export");

function simulateRun(input = {}) {
  if (!Array.isArray(input.policies) || input.policies.length === 0) {
    throw new Error("simulateRun requires at least one policy");
  }

  const config = normalizeSimulationConfig(input);
  const generated = generateTimelineEvents(config);
  const replay = replayPolicies({
    policies: input.policies,
    generated_events: generated.events,
    attestation_mode: input.attestation_mode || "simulated",
  });
  const metrics = computeMetrics(replay);

  const lastLog = replay.logs[replay.logs.length - 1] || null;
  const story = [];
  if (lastLog) {
    for (const policyDecision of lastLog.decisions || []) {
      const choices = buildStoryChoices({
        event: lastLog.event,
        policy_decision: policyDecision,
      }).map((choice) => ({
        id: choice.id,
        label: choice.label,
        explanation: choice.explanation,
      }));
      story.push({
        policy_id: policyDecision.policy_id,
        event_id: lastLog.id,
        choices,
      });
    }
  }

  return {
    config,
    mapping: generated.mapping,
    policies: replay.policies,
    events: generated.events,
    logs: replay.logs,
    metrics,
    story,
  };
}

module.exports = {
  applyStoryChoice,
  buildStoryChoices,
  computeMetrics,
  exportMetricsCsv,
  exportRunJson,
  normalizeSimulationConfig,
  replayPolicies,
  simulateRun,
};

