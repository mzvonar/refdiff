# refdiff — Handoff: consumer findings from the first end-to-end RECONCILE run (2026-09-16, current)

Design-vs-implementation harness. Repo `/root/refdiff` on the devbox, branch **`main`**, pnpm
workspace, TypeScript/ESM, two packages (`@refdiff/core`, `@refdiff/annotator`).

**This is the canonical handoff for the CONSUMER-FINDINGS workstream** — four improvements found by
running `reconcile.md` end to end for the first time, from the consumer side, against the pair that
file was written against. It does not supersede anything: `handoff-2026-09-16.md` stays current for
the MATCHER workstream and `handoff-2026-09-04.md` for the ANNOTATOR redesign.

> **STATUS 2026-09-16 (later the same day): all four items are DONE and shipped as 1.3.0.** Both
> open questions are answered in the commits that raised them. **One thing remains**, and it is
> the only reason this file is still here: the `uctoinak2` half of item 1's re-baseline — 45 pairs
> across the `uctoinak2` and `uctoinak2-storybook` corpora — was NOT measured, because the devbox
> was at 2 GB available against 11 GB of swap with three sessions live and `dmesg` already holding
> an OOM kill of that exact `design-live` next-server. See "What's DONE" for the commits and
> "What REMAINS" for the one item. Everything below the status line is the original brief, kept
> because it is the reasoning each fix was built against.

## State of play

`reconcile.md` shipped in 1.2.0 carrying its own disclaimer — *"Run end to end: none"* — and asking
that the first real run revise it and name the pair. That run happened on 2026-09-16, in the
consumer repo `uctoinak2` (worktree `.claude/worktrees/messages-redesign`, branch
`messages-redesign`, uncommitted), on **`messages-accountant-desktop`** — the canonical witness in
R7's own table. The pair went reconcile → polish:

| signal | before | after |
| --- | --- | --- |
| phase | reconcile | polish |
| match rate | 0.51 | 0.80 |
| best axis fit | 0.50 | 0.86 |
| joint confidence | 0.07 | 0.62 |
| findings | 226 | 131 |
| criticals | 36 | 12 |

The workflow held up. What it exposed is four gaps in the TOOL, listed below in priority order. Item
1 is a measured blind spot in the structural channel and is the reason the session took as long as it
did; items 2–4 are ergonomics and determinism.

None of this is committed anywhere. The consumer-side product work it came out of is separate and
stays in `uctoinak2`.

## What's DONE

All four, on `main`, released as **1.3.0** (`.claude-plugin/plugin.json` and
`claude-skills-public`'s `marketplace.json` both moved — see "Env gotchas"):

| item | commit | what landed |
| --- | --- | --- |
| 1 | `d2f642c` | `line-height: normal` resolves to its used value at extraction — a hidden probe carrying the element's own font signature, cached, removed before the capture returns. The FIRST of the two candidate fixes: resolving the keyword keeps the check comparing two like values, where the box-height fallback adds a second comparison whose input is already under the size check's tolerance. Real-chromium test, verified red without it. |
| 1 | `88d410e` | the re-baseline, **separately** and to a NAMED file — both measurements fell on 2026-09-16, so regenerating the dated one would have destroyed the only before-picture. `baseline-matching-2026-09-16.md` is AMENDED with a pointer, not superseded. |
| 2 | `91806e4` | `refdiff drift <run-dir>` — pure `package/drift.ts` + a thin CLI wrapper. `--axis y\|x`, `--step`, `--top`, `--json`. |
| 3 | `9272c2a` | `CAPTURE_TIMEZONE` / `CAPTURE_LOCALE` pinned in `openPage` beside `FROZEN_CLOCK`, per-pair overridable with `timezoneId` / `locale` on the manifest entry. |
| 4 | `686fc82` | `reconcile.md` R7 + R6's carve-out + R5's clock clause + the stopping bound's kept `(unmeasured)` tag; `SKILL.md`'s stale "run end to end against none" fixed too. |
| — | `42d8cc6`, `claude-skills-public@7aeacaf` | the 1.3.0 release, both manifests. |

**The open questions are answered, in the commits that raised them.** Item 1's re-baseline lands
SEPARATELY and the old baseline is amended rather than superseded (above). Item 3's is "both": one
pinned default because no evidence favours any market, plus a per-pair override because the consumer
has a witness for one — and deliberately no CLI flag, since a run-wide override re-dates a whole set
at once, which is a re-baseline wearing a flag.

**Item 1's measured effect, on the 9 self-contained `refdiff` pairs:** 2233 → 2254 findings, ledger
+54 / −33, and **59 `typography` findings naming `line-height` where zero could before**. The −33 is
identity-key churn on existing typography findings, not findings going away. **Nothing in the
matching table moved on any pair** — that is the signature to expect, and a `matched` move would
have meant the fix did something it was not supposed to.

The run that produced these findings was a consumer session; its own write-up is
`uctoinak2:docs/lessons-inbox.md` (four entries dated 2026-09-16) and the two memories
`refdiff-reconcile-phase` / `messages-accountant-desktop-reconciled`.

## What REMAINS

**The `uctoinak2` half of item 1's re-baseline — 45 pairs, not measured.** The `refdiff` corpus (9
pairs) was re-measured and is in `baseline-matching-2026-09-16-lineheight.md`; the `uctoinak2` (31
route pairs) and `uctoinak2-storybook` (14 component pairs) corpora were skipped, and the generator
records that inside the document with each one's reason and refresh command rather than dropping
them, so their before-numbers are intact and labelled.

Why skipped, not deferred by preference: the devbox held 2 GB available against 11 GB of swap in
use, with three other sessions live, and `dmesg -T` already carries
`Killed process … next-server` against `svc-adhoc-design-live@uctoinak2-messages-redesign` from
2026-09-15 — the failure the baseline script's own comment says costs 31 pairs and the summary.

To finish, on a quiet box:

```bash
cd /root/refdiff
# 31 route pairs — the design-live server only
setsid nohup /tmp/claude-0/start-design-server.sh > tmp/design-server.log 2>&1 &   # :3200
DC_APP_URL=http://localhost:3200 node scripts/baseline-matching.ts --only uctoinak2 \
  --out docs/baseline-matching-2026-09-16-lineheight.md
# then STOP it before storybook — both on one box beside a capture browser is the OOM
svc down design-live && svc up storybook       # in the messages-redesign worktree
DC_STORYBOOK_URL=http://localhost:6007 node scripts/baseline-matching.ts --only uctoinak2-storybook \
  --out docs/baseline-matching-2026-09-16-lineheight.md
```

Expect the same shape as the `refdiff` corpus: minors up, criticals/majors flat, the matching table
untouched. A `matched` move on a uctoinak2 pair would be the finding. Writing to the same `--out`
merges each corpus into the one document; the hand-written preamble at its top is not regenerated,
so re-add it (or move it into the generator).

---

## The original brief (items 1–4, all now done — kept for the reasoning)

### 1. Line-height is compared, but essentially never on a `.dc.html` comp ← DO FIRST

**The defect.** `packages/core/src/adapters/extract.ts:283-284` drops the property when the computed
value is `normal`:

```ts
const lh = pxOrUndef(cs.lineHeight);
if (cs.lineHeight !== "normal" && lh !== undefined) style["lineHeight"] = lh;
```

and `packages/core/src/structural/checks.ts:370-378` requires it on BOTH sides before comparing
(`lineHeightTolerance: 1.5`, declared at `:25`, defaulted at `:61`). The comps are authored with CSS
`font:` shorthands, which compute to `normal`; an implementation on Tailwind emits explicit px. So
the check silently does not run.

**Measured**, over the four `messages-*` run dirs in the consumer (`out/*/elements.json`, text nodes
with a `style`):

| side | with `lineHeight` | without |
| --- | --- | --- |
| design | 11 | 191 |
| implementation | 194 | 0 |

The 11 are the comp's bubble text, where the author happened to write a ratio
(`font:400 13px/1.5 'Public Sans'`). Everything else is invisible to the channel.

**Why it matters, with the witness.** The consumer's thread-rail rows measured 93px against the
comp's 83 / 80 / 58 because every arbitrary Tailwind size (`text-[12.5px]`) inherited the page's 1.5
leading. **No finding named it.** The alignment fit absorbed it as `scaleY 1.10` over the whole page,
which reads as "the layouts disagree vertically". Deriving it by hand (§1a's undo-the-fit walk) took
the bulk of the session; fixing four line-heights took `best axis` 0.43 → 0.76 and flipped the pair
into `polish`.

**Two candidate fixes** — pick one, and say which in the commit:
- resolve `normal` to its used value at extraction (it is measurable, unlike `getComputedStyle`'s
  string), or
- when exactly one side carries the property, fall back to comparing the text node's own box height.

`extract.ts` serves `dc-html.ts`, `live-url.ts` and `storybook.ts`, so a fix reaches every DOM-sourced
pair at once. Figma is unaffected: `adapters/figma-tree.ts:317` sets `lineHeight` from the API
whenever `lineHeightUnit !== "INTRINSIC_%"`.

**DONE when** a comp authored with `font:` shorthand and an implementation whose leading differs by
more than the tolerance produces a `typography` finding naming line-height, with a test that goes red
without the fix — and the 52-pair corpus is re-baselined, since this ADDS findings.

### 2. Ship the `scaleY` drift walk as a subcommand ← DO SECOND

`skills/refdiff/polish.md` §1a already specifies the algorithm exactly: undo the fit
(`raw y = (y − offsetY) / scaleY`, and `elements.json` already stores design boxes in impl space),
pair design and impl by unique text, walk `impl.y − raw.y` down the page, and find the element where
it steps. The consumer hand-wrote that script — about 15 lines of node — and it is what located item 1.

**The precedent is the tool's own.** `byRegion` became part of the report after a loop hand-rolled
the same grouping twice in one session; polish.md says so in as many words. This is the next one, and
it is more mechanical than that one was, because the file already states the formula.

The CLI has three subcommands today — `compare`, `summary`, `accept` (`packages/core/src/cli.ts`
:1817-1828). Suggested shape: `refdiff drift <run-dir>` printing the sorted walk (raw y, impl y,
delta, text), or `--explain-scale` on `compare` when the fitted transform is not the identity.

**DONE when** the run dir alone is enough to name the offending element, with no ad-hoc script.

### 3. Pin the capture's timezone and locale the way the clock is pinned ← DO THIRD

`grep -rn "timezoneId\|locale:" packages/core/src/adapters/*.ts` returns **nothing**. The browser
context (`adapters/browser.ts:143`, `browser.newContext(options)`) inherits the host's zone, while
`openPage` (`:134`) deliberately freezes the clock (`FROZEN_CLOCK = 2026-09-15T12:00:00Z`, `:190`)
with a long comment about determinism. **Time is frozen for reproducibility; the zone that renders
that frozen instant is an accident of the machine.**

For any app that localises dates — the whole `uctoinak2` corpus — the captured zone is a measurement
parameter exactly as the viewport is. The consumer hit it from both directions: a fixture written in
the app's market zone (Europe/Bratislava) rendered two hours off the comp because Playwright ran in
UTC, and separately, moving a relative timestamp to server-side computation put it out of
`page.clock`'s reach entirely.

Suggested: pin `timezoneId` and `locale` on the context beside the clock, with the same reasoning in
the comment, and expose both per-pair on the manifest entry (`configuring.md`) for a pair whose comp
is drawn for another market.

**DONE when** two runs of the same pair on machines in different zones produce the same capture.

### 4. `reconcile.md` owes its R7 entry, and two of its steps need revising ← DO FOURTH

The file asks for this itself: *"When you revise this file, add the pair that forced it to this table
and say which step it changed."* `skills/refdiff/reconcile.md:240-243` still reads **"Run end to end:
none."**

- **R7 table + header.** `messages-accountant-desktop` is already the first row; it now has an
  end-to-end run. Record the numbers in "State of play" above.
- **R6's progress rule needs a carve-out.** It says progress is `matched` rising while both one-sided
  columns fall. The run that flipped this pair into `polish` did the opposite: match rate fell
  **0.81 → 0.74** while best axis rose **0.43 → 0.76**. An alignment fix re-pairs elements, so losing
  some is the expected shape of that specific fix — not a regression to argue away. R6's "unless you
  can argue it" covers it, but the file should name the shape.
- **R5 step 1 (Data) needs a clause on the harness's own clock.** It says to make the fixture render
  the comp's data and says nothing about `FROZEN_CLOCK` or the capture's zone. **Which side computes
  a relative time decides whether the frozen clock can reach it at all**: a client-side "now" obeys
  `page.clock`, a server-rendered one does not, and the fixture must anchor on whichever it is.
- **The stopping bound is still unmeasured.** "Three consecutive structural changes that do not move
  `matchRate` → stop" was never reached; every structural change moved it. Say so rather than
  dropping the `(unmeasured)` tag.

**Worth keeping, no action:** the `REGRESSION` line that distinguishes a re-pairing from a reverted
fix (*"the element's PARTNER changed, not the element"*) stopped the consumer chasing a phantom when
a comp element became honestly unpaired. It earned its place.

### Later / future reference

- **Token-disjoint `slot` pairs under the 5× area bound.** One mis-pairing at γ 218, area ratio 2.75×,
  sharing no token: design `"Bloček mám odfotený v mobile, nahrám ho poobede."` (300×14) paired with
  impl `"Žiadosť o doklad"` (102×15). §R3 already notes 22 of the 43 slot pairs it keeps carry
  token-disjoint texts. A single witness, and it resolved itself as the structure converged — so this
  is a candidate signal, not a defect. Do not spend a sweep on it without more labels.

### Needs research / open questions

- Item 1 adds findings across the corpus. Decide whether the re-baseline lands in the same commit as
  the fix or separately, and whether `baseline-matching-2026-09-16.md` is superseded or amended.
- Item 3: is a per-pair zone override actually wanted, or is one pinned zone for every capture the
  right answer? The consumer's comps are all one market, so this run gives no evidence either way.

## How to run

```bash
cd /root/refdiff
pnpm build                  # or `pnpm dev` (tsc --watch) while working — the CLI execs dist/
pnpm test
bash skills/refdiff/preflight.sh          # halts when dist is behind src

# Reproduce the consumer-side witness (a second checkout, separate branch):
cd /root/uctoinak2/.claude/worktrees/messages-redesign
setsid nohup /tmp/claude-0/start-design-server.sh > tmp/design-server.log 2>&1 &   # app on :3200
DATABASE_URL=postgresql://postgres:postgres@localhost:54330/uctoinak_designcompare \
  APP_ENV=test node tools/design-compare/seed-messages-fixtures.mjs
# RESTART the server after any seed — the thread-list read is cached and a stale cache
# renders an OLDER fixture with no error (cost two runs on 2026-09-16)
pnpm design:compare --pair messages-accountant-desktop
```

The consumer's run dirs (`out/<pair>/{findings,elements}.json`) are the evidence for items 1 and 4
and are git-ignored — re-capture rather than expecting them to be there.

## Key facts / decisions

- **The four items are independent.** Only item 1 changes measurements; 2 and 3 are additive, 4 is
  documentation. Item 1 first because it is the one costing consumers real time today.
- **The witness for item 1 is a class, not an instance.** 191 of 202 design text nodes in that corpus
  carry no line-height. This is not one comp's authoring habit; it is what a `font:` shorthand does.
- **`preflight.sh` was right and was skipped.** It states plainly that `server_freshness` checks the
  BUILD only and can say nothing about the DATA a running instance serves, and says to verify by
  content. Two compare runs measured a stale app cache. Nothing to fix in refdiff.
- The consumer product work that surfaced all this is `uctoinak2`'s accountant Messages desktop; see
  the memory `messages-accountant-desktop-reconciled` for what shipped there and what was
  deliberately left unbuilt.

## Env gotchas

- **A skill edit does not reach consumers until it is PUBLISHED.** `.claude-plugin/plugin.json`
  carries the version, and a matching entry must land in `claude-skills-public`'s `marketplace.json`.
  Claude Code keeps its cached copy until the catalog's version moves, so a stale skill is invisible
  by construction — see commit `f3830f9` ("the skill has been six files for a day and nobody received
  it") and the `gitCommitSha` drift lesson in `docs/lessons-inbox.md`. Item 4 is a skill edit and owes
  a version bump.
- Consumers read the skill from `~/.claude/plugins/cache/claude-skills-public/refdiff/<version>/`,
  which is read-only. Edit `skills/refdiff/` in this checkout; never the cache.
- The CLI wrappers exec `dist/cli.js`, so a `dist` behind `src` measures code you did not write and
  reports `+0/−0`. `preflight.sh` HALTS on it.
