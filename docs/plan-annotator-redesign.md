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
| fixture data | **Build a matching demo out root** (`out/demo/`) whose run dirs mirror the comps' demo data exactly, and point the manifest at it. Without shared text there are no alignment anchors, and every position/size finding is noise. |
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
refdiff-annotator out/demo --serve --port 7378 &           # the impl under test
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7378 --out out/refdiff
refdiff summary out/refdiff
```

Network + servers need the Bash sandbox disabled (handoff "Env gotchas").

---

## 0. Demo out root + honest baseline — TODO

**Why first:** confidence 0.00 makes every later measurement meaningless, and
1398 findings are mostly the comps' fixture copy arguing with `out/`'s real run
dirs. Give the app the same content the comp draws and the alignment gets real
anchors.

Build `out/demo/` — a committed fixture out root, separate from `out/` where
real results land (this also kills the bindings' "card count changes with every
run" trap, because the served root stops being the results root).

- A generator `design/refdiff/make-demo-root.mjs` (pure-ish, effects at the
  edge) that writes `out/demo/<slug>/` for each of the comps' 11 Library items:
  `doc`, `selfie`, `review`, `button`, `card`, `stepper`, `login`, `dash`,
  `detail`, `modal`, `errors` — names, routes, severity counts, comment counts
  and "when" exactly as `RefDiff Library.dc.html`'s `ITEMS`.
- The one opened pair (`onboarding-document-step`, the comp's `doc`) gets a
  FULL run dir: `findings.json` conforming to the real `ComparisonReport` type
  (import the types from `@refdiff/core`, do not hand-roll a shape), the comps'
  6 findings verbatim (`f1..f6`: titles, `prop`, `expected`, `actual`, `rect`,
  severity high/medium/low → critical/major/minor), and an `annotations.json`
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
`refdiff-annotator out/demo --serve`; the results root `out/refdiff` is no
longer served, so drop the trap note and add "the demo root is a committed
fixture; regenerate with `node design/refdiff/make-demo-root.mjs`").

**Exit:** the measure step run, numbers recorded here, and **alignment
confidence above 0.5 on at least the two compare pairs** (or, if not, the
reason measured and written down — that is itself the finding). Findings that
remain are chrome and layout, not copy.

**Numbers:** _(fill in)_

---

## 1. Design tokens, theme, and self-hosted type — TODO

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

  Regenerate the list rather than trusting it if a comp changes:
  `grep -oh 'class="msi"[^>]*>[a-z_]*<' design/refdiff/*.dc.html` plus the
  dynamic `icon:`/`Icon:`/ternary references.
  Store under `packages/annotator/assets/fonts/`, add to the package `files`,
  serve on `/fonts/` from the `handle` hook in `packages/annotator/src/cli.ts`,
  and inline the `@font-face` rules in `CSS`. The emitted (`--emit`) report has
  no server — decide there between base64-inlining the woff2 or degrading to
  system-ui, and record the decision.
- Theme toggle in both routes (the comps put it top-right in the topbar),
  persisted next to the other controls in `localStorage` (`vc-controls`).

**Exit:** `typography` and `color` causes in `refdiff summary` measured before
and after; the family-mismatch cause gone.

**Numbers:** _(fill in)_

---

## 2. Library route to the comp — TODO

`app-shell.ts` (`#view-index`, `INDEX_CSS`, `APP_BOOT`) + `index-view.ts`
(`pairCard`, `pairCards`, `pairsSummaryLine`) + `index-view.test.ts`.

- Sticky 46px topbar: accent rounded square, "RefDiff", `chevron_right`, the
  root/project name, spacer, layout toggle (`computer`/`smartphone`), theme
  toggle. 1180px max-width container, 20px 16px 40px padding.
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

**Numbers:** _(fill in)_

---

## 3. Comparison tool — chrome, tool strip, canvas overlays — TODO

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
- Focus chip top-center: `center_focus_strong` + message + "Clear".
- Mobile: the layer segment strip under the header with a "Show" label.
- Canvas: `--canvas` background, pane label pills (mono 10px/700, letter
  spacing .1em, shown only when the variant is Off and not mobile), wipe
  handle with the `sync_alt` knob, dim mask as the comps' SVG mask (radius 8
  holes), mark badges.
- Keep and place: **Strobe**, the lab **amount** slider, the "all instances"
  toggle, the keyboard-shortcut hint — see Design gaps B.

**Exit:** `refdiff-compare-desktop` chrome causes measured.

**Numbers:** _(fill in)_

---

## 4. Review rail — Findings and Comments — TODO

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

**Numbers:** _(fill in)_

---

## 5. Mobile pairs + convergence — TODO

Close `refdiff-library-mobile` and `refdiff-compare-mobile`; then iterate the
bounded loop on whatever remains across all four, recording each delta. Every
survivor becomes either a fix or an `ignore.accepted` entry whose `reason` is
the measurement.

**Exit:** all four pairs at their converged numbers; the accepted list
justified item by item.

**Numbers:** _(fill in)_

---

## 6. Land it — TODO

- `skills/refdiff/SKILL.md` + `refdiff.bindings.md` updated for anything the
  redesign changed (CLAUDE.md hard rule; `grep -n "<old-term>" skills/ packages/ docs/`
  comes back empty).
- `docs/architecture.md` "Annotator" section rewritten to the new IA;
  decisions added to "Open decisions".
- Fresh handoff; `docs/plan-next.md` pointed here.

---

## Design gaps — things the annotator does that the comps never drew

**STATUS 2026-08-28: the design is COMPLETE for phases 0–4.** Every gap below
is resolved except **18 (keyboard-shortcut hint)**, which is deliberately
deferred until after phase 4. Two comp refetches on 2026-08-28 closed the rest;
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
  IMPLEMENTATION NOTES: the comp's sample detail reads `PUT /api/comments 403`
  — the real endpoints are `PUT /api/pairs/<dir>/annotations` (and `/triage`,
  `/focus`), so show the REAL one, never the demo string. And the design marks
  only comments; **triage verdicts and the focus region also `PUT`** and can
  fail the same way — decide in phase 4 whether they get the same marker.
- **Capture settings that keep the pair comparable:** the comp's
  `anchorConfidence` prop defaults to **0.42**, so it renders the low-confidence
  warning — the demo fixture must record `confidence: 0.42`. `showDeltaStrip`
  defaults to **false**, so the demo pair must have no previous run and hide the
  strip. Otherwise both produce phantom findings.

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

