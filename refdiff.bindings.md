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
| demo root | `fixtures/demo-root/` — COMMITTED. Regenerate the JSON with `node fixtures/make-demo-root.ts`; add `--capture` to re-shoot `design.png` / `impl.png` / `elements.json` for the opened pair from `design/refdiff/parts/` (needs the network) |
| auth | none |

## Run

```bash
pnpm dev                                                  # keep tsc --watch running; CLIs run from dist
svc up annotator                                          # or: refdiff-annotator fixtures/demo-root --serve --port 7378 &
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7379 --out out/refdiff       # the port svc allocated
refdiff summary out/refdiff
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
- **Confidence 0.00 is the layout, not the fixture** (phase 0 numbers in the
  plan): the card names and finding titles ARE shared anchors now, but they
  sit in a different grid / order (Library) and on the other side of the
  screen (the rail, compare). Do not tune the fixture to raise it — phases 2
  and 4 move the markup, and the number follows.
- Both comps are full-bleed pages, so the design line must say `scope
  screen-label fluid` and the same css px as the pair viewport (1180×800 /
  1360×820 / 390×844). If it reports the viewport +120 instead, the fluid-frame
  detection did not fire — fix the capture before reading any position finding.
- Mobile pairs reuse the desktop comps at a 390px viewport — the comps switch
  layout by `window.innerWidth`; `RefDiff Mobile.dc.html` is a showcase wrapper,
  not a pair.
- The fixture's timestamps are fixed to the comps' clock (`DEMO_NOW`,
  2026-08-28T14:22:05Z), so a relative "12 min ago" rendered against the wall
  clock will never match the comp's — see the plan's design gaps.
- **The served app WRITES into the fixture.** Placing a note, a triage verdict
  or a focus region in the served demo root PUTs `annotations.json` /
  `triage.json` / `focus.json` (+ digests) into `fixtures/demo-root/<pair>/`.
  That is the annotator working as designed, but it dirties a committed
  fixture: `git checkout fixtures/` or `node fixtures/make-demo-root.ts` before
  a measure, or the impl you measure is not the one you committed.
