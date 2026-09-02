# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

## 2026-09-02 — what NEITHER channel measures is verified by a crop, once (session 18, the ghost)

- **Context:** implementing the comps' one-sided GHOST in the annotator
  (`packages/annotator/src/render.ts`), measured on `refdiff-compare-desktop-ghost`.
- **Lesson:** the ghost footprint is an SVG rect, and the extractor reads DOM only, so the
  structural channel is blind to it; its design-side counterpart travels **suppressed** inside the
  artboard `accepted … contents: true` region, so nothing is even reported about it; and the pixel
  channel only sees it inside the whole-canvas region, which a 146%-vs-100% zoom divergence
  dominates. Two real defects therefore shipped green through a converged loop and a 200-test
  suite: (1) the rect carried `class="ghost …"`, which this file already spends on the diff lab's
  superimposed design IMAGE — `.ghost { opacity:0 }` — so the footprint painted **nothing**, with
  the DOM, the computed fill and the stroke all reporting correct; (2) `patternTransform="rotate(45)"`
  leans the stripes the OPPOSITE way from the comps' `repeating-linear-gradient(45deg, …)`, because
  SVG rotates clockwise. Both were found by cropping `impl.png` at the footprint's screen box and
  looking at it beside the same crop of `design.png` — the one operation the loop's rules otherwise
  discourage. So: **when a change adds an element that neither channel can pair, say so out loud and
  spend one crop on it.** And: **a CSS class is a namespace** — before naming a new one, grep the
  file; a collision with an `opacity:0` rule is invisible in review, in the tests and in every
  finding. `getComputedStyle(el).opacity` in a Playwright probe named it in one call once the crop
  had shown there was something to look for.
- **Candidate home:** skill:refdiff (a line under "Pixels" / the pre-flight: an element invisible to
  both channels is crop-verified once) · `refdiff.bindings.md` trap (done, beside the ghost bullet) ·
  memory (the naming habit)


## 2026-08-28 — a non-identity alignment on a same-size viewport is a finding in itself
- **Context:** phase 5 of the annotator redesign (`docs/plan-annotator-redesign.md`), chasing a 1px sheet offset on `refdiff-compare-mobile`.
- **Lesson:** when `alignment.scale` / `offset` are not `1 / 0` on a pair whose viewport equals the comp's, the fit is absorbing a systematic size difference that no finding reports — read the transform, not only `confidence`. The cause here was the box model: Claude Design comps set no `box-sizing` reset (content-box), the app uses `* { box-sizing:border-box }`, so every fixed-size bordered chrome box was 1–2px smaller (`offsetY −1.98` = topbar + strip). Write such sizes as the comp's number plus its border and the transform snaps to the identity. Also: measure in the browser (`getBoundingClientRect`) before reasoning from CSS — the sub-pixel arithmetic misleads.
- **Candidate home:** skill:refdiff (done in the same change — the Alignment bullet under "Reading the measurements") · `refdiff.bindings.md` trap (done) · memory (the general "read the transform" habit)

## YYYY-MM-DD — short title of the lesson   (example row — delete once you add a real one)
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard

## 2026-08-28 — a matcher change invalidates a run dir's ledger (session 13, item 15)

Pass 1b (same-text pairs before nearest-box) changed what several findings
ARE on `refdiff-compare-desktop`: numerals the old γ had mis-paired with a
neighbour (reported as `text reads "6", design says "4"`) now pair by text and
read as `position`, so `resolved-ledger.json` entries from phases 3–4 named 8
of them as "back" — `REGRESSION: 8` on a run with no app change. Item 12's
"absent from the previous run" test cannot help: under the new pairing they
WERE absent. Documented in `SKILL.md` §4 as a shape to recognise (check
`resolvedAt` against the upgrade). Candidate rule for the tool: stamp the
ledger with a matcher/identity version (`ResolvedLedger.identity`) and, when
the running version differs, print "ledger written under an older pairing —
its N entries are not comparable" and drop them visibly rather than cry
wolf. Route: `docs/architecture.md` Open decisions (small feature), or
discard if the churn stays rare. **Landed there in phase 6 (2026-08-28)** as
"A matcher upgrade invalidates a run dir's ledger — open"; on process,
confirm and remove.

## 2026-08-28 — anything the served app shows for the harness's sake is measured (session 13, item 16)

The first `--read-only` announced itself in the rail's status line up front.
The measure said so: compare-desktop 32 → 37 (+6, R3) — the line is an element
the comp does not draw, and it pushed every rail row under it. Rule: a
measured impl must render EXACTLY what the writable/production app renders;
harness-only affordances (a read-only banner, a debug chip, a build stamp)
either appear only on interaction (the refusal now shows on the first save
attempted) or go into the comp too. Route: `docs/architecture.md` Open
decisions (one line under the annotator) and the refdiff skill's pre-flight
if it recurs in a consuming repo. **Landed in phase 6 (2026-08-28)**: Open
decisions "Harness-only affordances are measured" + the "Annotator" section;
the skill's pre-flight still only says the rail names the refusal on the first
save — add the general rule there if a consuming repo hits it.


## 2026-08-28 — a SCALE in the alignment note is a repeated box, an OFFSET is a single one (session 15)

The Library desktop's `align 1×0.997 / 0,0.2` was read for two sessions as
"anchor noise" because the anchors in `elements.json` looked flat top to
bottom — they are stored POST-fit (`align.ts` maps design into impl space
before packaging), so the fit had hidden exactly what it absorbed. Undoing it
(`raw y = (y − offsetY) / scaleY`) and walking `impl.y − raw.y` by text pair
down the page showed a −1 px step at every card row's thumbnail: the comp's
content-box `height:132px` + `border-bottom:1px` vs the app's border-box
132. Rule: an offset alone = one bordered box above the anchors; a scale =
that box once per repeat; the raw-position walk names it in one pass. Routed
already: `SKILL.md` §1a + "Reading the measurements" (general shape),
bindings' box-model trap (the instance), `docs/architecture.md` box-model
paragraph. Candidate tool affordance if it recurs in a consuming repo: a
`refdiff drift <run-dir>` (or a column in `elements.json`) that prints the raw
per-element `dy` down the page so nobody undoes the fit by hand. On process:
confirm the routing, decide on the affordance, remove.

## 2026-08-28 — the demo root's relative times drift within MINUTES, not an hour (session 15)

The bindings said the `--now` fixture's `N min ago` strings "agree for an
hour" with the comp's; they agree until the next minute ticks — three minutes
after `--now` the impl reads `15 min ago` for the comp's `12 min ago`, five
relative-time anchors fall to `textPatterns`, and the Library desktop reads
0.89 / 29 suppressed instead of 0.90 / 24 with no app change. Rule (this
repo): `--now` and `compare` in the same command line. Fixed in the bindings;
nothing to promote beyond it (repo-specific). On process: remove.

## 2026-08-28 — a control drawn in a comp can be the DESIGNER's preview aid, not product (session 15)

The Library comp's topbar `computer`/`smartphone` button switches the
artboard between its desktop and mobile layouts. The app copied it as a
feature (phase 3 even noted "the comp's preview aid" and built it anyway);
Mato: it was never a product control. Rule for reading a comp: a control
whose only effect is on the artboard's own presentation (layout switch,
theme preview, `$preview` props, zoom) is the designer's, not the user's —
ask before building it, and when it stays out, excuse its glyph by content
so the comp's version reads as `suppressed`, not as a missing element.
Route: `skills/refdiff/SKILL.md` (a line in the classification table or
"Configuring a pair" — repo-agnostic); this repo's manifest already carries
the instance. On process: promote, remove.

## 2026-08-28 — "the button does nothing" in the annotator = a thrown TypeError in an untested template string (session 15)

Dim did nothing: `renderDiffs` declared `const pad = 4000` (the sheet's
reach) in the same scope that calls the `pad(box, n)` helper, so the first
hole threw "pad is not a function" and the click ended silently. The client
JS lives inside a template literal in `render.ts` (no backticks allowed, no
unit coverage — the tests are string-contains on the rendered shell), so a
shadowed helper is invisible to `tsc` and vitest alike. Rule: when a tool
button "does nothing", open the console first — it is a throw, not a no-op;
and never reuse a helper's name for a local in that file. The regression
test (`render.test.ts`, "no local of that name may shadow it") is the shape:
extract the function's body from the shell and assert the declaration is
absent. Route: `docs/architecture.md` "Annotator" (one line: the client is
untested string, helpers' names are reserved) or discard. On process: decide.

## 2026-08-29 — a self-hosted icon SUBSET fails by rendering the glyph's name (session 16)

The annotator serves Google's subset of Material Symbols holding only the
glyphs the comps used at the time. Four icons the refetched comps added
(`settings`, `tune`, `list_alt`, `swap_horiz`) rendered as their names in
letters — `"settings" renders 152×23, design says 19×23`, every neighbour
shifted with it — and nothing in the console said so. The fix is structural:
the list is DERIVED by a script (`packages/annotator/scripts/icon-subset.mjs`,
sources ∩ Google's codepoints list, `--check` for drift), never typed. The
skill-level shape: a `size` finding on an icon whose width is a WORD's is a
missing glyph, not a layout bug — sibling of the "matching fontFamily proves
nothing" pre-flight item. Route: `skills/refdiff/SKILL.md` "Environment
pre-flight" (one bullet, general shape); the repo-specific recipe is already
in the bindings and `docs/architecture.md`. On process: promote, remove.

## 2026-08-29 — one shell, two routes: a route's chrome rule must name its container (session 16)

`.theme-toggle { display:none }` under the phone media query was meant for the
comparison tool's header (its comp replaced the toggle with a settings button)
and hid the LIBRARY's toggle too — its comp is unchanged. The harness caught it
as a `REGRESSION` on `refdiff-library-mobile` (`design "light_mode" has no
counterpart`); nobody looking at the compare page would have. Rule: in the
shared shell CSS every rule about one route's chrome is scoped to that route's
container (`.topbar …`, `.lib-top …`). Route: `docs/architecture.md`
"Annotator" already carries the `lib-` prefix rule for NAMES; extend that
sentence to rules. On process: promote, remove.

## 2026-08-29 — a comp that omits a state is the spec; flag the omission, do not invent (session 16)

The Mobile Minimal comp draws no delta strip while the Tool comp does. Two
readings: deliberate (more room for the canvas) or an omission. Built to the
comp (hidden in that layout, one CSS rule), recorded as gap 36 with the
question for Mato, rather than inventing a place for the strip that no comp
drew. General shape: when a sibling comp lacks an element the others have,
match the comp you are measuring against, keep the difference to one
flippable rule, and put the question in the plan's gaps — never a design of
your own. Route: `skills/refdiff/SKILL.md` classification table, the
"needs a human" row (already close); maybe discard. On process: decide.

Outcome (same day): Mato answered the flag within the hour — an omission, the
strip belongs in the minimal layout too. One rule flipped, the ask moved to
the comp's side (gap 36), the pair's 10 residual findings are all the comp's.
The lesson holds: flagging cost one rule; inventing would have cost a design.

## 2026-08-29 — a control that looks redundant in one mode may be load-bearing in another (session 16)

"We don't need the align-lock when the mode is not split screen" — true for
two panes side by side, wrong the moment an OVERLAY is on: wipe / onion /
blink superimpose the design on the impl with a single pane, and then the
lock and the anchor mode are the only things that fix a bad landing. Hidden,
then restored within the hour. Cheap because the change was one predicate and
one accepted rule, and the measure named the cost immediately (a
`missing-element` on the comp's `link`, a `spacing 29 vs 31.5` from the pill
shrinking). Rule: before removing a control "because this mode doesn't need
it", enumerate the OTHER states that mode can be in — here, four overlay
variants — and check the control against each. Route: discard, or one line in
`docs/architecture.md` "Annotator" (the lock's rationale already states it).
On process: decide.

## 2026-08-29 — a touch gesture belongs to the CANVAS, not to the element under the finger (session 17)

"The pinch is unreliable on mobile — I think the problem is when pinching over
another clickable area like findings", and then: "moving the canvas has the
same symptom — when I start dragging from a point where a finding or a comment
is, it doesn't move." Both were the same defect. Pan/pinch were wired on each
`.pane`, and two things over that pane never reached it: a finding badge, where
`pointerdown` returned early so a TAP could still select it, and the floating
pills (zoom, align, the FABs, the focus chip) which are SIBLINGS of the pane in
`#panes`. Either way only one pointer was ever tracked; the pinch silently
degraded into a one-finger pan and a drag from a badge did nothing at all.

The rule: a viewport gesture is a property of the CANVAS AREA, so track every
pointer on the container in the capture phase (nothing beneath can swallow a
finger, `stopPropagation` included) and decide per pointer what it may do —
here, anything may join a pinch, only bare canvas may start a pan on its own,
and a mark may drag as well but keeps its tap. Two mechanics that are easy to
get wrong: capturing a mark's pointer at `pointerdown` moves the `click` off
the mark and loses the tap (capture LATE, once it is unambiguously a drag), and
the "this gesture moved, so swallow its click" flag must be cleared by the next
`pointerdown` as well as by the click — a pinch usually ends in no click, and a
time-based guard ate a later double-click-to-fit instead.

Verification worth repeating: the symptom is mobile-only and unreachable from
unit tests, so it was driven with real touch through CDP
(`Input.dispatchTouchEvent`) against the emitted `report.html`, run against the
build BEFORE the fix as well — three cases failed there and passed after, while
tap-to-select and the plain pan passed in both. Each case reloaded first and
asserted `elementFromPoint` under the finger before acting: the first probe
"passed" on the old build only because an earlier zoom had moved the badge out
from under the coordinates.

Route: `docs/architecture.md` "Annotator" (a bullet is already there) + maybe a
CLAUDE.md line on proving a pointer-level fix against the pre-fix build.

## 2026-08-29 — a panel of switches is not a menu: don't dismiss it on outside interaction (session 17)

"Don't close the top panel in minimal mode on interaction with canvas so I can
let it be opened if I want. It should close only upon the button click." The
minimal layout's view panel (Compare / Show) was wired like the settings
popover — a document-level `pointerdown` outside it closed it. But the two are
different animals: a MENU is picked from once and dismissed, while these are
switches you work the canvas THROUGH (change the overlay, pan, look, change it
again), so every pan or pinch closed it and each change cost a re-open.

Rule: before giving a panel light-dismiss, ask whether the user acts on the
canvas BETWEEN two uses of it. If yes it is a mode surface, not a menu — close
it only on its own control (plus Escape / leaving the layout). Second-order
effect worth remembering: a panel that now persists over the canvas is
edge-anchored chrome, so it has to join the `paneInsets` list or Fit centres
the frame half underneath it.

Route: `docs/architecture.md` "Annotator" (a sentence is already there); maybe
a CLAUDE.md/skill line on the menu-vs-mode-surface distinction if it recurs.

## 2026-08-29 — a persisted dismissal must expire on CONTENT, not on a clock or a run id (session 17)

Asked to persist the delta strip's × ("so when closed it's shown only next time
there is a regression"). The tempting keys are all wrong in the same way: a
timestamp expires while nothing changed, and `createdAt` (the run) re-opens the
banner on every recapture, which is the nagging that prompted the ask. The
record instead names the REGRESSIONS that were on screen when it was dismissed
(`Finding.key`, the run-stable identity — ids are renumbered every run), and
the predicate is "every regression showing now is one this dismissal already
saw". A regression the reader has never seen re-opens the strip whole; a delta
of plain counts stays waved away. Same shape as the repo's ignore-policy rule —
name the content being excused, not a position or a run — and it earns the same
property: the rule cannot outlive what it excuses.

Two guardrails that came with it: a record that does not parse SHOWS the strip
(a corrupt dismissal must never hide a regression), and the dismissal hides a
banner only — the regression tag, the Review filter and findings.json are
untouched, which is what makes persisting it acceptable under "suppression is
visible or it does not happen".

Route: `docs/architecture.md` "Annotator" (already written up there) — and a
candidate CLAUDE.md line, since the content-shaped-rule principle now has a
second instance outside the ignore policy.

## 2026-08-29 — a shared predicate passed straight to `.some()` gets the INDEX as its second argument (session 18)

Scoping the annotator's canvas to the focus region, the client's private
`boxInFocus(box)` was replaced by `focus.ts`'s shared
`boxInFocus(box, region, minOverlap)` — every call site updated except
`boxes.some(boxInFocus)`, which quietly kept working and started handing
`.some`'s **index** in as `region`. Index 0 is falsy, and the predicate's first
line is `if (!region) return true` = "no region, everything is in scope": the
region filter reported "3 of 3 findings" over a canvas with no marks on it. No
error, no type check (the client is plain JS inside a template string), and the
failure looked like a rendering bug rather than an arity bug.

The rule: **a predicate with optional parameters is never passed by reference
to `some` / `filter` / `map` / `every`** — wrap it (`boxes.some((b) => inRegion(b))`).
Sharpened by the fact that this repo deliberately shares pure modules between
the CLI and the embedded client, so a signature grows a parameter on the TS
side while the untyped call site keeps compiling.

Second, procedural: `pnpm build` is not enough to test a served page — a running
`refdiff-annotator --serve` holds the OLD `dist` in Node's module cache and
keeps serving it. Two smoke runs were spent debugging a bug that was already
fixed. Restart the server (or serve on a fresh port) after every rebuild.

Route: CLAUDE.md (the `.some` rule is one line, general, and cheap to state next
to the dist/rebuild note that already lives there) + the serve-restart half onto
the existing "the CLIs run from dist" paragraph.

## 2026-08-29 — chrome that scopes a region must not sit ON the region (session 18)

The focus region shipped with a 10 % accent tint over its interior and five
handles pinned to its corners and centre, permanently — the only way out of them
was to delete the region. On a phone that is exactly the content the person
asked to look at, covered by the thing that says they asked. Three moves fixed
it, and they generalise to any selection/crop UI: **invert the paint** (dim the
SURROUND, never the selection), **push the handles outside** the rectangle (draw
AND hit-test at the same outward offset, or a handle you can see is not the one
you grab), and **make the loud state an opt-in MODE** — a drawn region lands
SETTLED and the handles come back through one Edit toggle on the chip that
already names the region.

Two corrections the user made to the first cut, both worth keeping. **A "done"
affordance is only readable when the user chose to enter the mode it ends.**
The first cut dropped you into adjusting the moment you finished drawing, and
its tick read as "click when you are done with the focused WORK" — the wrong
scope entirely. The fix was not a different icon but a different entry: a drawn
region lands SETTLED, adjusting is opted into with a pencil, and the tick is
right again once it finishes something you started. Second: **chrome that is
only on screen during an interaction can afford the middle** — the move grip
went back to the centre of the region as soon as it stopped being permanent.
And the mode has to draw what it excludes, muted: adjusting an edge with
nothing outside it to see is adjusting blind.

A fourth, learned in the same pass: a filter whose predicate is "any overlap"
reads as broken the moment the mark for an admitted item is drawn OUTSIDE the
frame the person drew (badges anchor at their box's top-left corner). The
threshold has to match what the gesture means — "mostly inside", measured
against the smaller of the two areas so a containing element still counts.

Route: `docs/architecture.md` "Focus a region" (written up there) — and a
candidate SKILL.md line for the in-scope rule, which is agent-facing through
`focus.md`.

## 2026-08-29 — a "link the views" toggle has to reach every view, overlays included (session 18)

The annotator's lockstep lock read as "the two frames move together", and that
is how it was described — but it only ever switched the design PANE to its own
view (`viewOf`). The superimposition modes (Wipe / Onion / Blink / Diff) draw
the design ONTO the impl through the alignment and took `state.view` directly,
so unlocking changed nothing in exactly the modes where the registration is the
thing being questioned: "I disable align-locking and it still aligns in wipe,
onion, diff."

The general shape: **a control named after a relationship must be honoured by
every renderer of that relationship, not just the one it was written for.** A
second surface that reproduces the same relationship by another code path
(here: the ghost, drawn from the shared view + alignment rather than from the
panes) will silently ignore it. When adding such a control, grep for every
place the relationship is materialised, not every place the flag is read —
the flag is precisely what the missing site does not mention.

The fix also re-scoped the note that explains the registration (the "design
stretched +N% to superimpose" pill): it now appears only while the ghost really
IS registered. A note describing a transform that is no longer applied is the
stale-assertion failure in UI form.

Route: `docs/architecture.md` "The lockstep lock is in every view" (written up
there).

## 2026-08-29 — a clamp must be measured against what is DRAWN, not against one of the inputs (session 18)

The wipe curtain was clamped to `report.impl.width - 20`, which is the
implementation's width — but the canvas draws, and fits, the UNION of both
frames (`worldBox`). Whenever the design's world box is the wider one, the
handle stopped short of the right-hand end of what was on screen (~80 % across,
in the pair that surfaced it) and the last stretch of the overlay could never be
wiped away. The left end looked fine because the impl's origin and the world's
coincide, which is exactly the asymmetry that makes this class of bug read as
"the drag is broken" rather than "the bound is wrong".

The rule: **bound an interaction by the geometry it operates on.** When two
sources are composited into one space, the clamp belongs to the composite, and
the ±20px "keep it grabbable" margin belongs in screen units if it is about the
finger — here it was worth dropping entirely, since "all design" and "all
implementation" are both legitimate ends of a wipe.

Route: CLAUDE.md or `docs/architecture.md` (the superimposition section) — the
same "world box, not one frame" reasoning already governs `fit`.

## 2026-08-29 — a control a dense layout drops still has to show its STATE there (session 18)

The minimal phone layout collapses the align pill to one 34px square, hiding
the label, the chevron and the lock button; the lockstep then lived only in the
menu, so nothing on screen said whether the panes were linked — on the one
layout where the overlay modes make the registration the live question. The
first fix put the lock button back on the pill and was rejected for the right
reason: one button IS the correct density there. What the layout owes is the
SIGNAL, not the control — the button now goes accent while the lock is on and
the menu keeps the toggle.

The general rule: **collapsing a control out of a dense layout is a decision
about the affordance, never about the state.** Whatever the compact surface
shows must still say which mode you are in; hiding the toggle is fine, hiding
the answer to "is it on?" is not.

Route: `docs/architecture.md` "The lockstep lock is in every view" (written up
there) — second correction in that same spot, so keep the rule, not the
instance.

## 2026-08-29 — a help cursor is a promise; make the click keep it (session 18)

The align pill's low-confidence badge was a `<span>` with `cursor:help` and a
`title`: hovering explained it, clicking did nothing. On a desktop the cursor
reads as "there is more here", so the dead click is the affordance lying — and
the explanation it points at (the Anchors row's "only 42 % anchor match" line,
with Width / Top left as the remedy) was one menu away the whole time.

Now a `<button>` that opens that menu — focusable, `aria-haspopup`,
`aria-expanded`, and the title says "Click for the modes". The rule:
**anything wearing an interactive cursor must have an action; a tooltip is not
an action.** If there is genuinely nothing to do, the cursor is the thing to
change.

Route: `docs/architecture.md` (align pill, written up there).

## Two misses on the Mobile Toolbar pair (2026-09-02) — both invisible to the harness

Mato caught two real differences the run reported nothing about. Neither is a policy
mistake; the first is a hole in the element model and the second is a suppression that is
wider than it looks.

**1. A container's surface is not compared, because containers are not leaves.** The comp's
Show control is a floating pill: absolute at canvas (8,8), 223x29, `--bg1`, 1px `--line`,
radius 10px, shadow `0 4px 16px`. The app rendered it as a full-width static row: 390px,
`border-bottom` only, no radius, no shadow. **Zero findings.** The structural channel
extracts LEAF elements, so a background / border / radius / width on an element that has
children is never a candidate; the pixel channel only diffs boxes that MATCHED, and an
unmatched non-leaf is never one. Even after the fix the pill was 229x35 against 223x29 —
6px out in both dimensions, still silent, because the extra 6px came from a nested `.seg`
box that is also not a leaf.
Worth considering:
- a SURFACE channel: capture elements with a visible background, border or shadow even
  when they have children, and compare those four properties plus the box. It is the same
  extraction pass, with the leaf filter relaxed for elements that paint something.
- a whole-frame or unmatched-remainder pixel diff as a backstop. Today "no mask file means
  no unexplained pixel evidence" holds only INSIDE matched boxes, which reads as a stronger
  guarantee than it is.

**2. `textPatterns` suppresses geometry, and one pattern collided with an unrelated
element.** The delta strip's run label reads `Run 47 vs 46` (84px) in the comp and
`vs run 2026-09-02 11:59` (161px) in the app — the app has no run ordinal at all
(`delta.previousRun` is `prev.createdAt`, an ISO timestamp; nothing in core, the ledger or
the run dirs numbers runs, so the comp is asking for data that does not exist). The 77px
over-width wraps the strip and shoves `Review` 84px. **All of it suppressed**, because
`COMPARE_IGNORE.textPatterns` excuses the strip's copy and `textPatterns` kills every
finding type about a matching string, geometry included. The artboard-vocabulary regex also
contains `Review`, which is the strip's button label as well as an artboard word — one
pattern, two unrelated elements.
Worth considering:
- prefer `dataSlots: { patterns }` for volatile VALUES: it masks the value and keeps
  position, size, colour and typography compared. `textPatterns` should be rarer than it is.
- let `textPatterns` be scoped by `role` or region, so a word cannot excuse two different
  elements.
- flag a suppressed `position` / `size` whose delta exceeds a threshold — a 77px shift
  hidden by a TEXT rule is the exact shape of this miss. The rule name is already recorded
  per finding (`suppressedBy`); surfacing "suppressed, but it moved 77px" in the run
  summary would have shown it without anyone reading findings.json.

### Both items above are now BUILT (2026-09-02)

All four proposals landed in core, plus run numbering. The surface channel was
falsified rather than assumed: the toolbar layout was reverted to the offending
full-width bar and the run reported `extra-element — implementation renders
surface at (0, 111) (390×35) that the design does not have`, where before it
reported nothing. The backstop stayed below its floor on that same run (0.28%),
which is the layering working — the cheap structural channel first.

Two things the implementation had to get right, both caught by existing tests:
- **Do not double-count the decoration hoisting.** A painted container whose
  paint a descendant leaf already carries must NOT also emit as a surface;
  `figma-tree.test.ts` pins that as "Container with children and decoration is
  not itself a leaf". The fix is a `claimed` set filled during the walk and a
  surface pass deferred until after it. On the recorded Button/Fill set that
  leaves exactly 7 surfaces — one per Focus variant, whose focus-ring child
  breaks the hoisting chain so the label cannot claim the button's fill. Those
  7 fills were unrepresented before.
- **Keep surfaces out of the design-quality ratio, on BOTH sides.** Counting
  them in `bound` but not `leaves` moved the score 0.64 → 0.74 and would have
  loosened the `figma-low-quality` gate — a measurement change dressed as a
  feature.
