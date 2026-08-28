# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

## 2026-08-28 — a rebuilt `dist` is invisible to the annotator that is already running
- **Context:** annotator redesign phase 1, the measure step (`svc up annotator` + `refdiff compare`)
- **Lesson:** `pnpm dev` keeps `dist` current, but the served annotator loaded its modules at start and never re-reads them — an "after" measure taken without `svc restart annotator` (or restarting the `refdiff-annotator … --serve` process) measures the OLD app and reads as "the edit had no effect". Before every measure of the annotator itself: confirm the served page contains the change (`curl <app-url>/ | grep <new-rule>`), not just `dist`. The loop rules only say "keep `pnpm dev` running".
- **Candidate home:** plan Loop rules / measure step · `refdiff.bindings.md` Traps · skill:next-phase "Rules that bite"

## 2026-08-28 — the icon-list regeneration recipe misses icons named in JS arrays
- **Context:** phase 1, the Material Symbols subset (`docs/plan-annotator-redesign.md` phase 1 "Fonts" bullet)
- **Lesson:** `grep -oh 'class="msi"[^>]*>[a-z_]*<' design/refdiff/*.dc.html` only sees static markup; the comps name a third of their glyphs in state arrays (`toolBtns`, `layerBtns`, `variantBtns`: `pan_tool`, `difference`, `tonality`, `trending_*`…). A comp change to one of those would pass the recipe unnoticed and the ligature would render as its name in letters. Regenerate from BOTH: the markup grep plus a grep over the `<script type="text/x-dc">` block for quoted `[a-z_]+` tokens, then subtract non-icon words by checking each against the Material Symbols name list (the subset request itself rejects unknown names, so the fetch is the check).
- **Candidate home:** plan phase 1 note (the recipe line) · a tiny `fixtures/list-icons.mjs` if it recurs

## 2026-08-28 — a matching `fontFamily` does not prove the font loaded
- **Context:** annotator redesign phase 1 (self-hosted IBM Plex + icon subset), `docs/plan-annotator-redesign.md`
- **Lesson:** refdiff's `typography` channel reads the COMPUTED `fontFamily`, which is the declared stack's first family whether or not its woff2 loaded — a 404'd `@font-face` still reports "IBM Plex Sans" on both sides while the pixels are system-ui. Closing a family-mismatch cause must be paired with a load check: `document.fonts.check(...)` / `[...document.fonts]` statuses in the captured page, or a zero-non-200 audit of the font requests. (The reverse case — the fallback family showing up in every typography finding — is already in SKILL.md; this is the silent one.)
- **Candidate home:** skill:refdiff ("Environment pre-flight" / the Capture checklist) · maybe core: a `CaptureError`-style `fonts-not-loaded` check in the capture adapter (principle 3, "looks fine but is wrong")

## YYYY-MM-DD — short title of the lesson   (example row — delete once you add a real one)
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard
