# Plan — matching when the implementation is STRUCTURALLY DIFFERENT from the comp

Started 2026-09-15, with Mato. Scope: `packages/core/src/structural/` — the matcher and what the
report says about how much it trusts itself. Not the annotator, not the capture adapters.

**Each step below is executed in its own fresh context.** Everything a step needs is written here;
nothing is carried in conversation. Read "The witness" and "Repro" first, then your step.

> **STATUS (2026-09-16, last).** **THIS PLAN IS COMPLETE. Steps 0–6 DONE, plus STEP 5b and
> RECONCILE STEPS 1–3.** Step 5 shipped as a SLOT AREA-RATIO ceiling, not the containment rule this
> plan proposed — the sweep refuted containment in all three readings; step 5b then pointed at the
> long TEXT pairings, which the sweep showed cannot be refused or flagged; and **STEP 6 IS REFUTED
> — per-container confidence ships NOTHING to the gate** (write-up:
> [`r6-sweep-2026-09-16.md`](r6-sweep-2026-09-16.md); the only source edit is a doc comment). Not
> pushed. 492 core + 380 annotator green; `preflight-selftest.sh` 24/24.
>
> **WHAT REMAINS IS NOT IN THIS PLAN.** Three questions outlive it, each with its numbers in the
> step that found it: the `via: "text"` mis-pairing family (5 wrong of 79, no discriminator — every
> feature tested is refuted, now including locality); the SLOT family's unmeasured RECALL (22 of the
> 43 pairs step 5's ceiling keeps are token-disjoint); and the one step 6 found — **`isUnverified`
> reads the JOINT confidence**, which costs 470 of 644 flags on 21 pairs, and whose obvious fix
> (`max(confidenceX, confidenceY)`) is refuted by this plan's own canonical witness.
>
> **READ [`r3-sweep-2026-09-16.md`](r3-sweep-2026-09-16.md) AND
> [`r6-sweep-2026-09-16.md`](r6-sweep-2026-09-16.md) before proposing any matcher rule**: between
> them they hold the corpus's only labelled ground truth and the list of discriminators already
> measured and dead. The first is the 107-label
> ground-truth set the corpus now has (it had 7), and three of this plan's standing claims died on
> it — the γ ceiling's overlap is the whole band and not [686, 873]; containment does not
> discriminate, because the container column is absent on 8 of the 12 wrong pairs; and mis-pairing
> is NOT a `reconcile`-only phenomenon, which is what disqualified step 5's own acceptance
> criterion.
>
> **THE REMAINING STEPS WERE REWRITTEN after step 2's corpus contradicted the plan's premise — read
> [THE REFRAME](#the-reframe-2026-09-15-after-step-2--read-this-before-any-remaining-step) before
> anything else.** In short: the matcher was the wrong instrument for divergence, the work splits
> into a model-driven `reconcile` and today's loop as `polish`, and the original steps 3 and 4 are parked
> because they cost precision on the fine-detail case refdiff exists for. The old step 5 is promoted.
>
> **STEP 6 IS DONE AND REFUTED — read its DONE block before reaching for containers again.** The
> warning it inherited turned out to be the whole answer: the container map is ABSENT on 8 of the 12
> long-γ mis-pairings *as a discriminator*, and **absent on 460 of 1017 gated-eligible findings as a
> confidence scope** — the same miss rate one level down. Its first question ("what is a pairing
> with NO container judged by") has no good answer because it is 45% of the population. And the
> complement audit generalises it: the same score computed WITHOUT containers is strictly worse, so
> **locality itself does not discriminate** — this is not a sparse-map problem to be fixed with a
> denser map. Step 2's parked verdict question was re-asked there and stops being parked.
>
> **Two things step 5 left open and deliberately did not close**, both in its DONE block: the slot
> family is bigger than the shipped ceiling reaches (22 of the 43 slot pairs it KEEPS are
> token-disjoint — precision is measured, recall is not), and the `via: "text"` mis-pairing family
> (5 confirmed of 79 long-γ text pairs) still has no discriminator.
>
> **RECONCILE STEP 3 SHIPPED 2026-09-16** (see its DONE block): `skills/refdiff/reconcile.md`, 227
> lines, seven numbered steps, marked **PROVISIONAL and run against ZERO pairs** in its own header;
> `SKILL.md` **1423 → 399 lines** across six files, so a polish session loads 808 lines instead of
> 1423 and a reconcile session 626. Content byte-preserved (the nine ranges `diff` back to the
> committed file; 23 lines differ and all 23 are deliberate edits). One of this plan's own framings
> did not survive the re-derivation: **the map is not the instrument that catches what reading
> misses** — the `SumUp` title divergence is placed by the map on both sides, in different rows,
> connected by nothing. `CLAUDE.md`'s doc-sync table is updated in the same change, because three
> of its rows named sections that had moved.
>
> Reconcile step 2's small version SHIPPED 2026-09-16 (see its DONE block): the
> per-side unmatched map, `report.unmatched`, placing **697 of 1200** unmatched comp elements on the
> 24 `reconcile` pairs where `byRegion` placed 251, with both filed headline defects fixed inside it.
> The FULL correspondence map stays parked — the cheap test refuted its justification: a model
> reading only the comp, both screenshots and the raw missing/extra list placed 57 of 59 texted
> unmatched elements, 4 of 4 correspondences, 0 contradicted claims.
> That test also turned up **a second, worse witness** — a `via: "text"` pair at
> γ 1062.6 yielding six unflagged findings — which is a STEP 5 input, and
> **whose obvious fix is already measured and REFUTED**: a γ ceiling on pass 1 cannot work,
> because correct and wrong text pairs overlap (correct reach γ 873, wrong start at 686). Do not
> go build one; step 5's block has the corpus-wide table. The discriminator is containment, and the
> per-side container data step 2 now produces is its input.
> The clock freeze is VERIFIED ON ALL THREE
> CORPORA and re-baselined — 52 pairs, `matched` unmoved on every one, zero `auth-failed` (the
> named risk); see reconcile step 1's DONE block for the two-run table and the three explained
> movements. Plan steps 0–4 and RECONCILE STEPS 1–3 are DONE, so the reconcile workstream — which
> came BEFORE step 5 — is closed: step 4 shipped the `reconcile` label and nothing about how to act
> on it, step 2 gave it the inventory, step 3 gave the skill the workflow it lacked. What that
> workflow still lacks is a RUN: it is provisional against 24 corpus pairs and zero real uses, and
> the first one revises it. When you reach step 5, read
> step 4's DONE block first: it changed which confidence a threshold should read
> (`max(confidenceX, confidenceY)`, not the joint score), and step 5 is written against the joint
> one. Baseline:
> [`baseline-matching-2026-09-16.md`](baseline-matching-2026-09-16.md) — the post-freeze one, every
> corpus measured 2026-09-16; regenerated by `node scripts/baseline-matching.ts`. The
> 2026-09-15 file is kept as the pre-freeze before-picture and is comparable only to a run from
> that day.
> Session state: [`handoff-2026-09-16.md`](handoff-2026-09-16.md).
>
> **THE WITNESS MOVED AT STEP 5, AND ITS DATED RECORDS DELIBERATELY DID NOT.**
> `messages-accountant-desktop` now reads **41 of 80 matched, 226 findings, rate 0.51** (run 12),
> because step 5 refused its one oversized slot pair (`ZK` ↔ `VYŽADUJE AKCIU`, area ratio 6.5).
> **Every "225 findings at 42 matched" inside a step 0–4 DONE block is a correct record of what
> that step measured and is left alone**; what was corrected is every place that stated those
> numbers as CURRENT — this plan's `Repro`/step-5 warnings, the handoff's Key facts, and
> `reconcile.md`'s headline transcript and §R7 row. Its two γ figures are unchanged (98.7, 1062.6)
> and both witnesses still emit six findings each.
>
> **Two numbers in this plan were wrong and are corrected below.** The step-0 baseline is
> **225 findings at 42 matched**, not 223/43 — 223 was run 13, which still HAD the veto widening
> step 0 reverts, exactly as the "what was already tried" entry records (225 → 223, 42 → 43).
> The core test count after the revert is **445**, not 448.

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
| a slot may STRETCH but stays the same slot | a page H1 `Doklady — Kaviareň Prameň` ↔ `Doklady`, areas 4.3× apart, is kept; a 13×13 avatar ↔ a 380×19 subtitle, 44× apart, is refused | added by step 5; the first half is the slot pass's own premise and the second is the bound it lacked |

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

## THE REFRAME (2026-09-15, after step 2 — read this before any remaining step)

Steps 3–5 were planned before there was a corpus. With one, the plan's own premise does not hold,
and Mato's question is what surfaced it: **does making the matcher handle divergence cost precision
on the fine-detail polishing refdiff was built for and is good at?**

Measured answer: **for steps 1 and 2, no, provably. For steps 3 and 4 as written, yes.**

- Steps 1 and 2 are inert where precision matters. On all five corpus pairs at confidence ≥ 0.5 —
  the only ones a polish loop is ever run on — `unverified` is **0**, because the gate fires below
  0.5 by construction. Step 2 changes no behaviour at all.
- Steps 3 and 4 are not inert. On those same five pairs, **219 of 463 matches are geometric and 322
  of 868 findings rest on them** — exactly what container scoping and a ratio test would re-decide.
- The concrete casualty is a pair that works today. `refdiff-library-groups-mobile`: confidence
  0.70, 178 matched, **150 of them geometric**, text share 0.13. **A ratio test is structurally
  hostile to any layout where position is the only discriminator and positions repeat uniformly** —
  a grid cell whose text differs from the comp's falls to geometry, and its runner-up is the cell in
  the next row, by construction. (174 of that pair's 243 geometric findings are on `text`-role
  elements, so this is not the textless-box case it first looks like.)

### Why the matcher was the wrong instrument for divergence

refdiff exists because **the model cannot see a 2 px offset or a ΔE 3 colour delta**. That is the
problem it solved. In the divergent case the hard thing is *not invisible to the model*: "the comp
draws a thread rail with relative dates; the implementation renders absolute dates and a filter chip
row" is something a model reading both sources gets right. Divergence needs structural JUDGEMENT,
which no measurement can supply.

So what the matcher owed the divergent case was never better matching — it was **honesty**. The
witness's actual defect was six confident findings about two unrelated elements with the tell last.
Steps 1 and 2 fix that harm. Steps 3 and 4 were the expensive way to fix the same harm, paid for out
of the instrument's precision on the case it exists for.

### The two-phase workflow this implies

> **Naming.** These two were originally "phase A" and "phase B". They ship as **`reconcile`** and
> **`polish`**, and the letters are retired everywhere — a lettered phase collides with the lettered
> candidate RULES in step 4, which are now named for the confidence each reads.

- **RECONCILE — rough, model-driven, NOT a refdiff findings loop.** Read the design, read the
  implementation, understand the structure and behaviour of both, reconcile them. refdiff's job here
  is to say *"you are in reconcile"* and, at most, to hand over an inventory the model is bad at
  building by hand.
- **POLISH — today's refdiff loop, unchanged.** Element-wise findings, the bounded fix loop, the
  fine details the model cannot see.

**Do not implement reconcile as a gate on the existing pipeline.** A behavioural switch on a
threshold misfires: `today-owner-desktop` scores confidence 0.50 — over any sane floor — with a match
rate of **0.31**, the worst in the corpus. Reconcile work belongs in outputs that cannot touch leaf
matching,
which is why the container work below is re-scoped as a REPORT rather than as an input to matching.

### No single number detects the phase

Three are needed, and the step-2 `matching` block is what makes the last two computable:

| signal | says | corpus counter-examples |
| --- | --- | --- |
| `alignment.confidence` | can a transform be fitted | `messages-owner-desktop` 0.07 — yet match rate 0.68 |
| match rate (`matched / min(designLeaves, implLeaves)`) | do the two sides contain the same things | `today-owner-desktop` 0.50 confidence, rate 0.31 |
| text share (`matchedVia.text / matched`) | is correspondence PROVEN or assumed from position | `refdiff-library-groups-mobile` rate 0.79, share 0.13 |

### Consequence for the corpus itself — a precondition, not a footnote

**The step-2 corpus is skewed to the divergent case: only 5 of 34 pairs sit at confidence ≥ 0.5, and
two of those are exactly 0.50.** It would barely detect harm to the polish loop, which is the harm
that matters most. **Nothing that changes leaf matching may be judged against it until it carries
polish-weighted pairs** — component and variant-sheet pairs, i.e. exactly the 14 Storybook pairs
this box could not measure. That is now step 3.

## Steps

Ordering rationale (revised): everything that can change leaf matching is blocked behind a corpus
that can see the damage, and behind a phase signal that says whether element-wise comparison means
anything on this pair at all. The two remaining matcher changes are then ordered by RISK TO PHASE B,
cheapest and safest first — the reverse of the original order, because the measurement inverted it:
old step 5 (per-container confidence) is the one that HELPS the polish loop, while old steps 3 and 4
are the ones that endanger it.

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

**DONE 2026-09-15 — measured.** `git checkout -- packages/core/src/structural/` restored both
files. Suite green at **445 core + 379 annotator** (the "448" above was the count WITH the three
veto tests, so 445 is right and the plan's arithmetic was off by the same three). The witness pair
re-captured as run 14: **225 findings** (35 critical / 127 major / 63 minor), **42 matched**,
alignment `(-10.5, 0.0)` confidence 0.07 (x 0.50 / y 0.07), and all six witness findings alive
(`f103` position, `f131` colour, `f142` border, `f152` border-radius, `f206` typography, `f207`
text-content). **That 225/42 is the baseline step 1 must not move** — not the 223/43 written above,
which was run 13 with the widening still in.

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

**DONE 2026-09-15 — measured.** Commits `73cc4a1` (formatting, split out so the change is
readable) and `164828a`.

- Matching untouched, twice over: runs 15 and 16 both report **+0 introduced / −0 resolved**, at
  **225 findings / 42 matched** — step 0's baseline exactly. `identityKey` ignores the three new
  fields, which is why the delta is +0/−0 rather than 225 findings re-keyed.
- Witness: all six findings read `via: "geometry"` γ98.7. Colour, border, border-radius and
  typography are flagged `unverified`; `text-content` is deliberately NOT, because "text reads
  Otázky · 1, design says Včera" is the line that gives the mis-pairing away.
- Whole run: 49 text / 3 slot / 71 geometry / 102 resting on no pair; **34 flagged**.
- **The open decision resolved to the `unverified` marker, not suppression**, argued in
  `isUnverified`'s comment in `structural/checks.ts`. Measured reason: 67 of the 225 findings are
  value findings, so suppressing on confidence alone deletes all 67 and a reader cannot tell the
  deletions from "no difference here" — the same bug with its sign flipped. The pixel channel had
  already settled it next door: below its floor it emits one finding SAYING it skipped.
- **One deliberate sharpening of this step's wording.** The gate is NOT "alignment confidence is
  low" but "this pair is not worth believing": a `via: "text"` pair is exempt at any confidence,
  because both elements carry the same string and the transform played no part in forming it.
  Those 67 value findings split 33 text-proven / 1 slot / 33 geometric, so the exemption is the
  difference between flagging half the set and all of it. Step 5 generalises this.
- `position` and `spacing` carry `via`/γ but are not gated — a position finding IS the transform's
  own claim and states its evidence in its own message.
- The verdict is untouched: flagged findings still count toward it. Whether they should is a step 5
  question, once confidence is per-container instead of global.
- `ambiguityMargin` is declared on `Finding` and written by nothing; step 4 fills it.
- Tests +12 → **457 core + 380 annotator**.

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

**DONE 2026-09-15 — measured.** `node scripts/baseline-matching.ts` →
[`docs/baseline-matching-2026-09-15.md`](baseline-matching-2026-09-15.md). Commits: `29c43ee`
(formatting for `match.ts`/`match.test.ts`, split out as `73cc4a1` was) then the harness.

- **The matcher now reports itself into the report.** `ComparisonReport.matching`
  (`MatchingStats` in `types.ts`, built by the pure `matchingStats()` beside `matchElements`):
  leaves offered per side, `matched` split text/slot/geometry, `designOnly`, `implOnly`, `vetoed`.
  OPTIONAL like `run`, because every report already on disk predates it — and a reader must say
  "not recorded" rather than substitute a 0, which is a different claim.
- **`refdiff summary` grew two tables**, so the guard is the normal set summary rather than a
  side artifact: *Matching* (the instrument) and *Findings by type* per pair. Back-compat checked
  against `out/u2-before`, a pre-`matching` root: the matching table is simply absent.
- **The baseline, 34 pairs measured in one invocation:**

  | corpus | pairs | findings | unver | design→impl leaves | matched (text/slot/geom) | d-only | i-only |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | refdiff | 5 | 1555 | 130 | 1369 → 840 | 589 (272/10/307) | 780 | 251 |
  | uctoinak2 | 29 | 3652 | 495 | 1843 → 1419 | 747 (331/19/397) | 1096 | 672 |

  **The corpus matches 1336 of 3212 design leaves, and more than half of those matches (704) rest
  on geometry alone.** That is the number steps 3–5 are aimed at, and the number that must not be
  bought by collapsing `matched`.
- **It reproduces: +0 / −0 on every one of the 34 pairs**, run against the previous run of each.
  The witness re-measures at **225 findings / 42 matched** — step 0's baseline, fourth run running.
- **What is NOT in it, and this is the harness's own output, not a footnote.** A pair that fails to
  CAPTURE leaves no run dir, so `summary` renders a complete-looking table over a shrunken corpus;
  the harness parses the run log and names them. refdiff: 4 (two Gallery pairs `selector-not-found`,
  two ghost pairs `step-failed` — annotator-surface drift, pre-existing, NOT the matcher) plus 2
  `disabled`. uctoinak2: 16 — 14 Storybook pairs `unreachable` and the 2 known owner-route 404s.
- **The 14 Storybook pairs are a resource limit, measured.** Starting Storybook beside the app's
  own dev server and a capture browser OOM-killed the app server mid-corpus on this 7 GB box
  (`dmesg`: `Killed process … next-server`), costing the other 29 as well. The harness therefore
  renders EVERY corpus from its out root whether or not this invocation measured it, dated and
  labelled (`baseline-notes.json`), so the corpora can be measured in separate passes without the
  document losing half of itself.
- Two harness defects found by using it, both the same shape as the bug the plan is about —
  a report that looks complete: capture failures go to **stderr**, which the first version did not
  capture, so it reported "nothing missing" about a run with four dead pairs; and run dirs from an
  EARLIER run stay in the out root, so two rows of one table were silently three hours old. Both
  are now detected and named in the document.
- A dev server compiles on demand and the capture budget is 30 s, so the harness **warms every impl
  URL first**: 2 of 45 pairs were lost to `navigation-failed` on routes that compare fine once warm.
  This also took the uctoinak2 corpus from ~20 minutes to ~4.
- **Tests +5 → 462 core + 380 annotator**; `pnpm typecheck` clean (it now covers `scripts/` too).
- **`skills/refdiff/SKILL.md` updated for step 1 AND step 2.** Step 1 shipped `via`, `gamma` and
  `unverified` without touching the skill, which `CLAUDE.md`'s first hard rule forbids — nothing
  failed, because an ADDITIVE field renames nothing and the grep that rule prescribes had nothing
  to hunt for. New §1a-ii (what paired these two elements) and a `Matching`-table rule in §1b.

**The open question, ANSWERED from the corpus: an `unverified` finding keeps counting toward the
verdict. Change nothing.**

Across all 34 pairs — 5207 findings, 625 `unverified`, **382 of them gating** (≥ major and
unexplained) — **excluding them flips the verdict on ZERO pairs.** The reason is structural, not
lucky: the flag only fires on a pair whose GLOBAL alignment confidence is below 0.5, and all 27
pairs carrying one are exactly those pairs — which are failing many times over on evidence that is
not flagged. The closest any pair comes is `settings-accountant-desktop`: 41 gating findings, 7 of
them unverified, 34 still standing. A change that cannot move any pair in the corpus cannot be
evaluated by it, and it would buy a silent asymmetry (a finding that is reported but can never
fail) for nothing measured.

**Re-ask it at step 6 (per-container confidence), and not before.** Per-container confidence is what makes the flag fire on a
well-aligned page's ONE bad container — a pair whose only gating findings sit inside it becomes
possible, and that is the first configuration where the two answers are distinguishable. Recorded
here rather than in the code because nothing in the code changes.

### Step 3 — give the corpus pairs that can SEE harm to the polish loop ← DO FIRST

**Goal.** The guard currently has 3 solid polish pairs. Until it has more, "no regression" is a claim
the corpus is not entitled to make, and every later step is unevaluable in the direction that
matters most.

- Add **component / variant-sheet pairs** — repeated-content layouts at high confidence are both the
  polish loop's home ground and the case a ratio test is most hostile to. The 14 uctoinak2 Storybook
  pairs are the ready-made set; `fixtures/demo-root`'s `ds-button` sheet is the in-repo one.
- The obstacle is measured and is not the harness: Storybook beside the app's dev server and a
  capture browser OOM-kills the app server on this 7 GB box. The harness already renders each corpus
  from its out root whether or not this invocation measured it, so **measure them in a pass of their
  own** (`--only`, app server down) — or on a bigger box.
- Also worth reclaiming: the 4 refdiff pairs that fail to capture. Two Gallery pairs
  (`selector-not-found` on `#cells-impl .cellslot`) and two ghost pairs (`step-failed`:
  `#pane-swap` is `display:none` outside `body.layout-minimal`; `.frow:has(.fside)` matches nothing).
  Annotator-surface drift, unrelated to the matcher, but they are 4 of 9 runnable pairs in the
  self-contained corpus.

**Done.** The corpus carries ≥ 10 pairs at confidence ≥ 0.5, at least 4 of them repeated-content, and
`docs/baseline-matching-<date>.md` is regenerated as the new before-picture.

**DONE 2026-09-15 — measured. The bar is met roughly fourfold, and TWO of this step's own premises
turned out to be wrong.**

- **20 pairs now sit at confidence ≥ 0.5, up from 5**, and the quantity that actually matters —
  what a ratio test or container scoping would re-decide on a pair the polish loop runs on — went
  from **219 geometric matches of 463** to **745 of 1576**. That 3.4× is the guard step 5 and the
  parked steps are evaluated against.
- **The "≥ 4 repeated-content" half, stated as a measurement rather than asserted.** The signature
  of the case a ratio test is hostile to is that GEOMETRY, not text, forms most of the matches on a
  pair that is otherwise well aligned. **Seven** of the 20 are in that state — `library-groups-mobile`
  0.81 geometric, `gallery-mobile` 0.73, `library-groups-desktop` 0.69, `tx-picker-all-requested-mobile`
  0.60, and `today-owner-desktop` / `tx-picker-owner-desktop` / `tx-picker-all-requested-desktop` at
  0.55. By construction the same seven are the repeated-content layouts: one variant SHEET
  (`gallery-mobile`, a grid of button cells — the literal "variant-sheet pair" this step asked for),
  two card grids, three transaction lists. *Note the cruder text-share proxy (`< 0.35`) counts only
  3 of them, because a tx-picker row carries a real merchant string; geometric share is the signal
  that matches the mechanism, and both are in the census either way.*
- **Two pairs sit EXACTLY on the floor** (`today-owner-desktop` and `client-settings-accountant-desktop`,
  both 0.50) and one of them has the worst match rate in the corpus (0.31). The over-floor count is
  20 with them and 18 without; nothing in this step's conclusion depends on which side they fall.
- **The corpus is three corpora now, split by impl SHAPE, not by hand.** `uctoinak2` keeps its 31
  route pairs; the 14 Storybook pairs became `uctoinak2-storybook` with its own out root and its
  own impl server. `Corpus.implKind` resolves the `--pair` list from the manifest at run time, so a
  pair added later lands in the corpus whose server can serve it instead of being reported as a
  capture failure in the other one. This is what lets the two be measured in separate passes
  without either one's section decaying into carried-over history.
- **All 14 Storybook pairs capture, and they are the best pairs in the corpus.** The four
  `doc-detail-*` dialogs come in at **confidence 0.83–0.84 with 61–63 of ~70 design leaves
  matched** — nothing else measured here is that well aligned. `700 of 836` design leaves matched
  across the 14, against 42% on the page corpora, which is the regime difference the whole step was
  after.

**Premise 1 that was wrong: the four refdiff pairs were never "annotator-surface drift".** That
diagnosis is written in this step's own bullet above and in the handoff, and it was never tested.
The annotator `svc` unit was running a process older than `dist`: `cli.ts` does
`import { renderAppShell } from "./app-shell.js"`, so it holds the compiled module from the moment
it started, and the served shell had no `#view-gallery` at all while the source declares one.
`svc restart annotator` fixed all four. **The damage was not the four.** The five pairs that HAD
been capturing were measuring the same stale build, so every refdiff number in the previous
baseline described an implementation nobody has:

| pair | findings | matched | confidence |
| --- | --- | --- | --- |
| refdiff-compare-desktop | 95 → 69 | 171 → 179 | 0.68 → 0.72 |
| refdiff-library-groups-desktop | 796 → 560 | 120 → 197 | 0.30 → **0.56** |
| refdiff-library-groups-mobile | 563 → 520 | 178 → 232 | 0.70 → **0.85** |
| refdiff-compare-mobile | 19 → 13 | 67 → 64 | 0.91 → 0.97 |
| refdiff-compare-mobile-toolbar | 82 → **4, PASS** | 53 → 55 | 0.36 → **1.00** |

`matched` rose on four of five and the fifth shed 7 unmatched impl leaves, so this is an impl that
corresponds better, not a matcher that got looser — no matcher code changed in this step.

**Premise 2 that was wrong, and it is this step's own motivation: "only 5 of 34 pairs clear 0.5"
was partly an artefact of that stale server.** Two refdiff pairs cross the floor on the restart
alone (`library-groups-desktop` 0.30 → 0.56, `compare-mobile-toolbar` 0.36 → 1.00). The step was
still worth doing — 11 of the 15 new over-floor pairs are the Storybook ones, which did not exist
in the guard at all — but **the corpus was never as uniformly divergent as the REFRAME's headline
number said**, and any argument that leans on "29 of 34 pairs are below the floor" must be
re-derived from the new baseline rather than quoted.

**Consequence for THE REFRAME's measured claims.** Its direction survives and is strengthened; its
numbers do not. `refdiff-library-groups-mobile`, the named casualty of a ratio test, now reads
**confidence 0.85, 232 matched, 187 geometric, text share 0.19** (was 0.70 / 178 / 150 / 0.13) —
more exposure, at higher confidence, not less. Re-read the section with those figures before step 5.

**Two harness defects fixed, both the same shape as the bug this plan is about — a report that
looks complete.**

- **`warm()` cannot warm a story, and used to claim it had.** Every Storybook story sits behind one
  static `iframe.html`, so a `fetch` of it returns 200 having compiled nothing. The first pass lost
  8 of 14 pairs to a cold Vite despite "warmed 14 impl URL(s)". `retryFailed` now re-runs the pairs
  that failed to capture, once, and records which needed it. It cannot launder a real failure: the
  4 genuinely broken stories reported *louder* on the second attempt (`story-error` naming a
  missing export where the cold run said `unreachable`).
- **`reachable()` probed the bare origin**, and the uctoinak2 app has no unlocalised root — `/`
  500s while all 31 of its routes answer. That skipped the entire route corpus once, silently
  substituting three-hour-old numbers. It now probes the corpus's first real impl URL.

**Fixed in uctoinak2, `19565b5f`.** The 4 `doc-detail-*` pairs were blocked by a drifted Storybook
mock: `src/features/document/boundary/__mocks__/actions.ts` was one export behind its real boundary
module (`reprocessDocumentAction`), and `sb.mock` swaps the twin in, so the story died at module
load behind Storybook's generic "failed to render properly" panel. The same drift existed in 5
other twins — 13 exports in total across document, messaging, notification, banking, organization
and firm. All added, and pinned by `src/test/code-style/storybook-mock-parity.integration.test.ts`,
which reads the mocked-module list out of `.storybook/preview.tsx` rather than restating it and
carries a guard case so a change to the `sb.mock(...)` spelling cannot make every other case
vacuously pass. Verified red before green.

*Correction while doing it: earlier handoffs called that worktree's uncommitted work "someone
else's" and treated it as untouchable. It is OURS — this workstream's own WIP from earlier
sessions. The rule that survives is narrower and still right: never destroy uncommitted work,
whoever wrote it.*

### Step 4 — say which PHASE a pair is in, and stop comparing when the answer is A

**Goal.** The most valuable thing refdiff can do for a divergent pair is decline to report on it in
detail and say why. ~~29 of the 34 corpus pairs are below confidence 0.5~~ — **32 of the 52 are**,
re-derived on the step-3 corpus, because the 29/34 figure is exactly the stale one step 3 forbids
quoting. So this is the COMMON case, not an edge one — and today every one of them gets a full
element-wise report anyway.

- Compute the three signals in the table above (confidence exists; match rate and text share come
  straight from `ComparisonReport.matching`) and emit a pair-level verdict: **`phase: "reconcile"`**
  vs **`phase: "polish"`**.
- In `reconcile`, the run's headline says so in words — "these two surfaces do not correspond well
  enough for element-wise findings; reconcile structure first" — with the three numbers and the
  missing/extra inventory, which is the part a model building the same picture by hand gets wrong.
- **Report it, do not enforce it.** Findings are still emitted, exactly as `unverified` flags rather
  than suppresses. A phase label that silently withheld findings would be the same bug one level up.
- Thresholds are derived from the step-3 corpus, never from one pair. No single signal decides:
  `today-owner-desktop` (confidence 0.50, rate 0.31) and `messages-owner-desktop` (0.07, rate 0.68)
  are the two counter-examples any rule must get right.

**Done.** Every corpus pair carries a phase, the five known-good polish pairs are all `polish`, the
witness is `reconcile`, and no finding changed.

**DERIVATION INPUT, measured 2026-09-15 on the step-3 corpus** (52 pairs; regenerate the full table
from the three roots under `out/baseline/*/*/findings.json` — `alignment.confidence`, and
`matched / min(designLeaves, implLeaves)` and `matchedVia.text / matched` from `matching`).

Two candidate rules, and what separates them:

| rule | polish | reconcile |
| --- | --- | --- |
| `joint-only` — `conf >= 0.5 && rate >= 0.70` | 18 | 34 |
| `joint-or-share` — `rate >= 0.70 && (conf >= 0.5 \|\| share >= 0.35)` | 24 | 28 |

**Both get all four named cases right** — `today-owner-desktop` (0.50 / 0.31) reconcile,
`messages-owner-desktop` (0.07 / 0.68) reconcile, the witness `messages-accountant-desktop`
(0.07 / 0.53) reconcile, `refdiff-library-groups-mobile` (0.85 / 0.78 / 0.19) polish. So the
counter-examples the plan names do NOT settle the choice; these six pairs do, and they are the real
question for whoever implements this:

```
refdiff-compare-mobile-toolbar-ghost   conf 0.46  rate 0.92  share 0.80
tx-picker-owner-mobile                 conf 0.00  rate 0.91  share 0.38
tx-picker-accountant-mobile            conf 0.00  rate 0.86  share 0.39
tx-picker-accountant-desktop           conf 0.42  rate 0.86  share 0.42
settings-owner-mobile                  conf 0.25  rate 0.75  share 0.43
client-detail-chrome-accountant-mobile conf 0.38  rate 0.71  share 0.45
```

**`tx-picker-owner-mobile` is the one to look at first: confidence 0.00 at match rate 0.91, with 71
of 78 leaves matched.** A pair cannot both be "no transform fits at all" and "the two sides contain
almost exactly the same things" unless the transform fitter is failing on something the matcher
does not need — which is step 1's text-exemption argument one level up ("a `via: text` pair is
evidence about itself; the transform played no part in forming it"). If that reading holds, the
three-signal rule is right and the two-signal one mislabels six pairs. **Confirm it by looking at
why confidence is 0.00 on a pair that matched 91% of its leaves — do not take the arithmetic on
trust.** These are components captured from their own story, i.e. exactly the polish-loop pairs step
3 was run to obtain, so calling them `reconcile` would be the harm this whole plan is about.

**DONE 2026-09-15 — measured. The question above has an answer, and it is not quite either
candidate: BOTH named rules read the wrong confidence.**

Shipped as `pairPhase` in `packages/core/src/structural/phase.ts`, whose file comment carries the
full derivation and is the thing to read before changing a threshold. Headlines:

- **52 of 52 pairs carry a phase — 28 `polish` / 24 `reconcile`** — and **no finding changed
  anywhere**: 7201 findings across the three corpora, `+0 / −0` on every one of the 52. All four
  named cases land right (`today-owner-desktop`, `messages-owner-desktop` and the witness
  `reconcile`; `refdiff-library-groups-mobile` `polish`), all nine known-good polish pairs are
  `polish`, and — the outcome step 3 existed to protect — **all 14 Storybook component pairs are
  `polish`, none `reconcile`.** By corpus: refdiff 8/1, uctoinak2 6/23, uctoinak2-storybook 14/0.

- **Why `tx-picker-owner-mobile` reports 0.00 at rate 0.91, measured rather than reasoned.** Its fit
  rests on **17 anchors: 14 agree on X, 1 on Y, and ZERO on both.** `confidence` counts an anchor
  only when BOTH axes land it within 10 px, so the joint score is 0.00 *by construction* while the
  X axis fits at 0.82. Reproduced independently from `elements.json` — recomputing the score from
  the stored element trees returns 0.8235 / 0.0588 / 0.0000, the recorded values to four decimals.

- **So the plan's own hypothesis was half right.** The fitter is NOT "failing on something the
  matcher does not need": the Y relation between comp and impl really is non-affine (pairwise
  slopes span −0.31 to 2.33; the best possible affine Y fit lands only 8 of 17 anchors), so the
  pair would not have cleared 0.5 on Y whatever happened. What is wrong is reading the JOINT score
  at all. `Alignment.confidenceX`'s own doc comment already said the collapse happens and that the
  joint score is right for the PIXEL gate *because diffing pixels needs both axes*. A phase is not
  a pixel diff. The rule that shipped therefore reads `max(confidenceX, confidenceY)`.
  *(Compounding it: that pair's Y fit also bailed out at a median |residual| of **12.10 px against
  `AXIS_RESIDUAL_MAX` = 12** — a 0.8% miss that replaces a fit worth 8/17 anchors with the identity
  and takes `confidenceY` from 0.47 to 0.06. The exact value 0.00 is a threshold cliff, not a
  measurement. Worth knowing before anyone trusts a 0.00 again.)*

- **The two candidates are nested inside the one that shipped:
  `joint-only` ⊂ `joint-or-share` ⊂ `best-axis`.** The rules are named for the confidence each
  READS, never lettered — a "rule B" beside a "phase B" is the collision this rename retires.
  Scored by how well each separates pairs whose geometric pairings are junk (token-DISJOINT
  `text-content` findings on a geometric pair — the witness's own tell — over geometric matches):

  | rule | polish | median junk, polish | median junk, reconcile | separation | conf-only twin splits |
  | --- | --- | --- | --- | --- | --- |
  | `joint-only` `conf ≥ .5 && rate ≥ .7` | 18 | 0.136 | 0.323 | 0.186 | 3 |
  | `joint-or-share` `rate ≥ .7 && (conf ≥ .5 ∨ share ≥ .35)` | 24 | 0.143 | 0.429 | 0.286 | 2 |
  | **`best-axis` `rate ≥ .7 && max(cX, cY) ≥ .5`** | **28** | **0.146** | **0.462** | **0.315** | **1** |

  `best-axis` is strictly more inclusive AND separates strictly better at unchanged quality inside
  the polish set. The extra discriminator is RESPONSIVE TWINS: two captures of one surface whose
  `rate` and `share` agree within 0.10 correspond equally well, so splitting them is the transform
  overruling the content. `joint-only`'s extra casualty is `tx-picker-owner` — rate 0.92/0.91,
  share 0.38/0.38, joint confidence 0.52 and 0.00.

- **`share >= 0.35` gets the right answer for the wrong reason, so it does not ship as a gate.**
  Text share is the WEAKEST signal against the junk rate (Spearman −0.44, against −0.71 for rate and
  −0.70 for `cX`), and its threshold separates nothing: median junk is **0.310 just below it and
  0.313 just above**. It is still reported on every pair, because "was correspondence proven or
  assumed" is a real question for a reader — just not the one that decides the phase.

- **Two claims in the block above were wrong and are corrected here.** (a) "four of the six disputed
  pairs are the Storybook component pairs" — it is **three** (`tx-picker-owner-mobile`,
  `tx-picker-accountant-mobile`, `tx-picker-accountant-desktop`); the other three are one refdiff
  and two uctoinak2 route pairs. All six come out `polish`. (b) The Goal's "29 of 34 below
  confidence 0.5" was the stale pre-step-3 figure; re-derived it is **32 of 52**.

- **The honest limits, because the next reader inherits them.** The junk-pairing rate is a PROXY —
  a token-disjoint pairing can be a legitimate value slot showing other data — so it is trustworthy
  as an ordering, not as an absolute. And `MIN_AXIS_CONFIDENCE` currently excludes **nothing** that
  `MIN_MATCH_RATE` did not already exclude: every pair at rate ≥ 0.70 also clears 0.50 on its better
  axis. It is kept rather than collapsing the rule to one number because the nearest pair sits
  EXACTLY on the floor (`client-pending-accountant-mobile`, 0.50) and because the clause is
  independently live below the rate floor (13 of 24 pairs clear it). **Until a pair fires it,
  "no single number detects the phase" is a claim this corpus does not demonstrate** — on it,
  `rate >= 0.70` alone produces the same 28/24 partition.

- **Reported, never enforced — and pinned as such.** `phase.test.ts` carries a source ratchet
  asserting the label is mentioned nowhere outside the five reporting seams (`types.ts`, `cli.ts`,
  `package-for-model.ts`, `summary.ts`, `phase.ts`), with a guard case so it cannot pass vacuously.
  It caught two real false positives on its first run (`pixel/diff.ts` says "rasterization phase"),
  which is how we know it is live. The target it exists for is `structural/checks.ts`: it already
  takes `alignmentConfidence`, so adding a phase argument there is a one-line change that reads
  like an improvement and would quietly stop emitting findings on divergent pairs.

- Surfaced in `findings.json` (`ComparisonReport.phase`, OPTIONAL like `matching` and for the same
  reason), in the `refdiff compare` headline (phase first, above the findings; on `reconcile` it
  leads with the missing/extra inventory), and in `refdiff summary`'s *Matching* table as four new
  columns (`axis`, `rate`, `share`, `phase`) — a pre-`matching` report renders `-`, not a guess.
  `skills/refdiff/SKILL.md` gains §1a-0. Tests +12 → **474 core + 380 annotator**.

**Why this replaces most of old step 3.** Old step 3's stated Done criterion was "the witness's six
findings collapse to an honest missing + extra". A phase label plus the refusal in step 5 gets there
without touching how a well-aligned pair matches.

---

## THE RECONCILE WORKSTREAM (added 2026-09-16, with Mato — DO THIS BEFORE STEP 5)

Step 4 shipped the label and stopped there. `reconcile` now says WHICH loop you are in and nothing
about how to run it: a phase name, three signals, two counts, one sentence. **24 of the 52 corpus
pairs are in that phase** — nearly half the corpus, served by four sentences of guidance, while
`polish` has ~1300 lines of skill.

That is the gap this workstream closes, and it was always the plan's own stated ambition: refdiff's
job in `reconcile` is *"to say you are in reconcile and, at most, to hand over an inventory the
model is bad at building by hand."* The first clause shipped. The second is `PARKED` below and is
now promoted.

**The division of labour, which is the design constraint.** THE REFRAME's conclusion stands:
divergence needs structural JUDGEMENT, and no measurement supplies it. So the judgement lives in
the SKILL (instructions for a judge), and the TOOL's job is only to hand the judge measured facts.
Nothing here becomes a gate, an auto-fix, or a matcher change.

**Reading the comp is REQUIRED in reconcile, and the skill's blanket ban was over-scoped.** An
earlier framing of this section said a workflow must not tell the model to "read the comp and work
it out", citing §0's rule that *"reading `.dc.html` source to derive a layout is the failure this
tool exists to remove"*. That rule is right about POLISH and wrong as a blanket, and the evidence
against it is the naive phase this whole tool came out of: reading the comp and the screenshots
produced **good general structure and bad details**. That is the exact complement of what refdiff
does — refdiff mis-pairs across divergent structure and is excellent on details. Two instruments
with opposite failure profiles should be pointed at the halves each is good at, not ranked.

So: in `reconcile` the model reads the comp (`.dc.html` / the Figma frame) AND both `design.png` /
`impl.png`, because that is where INTENT lives — "this is a thread rail with a filter row above it"
is not recoverable from geometry and text at any resolution. What must survive from the old rule is
narrower and still binding: **reading forms a hypothesis; the measurement adjudicates it.** The
failure was never opening the file, it was opening the file and calling the answer settled. The
rule is now scoped that way in the skill's frontmatter and §0.

**What the structure map is FOR, then.** Not a replacement for reading — a checklist against it.
Reading gives semantics and misses things silently; the map gives COMPLETENESS ("these 291 comp
elements have no counterpart") which a model reading two files will not enumerate exhaustively.
Read for intent, then let the map catch what the reading skipped.

> **OPEN QUESTION, and step 2 must not assume the answer.** The plan's claim that "enumerating that
> completely is exactly what a model reading two files does badly" is **asserted, never measured**,
> and the naive-phase result is evidence partly against it. Before building the full map, run the
> cheap test: on the witness, have a model reconcile from the comp + screenshots + the raw
> missing/extra findings ALONE, and record what it misses. If it misses little, the map is a
> convenience and should be small; if it misses whole regions, the map earns its cost. Measure
> before building — that is this plan's own standing rule, and it applies to the plan.

### Reconcile step 1 — freeze the clock, so the guard stops lying ✅ DONE 2026-09-16

**Goal.** Everything below is judged against the corpus. It currently moves on its own.

Measured 2026-09-16: `refdiff-library-groups-desktop` went **`matched` 197 → 196, findings
560 → 561, +4 / −3** overnight with nothing edited. The `refdiff` corpus's impl is the annotator
serving `fixtures/demo-root`, and its Library page renders the AGE of the runs it contains;
midnight turned `20 d ago` into `19 d ago`, the label narrowed, a row reflowed, two elements moved
~13 px and one pairing was lost. The uctoinak2 corpus has the same shape (`"uzávierka o 9 dní"`).

**This is not free coverage of date handling — it asserts nothing.** No expected value, no failure
mode, nothing can go red. It only manufactures the exact signature step 2 declares a REGRESSION
(`matched` falling while `d-only`/`i-only` rise), which trains a reader to explain that signature
away. If date handling is worth testing, it is worth a test with an assertion.

- `page.clock.setFixedTime` exists in the pinned Playwright (1.62.1, probed). Install it in the
  browser adapter BEFORE first navigation, from a per-pair or per-manifest fixed instant.
- **`ignore.textPatterns` is NOT a substitute and must not be proposed as one.** Policy runs at
  `cli.ts:643`, matching at `:556`, and `matchingStats(match)` at `:697` reads the RAW match result:
  an ignore rule hides the finding about `19 d ago` while the reflow still costs the pairing.
  `matched` drifts regardless. Only freezing the clock fixes the instrument.
- Pick the instant deliberately and record it — a comp drawn against "20 d ago" pins the date the
  fixtures were authored for, and changing it later re-drifts every pair at once.

**Done.** The same pair, captured twice across a real midnight, reports `+0 / −0`.

**DONE 2026-09-16 — measured (`92b1f0a`).** `openPage` calls `page.clock.setFixedTime(FROZEN_CLOCK)`
before any adapter navigates — the single seam all three capture adapters go through, so a new
adapter inherits it. With the clock frozen `refdiff-library-groups-desktop` captures at **matched
197 / 560 findings**, reproducing the committed 2026-09-15 baseline exactly, and a second
consecutive run is **`+0 / −0`**. The instant is `2026-09-15T12:00:00Z` — the day that baseline was
measured, deliberately NOT tuned to whatever makes a comp agree. `setFixedTime` rather than
`clock.install`, so timers keep running and only rendered dates stop moving. The opt-out is `null`,
**not `undefined`**: an explicitly-passed `undefined` re-triggers the default parameter, which a
test caught. Tests +2 → 476 core + 380 annotator.

**VERIFIED ON ALL THREE CORPORA 2026-09-16, and re-baselined**
([`baseline-matching-2026-09-16.md`](baseline-matching-2026-09-16.md), every corpus measured that
day). **The AUTH risk did not materialise: zero `auth-failed` across 29 route pairs.** Each corpus
was measured TWICE, and the second run is the evidence — a first post-freeze run can only show the
clock MOVING, never that it has stopped.

| corpus | pairs | 1st post-freeze run | 2nd run | totals, vs the committed 2026-09-15 baseline |
| --- | --- | --- | --- | --- |
| uctoinak2-storybook | 14 | 13 × `+0/−0`, 1 × `+1/−1` | `+0/−0` on that pair | 700 matched / 1317 findings / 14P-0R — identical |
| uctoinak2 | 29 | 28 × `+0/−0`, 1 × `+1/−1` | **29 × `+0/−0`** | 747 matched / 3652 findings / 6P-23R — identical |
| refdiff | 9 | 8 × `+0/−0`, 1 × `+8/−8` | **9 × `+0/−0`** | 1556 matched / 2232 findings / 8P-1R — identical |

**`matched` did not move on any of the 52 pairs, and every finding that moved was a date.** The
date movements are the freeze LANDING on a pair whose previous run predated commit `92b1f0a`
(06:04:31Z), and both shift by exactly the ~10 h the pinned instant sits behind that run:

- `portfolio-accountant-desktop` (route): one `text-content`, `"77 dní"` → `"78 dní"` — a
  days-REMAINING count, so an earlier *now* rounds it UP.
- `refdiff-library-groups-mobile`: eight findings, `"18 d ago"` → `"17 d ago"` and `"19 d ago"` →
  `"18 d ago"` — a days-ELAPSED count, so the same shift rounds it DOWN. Its sibling
  `-desktop` was `+0/−0` because that pair, and only that pair, had already been re-measured
  post-freeze in the session that shipped the freeze.
- The route corpus's 28 other pairs were `+0/−0` on the FIRST run, which reads as the freeze doing
  nothing and is the opposite: their previous run was measured on 2026-09-15, the very day the
  pinned instant names, so their rendered dates were already the frozen ones.

**One movement was NOT the clock, and is named rather than explained away.**
`tx-picker-accountant-desktop` (Storybook) re-keyed one `extra-element` — the same box, same
position, same 60×34 size — because its `boxShadow` changed from a ring carrying
`oklab(0.57685 0.0910033 0.101805 / 0.5)` to five fully transparent slots. A ring-colour token
present in one capture and not the next is a focus/transition race at capture time, not a date;
`setFixedTime` deliberately leaves timers running. It has been stable across the two runs since
(three consecutive captures of that pair). **Filed as the one known non-deterministic element in
the corpus** — if it flaps again, it is a capture-quiescence bug, not drift.

### Reconcile step 2 — the STRUCTURE MAP (promoting the parked container correspondence) ✅ DONE 2026-09-16 (small version)

**Goal.** Hand the judge the one thing it cannot build reliably by hand: a complete, measured
account of which parts of the two surfaces correspond.

> **SHIPPED as the small per-side grouping — see [the DONE block](#done-2026-09-16--the-small-version-shipped-and-it-is-measured-on-all-52-pairs) at the end of this section.**

> **THE OPEN QUESTION IS ANSWERED — the cheap test ran 2026-09-16 and the full map is NOT earned.**
> A fresh-context model reading only the comp, the two screenshots and the raw missing/extra list
> placed **57 of 59** texted unmatched elements and got **4 of 4** of this step's own Done criteria
> right, with **zero** claims contradicted by the artifacts. **Build the small version — group the
> missing/extra findings by container, one grouping PER SIDE — and stop.** Method, metrics, the two
> elements it missed, and the second witness the test turned up are in
> [THE CHEAP TEST](#the-cheap-test--run-2026-09-16-the-maps-justification-is-refuted-on-this-pair)
> below. The bullets that follow describe the FULL map and are kept for the record; they are not
> the build order any more.

Today the per-element truth exists — `missing-element` and `extra-element` findings carry text and
boxes — but arrives flat, severity-sorted, mixed among 400 others. `byRegion` is the nearest lever
and it groups FINDINGS, not structure.

> **MEASURED 2026-09-16, before the cheap test: the cheap option is not available as it stands.**
> A `reconcile` run's headline tells the reader the missing/extra findings are the raw material
> "and `byRegion` groups them" (`cli.ts:771`). On the witness it does not. Of the **101** unmatched
> elements, `byRegion` places **52** — **41 of 64 impl-only, but only 11 of 37 design-only**; the
> other 49 fall to `elsewhere`.
>
> **The design-side failure is structural, not a tuning problem, and it is worst exactly where the
> map is needed.** `containersOf` draws its containers from the IMPL side, and a `reconcile` pair is
> by definition one whose two layouts do not agree — so a comp element lands outside every impl
> container whenever the comp puts it where the impl has nothing. Verified element by element on
> the witness: `"Hrubá Co."` at (17, 23) does land in the impl's sidebar, but `"Všetky"` at x 523
> falls in the gap between the impl's sidebar (0–240) and its thread list (286–637), and the comp's
> notification badge `"2"` at x 1149 is outside the impl's 1100 px frame altogether. The mapping of
> design boxes into impl world space is fine (`regions.ts:44` is correct and was checked); there is
> simply no impl container there to hold them.
>
> So "just group missing/extra by container" cannot mean "re-use `byRegion`". The cheap version
> still exists, but it has to group the **design** side by the **comp's own** containers — two
> groupings, one per side, not one. Cost that in when the cheap test's answer decides how much to
> build.

- An OUTPUT beside the matcher, never inside it (`PARKED` says why, and that reasoning is unchanged:
  as an output it cannot misfire into leaf matching the way a confidence-gated code path can).
- Name, per comp container: which impl subtree it corresponds to, which have no counterpart on
  either side, and where reading order diverges. `containersOf` already exists for `byRegion`.
- Emit it only where it is the deliverable — a `reconcile` pair — and say plainly what it does not
  know.

**Done.** On the witness, the map names the thread rail, the filter chip row and the message pane
as three correspondences, and says the comp's relative-date column has no impl counterpart — the
thing a reader currently reconstructs by hand from six scattered findings.

#### THE CHEAP TEST — RUN 2026-09-16. The map's justification is REFUTED on this pair.

**Method.** A fresh-context model was given three things and forbidden everything else: the comp
source (`messages.dc.html` frame `1c`), `design.png` and `impl.png`, and the 101 raw
`missing-element` / `extra-element` findings flat in report order. No other findings, no
`byRegion`, no `elements.json`, no matching stats, no phase line. It was asked for the reconcile
account a skilled model would naturally produce — **deliberately NOT told to enumerate
exhaustively**, since that instruction manufactures the very completeness under test. The
population (101 = 59 texted + 42 textless), the metrics and the adjustment rule were written down
**before** the model ran, and the two screenshots were read independently for a ground truth of
the correspondences.

| metric | result |
| --- | --- |
| **M1** texted elements placed | **57 of 59 (97%)** — 47 by verbatim quote, 10 more by an explicit set statement, each named below |
| **M2** textless elements named by exact coordinate | **29 of 42 (69%)**; the remainder described as classes ("the avatar gutter", "the user card") |
| **M3** the four things this step's Done criterion demands | **4 of 4**, all correct |
| **M4** claims contradicted by the artifacts | **0 found** |

The ten set-statement credits, listed so the adjustment can be audited: `"10:24"` and `"12. 9."`
(the thread-row time column, prescribed as a class — "the comp's short relative form (`Včera`,
`Pon`, `2. 7.`) not `15. 9.`"); `"Vy: Super — …"`, `"Vy: Ďakujem, sedí to…"` and its impl twin (the
`Vy:` self-prefix rule, with one pair quoted elided); `"17:26"` (bubble-timestamp placement);
`"14. 9. 2026 17:20"` and `"…17:26"` (the explicit "every `14. 9. 2026 …` finding is seed data");
`"Transakcia · SumUp Payments · …"` (the anchor-descriptor snippet rule, sibling quoted in full);
and the impl message body `"Super — prepošlite…"` (the transcript-model prescription) — the last
being the weakest credit, so **M1 is 56/59 if it is refused**.

**What it missed, in full: two elements, which are one divergence** — the fourth thread's title
reads `"SumUp poplatky — jún"` in the comp and `"SumUp Payments — chýba doklad"` in the
implementation, and the account never remarks it (it caught the fixture divergence in general,
naming ~20 findings as seed data, but not this one). **A container-grouped map would not have
caught it either**: both titles sit in the same thread-row container, so grouping by container
places them and says nothing about them. The one thing reading missed is the one thing the
proposed instrument does not measure.

**The answer to the OPEN QUESTION, then: "enumerating that completely is exactly what a model
reading two files does badly" is false here.** But the honest reading is narrower than "the model
is good at this", and it is the reading that decides the build:

- **The completeness was the TOOL's, re-organised.** The model was handed the complete flat list,
  so it never had to enumerate anything — it had to not DROP anything, and it dropped 2 of 101.
  The map was justified as supplying completeness the reading lacks; the flat list already
  supplies it. What reading added was structure, priority and judgement.
- So **build the small version**: group the missing/extra findings by container, **two groupings,
  one per side** (the `byRegion` measurement above says why one will not do), and stop. The full
  correspondence map is not earned by this evidence.

**It also found something the tool does not report, which is the strongest single result here.**
From the *absence* side — reasoning that the comp's fourth filter chip `Vybavené` is missing from
the unmatched list while the implementation renders only three chips — it concluded the chip had
been mis-paired with the implementation's unrelated `Vybavené` thread badge, and warned that
"absence from `unmatched.md` is not evidence of presence". **Verified, and it is worse than
claimed:** see the pass-1 defect below.

**A SECOND WITNESS, found by the cheap test and worse than the first.** The comp's filter chip
`"Vybavené"` at (766, 92) is paired with the impl's thread badge `"Vybavené"` at (351, 729) —
**415 px left and 636 px down, γ 1062.6** — and it yields six findings (`f93` position, `f185`
size, `f189` colour, `f191` border, `f195` typography, `f196` border-radius) about two unrelated
elements. The canonical witness (`Včera` ↔ `Otázky · 1`, γ 98.7) is the same shape at a fourteenth
of the distance, and it at least ends with an `f206` `text-content` line giving it away. **This one
has no tell at all, because the two strings are IDENTICAL** — there is no text-content finding to
reach.

Cause, traced and confirmed:

- **Pass 1 has no γ ceiling by design.** Its comment says an element whose text appears exactly
  once on each side "IS the same semantic element, **wherever it moved**". `textMaxGamma`
  (2 × `maxGamma` = 200) caps pass **1b** only — the several-times case.
- `normalizeForMatching` is `collapse(text).toLowerCase()`, so `"✓ Vybavené"` and `"Vybavené"` are
  different keys. That makes `"vybavené"` unique on *each* side — the chip in the comp, the badge
  in the impl — and pass 1 pairs them unconditionally. The comp's own badge `"✓ Vybavené"` is then
  left over as `f25 missing-element`, which is the visible half of the same mistake.
- **Step 1's `unverified` gate cannot fire on it**: all six read `via: "text"`, `unverified: false`.
  The exemption is deliberate and its stated reason is "both elements carry the same string and the
  transform played no part in forming it" — **which is exactly the case where text identity proves
  nothing**. Geometry is the only thing that could have refused this pair, and `via: "text"` is
  precisely what turns geometry off.

This is a matcher finding, not a reconcile one, and it is **not fixed here**. It belongs to
**step 5** (which is about refusing pairs on weak evidence) and it changes that step's framing: the
plan has step 5 refusing *geometric* pairs below the confidence floor, and the sharpest unflagged
mis-pairing in the corpus is a **text** pair. It is also the first configuration the parked
Lowe's ratio test would have caught, since the comp offers two candidates sharing the token and the
matcher picks the wrong one — `Finding.ambiguityMargin` is still declared and unwritten.

#### DONE 2026-09-16 — the small version shipped, and it is measured on all 52 pairs

`groupUnmatched` / `describeUnmatched` in `package/regions.ts` (pure), `UnmatchedBreakdown` /
`UnmatchedSide` in `types.ts`, `ComparisonReport.unmatched`, printed in the reconcile headline.
**One grouping per side**: the comp's unmatched elements in the COMP's own containers, the
implementation's in the implementation's. Both trees are already in impl world space
(`alignStructural` maps the design side), and the comp's frame origin is the alignment offset, so
the two groupings are in one coordinate space and are still never merged — they answer two
different questions. `minGroup` is **1** here against `byRegion`'s 2: there the question is
orientation and a lone finding is noise, here it is completeness and a comp column with one element
in it is the divergence being hunted.

**The measurement, over all 52 recorded pairs and computed exactly as `packageForModel` computes
it** — from each run's own findings, suppressed list, matching block and element trees, so no
capture was needed and nothing was re-derived:

| population | placed by each side's OWN containers | placed by `byRegion`'s impl containers |
| --- | --- | --- |
| design-only, all 52 pairs (2250 listed) | **1358 (60%)** | 717 (32%) |
| design-only, the 24 `reconcile` pairs (1200) | **697 (58%)** | 251 (21%) |
| impl-only, all 52 pairs (1010 listed) | 584 (58%) | — (same containers) |

On the canonical witness: **30 of 37** design-only placed in 6 comp containers against `byRegion`'s
11, and 41 of 64 impl-only in 8 impl containers. That is the plan's own 11-of-37 number, moved.

**Both filed defects are fixed inside the deliverable, as the handoff prescribed.**

- **The count that could not be reconciled with its list.** The headline now names BOTH
  populations — `38 design element(s) with no counterpart, in the comp's own containers (37 listed
  below, 1 under the reporting floor)` — rather than counting one and pointing at the other.
  `UnmatchedSide` carries `elements` / `reported` / `suppressed` / `belowFloor`, and they add up on
  **all 52 pairs**. Choosing to say both rather than to re-count: `MatchingStats` is the instrument
  a matcher change is judged by and its `designLeaves = matched + designOnly` invariant is load
  bearing, so narrowing it to the reportable population would corrupt the guard to tidy a headline.
  **The defect is much bigger than the 38-vs-37 that filed it: the two populations differ on 24 of
  52 pairs, and the worst is `refdiff-compare-desktop` — 84 unmatched, 22 listed, 62 of them hidden
  by the ignore policy.**
- **The headline no longer tells the reader `byRegion` groups the raw material.** It points at the
  per-side grouping; the reason `byRegion` cannot do this job is recorded in `UnmatchedBreakdown`'s
  and `groupUnmatched`'s own doc comments, where the next person to reach for it will read it.

**Where it does NOT work, named rather than tuned away.** `refdiff-library-groups-desktop` — the
`refdiff` corpus's only `reconcile` pair — places **22 of 290 and 0 of 106**. Cause, measured: 139
of its 303 impl elements are boxes under the 64 px container floor, and the one surface that would
hold everything is refused at **0.797** of the frame. Raising `maxShare` would buy a single group
holding all 106, which locates nothing and reads as a placed map — a worse report, not a better
one. The 8 Storybook component pairs have no qualifying container on either side and get an empty
map that says so. On 6 of 52 pairs the comp's own containers place FEWER than the impl's (1–8
elements each; all component or small-mobile pairs whose comp tree has one or two containers), which
the corpus totals decide against. **`containersOf`'s constants are untouched, so `byRegion` is
unmoved on every pair.**

**A map states its own miss rate.** `N in no container of that side — this map does not place them`
is printed and `elsewhere` is written; an empty map is EMITTED rather than omitted, because
`elsewhere: 37` ("37 unmatched, none placed") and a missing field are different claims. `unmatched`
is absent in exactly two cases, both statements: no `matching` block to give `elements` a meaning,
or nothing unmatched at all.

**Verification.** `refdiff-library-groups-desktop` re-captured three times end to end: **197 matched
/ 560 findings, `+0 / −0` every time** — the committed baseline, matching untouched (the change adds
a report field and rewrites two console lines; `identityKey` reads neither). Tests **+12 → 488 core
+ 380 annotator**; `pnpm typecheck` clean; `preflight-selftest.sh` 24/24. `skills/refdiff/SKILL.md`
§1a-0 rewritten: `report.unmatched`, an explicit "do not use `byRegion` for this" with the 251-vs-697
number, the map's miss rate, and the two-population headline.

**Not built, still parked:** the full correspondence map. The cheap test refuted its justification
and nothing here re-opens it.

### Reconcile step 3 — the WORKFLOW, in its own file, written to be revised

**Goal.** Make the skill feature-complete across the whole spectrum it already half-covers:
**§0 does not exist yet → reconcile: exists but diverges → §1–6 corresponds (polish).**

**Split the skill while doing it.** `SKILL.md` is 1395 lines / 101 KB, and a session loads all of it
to run a loop that needs perhaps a third. Reconcile and polish instructions in separate files is the
point of the split, but it is not the biggest win — measured, the situational material is:
`§1b Sets` 262 lines, the configuration reference (`ignore` 112 + `disabled` 39 + `sections` 98) 249,
`Reading the measurements` 150, and setup/vendoring/env-preflight ~220. Proposed layout, to be
confirmed against how it actually reads:

| file | holds | loaded when |
| --- | --- | --- |
| `SKILL.md` | bindings, the non-negotiable rules, pre-flight, §0–§1, the phase read, routing | always |
| `reconcile.md` | the new workflow | `phase: reconcile` |
| `polish.md` | §1a, §1a-ii, §2–§6, Reading the measurements | `phase: polish` |
| `sets.md` | §1b | a set / manifest run |
| `configuring.md` | `ignore`, `disabled`, `section`/`sections`/`gallery` | declaring a pair |
| `setup.md` | vendoring, dev-mode setup, env pre-flight | once per machine |

> **The split has one trap, and it is this repo's favourite shape.** `sync-skill.sh` carries an
> EXPLICIT list — `FILES="SKILL.md setup-dev.sh preflight.sh sync-skill.sh"` — so a new `.md` that
> is not added to it silently never reaches a vendored consumer, while every local test passes.
> Glob the skill directory instead of listing it, or add a check that fails when a file in the dir
> is missing from `FILES`. Do not hand-extend the list and hope.

- A numbered, opinionated workflow in `reconcile.md`, in §0's shape: the steps, and for each the
  failure it prevents. **Step one is READ** — the comp and both `design.png` / `impl.png`, for
  intent — and the measured missing/extra list (and the map, if step 2 shows it earns its place) is
  the checklist against what the reading produced.
- It must answer the questions the current four sentences duck: where to start when 291 elements
  are unmatched, how to tell "the impl is missing a feature" from "the same feature is built
  differently" from "the comp is stale", when to change the comp instead of the code (§3a already
  owns that decision and must be cross-linked), and when to stop reconciling and re-run to see
  whether the pair has crossed into `polish`.
- **Ship it marked PROVISIONAL, and revise it after each real use**, each revision naming the pair
  that forced it — the same anchor discipline as the rest of this repo. A first draft of a workflow
  nobody has run is a hypothesis; say so in the section itself.

**Done.** A `reconcile` pair can be worked end to end from the skill alone, and the section names
the pairs it has actually been run against.

#### DONE 2026-09-16 — `reconcile.md` shipped, and `SKILL.md` split six ways

**(a) `skills/refdiff/reconcile.md`, 227 lines, marked PROVISIONAL in its own first paragraph.**
Seven numbered steps in §0's shape, each naming the failure it prevents: **R1 READ** (the comp,
`design.png`, `impl.png`, for intent — the hypothesis), **R2** the per-side `report.unmatched`
map as the CHECKLIST against that reading, **R3** the complement audit, **R4** classify, **R5**
fix in order, **R6** re-run and read the PHASE, **R7** the anchor table. The binding half of the
old ban is stated in the header — *reading forms a hypothesis; the measurement adjudicates it* —
and the file says plainly that it has been RUN end to end against **zero** pairs.

It answers the three questions the four sentences ducked. **Where to start at 291 unmatched:**
the biggest GROUP, not the first finding — a group is usually one decision, and the witness's
two ten-element groups account for 20 of its 37 listed elements. **The three-way classification**
is a table with a tell per row, and the "stale comp" row does not re-decide anything: it
cross-links `polish.md` §3a (never edit the comp to agree; ASK before writing upstream) and
names `disabled: "<why>"` for a comp a rebuild superseded. **When to stop:** re-run after each
structural change and read `matching` + `phase`, not the finding count — refusing a pair moves
one element out of `matched` and adds one to BOTH one-sided columns, so progress is `matched`
RISING while `designOnly` and `implOnly` fall. The `polish` crossing is quoted as the shipped
rule (`rate >= 0.70 && max(confidenceX, confidenceY) >= 0.50`), and the one bound with no
measurement behind it — three flat iterations → stop — is **labelled `(unmeasured)` in the file.**

**Every claim in it was re-derived from the artifacts, and one of the plan's own framings did not
survive.** The plan said the map is the instrument that catches what reading misses. Measured:
the one thing the cheap test's reading missed — the fourth thread's title, `"SumUp poplatky —
jún"` against `"SumUp Payments — chýba doklad"` — is `f24` and `f81`, and the map DOES place
both, in the comp's thread row at (282, 363) and the implementation's at (286, 665). **Different
rows, so nothing connects them.** `reconcile.md` says so rather than claiming a catch: the one
thing reading missed is a thing the map does not measure either, which is what R4 exists for.
The `Vybavené` numbers were re-measured the same way and hold exactly — comp chips at y 92
(`Všetky · Žiadosti · Otázky · Vybavené`), impl chips at y 235.5 (three of them), the comp's
fourth paired with the impl's thread badge at (351, 728.5): **415.0 left, 636.5 down, γ 1062.6.**

**(b) The split, measured.** `SKILL.md` **1423 lines / 103 KB → 399 lines / 30 KB**; six files,
1737 lines total. The layout is the one the plan proposed, confirmed against how it reads:

| file | lines | loaded when |
| --- | --- | --- |
| `SKILL.md` | 399 | always — bindings, the rules, tool pre-flight, the loop, §0, §1, §1a-0, and the routing table |
| `polish.md` | 409 | `phase: polish` — §1a, §1a-ii, §2–§6, Reading the measurements |
| `sets.md` | 269 | a set / manifest run — §1b |
| `configuring.md` | 261 | declaring a pair — `disabled`, `ignore`, `section`/`sections`/`gallery` |
| `reconcile.md` | 227 | `phase: reconcile` |
| `setup.md` | 172 | once per machine / per repo — vendoring, dev-mode setup, environment pre-flight |

**What a session actually loads**: a polish run 808 lines (SKILL + polish) against 1423 — **43%
less**; a reconcile run 626 — **56% less**, and it gets a workflow where it previously got four
sentences. `Environment pre-flight` went to `setup.md` rather than staying resident: it is about
the repo you measure, it is read when a capture fails, and rule 6 now points at it by name.

**Content is byte-preserved and that was verified, not assumed.** The nine extracted ranges
concatenate back to the committed `SKILL.md` exactly (`diff` clean), and a line-level set
difference of the original against the union of the six files leaves exactly **23** lines, every
one of them a deliberate edit — the frontmatter description, the phase table's two rows, and every
cross-reference that became cross-file (`§3a` → `polish.md` §3a, `§1b` → `sets.md` §1b, and so
on). Every `§` reference in the six files is now either intra-file or file-qualified; that was
audited per file rather than spot-checked.

**`CLAUDE.md`'s doc-sync table was stale the moment the split landed and is updated in the same
change.** Three of its rows pointed at "the 'Configuring a pair' table … in `SKILL.md`",
"'Reading the measurements' + §1a in `SKILL.md`" and "'Environment pre-flight' in `SKILL.md`" —
sections that are no longer there. The rows now name the owning file, a row for the phase /
`unmatched` / reconcile material was added, and the "grep before you call it done" line became
`grep -rn … skills/`: **a grep of `SKILL.md` alone now misses five sixths of the skill and
reports clean**, which is this repo's own favourite failure shape.

**Verification.** `preflight-selftest.sh` **24 passed, 0 failed** — the only check of the
vendoring path, and rows 9a/9c/9d are the ones that matter here (9c has planted a `reconcile.md`
since `bf392ee`, which is now a real file). A real vendor into a temp consumer ships all nine
files — `configuring.md polish.md preflight.sh reconcile.md sets.md setup-dev.sh setup.md
SKILL.md sync-skill.sh` — and the `.skill-version` stamp's `files=` names every one. `pnpm
typecheck` clean; tests **488 core + 380 annotator**, unmoved, because **no source file changed**
— which is also why the corpus needs no re-measurement: `matched` cannot move on a documentation
change, and no capture was run.

---

### Step 5 — refuse geometric pairs below the confidence floor

**Goal.** Old step 3's outcome at a fraction of its risk, and the plan's own stated fix direction
("refuse for LACK of evidence, not on proof of a better alternative") as a threshold rather than a
rewrite.

- Below `DEFAULT_MIN_ALIGNMENT_CONFIDENCE` (0.5, the floor step 1 already uses), **do not form
  geometric pairs at all**; report both elements as missing/extra.
- Text and slot pairs are untouched at any confidence — they are evidence about themselves.

> **THE SECOND BULLET IS THE ONE TO RE-ARGUE, and 2026-09-16 produced the counter-example.**
> "Text pairs are evidence about themselves" is what leaves the corpus's sharpest mis-pairing
> unflagged: on the witness, the comp's filter chip `"Vybavené"` is paired with the impl's thread
> badge `"Vybavené"` **415.0 px left and 636.5 px down — 759.9 px, γ 1062.6** (the "762" this block
> carried until 2026-09-16 was a hand-rounded Euclidean figure; re-derived from the boxes,
> design (766.03, 92.0) 61.07×14 against impl (351, 728.5) 52×12), `via: "text"`,
> `unverified: false`, producing six
> confident findings about two unrelated elements — the canonical witness's defect at 14× the
> distance and with **no `text-content` tell**, because the strings are identical.
>
> Cause: **pass 1 has no γ ceiling at all** ("wherever it moved"); `textMaxGamma` caps pass 1b only.
> `normalizeForMatching` keeps the `✓`, so `"vybavené"` is unique on each side and pass 1 takes it
> unconditionally. So this step, as written, would refuse well-evidenced geometric pairs at γ 30
> while leaving a γ 1062 text pair standing.
>
> **A γ CEILING ON PASS 1 IS REFUTED — measured 2026-09-16 across the whole corpus, do not build
> it.** The shipped matcher was re-run over all 52 pairs' recorded leaf sets and **reproduced every
> pair's `matching` block exactly (52/52)**, so the distribution below is the real one, not a
> sample of the pairs that happened to emit findings. Of **1424 text-matched pairs**: p50 27.9,
> p90 156.5, p99 544.0, max 1261.1.
>
> | γ ceiling | text pairs it would refuse | comparisons affected |
> | --- | --- | --- |
> | 200 | 79 | 20 |
> | 300 | 27 | 12 |
> | 500 | 15 | 10 |
> | 800 | 6 | 6 |
>
> **The correct and the wrong pairs OVERLAP, so no ceiling separates them.** Certainly-correct
> long-distance pairs reach **γ 873**: `refdiff-library-groups-desktop` pairs `"Stepper"` at
> (109, 1664) with `"stepper"` at (109, 794) — verified as the same library row, same x, wrapped in
> an identical box lattice (62/74/87 on both sides), moved up only because the list above it is
> shorter. Below it and equally correct: the `docs-accountant-mobile` bottom nav
> (`Portfólio` / `Správy` / `Požiadavky`, all three moving 1422 → 880 with their x order intact,
> γ 576–605) and a unique 50-character sentence,
> `"Org-nastavenia platia len pre vybranú organizáciu."`, at γ 442–544 on two settings pairs.
> Certainly-WRONG pairs start at **γ 686**. A ceiling that catches the wrong ones destroys more
> correct pairs than it saves, which is the REGRESSION signature step 2 defines.
>
> **The defect is bigger than one pair, which is why it still deserves a fix — just not this one.**
> The `Vybavené` chip↔badge mis-pairing is on **four** pairs (`messages-accountant-desktop` 1063,
> `-accountant-mobile` 822, `-owner-mobile` 763, `-owner-desktop` 686), and a further family is
> unclassified: `"Požiadať o doklad"` at 1261 / 770 / 702 and `"Zavrieť obdobie"` at 823 on three
> mobile pairs, plus `"Nahrať doklad"` at 778 — both sides isolated, with no lattice to judge them
> by, so they are named as unclassified rather than guessed at.
>
> **What the data says the discriminator actually is: containment, not distance.** Every
> certainly-correct long pair preserves its x and its local structure (Stepper's box lattice, the
> ghost panel's 1079/1194 columns, the nav's x order); the wrong ones move on BOTH axes and change
> role — a filter chip becomes a thread badge. That is container-scoped evidence, i.e. the PARKED
> work, and it is the same per-side container data reconcile step 2 is about to produce. **So the
> fix is downstream of step 2, not ahead of it** — which is also the first positive reason to keep
> the plan's existing order rather than merely defaulting to it.

> **Read step 4's DONE block before implementing this — it moves the threshold's own ground.** This
> step is written against the JOINT `alignment.confidence`, and step 4 measured that the joint score
> collapses to 0 on a surface that corresponds along one axis and packs differently along the other
> (`tx-picker-owner-mobile`: 17 anchors, 14 agreeing on X, 1 on Y, 0 on both — joint 0.00 at
> `confidenceX` 0.82 and match rate 0.91). Gating pair FORMATION on the joint score would refuse
> every geometric pair on **all 14 Storybook component pairs**, which are the polish-loop pairs step
> 3 was run to obtain and which step 4 labels `polish`. Decide deliberately which confidence this
> step reads — and note the case is NOT identical to step 4's: a phase is advice, whereas this
> changes what gets paired, so "both axes must be right" is at least arguable here in a way it was
> not there. Whichever is chosen, argue it against the corpus and re-check the acceptance criterion
> below, which is stated in terms of the joint score.

#### Step 5's MEASUREMENT PHASE comes first — the R3 sweep (decided 2026-09-16, with Mato)

**The blocker is ground truth, not code.** A containment discriminator has to be validated against
a LABELLED set of text pairs, and the corpus's labelled set is currently **7 pairs against 1424**:
4 certainly-wrong (`Vybavené` at 1063 / 822 / 763 / 686) and 3 certainly-correct (`Stepper` γ 873,
the `docs-accountant-mobile` bottom nav 576–605, the 50-character settings sentence 442–544). The
unclassified family beside them — `"Požiadať o doklad"` 1261 / 770 / 702, `"Zavrieť obdobie"` 823,
`"Nahrať doklad"` 778 — is unclassified precisely because nobody has gone and looked. **Build a
discriminator against 7 labels and you have fitted it to the examples that named it.**

**So run `reconcile.md` §R3 as a SWEEP over the 24 `reconcile` pairs, and treat its output as this
step's input.** R3 is the written-down form of the procedure that produced every confirmed label
so far: ask which elements are missing FROM the unmatched list, then find what claimed them.
It needs **no capture, no server and no library change** — `matchElements` re-run over each run
dir's `elements.json`, with the "reproduces that pair's recorded `matching` block or the pair is
dropped" rule as the admissibility gate (52/52 last time). The complement question is what found
the corpus's worst mis-pairing in minutes after four sessions of reading the findings the report
emits; the sweep is that question asked 24 times instead of once.

Record, per candidate: the two boxes, `via`, γ, the axis decomposition (Δx / Δy separately — the
hypothesis is that correct long pairs keep their x), and the CONTAINER on each side from
`groupUnmatched`'s per-side map. That last column is the discriminator's actual feature, and it is
already shipped.

**Do NOT run the rest of `reconcile.md` to get this.** R5/R6 mean actually reconciling the pair —
fixture and missing-feature work in the consuming repo — and that is not merely off-topic, it
**destroys the instrument**: `messages-accountant-desktop`'s numbers (**41 of 80, rate 0.51, γ 98.7,
γ 1062.6, 31-of-38 placed** — 42 / 0.53 / 30-of-37 before step 5 refused its one oversized slot
pair) are quoted throughout this plan and both baselines, and reconciling the
pair moves it into `polish` and re-dates every one of them. Do not fix the witness while it is
still the witness. R3 reads; it changes nothing.

**Done (measurement phase).** A labelled table materially larger than 7, covering the unclassified
family, with the per-side container recorded for each — enough that a containment rule can be
proposed AND falsified rather than illustrated.

**DONE 2026-09-16 — measured. CONTAINMENT IS REFUTED, and the sweep found a defect this plan was
not looking at.** Full write-up, method and every table:
[`docs/r3-sweep-2026-09-16.md`](r3-sweep-2026-09-16.md); the labelled sets and the candidate sets
they were labelled against are frozen beside it as four JSON files, so the scoring reproduces
without the run dirs. Scripts: `r3-sweep.ts` (the audit), `r3-crops.ts` (own-side crops — the
LOOKING), `r3-score.ts` (falsification). 52 run dirs read, **52 admissible, 0 dropped**; the text-γ
distribution reproduces the previous session's to the decimal, which is what says it is the same
matcher on the same inputs.

- **107 labelled candidates against the 7 this step started with**, from two selectors: 92 at
  γ ≥ 200 (12 wrong / 79 correct / 1 leaf-shape) and 15 slot pairs at area ratio > 4 (13 / 1 / 1).
  25 decided from the PNGs alone — `packageForModel` crops both sides at the SAME region, which
  shows nothing when a pair is 1000 px apart, so `r3-crops.ts` crops each element where it sits on
  its OWN side. The scorer prints that pixels-only subset as its own table, because a `detail`
  label reads an element's line-mates while a containment rule reads its container: the one place
  the labels are not independent of the hypothesis. **Containment is refuted on both tables.**
- **The unclassified family is classified, and it SPLITS.** `Požiadať o doklad` γ 1261 / 770 / 702
  and `Zavrieť obdobie` γ 823 are **CORRECT** — one relocated CTA per side, i.e. refdiff reporting
  something true. `Nahrať doklad` γ 778 is **WRONG**, and new: the comp's in-thread action button
  against the implementation's global top-nav upload button.
- **So the γ ceiling is refuted harder than before.** The overlap was [686, 873]; it is now the
  whole band — correct to **γ 1261**, wrong down to **γ 210**. Every ceiling costs more than it
  buys (700 catches 4 and breaks 6; 500 catches 5 and breaks 10), and so do both axis readings of
  "correct long pairs keep their x" (|Δx|>100: 5 for 12; both-axes: 5 for 10).
- **Containment, in all three readings its own wording allows:** shape disagreement catches 3 and
  breaks 18; counting an unplaced side as disagreement catches 11 and breaks 63; adding the
  offset-inside-container test catches 4 and breaks 18. **The cause is the map's own miss rate one
  level down** — only 4 of the 12 wrong pairs have both sides placed, against 34 of 79 correct —
  and where it IS available it still fails: `refdiff-compare-desktop-ghost` mis-pairs a 252×31
  sentence with a 7×14 badge *inside the same container on both sides*.
- **ZERO geometric candidates above γ 200**, because `DEFAULT_MAX_GAMMA` is 100. This step's first
  bullet addresses a population that is already distance-bounded; every long-distance pairing in
  the corpus is `text` or `slot`.
- **The defect nobody had looked at: the SLOT pass.** Width-blind by design, and width-blind
  without a BOUND — so a 13×13 avatar badge claimed a 380×19 page subtitle 16 px away, and the
  comp's `POPIS` field LABEL claimed the implementation's `ZDROJ` field VALUE on two Storybook
  pairs at confidence 0.83. **Mis-pairing is not a `reconcile`-only phenomenon**, which is what
  disqualifies this step's written acceptance criterion.

**Done.** The witness (confidence 0.07) emits `missing-element "Včera"` and
`extra-element "Otázky · 1"` and none of the other four findings. **No pair at confidence ≥ 0.5
changes by a single finding** — that is the acceptance criterion, and it is the one this step is
cheap enough to actually guarantee.

**The honest caveat.** The witness's `matched` falls ~42 → ~20. On a genuinely divergent pair that
drop is CORRECT, and it is also the exact shape step 2's rule calls a regression. The corpus table
localises the change; it cannot by itself say whether a collapse was deserved. That judgement stays
human, and step 4's phase label is what makes it answerable ("matched collapsed on a `reconcile`
pair" is expected; "on a `polish` pair" is a bug).

**DONE 2026-09-16 — measured. The step shipped as the rule the SWEEP supports, not the one written
above, and both of its bullets were re-argued first.**

**Bullet 1 ("below the floor, do not form geometric pairs at all") is MOOT, not wrong.** Geometric
pairing is already bounded at `DEFAULT_MAX_GAMMA` = 100, so the sweep's 92 long-γ candidates contain
**zero** geometric pairs. There is no far-away geometric pairing in this corpus to refuse. Gating
pair FORMATION on the joint `alignment.confidence` — which step 4 disqualified for the phase, and
which collapses to 0.00 on a surface that corresponds on one axis (`tx-picker-owner-mobile`: 17
anchors, 14 on X, 1 on Y, 0 on both, at match rate 0.91) — would have refused every geometric pair
on all 14 Storybook pairs to buy nothing measurable. **Not implemented, and the reason is a number,
not a preference.**

**Bullet 2 ("text and slot pairs are untouched at any confidence — they are evidence about
themselves") is HALF RIGHT, and the measurement says which half.**

- **TEXT: right, and by a wide margin.** Of 79 text pairs above γ 200, **74 are correct and 5 are
  wrong** — the four `Vybavené` chip↔badge pairs plus `Nahrať doklad`. The correct ones are not
  noise to be tolerated: they are refdiff saying *the comp's bottom CTA is in the implementation's
  header* (γ 1261), *the comp right-aligns the message author and the implementation left-aligns
  it* (γ 448, Δx −422), *the same library row is higher up a shorter list* (γ 873, Δx 0). No
  feature tested here separates the 5 from the 74. The bullet stands for `text` **because nothing
  measured is good enough to overturn it**, which is a different and weaker claim than the one it
  makes — a text pair's ~94% correctness in this band is the bar a future rule must beat.
- **SLOT: wrong.** The slot pass's premise is "the same slot showing different data", and it
  enforced position but not SIZE, so the corpus carries a 13×13 avatar paired with a 380×19
  subtitle and a field LABEL paired with a field VALUE. Of the 15 slot pairs above area ratio 4,
  **13 are wrong, 1 is leaf-shape and 1 is correct**. The two populations meet between 4.3 and 5.5.

**What shipped: `DEFAULT_SLOT_MAX_AREA_RATIO = 5`** in `structural/match.ts` (plus `slotMaxAreaRatio`
on `MatchOptions`, `areaRatio()` beside `slotGamma`, and 2 tests → **490 core + 380 annotator**).
A slot may stretch — that is the pass's whole premise, and the test pinning it names the one
labelled-correct pair above ratio 4 — but it is still the same slot. 5 is the gap between the
populations, read off the corpus. The refusal is pushed to `vetoed`, like the existing veto,
because a refusal a reader cannot see is the same defect as a suppression they cannot see.

**Cost, re-captured end to end on all three corpora** (before-picture:
`baseline-matching-2026-09-16.md` at commit `6025583`; after: the same path in this change):

- **−13 matched of 3003, every one `via: "slot"`, one per pair on 13 pairs.**
  `matchedVia.text` and `matchedVia.geometry` are **unmoved on all 52 pairs**, and the other 39
  pairs are `+0 / −0`. Findings 7201 → 7169.
- On the two `doc-detail-*-mobile` pairs the delta is **`+2 / −6`** each — six confident findings
  about a field label and a field value replaced by one honest `missing-element` and one
  `extra-element`, on the corpus's best-corresponding pairs. That is the outcome this step exists
  for.
- **The mis-pairings were producing SILENCE, not wrong findings, on at least one pair.**
  `refdiff-compare-desktop-ghost` is `+1 / −0`: the data-slot policy had classified its text
  difference as expected, so the pair consumed one element from each side and emitted nothing. A
  finding count can never show that; `matching` can.
- **One consequence that is not cosmetic: `client-pending-accountant-mobile` moves `polish` →
  `reconcile`**, its match rate falling 0.72 → 0.69 across the floor. It was the corpus's
  nearest-the-floor `polish` pair and the pairing it lost was a pixel-confirmed mis-pairing, so its
  true correspondence was always 25 of 36. But state the general shape: **refusing a pair lowers
  the match rate, and any pair within one pairing of the floor will cross it.** Corpus phase totals
  28P/24R → 27P/25R.

**THE ACCEPTANCE CRITERION IS RESTATED, because the measurement disqualified the written one.**
"No pair at confidence ≥ 0.5 changes by a single finding" forbids the only change the evidence
supports: four of the thirteen refusals are on `polish` pairs, two of them at confidence 0.83, and
all four are labelled mis-pairings. **Restated: no pair loses a pairing the labelled set calls
CORRECT, and the guard is the labelled set, not the finding count.** Met — 13 refusals, each
individually labelled: 12 `wrong`, 1 `leafshape`, **0 `correct`**. Re-running the sweep against the
post-change corpus reproduces all 52 `matching` blocks and returns 85 γ-candidates where there were
92; the seven that vanished are six `wrong` plus the one `leafshape`.

**What this step did NOT close, and the next reader inherits it.** The slot family is bigger than
the ceiling reaches: of the 43 slot pairs it KEEPS, **22 carry token-disjoint texts**, including
`ZÚČT. OBDOBIE` ↔ `Aplikácia · nahral(a) Test Owner` at ratio 3.60 — the same label-vs-value defect
as the pair above the line. **Precision is measured; recall is not.** And the `via: "text"` family
(5 confirmed wrong) is untouched, with no discriminator found.

### Step 5b — POINT at the long pairings, because nothing does ✅ DONE 2026-09-16

**Why this exists.** Step 5 left the `via: "text"` family untouched, and after it **both of this
plan's witnesses still emit six findings each** (verified, not assumed — run 11 of
`messages-accountant-desktop`). But they are not in the same state:

- Witness 1 (`Včera` ↔ `Otázky · 1`, geometry γ 98.7) — **four of its six read
  `unverified: true`.** Step 1 handled it as well as a flag can; `position` states its own evidence
  and `text-content` is the tell, and both are deliberately unflagged.
- Witness 2 (`Vybavené` ↔ `Vybavené`, text γ 1062.6) — **all six read `unverified: false`**, and
  there is no `text-content` finding because the strings are identical.

The whole gap between those two lines is step 1's exemption of `via: "text"` from the confidence
gate. **Every fact a
reader needs was already in the report** — `via` and `gamma` ride on all six findings and the
console prints them — and nothing pointed at them.

**What was NOT done, and why, because the obvious move is wrong.** The first instinct is to extend
`unverified` to long-γ text pairs. Measured: at the matcher's own shared-text bound that would newly
flag **93 value findings (5.2% of the corpus's 1789)**, and **74 of the 79 pairings it would flag
are CORRECT** — a relocated CTA, a right-aligned author label, a library row higher up a shorter
list. Their colour and typography findings are real drift. The flag would tell a reader to discount
74 true findings to cast doubt on 5, and step 5 established that **no feature separates the two
groups**. A flag is a per-row verdict, and this corpus does not have one to give.

**So: a LIST, not a flag.** `ComparisonReport.distant` + `distantPairings()` (pure, beside
`matchingStats`), printed as a `DISTANT PAIRINGS` block on **every** pair — not reconcile-only,
because the longest list in the corpus (17) is on a `polish` pair and step 5 found mis-pairings on
the two best-corresponding pairs there. Capped at six printed rows like the region lines; the rest
in `findings.json`.

**The threshold is not a new number — that was the point.** It is `textEvidenceGamma()`, which is
ONE definition used twice: `textMaxGamma`'s default (pass 1b's own bound on pairing a non-unique
text) and this report's line. Pass 1 exempts itself from it by design; the report is that exemption
made visible. So a run with `--max-gamma` widened reports against the line THAT run used, and
nothing here is fitted to the 5 labelled mis-pairings.

**Measured, all 52 pairs re-captured in three passes:**

- **`+0 / −0` on every pair, all three corpus totals byte-identical** (refdiff 2233, uctoinak2 3627,
  storybook 1309). Purely additive: no finding, no pairing, no phase changed.
- **85 rows across 25 of 52 pairs** — 79 text and 6 slot, median 2 rows, max 17. Most pairs print
  nothing.
- **On the witness it is 4 rows and `Vybavené` γ 1062.6 is the first**, above three thread-row
  pairings that are all labelled correct. The defect the plan opened with is now the top line of a
  four-line list instead of the sixth finding of six.
- Tests +2 → **492 core + 380 annotator**.

**What it does NOT do, stated because the wording invites the opposite reading.** It does not
refuse the pair, flag its findings, or change the verdict. Witness 2 still emits six findings and
they still read `unverified: false`. What changed is that the run now says which pairings to check
before believing them. Whether that is enough is a judgement the corpus cannot make, and the
honest next measurement is whether a reader who has the list actually catches the mis-pairing.

### Step 6 — per-container confidence ✅ DONE 2026-09-16 — **REFUTED; nothing shipped to the gate**

**Goal.** Stop using one global confidence to license geometry everywhere. A well-aligned thread rail
inside a badly-aligned page should keep its geometry — today it does not, and that is a precision
loss on pairs the polish loop cares about.

- Compute confidence **per container** and let each container's own alignment quality set its γ band
  and its `unverified` gate.
- This generalises step 1's exemption: "a text-proven pair is not judged by the transform" becomes
  "a pairing is judged by the transform that actually formed it".
- Revisit whether a global floor is still wanted, and re-ask step 2's parked verdict question here —
  per-container confidence is the first configuration in which a pair can have its only gating
  findings inside one bad container, which is where the two answers become distinguishable.

**Done.** No pair loses geometry wholesale; pairs with a locally-good container gain trustworthy
findings inside it; the step-3 corpus shows the polish pairs unchanged or better.

#### DONE 2026-09-16 — the criterion above is MEASURED AND NOT MET, in 24 configurations

Full write-up: **[`r6-sweep-2026-09-16.md`](r6-sweep-2026-09-16.md)**. Read-only over all 52
recorded pairs, no capture and no server; `scripts/r6-containers.ts` (the corpus-wide cost) and
`scripts/r6-score.ts` (the falsification against the R3 labels). Step 6 touches `isUnverified` and
nothing else, so **no pairing moves and `matched` cannot move** — the whole effect is a set of
flags, and both scripts gate on reproducing the run they describe: **52/52 on the recorded
`alignment` confidences to 4 dp, 52/52 on the recorded `matching` blocks, 0 dropped.**

**The step's first question, answered first as instructed: there is no good answer, because the
question is 45% of the population.** 460 of 1017 gated-eligible findings sit in NO container the
shipped placement can name. The only principled fallback is the global confidence — and `trust` /
`distrust` are not tuning choices, they decide nearly half the findings by fiat. Every
configuration below uses `global`.

| what was swept | options | result |
| --- | --- | --- |
| evidence set | `anchors` (888) · `textpairs` (1424) | denser does not help: 143 newly flagged at the literal reading |
| reading | `global` residual · `refit` (minus the container's own median offset) | `refit` at 1 evidence is degenerate — it CLEARS the plan's second witness by construction |
| damping | shipped `min(1,n/8)/n` · undamped | shipped caps a 3-evidence container at 0.375, below the floor however well it fits |
| min evidence | 1 · 3 | at 3 the population halves again |

- **The literal reading of this step is the worst row in the table: 91 newly flagged against 4
  cleared.** The step exists to make the report trust MORE inside well-aligned regions; as written
  it trusts less, twenty-three times over.
- **At its BEST configuration (26 flagged / 51 cleared) the Done criterion above still fails.**
  Three `polish` pairs ABOVE the floor get worse — `client-settings-accountant-desktop` 0 → 6,
  `refdiff-compare-desktop-ghost` 0 → 3, and **`tx-picker-owner-desktop` 0 → 17 of its 22 value
  findings**, which is a precision loss on the polish loop of exactly the kind this step was
  PROMOTED over steps 3 and 4 for avoiding.
- **Its container table is the whole argument in four lines.** `tx-picker-owner-desktop` has two
  containers: one holds 8 text pairs, all agreeing, and scores 1.00; the other holds **20
  text-PROVEN pairings** — the most proof of correspondence anywhere in the pair — and scores 0.45,
  which is where the 17 come from. Positional agreement inside a reflowing list is low because the
  list reflowed. (The tempting generalisation — *a local score reads reflow, not correspondence* —
  is NOT confirmed as a monotone pattern across the corpus and is recorded as unconfirmed. What the
  corpus does show is worse for the proposal: the score does not stabilise as its container gains
  evidence, and its median sits below the floor in three of four buckets.)
- **Scored against the 107 R3 labels it is anti-predictive**: 5 of 6 surviving known-wrong pairings
  caught by breaking **43 of 79** known-correct ones — and five of those six are decided by a
  container holding exactly ONE anchor, i.e. a coin toss. Stated limit: 5 of the 6 are `via: "text"`
  and therefore exempt from this gate anyway, so the labelled population the gate could act on is
  n = 1. **This half corroborates; the 1017-finding cost measurement carries the refutation.**
- **AUDITED THE COMPLEMENT OF MY OWN RULE, and it is what makes this general.** "Containers are
  unavailable" is a property of `containersOf`, not of locality, so the same score was computed
  container-free — the 8 nearest text-proven pairings, defined on 83 of 85 candidates against 62.
  **Strictly worse: 69 of 79 correct broken, and 9 of 9 on the independent pixels-only subset.**
  Locality does not discriminate. That is the finding, not "the container map is too sparse".

**Step 2's parked verdict question — re-asked here as instructed, and it stops being parked.** Still
0 of 52 in all 24 configurations, and the count is no longer the answer: **51 of 52 pairs fail, 4782
findings decide those verdicts, and this flag can reach 616 of them — 12.9%; on ZERO pairs does it
reach all of them.** A verdict is decided by presence findings and text-proven pairings, which no
version of this flag touches. Step 2's closest pair reproduces to the number
(`settings-accountant-desktop`: 41 gating, 7 reachable, 7 flagged) and every one of the 34 standing
is out of reach BY TYPE — 18 missing-element, 3 extra-element, 8 position, 1 spacing, 4 on text
pairs. Answer unchanged: yes, leave it. It is now unanswerable by construction rather than
undecided.

**What the measurement found INSTEAD — filed with its numbers, deliberately not built.**
`isUnverified` reads the JOINT `alignment.confidence`, which counts an anchor only when it agrees on
BOTH axes — the reading step 4's DONE block already said a threshold should not use, and the one the
phase signal was deliberately moved off. **21 of 52 pairs are below the floor on the joint score and
at or above it on their better axis, carrying 470 of the corpus's 644 flags**; nine are `polish`
pairs at match rate 0.71–0.92 carrying 212 flags, among them `tx-picker-owner-mobile` at joint 0.00
/ `confidenceX` 0.82 — already documented as a threshold cliff, not a measurement. **And the obvious
fix is refuted by this plan's own canonical witness:** `messages-accountant-desktop` reads joint 0.07
and max exactly **0.50**, so `max(confidenceX, confidenceY)` would unflag the pair step 1 was built
for. A located defect with a refuted first fix is a question, and it needs its own measurement phase
— the nine pairs are separated from the witness by MATCH RATE, which is the strongest signal in this
plan's own table AND the one a gate must never read (`phase.test.ts`). That tension is the next
question, not this one's answer.

**Shipped:** the two scripts, this write-up, and ONE source edit — `isUnverified`'s doc comment,
which promised exactly these two replacements ("steps 4 and 5 … replace this global floor with a
per-pair ambiguity margin and a per-container confidence") and now carries the refutation of both at
the site where the next person will reach for them. No behaviour changed; 492 core + 380 annotator
green, `pnpm typecheck` clean, and no re-baseline is owed because a doc comment cannot move a pair.

---

## PARKED — not scheduled, and why

### Container-scoped matching with sequence alignment (the original step 3)

Match containers first, then sequence-align their children (LCS / Needleman-Wunsch over normalized
text and role in reading order). **Not scheduled as a change to leaf matching.** It is the largest
change in the plan, it re-decides 219 geometric matches on the five known-good pairs, and it removes
the property the polish loop quietly depends on — that a globally-unique text matches ANYWHERE,
which is what makes it robust to small structural differences. Comp groupings are designer-drawn and
impl groupings are divs; they routinely disagree, and a wrongly matched container scopes children to
the wrong candidate set.

> **PROMOTED 2026-09-16 as reconcile step 2.** Only the OUTPUT half below — the structure map. The
> change to leaf matching stays parked for every reason given here, and the promotion does not
> reopen it.

**The part worth keeping is the container correspondence itself, as a RECONCILE OUTPUT** — a structure
map naming which comp containers correspond to which impl subtrees, which have no counterpart, and
where reading order diverges. Enumerating that completely is exactly what a model reading two files
does badly, so it is real value; and as an output it cannot touch leaf matching, which a
confidence-gated version of the same code could still do by misfiring. Revisit only if reconcile asks
for it, and build it beside the matcher rather than inside it.

### Lowe's ratio test on geometric candidates (the original step 4)

**Dropped as a gate.** Harmful in `polish` and redundant in `reconcile`:

- In `polish` it is structurally hostile to repeated-content layouts — uniform grids, tables, variant
  sheets — where position is the only discriminator and the runner-up is the next row by
  construction. That is the polish loop's home ground. Measured exposure:
  `refdiff-library-groups-mobile`, 150 geometric matches at confidence 0.70.
- In `reconcile` the pair has already been judged untrustworthy wholesale, so "this particular geometric
  pair is ambiguous" tells nobody anything new.

**What survives:** `Finding.ambiguityMargin` as a REPORTED diagnostic — compute the runner-up ratio,
put the number on the finding so a reader can weigh it, and never refuse a pair on it. That is
risk-free and keeps the field from being declared-and-unwritten forever. If a gate is ever wanted,
it needs a repeated-content exemption derived from the step-3 corpus, not a tuned constant.

---

## Standing notes

- Every claim of progress is a number from `findings.json` or the step-2 table. No eyeballing two
  screenshots — that rule is in `docs/method.md` and this plan is not an exception to it.
- Three diagnoses were wrong before the real one this session (fixture data; a `cacheComponents`
  Suspense theory; "same text ⇒ trustworthy pair"). Each survived a plausible argument and died on a
  measurement. Probe before believing, including this plan.
- `/root/refdiff` is a clean git repo. No commits without Mato asking.
