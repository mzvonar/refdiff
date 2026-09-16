# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->
## 2026-09-16 — the reconcile headline's COUNT is not the length of the list it introduces

Measured on the witness, `messages-accountant-desktop` run 10:
`matching.designOnly` is **38** while the report emits **37** `missing-element` findings, with
`suppressed: 0` and no instance collapsing. A reconcile run puts that 38 in its headline
(`unmatched: …`, shipped in `536dad2`), so the reader is told to account for 38 elements and handed
a list that can only ever reach 37.

**Cause, confirmed:** `presenceFindings` in `structural/checks.ts` skips any element narrower or
shorter than `minElementSize` (4 px) — `if (el.box.w < min || el.box.h < min) continue` — while
`matchingStats` counts the raw `match.designOnly`. The 38th here is `div-24`, a **1.09 × 22 px
hairline divider**. Dropping it from the findings is right; presenting the two populations as one
number is not.

**Why this one matters more than its size.** The whole reconcile workstream rests on handing the
judge a COMPLETE account — "these N comp elements have no counterpart" is the map's entire value
proposition. A count that overstates the list by an unexplained one teaches the reader that the
remainder is normal, and the next gap will be a real element. Same shape as the two harness defects
step 2 found, and as the plan's own subject: **a report that looks complete.**

**Fix is a decision, not a patch** — either count the same population in both places, or have the
headline say both ("38 unmatched, 37 of them large enough to report"). Do it in the reconcile
workstream, where the headline is the deliverable.

## 2026-09-16 — a corpus that measures ITSELF drifts with the clock, and the drift reads as a regression

The `refdiff` corpus's implementation side is the annotator serving `fixtures/demo-root`, and the
Library page it captures renders **the age of the runs it contains**. Crossing midnight into the
16th turned `20 d ago` into `19 d ago` on `refdiff-library-groups-desktop`. The label narrowed, the
row reflowed, two elements moved ~13 px, and one pairing was lost: **`matched` 197 → 196, findings
560 → 561, +4 / −3** against the previous evening's run, with nothing edited in between.

That is precisely the signature step 2 declared a REGRESSION ("a `matched` column that fell while
`d-only`/`i-only` rose"), produced by the calendar. The tell is cheap: read the INTRODUCED findings
and look for a relative date — `N d ago`, `stale`, a countdown. The uctoinak2 corpus has the same
shape in a milder form (`"August 2026 · uzávierka o 9 dní"`).

Two things follow. A baseline is only comparable to a run from the same DAY, so the date in
`baseline-matching-<date>.md` is load-bearing, not decoration. And a guard whose fixture renders
live time will keep manufacturing small deltas — worth either freezing the clock on the capture or
adding the affected texts to that pair's `ignore.textPatterns`, neither of which is done.

## 2026-09-15 — an AGGREGATE score answers the question it was built for, not the one you are asking

`alignment.confidence` is the fraction of anchors the fitted transform explains **on both axes at
once**, and it is right that way: it gates the pixel channel, and diffing pixels needs both axes.
Step 4 then reached for it to answer a different question — "do these two surfaces correspond well
enough for element-wise findings?" — and it gave a confidently wrong answer.
`tx-picker-owner-mobile` rests on 17 anchors: 14 agree on X, 1 on Y, **0 on both**. Joint score
0.00, `confidenceX` 0.82, match rate 0.91. Both rules the plan proposed read the joint score, so
both would have labelled the corpus's best-corresponding component pairs "go reconcile the
structure" — the exact harm the plan was written to prevent.

**The tell was already in the codebase.** `Alignment.confidenceX`'s own doc comment says the
collapse happens, says what it means, and says the pixel gate stays on the joint score *because
pixels need both axes*. Nobody had asked whether the NEW consumer had that requirement. It did not.

So: before reusing a score, read what it AGGREGATES and ask whether your question needs the same
aggregation. A number in range and a number that means what you want are different things, and a
plausible-looking 0.00 is the easiest of all to take on trust. (The plan said "do not take the
arithmetic on trust" and it was right, but it guessed the wrong cause — it expected a broken fitter,
and the fitter was fine.)

Corollary, same pair: `fitAxis` bails to the identity when its median |residual| exceeds
`AXIS_RESIDUAL_MAX` = 12 px. That pair's Y residual is **12.10**. A 0.8% miss silently replaces a
fit worth 8 of 17 anchors with "no transform", taking `confidenceY` 0.47 → 0.06. Threshold cliffs
in a reported score need to say they fired; this one does not, and `basis` still reads `anchors`.

## 2026-09-15 — a 307 is not proof the server is up; probe the route that actually failed

The handoff already documents that an OOM-killed dev server leaves a poisoned Turbopack dist dir
where "every page and API route answers 500 while middleware-level redirects still answer 307". The
documented probe is `curl` on a page route expecting **307** — which is the redirect, i.e. exactly
the response the poisoned state still produces. It reported READY on a server that could not serve a
single page, and the corpus run then died on all 31 pairs with `auth-failed: POST /api/test/session
→ HTTP 500`.

**Probe the thing the work needs, past the first layer that can answer without it.** Here that is
`POST /api/test/session`: a **404** (no such user) proves the route compiled and ran, where a 500
proves nothing had. Then `rm -rf .next-design` and restart, per the existing note — the fix was
already written down; only the readiness check was wrong.

## 2026-09-15 — a measurement was wrong for a whole day because the IMPL process predated `dist`

The corpus's `refdiff` half is the annotator serving `fixtures/demo-root`, run as a long-lived
`svc` unit. Four of its nine pairs had been failing to capture (`selector-not-found` on
`#cells-impl .cellslot`, `step-failed` on `.frow:has(.fside)`), and both the plan and the handoff
recorded that as **annotator-surface drift, pre-existing, not the matcher**. That diagnosis was
wrong, and it had been written down twice.

Driving the failing route in a browser showed `#view-gallery` absent from the DOM entirely —
while `packages/annotator/src/app-shell.ts` declares it — plus a 404 for
`/set/ds-button/findings.json`. The served shell was not the shell in the source. `svc restart
annotator` fixed all four pairs, and the mechanism is one line: `cli.ts` does
`import { renderAppShell } from "./app-shell.js"`, so the process holds the compiled module
**from the moment it started**. A rebuilt `dist` is invisible to it until it is restarted.

The cost was not four pairs. The five pairs that DID capture were also measuring the stale build,
so every number the committed baseline recorded for this corpus was against an implementation
that did not correspond to the committed source. On the restart all five moved, all in the same
direction:

| pair | findings | matched | confidence |
| --- | --- | --- | --- |
| refdiff-compare-desktop | 95 → 69 | 171 → 179 | 0.68 → 0.72 |
| refdiff-library-groups-desktop | 796 → 560 | 120 → 197 | 0.30 → 0.56 |
| refdiff-library-groups-mobile | 563 → 520 | 178 → 232 | 0.70 → 0.85 |
| refdiff-compare-mobile | 19 → 13 | 67 → 64 | 0.91 → 0.97 |
| refdiff-compare-mobile-toolbar | 82 → **4, PASS** | 53 → 55 | 0.36 → **1.00** |

**`pnpm -r build` before a compare is necessary and not sufficient.** The repo rule exists because
the CLIs run from `dist`; it says nothing about a SERVER that loaded `dist` hours ago, and the
`refdiff` skill's `preflight.sh` already knows this ("an annotator process older than dist reports
as +0/−0"). The rule to state once and obey: **before a measurement, every process on both sides
of the pair must be newer than the `dist` it runs.** A stale impl does not fail loudly — it
reports confident findings about a build nobody has.

Second-order lesson, and the sharper one: **a capture failure is evidence about the harness's
environment, not a diagnosis.** "Annotator-surface drift" was a plausible story that fit the
symptom, survived two write-ups, and was never tested — the test was one browser visit.

## 2026-09-15 — warming a URL cannot warm a Storybook story, and the retry that fixes it

The baseline harness GETs every impl URL before measuring, because a cold Next route can exceed
the capture adapter's 30 s navigation budget and die `navigation-failed` — a measurement of the
bundler, not of the matcher. That works for routes and is worth the minute it costs.

It does nothing for a story. **Every Storybook story lives behind the same `iframe.html`**, which
is served as a static shell; the story's own module is compiled when the BROWSER asks for it, so
`fetch('/iframe.html?id=X')` returns 200 having compiled nothing, identically for every id.
Measured: the first `uctoinak2-storybook` pass reported 8 of 14 pairs as
`navigation-failed`/`unreachable` despite warming all 14 — and on the next invocation 4 of those 8
captured unchanged, because the failed attempt had done the compiling.

The harness now **retries the pairs that failed to capture, once, and believes the second answer**
(`retryFailed`). What makes that safe rather than flakiness-tolerance is the other 4 of the 8:
they were a genuinely broken story and said so on both attempts, and *louder* the second time
(`story-error` naming a missing export, where the cold run had said `unreachable`). A retry cannot
turn a real failure into a pass. What it can hide is a pair that fails half the time, so the pairs
that needed a second attempt are recorded in the notes and printed above the tables.

## 2026-09-15 — a liveness probe must hit a URL the job actually uses

The harness skipped a corpus if its impl server did not answer, and probed the bare origin. The
uctoinak2 app has no unlocalised root: `/` 500s, `/sk/...` answers. So the probe rejected a server
whose 31 routes were all fine, and the document silently fell back to three-hour-old numbers for
the whole corpus — dated and labelled, which is the only reason it was caught.

`reachable()` now probes the corpus's FIRST impl URL and falls back to the origin only when there
are none. A precondition check that can reject on a path the job never visits is not checking the
precondition it claims to, and here the cost of the false negative was 29 pairs.

## 2026-09-15 — two devbox traps that present as application bugs

**A Turbopack dist dir that was OOM-killed mid-compile serves server-wide 500s with no usable
error.** After the app server was OOM-killed, every restart answered 500 for every page and API
route while middleware-level redirects still returned 307 — and the only thing in the log was
1362 repetitions of an `Edge Instrumentation` warning that had ALSO been there during the last
run that worked, so it read like a cause and was not. `rm -rf .next-design` and a restart fixed
it. Before log-archaeology on a dev server that was killed rather than stopped, clear its dist.

**`pnpm storybook` hardcodes `-p 6006`, so `svc`'s `$PORT` is ignored.** `svc status` reported the
unit on 6007, nothing was listening there, and Storybook was on 6006 — a port `svc` believes
belongs to a different worktree's unit. A service whose command ignores `$PORT` makes `svc status`
report a port that is not where the service is.

## 2026-09-15 — widening the corpus by starting a second server killed the first one

14 of the uctoinak2 corpus's 45 pairs capture a Storybook story rather than a route, and they
were failing `unreachable` because no Storybook was running. Starting one (`svc up storybook`)
looked free: a component dev server, already declared as a unit, nothing shared with the app
server on another port.

Twenty minutes into the next corpus run the app server vanished mid-capture, and the harness —
correctly — recorded the whole corpus as NOT MEASURED. `dmesg -T` named it without ambiguity:
`Out of memory: Killed process … (next-server (v1)) … anon-rss:2905944kB`, inside the
`svc-adhoc-design-live` slice. The devbox has 7 GB, of which a stray `tsserver` held 1.5 GB and
Storybook 640 MB; Next dev plus a Chromium capture run does not fit in what was left.

Two things worth keeping:

- **A capture corpus is a memory workload, not just a wall-clock one.** Every extra server is
  competing with the browser that has to render 45 pages. Check `free -g` and the biggest RSS
  before adding one, and expect the victim to be the LONG-lived process, not the new arrival.
- **`dmesg -T | grep -i oom` belongs in the first three commands after any mass run dies
  strangely**, before any theory about the code. The tell here was perfect — a `fetch failed`
  on a server that had been answering for hours — and it still took a detour through "did the
  harness break?" to get there.

The resolution was to give up the 14 pairs rather than the 31: Storybook stopped, app server
restarted, and the component pairs recorded in the baseline document as not measured with this
as the reason. A guard that covers 31 pairs and says so beats one that covers 45 on a machine
where the run cannot finish.

## 2026-09-15 — a corpus can shrink without the summary ever saying so

Building the step-2 baseline harness, the refdiff corpus reported five pairs. The manifest
declares eleven: two are `disabled`, and **four fail to CAPTURE** — the two Gallery pairs on
`selector-not-found` (`#cells-impl .cellslot` never appears at `/#/set/ds-button`) and the
two ghost pairs on `step-failed` (`#pane-swap` is `display:none` outside
`body.layout-minimal`, and `.frow:has(.fside)` matches nothing on the opened pair).

The structural point is not the four breakages, it is how they present. **A pair that fails
to capture leaves no run dir**, and `refdiff summary` reads run dirs — so the set summary
renders a complete-looking table over 5 of 9 runnable pairs, with nothing anywhere saying
that four are missing. Every per-pair number in it is correct. Only the corpus is wrong,
and only against a manifest nobody re-reads.

Same shape as the `set.json` rule already in the skill ("what a set CONTAINS is an artifact,
not a console line"), one level up: **a run root structurally cannot report what was never
measured.** The baseline harness now parses the run log for `capture failed` and `skipping …
disabled` and names both lists in the document beside the tables. The four failures are
pre-existing (annotator-redesign surface drift, not the matcher) and are not fixed here;
they are now at least visible in the artifact rather than only in a scrollback.

## 2026-09-15 — "the skill ships with the code" fails silently, and phase 1 proved it

`CLAUDE.md` opens with a hard rule: a change to what the tool does updates
`skills/refdiff/SKILL.md` in the SAME change. Phase 1 (`164828a`) added `via`, `gamma`,
`unverified` and `unverifiedReason` to every finding, a provenance tag to every console
line, an `unver` column to the set summary and a chip to the annotator's finding row — and
touched ten files, none of them `SKILL.md`. `grep -n "unverified" skills/` came back empty a
session later.

Nothing failed. Typecheck passed, 837 tests passed, the commit message was thorough, and the
handoff recorded the work accurately — for a reader of the handoff. The only reader who
matters reads the skill, and the skill still described a report with no notion of how much
to believe a finding.

Why this one is easy to miss specifically: the rule's own table is keyed on visible surface
changes ("a CLI flag", "a default", "the manifest shape"). An ADDITIVE field changes no flag,
breaks no caller, and renames nothing — so the grep the rule prescribes has nothing to hunt
for, and the check never fires. **Add the reverse check to the gate: before committing, grep
the skill for the name of anything NEW the report now carries; zero hits is a finding, not a
pass.** Fixed here, for step 1 and step 2 together (`§1a-ii` and the `Matching` table).

## 2026-09-10 — the two sides were photographing different things, and the halfway fix reads as a fix

A consuming repo asked why Figma cells have a transparent background in the annotator
while the impl cells carry a dark rectangle. The answer is the capture depth: Figma's
`/v1/images` renders a node's subtree onto transparency and takes no background
parameter, while a browser screenshot is a composite of the page. Shipped as `ground`
(default `transparent`, `keep` to opt out).

- **pixelmatch 7 blends transparent pixels against a CHECKERBOARD, not white.**
  `checkerboard: true` is the default and we pass only `threshold`/`includeAA`/`diffMask`,
  so a transparent pixel is compared against a position-varying 48/207 pattern. The
  consequence is counter-intuitive and expensive: making a page ground WHITE, so it
  matches the "blend onto white" everyone remembers from pixelmatch 5, moves a 60.76%
  frame residual to **59.66%**. Only real alpha on both sides collapses it (1.12%). Any
  reasoning about what a transparent design pixel "compares as" must start by re-reading
  that default — I asserted white from memory and was wrong in a way that would have sent
  the consuming repo to edit 22 story wrappers for a 1-point gain.
- **A revert that fails is worse than a shot that fails, because the tree is extracted
  NEXT.** Every adapter screenshots and then calls `extractElementTree` on the same page.
  A neutralisation left in place does not spoil a screenshot — it writes
  `backgroundColor: transparent` onto every ancestor in `elements.json`, with no failure
  signature. So the revert is not `closeQuietly` material: it runs on every path and its
  own failure outranks the shot's error. The first prototype got this wrong in the most
  ordinary way — inline styles with a saved value per element, `<body>` registered twice
  by two loops, restored in forward order, and `body` came back `rgba(0,0,0,0)` from a
  "successful" revert. One stylesheet plus a marker attribute has no such state.
- **`variantSpec` is where an entry-level setting goes missing on every cell at once.**
  Its own comment says so, `bleed` shipped with exactly that bug, and `ground` would have
  been the second. The test file already had the row shape to copy. Read that comment
  before adding any entry-level field.
- **Candidate home:** the pixelmatch default belongs wherever the pixel channel is
  described (it changes what a reader predicts a diff will do); the revert-ordering rule
  belongs next to the capture adapters' "settle first, extract second" note.

## 2026-09-07 — "it stopped working" needs a CONTROL, and two of three were never working

Three reports after a day of sheet changes. The instinct was that all three were mine.
A `git worktree add <scratch> HEAD --detach`, one `pnpm --filter annotator build` and a
second server on another port settled it in about two minutes:

| report | HEAD (before) | now | verdict |
| --- | --- | --- | --- |
| wipe dead on a sheet | ghost `display:none`, no src | identical | never worked |
| a pair drawn over the sheet's grid | 96 stale cell nodes | identical | pre-existing |
| impl cells are black rectangles | captures dated three days earlier | — | a real FINDING |

- **A same-repo control is cheap and it is the only thing that separates "you broke it"
  from "you exposed it".** Two of the three had a plausible story pointing at that day's
  diff (I had touched the sheet's cell rendering, the ghost transform and the route
  classes). Reasoning from the code would have reached the right answer more slowly and
  with less confidence than building HEAD next to it.
- **A dead control that still LIGHTS UP is worse than a missing one.** Every overlay mode
  runs through `#ghost-wrap`, whose only occupant was `#img-ghost` — a `.shot`, and
  `body.is-sheet .shot { display:none }`. So on a sheet the Wipe button turned on, the
  handle appeared, the clip-path was set, and nothing was revealed. Every observable said
  it was working. **When a feature is scoped off by a CSS rule somewhere else, its control
  does not learn about it** — so either the control goes, or the feature follows.
- **The third report was the tool doing its job.** `button-fill`'s danger/success cells
  render `rgb(0,0,0)` against a design of `rgb(230,89,89)` — 16 findings, already in
  `findings.json` from three days earlier, and the same `neutral.black` resolution the
  repo owner is holding red for the designer. **Check the artifact's date before believing
  a regression report:** the captures predated the session by three days, which is one
  `ls` and ends the question.
- **Candidate home:** the control-build habit belongs in CLAUDE.md next to the
  measurement rules; the dead-control observation belongs wherever the annotator's
  overlay modes are documented.

## 2026-09-07 — clipped is INVISIBLE, and an A/B is what turns "changes nothing" into a fact

`--bleed` landed: a capture is clipped to its node's border box, so a focus ring, an
offset outline or a drop shadow is simply not in the picture. **The failure mode is what
makes it worth a rule: it reports NOTHING.** Both sides stop in the same place, so the
missing paint differs on neither, and a `State=Focus` column looks identical to `Default`
with a green structural channel. A whole class of drift was unmeasurable and nothing said so.
The tell is not a finding, it is a state whose entire point is invisible.

- **The measurement-neutrality claim was FALSIFIED, not asserted, and it was wrong twice
  before it was right.** Run 1 of the A/B: 10 of 24 pairs differed. Run 2 after the first
  fix: 11 of 24, by ~0.02pp. A control (two no-bleed runs) was byte-stable at 0.00000, which
  is what proved the difference was mine rather than run-to-run noise. **Run the control:
  without it, "0.02pp, that is just noise" is a story rather than a finding.**
- **Defect 1 was pre-existing and the bleed only exposed it.** `clusterMask`'s results were
  sorted by pixel count alone — not a total order, so two equal-sized regions kept whatever
  order the flood fill discovered them in, and the message read `26x40 at (0, 0); 26x40 at
  (84, 0)` one run and the reverse the next. A message is part of a finding's identity, so
  that is a phantom resolved+introduced pair in the delta: a fix come undone that nobody
  undid. **An unstable comparator over data whose order reaches a user-visible string is a
  bug even while its input happens to be deterministic.**
- **Defect 2 was the interesting one: Playwright's element screenshot does NOT clip at the
  element's box.** It expands to whole CSS pixels — measured, a 109.40625px node at dpr 2
  comes back 222 native, i.e. floor(x) to ceil(x+w). A raw fractional clip therefore starts
  the PNG ~0.78px earlier and every crop taken from it shifts. Flooring the clip origin fixes
  it exactly, because `floor(x - n) === floor(x) - n` for integer n — so `clip.x + bleed.left`
  lands on the very pixel the element shot started from. Result: 24/24 byte-identical
  findings, `max abs delta = 0`. **Before changing HOW a screenshot is taken, measure what
  the old call was actually framing; "it clips to the element" was an assumption.**
- **Also: my own comparison command was wrong and looked right.** `ls | grep -v md` to list
  run dirs matched every one of them, because every DS pair id contains `size-md` — so `comm`
  reported no difference between a 23-dir and a 24-dir roster. Same family as the repo's
  "name the CORPUS in the same breath as the number" rule: the extractor is the thing to
  probe, and a diff that reports NO difference deserves the same suspicion as one that
  reports a surprising one.
- **Candidate home:** the clipped-is-invisible framing and the element-screenshot geometry
  belong in SKILL.md (both landed there already); the unstable-comparator and the
  control-run rules belong in CLAUDE.md.

## 2026-09-07 — a comment that names a value the caller never passes, and what "it's still there" means

Three defects in the sheet renderer, found in one sitting by a user reporting what they SAW.

- **`cell.track` was computed and never delivered.** `galleryLayout` returns a `track` per cell and
  `renderCellShots` reads `cell.track || cell.rect` under a comment saying "The SLOT is the track…
  drawing the slot at the content box would shrink every cell's outline to its button." But
  `openGallery` copies only `rect` onto its rich cells, so `track` was `undefined` for the life of
  the feature and the `||` fell through to the branch the comment explicitly rejects. **A `a || b`
  fallback plus a comment asserting `a` is a claim nothing tests** — the code ran, looked plausible,
  and the comment read as documentation of the opposite behaviour. Lesson: when a comment names the
  field a line PREFERS, assert that field arrives, or the fallback is the real implementation.
- **"X is still there after you removed Y" usually means a THIRD thing.** The user reported the
  sheet's "extended canvas as if the count badge was still there" right after the badge was removed
  and verified gone (0 in the DOM). What they were seeing was `.cellslot`'s 1px border, drawn at
  the per-axis MAX of design and impl, so on a cell whose design is 128 wide against a 109 impl the
  box ran 19px past the picture with nothing in it — the same strip the badge had sat in, which is
  exactly why removing the badge did not remove the appearance. Lesson: a report of "unchanged"
  against a verified change is a pointer to a co-located element, not a failed deploy — measure the
  BOX the user is describing, not the thing you just touched.
- **Two mutually exclusive route classes, and no rule saying so.** `route-report` hides
  `#view-gallery` and `route-gallery` hides `#view-report`; the sheet route adds the first and
  `sheetFailure` added the second without removing it, so an unknown `#/set/<id>` rendered a
  completely BLANK page. The INDEX_CSS comment warns about the two-sections-at-once direction of
  this trap and the zero-sections direction had no guard at all. Lesson: when two classes hide each
  other's section, the invariant is that at most one is set — write it down and test it, because
  the failure is invisible (no error, no content, nothing in the console).
- **Also:** the backtick-in-a-template-literal compile break fired TWICE more today, once in each
  file, despite both files carrying "(No backticks in this comment: the whole block is a template
  literal.)" markers. The marker is next to SOME blocks, not all of them; a lint rule would be
  cheaper than the note.
- **Candidate home:** the first and third belong in CLAUDE.md (they are general); the second is a
  debugging heuristic worth a line in the same place; the fourth is a tooling ask.

## 2026-09-07 — dropping a dimension shortens a KEY, and a shortened key collides silently

- **Context:** the variant sheet stopped drawing axes whose value never varies (a set narrowed to
  `Theme=Dark, variant=light, Size=md` should not spend three axes saying so). The cell lookup keys
  on the remaining props — and `ds-select-field`'s key became `State=Active` ALONE, which 58 of its
  skipped variants share. `new Map(entries)` keeps the LAST, so a cell the pruner had classified
  `unmapped` (the impl lacks it — a real coverage gap) was drawn `filtered` (out of scope). One
  entry, two answers, and the gap vanished from the sheet.
- **Lesson:** whenever a projection DROPS a dimension, every key derived from the remaining
  dimensions gets weaker, and a `Map`/`Set` built on it silently collapses rows that were distinct
  a moment earlier. The fix is not a better key, it is recognising that the projection defines a
  SLICE: the lookups must be filtered to the pinned values, so only members of the slice can be
  found at all. **Same family as the repo's existing "a set-valued assertion is blind to a new
  member whose element key collides" rule — the mirror image: there a NEW member collided with an
  existing one, here dropping a field made existing members collide with each other.**
- **How it surfaced, which is the transferable part:** a projection was computed BEFORE the change
  ("this should give 100% fill on 8 of 14 sets"), and the run afterwards said 86% on three of them.
  Neither number was wrong to compute and neither test failed — the discrepancy between a
  prediction and a measurement is what exposed it. **Predict the number before a mechanical change,
  then diff prediction against result; a match is cheap and a mismatch is a bug you would not have
  looked for.**
- **Candidate home:** CLAUDE.md's set-valued-assertion rule, as its mirror; and `SKILL.md` §1b,
  which now says a sheet with pinned properties is a slice.

## 2026-09-07 — a `waitFor` inside a conditionally-visible pane reports as an UNBUILT SURFACE

- **Context:** `refdiff-gallery-mobile` waited on `#cells-impl .cellslot`. At 390px the
  comparison tool shows ONE pane, so those slots exist in the DOM but are never VISIBLE, and the
  pair failed `selector-not-found` — measuring nothing. Its last successful numbers (426 findings,
  confidence **0.00**, 87 impl leaves against the comp's 311) were then quoted in the handoff as
  evidence that the phone sheet was "unbuilt". Fixing the selector to accept either pane's slots
  gives **261 findings at confidence 0.78**: rough, not absent.
- **Lesson:** confidence 0.00 with a tiny impl leaf count is the SIGNATURE of a capture that
  did not really happen, and it is indistinguishable from an unimplemented surface if you only
  read the report. Two things follow. **(1) A `waitFor` must name something that is visible in
  every layout the pair captures** — a selector inside a pane, tab or drawer that a breakpoint
  hides is a pair that silently stops measuring at that breakpoint, and `exit 2` is easy to miss
  in a loop over several pairs. Name both alternatives (`#cells-design .cellslot,
  #cells-impl .cellslot`) or pin the layout the way the toolbar pairs pin `?layout=`. **(2) Never
  quote a pair's numbers as the state of a surface without checking the run EXITED 0** — the
  numbers on disk are from whenever it last succeeded, which may be a different build entirely.
- **Also, the method that settled it:** before attributing the failure to the change in hand, the
  change was REVERTED and the pair re-run — same failure, so pre-existing. Two minutes, and it is
  the difference between fixing a bug and "fixing" an innocent line.
- **Candidate home:** `SKILL.md` § "Configuring a pair", next to `waitFor`; and rule 6 ("a capture
  is not a pass") gains the mirror — a stale report is not a measurement.

## 2026-09-07 — `explain`'s `within: { role }` takes its regions from the IMPL side

- **Context:** the sheet stopped drawing `absent` cells, so the comps' 24 `ABSENT` tiles became
  findings. The first declaration was `explain: [{ types, within: { role: "text" }, text: "ABSENT",
  … }]`. It sat in the policy and explained **0 of 37**.
- **Lesson:** `explainFindings` builds `within`'s regions from `implElements` — elements of the
  IMPL capture — and a finding matches only if EVERY one of its boxes falls inside one. So
  `within` can never explain a finding whose whole point is that the impl element is missing.
  `within` is for a container that EXISTS on both sides (a canvas, a rail, a screenshot); a removed
  element needs `region`, or a different tool. Here a `region` wide enough to hold them
  (x 154..1008, y 500..730) would have covered the entire grid and swallowed every real finding of
  those eight types, so the answer was an anchored `textPatterns: ["^ABSENT$"]` — precise because
  the string exists ONLY on the comp side, and audited by checking that all 118 suppressed
  findings carry it and nothing else.
- **The related judgement:** the run's `⚠ suppressed finding(s) moved ≥8px — a rule is hiding
  geometry` is normally a real warning, and the documented remedy is `dataSlots` (which keeps
  geometry compared). That remedy is WRONG when the element is gone rather than churning: there is
  no geometry left to compare, only the matcher pairing a removed comp tile against a surviving app
  cell. Record that beside the rule or the next reader "fixes" it.
- **Candidate home:** `SKILL.md`'s `ignore` table — say what `within` resolves against, and add the
  removed-element row.

## 2026-09-07 — check rendered text CASE-INSENSITIVELY: CSS can transform it

- **Context:** verifying the sheet's new cell notes, a probe searched the extracted elements for
  `"Missing in impl"` and found **zero**, on both viewports — which looked like the notes not
  rendering at all, and nearly sent a real feature back for repair. `.cellnote` carries
  `text-transform:uppercase`, so the extractor reports `MISSING IN IMPL`. Fourteen of them were
  there the whole time.
- **Lesson:** the structural extractor reads what the browser RENDERS, not what the source writes,
  so any assertion about on-screen text must fold case (and whitespace) or it is testing the CSS
  rather than the content. This is the third instance in this repo of an anchored-on-one-shape check
  reading zero and being mistaken for a real absence — the earlier two were a doc sweep anchored on
  one casing and a namespace-blind `ElementTree` query on the compliance report. **A zero from a
  hand-written extractor is a claim about the QUERY until proven otherwise: verify it against a
  known-present member first.**
- **Candidate home:** `SKILL.md` § "Reading the measurements", with the namespace-blind-count note
  it generalises.

## 2026-09-07 — the backtick trap fires in CSS comments too, and twice more

- **Context:** the handoff's env gotchas already warn that a backtick in `app-shell.ts`'s `APP_BOOT`
  or `INDEX_CSS`, or `render.ts`'s `CLIENT` / `EMBEDDED_BOOT`, closes the template literal — and
  that it always arrives "by writing an identifier in a comment the way this repo writes identifiers
  everywhere else". It fired twice more today, in CSS comments (`/* … `unmapped` is the impl's gap
  … */`) inside those very blocks, plus once in a JS comment.
- **Lesson:** the existing rule says "no backticked identifiers in comments in there" and it is
  right; what it under-states is WHERE. A CSS comment inside a styles template feels like CSS, not
  like TypeScript, which is exactly why the habit survives the warning. Two things help more than
  the prohibition: the failure signature is a burst of `TS1005` plus `TS1160 Unterminated template
  literal` pointing at the comment rather than the backtick, and the diagnosis is
  `grep -n '\`' <file>` — every remaining backtick should be a template delimiter, and any line
  with one that is not is the culprit. Naming the block in the comment ("no backticks in here:
  INDEX_CSS is a template literal") is what stops the next edit re-introducing it.
- **Candidate home:** the existing CLAUDE.md / handoff bullet — extend it to CSS comments explicitly
  and add the grep.

## 2026-09-07 — I wrote a CAUSE into a handoff without measuring it, and it framed a decision

- **Context:** chunk 5's handoff explained a missing Measured-column span as *"no group in the
  fixture mixes runs, so the app correctly draws the single-`r<n>` shape instead"*. That sentence
  was reasoning, not measurement, and it was **false**: the fixture has carried `SET_STALE` /
  `SET_OLD = 45` / `SET_NEWEST = 47` since chunk 3, and the app draws the span correctly. One query
  against the run's own `elements.json` showed `history`, `r45`, `arrow_right_alt`, `r47` and
  `yesterday · 3 stale` all present on the impl side — at y=841 where the comp draws them at y=201.
  The real cause is ROW ORDER: the comp's first row is a set, the app sorts newest-run-first.
- **Lesson:** the rule "every claim is a number from `findings.json`" is obeyed for FINDINGS and then
  quietly abandoned for CAUSES. A finding says *what* differs and is always measured; the *why* is
  written from the model's head, reads with the same authority in a handoff, and nothing checks it.
  **The check is cheap and specific: a missing-element claim of the form "the app does not draw X" is
  falsified by grepping the impl side of `elements.json` for X.** It costs one query and it is the
  difference between "unimplemented" and "implemented, in the wrong place" — which are opposite
  instructions to the next reader. Worse here: the false cause was used to frame an owner decision,
  which was answered on it, and the answer then had to be re-opened.
- **Candidate home:** `SKILL.md` § 2 (classify every finding) — before recording a cause for a
  `missing-element`, confirm the element is absent from the impl side rather than displaced. Pairs
  with the existing anchor-diagnostic habit.

## 2026-09-07 — a generated file inside the scanned directory makes every false positive permanent

- **Context:** `icon-subset.mjs` derives the glyph list by intersecting every quoted lowercase token
  in `design/refdiff/**` and `packages/annotator/src/*.ts` with Google's codepoints list. Chunk 5
  added a doc comment containing the quoted ARIA role name `table` — which is also a glyph name — so
  the subset grew to 113. Rephrasing the comment did NOT remove it: `--check` still reported 113.
- **Lesson:** the script writes `src/icon-names.ts` INTO the directory it scans, so it reads its own
  output back as input. Any false positive is thereby self-sustaining and **cannot be removed by
  fixing the source that introduced it** — only by excluding the generated file, which is now done.
  This is the mirror of the rule the consuming repo already has ("a scanner whose own detection
  patterns spell the forbidden tokens must exclude its own home directory"): there the scanner
  flagged its own regexes, here it re-fed its own output. The general form is **a derived artifact
  must never be an input to its own derivation**, and the symptom is diagnostic — a fix to the
  source that provably does not change the output.
- **Candidate home:** `SKILL.md` or CLAUDE.md, beside the icon-subset note. Pair it with the
  over-inclusion fact: of the 12 glyphs this session added, only 5 were icons the comps DRAW — 6 came
  from the comps' fixture ids (`radio`, `switch`, `tabs`, `tooltip`, `select`, `label` are all real
  glyph names) and 1 from a comment. Over-inclusion is the safe direction (a missing glyph renders as
  its NAME and poisons a pair; a spare one costs ~1.7 KB), but a reader who greps the subset for
  `switch` and hunts for the icon will not find one.

## 2026-09-07 — a max-width never binds at its own viewport, so no pair ever measures it

- **Context:** the annotator's `.lib` was `max-width:1180px`. The two RefDiff Library pairs capture
  at viewport 1180, so the rule never engaged and both pairs sat at confidence 0.89 / 1.00 for weeks.
  The new Library-groups comp captures at 1240, where 1180 DOES bind: the container centred, content
  started at x=46 against the comp's 16, the table card measured 1148 against 1208, and every filter
  chip landed 7px left. One stale value displaced the entire page.
- **Lesson:** **a constraint whose threshold equals its only pair's viewport is invisible to
  measurement, not correct.** Reading the CSS tells you nothing — 1180 looks deliberate — and reading
  the comp tells you nothing either. Only a pair at a DIFFERENT viewport can see it. So when a new
  pair for the same surface arrives at a new size, expect the container constraints to be the first
  thing it finds, and check them before chasing the elements they displace: the 52 `position`
  findings in run 2 were one cause. The reverse also holds and is what made the fix safe — raising
  1180 to the comp's own 1240 could not move the old pairs, because 1240 does not bind at 1180
  either, and both were re-run to prove it rather than argued about.
- **Candidate home:** `SKILL.md` § "Reading the measurements", as a container-first ordering rule for
  a first run at a new viewport.

## 2026-09-07 — where the screen label sits decides whether a phone comp needs a `scope`

- **Context:** the plan and the handoff both stated, twice each, that
  `refdiff-library-groups-mobile` needs `scope: ".cc-theme-dark"` because it is "its own 390x844
  phone frame inside a showcase". It does not: with the scope the run failed `scope-not-found` and
  compared NOTHING (exit 2).
- **Lesson:** the rule is not "phone comps need a scope", it is **where `data-screen-label` sits
  relative to the phone node**. Measured across the three phone comps in this repo: `RefDiff Gallery
  Mobile.dc.html` and `RefDiff Mobile.dc.html` put the label on an OUTER showcase node with
  `.cc-theme-dark` inside it, so the scope is what picks the phone; `RefDiff Library Groups
  Mobile.dc.html` puts the label ON the `.cc-theme-dark` node, so the frame already IS the phone and
  a descendant search finds nothing. One grep answers it before a run does
  (`grep -o 'data-screen-label="[^"]*"'` plus a check of whether that tag also carries the class).
  The generalisation: **a `scope` copied between sibling comps is a guess about their DOM shape**, and
  the failure is loud but costs a capture.
- **Candidate home:** `SKILL.md` § "Configuring a pair", next to `scope`.

## 2026-09-07 — a reference comp below the persist-to-disk threshold has a verified route, not only a deferral

- **Context:** the 2026-09-04 lesson said a `get_file` result over ~32 KB is persisted to
  `tool-results/` and can be decoded with no transcription, and that below that threshold "the honest
  move is to DEFER rather than hand-copy a reference artifact". Both Library Groups comps came back
  INLINE and complete (`truncated: false`), so the prescribed route did not exist and chunk 5's
  blocking prerequisite could not be met by deferring again.
- **Lesson:** the deferral is the right DEFAULT, but the named hazard is specific and mechanically
  closable — "emitting the CHARACTER instead of the six-character escape". Reproducing the
  **JSON-escaped** string verbatim into a file and letting `json.loads` do the decode removes the
  whole class, because the escapes are never interpreted by hand. What is left is ordinary copy
  error, and that is falsifiable without the remote: transcribe both comps independently, then diff
  the regions they SHARE. Measured here — the two script bodies differed by exactly one line
  (`isM = !!this.props.mobile` vs `isM = true`), the shared `isMobile` markup branch by exactly its
  `hint-placeholder-val`, and the shared chrome by exactly the phone-frame wrapper; ~19 KB of each
  file cross-confirmed by the other. Plus a targeted count for the named hazard (zero literal `·` /
  `→` / `—` in either script block, the escapes present) and the `$preview` dimensions matching a
  plan table written three days earlier from the same comps.
- **Candidate home:** `SKILL.md`'s refetch procedure — replace "defer" with "defer, or use the
  JSON-decode route with a shared-region diff", and keep the ban on hand-DECODING escapes.

## 2026-09-04 — an unlinked surface is indistinguishable from an unbuilt one

- **Context:** chunk 3 shipped the variant sheet at `#/set/<entryId>` and deliberately did NOT link
  to it from the Library, on the grounds that touching the Library's markup would move its two
  measured pairs a third time. The handoff recorded that as "still open, and small".
- **Lesson:** the deferral was the wrong trade and the way it failed is the point. **The same
  session then told the user to "click any set group"** — a control that did not exist, because the
  session that skipped building it was the one writing the instructions. The user's reply was "I
  don't see it. How can I open a gallery on mobile?", and on a phone the answer was genuinely
  nothing: the only way in was typing a URL. **A feature reachable only by URL is not shipped, and
  it is worse than unshipped, because it reports itself as working.** The cost of the thing I was
  protecting turned out to be zero: both Library pairs still PASS and the new elements were absorbed
  by the already-declared cause (17 explained where it was 14; unexplained unchanged at 1 and 0).
- **The mechanical half, worth keeping:** the link is a SIBLING of the `.ghead` button, never a
  child. An anchor inside a button is invalid HTML, and the group toggle resolves
  `closest('.ghead')`, so a nested link would follow itself AND expand the group.
- **Candidate home:** CLAUDE.md's verification neighbourhood — the general rule is that **"the code
  is in" and "a user can reach it" are different facts**, which is the same shape as the skill's
  "a green pair proves the STATE matches the comp; it says nothing about whether a user can REACH
  that state". That note already exists in `SKILL.md` § "Environment pre-flight" and this is its
  second firing, so it is a promote-on-recurrence candidate.

## 2026-09-04 — two comps that render the same furniture are not the same surface

- **Context:** chunk 3's Gallery comp turned out to be the comparison tool's chrome with a sheet in
  its panes. I recommended scoping the pair to the grid alone, arguing the chrome "belongs to the
  comparison tool, already paired and converged against its own comp", so measuring it twice would
  only let two comps disagree about one top bar. **The repo owner refuted it in one sentence: the
  gallery's findings rail has a Recurring-causes section the tool's rail has not.**
- **Lesson:** the premise was inferred from the comp LOOKING like the tool and was never diffed. One
  command settles it — `grep -oiE '>[^<>{}]{2,40}<'` over both files, set difference, count: **21
  shared chrome strings, 18 gallery-ONLY**, with `Recurring causes` and `Other findings` present in
  the Gallery comp and absent from the Comparison Tool comp entirely (the sheet's rail groups by
  CAUSE; the tool's lists findings with instance aggregates). The rest of the gallery-only list said
  the same thing twice over — a cell-state legend, `DESIGN`/`IMPLEMENTATION` against the tool's
  `Design`/`Impl`, four comment affordances, and a section breadcrumb. **Scoping would have shipped a
  whole rail with no pair measuring it** — the pair-per-comp-gap class, which is the defect the
  workstream exists to remove and the one that reports itself nowhere. Generalised: **"this surface
  is already covered by another pair" is a claim about two comps' CONTENT, so diff the content
  before you act on it.** The measurement is cheap; the failure mode is invisible and permanent.
- **Second-order, and the reason this one stings:** the argument I made was itself a
  parity-by-eyeball argument, in a tool built to abolish those — the skill's rule 1 aimed at a
  comp-to-comp comparison instead of a design-to-impl one. **Rule 1 applies to comparing two
  DESIGNS, not only a design and an implementation.**
- **Candidate home:** `SKILL.md` rule 4's neighbourhood (a comp can contradict its siblings — this
  is the same family: a comp can also silently DIFFER from the sibling you were about to delegate to)
  · `docs/plan-gallery-groups.md` chunk 3 and the handoff both carry the measurement now.

## 2026-09-04 — concatenated modules share ONE scope, and the symptom points somewhere else

- **Context:** chunk 3 added `gallery-view.ts` to the six modules `app-shell.ts` concatenates into a
  single `<script type="module">`. It declared `escapeHtml`, which `index-view.ts` already declared.
- **Lesson:** the shared top-level scope makes a repeated declaration — **exported or not** — a
  `SyntaxError` that takes the whole app down. Nothing local catches it: typecheck passed, 266 unit
  tests passed, the build passed, because each module is valid ALONE. It surfaced as
  `{"kind":"selector-not-found"}` on the new refdiff pair, which reads as a wrong selector or an
  unbuilt route — an ENVIRONMENT failure — so the first ten minutes went into the selector. **A
  whole-app failure whose only symptom is one pair's capture error is the shape to remember.** Guard
  landed: `embedded-modules.test.ts`, a pure `topLevelDeclarations` scanner with synthetic offenders
  (including the not-exported case an exported-only grep misses) plus a mutation probe, and a check
  that the guarded list is the set `app-shell.ts` actually embeds.
- **Candidate home:** `docs/architecture.md` (landed) · the handoff's env gotchas, beside the
  backtick-in-`APP_BOOT` trap, which is the same class: one file, whole-page consequence.

## 2026-09-04 — a repeated non-`multiple` flag silently keeps the LAST one

- **Context:** `refdiff compare … --pair refdiff-gallery-desktop --pair refdiff-gallery-mobile` ran
  the mobile pair alone. Twice, in one session, before it was noticed.
- **Lesson:** Node's `parseArgs` keeps only the last occurrence of a non-`multiple` option, and
  **a run that measured half of what you asked for looks completely healthy in the log** — the same
  count of `===` headers you would get from asking for one. The comma form (`--pair a,b`) was the
  only working way to select several and nothing said so. Fixed at the source (`multiple: true`,
  flatten and split, both forms work; the single-pair form now refuses two ids rather than picking
  one). The durable half: **when a flag can be given more than once, verify the COUNT of what ran
  against what you asked for** — that is the only place a dropped selection shows.
- **Candidate home:** `SKILL.md`'s run section (landed).

## 2026-09-04 — a run-wide DEFAULT that writes its key overrides every per-pair declaration

- **Context:** `LIBRARY_IGNORE.dataSlots = { patterns: [...] }` did not fire. `applyPolicy` handled
  it correctly in isolation, and the pair's `explain` rules on the same object DID fire.
- **Lesson:** the CLI built its run-wide policy with an explicit `dataSlots: false` whenever neither
  `--data-slots` nor `--data-slot-text` was passed, `mergePolicies` is last-wins on that key, and
  the run-wide policy merges LAST — so **a default nobody asked for silently disabled the key for
  every pair in every manifest**. Two shipped pairs had carried `{ patterns: ["Run \d+ vs \d+"] }`
  since 2026-09-02 and recorded `dataSlots: false` in their reports the whole time. **A declared
  rule with no effect reports itself nowhere** — the same class as a comp with no pair, and the
  reason it survived is that a rule which never fires is indistinguishable from a rule with nothing
  to do. Two habits fall out: **read `findings.json`'s own `policy` block** (it is what the run
  actually used, not what the manifest says), and **omit a key nobody passed** rather than writing
  its default — `runWidePolicy` now does, with the measurement in its doc comment.
- **Candidate home:** `SKILL.md`'s ignore-policy section (landed) · CLAUDE.md's "Suppression is
  visible or it does not happen", one level up again.

## 2026-09-04 — one timestamp was worth 174 findings

- **Context:** giving the demo root a 41-cell variant set added ONE group row to the Library. The
  desktop Library pair went to 197 findings at confidence 0.28.
- **Lesson:** the new row's `createdAt` put it FOURTH in a newest-first list, and refdiff pairs row
  N with row N, so nine cards shifted past their counterparts and reported colour, typography and
  text-content differences each. Re-timestamping the set as the oldest run in the root — one
  constant — took it to **23 findings at 0.89**, and the mobile pair to 21 at 1.00. This is the
  skill's Order-of-attack step 3 and it is why the step comes BEFORE reading a single finding: the
  whole 174 were one wrong sort position, and every one of them looked like a real drift finding
  with real measured values.
- **Candidate home:** `SKILL.md` already states the rule; the value here is the MAGNITUDE — worth
  quoting as the anchor next to it.

## 2026-09-04 — a "new view" comp can be a rebuild of an existing surface

- **Context:** the plan treated chunk 3's gallery as a new page and chunk 3 stubbed it as a new
  route (`#/set/<entryId>`). The first measurement against `RefDiff Gallery.dc.html` returned
  **777 findings, 586 of them `missing-element`, at confidence 0.00**.
- **Lesson:** the design-only elements named the cause exactly — `RefDiff`, `Split`/`Off`/`Onion`/
  `Blink`/`Diff`, `DESIGN`/`IMPLEMENTATION`/`REVIEW`, `RECURRING CAUSES`, `Findings · 74`,
  `Run 47 vs 46`, `pan_tool`, `Whole sheet`. The comp is **the comparison tool's own chrome with a
  variant sheet in its panes**, not a standalone sheet page — the same discovery chunk 0 made about
  the Library comp ("a REBUILD, not a delta"), and nobody had made it about this one. **A comp's
  frame name tells you its subject, never its surface**: read the design-only text list before
  choosing where a route lives. The measurement cost one run and would have cost a rewrite.
- **Candidate home:** `docs/plan-gallery-groups.md` chunk 3 (landed) · the run-story/`§0` habit of
  reading the design-only list as the first act after a stub.

## 2026-09-04 — a cell key must not be the grid's order

- **Context:** the sheet keyed each cell by its resolved axes joined in GRID order
  (`columns.property` first).
- **Lesson:** flipping `gallery.columns` from `tone` to `State` transposes the sheet and must not
  rename a single cell — but in grid order every key changed, so every per-cell selection, lit state
  and record would silently detach from its subject on a LAYOUT PREFERENCE. Sorting the property
  names fixes it. Caught only because the test was written to assert the property ("keys a cell by
  its options, not by its position") rather than the current behaviour; a test written after the
  code would have recorded the bug as correct.
- **Candidate home:** `docs/architecture.md`'s sheet section · the general form is worth keeping:
  **an identity derived from a presentation choice is not an identity.**

## 2026-09-04 — a sheet cannot be measured against a root with no set

- **Context:** the plan listed "the demo root must learn to emit a variant SET" as a chunk 5
  prerequisite. It is a chunk 3 prerequisite: the Gallery comp's subject IS a sheet.
- **Lesson:** the harness said so itself rather than reporting a bad grid —
  `{"kind":"error-page", "detail": "near-empty page says \"…This sheet cannot be laid out. no
  ds-button.set.json in this run root…\""}`, exit 2, nothing compared. Rule 6 doing its job. Two
  things worth keeping: **a route rendering a NAMED error state is a good stub** (it is
  deterministic, it does not 404, and the harness classifies it honestly instead of comparing it),
  and **a prerequisite's chunk is decided by what the comp's SUBJECT is**, not by which chunk first
  wrote it down.
- **Candidate home:** `SKILL.md` §0 (landed, in the sheet bullet) · the plan's chunk ordering.


## 2026-09-04 — an EMPTY declaration block is what catches a misspelled key

- **Context:** chunk 4 added `gallery: { columns?, rows?, order?, labels? }` to a manifest entry.
  The obvious validation is per field: check each key's type, ignore what you do not know. Written
  that way, `gallery: { colums: "State" }` validates cleanly as `{}` — and an empty config is
  indistinguishable from "this entry declares no layout", so the sheet lays out on whatever the
  consumer defaults to and looks entirely right.
- **Lesson:** for an all-optional block, **refusing the EMPTY result is the check that catches every
  misspelling at once** — it is one condition, it needs no list of near-misses, and it fires on the
  typo you did not imagine. Rejecting unknown KEYS is the sharper message (it names `colums`), but
  it only covers the keys you enumerated; the empty check covers the whole class, including a block
  whose every key is wrong. Ship both: the pair turns a silent default into a message naming the
  field. Falsified by removing each one and watching the test go red.
- **Candidate home:** CLAUDE.md's "Suppression is visible or it does not happen" neighbourhood — it
  is the same rule one level up (a DECLARATION that quietly does nothing is the same failure as a
  finding that quietly disappears) · or `SKILL.md`'s manifest section, which now states it.

## 2026-09-04 — trim the segments, or two identical-looking rows are two different nodes

- **Context:** section paths are flat `"/"`-separated strings (`"Core components/Buttons"`). The
  comps draw a path as `Actions / Button`, with spaces, so a hand-written manifest naturally copies
  that. Without normalizing, `"Actions / Button"` and `"Actions/Button"` are two distinct group keys
  that RENDER IDENTICALLY.
- **Lesson:** whenever a user-typed string becomes a GROUP KEY, ask what two keys that render the
  same look like on screen — the failure has no error, no warning and no visible cause, and the
  reader's only symptom is a duplicate row they cannot explain. Trim/normalize at the parser, and
  refuse the shapes that produce a NAMELESS node (`""`, `"/A"`, `"A/"`, `"A//B"`) rather than
  repairing them: each one is a typo whose only symptom is a blank row. Same family as the
  `foreignKeyEdges` collision — a rendered-string key is lossy by construction.
- **Candidate home:** `SKILL.md`'s "Declaring the library's shape" (states it) · the general rule
  belongs with the set-valued-assertion lesson if one is ever promoted.

## 2026-09-04 — "validated" is not "wired": a parsed field with no consumer is the same defect as a dropped one

- **Context:** chunk 4's three declarations (`section`, `sections`, `gallery`) change no
  measurement. It would have been easy to land the parser, pass the tests, and call it done — with
  `sections` read out of the module and thrown away, which from the outside is exactly the
  `contentsOf` bug the manifest test file already warns about ("a policy field the PARSER does not
  read is dropped in silence").
- **Lesson:** for every new declaration, name the CONSUMER before writing the parser, and if there
  is none yet, ship the smallest thing that makes the field observable. Here: `gallery` rides into
  `<entryId>.set.json` (a real consumer, chunk 3, gets it verbatim), and `section` — which needs a
  root-level artifact that does not exist — gets a printed line (`hierarchy: 3 sections declared,
  1/2 entries placed`) plus an explicit "validated and reported, NOT persisted" sentence in
  `SKILL.md` and the plan. A declaration with no output is indistinguishable from a key nobody
  reads, and the next session cannot tell which it is holding.
- **Candidate home:** CLAUDE.md HARD RULE table — a row like "a new manifest/config field | name
  its consumer, or make it observable and say what does not read it yet".


## 2026-09-04 — a constant in a comp's DEMO DATA is fixture scaffolding, not a model claim

- **Context:** the new Library comp's Measured column reads `r45 → r47`, built from a
  module-level `const NEWEST = 47` and a per-group `Math.min` over its cells. I reported it as
  "the comps assume a global run number the tool does not have" and costed core a run counter.
  Mato corrected it in one line: it is a RANGE — the oldest and current run across the group.
- **Lesson:** he was right, and the measurement settles it. `ComparisonReport.run` is the per-pair
  ordinal, every report already carries it, and `min`/`max` per group is exactly what the comp
  draws — two DS groups are mixed right now (`ds-button-fill` r9→r10, `ds-button-ghost` r6→r7).
  The real gap was one missing field in `/api/pairs`, not a counter in core. **The general shape:
  a comp's demo data has to come from SOMEWHERE, and a designer reaches for a module constant
  where the real system would compute per scope. Before calling a comp's value a modelling gap,
  ask what the live data can already express at each scope the comp groups by** — here the answer
  was "all of it". And the inverse trap is the expensive one: had I implemented the constant
  literally, a global newest would have marked all eleven `ds-button-icon` cells stale against a
  run they were never behind, which is a wrong measurement wearing a correct-looking pill.
- **Candidate home:** `SKILL.md` §0 / the "reading a comp" guidance — a comp's constants are
  fixture data at the SCOPE the fixture happened to need, and the implementation resolves them
  per real scope · pairs with the existing rule that the comp is the reference for APPEARANCE
  while the tool's own model decides what a number means.

## 2026-09-04 — "it deleted and badly recreated X" can be a RENAME; byte-diff before restoring

- **Context:** asked to restore `RefDiff Mobile Toolbar.dc.html` from our local copy after Claude
  Design "accidentally deleted it and recreated it badly". I pushed our committed copy back. Minutes
  later the file was gone from the project again — because the real event was a CONSOLIDATION: the
  comp had been renamed to `RefDiff Mobile.dc.html`, and my restore re-created a duplicate under the
  old name that the next consolidation step removed.
- **Lesson:** the diff, not the report, settles what happened. Fetching the "bad" file and comparing
  it against the committed copy costs one call and answers three questions at once — is it really
  bad, is the good version still somewhere under another name, and is a restore needed at all. Here
  the answer was **one hunk**: a caption linking to two now-deleted siblings, in a region the pairs
  do not even scope to, so nothing had been lost and nothing needed restoring. **A rename presents
  exactly like a delete-plus-recreate in a flat file listing**, and the tell is that content survives
  under a new name — invisible unless you compare. Corollary for an external store with no history:
  `list_files` twice, minutes apart, is a cheap change detector, and it is what caught the second
  rename mid-task.
- **Candidate home:** `SKILL.md` "Environment pre-flight" as the general shape (a comp reported
  lost is diffed before it is restored) · the design-sync flow in `refdiff.bindings.md`.

## 2026-09-04 — a recorded "the tool cannot do X" is a dated MEASUREMENT, not a property

- **Context:** `docs/plan-annotator-redesign.md` recorded, on 2026-08-28, that "the Claude Design
  project is not reachable as a writable design-system project through DesignSync (404 / no writable
  projects)", and told the next session to re-make a change by hand in the app's prop editor. I
  nearly acted on it as a constraint.
- **Lesson:** it was wrong, and wrong in an instructive way. `list_projects` FILTERS to design-system
  projects; this project is `PROJECT_TYPE_PROJECT`, so it reads as "no writable projects" while
  `get_project` says `canEdit: true` and `finalize_plan` + `write_files` succeed. The original
  session generalised one tool's empty result into a property of the service. **Re-verify a recorded
  negative capability before trusting it** — one read call did it — and when recording one, record
  WHAT WAS OBSERVED (`list_projects` returned nothing) rather than the conclusion drawn from it,
  because the observation stays true and the conclusion may not.
- **Candidate home:** CLAUDE.md, near the guidance on stale assertions — a negative capability claim
  gets the same treatment as a stale positive one, plus "record the observation, not the inference".

## 2026-09-04 — a waiver keyed by FILENAME goes stale when the name is reused

- **Context:** `pair-coverage.test.ts` waived `RefDiff Mobile.dc.html` as "the designer's phone-frame
  showcase, not a screen under measurement". The design consolidation deleted that showcase and
  reused the NAME for the renamed toolbar comp — a real screen with two pairs.
- **Lesson:** the guard stayed green throughout, because a waiver keyed on a path is satisfied by any
  file at that path. Its REASON silently became a false statement about a different artifact, and it
  would have suppressed the coverage check for a comp that genuinely needed a pair. Same shape as the
  repo's existing rule about content-shaped vs position-shaped ignore rules: a waiver naming the
  CONTENT ("the phone-frame showcase") expires when the content changes; one naming a POSITION (a
  filename) never expires. Since a waiver must key on the path, the mitigation is to re-read every
  waiver's reason whenever its file moves — which is now written above the map.
- **Candidate home:** CLAUDE.md "Suppression is visible or it does not happen" — extend the
  content-over-position preference to waivers, with the note that a path-keyed one needs re-reading
  on any rename.

## 2026-09-04 — large tool results persist to disk; decode them instead of retyping

- **Context:** refetching seven comps (~400 KB) from the design project. `get_file` returns content
  inline, and transcribing it back out through a Write call risks exactly the escape corruption
  `population-registry`'s CLAUDE.md warns about — these files carry `·` / `→` escapes
  inside JS string literals, where emitting the CHARACTER instead of the six-character escape would
  be a silent, invisible change to a reference artifact.
- **Lesson:** results over ~32 KB are saved to a file under the session's `tool-results/` directory
  and the tool prints the path. `json.loads` on that file plus one `write_text` puts the bytes on
  disk with no transcription at all — verified byte-exact against the committed copies (two of the
  refetched files came back byte-identical, which is itself the proof the route is lossless). Below
  that threshold there is no such path, and the honest move is to DEFER rather than hand-copy a
  reference artifact: a typo in a comp becomes a false finding in every future measurement of its
  pair. Two files were deferred on exactly that reasoning.
- **Candidate home:** `SKILL.md` / the bindings' refetch procedure — name the decode-from-persisted
  route, and the rule that a comp is never hand-transcribed.

## 2026-09-04 — persist a durable fact WHERE it becomes computable, not on the success path

- **Context:** chunk 2's set index. `expandFigmaSet` reads the Figma set, expands it (pure),
  then fetches variables and renders every variant image before returning. My first wiring
  built the index right after the expansion — the point where every field it needs exists —
  and returned it for the caller to write.
- **Lesson:** that loses it on precisely the runs that need it. The `/variables` and
  `/images` calls in between can fail (rate limit, cooldown, dead token) and return a typed
  error for the WHOLE entry, so an index returned below them never reaches disk — and "what
  is this set supposed to contain?" is exactly the question a reader has when a set failed
  to render. The fix is placement, not error handling: write it at the line where it becomes
  computable, and let the fallible work happen after. **Generally: when a function computes a
  durable fact early and then does more fallible work, the fact's write belongs at the
  computation, not at the return.** Confirmed live rather than argued — a run whose every
  capture failed (exit 2) still wrote both indexes. Same family as "a failed capture writes
  no findings.json, so the stale one survives": both are an absent write leaving a reader
  with the wrong picture.
- **Candidate home:** `CLAUDE.md` design principles, next to "one bad pair must never kill a
  run" — it is the same principle applied to provenance rather than to results.

## 2026-09-04 — a fabricated literal that LOOKS measured is worse than an obviously missing one

- **Context:** writing `set-index.test.ts` against a recorded Figma fixture, I asserted the
  skipped variant's `nodeId: "12:263"`. The real value is `19285:51581`. I had the fixture on
  disk and a probe already written; I typed a plausible-looking id from the neighbouring
  test instead of reading it.
- **Lesson:** this is a different defect from an expectation that turns out wrong (which
  happened twice in the same session, on relative-time bucket boundaries — those are the
  falsification round doing its job). A wrong expectation about BEHAVIOUR is discovered by
  the test. A fabricated DATUM is discovered by the test too, but only if it happens to be
  asserted — and had I written `expect(skipped[0].nodeId).toBeTruthy()` it would have passed
  forever while documenting nothing. The rule: **any literal that identifies external data —
  a node id, a file key, a hash, a commit — is copied from a probe's output, never typed from
  memory or pattern-matched off a sibling.** The tell is that it looks like the right SHAPE.
- **Candidate home:** `CLAUDE.md` → Tests, beside "a test for a bug fix must fail without the
  fix" · the same rule as `population-registry`'s "a recorded count names the command that
  produced it", generalised from counts to identifiers.

## 2026-09-04 — a backtick in `app-shell.ts`'s APP_BOOT or INDEX_CSS closes the template

- **Context:** chunk 1 of the Library groups. Wrote two ordinary repo-style comments —
  ``// `opened` / `closed` are …`` inside `APP_BOOT`, and
  ``/* `chevron_right` is not in the icon subset */`` inside `INDEX_CSS`.
- **Lesson:** `APP_BOOT` is a `String.raw` template and `INDEX_CSS` a plain one, so a backtick
  in a comment **ends the template** and the rest of the file parses as TypeScript. The build
  reported five `TS1005 ',' expected` errors at the comment lines and at the CSS, with nothing
  pointing at the backtick — it reads as a mystery syntax break in code you did not touch. Every
  existing comment in those two literals happens to avoid backticks, so the convention is real
  but nowhere stated, and this repo's comment style backticks identifiers everywhere else. Same
  family as the Kotlin nested-block-comment trap in `population-registry`'s CLAUDE.md.
- **Candidate home:** a one-line note beside each literal in `app-shell.ts` (one is now there) ·
  CLAUDE.md if it recurs in `render.ts`'s `CLIENT`, which is the same shape.

## 2026-09-04 — a self-measurement whose fixture lacks the new case is a REGRESSION guard, not evidence

- **Context:** chunk 1 groups the Library by entry id (`<entryId>--<slug>`). The annotator's own
  Library pairs measure the app while it serves `fixtures/demo-root`, whose twelve pair ids carry
  no `--` — so **not one group header renders in the measured page**. Both pairs came back
  `+0/−0`, byte-identical counts to the recorded baseline.
- **Lesson:** that `+0/−0` is worth having and is exactly what it says — *the ungrouped case did
  not move* — but it is evidence about the code the change did NOT alter. Two things make it
  honest: (a) a **positive control** on the served page (`curl | grep -c "function groupEntries"`
  → the measured process really is the new build, which is the only thing separating a true
  `+0/−0` from `preflight.sh`'s stale-dist `+0/−0`); and (b) a unit test asserting the
  BYTE IDENTITY the measurement is standing in for (`libraryList(groupEntries(loneItems), …)`
  === `pairCards(loneItems, …)`), falsified by breaking `isFoldable` and watching it go red.
  Then the new behaviour is measured where it can be: the pure functions against the real
  194-pair DS payload (194 → 14 groups; collapsed markup 9,241 bytes / 11 headers / 3 images vs
  244,735 / 194 cards / 194 images expanded).
- **Candidate home:** `SKILL.md` §0/§4 — when the fixture root cannot contain the new case, say
  which of the two claims the run supports and add the positive control · a `preflight.sh`
  companion idea: a `--expect <symbol>` flag that greps the served page for a symbol the change
  introduced, so "the server is the new build" is a checked fact rather than a habit.

## 2026-09-04 — "same run?" is answered by the relative-time BUCKET, not by a tolerance

- **Context:** chunk 1's group header shows an `oldest → newest` span when a group's cells come
  from different runs. `createdAt` is stamped per PAIR and no run identity is shared across
  pairs (`ComparisonReport.run` is the per-pair ordinal), so "different runs" has to be inferred.
- **Lesson:** measured on the DS root — ONE `compare` spreads its stamps over 66s across
  `ds-checkbox`'s 45 cells and 59s across `ds-button-fill`'s 41, while a subset re-run mixes
  vintages **hours** apart (06:29 against 10:04 in the same root). No fixed tolerance separates
  those without a magic number that a slower or bigger set breaks. Reusing `relativeWhen`'s own
  buckets does it for free, needs no constant, is exactly what the reader can perceive (the span
  appears precisely when two cells would *read* differently), decays on its own (a one-minute
  spread is two words for an hour and one word after), and fails toward DISCLOSURE — which is the
  right direction, since the failure being prevented is a sheet mixing vintages silently.
  Corollary, twice over: two of my own test expectations were wrong about bucket boundaries while
  the code was right (`3h` vs `3h − 66s` is `3 h ago` vs `2 h ago`). Budget for the falsification
  round to fail on the expectation's side.
- **Candidate home:** chunk 3's per-cell staleness in `docs/plan-gallery-groups.md` inherits this
  rule verbatim — a gallery cell's staleness mark is the same question · `docs/architecture.md`
  if a second reader ever needs it.


## 2026-09-04 — a set run's completeness is not observable from its reports (DS, 194 pairs)

- **Context:** driving `population-registry`'s DS set (194 pairs) through the fix loop, then
  verifying a deliberate revert. Four separate ways the run's own artifacts misreported what
  had been measured, all found in one session.
- **Lesson (four, one root — an absent measurement leaves the PREVIOUS one in place):**
  1. **A failed capture writes no `findings.json`, so the stale one survives.** Any verification
     that scans `findings.json` for an error field is *structurally* blind to capture failures —
     it reads the previous run's report and calls it healthy. My own "capture problems: 0" check
     did exactly that while 3 pairs had failed. The honest checks are the exit code and
     `grep -c '^=== ' log` vs `grep -c '^report: ' log` (112 vs 109 named it instantly).
  2. **`refdiff summary` aggregates every run dir under the root**, including orphans whose pair
     id no longer exists. A Figma variant-property rename (`ds-checkbox` gained `hasIcon`, so
     every id grew `_hasicon-false`) left 6 dead dirs; the header read `200 pairs / 1185
     findings` where the run had produced `194 / 1134`, and the 51 stale findings were
     indistinguishable from live ones.
  3. **`SKILL.md` rule 6 is misleading for a SET run.** It says "Exit code 2 with a JSON
     `CaptureError` means NOTHING was compared". For a set, `cli.ts:1113` is
     `process.exit(anyError ? 2 : anyFail ? 1 : 0)` — exit 2 means *at least one* pair errored
     while the rest compared fine. On a 112-pair run, exit 2 with 109 good reports read to me as
     a regression signal and then as a total failure; it was neither.
  4. Consequence to state plainly: a subset re-run makes a root **mixed-vintage by design**, so
     "the number in the report" and "the number this run measured" are different quantities and
     nothing in the artifacts distinguishes them.
- **Candidate home:** `SKILL.md` rule 6 reworded for set runs (exit 2 = some pair errored, read
  the report/header counts) + a line in the loop about verifying completeness, not just deltas ·
  a `summary` change: flag run dirs not written by the newest run in the root, and print the
  vintage span — this is also **chunk 3's per-cell staleness requirement** in
  `docs/plan-gallery-groups.md`, same root cause · possibly make `summary` warn on orphan dirs.

## 2026-09-04 — reverting a story file makes the next captures fail with `story-error`

- **Context:** `git checkout --` on `frontend/ds/gallery/button.stories.tsx` mid-session, then an
  immediate `compare` of that entry.
- **Lesson:** 3 of 65 pairs failed with a typed `story-error`:
  `"Failed to fetch dynamically imported module: …/gallery/button.stories.tsx?t=1788505121723"`.
  Vite still advertises the pre-revert timestamped module URL, which 404s until the page reloads,
  and Storybook then reports it as the story failing to render "likely due to a configuration
  issue" — which reads like a real story bug and is not. **Transient: warm the story URL and
  re-run the entry.** Same family as the existing bindings trap "token / global-CSS edits may not
  HMR", but the signature is a typed per-pair capture error rather than a wrong measurement.
- **Candidate home:** `SKILL.md` "Environment pre-flight" as the general shape (editing the served
  source mid-session invalidates modules; the first captures after can fail transiently) ·
  `population-registry`'s bindings trap list.

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

## 2026-09-15 — a number written in a handoff is not a measurement (matcher phase 1)

Phase 1 opened with two figures inherited from the previous session's handoff: "expect
448 core tests after the revert" and "the finding COUNT must be identical to step 0's
(223)". Both were wrong. Measured after `git checkout -- packages/core/src/structural/`:
**445 core** and **225 findings at 42 matched**.

The cause is instructive. 223/43 were run 13's numbers — a run taken *with* the veto
widening that step 0 exists to remove. The plan's own "what was already tried" section
recorded the widening as `225 → 223 findings, matched 42 → 43`, so the correct baseline
was already written down one paragraph away from the wrong one. The handoff had simply
carried forward the latest run rather than the run that matched the state it described.

Why it matters more than an off-by-two: step 1's acceptance criterion was "the finding
count is unchanged from step 0". Had the step been judged against 223, a step that
changed nothing would have read as −2, and the natural next move is to go hunting for a
regression that does not exist. A baseline attached to the wrong tree state is worse
than no baseline, because it produces confident wrong conclusions.

The rule already exists for acceptance criteria stated as absolutes ("no drift", "the
suite is green") — measure the pre-change baseline before believing it. This extends it:
**a baseline in a document inherits the state of the run it came from, and a handoff
rarely says which run that was.** Re-measure, and when recording one, name the run.

## 2026-09-15 — refdiff has no formatter, but a uctoinak2-rooted session does (matcher phase 1)

Every Write/Edit in a session whose project root is `/root/uctoinak2` fires that repo's
`PostToolUse` hook: `oxlint --fix` then `oxfmt --write` on the file just written. The hook
does not check which repo the file belongs to, and `/root/refdiff` has no formatter config
of its own — no prettier, no biome, no `format` script.

refdiff is mid-migration on semicolons (36 of 90 source files still carry them, 54 do not,
and everything written recently is in the second group), so oxfmt's output is not foreign
style — it is where the repo is going. That makes the churn correct and unreviewable at
the same time: a three-line change to one of the 36 arrives as a few hundred lines of
punctuation. Phase 1's first diff was 1163 insertions / 594 deletions for roughly 420
lines of real change.

**Remedy: commit the reformat separately, FIRST.** Back the working files up, `git
checkout --` them, run the two commands by hand from `/root/uctoinak2`, verify the
formatted-HEAD tree is behaviour-identical (typecheck + the parent commit's exact test
counts), commit as `style:`, then restore and commit the real change on top. Phase 1 did
this as `73cc4a1` then `164828a`, which took the semantic diff to 480 insertions / 13
deletions.

Two things this is NOT: not a reason to fight the hook (reverting the formatting means
re-fighting it on every future edit), and not a reason to skip the split (the whole point
of the matcher work is that a reader can check what the report claims — a commit nobody
can read is the same failure one level up).
