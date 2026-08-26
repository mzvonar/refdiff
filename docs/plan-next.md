# Plan — after the first vertical slice (2026-08-26)

Status: slice 1 landed (`7cabfd9`): both adapters, structural channel,
packaging, CLI `compare`, proven on `doc-detail-owner-desktop` and
`tx-picker-owner-desktop`. Problem observed: ~170–200 findings per pair,
dominated by true-but-uninteresting differences. Three items, in order.

## 1. Ignore policies — DONE (2026-08-26, this session)

Landed exactly as specified below plus three measurement fixes the corpus
forced: text leaves are measured by glyph-ink box (block cells vs
shrink-wrapped spans no longer differ in `size`), pill radii are clamped
to the effective radius (no more `33554400px`), and viewport-filling
leaf boxes get role `backdrop` (minor presence only). `doc-detail`:
171 → 141 findings, 0 chrome, 23 data-slot suppressions visible, no
major `size`. Every remaining item is genuine — but two ROOT CAUSES
produce ~70 of them (see 1b). See handoff "Learnings".

## 1b. Systematic-finding aggregation ← DO NEXT (small, pure)

Same `(type, expected→actual)` across many matched pairs is ONE cause:
on `doc-detail` (after the Storybook font fix: 100 findings, 8 critical
/ 42 major / 50 minor) 15 color findings are "ink is #2c2419, design
says #1a1a1a" and ~10 position findings are the same ~-23px shift of
the action row. Pure stage `aggregate(findings) ->
Finding[]` collapsing ≥3 identical deltas into one finding with
`instances: number` + all boxes (overlay draws one mark per instance,
message says "×51"). Severity of the aggregate = max of members. This is
what makes the list SHORT without hiding anything. Then the doc-detail
list is: missing category row (Služby/Účt. kategória/▾), missing
Popis+description, missing "Zobraziť 1 ďalší návrh", one unmatched
suggestion amount, the ~16–25px vertical shift of the lower half, badge
colors (Návrh green vs ochre), 5 radii, 2 aggregates.

## 1 (original spec, for reference). Ignore policies for demo/seed data and artboard chrome

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
