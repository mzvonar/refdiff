# Architecture

Design-vs-implementation comparison harness for AI coding agents. Two
packages, one repo:

- **`@visual-compare/core`** — the deterministic comparison engine and
  agent-facing packaging. Zero UI. Usable standalone from any context
  (CLI, library, later possibly a thin MCP wrapper).
- **`@visual-compare/annotator`** — split-screen design/impl review UI
  with element-anchored annotations, consuming core's artifacts.

Evidence for every design decision below is in `docs/research.md`.

## Principles

1. **The model is never the comparator.** Deterministic code finds,
   localizes and measures differences; the model interprets pre-computed
   findings and writes fixes. The pass gate is deterministic.
2. **Structure checks, instruction hopes.** Completion is gated on the
   comparison re-passing, not on the model asserting a match.
3. **Functional, composable pipeline.** Every stage is a pure function
   over immutable data with a typed input/output contract. Effects
   (browser, network, fs) live only in adapters at the edges. Each stage
   is independently importable and usable — the pipeline is just function
   composition, and consumers can run any prefix/suffix of it.
4. **Degraded input hard-stops.** If a ref source can't provide reliable
   data (Figma extraction without variable bindings, unhydrated canvas,
   rendered 404/error page), the stage returns a typed failure — it never
   silently produces a "successful" capture.
5. **Report what cannot be verified** (motion, hover feel, designer
   intent) as explicit human-gate items instead of guessing.

## Pipeline

Each arrow is data (plain serializable values); each box is an extractable
function. Names are indicative:

```
fetchRefs        : SourceConfig            -> RefDescriptor[]        (effectful adapter)
captureSide      : RefDescriptor           -> Capture | CaptureError (effectful adapter)
pairRefs         : (Capture, Capture)      -> Pair
normalize        : Pair                    -> NormalizedPair          (scale/DPR from metadata)
align            : NormalizedPair          -> AlignedPair             (NCC translation + confidence)
extractElements  : Capture                 -> ElementNode[]           (per side)
matchElements    : (ElementNode[], ElementNode[]) -> ElementMatch[]
runTypedChecks   : ElementMatch[]          -> Finding[]               (structural channel)
applyPolicy      : (Finding[], IgnorePolicy) -> { kept, suppressed }  (suppressed stays in the report)
aggregate        : Finding[]               -> Finding[]               (≥3 identical deltas → one finding ×N, all boxes kept)
runPixelChecks   : (AlignedPair, ElementMatch[]) -> Finding[]         (pixel channel)
packageForModel  : (Pair, Alignment, Finding[]) -> ComparisonReport   (+ overlay, crops)
diffAgainstPrior : (ComparisonReport, ComparisonReport?) -> ComparisonReport (relative verdict)
```

`compare = packageForModel ∘ checks ∘ align ∘ normalize ∘ capture` — but
every stage is exported, so e.g. the annotator reuses `extractElements`
and `matchElements` without running a comparison, and a consumer with
pre-captured PNGs enters at `pairRefs`.

Error handling: stages return typed results (`Ok | Err` union), never
throw for domain failures; a failed capture is data that flows to the
report as an explicit finding, not an exception or a silent null.

### Capture adapters (effectful edges)

Design side:
- **Figma** (`adapters/figma.ts`, REST edge `figma-api.ts`, pure mapping
  `figma-tree.ts`): REST renders (PNG at declared scale, `use_absolute_bounds`
  so the PNG is exactly the node's bounding box × scale) + node tree (boxes,
  text, fills/strokes/radii/typography) + variables/tokens when the plan has
  them. Ref = `<fileKey>#<nodeId>@<version>` so provenance is never lost.
  Extraction quality is scored (share of leaves bound to variables/shared
  styles, penalized for detached instances); below `--min-design-quality`
  the run hard-stops with `figma-low-quality` (Kaelig's GIGO gate), the
  score is echoed in `findings.json` either way. A 429 records a cooldown and
  later runs refuse to spend requests until it passes.
- **Claude Design `.dc.html`**: rendered via Playwright. Since the canvas
  is HTML, this adapter also yields DOM boxes + computed styles — the
  richest ref source. Hydration is verified (no `{{…}}` remnants), fonts
  awaited; failure is a typed error.

Implementation side:
- **Storybook**: per-story iframe capture with error-page detection; an
  optional `selector` narrows the capture to one node inside the story (one
  cell of a variant matrix, `[data-rowkey=…][data-col=…]`, against one Figma
  variant COMPONENT) — missing is a typed `selector-not-found`.
- **Live URL** (`adapters/live-url.ts`): navigation + auth hook (storage
  state or session POST), with 404/error/login-redirect *content* detection
  (pure `classifyPage` over final URL, title, heading, body text, password
  field — not just navigation success); typed `http-error`,
  `login-redirect`, `error-page`, `auth-failed`, `selector-not-found`.

All captures: viewport matched to the design frame, DPR recorded,
animations disabled via injected CSS, `document.fonts.ready`,
capture-until-stable, render-completeness check. Both element extractors
emit the text as SHOWN — CSS `text-transform` on the DOM side, `textCase`
on the Figma side — so `LABEL` matches `LABEL`, and both hoist a lone
leaf's decoration from a single-child ancestor chain INCLUDING the captured
root (when the root is the button, its fill/radius belong to the label).

`normalize` scales design geometry into impl CSS px by a per-source policy
(`--design-scale`): `auto` = impl width / design width for `.dc.html`
artboards drawn at another size; **1 for Figma**, whose units already are CSS
px — a Figma frame wider than the impl is a layout difference to report, not
a scale to hide.

### Structural channel (primary)

GVT architecture (98%P/96%R in production; see research §2): leaf-element
lists from both sides → geometric assignment matching (γ-distance KNN;
unmatched = missing/extra findings) → typed per-pair checks: position and
size (~5px default tolerance), color (CIEDE2000 via culori), typography
(family/size/line-height/weight), border-radius, borders, spacing, text.
When token names are available on the design side, findings reference the
token, not just the raw value.

This channel deterministically catches exactly what VLMs miss
(line-height 4% VLM recall, radius 13% — research §1).

### Pixel channel (secondary, scoped)

Implemented in `core/src/pixel/`. `diff.ts` (effectful edge, sharp +
pixelmatch v7 `includeAA: false`, threshold 0.1) crops each matched
element on both sides — the design side through the inverse alignment
transform (`geometry.ts` `toDesignNative`) — resamples the design crop onto
the impl pixel grid and returns a binary diff mask + ratio per match.
Elements are compared inside their OWN boxes, so a positional offset
(already a structural finding) does not fail every pixel. `cluster.ts`
(pure) runs 8-connected components over the mask; `checks.ts` (pure) turns
each match whose ratio passes the Argos-style thresholds (5% minor / 15%
major / 30% critical, ≥12 px) into ONE `pixel-region` finding whose box is
the union of its clusters (`actual: { diffRatio, diffPixels, clusters }`).
Pairs the structural channel already reported (size/color/typography/
radius/border/spacing) and data slots (differing text) are skipped —
never a trivially-failing twin. Gate: alignment confidence ≥ 0.5, else one
boxless minor finding says the channel was skipped. The whole-frame diff
is intentionally not run (it would only re-report structural shifts).
Pixel findings are merged with the structural ones through the same
`finalize` numbering before the policy/aggregation stages;
`artifacts.diffMask` (all masks painted on the impl canvas) is written.
NCC translation refinement stays unbuilt until residue is measured.

### Agent packaging (the comprehension layer)

What the model receives — every item evidence-backed (research §4):

- `findings.json` (`ComparisonReport` in `core/src/types.ts`):
  bbox-grounded, typed, severity-ranked findings with machine-readable
  expected-vs-actual values and code-actionable messages.
- **Set-of-marks overlay**: one annotated image with numbered marks
  matching finding ids.
- **Per-finding native-resolution crop pairs**, presented as separate
  images (never concatenated).
- **Element trees of both sides** so the model can compare data first and
  confirm visually second.
- **Relative verdict** vs the previous run (`package/delta.ts`, pure
  `diffReports(prev, next)` → `report.delta { previousRun, resolved,
  introduced }`). Identity is by CONTENT — type, role, canonical
  expected/actual, nearest box within 5px — never by `id`/`mark`, which
  renumber every run. The CLI reads the run dir's previous `findings.json`
  before anything is written and prints "+N introduced / −M resolved".
- `inspect` CLI subcommand (crop/zoom/sample-pixel) for model-driven
  closer looks (not built yet — waits for the model loop to consume reports).

The **skill** (thin, per consuming repo) enforces loop discipline: run →
read findings → fix → re-run; bounded iterations (default 5) with a
diminishing-returns cutoff; regression guard (a previously-passing region
that regresses is a loud failure); NL ignore-policies for intended
deviations (seed data, dynamic content).

## Annotator

Reuses the best ideas of the population-registry annotator (split view,
point/rect annotations, phone-friendly zero-dep server, the
`open → implemented → done` designer/agent state machine) with one
structural fix: **annotations anchor to matched elements from core's
element model**, not image-fraction coordinates — recaptures re-project
annotations through element identity instead of fragile geometry
migration. Rendered annotation digests (marked PNG + text) remain the
model-facing output.

**Human view requirement (Mato, 2026-08-26):** the annotator/report must
show the FULL design and the FULL implementation side by side in a split
screen (synchronized pan/zoom, aligned through `Alignment`) — the crops and
set-of-marks overlay serve the model, a person compares whole pages/
components. Consequently every capture adapter stores the complete
reference image (`artifacts.designPng` / `implPng`, native resolution),
never only the per-finding crops; the Figma adapter keeps the full node
render, the live/Storybook adapters the full viewport or `fullPage` shot.

**Built (session 8) — the viewer half:** `packages/annotator` renders a
self-contained `report.html` into a run dir (`visual-compare-annotator
<run-dir> [--serve]`). Pure `renderReport(report, { viewMathSource })` →
HTML; pure `view-math.ts` (compiled JS embedded verbatim into the page, no
network, no deps). One world space = impl CSS px (the space every `Finding`
box already uses); one shared `View { z, tx, ty }` drives both panes; the
impl PNG maps in through its DPR, the design PNG through its DPR and then
the `Alignment` (offset + per-axis scale), so pan/zoom on either side moves
both and the same UI lands at the same screen point. Marks are drawn from
`designBox`/`implBox` (+ aggregated members) on both panes; the list
filters by severity/text, selection focuses both panes and shows
expected/actual + the crop pair; `suppressed` and `delta` are visible;
"align design through Alignment" can be switched off for a raw
side-by-side. DPRs are read at load time from PNG natural width ÷ reported
CSS width.

**Built (session 9) — the annotation half.** Pure model in
`packages/annotator/src/annotations.ts` (no runtime imports; embedded into
the page like view-math and imported by the CLI): `Annotation { id, side,
shape: point | rect (world = impl CSS px), anchor? { elementId, role, text,
box }, note, status, timestamps, stale? }` in an `AnnotationSet { version: 1,
pair, annotations }`. Snapping (`snapToElement`): a region → the element with
the largest intersection-over-union (a loose rectangle around a button means
the button, not the label under its centre); a point → the smallest element
containing it, else the nearest within 48px; `backdrop` leaves never anchor.
State machine (`transition`/`editNote`): `open → implemented` (agent, via
`--mark-implemented`) `→ done` (designer); `reopen` from either; editing an
implemented note's text reopens it (the spec changed). Re-projection
(`resolveAnchor`/`reproject`): on every CLI start the stored set is resolved
against the CURRENT `elements.json` — same id with the same text, else the
same text+role nearest, else same-role geometry within 40px — and the shape
moves by the element's delta; an unresolved anchor marks the note `stale`
(kept at its last place, never dropped). Digest for the model:
`annotations.md` (numbered, grouped open → implemented → done, anchor
description + world coords) and `annotations-design.png` /
`annotations-impl.png` (the full PNGs with numbered markers at native
resolution — the design side through the inverse Alignment). Effects live in
`cli.ts`: `annotations.json` (atomic write), `GET/PUT /api/annotations` on
core's `serveDir` via its new `handle` hook (validate → persist → re-digest,
last write wins), sharp for the PNGs. The page saves to the API when served,
to `localStorage` otherwise (and says so).

## Reuse vs build

| Concern | Decision |
|---|---|
| Pixel diff | depend: odiff-bin / pixelmatch v7 (`@blazediff/*` under evaluation) |
| Region clustering | depend: looks-same, or ~40 lines connected-components |
| Color distance | depend: culori (CIEDE2000) |
| Preprocessing | depend: sharp |
| Capture | depend: playwright (+ own stabilization glue) |
| Alignment | build: ~100-line NCC; escalate to @techstark/opencv-js only if needed |
| Element extraction/matching, typed checks | build (small, the core value) |
| Findings contract + packaging | build (the differentiator) |

## Open decisions

- Plain typed async functions with a `Result` union vs an effect system
  (Effect). Starting plain; revisit if composition gets noisy.
- `@blazediff/agent` — **decided 2026-08-26: skip as a dependency,
  reference its protocol.** Evaluated against blazediff.dev/apis/agent
  (time-boxed). It is a CLI-driven visual-regression harness (route
  discovery, baseline-vs-actual of the SAME page, `check`/`rewrite`,
  four-label verdicts `regression-likely | intentional-likely |
  noise-likely | ambiguous`, `JudgmentRequest` → `verdict.json` handed to a
  coding agent), not a library: no programmatic diff/cluster API, and its
  baseline model does not fit design-vs-implementation where the two
  sides are never expected to be pixel-identical. What we adopt as
  reference: its `regions[]` output (bbox + pixel count + change type per
  detected region), the "token discipline" point (region tiles 10–100×
  smaller than full-page PNGs — our per-finding crops), and the
  no-embedded-LLM rule (the host agent judges; the tool measures). We
  deliberately do NOT adopt its concatenated `regions.png` stack —
  research §4 says separate crop files read better. Pixel channel =
  pixelmatch v7 (`includeAA: false`) + own connected-components +
  Argos-style multi-threshold severity, inside matched element boxes.
- **Rest of the `@blazediff/*` namespace — evaluated 2026-08-26, nothing
  adopted now.** Measured on the real doc-detail element crop pairs
  (design resampled onto the impl grid, no shift search):
  - `core` / `core-native` / `core-wasm`: pixelmatch-compatible counters
    (1.5–9× faster). Our diff time is sharp crop I/O, not the compare;
    `core` is a one-line drop-in if that ever changes. Native/wasm take
    same-size files, not in-memory element crops.
  - `ssim`, `gmsd`, `hitchhikers-ssim`, `ms-ssim`: not discriminative at
    element scale across two renders — identical text/icons score SSIM
    0.28–0.74 and GMSD 0.27–0.41 (their own "substantial difference"
    band); hitchhikers gives 1.000 for identical AND for the recolored 6px
    dot; ms-ssim refuses images under a few hundred px.
  - `interpret-native` (`interpret` / `interpretRegions(base, actual,
    boxes)` → `regions[] { bbox, changeType, confidence, luminanceNcc,
    chroma, edgeCorrelation … }`): the closest in spirit — region
    classification for boxes you already know, with a `rendering-noise`
    class. In practice it labels every identical-content crop
    `content-change` at confidence 0.50 / severity high (calibrated for
    same-render regression, not cross-render comparison); it did call the
    two real recolors `color-change` correctly. Native-only binding, no JS
    fallback. Keep its signal set (chroma cosine, edge correlation,
    luminance NCC, fill ratios) as the reference if we ever sub-classify
    `pixel-region` findings into color vs shape change.
  - `jest`/`vitest`/`bun`/`matcher` (VRT matchers), `react`/`ui`
    (viewer), `object` (JSON diff), `codec-*`, `cli`: out of scope.
- **Spacing granularity — decided 2026-08-26: sibling gaps over
  `MatchResult`, no container extraction.** Extraction emits leaves (+
  text-bearing containers) only, so there is no `gap`/`padding` to compare;
  `ElementNode.style.gap/padding` stay unused. `structural/checks.ts`
  `spacingFindings` instead measures, for every matched pair, the distance
  to its nearest neighbour below / to the right — where "nearest" is taken
  over ALL elements of a side (unmatched included) and the neighbour must be
  adjacent on BOTH sides, so a design-only row in between is a missing
  element, never a spacing delta. Design gaps > 64px are layout distance,
  not a spacing token; negative gaps (overlap / swapped order) belong to the
  position check; horizontal gaps next to a data slot are content width.
  Tolerance 2px, major > 8px; aggregation clusters spacing on Δgap per axis
  like position on Δxy. Finding box = union of the two elements (crop shows
  both). Containers with `gap`/`padding` remain the alternative if a corpus
  needs padding checks the sibling view cannot express (first/last child
  vs container edge).
- **Decoration hoisting (extraction) — 2026-08-26.** A leaf that paints no
  background/border/radius takes them from the nearest ancestor of which it
  is the only (textless-wrapper-chain) child: `<button><span>⋯</span>
  </button>` and a bordered `<div>⋯</div>` are the same pill. Without it
  the border and radius checks reported "no border" / "radius 0" on doc-
  detail for pills both sides draw. Box stays the leaf's (ink box for
  text); the radius is clamped against the decorated ancestor's rect.
  Border/radius are further compared only between comparable boxes (text
  pairs, or size within tolerance) — an 8px dot matched to an 18px circle
  is a size finding, not a border one.
- **Figma quality score — 2026-08-26, confirmed on the real DS corpus
  2026-08-27.** `score = (bound / leaves) × (1 − 0.5 × detached / instances)` where
  a leaf is "bound" when its color or typography comes from a bound variable
  OR a shared style (`styles.fill/text/stroke`) — teams without the
  Enterprise variables API still get a meaningful score. Icons (all-vector
  containers ≤ 64px) count as leaves and are rarely bound, so icon-heavy
  frames score lower. Real numbers: the `*Button/Fill` set scores 0.64 (49/76
  bound, 27 icons unbound, 0 detached), a single variant COMPONENT 1.00; the
  0.3 default stands. The DS plan has no variables endpoint (403), so tokens
  are `VariableID:…` ids — still enough to count as bound.
  Figma colors are emitted as `rgb()/rgba()` (paint opacity folded into
  alpha) so identity keys and messages match the DOM side.
- **Figma TEXT boxes = `absoluteBoundingBox`, NOT `absoluteRenderBounds` —
  decided 2026-08-27.** Render bounds are the glyph ink (49.9×9.8 for a 14px
  `LABEL`); the DOM side measures text by Range client rects = advance width ×
  font content-area (33×19 for the same label in Oswald 12.25). Neither is
  the other's measure, but the layout box (52×16 = advance × line height) is
  the closer analogue on both axes, so it stays. Consequence: a text `size`
  finding between Figma and DOM mixes line-height/content-area semantics —
  read it together with the typography finding on the same pair.
- **Design scale policy — decided 2026-08-27.** `.dc.html` artboards are
  drawn at arbitrary sizes → `auto` (impl width / design width). Figma units
  ARE CSS px → `1`; the first real pair (variant sheet 1283px vs story grid
  716px, identical 40px buttons on both sides) proved width-normalization
  wrong there. `--design-scale <n|auto>` overrides either.
- **Alignment with fewer than 3 anchors — decided 2026-08-27.** The Theil–Sen
  scale fit needs ≥3 unique-text anchors. Below that, a pure offset (median
  center delta, scale 1) is applied ONLY when every design leaf is an anchor —
  a component-sized capture where nothing unmatched can be dragged along; a
  page sharing one accidental word stays at identity. Confidence keeps the
  `anchors/8` damping (1 anchor → 0.13), so the pixel channel still waits for
  real evidence.
- **Component sets are sheets, not frames.** Every population-registry
  `frames.json` node is a COMPONENT_SET; its variants are laid out by Figma,
  the story's grid by CSS, and the texts repeat (`LABEL` ×42) — no anchors,
  layouts differ, 77–137 honest-but-useless findings. The unit of comparison
  for a design system is one variant COMPONENT (child node id) ↔ one story
  cell (`selector`). A per-variant manifest expansion (component set → N
  pairs, cell selector from the variant's properties) is the next corpus step.
- **Live-URL error detection is content-based and heuristic.** Login = final
  path matches `/(login|sign-in|auth|sso|onboarding)/` when the requested one
  did not, or a password field appears on a different path. Error page = an
  error phrase (EN + SK) in `<title>`/first heading, or in a body under 300
  chars. A long page mentioning "404" in a table cell is NOT an error page.
- MCP wrapper over the CLI (deferred until the CLI proves out).
- npm publishing vs git-URL consumption (publishing preferred; scope
  `@visual-compare` is free as of Aug 2026).

## Migration targets

Once the core works end-to-end on one real pair per source type:

- `uctoinak-bmad/tools/design-compare` → core with the `.dc.html` adapter
  (fixes: 404-as-success, no diff signal, no structured verdict).
- `population-registry/frontend/ds/tooling/visual` + annotator → core
  Figma adapter + `@visual-compare/annotator` (fixes: scale mismatch,
  three competing Figma mappings, fraction-based annotation fragility).
