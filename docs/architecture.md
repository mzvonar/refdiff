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
- **Figma**: REST renders (PNG at declared scale) + node tree (boxes,
  text) + variables/tokens. Records file key + node id + version so ref
  provenance is never lost. Extraction quality is scored; missing
  variable bindings degrade the score and below a threshold the run
  hard-stops (Kaelig's GIGO gate).
- **Claude Design `.dc.html`**: rendered via Playwright. Since the canvas
  is HTML, this adapter also yields DOM boxes + computed styles — the
  richest ref source. Hydration is verified (no `{{…}}` remnants), fonts
  awaited; failure is a typed error.

Implementation side:
- **Storybook**: per-story iframe capture with error-page detection.
- **Live URL**: navigation + auth hook, with 404/error/login-redirect
  *content* detection (not just navigation success).

All captures: viewport matched to the design frame, DPR recorded,
animations disabled via injected CSS, `document.fonts.ready`,
capture-until-stable, render-completeness check.

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

AA-aware perceptual diff (odiff / pixelmatch v7) **inside matched element
boxes** and on the aligned frame; diff mask clustered into bounding boxes
(looks-same `diffClusters` or own connected-components); multi-threshold
passes for severity (Argos pattern). Runs only when alignment confidence
is sufficient; low confidence is itself reported. `@blazediff/agent` is
under evaluation as the packaging/engine for this channel — at minimum
its verdict/tiles protocol is the reference.

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
- **Relative verdict** vs the previous run (resolved/introduced findings).
- `inspect` CLI subcommand (crop/zoom/sample-pixel) for model-driven
  closer looks.

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
- `@blazediff/agent` as a dependency for the pixel channel vs odiff +
  own packaging.
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
