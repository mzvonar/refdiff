---
name: design-fix-loop
description: Close the gap between a design frame (Claude Design .dc.html or Figma) and its implementation (Storybook story or live page) with the visual-compare CLI in a bounded, measured loop — run compare → read findings.json (expected/actual first, crops second) → read open annotations → fix → re-run → read delta → mark notes implemented. Use whenever asked to "match the design", "fix design parity / design drift", "make the story match the comp", "run the visual-compare loop", or to verify a UI change against its design — and when asked to "set up visual-compare / design-fix-loop in dev mode", "install the visual-compare CLI", or the `visual-compare` command is missing on this machine (run setup-dev.sh). Never eyeball two screenshots; every claim is a number from findings.json.
---

# design-fix-loop — the bounded fix loop over visual-compare reports

This skill is THIN on purpose: the harness measures, you act. `visual-compare
compare` produces `findings.json` (typed, bbox-grounded, severity-ranked
findings with machine-readable `expected` / `actual`), a set-of-marks overlay,
per-finding crop pairs, both element trees, and — from the second run on — a
`delta` against the previous run plus a `resolved-ledger.json` that turns a
re-introduced finding into a loud `REGRESSION`. Your job is the loop
discipline: read → classify → fix → re-run → read the delta, at most five
times, and stop on diminishing returns.

## Repo bindings

This skill is a USER-level skill (symlinked from
`~/.claude-shared/skills/design-fix-loop` → the visual-compare checkout; both
profiles link it), so it is available in every project. Nothing of it lives
in a consuming repo — the repo only carries its manifest and a bindings file.
**Read the bindings first**; they are the source of truth for paths, ports,
seeds and gotchas:

```
<repo>/tools/design-compare/design-fix-loop.bindings.md          # uctoinak-bmad
<repo>/frontend/ds/tooling/visual/design-fix-loop.bindings.md    # population-registry
```

(`find . -name 'design-fix-loop.bindings.md' -not -path '*/node_modules/*'`
if the repo moved it.) A bindings file names: the manifest, the design dir /
Figma file, how the impl is served (Storybook dir or URL, live app + auth),
the run dir convention, and the repo's environment traps. If none exists,
stop and write one with the user before running anything.

The CLIs are on PATH via `pnpm link --global` from the visual-compare
checkout: `visual-compare` (core) and `visual-compare-annotator`. They run
from `dist` — keep `pnpm dev` (tsc --watch) running in that checkout while
developing, or `pnpm build` after pulling.

## Dev-mode setup (new machine / VM)

When the user asks to set the skill up in dev mode, or `visual-compare` is
not on PATH, run the bundled script — it is idempotent and touches no
consuming repo:

```bash
bash "$(dirname "$(readlink -f ~/.claude/skills/design-fix-loop/SKILL.md)")/setup-dev.sh" --watch
# options: --checkout <dir> (default ~/Development/visual-compare, cloned from
#          github.com/mzvonar/visual-compare if missing)  --no-browser  (skip Playwright Chromium)
```

It makes these true, then verifies (`visual-compare --help`, test count):
the checkout exists; deps + Playwright Chromium installed; both packages
built; `pnpm link --global` so `visual-compare` / `visual-compare-annotator`
resolve (it tells you the PATH line to add if pnpm's global bin is not on
PATH yet); the skill is user-level via `~/.claude-shared/skills/design-fix-loop`
→ the checkout, linked from every `~/.claude*/skills` profile that exists;
with `--watch`, `pnpm dev` runs in the background (`<checkout>/.dev.log`) so
edits to `packages/*/src` reach the linked CLIs without a manual build. Edits
to `SKILL.md` are live immediately (symlink). Needs Node ≥22, pnpm, git, and
network for the clone / Chromium download (in a sandboxed shell, run it with
the sandbox off). Then the repo you are in needs only its manifest and a
`design-fix-loop.bindings.md` — write the bindings with the user if absent.

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
3. **Separate data from drift before anything else.** Demo data in the comp
   (names, amounts, dates, which rows exist) differs from the story fixture /
   seed. Matched pairs with differing text are already suppressed as
   `data-slot`; unmatched rows show up as `missing-element` /
   `extra-element`. A data difference is fixed in the fixture or seed (make
   the story render the comp's data), or declared with `ignore.textPatterns`
   — never by touching component code.
4. **A comp frame can contradict its siblings — encode the axis, not the
   frame.** Before changing a shared token or rule because one comp says so,
   measure the other comps (`grep -o '#hex' design-dir/*.dc.html | wc -l`
   per file, or the other frames of the same component). If the comp you
   are comparing is the outlier, the implementation is right: record an
   `accepted` deviation with the evidence as its `reason`. If the siblings
   agree with it, fix the token.
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
visual-compare compare --manifest $MANIFEST --design-dir $DESIGN_DIR --pair <id> --storybook-dir $REPO --out $RUN_DIR
# or the explicit one-pair form (--design-file/--design-frame/--story, --figma …, --url …)
```

Read the console summary (`N findings (c critical, m major, k minor) covering
I instances, S suppressed`, `delta vs …: +introduced / −resolved`,
`verdict`). Then read `findings.json` — it is small; read the whole
`findings` array, in order (severity-sorted). For each finding note:
`id`, `type`, `severity`, `instances` (×N = one root cause, `members[]`
lists every place), `message`, `expected`, `actual`, `role`, the boxes
(impl CSS px, world space). Skim `suppressed` once per run so you know what
the policy is hiding and why.

### 2. Classify every finding — this is the whole skill

| class | how it looks | what you do |
|---|---|---|
| **data** | `missing-element` / `extra-element` on value-like text (names, amounts, dates, IDs, a row the comp's fixture has and yours lacks); `text-content` already under `suppressed: data-slot` | make the fixture / seed render the comp's data (or `ignore.textPatterns` for genuinely dynamic values) |
| **drift** | `color` (with ΔE2000), `typography` (family / size / weight / line-height), `size`, `position` (a shift; ×N with the same delta = one layout cause), `spacing` (sibling gap), `border`, `border-radius`, a `missing-element` that is a real UI element (icon, badge, button, label) | fix the code: token, class, layout; prefer the root cause of an aggregate over its members |
| **intended deviation** | the value is right for the product and the comp is the outlier (rule 4), or a documented decision (reordering, a11y, i18n) | add `accepted: [{ type, expected, actual, reason: "<evidence>" }]` to the pair's `ignore` (or `--accept`) — the reason must say why and cite the measurement |
| **environment** | `pixel-region` at `severity: minor` with no box ("alignment confidence < 0.5"), `still-loading`, fonts not loaded (every `typography` finding says the same fallback family), a viewport that clips | fix the capture (fonts in Storybook preview, `--viewport`, `--wait-for`, seeds), not the code |
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
`stale` notes lost their element: read them, do not guess.

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
- `regressions` (also printed as `REGRESSION: …`) — introduced findings that
  an EARLIER iteration had resolved. This is the loud failure: stop the
  plan, undo or fix that regression first, and count the iteration.
- A data-parity iteration (fixture now shares the comp's texts) moves the
  alignment offset, and position findings carry world coordinates — so that
  delta churns (`+47 / −48` while the count barely moves). Judge THAT
  iteration by the counts, the alignment confidence and the criticals; the
  delta and the ledger are trustworthy from the next iteration on.

Then mark the notes you acted on:

```bash
visual-compare-annotator $RUN_DIR --mark-implemented <id,…|all>     # open → implemented; the designer closes them as done
```

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
  here or in `pixel-region`.
- **Borders / radii** → `border` (width, color ΔE), `border-radius`.
- **Pixels** → `pixel-region` only inside matched boxes ≥ 16 px that are not
  text and not already reported; `actual.diffRatio`. `diff-mask.png` shows
  where. Runs only when alignment confidence ≥ 0.5 — a boxless minor note
  says it was skipped.
- **Alignment** → `alignment` in the report (`scale`, `offsetX/Y`,
  `confidence`). Confidence 0.00 means no unique shared text: everything
  positional is unreliable until the fixture shares text with the comp.

## Environment pre-flight (fill in per repo)

- Storybook: token / global-CSS edits may not HMR — restart before trusting
  a re-run; confirm a color via the `color` finding, not the screenshot.
- Live app: seeds present? auth working? A soft 404 compares "fine".
- Figma: `$FIGMA_TOKEN`; a 429 writes a cooldown record and the CLI refuses
  to burn budget until it passes (`figma-rate-limited`).
- The unit of a design-system comparison is one variant COMPONENT ↔ one
  story cell (`--selector`), never the whole sheet.
