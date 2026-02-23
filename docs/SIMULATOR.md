# Simulator Guide

This document describes the Covenant simulation tool implemented in `src/simulator/`, the `covenant simulate` CLI command, and the static UI in `docs/simulator.html`.

## Purpose

The simulator lets you:

- generate deterministic, high-volume contribution timelines
- replay the exact same event timeline against multiple `covenant.yml` policies
- inspect policy compatibility drift (`allow` / `warn` / `deny`) over time
- study rejection reason codes and disagreement rates
- train users via deterministic next-step ("choose your own adventure") branches

The simulator is separate from `src/core` policy primitives.

## Quick Start

### CLI

Run a seeded simulation and export artifacts:

```bash
node bin/covenant.js simulate \
  --policies covenant.yml,examples/strict.covenant.yml,examples/open.covenant.yml \
  --count 1500 \
  --seed training-42 \
  --hours 120 \
  --profile strict-stress \
  --out-json simulation-run.json \
  --out-csv simulation-metrics.csv
```

### Static UI

1. Build browser bundle:

```bash
pnpm build:simulator
```

2. Open:

- `docs/simulator.html`

The UI supports:

- 3 side-by-side policy slots (editable YAML)
- seeded batch runs
- fault injection controls
- manual action append
- deterministic story branches
- JSON/CSV export

## CLI Reference

`covenant simulate` options:

- `--policies <path[,path...]>`: comma-separated policy paths (required, default `covenant.yml`)
- `--count <n>`: number of generated events (1..10000)
- `--seed <value>`: deterministic seed string/number
- `--hours <n>`: timeline duration in hours
- `--profile <balanced|churn|strict-stress>`: preset event/actor distributions
- `--faults <json|file>`: JSON object of fault probabilities
- `--mapping <json|file>`: simulator-type to canonical-action override map
- `--start-time <iso8601>`: fixed timeline start timestamp
- `--attestation-mode <simulated|native>`: simulator verifier mode
- `--out-json <path>`: write full run artifact JSON
- `--out-csv <path>`: write metrics CSV

## Simulator Event Model

Simulator contribution types map to Covenant canonical actions:

| Simulator Type | Default Canonical Action |
|---|---|
| `code_evolution` | `pull_request.update` |
| `branch_operation` | `pull_request.open` |
| `issue_bug` | `issue.open` |
| `issue_feature_request` | `issue.open` |
| `discussion` | `conversation.intervene_human_thread` |
| `error_regression` | `issue.comment` |
| `release` | `pull_request.merge` |
| `maintenance` | `maintenance.cleanup` |

Overrides are allowed, but mapped values must remain valid Covenant canonical actions.

## Fault Injection

Fault rates are probabilities `[0..1]` applied per generated event:

- `missing_evidence`
- `missing_attestation`
- `invalid_attestation`
- `ineligible_label`
- `thread_mode_mismatch`

These are used to stress policy gates and requirement paths (especially deny behavior).

## Output Artifact

`simulate` returns a single JSON document with:

- `config`: normalized run config
- `mapping`: effective simulator-type mapping
- `policies`: replayed policy metadata (`id`, `policy_hash`, `source`)
- `events`: generated timeline events
- `logs`: per-event policy decisions and enforcement actions
- `metrics`: per-policy totals/series/reasons + cross-policy disagreement
- `story`: deterministic next-step recommendations for the last replayed event

## Story Branching

Story choices are deterministic and reason-code driven:

- provenance missing -> suggest attaching full evidence
- attestation failures -> suggest refreshing attestation
- eligible label gate failures -> suggest adding eligible label
- plus generic fallback branches (retry as human, retarget branch)

Applying a story choice creates a next synthetic event and re-evaluates policy outcomes.

## Architecture (`src/simulator`)

- `config.js`: config normalization and defaults
- `catalog.js`: simulator taxonomy and preset weight catalogs
- `mapping.js`: canonical mapping merge + validation
- `rng.js`: deterministic seed-based RNG
- `generator.js`: timeline event generation + fault injection
- `attestation-sim.js`: deterministic simulated attestation verifier
- `replay.js`: multi-policy replay with evaluator integration
- `metrics.js`: totals, rates, reason-code rollups, disagreement metrics
- `story.js`: deterministic choice generation and application
- `export.js`: JSON/CSV export helpers
- `index.js`: subsystem public API
- `browser-entry.js`: browser bundle entry consumed by `docs/simulator.js`

## Boundary With `src/core`

`src/core` remains policy-engine focused.

Only one simulator integration hook exists:

- `src/core/evaluator.js` accepts optional `options.attestationVerifier`

Default evaluator behavior remains unchanged if no hook is passed.

## Verification and Quality

Simulator coverage lives under:

- `tests/simulator/simulator.test.js`
- `tests/simulator/cli-simulate.test.js`

Additional compatibility test:

- `tests/evaluator.test.js` includes attestation verifier hook coverage

Run all tests:

```bash
pnpm test
```

## Known Constraints

- Covenant schema/canonical actions are not extended by simulator types.
- Browser simulator uses deterministic simulation behavior for training and compatibility analysis.
- UI policy comparison is optimized for 1-3 policies (three slots in current page).
