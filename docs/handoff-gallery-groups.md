# refdiff — Handoff: Library groups + gallery, CHUNK 0/3 (2026-09-04)

**Workstream-scoped handoff.** Repo `~/development/refdiff` (Mato's Mac:
`~/Development/refdiff`), branch **`main`**, pnpm 10 workspace, TypeScript/ESM, Node ≥22.

**This does NOT supersede `docs/handoff-2026-09-04.md`** — that one is the canonical
repo handoff for the annotator-redesign workstream (session 21, the mobile-toolbar pair).
This file covers only the Library-groups / gallery workstream, whose plan is
**`docs/plan-gallery-groups.md`** (read that second; it is the real brief).

## State of play

**Chunks 1 and 2 are SHIPPED and committed** (2026-09-04, on `main`). The gallery now has
both halves of what it needs: the Library groups by entry, and core persists a per-set
index carrying the axes, the pairs and the SKIPPED cells. **What remains is CHUNK 0 — the
two comps — and it is a design gate, not code.** Chunk 3 (the gallery view) cannot be
verified without them: a new surface with no comp cannot be measured, which is the loop
rule. Chunk 4 (manifest hierarchy) is independent of the comps and could go first if you
would rather not wait.

**Nothing pushed** — Mato has not asked.

## What's DONE

- **The plan** — `docs/plan-gallery-groups.md`: the measured problem, the decisions taken
  with Mato, the two findings that decide the design, chunks 0–4, open questions, and the
  Claude Design brief for chunk 0. Chunk 1's section now records what landed, the numbers,
  and the seven sub-decisions taken while building.
- **CHUNK 1 — the Library groups by entry.** `packages/annotator/src/index-view.ts`:
  `entryIdOf`, `groupEntries`, `cellsShown`, `isFoldable`, `isFilterActive`, `openGroups`,
  `groupWhen`, `groupHeader`, `libraryList` (all pure); `app-shell.ts` renders through
  them, holds `lib.opened` / `lib.closed`, toggles on `.ghead`, and styles `.grp` /
  `.gcells` to span the card grid. **Measured on the live 194-pair DS payload: 194 → 14
  groups**, collapsed markup 9,241 bytes / 11 headers / 3 images against 244,735 / 194
  cards / 194 images expanded. Annotator tests 203 → 238 (repo 538 → 573); the annotator's
  own Library pairs re-measured `+0/−0`, counts byte-identical to the 09-04 baseline.
  `SKILL.md` §1b and `docs/architecture.md`'s Library paragraph say so (that paragraph also
  lost two pre-existing stale claims — `minmax(250px …)` where the CSS says 262, and "or
  with the toggle" for a control removed on 2026-08-28).
- **Open question 3 is answered** — always collapsed, no threshold. Reasoning and the two
  structural carve-outs are in the plan and in `openGroups`' own doc comment.
- **Five lessons captured** — `docs/lessons-inbox.md`, top of file, per the standing
  instruction in `CLAUDE.md`. Chunk 1 added three; one is load-bearing for chunk 3 (the
  vintage-bucket rule) and one for any future self-measurement (the fixture that cannot
  contain the new case).
- **CHUNK 2 — core persists the set index.** `packages/core/src/package/set-index.ts`
  (pure `buildSetIndex` + `setIndexFileName`, beside `summary.ts`), `variantAxes(set) →
  { source, properties }` in `adapters/figma-variants.ts`, and the write inside
  `expandFigmaSet`. **`<out-root>/<entryId>.set.json`** — a flat FILE (open question 2,
  answered on evidence: both run-dir walkers filter `isDirectory()`, so a `sets/`
  directory would be counted by `summary` and drawn as a broken card in the Library),
  one file per entry (which makes no-truncation structural), written at the expansion
  (so it survives a failed `/images` call and a run that captures nothing). Core tests
  335 → 346. Verified hermetically against the two recorded real COMPONENT_SET fixtures,
  then live end-to-end: every index reproduced its console `N variant pairs, M skipped`
  line, an unselected entry's file stayed byte-identical across a re-run, and a run
  whose every capture failed (exit 2) still wrote both indexes.
- **The artifact earned itself on first use.** `ds-chip` expands to **5 pairs and 63
  skipped** out of **105 declared** combinations — and shows 2 run dirs in the Library.
  `ds-dialog-header` is 4 and 4 out of 16. Nothing had ever persisted those numbers.
  **A full 14-entry pass is one `--pair` list away and would be the programme's first
  real coverage census** — worth doing with Storybook up, so the captures succeed and
  the run refreshes the reports at the same time.
- **The DS side is measured and quiet** — `population-registry` at 194 pairs / 1071
  findings; that repo's own state is its business, not this chunk's. Its COVERAGE, on the
  other hand, is now measurable — see the census note above.

## What REMAINS (in order)

### 1. CHUNK 0 — the two comps ← DESIGN GATE, blocks chunk 3

Plan § "Design asks". A Library-with-groups comp (extending `RefDiff Library.dc.html` —
chunk 1 shipped seven sub-decisions the comp can overrule, all listed in the plan's chunk 1
table) and a new `RefDiff Gallery.dc.html`. The brief is written; it needs Mato and the
Claude Design canvas, not a session here.

### 2. CHUNK 4 — manifest hierarchy — the one that needs NEITHER comp nor data

Plan § "Chunk 4". Independent of chunk 0, so it can go while the comps are drawn. Heaviest
docs obligation of the four, and it **invalidates `population-registry`'s
`frontend/ds/tooling/visual/refdiff.bindings.md`** (which asserts the manifest shape and
"11 entries, 152 pairs"): say so in that chunk's handoff.

### Later / future reference
- **Chunk 0** — comps from Claude Design (Library-with-groups + `RefDiff Gallery.dc.html`).
  Brief is in the plan; blocks chunk 3 only.
- **Chunk 3** — the gallery view (`view-math.ts` `cellOrigin`; pair = 1-cell case).
- **Chunk 4** — manifest `section:` hierarchy + column/order/label overrides. **This is the
  chunk that invalidates `population-registry`'s
  `frontend/ds/tooling/visual/refdiff.bindings.md`** (it asserts the manifest shape and
  "11 entries, 152 pairs"). Say so in that chunk's handoff.

### Needs research / open questions
**One left**, and it is chunk 3's, not a blocker for anything shipped:
1. Set-level notes (a note owned by no single cell): allow with a set-level file, or forbid?
   Plan's recommendation stands — allow it, because forcing the note onto an arbitrary cell
   is a lie about where the problem is.
2. ~~Set index location~~ — **ANSWERED 2026-09-04: the flat `<root>/<entryId>.set.json`**,
   decided on measured walker behaviour rather than taste. Reasoning and the verification
   are in the plan's chunk 2 table.
3. ~~Chunk 1's collapse threshold~~ — **ANSWERED 2026-09-04: always collapsed, no
   threshold**, with two structural carve-outs (a group of one is its card; an active
   filter expands what survived it) and an explicit toggle winning over both. Full
   reasoning: plan § "Open questions" and `openGroups` in `index-view.ts`.

## How to run

```bash
cd ~/development/refdiff
pnpm build                      # or: pnpm dev  (tsc --watch; the CLIs exec dist/)
pnpm -r test                    # 584 tests after chunk 2 (346 core + 238 annotator)
pnpm --filter @refdiff/annotator test

# the annotator's own self-measurement (dogfooding — this is how UI work is verified)
refdiff compare --manifest design/refdiff.manifest.mjs --out out/refdiff \
  --pair refdiff-library-desktop,refdiff-library-mobile
refdiff summary out/refdiff

# serve the Library to look at it (a DS root with 194 pairs is the real stress case)
refdiff-annotator ~/development/ds/repos/population-registry/out/refdiff \
  --serve --read-only --port 7384 --host 0.0.0.0
```

Pre-flight before the first compare of a session (halts on a stale build):
```bash
bash skills/refdiff/preflight.sh --port <annotator port>
```

## Key facts / decisions

- **The gallery is composed, never re-compared.** A whole-sheet compare would put one
  alignment fit across 41 cells and the `pixel-region/frame` noise (firing **194/194** on
  the DS today) would swallow every real finding. The comparison unit stays one variant
  component ↔ one story cell.
- **Notes: authored from either view, stored against the PAIR** in pair-world coordinates.
  Composite coordinates would drift the moment a cell resizes.
- **Column labels need no heuristic.** `variantProperties(set)` already returns
  `Record<property, options[]>` from Figma's `componentPropertyDefinitions.variantOptions`,
  in the designer's order. The old `population-registry` annotator's positional heuristic
  (`capture-assets.mjs:139-175`, column centres as image fractions) exists only because it
  captures one bitmap of the whole grid. Do not port it.
- **`view-math.ts` is the entire seam.** One world space (impl CSS px),
  `View { z, tx, ty }`, `screen = world · z + t`. A gallery is `pairWorld + cellOrigin`.
- **A set run's completeness is not observable from its reports** — this session's main
  lesson, and chunk 1 inherits half of it. A failed capture writes no `findings.json`, so
  the stale one survives and any check that scans those files for an error is blind.
  `refdiff summary` also counts every dir under the root, orphans included. Hence chunk 1's
  `createdAt` span on a group header and chunk 3's per-cell staleness: both are the same
  defect surfaced in the UI. Full entry at the top of `docs/lessons-inbox.md`.
- **`summary.json` already carries the roll-up** — `runs[]` (per-pair counts, verdict,
  confidence, alignment, delta, `createdAt`), `groups[]` (**64 causes, each with its
  `pairs[]`** — a free "light up the cells with this cause" affordance), `totals`. Do not
  recompute it. NOTE: the root key `groups` means *cause* groups; chunk 4 uses `sections`
  for hierarchy to avoid the collision.
- **`/api/pairs`** → `{ root, pairs: [{ dir, pair, pass, critical, major, minor, findings,
  suppressed, confidence, createdAt, designSource, implSource, implRef, implPng, delta,
  openNotes, notes }] }`. No variant props, no group — chunk 1 needs neither.

## Env gotchas

- **`CLAUDE.md:114` — do not commit unless asked.** Also the HARD RULE: any behaviour or
  usage change updates `skills/refdiff/SKILL.md` in the SAME change, and
  `grep -n "<term>" skills/ packages/ docs/` must come back clean.
- **Standing instruction:** durable lessons get appended to `docs/lessons-inbox.md` the
  moment they are noticed (newest at top, under the `<!-- LESSONS-LOG -->` marker).
- **`dist` is what runs.** The CLIs exec `packages/*/dist/cli.js`; a stale dist measures
  code you did not write and reports `+0/−0`. Keep `pnpm dev` running or `pnpm build`.
- **The served annotator renders its page shell at process START** — restart it after a
  rebuild or it serves the old build however fresh dist is. `preflight.sh --port` catches it.
- **Serve `--read-only` while measuring** a root that a `compare` is touching.
- `find` on the devbox is `bfs`: `-newermt` needs an ISO timestamp, not `-40 minutes`.
- **Editing or reverting a served source file mid-session** makes the next captures fail
  transiently with `story-error: Failed to fetch dynamically imported module …?t=<ts>`
  (Vite's stale module URL). Warm the URL and re-run the entry; it is not a story bug.
- **Never pipe a gate/run command** — you get the pipe's exit code, and you lose the log
  head where the skip list and capture errors live. Redirect to a file instead.
