# refdiff — Handoff: Library groups + gallery, CHUNK 4 next (2026-09-04)

**Workstream-scoped handoff, canonical and current.** Repo `~/development/refdiff` (Mato's
Mac: `~/Development/refdiff`), branch **`main`**, pnpm 10 workspace, TypeScript/ESM,
Node ≥22. Rewritten from scratch at the end of the 2026-09-04 session, so nothing in it is
inherited from an earlier revision.

**This does NOT supersede `docs/handoff-2026-09-04.md`** — that one is the canonical repo
handoff for the annotator-redesign workstream (session 21, the mobile-toolbar pair). This
file covers only the Library-groups / gallery workstream, whose plan is
**`docs/plan-gallery-groups.md`** (read that second; it is the real brief, chunks 0–5).

## State of play

**Chunks 1 and 2 are SHIPPED. Six commits on `main`, nothing pushed** (Mato has not asked).
`4b57f12` was the session's base; HEAD is **`e70697f`**:

| sha | what |
| --- | --- |
| `64237e0` | feat(annotator): group the Library by the entry its pair ids name — chunk 1 |
| `31e5c6c` | docs: the plan, its handoff, five lessons |
| `313191d` | feat(core): persist what a component set CONTAINS — chunk 2, the set index |
| `e49ab66` | docs: chunk 2 shipped, two lessons |
| `e1ec7fb` | chore(design): absorb the 2026-09-04 comp consolidation |
| `e70697f` | docs(plan): the Measured column is a per-group range; chunk 5 added |

**584 tests green** (346 core + 238 annotator), typecheck and build clean, `icon-subset.mjs
--check` in sync, `pair-coverage` green both directions, seven manifest pairs.

**Chunk 0's comps are DRAWN but Mato is still working on the design** — so the next chunk a
session can own is **CHUNK 4**, which needs neither a comp nor new data. Chunk 3 (gallery)
and chunk 5 (Library rebuild) both read comps that are still moving.

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
- **Twelve lessons captured today** (33 in the inbox) — `docs/lessons-inbox.md`, newest at
  top, per the standing `CLAUDE.md` instruction.

## What REMAINS (in order)

### 1. CHUNK 4 — manifest hierarchy + label/order overrides ← DO FIRST

Plan § "Chunk 4". **The only chunk that needs neither a comp nor new data**, which is why it
goes first while the design moves. It is also a chunk-5 prerequisite and it is already drawn
in the chunk-0 comps, so doing it now de-risks both.

- `packages/core/src/manifest.ts`: optional `section?: string` on an entry
  (`"Core components/Buttons"`), validated. Optional second named export `sections` for
  order/label metadata only. A `section` path with no entries is a valid pure grouping node
  (Mato's ask: mirror Figma's Core components / Core patterns) — and the comps already draw
  exactly that as the `Foundations` row, "Hierarchy only — nothing measured".
- Optional per-entry `gallery?: { columns?, rows?, order?, labels? }` — which axis is
  columns, pinned option order (see the axes-order caveat below), human labels
  (`"Focus on text"` → `"Focus"`).
- **Heaviest docs obligation of the set.** Per `CLAUDE.md`'s HARD RULE a manifest-shape
  change updates the manifest example in `skills/refdiff/SKILL.md` AND
  `docs/architecture.md`. And it **invalidates `population-registry`'s
  `frontend/ds/tooling/visual/refdiff.bindings.md`**, which asserts the manifest shape and
  "11 entries, 152 pairs" — this repo cannot edit that file, so say so in the handoff.

### 2. CHUNK 3 — the gallery view ← DO SECOND

Plan § "Chunk 3". Both Gallery comps are on disk already (waived in `pair-coverage.test.ts`
until a surface exists). **Confirm with Mato that the Gallery comp has settled before
converging on it** — he is still designing. The seam is `packages/annotator/src/view-math.ts`:
add the pure `cellOrigin` composition and a `GalleryLayout` (cell → `{ pairDir, rect, row,
col }`) built from the set index; the pair view is the one-cell case at the origin. Chunk 2's
index supplies the axes, the pairs and the skipped cells; `absent` is the axes cross-product
minus pairs minus skipped (measured: 9 for Alert, 30 for Button/Fill).

### 3. CHUNK 5 — the Library rebuilt to the comp

Plan § "Chunk 5", fully specified from the comp. Its six prerequisites are ordered there;
two are traps worth repeating: the demo root must learn to emit a variant SET
(`<entryId>--<slug>` dirs) or the comp cannot be measured against the app at all, and that
fixture change **moves the two old Library pairs' numbers**, so it re-baselines them in the
same change; and `icon-subset.mjs` must run again for `chevron_right`, `account_tree`,
`folder`, `filter_alt`, `unfold_more`.

### Two quick wins, independent of the design

- **Surface `run` in `/api/pairs`** — one `PairSummary` field in `index-view.ts`, one line in
  `packages/annotator/src/cli.ts` (which already holds `report.run` where it builds the
  payload). Chunk 5 prerequisite #3, safe to do any time, and nothing else can build the
  Measured column without it.
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
pnpm -r test                    # 584 tests (346 core + 238 annotator)
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
  that group's own cells; `ComparisonReport.run` is the per-pair ordinal and every report
  carries it (`ds-button-fill` r9→r10 and `ds-button-ghost` r6→r7 are mixed today).
  **Do NOT implement the comp's module-level `NEWEST`**: ordinals count per pair and differ
  wildly between groups (r2 … r10), so a global newest would mark all eleven
  `ds-button-icon` cells stale against a run they were never behind.
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
  suppressed, confidence, createdAt, designSource, implSource, implRef, implPng, delta,
  openNotes, notes }] }` — **no `run`, no variant props, no group.**
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
- **Never pipe a gate/run command** — you get the pipe's exit code and lose the log head
  where the skip list and capture errors live. Redirect to a file.
- `find` on the devbox is `bfs`: `-newermt` needs an ISO timestamp, not `-40 minutes`.
- **Editing or reverting a served source file mid-session** makes the next captures fail
  transiently with `story-error: Failed to fetch dynamically imported module …?t=<ts>`
  (Vite's stale module URL). Warm the URL and re-run the entry; not a story bug.
