# Lessons inbox

Transient, append-only buffer for durable lessons captured during ad-hoc work. This is **not a permanent home** — entries live here only until the user says **"process the lessons"**, at which point the `/lessons` skill promotes each to its real destination in this repo (a skill body, CLAUDE.md, `docs/architecture.md` "Open decisions", memory) or discards it, then removes the entry.

Capture trigger + routing rules live in the `/lessons` skill. **Newest entries go at the top of the log, directly under the marker below.**

<!-- LESSONS-LOG -->

## YYYY-MM-DD — short title of the lesson   (example row — delete once you add a real one)
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard
