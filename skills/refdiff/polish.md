# The POLISH loop — the two sides correspond, now close the gap

`report.phase` says `polish`: the two surfaces already contain the same things, so the
element-wise findings mean what they say. This is what refdiff exists for — the 2 px offset and
the ΔE 3 colour delta a model cannot see. `SKILL.md` holds the rules, the pre-flight, §0 and §1;
this file is the rest of the loop, §1a through §6, plus the per-finding-type checklist at the
end.

**The rule that is binding HERE and is scoped to here: never eyeball two screenshots, and never
hand-derive a layout by reading the comp's source.** Every claim in this phase is a number from
`findings.json`. (In `reconcile` reading the comp is step one — that file says why, and the
ban does not reach it.)

If the run expanded a set, read `sets.md` first: iterations count per SET, and the set summary
is what you read instead of forty `findings.json`.

### 1a. Read the ALIGNMENT before you read a single finding

`alignment.confidence` decides whether any of the findings mean anything.
Below **0.5** the pixel channel does not run and element matching degrades, so
a low-confidence pair's `position` / `size` / `missing-element` findings are
mostly artefacts. **Fix the alignment first; never "fix" code against a
low-confidence report.**

Confidence is `(agreeing / anchors) × min(1, anchors / 8)`, where an ANCHOR is a
string occurring exactly once on each side that matches after normalisation, and
"agreeing" means the fitted transform lands it within 10px. Two consequences:

- **Anchor supply is content, not code.** If the comp's demo data differs from
  the fixture/seed, there is nothing to fit. `min(1, anchors/8)` also caps the
  score outright: 3 anchors can never exceed 0.375 however well they fit. The
  fix is to make the fixture render the comp's data — this is usually the single
  biggest lever on a page pair, worth more than any number of policy tweaks.
- **A low score names its own cause.** The run line prints `x <n> / y <n>`
  whenever one axis fits much better than the pair, because `confidence` counts
  an anchor only when BOTH axes land it. Read that split:

| reading | means | do |
| --- | --- | --- |
| `confidence 0.00`, `basis: none` | fewer than 3 shared anchors | seed/fixture the comp's data |
| high `y`, low `x` | lines up vertically, packs differently across | a row's content width differs, or a control moved side to side — check the widest row and the nav |
| high `x`, low `y` | columns agree, vertical rhythm does not | a section is taller/shorter, or the capture height ≠ the comp height (`app.viewport.height`, `app.fullPage`) |
| both low, anchors ≥ 8 | the two layouts genuinely disagree | pin `ignore.scope` to the region that DOES correspond, then re-read |

To see the anchors yourself, intersect the unique texts in `elements.json`
(`design` / `impl`): the ones that match are your anchors, and the design-only
list is the shopping list for the fixture.

**Then read the TRANSFORM, not only the score.** On a same-size pair (a fluid
comp rendered at the pair viewport — `scope … fluid` in the run log — or a
design frame whose css px equal it) the fit has nothing legitimate to absorb,
so a non-identity transform IS a finding: the run emits one boxless minor
`alignment` finding (`expected { scale: 1, offsetX: 0, offsetY: 0 }`,
`actual { scale, scaleY?, offsetX, offsetY }`, printed as `ALIGNMENT:`) and
the set summary shows it in the `align` column (`1 / 0,0` is the identity;
`1.002 / −0.5,−2.0` is not). It means a systematic size difference in the
chrome above or beside the anchors — typically a box model mismatch — that no
per-element finding shows, because every box was moved to fit. Fix the sizes
first; it cannot be accepted (the numbers move) and disappears when the fit
snaps to the identity. A design frame of ANOTHER size never gets the note:
that is a layout difference, not a scale.

Read the transform's SHAPE to know where to look. An **offset alone** is one
box above or beside the anchors (a topbar rendered without its border). A
**scale** is that box REPEATED down the page: one card thumbnail 1 px short
in every row of a three-row grid reads as `scaleY 0.9966`, not as three
findings, because the fit absorbs a per-row step better than a per-element
`position` would. To name the element, undo the fit — `elements.json` stores
the design boxes already mapped into impl space, so raw `y = (y − offsetY) /
scaleY` — pair design and impl by text, and walk `impl.y − raw.y` down the
page: it is flat, then steps by the missing pixels at ONE element per
repeat, and that element (its `height` + border, in the comp's box model) is
the fix.

### 1a-ii. Then ask what PAIRED the two elements a finding is about

A finding is only ever as good as its pairing. Every finding that rests on a
pair carries **`via`** — how those two elements were put together — and
**`gamma`**, the pair's γ = |Δx|+|Δy|+|Δw|+|Δh| in normalized CSS px. The
console prints it after each line (`[geometry γ98.7]`) and sums it up
(`pairing evidence: 49 text, 3 slot, 71 geometry (102 rest on no pair)`):

| `via` | what formed the pair | how much to believe its values |
| --- | --- | --- |
| `text` | both elements carry the SAME string | the transform played no part — trustworthy at any confidence, with one measured exception: a pair that moved a LONG way may be two different elements sharing a string (74 of 79 above γ 200 were right; `reconcile.md` §R3) |
| `slot` | same anchor and line height, different text (a value slot) | geometry formed it, but position-only — and the two boxes are now bounded to within 5× in AREA, because unbounded a 13×13 avatar claimed a 380×19 subtitle |
| `geometry` | nothing but γ | only as good as `alignment.confidence` |
| absent | the finding rests on no pair (`missing-element`, `extra-element`, `alignment`) | — |

**`unverified: true` means: do not read this finding's VALUES as drift.** It is
set on `color` / `typography` / `border` / `border-radius` / `size` findings
whose pair was formed by geometry alone while `alignment.confidence` is below
0.5 — i.e. a colour delta between two elements that may well not be the same
element. They are flagged, never suppressed: a deleted finding cannot be told
from "no difference here". `position` and `spacing` are deliberately NOT
flagged — a position finding IS the transform's claim and states its own
evidence ("offset by (−70.7, 0.5)px" is visibly not drift).

The shape to recognise: a comp label with no counterpart in the implementation
pairs with whatever sits nearest, and emits five findings that read as
actionable plus, LAST, the `text-content` one that gives it away. When a pair's
`geometry` share is large and its confidence low, **read the `text-content`
findings first** and fix the alignment (§1a) before believing anything else.

### 2. Classify every finding — this is the whole skill

| class | how it looks | what you do |
|---|---|---|
| **data** | `missing-element` / `extra-element` on value-like text (names, amounts, dates, IDs, a row the comp's fixture has and yours lacks); a `text-content` finding where BOTH sides are value-like (`412,00 €` vs `84,20 €`) — these are reported by default, not pre-suppressed | make the fixture / seed render the comp's data; then declare the recurring shapes once as `ignore.dataSlots: { patterns: [...] }` so later runs stay quiet without going blind to copy |
| **copy drift** | `text-content` where the non-value part of the string changed (`Blok · 12. 7. 2026` → `Doklad · 12. 7. 2026`, `Potvrdiť →` → `Návrh`), a label renamed, a number dropped from a label | fix the code or the comp — this is the class `dataSlots: true` used to hide, so read every `text-content` finding before declaring any of them data |
| **drift** | `color` (with ΔE2000), `typography` (family / size / weight / line-height), `size`, `position` (a shift; ×N with the same delta = one layout cause), `spacing` (sibling gap), `border`, `border-radius`, a `missing-element` that is a real UI element (icon, badge, button, label), `pixel-region` with `changeKind` `shape` / `added` / `removed` / `stroke` / `color` (wrong icon glyph, missing illustration, recolored image), `alignment` (the fit is not the identity on a same-size page — a chrome size / box model difference, §1a) | fix the code: token, class, layout; prefer the root cause of an aggregate over its members; fix `alignment` before anything positional |
| **intended deviation** | the value is right for the product and the comp is the outlier (`SKILL.md` rule 4), or a documented decision (reordering, a11y, i18n) | record it: `refdiff accept <run-dir> --manifest <file> --finding <id> --reason "<evidence>"` (§3a) — or write `accepted: [{ type, expected, actual, reason }]` into the pair's `ignore` by hand. The reason must say why and cite the measurement; for `pixel-region` narrow with `changeKind`, never accept "any pixel difference". Textless boxes INSIDE an accepted element (a placeholder's bars) are the same decision: add `contents: true` to that rule by hand, never a `regions` entry — and when the container is an ELEMENT that exists whether or not it is reported (the run's own screenshot against a comp that draws live DOM), `contentsOf` is the rule that fires every time instead of when the container happens to go unpaired |
| **environment** | `pixel-region` at `severity: minor` with no box ("alignment confidence < 0.5") or with `changeKind: noise`, `still-loading`, fonts not loaded (every `typography` finding says the same fallback family), a viewport that clips | fix the capture (fonts in Storybook preview, `--viewport`, `--wait-for`, seeds), not the code |
| **known cause, not the implementation's** | many findings in one region or of one shape, all traceable to one thing you have already diagnosed and cannot fix from here — a comp whose demo rows are in another order, two canvases at different zoom, a numbering that starts from different sources | declare it once as `explain: [{ types, region|within, cause, reason }]`: the findings stay reported and keep their severity, they are grouped under the cause, and they stop failing the verdict. Scope `types` to what the cause can PHYSICALLY produce — that is what keeps a real defect in the same region visible |
| **needs a human** | the comp itself is inconsistent; the fix would change product behaviour, copy, or information architecture (a row set, a label's meaning); the finding is inside a region you were told not to touch | do NOT fix; list it in the report with the measurement, and leave a note for the designer in the annotator if one is running |

The last three rows all end in the `ignore` block — `explain`, `accepted`, `contentsOf`,
`dataSlots`, `roles`, `regions`, `scope`. **`configuring.md` is where each one's cost and its
narrowest form are written down**; pick the narrowest tool that covers the case, and read its
"Order of attack" before writing any policy at all.

Aggregates first: one `×15` color finding or one `×7` position shift is one
cause and usually one line of code. Then criticals in order. Minors last —
and only while iterations remain.

### 3. Read the human's notes

`annotations.md` in the run dir (written by the annotator; re-projected onto
the current elements on every run) lists notes by status. `open` notes are
instructions from the reviewer anchored to an element (world coordinates +
the element's text/role/box, marker numbers on `annotations-design.png` /
`annotations-impl.png`). Act on them before the findings they overlap; when
a note contradicts a finding, the note wins — and you say so in the report.
`stale` notes lost their element: read them, do not guess. A `↳ reply:` line
under a note is what the model answered last time; a note that is `open`
again UNDER a reply carries a follow-up instruction appended to its text
(`… — <new instruction>`) — act on the latest part.

A note may well come from the annotator's **diff lab** (the tool strip's
Highlight / Dim / Strobe, `[` `]` to step the highlighted boxes, and the
topbar's Wipe / Onion / Blink / Diff overlays of the design on the impl
pane). Those views are built from the SAME reported findings you are reading
— every listed finding's box, plus `Finding.regions` — the connected
components inside a `pixel-region`'s box, largest first. When a note points
at "the magenta box", `regions` is where it points.

### 3a. Record the decisions — never edit the comp to agree

When the verdict is "we looked, and the IMPLEMENTATION is right", the decision
belongs in policy, not in the design file:

```bash
refdiff accept $RUN_DIR --manifest $MANIFEST                 # every finding triaged "ignore" in the annotator
refdiff accept $RUN_DIR --manifest $MANIFEST --finding f7 --reason "…"   # one, straight from the CLI
refdiff accept $RUN_DIR --manifest $MANIFEST --dry-run       # what it would record
```

It writes `accepted.json` beside the manifest; the next `compare` merges each
pair's entries (printing `accepted decisions: N for <pair>`) and the finding
travels under `suppressed` with the reason as its rule. `--no-accepted` re-opens
every past decision when you want to re-review them.

Why not just fix the comp so the two agree: an edited comp agrees **forever**,
including on the day the implementation regresses. A decision is built from the
MEASUREMENT and therefore lapses by itself the moment either value changes.

The command refuses what it cannot record honestly, and says so per finding:
`position`/`spacing` (coordinates move every capture — the rule would lapse
immediately; fix the comp, the alignment or the fixture instead), a finding with
neither values nor text (the rule would forgive its whole role), and any verdict
whose note is empty (a suppression nobody can audit).

**Never write to the upstream design project on your own initiative — ASK.**
The comps are the designer's source of truth and their editing surface; a push
replaces a whole artboard file (many frames) and can collide with work in the
canvas. "The implementation is correct" is NOT authorisation to update the comp:
it is authorisation to record a decision. Updating the comp is a separate,
explicitly-requested act, and it is right only when the comp is genuinely stale
as a DESIGN (an element deliberately dropped, a label renamed) — never as a way
to make a finding go away.

### 4. Fix, re-run, read the delta

After the fix, re-run the SAME command into the SAME `--out` dir (token /
global CSS changes may need the Storybook or dev server restarted — see the
repo bindings). Read `delta`:

- `resolved` — ids of the PREVIOUS run that are gone. Check they are the
  ones you meant to fix; a finding you did not touch that vanished is a
  side-effect to understand (a shift you removed also removed the spacing
  finding it caused — fine; a `missing-element` that vanished because the
  element is now unmatched instead — not fine).
- `introduced` — ids of THIS run that are new. Every one of them is your
  change's side-effect until proven otherwise.
- `regressions` (also printed as `REGRESSION: …`) — findings that are
  introduced AND absent from the previous run under their identity AND
  resolved by an earlier iteration (the ledger). This is the loud failure:
  stop the plan, undo or fix that regression first, and count the
  iteration. A shared-text key whose COUNT grew (the "3" on five badges,
  two identical `#6B7280` prop lines re-pairing after a hairline change)
  is `introduced`, never a regression — the key never left the previous
  run. Read it as a side-effect like any other introduced finding.
  One shape that is NOT an app regression: anything that changes how elements
  PAIR changes what a finding IS, so the run dir's ledger — written under the
  old pairing — can name findings the old pairing had hidden (a numeral it
  mis-paired with a neighbour now reads as its own `position`). A refdiff
  upgrade does that; so does your own layout change, when a row grows and the
  column re-pairs. **The report says so itself: `delta.repaired` names any
  regression whose element ALSO had property findings resolved in the same
  run**, printed under the REGRESSION line as `↳ this run also resolved N
  finding(s) about "<text>" … the element's PARTNER changed, not the element`.
  That is a diagnosis, not a dismissal — a genuine vanish has the same shape
  (the element goes, its property findings resolve with it), so the loud stop
  stays and you read the evidence beside it. Check the regressed entries'
  `resolvedAt` in `resolved-ledger.json` too: all older than the change → the
  delta churns once, say so in the report, and carry on; the next run is clean.
- Findings that know their element's `text` are identified by content
  (type, role, text), not by coordinates — so a data-parity iteration that
  moves the alignment does NOT churn them; textless findings (icons, boxes)
  still pair by place within 5px and may churn when everything shifts. A
  `pixel-region` is identified by its `changeKind` and its box, never by the
  measured ratio — that number moves on every capture, and keying on it made a
  region resolve and re-introduce itself under its own id whenever the diff
  twitched (a box went 15.9% → 16.2% and the delta read `+1 / −1`). A
  finding whose values changed but is still there is neither resolved nor
  introduced — read the counts and the message for progress on it. (Runs
  made before this identity existed churn exactly once on the next run.)

Then mark the notes you acted on:

```bash
refdiff-annotator $RUN_DIR --mark-implemented <id,…> --reply "what you did, or why not"   # open → implemented; the designer closes them as done
```

`--reply` is the one line the reviewer sees under their comment in the
annotator (and the next run's `annotations.md`). Say what changed and where
(`file:line`), or why you did not act; one reply per call, so mark notes
one at a time when the answers differ. `--mark-implemented all` without
`--reply` still works but leaves the reviewer guessing.

### 5. Bounds — when to stop

- **Verdict PASS** (no finding at/above `--fail-threshold`) → stop, report.
- **5 iterations** → stop, report whatever remains.
- **Diminishing returns**: an iteration that resolves 0 findings, or resolves
  fewer than it introduces, or where every remaining finding is `needs a
  human` / `minor` you have decided not to chase → stop, report. Do not
  spend an iteration on a single minor when a human decision is pending.
- **A regression you cannot fix within the iteration** → stop, report it
  first, with the ids and messages from the ledger.

### 6. Report (the deliverable)

One table of iterations — `findings / instances`, `+introduced / −resolved`,
`regressions`, what changed (file:line) — then three lists: **fixed** (with
the measurement that proved it: the delta), **accepted** (each with its
reason), **needs a human** (each with its measurement and the question).
Never describe a screenshot; quote `expected` / `actual`.

## Reading the measurements (the ported "what to compare" checklist)

refdiff measures the comp's captured RENDER, and the render is what the
designer approved. When a rule in the comp's source visibly does not apply in
`elements.json` (a `max-width` the layout never hits, a style behind a
non-default prop), match the render and write the discrepancy down for the
designer — do not code the source and eat the finding.

The old checklist sampled pixels and computed styles by hand. Each of its
items is now a typed finding — read it there:

- **Colors** → `color` findings: `expected.color` / `actual.color` as
  `rgb()`, `ΔE2000` in the message (≥ 2.5 reported; ≥ 8 major). Warm
  near-whites (`#fdfbf7` vs `#f8f3ec`) are exactly the case the eye misses.
  Cross-check the comp: `grep -oE "#[0-9a-fA-F]{6}" <comp>.dc.html | sort | uniq -c`.
- **Fonts / sizes / weights** → `typography` findings: family, `fontSize`,
  `fontWeight`, `lineHeight` per side. The classic miss — a heading in the
  body family — is one finding, not a hunch. Per-breakpoint pairs are
  separate manifest entries (`…-desktop` / `…-mobile`); a fix that matches
  one can break the other — run both.
- **Layout** → `position` (per-element offset; aggregated by identical
  shift), `size` (box w×h; text measured by glyph-ink box), `spacing`
  (nearest-sibling gap below / right, adjacent on BOTH sides). `elements.json`
  holds both trees in world space if you need a box the findings do not show.
- **Presence** → `missing-element` / `extra-element` with the element's text
  or role and size. Icons and glyph swaps (Upload vs ChevronsUpDown) land
  here or in `pixel-region`. Elements pair by content before geometry: a
  unique text is the same element wherever it moved, and a REPEATED text
  ("Figma" on ten cards) still pairs with the same text within 2× the γ
  cutoff (200 px) before any nearer box of another text — so a chip row
  shifted by one missing chip reads as `position ×N` plus ONE
  `missing-element`, not as a chain of missing + extra + `text-content`.
  **Past that cutoff the pair is REFUSED rather than force-paired**: when two
  candidates share no text, sit at least 20 γ apart, and EACH one's text occurs
  somewhere on the other side, the pairing is provably wrong — both elements had
  a same-text counterpart available — so both are reported missing/extra
  instead, which is what a list in another order actually is. Without it a rail
  badge "6" pairs with a prop line "element" 90 γ away and reports position,
  colour, typography, radius and text-content about two unrelated elements: five
  findings, all noise, one of them crying REGRESSION on the next run (measured:
  14 such findings on one pair, 12 on another). The run log names the refusals
  it acted on. A value slot in the same place is never touched by THIS guard —
  146% against 100% at γ 0.5, a card count at γ 0, a status chip whose word the
  other side does not use at all. A slot pair has one other bound, added
  2026-09-16 and unrelated to the veto: its two boxes may not differ by more
  than **5× in AREA**, because the slot pass drops the width term on purpose and
  without that ceiling a 13×13 avatar badge paired with a 380×19 page subtitle
  16 px away. A stretched slot is still a slot; a thirtyfold different thing is
  not. **SVG content is extracted now, with limits.** An `<svg>` is
  still ONE atomic `icon` when its shapes are all icon-sized, or when it holds
  more than 24 of them (a drawing is a picture, not a set of elements). A large
  SPARSE one — a mark layer, a diagram, an overlay — is walked, and its
  `rect` / `circle` / `path` / `text` children emit as `role: "shape"` with
  their own paint mapped onto the HTML names (`fill` → background, `stroke` →
  border + width, `stroke-dasharray` → dashed, `rx` → radius), which is the
  same mapping the Figma adapter does from `fills` / `strokes` / `strokeDashes`.
  A fill that is a PAINT SERVER (`url(#some-pattern)`, a gradient) goes to
  `backgroundImage` — captured, not compared. The decision is made on the
  SHAPES, never on the svg's own box: an overlay is often a 1×1 px svg with
  `overflow:visible` holding shapes hundreds of px wide.
  Consequences to expect on a first run after this: an app's own overlay
  (selection outlines, comment shapes, chart marks) becomes visible and reports
  as `extra-element` wherever the comp draws no counterpart. **Do not read that
  as data.** The first case measured this way (2026-09-03) was DRIFT: the app
  outlined every comment's region at rest, while the comp draws a mark as a
  BADGE and reserves the outline for the SELECTED one — 22 findings from one
  always-on branch, on anchors that already matched the comp's to half a pixel.
  So the question a shape finding asks is not "whose data is this" but **"does
  the comp draw this AT ALL, in this state?"**: find the element in the comp's
  source and read WHEN it draws it — its selection branch, and any mode toggle
  whose default is off. It is data only where the comp draws the same overlay in
  the same state.
  Two limits to know before writing policy for a shape. The 24-shape cap makes
  ONE visual layer report in HALVES: a 4-shape comment layer is walked while the
  same app's finding layer (8 rects + 14 instance rects) stays atomic, so a rule
  written today covers whichever half was under the cap and the other half
  arrives on a run with fewer marks. And `fill-opacity` / `stroke-opacity` are
  not folded into the reported paint (CSS `opacity` is), so a 12% tint reports
  as its opaque colour, and a deliberately lighter copy of a shape reports
  identically to the shape it copies. `roles: ["shape"]` switches the whole channel off for a pair,
  and it cannot reach the knock-on re-pairings a new shape causes: a matched
  pair's finding carries the DESIGN side's role. A **Figma** design's vectors
  keep their older `box` / `icon` roles, so that switch silences the DOM side
  only.
- **Borders / radii** → `border` (width, color ΔE, and `borderStyle` — dashed
  against solid, which is a design decision no other channel can see: a whole
  language of dashed footprints, pills and chips once produced zero findings
  about dashedness), `border-radius`. The style is compared only where BOTH
  sides declare it and both borders paint: an adapter that cannot read a
  stroke's dashes leaves it undefined rather than defaulting to `solid`, which
  would report every dashed comp element as impl-only dashedness. One
  shape to recognise: a `border` / `border-radius` finding on a CHIP or TAG
  LABEL ("border the design does not have", "radius 12px, design says 0px")
  where both sides clearly draw the same pill is usually a LEAF-shape
  mismatch, not a missing border — a design runtime that wraps every label
  in its own `<span>` makes the text the leaf (no border of its own), while
  a `<button>Label</button>` IS the leaf and carries the pill's border. The
  same runtime splits `Positions unreliable · {{pct}} anchor match` into
  three leaves, so an impl that writes one string gets a phantom
  `missing-element` per piece. Match the markup shape (each interpolated
  value in its own span — harmless markup) rather than removing a border or
  re-wording the copy.
  **The same leaf-shape asymmetry can DELETE a comparison instead of adding a
  finding, and that failure is silent.** A container's paint reaches the
  comparison only by HOISTING onto a lone descendant leaf, and the `surface`
  fallback that emits an unclaimed painting container is guarded by `!isRoot` —
  so when the captured node IS the painting container, which is every
  component-set variant pair, the hoist is the only path there is. A sibling that
  breaks the chain therefore does not move the fill to another element; it
  removes it from the model. Measured: a Figma Focus variant is `[wrapper]
  [focus-ring]` inside the frame that paints the fill, while CSS spells the ring
  as a `box-shadow` PROPERTY — one leaf on the DOM side, two on the design side,
  and the fill compared on neither. Six `button-fill` Focus cells rendered the
  REST colour against the design's HOVER colour with **zero `color` findings**,
  the whole difference sitting inside the frame `pixel-region` at 50–74%. Fixed
  2026-09-07 (`ringsParent`: an enclosing stroke-only vector sibling no longer
  breaks the chain); with the bug reintroduced the same cells now report
  `"DANGER" background is rgb(230, 89, 89), design says rgb(255, 181, 176)
  (ΔE2000 21.4)`. **The general shape outlives that fix**: a design fill that
  reaches no leaf is reported nowhere, so when an impl leaf carries a
  `backgroundColor` and its design partner carries none, the fill is not being
  compared — 39 of that corpus's 194 pairs are still in that state (down from
  49), and a green colour channel on such a pair means "not measured", not
  "agrees". Diff the two sides' `backgroundColor` presence in `elements.json`
  before trusting a clean colour read on a cell whose design side has more than
  one leaf.
- **Pixels** → `pixel-region` only inside matched boxes ≥ 16 px that are not
  text and not already reported; `actual.diffRatio` plus
  `actual.changeKind`: `shape` (a different glyph or drawing — the story's
  placeholder icon), `added` / `removed` (content on one side only),
  `stroke` (outline differs), `color` / `hue-rotation` (same shape,
  recolored), `noise` (resample residue along shared edges, < 10 %, ignore).
  The message says which; boxes within the 5 px size tolerance are compared
  scale-normalized ("design 24×24 resampled onto 21×21"). `regions` lists the
  connected components inside the box, largest first (`implBox` is their union,
  mostly empty space on a sparse element) — read those to say WHERE, not just
  how much. `diff-mask.png` paints the same regions coloured by `changeKind`,
  and ONLY the reported diffs, so no mask file means no unexplained pixel
  evidence. Runs only when alignment confidence ≥ 0.5 — a boxless minor note
  says it was skipped.
- **Alignment** → `alignment` in the report (`scale`, `offsetX/Y`,
  `confidence`, plus `confidenceX` / `confidenceY`). Read it FIRST, before any
  finding — see §1a. Confidence 0.00 means too little unique shared text:
  everything positional is unreliable until the fixture shares text with the
  comp, and no policy tweak substitutes for that. Read the transform too: on
  a same-size pair a fit that is NOT the identity (`scale 1.002`, `offsetY
  −2`) is reported as one boxless minor `alignment` finding (§1a) — a
  systematic size difference the fit is absorbing that no element finding
  shows, typically a box model mismatch (a comp with no `box-sizing` reset
  renders `height:46px` + border as 47px; an app with `* { box-sizing:
  border-box }` renders 46) in the chrome above or beside the anchors. An
  offset is one such box; a scale is one such box repeated down the page
  (§1a says how to find it). Fix the sizes; the transform snaps to `scale 1,
  offset 0` and the note goes.

