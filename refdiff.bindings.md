# refdiff bindings — this repo (dogfooding the annotator redesign)

The annotator (`packages/annotator`) is redesigned against the **RefDiff** comps
and measured with this repo's own CLI. The impl under test is the annotator
serving a **committed fixture root**, `fixtures/demo-root/`, whose run dirs
mirror the comps' demo data (twelve Library items, the `Onboarding — Document
step` pair opened with the comps' findings and comments). Plan and numbers:
`docs/plan-annotator-redesign.md`.

| what | where |
| --- | --- |
| manifest | `design/refdiff.manifest.mjs` |
| design dir | `design/refdiff/` — Claude Design project `5a1a95c3-beee-457a-815b-ef6f6bf3e06a`, files fetched with DesignSync `get_file` (`RefDiff Library.dc.html`, `RefDiff Comparison Tool.dc.html`, `RefDiff Mobile.dc.html`, `RefDiff Mobile Minimal.dc.html`, `parts/*`, `support.js`; `ios-frame.jsx` is an unused starter). Re-fetch to refresh; never edit a comp to make a finding go away. After a refetch run `node packages/annotator/scripts/icon-subset.mjs` — a new icon in a comp renders as its NAME until the subset has it |
| impl | the annotator app itself serving the demo root: `refdiff-annotator fixtures/demo-root --serve` (default port 7378; on the Linux devbox `svc up annotator` — `services.toml` — which hands out the next free port, 7379 while another worktree's annotator holds 7378) |
| `--app-url` | `http://127.0.0.1:<port>` — whatever the server printed / `svc ports` shows |
| viewing from a laptop / phone | `svc up annotator-tailnet` — the same read-only instance bound to the devbox's Tailscale IP only (`http://uctoinak-dev.tail31a8b9.ts.net:7390/`, `svc ports` for the port). Never `--host 0.0.0.0` here: the box has a public interface and no firewall. Tailscale Serve is NOT enabled on the tailnet (admin console), which is why a second instance rather than a proxy of 7379 |
| run dir | `out/refdiff/<pair>/` (gitignored results; never served) |
| demo root | `fixtures/demo-root/` — COMMITTED. Regenerate the JSON with `node fixtures/make-demo-root.ts`; `--now` shifts every timestamp to the wall clock for a measure (the Library's relative "when" — regenerate WITHOUT it afterwards, never commit `--now` output); `--capture` re-shoots `design.png` / `impl.png` / `elements.json` for the opened pair from `design/refdiff/parts/` (needs the network) |
| auth | none |

## Run

```bash
pnpm dev                                                  # keep tsc --watch running; CLIs run from dist
svc up annotator                                          # or: refdiff-annotator fixtures/demo-root --serve --read-only --port 7378 &
svc restart annotator                                     # after any annotator edit — the served shell is rendered at start
node fixtures/make-demo-root.ts --now                     # fixture clock = now, so "12 min ago" reads as the comp's
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff       # the port svc allocated; --pair a,b is ONE comma-separated flag
refdiff summary out/refdiff
node fixtures/make-demo-root.ts                           # the committed clock back before you commit anything
```

## Traps

- **The served root is the fixture, the results root is `out/refdiff`** — two
  different directories on purpose. Serving `out/` would put every result
  dir in the Library as a card and change the impl with every run. The demo
  root's card set is fixed at 12 (one of them, `onboarding-liveness-step`,
  deliberately unreadable — it renders the degraded card).
- **Port 7378 may be taken** by another worktree's annotator on the devbox
  (`svc ports`). `svc up annotator` picks the next free port; pass that as
  `--app-url` or the compare captures the wrong app and every finding is noise.
- The comparison-tool route is a hash route (`/#/<run-dir>`). It must name a
  dir that exists under the demo root (`onboarding-document-step`); a missing
  dir renders the index instead and compares "fine" against the wrong comp.
- The comps hydrate the `dc-runtime` from `support.js` and React from unpkg —
  offline runs fail `hydration-failed`, not silently. The same goes for
  `make-demo-root.ts --capture`.
- **⚠ THE BASELINE BELOW PREDATES THE SURFACE CHANNEL (2026-09-02) — re-measure before
  trusting it.** Four capabilities landed in core that make the harness see things it was
  structurally blind to, so every pair's count moved UP and two pairs that PASSED now fail.
  That is not a regression: they were passing on incomplete measurement. Measured on the
  same six pairs, fixture clock pinned, immediately after the change:
  `6 / 45 / 4 / 11 / 19 / 10` findings (library-desktop / compare-desktop / library-mobile /
  compare-mobile / compare-mobile-minimal / compare-mobile-toolbar) against the old
  `2 / 32 / 0 / 3 / 11 / 1` — **47 of the new findings are about `surface` elements**.
  What changed:
  1. **A `surface` channel.** A container that PAINTS (background, border, radius, shadow)
     now emits as `role: "surface"` on BOTH sides (DOM `extract.ts` and `figma-tree.ts`),
     where before only leaves were extracted — so a bar vs a floating pill was invisible to
     the structural channel AND to the pixel channel, which only diffs boxes that matched.
     It does NOT double-count the existing decoration hoisting: a container whose paint a
     descendant leaf already carries is `claimed` and stays unemitted, which is the rule
     `figma-tree.test.ts` pins as "Container with children and decoration is not itself a
     leaf". Surfaces are excluded from the design-QUALITY numerator AND denominator, so the
     `figma-low-quality` gate is untouched (verified: the recorded Button/Fill set still
     scores 0.64). Turn it off for a pair with `roles: ["surface"]`.
     **Falsified, not assumed:** reverting the toolbar layout to the full-width bar and
     re-running reported `extra-element — implementation renders surface at (0, 111)
     (390×35) that the design does not have`. Before the channel: zero findings about it.
  2. **A whole-frame remainder backstop** (`diffRemainder`): the frame diffed once, every
     matched box subtracted with a margin, the rest clustered and reported as one finding
     above 0.4% of the frame. It stayed BELOW its floor on the falsification (0.28%) because
     the surface channel caught the bar structurally first — the intended layering, cheap
     channel first. `compare-mobile-minimal` currently reads 4.10% / 46 regions, which is
     real unexplained area worth a look.
  3. **Role-scoped `textPatterns`** (`{ pattern, role }`): a bare string still matches any
     role. This exists because the artboard-vocabulary pattern listed `Review`, a word in
     the artboard AND the delta strip's button label, and silenced both.
  4. **A hidden-movement warning.** The run summary now names any suppressed
     `position`/`size`/`spacing` finding that moved ≥8px, with the rule that hid it, and
     points at `dataSlots: { patterns }` when that rule was a text pattern. `accepted`
     rules are exempt — those were built from the measurement and already read by a person.
  Also: **runs are numbered** (`report.run`, `delta.previousRunNumber`), so the strip reads
  "Run 47 vs 46" instead of a timestamp. The counter is the previous report, so it has the
  run dir's lifetime; a report written before this has no ordinal and falls back to the
  timestamp.
  The four `missing-element design surface` findings on the compare pairs are the comp's
  ARTBOARD drawn as live DOM against the app's PNG — the known case, newly visible because
  those containers are textless and `textPatterns` cannot reach them. They want a `regions`
  entry or an extended `accepted` rule; that is a policy decision, not done here.

- **A LIVE comp has states that only exist after an interaction — `steps` is how they
  become measurable, and the pair that uses them is `…-toolbar-ghost`.** The ghost language
  for one-sided findings (a hatched dashed footprint on the pane that lacks the element, a
  hollow number chip with "Missing here — exists in design" / "Only in impl — nothing here in
  design", and on the phone a `swap_horiz` View design/impl switch inside the pill) exists in
  BOTH comps, and none of it is in the default capture. Before `steps` the whole design was
  invisible to the harness. Measured: the toolbar comp captures **72 leaf elements** in its
  default state and **215** after `[{clickText:"list_alt"},{wait:400},{clickText:"12 Retake
  photo"},{wait:500}]`.
  Rules, enforced not just documented (`packages/core/src/adapters/steps.ts`):
  * **Steps go on BOTH sides.** A state is a state; the comp selected against the app
    unselected reports "this state vs that state" as drift. The CLI warns when only one
    side has them (`stepsOnOneSide`).
  * **A step whose target is missing HARD-STOPS.** Falsified by breaking the selector on
    purpose: a typed `{kind:"step-failed", step, index, detail}` at **exit 2**, never a
    quiet capture of the default state — which would go green while measuring something
    else, the failure class `blank-render` and `figma-low-quality` exist to prevent.
  * **`clickText` is the escape hatch and it is brittle** — the comp's rail rows are bare
    divs, so the step matches rendered copy and dies when row 12 is reworded. The CLI prints
    that warning every run. **Ask for a `data-vc-step` attribute on the comp's interactive
    triggers** — the same kind of hook `data-vc-scope` already is — and switch to `click`.
  **Both step-driven pairs now use STABLE HOOKS, not copy.** The comp renders
  `data-vc-step="{{f.id}}"` on every rail row (added at our ask, 2026-09-02), so the
  one-sided rows are `o1`..`o4` and a step selects one by identity: `{ click:
  "[data-vc-step=o1]" }`. Before that the step matched the row's TITLE and died on any
  rewording. The impl side uses `.frow:has(.fside)` — "the first ONE-SIDED row" — because the
  app renumbers findings f1..fn every run, so an id selector there would mean "the first
  finding", not "a one-sided one", and the ghost would not appear at all on a run whose f1
  happens to be two-sided. `refdiff-compare-desktop-ghost` has **no text match anywhere** in
  its steps (split mode needs no rail-open tap), which makes it the one to trust after a
  refetch; the mobile pair still opens the rail by the `list_alt` GLYPH name, and a
  `data-vc-step="open-rail"` on that button would remove the last one.
  **FIXTURE PARITY IS DONE** (2026-09-02): `make-demo-root.ts` carries the comp's rows 12–15
  as real one-sided findings — `o1` critical design-only (Retake photo button missing), `o2`
  major design-only, `o3` major impl-only, `o4` minor impl-only, boxes and titles the comp's
  own — plus comment `c4`, `side: "design"`, a 0×0 POINT. A one-sided finding carries exactly
  ONE box, which is what makes it one-sided; the `f()` helper sets both, so they go through
  `one()`. The Library card's declared counts moved with them (2/2/2 → 3/5/4, comments 3 → 4):
  the card and the rail are separate declarations here and nothing type-checks the agreement.
  It paid immediately — `refdiff-compare-mobile-toolbar` went 0.92 → **1.00** confidence and
  `refdiff-compare-mobile` 0.91 → 0.97, because parity is what supplies anchors (§1a).
  **The ghost pairs are now the SPEC for work that is not built:** 119 findings at confidence
  0.49 (mobile — still under the 0.5 gate, so read nothing positional from it yet) and 176 at
  0.55 (desktop). They are large because the comp draws the ghost and the app does not: the
  ghost language is measured and specified, and unimplemented.

- **Low confidence is the layout, not the fixture.** The protected baseline
  (redesign phases 0–7 + harness items 12–16 + the Library thumb fix + the
  session-15 product changes; session 16, 2026-08-29, added the fifth pair;
  2026-09-02 added the SIXTH, `refdiff-compare-mobile-toolbar`)
  is **2 / 32 / 0 / 3 / 11 / 1 findings** (library-desktop / compare-desktop /
  library-mobile / compare-mobile / compare-mobile-minimal / compare-mobile-toolbar),
  suppressed 25 / 66 / 16 / 32 / 36 / 31, confidence
  **0.89 / 0.72 / 1.00 / 0.91 / 0.87 / 0.92** (the
  Library desktop reads 0.89 since the comp's `smartphone` icon stopped being
  a shared anchor — see the textPatterns bullet), alignment at the identity
  (`1 / 0,0`) on the first FIVE pairs and `1×0.99937 / 0,0.5` on the toolbar
  pair (its own minor `alignment` finding, below).
  **Two corrections to the numbers recorded on 2026-08-29, both measured with the
  fixture clock pinned (`make-demo-root.ts --now`, then measure IMMEDIATELY):**
  (a) `compare-mobile-minimal` is **11**, not 10 — verified NOT to be the toolbar
  work by stashing `render.ts`, rebuilding and re-running that pair alone: still
  11 (1/7/3), suppressed 36, confidence 0.87. It is pre-existing drift at HEAD
  and its extra finding is unattributed; (b) reading the baseline WITHOUT pinning
  the clock gave `library-desktop` suppressed **41** instead of 25 — the drift the
  timestamps bullet below predicts. Pin the clock or the numbers are noise. The Library desktop's 2 = the chip row `position ×10` and
  the search `size` (both the comp's demo data, section H). Its former
  `alignment` note (`align 1×0.997 / 0,0.2`) was the card `.thumb` rendered
  at 132 px against the comp's content-box 132 + 1 px border — 1 px per card
  row, three rows — fixed as `calc(132px + 1px)`; no app-side item is left.
  D6's plate and the artboard logo squares are excused by
  `contents: true` on the manifest's D6 rules (visible under `suppressed` as
  `(inside)`). What holds `refdiff-compare-desktop` at 32 and 0.71 is the
  comp's demo ROW ORDER (plan gap 32 — its findings array lists
  1,2,3,7,8,4,5,6; refdiff lists by severity) and its two cause lines (gap
  26); neither is the app's to fix. The compare MOBILE's 3 = gap 34's two
  (`expand_less`, the summary) + gap 35: the comp centres its phone canvas in
  the whole pane, the app above the bottom sheet (`paneInsets`, decided
  2026-08-28), so the badges read `position ×11 (0, −22.4)` — left visible,
  a rule on every badge would hide a real one. Do not tune the fixture to raise it — a
  fixture in the comp's order would carry marks out of list order, a shape
  refdiff never produces. The full converged list, item by item, is the
  plan's phase 5 Numbers; the asks on the comp's side are its section H.
- **The comps are CONTENT-box; the app is border-box.** `support.js` sets no
  `box-sizing` reset, so a comp div with `height:46px` and a 1px border is 47px
  tall; the app's `* { box-sizing:border-box }` would render 46. Every app rule
  that copies a fixed size from a bordered comp box is written as the comp's
  number plus the border (`calc(320px + 1px)`, see the comment above the reset
  in `render.ts`). The tell is not a finding: it is an `alignment` that is NOT
  the identity on a same-size viewport (phase 5: `offsetY −1.98` on the
  desktop compare pair = the topbar's and the strip's missing pixel; `scaleY
  0.9966` on the Library desktop = the card thumb's missing pixel × 3 rows —
  an OFFSET is one box, a SCALE is one box repeated, `SKILL.md` §1a says how
  to walk the raw positions to name it). When you add chrome from a comp,
  add its border to the size.
- The compare pairs excuse the comp's ARTBOARD vocabulary (`COMPARE_IGNORE.
  textPatterns` — the comp imports `parts/Artboard *` as live DOM, the app
  draws the run's PNGs), the two screenshots (`accepted`), and the delta
  strip's copy (the comps disagree with each other and with the fixture's
  real delta, gaps 23/29). Visible in `findings.json` under `suppressed`.
  (The former `accepted` rule for the strip's × in the regression state went
  on 2026-08-29: the refetched comp draws the × there, as the app decided on
  2026-08-28, so the rule stopped hitting — §3a's lapse working as designed.)
- **`showDeltaStrip` defaults to true in the Tool comp, remotely too** since
  the 2026-08-29 refetch (gap 29, closed): a refetch no longer reverts it.
- **The phone's MINIMAL layout is its own pair**, `refdiff-compare-mobile-minimal`:
  the comp `RefDiff Mobile Minimal.dc.html` draws a fixed 390×844 phone inside
  a dark showcase canvas, so the pair's `design.scope: ".cc-theme-dark"` picks
  the phone node (its design line reads `scope explicit fluid`, 390×844); the
  app renders that layout when `?layout=minimal` is on the URL
  (`/?layout=minimal#/onboarding-document-step` — the preset never persists).
  The Minimal comp has no delta strip; Mato (2026-08-29): the app renders
  it there as in the default layout, so until the comp carries the strip
  the pair reads **10** — the canvas ~66px lower than the comp's (the align
  button ×2, the badges ×10) and badge "1" mis-paired with the artboard's
  step numeral "1" (5) — none of them the app's (plan gap 36, the ask is
  the strip in the comp). The strip's `warning` / `close` glyphs and the
  comp's shortened title are accepted by content (`MINIMAL_IGNORE`, gaps
  36 / 37). Measured at 0 with the strip hidden, so the layout itself is
  closed.
- **The phone's TOOLBAR layout is its own pair**, `refdiff-compare-mobile-toolbar`
  (2026-09-02): the comp `RefDiff Mobile Toolbar.dc.html` draws a fixed 390×844
  phone in a dark showcase canvas, so the pair uses `design.scope: ".cc-theme-dark"`
  exactly as the Minimal pair does, and the app renders it at
  `/?layout=toolbar#/onboarding-document-step`. It is the MINIMAL layout plus a
  header toolbar and a strip row, so `body` carries `layout-minimal` AND
  `layout-toolbar` and `minimalOn()` covers both — only the deltas live under
  `.layout-toolbar`. Measured off the comp, not read off its markup: the Compare
  segment is IN the header (`Off` x=109 … `Diff` x=285), the Show segment is its
  own row beneath it (`Findings` x=21 … `Clean` x=190, `hub` x=355) — that row is
  the "top floating toolbar" — and **the tool strip STAYS AT THE BOTTOM** (y=807),
  where the minimal layout already puts it. There is no phone-layout switch and no
  `tune` button in this layout at all (the comp drops both glyphs and puts the
  dark/light toggle in the header), so `?layout=toolbar` is the only way in.
  It **PASSES**: 1 finding (0 critical / 0 major / 1 minor), suppressed 31, confidence 0.92.
  **The comp gained the delta strip on 2026-09-02** (refetch: 65621 -> 68959 bytes,
  `showDeltaStrip` now a prop and it defaults TRUE, so the strip IS captured; the
  `close` glyph arrived with it). That refetch closed the gap this pair opened with:
  20 -> 7 findings on the comp change alone, and **two `accepted` rules went inert by
  themselves** — the strip's `warning` and `close` had been accepted as extra-elements,
  the comp now draws both, so the rules stopped hitting. That is why a decision is built
  from the MEASUREMENT and never edited into the comp: it lapses on its own. Two app-side
  fixes followed, both measured: the Show segment needed the same +1px button padding as
  the header one (the comp leaves 20px between labels, `seg-sm`'s 8px left 18, and the
  shortfall accumulated to -6px by `Clean`), and the align pill belongs IN the strip row
  (`hub` design y=125, the same y as `Findings`) rather than in the canvas below it.
  **The Show control FLOATS; it is not a row — and refdiff is STRUCTURALLY BLIND to the
  difference.** The comp's is `position:absolute` at canvas-relative (8,8), **223x29**,
  `--bg1`, 1px `--line` all round, radius 10px, shadow `0 4px 16px`. A first pass used
  `.layer-strip` (static, **390px** wide, `border-bottom` only, no radius, no shadow) and
  the run reported NOTHING about it: the structural channel compares LEAF elements, and a
  background / border / width on a container that has children is not a leaf, while the
  pixel channel only diffs boxes that MATCHED. Mato caught it by eye. It is fixed by
  reusing `.view-panel` (already inside `.work`, already absolute, already in
  `paneInsets`) with its nested `.seg` flattened — the app's pill now measures 223x29 at
  8,8, byte-matching the comp. Two corrections came with it: the spurious 35px row was
  ALSO the cause of the `position "1" x11 (0, 17.2)` badge offset — which this file
  previously attributed to the decided `paneInsets` difference the minimal pair carries as
  `(0, -22.4)`. **That attribution was wrong**: removing the row resolved the badges and
  `.work` now starts at y=111 against the comp's canvas at 110. And the `-28px` align-pill
  lift was compensating for the same row; it is gone. The `missing-element` 13x13 box at
  design (35, 293) also went with it. The minor `alignment` (`scale y 0.99937`,
  `offset y 0.5`) is a box-model pixel in the chrome above the anchors and cannot be
  accepted; the header is `calc(44px + 1px)` against the comp's 44.
  **After a refetch, verify `dist` is newer than `render.ts` before measuring.** The
  `pnpm dev` watcher stopped rebuilding silently mid-session (a `git stash`/`pop` of
  `render.ts` during an A/B is the suspected cause): two CSS fixes read as `+0/-0` delta
  because the served shell was 25 minutes stale. `pnpm --filter @refdiff/annotator build`
  and compare the mtimes; the served shell is rendered at annotator START, so restart it too.
- **A comp's new icon renders as its NAME until the subset has it.** The
  served icon font is Google's subset of exactly the glyphs in
  `packages/annotator/src/icon-names.ts` (generated); `settings` / `tune` /
  `list_alt` / `swap_horiz` measured `152×23` against the comp's `19×23`
  before `node packages/annotator/scripts/icon-subset.mjs` (network) rebuilt
  it. `--check` says whether the list is current; the tell in a run is a
  `size` finding on an icon whose width is a word's, not a glyph's. A phone
  that had the page open keeps the OLD face for a day (`max-age=86400`)
  unless the URL changes — it does: `fonts/<hash of the list>/<file>`.
- **The Tool comp fits its artboard ONCE, on load.** The dc-html adapter
  therefore reloads a fluid comp at the pair viewport after detecting it;
  if the comp's zoom pill reads anything but the app's (66% at 1360, 50% at
  390, 53% on the minimal pair — its comp fits with a 16px margin) the
  reload did not happen and every badge/canvas finding is noise.
- **ORDER before anything else on a list page.** refdiff matches card N to
  card N; a list in a different order than the comp reads as a text-content
  and colour finding on every pill, badge and chip (phase 2: 208 → 101
  findings from the sort alone). The Library sorts newest first; the fixture's
  times reproduce the comp's hand order (`make-demo-root.ts`, `ago`).
- The `Pending` / `Processing` / `Queued` / `running` / `waiting` words, the
  relative times, the parser message on the broken card and the topbar's
  `smartphone` / `computer` icon (the comp's DESIGN-PREVIEW switch — Mato flips
  the artboard's layout with it; the app has no such control since 2026-08-28,
  the width decides) are excused by `LIBRARY_IGNORE.textPatterns` in the
  manifest — visible in `findings.json` under `suppressed`. What the Library desktop pair still reports (the
  dropped `Pending` chip's 78px moving every chip after it, the search field's
  size) is deliberate — plan section H; the D6
  thumbnail boxes are excused by `contents: true` since harness item 14.
- Both comps are full-bleed pages, so the design line must say `scope
  screen-label fluid` and the same css px as the pair viewport (1180×800 /
  1360×820 / 390×844); the minimal pair's says `scope explicit fluid` (the
  showcase frame is fluid, the phone inside it is the scope) at 390×844. If it
  reports the viewport +120 instead, the fluid-frame detection did not fire —
  fix the capture before reading any position finding.
- Mobile pairs reuse the desktop comps at a 390px viewport — the comps switch
  layout by `window.innerWidth`; `RefDiff Mobile.dc.html` is a showcase wrapper,
  not a pair. The minimal layout's comp is fixed-size and scoped (above).
- The fixture's timestamps are fixed to the comps' clock (`DEMO_NOW`,
  2026-08-28T14:22:05Z) in git; the Library renders "12 min ago" against the
  wall clock, so measure IMMEDIATELY after `node fixtures/make-demo-root.ts
  --now` — the strings agree only until the next minute ticks (three minutes
  later `12 min ago` reads `15 min ago`, five relative-time anchors drop out
  and the desktop confidence reads 0.89 instead of 0.90 with 29 suppressed
  instead of 24 — measurement noise, not a change) — and regenerate without
  it before committing.
- **The served app WRITES into the fixture — so the measured instance is
  served `--read-only`** (`services.toml`, harness item 16): every PUT is
  refused with 405 and the rail's status line says so on the first save
  attempted (never up front — that line would shift the rail by +6
  findings). Placing a note, a
  triage verdict or a focus region against a WRITABLE serve of the demo root
  (or `--mark-implemented … --reply` against it, which writes regardless of
  any server) PUTs `annotations.json` / `triage.json` / `focus.json` (+
  digests) into `fixtures/demo-root/<pair>/` and dirties a committed fixture:
  `git checkout fixtures/` or `node fixtures/make-demo-root.ts` before a
  measure.
