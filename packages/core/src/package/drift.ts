/**
 * Undo the fit and walk the residual down the page (pure) — the answer to
 * "which element is the `scaleY` about?".
 *
 * `§1a` of the skill has specified this walk step by step since 2026-08-28, and
 * it has now been hand-written as a throwaway node script at least twice: once
 * to find the Library card's `.thumb` (132 + 1 px, once per card row, absorbed
 * as `scaleY 0.9966`) and again on `messages-accountant-desktop` (2026-09-16),
 * where it was what finally named the line-height difference the alignment had
 * swallowed as `scaleY 1.10`. `byRegion` became part of the report after exactly
 * this happened twice in one session; this is the next one, and it is more
 * mechanical than that one was, because the file already states the formula.
 *
 * The reasoning it mechanises: the fit absorbs a per-repeat step better than a
 * per-element `position` finding does, so ONE box that is a pixel short in every
 * row of a grid reports as a scale and names no element at all. Undo the
 * transform and the residual is flat, then steps by the missing pixels at ONE
 * element per repeat — and that element is the fix.
 *
 * Pairing is by UNIQUE text on both sides, the same anchor rule the alignment
 * itself is fitted on: a text occurring once on each side is the same element
 * wherever it moved, and nothing else here is trustworthy enough to subtract
 * two coordinates from.
 */

import type { Alignment, ElementNode } from "../types.js"

import { normalizeForComparison } from "../structural/text.js"

/**
 * Deltas within this many px of each other are the same plateau, not a step.
 *
 * 0.5 rather than 1: the case this exists for was a box ONE pixel short per row
 * (the Library card's `.thumb`, 132 + 1 px), and a 1px tolerance swallows
 * exactly the signal. Coordinates arrive rounded to 2 decimals, so anything
 * below half a pixel is sub-pixel rendering rather than a box model difference.
 */
export const DEFAULT_STEP_TOLERANCE = 0.5

export type DriftAxis = "x" | "y"

export interface DriftRow {
  /** The shared text that paired the two elements. */
  text: string
  /** The design coordinate with the alignment undone — the comp's own space. */
  raw: number
  /** The implementation coordinate, which is already world space. */
  impl: number
  /** `impl − raw`: what the fit had to absorb for this element. */
  delta: number
}

export interface DriftStep {
  /** The first row of the new plateau — the element at or above which it changed. */
  at: DriftRow
  /** The plateau before it, and after it. */
  from: number
  to: number
  /** `to − from`, the size of the step. */
  step: number
}

export interface DriftWalk {
  axis: DriftAxis
  /** The transform that was undone, on this axis. */
  scale: number
  offset: number
  /** True when there was nothing to undo — the walk then reads raw divergence. */
  identity: boolean
  /** Every anchored pair, ordered down (or across) the implementation. */
  rows: DriftRow[]
  /** Where the residual changes plateau by more than the tolerance. */
  steps: DriftStep[]
  /**
   * Unique design texts that found no unique impl partner. A walk resting on
   * three anchors says much less than one resting on forty, and the reader
   * cannot tell from the rows alone.
   */
  unanchoredDesign: number
  unanchoredImpl: number
}

export interface DriftOptions {
  axis?: DriftAxis
  stepTolerance?: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Texts occurring EXACTLY ONCE, keyed by their normalized form. A repeated
 * label ("Figma" on ten cards) is deliberately dropped: which of the ten a
 * given one is, is precisely the question the alignment could not answer.
 */
function uniqueTexts(elements: readonly ElementNode[]): Map<string, ElementNode> {
  const seen = new Map<string, ElementNode[]>()
  for (const el of elements) {
    const t = el.text === undefined ? "" : normalizeForComparison(el.text)
    if (t === "") continue
    const bucket = seen.get(t)
    if (bucket) bucket.push(el)
    else seen.set(t, [el])
  }
  const out = new Map<string, ElementNode>()
  for (const [t, bucket] of seen) if (bucket.length === 1) out.set(t, bucket[0]!)
  return out
}

/**
 * The residual walk for one axis.
 *
 * `design` elements are expected as `elements.json` stores them — already mapped
 * into implementation world space by the alignment — which is why undoing the
 * transform is subtraction and division rather than a re-fit.
 */
export function driftWalk(
  input: { alignment: Alignment; design: readonly ElementNode[]; impl: readonly ElementNode[] },
  { axis = "y", stepTolerance = DEFAULT_STEP_TOLERANCE }: DriftOptions = {},
): DriftWalk {
  const { alignment } = input
  const scale = axis === "y" ? (alignment.scaleY ?? alignment.scale) : alignment.scale
  const offset = axis === "y" ? alignment.offsetY : alignment.offsetX

  const designByText = uniqueTexts(input.design)
  const implByText = uniqueTexts(input.impl)

  const rows: DriftRow[] = []
  let pairedDesign = 0
  for (const [text, d] of designByText) {
    const i = implByText.get(text)
    if (!i) continue
    pairedDesign++
    // A scale of 0 would be a fit that collapsed; there is no comp space to
    // map back into, so the row says nothing and is dropped rather than
    // reported as an infinity.
    if (scale === 0) continue
    const dCoord = axis === "y" ? d.box.y : d.box.x
    const iCoord = axis === "y" ? i.box.y : i.box.x
    const raw = (dCoord - offset) / scale
    rows.push({ text, raw: round2(raw), impl: round2(iCoord), delta: round2(iCoord - raw) })
  }
  rows.sort((a, b) => a.impl - b.impl || a.text.localeCompare(b.text))

  // A plateau is carried forward as the last value a step was measured FROM, so
  // a slow slide of sub-tolerance drift still eventually reports one step rather
  // than never reporting any — the Library case was 1px per row, and comparing
  // only against the immediately preceding row would have hidden every one.
  const steps: DriftStep[] = []
  let plateau = rows[0]?.delta
  for (const row of rows.slice(1)) {
    if (plateau === undefined) break
    if (Math.abs(row.delta - plateau) <= stepTolerance) continue
    steps.push({ at: row, from: plateau, to: row.delta, step: round2(row.delta - plateau) })
    plateau = row.delta
  }

  return {
    axis,
    scale,
    offset,
    identity: scale === 1 && offset === 0,
    rows,
    steps,
    unanchoredDesign: designByText.size - pairedDesign,
    unanchoredImpl: implByText.size - pairedDesign,
  }
}

const pad = (s: string, n: number): string => (s.length >= n ? s : " ".repeat(n - s.length) + s)
const fit = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1)}…`)

/** The walk as a table, the shape the hand-written scripts printed. */
export function formatDriftWalk(walk: DriftWalk, { top }: { top?: number } = {}): string {
  const axis = walk.axis
  const lines: string[] = []
  lines.push(
    `axis ${axis} — scale ${walk.scale}, offset ${walk.offset}` +
      (walk.identity ? " (the identity: nothing was absorbed, this is raw divergence)" : ""),
  )
  lines.push(
    `${walk.rows.length} anchored pairs · ${walk.unanchoredDesign} design / ${walk.unanchoredImpl} impl unique texts unmatched`,
  )
  if (walk.rows.length === 0) {
    lines.push("")
    lines.push(
      "No unique text is shared by both sides, so there is nothing to walk. That is the" +
        " same shortage that caps alignment confidence — make the fixture render the comp's data.",
    )
    return lines.join("\n")
  }

  lines.push("")
  lines.push(`${pad("raw", 9)} ${pad("impl", 9)} ${pad("delta", 8)}  text`)
  const shown = top === undefined ? walk.rows : walk.rows.slice(0, top)
  const stepAt = new Set(walk.steps.map((s) => s.at))
  for (const row of shown) {
    lines.push(
      `${pad(row.raw.toFixed(1), 9)} ${pad(row.impl.toFixed(1), 9)} ${pad(row.delta.toFixed(1), 8)}` +
        `${stepAt.has(row) ? " <" : "  "} ${fit(row.text, 56)}`,
    )
  }
  if (shown.length < walk.rows.length)
    lines.push(`… ${walk.rows.length - shown.length} more (--top to widen, --json for all)`)

  lines.push("")
  if (walk.steps.length === 0) {
    lines.push(
      "Flat: no step beyond the tolerance. The residual is uniform, so the difference is" +
        ` an OFFSET above the anchors (one box), not a repeated one — read the first ${axis} in the table.`,
    )
  } else {
    lines.push(`${walk.steps.length} step(s) — each is where the residual changes plateau:`)
    for (const s of walk.steps)
      lines.push(
        `  ${s.from.toFixed(1)} → ${s.to.toFixed(1)} (${s.step > 0 ? "+" : ""}${s.step.toFixed(1)}px) at "${fit(s.at.text, 56)}"`,
      )
    lines.push("")
    lines.push(
      "The element AT or just above each step is the fix — its height/width plus border in" +
        " the comp's box model. A step that repeats by the same amount is one box per repeat.",
    )
  }
  return lines.join("\n")
}
