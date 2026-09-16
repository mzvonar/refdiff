/**
 * Which PHASE a pair is in — `reconcile` or `polish` (pure).
 *
 * refdiff exists because a model cannot see a 2 px offset or a ΔE 3 colour delta. That is
 * the POLISH loop, and it is only meaningful once the two surfaces already correspond.
 * When they do NOT — the comp draws a thread rail with relative dates, the implementation
 * renders absolute dates and a filter chip row — the hard problem is not invisible to a
 * model, and 200 element-wise findings about it are noise wearing the costume of
 * precision. That is RECONCILE: read both sides, reconcile the structure, and come back.
 * See `docs/plan-divergent-matching.md`, THE REFRAME.
 *
 * **This label is REPORTED, never enforced.** Nothing downstream reads it; every finding
 * is emitted on a `reconcile` pair exactly as on a `polish` one. A phase that silently
 * withheld findings would be the bug this whole plan is about, one level up — and the
 * corpus already holds the pair that would trip a gate: `today-owner-desktop` scores
 * alignment confidence 0.50, over any sane floor, at a match rate of 0.31.
 *
 * ## Why these two signals, measured on the 52-pair step-3 corpus
 *
 * The plan proposed three signals and two candidate rules. Neither survived contact with
 * the corpus intact; what follows is what the numbers actually say.
 *
 * **`matchRate` — do the two sides contain the same things.** The load-bearing one, and
 * the best single predictor of whether the matcher's pairings are junk (Spearman −0.71
 * against the rate of token-DISJOINT geometric text pairings, the witness's own tell).
 *
 * **`axisConfidence` = `max(confidenceX, confidenceY)`, NOT the joint `confidence`.** This
 * is the correction the derivation forced, and `tx-picker-owner-mobile` is why. It scores
 * joint confidence 0.00 while matching 91% of its leaves, and the plan asked whether the
 * fitter was failing on something the matcher does not need. Measured: 17 anchors, 14 of
 * them agreeing on X, 1 on Y, and ZERO on both — so the joint score, which counts an
 * anchor only when BOTH axes land it, is 0.00 by construction while the X axis fits
 * nearly perfectly. `Alignment.confidenceX`'s own doc comment already said this collapse
 * happens and that the joint score is right for the PIXEL gate, because diffing pixels
 * needs both axes. A phase is not a pixel diff: a surface that lines up horizontally and
 * packs differently down the page still corresponds, and its element-wise findings still
 * mean something. Gating the phase on the joint score imports a requirement from a
 * different question.
 *
 * (Compounding it there, and worth knowing before trusting a 0.00: that pair's Y fit also
 * BAILED OUT, at a median |residual| of 12.10 px against `AXIS_RESIDUAL_MAX` = 12 — a
 * 0.8% miss that throws away a fit worth 8 of 17 anchors and substitutes the identity,
 * taking `confidenceY` from 0.47 to 0.06. The underlying vertical relation really is
 * non-affine, so the pair would not have cleared 0.5 either way; but the exact value 0.00
 * is a threshold cliff, not a measurement.)
 *
 * **`textShare` is carried and does NOT gate.** The `joint-or-share` candidate used
 * `share >= 0.35` as an escape hatch, and it reaches the right verdict on all six disputed
 * pairs — for the wrong reason. Share is the WEAKEST of the signals against the junk-
 * pairing rate (Spearman −0.44), and its 0.35 threshold separates nothing: median junk is
 * 0.310 for pairs just below it and 0.313 for pairs just above. It is reported because a
 * reader weighing a `reconcile` verdict wants to know whether correspondence was proven or
 * assumed, which is a real question — it is simply not the one that decides the phase.
 *
 * ## What the corpus says about the rule that ships
 *
 * Three nested candidates — named for the confidence each READS, because that is the only
 * thing they disagree about, and deliberately not lettered: the phases themselves were
 * once called A and B, and a "rule B" beside a "phase B" meaning something unrelated is
 * exactly the kind of collision this file exists to argue against. Scored by how well each
 * separates pairs whose geometric pairings are junk from pairs whose are not (polish sets
 * nest: `joint-only` ⊂ `joint-or-share` ⊂ `best-axis`):
 *
 * | rule | polish | median junk, polish | median junk, reconcile | separation |
 * | --- | --- | --- | --- | --- |
 * | `joint-only`     `conf >= .5 && rate >= .7`                     | 18 | 0.136 | 0.323 | 0.186 |
 * | `joint-or-share` `rate >= .7 && (conf >= .5 \|\| share >= .35)` | 24 | 0.143 | 0.429 | 0.286 |
 * | `best-axis`      `rate >= .7 && max(cX, cY) >= .5`              | 28 | 0.146 | 0.462 | 0.315 |
 *
 * `best-axis` is this module. It is strictly more inclusive AND separates strictly better,
 * at essentially unchanged quality inside the polish set — and all three agree on the four
 * cases the plan named (`today-owner-desktop` and `messages-owner-desktop` reconcile, the
 * witness `messages-accountant-desktop` reconcile, `refdiff-library-groups-mobile`
 * polish). It also splits the fewest RESPONSIVE TWINS on the transform alone: a desktop
 * and mobile capture of one surface whose `matchRate` and `textShare` agree to within 0.10
 * are the same surface corresponding equally well, so a rule that puts them in different
 * phases is letting the transform overrule the content. `joint-only` splits 3 such twins,
 * `joint-or-share` 2, `best-axis` 1 — and `joint-only`'s extra casualty is
 * `tx-picker-owner`, whose two captures agree at rate 0.92/0.91 and share 0.38/0.38 and
 * land on opposite sides of the joint-confidence floor at 0.52 and 0.00.
 *
 * **Honest limits of that derivation, both of which belong in the next reader's hands.**
 * The junk-pairing rate is a PROXY: a token-disjoint text pairing can be a legitimate value
 * slot showing different data ("Alza.sk s.r.o." against "Slovak Telekom" share no tokens
 * and are the same cell), so it over-counts on data-heavy surfaces and is only trustworthy
 * as an ordering. And `MIN_AXIS_CONFIDENCE` currently excludes NOTHING that
 * `MIN_MATCH_RATE` did not already exclude — every pair on this corpus at rate ≥ 0.70 also
 * clears 0.50 on its better axis. It is kept, rather than collapsing the rule to one
 * number, because the nearest pair sits EXACTLY on the floor
 * (`client-pending-accountant-mobile`, 0.50) and because the clause is independently live
 * below the rate floor, where 13 of 24 pairs clear it. The first pair that fires it is the
 * one proving match rate alone is not enough; until then, treat "no single number detects
 * the phase" as a claim this corpus does not yet demonstrate.
 */

import type { Alignment, MatchingStats, PairPhase, PhaseName } from "../types.js"

/**
 * Below this the two sides do not contain the same things, whatever the transform says.
 * Derived from the corpus, not one pair: `today-owner-desktop` (rate 0.31) and the witness
 * `messages-accountant-desktop` (0.53) sit well under it, `refdiff-library-groups-mobile`
 * (0.78) well over.
 */
export const MIN_MATCH_RATE = 0.7

/**
 * Floor on the BETTER-FITTING AXIS. Deliberately the same 0.5 as
 * `DEFAULT_MIN_ALIGNMENT_CONFIDENCE` and the pixel gate — one number a reader has to hold,
 * applied to a different statistic for the reason argued at the top of this file.
 */
export const MIN_AXIS_CONFIDENCE = 0.5

const pct = (n: number): string => `${Math.round(n * 100)}%`

/**
 * The three signals plus the verdict. `matching` is required: a report with no
 * `MatchingStats` predates the matcher reporting itself, and "not recorded" must not be
 * read as "matched nothing" — callers holding such a report leave `phase` absent instead.
 */
export function pairPhase(alignment: Alignment, matching: MatchingStats): PairPhase {
  const denominator = Math.min(matching.designLeaves, matching.implLeaves)
  const matchRate = denominator > 0 ? matching.matched / denominator : 0
  const textShare = matching.matched > 0 ? matching.matchedVia.text / matching.matched : 0
  // confidenceX/Y are optional on `Alignment` (older reports predate them). The joint
  // score is a lower bound on both, so falling back to it can only be conservative.
  const axisConfidence = Math.max(
    alignment.confidenceX ?? alignment.confidence,
    alignment.confidenceY ?? alignment.confidence,
  )

  const rateOk = matchRate >= MIN_MATCH_RATE
  const axisOk = axisConfidence >= MIN_AXIS_CONFIDENCE
  const phase: PhaseName = rateOk && axisOk ? "polish" : "reconcile"

  const reason =
    phase === "polish"
      ? `the two sides correspond: ${matching.matched} of ${denominator} leaves matched (${pct(matchRate)}), best axis fits ${axisConfidence.toFixed(2)} — element-wise findings are worth reading`
      : !rateOk
        ? `these two surfaces do not correspond well enough for element-wise findings; reconcile structure first — only ${matching.matched} of ${denominator} leaves matched (${pct(matchRate)}, floor ${MIN_MATCH_RATE}), ${matching.designOnly} design-only and ${matching.implOnly} impl-only`
        : `these two surfaces do not correspond well enough for element-wise findings; reconcile structure first — ${pct(matchRate)} of leaves matched but NEITHER axis fits (best ${axisConfidence.toFixed(2)}, floor ${MIN_AXIS_CONFIDENCE}), so the positions behind every geometric pairing are guesses`

  return { phase, matchRate, textShare, axisConfidence, reason }
}
