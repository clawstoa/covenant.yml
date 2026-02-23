#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { loadPolicy } = require("./core/policy-loader");
const { evaluatePolicy } = require("./core/evaluator");
const { buildEnforcementActions } = require("./core/enforcement");
const { evaluateGitHubPayload } = require("./github/adapter");

function getInput(name, fallback = "") {
  const envName = `INPUT_${name.replaceAll("-", "_").toUpperCase()}`;
  const value = process.env[envName];
  return value !== undefined ? value : fallback;
}

function setOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT;
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!outputPath) {
    process.stdout.write(`::set-output name=${name}::${serialized}\n`);
    return;
  }
  fs.appendFileSync(outputPath, `${name}=${serialized}\n`);
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  const candidatePath = path.resolve(value);
  if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
    return JSON.parse(fs.readFileSync(candidatePath, "utf8"));
  }
  return JSON.parse(value);
}

function main() {
  const policyPath = getInput("policy-path", "covenant.yml");
  const mode = getInput("mode", "report");
  const eventJsonInput = getInput("event-json", "");

  const loaded = loadPolicy(policyPath);

  let result;
  if (eventJsonInput) {
    const canonicalEvent = parseJson(eventJsonInput);
    const evaluation = evaluatePolicy(loaded.policy, canonicalEvent, { policyHash: loaded.policy_hash });
    result = {
      supported: true,
      ...evaluation,
      enforcement_actions: buildEnforcementActions(loaded.policy, evaluation, canonicalEvent),
      github_plan: [],
    };
  } else {
    const githubEventName = process.env.GITHUB_EVENT_NAME;
    const githubEventPath = process.env.GITHUB_EVENT_PATH;
    if (!githubEventName || !githubEventPath) {
      throw new Error("GITHUB_EVENT_NAME and GITHUB_EVENT_PATH are required when --event-json is not provided");
    }
    const payload = JSON.parse(fs.readFileSync(githubEventPath, "utf8"));
    result = evaluateGitHubPayload({
      policy: loaded.policy,
      policyHash: loaded.policy_hash,
      eventName: githubEventName,
      payload,
    });
  }

  setOutput("decision", result.decision || "warn");
  setOutput("reason_codes", JSON.stringify(result.reason_codes || []));
  setOutput("enforcement_actions", JSON.stringify(result.enforcement_actions || []));

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (mode === "enforce" && result.decision === "deny") {
    process.exit(2);
  }
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
