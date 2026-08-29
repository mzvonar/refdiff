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
- **Low confidence is the layout, not the fixture.** The protected baseline
  (redesign phases 0–7 + harness items 12–16 + the Library thumb fix + the
  session-15 product changes; session 16, 2026-08-29, added the fifth pair)
  is **2 / 32 / 0 / 3 / 10 findings** (library-desktop / compare-desktop /
  library-mobile / compare-mobile / compare-mobile-minimal), suppressed 25 /
  66 / 16 / 32 / 36, confidence **0.89 / 0.72 / 1.00 / 0.91 / 0.87** (the
  Library desktop reads 0.89 since the comp's `smartphone` icon stopped being
  a shared anchor — see the textPatterns bullet), alignment at the identity
  (`1 / 0,0`) on ALL FIVE pairs. The Library desktop's 2 = the chip row `position ×10` and
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
