---
name: lessons
managed-by: project
description: Capture durable lessons during ad-hoc work (outside /run-story) into a transient repo inbox, then on demand promote them to their real homes (skills, CLAUDE.md, ADRs, engineering-anchors, wiki, memory). Use this skill in THREE situations. (1) CAPTURE — proactively, the moment ad-hoc work surfaces a reusable insight: a correction the user gives on how you should work, a non-obvious gotcha, a rejected approach and why it was refuted, or a rule that should exist. Append it to docs/lessons-inbox.md; do not wait to be asked. (2) PROCESS — when the user says "process the lessons", "harvest the lessons", "let's turn the lessons into skills/guidelines", "promote the lessons", or "drain the lessons inbox": read the inbox and route each entry to its durable home or discard it. (3) SETUP — when the user says "set up lessons", "install the lessons skill", or the skill is freshly copied into a repo that has no docs/lessons-inbox.md or capture rule yet. Do NOT use this for /run-story lessons (that flow owns its own lesson pipeline) or for one-off notes with no lasting value.
---

# lessons — capture durable insights during ad-hoc work, promote them later

The `/run-story` flow captures lessons as it goes and, at "done", turns them into skill/guideline updates. **Ad-hoc prompting has no such pipeline** — so the valuable corrections, gotchas, and rejected approaches that surface during free-form work get lost. This skill closes that gap with two lifetimes:

- **Inbox** (`docs/lessons-inbox.md`) — a transient, append-only buffer. Cheap to write to mid-work.
- **Durable homes** — skills, `CLAUDE.md`, ADRs, `docs/engineering-anchors.md`, the wiki, memory. Where a lesson actually belongs once it's proven worth keeping.

Capture is a **standing CLAUDE.md rule** (always-on, so it fires without being invoked). Processing is **this skill, invoked on demand**. They meet at the inbox.

## 1. Setup (run once per repo)

When the skill is freshly copied into a repo, or the user asks to **"set up lessons" / "install the lessons skill"**, and there's no `docs/lessons-inbox.md` / capture rule yet:

```bash
node .claude/skills/lessons/scripts/setup.mjs
```

Idempotent. It (1) creates `docs/lessons-inbox.md` from a bundled template if missing, and (2) appends the standing capture rule to `CLAUDE.md` if not already there (creating `CLAUDE.md` if absent). Commits nothing — leave that to the user. Re-running is safe; existing files/rules are skipped, not overwritten.

## 2. Capture (proactive, during ad-hoc work)

**Append the moment a durable lesson surfaces — do not wait for "process".** Chat scrollback isn't reliably re-scannable later, so an unwritten lesson is a lost lesson. What counts as a durable lesson:

- **A correction on how you should work** — the user redirected your approach and you'd want that to stick ("don't do X, do Y because Z"). → usually CLAUDE.md/memory `feedback`.
- **A non-obvious gotcha** — a footgun, an environment quirk, a wrong assumption that cost a rewrite. → usually an engineering-anchor or a skill body.
- **A rejected approach + why** — you weighed A vs B and picked one for a reason worth preserving. → usually an ADR.
- **A rule that should exist** — a pattern you had to derive that future work should just follow. → usually CLAUDE.md + the matching skill.

Not every observation qualifies — skip anything already covered by an existing rule, or that only mattered to the current task. When in doubt, capture; `process` can discard cheaply.

**Format** — append a `##` section at the **top of the log** (directly under the `<!-- LESSONS-LOG -->` marker in `docs/lessons-inbox.md`), newest first:

```markdown
## 2026-08-06 — short title of the lesson
- **Context:** what work / branch / file this came from
- **Lesson:** the durable insight, stated as an actionable rule (what to do, and why)
- **Candidate home:** (optional guess) skill:<name> · CLAUDE.md · ADR · anchor · wiki · memory · discard
```

Get the date from the session's current-date context (never guess). `Candidate home` is a hint for the process step — leave it blank if unsure. Use `Write`/`Edit` to append; never a shell-side write of any kind — heredoc, redirect, `sed -i`, `python3 -c` (all bypass the hooks).

## 3. Process (on demand — "process the lessons")

When the user asks to process/harvest/promote the lessons:

1. **Read** `docs/lessons-inbox.md`. If it's empty (only the example row), say so and stop.
2. **Route each entry** to exactly one durable home using the table below, and draft the concrete change (the actual rule text / ADR / anchor / memory entry).
3. **Present the routing plan first** — a short list of `entry → home → proposed change` — and get the user's confirmation before editing durable files. Promotion mutates curated, always-loaded files (CLAUDE.md, skills), so this is a real gate, not a formality. Batch the plan; don't ask per-entry.
4. **Apply**, preferring the repo's existing machinery over hand-edits:
   - **CLAUDE.md rule / skill body change** → invoke `/update-guidelines` (it edits CLAUDE.md *and* propagates to the affected skills/agents). Do not hand-edit CLAUDE.md for a rule change when that skill exists.
   - **Rejected-approach / significant decision** → new ADR from `docs/adr/template.md` (next number); cross-link the wiki page it backs.
   - **Incident narrative behind a rule** → append to `docs/engineering-anchors.md`; cite it as `Anchor: …` wherever the rule lives.
   - **Business rule / domain / integration** → the matching `docs/wiki/` page (+ `log.md`).
   - **How-you-should-work fact / project state** → a `memory` entry (`feedback` or `project` type) with `**Why:**` / `**How to apply:**`, plus its `MEMORY.md` pointer.
   - **Already covered / not durable** → discard (state why).
5. **Drain** — remove each promoted (or discarded) entry from the inbox as it's handled, so the inbox reflects only unprocessed lessons. Leave the header, marker, and example row intact.
6. **Report** what landed where, and remind the user nothing is committed (per the repo's commit policy — never commit unless asked).

### Routing table

| Lesson kind | Durable home | Mechanism |
| --- | --- | --- |
| Rule about how code should be written; a correction that should always apply | CLAUDE.md + matching skill | `/update-guidelines` |
| A gotcha / footgun / env quirk worth a war story | `docs/engineering-anchors.md` (+ a one-line rule cite) | Edit |
| Chose A over B for a reason worth preserving | ADR | `docs/adr/template.md` |
| Business rule / domain concept / 3rd-party integration behaviour | `docs/wiki/` page | Edit (+ `log.md`) |
| A fact about how you should work with THIS user/project | Memory | `feedback`/`project` entry + `MEMORY.md` pointer |
| Redundant with an existing rule, or one-off | — | Discard, say why |

## Portability

Self-contained: `SKILL.md` + `scripts/setup.mjs`, no deps beyond `node` + `git`. To reuse in another repo, copy `.claude/skills/lessons/` and run `setup.mjs` (step 1) — it plants the inbox and the capture rule. The **process** step references this repo's specific homes (`/update-guidelines`, `docs/adr/`, `docs/engineering-anchors.md`, `docs/wiki/`, memory); in a repo that lacks them, fall back to editing the primary guidelines file or a `docs/` note. Capture and the inbox work anywhere unchanged.
