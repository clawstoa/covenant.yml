#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  buildEnforcementActions,
  exportMetricsCsv,
  exportRunJson,
  PolicyValidationError,
  evaluatePolicy,
  generateBadges,
  loadPolicy,
  simulateRun,
  toShieldsEndpoint,
} = require("../src/index");

function printHelp() {
  const lines = [
    "covenant <command> [options]",
    "",
    "Commands:",
    "  validate [policy-path]             Validate covenant.yml against Covenant v1 contract",
    "  eval --event <json|file>           Evaluate a canonical event against policy",
    "       [--policy <path>] [--fail-on-deny]",
    "  badge [--policy <path>] [--format json|shields] [--verified true|false]",
    "  simulate [--policies <path[,path...]>] [--count <n>] [--seed <value>]",
    "           [--hours <n>] [--profile balanced|churn|strict-stress]",
    "           [--faults <json|file>] [--mapping <json|file>]",
    "           [--start-time <iso8601>] [--attestation-mode simulated|native]",
    "           [--out-json <path>] [--out-csv <path>]",
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      continue;
    }
    flags[key] = next;
    i += 1;
  }

  return { positional, flags };
}

function assertPathWithinCwd(filePath) {
  const resolved = path.resolve(filePath);
  const cwd = path.resolve(process.cwd());
  if (!resolved.startsWith(cwd + path.sep) && resolved !== cwd) {
    throw new Error(`Path is outside the working directory and cannot be read: ${filePath}`);
  }
}

function parseJsonInput(raw) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("event input must be a non-empty JSON string or file path");
  }

  const potentialPath = path.resolve(raw);
  if (fs.existsSync(potentialPath) && fs.statSync(potentialPath).isFile()) {
    return JSON.parse(fs.readFileSync(potentialPath, "utf8"));
  }

  return JSON.parse(raw);
}

function parseOptionalJsonInput(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return undefined;
  }
  return parseJsonInput(raw);
}

function commandValidate(args) {
  const policyPath = args.positional[1] || "covenant.yml";
  assertPathWithinCwd(policyPath);
  const loaded = loadPolicy(policyPath);
  process.stdout.write(
    `${JSON.stringify({ valid: true, path: loaded.path, policy_hash: loaded.policy_hash }, null, 2)}\n`
  );
}

function commandEval(args) {
  const policyPath = args.flags.policy || "covenant.yml";
  assertPathWithinCwd(policyPath);
  const eventInput = args.flags.event;
  if (!eventInput) {
    throw new Error("--event is required");
  }

  const loaded = loadPolicy(policyPath);
  const event = parseJsonInput(eventInput);
  const evaluation = evaluatePolicy(loaded.policy, event, {
    policyHash: loaded.policy_hash,
  });
  const result = {
    ...evaluation,
    enforcement_actions: buildEnforcementActions(loaded.policy, evaluation, event),
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (args.flags["fail-on-deny"] && result.decision === "deny") {
    process.exit(2);
  }
}

function commandBadge(args) {
  const policyPath = args.flags.policy || "covenant.yml";
  assertPathWithinCwd(policyPath);
  const format = args.flags.format || "json";
  const verified = args.flags.verified === undefined ? true : args.flags.verified !== "false";

  const loaded = loadPolicy(policyPath);
  const badges = generateBadges(loaded.policy, { verified });

  if (format === "json") {
    process.stdout.write(`${JSON.stringify(badges, null, 2)}\n`);
    return;
  }

  if (format === "shields") {
    const result = {};
    for (const [name, badge] of Object.entries(badges)) {
      result[name] = toShieldsEndpoint(badge);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  throw new Error("--format must be 'json' or 'shields'");
}

function commandSimulate(args) {
  const policiesInput = args.flags.policies || args.flags.policy || "covenant.yml";
  const policyPaths = String(policiesInput)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (policyPaths.length === 0) {
    throw new Error("at least one policy path must be provided");
  }

  policyPaths.forEach(assertPathWithinCwd);

  const policies = policyPaths.map((policyPath, index) => {
    const loaded = loadPolicy(policyPath);
    return {
      id: path.basename(policyPath) || `policy-${index + 1}`,
      policy: loaded.policy,
      policy_hash: loaded.policy_hash,
      source: loaded.path,
    };
  });

  const result = simulateRun({
    policies,
    count: args.flags.count !== undefined ? Number(args.flags.count) : undefined,
    seed: args.flags.seed,
    hours: args.flags.hours !== undefined ? Number(args.flags.hours) : undefined,
    profile: args.flags.profile,
    fault_rates: parseOptionalJsonInput(args.flags.faults),
    mapping_overrides: parseOptionalJsonInput(args.flags.mapping),
    start_time: args.flags["start-time"],
    attestation_mode: args.flags["attestation-mode"] || "simulated",
  });

  if (args.flags["out-json"]) {
    fs.writeFileSync(path.resolve(args.flags["out-json"]), exportRunJson(result));
  }
  if (args.flags["out-csv"]) {
    fs.writeFileSync(path.resolve(args.flags["out-csv"]), exportMetricsCsv(result.metrics));
  }

  process.stdout.write(`${exportRunJson(result)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args.positional[0];

  if (!command || command === "help" || command === "--help") {
    printHelp();
    return;
  }

  if (command === "validate") {
    commandValidate(args);
    return;
  }

  if (command === "eval") {
    commandEval(args);
    return;
  }

  if (command === "badge") {
    commandBadge(args);
    return;
  }

  if (command === "simulate") {
    commandSimulate(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

try {
  main();
} catch (error) {
  if (error instanceof PolicyValidationError) {
    process.stderr.write("Policy validation failed:\n");
    for (const issue of error.errors) {
      process.stderr.write(`- ${issue.path}: ${issue.message}\n`);
    }
    process.exit(1);
  }
  if (error instanceof SyntaxError) {
    process.stderr.write(`JSON parsing error: ${error.message}\n`);
    process.exit(1);
  }
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
