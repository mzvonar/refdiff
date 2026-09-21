/**
 * Repetition in the unexplained-pixel remainder (pure).
 *
 * The remainder finding used to name its three LARGEST regions, which is the
 * wrong ranking for the thing it most often catches. Five identical ~350×1
 * strips at a constant vertical pitch is the signature of ONE missing repeated
 * rule — a row separator, a divider, a list border — and each strip is tiny, so
 * the largest-first list buries every one of them under a single 147×57 blob
 * that is usually a font-rasterisation residue.
 *
 * Measured witness: `messages-owner-mobile`'s missing phone-rail hairline
 * reached the report only as `f26`, "5.62% of the frame differs OUTSIDE every
 * matched element … 198 region(s)", naming the cause CLASS and no element.
 *
 * This needs no new extraction: the cluster boxes the remainder already
 * computes carry everything. A group is a run of clusters of (near-)identical
 * size, evenly spaced along one axis and aligned on the other.
 */

import type { Box } from "../types.js"
import type { Cluster } from "./cluster.js"

export interface RepeatedRun {
  /** How many clusters are in the run. */
  count: number
  /** The axis the run advances along. */
  axis: "vertical" | "horizontal"
  /** Mean step between consecutive members, CSS px. */
  pitch: number
  /** Rounded member size, CSS px. */
  w: number
  h: number
  /** The members, in layout order. */
  boxes: Box[]
}

export interface RepetitionOptions {
  /** Members must be this alike in width and height (CSS px). */
  sizeTolerance?: number
  /** Consecutive steps must be this alike (CSS px). */
  pitchTolerance?: number
  /** Members must share the cross-axis coordinate to within this (CSS px). */
  crossTolerance?: number
  /** Runs shorter than this are not repetition, they are a coincidence. */
  minCount?: number
  /**
   * Members must be this many times their own main-axis extent apart.
   *
   * Without it the strongest run in a real report is a GLYPH SEQUENCE:
   * `messages-owner-desktop` led with "6 regions of 7×9 repeating every 8.4px
   * horizontally" — six letters of one word, each speck the width of the gap
   * to the next. Layout rhythm is spaced out (a 351×1 rule every 87px is a
   * pitch of 87× its own height); text and dithering are adjacent.
   */
  minPitchRatio?: number
  /**
   * A member must be UI-sized: at least this long on its longer side, OR thin
   * enough (see `thinAspect`) to be a rule.
   *
   * The pitch gate alone was not enough. Tracked and word-spaced text clears it
   * easily — the same report then led with "7 regions of 5×8 repeating every
   * 13.2px" and "6 regions of 6×9 every 47.2px", which are letters of one word
   * and first letters of successive words. Nothing 9px on its longest side is a
   * repeated layout rule.
   */
  minLongSide?: number
  /** A hairline is tiny on one axis and long on the other: 351×1 is aspect 351. */
  thinAspect?: number
}

const DEFAULTS: Required<RepetitionOptions> = {
  sizeTolerance: 2,
  pitchTolerance: 2,
  crossTolerance: 3,
  minCount: 3,
  minPitchRatio: 2,
  minLongSide: 24,
  thinAspect: 8,
}

/** Big enough, or thin and long enough, to be a layout element rather than a glyph. */
const isUiSized = (b: Box, o: Required<RepetitionOptions>): boolean => {
  const long = Math.max(b.w, b.h)
  const short = Math.max(0.5, Math.min(b.w, b.h))
  return long >= o.minLongSide || long / short >= o.thinAspect
}

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Members are alike enough in size to be the same repeated thing. */
const sameSize = (a: Box, b: Box, tol: number): boolean =>
  Math.abs(a.w - b.w) <= tol && Math.abs(a.h - b.h) <= tol

/**
 * The longest evenly-spaced run along `axis` inside a set of same-size boxes
 * already aligned on the cross axis. Greedy from the first member: the pitch is
 * set by the first step and every later step must match it, so a group with one
 * outlier yields the run up to the outlier rather than nothing.
 */
function longestRun(
  sorted: readonly Box[],
  axis: "vertical" | "horizontal",
  o: Required<RepetitionOptions>,
): RepeatedRun | null {
  const main = (b: Box): number => (axis === "vertical" ? b.y : b.x)
  let best: Box[] = []
  // The search is a triple nest (~L³/6). The two `break`s below are pure pruning — they cut
  // branches that provably cannot beat the best run found so far, so the result is identical
  // and the common case (a long run found early) collapses. `sorted` is ordered along the main
  // axis, which is what makes the bounds sound: from `start` at most `length - start` members
  // remain, and from `(start, second)` at most `length - second + 1`.
  for (let start = 0; start + o.minCount <= sorted.length; start++) {
    if (sorted.length - start <= best.length) break
    for (let second = start + 1; second < sorted.length; second++) {
      if (sorted.length - second + 1 <= best.length) break
      const pitch = main(sorted[second]!) - main(sorted[start]!)
      if (pitch <= 0) continue
      const run: Box[] = [sorted[start]!, sorted[second]!]
      let expected = main(sorted[second]!) + pitch
      for (let k = second + 1; k < sorted.length; k++) {
        if (Math.abs(main(sorted[k]!) - expected) <= o.pitchTolerance) {
          run.push(sorted[k]!)
          expected = main(sorted[k]!) + pitch
        }
      }
      if (run.length > best.length) best = run
    }
  }
  if (best.length < o.minCount) return null
  const steps: number[] = []
  for (let i = 1; i < best.length; i++) steps.push(main(best[i]!) - main(best[i - 1]!))
  const pitch = steps.reduce((a, b) => a + b, 0) / steps.length
  // Adjacent members are a glyph sequence or dither texture, not a layout
  // rhythm — see `minPitchRatio`.
  const extent = axis === "vertical" ? best[0]!.h : best[0]!.w
  if (pitch < Math.max(1, extent) * o.minPitchRatio) return null
  return {
    count: best.length,
    axis,
    pitch: round1(pitch),
    w: Math.round(best[0]!.w),
    h: Math.round(best[0]!.h),
    boxes: best,
  }
}

/**
 * Evenly-spaced runs of same-size regions, strongest (longest, then largest)
 * first. Boxes are grouped by rounded size, then by cross-axis coordinate, and
 * each candidate group is searched along both axes.
 */
export function repeatedRuns(
  clusters: readonly Cluster[],
  options: RepetitionOptions = {},
): RepeatedRun[] {
  const o: Required<RepetitionOptions> = { ...DEFAULTS, ...options }
  const boxes = clusters.map((c) => c.box).filter((b) => isUiSized(b, o))
  const runs: RepeatedRun[] = []
  const claimed = new Set<Box>()

  // Size buckets: the first unclaimed box seeds a bucket and every later box
  // within tolerance of IT joins, so tolerance cannot chain a gradient of sizes
  // into one bucket the way pairwise comparison would.
  // A box that has already been INSIDE a bucket never seeds another one. `claimed` is written
  // only from a run that was actually returned, so a bucket that produced nothing left all its
  // members unclaimed and every one of them re-seeded an identical bucket — redoing the O(N)
  // filter, both lane builds and every longestRun, B times over. And "produced nothing" is the
  // DESIGNED outcome for the densest inputs: a tight column of same-size residues pays the full
  // cube and is then rejected by the minPitchRatio gate. Same buckets, same runs, ×B less work.
  const bucketed = new Set<Box>()

  for (const seed of boxes) {
    if (claimed.has(seed) || bucketed.has(seed)) continue
    const bucket = boxes.filter((b) => !claimed.has(b) && sameSize(seed, b, o.sizeTolerance))
    for (const b of bucket) bucketed.add(b)
    if (bucket.length < o.minCount) continue
    for (const axis of ["vertical", "horizontal"] as const) {
      const cross = (b: Box): number => (axis === "vertical" ? b.x : b.y)
      const main = (b: Box): number => (axis === "vertical" ? b.y : b.x)
      // Re-filtered per axis: the vertical pass claims its members, and without this the
      // horizontal pass rebuilt its lanes from the SAME boxes and emitted a second run over
      // them — a 3×3 grid reported three vertical runs and three horizontal ones covering the
      // identical nine regions.
      const available = bucket.filter((b) => !claimed.has(b))
      if (available.length < o.minCount) continue
      // Aligned on the cross axis — a column of separators shares x; a row of
      // chips shares y. Without this, boxes scattered over the frame that merely
      // happen to be the same size read as a run.
      //
      // `laneKeys` mirrors the Map's keys so the nearest-lane search scans an array in place.
      // The spread it replaces allocated a fresh array of every key PER BOX, per axis.
      const lanes = new Map<number, Box[]>()
      const laneKeys: number[] = []
      for (const b of available) {
        const c = cross(b)
        const key = laneKeys.find((k) => Math.abs(k - c) <= o.crossTolerance)
        if (key === undefined) {
          lanes.set(c, [b])
          laneKeys.push(c)
        } else {
          lanes.get(key)!.push(b)
        }
      }
      for (const lane of lanes.values()) {
        if (lane.length < o.minCount) continue
        const run = longestRun(
          [...lane].sort((a, b) => main(a) - main(b)),
          axis,
          o,
        )
        if (run === null) continue
        runs.push(run)
        for (const b of run.boxes) claimed.add(b)
      }
    }
  }

  return runs.sort((a, b) => b.count - a.count || b.w * b.h - a.w * a.h)
}

/** „5 regions of 351×1 repeating every 87.2px vertically, from (20, 214)" */
export function describeRun(run: RepeatedRun): string {
  const first = run.boxes[0]!
  const direction = run.axis === "vertical" ? "vertically" : "horizontally"
  return `${run.count} regions of ${run.w}×${run.h} repeating every ${run.pitch}px ${direction}, from (${Math.round(first.x)}, ${Math.round(first.y)})`
}
