# refdiff — Handoff: Library groups + gallery, CHUNK 3 next (2026-09-04)

**Workstream-scoped handoff, canonical and current.** Repo `~/development/refdiff` (Mato's
Mac: `~/Development/refdiff`), branch **`main`**, pnpm 10 workspace, TypeScript/ESM,
Node ≥22. Rewritten at the end of the 2026-09-04 session and amended the same day when
chunk 4 shipped, so nothing in it is inherited from an earlier revision.

**This does NOT supersede `docs/handoff-2026-09-04.md`** — that one is the canonical repo
handoff for the annotator-redesign workstream (session 21, the mobile-toolbar pair). This
file covers only the Library-groups / gallery workstream, whose plan is
**`docs/plan-gallery-groups.md`** (read that second; it is the real brief, chunks 0–5).

## State of play

**Chunks 1, 2 and 4 are SHIPPED. Eight commits on `main`, nothing pushed** (Mato has not
asked). `4b57f12` was the session's base:

| sha | what |
| --- | --- |
| `64237e0` | feat(annotator): group the Library by the entry its pair ids name — chunk 1 |
| `31e5c6c` | docs: the plan, its handoff, five lessons |
| `313191d` | feat(core): persist what a component set CONTAINS — chunk 2, the set index |
| `e49ab66` | docs: chunk 2 shipped, two lessons |
| `e1ec7fb` | chore(design): absorb the 2026-09-04 comp consolidation |
| `e70697f` | docs(plan): the Measured column is a per-group range; chunk 5 added |
| `0da4e0b` | docs: refresh the workstream handoff for a fresh context |
| *(this session)* | feat(core): the manifest declares hierarchy and grid layout — chunk 4, + `run` in `/api/pairs` |

**598 tests green** (360 core + 238 annotator), typecheck and build clean, `icon-subset.mjs
--check` in sync, `pair-coverage` green both directions, seven manifest pairs.

**Chunk 0's comps are DRAWN but Mato is still working on the design.** Chunk 4 is done, so
what is left both read comps that are still moving: **CHUNK 3** (gallery) is next, and its
comp needs a settled-or-not answer from Mato first; chunk 5 is the Library rebuild.

## What's DONE

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

### 0. A DEBT THIS REPO CANNOT PAY — `population-registry`'s bindings are now stale

Chunk 4 changed the manifest shape, so
**`population-registry`'s `frontend/ds/tooling/visual/refdiff.bindings.md` is out of date**
and this repo cannot edit it (CLAUDE.md § "Keep the skill repo-agnostic": changing something
a consuming repo's bindings assert means those bindings are now wrong too — say so in the
handoff even when you cannot edit that repo). Two separate things are wrong with it:

1. **The manifest shape it asserts is incomplete.** It does not mention `section`,
   `sections` or `gallery`. Nothing BREAKS — all three are optional and the DS manifest
   declares none, so its runs are unaffected — but a reader deriving the manifest shape from
   those bindings will not know the fields exist, which is exactly the stale-assertion
   failure `CLAUDE.md` names.
2. **Its inventory is stale on its own terms, in TWO places** — and both predate chunk 4,
   so this is a pre-existing debt the chunk merely makes worth paying now. Measured this
   session, each number naming the command that produced it:
   - the file's own header table calls the manifest **"3 entries"** (`refdiff.bindings.md:12`)
     and its inventory paragraph **"11 entries, 152 pairs"** (`:45`, and it says
     "measured at the last full run, not inherited");
   - `refdiff.manifest.mjs` has **14** entries (`grep -c '^  {'` and `grep -c 'id: "'`
     agree), and the DS out root served on port 7380 returned **194 pairs across 14 groups**
     from `/api/pairs`: `ds-checkbox` 45, `ds-button-fill` 41, `ds-button-stroke` 24,
     `ds-button-ghost` 24, `ds-alert` 23, `ds-button-icon` 11, `ds-select-field` 6,
     `ds-text-field` 6, `ds-date-field` 5, `ds-dialog-header` 4, `ds-chip` 2,
     `ds-dialog-starter-{lg,md,sm}` 1 each.

**Fix it from the population-registry side**, in a session working in that repo — it is a
docs edit there, not code. It is also the natural moment to run the **DS coverage census**
below, since both want the same numbers.

### 1. CHUNK 3 — the gallery view ← DO FIRST

Plan § "Chunk 3". Both Gallery comps are on disk already (waived in `pair-coverage.test.ts`
until a surface exists). **Confirm with Mato that the Gallery comp has settled before
converging on it** — he is still designing. The seam is `packages/annotator/src/view-math.ts`:
add the pure `cellOrigin` composition and a `GalleryLayout` (cell → `{ pairDir, rect, row,
col }`) built from the set index; the pair view is the one-cell case at the origin. Chunk 2's
index supplies the axes, the pairs and the skipped cells; `absent` is the axes cross-product
minus pairs minus skipped (measured: 9 for Alert, 30 for Button/Fill).

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
pnpm -r test                    # 598 tests (360 core + 238 annotator)
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
  suppressed, confidence, createdAt, `run?`, designSource, implSource, implRef, implPng,
  delta, openNotes, notes }] }` — `run` landed this session and is **OPTIONAL**; still **no
  variant props and no group**, which is what chunk 5's expanded rows need next
  (`props` is in `<entryId>.set.json`, keyed by the run dir, so the join exists).
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
