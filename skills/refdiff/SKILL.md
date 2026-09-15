---
name: refdiff
description: Close the gap between a design frame (Claude Design .dc.html or Figma) and its implementation (Storybook story or live page) with the refdiff CLI in a bounded, measured loop — run compare → read findings.json (expected/actual first, crops second) → read the focused region and open annotations → fix → re-run → read delta → mark notes implemented. Use whenever asked to "match the design", "fix design parity / design drift", "make the story match the comp", "run refdiff", "work in the focused region", or to verify a UI change against its design. It covers a surface that does NOT EXIST YET as much as a drifted one — "implement this comp", "build this design", "a new .dc.html / Figma frame landed", "implement the new layout / screen": stub the surface, register its pair, and let the delta drive it (§0). Also when asked to "set up refdiff in dev mode", "install the refdiff CLI", or the `refdiff` command is missing on this machine (run setup-dev.sh); to "check the refdiff skill version", "is refdiff up to date", "sync/update the refdiff skill", or to vendor it into a repo (preflight.sh / sync-skill.sh). Run preflight.sh once before the first compare of a session: a dist behind src, or an annotator process older than dist, reports as +0/-0 and is indistinguishable from a fix that did nothing. Never eyeball two screenshots and never hand-derive a layout by reading the comp's source; every claim is a number from findings.json.
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
  `sync-skill.sh` (below). It survives a fresh clone, CI, a cloud session and a teammate,
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

## Vendoring the skill into a consumer (non-dev installs)

`sync-skill.sh` copies the skill into a repo (or into `~/.claude/skills/`) and stamps it, and
**re-running it IS the update** — it is the "sync" branch of the `action=ask` above. Run it only
after the user picks that branch.

```bash
# from a checkout: vendor into a repo → <repo>/.claude/skills/refdiff/ + .skill-version
bash <checkout>/skills/refdiff/sync-skill.sh /path/to/repo --ref main
bash <checkout>/skills/refdiff/sync-skill.sh /path/to/repo --dry-run   # what would change

# from inside a vendored copy, with no checkout on the machine: update in place
bash .claude/skills/refdiff/sync-skill.sh
```

With no `--from` and no surrounding checkout it shallow-clones upstream to a temp dir, so the
command works on a machine that has never had refdiff. It **refuses** to overwrite a dev-mode
symlink (that would swap a live skill for a frozen one), and a stamp cut from a DIRTY source
records `dirty=true` rather than letting `preflight.sh` call it `current`. Commit the refreshed
`.claude/skills/refdiff/` on its own `chore/` branch; review the diff first.

## Dev-mode setup (new machine / VM)

When the user asks to set the skill up in dev mode, or `refdiff` is
not on PATH, run the bundled script — it is idempotent and touches no
consuming repo:

```bash
bash "${CLAUDE_PLUGIN_ROOT:-$(dirname "$(readlink -f ~/.claude/skills/refdiff/SKILL.md)")/../..}/skills/refdiff/setup-dev.sh" --watch
# options: --checkout <dir> (default $REFDIFF_DIR, else ~/.local/share/refdiff; cloned from
#          github.com/mzvonar/refdiff if missing)  --no-browser  (skip Playwright Chromium)
#          --no-links  (skip the dev-mode skill symlinks; automatic under a plugin install)
```

It makes these true, then verifies (`refdiff --help`, test count):
the checkout exists; deps + Playwright Chromium installed; both packages
built; wrapper scripts installed into the first writable dir already on PATH
(`$PNPM_HOME/bin`, `$PNPM_HOME`, `~/.local/bin`, `~/bin` — it names the dir it
chose, and the PATH line to add if none was on PATH); in dev mode only, the skill is user-level —
`~/.claude/skills/refdiff` (and `~/.claude-personal` if present) → the checkout, through
`~/.claude-shared/skills` only when that dir already exists (under a plugin install the
plugin is the skill and no link is made);
with `--watch`, `pnpm dev` runs in the background (`<checkout>/.dev.log`) so
edits to `packages/*/src` reach the linked CLIs without a manual build. In dev mode edits
to `SKILL.md` are live immediately (symlink); under a plugin install change the skill upstream
(`/dev-tools:update-skill`). Needs Node ≥22, pnpm, git, and
network for the clone / Chromium download (in a sandboxed shell, run it with
the sandbox off). Then the repo you are in needs only its manifest and a
`refdiff.bindings.md` — write the bindings with the user if absent.

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
   difference IS (see the classification) and what to change.
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
   Rule 1 applies to comparing two DESIGNS, not only a design and an impl.** Before changing a shared token or rule because one comp says so,
   measure the other comps (`grep -o '#hex' design-dir/*.dc.html | wc -l`
   per file, or the other frames of the same component). If the comp you
   are comparing is the outlier, the implementation is right: record the
   decision with `refdiff accept` (§3a), evidence as its `reason`. If the
   siblings agree with it, fix the token.
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
   first. Before trusting a first run, look at `impl.png` once: an empty
   state, a 404 page or a login form compares "fine" and lies.
7. **Small, reversible, local fixes.** Change the story fixture, the
   component under test, its tokens. Do not refactor around a finding; do
   not touch files the pair does not render. Leave the consuming repo's
   commits to its owner unless told otherwise.

## The loop

```
iteration = 0
run compare                          → findings.json (+ delta from the 2nd run)
while iteration < 5:
  read findings.json                 → classify every finding (below)
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
to skip the harness and build the thing by reading the comp's markup. Reading
`.dc.html` source to derive a layout is the failure this tool exists to remove:
you become the comparator, and nothing you produce carries a number.

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
4. **Converge on the delta** exactly as below — §2 to classify, §4 to read
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
refdiff summary $OUT_ROOT      # sets / many pairs: one table + causes across pairs (see 1b)
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
not the implementation's, kept visible on purpose (see "Configuring a pair"). **On a page pair read `by region` before the
list** (`report.byRegion`, one group per smallest containing container): "36 in
the rail, 24 in the artboard image, 12 in the design pane" is three different
causes, and a severity-sorted list shows none of them. A converged loop once
hand-rolled that script twice in one session. Then read `findings.json` — it is small; read the whole
`findings` array, in order (severity-sorted). For each finding note:
`id`, `type`, `severity`, `instances` (×N = one root cause, `members[]`
lists every place), `message`, `expected`, `actual`, `role`, the boxes
(impl CSS px, world space). Skim `suppressed` once per run so you know what
the policy is hiding and why.

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
| `text` | both elements carry the SAME string | the transform played no part — trustworthy at any confidence |
| `slot` | same anchor and line height, different text (a value slot) | geometry formed it, but position-only |
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

### 1b. Sets — a component set or a whole manifest is ONE loop

A manifest entry with `design.variants` expands into one pair per variant
cell (Alert 23, Button 41). Do not read 41 `findings.json`. A multi-pair run
ends with the set summary (also `refdiff summary <out-root>`, written
to `<out-root>/summary.md` + `summary.json`): one row per pair (verdict,
counts, `unver`, alignment confidence + `align` transform, delta), then a
**Matching** table and a **Findings by type** table, and — the part you
read first — **one
row per cause across pairs** (`type`/`role`/values, `pairs = k/N`). Rules:

- **Iterations count per SET, not per cell**: one set run = one iteration;
  the five-iteration bound and the diminishing-returns stop apply to the
  set. A per-cell `findings.json` is opened only for a cause that is local
  (`pairs` well under N/2) or to check a fix on one cell.
- **A cause on (nearly) every cell is never per-cell code.** `k/N ≈ 1` means
  the environment, a token layer, or the harness: fonts not loaded, a root
  font-size, the story's render scale, a measurement rule. Find the one
  cause (ratios help: 12.25/14 = 16.63/19 = 10.5/12 = 0.875 was a root
  `font-size` in rem), then **trial it in a separate `--out`** (`out/vc-trial`)
  so the loop's ledger and delta stay clean, read the trial's summary, revert
  if the change is not yours to make, and report the before/after counts.
  A token-layer change that alters the whole design system is `needs a
  human` with those numbers attached, not a fix you commit.
- Sets share one out root; `summary.md` there always covers every run dir
  under it (all sets), the console shows the set just run.
- **The `Matching` table is how you tell "more precise" from "failed
  differently".** It reports what the MATCHER did per pair — `design` / `impl`
  leaves offered, `matched` (split `text` / `slot` / `geom`), `d-only`,
  `i-only`, `vetoed` — from `findings.json`'s own `matching` block. It matters
  because refusing a pair moves one element out of `matched` and adds one to
  BOTH one-sided columns: a matcher that got stricter and a matcher that fell
  apart move the FINDING count the same way. So after any change that could
  affect pairing (a fixture that now renders the comp's data, a `scope`, a
  `--max-gamma`), **a large `matched` drop is a REGRESSION** unless the
  `Findings by type` table shows the property types falling with it.
- **What a set CONTAINS is an artifact, not a console line: `<out-root>/<entryId>.set.json`.**
  Written at expansion time, before any capture, so it lands even when the
  captures or the Figma render fail. It carries the set's `axes.properties`,
  every pair (`slug`, run `dir`, `props`) and every SKIPPED cell with its
  reason and props — so it answers the one question a run root structurally
  cannot: **what was never measured.** `pairs.length + skipped.length` is the
  set's variant count, the same pair the run prints as `N variant pairs, M
  skipped`; the cross-product of `axes.properties` is what was DECLARED, and
  the difference is cells that exist in neither list. Measured on a DS set:
  `chip` expands to 5 pairs and 63 skipped out of 105 declared, with 2 run
  dirs in the Library. **Read `axes.source` before you trust the option
  ORDER** — `definitions` echoes Figma's `variantOptions`, `child-names` is the
  fallback's traversal order, and on real sets the two disagree. **Neither is
  the order the designer LAID OUT, and `definitions` is the one that fools you**:
  `variantOptions` tracks roughly when each option was CREATED, so an option
  added late sits last however early it appears on the canvas. Measured across a
  DS file's 12 sets (2026-09-07): 10 cleanly-separated axes diverge from the
  canvas, including all 7 `State` axes — four button sets share ONE canvas order
  (`Default, Hover, Active, Focus, Disabled, Loading`) and report four DIFFERENT
  `variantOptions` orders, two of them alphabetical with `Focus` appended. Derive
  the real order from the children's `absoluteBoundingBox.x` (ordering each
  option by its LEFTMOST cell — widths vary, so x-spans can overlap without the
  columns interleaving; check one fixed row before trusting a span-based read)
  and pin it with `gallery.order`. Treat `order` as load-bearing on any axis a
  human will read as columns, not as a `child-names` remedy. It is a FILE
  at the root, so every run-dir walker ignores it, and a subset re-run
  rewrites only the entries it names. It also carries the entry's `gallery`
  declaration when it has one — which axis is columns, pinned option order,
  human labels ("Declaring the library's shape").
- **The annotator's Library is a TABLE, one row per set, sorted
  ALPHABETICALLY.** Six columns —
  `Component set · Source · Cells · Findings roll-up · Measured · ⌄` — grouping
  run dirs by the entry their pair id names: every variant pair is
  `<entryId>--<slug>`, so `button-fill--state-hover_variant-default` sits
  under `button-fill`. Rows are alphabetical ascending (numeric-aware, so
  `-2` precedes `-10`); the row that just finished is found by the `Measured`
  column, not by position, because an order that moved on every subset re-run
  could not be scanned. Cells INSIDE a group stay newest-run-first — those are
  runs of one thing rather than things.
  **A row drops a prefix every row shares**: on a root whose every entry is
  `ds-*` the rows read `alert`, `button-fill`, `text-field`. One `-`-delimited
  segment, and only when EVERY group has it — that is what keeps it safe, since
  removing one common prefix from unique ids cannot collide, while a hardcoded
  strip can (a root holding both `button` and `ds-button` would draw two rows
  called `button`). It is display only: the `#/set/<entryId>` route, the
  `data-group` key and the `<entryId>.set.json` fetch all use the real id. A row is collapsed and shows that entry's cell count,
  the roll-up of its cells' severities as a dot and a count (or a green
  `Clean`), how many cells carry a REGRESSION (a fix come undone), how many are
  unreadable, and — in the Measured column — `r<min> → r<max>` over that group's
  OWN cells with `N stale`, which is how a subset re-run's mixed vintages stop
  being invisible. **Read that span per GROUP: `run` is the ordinal of a run OF
  THAT PAIR, so ordinals are incomparable across sets and there is no global
  newest.** A pair id with no `--` is a lone item: one row, no sheet, nothing to
  expand.
  Expanding a row lists that entry's CELLS as sub-rows — a verdict dot, the
  cell's own capture at 34×24, its variant props as its name (`Primary · md ·
  Default`, joined from `<entryId>.set.json` and fetched only for a group the
  reader has opened), its badge, its run pill and `Compare ›` — capped at ten
  with a `Show N more`. A search or a filter chip expands every group it left a
  match in, and the head row counts CELLS and names the groups they sit in
  (`194 cells in 14 groups`, or `12 of 194 cells · 3 of 14 groups` when
  filtered).
  Two filter chips mean something different from their names in older reports:
  **`Regressed`** (was `Diverging`) is `delta.regressions > 0`, a fix come
  undone — not `introduced > resolved`; **`Stale cells`** (was `Low
  confidence`) is a per-group RUN property, not an alignment one.
- **A set also has a SHEET, reached by the `Open sheet` button in its Library
  row's last column (or `#/set/<entryId>` directly), drawing its whole
  cross-product as a grid.** It joins `<out-root>/<entryId>.set.json` with `/api/pairs`, so it is the
  one surface that can show what was never measured. **It draws only what the
  DESIGN defines**, and there are four such states:
  `measured` (verdict + severity badge); **`unmapped`** — the design declares the
  variant and the story has no cell for it, drawn "Missing in impl" and the ONLY
  state that says anything about the implementation; **`filtered`** — the design
  declares it and the manifest's `only` / `omit` chose not to measure it, drawn
  "Out of scope"; and `pending` — expanded as a pair, but the root holds no
  readable report for it, which is declared-and-not-measured rather than absent.
  Those two used to be one `skipped` state labelled "Skipped · no impl cell",
  which is a false statement about the ones nobody looked for — measured across
  the DS's fourteen sets, 191 of 281 were `filtered`. Core carries the
  distinction as a value (`SetIndexSkipped.kind`) so a consumer never parses the
  reason prose; a set index written before that field falls back to the
  `only:` / `omit:` prefix.
  **The sheet draws only what a human can see in Figma, in scope.** Two kinds
  of cell get no tile at all — no dotted outline, no note. `absent`, the axes'
  cross-product minus everything declared, a corner of a hypercube the designer
  never visited (58 of them across those fourteen sets). And `filtered`, which
  the manifest narrowed away: declared in Figma, but not what this sheet is
  about. Both counts survive in the summary's tail (`36 out of scope · 23 of 91
  combinations undeclared`) because they are facts about the SET; they are
  simply not cells.
  **A row or column whose every cell is undrawn goes with them, and a property
  with ONE value across the survivors stops being an axis** — it would draw a
  row per option repeating the same value. Those values are not lost: the sheet
  states them once, in its title (`DS · Button / Stroke [variant=light ·
  Size=md · Theme=Dark]`). Measured: `button-stroke` 6×10 with 36 "Out of
  scope" tiles → **6×4, 24 cells, no gaps**; `select-field` 7×10 → 7×1. Nine
  of the fourteen sets end at 100% fill.
  **A sheet with pinned properties is a SLICE, and its cell lookups must be
  filtered to it.** Dropping an axis shortens the props key, so
  `State=Active` alone can be shared by dozens of variants and a keyed lookup
  keeps whichever came last — which silently redrew a coverage gap as
  out-of-scope. The gaps that remain after all this are honest sparsity:
  `dialog-header` declares 8 of its 16 combinations and no layout choice
  changes that. **`precedence`: `only` / `omit` are tested
  before the story selector, so a variant that is both out of scope and unmapped
  reports as `filtered` — "we did not look" is the honest answer when we did
  not.** A measured cell links to its own pair, because
  the sheet is a way INTO the pairs rather than a replacement: a finding's box
  means something in the pair view.
  **The rail on a sheet lists CAUSES, not findings, and clicking one lights every
  cell that carries it** — a `--diff` outline on each hit, the rest of the sheet
  dropped to 0.18, and the row's own count pill filled in the same colour; clicking
  it again clears. That is how you tell a token from a variant without opening a
  single pair: a cause on nearly every cell is not per-cell code. The colour is not
  the accent on purpose — the accent means SELECTION, and you can hold one of each.
  **A cell's box on each pane is that PANE'S OWN capture**, not the shared cell
  rect, so an outline hugs what was measured; a measured cell otherwise draws
  nothing of its own, and only the unmeasured kinds show a dashed box.
  **The overlay modes work on a sheet too** — Wipe, Onion, Blink and Diff superimpose
  the design CELLS over the impl pane, the same way they superimpose the design PNG on
  a pair. Wipe is the one to reach for on a set: one drag tells you which cells differ
  in PAINT rather than in structure, which is the half the element channel cannot see.
  **So does the ALIGN pill, per CELL** (since 2026-09-08): Top left puts every design at
  its own cell origin, Top right registers each by its own top-right corner, Width scales
  each design to its own impl's width, Anchors keeps each cell's measured fit. It used to
  do nothing at all on a sheet — the sheet's own alignment is the IDENTITY, because the
  world IS the grid, and feeding the pill that made all four modes compute the same
  registration. **What it registers is the two CAPTURE FRAMES, which is worth knowing when
  a mode "does not line up": if a story tags a WRAPPER rather than the component — a grid
  cell that stretches to its column with the component centred in it — the frames coincide
  exactly while the visible components sit the wrapper's slack apart. Measured on a DS
  button set: 9.9px, reported all along as `position … offset by (9.9, 0)px`. Fix the
  tagged element, not the registration; and do NOT fix it by selecting the component
  instead, because the captured ROOT is never a leaf and tagging it removes it from the
  element model (30 of 110 pairs went `blank-render`). A cell that hugs its component is
  the answer.**
- **`--bleed <px>` when paint LIVES OUTSIDE the box** — a focus ring, an outline
  with an offset, a drop shadow, a glow. A capture is clipped to the node's
  border box, so those pixels are not compared and not drawn; they are INVISIBLE
  rather than reported, because both sides stop in the same place and nothing
  differs. The tell is a state whose whole point is the ring (`State=Focus`)
  looking identical to `Default`, or a ring showing only its left and right
  slivers where the box happened to be wider than tall. Set it per entry in a
  manifest (`bleed: 8`, both sides) or run-wide with the flag; a side's own
  `bleed` wins over the entry's, and the entry's over the run's.
  **It changes no measurement** — element boxes stay relative to the node's own
  origin, the alignment is untouched, and the report records the margin actually
  captured per side so every consumer can place the PNG. Verified rather than
  asserted: the DS stroke set's 24 pairs report the same 145 findings with and
  without it, messages, `expected`/`actual`, boxes and identity keys included.
  **On a GALLERY grid, check the gap before raising it: `gap > bleed +
  whatever a neighbour paints past its own box`, or a cell photographs the cell
  beside it.** Measured: a DS button grid at `gap-x-3` (12px) against a 4px focus
  ring and `bleed: 8` is exactly TANGENT, and the clip's floor to a whole CSS px
  then tips 0.72px of the neighbour's ring into the picture. It is cosmetic —
  the sliver lands outside the compared frame region, 0 diff-mask pixels — but it
  reads as a defect in the component under review. Two things make it hard to
  dismiss by eye: it appeared on 1 of 164 captures, because a cell's content is
  usually CENTRED and only the widest row reaches its wrapper's edge; and a
  margin scan that assumes the outermost pixels are margin will report false
  positives on any pair whose `bleed` is clamped to 0 on that side, where those
  pixels are the element's own border. Read the per-side bleed first.
  It applies to every browser capture — one pair or a whole set, impl side or a
  `.dc.html` design. **On a FIGMA design it is a SWITCH, not a distance** (since
  2026-09-07; it used to be ignored there entirely). The `/images` endpoint takes
  no margin parameter — it renders the node's LAYOUT box under
  `use_absolute_bounds`, or its RENDER bounds without it, and nothing between —
  so any positive `bleed` means "render the node's own render bounds" and the
  margin you get is whatever that node has. A pair asking 8 whose node paints a
  4px ring records 4; `bleed` describes the PICTURE, and a recorded 8 would make
  every crop read 4px off in each direction. Two nodes never take it: one whose
  render bounds CROP the box (a TEXT node renders to its glyph ink — that crop is
  what `use_absolute_bounds` exists to prevent, and trading it for a margin puts
  every element box off silently), and one that paints nothing outside, where the
  two renders are the same picture. `figmaRenderBleed` decides both, and the
  batch render splits its ids on it — the flag is one query parameter per chunk
  while the need is per CELL, so a set's Focus column and its Default column go
  in separate calls. **The capture and the batch must agree**: a cell rendered
  one way and size-checked the other fails as `figma-render-failed`, which reads
  like a Figma bug (observed, deliberately, while A/B-ing this).
  Same neutrality claim, measured the same way on `button-fill`'s 41 pairs: 200
  findings both arms, 37 lists byte-identical, 0 structurally different, no
  alignment moved. The 4 that differ are Focus cells whose `pixel-region` FRAME
  ratio fell (75.13% → 74.19%, and three like it) — the design picture now holds
  the ring the impl paints, so less of the frame differs. That is the value
  moving toward parity, not the measurement changing: `pixel-region` keys on
  `changeKind` and box, so the delta is `+0/−0`. Staleness is read PER SET (`run` is the
  per-pair ordinal — there is no global newest), and the entry's `gallery`
  declaration decides the arrangement. A route with no `<entryId>.set.json` says
  so and names the command that writes one, rather than drawing an empty grid;
  refdiff reports such a page as `{"kind":"error-page"}`, so a sheet cannot be
  measured against a root with no set.
- **The ground is NOT captured, by default** (`--ground <transparent|keep>`, or
  `ground:` per entry; since 2026-09-10). A browser screenshot is a composite of
  the page, so every ancestor's paint is in the bytes; a Figma `/images` render
  is the node's subtree on transparency and no parameter would change it. The
  two sides of a pair were therefore photographing different things, and the
  difference landed in the frame-level `pixel-region` residual where it reads as
  generic noise about a container. So a browser capture now marks its node's
  ANCESTRY non-painting, shoots with an alpha channel, and takes the marking off
  — after which both sides hold the node's own subtree and nothing else.
  **What it is worth, measured on a dark-surface component gallery**: one
  ghost-button cell went 60.76% → 1.12% unexplained frame difference; across
  that repo's entries, ghost 28.4% → 1.1%, stroke 25.5% → 7.4%, checkbox
  50.8% → 3.5%. **Fill went 11.2% → 11.0%, and that is the control working** —
  its own fill covers the frame, so its residual was real drift all along and
  correctly survives. **A halfway version buys nothing and looks like it
  should**: making the page ground white instead of dark moves the same cell
  60.76% → 59.66%, because pixelmatch 7 defaults `checkerboard: true` and blends
  a transparent pixel against a position-varying pattern rather than a flat
  colour — it can never agree with ANY uniform ground. Only real alpha on both
  sides collapses it, which is why the neutralised ancestry and the alpha
  channel are one change and neither half is optional.
  **`ground: "keep"` opts back into the composite**, byte for byte the shot this
  tool took before the option existed — for a pair that is genuinely ABOUT its
  ground (a full-page comp whose artboard paints its own background, where the
  two sides already agree about what is behind the node). Resolution is the same
  three tiers as `bleed`: a side's own wins over the entry's, the entry's over
  `--ground`. **ELEMENT shots only** — a viewport or full-page shot has no
  ancestry to speak of and its ground is part of what it is for.
  **What this does NOT do is make the two grounds agree; it removes the ground
  from the comparison on both sides.** A quiet frame residual is then silence
  about the surface, not agreement — the same reading the Figma side alone has
  always needed.

### 2. Classify every finding — this is the whole skill

| class | how it looks | what you do |
|---|---|---|
| **data** | `missing-element` / `extra-element` on value-like text (names, amounts, dates, IDs, a row the comp's fixture has and yours lacks); a `text-content` finding where BOTH sides are value-like (`412,00 €` vs `84,20 €`) — these are reported by default, not pre-suppressed | make the fixture / seed render the comp's data; then declare the recurring shapes once as `ignore.dataSlots: { patterns: [...] }` so later runs stay quiet without going blind to copy |
| **copy drift** | `text-content` where the non-value part of the string changed (`Blok · 12. 7. 2026` → `Doklad · 12. 7. 2026`, `Potvrdiť →` → `Návrh`), a label renamed, a number dropped from a label | fix the code or the comp — this is the class `dataSlots: true` used to hide, so read every `text-content` finding before declaring any of them data |
| **drift** | `color` (with ΔE2000), `typography` (family / size / weight / line-height), `size`, `position` (a shift; ×N with the same delta = one layout cause), `spacing` (sibling gap), `border`, `border-radius`, a `missing-element` that is a real UI element (icon, badge, button, label), `pixel-region` with `changeKind` `shape` / `added` / `removed` / `stroke` / `color` (wrong icon glyph, missing illustration, recolored image), `alignment` (the fit is not the identity on a same-size page — a chrome size / box model difference, §1a) | fix the code: token, class, layout; prefer the root cause of an aggregate over its members; fix `alignment` before anything positional |
| **intended deviation** | the value is right for the product and the comp is the outlier (rule 4), or a documented decision (reordering, a11y, i18n) | record it: `refdiff accept <run-dir> --manifest <file> --finding <id> --reason "<evidence>"` (§3a) — or write `accepted: [{ type, expected, actual, reason }]` into the pair's `ignore` by hand. The reason must say why and cite the measurement; for `pixel-region` narrow with `changeKind`, never accept "any pixel difference". Textless boxes INSIDE an accepted element (a placeholder's bars) are the same decision: add `contents: true` to that rule by hand, never a `regions` entry — and when the container is an ELEMENT that exists whether or not it is reported (the run's own screenshot against a comp that draws live DOM), `contentsOf` is the rule that fires every time instead of when the container happens to go unpaired |
| **environment** | `pixel-region` at `severity: minor` with no box ("alignment confidence < 0.5") or with `changeKind: noise`, `still-loading`, fonts not loaded (every `typography` finding says the same fallback family), a viewport that clips | fix the capture (fonts in Storybook preview, `--viewport`, `--wait-for`, seeds), not the code |
| **known cause, not the implementation's** | many findings in one region or of one shape, all traceable to one thing you have already diagnosed and cannot fix from here — a comp whose demo rows are in another order, two canvases at different zoom, a numbering that starts from different sources | declare it once as `explain: [{ types, region|within, cause, reason }]`: the findings stay reported and keep their severity, they are grouped under the cause, and they stop failing the verdict. Scope `types` to what the cause can PHYSICALLY produce — that is what keeps a real defect in the same region visible |
| **needs a human** | the comp itself is inconsistent; the fix would change product behaviour, copy, or information architecture (a row set, a label's meaning); the finding is inside a region you were told not to touch | do NOT fix; list it in the report with the measurement, and leave a note for the designer in the annotator if one is running |

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

## Turning a pair OFF — `disabled`

`disabled: "<why>"` keeps a pair in the manifest and runs nothing. The case it
exists for: a comp is superseded by a rebuild, so its pair now measures the new
surface against the old design and reports hundreds of findings that mean
nothing. Deleting the pair loses the declaration and the comp's linkage;
leaving it enabled trains everyone to read its number as weather.

```js
{
  id: "refdiff-library-desktop",
  disabled: "RefDiff Library.dc.html draws the card grid chunk 5 replaced — 489 findings at confidence 0.14",
  design: { file: "RefDiff Library.dc.html", frame: "Library" },
  app: { source: "live", route: "/", viewport: { width: 1180, height: 800 } },
}
```

**The reason is REQUIRED and `disabled: true` is refused**, naming the entry: a
pair that silently does not run is the one failure that reports itself nowhere,
so the single thing a disabled pair must carry is why. Re-enabling is deleting
one key.

- It lands in `ManifestParse.skipped`, so `compare` prints
  `skipping <id>: disabled — <reason>` on **every** run. Naming only disabled
  ids in `--pair` exits 2 with "no runnable pairs selected", after those lines.
- **Its run dir is left exactly as it was.** Nothing is deleted, so the
  annotator still lists the last result it had — a disabled pair's card is a
  frozen measurement, not a missing one.
- It is read BEFORE the design and impl specs are validated, so a disabled pair
  whose spec has rotted does not fail the whole manifest. The cost: a typo
  inside a disabled entry waits until it is re-enabled.
- **A coverage guard must treat it as a third state.** A disabled pair satisfies
  "the design is declared" while failing "the pair is measured", and keeping
  those two facts apart is what such a guard is for — counting it as paired puts
  a silent hole in the check written to close one. This repo's
  `pairCoverage` reports it under `unmeasured`, asserted EXACTLY against a
  `DISABLED_COMPS` list rather than with `contains`, because an empty list is
  indistinguishable from a clean tree.

## Configuring a pair — the `ignore` block

Every pair in a manifest may carry an `ignore` block. It is the durable place
for a judgement you have already made; making it once beats re-judging the same
findings every run. **Nothing here deletes a finding** — suppressed findings
travel in `findings.json` under `suppressed`, tagged with the rule that hit
them, so a wrong policy is auditable rather than invisible. A `textPatterns`
regex is tested against the finding's `text` IN FULL, then the strings quoted
in its message and the `expected` / `actual` text — so an anchored `^…$`
pattern can excuse a long label; if a rule "does not fire", print those
strings for the finding before touching the regex (display strings are not
data strings).

```js
{
  id: "docs-owner-desktop",
  section: "Core patterns/Documents",                     // where it belongs — see "Declaring the library's shape"
  design: { file: "documents.dc.html", frame: "8a" },
  app: { source: "live", role: "owner", route: "/…/docs", viewport: { width: 1280, height: 900 } },
  ignore: {
    scope: "[data-testid=doc-list]",                      // compare this design node, not the artboard
    dataSlots: { patterns: ["\\d{1,2}\\. \\d{1,2}\\. \\d{4}"] },
    roles: ["backdrop"],
    accepted: [{ type: "color", expected: { color: "rgb(26,26,26)" }, actual: { color: "rgb(44,36,25)" }, reason: "…" }],
    contentsOf: [{ role: "image", types: ["missing-element"], reason: "the app draws the run's screenshot where the comp imports live DOM" }],
    explain: [{ types: ["position", "spacing"], region: { x: 1039, y: 86, w: 321, h: 2000 }, cause: "comp rail row order", reason: "the comp's demo lists its rows in another order — design ask 1" }],
  },
}
```

Pick the narrowest tool that covers the case:

| you want to ignore | use | what it costs you |
| --- | --- | --- |
| a volatile VALUE (amount, date, id, name) while still checking the copy around it | `dataSlots: { patterns }` | nothing else — geometry, colour, typography still compared on that pair |
| every text difference on matched pairs (a deliberately data-only comparison) | `dataSlots: true` | blind to ALL copy drift; it cannot expire, so it hides tomorrow's regression too |
| an element entirely — geometry, colour and text alike | `textPatterns` | every finding type about a matching string, geometry included; reach for it last |
| a kind of element (backdrops, focus rings, an SVG overlay's `shape`s) | `roles` | that role everywhere in the pair |
| artboard chrome (labels, notes around the frame) | `regions` or `scope` | prefer `scope`: it fixes the ALIGNMENT too, which `regions` does not |
| a class of findings whose CAUSE you have diagnosed and cannot fix from here (the comp's demo order, a canvas-zoom difference, a numbering scheme) | `explain: [{ types, region \| within: { role }, text?, cause, reason }]` — the finding stays in `findings` with its severity, carries `explained: { cause, rule }`, is grouped under the cause in the run line, and is left OUT of the verdict | `types` is required and is the safety: name only what the cause can physically produce, so a `color`/`typography`/`text-content` finding in the same region still fails. It does NOT lapse by itself — see the staleness note below |
| a specific, reviewed value difference | `accepted: [{ type, expected, actual, reason }]`, by hand or via `refdiff accept` (§3a) — add `text` to scope it to one element when the values alone cannot | nothing — it lapses automatically when either value changes |
| the INSIDES of an accepted element (a comp's placeholder plate drawn with bars, a logo square inside an accepted image) | `contents: true` on that `accepted` rule, by hand in the manifest only (`refdiff accept` never writes it): every TEXTLESS finding whose boxes lie inside the boxes of the finding the rule hit is suppressed too, as `"<reason> (inside)"` | text inside the region is never excused (a missing label or a badge drawn over the region still shows); nothing when the rule itself hits nothing |
| the insides of an element that is THERE whether or not it is reported — the run's own screenshot where the comp draws live DOM, a canvas, a video | `contentsOf: [{ role, types, reason }]`: every TEXTLESS finding of those `types` whose boxes lie inside an impl element of that `role` is suppressed as `"<reason> (contents of <role>)"` | `types` is required — an unscoped rule would forgive its container's whole interior, including the app's own marks drawn over it. Text is never excused (the comp draws its BADGES over that region and a badge is a numeral). A container the FRAME does not contain is skipped: a panned, zoomed canvas "contains" everything beside it |

**`contentsOf` differs from `accepted … contents` in WHERE THE CONTAINER COMES FROM, and that is
the whole point.** `contents: true` takes its region from the finding its own rule HIT, so it fires
only when the container element is itself reported — for a screenshot that means only when the
screenshot fails to PAIR, which is geometry, not a decision. Measured on one corpus: the design side
had no image element at all, the app had one or two, and they still paired on five pairs of six
because a comp container sat inside the γ cutoff; the sixth had a panned canvas, so the rule fired
there and nowhere else, and among the findings it excused was the very thing that pair existed to
measure. A `contentsOf` rule names the element, so it fires every run, and its region is the
element's live box, so it follows a canvas the reader pans — which a literal `regions` box cannot do.

**An EXPLANATION is not a suppression, and it can go STALE — that is the one thing to watch.**
Suppression removes a finding from the list and says a rule hid it; an explanation leaves it there,
severity intact, and says what caused it. Reach for it when a large share of a pair is one diagnosed
cause that is not the implementation's: on one dogfooded set, 203 of 340 findings were three such
causes, and the verdict failing on them had trained everyone to read the number as weather.
An `accepted` rule lapses by itself because it is keyed to MEASURED VALUES — the moment either side
changes, it stops hitting. An `explain` rule is keyed to a region and a set of types, so it does
NOT: when the cause is finally fixed on the comp's side, the rule stays and becomes a standing
excuse over live ground. Two things watch it for you, and neither needs a maintained number:
every run compares each cause's count against the PREVIOUS run's and prints the movement (`"comp
rail row order" GREW 51 → 58 — findings joined a cause nobody re-read`, or `fell … — the cause may
be going away`), and `refdiff summary` names any declared cause that matched NOTHING anywhere in
the set, which is what a fixed cause looks like. Read those lines; they are the price of the quiet.

**A pair's `dataSlots` only started applying on 2026-09-04 — check the report,
not the manifest.** The CLI built its run-wide policy with an explicit
`dataSlots: false` whenever neither `--data-slots` nor `--data-slot-text` was
passed, and the run-wide policy merges LAST over each pair's own, so every
`ignore.dataSlots` in every manifest was overridden by a default nobody asked
for. Measured: two shipped pairs carried `{ patterns: ["Run \\d+ vs \\d+"] }` for
two days and recorded `dataSlots: false` in their reports the whole time. The
generalisation is the thing to keep: **a declared rule with no effect reports
itself nowhere** — `findings.json`'s own `policy` block is what the run actually
used, so read it there when a rule "does not fire". Same shape as a comp with no
pair, and it is why `runWidePolicy` omits a key nobody passed instead of writing
its default.

**`dataSlots: { patterns }` masks, it does not match.** Each shape is removed
from BOTH strings and the remainder compared: equal remainder = data churn
(suppressed), different remainder = copy drift (reported). So a mixed slot
works — `"Blok · 12. 7. 2026"` vs `"Doklad · 12. 7. 2026"` is reported (the
label drifted) while `"Blok · 12. 7. 2026"` vs `"Blok · 11. 7. 2026"` is not.
Anchors in the regex are optional; only the match is removed.

**Default is noisy on purpose.** Text differences on matched pairs are REPORTED
unless you say otherwise, because which strings are data is a per-pair judgement
and a harness that guesses it goes quiet about copy regressions. Read the
`text-content` findings, then declare the shapes you actually saw.

**Order of attack** — do not skip down the list:

1. **Capture** — fonts loaded? whole frame captured? soft 404? (`environment`
   findings, or every `typography` finding naming the same fallback family).
2. **Data** — make the fixture/seed render the comp's data. This is what lifts
   alignment confidence; policy cannot.
3. **Order** — on any list, grid or panel of repeated rows, compare the ORDER
   of the shared anchors on both sides before reading one finding. refdiff
   pairs row N with row N, so a different order reads as a `text-content` /
   `color` / `typography` finding on every pill, badge and chip of every row
   (one Library page: 208 → 101 findings and confidence 0.20 → 0.76 from the
   sort alone). Fix the sort or the fixture's sort key first, then re-run. If
   the order is the comp's OWN data (a demo array listed by hand) and the impl
   sorts by a real rule, it is a design gap — say so, do not bend the fixture.
4. **Alignment** — `ignore.scope`, viewport/height, using the per-axis split.
5. **Only then** the real drift, and only then write policy for what is left.

Doing 5 before 1–4 means fixing artefacts, and the delta will not stick.

## Declaring the library's shape — `section`, `sections`, `gallery`

Three OPTIONAL declarations. They change no measurement: a run with them and a
run without them produce identical reports. What they change is how a reader
navigates a manifest that has grown past a screen, and how a variant set's
cells are arranged when one is drawn as a grid.

```js
// The order and the labels of the hierarchy. Array POSITION is the order —
// there is no `order` field, so nothing can disagree with it. A path here that
// no entry uses is a PURE GROUPING NODE, deliberate and valid: hierarchy only,
// nothing measured.
export const sections = [
  "Foundations",                                          // no entries — a grouping node
  { path: "Core components / Buttons", label: "Buttons" },
  "Core patterns",
]

export const manifest = [
  {
    id: "ds-button-fill",
    section: "Core components / Buttons",                 // a flat path, never a nested tree
    design: { kind: "figma", fileKey: "…", nodeId: "…", variants: { selector: "…" } },
    app: { source: "storybook", storyId: "ds-button--fill" },
    bleed: 8,                                             // px of margin around BOTH sides' nodes,
                                                          // so a focus ring or shadow is captured
    ground: "keep",                                       // OPT-OUT. Default is "transparent":
                                                          // the paint BEHIND the node is not captured
    // Only on a component SET — every field names a variant PROPERTY.
    gallery: {
      columns: "State",                                   // which axis is columns
      rows: "variant",
      order: { State: ["Default", "Hover", "Focus on text"] },   // pinned option order
      labels: { State: { "Focus on text": "Focus" } },           // human labels
    },
  },
]
```

- **Paths are flat strings, `/`-separated, and every segment is TRIMMED.** So
  `"Actions / Button"` and `"Actions/Button"` are the same node. Without the
  trim they would be two groups rendering under one name — a split with no
  visible cause. An empty segment is refused rather than repaired (`""`,
  `"/A"`, `"A/"`, `"A//B"`), because each one is a typo whose only symptom is a
  blank row.
- **A malformed declaration FAILS the manifest.** This is the opposite call
  from an `ignore` rule, where a malformed rule is dropped and the run then
  reports everything the rule would have excused — loud. Here a dropped field
  loses a label, a position or an axis in silence and the library still draws,
  looking finished. An **unknown key in `gallery` is an error too**, and so is
  an EMPTY `gallery: {}` — that pair of checks is what turns `{ colums:
  "State" }` into a message naming the field instead of a sheet laid out on
  whatever the consumer defaults to.
- **`gallery` needs `design.variants`.** Every field of it names a variant
  property, so on a one-cell pair there is nothing for it to describe; it is
  refused, naming the entry.
- **`gallery` is a declaration, not a resolved layout — and nothing validates
  it against the SET.** The manifest parser has no Figma node, so a `columns`
  naming a property the set does not define, or an `order` listing an option no
  cell carries, is shape-valid. It travels VERBATIM into
  `<out-root>/<entryId>.set.json` (`gallery`), beside the `axes` it refers to,
  and the run prints it back — `axes from definitions, gallery columns=State
  rows=variant order pinned for State` — which is where a mismatch can be seen at
  all. The pinned properties are named rather than counted: a pin is the one
  field that OVERRIDES the axes, so a reader comparing the line against `axes
  from …` has to know which properties stopped coming from there.
  **`order` earns its keep on BOTH branches, and the `definitions` one is where
  it is easiest to skip.** The fallback's traversal order is visibly arbitrary,
  so nobody trusts it; `variantOptions` looks authoritative and is not the canvas
  order (§1b: 10 of 12 sets measured, every `State` axis among them). Pin any
  axis a human will read as columns.
- **An unresolvable `gallery` name is graded, and the grade is the rule.** The
  manifest parser holds no Figma node, so it can only check the SHAPE; the
  annotator's sheet holds both the declaration and the axes and is the first
  place a NAME can be checked at all. `columns` / `rows` naming a property the
  set does not define is FATAL — the sheet refuses and names the properties that
  do exist, because there is no correct grid to draw and a plausible one the
  declaration did not shape is worse than none. An `order` option no cell
  carries, or a `labels` entry for something absent, is a WARNING shown on the
  page and otherwise ignored: membership belongs to the SET, not to a
  declaration ordering it. Partial pinning is not a warning — it is the
  documented use. And with `axes.source: "child-names"` the sheet warns that its
  option order is TRAVERSAL order rather than the designer's, which `order`
  silences per property by pinning what the fallback could only guess.
- **With no `gallery` at all the sheet takes the axes' own order** — the first
  property across, the rest nested down the rows. Most sets declare nothing, so
  this is the common path; it is arbitrary but stable, and it is what `gallery`
  exists to override.
- **`section` is validated and reported, not yet persisted.** `compare` prints
  one line for a manifest that declares any (`hierarchy: 3 sections declared,
  1/2 entries placed`) and nothing for one that does not. The run root does not
  carry the section tree yet, so no surface groups by it — the annotator's
  Library still groups by the entry a pair id names (§1b). The consequence is
  visible: the Library comps draw a section `path` line under each set name
  (`Actions / Button`) and a hierarchy-only row with children, and the app draws
  neither, so both are reported against every Library-groups run. That is a real
  gap, deliberately left red rather than declared away.

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
  it acted on. A value slot in the same place is never touched — 146% against
  100% at γ 0.5, a card count at γ 0, a status chip whose word the other side
  does not use at all. **SVG content is extracted now, with limits.** An `<svg>` is
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

## Environment pre-flight (fill in per repo)

This one is about the REPO you are measuring; the "Tool pre-flight" section above is about the
tool you are measuring WITH. Run that one first — it is scripted and it halts.

The repo's `refdiff.bindings.md` holds the specifics; these are the
failure shapes that recur everywhere and impersonate product bugs.

- **A green pair proves the STATE matches the comp; it says nothing about
  whether a user can REACH that state.** Every pair pins the URL, viewport and
  steps that put the app into the state it measures — that is what makes it
  reproducible, and it is also a blind spot with no finding to report: the
  default the user actually gets is measured by no pair unless one pins THAT.
  Measured instance: a phone layout sat at confidence 1.00 with 15 findings while
  the app still booted into the layout it replaced, because the boot line could
  not read back the value its own setter persisted — three mobile pairs, all
  green, none of them capturing a bare URL. When a change adds or replaces a
  DEFAULT (a preset, a saved preference, a feature flag), verify it in the
  product the way a user meets it — a browser at that viewport reading
  `document.body.className` and the controls' computed `display` — and then pin
  the old state on the pair that used to get it by default, or that pair silently
  changes subject.
  **And probe the RETURNING user, not only a fresh one: seed the storage the
  product writes.** A fresh browser is the one case that cannot see a stale
  preference, so a clean-context probe passes while every existing user keeps the
  old behaviour. Same instance, second round: the new default was correct in a
  fresh context and the reporter still saw the old layout, because every earlier
  visit had persisted the old value and the new boot line honoured it. A default
  that a stored value can override is not a default — either stop storing it, or
  seed the old value in the probe and assert what the user gets.
- **The served annotator WRITES into what it serves.** `refdiff-annotator
  <root> --serve` persists every note, verdict and focus region into the run
  dir (`annotations.json` / `triage.json` / `focus.json` + digests). Read
  `focus.md` before working "in the focused region": it names the rectangle in
  impl CSS px and lists every in-scope finding — in scope meaning the region
  covers most of the finding's box (or the box contains the region), so a
  full-width element that merely runs through the rectangle is deliberately
  OUT. When
  the served root is a committed fixture, or the impl a `compare` run is
  measuring, serve it `--read-only`: every PUT is refused with 405, the
  page is otherwise identical (the rail names the refusal only on the first
  save attempted), and the measure is of the tree you committed.
  Review sessions that must save notes serve without the flag, on another
  port.
- **A cold route can blow the 30 s navigation budget.** A dev server compiling a
  route on first hit fails as `navigation-failed` / `Timeout 30000ms exceeded`,
  which reads exactly like a broken page. Warm the route once (`curl -L`), then
  re-run before believing it.
- **A direct DB seed does not invalidate the app's caches.** Insert a row with
  SQL and a cached read still serves the old answer — typically as a soft 404
  (HTTP **200** with a not-found body, so only a content check catches it).
  Restart the app after seeding, then re-capture.
- **A matching `fontFamily` does not prove the font loaded.** The
  `typography` channel reads the COMPUTED family — the declared stack's first
  name whether or not its woff2 arrived — so a 404'd `@font-face` reports the
  right family on both sides while the pixels are the system font, and no
  finding says so (the loud case, every finding naming the fallback family, is
  the one below). Pair any self-hosted or newly wired font with a load check:
  `[...document.fonts]` statuses in the captured page, or an audit of zero
  non-200 font requests.
- **A comp's prop DEFAULTS decide what gets captured.** A `.dc.html` comp is
  captured in its default state; a designed state behind a non-default prop
  (`showDeltaStrip: false`, an `errorState` selector) ships UNMEASURED and any
  impl that draws it pays a layout shift against the capture. Read the
  `data-props` block first; ask the designer to flip a default that should
  be the demo state, and list the rest as unmeasured by decision.
- **CSS variables set on a decorator wrapper do not reach portalled content.**
  Dialogs and sheets portal to `<body>`; if the font/theme variables live on a
  Storybook decorator `<div>`, overlay stories render in the browser default and
  EVERY `typography` finding names the same fallback family. Put the variables
  where the app puts them (`<html>`), not on a wrapper.
- **A full-bleed comp is captured at the pair viewport; a fixed artboard is
  not.** The dc-html adapter opens its canvas 120px wider than
  `app.viewport` so a fixed-size frame never reflows against the window edge.
  A comp with no fixed width (`width:100%`, `min-height:100vh` page comps)
  would grow into that slack and capture 120px wider than the impl — every
  right-aligned control offset, confidence gone — so the adapter detects the
  frame reaching the canvas edge, snaps the window to the exact viewport and
  RELOADS there (a resize alone leaves any mount-time layout — a canvas that
  fits its artboard once, on load — where the wider window put it). The design
  capture line then reads `scope … fluid` and its css px equal the pair
  viewport. A fluid comp WITHOUT `app.viewport` on the pair
  captures at the 1560px default canvas: give every full-bleed pair a viewport.
- Storybook: token / global-CSS edits may not HMR — restart before trusting
  a re-run; confirm a color via the `color` finding, not the screenshot.
- Live app: seeds present? auth working? A soft 404 compares "fine".
- Figma: `$FIGMA_TOKEN`; a 429 writes a cooldown record and the CLI refuses
  to burn budget until it passes (`figma-rate-limited`). **A cooldown is not a
  cache** — it makes the failure cheap AFTER you are over the limit; it never
  keeps you under it. **A full manifest run costs one API call per set for the
  node subtree, one for the variables map, and one per five nodes for the image
  renders** — measured at 83 for a 14-entry / 208-pair manifest — and TWO full
  runs back to back exhausted the `high` limit-type mid-A/B, after which nine
  entries failed to expand and the second arm silently covered 130 pairs
  instead of 205. If you are A/B-ing anything, expect to pay twice.
- **The Figma cache is on by default and keyed by the file VERSION**
  (`--no-figma-cache` to disable). It stores the rendered PNGs and the variables
  map under `~/.cache/refdiff/figma/<fileKey>/<version>/`, and **never the node
  subtree**: that call is what returns the version every key is built from, so
  caching it would cache the freshness probe itself. One live call per set buys
  the guarantee — **an edited Figma file gets a new version, so every key misses
  and the run refetches**, with stale version directories pruned on sight. Same
  manifest: 83 calls cold, 14 warm. It is the opposite of a file-existence cache
  (`does refs/foo.png exist?`), which cannot tell "cached" from "stale" and will
  happily serve a render of a design nobody has seen for days.
- The unit of a design-system comparison is one variant COMPONENT ↔ one
  story cell (`--selector`), never the whole sheet.
