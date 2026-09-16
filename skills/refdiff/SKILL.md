---
name: refdiff
description: Close the gap between a design frame (Claude Design .dc.html or Figma) and its implementation (Storybook story or live page) with the refdiff CLI in a bounded, measured loop — run compare → read findings.json (expected/actual first, crops second) → read the focused region and open annotations → fix → re-run → read delta → mark notes implemented. Use whenever asked to "match the design", "fix design parity / design drift", "make the story match the comp", "run refdiff", "work in the focused region", or to verify a UI change against its design. It covers a surface that does NOT EXIST YET as much as a drifted one — "implement this comp", "build this design", "a new .dc.html / Figma frame landed", "implement the new layout / screen": stub the surface, register its pair, and let the delta drive it (§0). Also when asked to "set up refdiff in dev mode", "install the refdiff CLI", or the `refdiff` command is missing on this machine (run setup-dev.sh); to "check the refdiff skill version", "is refdiff up to date", "sync/update the refdiff skill", or to vendor it into a repo (preflight.sh / sync-skill.sh). Run preflight.sh once before the first compare of a session: a dist behind src, or an annotator process older than dist, reports as +0/-0 and is indistinguishable from a fix that did nothing. In the POLISH phase never eyeball two screenshots and never hand-derive a layout by reading the comp's source — every claim there is a number from findings.json. In the RECONCILE phase reading the comp and both screenshots is the FIRST step and the measured missing/extra list is the checklist against it; the ban is scoped to polish, where the findings already are the specification. SKILL.md is the always-loaded part (rules, pre-flight, how to run, the phase read); the situational halves sit beside it and are read on their own triggers — reconcile.md / polish.md per report.phase, sets.md for a variant set or a manifest run, configuring.md to declare a pair or write ignore policy, setup.md for install/vendoring and the per-repo capture traps.
---

# refdiff — the bounded fix loop over its reports

This skill is THIN on purpose: the harness measures, you act. `refdiff
compare` produces `findings.json` (typed, bbox-grounded, severity-ranked
findings with machine-readable `expected` / `actual`), per-finding crop pairs,
both element trees, and — from the second run on — a
`delta` against the previous run plus a `resolved-ledger.json` that turns a
re-introduced finding into a loud `REGRESSION`. Your job is the loop
discipline: read → classify → fix → re-run → read the delta, at most five
times, and stop on diminishing returns.

## The skill's other files — read this one, then the one the PHASE names

This file is what every run needs: the bindings, the non-negotiable rules, the tool pre-flight,
how to start a surface that does not exist yet, how to run, and the phase read. The rest is
situational and sits BESIDE this file in the skill directory — the same directory this one was
loaded from. Read a file when its trigger fires, not before.

| file | holds | read it when |
| --- | --- | --- |
| `reconcile.md` | the reconcile workflow: read both sides for intent, the per-side unmatched map as the checklist against that reading, the complement audit, when to re-run | `report.phase` is `reconcile` |
| `polish.md` | §1a alignment, §1a-ii what PAIRED a finding, §2 classification, §3 the human's notes, §3a recording decisions, §4 the delta, §5 bounds, §6 the report, and the per-finding-type "what to compare" checklist | `report.phase` is `polish` — the normal loop |
| `sets.md` | §1b: a component set or a whole manifest as ONE loop — the set summary, the sheet, `bleed`, `ground` | the run expands `design.variants`, or you run a whole manifest |
| `configuring.md` | `disabled`, the `ignore` block (`dataSlots`, `textPatterns`, `roles`, `regions`, `accepted`, `contentsOf`, `explain`), and `section` / `sections` / `gallery` | declaring a pair, or writing policy for one |
| `setup.md` | vendoring into a consumer, dev-mode setup, and the per-repo ENVIRONMENT traps that impersonate product bugs | once per machine, once per repo, or when a capture fails |

`preflight.sh`, `sync-skill.sh` and `setup-dev.sh` sit beside them; `setup.md` says when each
one runs.

## Repo bindings

This skill installs in one of three modes, and the difference decides whether it can
go stale (`preflight.sh` reports which one you are in as `skill_mode`):

- **plugin** — installed as `refdiff@claude-skills-public` (the normal case for a consumer).
  The skill dir is `${CLAUDE_PLUGIN_ROOT}/skills/refdiff`, a read-only cache that moves only
  with `claude plugin update`; nothing to sync, nothing to vendor. The engine is a separate
  checkout (`REFDIFF_DIR`, the `refdiff` wrapper's path, or `setup-dev.sh`'s default).

- **dev** — the skill dir is a SYMLINK into a refdiff checkout
  (`~/.claude/skills/refdiff` → `~/.claude-shared/skills/refdiff` → `<checkout>/skills/refdiff`;
  both profiles link it). SKILL.md IS the checkout's file, so there is no copy that can drift
  and nothing to sync. Nothing of the skill lives in a consuming repo — the repo carries only
  its manifest and a bindings file. This is what `setup-dev.sh` builds.
- **vendored** — the skill dir is a COPY carrying a `.skill-version` stamp, written by
  `sync-skill.sh` (`setup.md`). It survives a fresh clone, CI, a cloud session and a teammate,
  which a symlink does not — and it is a copy, so it CAN drift from upstream. That is the
  whole reason `preflight.sh` exists.

In both modes the ENGINE is a checkout: `refdiff` and `refdiff-annotator` are wrappers that
exec `<checkout>/packages/*/dist/cli.js`. Vendoring copies the skill TEXT and never the engine,
so a vendored consumer still runs `setup-dev.sh` once per machine — and can still have a stale
build, which is why the pre-flight checks the build in both modes.

**Read the bindings first** — they are the source of truth for paths, ports,
seeds and gotchas. Each repo keeps the file wherever its visual tooling lives,
so locate it rather than assuming a path:

```bash
find . -name 'refdiff.bindings.md' -not -path '*/node_modules/*'
```

A bindings file names: the manifest, the design dir / Figma file, how the impl
is served (Storybook dir or URL, live app + auth), the run dir convention, and
the repo's environment traps. If none exists, stop and write one with the user
before running anything.

The CLIs are on PATH as wrapper scripts written by `setup-dev.sh`, each one
`exec node <checkout>/packages/*/dist/cli.js`: `refdiff` (core) and
`refdiff-annotator`. They run from `dist` — keep `pnpm dev` (tsc --watch)
running in that checkout while developing, or `pnpm build` after pulling; **`preflight.sh`
checks that for you and HALTS when dist is behind src**, because the watcher has stopped
silently before and a stale dist reads as `+0/−0`, not as an error. The
wrapper is indirect on purpose: it needs no relink after a rebuild, and tsc
emits `dist/cli.js` mode 0644, so a symlink straight to it would stop being
executable the moment `dist` is rebuilt from clean.

## Tool pre-flight — is the thing you measure WITH current?

**Run this once, before the first `compare` of a session.** It is not ceremony: two of the
things it checks make the numbers lie rather than merely being old, and both have cost real
sessions real time.

```bash
bash "${CLAUDE_PLUGIN_ROOT:-$(dirname "$(readlink -f ~/.claude/skills/refdiff/SKILL.md)")/../..}/skills/refdiff/preflight.sh" --port <annotator port>
```

`--port` (or `--app-url`) is optional and adds the served-instance check; everything else runs
without it. **Read the `action` field — it is the one thing to branch on:**

| exit | `action` | what you do |
| --- | --- | --- |
| `0` | `proceed` | Nothing to decide. Start the loop. |
| `1` | `halt` | The measurement would be wrong. Fix it (one command, printed), re-run the pre-flight, then start. |
| `3` | `ask` | **PAUSE and put the choice to the user** — `AskUserQuestion`, one question, two real options. Do not sync under them and do not carry on under them. |
| `2` | — | The pre-flight itself broke. |

| fact | value | why it lands where it does |
| --- | --- | --- |
| `build_freshness` | `STALE` / `MISSING` | **halt.** The CLI execs `dist/cli.js`, so a dist behind src measures code you did not write. `(cd <checkout> && pnpm build)`, or start the watcher. |
| `server_freshness` | `STALE` | **halt.** The annotator renders its page shell at process START, so an instance older than dist serves the previous build however fresh dist is. Kill by PID, poll until the port frees, restart, verify by CONTENT. It is a check on the BUILD only — it compares the process against `dist` and can say nothing about the DATA a running instance serves, so read a number that disagrees with the disk by content (`curl /api/pairs`), never off this row. (The run-dir listing itself is re-read per request since 2026-09-08; before that a run which ADDED a pair was invisible until a restart, while one that rewrote a pair showed up — the two look identical from outside.) |
| `skill_freshness` | `stale-<N>` / `differs` | **ask.** *Sync* → `sync-skill.sh`, then restart against the updated copy. *Carry on* → this copy still measures correctly, it may simply not know a newer rule. `stale-<N>` is a real commit count (local objects present); `differs` means only `ls-remote` could answer — say **differs**, never "behind", because without the objects the direction is unknowable. |
| `checkout_freshness` | `behind-<N>` / `diverged-…` | **ask.** *Pull + rebuild* → `git pull --ff-only && pnpm build`. *Carry on* → the engine, and in dev mode SKILL.md itself, stay at this version. `diverged` is a merge/rebase decision, not a pull. |
| `ahead-<N>` · `current` · `skipped-*` | | Continue silently — being ahead is not drift. |

**Halt and ask are different things and neither is a block.** A halt says the numbers would be
wrong and there is exactly one right remedy, so take it and re-run — nothing is being refused,
it is a rebuild. An ask says the tool is *usable either way*: a version behind measures just as
correctly as the tip, so "carry on" is a legitimate answer and stays available. The only thing
ruled out is settling it silently — **neither auto-syncing under the user, nor printing a line
into a scrollback nobody reads and continuing.** That second one is the failure this replaced:
a warning at exit 0 is a printed line, which is exactly what the ask exists to stop being.

Why the first two halt rather than ask: a stale build or a stale server both produce a delta of
`+0/−0` — "my fix did nothing" — which is *indistinguishable from a fix that genuinely did
nothing*, so the loop converges on a lie and reports success. There is no version of that worth
offering as a choice.

When both fire, the exit code is `1` and **both are printed**: a pull usually fixes the build
too, so the user meets one decision instead of solving a halt and being asked a question after it.

**`+0/−0` has a THIRD cause the pre-flight cannot see, and it is the benign one: the property
you changed is covered by no finding.** A stale build and a stale server make the harness
measure the wrong thing; this one means the harness measured the right thing and has nothing
to say about it. Two shapes produce it. The first is a box no channel compares — that was the
captured ROOT's own box until `rootSizeNote` landed, and it is still true of anything the
element model cannot reach (a `box-shadow` focus ring reports as `missing-element`, never as
a geometry difference). The second is a FORCED-state gallery whose state classes are a hand
copy of the component's: fix the component, forget the copy, and the picture never changes,
so a correct fix reports `+0/−0` and reads as a failed one. **Do not treat `+0/−0` as proof
of anything on its own — read the artifact.** `report.impl` / `report.design` carry the node's
own width and height, and `elements.json` carries every box; on a fix whose delta is zero,
quote those instead. (Anchor: a small button 8px too tall on ten of ten cells, reported by
nothing for four days, then fixed with a delta of exactly `+0/−0` — the proof was
`impl.height` moving 32 → 24 and the icon's `y` moving 8 → 4 to meet the design's.)

`REFDIFF_SKIP_FRESHNESS=1` skips every network fetch (the two upstream checks report
`skipped-opt-out`, so nothing asks; the build and server checks are local and still run). `REFDIFF_DIR` names the
checkout explicitly. `bash preflight-selftest.sh` falsifies every row against synthetic offender
trees — run it after touching either script.

**Installing, vendoring or updating the skill itself is `setup.md`** — `sync-skill.sh` (the
"sync" branch of the `action=ask` above), `setup-dev.sh` (dev mode on a new machine), and the
per-repo environment traps that make a capture fail in ways that read as product bugs.

## The rules (non-negotiable)

1. **Measure, never eyeball.** Colors, fonts, sizes and gaps are where parity
   silently breaks and where a glance lies. A finding's `expected` / `actual`
   IS the measurement (`{ color: "rgb(26, 26, 26)" }` vs `{ color: "rgb(44,
   36, 25)" }`, `{ gap: 28 }` vs `{ gap: 30.9 }`, `{ fontSize: 12.5, weight:
   500 }` …). Read that first. Open the crop pair (`crops.design` /
   `crops.impl`, native resolution) only when the values do not explain the
   finding — `missing-element`, `extra-element`, `pixel-region`. Never open
   `design.png` and `impl.png` side by side to "compare".
   **The one carve-out: an element NEITHER channel can pair has no finding to
   read, and one crop is then its whole evidence.** The extractor reads DOM, so
   anything you add as SVG, canvas or a pseudo-element is invisible to the
   structural channel; a design-side counterpart suppressed inside an
   `accepted … contents: true` region reports nothing either; and the pixel
   channel may only reach it inside a much larger matched box whose diff other
   causes dominate. When your change adds such an element, say so out loud and
   spend ONE crop of the frame at its box (both sides, native resolution) on the
   question "did it paint, and does it lean the same way" — that is evidence
   about a paint, not a judgement about parity. Then go back to the numbers.
   Cheap probes beat staring: `getComputedStyle(el)` in the captured page names
   an inherited `opacity:0` or a colliding class in one call, once the crop has
   shown there is something to look for.
2. **The model is never the comparator.** You do not decide whether the two
   sides match; the verdict and the delta do. You decide what each measured
   difference IS (`polish.md` §2, the classification) and what to change.
3. **Separate data from drift before anything else — the harness will not do
   it for you.** Demo data in the comp (names, amounts, dates, which rows
   exist) differs from the story fixture / seed. Text differences on matched
   pairs are **reported by default**, because which strings are data is a
   per-pair judgement and guessing it centrally hides copy regressions. So the
   first pass over `text-content` findings is yours: each one is either data
   (fix the fixture or seed so the story renders the comp's data — never touch
   component code for it) or a real copy drift to fix.
   Once you know the corpus, declare the rule on the pair rather than
   re-judging every run: `ignore.dataSlots: { patterns: [...] }` (or
   `--data-slot-text`) masks each declared shape out of BOTH strings and
   compares the remainder — so `"Blok · 12. 7. 2026"` vs `"Doklad · 12. 7.
   2026"` is still reported (the label drifted) while `"Blok · 12. 7. 2026"`
   vs `"Blok · 11. 7. 2026"` is not (only the date moved), and position, size,
   colour and typography stay compared on the data pairs. Reach for
   `ignore.textPatterns` only when you also want the geometry and colour
   findings about that string gone — it suppresses every finding type.
   `ignore.dataSlots: true` drops EVERY differing-text pair; it is blind to
   copy regressions, so use it only for a deliberately data-only comparison.
   Unmatched rows show up as `missing-element` / `extra-element` instead.
4. **A comp frame can contradict its siblings — encode the axis, not the
   frame. And two comps that render the same furniture are not the same
   SURFACE until their text is diffed.** Before deciding that a region of one
   comp is "already covered" by another pair — and scoping it out — diff the
   two comps' rendered strings (`grep -oiE '>[^<>{}]{2,40}<'` over both, set
   difference, count). Measured on this repo's own comps: the Gallery comp and
   the Comparison Tool comp share 21 chrome strings and the Gallery comp has 18
   of its own, including a whole findings rail grouped by CAUSE that the tool's
   comp does not contain. Scoping it out would have shipped that rail with no
   pair measuring it, which is the one failure that reports itself nowhere.
   **Rule 1 applies to comparing two DESIGNS, not only a design and an impl.**
   Before changing a shared token or rule because one comp says so, measure the
   other comps (`grep -o '#hex' design-dir/*.dc.html | wc -l` per file, or the
   other frames of the same component). If the comp you are comparing is the
   outlier, the implementation is right: record the decision with `refdiff
   accept` (`polish.md` §3a), evidence as its `reason`. If the siblings agree
   with it, fix the token.
   **This reaches STRUCTURE, not only tokens, and that is where it pays most.**
   "This frame draws no page title", "this frame puts no card around the rail",
   "this frame groups the rows" — each is either one frame's decision or the
   design set's rule for a whole family of screens, and the two call for fixes
   at completely different scopes. The sibling to open is the one drawing the
   SAME chrome for a different screen (another section of the same detail page,
   the same shell at the same width), and the check is just looking for the
   element in it. Measured 2026-09-16: the accountant Messages phone frame
   draws no page title, and the sibling — the same client shell on the Prehľad
   screen — drew none either, which moved the fix from one route to the shared
   page header and the seven routes under it. Read alone, that frame yields a
   correct-LOOKING patch at a tenth of the right scope, and the pair goes green
   on it. Scope is `polish.md` §4's other half: which axis the two frames differ
   on, and what a shared-chrome fix reaches that this pair cannot measure.
5. **Suppression is visible or it does not happen.** Every intended
   deviation goes into the pair's `ignore` block (`textPatterns`, `roles`,
   `regions`, `accepted: [{ type, expected?, actual?, reason }]`,
   `contentsOf: [{ role, types, reason }]`, `explain: [{ types, region|within, cause, reason }]`)
   or the CLI
   flags (`--ignore-text`, `--accept '<json>'`), and shows up under
   `suppressed` with its rule. Never "skip" a finding by ignoring it in your
   head.
6. **A capture is not a pass.** Exit code 2 with a JSON `CaptureError`
   (`login-redirect`, `error-page`, `still-loading`, `selector-not-found`,
   `figma-low-quality`, …) means NOTHING was compared — fix the environment
   first (`setup.md` holds the traps that impersonate product bugs). Before
   trusting a first run, look at `impl.png` once: an empty state, a 404 page
   or a login form compares "fine" and lies.
7. **Small, reversible, local fixes.** Change the story fixture, the
   component under test, its tokens. Do not refactor around a finding; do
   not touch files the pair does not render. Leave the consuming repo's
   commits to its owner unless told otherwise.

## The loop

```
iteration = 0
run compare                          → findings.json (+ delta from the 2nd run)
while iteration < 5:
  read findings.json                 → classify every finding (polish.md §2)
  read annotations.md                → act on `open` notes (human intent beats a finding)
  if nothing actionable remains       → stop (report)
  fix (fixture / code / policy)
  re-run compare                     → delta { introduced, resolved, regressions? }
  REGRESSION printed?                → undo or fix THAT first; it counts as the iteration
  mark acted-on notes implemented
  diminishing returns?               → stop (report)
  iteration += 1
```

### 0. A surface that does not exist yet

The loop is the same for a NEW comp; only the first iteration looks different.
There is nothing to measure yet, and that is a reason to STUB, never a reason
to skip the harness and build the thing by reading the comp's markup.

**Read the comp for STRUCTURE; never let reading it settle a DETAIL.** Opening
the `.dc.html` (or the Figma frame, or the two screenshots) to work out what
the surface *is* — a thread rail, a filter row, a detail pane — is legitimate
and is how you write a useful stub. What is not legitimate is deriving spacing,
colour, size or position that way and shipping it: there you became the
comparator, and nothing you produced carries a number. The rule is about which
QUESTIONS reading can answer, not about whether you may open the file. Once the
pair is registered, the findings are the specification and reading stops.

1. **Stub the surface** so the route renders SOMETHING deterministic — the
   nearest existing variant is ideal ("the new layout is the minimal one plus a
   toolbar" → alias the minimal layout and add the new class). A stub that
   renders the wrong thing is fine; a route that 404s is not, because
   `compare` then reports a capture error and measures nothing (rule 6).
2. **Register the pair** in the manifest, against the new comp. Until it is in
   the manifest the comp does not exist as far as refdiff is concerned: no run
   dir, and nothing in the annotator's Library, which lists run dirs only.
   Reporting "the design is available" when only step 1 is done is how a comp
   silently ships unmeasured.
3. **Run it and expect a big report.** A first run of a stub against its comp
   is supposed to be tens of findings; that list IS the specification, ordered
   by severity, and it is worth more than any reading of the comp.
4. **Converge on the delta** exactly as in `polish.md` — its §2 to classify, §4 to read
   `resolved` / `introduced`, §5 to stop. The iteration bound counts from here.

The order matters: registering the pair before stubbing gives you a capture
error instead of a report, and stubbing without registering gives you no
measurement at all.

### 1. Run

First run of a session: `preflight.sh` (see "Tool pre-flight"). It is one command and it is the
difference between a `+0/−0` that means "no change" and one that means "you measured yesterday's
build".

```bash
refdiff compare --manifest $MANIFEST --design-dir $DESIGN_DIR --pair <id> --storybook-dir $REPO --out $OUT_ROOT
# or the explicit one-pair form (--design-file/--design-frame/--story, --figma …, --url …)
refdiff summary $OUT_ROOT      # sets / many pairs: one table + causes across pairs (sets.md)
refdiff drift $RUN_DIR         # a scale/scaleY in the fit: which element is it about? (polish.md §1a)
```

`--out` is a ROOT, always: the run dir is `$OUT_ROOT/<pair>/`, for one pair and
for forty. **`--pair` selects several either way — `--pair a,b` or the flag
repeated — and until 2026-09-04 the repeated form silently kept only the LAST
one**, so a run measured one pair while its log looked entirely healthy. Read the
`===` header count against what you asked for; that is the only place a dropped
selection shows. In **manifest mode the per-pair capture flags are rejected** —
`--viewport`, `--selector`, `--wait-for`, `--full-page`, `--story`, `--url`,
`--design-file/-frame`, `--figma` all belong on the manifest entry, and passing
one is a usage error naming the field to set. Policy flags (`--ignore-text`,
`--accept`, `--data-slot-text`, `--data-slots`, `--scope`) DO apply run-wide and
merge under each pair's own `ignore`.

Read the console summary (`N findings (c critical, m major, k minor) covering
I instances, S suppressed`, `delta vs …: +introduced / −resolved`, the
`by region:` block, `verdict`). **When the pair declares `explain` rules there is a second line —
`N unexplained · M explained: …` — and the UNEXPLAINED number is the one you work.** The explained
ones are printed after them, each tagged `[cause]`; they are findings with a diagnosed cause that is
not the implementation's, kept visible on purpose (see `configuring.md`). **On a page pair read `by region` before the
list** (`report.byRegion`, one group per smallest containing container): "36 in
the rail, 24 in the artboard image, 12 in the design pane" is three different
causes, and a severity-sorted list shows none of them. A converged loop once
hand-rolled that script twice in one session. Then read `findings.json` — it is small; read the whole
`findings` array, in order (severity-sorted). For each finding note:
`id`, `type`, `severity`, `instances` (×N = one root cause, `members[]`
lists every place), `message`, `expected`, `actual`, `role`, the boxes
(impl CSS px, world space). Skim `suppressed` once per run so you know what
the policy is hiding and why.

### 1a-0. Read the PHASE first — it says whether the findings are worth reading at all

`report.phase` answers one question before any other: **is this a surface to POLISH, or two
surfaces to RECONCILE?**

| phase | what it means | what to do |
| --- | --- | --- |
| `polish` | the two sides already correspond | **read `polish.md` and run the normal loop.** This is what refdiff is for: the 2 px offset and the ΔE 3 delta you cannot see |
| `reconcile` | they are different structures | **read `reconcile.md` and follow it.** Stop reading findings one by one: read the comp and the implementation as wholes, work out which regions correspond and which exist on one side only, and fix the structure. Then re-run |

On a `reconcile` pair the run leads with **counts** — how many design elements have no counterpart,
how many impl elements are unaccounted for, and how many of the pairings that DID form rest on
position alone. Those counts are the size of the problem, not the problem: the 200 element-wise
findings under them are mostly describing two structures being forced onto each other.

**Where the actual list is, and where it is PLACED.** The per-element answer is in `findings.json`
as the `missing-element` findings (a comp element with no counterpart, carrying its text and box)
and the `extra-element` findings (an impl element nothing accounted for). That is the raw material
for reconciling, and it arrives flat and severity-sorted, mixed in with everything else.

`report.unmatched` groups it for you — **two groupings, one per side**, printed in the reconcile
headline and written to `findings.json`: the comp's unmatched elements placed in the COMP's own
containers, the implementation's in the IMPLEMENTATION's. **Do not use `report.byRegion` for this.**
It is the right instrument for findings about PAIRS and the wrong one here: it draws every container
from the impl tree, and a `reconcile` pair is by definition one whose layouts disagree, so a comp
element lands in the gap between impl containers exactly where the comp draws something the
implementation has nothing for. Measured over the corpus's 24 `reconcile` pairs — impl containers
place **251 of 1200** unmatched comp elements, each side's own place **697**.

**Read the map's own miss rate, which it prints.** A line reading `N in no container of that side —
this map does not place them` is the map saying it placed none of those N; a short list of groups is
not a short problem. Some pairs get nothing at all — a flat page of same-size cards has no container
between "a chip" and "most of the frame" for the map to use (`refdiff-library-groups-desktop` places
22 of 290, and 0 of 106 on the impl side). There, grouping is not available and reading the two
surfaces is all you have.

**On BOTH phases the run also prints `DISTANT PAIRINGS`** — the pairings formed across more than
the matcher's own shared-text bound, γ descending, and in `findings.json` as `report.distant`. A
list to CHECK, not defects: 74 of the corpus's 79 are correct. It exists because the worst
mis-pairing measured has no tell — identical strings on opposite sides of the page, so no
`text-content` finding and no `unverified` flag. `polish.md` §1a-ii has the reading, and this is
NOT reconcile-only: the longest list in the corpus (17 rows) is on a `polish` pair.

**The headline states TWO populations, and on half the corpus they differ.** `38 design element(s)
with no counterpart … (37 listed below, 1 under the reporting floor)`: the first number is what the
MATCHER left unpaired, the second what this run lists. The gap is elements under the 4 px reporting
floor plus whatever the ignore policy suppressed, and it is named rather than rounded away — on
`refdiff-compare-desktop` it is 84 unmatched against 22 listed, all of it policy.

A full correspondence map — which comp container corresponds to which impl subtree, where reading
order diverges — stays parked in `docs/plan-divergent-matching.md`, and deliberately: a
fresh-context model given the comp, both screenshots and the flat list placed 57 of 59 texted
elements by itself. What it lacked was organisation, not completeness.

**So `reconcile` tells you WHICH loop you are in. `reconcile.md` is HOW.** That file is marked
PROVISIONAL and says why: it was written against two pairs and has been run end to end against
ONE of them (`messages-accountant-desktop`, 2026-09-16, reconcile → polish — the numbers and what
that run changed are in its §R7). So it is still a hypothesis with the failure each step prevents
attached, and every real use revises it.
What refdiff guarantees here is only that it will not let you spend an hour on a colour delta
between two elements that were never the same element.

**It is a label, not a gate.** Every finding is emitted on a `reconcile` pair exactly as on a
`polish` one, and the verdict is unchanged — so you can still work one if you have a reason to.
Nothing downstream branches on it.

Two signals decide it, both in the run headline: `rate` (`matched / min(designLeaves, implLeaves)`
— do the two sides contain the same things) and `axis` (how well the BETTER-fitting axis is
explained). `share` (`matchedVia.text / matched`) is printed beside them and deliberately does not
gate — it tells you whether correspondence was PROVEN by text or assumed from position, which is
worth knowing and is not what decides the phase.

**`axis` is not `conf`, and the gap between them is information.** `alignment.confidence` counts an
anchor only when it agrees on BOTH axes, so a surface that lines up one way and packs differently
the other collapses it to near zero while an axis fits nearly perfectly — `tx-picker-owner-mobile`
reads `conf 0.00 / axis 0.82 / rate 0.91`. A big `conf`-vs-`axis` gap means *"one axis disagrees"*,
not *"this capture is unusable"*; `polish.md` §1a's table says which axis and what causes it.

---

**Now go to the file the phase named — `reconcile.md` or `polish.md`.** Everything past this
point in the loop lives there: §1a and §1a-ii (what the alignment and the pairing are worth),
§2 (classify every finding — the whole skill), §3/§3a (the human's notes, recording decisions),
§4 (the delta), §5 (bounds), §6 (the report). `sets.md` first if this run expanded a set.

