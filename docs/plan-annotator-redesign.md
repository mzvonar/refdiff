# Plan — redesign the annotator to the RefDiff comps, measured by refdiff itself

Started 2026-08-28. **This is the live plan for the annotator redesign.** The
harness plan (`docs/plan-next.md`) is history; this one is about
`packages/annotator` only.

Dogfooding: the annotator app IS the implementation under test, the comps in
`design/refdiff/` are the design, and every claim of progress is a number from
`refdiff summary`, never an eyeball. Bindings: `refdiff.bindings.md`.

## Decisions taken before phase 0 (2026-08-28, with Mato)

| question | decision |
| --- | --- |
| how faithful | **Full adoption** — build the comps' affordances for real, AND keep every feature the annotator already has. Nothing gets dropped to make a finding go away. |
| fonts / icons | **Self-host** IBM Plex Sans + IBM Plex Mono + a subsetted Material Symbols Outlined as woff2 under `packages/annotator/assets/`, served on a `/fonts/` route. The app must look right offline; the comps do not (they hydrate from unpkg + Google Fonts) but the app is not allowed that excuse. |
| fixture data | **Build a matching demo out root** whose run dirs mirror the comps' demo data exactly, and point the manifest at it. Without shared text there are no alignment anchors, and every position/size finding is noise. |
| where the fixture lives | **`fixtures/demo-root/`**, NOT `out/demo/` (corrected 2026-08-28). `.gitignore:9` ignores `out/` wholesale — "comparison run artifacts (never commit captures/diffs)" — so a fixture under `out/` could never be committed and would never reach another machine. Keeping the ignore rule absolute also keeps it meaningful: nothing under `out/` is ever source. |
| features the comps never drew | listed in "Design gaps" below — Mato updates the design; the phase that needs one stops and asks rather than inventing. |

## Baseline (2026-08-28, before any redesign work)

`out/refdiff/summary.md`, manifest pointed at the real `out/` root:

| pair | verdict | findings (c/M/m) | inst | conf |
| --- | --- | --- | --- | --- |
| refdiff-compare-mobile | FAIL | 108 (56/33/19) | 108 | 0.00 |
| refdiff-library-mobile | FAIL | 230 (59/109/62) | 332 | 0.00 |
| refdiff-library-desktop | FAIL | 272 (98/127/47) | 310 | 0.00 |
| refdiff-compare-desktop | FAIL | 788 (111/618/59) | 834 | 0.00 |

Total 1398 findings / 1584 instances, 0 suppressed. **Confidence 0.00 on all
four** — there are almost no unique text anchors shared between comp and app,
so today's `position` / `size` findings carry no information. Phase 0 exists to
fix that before anything is "improved".

The run dirs behind these numbers live under `out/`, which is gitignored — the
baseline is REPRODUCIBLE ONLY ON THE MACHINE THAT RAN IT, and the table above is
the durable record. Do not try to regenerate it on another machine: phase 0
changes the served root, so phase 0's "after" is measured against the fixture
root and is not comparable to this table anyway. Compare within a phase, not
across phase 0.

Top causes at baseline (`summary.md`): 323 critical `missing-element` and 614
major `extra-element` on text — overwhelmingly the comps' demo copy vs the
app's real run dirs, i.e. DATA, not drift. 6+ `typography` causes are the
`system-ui` vs `IBM Plex Sans` family split. That is what phases 0 and 1 remove.

---

## Loop rules (every phase obeys these)

1. **Measure, never eyeball.** A phase is done when its numbers moved, recorded
   in its entry below. `expected`/`actual` first, crops second.
2. **Never edit a comp to make a finding go away.** If the comp is wrong or
   silent, it is a Design gap — stop and ask Mato.
3. **Intended deviations are `accepted` with evidence** in
   `design/refdiff.manifest.mjs`, never silent. Suppression stays visible.
4. **Tests travel with markup.** `packages/annotator/test/{render,app-shell,index-view}.test.ts`
   assert the DOM; changing it changes them in the same edit. `pnpm test` and
   `pnpm typecheck` green before a phase is marked DONE.
5. **`pnpm dev` must be running** — the linked CLIs run from `dist`; a source
   edit is invisible until tsc rebuilds.
6. **The skill ships with the code** (CLAUDE.md hard rule). If a phase changes
   a flag, a default, or what the annotator does, `skills/refdiff/SKILL.md` and
   `refdiff.bindings.md` change in the same phase.
7. **A regression stops the phase.** `delta.regressions` / a `REGRESSION:` line
   means fix that before continuing.

### The measure step (run at the start and end of every phase)

```bash
pnpm dev                                                   # keep running
svc up annotator   # = refdiff-annotator fixtures/demo-root --serve; 7378 or the next free port (svc ports)
svc restart annotator            # after ANY annotator edit: the shell is rendered at start, dist is not re-read
node fixtures/make-demo-root.ts --now   # the Library's "12 min ago" is wall-clock relative (gap 27)
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff       # the port svc printed; --pair a,b is comma-separated
refdiff summary out/refdiff
node fixtures/make-demo-root.ts         # put the committed clock back (never commit --now output)
```

Network + servers need the Bash sandbox disabled (handoff "Env gotchas").

---

## 0. Demo out root + honest baseline — DONE (2026-08-28)

**Why first:** confidence 0.00 makes every later measurement meaningless, and
1398 findings are mostly the comps' fixture copy arguing with `out/`'s real run
dirs. Give the app the same content the comp draws and the alignment gets real
anchors.

Build `fixtures/demo-root/` — a COMMITTED fixture out root, separate from
`out/` where real results land (this also kills the bindings' "card count
changes with every run" trap, because the served root stops being the results
root). It must not live under `out/`: that path is gitignored as run artifacts,
so a fixture there would be uncommittable and invisible to every other machine.

- A generator `fixtures/make-demo-root.ts` (pure builders, effects at the
  edge; `.ts` not `.mjs` so the reports are typed against `ComparisonReport` —
  Node ≥22.18 strips types natively) that writes `fixtures/demo-root/<slug>/` for each of the comps' Library
  items:
  `doc`, `selfie`, `review`, `button`, `card`, `stepper`, `login`, `dash`,
  `detail`, `modal`, `errors` — names, routes, severity counts, comment counts
  and "when" exactly as `RefDiff Library.dc.html`'s `ITEMS`.
- The one opened pair (`onboarding-document-step`, the comp's `doc`) gets a
  FULL run dir: `findings.json` conforming to the real `ComparisonReport` type
  (import the types from `@refdiff/core`, do not hand-roll a shape), the comps'
  findings verbatim (`f1..f6`, plus — after the 2026-08-28 refetch — the
  aggregates `g1` ×14 / `g2` ×5 and the suppressed `s1..s3`, eleven in all:
  titles, `prop`, `expected`, `actual`, `rect`, severity high/medium/low →
  critical/major/minor, `num` → `mark`), and an `annotations.json`
  with the comps' 3 comments (`c1..c3`, statuses update/new/done, the reply on
  `c1` and `c3`).
- `design.png` / `impl.png` for that pair captured from
  `design/refdiff/parts/Artboard Design.dc.html` and `Artboard Impl.dc.html`
  at 680×740 — the exact artboards the comp `dc-import`s, so the canvas
  content matches by construction.
- The other dirs need only what `/api/pairs` reads (a summary-level
  `findings.json`). The comp now lists **12** items, and one of them
  (`Onboarding — Liveness step`, route `/onboarding/liveness`) is
  DELIBERATELY BROKEN — it renders the degraded card. So the demo root ships a
  run dir whose `findings.json` is truncated on purpose, and
  `summarisePairs` must survive it and mark that pair unreadable instead of
  failing the whole list (the fifth project principle, applied to the list).
  That is a CODE change in `packages/annotator/src/cli.ts`, not just fixture
  data — today an unreadable `findings.json` in one child would break
  `/api/pairs`.

Then: repoint `design/refdiff.manifest.mjs` — `COMPARE_ROUTE =
"/#/onboarding-document-step"` — and update `refdiff.bindings.md` (impl is now
`refdiff-annotator fixtures/demo-root --serve`; the results root `out/refdiff`
is no longer served, so drop the trap note and add "the demo root is a
committed fixture; regenerate with `node fixtures/make-demo-root.ts`").

NOTE the comps hardcode `ROOT = '~/Development/refdiff/out/demo'` in the error
state's copy. That costs nothing: the error box only renders when `loadState`
is `server`/`endpoint`, and the prop defaults to `ready`, so the captured comp
never shows that string. It also means **the error states, like the light
theme, ship UNMEASURED** — `DcHtmlSource` cannot set a prop when capturing
(see gap 20). Build them from the spec in section C; do not expect a number.

**Exit:** the measure step run, numbers recorded here, and **alignment
confidence above 0.5 on at least the two compare pairs** (or, if not, the
reason measured and written down — that is itself the finding). Findings that
remain are chrome and layout, not copy.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

What shipped: `fixtures/make-demo-root.ts` (typed against `ComparisonReport`
/ `AnnotationSet` via the built dist; `fixtures/tsconfig.json` is part of
`pnpm typecheck`), `fixtures/demo-root/` with 12 run dirs, the opened pair
captured from `parts/Artboard Design|Impl.dc.html` at 680×740 @2x with
`elements.json` (27 leaves a side; the three comments are anchored to real
elements: `Veriflow`, `Photo page with MRZ visible`, `Continue`), and
`onboarding-liveness-step/findings.json` truncated on purpose. Code:
`packages/annotator/src/report-file.ts` (`parseReport`, pure, tested) —
`/api/pairs` lists an unreadable run dir as `{ dir, broken, reason }` and the
Library draws a degraded card (`index-view.ts` `brokenCard`); the request
handlers and the `--emit` set path no longer `process.exit` on one bad pair.
Manifest `COMPARE_ROUTE = "/#/onboarding-document-step"`; bindings rewritten;
`services.toml` gained `[annotator]` (svc allocated **7379** — 7378 is held
by another worktree's annotator on this box).

"Before" on this machine: none — `out/` does not exist here (the baseline
table above ran elsewhere and is, as stated, not comparable). The table below
is the phase-0 baseline every later phase compares against.

| pair | verdict | findings (c/M/m) | inst | supp | conf (X / Y) | basis | delta |
| --- | --- | --- | --- | --- | --- | --- | --- |
| refdiff-library-desktop | FAIL | 405 (133/204/68) | 509 | 0 | 0.00 (0.09 / 0.00) | anchors | – |
| refdiff-compare-desktop | FAIL | 361 (120/156/85) | 495 | 0 | 0.00 (0.53 / 0.07) | anchors | – |
| refdiff-library-mobile | FAIL | 343 (49/192/102) | 537 | 0 | 0.00 (1.00 / 0.00) | anchors | – |
| refdiff-compare-mobile | FAIL | 118 (56/38/24) | 135 | 0 | 0.00 (0.00 / 0.00) | none | – |

Total 1227 findings / 1676 instances (baseline elsewhere: 1398 / 1584 — a
different fixture, do not read it as a delta). All four captures report
`scope screen-label fluid` at the pair viewport.

**Confidence stayed 0.00 — the exit's "reason measured":** the anchors now
EXIST (shared unique texts per pair, from `elements.json`: library-desktop
**11**, library-mobile **11**, compare-desktop **12**, compare-mobile **1**;
before phase 0 the card names and finding titles matched nothing) but they
disagree on geometry, which is precisely what the later phases change:

- **compare-desktop:** two clusters. The 9 finding titles agree with each
  other (dx −7) and the 3 topbar anchors (`Split`, `Diff`, the pair title)
  agree with each other, but the clusters are **~1015px apart in x** — the
  app's 340px LEFT rail vs the comp's 320px RIGHT rail (phase 4). Within the
  rail the titles scatter dy −268..107: the app's rows are taller and ordered
  differently (phase 4). confidenceX 0.53 is the topbar half holding.
- **compare-mobile:** ONE shared anchor (`Design`), so `basis none`. At 390px
  the app shows its one-side-at-a-time chrome (`‹ All pairs`, `FAIL · threshold
  major`, `8 findings · 3 notes`) and the comp its bottom sheet
  (`8 findings · 3 comments`); nothing else overlaps (phases 3–5).
- **library-desktop:** the 11 card NAMES match (that is the fixture working),
  dx −874..769 / dy −790..18 — a 2-column list vs the comp's 4-column
  `minmax(250px)` grid, AND a different order: the app sorts run dirs by name,
  the comp lists by recency (phase 2 — sort by `createdAt` desc, cheap and
  worth doing first).
- **library-mobile:** dx = 1 on all 11 anchors (x is already right); dy
  −985..490 from row order + row height (phase 2).

Causes that closed: the copy. The comps' item names, routes, finding titles
and comment texts are now the app's data, so `missing-element` /
`extra-element` on text is chrome copy (`12 pairs`, `7 failing · …`, ISO
timestamps, `+N new / −M resolved`, `42%`), not fixture-vs-run-dir noise.
Causes that did not: `typography` (`system-ui` vs IBM Plex — phase 1), every
`position` / `size` / `spacing` (frame unverifiable at 0.00), `color` /
`border-radius` (phase 1 tokens), and the pixel channel refuses to run on all
four (correct under the gate).

Discovered while building (added to Design gaps, section E): 23 the opened
pair's delta, 24 pending run states, 25 thumbnails for pairs without a PNG,
26 the aggregate `cause` line, 27 relative "when" vs a fixed clock, 28
`reply` on the fixture's comments.

---

## 1. Design tokens, theme, and self-hosted type — DONE (2026-08-28)

One pass over `render.ts` `CSS` + `app-shell.ts` `INDEX_CSS`; no markup moves.

- Replace the navy palette with the comps' token set, same names so the CSS
  reads like the comps: `--bg0 #2a2b2e --bg1 #333438 --bg2 #3c3d42 --bg3 #46474d
  --line #4c4d54 --txt #e7e9ec --txt2 #a6abb3 --acc #5b8def --canvas #232427`,
  plus the light set (`--bg0 #dfe1e4 … --acc #2f6fed --canvas #c6c9ce`).
  Existing names (`--bg --panel --ink --muted --accent`) become aliases or get
  rewritten everywhere — one or the other, not both.
- Severity: comp `high #e5484d / medium #f5a623 / low #4c9aff` onto refdiff's
  `critical / major / minor`. Note the comp's Library also uses status colors
  `#46a758` analyzed/clean, `#f5a623` processing, `#8f8f96` queued, and comment
  statuses `#8f7ee7` new / `#f5a623` update / `#46a758` done.
- Fonts: download IBM Plex Sans (400/500/600/700), IBM Plex Mono (400/500) and
  a **subset** Material Symbols Outlined. The exact glyph set, extracted from
  both comps on 2026-08-28 (52 glyphs; the artboard parts' `badge`,
  `directions_car`, `public`, `upload_file` are EXCLUDED — they are the fake
  app inside the design fixture, which our app renders as a PNG screenshot,
  not as chrome):

  ```
  add add_comment arrow_back arrow_right_alt auto_awesome broken_image
  center_focus_strong chat_bubble check close cloud_off compare_arrows
  computer content_copy crop_free dark_mode description design_services
  difference error expand_less expand_more filter_alt_off fit_screen flare
  folder_open hub light_mode link link_off north_east north_west opacity
  pan_tool power_off refresh remove right_panel_close right_panel_open
  search select_all smartphone sync_alt tonality trending_down trending_flat
  trending_up undo visibility visibility_off warning width
  ```

  Regenerate the list rather than trusting it if a comp changes — from BOTH
  the markup and the script: `grep -oh 'class="msi"[^>]*>[a-z_]*<'
  design/refdiff/*.dc.html` sees only static markup, and a third of the
  glyphs are named in state arrays (`toolBtns`, `layerBtns`, `variantBtns`:
  `pan_tool`, `difference`, `tonality`, `trending_*`…); add a grep for quoted
  `[a-z_]+` tokens inside the `<script type="text/x-dc">` block and let the
  Fonts API's `icon_names=` request reject the non-icon words (an unknown
  name fails the fetch, so the fetch IS the check). A missed glyph renders as
  its name in letters.
  Store under `packages/annotator/assets/fonts/`, add to the package `files`,
  serve on `/fonts/` from the `handle` hook in `packages/annotator/src/cli.ts`,
  and inline the `@font-face` rules in `CSS`. The emitted (`--emit`) report has
  no server — decide there between base64-inlining the woff2 or degrading to
  system-ui, and record the decision.
- Theme toggle in both routes (the comps put it top-right in the topbar),
  persisted next to the other controls in `localStorage` (`vc-controls`).

**Exit:** `typography` and `color` causes in `refdiff summary` measured before
and after; the family-mismatch cause gone.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

What shipped: `packages/annotator/src/fonts.ts` (pure: the face list, the
`@font-face` block, the comps' `.msi` rule verbatim, and the `/fonts/<file>`
whitelist; tested) + `assets/fonts/` (196 KB: IBM Plex Sans **variable** latin
+ latin-ext — Google serves one file for 400–700 — Plex Mono 400/500 ×2
subsets, Material Symbols Outlined subset via the Fonts API's `icon_names=`,
so no fontTools; `package.json` `files` carries `assets`). `cli.ts` serves
the faces from `../assets/fonts/` next to `dist`. `render.ts` `CSS`: the
comps' tokens under the comps' names on `:root` (old `--bg/--panel/--ink/
--muted/--accent` REWRITTEN, not aliased; the three scattered `:root` blocks
folded into one), `body.cc-theme-light` override, `--diff` = the comps'
Highlight `#ff5cd0` (strobe alternate swapped to the old green so the pulse
still changes hue), flat `--canvas` panes instead of the navy checkerboard,
`button, input, select, textarea { font:inherit }` (the toolbar measured as
Arial 13.33px until then). Theme toggle (`.theme-toggle`, 32px/radius 7,
`light_mode`/`dark_mode` ligatures) in the report header and the index head,
persisted as `theme` inside `vc-controls` but written by `saveTheme()` alone —
on the index route no report is open and a full `saveControls()` would persist
unloaded defaults. Verified in a real browser: `document.fonts` reports the
Plex + icon faces `loaded`, zero non-200 `/fonts/` responses, the toggle
survives a reload. **`--emit` decision: degrade** — the emitted report.html
keeps the relative `fonts/` URLs, which resolve to nothing off disk, and the
stacks fall through to system-ui; inlining ~200 KB of base64 per run dir is
the bloat the app shell exists to avoid (recorded in `fonts.ts` and
`docs/architecture.md`).

| pair | before findings (c/M/m) / inst / conf | after findings (c/M/m) / inst / conf | family mismatch (system-ui + Arial) | typography | color |
| --- | --- | --- | --- | --- | --- |
| refdiff-library-desktop | 405 (133/204/68) / 509 / 0.00 | **390** (133/177/80) / 457 / **0.08** | 29 → **0** | 29 → 26 | 32 → 25 |
| refdiff-compare-desktop | 361 (120/156/85) / 495 / 0.00 | **339** (118/133/88) / 459 / **0.13** | 27 → **0** | 27 → 26 | 25 → 15 |
| refdiff-library-mobile | 343 (49/192/102) / 537 / 0.00 | **323** (56/168/99) / 492 / 0.00 | 23 → **0** | 25 → 20 | 31 → 24 |
| refdiff-compare-mobile | 118 (56/38/24) / 135 / 0.00 | **116** (57/29/30) / 124 / **0.25** | 8 → **0** | 8 → 6 | 8 → 7 |

Total 1227 / 1676 → **1168 / 1532**, 0 suppressed either side. Confidence
went UP on three pairs (Plex metrics put the shared anchors closer to the
comp's geometry) — the count did not fall by lowering it. The "before" here
reproduced phase 0's table exactly, so the two are one baseline.

Causes that closed: every `fontFamily=… → system-ui` row (the top typography
cause, 6+ rows, 85 findings across the four pairs) and the `Arial` row from
form controls; the navy-vs-grey text colours (`rgb(230,236,245)` etc.) are
now the comps' `--txt`/`--txt2` values. Causes that did not — all markup,
i.e. later phases: **Mono vs Sans** on routes / delta / mono lines (26
findings — the comp sets `IBM Plex Mono` per element, phases 2 and 4);
**Material Symbols vs Sans** where the comp draws an icon and the app draws
a word or nothing (phases 2–3 place the icons); size/weight rows (11.5/600
chips vs 13/400 text — chip geometry, phase 2); the remaining `color` rows
are WHICH element is muted (`--txt2` vs `--txt` on chips and counts) and the
`#111` text on amber badges (the comps use dot-badges with coloured text,
phase 2), not the token values. `border-radius` / `border` unchanged (markup).

**`11 REGRESSION(S)` on the final run — examined, not a regression.** All
eleven (library-desktop 5, compare-desktop 5, library-mobile 1) are findings
present by the same id in the before run, the intermediate run and the final
run: text-keyed findings with several same-text candidates ("3", "4", "5" on
badges, "Figma", "Diverging", "warning") whose one-to-one nearest-box pairing
re-shuffled when the type metrics changed, so one instance entered
`resolved-ledger.json` as resolved in the intermediate run and read as
"back" in the final one. Nothing phase 1 introduced came undone. The general
shape is now in `SKILL.md` ("Reading the measurements" → `regressions`).
Harness note for later: `delta.ts` pairs by key + nearest box; a font swap
moves every box a few px at once, which is exactly the churn its text-keyed
identity was meant to avoid — worth a test with N same-text findings once
the redesign is landed.

Light theme ships UNMEASURED by decision (gap 20); both themes eyeballed once
for a contrast blunder, none found — that is not a parity claim.

---

## 2. Library route to the comp — DONE (2026-08-28)

`app-shell.ts` (`#view-index`, `INDEX_CSS`, `APP_BOOT`) + `index-view.ts`
(`pairCard`, `pairCards`, `sortEntries`, `filterEntries`, `errorBox`) +
`index-view.test.ts`.

- Sticky 46px topbar: accent rounded square, "RefDiff", `chevron_right`, the
  root/project name, spacer, layout toggle (`computer`/`smartphone`), theme
  toggle. 1180px max-width container, 20px 16px 40px padding. (The layout
  toggle turned out to be the comp's design-preview switch, not a product
  control — removed 2026-08-28, its icon excused by content.)
- Head row: "Library" 19px/700 + `N of M items`.
- Filter row: search field with the `search` icon (36px, radius 9, flex 1,
  max 340) · type chips · 1px×20px divider · state chips. Chip geometry from
  the comp (`6px 12px`, radius 999, 12px/600, active = `--acc` fill).
- Desktop grid `repeat(auto-fill,minmax(250px,1fr))` gap 14; card = 120px
  thumbnail band (`--bg2`, bottom border, the inner 64%×78% plate) with the
  status pill absolutely at top 8 right 8; then 12px 14px body: name + type
  badge, mono route, severity dot-badges, `chat_bubble` comment count,
  right-aligned relative "when".
- Mobile (<640px) row list: 44px icon tile, name + type badge, badges +
  comments, status pill at the end; `max-width:420px` centered above 640.
- Keep and place: `PASS/FAIL`, confidence + gate, suppressed count, delta,
  `design → impl` sources, absolute timestamp — see Design gaps A.

**Exit:** `refdiff-library-desktop` + `refdiff-library-mobile` measured;
remaining findings are a short list of genuine deltas.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

What shipped: `index-view.ts` rewritten to the comp — the thumbnail card
(verdict pill top-left, state pill top-right, name + source chip, mono route,
severity dot-badges + comment count, trend / `+N new / −M resolved` / when
footer, the confidence WARNING line under the 0.5 gate) and the mobile row
(44×56 tile, name + verdict, source + badges + comments, trend + delta);
`sortEntries` (newest first, ties in dir order, no readable time last);
`filterEntries` (search over name + route, source chips Both / Figma / Claude
Design, state chips Any / Failing / Critical / Diverging / Low confidence /
Has comments); `errorBox` + auto-retry (section C states A and B, from spec,
unmeasured); the degraded card with the comp's copy. `app-shell.ts`: brand-only
46px topbar with the layout toggle (`computer`/`smartphone`, forces the row
list, not persisted — the comp's preview aid; REMOVED 2026-08-28, it is the
comp's design-preview switch and no product control) and the theme toggle; the head
row `N of M comparisons`; `INDEX_CSS` to the comp's values;
`line-height:normal` on the Library (the comp sets none; the report's 1.4 made
every row taller). `/api/pairs` gained `implRef`, `implPng` (only when the
file exists), `delta {introduced, resolved, regressions}`; `parseReport`
gained `salvage` — a `findings.json` cut mid-write still yields `pair`,
`createdAt`, `impl.ref`, so the degraded card shows the name and route and
keeps its slot in the list (that IS the comp's broken card; no gap).
Manifest: `LIBRARY_IGNORE` on both Library pairs — three `textPatterns`
(the run-state vocabulary, the relative-time vocabulary, the parser message)
and three `accepted` (the D6 thumbnail image, the `Major 2`/`Minor 2` counts).
Fixture: every item carries a delta (`+0/−0` is one), the opened pair's with
`regressions: [f1, g2]` (gap 23, below); the two timeless items and the broken
run got times that reproduce the comp's order; `--now` shifts every timestamp
to the wall clock for a measure. The one comp-vs-render call: the search
field's `max-width:340px` is in the comp's SOURCE but not in its RENDER (226px
at 1180, the full 358px row at 390) — the render is what refdiff measures, so
the app has no cap; Mato may want to know.

| pair | before findings (c/M/m) / inst / supp / conf | after findings (c/M/m) / inst / supp / conf |
| --- | --- | --- |
| refdiff-library-desktop | 390 (133/177/80) / 457 / 0 / 0.08 | **9** (2/5/2) / 16 / 21 / **0.90** |
| refdiff-library-mobile | 323 (56/168/99) / 492 / 0 / 0.00 | **5** (0/3/2) / 5 / 10 / **1.00** |
| refdiff-compare-desktop | 339 (118/133/88) / 459 / 0 / 0.13 | 342 (118/136/88) / 462 / 0 / 0.13 — the opened pair's new delta strip (+3 texts; phase 3 accepts or matches it) |
| refdiff-compare-mobile | 116 (57/29/30) / 124 / 0 / 0.25 | 116 (57/29/30) / 124 / 0 / 0.25 — unchanged |

Total 1168 / 1532 → **472 / 607**, 31 suppressed, every one visible in
`findings.json` (26 `text-pattern`, 5 `accepted`). Confidence went UP with
every step; the pixel channel now RUNS on both Library pairs (it found the
search placeholder colour, fixed).

The staircase, each step measured (desktop / mobile):

1. markup to the comp: 390 → 208 (conf 0.20) / 323 → 156 (0.41).
2. ORDER — newest first, plus fixture times for the comp's two timeless
   items: 208 → **101** (0.76) / 156 → **54** (0.89). The single largest
   cause: refdiff matches card N to card N, so a different list order reads
   as a text-content / colour finding on every pill, badge and chip.
3. the gap decisions as policy + the opened pair's delta + `--now` + the
   interpolation spans + the curly apostrophe: 101 → 42 / 54 → 22.
4. the broken run's salvaged `createdAt` (its slot in the list): 42 → 9 /
   22 → 6.
5. the search input as the comp has it (UA placeholder colour, UA padding,
   `appearance:none`): mobile 6 → 5.

**The short list of genuine deltas that remain** (all read from
`findings.json`, none suppressed on purpose):

- desktop f2–f4, mobile f1–f5: decision D6 — the opened pair's REAL
  `impl.png` where the comp draws three grey plate bars. Boxes carry no text,
  so no content-shaped rule can name them; `{type, role}` alone would accept
  every missing box in the pair and a `regions` entry has no `reason` field.
  Left visible on purpose (5 + 3 findings).
- desktop f1, f5–f9: the dropped `Pending` chip's 78px — the search field is
  `flex:1` and absorbs it, so every chip after it shifts and the nearest-box
  pairing reads `Figma`↔`Claude Design` (gap 24, below). Six findings.

`REGRESSION` lines appeared on three intermediate runs (R1, R9, R6, R7, R2);
every one was the text-keyed reshuffle shape from phase 1 (same-text
candidates — "1", "5", "Major 2", `chat_bubble`, `trending_flat` — re-paired
as every box moved), present by the same id in the run before. The final runs
report none.

Causes that closed: the copy-vs-chrome split (chips, pills, badges, the
footer), `IBM Plex Mono` on routes and delta labels, the chip geometry
(11.5/600 vs 13/400, radius 999), `Material Symbols` where the comp draws an
icon, the muted-vs-ink colour rows, the amber badge with `#111` text. Causes
that did not: none the Library owns — what is left is the two lists above.

Decided in this phase (gap numbers in section E):

- **23 → (b).** The opened pair HAS a previous run: the Library card
  (`+3 new / −1 resolved`, Diverging) and the Tool's `Regression` tags on
  `f1` / `g2` both say so; only the Tool's `showDeltaStrip` prop (default
  false) does not, so section C's "no previous run" is REVERSED and the
  fixture writes `delta { resolved: 1, introduced: [f1, f2, g2],
  regressions: [f1, g2] }`. Cost: the compare-desktop pair shows the strip
  (+3 texts) that the comp capture hides — phase 3 accepts it with this
  reason, or Mato flips the prop default. Option (a) was measured first: the
  card's one-line `first run` footer made the doc card 15px shorter than the
  comp's two-line footer and shifted every card below it (a ×39 position
  finding), which is why (b) won.
- **24 → no pending state.** `collectRunDirs` lists only dirs that HAVE a
  `findings.json`, and the list is fixed at startup, so "a dir without a
  report" cannot be a Pending source without rescanning the root per request
  — not this phase. The two zero-finding runs render `Pass · Clean`; the
  comp's `Pending` verdict, `Processing` / `Queued` pills and `running` /
  `waiting` times are excused by a content-shaped `textPatterns` rule that
  expires the moment the comp stops using those words. The `Pending` chip
  is NOT drawn: a filter that can never match is worse than a missing one.
- **25 → the plate.** A run without `impl.png` shows the comp's grey plate
  (desktop band and mobile tile); the opened pair shows its real capture.
- **27 → wall clock, and `--now` for a measure.** "12 min ago" means 12
  minutes before the reader's now, nothing else. The fixture keeps its fixed
  clock in git; `node fixtures/make-demo-root.ts --now` shifts it to the wall
  clock right before a measure (the strings agree only until the next minute
  ticks — session 15 read 0.89 / 29 suppressed three minutes after `--now`;
  the drift is excused by the relative-time `textPatterns` rule, but each
  excused string is an anchor lost, so `--now` and `compare` go in ONE
  command line),
  and a plain regeneration puts the committed clock back.
- **3 (suppressed count) and 4 (regressions) are not on the card**: the
  refetched comp has no slot for them (STATUS says the design is complete),
  so they live in the rail (phase 4) and the strip (phase 3). The card's
  `delta` is the trend + `+N / −M` label, as drawn.
- **Broken card**: what the cut file still says (name, route, time) is shown;
  the dir name is the fallback. The comp's dashed card with name + route is
  therefore matched, not a gap.

Light theme, the error states, the forced-mobile layout and the empty state
ship UNMEASURED by decision (gap 20, section C).


---

## 3. Comparison tool — chrome, tool strip, canvas overlays — DONE (2026-08-28)

`render.ts` `REPORT_BODY` + `CSS` + the toolbar half of `CLIENT`.

- 46px topbar: `arrow_back` to the library, brand square, "RefDiff", pair
  title; spacer; segmented **Split / Full**; segmented **Off / Wipe / Onion /
  Blink / Diff**; segmented **Findings / Comments / All / Clean** (the layer
  group — generalises today's single `marks` checkbox); spacer; theme toggle.
  Segment geometry: group `--bg2` + `--line`, radius 8, padding 2, gap 2;
  button `5px 10px`, radius 6, active `--bg3`.
- Left 44px tool strip (mobile: floating pill bottom-left, `left 8 bottom 56`):
  `pan_tool` pan · `center_focus_strong` focus · `add_comment` comment ·
  `difference` highlight · `tonality` dim. 32px, radius 7, active = `--acc`
  fill. These map exactly onto `#move-toggle`, `#focus-toggle`, `#ann-draw`,
  `#diff-toggle`, `#dim-toggle`.
- Floating zoom pill (`remove` / `NN%` mono / `add` / `fit_screen`).
- Align pill + dropdown: lock button, then icon + label + chevron; the menu
  lists Anchors (`hub`), Width (`width`), Top left (`north_west`), Top right
  (`north_east`) with the comps' description copy and a `check` on the active
  one. `AlignMode` already is `anchors | width | left | right` — only the lock
  (per-pane pan when unlocked) is new.
- Focus chip top-center: `center_focus_strong` + message + "Edit"/"Done" +
  "Clear" (the toggle came 2026-08-29 with the settled/adjusting states: `edit`
  when settled, `check` + "Done" while adjusting).
- Mobile: the layer segment strip under the header with a "Show" label.
- Canvas: `--canvas` background, pane label pills (mono 10px/700, letter
  spacing .1em, shown only when the variant is Off and not mobile), wipe
  handle with the `sync_alt` knob, dim mask as the comps' SVG mask (radius 8
  holes), mark badges.
- Keep and place: **Strobe**, the lab **amount** slider, the "all instances"
  toggle, the keyboard-shortcut hint — see Design gaps B.

**Exit:** `refdiff-compare-desktop` chrome causes measured.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

What shipped (`render.ts` `REPORT_BODY` + `CSS` + the chrome half of
`CLIENT`; `view-math.ts` labels/icons/menu copy): the comps' 46px topbar
(`arrow_back` to the Library, brand square, "RefDiff", pair title; the
**Split / Full**, **Off / Wipe / Onion / Blink / Diff** and **Findings /
Comments / All / Clean** segments at the comps' geometry; theme toggle) —
the verdict pill, c/M/m counts, source/alignment kv lines, `findings.json`
link and the shortcut hint line are gone (gap 14; the refs and the fit live
in the pane labels' and align pill's `title`s; gap 18 stays deferred, keys
in the tool titles). The **delta strip** (gap 15) under the topbar: mono run
label, `+N introduced` / `−M resolved`, and on a regression the red tint +
3px edge, "N regressions · fixed earlier, back again — fix plan halted" and
**Review** (narrows the list to `delta.regressions`) and dismiss `close` —
in BOTH states since 2026-08-28 (the comp hides the × while a regression is
in it; decided otherwise: the strip stops the reader once, the rail keeps the
tag; the app's × is `accepted` by content in the manifest). Since 2026-08-29
the × is REMEMBERED per pair in localStorage and expires on content — a
regression the dismissal never saw re-opens the strip (architecture.md). The 44px **tool strip** (`pan_tool` · `center_focus_strong`
· `add_comment` · `difference` = Highlight · `tonality` = Dim · `flare` =
Strobe; 32px, radius 7, `--acc` fill; floating pill bottom-left on the
phone) — gaps 16 and 17 turned out RESOLVED IN THE COMP (`toolDefs` carries
`strobe`, `opShow` the opacity pill). Floating **zoom pill** (`remove` /
mono `NN%` / `add` / `fit_screen`), the **Design / Impl fab** in Full mode,
the **opacity pill** for Onion (55%) and Diff (100%, now adjustable — one
amount per blend, `labAmount { onion, difference }`), the **align pill**
(lock — gap 22, per-pane pan/zoom when unlinked, `l`; icon + `Anchors` /
`Width` / `Top left` / `Top right` + chevron; the amber `warning` badge and
border under `CONF_MIN = 0.5` on Anchors only — gap 2) with the **Align lock
mode** dropdown (`hub` / `width` / `north_west` / `north_east`, the comps'
descriptions, the Anchors row's warning line, `check` on the active one),
the **focus chip** ("Region focus · N of M findings · Edit · Clear") and a
`lab-note` pill in the same slot for the stretch / highlight-count notes.
Canvas: `--canvas` panes, `DESIGN` / `IMPLEMENTATION` mono-caps labels
(hidden while an overlay is on, and on the phone), the **wipe handle** (a
curtain at a WORLD x — the ghost clipped `inset(0 0 0 …)`, the comps'
`sync_alt` knob; the old percentage curtain is gone), dim mask holes 6px
round each box with 8px radius at `rgba(15,17,20,.5)`, Highlight boxes =
EVERY listed finding's box (1.5px `#ff5cd0`, 8% fill, radius 4) plus the
pixel channel's regions (it used to light only regions + presence findings —
the demo pair has neither), blink 650ms. **Marks are the comps' badges**:
24px severity circles at the box's top-left corner, 18px hollow ones for
repeat instances, 22px rounded squares in the status colour for comments —
HTML divs, not SVG `<text>` (the extractor never saw an SVG number: 22
badge digits measured missing/extra until they became DOM) — and the box
itself only while selected (4px-padded outline) or through Highlight / Dim.
`showMembers` defaults to **false** (the comps' `allInst`; gap 12 — a ×15
aggregate carpeted the artboard). Breakpoints are the comps' (**< 760px**
phone, < 1120px shortens the layer labels to `Find.` / `Comm.` and drops
the pair title). `fitView` defaults to the comps' fit (24px air, capped
1.6×): the mobile zoom went 53% → the comp's 50%. The layer segment
generalises the old `marks` checkbox (`layer: findings | items | all |
none`, persisted in `vc-controls`; Comments off hides comment shapes, never
the focus region). Parked until phase 4 (the rail): the `all instances`
checkbox and the `annotations.json · N loaded` status line sit in the rail's
filter block; the bottom detail panel and its crops stay.

Harness fixes this phase surfaced (both with tests that fail without them):

- `policy.ts` `findingTexts` tested `textPatterns` against the text quoted in
  the MESSAGE, which truncates at ~40 chars — an anchored pattern could never
  excuse a long label on a missing/extra-element finding. `f.text` now comes
  first, in full.
- `dc-html.ts` RELOADS a fluid comp at the pair viewport instead of only
  resizing: the Tool comp's `fit()` runs once on load, so under the 120px
  slack canvas it fitted for a 1480px window and never re-fitted — its zoom
  read 75% against the app's 67% and every badge sat where the wider window
  put it. After the reload the comp reads 66% (its true fit at 1360).

Manifest: `COMPARE_IGNORE` on both compare pairs — one content-shaped
`textPatterns` rule for the artboard's vocabulary (the comp imports
`parts/Artboard Design|Impl` as live DOM; the app draws the run's PNGs; the
rule expires with the artboard), one for the delta strip's copy (gap 29),
`accepted` for the two screenshots (D6's reasoning) and the strip's
`warning` icon. The `75%` rule written for the fit artefact was deleted once
the reload made it dead.

| pair | before findings (c/M/m) / inst / supp / conf | after findings (c/M/m) / inst / supp / conf |
| --- | --- | --- |
| refdiff-compare-desktop | 342 (118/136/88) / 462 / 0 / 0.13 | **217** (78/110/29) / 270 / 103 / **0.38** |
| refdiff-compare-mobile | 116 (57/29/30) / 124 / 0 / 0.25 | **34** (6/18/10) / 47 / 40 / **0.52** |
| refdiff-library-desktop | 9 (2/5/2) / 16 / 21 / 0.90 | 9 (2/5/2) / 16 / 21 / 0.90 — unchanged |
| refdiff-library-mobile | 5 (0/3/2) / 5 / 10 / 1.00 | 5 (0/3/2) / 5 / 10 / 1.00 — unchanged |

Total 472 / 607 → **265 / 338**, 174 suppressed, every one visible under
`suppressed`. Confidence went UP on both compare pairs; the final run
reports no regressions. "Before" reproduced phase 2's table exactly.

The staircase, each step measured (desktop / mobile):

1. the chrome to the comp, badges still SVG: 342 → 270 (conf 0.13 → 0.38) /
   116 → 58 (0.25 → 0.54).
2. HTML badges + primary-only + the artboard vocabulary excused: 270 → 224
   (88 suppressed) / 58 → 49.
3. the adapter reload (the comp's fit 75% → 66%): 224 → 223 / 49 → 46 — the
   badge digits now differ from the comp's by the rail side only.
4. the strip's copy excused: 223 → 217 / 46 → 41.
5. the `.badge` class collision with the Library's `.badge` (INDEX_CSS painted
   the number in the fill colour and at weight 600 — invisible numbers,
   caught by the mobile pair's `color "3" … rgb(255,255,255)` rows before
   the screenshot showed it) renamed to `.vmark`, and the comps' fit padding:
   217 → 217 / 41 → **34** (53% → 50%).

**Run B — the strip hidden (measured for gap 29, not shipped):** desktop
210 / conf 0.38, mobile 46 / conf **1.00** (against 223 / 49 / 0.54 at the
same step). The strip's 38px (65px on the phone, where it wraps) is what
breaks the mobile anchors.

**After the flip of gap 29 (2026-08-28, same day, comp's `showDeltaStrip`
default → true, the manifest's strip rule made fold-safe `[−-]\d+ resolved`
and the dead `warning` accept dropped):** compare-desktop **218**
(78/107/33) / 272 / 96 supp / conf **0.36**; compare-mobile **11** (5/6/0) /
11 / 30 / conf **0.93**. The mobile pair is now the sheet (phase 4) plus
three comment-badge digits; on desktop the strip pairs, leaving `-1 resolved`
vs `-6 resolved` excused (the Tool comp's demo delta vs the Library card's,
gap 23) and the 1px divider. The `REGRESSION` lines on that run (10 + 1)
are the same-text reshuffle shape again (digits, `right_panel_close`).

**What remains, all read from `findings.json`:**

- desktop: **178 of 217 involve the rail** (the comp's 320px RIGHT panel
  with tabs, chips, `prop expected → actual` lines and `REVIEW` header vs
  our 340px LEFT aside — phase 4); **36 are badge digits** on both panes
  that sit 331px left of ours for the same reason (the two panes' fits agree
  once the rail moves: the comp reads 66% for a 498px pane, we read 65% for
  488); `pan_tool` (339.5, 37.5) ×10 and `IMPLEMENTATION` (321, 37.5) ×5 are
  the rail side + the strip; the pixel gate line. No topbar / segment / pill
  cause is left.
- mobile: `"Show" offset (0, 65)` ×14 and the 22 badge rows under it are ONE
  cause — the strip (gap 29) pushing everything down and re-pairing the
  badge columns; the sheet's `8 findings · 3 comments · 1 unsaved` /
  `expand_less` vs our summary bar and `▾` are phase 4.

Causes that closed: every toolbar / header copy row (verdict, counts,
alignment kv, `findings.json`, the hint), the `Split`/`Diff` border and
radius rows (segments), `arrow_back` / `pan_tool` / `flare` / `remove` /
`add` / `fit_screen` / `link` / `hub` / `expand_less` / `warning` drawn as
words or missing (Material Symbols placed), `DESIGN` / `IMPLEMENTATION`
mono caps, the zoom pct mono, the `Anchors` colour/border rows (pill), the
member-badge carpet, the 63 artboard texts and the two screenshots
(policy, visible). Causes that did not: the rail (phase 4), the strip's
shift (gap 29), the comp's mobile sheet (phase 4).

Decided in this phase (gap numbers in section E/F):

- **29 (new) → ask Mato.** The comp draws the delta strip but its
  `showDeltaStrip` prop defaults to false, so the capture never shows it;
  decision 23b gave the fixture two regressions, so the app draws it (gap 15:
  impossible to miss). Its copy is excused by policy; its 38px cannot be
  and is measured above. Options: (a) flip the comp's default to true (the
  fixture's state IS the regression state the strip was designed for) — the
  measurement then closes by itself; (b) leave it and carry the shift as a
  known cost through phases 4–5; (c) 23a after all (no delta on the fixture),
  which phase 2 measured as worse for the Library. Recommendation: (a).
- **16 → the comp's own answer**: Strobe is in the tool strip as `flare`, our
  `s` key and coupling (strobe implies highlight) kept.
- **17 → the comp's own answer**: the opacity pill, for Onion and Diff.
- **18 unchanged**: nothing drawn; every tool title carries its key.
- **Fit**: the comps' `fit()` (24px air, 1.6× cap) is now `fitView`'s default.

Light theme, the error states, Full mode, the open align menu, the wipe /
onion / blink / diff overlays, the focus chip and the lab notes ship
UNMEASURED by decision (gap 20 / section C — the comp captures its default
state); each was exercised once headlessly for console errors, none found.
That is not a parity claim.

Notes for phase 4 (all settled there): the comp's `×N` is `1 + inst.length`
(×15 for g1) where `rowHtml` shows `×instances` (×14) — `instances` counts
every distinct place, the comp's demo repeats the primary (gap 33);
`#members` → the `Primary only · N` chip and the selected row's instance
box, `#ann-status` → the row surfaces + the rail status line; the detail
panel and crops went (gap 13); the badge digits paired once the rail moved.

---

## 4. Review rail — Findings and Comments — DONE (2026-08-28)

The biggest single move: the rail goes from a 340px **left** aside to the
comps' 320px **right** panel with tabs.

- Header: `REVIEW` (11px/700, .08em, uppercase) + `right_panel_close`;
  collapsed state = the floating `right_panel_open` + summary chip at top-right
  of the canvas.
- Tabs `Findings · N` / `Comments · N`.
- Findings tab: severity chips with dots; rows = num badge + title + optional
  tag; second line mono 11px `prop expected → actual` with the actual in
  `#e5484d`; when selected, the action row and the "Note for the model…" input.
- Comments tab: draft composer (kind label, "Instruction for the model…",
  Cancel / **Send to model**), rows = num badge + status chip (New / Update /
  Done) + text + the model's reply block (2px `--acc` left border), and when
  selected an "Add another instruction…" input + Send / Done.
- Mobile: bottom sheet — drag handle, summary line, chevron, tap to expand.
- Selecting a finding focuses the canvas on its element (gap 13) — the bottom
  detail panel and its crop images go away; the crop PNGs stay in the run dir.
- `Annotation` gains a `reply` field, written by the model (gap 19).
- Keep and place: **suppressed list**, **aggregate "×N"** + all-instances,
  **delta / regressions** — see Design gaps B. Triage is designed (gap 11);
  the pair verdict header is dropped (gap 14).

**Exit:** `refdiff-compare-desktop` rail causes measured; both compare pairs
converging.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

What shipped: `render.ts` `REPORT_BODY` + `CSS` + the rail half of `CLIENT`,
a new pure `rail.ts` (`propRows` — the `prop expected → actual` line from a
finding's `expected`/`actual`, CSS spelling, px on the px keys, a `position`
finding as the shift `translateY 0px → 23px`, a `size` finding as
`width`/`height`; `railSummary`; `instanceChipLabel` / `aggregateCount`;
tested), `annotations.ts` `reply` (parsed, kept, `setReply`, in the
`annotations.md` digest as `↳ reply:`), `cli.ts` `--reply <text>` beside
`--mark-implemented`. The DOM: `#viewer` first, then `<aside class="rail">`
— the comps' **320px right panel**: `REVIEW` + `right_panel_close`
(collapsed → the floating `right_panel_open` + summary chip top-right of the
canvas), `Findings · N` / `Comments · N` tabs, severity chips with dots and
counts (+ the `Ignored N` / `Snoozed N` chips only when triage exists), the
`crop_free` **Primary only · N** / `select_all` **All instances · M** chip
(gap 12; only while an aggregate is listed), one row per finding (20px
badge, title, `×N` mono chip, the `undo` **REGRESSION** pill, the triage tag
`To fix` / `Ignored` / `Snoozed`, the mono prop line with the actual in
`#e5484d`), and when selected the instance box, **To fix / Ignore / Snooze**
(the active one again clears — the comps' toggle) and the "Note for the
model…" input (gap 11); the **suppressed disclosure** (gap 10: `visibility`
"N suppressed by policy rules" · Show/Hide, rows with the hollow dashed
badge, the `Suppressed` tag, `filter_alt_off` + `<suppressedBy> · <rule>`
from findings.json, the manifest note when selected — no Unsuppress / Edit
rule, section C). Comments: the draft composer (Point / Region comment,
"Instruction for the model…", Cancel / **Send to model**), rows with the
status badge + `OPEN` / `IMPLEMENTED` / `DONE`, the text, the model's
**reply** block (2px `--acc` edge), and when selected "Add another
instruction…" + **Send** (appends ` — <text>` and reopens — the comps'
semantics; the reply stays as history) / Mark done / Reopen / Mark
implemented / Delete. A failed save (section C): the row tints red with the
3px edge, `cloud_off` **Not saved** + `PUT /api/pairs/<dir>/annotations ·
<status>` + **Retry**, the canvas badge's red halo, `· N unsaved` in the
sheet summary; triage rows get the same, a focus save failure the rail's
status line. Comment shapes and badges are drawn on **both panes** (the
comps' `ovA.im` / `ovB.im`; the other side lighter) — a note placed on the
impl was invisible on a phone showing the design. **Selecting focuses the
canvas** on the element (gap 13): the bottom detail panel, its expected/actual
table and its crop `<img>`s are gone; the crop PNGs stay in the run dir.
Mobile: the rail is the comps' **bottom sheet** (44px grip + `N findings · M
comments` + chevron; 52% when open, the tabs and lists inside) over a fixed
canvas — the phone page no longer scrolls. The finding text filter survives
as `/` (gap 31). `#members` / `#ann-status` / `#count` / `#detail` / the
`.row`/`.chip`/`details` CSS are gone; `showSup` joins `vc-controls`.

Two things fixed on the way: an **emitted `report.html` had thrown a
ReferenceError since triage/focus were added** (`renderReport` embedded two
of the five modules the shared client calls — `render.test.ts` now asserts
every source); and the fixture's findings now carry `key` (via core's
`identityKey`), so the demo's triage row works instead of saying "no stable
key".

| pair | before findings (c/M/m) / inst / supp / conf | after findings (c/M/m) / inst / supp / conf |
| --- | --- | --- |
| refdiff-compare-desktop | 218 (78/107/33) / 272 / 96 / 0.36 | **51** (10/30/11) / 63 / 64 / **0.71** |
| refdiff-compare-mobile | 11 (5/6/0) / 11 / 30 / 0.93 | **4** (0/3/1) / 4 / 31 / 0.90 |
| refdiff-library-desktop | 9 (2/5/2) / 16 / 21 / 0.90 | 9 (2/5/2) / 16 / 21 / 0.90 — unchanged |
| refdiff-library-mobile | 5 (0/3/2) / 5 / 10 / 1.00 | 5 (0/3/2) / 5 / 10 / 1.00 — unchanged |

Total 243 / 304 → **69 / 88**, 126 suppressed, every one visible under
`suppressed` (the 30 new ones: the artboard vocabulary now hits the badge
rows the rail shifted, gap 26's two sentences, `×15` / `×6`, "preset
rules", the phone summary). "Before" reproduced phase 3's final table
exactly. Desktop confidence went UP with the count (0.36 → 0.71; X 0.96 /
Y 0.79); **mobile went DOWN 0.03** (0.93 → 0.90) — gap 34: the comp's
summary reads `8 findings · 3 comments · 1 unsaved`, ours the true
`8 findings · 3 comments`, so the one anchor that held the sheet's centre
is gone and the chevron beside it disagrees by 33.5px. Honest, and the
comp's demo data to change, not ours.

The staircase, each step measured (desktop / mobile):

1. the rail on the right with the comps' rows, tabs, chips, disclosure,
   comments and sheet: 218 → **77** (conf 0.36 → 0.75) / 11 → 8 (0.93 →
   0.90).
2. chip and tag labels as their own `<span>` (the comps' runtime renders an
   interpolated label that way, so the extractor's leaf is the text, not our
   bordered `<button>`: four "border the design does not have" rows) and
   comment badges on both panes: 77 → **68** / 8 → **5**.
3. `line-height:normal` on the rail (the report's 1.4 made every chip, tag
   and prop line 1–2px taller, compounding down the list), the `position`
   prop line as the shift, and the phase's policy entries: 68 → **51** /
   5 → **4**.

**Run B — the fixture in the COMP's row order for one run, reverted (gap
32):** desktop **35** (9/19/7) / conf 0.73 at the final build (42 at step 2).
The comp lists 1, 2, 3, 7, 8, 4, 5, 6; refdiff lists 1..8. The **16
findings** between 51 and 35 are that order — every `text reads "4", design
says "7"`, the `Card corner radius mismatch` ×9 offsets, `8` ×3,
`translateY` ×3 — and cannot be closed on the app's side (the fixture would
have to carry marks out of list order, which refdiff never produces).
Measured into `out/refdiff-runB` so the main ledger stays clean.

**What remains, all read from `findings.json` (51 desktop / 4 mobile):**

- **16 — the row order** (gap 32, above).
- **~13 — gap 26's height**: the comp's two cause lines make its g1/g2 rows
  ~20px taller each, so every row and the suppressed toggle under them sit
  20 / 56px lower in the comp (run B's `color` ×6 dy −20, `translateY` ×15
  dy −56, `visibility` / `Show` −58). The sentences are excused; the pixels
  cannot be, and `Finding` has no field to draw them from.
- **8 — the artboard's own DOM**: the step numerals `1 2 3` (×2 panes) and
  the 16×16 logo square (×2; the 12×12 one on the phone) are live elements
  in the comp and pixels in our `impl.png` — the D6 reasoning. Left
  visible on purpose: a per-digit accept would hide a missing badge.
- **~10 — same-text digit reshuffles** across the canvas badges and the rail
  badges (`5` ↔ `4`, `6` ↔ `undo`), which follow the two causes above.
- **mobile 3 of 4 — gap 34**: `expand_less` −33.5 / the summary +33.5 / the
  2px spacing under `Design`; the fourth is the logo square.
- the `arrow_right_alt` ×3 offsets are the prop lines of the rows the order
  moves.

`REGRESSION` lines: 17 + 1 on run 1, 7 on the final run — all the same-text
reshuffle shape (`"Show"`, `"visibility"`, `"REGRESSION"`, the arrows), each
present under the same identity in the ledger from phase 3's intermediate
runs (17:33) or this phase's run 2 (18:35) and back at a new place now that
the rows moved. Nothing phase 4 built came undone; the final run's list is
above.

Causes that closed: the rail side (every `−1029` / `+339` / `+321` offset
row from phase 3), the 36 badge digits, `REVIEW` / `Findings ·` /
`Comments ·` / `Critical 2` / `Major 3` / `Minor 3` / `Primary only · 8` /
`crop_free` / `right_panel_close` / `visibility` / `3 suppressed by …` /
`undo` / `REGRESSION` drawn or missing, every `prop` / `#hex` / `Npx` /
`arrow_right_alt` text of the eight prop lines, the old rail's own copy
(`8 of 8 findings shown`, `all instances`, `annotations.json · 3 loaded`,
`3 annotations — …`, the anchor descriptions, the `suppressed: …` tags),
the chip borders, the `Show` / `IMPLEMENTATION` / `pan_tool` rows, the
sheet's `expand_less` and summary on the phone. Causes that did not: the
four groups above — two are the comp's demo data (gaps 32, 26), one the
artboard (D6), one the demo's `saveErr` (gap 34).

Decided in this phase (section E/G):

- **19 → built**: `Annotation.reply`, `--mark-implemented <ids> --reply
  "…"`, shown under the comment, in the digest; `parseAnnotationSet` keeps
  it (gap 28 closed).
- **12 → the comps' chip + the row's instance box**; `instances` counts
  every distinct place (gap 33 for the comp's ×15).
- **10 → the disclosure**, no Unsuppress / Edit rule (section C).
- **3 / 4** live here: the suppressed count is the disclosure's label, the
  regressions are the row pills (and the strip).
- **31 (new)** the text filter as `/`; **32 (new)** the comp's row order —
  ask Mato to move `f4, f5, f6` before `g1` in the demo array; **33 (new)**
  the comp's `×15`; **34 (new)** the demo `saveErr`.
- Triage / focus save failures: see section C.
- **The old free-text editing of a note is replaced by the comps' append**
  ("Add another instruction…" → ` — <text>`, reopened); `editNote` still
  backs it, so an implemented note goes back to open as before.

Light theme, the error states, the selected rows, the open Comments tab, the
draft composer, the failed-save surfaces, the suppressed rows unfolded, the
collapsed rail and the open sheet ship UNMEASURED by decision (gap 20 /
section C — the comp captures its default state); each was exercised
headlessly for console errors at 1360 and 390, none found, and both
screenshots eyeballed once for a blunder. That is not a parity claim.

---

## 5. Mobile pairs + convergence — DONE (2026-08-28)

Close `refdiff-library-mobile` and `refdiff-compare-mobile`; then iterate the
bounded loop on whatever remains across all four, recording each delta. Every
survivor becomes either a fix or an `ignore.accepted` entry whose `reason` is
the measurement.

**Exit:** all four pairs at their converged numbers; the accepted list
justified item by item.

**Numbers (2026-08-28, Linux devbox, `out/refdiff/summary.md`):**

| pair | before findings (c/M/m) / inst / supp / conf | after findings (c/M/m) / inst / supp / conf |
| --- | --- | --- |
| refdiff-library-desktop | 9 (2/5/2) / 16 / 21 / 0.90 | 9 (2/5/2) / 16 / 21 / 0.90 — unchanged |
| refdiff-compare-desktop | 51 (10/30/11) / 63 / 64 / 0.71 | **50** (10/29/11) / 62 / 66 / 0.71 |
| refdiff-library-mobile | 5 (0/3/2) / 5 / 10 / 1.00 | 5 (0/3/2) / 5 / 10 / 1.00 — unchanged |
| refdiff-compare-mobile | 4 (0/3/1) / 4 / 31 / 0.90 | **3** (0/3/0) / 3 / 31 / 0.90 |

Total 69 / 88 → **67 / 86**, 128 suppressed (+2: the `×14` / `×5` chips,
below). "Before" reproduced phase 4's final table exactly. Confidence held
on all four. The number that moved most is not in the table: **the
alignment on both compare pairs is now the identity** (desktop was `scale
1.00175, offset (−0.54, −1.98)`, mobile `scaleY 1.00067, offsetY −0.52`;
both read `scale 1, offset 0` after) — the fit had been absorbing a
systematic 1–2px that no finding showed. Rows 1–3 of the rail are now
pixel-identical to the comp (`"3"` at (1058.5, 400) on both sides).

**What was the app's** — one cause, found from the mobile pair's 1px:

- **The comps' inline styles are content-box.** `support.js` sets no
  `box-sizing` reset (it only offers a `.bbox` utility) and the comps put
  their fixed sizes inline on bordered divs, so the Tool comp's phone sheet
  is `height:44` + 1px border = 45px; ours (`* { box-sizing:border-box }`)
  was 44 and the whole sheet sat 1px low (the grip at 806 vs 805.03). The
  same shape everywhere the comp fixes a size on a bordered box: the
  topbar (46+1), the delta strip (38+1), the tool strip (44+1), the rail
  (320+1), the align menu (264 + 1·2 + 4·2; 248 + 10 on the phone), the Library topbar (46+1),
  its search field (36+2), the error card's icon (46+2) and bordered
  button (36+2). Each rule now reads as the comp's number PLUS its border
  (`calc(320px + 1px)`), with the convention documented once above the
  reset in `render.ts`. Measured in the browser, not inferred: the rail
  badges sat 4px right of the comp's raw x (1062.5 vs 1058.5).
- **Our finding rows carried a 3px transparent left edge the comp's never
  had.** The comp's `rowBase` has no left border; only its comment rows do
  (`borderLeft: '3px solid transparent'`, line 610), so `.irow` keeps it and
  `.frow` loses it — 3 of the 4px above. The failed-triage-save edge
  (section C, decided in phase 4) survives as `box-shadow: inset 3px 0 0`,
  so the row does not shift when it turns red.
- **`.side-fab button` inherited the report's `line-height:1.4`** (the
  comp's `fabBtn` has none): 18.2px vs 17px per line, the Design / Impl
  toggle 1.2px high on the phone. `line-height:normal`.

Each step measured (desktop / mobile compare): 51 → 50 / 4 → 3, the
Library pairs unchanged and their anchors within 0.5px top to bottom
(`Both sources` 116.3 vs 116.5, `Confirm modal` 897.3 vs 897.2 — the
Library-desktop `scaleY 0.9966` was read here as the anchor fit's noise; it
was NOT: those anchors are post-fit, and undoing the fit (session 15,
2026-08-28) showed a −1 px step at every card row, the `.thumb` rendered at
132 against the comp's content-box 132 + 1 px border. Fixed
`calc(132px + 1px)`; the pair went 3 → 2 with the fit at the identity).

**Run reported 2 `REGRESSION`s** (`f9` missing `#6B7280`, `f17` position
`color`): both are keys the ledger resolved on phase 3's 17:33 and phase
4's 18:35 intermediate runs — the same-text prop-line reshuffle phase 4
diagnosed (two identical `#6B7280` lines under order-moved rows, which one
pairs with which flips on a hairline). Nothing built came undone; rows 1–3
are identical and every dx on the rail is 0 where it was 2.6.

**What remains, item by item — the converged list.** The rule that decides
each one is `accepted.ts` (`refdiff accept`): a `position` / `spacing`
finding is REFUSED as a rule (an offset lapses on every recapture), and a
textless `missing-element` box cannot be identified without a structural
predicate, which CLAUDE.md says never expires and hides a regression
later. So "accepted" below means a content-shaped rule in
`design/refdiff.manifest.mjs`; "visible" means left in the list on purpose
with its cause named here.

| pair | what | count | outcome |
| --- | --- | --- | --- |
| library-desktop | the comp's `Pending` state chip (gap 24) — 78px the `flex:1` search field absorbs, so every chip shifts, `Figma`↔`Claude Design` mis-pair | 6 | **visible** — `Pending` itself is excused by the `textPatterns` rule; a rule for the shifted chips would hide a missing chip. Ask Mato: drop the chip from the comp, or define what refdiff state it filters |
| library-desktop | D6 — the comp's plate bars where the app draws the run's `impl.png` (three textless boxes) | 3 | **visible** — the `<img>` is accepted (`extra-element` / `image`); the bars have no text to name |
| library-mobile | D6 — the same plate: two bars missing, and the 34×26 plate box pairs with our 44×56 tile (size / position / colour) | 5 | **visible** — same reason |
| compare-desktop | gap 32 — the comp's demo array lists rows 1,2,3,7,8,4,5,6; refdiff lists 1..8 (phase 4 run B: 16 findings) and the same-text digit / prop-line reshuffles it causes (~10) | ~26 | **visible** — ask Mato: move `f4, f5, f6` before `g1` in the comp's array (the `num`s already agree) |
| compare-desktop | gap 26 — the comp's two cause lines make its g1 / g2 rows ~20px taller; every row and the suppressed toggle below sit 20 / 56px lower | ~13 | sentences **accepted** by pattern; the offsets **visible** (positions cannot be rules) |
| compare-desktop | D6 — the artboard's own DOM: step numerals `1 2 3` ×2 panes and the 16×16 logo square ×2, live elements in the comp, pixels in our `impl.png` | 8 | **visible** — a per-digit rule would hide a missing badge |
| compare-desktop | gap 33 — `×14` / `×5` (the true count of distinct places) opposite the comp's `×15` / `×6` | 2 | **accepted** this phase (`extra-element` + text; the counterpart of the existing pattern) |
| compare-mobile | gap 34 — the comp's `· 1 unsaved` makes its sheet summary 67px wider, so the centred summary + chevron sit ±33.5px | 2 | **visible** — the text is accepted; the offsets cannot be rules until the demo's `saveErr` is `null` |
| compare-mobile | D6 — the 12×12 logo square in the artboard | 1 | **visible** |

**The accepted list, justified** (`design/refdiff.manifest.mjs`, every hit
under `suppressed` in `findings.json`, 128 in all):

- `LIBRARY_IGNORE.textPatterns` — `Pending|Processing|Queued|running|waiting`
  (gap 24, 5 hits); the relative times (gap 27; the strings agree for an
  hour after `--now`); `^findings\.json · ` (the broken card quotes the real
  parser message).
- `LIBRARY_IGNORE.accepted` — `extra-element` / `image` (D6, the run's own
  screenshot); `Major 2 → 3` and `Minor 2 → 3` (gap 23: the Library comp
  counts f1–f6, refdiff also counts the Tool comp's g1 / g2).
- `COMPARE_IGNORE.textPatterns` — the artboard vocabulary (the comp imports
  `parts/Artboard *` as live DOM); gap 26's two sentences; `^×(15|6)$` (gap
  33); `\d+ suppressed by preset rules` (refdiff has no presets — section C);
  the delta strip's copy (gaps 23 / 29: the comps disagree with each other
  and with the fixture's real delta).
- `COMPARE_IGNORE.accepted` — `extra-element` / `image` (the two
  screenshots); `×14` / `×5` (gap 33, this phase); the phone summary
  `8 findings · 3 comments · 1 unsaved → 8 findings · 3 comments` (gap 34).

No `regions`, no `roles`, no `dataSlots`: every rule names the content it
excuses.

**Converged numbers: 9 / 50 / 5 / 3, confidence 0.90 / 0.71 / 1.00 / 0.90,
alignment identity on three pairs.** Every remaining finding is one of the
comp's demo-data choices (gaps 24, 26, 32, 34) or decision D6; the four
asks for Mato are in section H. Nothing left on the app's side of the four
pairs that a measurement can find.

Light theme, the error states, the unfolded rows and menus still ship
UNMEASURED by decision (gap 20 / section C); the align menu's new width and
the `.frow.unsaved` inset edge were exercised headlessly at 1360 and 390 for
console errors, none found.

---

## 6. Land it — DONE (2026-08-28)

- `skills/refdiff/SKILL.md` + `refdiff.bindings.md` updated for anything the
  redesign changed (CLAUDE.md hard rule; `grep -n "<old-term>" skills/ packages/ docs/`
  comes back empty).
- `docs/architecture.md` "Annotator" section rewritten to the new IA;
  decisions added to "Open decisions".
- Fresh handoff; `docs/plan-next.md` pointed here.

**Exit:** no sentence outside this plan's own history asserts the
pre-redesign annotator.

**Numbers (2026-08-28, Linux devbox):** none moved — the phase changes no
rendered output, so the measure step was skipped by loop rule 1's own
exception and the protected baseline stands as harness item 16 last
measured it: **3 / 32 / 0 / 2** findings, confidence 0.90 / 0.71 / 1.00 /
0.90, `align 1×0.997 / 0,0.2` on the Library desktop and `1 / 0,0` on the
other three. `pnpm typecheck` and `pnpm test` green (no source touched).
**Follow-up, session 15 (2026-08-28): the Library desktop's alignment note
was the card `.thumb` 1 px short per row (content-box 132 + border); fixed,
the set was 2 / 32 / 0 / 2 with the fit at `1 / 0,0` on all four; the
session's later product changes left it at 2 / 32 / 0 / 3 (gap 35).**

What shipped:

- `docs/architecture.md` "Annotator" (2026-08-28): the section is now the
  BUILT IA — one shell / two routes, the Library (card anatomy, order,
  degraded card, load-failure states, no `Pending`), the comparison tool
  (topbar segments, delta strip, tool strip and pills, canvas badges, the
  320px right rail row by row, the failed-save surfaces, the phone sheet,
  the keyboard, `vc-controls`), then the invariants that survived the
  redesign under their own headings (world space and the DPR / double-scale
  rules, no stretch, the four align modes + `alignRemap`, the diff lab, the
  annotation model, triage, focus, the server modes incl. `--read-only` and
  the "harness-only affordances are measured" rule, tokens / self-hosted
  type / the content-box convention, scope). Gone: the 340px LEFT rail, the
  toolbar with its Split/Single button, the 900px breakpoint, the bottom
  detail panel and its crops, the summary bar, the `+ note` / `+ region`
  buttons, the checkerboard, and the "session 8 / session 9 built" history
  that described them (still in git). "Open decisions" gained four entries:
  the redesign's decisions in one block (full adoption, the fixture's home,
  D6, verdict-not-percentage, confidence as a warning state, no `Pending`,
  wall-clock time, no crops in the UI, the dropped verdict header, no
  Unsuppress, unmeasured states, gap 29's local flip, `/` and gap 18, the
  four demo-data asks), the harness-only-affordance rule (item 16), the
  matcher-upgrade ledger churn as an open candidate (item 15), and the
  comps' content-box note for Mato.
- `refdiff.bindings.md`: the "Low confidence" trap restated as one baseline
  paragraph (3 / 32 / 0 / 2, the Library desktop's three, D6 under
  `contents: true`, gap 32 / 26 on the comp's side); the Library `textPatterns`
  bullet no longer points at phase 2's D6 boxes (excused since item 14).
- `README.md`: the annotator row and the Status paragraph name the Library,
  the rail, triage, focus, `--read-only`.
- `docs/plan-next.md`: status line + item 16 mark phase 6 DONE; the handoff
  `docs/handoff-2026-08-28.md` refreshed (state of play, what remains in
  order, the lessons-inbox pointer).
- `skills/refdiff/SKILL.md`: swept, NOT changed — nothing in it asserted the
  old layout (its §3 diff-lab paragraph, §3a, the `--reply` and `--read-only`
  lines were already written against the redesigned app in phases 3–4 and
  item 16). No flag, default or report field changed this phase, so no
  consuming repo's bindings are affected.
- `docs/lessons-inbox.md`: the two entries whose candidate home was "Open
  decisions" now carry a pointer there; `/lessons` removes them when Mato
  says.

---

## 7. The phone's minimal layout + settings popover — DONE (2026-08-29, session 16)

**The comp refetch (2026-08-29, DesignSync `get_file`):** the Tool comp's
phone header trades the light/dark toggle for a `settings` button whose
popover holds **Layout — Minimal / Default** over **Theme — Dark / Light**
(desktop keeps the plain toggle); Focus moved AFTER Comment in the tool
strip (both comps); the × is drawn in the regression state
(`deltaDismissShow: true`) and `showDeltaStrip` defaults to true in the
REMOTE project (gap 29 closed for good — a refetch no longer reverts it);
the header's left and right parts are equal flex shares on desktop
(`flex: 1 1 0`, the groups centre on the SCREEN) and hug their content on
the phone. A new comp, **`RefDiff Mobile Minimal.dc.html`** (a 390×844 phone
frame inside a dark 460×950 showcase canvas, `layout` prop default
`minimal`), draws the minimal layout: a **44px** header — back, **16px**
brand, the pair title, a `tune` button (the Compare / Show segments fold
into a panel dropped over the canvas) and `settings`; no layer strip, no
zoom pill, no delta strip; the bottom row = the tool strip (**28px** tools
+ a divider + **Fit**) left, the **Design / Impl SWAP** (one value +
`swap_horiz`) and the **rail button** with a count badge right; the align
control is an icon-only 34px button with a "!" badge for the confidence
warning, its menu carrying the lockstep row; the rail a **58%** sheet that
is off screen while closed; fit margin **16** (the Tool comp's is 24).
The "default" layout is the existing phone layout, still measured against
the Tool comp.

**Built (`render.ts`, one shell for both deliveries):** `.tb-right` with the
theme toggle (desktop) and the settings popover (phone; `#settings-menu`,
`data-mlayout` / `data-theme` segments); `#view-toggle` + `#view-panel`
(`#seg-variant-m`, `#seg-layer-p` drive the same `setLab` / `setLayer`);
`#fit-m`, `#pane-swap`, `#rail-btn` + `#rail-count`; `#conf-bang`; the
lock row in `renderAlignMenu()` when `minimalOn()`; `body.layout-minimal`
(phone only, whatever the preference says) with every rule under the
759px media query; the preference in `vc-controls.layout`, written alone
like the theme (`savePref`), preset for one load by **`?layout=minimal|
default`** on the page URL (how the pair is captured; a shareable link;
not a rendered element, so item 16's rule holds); Escape and an outside
tap close the popover — the PANEL closes on `#view-toggle` or Escape only
(2026-08-29: an outside tap dismissed it on the first canvas gesture).
The manifest pair
`refdiff-compare-mobile-minimal`: `design.scope: ".cc-theme-dark"` picks
the phone node out of the showcase canvas (the fluid outer frame reloads at
390×844 first, so the phone lands at x 0), `MINIMAL_IGNORE` =
`COMPARE_IGNORE` + the abbreviated title (gap 37).

**Numbers (2026-08-29, Linux devbox, `out/refdiff/summary.md`; findings /
inst / supp / conf):**

| pair | 2026-08-28 baseline | run 1 (built, unfixed) | after (3 runs) |
| --- | --- | --- | --- |
| refdiff-library-desktop | 2 / 11 / 25 / 0.89 | 2 / 11 / 25 / 0.89 | 2 / 11 / 25 / 0.89 — unchanged |
| refdiff-compare-desktop | 32 / 46 / 66 / 0.71 | 32 / 46 / 66 / 0.72 | 32 / 46 / 66 / 0.72 — unchanged |
| refdiff-library-mobile | 0 / 0 / 16 / 1.00 | **1** (1/0/0) / 1 / 16 / 1.00 — `REGRESSION` | 0 / 0 / 16 / 1.00 |
| refdiff-compare-mobile | 3 / 13 / 31 / 0.90 | 6 (0/6/0) / 16 / 32 / 0.88 | 3 / 13 / 32 / 0.91 |
| refdiff-compare-mobile-minimal | — | 13 (0/8/5) / 20 / 25 / 0.93 | **0** / 0 / 26 / **1.00** — then **10** (1/6/3) / 19 / 36 / 0.87 with the delta strip kept (decision below; all ten are the strip the comp lacks, and the shifted anchors cost the confidence) |

Alignment at the identity (`1 / 0,0`) on all FIVE pairs in every run.
The staircase on the new pair, 13 → 2 → 0, and what each step was:

1. **The icon subset** (8 of the 13, plus 2 on `refdiff-compare-mobile`):
   `tune`, `settings`, `list_alt` and `swap_horiz` were not among the 52
   glyphs in `assets/fonts/material-symbols-outlined.woff2`, so the ligature
   rendered as its NAME in letters — `"settings" renders 152×23, design says
   19×23`, and every neighbour in the row moved with it. The list is now
   DERIVED (`packages/annotator/scripts/icon-subset.mjs`: quoted tokens in
   the comps + this package's source ∩ Google's codepoints list, 93 glyphs,
   the generated `src/icon-names.ts`, `--check` for drift; the font URL is
   versioned by that list's hash, because the day-long `Cache-Control` kept
   the OLD face on Mato's phone after the restart). Same-shape lesson as
   phase 1's fonts: a matching `fontFamily` proves nothing about the glyph.
2. **Fit margin** (4, the badges `position ×6 (7.1, 7.8)` …): the Minimal
   comp fits with `r.width − 32` (16px a side), the Tool comp with `− 48`;
   `fit()` now takes 16 under `minimalOn()`; the phone's zoom reads 53%
   there against the default layout's 50%.
3. **The title** (1): the comp's header says "Onboarding — Document", the
   app the pair's name "Onboarding — Document step" — demo data, accepted
   (gap 37).
4. Run 2's two survivors were ONE cause: `.tb-right` had no `gap`, so
   `tune` sat 13px from `settings` where the comp's 7px header gap makes
   20 — `position (7, 0)` + `spacing 13 vs 20`; `gap:8px` (desktop, one
   child) / `7px` (minimal).

**What the harness caught that eyeballing would not:**

- The **`REGRESSION` on `refdiff-library-mobile`**: `design "light_mode" has
  no counterpart`. The phone rule that hides the report's theme toggle
  (`.theme-toggle { display:none }`) lives in the CSS the app shell shares
  with the Library route, whose comp is UNCHANGED and keeps the toggle —
  scoped to `.topbar .theme-toggle`. One shell, two routes: a rule for one
  route's chrome must name that route's container.
- **The × on the phone** (`"close" offset (−184, 0.5)`): the app's phone CSS
  put the dismiss right after Review (`.review + .dismiss { margin-left:0 }`);
  the comp keeps the ×'s auto margin (only Review loses it), so it ends the
  row it wraps to. Phone-only fix; the desktop matched either way.
- The stale `accepted` rule for the × (`extra-element`, `text: "close"`,
  phase 5's decision that the comp hid it) stopped hitting the moment the
  comp drew it, exactly as `SKILL.md` §3a promises; removed.

**Decisions (session 16):**

- **The delta strip renders in the minimal layout as in the default one.**
  The Minimal comp draws none; first built to the comp (hidden, one rule),
  then Mato (2026-08-29): "the strip should render the same — under the
  header — I just didn't put it in the minimal design". Rule flipped; the
  strip's two glyphs (`warning`, `close`) are excused by content on the
  minimal pair (`MINIMAL_IGNORE`), its copy by the shared patterns. What no
  rule may hide: the app's canvas starts ~66px lower than the comp's (the
  wrapped strip), so the pair reads **10 findings** until the comp carries
  the strip — the align button `(0, 66)` ×2, the badges `(0, 32.5)` ×10,
  and the badge "1" mis-paired with the artboard's step numeral "1" (5
  findings of that one mis-pair). Gap 36 is now the ask: add the strip to
  the Minimal comp; the pair returns to 0 by itself.
- **The lockstep lock stays in every view — reverted the same day.** First
  hidden outside split at Mato's request ("we don't need the align-lock
  button when the mode is not split screen"), then restored on his second
  thought: with ONE pane and an overlay on (wipe / onion / blink) the design
  is drawn onto the impl, so unlocking — or picking another anchor mode — is
  exactly what fixes a bad landing. Hiding it cost a `missing-element` on
  the comp's `link` and, before the pill was given the lock's height, a
  `spacing 29 vs 31.5`; both are gone again and no rule was left behind.
  The minimal layout's icon-only button keeps its lockstep row in the MENU
  (the Minimal comp's `lockRow`).
- `?layout=` presets, never persists: a link opens in one layout without
  changing the phone's saved preference.

Light theme and the open states (popover, panel, sheet, align menu) ship
UNMEASURED by decision (gap 20 / section C), exercised headlessly at 390 and
1360 with zero console errors (`settings` → Default → Minimal → Light, tap
outside, `tune` → Onion → tap outside, swap, rail open / close, align menu
+ lock row, Fit at 53%, `vc-controls.layout` persisted; the Library keeps
its toggle on the phone). `pnpm test` 270 + 171 green (three new
`render.test.ts` cases: tool order, the popover, the minimal layout).

---

## Design gaps — things the annotator does that the comps never drew

**STATUS 2026-08-28: the design is COMPLETE for phases 0–5.** Every gap below
is resolved except **18 (keyboard-shortcut hint)**, which is deliberately
deferred until after phase 4, and the four phase 4 found while building the
rail (**31–34**, section G — one product question, three demo-data nits, each
with its measured cost). **Phase 5 converged on those plus 24 and 26; section
H lists the four demo-data asks that would close the remaining findings on the
comp's side, and one note about the comps' box model.** Two comp refetches on 2026-08-28 closed the rest;
`design/refdiff/*.dc.html` in this repo is the authority, verified against the
remote (Claude Design project `5a1a95c3-beee-457a-815b-ef6f6bf3e06a`).

The phase that needs one **stops and asks Mato** rather than inventing. Grouped
by where they surface.

### A. Library

1. **PASS / FAIL verdict.** The comps' pill vocabulary is a run *state*
   (Analyzed / Processing / Queued / Clean); refdiff's gate produces a
   *verdict*. Same pill, a second pill, or the verdict tinting the card?
   A **percentage pill was considered and advised against** (2026-08-28):
   `verdict` is a deterministic gate (`types.ts:273` — pass when no finding is
   at/above `failThreshold`, default `major`), not a similarity score; no
   similarity number exists in the pipeline; and a share-of-clean-elements
   ratio would be severity-blind (one critical CTA error ≈ 99 %, forty 1px
   shifts ≈ 85 %) with a denominator that moves when the DOM is refactored.
   Recommendation: pill = verdict, severity dot-badges = magnitude (already
   drawn), **`delta` = direction** (`−23 since last run`) — which is the
   "are we getting closer" signal a percentage was standing in for.
2. **Alignment confidence** — DECIDED 2026-08-28. It is not a similarity
   score: it is how well refdiff can register the two sides onto one
   coordinate system, so under the 0.50 gate every `position` / `size` /
   `spacing` number was computed in a frame it could not verify, and the pixel
   channel refuses to run. Shown as a WARNING STATE, never as a number:
   - Library card: a muted warning line, only under the threshold.
   - Comparison tool: a warning treatment on the align pill when `Anchors` is
     the selected mode (the only mode that depends on the fit — Width /
     Top left / Top right are fixed geometry and always safe), plus a note on
     the Anchors row in the align dropdown.
3. **Suppressed count** per pair.
4. **Delta** (`+N introduced / −M resolved`) and **regressions** — the loop's
   stop signal.
5. **Type chips.** The comp offers Pages / Components / Flows. refdiff's real
   taxonomy is design source (`.dc.html` / Figma) × impl source (Storybook
   cell / live URL). Which chips?
6. **Card thumbnail.** The comp draws a generic icon plate; we hold the actual
   impl screenshot. Use the real screenshot, or keep the plate?
7. **Source line + absolute timestamp** (`design → impl`, ISO createdAt). The
   comp shows only a relative "12 min ago".
8. **Project name.** The comp's breadcrumb says "Veriflow"; refdiff has no
   project concept, only an out-root path. What goes in the breadcrumb?
9. **List-load failure state** (the server is gone / the root is empty).

### B. Comparison tool

10. **Suppressed findings** — refdiff found a real difference and a policy rule
    excused it (demo data, an `accepted` deviation, an ignored region/role).
    Project rule: never dropped, kept in `findings.json` tagged with the rule
    that hid it, so a wrong policy is auditable. Typical count 0–30. A third
    tab, a disclosure at the bottom of Findings, or a filter chip?
11. ~~**Triage**~~ — RESOLVED 2026-08-28: designed. `f.actions` = **To fix**
    (`--acc`) / **Ignore** (`#6b7280`) / **Snooze** (`#8f7ee7`) on the selected
    row, plus the row tag `To fix` / `Ignored` / `Snoozed` when the status is
    not open. Matches `TRIAGE_LABELS` in `render.ts` exactly.
12. **Aggregated findings** — one cause, many places. The same difference
    repeating (one colour wrong on 15 labels, one 23px shift across a row)
    collapses into ONE row marked `×15` that keeps every box. Needs: the `×N`
    beside the title, and an **"all instances"** toggle — every instance is
    marked with the same number on the canvas, so a ×40 aggregate carpets the
    artboard unless it can be reduced to the primary box.
13. ~~**Crops**~~ — RESOLVED 2026-08-28: **no crop thumbnails in the UI.**
    Selecting a finding focuses the canvas on its element instead (the comp
    already does this — `selFinding` → `focusOn(f.rect)`), so the canvas IS
    the crop, at full resolution and in context. The crop PNGs stay in the run
    dir: they are artifacts the MODEL reads (`SKILL.md`: expected/actual first,
    crops second) and the `--emit` reports use them. Deleting the detail panel
    must not delete the artifacts.
14. ~~**Pair verdict + confidence header**~~ — RESOLVED 2026-08-28: **dropped.**
    The compare topbar carries the pair title only; PASS/FAIL, the c/M/m counts,
    sources and run time live on the Library card you came from. NOTE this does
    not drop the confidence WARNING — that lives on the align pill (gap 2).
15. **Delta / regression banner.** Every run is diffed against the previous run
    of the same pair (`+N introduced / −M resolved`); within that a
    **regression** is a finding that was fixed and came back — the loop's stop
    signal, which the fix skill halts on. Must be impossible to miss. Probably
    a strip under the topbar, only when non-zero.
16. **Strobe** — the annotator's third canvas emphasis (pulse + wiggle the diff
    regions) next to Highlight and Dim. Which glyph, and does it belong in the
    tool strip or the layer group?
17. **Lab amount slider** — onion opacity and difference intensity are
    adjustable; the comp fixes onion at 55%.
18. **Keyboard shortcuts.** The annotator is keyboard-driven (`j/k`, `[ ]`,
    `a`, `d/g/s`, `b/o/w/x`, `n`, `Esc`). Where does the hint live now that
    the toolbar's trailing hint line is gone?
19. ~~**Comment replies**~~ — RESOLVED 2026-08-28: designed, and CONFIRMED to
    build. Code side only — `Annotation` (`annotations.ts:49`) gains a `reply`
    field in phase 4, written by the model (`--mark-implemented` with text).
20. ~~**Light theme**~~ — RESOLVED 2026-08-28: **a manual user switch, shipped
    unmeasured.** Phase 1 builds the toggle and the `cc-theme-light` tokens. No
    light frame is added to the design and no `props` support is added to
    `DcHtmlSource` — every refdiff pair captures the dark theme, and light
    parity is not gated by the harness.
21. ~~**Status vocabulary**~~ — RESOLVED 2026-08-28: **Mato updates the comp**
    to the impl wording, so the vocabulary becomes identity: `open →
    implemented → done`, no mapping layer. Until the comp is refetched it still
    reads New / Update / Done — a `text-content` finding on those three chips
    is EXPECTED and must not be "fixed" in the app.
22. ~~**Align lock**~~ — RESOLVED 2026-08-28: build the unlock (independent
    per-pane pan when unlocked).

### C. Decisions on the 2026-08-28 comp refetch

- **Suppressed rows: the two buttons are DROPPED** (2026-08-28). No
  `Unsuppress`, no `Edit rule`. refdiff's suppressions come from the manifest's
  `ignore` policy (`dataSlots` / `textPatterns` / `roles` / `regions` /
  `accepted`) — a FILE in the consuming repo, not app state. The row shows
  which rule hit and its reason (already in `findings.json`); changing it means
  editing the manifest. Rule labels follow refdiff's vocabulary, not the comp's
  "Preset · font smoothing" placeholders.
- ~~**Confidence threshold**~~ — RESOLVED 2026-08-28 (comp refetch): both comps
  now use `CONF_MIN = 0.5`, matching `index-view.ts` `CONFIDENCE_GATE` and the
  pixel-channel gate. One number, and it is the point where the pixel channel
  actually refuses to run.
- ~~**Error state**~~ — RESOLVED 2026-08-28 (comp refetch): drawn as two typed
  variants selected by a `loadState` prop (`ready | server | endpoint`), with a
  real technical line, an out-root path line, Retry + a context-appropriate
  copy button, and an auto-retry countdown. Spec as agreed:
  - **A. Server gone** (the common case — the CLI was stopped, the terminal
    closed, the machine slept; `fetch` fails at the network layer). Headline
    "Can't reach the annotator"; body "The `refdiff-annotator` process serving
    this directory isn't responding. Nothing is lost — findings, comments and
    triage are files on disk in the out root, not in this page."; mono line =
    the REAL error (`Failed to fetch · /api/pairs · 14:22:05`); a context line
    naming the out root path; actions Retry + **Copy restart command**
    (`refdiff-annotator <root> --serve --port <n>`), NOT "Service status".
    Keep auto-retry — the page reconnecting once the CLI is restarted is the
    right behaviour here.
  - **B. Endpoint errored** — a `findings.json` unreadable, usually because
    `refdiff compare` is writing it right now. "The pair list couldn't be
    read" / "A run may be writing to the out root. This usually clears on its
    own." / `HTTP 500 · /api/pairs`.
  - **C. ONE pair broken, the rest fine — DRAWN 2026-08-28.** The fifth project
    principle (one bad pair never kills a run) now holds for the list: a
    dashed-border card with `broken_image`, the pair name and route muted,
    "Couldn't read this run", and the real reason in mono
    (`findings.json · unexpected end of JSON`). Both desktop and mobile. Broken
    cards are listed only under the "Any state" filter.
- ~~**A failed SAVE**~~ — DRAWN 2026-08-28 (comment `c2` in the comp), on FOUR
  surfaces so it cannot be missed:
  1. the comment row: `cloud_off` + **Not saved** in `#e5484d` + the reason in
     mono + a red **Retry** button;
  2. the row itself: red-tinted background + a 3px `#e5484d` left border;
  3. the canvas mark: a red halo (`box-shadow 0 0 0 3px rgba(229,72,77,.6)`);
  4. the mobile rail summary gains "· N unsaved", so it shows through a
     COLLAPSED rail.
  IMPLEMENTATION NOTES: like the error states, this cannot be captured (no prop
  support), so it ships unmeasured — build it from this spec. The comp's sample
  detail reads `PUT /api/comments 403`
  — the real endpoints are `PUT /api/pairs/<dir>/annotations` (and `/triage`,
  `/focus`), so show the REAL one, never the demo string. And the design marks
  only comments; **triage verdicts and the focus region also `PUT`** and can
  fail the same way — decide in phase 4 whether they get the same marker.
  **DECIDED (phase 4):** a triage verdict that did not reach `triage.json`
  gets the same row surfaces (red tint + 3px edge, `cloud_off` + Not saved
  + the real `PUT /api/pairs/<dir>/triage` line + Retry) on the finding's
  row; a focus region has no row, so a failed `PUT …/focus` is named in the
  rail's status line (the one line at the foot of the rail, otherwise
  hidden). The comment surfaces are exactly the four above, with
  `PUT /api/pairs/<dir>/annotations · <status>` as the detail.
- **Capture settings that keep the pair comparable:** the comp's
  `anchorConfidence` prop defaults to **0.42**, so it renders the low-confidence
  warning — the demo fixture must record `confidence: 0.42`. `showDeltaStrip`
  defaults to **false**, so the demo pair must have no previous run and hide the
  strip. Otherwise both produce phantom findings. **REVERSED for the delta on
  2026-08-28 (phase 2, gap 23 → b):** the opened pair now carries a delta with
  two regressions, because the Library card and the Tool's `Regression` tags
  both require one; the strip the app draws is +3 texts on
  `refdiff-compare-desktop` for phase 3 to accept.

### D. Decisions 2026-08-28 (second round)

- **6 Card thumbnail = the REAL impl screenshot** (`artifacts.implPng`, already
  captured for every pair), not the comp's wireframe plate. CONSEQUENCE: that
  132px band can never match by pixels or by elements — the comp draws three
  grey bars, the app draws a photograph. Handle it as an `ignore.accepted`
  entry whose reason names the CONTENT ("the comp's plate is the designer's
  stand-in for the run's own screenshot"), per CLAUDE.md's rule that an ignore
  should name the content it excuses, not a position. Do NOT let it read as
  drift, and do NOT ask the designer to embed a fake screenshot.
- **7 DROPPED**: no `design → impl` source line and no absolute timestamp on the
  card. The source chip (Figma / Claude Design) names the design side only, and
  the relative "12 min ago" is the only time shown.
- ~~**8 Breadcrumb**~~ — DONE in the comp (refetched 2026-08-28): the
  `chevron_right` + "Veriflow" pair is gone. Library topbar is brand only; the
  compare topbar keeps brand + the comparison name. No pending comp edit.
- **18 DEFERRED**: the keyboard-shortcut hint has no home yet. The shortcuts
  keep working; nothing is drawn. Revisit after phase 4.

### E. Found while building the demo root (phase 0, 2026-08-28)

None of these blocked phase 0; each is the phase's call when it gets there,
with Mato where the two comps disagree.

23. **The opened pair's delta — the two comps disagree.** Section C says the
    demo pair has NO previous run (`showDeltaStrip` defaults to false), and the
    fixture obeys: `onboarding-document-step` carries no `delta`. But the
    Library card for `doc` reads `+3 new / −1 resolved`, and the Comparison
    Tool's rows `f1` / `g2` carry a `Regression` tag (`reg: true, regRun: 44 /
    45`) — both need a previous run. Options: (a) keep no-previous-run and
    `accept` the card label + the two tags as fixture-vs-comp; (b) give the
    pair a delta with 2 regressions and hide the strip by default (which
    contradicts gap 15 "impossible to miss"); (c) Mato reconciles the comps.
    The generator is a one-line switch either way (`reportFor`, the `delta`
    branch). Phase 2 hits the card label, phase 4 the tags.
    **DECIDED 2026-08-28 (phase 2): (b)** — see phase 2 "Decided in this
    phase". The Tool comp's `showDeltaStrip` default is now the outlier.
24. **Pending run states.** The comp's `Processing` (`Onboarding — Review
    step`, "running") and `Queued` (`Confirm modal`, "waiting") have no refdiff
    representation — a run dir exists once `compare` wrote it. The fixture
    writes both as zero-finding PASSING runs with the comp's confidence and
    comment counts. Phase 2: either a `Pending` verdict needs a source (a dir
    without `findings.json`? a marker `compare` writes while running?) or the
    two cards render `Pass · Clean` and the state pill is `accept`ed as
    designer data. **DECIDED 2026-08-28 (phase 2): the latter**, as a
    `textPatterns` rule; no `Pending` chip.
25. **Thumbnails for pairs without a PNG.** Decision D6 makes the card
    thumbnail the real `impl.png`; only the opened pair has one. The other 10
    demo runs (and any real run whose capture hard-stopped) need a no-image
    state — the comp's grey plate is the obvious candidate, but that is
    phase 2's call, not a fixture problem. **DECIDED 2026-08-28 (phase 2):
    the plate.**

### F. Found while building the comparison chrome (phase 3, 2026-08-28)

29. **The delta strip is designed but never captured.** The Tool comp's
    `showDeltaStrip` prop (section "Debug") defaults to false; the fixture
    pair carries a delta with two regressions (23b), so the app draws the
    strip the comp designs for that state and every anchor below the topbar
    sits 38px lower than the comp's (65px on the phone). Measured in phase 3
    (run B): 13 desktop findings and the mobile pair's confidence 0.54 → 1.00
    hinge on it. **RESOLVED 2026-08-28 — (a), at Mato's request:** the one
    token `"default":false → true` in `RefDiff Comparison Tool.dc.html`'s
    `data-props`, nothing else touched. Measured right after (phase 3
    Numbers, "after the flip"). NOTE the flip is in the LOCAL copy only —
    the Claude Design project is not reachable as a writable design-system
    project through DesignSync (404 / no writable projects), so make the
    same change in the app's prop editor before the next refetch, or the
    refetch reverts it.
30. **The Tool comp fits once, on load, and never on resize.** Under the
    adapter's slack canvas it fitted for a 1480px window (zoom 75%). Closed on
    the harness side — the dc-html adapter now reloads a fluid comp at the
    pair viewport — but a comp that re-fits on resize would be the sturdier
    design; a note for Mato, not a request.
26. **Aggregate `cause` line.** The comp's `g1` / `g2` show a second line
    ("Muted label token resolves to the wrong grey"). `Finding` has no such
    field — `message` is the title. Either the aggregator writes a cause (core
    change) or the row has one line. Phase 4.
27. **Relative "when" vs a fixed clock.** The fixture's `createdAt` values are
    anchored to `DEMO_NOW` (2026-08-28T14:22:05Z) so the files are stable;
    "12 min ago" rendered against the wall clock will read "N days ago" and
    never match the comp's text. Phase 2 either renders relative time against
    the newest run in the root (deterministic, and arguably right: "12 min
    before the latest run") or accepts the eleven `when` strings as data.
    **DECIDED 2026-08-28 (phase 2): wall clock; `make-demo-root.ts --now`
    before a measure; the strings excused by a `textPatterns` rule.**
28. **`reply` on the fixture's comments.** `annotations.json` for the opened
    pair already carries the comps' two model replies (gap 19), but
    `parseAnnotationSet` drops unknown fields, so a PUT from the browser
    rewrites the file without them until phase 4 adds the field. Regenerate
    (`node fixtures/make-demo-root.ts`) to restore; `git checkout fixtures/`
    resets anything the served app wrote. **CLOSED in phase 4** — the field
    exists, the parser keeps it, `--reply` writes it.

### G. Found while building the review rail (phase 4, 2026-08-28)

31. **The finding text filter has no drawn home.** The old rail had a
    "filter findings…" search box; the comp's rail has severity chips, the
    instance chip, the focus region and the delta strip's Review as its only
    filters. Kept as a keyboard affordance (`/` opens a search row above the
    chips, Esc clears and closes it — nothing drawn in the default state, so
    the capture matches), like the other unhinted shortcuts (gap 18). Mato:
    draw it, bless the shortcut, or drop it.
32. **The comp lists the demo findings in its ARRAY order, not by severity.**
    `findings: [f1, f2, f3, g1, g2, s1, s2, s3, f4, f5, f6]` renders the rows as
    1, 2, 3, 7, 8, 4, 5, 6. refdiff's `applyPolicy` renumbers kept findings in
    list order (severity-sorted), so a real report ALWAYS lists 1..N in order
    and the app follows the report; a fixture in the comp's order would carry
    marks out of list order — a shape refdiff never produces. Measured in
    phase 4 (run B, the fixture reordered for one run and reverted): the
    order alone is **26 findings** on `refdiff-compare-desktop` (68 → 42 at
    the same build; the final numbers are in the phase's table). Ask: move
    `f4, f5, f6` before `g1` in the comp's demo array (the numbers already
    agree — `num: 4, 5, 6` — only the array position differs). Nothing to
    change in the app.
33. **`×15` / `×6` in the comp count the primary twice.** The row label is
    `1 + inst.length`, and `inst[0]` repeats `rect` (both `REP(n, i => …)`
    grids start at the primary's position), so g1's fourteen distinct places
    read "×15". refdiff's `instances` counts every distinct place, primary
    included (×14 / ×5). Excused as designer data by a content-shaped pattern
    (`^×(15|6)$`) until the comp drops `inst[0]` or shows `inst.length`.
### H. Phase 5 (2026-08-28) — the asks that remain, and a note on the comps' box model

Nothing new was invented in phase 5; these are the survivors of the converged
list (phase 5 Numbers), restated as concrete asks so they can be closed on the
comp's side. Each carries its measured cost.

- **Gap 32 — row order** (~26 findings on `refdiff-compare-desktop`): move
  `f4, f5, f6` before `g1` in the Tool comp's `findings` array. The `num`s
  already agree; only the array position differs.
- **Gap 26 — the cause line** (~13): either drop `cause` from g1 / g2 in the
  comp, or say where a real report would get one (`Finding` has no such
  field; the model's triage note is the nearest thing that exists).
- **Gap 34 — `saveErr` on c2** (2 on the phone): set it to `null` in the demo
  data — the failed-save DESIGN stays (section C), only the demo state goes.
- **Gap 35 — the phone fit under the sheet** (1 ×11 on `refdiff-compare-mobile`,
  session 15): centre the comp's phone canvas in the area above the bottom
  sheet, as the app does since 2026-08-28 (`paneInsets`); the badges then
  agree again. Left visible — see 35 below.
- **Gap 24 — the `Pending` chip** (6 on the Library): drop it from the comp,
  or name the refdiff state it filters. refdiff has no run-in-progress state
  (a run dir exists once `compare` wrote it), and a chip that can never match
  is worse than a missing one, so the app does not draw it and the 78px it
  occupied moves every chip after it.
- **Note, not a gap — the comps are content-box.** `support.js` sets no
  `box-sizing` reset, so every inline `height:46px` on a bordered div renders
  47px. The app matches that box by box (`render.ts`, the comment above the
  reset). A `* { box-sizing:border-box }` in the comps' runtime would make the
  numbers mean what they say, but it is a runtime change, not a design one —
  for Mato's information only.

36. **The Minimal comp draws no delta strip** (2026-08-29, session 16) — an
    omission, per Mato the same day: the strip renders under the header in
    the minimal layout as in the default one, and the app does. **Ask: add
    the strip to `RefDiff Mobile Minimal.dc.html`** (the Tool comp's
    `deltaStyle` block, `showDeltaStrip: true`). Cost until then: 10
    findings on `refdiff-compare-mobile-minimal` — the canvas ~66px lower
    than the comp's (align button ×2, badges ×10) and badge "1" mis-paired
    with the artboard's step numeral (5). The strip's glyphs are accepted by
    content; the offsets cannot be rules.
38. ~~**The align pill's lock on the phone**~~ — WITHDRAWN the same day
    (2026-08-29). Hidden outside split at Mato's request, then restored: an
    overlay superimposes the design on the impl even with one pane, which is
    when the lock and the anchor mode matter most. Nothing to ask on the
    comps' side; the acceptance rule that had excused the comp's `link` was
    removed with it.
37. **The Minimal comp's header title is "Onboarding — Document"** — the demo
    data shortened by hand; the app shows the pair's name, as the Library
    card does. Accepted on the minimal pair (`MINIMAL_IGNORE`).
35. **The comp's phone fit centres the frame in the WHOLE canvas, under the
    sheet** (found 2026-08-28, session 15; 1 finding ×11 on
    `refdiff-compare-mobile`). With the bottom sheet open (52%) the comp's
    artboard sits half under it; Mato's decision: Fit (and focusing a
    finding) centre in the visible part — `paneInsets` in `view-math.ts`,
    the sheet is an inset, floating pills are not. The app's marks therefore
    land 22.4px higher than the comp's on the phone (half the closed sheet).
    Ask: fit the comp's phone canvas above the sheet too; until then the
    `position ×11` on the phone's badges is the cost, left visible on
    purpose — a position rule on every badge would hide a real regression.

34. **The demo comment c2 carries a `saveErr`.** The failed-save DESIGN (section
    C) is right, but as demo data it shows through the phone sheet's summary
    (`8 findings · 3 comments · 1 unsaved`) and shifts it 33px; a failed save is
    runtime state a fixture cannot hold. The summary text is accepted with that
    reason; the two position findings under it (`expand_less`, the summary)
    are the cost until the demo's `saveErr` is `null`. The app shows exactly
    those words when a PUT really fails.

