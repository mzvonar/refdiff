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

## 3. Hygiene / small checks — DONE except `inspect` (2026-08-26, session 6)

Landed: `border` check (width > 0.5px or ΔE2000 ≥ 2.5; major when a border
appears/vanishes or ΔE ≥ 8), `spacing` check as sibling gaps over
`MatchResult` (decision recorded in architecture.md "Open decisions":
nearest neighbour below/right adjacent on BOTH sides, design gap ≤ 64px,
tolerance 2px / major > 8px, aggregation clusters on Δgap per axis), pure
`package/delta.ts` `diffReports` → `report.delta` (identity by content +
nearest box, CLI reads the previous `findings.json` first and prints
"+N introduced / −M resolved"). Two extraction fixes the corpus forced:
decoration hoisting (border/radius/background from a single-child ancestor
chain — the `⋯` button's border lives on `<button>`, the design's on the
`<div>`) and transparent borders ignored; border/radius compared only between
comparable boxes. `inspect` deliberately NOT built — nothing consumes reports
yet. doc-detail: 57/100 → **60 findings / 122 instances** (+5 spacing: label→
value gap ×3, header→tabs 3px ×14, subtitle→amount ×3, two action-row
separators; +1 minor border color; +1 badge background made visible by the
hoist; −3 radius false positives on pills both sides draw), re-run delta
empty. Original spec below.

### 3 (original spec, for reference)

In this order — border first (data already extracted), spacing second
(decide sibling-gap vs container extraction; recommend sibling-gap),
relative verdict third (`delta` is typed, needs identity-by-content not by
id), `inspect` last and only if the model loop is consuming reports.

- `border` check (width/color) — extraction already collects both.
- `spacing` check (gap/padding) — extraction emits no containers today;
  decide leaf-vs-container granularity here.
- Relative verdict (`delta` vs previous run) — needed by the skill's
  regression guard.
- `inspect` subcommand (crop/zoom/sample-pixel) once the model loop
  starts consuming reports.

## 5. Figma design adapter — PROVEN (2026-08-27, session 9)

Proven on the population-registry DS (`M0hnCQJIUho3tcW6PcnHWH`, DS Storybook
:6008). Every `frames.json` "frame" is a COMPONENT_SET sheet, so the real
pairing is **one variant COMPONENT ↔ one story cell**: `--figma …:12:229`
(State=Default, 76×40, quality 1.00) vs `--story ds-button--fill --selector
'[data-rowkey="fill:label:md:Label:"][data-col="Default"]'` → aligned (8.1,
−2.5) @0.13, **4 findings**: size 33×19 vs 52×16, typography Oswald 12.25/500/
21 vs Montserrat 14/700/16 (genuine — the DS Storybook renders Oswald), minor
position (the size delta's half), pixel-skip note. Sheet vs grid
(`8226:4244` ↔ `ds-button--fill`): 76 leaves (42 text/27 icon/7 box) vs 70,
quality 0.64, confidence 0.00 (no unique text) — 137 findings at scale 1, 77
at `--design-scale auto`; both honest (different sheet layouts), neither
useful. Real-schema fixes: `textCase` ↔ `text-transform` applied on BOTH
sides, `--design-scale` (Figma default 1: its units ARE CSS px), decoration
hoisting may take the ROOT's paint (the captured node is the button), Storybook
`selector`, offset-only alignment when every design leaf is an anchor. Real
nodes response recorded as `test/fixtures/figma/nodes-button-fill-set.json`
(6 tests on it). Handoff "What's DONE (session 9)" has the details.

### 5 (as built, session 7)

Landed: `FigmaSource` + six typed errors (`pipeline.ts`), `adapters/figma-api.ts`
(`FigmaClient`: token from `$FIGMA_TOKEN` / `.figma-token` upwards, 429 →
cooldown record in `~/.cache/visual-compare/figma-cooldown.json` and
`cooling-down` before any request until it passes, chunked `/v1/images` with
`use_absolute_bounds=true`, variables endpoint optional), pure
`adapters/figma-tree.ts` (`figmaTreeToElements` → leaves in root-box CSS px,
icon collapsing, decoration hoisting, `rgb()/rgba()` colors, tokens from
variables/shared styles, `figmaQuality`), `adapters/figma.ts` (`captureFigma`:
nodes → variables → map → gate → render → PNG-size check → `Capture{dpr=scale,
quality}`), CLI `--figma <fileKey:nodeId|URL> --figma-scale --min-design-quality`,
manifest `design: { kind: "figma", fileKey, nodeId }`, `findings.json`
`design.quality`. 27 tests on hand-authored fixtures (no token on this machine
to record real ones). **Step 7 (prove on a real frame vs its story) needs a
token + Mato's frame pick** — see handoff. Original spec below.

### 5 (original spec, for reference)

Second design-side source, same `Capture` contract: `FigmaSource` +
typed errors (`pipeline.ts`), REST edge ported from population-registry's
`figma-api.mjs` (token, 429 cooldown, chunked renders), pure node-tree →
`ElementNode[]` mapping with decoration hoisting, GIGO quality gate
(`--min-design-quality`, default 0.3, score echoed in the report), CLI
`--figma <fileKey>:<nodeId>` / manifest `design.kind: "figma"`. Prove on one
real frame vs its story. Then the live-URL impl adapter (§5 in the handoff).

## 7. Annotator — annotation half BUILT (2026-08-27, session 9)

`annotations.ts` (pure, embedded + imported): point/rect notes in world space
snapped to the nearest `ElementNode` of that side (regions by IoU, points by
smallest-containing, backdrops excluded), stored with element identity AND box;
`open → implemented → done` (`--mark-implemented <ids|all>`, editing reopens);
re-projection through element identity on every start (orphans → `stale`);
digest `annotations.md` + marked `annotations-{design,impl}.png`. Effects in
`cli.ts`: `annotations.json`, zero-dep `GET/PUT /api/annotations` on `serveDir`
(`handle` hook). Verified end-to-end with Playwright on doc-detail: two notes
placed, one marked done, `--mark-implemented all`, digest PNG markers land on
the design through the inverse Alignment. 175 tests. Viewer half below.

### 7 (viewer half, session 8)

`packages/annotator`: `visual-compare-annotator <run-dir> [--out] [--serve
--port --host]` writes `report.html` into the run dir — FULL design and FULL
impl side by side, one shared pan/zoom with the design pane projected through
`Alignment`, numbered marks on both panes, finding list (severity/text
filters, j/k), detail with expected/actual + crops, suppressed + delta
visible. Pure `renderReport` + pure `view-math.ts` (17 tests); `serveDir` in
core gained `{ port, host }`. Verified on doc-detail and the live docs pair
(Playwright screenshot, zero console errors). NEXT half: element-anchored
human annotations (`open → implemented → done`) + a digest for the model —
see architecture.md "Annotator".

## 6. Live-URL impl adapter — PROVEN (2026-08-26, session 8)

Run against uctoinak `serve-live.sh` (seeds `functional-sro` + the two
`__test__` members into the TEST DB and starts `dev:e2e` on :3100):
`docs-owner-desktop` captured the authenticated owner page at 1280×900 @2x,
31 leaves (nav, heading, filter pills, search, sort, empty state); the comp
has 87 → 119 findings / 126 instances, 7 data-slot suppressions, alignment
confidence 0.00 (almost no shared text), pixel channel skipped. All of that
is DATA, not drift: the seed has 0 documents, so every comp row is
"missing" — a documents seed for the live pairs is the next corpus step.
Typed errors proven for real: `auth-failed` (wrong secret → 404 from the
session POST), `login-redirect` (no auth → `/app/sign-in?callbackURL=…`),
`error-page` (authed unknown org / unknown route → heading "Stránka sa
nenašla"; the app's not-found is a SOFT 404: 307 → 200, only the content
check catches it), `http-error` (API route → status 404), `unreachable`
(`ERR_CONNECTION_REFUSED`). Original note below.

### 6 (original, for reference). Live-URL impl adapter — BUILT, NOT YET PROVEN (session 7)

`adapters/live-url.ts`: `LiveUrlSource { url, viewport?, selector?, waitFor?,
auth?, fullPage? }`, auth = Playwright storage state or a session POST (the
uctoinak `/api/test/session` shape), pure `classifyPage` (login path / password
form on another path → `login-redirect`; error phrase in title/heading or a
near-empty body → `error-page`), HTTP ≥ 400 → `http-error`, same
`extractElementTree` (viewport origin when no `selector`). CLI `--url
--selector --wait-for --full-page --app-url --auth-state --auth-post
--auth-header`; manifest `app: { source: "live", route, role }` now runs
instead of being skipped. Needs the uctoinak app in `dev:e2e` mode to prove.

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
