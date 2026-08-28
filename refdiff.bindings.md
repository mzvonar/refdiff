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
| design dir | `design/refdiff/` — Claude Design project `5a1a95c3-beee-457a-815b-ef6f6bf3e06a`, files fetched with DesignSync `get_file` (`RefDiff Library.dc.html`, `RefDiff Comparison Tool.dc.html`, `RefDiff Mobile.dc.html`, `parts/*`, `support.js`). Re-fetch to refresh; never edit a comp to make a finding go away |
| impl | the annotator app itself serving the demo root: `refdiff-annotator fixtures/demo-root --serve` (default port 7378; on the Linux devbox `svc up annotator` — `services.toml` — which hands out the next free port, 7379 while another worktree's annotator holds 7378) |
| `--app-url` | `http://127.0.0.1:<port>` — whatever the server printed / `svc ports` shows |
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
- **Low confidence is the layout, not the fixture**: the Library pairs sit
  at 0.90 / 1.00 since phase 2; the compare pairs at 0.71 / 0.90 since phase
  4, and phase 5 converged the four at **9 / 50 / 5 / 3 findings** with the
  alignment at the identity (`scale 1, offset 0`) on three of them. Since
  harness items 13–15 the baseline is **3 / 32 / 0 / 2** (the Library
  desktop's 3 = the chip row `position ×10`, the search `size`, the
  alignment note; the compare desktop's 32 is the comp's row order and
  cause lines): the fourth pair
  (`refdiff-library-desktop`) carries the `alignment` note — `align 1×0.997 /
  0,0.2` in `summary.md`, a ≈3.6 px chrome height difference on the Library
  route still to find — and D6's plate and the artboard logo squares are
  excused by `contents: true` on the manifest's D6 rules (visible under
  `suppressed` as `(inside)`). What
  holds the desktop pair under the Library's numbers is the comp's demo ROW
  ORDER (plan gap 32 — its findings array lists 1,2,3,7,8,4,5,6; refdiff
  lists by severity) and its two cause lines (gap 26); neither is the app's
  to fix. Do not tune the fixture to raise it — a fixture in the comp's order
  would carry marks out of list order, a shape refdiff never produces. The
  full converged list, item by item, is the plan's phase 5 Numbers.
- **The comps are CONTENT-box; the app is border-box.** `support.js` sets no
  `box-sizing` reset, so a comp div with `height:46px` and a 1px border is 47px
  tall; the app's `* { box-sizing:border-box }` would render 46. Every app rule
  that copies a fixed size from a bordered comp box is written as the comp's
  number plus the border (`calc(320px + 1px)`, see the comment above the reset
  in `render.ts`). The tell is not a finding: it is an `alignment` that is NOT
  the identity on a same-size viewport (phase 5: `offsetY −1.98` on the
  desktop compare pair = the topbar's and the strip's missing pixel). When you
  add chrome from a comp, add its border to the size.
- The compare pairs excuse the comp's ARTBOARD vocabulary (`COMPARE_IGNORE.
  textPatterns` — the comp imports `parts/Artboard *` as live DOM, the app
  draws the run's PNGs), the two screenshots (`accepted`), and the delta
  strip's copy (the comps disagree with each other and with the fixture's
  real delta, gaps 23/29). Visible in `findings.json` under `suppressed`.
- **`showDeltaStrip` defaults to true in the LOCAL Tool comp** (gap 29, flipped
  2026-08-28). The remote project could not be written through DesignSync;
  a refetch reverts the flip unless the prop default was changed in the app.
- **The Tool comp fits its artboard ONCE, on load.** The dc-html adapter
  therefore reloads a fluid comp at the pair viewport after detecting it;
  if the comp's zoom pill reads anything but the app's (66% at 1360, 50% at
  390) the reload did not happen and every badge/canvas finding is noise.
- **ORDER before anything else on a list page.** refdiff matches card N to
  card N; a list in a different order than the comp reads as a text-content
  and colour finding on every pill, badge and chip (phase 2: 208 → 101
  findings from the sort alone). The Library sorts newest first; the fixture's
  times reproduce the comp's hand order (`make-demo-root.ts`, `ago`).
- The `Pending` / `Processing` / `Queued` / `running` / `waiting` words, the
  relative times and the parser message on the broken card are excused by
  `LIBRARY_IGNORE.textPatterns` in the manifest — visible in `findings.json`
  under `suppressed`. What the Library pairs still report is listed in the
  plan's phase 2 Numbers (the D6 thumbnail boxes, the dropped Pending chip's
  width) and is deliberate.
- Both comps are full-bleed pages, so the design line must say `scope
  screen-label fluid` and the same css px as the pair viewport (1180×800 /
  1360×820 / 390×844). If it reports the viewport +120 instead, the fluid-frame
  detection did not fire — fix the capture before reading any position finding.
- Mobile pairs reuse the desktop comps at a 390px viewport — the comps switch
  layout by `window.innerWidth`; `RefDiff Mobile.dc.html` is a showcase wrapper,
  not a pair.
- The fixture's timestamps are fixed to the comps' clock (`DEMO_NOW`,
  2026-08-28T14:22:05Z) in git; the Library renders "12 min ago" against the
  wall clock, so measure after `node fixtures/make-demo-root.ts --now` (the
  strings agree for an hour) and regenerate without it before committing.
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
