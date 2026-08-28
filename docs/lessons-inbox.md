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

## 2026-08-28 — a matcher change invalidates a run dir's ledger (session 13, item 15)

Pass 1b (same-text pairs before nearest-box) changed what several findings
ARE on `refdiff-compare-desktop`: numerals the old γ had mis-paired with a
neighbour (reported as `text reads "6", design says "4"`) now pair by text and
read as `position`, so `resolved-ledger.json` entries from phases 3–4 named 8
of them as "back" — `REGRESSION: 8` on a run with no app change. Item 12's
"absent from the previous run" test cannot help: under the new pairing they
WERE absent. Documented in `SKILL.md` §4 as a shape to recognise (check
`resolvedAt` against the upgrade). Candidate rule for the tool: stamp the
ledger with a matcher/identity version (`ResolvedLedger.identity`) and, when
the running version differs, print "ledger written under an older pairing —
its N entries are not comparable" and drop them visibly rather than cry
wolf. Route: `docs/architecture.md` Open decisions (small feature), or
discard if the churn stays rare. **Landed there in phase 6 (2026-08-28)** as
"A matcher upgrade invalidates a run dir's ledger — open"; on process,
confirm and remove.

## 2026-08-28 — anything the served app shows for the harness's sake is measured (session 13, item 16)

The first `--read-only` announced itself in the rail's status line up front.
The measure said so: compare-desktop 32 → 37 (+6, R3) — the line is an element
the comp does not draw, and it pushed every rail row under it. Rule: a
measured impl must render EXACTLY what the writable/production app renders;
harness-only affordances (a read-only banner, a debug chip, a build stamp)
either appear only on interaction (the refusal now shows on the first save
attempted) or go into the comp too. Route: `docs/architecture.md` Open
decisions (one line under the annotator) and the refdiff skill's pre-flight
if it recurs in a consuming repo. **Landed in phase 6 (2026-08-28)**: Open
decisions "Harness-only affordances are measured" + the "Annotator" section;
the skill's pre-flight still only says the rail names the refusal on the first
save — add the general rule there if a consuming repo hits it.

