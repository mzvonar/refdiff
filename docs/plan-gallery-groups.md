# Plan — Library groups + the gallery (variant-sheet) view

Started 2026-09-04, from a design discussion with Mato while running the DS
(`population-registry`) at 194 pairs. **Chunk 1 is SHIPPED (2026-09-04); chunk 2
is next. Chunk 0 remains a design gate, and it blocks chunk 3 only.**

Sibling plans: `docs/plan-annotator-redesign.md` (the redesign this builds on),
`docs/plan-next.md` (history). Working agreement: `CLAUDE.md` — note the HARD
RULE, every chunk below names the `SKILL.md` update it carries.

## The measured problem

`population-registry`'s DS run, 2026-09-04, `out/refdiff/summary.md`:

| | |
| --- | --- |
| pairs | **194**, 0 PASS / 194 FAIL, 1071 findings |
| the five biggest entries | `ds-checkbox` 45, `ds-button-fill` 41, `ds-button-stroke` 24, `ds-button-ghost` 24, `ds-alert` 23 — **157 of 194 pairs in five entries** |
| the Library shows | 194 flat rows, unordered by anything a human thinks in |

Two distinct failures, and the second is the expensive one:

1. **Navigation.** A variant sheet is one design artefact; the Library shows it
   as 41 sibling rows with no notion of the set they came from.
2. **Coverage is invisible.** A flat list can only show what WAS measured. It
   structurally cannot show absence, and absence is what has actually misled
   us: `ds-button-stroke` expands to 24 pairs and **36 skipped**, `ds-button-fill`
   41 pairs and 1 skipped (`no tone mapping for variant=label`), and whole
   families in that repo's bindings are unpaired (`icon/*` ×12,
   `alert/instruction`, `alertdialog`, `tag`, `thumbnail/*`, `button/stroke-white`).
   **The skip list is console-only — it is persisted nowhere**, which is why it
   vanished when a session piped the run log through `tail`.

## Decisions taken (2026-09-04, with Mato)

| question | decision |
| --- | --- |
| is the gallery a new COMPARISON? | **No.** Composed from the existing per-pair results. A whole-sheet compare would put one alignment fit across 41 cells and the container-level `pixel-region/frame` noise (firing **194/194** today) would swallow every real finding. Holds design principle: the unit stays one variant component ↔ one story cell. |
| does the gallery get the full review UI? | **Yes** — annotate on differences, switch design/impl, the whole tool strip. It is a first-class surface, not a picture. This is the requirement that shapes the architecture. |
| aggregate findings per cell? | **Yes, keep it.** Nearly free: `summary.json` already carries the per-pair roll-up. |
| where do notes live? | **Authored from either view, stored against the PAIR**, in that pair's world coordinates. Authoring and storage are separate concerns. Composite coordinates would drift the moment a cell resizes or a variant appears. |
| per-comp UI | **Untouched.** It becomes the one-cell case of the same renderer. |
| grouping declaration | Flat path strings (Storybook-style), not a nested tree. Entries stay independently editable, diffs stay small, a derived tree cannot go structurally invalid. |
| mechanism vs declaration | **Mechanism in the tool** (deriving axes, rendering the grid) — it is generic to every Figma `COMPONENT_SET`, and N repos hand-rolling it gives N divergent review UIs. **Declaration in the manifest** (hierarchy, which axis is columns, label overrides). |
| column labels | **No heuristic.** See below — this was the discussion's main correction. |

## The two findings that decide the design

### 1. Labels and axes are structural data, already computed

The old visual annotator in `population-registry`
(`frontend/ds/tooling/visual/annotator/capture-assets.mjs:139-175`) infers column
positions by measuring every `[data-col]` bounding box in the live page and
returning each column's centre-x **as a fraction of the image**. It has to: it
captures ONE screenshot of the whole grid, so it is reverse-engineering
structure out of a bitmap.

refdiff never has that problem. `packages/core/src/adapters/figma-variants.ts`
already produces, per set:

- `variantProperties(set): Record<property, options[]>` — from Figma's own
  `componentPropertyDefinitions.variantOptions`. **These are the column labels,
  in the designer's declared order.**
- `VariantPair { name, props: Record<string,string>, slug }` — every cell's full
  property map.
- `VariantExpansion.skipped: { nodeId, name, reason }[]` — the cells that did not
  pair, with why.

**Do not port the positional heuristic.** It is a workaround for a constraint
this tool does not have. The only gap is persistence: `findings.json` keeps the
slug-derived `pair` string, `design.ref` and nothing else, so the annotator
cannot load any of it.

One caveat to carry into chunk 4: option order is the designer's only on the
definitions path. `variantProperties`' fallback branch accumulates into a `Set`
from child names, so it is **traversal order**. A gallery that silently labels
columns in traversal order while claiming the designer's order is a
"looks fine but is wrong" state — so the set index records which branch produced
the axes, and the gallery marks a fallback-derived axis rather than guessing.

### 2. There is already one world space, and it is the whole seam

`packages/annotator/src/view-math.ts` (480 lines, pure):
*"Everything is expressed in ONE world space: impl CSS px … A single
`View { z, tx, ty }` (screen = world · z + t) is shared by both panes."*
Design px enter through `designToWorld(p, alignment)`.

So a gallery is **one composition step**: `galleryWorld = pairWorld + cellOrigin`.
Add that to the pure view-math layer and the existing canvas renderer, pan/zoom,
wipe/onion/blink/diff, finding boxes and note anchoring work unchanged — they all
already route through that space. **The pair view is the degenerate one-cell case
with `cellOrigin = {0,0}`.**

This is why "same UI as a pair" is cheap rather than a parallel implementation.
It also means the gallery is a canvas layout, NOT a pre-baked composite PNG:
subset re-runs (`--pair ds-checkbox,…`) are the normal working mode, so baked
composites would go stale per-cell with no signal.

## What exists to build on (read these before touching anything)

| file | lines | what it is |
| --- | --- | --- |
| `packages/core/src/adapters/figma-variants.ts` | 173 | `expandVariants`, `variantProperties`, `VariantPair.props`, `skipped[]` |
| `packages/core/src/cli.ts` | 1329 | expands sets, writes run dirs, serves nothing |
| `packages/annotator/src/view-math.ts` | 480 | **pure** world/screen geometry — the seam |
| `packages/annotator/src/render.ts` | 2945 | the canvas viewer, tool strip, overlays |
| `packages/annotator/src/index-view.ts` | 445 | the Library: `PairSummary`, `LibraryFilter`, `filterEntries`, `relativeWhen`, `severityBadges`, `trendAndDelta` |
| `packages/annotator/src/cli.ts` | 930 | serves `/api/pairs`, `/api/annotations` |
| `packages/annotator/src/annotations.ts` | 454 | note persistence per run dir |

Payloads that already exist (do not recompute):

- `/api/pairs` → `{ root, pairs: [{ dir, pair, pass, critical, major, minor,
  findings, suppressed, confidence, createdAt, designSource, implSource,
  implRef, implPng, delta, openNotes, notes }] }`
- `out/refdiff/summary.json` → `runs[]` (194, per-pair counts + verdict +
  confidence + alignment + delta + `createdAt`), `groups[]` (**64 causes, each
  with its `pairs[]` list**), `totals`.

`summary.json`'s `groups` key is **already taken** and means *cause* groups. Do
not add a root `groups` key meaning hierarchy — chunk 4 uses `sections`.

That cause→pairs index is a free feature: click a cause in the gallery header,
the matching cells light up. Probably the most useful affordance on a 41-cell sheet.

---

## Chunk 0 — comps (DESIGN GATE, blocks chunk 3 only)

The annotator is dogfooded: `design/refdiff/*.dc.html` are the comps,
`design/refdiff.manifest.mjs` measures the app against them, and the loop rule
is that progress is a number from `refdiff summary`, never an eyeball. **A new
surface with no comp cannot be verified**, so the gallery needs one first.

Needed: a Library-with-groups comp (extends `RefDiff Library.dc.html`) and a new
`RefDiff Gallery.dc.html`. See "Design asks" at the end — the prompt for Claude
Design is there.

Chunks 1 and 2 are NOT blocked on this: chunk 1 changes the Library's row
grouping only (existing comp still governs row appearance), chunk 2 has no UI.

## Chunk 1 — Library tree, derived, zero core change — **SHIPPED 2026-09-04**

**What landed**, all in `packages/annotator/src/index-view.ts` (pure) +
`app-shell.ts` (the ~10 lines of adapter and the CSS), no core change:
`entryIdOf`, `groupEntries`, `cellsShown`, `isFoldable`, `isFilterActive`,
`openGroups`, `groupWhen`, `groupHeader`, `libraryList` — 35 new unit tests
(annotator 203 → 238, repo 538 → 573).

**Measured, not assumed.** Against the live 194-pair DS payload: **194 pairs →
14 groups**, 11 foldable + 3 one-cell entries drawn as bare cards; the collapsed
Library is **9,241 bytes of markup, 11 headers, 3 images** against **244,735
bytes, 194 cards, 194 images** fully expanded, and `regressed` is not vacuous on
real data (`ds-button-stroke` 6, `ds-alert` 8). A `query=hover` filter leaves 9
groups / 30 cells and expands all 9. The annotator's own Library pairs re-measured
`+0/−0` on both layouts with counts byte-identical to the 09-04 baseline
(desktop 10 (1/3/6) conf 0.89, mobile 8 (1/3/4) conf 1.00) — see the caveat in
`docs/lessons-inbox.md`: the demo root's twelve pair ids carry no `--`, so that
run is the REGRESSION guard for the ungrouped case, not evidence about grouping.
A positive control (`curl | grep -c "function groupEntries"` on the served page)
is what separates it from a stale-dist `+0/−0`, and a byte-identity unit test
(`libraryList(groupEntries(loneItems), …) === pairCards(loneItems, …)`,
falsified by breaking `isFoldable`) is its mechanical twin.

**Decisions taken while building**, beyond the spec below:

| question the spec left open | decision |
| --- | --- |
| collapse threshold (open question 3) | **always collapsed, no N** — see the answer under "Open questions". |
| a set of ONE cell | drawn as its card, no header — folding it hides a thumbnail, route, trend and comment count and saves no room. Keyed off `total` (pre-filter), so a search leaving one match inside a 45-cell set still shows the header naming it. |
| what a header's roll-up counts under a filter | the cells it is SHOWING, so the numbers reconcile with the cards under it; the pre-filter count survives as `N of M comparisons`. |
| "regressed" | `delta.regressions > 0` — a fix come undone. Deliberately not the `Diverging` chip's `introduced > resolved`, which every card's trend already shows. |
| "different runs" for the `createdAt` span | the relative-time BUCKET, no tolerance constant — `relativeWhen`'s own words, so the span appears exactly when two cells would read differently. Measured rationale in `docs/lessons-inbox.md`. |
| group order | first-appearance, so a `sortEntries`-sorted list puts the most recently finished set first — the flat list's own decision. Alphabetical / declared order is chunk 4's `sections`. |
| a collapsed group's cells | not rendered at all, not hidden — 191 of 194 images the browser never fetches. |

**Ships the relief on its own.** Every pair id is `${entryId}--${slug}`, so the
first grouping level is already in the data: `ds-button-fill--state-default_…`
→ `ds-button-fill`. 194 rows become 14 groups with no new data and no core work.

- Split on the FIRST `--` only. A pair id with no `--` is a single top-level
  item (the annotator's own `refdiff-library-desktop` etc.) — must keep working.
- Pure functions in `index-view.ts`, unit-tested: `groupEntries(entries)` →
  ordered groups with roll-up counts; a group's badge is the sum of its cells'
  severities plus a regressed-cell count.
- Collapsed by default when a group holds > N cells; expanded groups render
  today's rows unchanged.
- `filterEntries` / `matchesFilter` must apply INSIDE groups, and a group with
  zero matching cells disappears. `countMessage` counts cells, not groups.
- Group header shows the oldest→newest `createdAt` span when a group's cells
  come from different runs (see chunk 3's staleness rule — same root cause).

**Verify:** unit tests on `groupEntries` (single items, one group, mixed, empty
after filter); then the annotator's own Library pairs re-measured
(`refdiff-library-desktop` / `-mobile` of the 8 pairs in
`design/refdiff.manifest.mjs`) — grouping changes row layout, so expect movement
and read the delta rather than assuming 0.

**Docs:** `SKILL.md` gets a sentence in the annotator section that the Library
groups by entry. No manifest change, so no `docs/architecture.md` change.

## Chunk 2 — core persists the set index (enabler, no UI)

The one genuinely new data. Write it per set, alongside the run dirs.

```
out/<root>/<entryId>.set.json     // or sets/<entryId>.json — decide in the chunk
{
  entryId, title, designRef,
  axes: { source: "definitions" | "child-names",      // see the ordering caveat
          properties: { State: ["Default","Hover",…], Size: ["md","sm"], … } },
  pairs:   [{ slug, dir, props: { State: "Default", … } }],
  skipped: [{ nodeId, name, reason, props }]
}
```

- Written by `cli.ts` where `expandVariants` is already called (`cli.ts:720`),
  from data it already holds. Pure shaping function beside the adapter, unit-tested.
- **A subset re-run must not truncate the index.** `--pair ds-checkbox,…` re-runs
  four entries; the other ten sets' indexes stay as they are. Merge, never replace
  the directory's worth.
- **One bad pair must never kill a run** — index writing is per-set and its
  failure is a typed error that does not abort the set.
- `skipped[].props` is new (the reason string alone cannot place a cell in a
  grid). Derive it from the variant name via `parseVariantName`.

**Verify:** unit tests on the shaping function; then a real DS run and assert the
index's `pairs.length + skipped.length` equals the console's
`N variant pairs, M skipped` for every entry — the numbers that exist today only
in a log.

**Docs:** `SKILL.md` — a new artifact in the run root is a report-shape change:
name it where the run artifacts are listed. `docs/architecture.md` — the artifact
table.

## Chunk 3 — the gallery view

Blocked on chunk 0 (comp) and chunk 2 (data).

- `view-math.ts`: add the pure `cellOrigin` composition and a `GalleryLayout`
  (cell → `{ pairDir, rect, row, col }`) built from the set index. Pure,
  unit-tested. Pair view = one cell at the origin.
- Grid sizing: cells differ wildly (a button 76×40, a checkbox row 120×20, an
  alert ~1300×72). Row height / column width from the max of both sides per
  row/column; record the rects so findings and notes can project.
- Findings project by translation (`box + cellOrigin`) — with one rule:
  **frame-level findings render as a cell badge, never a box.**
  `pixel-region/frame` fires on 194/194 pairs and its box IS the whole frame, so
  translated as boxes it would paint every cell solid and make
  highlight/dim/strobe useless at sheet scale.
- **Per-cell staleness is mandatory, not a nicety.** Subset re-runs mean a sheet
  mixes vintages (right now the DS root has checkbox/field cells from 06:29 and
  alert/button cells from a later run). `createdAt` is already in the payload.
  A grid that hides this is a new way to be misled.
- Cell states, three of them: **measured** (verdict + severity badge),
  **skipped** (greyed, with its reason on hover/selection), **absent** (in
  `axes.properties` but in neither `pairs` nor `skipped` — a hole nobody declared).
- Wipe/onion/blink: **per-cell at the same relative position, one global
  control.** A single sweep across the sheet would sit at a different phase in
  every cell and tell you nothing about a variant set. Decide it deliberately;
  do not inherit whatever falls out.
- Notes: clicking a cell's difference authors a note stored in **that pair's**
  run dir in pair-world coordinates, so it appears on the pair view too and
  `annotations.md` keeps working untouched. A note that belongs to no single cell
  needs a set-level home — see open questions.
- Navigation: a group in the Library opens the gallery; expanding the group still
  reaches the per-cell pairs.

**Verify:** the gallery measured against its comp via `design/refdiff.manifest.mjs`,
plus unit tests on `GalleryLayout` and the finding-projection function.

**Docs:** `SKILL.md` — a whole new review surface; the annotator section and the
"read the human's notes" flow both change. `docs/architecture.md`.

## Chunk 4 — manifest hierarchy + label/order overrides

- `manifest.ts`: optional `section?: string` on an entry (`"Core components/Buttons"`),
  validated. Optional second named export `sections` for order/label metadata only.
  Deeper hierarchy than chunk 1's derived level.
- Optional per-entry `gallery?: { columns?: string, rows?: string,
  order?: Record<prop, string[]>, labels?: Record<prop, Record<option,string>> }`
  — which axis is columns, pinned option order (the fallback-order caveat), and
  human labels (`"Focus on text"` → `"Focus"`).
- A `section` path with no entries is a valid pure grouping node (Mato's ask:
  mirror Figma's Core components / Core patterns).

**Docs — this is the chunk with the heaviest obligation.** Per `CLAUDE.md`, a
manifest shape change updates the manifest example in `SKILL.md` AND
`docs/architecture.md`. And: **`population-registry`'s
`frontend/ds/tooling/visual/refdiff.bindings.md` asserts the manifest shape and
its entry inventory** ("11 entries, 152 pairs", the selector templates). Those
bindings go stale the moment this lands — say so in the handoff even though this
repo cannot edit them.

---

## Open questions for the owner

1. **Set-level notes.** A note about no single cell ("this whole warning row is
   too dark") has no owning pair. Store it in a set-level file next to the set
   index, or forbid it and require a cell? Recommend: allow it, set-level file,
   because forcing it onto an arbitrary cell is a lie about where the problem is.
2. **Set index location** — `<root>/<entryId>.set.json` or `<root>/sets/<id>.json`.
   The second keeps the root's run-dir listing clean; the first is one fewer
   directory to special-case in every reader that walks the root.
3. **Collapse threshold** for chunk 1 — **ANSWERED 2026-09-04: always
   collapsed, with no cell-count threshold.** A variant set is one design
   artefact and the Library's job is to pick one of them, so 14 headers is the
   overview and one click is the set — the click chunk 3 turns into the
   gallery. A threshold answers "why is this one open and that one shut?" with
   a tuned number no reader can predict. Two rules bend it and both are
   structural rather than tuned: a group of ONE cell is drawn as its card
   (`isFoldable`), and an ACTIVE filter expands everything that survived it —
   the reader has already narrowed, so hiding the matches behind a click would
   be hostile. An explicit toggle wins over both, in either direction
   (`openGroups`, and `lib.opened` / `lib.closed` in `app-shell.ts`). Revisit
   only if chunk 0's comp draws it otherwise.

## Design asks (chunk 0)

Two comps. Realistic content matters: the sheets this has to survive are
`ds-checkbox` (45 cells, axes `Selected` × `State` × `hasLabel` × `hasIcon`) and
`ds-button-fill` (41 cells, `State` × `variant` × `iconPlacement`), against a
14-group Library.

**A. Library with groups** — extends `RefDiff Library.dc.html`. Group rows
collapsed and expanded, group roll-up badges, cell counts, a group that owns a
gallery vs a pure grouping node, a mixed-vintage group's `createdAt` span, and
how the existing filter chips read when results are nested.

**B. `RefDiff Gallery.dc.html`** — the variant sheet. Column and row headers from
variant properties; the three cell states (measured / skipped-with-reason /
absent); per-cell severity badge and staleness mark; the selected cell and its
drill-in to the pair view; how the existing tool strip
(Off / Wipe / Onion / Blink / Diff and Findings / Comments / All / Clean) reads at
sheet scale; the cause chips that light up matching cells; and authoring a note
on a cell without leaving the sheet.
