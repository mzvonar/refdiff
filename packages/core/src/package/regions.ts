/**
 * Where the findings ARE (pure) — the first question a reader asks of a page
 * pair, and one nothing answered until now.
 *
 * A converged loop on a 155-finding pair spent its first minutes on a
 * hand-rolled script that bucketed the boxes by hand, twice in one session,
 * only to learn that 106 of them were in the rail and 70 in the canvas — which
 * is the whole orientation: one number said "the rail's list is offset", the
 * other said "the canvas is at a different zoom". Neither is visible in a
 * severity-sorted list.
 *
 * So: group every finding under the SMALLEST captured container that holds its
 * box. Smallest, not first — containers nest (a pane inside the work area
 * inside the frame), and the outermost always "contains" everything, which
 * locates nothing. A container that covers most of the frame is refused for the
 * same reason: "the whole page" is not a place.
 */

import type {
  Box,
  ElementNode,
  Finding,
  MatchingStats,
  RegionBreakdown,
  RegionGroup,
  SuppressedFinding,
  UnmatchedBreakdown,
  UnmatchedSide,
} from "../types.js"

/**
 * A container may not cover more than this share of the frame. At 0.7 a page's
 * two side-by-side panes still qualify (about half each) while the work area
 * that holds both does not.
 */
export const DEFAULT_MAX_CONTAINER_SHARE = 0.7
/** Nor be smaller than this: a chip is not a region. */
export const DEFAULT_MIN_CONTAINER_PX = 64

const area = (b: Box): number => Math.max(0, b.w) * Math.max(0, b.h)

/** Mostly-inside, with a 2px slack for the sub-pixel edges a capture produces. */
const holds = (container: Box, b: Box): boolean =>
  b.x >= container.x - 2 &&
  b.y >= container.y - 2 &&
  b.x + b.w <= container.x + container.w + 2 &&
  b.y + b.h <= container.y + container.h + 2

/**
 * The IMPL box first: it is world space and does not move with the alignment.
 * A design-only finding's box is already mapped into that space, so it groups
 * with everything else.
 */
const anchor = (f: Finding): Box | undefined => f.implBox ?? f.designBox

/**
 * Containers worth naming, largest first — a painted container (`surface`), an
 * image, or a plain box, sized between "a chip" and "most of the frame".
 */
export function containersOf(
  elements: readonly ElementNode[],
  frame: Box,
  { maxShare = DEFAULT_MAX_CONTAINER_SHARE, minPx = DEFAULT_MIN_CONTAINER_PX } = {},
): ElementNode[] {
  const frameArea = area(frame)
  return elements
    .filter((e) => {
      if (e.text !== undefined && e.text !== "") return false
      if (e.role !== "surface" && e.role !== "box" && e.role !== "image") return false
      if (e.box.w < minPx || e.box.h < minPx) return false
      return frameArea === 0 || area(e.box) / frameArea <= maxShare
    })
    .sort((a, b) => area(b.box) - area(a.box))
}

/**
 * Pure: the findings grouped by their smallest containing region, biggest group
 * first. Only groups worth reading are returned — a region holding one finding
 * of a hundred is noise in a summary, so `minGroup` (default 2) folds it into
 * `elsewhere`.
 */
export function groupByRegion(
  findings: readonly Finding[],
  containers: readonly ElementNode[],
  { minGroup = 2 } = {},
): RegionBreakdown {
  // Smallest first, so the first container that holds a box is the tightest one.
  const inner = [...containers].sort((a, b) => area(a.box) - area(b.box))
  const buckets = new Map<ElementNode, Finding[]>()
  let elsewhere = 0
  for (const f of findings) {
    const b = anchor(f)
    const home = b === undefined ? undefined : inner.find((c) => holds(c.box, b))
    if (home === undefined) {
      elsewhere += 1
      continue
    }
    buckets.set(home, [...(buckets.get(home) ?? []), f])
  }
  const groups: RegionGroup[] = []
  for (const [el, fs] of buckets) {
    if (fs.length < minGroup) {
      elsewhere += fs.length
      continue
    }
    groups.push({
      box: el.box,
      role: el.role ?? "box",
      findings: fs.length,
      critical: fs.filter((f) => f.severity === "critical").length,
      major: fs.filter((f) => f.severity === "major").length,
      minor: fs.filter((f) => f.severity === "minor").length,
      ids: fs.map((f) => f.id),
    })
  }
  groups.sort((a, b) => b.findings - a.findings)
  return { groups, elsewhere }
}

/**
 * One line per region for the run log, biggest first — capped, because the tail
 * of a busy pair is not orientation and the report keeps every group anyway.
 * Empty when nothing groups.
 */
export function describeRegions(breakdown: RegionBreakdown, limit = 6): string[] {
  const shown = breakdown.groups.slice(0, limit)
  const out = shown.map(
    (g) =>
      `  ${String(g.findings).padStart(4)} findings in ${g.role} at (${Math.round(g.box.x)}, ${Math.round(g.box.y)}) ${Math.round(g.box.w)}×${Math.round(g.box.h)} — ${g.critical} critical, ${g.major} major, ${g.minor} minor`,
  )
  if (out.length === 0) return out
  const rest = breakdown.groups.length - shown.length
  if (rest > 0) {
    const restFindings = breakdown.groups.slice(limit).reduce((n, g) => n + g.findings, 0)
    out.push(
      `  ${String(restFindings).padStart(4)} findings in ${rest} smaller region(s) — see byRegion in findings.json`,
    )
  }
  if (breakdown.elsewhere > 0) {
    // NOT "chrome": on a panned canvas most of these are off-frame content, and
    // a box wider than any region belongs to none of them. Say what is true.
    out.push(
      `  ${String(breakdown.elsewhere).padStart(4)} in no single region — page chrome, off-frame content, a box larger than every region, or alone in one`,
    )
  }
  return out
}

/** The elements only one side has — grouped by the containers of THAT side. */
export interface UnmatchedInput {
  /** This run's kept findings; only `missing-element` / `extra-element` are read. */
  findings: readonly Finding[]
  /** What the ignore policy removed — counted, never placed (it is not in the list). */
  suppressed: readonly SuppressedFinding[]
  /**
   * The matcher's own counts: what `elements` means on each side. Optional
   * because `ComparisonReport.matching` is — a report written before the matcher
   * reported itself has no such counts, and there is no honest substitute for
   * them (the reported count is a DIFFERENT number, which is the whole subject
   * of `UnmatchedSide`). Without it there is no map.
   */
  matching?: MatchingStats
  /** The design tree ALIGNED into impl world space, and the comp's frame in it. */
  design: { elements: readonly ElementNode[]; frame: Box }
  impl: { elements: readonly ElementNode[]; frame: Box }
}

/**
 * The unmatched elements, placed — ONE GROUPING PER SIDE (pure).
 *
 * `groupByRegion` above answers "where are the findings" from the impl tree,
 * which is correct for a finding about a pair: both boxes are in impl world
 * space, and the impl is what somebody is about to edit. It is the wrong
 * instrument for a design-only element, and wrong in the case that needs it
 * most. A `reconcile` pair is one whose two layouts do not agree, so wherever
 * the comp draws something the implementation has nothing for, the comp's
 * element lands in the GAP between impl containers and is placed nowhere.
 * Measured on the canonical witness (`messages-accountant-desktop`): impl
 * containers place 11 of its 37 design-only elements; the comp's own place 30.
 * Corpus-wide over the 24 `reconcile` pairs, 251 of 1200 against 697.
 *
 * So each side is grouped by its own containers, and the two groupings are
 * never merged: they are in the same coordinate space but they are answers to
 * two different questions ("what does the comp have that we did not build" /
 * "what did we build that the comp does not have").
 *
 * `minGroup` is 1 here, unlike `byRegion`'s 2. There the question is
 * orientation and a container holding one finding of a hundred is noise; here
 * the question is COMPLETENESS, and folding a lone element into `elsewhere`
 * would throw away the only thing the map is for — a comp column with exactly
 * one element in it is precisely the divergence a reader is hunting.
 *
 * `undefined` — no map at all — in exactly two cases, and both are statements:
 * there are no matcher counts to place a population against, or the two sides
 * matched everything. An empty map, by contrast, is emitted and says so
 * (`elsewhere: 37` means "37 unmatched and this map placed none of them", which
 * is not the same claim as a missing field).
 */
export function groupUnmatched({
  findings,
  suppressed,
  matching,
  design,
  impl,
}: UnmatchedInput): UnmatchedBreakdown | undefined {
  if (matching === undefined) return undefined
  if (matching.designOnly === 0 && matching.implOnly === 0) return undefined
  const side = (
    type: Finding["type"],
    elements: number,
    tree: { elements: readonly ElementNode[]; frame: Box },
  ): UnmatchedSide => {
    const mine = findings.filter((f) => f.type === type)
    const hidden = suppressed.filter((f) => f.type === type).length
    return {
      elements,
      reported: mine.length,
      suppressed: hidden,
      // What is left is what `presenceFindings` never raised: an element under
      // `minElementSize` on one dimension. Derived rather than re-measured, so
      // the three populations cannot fail to add up to the matcher's count.
      belowFloor: Math.max(0, elements - mine.length - hidden),
      byRegion: groupByRegion(mine, containersOf(tree.elements, tree.frame), { minGroup: 1 }),
    }
  }
  return {
    design: side("missing-element", matching.designOnly, design),
    impl: side("extra-element", matching.implOnly, impl),
  }
}

/**
 * One side of the unmatched map for the run log: the count reconciliation
 * first, then where the reported ones are, biggest group first.
 *
 * The headline says BOTH populations because they differ and a reader cannot
 * see why. Until 2026-09-16 the reconcile headline printed the matcher's count
 * and pointed at the list, which held one fewer — a 1.09 × 22 px hairline
 * divider under the 4 px reporting floor, with `suppressed: 0` beside it to
 * explain the gap away.
 *
 * Empty when the side has nothing unmatched: no line is the true statement.
 */
export function describeUnmatched(side: UnmatchedSide, label: string, limit = 6): string[] {
  if (side.elements === 0) return []
  const gaps = [
    ...(side.suppressed > 0 ? [`${side.suppressed} suppressed by policy`] : []),
    ...(side.belowFloor > 0 ? [`${side.belowFloor} under the reporting floor`] : []),
  ]
  const out = [
    gaps.length === 0
      ? `  ${side.elements} ${label} (all ${side.elements} listed below):`
      : `  ${side.elements} ${label} (${side.reported} listed below, ${gaps.join(", ")}):`,
  ]
  const shown = side.byRegion.groups.slice(0, limit)
  for (const g of shown) {
    out.push(
      `    ${String(g.findings).padStart(4)} in ${g.role} at (${Math.round(g.box.x)}, ${Math.round(g.box.y)}) ${Math.round(g.box.w)}×${Math.round(g.box.h)}`,
    )
  }
  const rest = side.byRegion.groups.length - shown.length
  if (rest > 0) {
    const restCount = side.byRegion.groups.slice(limit).reduce((n, g) => n + g.findings, 0)
    out.push(`    ${String(restCount).padStart(4)} in ${rest} smaller container(s)`)
  }
  if (side.byRegion.elsewhere > 0) {
    // The map's own miss rate, stated by the map. A container-based placement
    // has nowhere to put an element that sits between containers or inside one
    // covering most of the frame, and a reader must not read a short list as a
    // short problem.
    out.push(
      `    ${String(side.byRegion.elsewhere).padStart(4)} in no container of that side — this map does not place them`,
    )
  }
  return out
}
