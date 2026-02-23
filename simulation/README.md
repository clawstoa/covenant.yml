# Simulator Developer Guide

This directory documents the Covenant simulator implementation and local development workflow.

## Overview

The simulator is implemented as a separate subsystem under:

- `src/simulator/`

It is consumed by:

- CLI: `node bin/covenant.js simulate`
- Static UI: `docs/simulator.html` + `docs/simulator.js`

## Goals

The simulator is designed to:

- generate deterministic event timelines at scale
- replay identical timelines across multiple policies
- surface compatibility drift (`allow`, `warn`, `deny`)
- expose rejection reasons and disagreements
- support exploratory training via deterministic story branches

## Module Map

- `src/simulator/config.js`: config normalization and defaults
- `src/simulator/catalog.js`: simulator event taxonomy and profile weights
- `src/simulator/rng.js`: deterministic seeded RNG
- `src/simulator/mapping.js`: simulator-type to canonical-action mapping validation
- `src/simulator/generator.js`: event timeline generation and fault injection
- `src/simulator/attestation-sim.js`: deterministic simulated attestation verifier
- `src/simulator/replay.js`: multi-policy replay orchestration
- `src/simulator/metrics.js`: per-policy and cross-policy metrics
- `src/simulator/story.js`: deterministic next-step choices
- `src/simulator/export.js`: JSON/CSV serialization helpers
- `src/simulator/index.js`: simulator public API
- `src/simulator/browser-entry.js`: browser-facing simulator bundle entry

## Boundary With Core

`src/core` remains policy-engine focused.

Only one integration hook is required:

- `src/core/evaluator.js` supports optional `options.attestationVerifier`

When omitted, evaluator behavior is unchanged and uses native attestation verification.

## Local Development

Run tests:

```bash
pnpm test
```

Run simulator CLI:

```bash
node bin/covenant.js simulate \
  --policies covenant.yml,examples/strict.covenant.yml \
  --count 300 \
  --seed dev-seed \
  --hours 48 \
  --profile balanced
```

Build browser simulator bundle:

```bash
pnpm build:simulator
```

Open static UI:

- `docs/simulator.html`

## UI Developer Notes

The static page includes:

- side-by-side policy editors
- line-numbered text blocks
- input validation section
- run metrics and interpretation cards
- per-event logs with tooltips
- per-editor download actions with prefilled filenames

If you modify `src/simulator/browser-entry.js`, rebuild:

```bash
pnpm build:simulator
```

## Extending Simulator Types

To add a new simulator type:

1. Add it to `src/simulator/catalog.js`.
2. Add default mapping in `src/simulator/mapping.js` / catalog defaults.
3. Ensure generator labels/contexts reflect realistic event metadata.
4. Add tests in `tests/simulator/simulator.test.js`.
5. Update UI type selector in `docs/simulator.html`.
6. Update docs:
   - `docs/SCENARIOS.md`
   - `docs/SIMULATOR.md`
   - `simulation/README.md`

## Validation Expectations

Before running simulation, validation should confirm:

- at least one valid policy
- run parameter bounds
- mapping override correctness
- fault-rate ranges in `[0..1]`

The validation report is rendered in-page and downloadable for debugging.

## Test Coverage

Key simulator tests:

- `tests/simulator/simulator.test.js`
- `tests/simulator/cli-simulate.test.js`

Compatibility hook test:

- `tests/evaluator.test.js` (attestation verifier override path)
