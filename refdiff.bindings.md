# refdiff bindings — this repo (dogfooding the annotator redesign)

> **Being rewritten by the redesign.** `docs/plan-annotator-redesign.md` phase 0
> moves the impl under test from the live `out/` root to the committed fixture
> root `fixtures/demo-root/`. Until that phase lands, the table below still
> describes the OLD setup — trust the plan over this file where they disagree.

The annotator (`packages/annotator`) is redesigned against the **RefDiff** comps
and measured with this repo's own CLI.

| what | where |
| --- | --- |
| manifest | `design/refdiff.manifest.mjs` |
| design dir | `design/refdiff/` — Claude Design project `5a1a95c3-beee-457a-815b-ef6f6bf3e06a`, files fetched with DesignSync `get_file` (`RefDiff Library.dc.html`, `RefDiff Comparison Tool.dc.html`, `RefDiff Mobile.dc.html`, `parts/*`, `support.js`). Re-fetch to refresh; never edit a comp to make a finding go away |
| impl | the annotator app itself: `refdiff-annotator out --serve` (port 7378, serves the existing run dirs under `out/` as fixture data) |
| `--app-url` | `http://127.0.0.1:7378` |
| run dir | `out/refdiff/<pair>/` |
| auth | none |

## Run

```bash
pnpm dev                                                  # keep tsc --watch running; CLIs run from dist
refdiff-annotator out --serve &                    # the impl under test (uses out/ as data)
refdiff compare --manifest design/refdiff.manifest.mjs --design-dir design/refdiff \
  --app-url http://127.0.0.1:7378 --out out/refdiff
refdiff summary out/refdiff
```

## Traps

- **Do not point `--out` inside the served root's pair list carelessly**: the
  server lists every child of `out/` with a `findings.json`, so `out/refdiff/*`
  itself shows up as pairs in the Library page after the first run. That is
  fine (more cards) but it means the impl's card count changes with every run —
  the Library pair's `text-content` / `extra-element` findings on card rows are
  fixture data, not drift.
- The comparison-tool route is a hash route (`/#/<run-dir>`). It must name a
  dir that exists under `out/`; a missing dir renders the index instead and
  compares "fine" against the wrong comp.
- The comps hydrate the `dc-runtime` from `support.js` and React from unpkg —
  offline runs fail `hydration-failed`, not silently.
- The comps' demo data (Veriflow, "Onboarding — Document step", 6 findings) is
  designer fixture data; the annotator renders whatever is in `out/`. Expect
  alignment confidence to lean on chrome labels (Library, Findings, Comments,
  Split/Full, Off/Wipe/Onion/Blink/Diff) until the app's copy matches the comp.
- Both comps are full-bleed pages, so the design line must say `scope
  screen-label fluid` and the same css px as the pair viewport (1180×800 /
  1360×820 / 390×844). If it reports the viewport +120 instead, the fluid-frame
  detection did not fire — fix the capture before reading any position finding.
- Mobile pairs reuse the desktop comps at a 390px viewport — the comps switch
  layout by `window.innerWidth`; `RefDiff Mobile.dc.html` is a showcase wrapper,
  not a pair.
