/**
 * The CONTAINER channel (pure).
 *
 * The matcher takes leaves, so design that lives only on a WRAPPER is invisible
 * to it. Measured witness: `messages-owner-mobile`'s comp draws each phone-rail
 * row as `<div …border-bottom:1px solid #f2eadd>` around an avatar and a text
 * block. 45 design leaves, 42 matched — and exactly ONE `border` finding in the
 * whole run, about a filter chip. The missing rule reached the report only as a
 * `pixel-region` reading "5.62% of the frame differs OUTSIDE every matched
 * element … 198 region(s)": the cause CLASS, and no element.
 *
 * The pairing costs nothing extra. Two containers holding the same set of
 * MATCHED LEAVES are the same container — the leaves were already paired by the
 * matcher, so the evidence is the matcher's and no second geometry guess is
 * made on top of it. It is exactly as good as the matcher's pairs and no
 * better: a run whose leaf pairs are wrong has container pairs to match.
 *
 * It compares only what a container can be wrong about on its own — per-side
 * borders, background and radius. Position and size are deliberately absent:
 * a wrapper's box is decided by the leaves inside it, which the structural
 * channel already reports one by one, and repeating that per wrapper would
 * multiply every layout finding by its nesting depth.
 */

import type { ElementMatch } from "../pipeline.js"
import type { Box, ElementNode, Finding } from "../types.js"

import { colorDelta } from "./checks.js"

type RawFinding = Omit<Finding, "id" | "mark">

type Side = "top" | "right" | "bottom" | "left"
const SIDES: readonly Side[] = ["top", "right", "bottom", "left"]

export interface ContainerCheckOptions {
  /** CIEDE2000 thresholds: below `minor` two colours count as equal. */
  colorDeltaEMinor?: number
  colorDeltaEMajor?: number
  /** Border-width deltas up to this many px count as equal (sub-pixel rendering). */
  borderWidthTolerance?: number
  radiusTolerance?: number
  /**
   * A container must hold at least this many matched leaves to be pairable.
   * One leaf is not identity: a page has many wrappers around a single label,
   * and pairing on one leaf pairs whichever of them the scan reached first.
   */
  minLeaves?: number
  /**
   * Containers whose box covers more than this share of the frame are page
   * chrome — the capture root's own wrapper chain. They hold every leaf, so
   * they all share one key and none of them is identified by it.
   */
  maxFrameShare?: number
}

const DEFAULTS: Required<ContainerCheckOptions> = {
  colorDeltaEMinor: 2.5,
  colorDeltaEMajor: 8,
  borderWidthTolerance: 0.6,
  radiusTolerance: 1.5,
  minLeaves: 2,
  maxFrameShare: 0.7,
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** A box's centre is inside the container — robust to a 1px border growing the child. */
const holds = (container: Box, box: Box): boolean => {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return (
    cx >= container.x &&
    cx <= container.x + container.w &&
    cy >= container.y &&
    cy <= container.y + container.h
  )
}

const area = (b: Box): number => Math.max(0, b.w) * Math.max(0, b.h)

/**
 * The matched leaves a container holds, as the indices of those matches — the
 * same index on both sides, which is what makes the two keys comparable.
 */
const heldLeaves = (
  container: ElementNode,
  matches: readonly ElementMatch[],
  side: "design" | "impl",
): number[] => {
  const held: number[] = []
  for (const [i, m] of matches.entries()) {
    if (holds(container.box, m[side].box)) held.push(i)
  }
  return held
}

/** Members of a comma-joined index key, counted without materialising the split. */
const countMembers = (key: string): number => {
  let n = 1
  for (const ch of key) if (ch === ",") n++
  return n
}

export interface ContainerPair {
  design: ElementNode
  impl: ElementNode
  /** How many matched leaves the two share — the strength of the identification. */
  leaves: number
}

/**
 * Pair containers by identical matched-leaf sets.
 *
 * A key is used only when it identifies exactly ONE container on each side.
 * Nested wrappers around the same content share a key, and picking one of them
 * would be a coin toss whose outcome decides which box a `border` finding names
 * — so an ambiguous key pairs nothing, on both sides.
 */
export function pairContainers(
  design: { containers: readonly ElementNode[]; frame: Box },
  impl: { containers: readonly ElementNode[]; frame: Box },
  matches: readonly ElementMatch[],
  options: ContainerCheckOptions = {},
): ContainerPair[] {
  const o: Required<ContainerCheckOptions> = { ...DEFAULTS, ...options }
  const eligible = (
    containers: readonly ElementNode[],
    frame: Box,
    side: "design" | "impl",
  ): Map<string, ElementNode | null> => {
    const frameArea = area(frame)
    const byKey = new Map<string, ElementNode | null>()
    for (const c of containers) {
      if (frameArea > 0 && area(c.box) / frameArea > o.maxFrameShare) continue
      // The count comes from the array, not from re-splitting the string that was just built
      // from it — `key.split(",")` allocated an array of up to one-per-match strings twice per
      // container purely to recover a number the loop above already had.
      const held = heldLeaves(c, matches, side)
      if (held.length < o.minLeaves) continue
      const key = held.join(",")
      // null marks an AMBIGUOUS key — seen twice, so it identifies nothing.
      byKey.set(key, byKey.has(key) ? null : c)
    }
    return byKey
  }

  const designByKey = eligible(design.containers, design.frame, "design")
  const implByKey = eligible(impl.containers, impl.frame, "impl")
  const pairs: ContainerPair[] = []
  for (const [key, d] of designByKey) {
    const i = implByKey.get(key)
    if (d === null || i === null || i === undefined) continue
    // `key` is a comma-joined index list, so its member count is its separator count plus one —
    // no array needed. (Once per surviving PAIR this is negligible either way; it is spelled
    // this way so the two places that need the count do not disagree about how to get it.)
    pairs.push({ design: d, impl: i, leaves: countMembers(key) })
  }
  return pairs
}

/** Borders as extracted per side; an absent side paints nothing. */
const sidesOf = (
  el: ElementNode,
): Partial<Record<Side, { width: number; color: string; style: string }>> =>
  el.style?.borderSides ?? {}

const label = (pair: ContainerPair): string =>
  `container at (${Math.round(pair.design.box.x)}, ${Math.round(pair.design.box.y)}) ${Math.round(pair.design.box.w)}×${Math.round(pair.design.box.h)} (${pair.leaves} matched leaves)`

/**
 * Findings for one paired container.
 *
 * `colorDelta` is IMPORTED from the structural channel rather than injected, which is how every
 * sibling module here reaches its collaborator (align → text, pixel/checks → classify, cluster).
 * The anti-drift goal the injection was for — one colour implementation, one set of thresholds —
 * is satisfied identically by the import, and `checks.ts → containers.ts` is a same-directory
 * edge with no cycle. Injecting it instead forced `colorDelta` from private to exported and put
 * a fourth positional argument on the public entry point for nothing.
 */
function findingsForPair(pair: ContainerPair, o: Required<ContainerCheckOptions>): RawFinding[] {
  const out: RawFinding[] = []
  const boxes = { designBox: pair.design.box, implBox: pair.impl.box, role: "container" }
  const name = label(pair)

  // Per-side borders. The side is the point: the row separator this channel
  // exists for is `border-bottom` and nothing else, and the leaf model's
  // top-side-only scalars read it as no border at all.
  const ds = sidesOf(pair.design)
  const is = sidesOf(pair.impl)
  for (const side of SIDES) {
    const d = ds[side]
    const i = is[side]
    if (d === undefined && i === undefined) continue
    const dw = d?.width ?? 0
    const iw = i?.width ?? 0
    const presenceFlip = (dw === 0) !== (iw === 0)
    const widthDiffers = Math.abs(dw - iw) > o.borderWidthTolerance
    const de = d !== undefined && i !== undefined ? colorDelta(d.color, i.color) : undefined
    const colorDiffers = de !== undefined && de >= o.colorDeltaEMinor
    const styleDiffers = d !== undefined && i !== undefined && d.style !== i.style
    if (!widthDiffers && !colorDiffers && !styleDiffers) continue
    const notes: string[] = []
    if (presenceFlip) {
      notes.push(
        iw === 0
          ? `no border-${side}, design has one`
          : `a border-${side} the design does not have`,
      )
    } else if (widthDiffers) {
      notes.push(`border-${side} ${iw}px vs ${dw}px`)
    }
    if (styleDiffers) notes.push(`${i?.style} where the design is ${d?.style}`)
    if (colorDiffers) notes.push(`color ${i?.color} vs ${d?.color} (ΔE2000 ${round1(de)})`)
    out.push({
      type: "border",
      severity: presenceFlip || (de !== undefined && de >= o.colorDeltaEMajor) ? "major" : "minor",
      ...boxes,
      expected: { [`border${side}Width`]: dw, ...(d ? { [`border${side}Color`]: d.color } : {}) },
      actual: { [`border${side}Width`]: iw, ...(i ? { [`border${side}Color`]: i.color } : {}) },
      message: `${name} border differs: ${notes.join(", ")}`,
    })
  }

  // Background — a PRESENCE FLIP first, then the colour comparison.
  //
  // The two need separating for the same reason the border check separates them, and ΔE is
  // specifically the wrong instrument for the flip: an absent background flattens to white, and
  // "panel #FFFDF9 versus nothing" is then a ΔE of well under the minor floor. So the version
  // that only compared colours reported nothing for a dropped panel — one of the three cases
  // architecture.md advertises this channel for.
  //
  // Reading an absent value as "paints none" is safe here, and only here, because
  // `runContainerChecks` returns early when a side has no container LIST: inside a formed pair
  // `undefined` means the wrapper paints no background, never that we could not tell.
  const TRANSPARENT = "rgba(0, 0, 0, 0)"
  const dbgRaw = pair.design.style?.backgroundColor
  const ibgRaw = pair.impl.style?.backgroundColor
  const bgPresenceFlip = (dbgRaw === undefined) !== (ibgRaw === undefined)
  const dbg = dbgRaw ?? TRANSPARENT
  const ibg = ibgRaw ?? TRANSPARENT
  if (bgPresenceFlip) {
    out.push({
      type: "color",
      severity: "major",
      ...boxes,
      expected: { backgroundColor: dbg },
      actual: { backgroundColor: ibg },
      message:
        ibgRaw === undefined
          ? `${name} has no background, design paints ${dbg}`
          : `${name} paints a background (${ibg}) the design does not have`,
    })
  } else if (dbgRaw !== undefined && ibgRaw !== undefined) {
    const de = colorDelta(dbg, ibg)
    if (de !== undefined && de >= o.colorDeltaEMinor) {
      out.push({
        type: "color",
        severity: de >= o.colorDeltaEMajor ? "major" : "minor",
        ...boxes,
        expected: { backgroundColor: dbg },
        actual: { backgroundColor: ibg },
        message: `${name} background is ${ibg}, design says ${dbg} (ΔE2000 ${round1(de)})`,
      })
    }
  }

  // Radius.
  const dr = pair.design.style?.borderRadius ?? 0
  const ir = pair.impl.style?.borderRadius ?? 0
  if (
    (pair.design.style?.borderRadius !== undefined ||
      pair.impl.style?.borderRadius !== undefined) &&
    Math.abs(dr - ir) > o.radiusTolerance
  ) {
    out.push({
      type: "border-radius",
      severity: Math.abs(dr - ir) >= 8 ? "major" : "minor",
      ...boxes,
      expected: { borderRadius: dr },
      actual: { borderRadius: ir },
      message: `${name} border-radius is ${ir}px, design says ${dr}px`,
    })
  }

  return out
}

/**
 * Pure: the container channel's findings.
 *
 * Returns nothing when either side has no container list — a Figma capture has
 * no DOM, so it cannot answer, and guessing would report every comp container
 * as drift.
 */
export function runContainerChecks(
  design: { containers?: readonly ElementNode[]; frame: Box },
  impl: { containers?: readonly ElementNode[]; frame: Box },
  matches: readonly ElementMatch[],
  options: ContainerCheckOptions = {},
): { findings: RawFinding[]; pairs: number } {
  if (design.containers === undefined || impl.containers === undefined) {
    return { findings: [], pairs: 0 }
  }
  const o: Required<ContainerCheckOptions> = { ...DEFAULTS, ...options }
  const pairs = pairContainers(
    { containers: design.containers, frame: design.frame },
    { containers: impl.containers, frame: impl.frame },
    matches,
    o,
  )
  return {
    findings: pairs.flatMap((p) => findingsForPair(p, o)),
    pairs: pairs.length,
  }
}
