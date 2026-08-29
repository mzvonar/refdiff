# Architecture

Design-vs-implementation comparison harness for AI coding agents. Two
packages, one repo:

- **`@refdiff/core`** — the deterministic comparison engine and
  agent-facing packaging. Zero UI. Usable standalone from any context
  (CLI, library, later possibly a thin MCP wrapper).
- **`@refdiff/annotator`** — split-screen design/impl review UI
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
  awaited; failure is a typed error. The canvas opens `CANVAS_SLACK` (120px)
  wider than the pair viewport so a fixed artboard never reflows against the
  window edge; a **fluid** frame (full-bleed page comp, width from the
  viewport) would grow into that slack and capture 120px wider than the impl,
  so `isFluidFrame` (pure, `adapters/scope.ts`) detects the frame reaching the
  canvas edge after hydration and the window is snapped to the exact pair
  viewport and the comp RELOADED there before capture (`CaptureScope.fluid`,
  printed as `scope … fluid`) — a resize alone leaves a comp's mount-time
  layout (a one-shot fit of its artboard) where the wider window put it.

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

Every stage that compares strings — anchor fitting, element matching, the
`text-content` check — goes through `structural/text.ts`, which collapses
whitespace and applies a deliberately narrow set of TYPOGRAPHIC FOLDS: marks
whose variants mean the same thing, where a difference could never be a
product bug. Today that is U+2212 MINUS SIGN → U+002D. Which of the two signs
a negative number carries is CLDR data (sv/fi/lt say U+2212, sk/cs/de/en say
U+002D), so comparing them raw reported every money row as copy drift and —
the expensive part — disqualified those strings as ANCHORS: on
`client-pending-accountant-desktop` the sign alone moved alignment confidence
0.55 → 0.35, under the gate that runs the pixel channel. A *missing* sign
(`−850` vs `850`) is still reported; that is semantics, not typography.

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
`artifacts.diffMask` is written from the REPORTED diffs only (the masks
behind the findings, painted on the impl canvas) and omitted entirely when
none reported — an all-diffs mask measured 95.6 % text-rasterisation residue
on a page pair: pixels no finding explains and no reader can act on.
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
- **Alignment identity note** (`structural/align.ts`, pure `alignmentNote
  (alignment, sameSize)`): on a same-size pair (`design.scope.fluid`, or raw
  design width = impl width) a fit that is not the identity is ONE boxless
  minor `alignment` finding whose `actual` is the transform, printed as
  `ALIGNMENT:`; `summary.md` shows every pair's transform in an `align`
  column. Its delta identity is the type alone (the numbers move), it
  never aggregates and cannot be accepted.
- **Regression ledger** (`package/delta.ts`, pure `recordResolved` /
  `findRegressions`; the CLI persists `resolved-ledger.json` in the run
  dir): every finding a run resolved is remembered by identity + place, so
  an introduced finding matching one — even three iterations later — is
  listed under `delta.regressions` and printed as `REGRESSION:`. A
  regression must also be ABSENT from the previous run under its identity
  (`findRegressions` gets `prev.findings`): a shared-text key whose count
  grew is introduced, not back. The loop's loud failure lives in the tool,
  not in the model's memory.
- **Accepted deviations** (`IgnorePolicy.accepted[] { type, expected?,
  actual?, text?, contents?, reason }`): intended differences the loop has
  reviewed (an app-wide token when one comp is the outlier) are suppressed
  as `accepted` with the reason as the visible rule — the "NL ignore policy"
  the skill needs, still never a silent skip. `contents: true` (manifest
  only) widens a rule to the textless findings whose boxes lie inside the
  finding it hit — a placeholder's bars — as `"<reason> (inside)"`; text in
  the region is never excused.
- `inspect` CLI subcommand (crop/zoom/sample-pixel) — NOT built: three
  loop iterations on doc-detail never needed a closer look than
  `expected/actual` + the crop pair.

**Decisions are policy, not comp edits (2026-08-28).** `refdiff accept
<run-dir> --manifest <file>` turns reviewed findings into `accepted` entries in
an `accepted.json` beside the manifest, which `compare` merges per pair (and
`--no-accepted` re-opens). Its input is either the annotator's triage — every
finding a person marked `ignore`, with the note as the reason — or one
`--finding <id> --reason "…"`. Two properties are the point: the rule is built
from the MEASUREMENT, so it lapses by itself when either value changes (an
edited comp would agree forever, including after a regression), and the finding
stays visible under `suppressed` carrying its reason. The command refuses what
it cannot record honestly: `position`/`spacing` (coordinates move every capture),
a finding with neither values nor text (the rule would forgive its whole role),
and an empty reason. `AcceptedDeviation.text` was added for the second case —
a `missing-element` carries no values, so text is the only thing that scopes it
to one element.

The **skill** — `skills/refdiff/SKILL.md` (canonical; installed per
consuming repo with a "Repo bindings" section, first in
`uctoinak-bmad/.claude/skills/refdiff/`) — enforces loop discipline:
run → classify every finding (data / drift / intended deviation /
environment / needs a human) → act on open annotations → fix → re-run →
read `delta`; bounded (5 iterations, diminishing-returns cutoff), a
`REGRESSION` stops the plan, the deliverable is a table of iterations plus
fixed / accepted / needs-a-human lists — never a description of a screenshot.

## Annotator

`packages/annotator` is the human half of the harness: the app a designer and
a reviewer open, and the place where the human gate (principle 4) is
exercised — notes for the model, triage verdicts on findings, a focus region.
It was redesigned against the RefDiff comps in `design/refdiff/` during
2026-08-28 (phases 0–6, `docs/plan-annotator-redesign.md`, each phase with its
measured numbers) and is **dogfooded**: the annotator serving the committed
fixture root `fixtures/demo-root/` is the impl under test in this repo's own
manifest (`design/refdiff.manifest.mjs`, bindings in `refdiff.bindings.md`).
Nothing below is an eyeball claim; every layout statement was closed against
`findings.json` and the survivors are named in the plan's phase 5 Numbers.

It reuses the best ideas of the population-registry annotator (split view,
point/rect annotations, phone-friendly zero-dep server, the
`open → implemented → done` designer/agent state machine) with one structural
fix: **annotations anchor to matched elements from core's element model**, not
image-fraction coordinates — recaptures re-project annotations through element
identity instead of fragile geometry migration. Rendered annotation digests
(marked PNG + text) remain the model-facing output.

### Information architecture (as built, 2026-08-28)

**One shell, two routes.** `--serve` ships ONE document (markup + CSS + client,
from memory) holding both routes and loads data at request time: the
**Library** at `/` (`GET /api/pairs` summarises every run dir) and the
**Comparison tool** at `#/<run-dir>` (fetches `<run-dir>/findings.json`; notes,
verdicts and the focus region ride on `/api/pairs/<dir>/{annotations,triage,
focus}`). Because the shell is one document, an id or class chosen for the
Library collides with the report's (`.badge` once painted the canvas badges'
digits invisible); index-route names carry a `lib-` prefix and a
`grep -n 'id="<name>"\|\.<class> ' packages/annotator/src/render.ts
packages/annotator/src/app-shell.ts` precedes any new name.

**Library** (`app-shell.ts` `#view-index` + pure `index-view.ts`): a 46px
brand-only topbar (accent square, "RefDiff", spacer, the theme toggle — the
comp's `computer` / `smartphone` button is its DESIGN-PREVIEW switch, not a
product control, and the app draws none since 2026-08-28: the width alone
picks the layout, the icon is excused by content in the manifest); the head
row `Library · N of M
comparisons`; a filter row — search over name + route, source chips Both /
Figma / Claude Design, state chips Any / Failing / Critical / Diverging / Low
confidence / Has comments; then the grid (`auto-fill, minmax(250px, 1fr)`) or,
under 640px or with the toggle, the row list. A **card** is the run's own
`impl.png` as its thumbnail band (decision D6 — the comp's grey plate is the
designer's stand-in; a run without a PNG gets the plate), the verdict pill
top-left (`Pass` / `Fail`, the deterministic gate — a percentage was
considered and refused: no similarity number exists in the pipeline and a
share-of-clean-elements would be severity-blind), the run-state pill
top-right, name + source chip, the mono route, severity dot-badges + comment
count, and a footer of trend + `+N new / −M resolved` + relative "when". Under
the 0.5 confidence gate the card carries a muted warning line — confidence is
a WARNING STATE, never a number (gap 2: it says how well the two sides could
be registered, not how similar they are). Order is newest first, ties in dir
order, unreadable times last — order before anything else, because refdiff
matches card N to card N and a different order reads as a finding on every
pill (phase 2: 208 → 101 findings from the sort alone). A run dir whose
`findings.json` cannot be read is `{ dir, broken: true, reason }` from
`parseReport` (which also `salvage`s `pair`, `createdAt`, `impl.ref` from a
file cut mid-write) and is drawn as the dashed degraded card with the real
parser message — never dropped, never a 500 for the set (the fifth principle
applied to the list). Two typed load-failure states (server gone / endpoint
errored) with the real error line, the out-root path, Retry, a copy-restart
button and an auto-retry countdown ship from spec, unmeasured. There is NO
`Pending` state or chip: a run dir exists once `compare` wrote it, and a chip
that can never match is worse than a missing one (the comp's `Pending` /
`Processing` / `Queued` vocabulary is excused by policy in the dogfood
manifest). The card has no source line and no absolute timestamp (D7); the
relative time is the wall clock, which is why the dogfood fixture is shifted
with `make-demo-root.ts --now` before a measure.

**Comparison tool** (`render.ts` `REPORT_BODY` + `CSS` + `CLIENT`, pure
`view-math.ts`, `rail.ts`, `annotations.ts`, `triage.ts`, `focus.ts`):

- **Topbar (46px):** `arrow_back` to the Library, brand square, "RefDiff", the
  pair title; three segmented groups — **Split / Full** (`state.single`;
  Full is one side at a time over the same shared view, with a floating
  Design / Impl fab), **Off / Wipe / Onion / Blink / Diff** (the
  superimposition, below) and the layer group **Findings / Comments / All /
  Clean** (`state.layer`; Comments off hides comment shapes, never the focus
  region); the theme toggle — on the phone a **settings popover** instead
  (Layout Minimal / Default over Theme Dark / Light, the comp's 2026-08-29
  header). Left and right are equal flex shares (the comp's `flex: 1 1 0`),
  so the groups centre on the screen. The pair verdict, c/M/m counts and source lines
  are NOT here (gap 14) — they live on the Library card you came from; the
  refs and the fit's numbers live in the pane labels' and align pill's
  `title`s.
- **Delta strip** under the topbar, only when the run has a delta (gap 15:
  impossible to miss): mono run label, `+N introduced` / `−M resolved`; on a
  regression the red tint + 3px edge, "N regressions · fixed earlier, back
  again — fix plan halted" and **Review**, which narrows the list to
  `delta.regressions`; a × dismisses it for the run in BOTH states (the comp
  hides the × while a regression shows; decided otherwise 2026-08-28).
- **The lockstep lock is in every view** (2026-08-29, after briefly hiding
  it outside split): an overlay draws the design ONTO the impl even with one
  pane, so unlocking or changing the anchor mode is exactly the fix for a
  bad landing. In the minimal phone layout its row lives in the align menu.
- **Fit and focus centre in the VISIBLE canvas** (`paneInsets`, `view-math.ts`,
  2026-08-28): a panel drawn over the pane along a full edge — the phone's
  bottom sheet, 44px closed / 52% open — is an inset; floating pills (a
  corner) and the desktop's sibling rail / tool strip (no overlap) are not.
  The sheet's height transition re-fits an untouched view when it ends. The
  comp centres under its sheet (gap 35); the phone's badges read 22px higher
  than the comp's on purpose. The phone also hides the "N highlighted
  differences" pill (under the zoom / align pills); the stretch warning stays.
- **Tool strip** (44px, left; a floating pill bottom-left on the phone):
  `pan_tool` move · `add_comment` comment · `center_focus_strong` focus ·
  `difference` Highlight · `tonality` Dim · `flare` Strobe. Floating over the
  canvas: the **zoom pill** (`−` / mono `NN%` / `+` / `fit_screen`), the
  **align pill** (lock + mode + chevron, the amber `warning` treatment under
  the 0.5 gate on Anchors only — the other modes are fixed geometry) with its
  dropdown (Anchors / Width / Top left / Top right, `check` on the active
  one), the **opacity pill** for Onion and Diff (one amount per blend,
  `labAmount`), and a top-centre slot shared by the **focus chip** ("Region
  focus · N of M findings · Clear") and the `lab-note` pill (the stretch /
  highlight-count notes).
- **Canvas:** two `--canvas` panes with mono-caps `DESIGN` / `IMPLEMENTATION`
  labels (hidden while an overlay is on, and on the phone). Marks are the
  comps' badges as HTML divs, never SVG text (the extractor never saw an SVG
  number — 22 digits measured missing until they became DOM): 24px severity
  circles at the box's top-left, 18px hollow ones for repeat instances, 22px
  rounded squares in the status colour for comments, drawn on BOTH panes (a
  note placed on the impl was invisible on a phone showing the design). The
  box itself is outlined only while selected, or through Highlight / Dim.
  `showMembers` defaults to false (gap 12: a ×15 aggregate carpeted the
  artboard); the rail's `Primary only · N` / `All instances · M` chip flips
  it. `fitView` is the comps' fit (24px air, capped 1.6×). Selecting a finding
  focuses the canvas on its element (gap 13): the canvas IS the crop, at full
  resolution and in context — there are no crop thumbnails in the UI, and the
  crop PNGs stay in the run dir for the model.
- **Review rail** (320px, RIGHT; `right_panel_close` collapses it to a
  floating `right_panel_open` + summary chip): `REVIEW`, tabs `Findings · N`
  / `Comments · N`. Findings: severity chips with dots and counts (+ `Ignored
  N` / `Snoozed N` only when triage exists), the instance chip, one **row per
  finding** — 20px badge, title, `×N` mono chip, the `undo` **REGRESSION**
  pill, the triage tag, and the mono `prop expected → actual` line with the
  actual in the critical colour (`rail.ts` `propRows`: CSS spelling, px on px
  keys, a `position` finding as its shift `translateY 0px → 23px`, a `size`
  finding as width/height). Selected, the row unfolds the instance box, **To
  fix / Ignore / Snooze** (the active one again clears) and the "Note for the
  model…" input. At the foot, the **suppressed disclosure** (gap 10:
  `visibility` "N suppressed by policy rules" · Show / Hide; rows with the
  hollow dashed badge, `filter_alt_off` + `<suppressedBy> · <rule>` from
  `findings.json`, the manifest note when selected — no Unsuppress / Edit
  rule button, because a suppression is a FILE in the consuming repo, not app
  state). Comments: the draft composer (Point / Region, "Instruction for the
  model…", Cancel / **Send to model**), rows with the status badge + `OPEN` /
  `IMPLEMENTED` / `DONE`, the text and the model's **reply** block, and when
  selected "Add another instruction…" + Send (appends ` — <text>` and
  reopens; the reply stays as history) / Mark done / Reopen / Mark
  implemented / Delete. A failed save shows on four surfaces (section C of
  the plan): the row (`cloud_off` **Not saved** + the REAL
  `PUT /api/pairs/<dir>/annotations · <status>` + Retry, red tint + inset 3px
  edge), the canvas badge's red halo, and `· N unsaved` in the phone sheet's
  summary; a triage row gets the same, a failed focus PUT is named in the
  rail's status line (the one line at the foot, otherwise hidden). The
  finding text filter survives as `/` (a search row above the chips; nothing
  drawn in the default state — gap 31).
- **Phone (< 760px, the comps' breakpoint):** the rail is the comps' bottom
  sheet (44px grip + `N findings · M comments` + chevron, 52% when open) over
  a FIXED canvas — the page does not scroll; Full mode is forced; the layer
  segments sit under the topbar behind a "Show" label; the tool strip is the
  floating pill. Under 1120px the layer labels shorten (`Find.` / `Comm.`)
  and the pair title drops. **Two phone layouts** (2026-08-29, plan §7),
  chosen in the settings popover, persisted as `vc-controls.layout`, preset
  for one load by `?layout=minimal|default` on the URL, ignored on desktop:
  *default* is the above; *minimal* (`body.layout-minimal`, the RefDiff
  Mobile Minimal comp) folds the Compare / Show segments into a panel behind
  a `tune` button in a 44px header, drops the layer strip and the zoom pill
  (the delta strip stays — the comp omits it, gap 36), puts the tool strip + Fit,
  the Design / Impl SWAP and the rail button (count badge) in one bottom row,
  makes the align control icon-only (a "!" badge for the warning, its
  lockstep row in the menu) and the rail a 58% sheet that is off screen
  while closed; fit margin 16 (the default's 24).
- **The icon font is a DERIVED subset.** `assets/fonts/material-symbols-
  outlined.woff2` holds exactly the glyphs the comps and the app use
  (the generated `src/icon-names.ts`, 93); a glyph outside it renders as its
  NAME in letters and measures as such (`"settings" renders 152×23`,
  2026-08-29). `node packages/annotator/scripts/icon-subset.mjs` rebuilds
  both from the sources (`--check` reports drift); run it whenever a comp or
  the app gains an icon. The font URLs are `fonts/<v>/<file>` with `<v>` a
  hash of that list: the CLI serves the faces with `max-age=86400`, and a
  re-subsetted face under an unchanged URL kept rendering the old subset on
  a phone for a day (2026-08-29) — a new list is a new URL.
- **Keyboard:** `j`/`k` next/previous finding, `[`/`]` step the highlighted
  boxes, `a`/`A` cycle align, `l` lock, `d`/`g`/`s` Highlight / Dim / Strobe,
  `b`/`o`/`w`/`x` blink / onion / swipe / difference, `n` annotate, `/`
  search, `+`/`-`/`0` zoom, `Esc` clear. Every tool's `title` carries its key;
  a drawn hint has no home in the comps yet (gap 18, deferred — a design
  question, not code).
- **View controls persist** in `localStorage` under `vc-controls` (align,
  lock, layer, members, suppressed, single/side, move, triaged, rail, diff,
  dim, strobe, lab + amount, theme): a preference, not per-pair state, so it
  follows you from pair to pair. The chrome never zooms (`user-scalable=no`,
  `touch-action:manipulation`, `gesturestart` refused for iOS); the panes run
  their own pan/pinch under `touch-action:none`.

### The view model — what does not change with the chrome

**One world space = impl CSS px** (the space every `Finding` box already
uses); one shared `View { z, tx, ty }` drives both panes (`viewD` is the
design pane's own only while the align lock is off — gap 22 — and locking
snaps it back). The impl PNG maps in through its DPR, the design PNG through
its DPR and then the `Alignment` (offset + per-axis scale), so pan/zoom on
either side moves both and the same UI lands at the same screen point.

**The design image was drawn `alignment.scale`× off — 40 of 41 pairs
(2026-08-27).** `report.design.width` is the capture NORMALIZED onto the impl
(raw CSS × `alignment.scale`), while `designPng` stays the RAW capture; the
viewer inferred its DPR as `naturalWidth / design.width`, i.e. `dpr /
alignment.scale`. The tell was arithmetic: every inferred DPR times its
`alignment.scale` came to exactly 2.000. `designCaptureDpr` (view-math,
unit-tested) multiplies the scale back in and the report records
`design.dpr` / `impl.dpr`. The same double-scale sat in `designWorldBox`, and
`rawDesignSize(design, alignment)` undoes the normalization at the one place
that needs raw px. Rule for this codebase: `report.design.width` is
world/normalized px; the PNG and `designToWorld` / `designWorldBox` are raw
px. Mixing them is silent — both halves render *something* plausible.

**The UI never stretches the reference (Mato, 2026-08-28).** `align` fits x
and y independently, which is right for locating things and wrong for showing
them: across uctoinak's corpus that projects designs +53 %, +38 %, +32 %,
+16 % taller than drawn, and a person could not know it. So the stretch stays
in the DATA (finding boxes, matching, the delta) and never reaches the screen:
`projection()` drops it, and there is deliberately no toggle. Undoing it for
display means moving the design's MARKS with its image: `designLayerTransform`
applies the inverse stretch about `offsetY` to the design layers
(`projectionAlignment` does the image; both unit-tested to land a design point
at the same world y). The cost is stated, not hidden: the pane label reads
`· true aspect (fit +16% vertical)`.

**Registration IS a preference — four align modes (Mato, 2026-08-28).**
`state.align` cycles `anchors` (the run's fit, aspect-locked — the default) →
`width` (frame scaled onto the impl's width, corners at the origin) → `left`
(1:1, top-left) → `right` (1:1, top-right, for frames that differ by a
left-hand rail); every mode is isotropic. The fit is a regression over matched
text, so on a page whose two sides differ structurally it lands the whole
frame tens of px off — the corner modes are the manual answer to that, not a
second opinion about the stretch. Everything the design side draws goes
through ONE re-map, `alignRemap(run, display)` (per axis `k = display.scale /
run.scale`, `t = display.offset − k·run.offset`), so marks stay glued to the
image in every mode; it runs in reverse (`worldFromShown`) on every pointer
that lands on the design pane, because shapes are stored in RUN world space.

**Marks stack, so the selected one is drawn last**; while a selection is
active everything else drops to 25–35 % opacity.

### The diff lab

Over the split screen sit Chromatic's reading aids, driven by our channel
rather than a raw pixel diff: **Highlight** outlines EVERY listed finding's
box plus `Finding.regions` (the presence findings a box-scoped pixel diff
structurally cannot see) on both panes; **Dim** punches those boxes out of a
dark sheet (an SVG mask, 6px round each box); **Strobe** pulses and wiggles
them (hard stops at 50 % — `steps(1) … alternate` sampled the same keyframe
both ways and never moved — and the second state changes `stroke-width` as
well as `translate`, because a 1px world-px wiggle is sub-pixel at fit zoom);
`[` / `]` step through them; and one superimposition (**Wipe / Onion / Blink /
Diff**) draws the design over the impl pane — Wipe is a curtain at a WORLD x
with the comps' `sync_alt` knob. Why it cannot simply mirror Chromatic:
Chromatic compares two renders of the same code, so every differing pixel is
signal, while a comp against an implementation is rasterised at a different
scale — 95.6 % of one page pair's raw mask lay inside text. Regions therefore
come from the reported findings, never from the raw diff. The superimposed
ghost uses the run's FULL alignment (per-axis stretch included) because a
blink against a frame that does not land on the impl compares nothing; the
design PANE keeps refusing that distortion, and the lab-note pill says so.

**One annotate gesture.** The pointer-up decides the shape by drag distance,
so click = point, drag = region, with the live band appearing exactly when
the drag crosses the same threshold that will save a rect. The threshold is
in SCREEN px, since at a fit-to-phone zoom a 3-world-px wobble is under two
real pixels. On the phone the mode is held until the tool is toggled back
(`ann.sticky`).

### Annotations — the model (`annotations.ts`, pure)

`Annotation { id, side, shape: point | rect (world = impl CSS px), anchor?
{ elementId, role, text, box }, note, reply?, status, timestamps, stale? }`
in an `AnnotationSet { version: 1, pair, annotations }`. Snapping
(`snapToElement`): a region → the element with the largest
intersection-over-union (a loose rectangle around a button means the button,
not the label under its centre); a point → the smallest element containing
it, else the nearest within 48px; `backdrop` leaves never anchor. State
machine (`transition` / `editNote`): `open → implemented` (the agent, via
`refdiff-annotator --mark-implemented <ids> --reply "…"` — `reply` is the
model's one line under the comment, gap 19) `→ done` (the designer); `reopen`
from either; appending an instruction to an implemented note reopens it (the
spec changed). Re-projection (`resolveAnchor` / `reproject`): on every CLI
start the stored set is resolved against the CURRENT `elements.json` — same
id with the same text, else the same text+role nearest, else same-role
geometry within 40px — and the shape moves by the element's delta; an
unresolved anchor marks the note `stale` (kept at its last place, never
dropped). Digest for the model: `annotations.md` (numbered, grouped open →
implemented → done, anchor description + world coords, `↳ reply:` lines) and
`annotations-design.png` / `annotations-impl.png` (the full PNGs with numbered
markers at native resolution — the design side through the inverse
Alignment). Effects live in `cli.ts`: `annotations.json` (atomic write),
`GET/PUT` on core's `serveDir` via its `handle` hook (validate → persist →
re-digest, last write wins — multi-reviewer is last-write-wins by design),
sharp for the PNGs. The page saves to the API when served, to `localStorage`
otherwise (and says so).

### Triage — a verdict on a FINDING, keyed by identity (2026-08-27)

Annotations answer "here is something I want changed"; triage answers "what
about the thing you already told me" — `fix`, `ignore` or `snooze`, plus a
note. It is filed against `Finding.key`, which `packageForModel` stamps from
the delta's `identityKey`: ids and marks are renumbered every capture, so an
id-keyed verdict would silently attach to a different finding on the next
run. Consequence worth knowing: two findings with the same type, role and
text share one key and therefore one verdict — the same property that makes
the delta stable. A snooze carries a horizon and reads as untriaged once it
passes. Stored per run dir in `triage.json` (+ `triage.md` for the fix loop)
behind `GET/PUT /api/pairs/<pair>/triage`; pure in `triage.ts`. Findings from
reports written before `key` existed cannot be triaged, and the row says so
rather than inventing a handle. `refdiff accept` turns every `ignore` verdict
into an `accepted.json` decision beside the manifest (SKILL.md §3a).

### Focus a region (2026-08-27)

Drag a box on the canvas and the list, the marks and the counts narrow to it
— the way to read one column of a screen without the chrome's findings
burying it. A filter over WHERE a finding is, not over what it is; the LIST
test lives in `visible()` alongside severity and search, so list and canvas
cannot disagree. The canvas test is per BOX, not per finding: an aggregated
finding can have instances in the content AND in the header, so admitting the
whole finding drew its header marks straight back — `renderMarks` filters the
primary box and every member through `boxInFocus`. A tap rather than a drag
clears instead of focusing a 1px region. The region is editable (`focus.ts`
`handleAt` / `resizeRect`, four corner handles + a centre grip, a minimum size
so a corner dragged past its opposite cannot strand its own handles; the body
stays inert so a drag inside it still pans) and it is an ARTIFACT: `focus.json`
+ `focus.md` (`GET/PUT /api/pairs/<pair>/focus`) state the rectangle in impl
CSS px, how many findings fall inside, that everything outside is out of
scope, and each in-scope finding by mark, severity, message and key — "let's
work in the focused region" means the same rectangle to the agent as on the
phone.

### The app, its server modes, and what a measurement sees

**The annotator is an app, not a site generator (Mato, 2026-08-27).** It used
to re-render a self-contained `report.html` into every run dir on each start
— 41 files / 5.1 MB for the uctoinak set; the cost was never the time but
that the app's own code was baked into every artifact, so each change needed
a regenerate and N copies went stale independently. `--serve` ships the one
shell above; a pair captured after the server started appears on reload.
**The running server never re-reads `dist`** — it rendered its shell at
start — so an annotator edit is invisible until it is restarted
(`svc restart annotator`), a phantom every redesign phase hit once.

**`--serve --read-only`** (pure `read-only.ts`, harness item 16) refuses every
write under `/api/` with 405 and flags `readOnly` on `/api/pairs`; a refused
save reads as the app's own sentence on the row that lost it. Nothing is
announced up front — **anything the served app shows for the harness's sake
is measured**: an up-front read-only status line was an element the comp does
not draw and shifted the rail by +6 findings. A measured impl renders EXACTLY
what the writable app renders; harness-only affordances appear on interaction
or go into the comp too. This is the mode for a committed fixture or an impl
under measurement, both of which the writable server used to dirty.

**`--emit`** (the default when not serving) writes the self-contained
`report.html` (+ `index.html` for a set) for reading a report off disk with no
server; the served API also answers the emitted file's own
`<pair>/api/annotations` shape. The client is shared verbatim between both
deliveries — it takes its data through `openReport(report, notes, page)` and
prefixes artifacts with `page.base`, so it never learns which mode it is in.
Paid for once: the client's module dependencies must be embedded by BOTH
renderers — `renderReport` and `renderAppShell` each take every import-free
module (`view-math`, `annotations`, `triage`, `focus`, `rail`) and
`render.test.ts` asserts each source is present, because an emitted
`report.html` threw a `ReferenceError` for weeks after triage/focus were added
while the served app worked. The emitted file has no `/fonts/` server, so its
type falls through to the system families — deliberate (below).

### Tokens, theme, type, and the comps' box model

**Tokens and theme (phase 1).** The chrome uses the comps' token set under the
comps' names (`--bg0..3 --line --txt --txt2 --acc --canvas`, severity
`#e5484d / #f5a623 / #4c9aff`, statuses `#8f7ee7 / #f5a623 / #46a758`,
Highlight `#ff5cd0`), dark on `:root` and light as a `body.cc-theme-light`
override behind a manual toggle in both topbars. **Light is never captured
by refdiff** (gap 20): no light frame exists in the design, so light parity
is not gated — the toggle is a user preference, shipped unmeasured, like the
error states, the unfolded rows and the open menus (the comp captures its
default state; each was exercised headlessly for console errors, which is not
a parity claim). `button, input, select, textarea { font:inherit }` — the
toolbar measured as Arial 13.33px until then.

**Type is self-hosted.** IBM Plex Sans (variable, latin + latin-ext), IBM Plex
Mono 400/500 and a 52-glyph Material Symbols Outlined subset ship as woff2 in
`packages/annotator/assets/fonts/` (196 KB) and are served on
`GET /fonts/<file>` (whitelisted in `fonts.ts`, which owns the `@font-face`
rules and the comps' `.msi` rule). The app must look right offline; the comps
hydrate from Google Fonts and unpkg, but that is the design's excuse, not the
app's. The glyph list is regenerated from BOTH the comps' markup and their
state arrays (a third of the names live in `toolBtns` / `layerBtns`), and the
Fonts API's `icon_names=` request rejects a non-icon word, so the fetch is the
check; a missed glyph renders as its name in letters. `--emit` decision:
degrade — inlining ~200 KB of base64 into every per-run artifact is the bloat
the app shell exists to avoid.

**The comps are content-box; the app is border-box (phase 5).** `support.js`
sets no `box-sizing` reset, so a comp div with `height:46px` and a 1px border
is 47px; the app's `* { box-sizing:border-box }` rendered 46 and the whole
chrome sat 1–2px short — visible as nothing in the findings and as
`offsetY −1.98` in the alignment. Every app rule that copies a fixed size
from a bordered comp box is written as the comp's number plus its border
(`calc(320px + 1px)`; the convention is stated once above the reset in
`render.ts`). The Library card's `.thumb` was the same miss in a REPEATED
box (132 + 1 px, once per card row), which the fit absorbed as `scaleY
0.9966` rather than an offset — an offset is one box, a scale is one box
per row; found 2026-08-28 by undoing the fit on `elements.json` and walking
`impl.y − raw.y` down the page (the skill's §1a). The comps' runtime interpolates every `{{label}}` as its own
text node, so chip and tag labels are their own `<span>` inside the button
(the extractor's leaf is the text, not our bordered element), and the rail
and Library run `line-height:normal` (the comps set none; the report's 1.4
made every chip, tag and prop line 1–2px taller, compounding down the list).
Marks are HTML, not SVG text, for the same extractor reason.

### Scope: the labelled element IS the screen (2026-08-27)

The area rule ("chrome is thin strips of text, the UI is the big box") cannot
tell a frame that WRAPS the screen from a frame that IS the screen. `.dc.html`
comps are written both ways — `documents.dc.html#8a` is `<div id="8a">` around
a labelled screen, `org-detail.dc.html#2a` is the labelled screen itself — and
on the second shape the rule descended one level too far and kept only the
largest column. Measured across uctoinak's 41 comps: three desktop pairs lost
the app's 232px sidebar entirely, ten more lost the frame's own border and
padding — which also pinned those pairs at 0.00 alignment confidence. There is
nothing Claude-Design-specific to blacklist: `support.js` wraps only the
DOCUMENT (`x-dc`, `dc-root`, `dc-canvas`, `.sc-host`) and injects no per-frame
chrome. The marker to use is the authored one, `data-screen-label`, which
sits on the screen root under both comp shapes. So scope resolves explicit →
`data-screen-label` (frame, else its single labelled descendant) →
largest-child → frame. Two labelled screens in one frame stay ambiguous and
fall through to the area rule, as do unlabelled artboards.

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
- **A `fonts-not-loaded` capture error** (principle 3, from the annotator
  redesign phase 1). The `typography` channel reads the computed family,
  which is the declared stack's first name whether or not its file loaded, so
  a 404'd `@font-face` is invisible to every finding. The adapter could read
  `document.fonts` after the load wait and hard-stop (or annotate the capture)
  when a declared face is not `loaded`. Not built; the skill's pre-flight
  carries the manual check.
- **Text runs inside a styled parent** (phase 2 / phase 4). The Claude Design
  runtime renders every `{{interpolation}}` as its own text node, so the comp's
  leaf for a chip label carries no border while an impl's
  `<button>Label</button>` does; today the impl mirrors the comp's markup
  shape (label in a span). The extractor could instead treat a parent's own
  text run as a leaf without the parent's decoration on both sides, which
  would make the comparison markup-shape-agnostic. Decide after the redesign
  lands; measure the phantom `border` count on a real set first.
- **Annotator redesign — decided with Mato, 2026-08-28 (phases 0–6,
  `docs/plan-annotator-redesign.md`; the built IA is the "Annotator" section
  above).** Full adoption of the RefDiff comps AND every existing feature
  kept — nothing dropped to make a finding go away. The dogfood fixture lives
  in `fixtures/demo-root/` (`out/` is ignored wholesale and stays that way).
  D6: the card thumbnail is the run's own `impl.png`, the comp's plate is the
  designer's stand-in (excused by `accepted[].contents: true`). The card's
  pill is the deterministic VERDICT, not a percentage; alignment confidence is
  a warning state under 0.5, never a number. No `Pending` run state (a run dir
  exists once `compare` wrote it). The card's time is the wall clock, so a
  measure shifts the fixture with `--now`. No crop thumbnails in the UI — the
  canvas focuses on the selected element; the crop PNGs stay for the model.
  The pair verdict header is dropped from the comparison tool (it is on the
  card). The suppressed disclosure has no Unsuppress / Edit-rule — a
  suppression is a manifest file, not app state. Light theme, the error
  states, failed-save surfaces and every non-default state ship UNMEASURED
  (the comp captures its default state; no light frame exists). The Tool
  comp's `showDeltaStrip` default is true — flipped locally on 2026-08-28
  (gap 29), in the remote project since the 2026-08-29 refetch; the same
  refetch draws the × in the regression state, so the app's 2026-08-28
  "closable in both states" decision needs no rule any more. The finding
  text filter is `/` with nothing
  drawn; the keyboard-shortcut hint has no drawn home (gap 18, deferred — a
  design question). What still holds `refdiff-compare-desktop` at 32
  findings is the comp's demo data, on Mato's side: its row order (gap 32,
  ≈26), the two cause lines (26, ≈13), `saveErr` on `c2` (34) and the
  `Pending` chip on the Library (24, 6) — plan section H, each with its cost.
- **Harness-only affordances are measured — decided 2026-08-28 (item 16).**
  An up-front "read-only" status line cost +6 findings on the rail; a
  measured impl renders exactly what the production app renders, so anything
  shown for the harness's sake appears only on interaction (the refusal on
  the first save attempted) or goes into the comp too. Same rule for a debug
  chip or a build stamp in a consuming repo.
- **A matcher upgrade invalidates a run dir's ledger — open, 2026-08-28
  (item 15).** Pass 1b changed what several findings ARE, so
  `resolved-ledger.json` entries written under the old pairing read as
  `REGRESSION: 8` on a run with no app change; item 12's "absent from the
  previous run" test cannot help (under the new pairing they were absent).
  Candidate: stamp the ledger with an identity version
  (`ResolvedLedger.identity`) and, when the running version differs, print
  "ledger written under an older pairing — its N entries are not comparable"
  and drop them visibly. Not built; `SKILL.md` §4 names the shape (check
  `resolvedAt` against the upgrade). Build it if the churn recurs.
- **The comps are content-box — Mato's information, not a request.** A
  `* { box-sizing:border-box }` in `support.js` would make the comps' numbers
  mean what they say, but it is a runtime change; the app matches box by box
  (`calc(<n>px + <border>)`, "Annotator" above).
- **`delta.ts` and N same-text findings — decided 2026-08-28 (plan-next
  §12).** When several findings share a text (two `#6B7280` prop lines) and
  the pairing re-shuffles, the key's count goes 2 → 1 → 2 and one instance
  enters the ledger, then reads as "back" — every annotator phase spent a
  paragraph on it. A regression now requires the finding to be absent from
  the PREVIOUS run under its identity (key; key + box for a textless one),
  and a text-keyed ledger entry needs its box when the key is not unique in
  the run. Multiplicity changes are `introduced` only. The box stays a
  tie-break for a unique key so a fixture shift cannot un-regress a real
  regression. Tests in `delta.test.ts` name the case.
- **A non-identity fit on a same-size page is a finding — decided 2026-08-28
  (plan-next §13).** For five annotator phases the fit absorbed `scale
  1.00175, offset (−0.54, −1.98)` — the comps' content-box chrome — and
  nothing reported it; it was found by hand from a 1 px on the phone sheet.
  Now `alignmentNote` emits a minor boxless `alignment` finding when the
  sides are the same size (a fluid frame is rendered AT the viewport; a
  Figma frame of another size is layout, not scale, and gets none), with
  `|scale − 1| > 0.0005` / `|offset| > 0.5 px` as the epsilon (0.0005 × 800
  px = 0.4 px). A new `FindingType` member rather than a `pixel-region`
  note: it is neither a region nor an element. Not accepted-able — the fix
  is the size difference it names.
- **Same-text pairs before nearest-box — decided 2026-08-28 (plan-next
  §15).** `matchElements` pass 1 pairs UNIQUE texts by content; "Figma" /
  "Claude Design" repeat on the Library's cards, so pass 2's greedy γ paired
  design "Claude Design" (x 435) with impl "Figma" (x 446) after the undrawn
  `Pending` chip shifted the row 78 px — a text tie only broke EQUAL γ — and
  one cause became six findings. Pass 1b now assigns candidates sharing a
  normalized text greedily by γ within `textMaxGamma` (2 × `maxGamma`, Mato
  2026-08-28) before any mixed-text candidate; the band keeps a `5` badge
  from pairing with a `5` chip three rows away. `via: "text"` on those
  matches. Measured on the four dogfood pairs and the uctoinak doc-detail
  baseline before merging (numbers in plan-next §15).
- **`accepted[].contents: true` — decided 2026-08-28 (plan-next §14).**
  Decision D6 (the thumbnail is the run's own `impl.png`; the comp draws a
  grey plate with bars) cost 8 findings forever: the bars are textless boxes
  `acceptedFromFinding` rightly refuses, and a `regions` entry has no reason
  and never expires. What identifies them is their container. A rule with
  `contents: true` also suppresses every TEXTLESS finding whose boxes lie
  within the boxes of the finding it hit (both boxes of a paired finding —
  the mobile plate is matched to the tile — one world space, 1 px slack),
  visibly as `"<reason> (inside)"`, decided from the first pass's hits so
  contents never excuse each other. Boxes only (Mato, 2026-08-28): the
  artboard's step numerals stay visible as the price of never hiding a badge
  drawn over the region. Manifest-only: `refdiff accept` never writes it,
  and `upsertAccepted` preserves a hand-added one. Content-shaped: the rule
  names the element and expires with it.
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
  `@refdiff` is free as of Aug 2026).

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
  pairs. `renderSummary` is Markdown. `refdiff summary <out-root>`
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
  Figma adapter + `@refdiff/annotator` (fixes: scale mismatch,
  three competing Figma mappings, fraction-based annotation fragility).
