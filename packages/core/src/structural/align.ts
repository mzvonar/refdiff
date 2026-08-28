/**
 * Structural alignment (pure) — per-axis similarity fit from element data.
 *
 * Real design frames carry artboard chrome (labels, backdrops, notes) that
 * offsets AND rescales the actual UI relative to the implementation
 * capture. Before γ-matching, fit x' = s·x + d per axis over text anchors —
 * strings that appear exactly once on each side — using Theil–Sen (median
 * of pairwise slopes), which tolerates disagreeing anchors without RANSAC.
 * The design elements are then mapped into impl space and the total
 * transform is recorded as the report's `Alignment`.
 *
 * Evidence: text-block matching is the backbone of Design2Code's
 * human-correlated scoring (research.md §3); no pixels are needed, so this
 * stays in the structural channel (NCC arrives with the pixel channel).
 */

import type { NormalizedPair, AlignedPair } from "../pipeline.js"
import type { Alignment, ElementNode } from "../types.js"
import type { RawFinding } from "./checks.js"
import { normalizeForMatching as normText } from "./text.js"

const MIN_ANCHORS = 3
const MIN_TEXT_LENGTH = 3
/** Anchor separation below which a pairwise slope is too noisy to use. */
const MIN_SEPARATION = 24
/** Sane bounds for an estimated axis scale; outside → translation-only. */
const SCALE_MIN = 0.5
const SCALE_MAX = 2
/** Residual (px) within which an anchor counts as agreeing with the fit. */
const AGREE_PX = 10
/** An axis fit is applied only when its median |residual| is below this. */
const AXIS_RESIDUAL_MAX = 12


/** Map of normalized text → element, keeping only texts unique on that side. */
function uniqueTextIndex(elements: readonly ElementNode[]): Map<string, ElementNode> {
  const buckets = new Map<string, ElementNode[]>()
  for (const el of elements) {
    if (el.text === undefined) continue
    const key = normText(el.text)
    if (key.length < MIN_TEXT_LENGTH) continue
    const bucket = buckets.get(key)
    if (bucket) bucket.push(el)
    else buckets.set(key, [el])
  }
  const unique = new Map<string, ElementNode>()
  for (const [key, els] of buckets) if (els.length === 1) unique.set(key, els[0]!)
  return unique
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

interface AxisFit {
  scale: number
  offset: number
}

/**
 * Theil–Sen: x' = scale·x + offset from paired 1-D samples. Falls back to
 * identity when the fit doesn't actually explain the anchors — axes are
 * judged independently, since one axis often aligns cleanly (vertical flow)
 * while the other reflects a real layout difference.
 */
function fitAxis(design: readonly number[], impl: readonly number[]): AxisFit {
  const slopes: number[] = []
  for (let i = 0; i < design.length; i++) {
    for (let j = i + 1; j < design.length; j++) {
      const span = design[j]! - design[i]!
      if (Math.abs(span) < MIN_SEPARATION) continue
      slopes.push((impl[j]! - impl[i]!) / span)
    }
  }
  let scale = slopes.length >= MIN_ANCHORS ? median(slopes) : 1
  if (scale < SCALE_MIN || scale > SCALE_MAX) scale = 1
  const offset = median(design.map((d, i) => impl[i]! - scale * d))
  const medianResidual = median(design.map((d, i) => Math.abs(scale * d + offset - impl[i]!)))
  if (medianResidual > AXIS_RESIDUAL_MAX) return { scale: 1, offset: 0 }
  return { scale, offset }
}

/**
 * Agreement scores from per-axis hit masks. The joint score counts an anchor
 * only when BOTH axes land it within `AGREE_PX`; each axis score counts that
 * axis alone. All three carry the same `min(1, anchors/8)` damping, so a fit
 * resting on 3 anchors cannot claim more than 0.375 however well it fits.
 */
function scoreAgreement(
  okX: readonly boolean[],
  okY: readonly boolean[],
  anchors: number,
): { confidence: number; confidenceX: number; confidenceY: number } {
  if (anchors === 0) return { confidence: 0, confidenceX: 0, confidenceY: 0 }
  const damping = Math.min(1, anchors / 8) / anchors
  const count = (mask: readonly boolean[]): number => mask.filter(Boolean).length
  return {
    confidence: count(okX.map((ok, i) => ok && okY[i]!)) * damping,
    confidenceX: count(okX) * damping,
    confidenceY: count(okY) * damping,
  }
}

export interface TransformEstimate {
  scaleX: number
  scaleY: number
  offsetX: number
  offsetY: number
  /** Number of unique-text anchor pairs the estimate rests on. */
  anchors: number
  /** 0..1 — fraction of anchors the fit explains, damped for few anchors. */
  confidence: number
  /**
   * The same measure per axis. `confidence` counts an anchor only when it
   * agrees on BOTH axes, so a single broken axis collapses it to 0 and hides
   * that the other fitted perfectly — the signature of a layout that matches
   * vertically but packs differently across (content-width-dependent rows, or
   * a control that moved from one side to the other). Diagnostic only: the
   * pixel gate stays on the joint `confidence`, because diffing pixels needs
   * both axes right.
   */
  confidenceX: number
  confidenceY: number
}

const IDENTITY: TransformEstimate = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  anchors: 0,
  confidence: 0,
  confidenceX: 0,
  confidenceY: 0,
}

/**
 * Estimate the per-axis similarity transform mapping design element centers
 * onto impl element centers. Identity with confidence 0 when there are too
 * few anchors.
 */
export function estimateTransform(
  design: readonly ElementNode[],
  impl: readonly ElementNode[],
): TransformEstimate {
  const designIdx = uniqueTextIndex(design)
  const implIdx = uniqueTextIndex(impl)
  const dX: number[] = []
  const dY: number[] = []
  const iX: number[] = []
  const iY: number[] = []
  for (const [key, d] of designIdx) {
    const i = implIdx.get(key)
    if (!i) continue
    dX.push(d.box.x + d.box.w / 2)
    dY.push(d.box.y + d.box.h / 2)
    iX.push(i.box.x + i.box.w / 2)
    iY.push(i.box.y + i.box.h / 2)
  }
  const anchors = dX.length
  if (anchors < MIN_ANCHORS) {
    // Too few anchors for a scale fit. A pure OFFSET is still well-defined —
    // and safe by construction — when every design leaf is itself an anchor
    // (a component-sized capture: one Figma variant vs one story cell), since
    // no unmatched element could be dragged to the wrong place. A page that
    // shares one accidental word stays at identity.
    if (anchors === 0 || anchors !== design.length) return { ...IDENTITY, anchors }
    const offsetX = median(dX.map((dx, i) => iX[i]! - dx))
    const offsetY = median(dY.map((dy, i) => iY[i]! - dy))
    const okX = dX.map((dx, i) => Math.abs(dx + offsetX - iX[i]!) <= AGREE_PX)
    const okY = dY.map((dy, i) => Math.abs(dy + offsetY - iY[i]!) <= AGREE_PX)
    return {
      scaleX: 1,
      scaleY: 1,
      offsetX,
      offsetY,
      anchors,
      ...scoreAgreement(okX, okY, anchors),
    }
  }

  const x = fitAxis(dX, iX)
  const y = fitAxis(dY, iY)

  const okX = dX.map((dx, i) => Math.abs(x.scale * dx + x.offset - iX[i]!) <= AGREE_PX)
  const okY = dY.map((dy, i) => Math.abs(y.scale * dy + y.offset - iY[i]!) <= AGREE_PX)
  const { confidence, confidenceX, confidenceY } = scoreAgreement(okX, okY, anchors)

  return {
    scaleX: x.scale,
    scaleY: y.scale,
    offsetX: x.offset,
    offsetY: y.offset,
    anchors,
    confidence,
    confidenceX,
    confidenceY,
  }
}

/**
 * Pure stage: maps design elements into impl space via the anchor-estimated
 * transform and records the TOTAL design→impl transform (normalization
 * scale folded in) as `alignment`. Axes that couldn't be fitted stay at
 * identity (estimateTransform already guarantees that), and the confidence
 * says how well the anchors are explained.
 */
export function alignStructural(pair: NormalizedPair): AlignedPair {
  const fit = estimateTransform(pair.design.elements, pair.impl.elements)
  // An ELEMENT pair — both sides captured one explicit node (a Figma variant
  // COMPONENT vs a story cell `selector`) — has coinciding origins by
  // construction, so with too few anchors for a fit the identity is not a
  // guess but the truth: confidence 1, and a size difference stays a size
  // difference instead of being half-absorbed into an offset (S11).
  const elementPair = pair.design.scope?.mode === "explicit" && pair.impl.scope?.mode === "explicit"
  const t: TransformEstimate =
    elementPair && fit.anchors < MIN_ANCHORS
      ? { ...IDENTITY, anchors: fit.anchors, confidence: 1, confidenceX: 1, confidenceY: 1 }
      : fit
  const basis: NonNullable<Alignment["basis"]> =
    elementPair && fit.anchors < MIN_ANCHORS
      ? "element-pair"
      : fit.anchors >= MIN_ANCHORS
        ? "anchors"
        : fit.confidence > 0
          ? "offset"
          : "none"

  const design =
    t.scaleX !== 1 || t.scaleY !== 1 || t.offsetX !== 0 || t.offsetY !== 0
      ? {
          ...pair.design,
          width: pair.design.width * t.scaleX,
          height: pair.design.height * t.scaleY,
          elements: pair.design.elements.map((el) => ({
            ...el,
            box: {
              x: t.scaleX * el.box.x + t.offsetX,
              y: t.scaleY * el.box.y + t.offsetY,
              w: t.scaleX * el.box.w,
              h: t.scaleY * el.box.h,
            },
          })),
        }
      : pair.design

  const scale = pair.designScale * t.scaleX
  const scaleY = pair.designScale * t.scaleY
  return {
    ...pair,
    design,
    alignment: {
      scale,
      ...(scaleY !== scale ? { scaleY } : {}),
      offsetX: t.offsetX,
      offsetY: t.offsetY,
      confidence: t.confidence,
      confidenceX: t.confidenceX,
      confidenceY: t.confidenceY,
      basis,
    },
  }
}

/* ------------------------------------------------ the identity note -- */

/** |scale − 1| above this is a size difference, not rounding (0.0005 × 800 px = 0.4 px). */
const IDENTITY_SCALE_EPSILON = 0.0005
/** |offset| above this (px) is a real shift, not a sub-pixel residue. */
const IDENTITY_OFFSET_EPSILON = 0.5

const round = (n: number, digits: number): number => {
  const k = 10 ** digits
  return Math.round(n * k) / k
}

const signed = (n: number): string => (n < 0 ? "−" : "") + Math.abs(n).toFixed(2)

/**
 * Pure: the one boxless minor finding a pair gets when its structural fit is
 * NOT the identity although the two sides are the same size — a fluid frame
 * rendered at the pair viewport, or a design frame whose css px equal it.
 * There the transform has nothing legitimate to absorb: `scale 1.00175`
 * means something above or beside the anchors is systematically taller or
 * wider on one side (a comp with no `box-sizing` reset drawing `height:46px`
 * + border as 47 px against an app's border-box 46), and no per-element
 * finding shows it because every box was moved to fit. A design of ANOTHER
 * size (a Figma frame at 1440 against a 1280 viewport) is a layout
 * difference, not a scale — no note. Undefined when the fit is the identity
 * within epsilon, so the note disappears when the sizes are right.
 */
export function alignmentNote(alignment: Alignment, sameSize: boolean): RawFinding | undefined {
  if (!sameSize) return undefined
  const { scale, offsetX, offsetY } = alignment
  const scaleY = alignment.scaleY ?? scale
  const scaleOff = Math.max(Math.abs(scale - 1), Math.abs(scaleY - 1)) > IDENTITY_SCALE_EPSILON
  const offsetOff = Math.max(Math.abs(offsetX), Math.abs(offsetY)) > IDENTITY_OFFSET_EPSILON
  if (!scaleOff && !offsetOff) return undefined
  const anisotropic = Math.abs(scaleY - scale) > IDENTITY_SCALE_EPSILON
  const scaleText = anisotropic
    ? `scale ${scale.toFixed(5)} × ${scaleY.toFixed(5)} (x × y)`
    : `scale ${scale.toFixed(5)}`
  return {
    type: "alignment",
    severity: "minor",
    expected: { scale: 1, offsetX: 0, offsetY: 0 },
    actual: {
      scale: round(scale, 5),
      ...(anisotropic ? { scaleY: round(scaleY, 5) } : {}),
      offsetX: round(offsetX, 2),
      offsetY: round(offsetY, 2),
    },
    message: `alignment is not the identity on a same-size page: the fit absorbed ${scaleText}, offset (${signed(offsetX)}, ${signed(offsetY)})px — a systematic size difference in the chrome above or beside the anchors (box model?); fix the sizes and the transform snaps to scale 1, offset 0`,
  }
}
