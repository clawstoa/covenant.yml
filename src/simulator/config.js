"use strict";

const { PROFILE_ACTOR_WEIGHTS, PROFILE_EVENT_WEIGHTS } = require("./catalog");

const DEFAULT_CONFIG = {
  count: 500,
  seed: 1337,
  hours: 72,
  profile: "balanced",
  start_time: null,
  fault_rates: {
    missing_evidence: 0.1,
    missing_attestation: 0.08,
    invalid_attestation: 0.04,
    ineligible_label: 0.12,
    thread_mode_mismatch: 0.08,
  },
};

function clampInteger(value, fallback, min, max) {
  if (!Number.isFinite(Number(value))) {
    return fallback;
  }
  const rounded = Math.round(Number(value));
  return Math.max(min, Math.min(max, rounded));
}

function clampProbability(value, fallback) {
  if (!Number.isFinite(Number(value))) {
    return fallback;
  }
  const numeric = Number(value);
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 1) {
    return 1;
  }
  return numeric;
}

function normalizeWeights(input, fallback) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : fallback;
  const out = {};
  let sum = 0;
  for (const [key, weight] of Object.entries(source)) {
    const numeric = Number(weight);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }
    out[key] = numeric;
    sum += numeric;
  }
  if (sum <= 0) {
    return { ...fallback };
  }
  for (const key of Object.keys(out)) {
    out[key] = out[key] / sum;
  }
  return out;
}

function normalizeSimulationConfig(input = {}) {
  const profile = typeof input.profile === "string" && PROFILE_EVENT_WEIGHTS[input.profile]
    ? input.profile
    : DEFAULT_CONFIG.profile;

  const faultSource = input.fault_rates && typeof input.fault_rates === "object"
    ? input.fault_rates
    : {};

  const faultRates = {};
  for (const [name, fallback] of Object.entries(DEFAULT_CONFIG.fault_rates)) {
    faultRates[name] = clampProbability(faultSource[name], fallback);
  }

  return {
    count: clampInteger(input.count, DEFAULT_CONFIG.count, 1, 10000),
    seed: input.seed !== undefined ? String(input.seed) : String(DEFAULT_CONFIG.seed),
    hours: clampInteger(input.hours, DEFAULT_CONFIG.hours, 1, 24 * 365),
    start_time: typeof input.start_time === "string" ? input.start_time : DEFAULT_CONFIG.start_time,
    profile,
    event_weights: normalizeWeights(input.event_weights, PROFILE_EVENT_WEIGHTS[profile]),
    actor_weights: normalizeWeights(input.actor_weights, PROFILE_ACTOR_WEIGHTS[profile]),
    fault_rates: faultRates,
    mapping_overrides:
      input.mapping_overrides && typeof input.mapping_overrides === "object" && !Array.isArray(input.mapping_overrides)
        ? { ...input.mapping_overrides }
        : {},
  };
}

module.exports = {
  DEFAULT_CONFIG,
  normalizeSimulationConfig,
};

