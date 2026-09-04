# refdiff — Handoff: Library groups + gallery, CHUNK 3 part-shipped (2026-09-04)

**Workstream-scoped handoff, canonical and current.** Repo `~/development/refdiff` (Mato's
Mac: `~/Development/refdiff`), branch **`main`**, pnpm 10 workspace, TypeScript/ESM,
Node ≥22. Rewritten at the end of the 2026-09-04 session, then amended twice the same day —
when chunk 4 shipped, and when the consuming repo's bindings debt (§0) was paid — so nothing
in it is inherited from an earlier revision.

**Chunk 3's SEAM, RESOLVER and DATA PATH are shipped, and the one open question is
ANSWERED: the sheet lives INSIDE the comparison tool's chrome.** The Gallery comp is that
tool with a variant sheet in its panes, measured at 777 findings — not the standalone page
the plan assumed. **Mato refuted the cheaper option (scope the pair to the grid) on
2026-09-04**: the gallery's findings rail has a Recurring-causes section the tool's rail
does not, so scoping would have shipped a rail nothing measured. §"What REMAINS" step 1
carries the diff that settled it. Read the plan's § "Chunk 3" second — its CAUTION block is
the same measurement.

**This does NOT supersede `docs/handoff-2026-09-04.md`** — that one is the canonical repo
handoff for the annotator-redesign workstream (session 21, the mobile-toolbar pair). This
file covers only the Library-groups / gallery workstream, whose plan is
**`docs/plan-gallery-groups.md`** (read that second; it is the real brief, chunks 0–5).

## State of play

**Chunks 1, 2 and 4 are SHIPPED; chunk 3 is PART-shipped. Twelve commits on `main`, nothing
pushed** (Mato has not asked). `4b57f12` was the workstream's base.

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
| *(this session)* | feat: the variant sheet's seam, resolver and data path — chunk 3 |

**641 tests green** (364 core + 277 annotator), typecheck and build clean, `icon-subset.mjs
--check` in sync, `pair-coverage` green both directions with **ZERO waivers** (both Gallery
waivers deleted in the change that registered their pairs), **nine** manifest pairs.


**Mato confirmed the Gallery comp SETTLED on 2026-09-04** (both comps byte-identical to the
committed copies, verified against the design project before asking). What is left: chunk 3's
open fork below, and chunk 5, the Library rebuild.

## What's DONE

- **CHUNK 3 — the sheet's seam, resolver and data path** (this session). The plan's
  § "Chunk 3" IMPORTANT block is the finding and this is the inventory.
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
- **CHUNK 1 — the Library groups by entry** (`64237e0`). All pure logic in
  `packages/annotator/src/index-view.ts`: `entryIdOf`, `groupEntries`, `cellsShown`,
  `isFoldable`, `isFilterActive`, `openGroups`, `groupWhen`, `groupHeader`, `libraryList`;
  `app-shell.ts` renders through them, holds `lib.opened` / `lib.closed`, toggles on
  `.ghead`, and styles `.grp` / `.gcells` to span the card grid. Measured on the live
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

1. **A full `refdiff compare` over the DS manifest** — that out root predates chunk 2, so it
   holds **0** `<entryId>.set.json`. Every coverage figure there is hand-counted for exactly
   that reason, and the Figma-variants column does not decompose into the run-dir column:
   `ds-checkbox` shows 45 run dirs against 54 recorded variants while the entry pins one of
   five properties, which no arithmetic over those two numbers explains. A run makes
   declared / paired / skipped an artifact and closes the question.
2. **Regenerate `figma-inventory.md`** (needs a live Figma sweep). Its `already paired | 10`
   predates the `ds-dialog-starter-*` entries; the reconciliation is verified exactly —
   10 nodes marked `**man**` + chip (unstarred, item 1) + `36940:4414` (marked `—`, added
   after the 2026-09-01 sweep in response to item 3) = the manifest's 12.
3. **`menu/gallery` is unpaired and was MISSING from the not-paired table entirely** —
   `24008:27391` (`*Dropdown/items`), `storiesReady: true`, story `ds-menu--gallery`, in
   neither the manifest nor any row. An omission, not a decision; it is the
   pair-per-comp-gap class, which reports itself nowhere. Probe the node and the story's
   tagging before assuming it belongs in the untagged row.

### 1. CHUNK 3 — DECIDED: the sheet lives INSIDE the tool. Converge on the 777.

The seam, the resolver and the data path are shipped (see What's DONE). **The one open
question was answered by Mato on 2026-09-04 and the answer reversed the recommendation this
file used to carry.**

**The finding, measured.** The stubbed route ran against `RefDiff Gallery.dc.html` and
returned **777 findings (391 critical, 323 major, 63 minor) at confidence 0.00**, 586 of
them `missing-element`. The comp is **the comparison tool's chrome with a variant sheet in
its panes**, not the standalone page the plan assumed — the same "REBUILD, not a delta"
chunk 0 found for the Library comp, which nobody had checked for this one. A frame name
tells you a comp's SUBJECT, never its surface.

**Why the recommendation flipped, and it is the reusable part.** This file used to recommend
scoping the pair to the grid and leaving the chrome to the comparison tool, "already paired
and converged against its own comp". **Mato pointed out the chrome is not the same — the
gallery's findings rail has a Recurring-causes section the tool's rail has not.** Diffing
the two comps' rendered text confirmed it and then some:

| | Gallery comp | Comparison Tool comp |
| --- | --- | --- |
| distinct chrome strings | 39 | 36 |
| shared | **21** | |
| gallery-ONLY | **18** | |

`Recurring causes` and `Other findings` are in the Gallery comp and **nowhere** in the
Comparison Tool comp: the sheet's rail groups by CAUSE, the tool's rail lists findings with
instance aggregates (`×15` / `×6`, see `COMPARE_IGNORE`). The other gallery-only strings
agree — the cell-state legend (`Absent`, `Skipped · no impl cell`, `Regression`, `reg`),
pane labels `DESIGN` / `IMPLEMENTATION` against the tool comp's `Design` / `Impl`, the
comment affordances (`New comment`, `Open`, `history`, `open_in_full`), and the breadcrumb
`Actions / Button · 60 variants`.

**Scoping would therefore have shipped a whole rail with NO pair measuring it** — the
pair-per-comp-gap class, the defect this workstream exists to remove, and the one that
reports itself nowhere. The premise had been inferred from the comp looking like the tool
and never diffed. **Two comps that render the same furniture are not the same surface until
the TEXT is diffed:** `grep -oiE` over both, set difference, count. One command.

**So: option 1.** Render the sheet as the report view's content — the existing chrome
(`REPORT_BODY` + `CLIENT` in `render.ts`, 2,945 lines) rather than the standalone
`#view-gallery` section the stub added. The 21 shared strings are a real shared shell and
should be reused; the rail is chunk 3's SCOPE, not chrome to be excused. A large share of
the 777 findings is that rail — work, not noise. **No design ask is needed any more**: the
`data-vc-scope` request only existed to serve the refuted option.

**A dependency this surfaced: chunk 4's `section` now has a UI consumer.** The breadcrumb
`Actions / Button · 60 variants` is the hierarchy rendered. This workstream records
`section` as "validated and REPORTED, not persisted — its shape is chunk 5's decision"
(What's DONE, and the plan's chunk 4). The sheet needs it, so **that decision is chunk 3's
dependency too** — decide the persisted shape before building the breadcrumb, or the
breadcrumb hard-codes what the artifact should carry.

**What is already in place for the converge.** Both gallery pairs are registered
(`refdiff-gallery-desktop` 1400×860 full-bleed, no scope; `refdiff-gallery-mobile` 390×844
with `scope: ".cc-theme-dark"`), `GALLERY_IGNORE` is deliberately EMPTY — the first run's
findings are the specification and a policy written before the measurement excuses findings
nobody has read — and both `UNPAIRED_BY_DESIGN` waivers are gone. The delta drives from
here, never the comp's source.

**The mobile pair, for reference:** 426 findings (161/214/51), confidence 0.00 with
`x 0.67 / y 0.06` — 311 comp leaf elements against the app's 87. Its own phone frame, not a
narrow-viewport render of the desktop comp.

**Still open, and small:** the Library's group row does not yet LINK to the sheet (the
plan's "a group in the Library opens the gallery"). Deliberately not done here — it changes
the Library's markup, which moves those two pairs again, and chunk 5 rebuilds that surface
to a comp that draws the affordance properly. Do it in chunk 5, or accept a third
re-baseline.

### 2. CHUNK 5 — the Library rebuilt to the comp

Plan § "Chunk 5", fully specified from the comp. Its six prerequisites are ordered there;
two are traps worth repeating: the demo root must learn to emit a variant SET
(`<entryId>--<slug>` dirs) or the comp cannot be measured against the app at all, and that
fixture change **moves the two old Library pairs' numbers**, so it re-baselines them in the
same change; and `icon-subset.mjs` must run again for `chevron_right`, `account_tree`,
`folder`, `filter_alt`, `unfold_more`.

### One quick win left, independent of the design

*(`run` in `/api/pairs` was the other one — done this session, see What's DONE.)*

- **The DS coverage census.** One `--pair` list over all 14 entries writes 14
  `.set.json` files and gives the programme its first real coverage numbers. Run it with
  **Storybook up** so the captures succeed and the reports refresh in the same pass;
  point `--out` at the DS root only when you mean to refresh it.

### Chunk 0 — Mato's, not a session's
All four comps exist (Library Groups + Gallery, each with a mobile half). Frames, previews
and which need `scope: ".cc-theme-dark"` are tabulated in the plan's chunk 0 section. **The
two Library Groups comps are deliberately NOT on disk**: they came back from `get_file`
below the persist-to-disk threshold, and a reference comp must never be hand-transcribed —
a typo becomes a false finding in every future measurement of its pair. Fetch them when
chunk 5 starts, decoding from the persisted tool result.

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
pnpm -r test                    # 641 tests (364 core + 277 annotator)
pnpm typecheck

# FIRST, before the first compare of a session — halts on a stale build/server
bash skills/refdiff/preflight.sh --port <annotator port>

# the annotator's own self-measurement (dogfooding — how UI work is verified here).
# Serve the COMMITTED fixture root, measure into out/refdiff, restore the clock after.
refdiff-annotator fixtures/demo-root --serve --read-only --port 7379 &
node fixtures/make-demo-root.ts --now        # fixture clock = wall clock, for the measure
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff --pair refdiff-library-desktop
refdiff summary out/refdiff
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

# look at the Library against a real 194-pair root
refdiff-annotator ~/development/ds/repos/population-registry/out/refdiff \
  --serve --read-only --port 7380
```

## Key facts / decisions

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
- **A BACKTICK inside `app-shell.ts`'s `APP_BOOT` or `INDEX_CSS` closes the template
  literal** and the rest of the file parses as TypeScript — five `TS1005` errors pointing at
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
