"use strict";

const { normalizeSimulationConfig } = require("./config");
const { mergeMapping, validateMapping } = require("./mapping");
const { createRng } = require("./rng");
const {
  ACTOR_ID_POOL,
  REPOSITORY_VISIBILITIES,
  SIM_EVENT_CATALOG,
  TARGET_BRANCHES,
} = require("./catalog");

function detectThreadMode(labels) {
  if (labels.includes("thread:human")) {
    return "human";
  }
  if (labels.includes("thread:agent")) {
    return "agent";
  }
  return "mixed";
}

function pickActor(rng, actorWeights) {
  const kind = rng.weighted(actorWeights) || "human";
  const actorId = rng.pick(ACTOR_ID_POOL[kind]) || `${kind}-1`;
  return {
    id: actorId,
    kind,
  };
}

function buildBaseLabels(simType) {
  const entry = SIM_EVENT_CATALOG[simType];
  return entry && Array.isArray(entry.default_labels) ? entry.default_labels.slice() : [];
}

function buildBaseEvidence(eventId) {
  return {
    model: "gpt-5",
    provider: "openai",
    prompt_record: `prompt://sim/${eventId}`,
    test_proof: `tests://sim/${eventId}`,
  };
}

function buildBaseAttestation({ actor, action, timestamp, eventId, branch }) {
  if (actor.kind !== "agent") {
    return null;
  }
  return {
    version: "covenant.attestation.v1",
    actor_id: actor.id,
    action,
    repository: "acme/project",
    ref: `refs/heads/${branch}`,
    policy_sha256: "__SIM_POLICY_HASH__",
    timestamp,
    nonce: `sim-${eventId}`,
    signature: "simulated-signature",
  };
}

function removeRandomEvidenceField(evidence, rng) {
  const keys = Object.keys(evidence);
  if (keys.length === 0) {
    return null;
  }
  const key = rng.pick(keys);
  if (!key) {
    return null;
  }
  delete evidence[key];
  return key;
}

function ensureNoEligibleLabels(labels) {
  return labels.filter((label) => !["agent-friendly", "good-first-bot-issue"].includes(label));
}

function applyFaults({ event, rng, faultRates }) {
  const faults = [];

  if (rng.bool(faultRates.missing_evidence)) {
    const removed = removeRandomEvidenceField(event.evidence, rng);
    if (removed) {
      faults.push(`missing_evidence:${removed}`);
    }
  }

  if (event.actor.kind === "agent" && event.action.startsWith("issue.") && rng.bool(faultRates.ineligible_label)) {
    event.target.labels = ensureNoEligibleLabels(event.target.labels);
    faults.push("ineligible_label");
  }

  if (event.action.startsWith("conversation.") && rng.bool(faultRates.thread_mode_mismatch)) {
    const original = event.target.thread_mode;
    event.target.thread_mode = original === "human" ? "agent" : "human";
    faults.push("thread_mode_mismatch");
  }

  if (event.actor.kind === "agent" && rng.bool(faultRates.missing_attestation)) {
    event.attestation = null;
    faults.push("missing_attestation");
  } else if (event.actor.kind === "agent" && rng.bool(faultRates.invalid_attestation)) {
    if (!event.attestation) {
      event.attestation = {};
    }
    event.attestation.version = "invalid.attestation";
    event.attestation.signature = "invalid";
    event.attestation.policy_sha256 = "mismatch";
    faults.push("invalid_attestation");
  }

  return faults;
}

function generateTimelineEvents(inputConfig = {}) {
  const config = normalizeSimulationConfig(inputConfig);
  const mapping = mergeMapping(config.mapping_overrides);
  const mappingValidation = validateMapping(mapping);
  if (!mappingValidation.valid) {
    throw new Error(`Invalid mapping: ${mappingValidation.errors.join(", ")}`);
  }

  const rng = createRng(config.seed);
  const startMillis = config.start_time ? Date.parse(config.start_time) : Date.now();
  const safeStartMillis = Number.isFinite(startMillis) ? startMillis : Date.now();
  const stepMillis = Math.max(1000, Math.round((config.hours * 3600 * 1000) / Math.max(config.count, 1)));

  const events = [];
  for (let index = 0; index < config.count; index += 1) {
    const simType = rng.weighted(config.event_weights) || "code_evolution";
    const action = mapping[simType] || "issue.comment";
    const actor = pickActor(rng, config.actor_weights);
    const branch = rng.pick(TARGET_BRANCHES) || "main";
    const labels = buildBaseLabels(simType);
    const timestamp = new Date(safeStartMillis + (index * stepMillis)).toISOString();

    const target = {
      branch,
      labels,
      thread_mode: detectThreadMode(labels),
    };

    const eventId = String(index + 1).padStart(6, "0");
    const event = {
      action,
      actor,
      repository: {
        name: "acme/project",
        visibility: rng.pick(REPOSITORY_VISIBILITIES) || "public",
      },
      target,
      evidence: buildBaseEvidence(eventId),
      attestation: buildBaseAttestation({
        actor,
        action,
        timestamp,
        eventId,
        branch,
      }),
      source: {
        simulator_type: simType,
      },
    };

    const faults = applyFaults({
      event,
      rng,
      faultRates: config.fault_rates,
    });

    events.push({
      id: `evt-${eventId}`,
      index,
      timestamp,
      simulator_type: simType,
      canonical_action: action,
      faults_applied: faults,
      event,
    });
  }

  return {
    config,
    mapping,
    events,
  };
}

module.exports = {
  generateTimelineEvents,
};

