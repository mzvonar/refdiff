# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

## 2026-08-28 — a non-identity alignment on a same-size viewport is a finding in itself
- **Context:** phase 5 of the annotator redesign (`docs/plan-annotator-redesign.md`), chasing a 1px sheet offset on `refdiff-compare-mobile`.
- **Lesson:** when `alignment.scale` / `offset` are not `1 / 0` on a pair whose viewport equals the comp's, the fit is absorbing a systematic size difference that no finding reports — read the transform, not only `confidence`. The cause here was the box model: Claude Design comps set no `box-sizing` reset (content-box), the app uses `* { box-sizing:border-box }`, so every fixed-size bordered chrome box was 1–2px smaller (`offsetY −1.98` = topbar + strip). Write such sizes as the comp's number plus its border and the transform snaps to the identity. Also: measure in the browser (`getBoundingClientRect`) before reasoning from CSS — the sub-pixel arithmetic misleads.
- **Candidate home:** skill:refdiff (done in the same change — the Alignment bullet under "Reading the measurements") · `refdiff.bindings.md` trap (done) · memory (the general "read the transform" habit)

## YYYY-MM-DD — short title of the lesson   (example row — delete once you add a real one)
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard
