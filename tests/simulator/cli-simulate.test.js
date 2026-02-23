"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

test("covenant simulate writes JSON and CSV outputs", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "covenant-sim-"));
  const outJson = path.join(tempDir, "run.json");
  const outCsv = path.join(tempDir, "metrics.csv");

  const stdout = execFileSync(
    process.execPath,
    [
      "bin/covenant.js",
      "simulate",
      "--policies",
      "examples/minimal.covenant.yml,examples/strict.covenant.yml",
      "--count",
      "12",
      "--hours",
      "8",
      "--seed",
      "cli-seed",
      "--start-time",
      "2026-02-21T00:00:00.000Z",
      "--out-json",
      outJson,
      "--out-csv",
      outCsv,
    ],
    {
      encoding: "utf8",
      cwd: path.resolve(__dirname, "..", ".."),
    }
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.events.length, 12);
  assert.equal(parsed.logs.length, 12);
  assert.equal(parsed.policies.length, 2);
  assert.equal(fs.existsSync(outJson), true);
  assert.equal(fs.existsSync(outCsv), true);
  assert.ok(fs.readFileSync(outCsv, "utf8").includes("policy_id,total_events,allow,warn,deny"));
});

