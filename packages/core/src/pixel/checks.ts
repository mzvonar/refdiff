/**
 * Pixel channel findings (pure).
 *
 * Input: per-match diff results (produced by the effectful `diffMatches`
 * edge) + the structural findings already computed for the same pair.
 * Output: `pixel-region` findings for matched elements whose pixels differ
 * beyond the minor threshold — ONLY where the structural channel had nothing
 * to say about that pair, so a color/size/typography finding never gets a
 * trivially-failing pixel twin. Position findings do not disqualify a pair:
 * the diff compares each element inside its own box, so a shifted element
 * with identical pixels stays quiet.
 *
 * Severity follows the Argos multi-threshold pattern on the diff ratio.
 */

import type { ElementMatch } from "../pipeline.js"
import type { Alignment, Box, Finding, FindingType, Severity } from "../types.js"

import { classifyRegion, describeChange, type RawImage } from "./classify.js"
import { clusterMask, unionBox, type Cluster, type DiffMask } from "./cluster.js"
import type { RemainderDiff } from "./diff.js"

/** What the diff edge measured for one matched pair, in impl native pixels. */
export interface MatchDiff {
  match: ElementMatch
  /** Mask over the impl element's native-pixel box (origin = box top-left). */
  mask: DiffMask
  /** Differing pixels (AA-excluded) / total pixels. */
  diffRatio: number
  diffPixels: number
  /** Native px per CSS px of the impl capture (to map mask → CSS boxes). */
  dpr: number
  /**
   * The two crops the mask was computed over (same size as the mask): the
   * design element resampled onto the impl grid at the best shift, and the
   * impl element. Optional so hand-built diffs (tests) need not carry pixels;
   * without them the finding has no `changeKind`.
   */
  design?: RawImage
  impl?: RawImage
}

export interface PixelCheckOptions {
  /** Diff ratios at/above these are minor / major / critical. */
  thresholds?: { minor: number; major: number; critical: number }
  /** Fewer differing pixels than this never report (tiny icons, 1px seams). */
  minDiffPixels?: number
  /** Clusters smaller than this (CSS px) are dropped. */
  minClusterSize?: number
  /** Alignment confidence below which the channel does not run. */
  minConfidence?: number
  /**
   * Elements narrower or shorter than this (CSS px) are not pixel-compared.
   * Measured on doc-detail (design resampled ×0.94): identical 10–14px
   * icons/dots still differ by 12–16% because 1px strokes change width
   * under resampling; the structural checks cover such elements.
   */
  minElementSize?: number
  /**
   * Skip elements carrying text (default true): font, size, weight, color
   * and content are all element data the structural channel compares
   * exactly, while their pixels differ by 10–40% between two correct
   * rasterizations at different scales.
   */
  skipText?: boolean
  /** Most `Finding.regions` boxes to emit per finding, largest first. */
  maxRegions?: number
}

export const PIXEL_DEFAULTS: Required<PixelCheckOptions> = {
  thresholds: { minor: 0.05, major: 0.15, critical: 0.3 },
  minDiffPixels: 12,
  minClusterSize: 2,
  minConfidence: 0.5,
  minElementSize: 16,
  skipText: true,
  maxRegions: 16,
}

/** Structural types that make a pixel diff on the same pair redundant. */
const DISQUALIFYING: ReadonlySet<FindingType> = new Set<FindingType>([
  "size",
  "color",
  "typography",
  "border-radius",
  "border",
  "spacing",
])

type RawFinding = Omit<Finding, "id" | "mark">

const normText = (t: string): string => t.replace(/\s+/g, " ").trim()

const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

const elementLabel = (m: ElementMatch): string => {
  const el = m.design
  return el.text !== undefined && el.text.length > 0
    ? `"${el.text.length > 40 ? `${el.text.slice(0, 40)}…` : el.text}"`
    : `${el.role ?? "element"} at (${Math.round(el.box.x)}, ${Math.round(el.box.y)})`
}

/** Severity by diff ratio; null below the minor threshold. */
export function severityForRatio(
  ratio: number,
  t: Required<PixelCheckOptions>["thresholds"] = PIXEL_DEFAULTS.thresholds,
): Severity | null {
  if (ratio >= t.critical) return "critical"
  if (ratio >= t.major) return "major"
  if (ratio >= t.minor) return "minor"
  return null
}

/**
 * Which matched pairs the pixel channel judges: non-text (unless
 * `skipText: false`), at least `minElementSize` on both sides, not a data
 * slot (differing text — pixels trivially differ), and not already covered
 * by a structural finding other than position / text-content.
 */
export function isPixelEligible(
  match: ElementMatch,
  structural: readonly Finding[],
  options: Pick<PixelCheckOptions, "minElementSize" | "skipText"> = {},
): boolean {
  const minSize = options.minElementSize ?? PIXEL_DEFAULTS.minElementSize
  const skipText = options.skipText ?? PIXEL_DEFAULTS.skipText
  const { design, impl } = match
  const hasText = (t: string | undefined): boolean => t !== undefined && normText(t).length > 0
  if (skipText && (hasText(design.text) || hasText(impl.text))) return false
  if (
    design.text !== undefined &&
    impl.text !== undefined &&
    normText(design.text) !== normText(impl.text)
  ) {
    return false
  }
  if (Math.min(design.box.w, design.box.h, impl.box.w, impl.box.h) < minSize) return false
  return !structural.some(
    (f) =>
      DISQUALIFYING.has(f.type) &&
      f.designBox !== undefined &&
      f.implBox !== undefined &&
      sameBox(f.designBox, design.box) &&
      sameBox(f.implBox, impl.box),
  )
}

/** Mask-pixel box (origin = impl element box) → impl CSS px box. */
const toImplCss = (b: Box, origin: Box, dpr: number): Box => ({
  x: origin.x + b.x / dpr,
  y: origin.y + b.y / dpr,
  w: b.w / dpr,
  h: b.h / dpr,
})

/** The same relative region of the design element's box. */
const toDesignRegion = (region: Box, implBox: Box, designBox: Box): Box => {
  const sx = designBox.w / implBox.w
  const sy = designBox.h / implBox.h
  return {
    x: designBox.x + (region.x - implBox.x) * sx,
    y: designBox.y + (region.y - implBox.y) * sy,
    w: region.w * sx,
    h: region.h * sy,
  }
}

const round1 = (n: number): number => Math.round(n * 10) / 10

const roundBox = (b: Box): Box => ({
  x: round1(b.x),
  y: round1(b.y),
  w: round1(b.w),
  h: round1(b.h),
})

function findingFor(d: MatchDiff, o: Required<PixelCheckOptions>): RawFinding | null {
  const severity = severityForRatio(d.diffRatio, o.thresholds)
  if (severity === null || d.diffPixels < o.minDiffPixels) return null
  const clusters: Cluster[] = clusterMask(d.mask, {
    minSize: Math.max(1, Math.round(o.minClusterSize * d.dpr)),
    gap: Math.max(1, Math.round(d.dpr)),
  })
  const union = unionBox(clusters)
  if (union === null) return null
  const implBox = toImplCss(union, d.match.impl.box, d.dpr)
  const designBox = toDesignRegion(implBox, d.match.impl.box, d.match.design.box)
  const pct = round1(d.diffRatio * 100)
  const regions = `${clusters.length} region${clusters.length === 1 ? "" : "s"}, ${Math.round(implBox.w)}×${Math.round(implBox.h)}px`
  // Where the difference actually IS, largest first. Capped: a stippled or
  // dithered element can cluster into hundreds of specks, and past the first
  // handful they neither locate anything nor survive as anything but weight in
  // findings.json.
  const regionBoxes = [...clusters]
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, o.maxRegions)
    .map((c) => roundBox(toImplCss(c.box, d.match.impl.box, d.dpr)))
  // Boxes within the size tolerance still differ in size: the design crop was
  // resampled onto the impl grid (measured residue ≤4%), say so.
  const db = d.match.design.box
  const ib = d.match.impl.box
  const resampled =
    Math.round(db.w) !== Math.round(ib.w) || Math.round(db.h) !== Math.round(ib.h)
      ? `; design ${Math.round(db.w)}×${Math.round(db.h)} resampled onto ${Math.round(ib.w)}×${Math.round(ib.h)}`
      : ""
  const classified =
    d.design !== undefined && d.impl !== undefined
      ? classifyRegion(d.design, d.impl, d.mask)
      : undefined
  return {
    type: "pixel-region",
    severity,
    ...(d.match.design.role !== undefined ? { role: d.match.design.role } : {}),
    designBox,
    implBox,
    regions: regionBoxes,
    expected: { diffRatio: 0 },
    actual: {
      diffRatio: round1(d.diffRatio),
      diffPixels: d.diffPixels,
      clusters: clusters.length,
      ...(classified
        ? {
            changeKind: classified.kind,
            edgeCorrelation: Math.round(classified.signals.edgeCorrelation * 100) / 100,
            meanColorDelta: Math.round(classified.signals.meanColorDelta * 100) / 100,
          }
        : {}),
    },
    message: classified
      ? `${pct}% of pixels differ in ${elementLabel(d.match)}: ${describeChange(classified.kind, classified.signals)} (${regions}${resampled})`
      : `${pct}% of pixels differ in ${elementLabel(d.match)} (${regions}${resampled})`,
  }
}

/** The one finding emitted instead of the channel when alignment is too weak. */
export function lowConfidenceFinding(alignment: Alignment, minConfidence: number): RawFinding {
  return {
    type: "pixel-region",
    severity: "minor",
    expected: { alignmentConfidence: minConfidence },
    actual: { alignmentConfidence: round1(alignment.confidence) },
    message: `pixel channel skipped: alignment confidence ${alignment.confidence.toFixed(2)} is below ${minConfidence} — element geometry did not line up well enough to compare pixels`,
  }
}

/** One diff that survived to become a finding — the mask paints these. */
export interface ReportedDiff {
  diff: MatchDiff
  finding: RawFinding
}

/** What the channel judged: the findings, and the diffs behind them. */
export interface PixelCheckResult {
  findings: RawFinding[]
  /**
   * The diffs that produced a finding, in input order, each with its finding
   * (the mask colours by `actual.changeKind`) — the ONLY ones worth painting.
   * Every other diff is either an element the channel skips by policy (text,
   * sub-`minElementSize`, a data slot) or one a structural finding already
   * explains, so painting it fills the mask with residue no finding accounts
   * for: 95.6 % of an all-diffs mask, measured on a page pair, lay inside
   * text elements.
   */
  reported: ReportedDiff[]
}

/**
 * Pure: pixel-region findings (unnumbered) for the eligible matches.
 * `structural` is the structural channel's output for the same pair.
 */
/**
 * The whole-frame backstop as a finding: difference that lies OUTSIDE every
 * matched element, which neither channel can otherwise see (the per-match
 * channel looks only inside matched boxes, and matching is driven by an
 * element model that extracts leaves — so a container's surface is invisible
 * to both).
 *
 * One finding per run, carrying the largest unexplained regions so a reader
 * can say WHERE. It is deliberately quiet: below `remainderRatio` of the frame
 * nothing is emitted, because two correct rasterisations always disagree
 * somewhere and a warning that fires on every clean run is a warning nobody
 * reads.
 */
export function remainderFinding(
  rem: Pick<RemainderDiff, "diffRatio" | "diffPixels" | "clusters">,
  minRatio = 0.004,
): RawFinding | undefined {
  if (rem.diffRatio < minRatio || rem.clusters.length === 0) return undefined
  const top = rem.clusters.slice(0, 6)
  const pct = (rem.diffRatio * 100).toFixed(2)
  const where = top
    .slice(0, 3)
    .map((c) => `${Math.round(c.box.w)}×${Math.round(c.box.h)} at (${Math.round(c.box.x)}, ${Math.round(c.box.y)})`)
    .join("; ")
  return {
    type: "pixel-region",
    severity: rem.diffRatio >= 0.02 ? "major" : "minor",
    role: "frame",
    message:
      `${pct}% of the frame differs OUTSIDE every matched element — nothing in the element model ` +
      `covers it, so no per-element finding can. ${rem.clusters.length} region(s); largest: ${where}. ` +
      `A container's background, border, radius or width is the usual cause: containers are not leaf ` +
      `elements, so they are never matched and never diffed.`,
    expected: { unexplainedDiffRatio: 0 },
    actual: { unexplainedDiffRatio: Math.round(rem.diffRatio * 10000) / 10000, regions: rem.clusters.length },
    regions: top.map((c) => c.box),
  }
}

export function runPixelChecks(
  diffs: readonly MatchDiff[],
  structural: readonly Finding[],
  options: PixelCheckOptions = {},
): PixelCheckResult {
  const o: Required<PixelCheckOptions> = { ...PIXEL_DEFAULTS, ...options }
  const findings: RawFinding[] = []
  const reported: ReportedDiff[] = []
  for (const d of diffs) {
    if (!isPixelEligible(d.match, structural, o)) continue
    const f = findingFor(d, o)
    if (f === null) continue
    findings.push(f)
    reported.push({ diff: d, finding: f })
  }
  return { findings, reported }
}
