---
name: next-phase
description: 'Execute the next undone phase of the annotator redesign plan (docs/plan-annotator-redesign.md) in a fresh context: measure, build, measure again, record the numbers, mark it DONE, hand off. Use when the user says "next phase", "continue the plan", "/next-phase", or starts a fresh session on the refdiff annotator redesign.'
---

# next-phase — one chunk of the annotator redesign, measured

**The plan is `docs/plan-annotator-redesign.md`.** It is the only state; there
are no memory files. Read it first, every time.

## Steps

1. **Orient.** Read `docs/plan-annotator-redesign.md` in full, plus
   `refdiff.bindings.md` and the "Loop rules" section. Read `CLAUDE.md` — the
   hard rules there (the skill ships with the code; suppression is visible; one
   bad pair never kills a run) outrank anything convenient.
2. **Pick the phase.** The first numbered phase still marked `TODO`. If the
   user named one, use that. State which phase you are running and its exit
   condition before touching a file. Do not run two phases in one context —
   the whole point of the split is that each one starts clean.
3. **Measure before.** Run the measure step from the plan's "Loop rules"
   (`pnpm dev` running, serve the demo root, `refdiff compare --manifest …`,
   `refdiff summary`). Record the starting numbers. Skip only if the phase
   changes no rendered output.
4. **Do the work.** Follow the phase's bullets. Read `expected`/`actual` in
   `findings.json` first and crops second — never judge parity from an image.
   Update `packages/annotator/test/*.test.ts` in the same edit as the markup.
5. **Stop at a design gap.** If the phase needs something in the plan's
   "Design gaps" list (or a new one you discover), stop and ask Mato with the
   concrete options; add any new gap to the list. Never invent product to make
   a finding go away, and never edit a comp in `design/refdiff/`.
6. **Stop at a regression.** `delta.regressions` or a `REGRESSION:` line means
   fix that before continuing.
7. **Measure after.** Re-run the measure step. `pnpm typecheck` and `pnpm test`
   must be green.
8. **Record.** Fill the phase's **Numbers** block with before → after per pair
   (findings c/M/m, instances, suppressed, confidence, delta), name the causes
   that closed and the ones that did not, and flip `TODO` → `DONE (<date>)`.
   Any deviation kept on purpose goes into `design/refdiff.manifest.mjs` under
   `ignore.accepted` with the measurement as its `reason`.
9. **Propagate.** If the phase changed a flag, a default, or what the tool
   does: `skills/refdiff/SKILL.md` and `refdiff.bindings.md` in the SAME
   change. Verify with `grep -n "<old-term>" skills/ packages/ docs/`.
10. **Hand off.** Offer a commit (never commit unasked, never push), then give
    a short kickoff line for the fresh context:

    ```
    Continue the refdiff annotator redesign: run /next-phase.
    Plan: docs/plan-annotator-redesign.md (phase <N+1> is next).
    ```

    For a longer break, use the `clear-context-handoff` skill instead.

## Rules that bite

- The CLIs run from `dist` — without `pnpm dev` (or `pnpm build`) a source edit
  is invisible and you will chase a phantom.
- The Bash sandbox blocks outbound network and kills backgrounded servers; run
  captures, font downloads and `--serve` with it disabled.
- `out/demo/` is a committed fixture, `out/refdiff/` is where results land.
  Never serve the results root as the impl.
- The comps hydrate React from unpkg — an offline run fails `hydration-failed`
  loudly, which is correct; do not work around it.
- A finding count going down is not progress if `confidence` went down with it.
  Report both, always.
