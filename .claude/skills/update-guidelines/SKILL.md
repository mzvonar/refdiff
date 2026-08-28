---
name: update-guidelines
managed-by: project
description: |
  Updates this repo's working agreement and propagates the change to every place that asserts the old behaviour — CLAUDE.md, the product skill (`skills/refdiff/SKILL.md`), the project skills under `.claude/skills/`, `docs/architecture.md` and `refdiff.bindings.md`. Use this skill whenever:
  - The user says "update the guidelines", "update CLAUDE.md", "update the architecture doc", "incorporate this decision"
  - A convention changes systematically (a test rule, a commit rule, a design principle, how a phase is measured, what a report field means)
  - A lesson promoted by `/lessons` needs a CLAUDE.md gist plus a body in a skill
  - The user asks to make CLAUDE.md **leaner / slimmer / shorter**, to do **"CLAUDE.md hygiene"**, to **trim** it, or says it has grown too long — run the Phase 3 hygiene runbook alone

  Invoke it proactively when a change to how the tool behaves or how work is done here would leave a sentence somewhere asserting the old way. The skill always runs all five phases: read → update CLAUDE.md → **Phase 3 hygiene runbook** → analyse the managed files → apply. It never stops after editing one file, because a stale assertion is worse than a missing one (CLAUDE.md's HARD RULE).

  Leanness mandate: CLAUDE.md is loaded into every session, so it stays a short working agreement of *actionable* rules (budget ≤ ~15k chars; it sits under 8k). Rule bodies live in the skill that owns the topic (load-on-demand); rationale and history live in `docs/architecture.md`; nothing lives as fat inline prose.

user-invocable: true
---

## Overview
- 5-phase skill: read → update CLAUDE.md → **Phase 3 hygiene runbook** (user-gated for big rewrites) → analyse managed files → apply; all phases mandatory. Entered at Phase 3 directly on a "make CLAUDE.md leaner / hygiene" request.
- Trigger: "update guidelines / CLAUDE.md / architecture", a systematic convention change, a `/lessons` promotion that needs a rule home; invoke proactively when a behaviour change leaves an old assertion standing somewhere.
- The homes, and what each holds:

| home | holds | loaded |
| --- | --- | --- |
| `CLAUDE.md` | the working agreement: hard rules, design principles, commands, test and commit rules — gists, not bodies | every session |
| `skills/refdiff/SKILL.md` | **the product's user interface** — what the CLI does, how to use it, how to read a report, the pre-flight; installed USER-level in every consuming repo, so it is **repo-agnostic** (no paths, ports, slugs, fixture names from a consuming repo) | on demand, by every caller that matters |
| `.claude/skills/*/SKILL.md` with `managed-by: project` | this repo's own workflows (`lessons`, `next-phase`, `clear-context-handoff`, this skill) | on demand |
| `docs/architecture.md` | the why: pipeline, principles, per-area design notes, **"Open decisions"** (decisions with their rationale and date, the narrative behind a rule) | on demand |
| `refdiff.bindings.md` | THIS repo as a consuming repo: manifest, how the impl is served, traps — the repo-specific half the product skill must not contain | by `/refdiff` here |
| `README.md`, `docs/research.md` | background; rarely a rule home | humans |

The CLAUDE.md HARD RULE is the spine of this skill: **a behaviour change and the sentence that describes it travel in the same change**, and the table there (flag → `USAGE` + skill; default → skill; policy semantic → the two skill tables; report field → "Reading the measurements"; failure mode → pre-flight; manifest shape → skill + architecture) is the propagation map.

## Phase 1 — Read Input
- Read all input material before touching any file: the change itself (a diff, a `/lessons` entry, a decision from a plan phase), then CLAUDE.md top-to-bottom, then the skill or doc that currently asserts the behaviour being changed (`grep -n "<old-term>" CLAUDE.md skills/ .claude/skills/ docs/ refdiff.bindings.md README.md`).
- Read when relevant: `docs/architecture.md` (the area's section + "Open decisions"), the live plan if one is running (`docs/plan-*.md` — its "Loop rules" and gap lists assert behaviour too), `docs/lessons-inbox.md` (an unprocessed entry may be the same lesson).
- Identify the delta: new rule vs contradicts an old one vs removes one. For a removal, list every sentence that DESCRIBED the old behaviour — those read as authoritative and will be believed.

## Phase 2 — Update CLAUDE.md (lean form)
- A new or changed rule is a **one-line actionable gist** in CLAUDE.md (imperative + when it applies) with the body in the skill or doc that owns the topic — never a fat inline paragraph. Owners by topic: tool behaviour / usage / report reading → `skills/refdiff/SKILL.md`; a repo workflow → the matching `.claude/skills/*`; design rationale, a decision, an incident narrative → `docs/architecture.md` ("Open decisions" for a decision with a date); this repo's dogfooding traps → `refdiff.bindings.md`.
- Edit a rule inline in CLAUDE.md only for the protected spine (below) or a rule that has no skill/doc home and is complete in two sentences.
- Inline prose stays actionable: the rule, the trigger, the enforcement (`*.test.ts` beside the module, the `grep` that proves the old term is gone) — never the story of how it was learned; that goes to `docs/architecture.md`.
- Examples use this repo's domain (pairs, findings, `findings.json`, the comp, the annotator, the manifest `ignore` block) — never generic app examples.
- Keep the product skill repo-agnostic while editing it: if a concrete project name, path, port or fixture creeps in, it belongs in `refdiff.bindings.md`.

## Phase 3 — CLAUDE.md Hygiene Runbook (mandatory; user-gated for big rewrites)
The repeatable procedure that keeps CLAUDE.md a short agreement. Run it after Phase 2 on every invocation, and as the whole job on a "make it leaner" request.

1. **Measure.** `wc -m CLAUDE.md` (chars, not lines — tables inflate lines). Budget ≤ ~15k; it sits under 8k. Report the count; if Phase 2 pushed it up, hygiene is required this run.
2. **Scan for the bloat classes:**
   - **a.** a rule body inline that belongs in a skill or `docs/architecture.md`
   - **b.** an incident narrative inline (round-by-round, numbers, file lists) where a one-line "why" + a pointer would do
   - **c.** N-step prose that reads better as a table or a numbered list
   - **d.** the same rule stated in two sections
   - **e.** a stale or self-contradictory sentence — a retired flag, a default that flipped, a phase that is done (grep the old framing)
   - **f.** a dangling reference — a `/skill`, `docs/*.md`, `skills/refdiff/*` or `packages/**` path that no longer exists (verify each on disk)
3. **Apply per class** (for a BIG rewrite, propose first — one batch with per-item char savings + destination — then apply on confirmation; routine trims after Phase 2 just happen):
   - **a →** ensure the body (rule + enforcement + mechanism) is in its owner; if missing, add it there in that file's style; leave the gist + pointer; delete the inline body.
   - **b →** one-line why inline; the narrative to `docs/architecture.md` (the area's section or "Open decisions") in the SAME pass.
   - **c →** convert; cut hedging and restated rationale.
   - **d →** keep one canonical statement; the duplicate becomes a pointer.
   - **e →** fix or drop; re-grep the old framing until empty (`grep -n "<old-term>" skills/ packages/ docs/` — the HARD RULE's own check).
   - **f →** repoint or remove.
4. **Protected — never extract or trim:** the HARD RULE section and its table, "Keep the skill repo-agnostic", the five design principles, "Suppression is visible or it does not happen", Commands, Tests, Commits, the lessons-capture standing instruction, and the `/update-guidelines` pointer.
5. **VERIFY nothing was lost.** Every enforcement reference (a test file, a grep, a command) and every decision date in the prose you moved or deleted must still resolve in CLAUDE.md, a skill, or `docs/architecture.md`; no dangling links remain. **Never delete hard-won context — relocate it**; git history is not a discoverable home.
6. **Re-measure & report.** `wc -m CLAUDE.md` before → after vs the budget, and where each moved body landed. Nothing to do → `CLAUDE.md hygiene: lean, no changes`.

## Phase 4 — Analyse Managed Files
- Run `.claude/skills/update-guidelines/list-managed-files.sh`; its output is the authoritative list of project skills this runbook may edit (those with `managed-by: project` in their frontmatter). Add to it, always: `skills/refdiff/SKILL.md`, `docs/architecture.md`, `refdiff.bindings.md`, and the live plan if one is running.

Gap classes to check in each file (skip a file when none apply):

**A behaviour the code no longer has** — a flag, default, ignore semantic, report field, run-dir convention or manifest shape described the old way. The CLAUDE.md table says which file must change with which kind of change; `grep -n "<old-term>"` over `skills/ packages/ docs/` must come back empty or only hit a deliberate historical note.

**A repo-specific fact in the product skill** — a path, port, org slug, project name or fixture name from a consuming repo (this one included) inside `skills/refdiff/SKILL.md` → move it to that repo's `refdiff.bindings.md` and leave the general shape.

**A principle contradicted** — a code path or instruction where the model judges parity from an image (principle 1), an effect inside a pure stage (2), a capture that could look fine but be wrong without a typed error (3), a mechanical claim where a human gate is needed (4), a per-pair failure that can kill a run (5), or a filter that drops a finding without a trace under `suppressed`.

**A test rule bent** — a bug fix without a test that fails without it; a test that does not name its real-world case; a pure module without a `*.test.ts` beside it.

**A workflow skill out of date** — `next-phase` "Rules that bite", `lessons` routing homes, `clear-context-handoff` conventions naming a file, port, service or step that changed.

**A doc asserting a finished or reversed decision** — `docs/architecture.md` sections marked "until phase N", a plan gap that is now decided, a bindings trap that no longer bites.

## Phase 5 — Apply All Changes
- Apply directly (do not propose again); priority: (1) sentences contradicting the updated behaviour, (2) missing gists / bodies for the new rule, (3) stale descriptions.
- Do not touch files outside the Phase 4 list. Do not commit — the repo's commit policy is "not unless asked".
- Finish with the HARD RULE's check: `grep -n "<old-term>" skills/ packages/ docs/ refdiff.bindings.md CLAUDE.md` — empty, or only deliberate historical notes.

## Phase 6 — Impact Check (optional, on-demand)
After a big hygiene rewrite, offer — do not run unprompted: _"want me to verify the slimmed guidelines still get the rule applied?"_ On confirmation, for each rule MOVED out of CLAUDE.md, spawn a read-only agent with a realistic task that depends on that rule, as a DRY RUN ("plan only, no edits; end with `RULE_APPLIED:` and `FILES_CONSULTED:`"). Compliance from gist + skill = the lean design working; a miss = restore the gist or strengthen the skill's description. Make each probe echo a sentinel (`wc -m CLAUDE.md`) so it provably read the changed file — a spawned agent inherits the SESSION's working directory, not a worktree you edited by absolute path.

## Spawn Strategy
- Phases 2–3 inline — judgement and user interaction.
- Phases 4–5 may go to one agent when the file list is long; give it absolute paths, the updated CLAUDE.md, the owning skill's changed body, the verbatim managed-file list, the gap classes, and the instruction to apply (not propose). Verify its edits with the Phase 5 grep.

## Output
- What changed in CLAUDE.md + `wc -m` before → after vs the budget; where each moved body landed; hygiene actions per bloat class + the verify-nothing-lost result; gaps found and fixed per managed file; files with no change needed; the final `grep -n "<old-term>"` result.
