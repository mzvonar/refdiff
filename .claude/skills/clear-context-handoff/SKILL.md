---
name: clear-context-handoff
description: 'Prepare a clean-context handoff. Use when the user asks to "hand off", "prepare a clear-context handoff", "write a handoff", or otherwise wants to /clear and continue in a fresh session. Produces a committed handoff doc (what we''re doing, what''s done, ordered next steps, research/open questions) plus a kickoff prompt to paste into the fresh context.'
---

# Clear-context handoff

**Goal:** capture everything a fresh context needs to continue the work, in a durable doc,
and hand back a ready-to-paste kickoff prompt. Two deliverables: (1) a **handoff doc**,
(2) a **kickoff prompt**.

## Steps

1. **Write/refresh the handoff doc** at `docs/handoff-<YYYY-MM-DD>.md` (one canonical "latest"
   doc; rewrite it if same-day, git keeps history — when a new date replaces an older handoff,
   delete the old file and update any pointers in `docs/plan-next.md`). Use the template below.
   Be concrete — cite file paths, exact symbols, commit SHAs, measured numbers from the corpus
   (e.g. the doc-detail finding counts), not vague summaries. A future you with **no memory of
   this session** must be able to continue. Keep `docs/plan-next.md` in step (mark items DONE,
   point "DO NEXT" at the right one).
2. **Commit it** so the tree is clean for the fresh session (`docs: refresh handoff …`). Honor repo
   commit conventions: conventional-commit type, subject ≤50 chars, no ticket scope (personal
   repo), body bullets at column 0, blank line before the `Co-Authored-By` footer.
   **Never push** — the user pushes this repo himself (pre-push hook bypass required).
3. **Give the kickoff prompt** in chat (code block) using the template below.

## Handoff doc template

```md
# <Project> — Handoff (<date>, current)

<One line: what this is, branch, repo, toolchain. Note it's the canonical latest handoff.>

## State of play
<1 short paragraph: what we're building, overall status, what's committed/pushed (latest SHA).>

## What's DONE
- <bullets, each with the file(s)/package and, where useful, the commit SHA>

## What REMAINS (in order)
### 1. <next step> ← DO FIRST
<concrete: which files, the approach, the decision to make>
### 2. <next step> ← DO SECOND
<…>
### Later / future reference
- <deferred items, scope expansion>
### Needs research / open questions
- <unknowns to investigate; questions only the user can answer>

## How to run
```<commands to build/verify/run the relevant harnesses, tests, stories>```

## Key facts / decisions
- <the real business logic, constraints, why-decisions, source-of-truth pointers>

## Env gotchas
- <toolchain quirks, hook behaviors, commit rules, anything that bit us>
```

## Kickoff prompt template

```
Continue <project> on branch `<branch>` (repo <path>).

START HERE: read docs/plan-next.md (item <n> is the task), then <handoff-doc path>
("What's DONE", "Learnings", "How to run"). Skim docs/architecture.md.

Status: <1–2 lines>. Committed locally (latest <sha>), NOT pushed — I push myself.

Do these in order:
  1. <next step 1, one line>
  2. <next step 2, one line>

(Future, noted in the handoff: <short list>.)

Hard rules: FP only — pure stages, typed Ok|Err, effects only in adapters; the model is
never the comparator; suppression stays visible under `suppressed`.

Verify via `pnpm typecheck && pnpm test && pnpm build`, then the proven doc-detail run from
the handoff "How to run". Commit per repo conventions; never push unasked.
```

## Notes
- Prefer ONE canonical handoff doc per workstream over many; keep it current.
- Don't dump the whole session — distill. The doc replaces conversation memory, so favor decisions,
  paths, and next actions over narration.
- Cross-link durable detail (skills, memories) instead of inlining it.
- Always pair the doc with the kickoff prompt; the prompt's first instruction is to read the doc.
