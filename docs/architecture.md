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
- **Regression ledger** (`package/delta.ts`, pure `recordResolved` /
  `findRegressions`; the CLI persists `resolved-ledger.json` in the run
  dir): every finding a run resolved is remembered by identity + place, so
  an introduced finding matching one — even three iterations later — is
  listed under `delta.regressions` and printed as `REGRESSION:`. The loop's
  loud failure lives in the tool, not in the model's memory.
- **Accepted deviations** (`IgnorePolicy.accepted[] { type, expected?,
  actual?, reason }`): intended differences the loop has reviewed (an
  app-wide token when one comp is the outlier) are suppressed as
  `accepted` with the reason as the visible rule — the "NL ignore policy"
  the skill needs, still never a silent skip.
- `inspect` CLI subcommand (crop/zoom/sample-pixel) — NOT built: three
  loop iterations on doc-detail never needed a closer look than
  `expected/actual` + the crop pair.

The **skill** — `skills/design-fix-loop/SKILL.md` (canonical; installed per
consuming repo with a "Repo bindings" section, first in
`uctoinak-bmad/.claude/skills/design-fix-loop/`) — enforces loop discipline:
run → classify every finding (data / drift / intended deviation /
environment / needs a human) → act on open annotations → fix → re-run →
read `delta`; bounded (5 iterations, diminishing-returns cutoff), a
`REGRESSION` stops the plan, the deliverable is a table of iterations plus
fixed / accepted / needs-a-human lists — never a description of a screenshot.

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

- **Component-set expansion — decided 2026-08-27 (S10): a pure template
  over the set's variant properties, not a discovery heuristic.**
  `adapters/figma-variants.ts` `expandVariants(set, { selector, maps?,
  only?, omit? })`: `{Prop}` inserts the option, `{Prop|map}` looks it up,
  `{A,B|map}` looks the joined options up (positional, untagged story
  cells → `:nth-child(n)`). A template naming an unknown property/map fails
  the entry; a variant without a map entry is SKIPPED with its reason (the
  story has no such cell) — returned, printed, never dropped. The CLI reads
  the set once (`nodes`), fetches variables once, renders every variant in
  one batched `/images` call and hands each pair `captureFigma({ prefetched
  })`. Measured on the DS: tagged cells (`data-rowkey`/`data-col`, Button)
  are robust; positional cells (Alert, Dialog) are fragile — a loose
  `.flex-col > :nth-child(2)` matched an inner invisible node and produced
  a `capture-failed` timeout until scoped to `#storybook-root > div >
  div.flex-col`. The clean fix is in the corpus: tag every story cell with
  the variant's properties (population-registry task).
- **Delta identity churns when the alignment moves — observed 2026-08-27
  (S10), not changed.** Position findings carry world coordinates in
  `expected/actual`, so a fixture change that shifts the alignment offset by
  ~7px re-identifies every position finding (doc-detail iteration 1:
  +47/−48 while the count went 60 → 59). The first iteration of a loop
  (data parity) is therefore judged by counts and by the ledger going
  forward, not by that delta; the skill says so. A content-based identity
  for position findings (element text + type, coordinates as payload) would
  fix it — do it when a loop actually misreads a delta because of it.
- **Figma fill-width TEXT boxes vs DOM ink — decided 2026-08-27 (S11):
  horizontal extent from `absoluteRenderBounds` when the text does not size
  its own width.** Observed in S10: every Alert variant reported a major
  `size` on its message — the Figma text node is a fill-width box (724×19,
  `textAutoResize: HEIGHT`, `layoutSizingHorizontal: FILL`) while the DOM
  text measures its glyph ink (226×15). The recorded set
  (`test/fixtures/figma/nodes-alert-set.json`) shows render bounds 255.3
  wide at x 69.6 for that node — and 255.3 × 0.875 (the DS Storybook's rem
  factor, see S11) = 223 ≈ the DOM's 226, so ink is the right analogue for
  a stretched box. `figma-tree.ts` `textBox(n)`: `textAutoResize`
  `WIDTH_AND_HEIGHT` (hugging) keeps `absoluteBoundingBox` on both axes (the
  S9 button measurement, unchanged: 52×16 layout box vs DOM advance ×
  content-area); `HEIGHT` / `NONE` / `TRUNCATE` take `x` + `width` from
  `absoluteRenderBounds` and keep `y` + `height` from the layout box
  (line-height ↔ DOM content-area, as before). Measured on the Alert set:
  the four 8→416px `spacing` majors to the close icon vanish and the 20
  `size` majors stop saying 724 vs 226 — they now say 255×19 vs 226×15,
  which is the text's own size delta (the ×0.875 typography cause below plus
  the known line-height vs content-area height semantics), i.e. a true
  statement about the text instead of about the row. The same set has a
  HUGGING centered message
  ("No responsive width", 297×19) that keeps its layout box — one set covers
  both branches.
- **Set summary — built 2026-08-27 (S11), the first CLI need the skill hit.**
  Reading 23 or 41 per-cell `findings.json` files was the real blocker of a
  set loop. Pure `package/summary.ts`: `summarizeReports(runs)` → one row per
  run (counts, verdict, confidence, delta) + `groups` — the same finding
  across pairs is ONE cause: categorical types group on exact `(type, role,
  expected, actual)` like `aggregate`, metric types on `(type, role, axis)`
  with the value spread, presence on `(type, role)`; every group lists its
  pairs. `renderSummary` is Markdown. `visual-compare summary <out-root>`
  writes `summary.md` + `summary.json` over every run dir under the root; a
  multi-pair `compare` prints the table for the pairs it ran and rewrites
  the root's files. Measured: Alert 153 findings → 10 causes, Button 201 → 16.
  Lossless in the only sense that matters: the rows point back to the per-cell
  reports, which stay the truth.
- **Finding identity is by content when the element has text — decided
  2026-08-27 (S11).** `Finding.text` (design side wins; spacing `"a → b"`)
  is set by every check. `delta.ts` `identityKey`: position / presence /
  spacing findings WITH text → `type|role|text(|axis)`, coordinates ignored;
  other types add the text to the value key; textless findings keep
  `type|role|expected|actual` + a box within 5px. Among same-key candidates
  the nearest box wins, anchored on the IMPL box (world space, does not move
  with the alignment). The ledger stores `text` and applies the same rule.
  Consequence: a data-parity iteration no longer churns the delta (tx-picker
  it.1 re-run: +0/−0; the S10 doc-detail +47/−48 would have been the counts
  only); a text finding whose values changed is neither resolved nor
  introduced — the counts and message carry that. Reports written before
  this identity churn exactly once.
- **Element pairs align by identity — decided 2026-08-27 (S11).** Impl
  captures with a `selector` record `scope: { mode: "explicit" }` like the
  design side. When BOTH sides are explicit single-node captures (Figma
  variant COMPONENT vs story cell) and there are fewer than 3 anchors, the
  origins coincide by construction → identity, confidence 1,
  `alignment.basis: "element-pair"` (else `anchors` / `offset` / `none`).
  The S9 pure offset for that case ((8.1, −2.5) on the Button cell) was in
  fact absorbing half of a SIZE difference (impl cell 92×35 vs 76×40, label
  centred) into position; identity reports it honestly. Effect on the DS
  sets: 64/64 cells at confidence 1.00, the per-cell "pixel channel skipped"
  minor is gone, and the pixel channel measures the icons (13–24 % on the
  ×0.875-shrunk Button icons — within the 5px size tolerance so not a `size`
  finding, the diff is the resample of a 21 vs 24px glyph; 76 % on the two
  Loading spinners — real). Whether a size-tolerated icon should be
  pixel-diffed at all is the next calibration question (research.md).
- **Decoration hoisting tolerates icon siblings on BOTH sides — decided
  2026-08-27 (S11).** `[icon] LABEL` inside a filled frame is one labelled
  control; `<button><svg/><span>` / `<div class="alert"><svg/><p>` likewise.
  The DOM side already emitted `<button>` itself as the text leaf with its
  paint while the Figma label had an icon sibling and hoisted nothing → 29 of
  41 Button cells reported "design radius 0" and no background compared at
  all. Now `figma-tree.ts` and `extract.ts` both walk up through ancestors
  whose other visible children are all icon-like (svg / all-vector, ≤64px).
  Measured: Button false radius 29 → 6, the Hover/Active/Disabled background
  colors compare for real; the Alert frame's border and radius now reach the
  message on both sides.
- **`accepted` may name a `role` — 2026-08-27 (S11).** A `missing-element`
  has no expected/actual to match on; `{ type, role, reason }` narrows a
  type-wide acceptance to one element kind. First use: the Focus ring (Figma
  draws State=Focus as a stroked 84×48 box around the 76×40 button; the story
  forces `:focus` via a class and the ring is a CSS outline the extraction
  never emits) — 6/41 cells, visibly `accepted` in the DS manifest. **S12:
  `changeKind` too** — `{ type: "pixel-region", role: "icon", changeKind:
  "shape", reason }` accepts the story's placeholder glyph without accepting
  every future pixel difference on icons (a recolor still surfaces). Chosen
  over the equivalent `actual: { changeKind }` subset match because the
  manifest then states intent, not the finding's internal shape.
- **The DS Storybook renders everything at ×0.875 — observed 2026-08-27
  (S11), classified as one drift cause, needs a human.** Across 23 Alert
  cells every typography finding is 12.25/16.63 vs 14/19, every icon 17.5
  vs 24 (icon `size-5` = 1.25rem → 20 at a 16px root) and every gap 10.5 vs
  8 (`gap-3` = 0.75rem). population-registry
  `frontend/ds/src/styles/tokens.css` sets `:where(:host, :root) {
  font-size: var(--inn-typography-size-md) }` where Terrazzo emits `size-md`
  as `0.875rem` (14/16) — so the root becomes 14px and every rem token
  inside (`--text-base: 0.875rem`, spacing, sizes) resolves against 14
  instead of 16. One line, DS-wide effect, and a documented token-scale
  decision (the "rem is the default" block in that file) — the fix belongs
  to the DS owners; the harness's job was to find the one cause behind 66
  findings, which the set summary did.

- **Size-tolerated pairs stay pixel-diffed, scale-normalized — decided
  2026-08-27 (S12).** A 21 vs 24 px icon passes the 5 px `size` tolerance and
  then showed 13–24 % pixel difference on the Button set; the question was
  whether to skip such pairs or normalize. Measured (research.md §6b): the
  channel already resamples the design crop onto the impl grid, and the same
  content through that resample differs 2.5–3.7 % (< 5 % minor), while the
  13–24 % was a REAL glyph swap (Figma globe vs story plus-circle) a skip
  rule would have hidden. Nothing changed in the diff except the message,
  which now says "design 24×24 resampled onto 21×21" when the boxes differ.
- **`pixel-region` findings are sub-classified — built 2026-08-27 (S12),
  plan-next §4.** Pure `pixel/classify.ts`: `regionSignals(design, impl,
  mask)` over the two crops the diff edge already holds (design at the best
  shift on the impl grid, impl) → exact edge Dice inside the differing region,
  edge densities per side, edge-adjacent share, perimeter share, mean RGB
  delta, signed luminance delta, YIQ chroma cosine; `classifyChange` →
  `color | hue-rotation | shape | added | removed | stroke | noise`
  (thresholds and their evidence in research.md §6b). `MatchDiff` carries the
  crops; the finding gets `actual.changeKind` (+ `edgeCorrelation`,
  `meanColorDelta`) and a code-actionable message ("shape differs (edges do
  not line up — a different glyph or drawing), and the fill around it is
  recolored"). `aggregate` and the set `summary` group pixel regions on
  `(role, changeKind)` with the ratio as the spread — the Button set's 26
  pixel findings are ONE cause row ("shape, 26/41 pairs"). Severity stays the
  Argos ratio; `noise` is informational by construction (< 10 %, at most
  minor). Not adopted from interpret-native: its 0.50-confidence
  `content-change` default (it labels identical cross-render crops as
  changed); our floor is measured, not assumed.
- **Opacity is folded into colors on BOTH sides — decided 2026-08-27
  (S12).** The DOM extraction multiplies the effective CSS `opacity`
  (product from the captured root down) into the alpha of every emitted
  color (`rgb`/`rgba` comma syntax and CSS Color 4 slash syntax — Chrome
  emits `oklab(… / .4)` for Tailwind v4 alpha colors) and records
  `style.opacity` when < 1; the Figma adapter does the same with LAYER
  opacity (`node.opacity`, product down the chain, the captured variant
  COMPONENT included) on top of the paint opacity it already folded.
  Evidence: uctoinak's `disabled:opacity-50` CTA reported its full-strength
  `rgb(184, 92, 36)` (ΔE 35.4 vs the design's beige), now `rgba(184, 92, 36,
  0.5)` (ΔE 14.3 — still a real difference, now the right one); the DS
  Button State=Disabled variants draw at layer opacity 0.3 in Figma and
  `opacity: .3` in the story — without the fold on both sides the fold on one
  side would have invented 7 color findings. `colorDelta` flattens
  translucent colors over WHITE before ΔE2000 (a documented assumption for
  light UIs; the message keeps the raw strings so the alpha stays visible).

## Migration targets

Once the core works end-to-end on one real pair per source type:

- `uctoinak-bmad/tools/design-compare` → core with the `.dc.html` adapter
  (fixes: 404-as-success, no diff signal, no structured verdict).
- `population-registry/frontend/ds/tooling/visual` + annotator → core
  Figma adapter + `@visual-compare/annotator` (fixes: scale mismatch,
  three competing Figma mappings, fraction-based annotation fragility).
