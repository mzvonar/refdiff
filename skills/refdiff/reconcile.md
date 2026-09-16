# The RECONCILE workflow — two surfaces that do not correspond yet

> **PROVISIONAL — this is a hypothesis, not a method with a track record.** It was WRITTEN
> against two pairs (§R7) and has been RUN end to end against **none**. Every step names the
> failure it is there to prevent, and the numbers in it come from the 52-pair corpus behind
> `docs/plan-divergent-matching.md`; the ones that are guesses are labelled **(unmeasured)**.
> **Revise it after each real use, and name the pair that forced the revision** in §R7 — the
> same anchor discipline as the rest of this repo. A step nobody has run is worth less than
> the one pair that breaks it.

You are here because `report.phase` says `reconcile`: the two sides do not contain the same
things, so the element-wise findings are mostly describing two structures being forced onto
each other. `SKILL.md` §1a-0 is the read that sent you; this file is what to do about it.

**The division of labour, which decides everything below.** refdiff exists because a model
cannot see a 2 px offset or a ΔE 3 colour delta. Divergence is the opposite problem: *"the comp
draws a thread rail with relative dates, the implementation renders absolute dates and a filter
chip row"* is not invisible to a model — it needs structural JUDGEMENT, and no measurement
supplies one. So **the judgement here is yours and the tool's job is to hand you measured
facts.** Nothing in this file is a gate, an auto-fix, or a reason a finding stops being emitted.

**The one rule that carries over from polish, and it is binding: reading forms a HYPOTHESIS;
the measurement ADJUDICATES it.** Polish's ban on reading the comp is scoped to polish, where
the findings already are the specification. Here reading is step one — the failure it was
written against was never opening the file, it was opening the file and calling the answer
settled.

---

## R1. READ both sides, for INTENT

Read three things, in this order: the comp source (`.dc.html` frame, or the Figma frame), then
`design.png`, then `impl.png` — the run dir holds both screenshots.

Produce a written account of **what each surface IS, region by region**, and **which region of
the comp corresponds to which region of the implementation**. Name the correspondences and name
the regions that exist on one side only. That account is the hypothesis; R2 adjudicates it.

**The failure this prevents:** working a divergent pair down a severity-sorted finding list.
The canonical witness emits six confident findings — position, colour, border, radius,
typography, then text-content LAST — about a comp date label `Včera` and an impl filter chip
`Otázky · 1` that have nothing to do with each other. Five of the six read as actionable drift.
No amount of reading findings in order recovers from that; reading the two surfaces does.

**This step is measured, and it is why it is step one.** A fresh-context model given ONLY the
comp, both screenshots and the 101 raw `missing-element` / `extra-element` findings — and
deliberately not told to enumerate — placed **57 of 59** texted unmatched elements, named 29 of
42 textless ones by exact coordinate, got **4 of 4** structural correspondences right, and made
**0** claims the artifacts contradict.

**And reading misses things SILENTLY — which is why R2 follows it.** What that account missed
was the fourth thread's title: `"SumUp poplatky — jún"` in the comp against `"SumUp Payments —
chýba doklad"` in the implementation. It caught the fixture divergence in general, naming ~20
findings as seed data, and never remarked on this one.

**But do not read R2 as the instrument that catches it — measured, it does not.** Both halves
are in the unmatched list and the map places both: `f24` in the comp's thread row at
(282, 363), `f81` in the implementation's at (286, 665). They land in DIFFERENT rows, so
nothing connects them and nothing says they are one thread with two titles. **The one thing the
reading missed is a thing the map does not measure either.** That is the honest limit of both
instruments, and it is what R4 is for: a one-sided element inside a correspondence both sides
have is a candidate for "built differently", not for "missing feature", and only your reading
can tell which.

## R2. Then read the MAP — it is the checklist against what you just read

`report.unmatched` is the measured half: the elements only one side has, **placed, in two
groupings — one per side.** The comp's unmatched elements in the COMP's own containers, the
implementation's in the IMPLEMENTATION's. It is printed in the run headline and written to
`findings.json`. The witness's, in full:

```
PHASE: reconcile — these two surfaces do not correspond well enough for element-wise findings;
  reconcile structure first — only 42 of 80 leaves matched (53%, floor 0.7), 38 design-only and 64 impl-only
  signals: match rate 0.53 · best axis 0.50 (joint 0.07) · text share 0.45
  pairings: of 42, 19 are text-proven and 22 rest on position alone
  38 design element(s) with no counterpart, in the comp's own containers (37 listed below, 1 under the reporting floor):
      10 in surface at (-9, 1) 253×760
      10 in surface at (272, 127) 890×608
       3 in surface at (282, 136) 330×83
       3 in surface at (622, 667) 539×67
       2 in surface at (282, 221) 330×80
       2 in surface at (282, 363) 330×80
       7 in no container of that side — this map does not place them
  64 impl element(s) the design does not have, in the implementation's containers (all 64 listed below):
      15 in surface at (0, 0) 240×900
       7 in surface at (0, 824) 239×77
       ...
      23 in no container of that side — this map does not place them
```

**Where to start when 291 elements are unmatched: at the biggest GROUP, not the first finding.**
A group is usually ONE decision — a whole region the other side does not have — not N decisions.
The witness's two ten-element groups are two questions ("what is the comp's left rail for, and
where did it go?"), and answering them accounts for 20 of the 37 listed elements. Work the
groups largest first, on the side with more unmatched elements, and check each one against the
correspondence you wrote in R1.

**Do NOT use `report.byRegion` for this.** It is the right instrument for findings about a PAIR
and structurally wrong here: it draws every container from the IMPL tree, and a `reconcile` pair
is by definition one whose layouts disagree, so a comp element falls in the gap between impl
containers exactly where the comp draws something the implementation has nothing for. Measured
over the 24 `reconcile` pairs: impl containers place **251 of 1200** unmatched comp elements,
each side's own place **697**.

**Read the map's own MISS RATE, which it prints.** `N in no container of that side — this map
does not place them` is the map saying it placed none of those N. A short list of groups is not
a short problem: the witness's design side is 30 placed and 7 unplaced, its impl side 41 and 23.

**A pair where the map places nothing is read differently, and that is a mode, not a failure.**
`refdiff-library-groups-desktop` places **22 of 290 and 0 of 106** — a flat page of same-size
cards has no container between the 64 px floor and the frame-share ceiling for the map to use.
There, grouping is unavailable: fall back to the flat `missing-element` / `extra-element`
findings ordered by position (`elements.json` carries every box in world space) and to the
reading from R1, which is all you have. The miss rate is what tells you which mode you are in —
read it before you read the groups.

**Reconcile the two POPULATIONS before you believe either.** The headline prints both:
`38 design element(s) … (37 listed below, 1 under the reporting floor)`. The first number is
what the MATCHER left unpaired (`matching.designOnly`); the second is what this run LISTS. The
gap is elements under the 4 px reporting floor plus whatever the ignore policy suppressed, and
`UnmatchedSide` carries all three (`elements === reported + suppressed + belowFloor`). The gap
is not rare — the two differ on **24 of 52** corpus pairs, worst `refdiff-compare-desktop` at 84
unmatched against 22 listed, all of it policy. A region that looks accounted for because
nothing lists it may simply be suppressed.

## R3. Audit the COMPLEMENT — absence from the list is not evidence of presence

Take each region your R1 reading says exists on ONE side only, and check it against the
unmatched list. **An element you expected to be missing and that the list does not name has been
CLAIMED by something — and nothing tells you what.** Find the claimant before you conclude the
implementation has it.

**The failure this prevents is the worst mis-pairing in the corpus, and it survived four
sessions of reading the findings the report emits.** The comp draws four filter chips —
`Všetky`, `Žiadosti`, `Otázky`, `Vybavené`, all at y 92 — and the implementation draws three
(`Všetky · 4`, `Žiadosti · 2`, `Otázky · 1`, at y 235.5). The comp's fourth chip is therefore
missing, and it is **not in the unmatched list**: it was paired with the implementation's thread
badge `"Vybavené"` at (351, 728.5) — **415 px left and 636.5 px down, γ 1062.6** — which yields
six confident findings about two unrelated elements. Unlike the `Včera` witness it has **no tell
at all**: the strings are identical, so there is no `text-content` finding to reach, and all six
read `via: "text"`, `unverified: false`.

**So a `via: "text"` pairing is not a safe harbour on a divergent pair.** The `unverified` gate
exempts text pairs because "both elements carry the same string and the transform played no part
in forming it" — which is precisely the case where text identity proves nothing. Pass 1 has no
γ ceiling by design (an element whose text is unique on each side "IS the same semantic element,
wherever it moved"). Read `polish.md` §1a-ii for what `via` means, and treat a long-γ text pair on
a reconcile pair as a claim to check, not a fact.

**Do NOT reach for a distance threshold — it is measured and refuted.** A corpus-wide sweep
(2026-09-16, 52 pairs, 92 labelled long-γ pairings) puts CORRECT pairs out to **γ 1261** — one CTA
the implementation relocated — and WRONG ones down to **γ 210**. The populations overlap across
the whole band, so every ceiling destroys more correct pairs than it catches. So does "it moved on
both axes", and so does containment. **Distance tells you nothing about a text pair. Look at it.**

**The two cheap checks, in order.**

1. `elements.json` holds both aligned leaf sets. Grep the string you expected to be missing on
   both sides and compare the boxes.
2. **Then LOOK at each element where it sits on its OWN side** — that is what settles it, and
   nothing shorter does. The run dir's crops cannot serve: they crop both PNGs at the SAME region,
   which is right for a finding about a pair and shows nothing when the pair is 1000 px apart.

**A long γ is not the only shape — check `via: "slot"` too.** A slot pair is width-blind by
design, so its POSITION distance is tiny by construction and a γ scan cannot see it at all; what
it may not be is the same SIZE of thing. Measured: of the 15 slot pairs in the corpus whose boxes
differ in area by more than 4×, **13 were mis-pairings** — a 13×13 avatar badge claiming a 380×19
page subtitle, a field LABEL claiming a field VALUE. The matcher now refuses above 5×, and **22 of
the 43 it keeps still carry token-disjoint texts**, so a slot pairing between two very
differently-sized boxes deserves the same suspicion as a long-γ text one.

## R4. Classify each divergence — three kinds, and one that is not a divergence at all

**Separate DATA from structure first** (`SKILL.md` rule 3). On the witness roughly 20 of the
findings are seed data: the comp's demo rows and the fixture's are different rows. Data is not a
divergence and fixing it is the cheapest thing you will do here — see R5.

Then, for each correspondence the map and the reading agree on:

| what you are holding | the tell | what to do |
| --- | --- | --- |
| **the implementation is MISSING A FEATURE** | the comp's region has no impl counterpart anywhere — not moved, not renamed, not restyled; the impl side's own unmatched list has nothing in that area that could be it, and R3's complement audit found no claimant | build it. This is product work, and it is the honest outcome of a reconcile pair — say so in the report rather than reporting parity numbers about it |
| **the same feature is BUILT DIFFERENTLY** | both sides have something in the correspondence, with different element counts, different strings, or a different leaf shape (the comp's relative date column `Včera` against the impl's absolute `14. 9.`; a design runtime that wraps every label in its own `<span>` against a `<button>Label</button>` that IS the leaf) | decide which shape is right, then act on the decision. If the implementation is right, **record it** — `refdiff accept` (`polish.md` §3a), with the measurement as the reason. Leaf-shape differences in particular are a markup match, not a border or a copy change; `polish.md` "Reading the measurements" has the shape |
| **the comp is STALE** | the comp draws a surface a rebuild replaced, so the pair measures the new implementation against the old design | **`polish.md` §3a owns this decision — do not re-decide it here.** Never write to the upstream design project on your own initiative: ASK. An edited comp agrees forever, including on the day the implementation regresses. When the comp is superseded wholesale, `disabled: "<why>"` in the manifest is the recorded answer (`configuring.md`) — the reason is required, and the frozen run dir stays readable |
| **not a divergence: a MIS-PAIRING** | six findings about two elements that are visibly not the same element; or R3 found a claimant | it is a matcher defect, not parity work. Do not fix code against it. Name it in the report with its `via` and `gamma` |

## R5. Fix the STRUCTURE, in this order

1. **Data.** Make the fixture or seed render the comp's data. Anchor supply is content, not
   code, and this is the only lever that moves BOTH phase signals without touching product
   code: `min(1, anchors/8)` caps the alignment outright, and match rate counts leaves that
   matched. Order counts too — refdiff pairs row N with row N, so a list in a different order
   reads as a finding on every pill of every row (measured on one Library page: 208 → 101
   findings and confidence 0.20 → 0.76 from the sort alone).
2. **Whole one-sided regions**, biggest map group first. One decision per group.
3. **Differently-built correspondences**, and leaf-shape ones LAST — anything that changes what
   pairs changes what every finding IS, so doing these first churns the delta under you.

**Do not write `ignore` policy on a reconcile pair.** Policy is a polish tool; a reconcile
pair's noise is structural, and suppressing it hides the thing you came to reconcile. The one
exception is `ignore.scope`, because it fixes the ALIGNMENT rather than hiding a finding:
pinning the comparison to the region that DOES correspond is a legitimate reconcile move, and
`polish.md` §1a's table prescribes it for exactly this case (both axes low, anchors ≥ 8).

## R6. Re-run, and read the PHASE — not the finding count

Re-run after each structural change. It is the adjudicator, it is cheap, and it is the only
thing that can tell you whether the hypothesis from R1 was right.

**Read `matching` and `phase`, in that order. The finding COUNT is the wrong instrument here:**
refusing a pair moves one element out of `matched` and adds one to BOTH one-sided columns, so a
matcher that got stricter and a matcher that fell apart move the finding count the same way. A
reconcile iteration is progress when **`matched` rises and both `designOnly` and `implOnly`
fall**. If `matched` drops, that is a REGRESSION unless you can argue it.

**The pair crosses into `polish` when `matchRate >= 0.70` AND `max(confidenceX, confidenceY) >=
0.50`.** `phase.reason` names which clause failed and by how much — read it rather than
recomputing: *"only 42 of 80 leaves matched (53%, floor 0.7)"* is a distance, not a verdict.
Note the floor is the BETTER-fitting axis, not the joint `alignment.confidence`: a surface that
lines up horizontally and packs differently down the page still corresponds.

**Stopping.**

- `phase: polish` → stop reconciling. Go to `polish.md` and start the bounded loop at
  iteration 0; reconcile's work does not count against its five.
- **Three consecutive structural changes that do not move `matchRate` → stop and report**
  **(unmeasured — this bound is a guess and is the first thing a real run should correct).**
  What remains is a product decision, not a parity one: report it with the measurement and the
  question, per `polish.md` §6.
- A pair whose divergence is the comp's, not the implementation's, ends in a REPORT and an ASK,
  never in a fix. That is `polish.md` §3a's standing rule and it is not softened here.

## R7. The pairs this has been run against

**Run end to end: none.** §R3 alone has been run, over the WHOLE corpus — see the row below.
Written against these two, which are the range's ends:

| pair | signals | unmatched | the map places | what it is here for |
| --- | --- | --- | --- | --- |
| `messages-accountant-desktop` (uctoinak2) | rate 0.53 · axis 0.50 (joint 0.07) · share 0.45 | 38 design-only / 64 impl-only | 30 of 37 listed in 6 comp containers; 41 of 64 in 8 impl containers | the canonical witness — both mis-pairings (`Včera` ↔ `Otázky · 1` at γ 98.7, `Vybavené` ↔ `Vybavené` at γ 1062.6) and the cheap test's 57/59 reading are measured on it |
| `refdiff-library-groups-desktop` (refdiff) | rate 0.65 · axis 0.89 (joint 0.56) · share 0.30 | 290 design-only / 106 impl-only | 22 of 290; **0 of 106** | the degenerate map — R2's second mode, where grouping is unavailable and reading is all you have |

**When you revise this file, add the pair that forced it to this table and say which step it
changed.** The two above justify the steps; they do not validate them.

**§R3 — run read-only over all 52 corpus pairs, 2026-09-16** (refdiff `docs/r3-sweep-2026-09-16.md`).
It is the only step with a track record, and it changed its own text twice:

- **What it confirmed.** The complement question works, and it scales: asked of every recorded
  pair at once it turned 7 labelled pairings into 107 and found mis-pairings on `polish` pairs at
  confidence 0.83, which four sessions of reading findings had not.
- **What it corrected in this file.** (a) The γ figures it carried (correct to 873, wrong from
  686) understated the overlap badly — it is the whole band, correct to 1261 and wrong from 210.
  (b) It said nothing about `via: "slot"`, which turned out to be the LARGER family in that band
  and the only one with a discriminator: 13 of 15 slot pairs above area ratio 4 were mis-pairings.
  (c) It implied distance and structure could settle a candidate; measured, only LOOKING does, so
  the step now says so and names why the run dir's own crops cannot be used for it.
