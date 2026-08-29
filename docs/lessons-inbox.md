# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

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
