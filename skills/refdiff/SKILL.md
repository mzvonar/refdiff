---
name: refdiff
description: Close the gap between a design frame (Claude Design .dc.html or Figma) and its implementation (Storybook story or live page) with the refdiff CLI in a bounded, measured loop — run compare → read findings.json (expected/actual first, crops second) → read the focused region and open annotations → fix → re-run → read delta → mark notes implemented. Use whenever asked to "match the design", "fix design parity / design drift", "make the story match the comp", "run refdiff", "work in the focused region", or to verify a UI change against its design — and when asked to "set up refdiff in dev mode", "install the refdiff CLI", or the `refdiff` command is missing on this machine (run setup-dev.sh). Never eyeball two screenshots; every claim is a number from findings.json.
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

This skill is a USER-level skill (symlinked from
`~/.claude-shared/skills/refdiff` → the refdiff checkout; both
profiles link it), so it is available in every project. Nothing of it lives
in a consuming repo — the repo only carries its manifest and a bindings file.
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

The CLIs are on PATH via `pnpm link --global` from the refdiff
checkout: `refdiff` (core) and `refdiff-annotator`. They run
from `dist` — keep `pnpm dev` (tsc --watch) running in that checkout while
developing, or `pnpm build` after pulling.

## Dev-mode setup (new machine / VM)

When the user asks to set the skill up in dev mode, or `refdiff` is
not on PATH, run the bundled script — it is idempotent and touches no
consuming repo:

```bash
bash "$(dirname "$(readlink -f ~/.claude/skills/refdiff/SKILL.md)")/setup-dev.sh" --watch
# options: --checkout <dir> (default ~/Development/refdiff, cloned from
#          github.com/mzvonar/refdiff if missing)  --no-browser  (skip Playwright Chromium)
```

It makes these true, then verifies (`refdiff --help`, test count):
the checkout exists; deps + Playwright Chromium installed; both packages
built; `pnpm link --global` so `refdiff` / `refdiff-annotator`
resolve (it tells you the PATH line to add if pnpm's global bin is not on
PATH yet); the skill is user-level — `~/.claude/skills/refdiff` (and
`~/.claude-personal` if present) → the checkout, through
`~/.claude-shared/skills` only when that dir already exists (a plain machine
with just `~/.claude` links directly; nothing is created that was not in use);
with `--watch`, `pnpm dev` runs in the background (`<checkout>/.dev.log`) so
edits to `packages/*/src` reach the linked CLIs without a manual build. Edits
to `SKILL.md` are live immediately (symlink). Needs Node ≥22, pnpm, git, and
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
   frame.** Before changing a shared token or rule because one comp says so,
   measure the other comps (`grep -o '#hex' design-dir/*.dc.html | wc -l`
   per file, or the other frames of the same component). If the comp you
   are comparing is the outlier, the implementation is right: record the
   decision with `refdiff accept` (§3a), evidence as its `reason`. If the
   siblings agree with it, fix the token.
5. **Suppression is visible or it does not happen.** Every intended
   deviation goes into the pair's `ignore` block (`textPatterns`, `roles`,
   `regions`, `accepted: [{ type, expected?, actual?, reason }]`) or the CLI
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

### 1. Run

```bash
refdiff compare --manifest $MANIFEST --design-dir $DESIGN_DIR --pair <id> --storybook-dir $REPO --out $OUT_ROOT
# or the explicit one-pair form (--design-file/--design-frame/--story, --figma …, --url …)
refdiff summary $OUT_ROOT      # sets / many pairs: one table + causes across pairs (see 1b)
```

`--out` is a ROOT, always: the run dir is `$OUT_ROOT/<pair>/`, for one pair and
for forty. In **manifest mode the per-pair capture flags are rejected** —
`--viewport`, `--selector`, `--wait-for`, `--full-page`, `--story`, `--url`,
`--design-file/-frame`, `--figma` all belong on the manifest entry, and passing
one is a usage error naming the field to set. Policy flags (`--ignore-text`,
`--accept`, `--data-slot-text`, `--data-slots`, `--scope`) DO apply run-wide and
merge under each pair's own `ignore`.

Read the console summary (`N findings (c critical, m major, k minor) covering
I instances, S suppressed`, `delta vs …: +introduced / −resolved`,
`verdict`). Then read `findings.json` — it is small; read the whole
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

### 1b. Sets — a component set or a whole manifest is ONE loop

A manifest entry with `design.variants` expands into one pair per variant
cell (Alert 23, Button 41). Do not read 41 `findings.json`. A multi-pair run
ends with the set summary (also `refdiff summary <out-root>`, written
to `<out-root>/summary.md` + `summary.json`): one row per pair (verdict,
counts, alignment confidence + `align` transform, delta) and — the part you
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

### 2. Classify every finding — this is the whole skill

| class | how it looks | what you do |
|---|---|---|
| **data** | `missing-element` / `extra-element` on value-like text (names, amounts, dates, IDs, a row the comp's fixture has and yours lacks); a `text-content` finding where BOTH sides are value-like (`412,00 €` vs `84,20 €`) — these are reported by default, not pre-suppressed | make the fixture / seed render the comp's data; then declare the recurring shapes once as `ignore.dataSlots: { patterns: [...] }` so later runs stay quiet without going blind to copy |
| **copy drift** | `text-content` where the non-value part of the string changed (`Blok · 12. 7. 2026` → `Doklad · 12. 7. 2026`, `Potvrdiť →` → `Návrh`), a label renamed, a number dropped from a label | fix the code or the comp — this is the class `dataSlots: true` used to hide, so read every `text-content` finding before declaring any of them data |
| **drift** | `color` (with ΔE2000), `typography` (family / size / weight / line-height), `size`, `position` (a shift; ×N with the same delta = one layout cause), `spacing` (sibling gap), `border`, `border-radius`, a `missing-element` that is a real UI element (icon, badge, button, label), `pixel-region` with `changeKind` `shape` / `added` / `removed` / `stroke` / `color` (wrong icon glyph, missing illustration, recolored image), `alignment` (the fit is not the identity on a same-size page — a chrome size / box model difference, §1a) | fix the code: token, class, layout; prefer the root cause of an aggregate over its members; fix `alignment` before anything positional |
| **intended deviation** | the value is right for the product and the comp is the outlier (rule 4), or a documented decision (reordering, a11y, i18n) | record it: `refdiff accept <run-dir> --manifest <file> --finding <id> --reason "<evidence>"` (§3a) — or write `accepted: [{ type, expected, actual, reason }]` into the pair's `ignore` by hand. The reason must say why and cite the measurement; for `pixel-region` narrow with `changeKind`, never accept "any pixel difference". Textless boxes INSIDE an accepted element (a placeholder's bars) are the same decision: add `contents: true` to that rule by hand, never a `regions` entry |
| **environment** | `pixel-region` at `severity: minor` with no box ("alignment confidence < 0.5") or with `changeKind: noise`, `still-loading`, fonts not loaded (every `typography` finding says the same fallback family), a viewport that clips | fix the capture (fonts in Storybook preview, `--viewport`, `--wait-for`, seeds), not the code |
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
  One shape that is NOT an app regression: a refdiff upgrade that changes
  how elements PAIR (the matcher) changes what a finding IS, so the run
  dir's ledger — written under the old pairing — can name findings the old
  pairing had hidden (a numeral it mis-paired with a neighbour now reads as
  its own `position`). Check the regressed entries' `resolvedAt` in
  `resolved-ledger.json` against the upgrade: all older → the delta churns
  once, say so in the report, and carry on; the next run is clean.
- Findings that know their element's `text` are identified by content
  (type, role, text), not by coordinates — so a data-parity iteration that
  moves the alignment does NOT churn them; textless findings (icons, boxes)
  still pair by place within 5px and may churn when everything shifts. A
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
  design: { file: "documents.dc.html", frame: "8a" },
  app: { source: "live", role: "owner", route: "/…/docs", viewport: { width: 1280, height: 900 } },
  ignore: {
    scope: "[data-testid=doc-list]",                      // compare this design node, not the artboard
    dataSlots: { patterns: ["\\d{1,2}\\. \\d{1,2}\\. \\d{4}"] },
    roles: ["backdrop"],
    accepted: [{ type: "color", expected: { color: "rgb(26,26,26)" }, actual: { color: "rgb(44,36,25)" }, reason: "…" }],
  },
}
```

Pick the narrowest tool that covers the case:

| you want to ignore | use | what it costs you |
| --- | --- | --- |
| a volatile VALUE (amount, date, id, name) while still checking the copy around it | `dataSlots: { patterns }` | nothing else — geometry, colour, typography still compared on that pair |
| every text difference on matched pairs (a deliberately data-only comparison) | `dataSlots: true` | blind to ALL copy drift; it cannot expire, so it hides tomorrow's regression too |
| an element entirely — geometry, colour and text alike | `textPatterns` | every finding type about a matching string, geometry included; reach for it last |
| a kind of element (backdrops, focus rings) | `roles` | that role everywhere in the pair |
| artboard chrome (labels, notes around the frame) | `regions` or `scope` | prefer `scope`: it fixes the ALIGNMENT too, which `regions` does not |
| a specific, reviewed value difference | `accepted: [{ type, expected, actual, reason }]`, by hand or via `refdiff accept` (§3a) — add `text` to scope it to one element when the values alone cannot | nothing — it lapses automatically when either value changes |
| the INSIDES of an accepted element (a comp's placeholder plate drawn with bars, a logo square inside an accepted image) | `contents: true` on that `accepted` rule, by hand in the manifest only (`refdiff accept` never writes it): every TEXTLESS finding whose boxes lie inside the boxes of the finding the rule hit is suppressed too, as `"<reason> (inside)"` | text inside the region is never excused (a missing label or a badge drawn over the region still shows); nothing when the rule itself hits nothing |

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
  `missing-element`, not as a chain of missing + extra + `text-content`. The extractor sees DOM text only: a number or
  label drawn as SVG `<text>` (a badge, a chart tick) measures as MISSING
  however right it looks — whatever the comp draws as DOM text must be DOM
  text in the impl to be matched at all.
- **Borders / radii** → `border` (width, color ΔE), `border-radius`. One
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
  border-box }` renders 46) in the chrome above or beside the anchors. Fix
  the sizes; the transform snaps to `scale 1, offset 0` and the note goes.

## Environment pre-flight (fill in per repo)

The repo's `refdiff.bindings.md` holds the specifics; these are the
failure shapes that recur everywhere and impersonate product bugs.

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
  to burn budget until it passes (`figma-rate-limited`).
- The unit of a design-system comparison is one variant COMPONENT ↔ one
  story cell (`--selector`), never the whole sheet.
