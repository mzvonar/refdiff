# refdiff — Handoff: Library groups + gallery, CHUNK 5 PART-SHIPPED (2026-09-07)

**Workstream-scoped handoff, canonical and current.** Repo `~/development/refdiff` (Mato's
Mac: `~/Development/refdiff`), branch **`main`**, pnpm 10 workspace, TypeScript/ESM,
Node ≥22. Refreshed 2026-09-07 for a fresh context; every count in it was re-measured at
HEAD `a79e5a6` rather than carried over.

**CHUNK 5 IS PART-SHIPPED — the Library is the comp's six-column TABLE and both Library
Groups pairs are registered and measuring.** Mato's three fidelity gaps of 2026-09-07 are
addressed: the Sheet button is a COLUMN of one coherent row, the expanded sub-items are
per-cell sub-rows, and the rest of the six-column anatomy came with them. Four measured
iterations: **762 -> 572 -> 549 -> 548 findings, confidence 0.30 -> 0.50** on
`refdiff-library-groups-desktop`; the mobile half's first run is **487 / 0.77**.

**Mato answered all four of chunk 5's questions on 2026-09-07** (§ "What REMAINS" step 1).
The old Library pairs are **DISABLED, not deleted** — a new manifest key, `disabled: "<why>"`
(`b874e4a`), because they had gone from 18 / 16 findings at confidence 0.88 / 1.00 to
**489 / 335 at 0.14 / 0.67** against the card-grid comp the table replaced. Groups stay
**all-collapsed** with the deviation to be declared. `pairCard` and friends stay unwired for
now. **One answer needs re-asking**, because the measurement that framed the question was
wrong: § "What REMAINS" (c) carries the correction — the Measured span the fixture was
supposed to unlock is already implemented and drawn, and the real cause is ROW ORDER.

**This does NOT supersede `docs/handoff-2026-09-04.md`** — that one is the canonical repo
handoff for the annotator-redesign workstream (session 21, the mobile-toolbar pair). This
file covers only the Library-groups / gallery workstream, whose plan is
**`docs/plan-gallery-groups.md`** (read that second; it is the real brief, chunks 0–5).

## State of play

**Chunks 1, 2, 3 and 4 are SHIPPED; chunk 5 is PART-SHIPPED. TWENTY-EIGHT commits on `main`,
nothing pushed** (Mato has not asked). `4b57f12` was the workstream's base; the last CODE
commit is **`b874e4a`**, and HEAD is the docs commit carrying this file — which is why the
table below stops at `b874e4a` and cannot name its own sha.

| sha | what |
| --- | --- |
| `64237e0` | feat(annotator): group the Library by the entry its pair ids name — chunk 1 |
| `31e5c6c` | docs: the plan, its handoff, five lessons |
| `313191d` | feat(core): persist what a component set CONTAINS — chunk 2, the set index |
| `e49ab66` | docs: chunk 2 shipped, two lessons |
| `e1ec7fb` | chore(design): absorb the 2026-09-04 comp consolidation |
| `e70697f` | docs(plan): the Measured column is a per-group range; chunk 5 added |
| `0da4e0b` | docs: refresh the workstream handoff for a fresh context |
| `da58737` | feat(core): the manifest declares hierarchy and grid layout — chunk 4 |
| `3c7f4fe` | feat(annotator): carry the per-pair run ordinal into /api/pairs |
| `8b61940` | docs: chunk 4 shipped, the bindings debt named, three lessons |
| `679de13` | docs: point the handoff at chunk 3, mark the bindings debt paid |
| `4e2a76c` | fix(core): --pair accumulates, and a pair's dataSlots is no longer clobbered |
| `ddfea04` | feat(annotator): the variant sheet — cellOrigin, the layout, the resolver |
| `765eb59` | test(fixture): the demo root emits a variant set; Library pairs re-baseline |
| `48d2e23` | docs: chunk 3 part-shipped — the Gallery comp is a REBUILD, seven lessons |
| `8aa7ccb` | docs: the gallery chrome is NOT the tool's — option 2 refuted |
| `b6277c8` | feat(annotator): the Library group row opens its sheet |
| `e82f9e0` | feat(annotator): the sheet opens IN the comparison tool, not beside it |
| `34a7b4c` | feat(annotator): the sheet's rail groups by cause, not by finding |
| `18eccd1` | feat(annotator): the sheet's design pane, its axes, cells centred like the comp |
| `a79e5a6` | fix(annotator): a variant set is SPARSE — the cross-product is not the expectation |
| `cf27d95` | docs: point the handoff at chunk 5, the Library rebuild |
| `1b62208` | chore(design): the Library Groups comps on disk, icon subset 101 → 112 — chunk 5 prereqs |
| `90d0aba` | feat(annotator): the Library rebuilt as the comp's six-column table — chunk 5 |
| `4ee22b8` | docs: chunk 5 part-shipped — the table, four measured iterations, three open questions |
| `b874e4a` | feat(core): a manifest pair can be DISABLED — declared, deliberately not measured |

**695 tests green** (372 core + 323 annotator), typecheck and build clean, `icon-subset.mjs
--check` in sync at **112 glyphs**, `pair-coverage` green in all four directions with **ZERO
waivers** and **one** `unmeasured` comp (`RefDiff Library.dc.html`, both its pairs disabled),
**eleven** manifest pairs of which **nine are enabled**. Measured at HEAD, not inherited.


**Mato confirmed the Gallery comp SETTLED on 2026-09-04** (both comps byte-identical to the
committed copies, verified against the design project before asking). What is left: chunk 3's
open fork below, and chunk 5, the Library rebuild.

## What's DONE

- **CHUNK 5 — PART-SHIPPED: the Library is the comp's six-column table** (`1b62208`,
  `90d0aba`). Plan § "Chunk 5" carries the per-run table; this is the inventory.
  - **Both prerequisites done.** The two comps are on disk (fetched with DesignSync, and the
    fidelity argument is in `1b62208`'s message — they came back INLINE, so the
    decode-from-persisted route did not exist and a JSON-decode-plus-shared-region-diff was
    used instead), and the icon subset is at **112** glyphs, up from 101.
  - **The whole PURE layer survived, exactly as the plan predicted.** `entryIdOf`,
    `groupEntries`, `cellsShown`, `isFoldable`, `isFilterActive`, `openGroups`, `groupWhen`
    and the roll-up keep their contracts. `groupHeader`, `libraryList` and `groupSheetLink`
    went with the `.grp` / `.gcells` CSS.
  - **New and all metrics off run 1, never off the comp's source:** `groupRow`, `cellRow`,
    `libraryTable`, `moreRow`, `TABLE_HEAD`, `filterExplainer`, `groupRunSpan`,
    `staleCells`, `ROW_CAP`.
  - **The two renamed chips changed MEANING.** `Regressed` is `delta.regressions > 0` (a fix
    come undone), not the retired `Diverging`'s `introduced > resolved`. `Stale cells` is a
    per-GROUP run property, not the retired `Low confidence`'s alignment one — which is why
    `matchesFilter` now takes a third argument. Ordinals count PER PAIR, so a global newest
    would call all eleven `ds-button-icon` cells stale against a run they were never behind.
  - **The group row is a `div role="button"`.** `Open sheet` is one of the six COLUMNS and an
    anchor inside a button is invalid HTML; chunk 1's sibling-of-`.ghead` trick was right for
    a card grid and cannot work for a table row. The anchor is guarded in the click handler
    and Enter / Space are handled explicitly.
  - **A sub-row's name is its VARIANT PROPS**, joined from `<entryId>.set.json` by run dir and
    fetched LAZILY — only for a group the reader has opened, recorded on ATTEMPT so a root
    with no set index never re-fetches. Falls back to the pair id.
  - **Three fixes the loop found that reading the comp would not have.** `.lib` was
    `max-width:1180px` — the OLD comp's VIEWPORT, where a max-width never binds, so no pair
    had ever measured it; at 1240 it bound and displaced the whole page (content at x=46
    against 16, the card 1148 wide against 1208, every chip 7px left). The pair's `ignore`
    used `textPatterns` where the run itself printed *"7 suppressed finding(s) moved ≥8px — a
    rule is hiding geometry"* at up to 83.5px, so it is `dataSlots` now. And "1 cells" on
    every lone-item row.
  - **Two manifest corrections, both measured, both contradicting this handoff's own earlier
    text.** `refdiff-library-groups-mobile` needs NO `scope` (with one it failed
    `scope-not-found` and compared nothing — where the `data-screen-label` sits is what
    decides it, not whether the comp is a phone), and both OLD Library pairs waited on
    `#cards .card`, which chunk 5 deleted, so they failed `selector-not-found` until their
    `waitFor` named `.lrow` too.
  - **`icon-subset.mjs` no longer scans its own output.** It writes `src/icon-names.ts` into
    the directory it scans, so a false positive was self-sustaining and could not be removed
    by fixing its source. Found because a quoted ARIA role name in a comment added `table`
    and rephrasing the comment did not drop it. 113 → 112 on the exclusion.
  - **`.lcells` → `.lcount`**: it prefix-matched `.lcell` and defeated a
    `not.toContain('class="lcell')` assertion in this very session.

- **CHUNK 3 — SHIPPED: the sheet renders inside the comparison tool.** The plan's
  § "Chunk 3" CAUTION block is the finding that shaped it; this is the inventory. Residual
  convergence is § "What REMAINS" step 2.
  - **It is a REPORT, not a page.** `openReport` takes the sheet as a FOURTH argument —
    passed in rather than assigned around the call, so a pair opened after a sheet cannot
    inherit its cells. The topbar, Split/Full, Off/Wipe/Onion/Blink/Diff, the layer toggles,
    pan/zoom/fit/pinch, the annotation layer, the focus region and the rail all come free,
    because they were already expressed in ONE world space and a sheet is that space with a
    per-cell offset. `#view-gallery` (the first attempt's standalone page) survives only as
    the un-layoutable fallback.
  - **Cells live in a zero-size world-space container** (`.cellshots`, deliberately the
    same shape as `.vmarks`), so N images cost what one did: no per-image transform, ONE
    container transform in `applyView`, and existing pan/zoom moves them by construction.
  - **Findings project** with `projectCellBox`, ids NAMESPACED by cell (every report
    numbers from f1; 41 cells would collide), and a FRAME-LEVEL finding is left out of the
    boxes — `pixel-region/frame` fires on 194/194 DS pairs and its box IS the frame, so
    translated it paints its cell solid.
  - **The rail groups by CAUSE** (`causeGroups`, keyed `type|role|severity|expected|actual`
    — finer than `summary.json`'s groups on purpose: those carry no values and a sheet must
    tell two colour drifts apart). Clicking a cause lights every cell carrying it. Measured:
    1111 of 1163 impl-only elements were in the rail; it took them out.
  - **The design pane draws per-cell images through each cell's OWN alignment**
    (`report.design.width` already carries the run's scale, so the world size is that width
    verbatim and no natural size is needed). Consequence stated in code: the align-mode pill
    is a per-PAIR control and does not reach a sheet.
  - **Content is CENTRED in its track** as the comp centres it; `GalleryCell` carries
    `track` (the slot) beside `rect` (the content box). The minimum cell IS the comp's cell
    — 152 + 2×12 = 176 across, 72 + 24 = 96 down.
  - **A variant set is SPARSE** (`pruneToOccupied`, `a79e5a6`): the axes' cross-product is
    NOT the expectation. `ds-select-field` defines 196 combinations and has 64 children, so
    132 cells were reported as holes nobody drew. Absent went 132→6, 111→6, 132→0, 72→0,
    and `ds-alert` 9→1 — the case where the cross-product WAS the expectation, which is the
    check that this does not merely hide absence.
  - **Two core defects found and fixed** (`4e2a76c`): `--pair` repeated kept only the LAST
    id (`parseArgs`, non-`multiple`) so a run measured half of what you asked while looking
    healthy; and a pair's `ignore.dataSlots` had NEVER applied in any manifest — the CLI
    wrote an explicit `false` when no flag was passed and the run-wide policy merges LAST.
    `runWidePolicy` now omits a key nobody passed.
  - **`view-math.ts`**: `cellOrigin`, `galleryLayout`, `projectCellBox` /
    `unprojectCellBox`. Tracks are the max over the column and the row of BOTH sides; the
    extent is DECLARED by the axes, so a column whose every cell skipped keeps its track.
    **The pair view is ASSERTED to be the one-cell case at the origin** — that identity is
    what keeps one renderer honest for both, and the day it breaks every `annotations.md`
    written so far becomes unreadable.
  - **`gallery-view.ts`** (new, pure): `resolveGallery`, `galleryCells`, `markStale`,
    `runSpan`, `census`, `cellSeverity`, `isFrameLevel`, the markup.
  - **The resolver decision, chunk 3's open question, ANSWERED and graded** — reasoning in
    `resolveGallery`'s doc comment, which is where the next reader's instinct to soften it
    will meet it. `columns`/`rows` naming a property the set does not define is **FATAL**
    (no correct grid exists; a plausible one the declaration did not shape is the exact
    "looks finished" failure chunk 4 refused). An `order` option no cell carries, or a
    `labels` entry for something absent, is a **WARNING** shown on the page (membership
    belongs to the SET, not to a declaration ordering it). Partial pinning is not a
    warning. **No declaration at all → the axes' own order**, first property across — the
    common path, since most sets declare none.
  - **A `child-names` sheet WARNS that its order is traversal order**, silenced per
    property by pinning. That is what `variantAxes.source` was split in two for.
  - **FOUR cell kinds.** `pending` — listed under `pairs`, no readable report — is
    declared-and-not-measured, which is not `absent`. **A deliberate addition to the
    plan's three, flagged not folded.**
  - **`PairSummary.frame`** in `/api/pairs` (per-axis max of both sides, server-side).
    52/53 pairs carry it; the broken one correctly does not.
  - **The route `#/set/<entryId>`** + a third body class; a measured cell links to its pair.
  - **The fixture emits `ds-button`**: the Gallery comp's `CELLS` verbatim — 60 cells =
    **41 measured / 7 skipped / 12 absent**, 3 stale at r45, 1 regression. Pulled forward
    from chunk 5's prerequisite 1: a prerequisite belongs to whichever chunk the comp's
    SUBJECT is, and a sheet cannot be measured against a root with no set (the harness said
    so — `{"kind":"error-page"}`, exit 2, nothing compared).
  - **Three defects found on the way, each fixed with a guard** — `--pair` repeated kept
    only the last id; a pair's `dataSlots` had NEVER applied in any manifest (an explicit
    run-wide `false` merged last over it, so both `refdiff-compare-*` pairs had carried a
    rule since 2026-09-02 that was never in force); the embedded modules share ONE
    top-level scope, so `gallery-view`'s `escapeHtml` collided with `index-view`'s and took
    the whole app down while presenting as one pair's `selector-not-found`.
  - **Both Library pairs RE-BASELINED and PASSING** — desktop 18 findings / 1 unexplained /
    confidence 0.88, mobile 16 / 0 / 1.00, under two declared causes chunk 5 will remove.
    **SUPERSEDED at chunk 5**: those are the last numbers those two pairs had against a card
    grid. They now read 489 / 0.14 and 335 / 0.67 against the table, which is § "What
    REMAINS" (a) — the retirement question, not a regression.
- **CHUNK 1 — the Library groups by entry** (`64237e0`). All pure logic in
  `packages/annotator/src/index-view.ts`: `entryIdOf`, `groupEntries`, `cellsShown`,
  `isFoldable`, `isFilterActive`, `openGroups`, `groupWhen`, `groupHeader`, `libraryList`;
  `app-shell.ts` renders through them, holds `lib.opened` / `lib.closed`, toggles on
  `.ghead`, and styles `.grp` / `.gcells` to span the card grid. **The last sentence is
  chunk 1's shape and chunk 5 replaced it**: `groupHeader`, `libraryList`, `.ghead`, `.grp`
  and `.gcells` are all gone, the toggle resolves `.lrow[role="button"]`, and the pure names
  before them are the ones that survived. Kept as written because the MEASUREMENTS below are
  chunk 1's and were taken against that markup. Measured on the live
  194-pair DS payload: **194 → 14 groups**, 11 foldable + 3 one-cell entries as bare cards;
  collapsed markup **9,241 bytes / 11 headers / 3 images** against **244,735 / 194 cards /
  194 images** expanded. Both self-measured Library pairs `+0/−0`.
- **CHUNK 2 — core persists the set index** (`313191d`). Pure
  `packages/core/src/package/set-index.ts` (`buildSetIndex`, `setIndexFileName`) beside
  `summary.ts`; `variantAxes(set) → { source, properties }` in
  `adapters/figma-variants.ts` with `variantProperties` kept as a wrapper; the write inside
  `expandFigmaSet` in `packages/core/src/cli.ts`. Artifact:
  **`<out-root>/<entryId>.set.json`** — a flat FILE, one per entry, written AT the expansion.
  Verified hermetically against the two recorded real COMPONENT_SET fixtures, then live:
  every index reproduced its console `N variant pairs, M skipped` line, an unselected
  entry's file stayed byte-identical across a re-run, and a run whose every capture failed
  (exit 2) still wrote both indexes.
- **CHUNK 4 — the manifest declares hierarchy and grid layout** (this session). All in
  `packages/core/src/manifest.ts`: `readSectionPath`, `sectionSegments`, `readSections`,
  `readGallery`; `PairSpec` gains `section?` + `gallery?`, `ManifestParse` gains
  `sections: SectionMeta[]`, `ManifestError` gains `invalid-sections`, and
  `parseManifest(raw, sectionsRaw?)` takes the module's second export as a second ARGUMENT
  (one document, two ends — a caller able to validate one without the other eventually
  validates only one). `GalleryConfig` lives in `adapters/figma-variants.ts`, beside the axes
  its every field names. `sections` rows take a bare path string OR `{ path, label? }`, like
  `textPatterns`, and **array position IS the order** — no `order` field to disagree with it.
  Additive and measurement-neutral: both Library pairs re-measured **`+0/−0`**.
- **Chunk 4's decisions, because the reasons are the durable part.** Segments are TRIMMED
  (the comps draw `Actions / Button`, so untrimmed those are two groups rendering under one
  name) and an empty segment is REFUSED (`""`, `"/A"`, `"A/"`, `"A//B"` — each a typo whose
  only symptom is a blank row). Malformed **fails the manifest**, the opposite call from an
  `ignore` rule: a dropped `ignore` rule makes the run report MORE (loud), a dropped
  hierarchy field loses a label in silence while the library still draws. For `gallery`,
  an **unknown key and an empty `{}`** are both refused — that pair is the only thing between
  `{ colums: "State" }` and a sheet laid out on the consumer's default; falsified by removing
  each and watching the test go red. `gallery` **requires `design.variants`** (every field
  names a variant property). And `gallery` is **carried, never resolved**: the parser has no
  Figma node, so `columns: "Nonsense"` is shape-valid and travels VERBATIM to the consumer
  holding the axes — a test asserts exactly that non-repair.
- **`gallery` has a real consumer already: `SetIndex.gallery`.** It rides into
  `<out-root>/<entryId>.set.json` beside the `axes` it refers to, and the run prints it back
  (`axes from definitions, gallery columns=State rows=variant`) — so chunk 3 finds the axes,
  the pairs, the skips and the arrangement in one file.
- **`section` is validated and REPORTED, not persisted — read this before chunk 5.**
  `compare` prints `hierarchy: N sections declared, M/K entries placed` for a manifest that
  declares any, and nothing at all for one that does not (so no existing manifest's output
  moves). The out root does not carry the section tree, because the annotator never reads the
  manifest and the root-level artifact has to cover unplaced entries and pure grouping nodes
  as well as set entries — plus the subset-re-run MERGE hazard chunk 2 solved structurally
  with per-entry files, which a single root file does not. Its shape is chunk 5's decision.
- **`run` is in `/api/pairs`** (chunk 5 prerequisite 3, done). `PairSummary.run?: number` +
  one line in `packages/annotator/src/cli.ts`. Optional because `ComparisonReport.run` is —
  a dir written before runs were numbered has none, and the broken demo pair correctly shows
  the field ABSENT. Measured live on the 194-pair DS root: **194/194 carry it**, and the
  per-group spans reproduce the plan's table exactly (`ds-button-fill` r9→r10 with 2 stale,
  `ds-button-ghost` r6→r7 with 1, `ds-button-icon` eleven cells all r2). That last group is
  the proof the span must be PER GROUP: a global newest of r10 would mark all eleven stale.
- **The set index earned itself immediately.** `ds-chip` expands to **5 pairs / 63 skipped**
  out of **105 declared** combinations, with 2 run dirs in the Library; `ds-dialog-header`
  is 4 / 4 out of 16. Nothing had ever persisted those numbers.
- **The 2026-09-04 design consolidation absorbed** (`e1ec7fb`). `RefDiff Mobile
  Toolbar.dc.html` → `RefDiff Mobile.dc.html` (a RENAME, byte-identical apart from a caption
  linking to two deleted siblings, and that caption is outside the scoped phone node — both
  toolbar pairs re-measured `+0/−0`); `refdiff-compare-mobile-minimal` retired with
  `MINIMAL_IGNORE`; the `RefDiff Mobile.dc.html` waiver dropped from `pair-coverage.test.ts`
  because that NAME now holds a paired comp; both Gallery comps landed and waived; icon
  subset re-run **97 → 101** glyphs. `refdiff.bindings.md` carries the new inventory and the
  amended baseline table.
- **Two corrections landed where the stale text lived**: `refdiff.bindings.md`'s file
  inventory + baseline table, and `docs/plan-annotator-redesign.md`'s claim that the design
  project "is not reachable as a writable design-system project" — it is writable
  (`PROJECT_TYPE_PROJECT`, `canEdit: true`); `list_projects` merely filters to design-system
  projects.
- **Open questions 2 and 3 answered**, both on measured evidence rather than taste — see
  the plan's "Open questions".
- **Fifteen lessons captured today** (36 in the inbox) — `docs/lessons-inbox.md`, newest at
  top, per the standing `CLAUDE.md` instruction. The three from chunk 4: an EMPTY declaration
  block is what catches a misspelled key; trim path segments or two identical-looking rows are
  two nodes; "validated" is not "wired" — a parsed field with no consumer is the same defect
  as a dropped one.

## What REMAINS (in order)

### 0. CROSS-REPO — the bindings debt is PAID; three follow-ups remain THERE

**Done 2026-09-04, same day, from a session in `population-registry`.**
`frontend/ds/tooling/visual/refdiff.bindings.md` was rewritten (161 → 279 lines) and now
carries the command behind every count: **14 manifest entries · 12 distinct Figma nodes ·
194 run dirs · 194/0/194 · 1071 findings · 64 cause groups**, plus a "manifest shape" row
documenting `section` / `sections` / `gallery` as available and deliberately unused there.
Five corrections landed (`3 entries` → 14; `11 entries, 152 pairs` → 14/194; "three
reconciliation items" → five; checkbox `6 of 30` → 45; the three `dialog` starters moved out
of the not-paired table because they ARE paired now). **That file is still UNTRACKED in
`population-registry` and was not committed** — the tree there is mid-work on
`feat/ds-token-press-3-re-export`.

**Nothing here blocks on it.** Three follow-ups stay on the population-registry side, and
two of them want the same run:

1. ~~**A full `refdiff compare` over the DS manifest**~~ — **DONE 2026-09-04.** Storybook
   on :6008 (restarted first — it predated the working-tree edits), `.figma-token` symlink
   at the repo root picked up automatically. All **14 `<entryId>.set.json`** exist. The
   re-run reproduced the previous baseline exactly — **1071 findings, `delta +0 / −0`** — so
   refdiff's changes since 2026-09-02 moved no DS number. Census: **216 declared · 194
   measured · 22 NOT measured · 281 skipped · 653 absent**, and the 22 are 19
   `ds-button-icon` + 3 `ds-chip`, every one a **`figma-low-quality` DESIGN capture
   failure** — which finally explains the discrepancy the bindings could not
   (`ds-chip` "5 pairs, 2 run dirs"). **Galleries are declared** on the nine set entries
   whose story tags its own grid `data-col="{State}"`. Both `refdiff.manifest.mjs` and
   `refdiff.bindings.md` in `population-registry` are **edited and UNCOMMITTED** — that
   repo's rule is every commit is user-confirmed.
2. **Regenerate `figma-inventory.md`** (needs a live Figma sweep). Its `already paired | 10`
   predates the `ds-dialog-starter-*` entries; the reconciliation is verified exactly —
   10 nodes marked `**man**` + chip (unstarred, item 1) + `36940:4414` (marked `—`, added
   after the 2026-09-01 sweep in response to item 3) = the manifest's 12.
3. **`menu/gallery` is unpaired and was MISSING from the not-paired table entirely** —
   `24008:27391` (`*Dropdown/items`), `storiesReady: true`, story `ds-menu--gallery`, in
   neither the manifest nor any row. An omission, not a decision; it is the
   pair-per-comp-gap class, which reports itself nowhere. Probe the node and the story's
   tagging before assuming it belongs in the untagged row.

### 1. CHUNK 5's three OPEN QUESTIONS — all three are Mato's call ← ASK FIRST

None of these is a defect and none blocks the other work. All three were reached by
measurement, and each one changes what "converged" means for this pair, so guessing at them
would waste the loop's remaining iterations.

**(a) Do the two OLD Library pairs retire?** — **ANSWERED 2026-09-07: DISABLED, not deleted.**
Mato's answer was a better option than the three offered, and it is now a manifest feature:
`disabled: "<why>"` (`b874e4a`). The pairs and the comp stay declared, nothing runs them, and
re-enabling is deleting one key. The reason is REQUIRED and `disabled: true` is refused,
because a pair silently not running is the worst failure this tool has. `compare` prints
`skipping <id>: disabled — <reason>` on every run, and `pairCoverage` gained an `unmeasured`
bucket asserted EXACTLY against `DISABLED_COMPS` — a disabled pair satisfies "the design is
declared" while failing "the pair is measured", and keeping those apart is the whole reason
that guard exists.
The numbers behind it: `refdiff-library-desktop` went **18 → 489 findings, confidence
0.88 → 0.14**; `refdiff-library-mobile` **16 → 335, 1.00 → 0.67**.

**(b) Do groups open by default?** The comp opens TWO (`button` and `foundations`); chunk 1
chose always-collapsed, and the plan's open question 3 answered it that way with reasoning
that still holds — *"revisit only if chunk 0's comp draws it otherwise"*. **The comp draws it
otherwise, so that trigger has fired.** This is the largest single remaining cause: of 297
`missing-element` findings on run 4, **280 sit below the first group row**, and they are the
content of an expanded group plus the sets the fixture does not have (`Compare` ×10,
`chevron_right` ×21, `Primary · sm · Active`, `REGRESSION`, per-cell `r45`/`history`). A
principled version of the comp's behaviour would be "the first group is open", not "the one
called button" — predictable, and not the tuned number the plan objected to.
**ANSWERED 2026-09-07: keep all-collapsed, and DECLARE the deviation.** Chunk 1's answer
stands. The declaration itself is NOT yet written, and deliberately so — see the correction
under (c): the collapse findings and the fixture-shape findings sit in the same region of the
comp and cannot be separated by any region or text rule against today's fixture, so declaring
one now would mis-attribute the other's findings. The skill is explicit that an `explain`
rule's `types` is "the safety: name only what the cause can physically produce", and a region
rule does not lapse. The declaration lands WITH (c).

**(c) Does `fixtures/make-demo-root.ts` grow to the comp's shape?** Mato said yes, to the
comp's FULL shape. **NOT DONE, and the question needs re-answering, because the measurement
that framed it was wrong. This paragraph corrects a false claim an earlier revision of this
very file made.**

The false claim was: *"no group in the fixture mixes runs, so the app correctly draws the
single-`r<n>` shape instead"*, offered as the reason the Measured column's span shape reports
missing. **It is not true.** The fixture has carried mixed vintages since chunk 3
(`SET_STALE`, `SET_OLD = 45`, `SET_NEWEST = 47`) and the app DRAWS the span correctly —
measured in run 6's `elements.json`: `history`, `r45`, `arrow_right_alt`, `r47` and
`yesterday · 3 stale` are all present on the impl side, at **y=841**. The comp draws its span
at **y=201**. The whole difference is ROW ORDER: the comp's first row is `Button`, a set,
while the app sorts newest-run-first (`sortEntries`) and puts `ds-button` twelve rows down
behind the lone items. `3 stale` against the comp's `8 stale` is honest fixture data, and the
app's 3 matches its own `SET_STALE`.

Two consequences, and together they shrink what growing the fixture buys:

1. **The biggest item cited for growing it was already built.** The span shape needs no
   fixture change at all — it needs the ROWS to line up.
2. **The lone items can never leave.** `onboarding-document-step` and its eleven siblings are
   the run dirs the `refdiff-compare-*` pairs capture through `COMPARE_ROUTE`; deleting them
   breaks four other pairs. The comp draws no lone items, so **~12 rows will mismatch
   whatever the fixture does** — which is the same shape as the declared cause the old pairs
   already carried ("root holds 53 pairs, the comp's demo 12").

So the useful version of (c) is not "13 sets" but **"can the app's row ORDER be made to match
the comp's, and are the lone items declared or hidden"** — and that is a design question about
the Library, not a fixture chore. The fixture generator is also written around ONE set
(`SET_ENTRY`, `SET_TONES`, `setCells`, `setIndexJson`, all exported and depended on by tests),
so generalising it to thirteen is a chunk in itself; the plan sized prerequisite 4 that way
too. **Proposed and stopped here**, per the repo's rule that a settled decision may be
amended by a measurement that was not available when it was made, and that the agent proposes
rather than proceeds. Cost of the growth is not the blocker — the fixture is 464 KB and a
variant dir is a 2.4 KB `findings.json` with no PNG, so 194 cells is ~470 KB.

**The sub-rows and the props join are VERIFIED IN A BROWSER, not only unit-tested.** The
Library renders collapsed, so `cellRow` and the lazy `<entryId>.set.json` join never ran in
the measured pairs — the "validated is not wired" gap. A throwaway probe pair (app `steps`
clicking `.lrow[data-group="ds-button"]`, then capture) closed it: **10 variant-props names
rendered as `Danger · lg · Default`**, 10 `Compare` cells, 10 cell thumbnails at exactly
34×24, 28 verdict dots at 8×8, one `expand_more` caret and `Show 31 more` (41 cells − the
10-row cap). Impl leaf elements went 270 → 363.

**And that probe measured what decision (b) is worth**, which is the number the deferred
declaration should be re-read against: expanding ONE group moved **matched 182 → 237** and
**design-only 305 → 250**. So the all-collapsed default costs ~55 matched elements on this
fixture, out of 487 design leaves. Worth knowing before declaring it away — and worth
re-measuring after (c), because the same probe is two lines of manifest.

**What is deliberately left RED, and should stay that way for now:** the section `path` line
(`Actions / Button`) and the hierarchy-only row with its `folder` children. Chunk 4 shipped
the manifest half of `section`; the ROOT-LEVEL artifact that carries the tree into the out
root is prerequisite 5 and its shape is still this chunk's decision. The plan says to ship the
table without the path line first, and a real unbuilt feature is not somebody else's cause —
so it is reported rather than declared away. The topbar's `Design system · run 47` is the
opposite case and is a genuine design ask: run ordinals are per pair, so the app has no
root-level run identity to print.

**The residual, for whoever picks the loop back up.** Confidence reached the 0.5 gate exactly
on run 3, so the pixel channel now runs (3.30% unexplained frame remainder); run 6 re-measured
**549 findings at 0.50, `+0 / −0`** after the `disabled` work, so that is the settled baseline.
The desktop pair's next lever WAS row order — and row order has since changed, which settles
part of it. The Library now sorts ALPHABETICALLY (repo owner, 2026-09-07) and drops a shared
id prefix. Measured: desktop **549 → 552 findings, confidence 0.50 → 0.56**; mobile
**487 → 503, 0.77 → 0.85** (x 1.00). So alignment got BETTER on both and neither converged,
which is the expected result: the comp's own order is its fixture's DECLARATION order
(`button`, `checkbox`, `textfield`, `radio`, `select`, `switch`, `foundations`, …) — neither
alphabetical nor by recency nor by size. Nothing the app can derive from a run root
reproduces it; only chunk 4's `sections`, once prerequisite 5 persists the tree, could. **So
the remaining row-order gap is (c) plus prerequisite 5, not a sort the app can choose.** **The mobile half at 0.77 is the healthier of the
two and has had exactly one run — it has never been iterated at all, and it is the cheapest
place to spend the next iteration.**

### 2. CHUNK 3's residual convergence — the sheet against its comp

Shipped and working; not converged. Five measured iterations, stopped on the loop's own
bound:

| iteration | change | findings | conf |
| --- | --- | --- | --- |
| baseline | the standalone stub | 777 | **0.00** |
| 1 | cells in the panes | 1842 | 0.61 |
| 2 | rail groups by cause | 697 | 0.40 |
| 3 | design pane + axes | 730 | 0.40 |
| 4 | the comp's cell metric | 678 | 0.40 |
| 5 | content centred in its track | **627** | 0.40 |

Criticals went 245 → 97; impl-only elements 1163 → 92; the app draws 499 leaves against the
comp's 648.

**The structural finding, which decides where to work next.** Confidence sat at 0.40
(x 0.71 / y 0.40) through all five, and two geometry hypotheses failed to move it. The
anchor diagnostic (§1a: intersect the unique texts in `elements.json`) explains why:
**46 anchors, and NOT ONE comes from the grid.** They are all chrome and rail — `DESIGN`,
`IMPLEMENTATION`, `Off`/`Onion`/`Blink`/`Diff`, and from the causes rail `36 cells`,
`15 cells`, `Oswald 500`, `Montserrat 700`, `#4F46E5`, `0 16px`, which match the comp's rows
exactly and are the strongest confirmation that rail is right. **A cross-product's labels
REPEAT by construction** (Primary heads three rows, `sm` heads four) and only text unique on
both sides can anchor, so **a sheet's grid can never supply anchors**. A gallery pair's
confidence is decided entirely by its chrome and rail, and y 0.40 is their VERTICAL metrics.
That is the next lever, and it is fine-tuning rather than structure.

**One cheap win the same diagnostic found, and it is on the FIXTURE not the app:** the
one-off causes ship with empty expected/actual (`fixtures/make-demo-root.ts`,
`{ ...cell.oneoff, expected: {}, actual: {} }`) while the comp shows `1px → 2px`,
`0.45 → 0.38`, `6px → 4px`. Six anchors left on the table by fixture data.

**Also open on mobile:** the sheet has no mobile treatment. It renders and scrolls inside
its own container at 390px with no page-level horizontal scroll, but there is no fit, no
zoom and no phone layout. `RefDiff Gallery Mobile.dc.html` IS that design and it is unbuilt
(426 findings, confidence 0.00, `x 0.67 / y 0.06` — 311 comp leaves against the app's 87).

**And `#view-gallery` survives only as the un-layoutable fallback** (a root with no set
index, or a `gallery` naming a property the set lacks). Worth deleting once the sheet is
trusted; its CSS and section are dead weight otherwise.

### One quick win left, independent of the design

*(`run` in `/api/pairs` was the other one — done this session, see What's DONE.)*

- **The DS coverage census.** One `--pair` list over all 14 entries writes 14
  `.set.json` files and gives the programme its first real coverage numbers. Run it with
  **Storybook up** so the captures succeed and the reports refresh in the same pass;
  point `--out` at the DS root only when you mean to refresh it.

### Chunk 0 — Mato's, not a session's — **ALL FOUR COMPS NOW ON DISK AND PAIRED**
All four comps exist (Library Groups + Gallery, each with a mobile half) and all four are
registered as pairs since chunk 5. Frames and previews are tabulated in the plan's chunk 0
section — but **the plan's `scope` column is wrong for `RefDiff Library Groups Mobile`**: it
needs none, because its `data-screen-label` sits ON the `.cc-theme-dark` phone node rather
than on an outer showcase node, so the frame already IS the phone. The Gallery Mobile and
RefDiff Mobile comps do need theirs. One grep settles it for any new phone comp — check
whether the screen-label tag also carries the class — and getting it wrong costs a capture,
not a wrong number (`scope-not-found`, exit 2, nothing compared).

The two Library Groups comps were deliberately NOT on disk until 2026-09-07 because
`get_file` returned them INLINE rather than persisting them, and a reference comp is never
hand-transcribed. `1b62208`'s message carries the route that was used instead and the
cross-checks that make it evidence rather than a hope; the lessons inbox has the general
form. **The persist-to-disk route remains the default whenever it is available.**

### Needs research / open questions
1. **Set-level notes** (a note owned by no single cell): allow with a set-level file, or
   forbid? Chunk 3's question, not a blocker for anything shipped. Plan's recommendation
   stands — allow it, because forcing the note onto an arbitrary cell is a lie about where
   the problem is.
2. ~~Set index location~~ — **ANSWERED**: the flat `<root>/<entryId>.set.json`, decided on
   measured walker behaviour. Plan § "Chunk 2".
3. ~~Chunk 1's collapse threshold~~ — **ANSWERED**: always collapsed, no threshold, two
   structural carve-outs. Plan § "Open questions" and `openGroups`' doc comment.

## How to run

```bash
cd ~/development/refdiff
pnpm build                      # or: pnpm dev  (tsc --watch; the CLIs exec dist/)
pnpm -r test                    # 666 tests (364 core + 302 annotator)
pnpm typecheck

# FIRST, before the first compare of a session — halts on a stale build/server
bash skills/refdiff/preflight.sh --port <annotator port>

# the annotator's own self-measurement (dogfooding — how UI work is verified here).
# Serve the COMMITTED fixture root, measure into out/refdiff, restore the clock after.
refdiff-annotator fixtures/demo-root --serve --read-only --port 7379 &
node fixtures/make-demo-root.ts --now        # fixture clock = wall clock, for the measure
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff --pair refdiff-library-groups-desktop
refdiff summary out/refdiff

# chunk 5: all four Library pairs. The two `-groups-` ones measure the TABLE against its own
# comp; the two without measure it against the card-grid comp it replaced (open question (a)).
# One pair per invocation — the `===` header count is the only place a dropped id shows.
for p in refdiff-library-groups-desktop refdiff-library-groups-mobile \
         refdiff-library-desktop refdiff-library-mobile; do
  refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
    --app-url http://127.0.0.1:7379 --out out/refdiff --pair "$p" > /tmp/run-$p.log 2>&1
done
node fixtures/make-demo-root.ts              # ALWAYS restore before committing

# chunk 3: the sheet. --pair takes several EITHER WAY since this session (comma or
# repeated); before that the repeated form silently kept only the LAST id, so two runs
# measured one pair while the log looked healthy. Check the `===` header count.
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff \
  --pair refdiff-gallery-desktop,refdiff-gallery-mobile

# the sheet in a browser: the fixture's set is `ds-button` (41 measured / 7 skipped /
# 12 absent). The flat `button` dir is the Library comp's card and is NOT the set.
#   http://127.0.0.1:7379/#/set/ds-button

# chunk 4: exercise the manifest parse with NO capture — --pair names nothing runnable, so
# loadManifest runs, prints `hierarchy: N sections declared, M/K entries placed`, and the
# CLI then exits 2 on "no runnable pairs selected". Cheapest end-to-end check there is.
refdiff compare --manifest /tmp/probe.manifest.mjs --pair nope --out /tmp/probe-out

# after any comp refetch — a glyph missing from the subset renders as its NAME
node packages/annotator/scripts/icon-subset.mjs --check   # exit 1 = out of date
node packages/annotator/scripts/icon-subset.mjs           # writes face + icon-names.ts

# look at the Library and the SHEETS against the real 194-pair DS root. --host 0.0.0.0 to
# reach it off the box (this VM is 10.11.63.63). The DS root now HAS its 14 set indexes, so
# every group's Sheet button works: e.g. #/set/ds-button-fill (41 measured / 1 skipped /
# 6 absent), #/set/ds-checkbox (45/27/0), #/set/ds-text-field (6/51/6 — mostly skipped
# because the DS manifest's `only:` filter measures 6 of 57 variants ON PURPOSE).
refdiff-annotator ~/development/ds/repos/population-registry/out/refdiff \
  --serve --read-only --host 0.0.0.0 --port 7380
```

## Key facts / decisions

- **The Library sorts ALPHABETICALLY, and drops a prefix every row shares.** Both are the
  repo owner's calls (2026-09-07). The sort replaced "the order the first cell arrived",
  which with `sortEntries` feeding it meant newest-run-first — good for a list of runs, bad
  for a library a reader scans; the `Measured` column is how the recent one is found now.
  The prefix rule is `commonIdPrefix`: ONE `-`-delimited segment, stripped only when EVERY
  group shares it. That condition is what makes it safe rather than convenient — removing one
  common prefix from unique ids cannot produce a collision, whereas a hardcoded `ds-` strip
  would draw TWO rows called `button` on the demo root, which holds both `button` and
  `ds-button` deliberately. The demo root is heterogeneous, so nothing is stripped there and
  the measured pairs only ever exercise the SORT; the strip is covered by unit tests and by a
  DS-root probe (14 rows reading `alert` … `text-field`, alphabetical, unique).
  **Display only** — `#/set/<entryId>`, `data-group` and the set-index fetch keep the real id,
  verified by a probe whose click selector is `.lrow[data-group="ds-button-fill"]` and whose
  expanded rows still carry the real props (`Active · left · success`).
- **A pair can be DISABLED, and the reason is mandatory.** `disabled: "<why>"` on a manifest
  entry keeps the declaration and the comp's linkage while running nothing; `disabled: true`
  is REFUSED, naming the entry, because a pair silently not running is the failure that
  reports itself nowhere. It diverts into `ManifestParse.skipped`, so `compare` prints
  `skipping <id>: disabled — <reason>` every run, and naming only disabled ids in `--pair`
  exits 2. `pairCoverage`'s `unmeasured` bucket is where such a comp shows up — asserted
  exactly against `DISABLED_COMPS` in `pair-coverage.test.ts`, so disabling or re-enabling is
  a deliberate edit. Re-enabling is deleting one key.
- **The gallery is composed, never re-compared.** A whole-sheet compare would put one
  alignment fit across 41 cells and the `pixel-region/frame` noise (firing 194/194 on the DS
  today) would swallow every real finding. The unit stays one variant component ↔ one story
  cell.
- **`view-math.ts` is the entire seam.** One world space (impl CSS px), `View { z, tx, ty }`,
  `screen = world · z + t`. A gallery is `pairWorld + cellOrigin`; the pair view is the
  degenerate one-cell case.
- **Notes: authored from either view, stored against the PAIR** in that pair's world
  coordinates. Composite coordinates would drift the moment a cell resizes.
- **The set index is what makes ABSENCE expressible** — `<out-root>/<entryId>.set.json`
  carries `axes { source, properties }`, every pair (`slug`, `dir`, `props`) and every
  skipped cell (`reason`, `props`). A run root can only ever show what was measured.
- **`variantAxes(set).source` is load-bearing.** Option ORDER is the designer's on the
  `definitions` branch only; the child-names fallback is TRAVERSAL order, and on the real
  Button/Fill set the two disagree about `State`. Never claim the designer's order without
  reading `source`.
- **The comp's `r45 → r47` is a per-group RANGE, not a global run number.** `min`/`max` over
  that group's own cells; `ComparisonReport.run` is the per-pair ordinal, every report
  carries it, and since this session `/api/pairs` does too. **Re-measured through the
  payload, not inherited** (194/194 pairs carry `run`): `ds-button-fill` r9→r10 (2 stale),
  `ds-button-ghost` r6→r7 (1 stale), and every other group single-valued —
  `ds-checkbox` r3, `ds-alert` r4, `ds-button-icon` r2, `ds-dialog-starter-md` r8.
  **Do NOT implement the comp's module-level `NEWEST`**: ordinals count per pair and differ
  wildly between groups (r2 … r10), so a global newest would mark all eleven
  `ds-button-icon` cells stale against a run they were never behind.
- **Chunk 4's `gallery` is a DECLARATION and nothing resolves it yet.** `SetIndex.gallery`
  carries `columns` / `rows` / `order` / `labels` verbatim; `columns` may name a property
  `axes.properties` does not have, and `order` an option no cell carries. **Chunk 3 owns the
  resolution and the decision about what a name that misses means** (fall back, or fail the
  sheet). The set index is where to read the declaration; there is no resolver.
- **Column labels need no heuristic.** `variantProperties(set)` returns
  `Record<property, options[]>` from Figma's own `componentPropertyDefinitions.variantOptions`.
  The old `population-registry` annotator's positional heuristic
  (`capture-assets.mjs:139-175`, column centres as image fractions) exists only because it
  captures one bitmap of the whole grid. **Do not port it.**
- **`summary.json` already carries the roll-up** — `runs[]`, `groups[]` (64 causes, each
  with its `pairs[]` — a free "light up the cells with this cause" affordance), `totals`.
  Do not recompute it. Its root key `groups` means *cause* groups; chunk 4 uses `sections`
  for hierarchy to avoid the collision.
- **`/api/pairs`** → `{ root, pairs: [{ dir, pair, pass, critical, major, minor, findings,
  suppressed, confidence, createdAt, `run?`, `frame?`, designSource, implSource, implRef,
  implPng, delta, openNotes, notes }] }` — `run` landed 2026-09-04 and **`frame`** with
  chunk 3 (the per-axis MAX of the two sides, taken server-side where both are known;
  52/53 fixture pairs carry it and the broken one correctly does not). Cell size lived only
  inside each pair's `findings.json`, and a 41-cell sheet cannot fetch 41 reports before it
  can lay itself out. Still **no variant props and no group**, which is what chunk 5's
  expanded rows need next (`props` is in `<entryId>.set.json`, keyed by the run dir, so the
  join exists).
- **A pair's `ignore.dataSlots` only started applying on 2026-09-04.** The CLI wrote an
  explicit `dataSlots: false` when neither `--data-slots` nor `--data-slot-text` was passed,
  `mergePolicies` is last-wins on that key, and the run-wide policy merges LAST — so every
  manifest's declaration was overridden by a default nobody asked for. Both
  `refdiff-compare-*` pairs had carried `{ patterns: ["Run \\d+ vs \\d+"] }` since
  2026-09-02 and recorded `dataSlots: false` in their reports throughout. **Read
  `findings.json`'s own `policy` block, not the manifest, when a rule "does not fire"** —
  it is what the run actually used. `runWidePolicy` now omits a key nobody passed.
- **A set run's completeness is not observable from its reports.** A failed capture writes no
  `findings.json`, so the stale one survives and any check scanning those files for an error
  is blind; `refdiff summary` counts every dir under the root, orphans included. Chunk 1's
  `createdAt` span and chunk 3's per-cell staleness are the same defect surfaced in the UI.

## Env gotchas

- **`CLAUDE.md` — do not commit unless asked.** Also the HARD RULE: any behaviour or usage
  change updates `skills/refdiff/SKILL.md` in the SAME change, and
  `grep -n "<term>" skills/ packages/ docs/` must come back clean.
- **Standing instruction:** durable lessons go to `docs/lessons-inbox.md` the moment they are
  noticed (newest at top, under the `<!-- LESSONS-LOG -->` marker).
- **`dist` is what runs.** The CLIs exec `packages/*/dist/cli.js`; a stale dist measures code
  you did not write and reports `+0/−0`. Keep `pnpm dev` running, or `pnpm build`.
- **The served annotator renders its page shell at process START** — restart it after a
  rebuild or it serves the old build however fresh dist is. `preflight.sh --port` catches it.
  A `+0/−0` is only evidence once you have a POSITIVE CONTROL that the served page carries
  the new code (`curl -s <url> | grep -c "<new symbol>"`).
- **The embedded modules share ONE top-level scope.** `app-shell.ts` concatenates seven
  modules into a single `<script type="module">`, so a name declared in two of them —
  **exported or not** — is a `SyntaxError` that takes the whole app down. Typecheck, the
  unit tests and the build all pass, because each module is valid alone; it surfaces as a
  refdiff **capture error** (`{"kind":"selector-not-found"}`) on whichever pair runs, which
  reads like a wrong selector. `gallery-view.ts` has `gEscape` for that reason, and
  `packages/annotator/test/embedded-modules.test.ts` guards the class.
- **Do NOT stop one annotator with a `kill` matched on `annotator/dist/cli.js`.** That
  pattern matches EVERY instance, so restarting the fixture server on 7379 silently killed
  the DS server on 7380 — four times in one session, and it was reported as running each
  time because nobody re-checked. Match the PORT:
  `ps -eo pid,args | grep -F "port 7380" | grep -F annotator/dist/cli.js | grep -v grep`.
- **A class name can also collide by PREFIX, and a test assertion is where it bites.** Chunk
  5 shipped a group's cell-count column as `.lcount` only after `.lcells` defeated a
  `expect(html).not.toContain('class="lcell')` assertion — the substring matched
  `class="lcells mono"`, so a test written to prove "no sub-rows are drawn while collapsed"
  passed for the wrong reason on one branch and failed noisily on another. A future
  `grep -n '\.lcell'` would read the same way. **When two classes in one view share a prefix,
  rename one; assert on the closing quote (`class="lcell"`) either way.**
- **The embedded modules' shared scope catches you on ORDINARY names.** Chunk 5 nearly named
  a new pure helper `runSpan`, which `gallery-view.ts` already exports — same concatenated
  `<script type="module">`, so it would have been a `SyntaxError` presenting as a capture
  error on whichever pair ran first. Renamed `groupRunSpan`. **Before adding any top-level
  name to an embedded module, grep the other six for it**; the guard test covers the class but
  cannot pre-empt a name you have not written yet.
- **A CSS CLASS NAME can collide across the two views, and no guard sees it.** The sheet's
  cause rows shipped as `.crow`, which is the LIBRARY CARD's row class (`index-view.ts`
  draws `crow name-row`, `crow cmeta`, `crow foot`); one stylesheet serves both views, so
  the rail's padding, border and pointer cursor landed on every Library card row and
  `closest('.crow')` matched them. Renamed `.causerow`. The declaration guard reads JS
  names only — **when adding a class, grep the other renderers for it.** Found by a probe
  that clicked the first such row and got an invisible Library one.
- **A BACKTICK inside `app-shell.ts`'s `APP_BOOT` or `INDEX_CSS` closes the template
  literal** — and the same is true of `render.ts`'s `CLIENT` / `EMBEDDED_BOOT`. It fired
  FOUR times on 2026-09-04, always by writing an identifier in a comment the way this repo
  writes identifiers everywhere else. A scanner for it was written and REMOVED (see
  `packages/annotator/test/embedded-modules.test.ts`): finding a block's body needs to know
  which backtick is its terminator, which is the question itself, and parity fails because
  the common case is TWO backticks in one comment. **Typecheck catches every instance; only
  the message is bad. On a burst of `TS1005` in either file, do not read the reported line —
  count the backticks in the named block first.** and the rest of the file parses as TypeScript — five `TS1005` errors pointing at
  your comment, not at the backtick. No backticked identifiers in comments in there.
- **DesignSync CAN write to the design project** (`5a1a95c3-beee-457a-815b-ef6f6bf3e06a`,
  `PROJECT_TYPE_PROJECT`, `canEdit: true`) even though `list_projects` returns nothing — it
  filters to design-system projects. Flow: `get_project` → `list_files` → `finalize_plan`
  (needs both `writes` and `deletes`) → `write_files` with `localPath`.
- **A `get_file` result over ~32 KB is persisted to a file** under the session's
  `tool-results/` directory and the tool prints the path. `json.loads` it and write
  `payload["content"]` — no transcription. Below that threshold there is no such path, and
  the honest move is to DEFER rather than hand-copy a comp.
- **A comp reported as "deleted and badly recreated" may be a RENAME.** Byte-diff the
  remote against the committed copy before restoring anything; `list_files` twice, minutes
  apart, is a cheap change detector.
- **Serve `--read-only` while measuring** a root a `compare` is touching, and never serve
  `out/refdiff` as the impl — it would put every result dir in the Library as a card.
- **Do NOT stop the served annotator with `pkill -f "…--port 7379"`.** `pkill -f` matches
  full command lines, and the shell running the pkill has that string in ITS command line —
  so it kills your own shell (observed: exit 144, the whole command block lost). Use
  `ps -eo pid,args | grep -F annotator/dist/cli.js | grep -v grep`, then `kill` the pids.
- **Never pipe a gate/run command** — you get the pipe's exit code and lose the log head
  where the skip list and capture errors live. Redirect to a file.
- `find` on the devbox is `bfs`: `-newermt` needs an ISO timestamp, not `-40 minutes`.
- **Editing or reverting a served source file mid-session** makes the next captures fail
  transiently with `story-error: Failed to fetch dynamically imported module …?t=<ts>`
  (Vite's stale module URL). Warm the URL and re-run the entry; not a story bug.
