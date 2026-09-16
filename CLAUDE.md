# refdiff — working agreement

Design-vs-implementation comparison harness. Two packages
(`@refdiff/core`, `@refdiff/annotator`), pnpm 10 workspace,
TypeScript/ESM, Node ≥22. Background and rationale: `README.md`,
`docs/architecture.md`, `docs/research.md`.

## HARD RULE: the skill ships with the code

**`skills/refdiff/SKILL.md` is this project's user interface.** Nobody
runs the CLI by reading `cli.ts` — a model reads the skill and does what it
says. A change to behaviour that is not reflected there does not exist for the
only caller that matters, and worse: the skill keeps asserting the OLD
behaviour, so the next session acts on a false premise it has no reason to
doubt.

So: **any change to what the tool does, or to how it should be used, updates
the skill in the SAME change.** Not "later", not a follow-up issue.

**The skill is SIX files since 2026-09-16, so "update the skill" now means
"update the file that owns the subject" — and the grep below is what stops you
updating the wrong one.** `SKILL.md` is the always-loaded part (bindings, the
non-negotiable rules, the tool pre-flight, §0, §1, the phase read, and the
routing table naming the other five); `reconcile.md` and `polish.md` are the
two phase workflows; `sets.md` is §1b; `configuring.md` is `disabled` +
`ignore` + `section`/`sections`/`gallery`; `setup.md` is vendoring, dev-mode
setup and the per-repo environment traps. **A section that moves leaves the
routing table in `SKILL.md` stale — fix it in the same change.**

Concretely, these always travel together:

| you changed | also update |
| --- | --- |
| a CLI flag (added / removed / renamed / re-scoped) | the `USAGE` string in `cli.ts` **and** every mention across `skills/refdiff/*.md` |
| a default (e.g. which findings are suppressed) | whichever file states it — including any sentence that describes the old default as fact |
| a policy/ignore semantic (`dataSlots`, `textPatterns`, `accepted`, `roles`, `regions`, `scope`) | the "Configuring a pair" table in `configuring.md` + the classification table in `polish.md` §2 |
| what a report field means (`confidence`, `delta`, `changeKind`, a finding type) | "Reading the measurements" + §1a, both in `polish.md` |
| what `phase` / `unmatched` / `matching` mean, or how a divergent pair is worked | §1a-0 in `SKILL.md` + `reconcile.md` |
| a new failure mode you had to diagnose the hard way | "Environment pre-flight" in `setup.md`, stated as the general shape |
| the manifest shape (`manifest.ts`) | the manifest example in `configuring.md` and `docs/architecture.md` |

Grep before you call it done: `grep -rn "<old-flag-or-term>" skills/ packages/ docs/`
must come back empty (or only match a deliberate historical note). **`-r`, and
over the whole `skills/` tree** — a grep of `SKILL.md` alone now misses five
sixths of the skill and reports clean.

**A stale assertion is worse than a missing one.** When you remove or invert a
behaviour, hunt the sentences that _described_ it — they read as authoritative
and will be believed. Example: flipping the `dataSlots` default left the skill
saying "matched pairs with differing text are already suppressed", which sent
the reader looking for suppressions that no longer happened.

### A new file in `skills/refdiff/` ships automatically — keep it that way

**You do not maintain a file list.** `sync-skill.sh` derives the vendored set by
globbing its own directory, minus one explicit exclusion:

```sh
NOT_VENDORED="preflight-selftest.sh .skill-version"
```

So adding `reconcile.md`, `polish.md`, a script or a reference table is a
ONE-site change: create the file. It ships, it is `chmod +x`'d if it is a
`.sh`, and the `.skill-version` stamp records it so a consumer can see what they
got. **The only decision left to you is whether a new file is dev-only** — if it
is, add it to `NOT_VENDORED` with the reason, beside the one that is already
there.

Four rows in `preflight-selftest.sh` hold this up, and each has been watched to
fail:

| row | asserts | falsified by |
| --- | --- | --- |
| 9a | every non-excluded file in the dir reached the consumer | adding a real file to `NOT_VENDORED` |
| 9b | the exclusion is real — the dev-only self-test is NOT shipped | emptying `NOT_VENDORED` |
| 9c | a file nobody listed anywhere still ships | re-hardcoding the list |
| 9d | the stamp's `files=` names what was actually sent | re-hardcoding the list |

**Why this is mechanical rather than a rule you remember.** It was a
hand-maintained `FILES="SKILL.md setup-dev.sh preflight.sh sync-skill.sh"`, and
that fails silently in one direction only: a file added to the directory exists
locally, is read by every test run here, and reaches nobody — leaving consumers
on a skill missing a piece the rest of it refers to, read as a file they failed
to find rather than one never sent. Nothing goes red.

It had already drifted — `preflight-selftest.sh` was absent from the list — and
the manual snippet written here to catch that (`grep -q "\b$f\b" sync-skill.sh`)
**reported all-clear, because it matched a MENTION of the filename in a comment
on line 79.** A check that cannot fail reads exactly like one that passed. That
is why the guard is four falsified rows in the self-test and not this paragraph:
9a asserts over the real directory, and 9c proves the mechanism is a glob rather
than a list that happens to be current today — the distinction the old snippet
could not make, and the one the next `reconcile.md` depends on.

## Keep the skill repo-agnostic

The skill is installed USER-level and loads in every project. Nothing
repo-specific goes in it — no paths, org slugs, ports, or fixture names from a
consuming repo. Each consuming repo carries its own
`refdiff.bindings.md` (found via `find`, never a hardcoded path) with
its manifest location, how the impl is served, auth, and its own traps. If you
catch yourself writing a concrete project name into `SKILL.md`, it belongs in
that repo's bindings instead.

Changing something a consuming repo's bindings assert (a flag, a default, a run
dir convention) means those bindings are now wrong too. Say so in the handoff
even when you cannot edit that repo.

## Design principles (from `README.md` — hold the line on these)

1. **The model is never the comparator; the pass gate is deterministic.** Never
   add a code path where a judgement about parity comes from reading an image.
2. **Composable functional pipeline** — pure stages over immutable data, effects
   only in adapters at the edges. Pure logic goes in a `*.ts` beside its adapter
   and gets unit tests; adapters stay thin.
3. **Degraded input hard-stops** rather than silently producing a "successful"
   capture. A blank render, an unhydrated canvas, a login redirect and a soft
   404 are typed `CaptureError`s, not screenshots. When you add a capture path,
   ask what its "looks fine but is wrong" state is and make it typed.
4. **What cannot be verified mechanically is a human gate**, surfaced through
   the annotator — never guessed.

A fifth, learned the hard way: **one bad pair must never kill a run.** A set is
expensive; losing 24 pairs and the summary to an exception in pair 17 is the
costliest possible failure. Per-pair work returns typed errors, cleanup never
throws over a result (`closeQuietly`), context creation returns a value
(`openPage`), and the shared browser is relaunched if it dies.

## Suppression is visible or it does not happen

Every ignore rule keeps its finding in `findings.json` under `suppressed`,
tagged with the rule that hit it. Never add a filter that drops a finding
without trace — a wrong policy must be auditable, and "we never saw it" is the
one outcome the tool exists to prevent.

Prefer ignores whose predicate names the CONTENT being excused over ones that
name a position or structure: a content-shaped rule stops applying when the
content changes shape, a structural one never expires and will hide a
regression years later.

## Commands

```bash
pnpm build          # tsc, both packages
pnpm test           # vitest, both packages
pnpm typecheck      # tsc --noEmit
pnpm dev            # tsc --watch — keep running; the CLIs run from dist
```

The CLIs are on PATH as wrapper scripts (`exec node …/dist/cli.js`, written by
`setup-dev.sh`) and **run from `dist`**, so a source edit is invisible until
`pnpm dev` (or `pnpm build`) has rebuilt. If a change appears to have no
effect, check that first.

`skills/refdiff/setup-dev.sh` reproduces the whole dev setup on a fresh
machine and is idempotent.

## Tests

- Unit-test the pure stage, not the adapter. Every pure module has a `*.test.ts`
  beside it.
- **A test for a bug fix must fail without the fix.** Verify it: break the fix,
  watch it go red, restore. A regression test that passes either way documents
  nothing.
- Name the real-world case in the test or its comment ("the browser died
  mid-set"), so the next reader knows what it is protecting.

## Commits

Do not commit unless asked.

---

## Lessons capture (ad-hoc work) — append, process later

There is no automatic lesson → guideline pipeline, so reusable insights from ad-hoc work get lost. **Whenever work surfaces a durable lesson — a correction worth keeping, a non-obvious gotcha, a rejected approach and why, a rule that should exist — append a dated entry to [`docs/lessons-inbox.md`](docs/lessons-inbox.md)** the moment it's noticed (don't fix-and-forget; scrollback isn't reliably re-scannable later). The inbox is a transient buffer, never a durable home. Later, when the user says **"process the lessons"**, the `/lessons` skill drains it and promotes each entry to its real home in THIS repo — a skill body (`skills/refdiff/SKILL.md`, `.claude/skills/*`), this file, `docs/architecture.md` "Open decisions", or memory — or discards it. Standing instruction. Full format + routing → `/lessons` (its ADR / anchors / wiki homes are another repo's; use the ones named here).

## Guideline hygiene — `/update-guidelines`

`/update-guidelines` is the runbook for changing a convention everywhere it
is asserted (CLAUDE.md gist → body in the owning skill or
`docs/architecture.md`, the product skill kept repo-agnostic, the bindings
and the workflow skills re-checked) and for keeping this file lean (budget
≤ ~15k chars). `.claude/skills/update-guidelines/list-managed-files.sh` lists
the project skills it may edit (`managed-by: project`).
