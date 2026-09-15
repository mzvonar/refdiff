# Plan — matching when the implementation is STRUCTURALLY DIFFERENT from the comp

Started 2026-09-15, with Mato. Scope: `packages/core/src/structural/` — the matcher and what the
report says about how much it trusts itself. Not the annotator, not the capture adapters.

**Each step below is executed in its own fresh context.** Everything a step needs is written here;
nothing is carried in conversation. Read "The witness" and "Repro" first, then your step.

---

## The problem, stated as a measurement

`messages-accountant-desktop` (uctoinak2, branch `messages-redesign`), run 13:

```
design: 1102x762 css px @2x,  80 leaf elements   (comp messages.dc.html frame 1c)
impl:   1100x900 css px,     106 leaf elements
aligned design by (-10.5, 0.0)px   confidence 0.07   x 0.50 / y 0.07   basis: anchors
matched 43 elements (1 as data slot; 37 design-only, 63 impl-only)
223 findings (34 critical, 129 major, 60 minor)
```

43 of 80/106 leaves matched. The two sides now share their whole thread CONTENT (the fixture seeds
the comp's four threads verbatim, and the capture opens the same thread the comp draws), so the
remaining divergence is chrome and layout — and it is enough to make the matcher unreliable.

### The witness — one mis-pairing, six findings

The comp's thread row carries a relative date label `Včera`. The implementation renders absolute
dates (`14. 9.`) and has no `Včera` anywhere. 70.7 px away sits the impl's filter chip `Otázky · 1`.
The matcher pairs them, and the report says:

```
f104 position       "Včera" is offset by (-70.7, 0.5)px from the design position
f136 color          "Včera" text color rgb(95,85,70), design says rgb(185,171,151)  (ΔE2000 32.8)
f146 border         "Včera" border differs: border the design does not have
f156 border-radius  "Včera" border-radius is 18px, design says 0px
f205 typography     "Včera" size 12px vs 10px, weight 500 vs 400
f206 text-content   text reads "Otázky · 1", design says "Včera"
```

Six findings, five of which read as actionable drift, about two elements with nothing to do with
each other. `f206` is the tell, and it is the LAST one a reader reaches.

### Why the existing veto cannot fire here

`unrelatedPairing()` (`match.ts`) refuses a pass-2 geometric candidate only on **symmetric positive
evidence**: the texts must be token-disjoint, at least `minGamma` apart, **and each text must have a
counterpart on the other side** — the proof being "both of these elements have their own partner
available, so this pair is not it".

That proof is unavailable by construction when the sides diverge. The impl never renders `Včera`, so
`Včera` has no counterpart, so nothing is proven, so geometry keeps the pair. **The veto is
structurally unable to fire in exactly the case it is most needed.** It is built for two similar
trees where a better partner exists somewhere; it has no answer for "this element simply is not on
the other side".

The fix direction is therefore: refuse a pair for **lack of evidence**, rather than requiring
**proof of a better alternative**.

### What was already tried and did NOT work (do not repeat)

- **Widening what counts as a counterpart** (exact string → token subsumption, so `Otázky · 1`
  recognises `Otázky`). Shipped as `hasCounterpart()`/`subsumes()` in `match.ts` plus 3 tests.
  Measured: 225 → 223 findings, matched 42 → 43, confidence unchanged at 0.07, **witness survived**.
  Marginal and unevaluable. **Step 0 reverts it.**
- **Capturing at the comp's own height** (900 → 762, matching the 1102x762 frame). Measured:
  confidence identical at 0.07 / x 0.50 / y 0.07, 41 findings in and 41 out — pure churn. The
  viewport is not the problem. Reverted; `MESSAGES_DESKTOP` stays `{ width: 1100, height: 900 }`.
- **Blaming the fixture data.** It was wrong. The seed was already correct; the capture was opening
  a different thread than the comp, which is fixed (see Repro). Confidence did not move.

---

## Guarantees the matcher currently makes — do not break any of them

Encoded in `packages/core/src/structural/match.test.ts`. Every step must leave these green, and a
step that needs to change one must say so out loud and explain why in the test's own comment.

| guarantee | shape | why |
| --- | --- | --- |
| a value slot in place is kept | `146%` ↔ `100%` at γ 0.5; a card count at γ 0 | the veto must never touch a slot that only changed its value |
| a one-sided word is kept | design `Processing` ↔ impl `Clean`, impl has no `Processing` | no evidence either way; the text-pattern policy decides, not the matcher |
| copy drift is kept | `Blok · 12. 7. 2026` ↔ `Doklad · 12. 7. 2026` | shares tokens, so it is the same element reworded |
| one counterpart is not proof | `missing` ↔ `×14`, only `missing` has a twin | asymmetric evidence is not evidence |
| a refused candidate that would have lost anyway is not reported | `vetoed` stays undefined | noise control on the veto's own reporting |

---

## Repro — the pair this plan is measured against

The uctoinak2 side is already set up and isolated from other sessions on the devbox.

```bash
# worktree
cd /root/uctoinak2/.claude/worktrees/messages-redesign

# its own database (loopback-only name, added to src/test/test-db-config.ts as
# DESIGN_COMPARE_DB_NAME so the seed guards accept it). Nothing in CI or any test tier touches it,
# so a concurrent `pnpm test:e2e` in another worktree cannot wipe it.
export DCDB="postgresql://postgres:postgres@localhost:54330/uctoinak_designcompare"
# (re)seed if empty:
DATABASE_URL="$DCDB" APP_ENV=test node scripts/seed-functional-org.mjs
DATABASE_URL="$DCDB" APP_ENV=test node tools/design-compare/seed-live-members.mjs
DATABASE_URL="$DCDB" APP_ENV=test node tools/design-compare/seed-messages-fixtures.mjs

# its own server, tracked by svc, port 3210, own dist dir
svc status | grep design-live     # start with `svc run --name design-live -- env APP_ENV=test \
                                  # NEXT_DIST_DIR=.next-design PORT=3210 DATABASE_URL=$DCDB ... \
                                  # pnpm exec dotenv -e .env.test -- next dev --turbopack`

# the capture
DC_PORT=3210 pnpm design:compare --pair messages-accountant-desktop
```

The manifest pins `?thread=request-5f2c0b9a-3d41-4e8a-9c67-2b1d8ae40f12` on this pair, because comp
frame 1c opens thread t2 (`messages.dc.html` state `sel: { od: 0, ad: 1 }`) and a bare route opens
t1. `seed-messages-fixtures.mjs` pins that request id and prints it on every run.

Note for whoever works the uctoinak2 side later: the two **owner** Messages pairs point at
`/app/org/studio-lumo/messages`, but `seed-live-members.mjs` makes `__test__owner` a
`BUSINESS_OWNER` of `functional-sro` only — those two pairs capture a 404 page. Unrelated to this
plan, not yet filed.

---

## Steps

Ordering rationale: step 3 (container scoping) changes what steps 4 and 5 are *for* — it shrinks the
candidate set so far that a ratio threshold and a γ band tuned today would both need re-tuning
after. Step 5 in particular is in tension with step 3: it gates on a GLOBAL confidence, while the
point of container scoping is that geometry *inside* a matched container stays reliable even when
the global transform is bad (here: x 0.50 / y 0.07). So instrumentation first, then a baseline, then
the structural fix, and only then the two thresholds — re-derived against the new distribution.

### Step 0 — revert the unevaluable veto widening

**Goal.** Start from a known state. `/root/refdiff` is a clean git repo; the change is uncommitted.

- Revert in `packages/core/src/structural/match.ts`: delete `hasCounterpart()` and `subsumes()`, and
  restore the veto's last line to `return implTexts.has(dt) && designTexts.has(it)`.
- Revert in `match.test.ts`: delete the three tests added 2026-09-15 (`counts a DECORATED label…`,
  `still needs the decoration to SUBSUME…`, `keeps the status chip and the one-way pairing…`).
- The idea is not wrong, only unevaluable today. Re-derive it after step 2 if the baseline shows it
  pays; the measurement above (−2 findings, +1 match, witness alive) is the bar to beat.

**Done.** `pnpm -r test` green (expect 448 core + 379 annotator), `git diff` empty in
`packages/core/src/structural/`.

### Step 1 — per-finding provenance, and gate value findings on confidence

**Goal.** Make every finding say how much it should be believed. This is the instrument the rest of
the plan is evaluated with, which is why it comes first.

- Carry through to each finding: `via` (`text` | `slot` | `geometry`), the pair's `gamma`, and the
  runner-up margin once step 4 computes one (leave the field absent until then).
- **Gate value findings the way the pixel channel already is.** Today only pixels are gated at
  confidence 0.5; `color`, `typography`, `border`, `border-radius` and `size` are emitted whatever
  the alignment confidence, which is how a reader (this one, 2026-09-15) came to believe 51 findings
  in a focus region were trustworthy when the pairs underneath them were not. Below the floor they
  should be suppressed, or emitted under an explicit `unverified` marker the summary counts
  separately — decide which when you see the baseline, and say why in the code.
- Surface `via` in `findings.json`, in `refdiff summary`, and in the annotator's finding row.

**Done.** Re-running the witness pair shows its six findings carrying `via: "geometry"` and a γ that
makes them visibly weaker than a text-matched finding. No change to matching behaviour: the
finding COUNT must be identical to step 0's (223), or something else changed too.

**Risk.** Touching `types.ts` ripples into the annotator's renderer and its 379 tests.

### Step 2 — corpus baseline harness

**Goal.** Stop evaluating matcher changes on one pair. This is the guard for steps 3–5.

- One command that runs every pair in `fixtures/demo-root` (and optionally uctoinak2's 41 via its
  manifest) and emits a table worth diffing: per pair — matched count, design-only, impl-only,
  findings by type and severity, alignment confidence, `via` distribution from step 1.
- Commit the baseline output under `docs/`, dated, as the before-picture.
- **A large matched-count drop anywhere is a REGRESSION, not a win.** Steps 3–5 all make the matcher
  refuse more pairs, and refusal converts into missing + extra. A report where everything is missing
  and extra has not become more precise; it has failed differently. This table is what tells the
  difference.

**Done.** `docs/baseline-matching-<date>.md` exists and the command reproduces it.

### Step 3 — container-scoped matching with sequence alignment (the structural fix)

**Goal.** Make the witness mis-pairing impossible rather than merely improbable: a filter chip in the
list header and a date label in a thread row live in different containers, so they must never become
candidates for each other at any distance.

- Match CONTAINERS first (both sides already carry box trees; the flat leaf list is a projection).
- Then match each matched container's children **as a sequence** — LCS / Needleman-Wunsch over
  (normalized text, role) in reading order — so reordering, insertion and deletion come out as
  themselves instead of as crossings.
- Fall back to today's flat passes only for children of containers that did not match.

**Done.** The witness pair's six findings collapse to an honest `missing-element` (`Včera`) plus
`extra-element` (`Otázky · 1`), matched count across the step-2 corpus does not collapse, and the
five guarantees above stay green.

**Risk.** The largest change here by far. Expect the alignment confidence itself to want rethinking
once matching is hierarchical — resist doing that in this step.

### Step 4 — ambiguity margin (Lowe's ratio test) on geometric candidates

**Goal.** For whatever geometry still decides after step 3, accept only unambiguous pairs.

- Accept a geometric pair only if the two elements are mutually best AND the runner-up is
  meaningfully worse (start at γ₂ ≥ 1.5·γ₁; tune against the step-2 corpus, not against one pair).
- Record the margin on the finding (the field reserved in step 1).

**Done.** Corpus table shows fewer geometric matches with no meaningful loss of text matches; any
pair whose matched count drops sharply is investigated before the threshold is kept.

### Step 5 — confidence-gated geometry, per container

**Goal.** Stop using one global confidence to license geometry everywhere.

- After step 3, compute confidence **per matched container** and let each container's own alignment
  quality set its γ band — a well-aligned thread rail keeps geometry even when the page-level
  transform is poor (this pair: global x 0.50 / y 0.07).
- Only if a container's own confidence is low should its geometric pass narrow or switch off.
- Revisit whether a global floor is still wanted at all.

**Done.** The witness pair's thread-rail findings remain available and trustworthy while
cross-container geometry stays refused; corpus table shows no pair losing its geometry wholesale.

---

## Standing notes

- Every claim of progress is a number from `findings.json` or the step-2 table. No eyeballing two
  screenshots — that rule is in `docs/method.md` and this plan is not an exception to it.
- Three diagnoses were wrong before the real one this session (fixture data; a `cacheComponents`
  Suspense theory; "same text ⇒ trustworthy pair"). Each survived a plausible argument and died on a
  measurement. Probe before believing, including this plan.
- `/root/refdiff` is a clean git repo. No commits without Mato asking.
