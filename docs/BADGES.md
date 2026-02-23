# Badge Contract

Covenant v1 emits five CI-verified badge descriptors. Badges are generated from policy analysis and represent the repository's governance posture at a glance.

## Badge Set

| Badge ID | Label | Possible Values | Meaning |
|----------|-------|-----------------|---------|
| `covenant-enabled` | `covenant` | `enabled` | Repository uses Covenant v1 |
| `agent-pr-policy` | `agent-pr` | `allow`, `warn`, `deny`, `none` | Strictest agent PR rule outcome |
| `provenance-policy` | `provenance` | `required`, `configured`, `none` | Whether provenance fields are required |
| `attestation-required` | `attestation` | `required`, `agents`, `none` | Whether attestation is required |
| `thread-intervention-policy` | `thread-mode` | `controlled`, `open` | Whether human thread intervention is restricted |

## Color Scheme

| Value | Color | Hex |
|-------|-------|-----|
| `enabled`, `required`, `controlled` | Green | `#2f855a` |
| `configured`, `allow` | Blue | `#2b6cb0` |
| `warn` | Amber | `#b7791f` |
| `deny` | Red | `#c53030` |
| `none`, `open` | Gray | `#718096` |

## Generation

Generate JSON descriptors:

```bash
node bin/covenant.js badge --policy covenant.yml --format json
```

Generate Shields endpoint payloads:

```bash
node bin/covenant.js badge --policy covenant.yml --format shields
```

## Trust Model

Badges must be generated from a successful default-branch CI run. The `--verified` flag (default: `true`) marks badges as CI-verified. Badges generated outside CI or from non-default branches should use `--verified false`.

## Badge Examples by Policy Stance

### Accepting (Polars-style)

```json
{
  "covenant-enabled": { "label": "covenant", "message": "enabled", "color": "2f855a" },
  "agent-pr-policy": { "label": "agent-pr", "message": "allow", "color": "2b6cb0" },
  "provenance-policy": { "label": "provenance", "message": "none", "color": "718096" },
  "attestation-required": { "label": "attestation", "message": "none", "color": "718096" },
  "thread-intervention-policy": { "label": "thread-mode", "message": "controlled", "color": "2f855a" }
}
```

### Strict (with provenance and attestation)

```json
{
  "covenant-enabled": { "label": "covenant", "message": "enabled", "color": "2f855a" },
  "agent-pr-policy": { "label": "agent-pr", "message": "warn", "color": "b7791f" },
  "provenance-policy": { "label": "provenance", "message": "required", "color": "2f855a" },
  "attestation-required": { "label": "attestation", "message": "required", "color": "2f855a" },
  "thread-intervention-policy": { "label": "thread-mode", "message": "controlled", "color": "2f855a" }
}
```

### Rejecting (Gentoo-style)

```json
{
  "covenant-enabled": { "label": "covenant", "message": "enabled", "color": "2f855a" },
  "agent-pr-policy": { "label": "agent-pr", "message": "deny", "color": "c53030" },
  "provenance-policy": { "label": "provenance", "message": "none", "color": "718096" },
  "attestation-required": { "label": "attestation", "message": "none", "color": "718096" },
  "thread-intervention-policy": { "label": "thread-mode", "message": "controlled", "color": "2f855a" }
}
```

## README and Site Usage

### Option A: Shields (JSON descriptors)

Use generated descriptor values with Shields:

```markdown
![Covenant](https://img.shields.io/badge/covenant-enabled-2f855a)
![Agent PR](https://img.shields.io/badge/agent--pr-warn-b7791f)
![Provenance](https://img.shields.io/badge/provenance-required-2f855a)
```

For dynamic badges backed by CI artifacts, configure a Shields endpoint pointing to your published `badges.json`.

### Option B: Custom SVG badges from this repository

All static badge SVG files live under `docs/badges/` and can be embedded directly with raw GitHub URLs:

```text
https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/<category>/<value>.svg
```

Example:

```markdown
![covenant](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/covenant/covenant-enabled.svg)
![agent-pr-policy](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/warn.svg)
![provenance-policy](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/provenance-policy/required.svg)
![attestation-required](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/attestation-required/required.svg)
![thread-intervention-policy](https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/thread-intervention-policy/controlled.svg)
```

### Full SVG Catalog URLs

`covenant`

- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/covenant/covenant-enabled.svg`

`agent-pr-policy`

- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/allow.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/warn.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/deny.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/agent-pr-policy/none.svg`

`provenance-policy`

- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/provenance-policy/required.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/provenance-policy/configured.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/provenance-policy/none.svg`

`attestation-required`

- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/attestation-required/required.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/attestation-required/agents.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/attestation-required/none.svg`

`thread-intervention-policy`

- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/thread-intervention-policy/controlled.svg`
- `https://raw.githubusercontent.com/clawstoa/covenant.yml/main/docs/badges/thread-intervention-policy/open.svg`

### Main page catalog pattern (all variants stacked)

Use one stack per badge category, with every possible value shown top-to-bottom:

```html
<div class="badge-category">
  <h3>agent-pr-policy</h3>
  <div class="badge-stack">
    <img src="./badges/agent-pr-policy/allow.svg" alt="agent-pr-policy: allow" width="420" height="70">
    <img src="./badges/agent-pr-policy/warn.svg" alt="agent-pr-policy: warn" width="420" height="70">
    <img src="./badges/agent-pr-policy/deny.svg" alt="agent-pr-policy: deny" width="420" height="70">
    <img src="./badges/agent-pr-policy/none.svg" alt="agent-pr-policy: none" width="420" height="70">
  </div>
</div>
```

### Why render all variants in the main page catalog?

Render every variant stacked by category to:

- make the full policy state space explicit,
- prevent confusion between current-state badges and available-state badges,
- help adopters choose the exact badge values they need in README/docs.
