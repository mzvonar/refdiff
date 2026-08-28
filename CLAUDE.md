# visual-compare — working agreement

Design-vs-implementation comparison harness. Two packages
(`@visual-compare/core`, `@visual-compare/annotator`), pnpm 10 workspace,
TypeScript/ESM, Node ≥22. Background and rationale: `README.md`,
`docs/architecture.md`, `docs/research.md`.

## HARD RULE: the skill ships with the code

**`skills/visual-compare/SKILL.md` is this project's user interface.** Nobody
runs the CLI by reading `cli.ts` — a model reads the skill and does what it
says. A change to behaviour that is not reflected there does not exist for the
only caller that matters, and worse: the skill keeps asserting the OLD
behaviour, so the next session acts on a false premise it has no reason to
doubt.

So: **any change to what the tool does, or to how it should be used, updates
`SKILL.md` in the SAME change.** Not "later", not a follow-up issue. Concretely,
these always travel together:

| you changed | also update |
| --- | --- |
| a CLI flag (added / removed / renamed / re-scoped) | the `USAGE` string in `cli.ts` **and** every `SKILL.md` mention |
| a default (e.g. which findings are suppressed) | `SKILL.md` — including any sentence that describes the old default as fact |
| a policy/ignore semantic (`dataSlots`, `textPatterns`, `accepted`, `roles`, `regions`, `scope`) | the "Configuring a pair" table + the classification table in `SKILL.md` |
| what a report field means (`confidence`, `delta`, `changeKind`, a finding type) | "Reading the measurements" + §1a in `SKILL.md` |
| a new failure mode you had to diagnose the hard way | "Environment pre-flight" in `SKILL.md`, stated as the general shape |
| the manifest shape (`manifest.ts`) | the manifest example in `SKILL.md` and `docs/architecture.md` |

Grep before you call it done: `grep -n "<old-flag-or-term>" skills/ packages/ docs/`
must come back empty (or only match a deliberate historical note).

**A stale assertion is worse than a missing one.** When you remove or invert a
behaviour, hunt the sentences that _described_ it — they read as authoritative
and will be believed. Example: flipping the `dataSlots` default left the skill
saying "matched pairs with differing text are already suppressed", which sent
the reader looking for suppressions that no longer happened.

## Keep the skill repo-agnostic

The skill is installed USER-level and loads in every project. Nothing
repo-specific goes in it — no paths, org slugs, ports, or fixture names from a
consuming repo. Each consuming repo carries its own
`visual-compare.bindings.md` (found via `find`, never a hardcoded path) with
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
pnpm dev            # tsc --watch — keep running; the linked CLIs run from dist
```

The CLIs are on PATH via `pnpm link --global` and **run from `dist`**, so a
source edit is invisible until `pnpm dev` (or `pnpm build`) has rebuilt. If a
change appears to have no effect, check that first.

`skills/visual-compare/setup-dev.sh` reproduces the whole dev setup on a fresh
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
