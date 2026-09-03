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

import type { Box, ElementNode, Finding, RegionBreakdown, RegionGroup } from "../types.js"

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
    out.push(`  ${String(restFindings).padStart(4)} findings in ${rest} smaller region(s) — see byRegion in findings.json`)
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
