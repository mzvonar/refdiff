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

## 1b. Systematic-finding aggregation — DONE (2026-08-26, session 4)

Landed as `structural/aggregate.ts` (pure; `aggregate(findings, { minInstances
= 3, deltaTolerance = 2 })`), run after `applyPolicy`, `--no-aggregate` to
disable. Categorical types (color/typography/border-radius/…) group on the
exact `(type, expected, actual)`; position/size cluster on "the same shift":
dominant-axis delta within ±2px of the cluster mean, the other axis free up
to half the shift (the alignment fit leaves a few px of residue across a
row). Aggregate = max severity, message "×N", `instances` + `members[]`
(every box); overlay marks each member with the same number, crop is the
primary's. Presence and text-content never aggregate. `doc-detail`:
100 → **57 findings covering 100 instances** — 8 missing, 2 extras (+2 minor
backdrops), ink token ×15, action-row shift ×7, lower-half shift ×4, badge
colors, 6 radii, and a genuine minor tail. Original spec below.

### 1b (original spec, for reference)

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

## 2. Pixel channel — DONE (2026-08-26, session 5)

Landed as `packages/core/src/pixel/` (`diff.ts` effectful edge, `cluster.ts`
+ `checks.ts` pure) and pure `geometry.ts` (`toDesignNative` extracted from
packaging). Per-match AA-aware pixelmatch inside each element's OWN box
(design crop through the inverse alignment, resampled onto the impl grid,
±2px shift search), connected-components → one `pixel-region` finding per
element (union box, `actual: { diffRatio, diffPixels, clusters }`), Argos
thresholds 5/15/30%. Gate: confidence ≥ 0.5 else one boxless minor finding.
Pipeline `finalize(structural ++ pixel) → applyPolicy → aggregate → package`,
`--no-pixels`, `artifacts.diffMask`. `@blazediff/agent`: skipped as a dep,
`regions[]` protocol referenced (architecture.md "Open decisions").

Measured on doc-detail (design ×0.94): identical text differs 10–40%,
identical 10–14px icons/dots 12–16% even with shift — so the channel skips
text elements (element data describes them exactly) and anything under
16 CSS px. Result: 50 boxes diffed, **0 pixel findings, structural list
unchanged at 57/100** — no false positives; the header icons (14px) and the
badge (text, already a color finding) are the structural channel's. NCC
refinement not built: the residue is sub-pixel phase, which the shift
search absorbs. Original spec below.

### 2 (original spec, for reference)

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

## 4. Deferred: pixel-region sub-classification (steal from @blazediff/interpret-native)

Trigger: the first real pair where the pixel channel emits findings
(images, illustrations, gradients, shadows ≥16px). Until then a
`pixel-region` finding only says "N% differ"; the model still has to look.

What to take (own pure implementation, no dependency — the package is
native-only, mis-calibrated for cross-render pairs, see architecture.md
"Open decisions"): per region, computed over the DIFFERING pixels of the
two crops we already hold in memory, in `pixel/classify.ts`:

- **Chroma stats** (YIQ): `chromaCos` — cosine between the mean chroma
  vectors of both sides (≈1 same hue → brightness/opacity change; negative
  → hue rotation); `sat1`/`sat2` mean chroma magnitude; `chromaRough` —
  roughness of the chroma-delta field (smooth = recolor, patchy =
  replaced content); `meanDy` signed luminance delta.
- **Structure**: `luminanceNcc` over changed pixels (high = same shape,
  different color); `edgeCorrelation` + `structureAsymmetry` (edge density
  img2 − img1: positive = something appeared, negative = disappeared).
- **Shape**: `fillRatio`, `borderRatio`, `innerFillRatio`, row/col
  occupancy — distinguishes an outline-only change (stroke/border) from a
  filled one.
- **Background blend**: distance of the changed pixels from the local
  background on each side (`bgDistanceImg1/2`) → "addition" (blends with bg
  on the design side only) vs "deletion".

Map onto our vocabulary as `Finding.actual.changeKind`: `color` (high NCC,
low edge change), `hue-rotation` (chromaCos < 0), `shape` (edges
uncorrelated, both sides have structure), `added` / `removed`
(asymmetric), `stroke` (borderRatio ≫ innerFill), `noise` (tiny, low
color delta, correlated edges — the resample residue we measured). Message
becomes code-actionable: "icon glyph differs in shape", "illustration
recolored (same shape)", "shadow present in design only". Their exact
verdicts to keep as regression fixtures: on doc-detail it correctly called
the `Návrh` badge and the 6px status dot `color-change`. Tests: synthetic
crop pairs per class (recolor, hue-rotate, outline change, add, remove,
resample-noise). Aggregation then groups on `(type, changeKind)`.
