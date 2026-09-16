# Sets — §1b of the loop

Read this when the run expands `design.variants` into many pairs, or when you run a whole
manifest. It sits between `SKILL.md` §1 (how to run) and the phase file (`polish.md` /
`reconcile.md`): the phase is still read per PAIR, but the loop, the iteration bound and the
thing you read instead of forty `findings.json` are all per SET.

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
  `Findings by type` table shows the property types falling with it — **with one
  measured exception: refusing a pair that was emitting NOTHING makes the
  finding count go UP.** A mis-paired value slot has its text difference
  classified as expected by the data-slot policy, so it consumes one element
  from each side in silence; refusing it turns that into one `missing-element`
  plus one `extra-element`, and no property type falls. Read the `matched`
  SPLIT: a drop that is entirely `slot`, or entirely `geom` with `text` unmoved,
  is localised — and the pairs that moved are the ones to check by hand.
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
  human labels (`configuring.md`, "Declaring the library's shape").
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

