/**
 * Element matching — the GVT geometric assignment (pure).
 *
 * Nearest-neighbor on γ = |Δx| + |Δy| + |Δw| + |Δh| over the normalized
 * CSS-px boxes, assigned greedily from the globally smallest γ up.
 * Unmatched design elements become missing-element findings; unmatched impl
 * elements become extra-element findings (done in checks.ts).
 */

import type { ElementMatch, MatchResult, VetoedPairing } from "../pipeline.js"
import type { DistantPairing, ElementNode, MatchingStats } from "../types.js"

import { normalizeForMatching } from "./text.js"

/**
 * The matcher's own report on what it did — pure projection of a `MatchResult`.
 *
 * It lives here, beside `matchElements`, because it is a claim ABOUT this
 * function: when the matcher learns to refuse more pairs (plan steps 3–5) the
 * thing that says whether it got more precise or merely quieter is this row,
 * not the finding count. Derived, never stored twice: the leaf totals are
 * `matched + designOnly` / `matched + implOnly`, because every leaf offered is
 * either paired or on one of those two lists.
 */
export function matchingStats(result: MatchResult): MatchingStats {
  const by = (v: ElementMatch["via"]): number => result.matches.filter((m) => m.via === v).length
  return {
    designLeaves: result.matches.length + result.designOnly.length,
    implLeaves: result.matches.length + result.implOnly.length,
    matched: result.matches.length,
    matchedVia: { text: by("text"), slot: by("slot"), geometry: by("geometry") },
    designOnly: result.designOnly.length,
    implOnly: result.implOnly.length,
    vetoed: result.vetoed?.length ?? 0,
  }
}

/**
 * The distance beyond which the matcher itself stops trusting a shared string.
 * ONE definition, used twice: it is `textMaxGamma`'s default — pass 1b's bound
 * on pairing a NON-unique text — and it is the line `distantPairings` reports
 * against. Pass 1 exempts itself from it, because a text unique on each side
 * "IS the same semantic element, wherever it moved"; the report exists because
 * that exemption is sometimes wrong and nothing measured says when.
 */
export const textEvidenceGamma = (maxGamma: number = DEFAULT_MAX_GAMMA): number => 2 * maxGamma

/**
 * The pairings the matcher formed ACROSS `minGamma` — a report, never a gate
 * (pure, γ descending).
 *
 * The canonical witness of `docs/plan-divergent-matching.md` is six confident
 * findings about a comp date label and an impl filter chip, and its tell —
 * `text-content` — is the LAST one a reader reaches. Its worse twin has no tell
 * at all: a filter chip `"Vybavené"` paired with a thread badge `"Vybavené"`
 * 415 px left and 636 px down, `via: "text"`, `unverified: false`, because the
 * strings are identical and a text pair is exempt from the confidence gate by
 * design. Every fact a reader needs was already in the report — `via` and
 * `gamma` ride on all six findings — and nothing pointed at them.
 *
 * So this is the pointing, and it is deliberately NOT a flag on the findings.
 * Measured over the 52-pair corpus (`docs/r3-sweep-2026-09-16.md`): of 79 text
 * pairings beyond this line, **74 were CORRECT** — a relocated CTA, a
 * right-aligned author label the implementation left-aligns, a library row
 * higher up a shorter list. Their colour and typography findings are real
 * drift. Marking them `unverified` would tell a reader to discount 74 true
 * findings to cast doubt on 5, and no feature tested separates the two groups
 * (distance, axis and containment are all refuted in that document). A list to
 * CHECK is the honest instrument; a verdict on each row is not available.
 */
export function distantPairings(
  matches: readonly ElementMatch[],
  minGamma: number,
): DistantPairing[] {
  return matches
    .filter((m) => m.gamma >= minGamma)
    .sort((a, b) => b.gamma - a.gamma)
    .map((m) => ({
      via: m.via,
      gamma: Math.round(m.gamma * 10) / 10,
      ...(m.design.text !== undefined ? { designText: m.design.text } : {}),
      ...(m.impl.text !== undefined ? { implText: m.impl.text } : {}),
      designBox: m.design.box,
      implBox: m.impl.box,
    }))
}

export interface MatchOptions {
  /**
   * Max γ (CSS px) for a credible match. Above it, elements are reported
   * missing/extra rather than force-paired with an absurd partner.
   */
  maxGamma?: number
  /**
   * Max γ for pairing two elements that share a NON-unique text (pass 1b)
   * before any mixed-text candidate is considered. Wider than `maxGamma`
   * because a shared text is evidence geometry is not: a chip row shifted
   * 78 px by a missing sibling is still the same chips. Default 2 × maxGamma.
   * Bounded so a `5` badge never pairs with a `5` chip three rows away.
   */
  textMaxGamma?: number
  /**
   * Max width-blind distance (|Δx|+|Δy|+|Δh|) for the slot pass that pairs
   * leftover TEXT elements sharing an anchor and line height but not a
   * width — value slots rendering different data (a block-width cell vs a
   * shrink-wrapped one). 0 disables the pass.
   */
  slotMaxGamma?: number
  /**
   * Max ratio between the two boxes' AREAS for a slot pair. 0 disables it.
   * See `DEFAULT_SLOT_MAX_AREA_RATIO`.
   */
  slotMaxAreaRatio?: number
  /**
   * Min γ at which the unrelated-text veto applies (see
   * `unrelatedPairing`). 0 disables the veto.
   */
  unrelatedMinGamma?: number
}

export const DEFAULT_MAX_GAMMA = 100
export const DEFAULT_SLOT_MAX_GAMMA = 40
/**
 * A slot may STRETCH — that is the pass's whole premise — but it is still the
 * same slot, not a thirtyfold different thing. `slotGamma` drops the width
 * term so a shrink-wrapped cell still pairs with a column-wide one; until
 * 2026-09-16 it dropped it without a bound, so a 13×13 avatar badge claimed a
 * 380×19 page subtitle 16 px away and six confident findings followed.
 *
 * 5 is read off the corpus, not chosen: `docs/r3-sweep-2026-09-16.md` labels
 * every slot pair above ratio 4 across all 52 recorded pairs, and the
 * populations sit at 4.3 (the only CORRECT one — a page H1 whose copy got
 * shorter, `Doklady — Kaviareň Prameň` against `Doklady`) and 5.5 upwards
 * (twelve mis-pairings, running to 79.9). 5 is the gap between them.
 *
 * They are NOT cleanly separable and the ceiling does not pretend to be a
 * classifier: one labelled mis-pairing sits at 4.2, below the floor, and the
 * complement audit in that document found 22 of the 43 slot pairs the ceiling
 * KEEPS carry token-disjoint texts. This buys the far tail, where the evidence
 * is unambiguous; the rest of the slot family is open (`docs/handoff`).
 */
export const DEFAULT_SLOT_MAX_AREA_RATIO = 5
/**
 * Below this γ a differing-text pair is trusted as a VALUE SLOT — the same
 * element showing other data (a zoom pill reading 146% against 100%, a count
 * reading 3 against 4). The unrelated-text veto only applies above it.
 */
export const DEFAULT_UNRELATED_MIN_GAMMA = 20

export function gamma(a: ElementNode, b: ElementNode): number {
  return (
    Math.abs(a.box.x - b.box.x) +
    Math.abs(a.box.y - b.box.y) +
    Math.abs(a.box.w - b.box.w) +
    Math.abs(a.box.h - b.box.h)
  )
}

/** Width-blind distance: same left/top anchor and same line height. */
export function slotGamma(a: ElementNode, b: ElementNode): number {
  return Math.abs(a.box.x - b.box.x) + Math.abs(a.box.y - b.box.y) + Math.abs(a.box.h - b.box.h)
}

/**
 * How many times bigger the larger box is — the term `slotGamma` drops, as a
 * ratio. Both dimensions floor at 1 px so a zero-height leaf cannot divide.
 */
export function areaRatio(a: ElementNode, b: ElementNode): number {
  const x = Math.max(1, a.box.w) * Math.max(1, a.box.h)
  const y = Math.max(1, b.box.w) * Math.max(1, b.box.h)
  return Math.max(x, y) / Math.min(x, y)
}

const normText = (t: string | undefined): string | undefined =>
  t === undefined ? undefined : normalizeForMatching(t)

const tokenSet = (t: string): Set<string> =>
  new Set(t.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length > 0))
const disjoint = (a: Set<string>, b: Set<string>): boolean => [...a].every((x) => !b.has(x))

/**
 * Is this candidate pair PROVABLY wrong? Geometry alone will pair a rail badge
 * "6" with a prop-line "element" 89 γ away when a list is in a different order
 * on the two sides, and then report position, colour, typography, radius and
 * text-content about two unrelated elements — five findings, all noise, and one
 * of them cried REGRESSION on the next run. The veto needs POSITIVE evidence
 * that the pairing is wrong, not merely that the texts differ:
 *
 *  - both sides carry text, and their token sets share nothing (no content
 *    evidence for the pair — `Blok · 12. 7.` vs `Doklad · 12. 7.` still pairs);
 *  - the distance is at least `minGamma`, so a value slot in (nearly) the same
 *    place is never touched (measured: 146% vs 100% at γ 0.5, a card count at
 *    γ 0, the Library's status chips at γ ≤ 19 — all kept). Each pass passes
 *    its OWN distance: γ in pass 2, the position-only `slotGamma` in pass 3,
 *    whose full γ is dominated by the width difference it exists to forgive;
 *  - and EACH text occurs somewhere on the other side. That is the proof: both
 *    elements have a same-text counterpart available, so this pair is not it.
 *
 * The pair then falls through to missing-element + extra-element, which is what
 * a different list order actually is. Scoped to pass 2 on purpose: pass 1/1b
 * pair identical text, and pass 3 exists precisely to pair a value slot whose
 * text differs.
 */
export function unrelatedPairing(
  design: ElementNode,
  impl: ElementNode,
  g: number,
  designTexts: ReadonlySet<string>,
  implTexts: ReadonlySet<string>,
  minGamma = DEFAULT_UNRELATED_MIN_GAMMA,
): boolean {
  if (minGamma <= 0 || g < minGamma) return false
  const dt = normText(design.text)
  const it = normText(impl.text)
  if (dt === undefined || it === undefined || dt.length === 0 || it.length === 0) return false
  if (!disjoint(tokenSet(dt), tokenSet(it))) return false
  return implTexts.has(dt) && designTexts.has(it)
}

/** Every normalized, non-empty text on one side — the veto's evidence set. */
function textSet(elements: readonly ElementNode[]): Set<string> {
  const out = new Set<string>()
  for (const e of elements) {
    const t = normText(e.text)
    if (t !== undefined && t.length > 0) out.add(t)
  }
  return out
}

/** Indices of elements whose normalized text appears exactly once. */
function uniqueTextIndices(elements: readonly ElementNode[]): Map<string, number> {
  const counts = new Map<string, number[]>()
  for (let i = 0; i < elements.length; i++) {
    const key = normText(elements[i]!.text)
    if (key === undefined || key.length < 3) continue
    const bucket = counts.get(key)
    if (bucket) bucket.push(i)
    else counts.set(key, [i])
  }
  const unique = new Map<string, number>()
  for (const [key, idxs] of counts) if (idxs.length === 1) unique.set(key, idxs[0]!)
  return unique
}

export function matchElements(
  design: readonly ElementNode[],
  impl: readonly ElementNode[],
  {
    maxGamma = DEFAULT_MAX_GAMMA,
    textMaxGamma = textEvidenceGamma(maxGamma),
    slotMaxGamma = DEFAULT_SLOT_MAX_GAMMA,
    slotMaxAreaRatio = DEFAULT_SLOT_MAX_AREA_RATIO,
    unrelatedMinGamma = DEFAULT_UNRELATED_MIN_GAMMA,
  }: MatchOptions = {},
): MatchResult {
  const designTaken = new Set<number>()
  const implTaken = new Set<number>()
  const matches: ElementMatch[] = []
  // The veto's evidence: every text each side carries, computed once.
  const designTexts = textSet(design)
  const implTexts = textSet(impl)
  const vetoed: VetoedPairing[] = []

  // Pass 1 — content identity: an element whose text appears exactly once
  // on each side IS the same semantic element, wherever it moved
  // (Design2Code matches text blocks by content, then scores geometry).
  // Its displacement then becomes a position finding, not missing+extra.
  const designUnique = uniqueTextIndices(design)
  const implUnique = uniqueTextIndices(impl)
  for (const [key, di] of designUnique) {
    const ii = implUnique.get(key)
    if (ii === undefined) continue
    designTaken.add(di)
    implTaken.add(ii)
    matches.push({
      design: design[di]!,
      impl: impl[ii]!,
      gamma: gamma(design[di]!, impl[ii]!),
      via: "text",
    })
  }

  // Pass 1b — same text, several times: "Figma" on ten cards is not unique,
  // but a design "Claude Design" still belongs with an impl "Claude Design",
  // not with the impl "Figma" that happens to be 11 px nearer after a missing
  // chip shifted the whole row (the Library's `Pending` chip: one cause read
  // as six findings when the nearest box won). Among candidates sharing a
  // normalized text, assign greedily by γ within `textMaxGamma` BEFORE any
  // mixed-text candidate; what the band rejects falls through to pass 2.
  interface TextCandidate {
    di: number
    ii: number
    gamma: number
  }
  const implByText = new Map<string, number[]>()
  for (let ii = 0; ii < impl.length; ii++) {
    if (implTaken.has(ii)) continue
    const key = normText(impl[ii]!.text)
    if (key === undefined || key.length === 0) continue
    implByText.set(key, [...(implByText.get(key) ?? []), ii])
  }
  const sameText: TextCandidate[] = []
  for (let di = 0; di < design.length; di++) {
    if (designTaken.has(di)) continue
    const key = normText(design[di]!.text)
    if (key === undefined) continue
    for (const ii of implByText.get(key) ?? []) {
      const g = gamma(design[di]!, impl[ii]!)
      if (g <= textMaxGamma) sameText.push({ di, ii, gamma: g })
    }
  }
  sameText.sort((a, b) => a.gamma - b.gamma)
  for (const c of sameText) {
    if (designTaken.has(c.di) || implTaken.has(c.ii)) continue
    designTaken.add(c.di)
    implTaken.add(c.ii)
    matches.push({ design: design[c.di]!, impl: impl[c.ii]!, gamma: c.gamma, via: "text" })
  }

  // Pass 2 — GVT geometric assignment for everything else: greedy from the
  // globally smallest γ, matching-text ties first.
  interface Candidate {
    di: number
    ii: number
    gamma: number
    /** 0 when both carry the same text — used only to break γ ties. */
    textTie: number
  }

  const candidates: Candidate[] = []
  for (let di = 0; di < design.length; di++) {
    if (designTaken.has(di)) continue
    const d = design[di]!
    for (let ii = 0; ii < impl.length; ii++) {
      if (implTaken.has(ii)) continue
      const i = impl[ii]!
      const g = gamma(d, i)
      if (g > maxGamma) continue
      // Provably the wrong partner: leave both to be reported missing/extra.
      if (unrelatedPairing(d, i, g, designTexts, implTexts, unrelatedMinGamma)) {
        vetoed.push({ designText: d.text ?? "", implText: i.text ?? "", gamma: g })
        continue
      }
      const dt = normText(d.text)
      const it = normText(i.text)
      candidates.push({
        di,
        ii,
        gamma: g,
        textTie: dt !== undefined && dt === it ? 0 : 1,
      })
    }
  }

  candidates.sort((a, b) => a.gamma - b.gamma || a.textTie - b.textTie)

  for (const c of candidates) {
    if (designTaken.has(c.di) || implTaken.has(c.ii)) continue
    designTaken.add(c.di)
    implTaken.add(c.ii)
    matches.push({ design: design[c.di]!, impl: impl[c.ii]!, gamma: c.gamma, via: "geometry" })
  }

  // Pass 3 — slot pairing for leftover text: a design value cell that
  // shrink-wraps "Alza.sk s.r.o." and an impl cell that stretches to its
  // column with "Slovak Telekom" share an anchor and a line height but not
  // a width, so γ rejects them. They are the same slot showing different
  // data — pair them (width-blind) so the data-slot policy can classify
  // the text difference instead of reporting missing + extra.
  if (slotMaxGamma > 0) {
    interface SlotCandidate {
      di: number
      ii: number
      dist: number
    }
    const slots: SlotCandidate[] = []
    for (let di = 0; di < design.length; di++) {
      if (designTaken.has(di) || design[di]!.text === undefined) continue
      for (let ii = 0; ii < impl.length; ii++) {
        if (implTaken.has(ii) || impl[ii]!.text === undefined) continue
        const dist = slotGamma(design[di]!, impl[ii]!)
        if (dist > slotMaxGamma) continue
        // The bound the width-blindness lacked. Reported like the veto rather
        // than dropped silently: a refusal a reader cannot see is the same
        // defect as a suppression they cannot see.
        if (slotMaxAreaRatio > 0 && areaRatio(design[di]!, impl[ii]!) > slotMaxAreaRatio) {
          vetoed.push({
            designText: design[di]!.text ?? "",
            implText: impl[ii]!.text ?? "",
            gamma: dist,
          })
          continue
        }
        // The veto again, or pass 3 would re-create what pass 2 refused — but
        // measured by THIS pass's distance. A slot pair's full γ is dominated by
        // the width difference it exists to forgive (a shrink-wrapped cell
        // against a column-wide one is 130 γ apart and still the same slot),
        // while its anchor is by construction within slotMaxGamma. So the
        // position-only distance is what says "same slot" here, exactly as γ
        // says "same place" in pass 2.
        if (
          unrelatedPairing(design[di]!, impl[ii]!, dist, designTexts, implTexts, unrelatedMinGamma)
        ) {
          vetoed.push({
            designText: design[di]!.text ?? "",
            implText: impl[ii]!.text ?? "",
            gamma: dist,
          })
          continue
        }
        slots.push({ di, ii, dist })
      }
    }
    slots.sort((a, b) => a.dist - b.dist)
    for (const c of slots) {
      if (designTaken.has(c.di) || implTaken.has(c.ii)) continue
      designTaken.add(c.di)
      implTaken.add(c.ii)
      matches.push({
        design: design[c.di]!,
        impl: impl[c.ii]!,
        gamma: gamma(design[c.di]!, impl[c.ii]!),
        via: "slot",
      })
    }
  }

  const designOnly = design.filter((_, i) => !designTaken.has(i))
  const implOnly = impl.filter((_, i) => !implTaken.has(i))
  // Only the vetoes with a VISIBLE consequence are reported. The veto works on
  // CANDIDATES, so the greedy assignment can still give both elements their
  // right partners afterwards — that is the point of vetoing early rather than
  // dissolving a winner — and a refused candidate that would have lost anyway
  // changed nothing. Measured: the Library pairs refuse two candidates and
  // their outcome is byte-identical, so a raw count would have read "2 vetoed"
  // beside "+0 / −0" and meant nothing.
  const unmatchedText = (side: readonly ElementNode[]): Set<string> => {
    const out = new Set<string>()
    for (const e of side) {
      const t = normText(e.text)
      if (t !== undefined && t.length > 0) out.add(t)
    }
    return out
  }
  const dLeft = unmatchedText(designOnly)
  const iLeft = unmatchedText(implOnly)
  const consequential = vetoed.filter(
    (v) =>
      dLeft.has(normalizeForMatching(v.designText)) && iLeft.has(normalizeForMatching(v.implText)),
  )
  return {
    matches,
    designOnly,
    implOnly,
    ...(consequential.length > 0 ? { vetoed: consequential } : {}),
  }
}
