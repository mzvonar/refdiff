# refdiff

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
| [`@refdiff/core`](packages/core) | The comparison engine: pluggable capture adapters (Figma, Claude Design canvases, Storybook, live URLs), alignment, a GVT-style structural channel (element matching + typed checks), a scoped AA-aware pixel channel, and agent-facing packaging (findings.json, per-finding crops, diff mask). CLI + library, zero UI. |
| [`@refdiff/annotator`](packages/annotator) | The review app: a Library of every run (verdict, severity, delta, comments per card) and a split-screen comparison tool with element-anchored comments (click = point, drag = region), triage verdicts on findings (to fix / ignore / snooze, keyed by finding identity), a persisted focus region, four ways to register the design onto the impl (the run's own fit, scaled-to-width, top-left, top-right), a designer ⇄ agent feedback loop (`open → implemented → done`, with the model's reply under each comment), and a diff lab (highlight / dim / strobe / step through the reported boxes, and superimpose the design over the impl by wipe, onion skin, blink or difference blend). Designed to the RefDiff comps and measured against them by refdiff itself. Depends on core. |

## Status

Core pipeline implemented and proven on real pairs (`.dc.html` + Figma
design adapters, Storybook + live-URL impl adapters, structural + pixel
channels, ignore policies, aggregation, delta, agent packaging, CLI);
the annotator serves the whole out root as one app (Library → comparison tool
with a review rail; Split or Full view, one side at a time on a phone) with
element-anchored comments (`open → implemented → done`), triage and a focus
region — each a digest for the model — `--read-only` for a served root under
measurement, and `--emit` for self-contained `report.html` files. The bounded fix loop that consumes all of this is
[`skills/refdiff/SKILL.md`](skills/refdiff/SKILL.md)
(regression ledger + accepted deviations in the CLI); one Figma manifest
entry expands a COMPONENT_SET into per-variant pairs
([`examples/population-registry-ds.manifest.mjs`](examples/population-registry-ds.manifest.mjs)).
Current state and next steps:
[`docs/handoff-2026-08-28.md`](docs/handoff-2026-08-28.md) and
[`docs/plan-next.md`](docs/plan-next.md). Background:

- [`docs/method.md`](docs/method.md) — the method in plain English: the
  naive screenshot-comparison harnesses this replaced, why a VLM cannot be
  the comparator, and what took its place.
- [`docs/self-redesign.md`](docs/self-redesign.md) — the method applied to
  refdiff's own annotator, with before/design/after screenshots and the
  measured numbers from every step.
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
