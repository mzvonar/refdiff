# visual-compare

Design-vs-implementation visual comparison harness for AI coding agents.

Vision-language models are unreliable comparators of UI screenshots — the
best frontier models detect fewer than half of real CSS-level differences
(and as little as 4% for properties like line-height). This project
inverts the roles: **deterministic code finds, localizes and measures the
differences; the model consumes structured findings and writes the fix**,
with completion gated on the deterministic check — never on the model's
opinion.

## Packages

| Package | What it is |
|---|---|
| [`@visual-compare/core`](packages/core) | The comparison engine: pluggable capture adapters (Figma, Claude Design canvases, Storybook, live URLs), alignment, a GVT-style structural channel (element matching + typed checks), a scoped AA-aware pixel channel, and agent-facing packaging (findings.json, set-of-marks overlay, per-finding crops). CLI + library, zero UI. |
| [`@visual-compare/annotator`](packages/annotator) | Split-screen design/impl review UI with element-anchored annotations and a designer ⇄ agent feedback loop (`open → implemented → done`). Depends on core. |

## Status

Core pipeline implemented and proven on real pairs (`.dc.html` + Figma
design adapters, Storybook + live-URL impl adapters, structural + pixel
channels, ignore policies, aggregation, delta, agent packaging, CLI);
the annotator serves the whole out root as one app (pair list → split-screen
pair view, switchable to one side at a time, which is what a phone always gets)
with element-anchored human annotations (`open → implemented → done`), a digest
for the model, and `--emit` for self-contained `report.html` files. The bounded fix loop that consumes all of this is
[`skills/visual-compare/SKILL.md`](skills/visual-compare/SKILL.md)
(regression ledger + accepted deviations in the CLI); one Figma manifest
entry expands a COMPONENT_SET into per-variant pairs
([`examples/population-registry-ds.manifest.mjs`](examples/population-registry-ds.manifest.mjs)).
Current state and next steps:
[`docs/handoff-2026-08-27.md`](docs/handoff-2026-08-27.md) and
[`docs/plan-next.md`](docs/plan-next.md). Background:

- [`docs/research.md`](docs/research.md) — the evidence base (VLM failure
  modes, validated architectures, metric/human-correlation studies,
  tooling landscape).
- [`docs/architecture.md`](docs/architecture.md) — the composable FP
  pipeline, both comparison channels, the agent packaging contract, and
  reuse-vs-build decisions.

## Design principles

1. The model is never the comparator; the pass gate is deterministic.
2. Composable functional pipeline — pure stages over immutable data,
   effects only in adapters at the edges, every stage extractable.
3. Degraded input hard-stops instead of silently producing a "successful"
   capture.
4. What cannot be verified mechanically (motion, hover feel, design
   intent) is surfaced as an explicit human gate, not guessed.
