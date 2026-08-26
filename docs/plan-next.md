# Plan — after the first vertical slice (2026-08-26)

Status: slice 1 landed (`7cabfd9`): both adapters, structural channel,
packaging, CLI `compare`, proven on `doc-detail-owner-desktop` and
`tx-picker-owner-desktop`. Problem observed: ~170–200 findings per pair,
dominated by true-but-uninteresting differences. Three items, in order.

## 1. Ignore policies for demo/seed data and artboard chrome

**Goal:** `findings.json` on `doc-detail-owner-desktop` shrinks to a
short list where every item is a real layout/style difference; the
verdict can actually pass on a matching pair.

Evidence from the real corpus (see handoff "Learnings"):
- Comps show different demo data than the stories → `missing-element`,
  `extra-element`, `text-content` spam on value slots.
- Every `.dc.html` frame is an artboard: label strip, state chips, dark
  backdrop, designer notes — none addressable as a modal-only node.

Work (all pure, in `packages/core/src/`):
- **Policy type** (`policy.ts`): `IgnorePolicy = { textPatterns?: RegExp
  | string[]; roles?; regions?: Box[]; scope?: string (CSS selector inside
  the design frame); dataSlots?: boolean }`. Serializable, per pair.
- **Design-side scope:** `DcHtmlSource.scope?: string` — adapter
  extracts + screenshots that inner node instead of the frame. Fallback
  heuristic when absent: largest child container by area (the backdrop /
  modal) — record which was used in the capture.
- **Data-slot rule:** a *matched* pair whose texts differ is data, not
  drift → `text-content` suppressed (or `info` severity) while
  position/size/color/typography checks still run on that pair. Also
  relax `matchElements` so value slots pair geometrically even when
  text differs (already does via γ; verify on the corpus, maybe role
  compatibility).
- **Apply stage** `applyPolicy(findings, policy) -> { kept, suppressed }`
  — suppressed findings written to `findings.json` under
  `suppressed` (never silently dropped; the model can see them).
- **Chrome filter:** design elements outside `scope`/backdrop dropped
  before matching (the label strip / notes are not UI).
- **CLI:** `--manifest <file>` mode running all pairs of a manifest
  (uctoinak's `manifest.mjs` shape + optional `ignore` per pair), plus
  `--ignore-text <regex>` for one-offs.
- **Tests:** policy application, scope fallback, data-slot rule.

Done when: doc-detail run lists the column-width shift, the missing
category row, the CTA section clipped by viewport, and little else.

## 2. Pixel channel

Scoped AA-aware diff inside matched boxes (odiff-bin / pixelmatch v7),
cluster diff mask into boxes, Argos multi-threshold severity; runs only
when structural alignment confidence is sufficient (low confidence is
itself a finding). Evaluate `@blazediff/agent` first — adopt its
verdict/tiles protocol as the reference even if we don't depend on it.
NCC pixel alignment (~100 lines) lands here. Findings type
`pixel-region`, crops as usual. Do NOT start before item 1 — it would
only add noise to an untrustworthy list.

## 3. Hygiene / small checks

- `spacing` check (gap/padding) using the container-emit path
  extraction already half-supports; decide leaf-vs-container
  granularity here.
- `border` check (width/color) — extraction already collects both.
- `inspect` subcommand (crop/zoom/sample-pixel) once the model loop
  starts consuming reports.
- Relative verdict (`delta` vs previous run) — needed by the skill's
  regression guard.
