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

import type { ElementMatch } from "../pipeline.js";
import type { Alignment, Box, Finding, FindingType, Severity } from "../types.js";
import { clusterMask, unionBox, type Cluster, type DiffMask } from "./cluster.js";

/** What the diff edge measured for one matched pair, in impl native pixels. */
export interface MatchDiff {
  match: ElementMatch;
  /** Mask over the impl element's native-pixel box (origin = box top-left). */
  mask: DiffMask;
  /** Differing pixels (AA-excluded) / total pixels. */
  diffRatio: number;
  diffPixels: number;
  /** Native px per CSS px of the impl capture (to map mask → CSS boxes). */
  dpr: number;
}

export interface PixelCheckOptions {
  /** Diff ratios at/above these are minor / major / critical. */
  thresholds?: { minor: number; major: number; critical: number };
  /** Fewer differing pixels than this never report (tiny icons, 1px seams). */
  minDiffPixels?: number;
  /** Clusters smaller than this (CSS px) are dropped. */
  minClusterSize?: number;
  /** Alignment confidence below which the channel does not run. */
  minConfidence?: number;
  /**
   * Elements narrower or shorter than this (CSS px) are not pixel-compared.
   * Measured on doc-detail (design resampled ×0.94): identical 10–14px
   * icons/dots still differ by 12–16% because 1px strokes change width
   * under resampling; the structural checks cover such elements.
   */
  minElementSize?: number;
  /**
   * Skip elements carrying text (default true): font, size, weight, color
   * and content are all element data the structural channel compares
   * exactly, while their pixels differ by 10–40% between two correct
   * rasterizations at different scales.
   */
  skipText?: boolean;
}

export const PIXEL_DEFAULTS: Required<PixelCheckOptions> = {
  thresholds: { minor: 0.05, major: 0.15, critical: 0.3 },
  minDiffPixels: 12,
  minClusterSize: 2,
  minConfidence: 0.5,
  minElementSize: 16,
  skipText: true,
};

/** Structural types that make a pixel diff on the same pair redundant. */
const DISQUALIFYING: ReadonlySet<FindingType> = new Set<FindingType>([
  "size",
  "color",
  "typography",
  "border-radius",
  "border",
  "spacing",
]);

type RawFinding = Omit<Finding, "id" | "mark">;

const normText = (t: string): string => t.replace(/\s+/g, " ").trim();

const sameBox = (a: Box, b: Box): boolean =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const elementLabel = (m: ElementMatch): string => {
  const el = m.design;
  return el.text !== undefined && el.text.length > 0
    ? `"${el.text.length > 40 ? `${el.text.slice(0, 40)}…` : el.text}"`
    : `${el.role ?? "element"} at (${Math.round(el.box.x)}, ${Math.round(el.box.y)})`;
};

/** Severity by diff ratio; null below the minor threshold. */
export function severityForRatio(
  ratio: number,
  t: Required<PixelCheckOptions>["thresholds"] = PIXEL_DEFAULTS.thresholds,
): Severity | null {
  if (ratio >= t.critical) return "critical";
  if (ratio >= t.major) return "major";
  if (ratio >= t.minor) return "minor";
  return null;
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
  const minSize = options.minElementSize ?? PIXEL_DEFAULTS.minElementSize;
  const skipText = options.skipText ?? PIXEL_DEFAULTS.skipText;
  const { design, impl } = match;
  const hasText = (t: string | undefined): boolean => t !== undefined && normText(t).length > 0;
  if (skipText && (hasText(design.text) || hasText(impl.text))) return false;
  if (design.text !== undefined && impl.text !== undefined && normText(design.text) !== normText(impl.text)) {
    return false;
  }
  if (Math.min(design.box.w, design.box.h, impl.box.w, impl.box.h) < minSize) return false;
  return !structural.some(
    (f) =>
      DISQUALIFYING.has(f.type) &&
      f.designBox !== undefined &&
      f.implBox !== undefined &&
      sameBox(f.designBox, design.box) &&
      sameBox(f.implBox, impl.box),
  );
}

/** Mask-pixel box (origin = impl element box) → impl CSS px box. */
const toImplCss = (b: Box, origin: Box, dpr: number): Box => ({
  x: origin.x + b.x / dpr,
  y: origin.y + b.y / dpr,
  w: b.w / dpr,
  h: b.h / dpr,
});

/** The same relative region of the design element's box. */
const toDesignRegion = (region: Box, implBox: Box, designBox: Box): Box => {
  const sx = designBox.w / implBox.w;
  const sy = designBox.h / implBox.h;
  return {
    x: designBox.x + (region.x - implBox.x) * sx,
    y: designBox.y + (region.y - implBox.y) * sy,
    w: region.w * sx,
    h: region.h * sy,
  };
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

function findingFor(d: MatchDiff, o: Required<PixelCheckOptions>): RawFinding | null {
  const severity = severityForRatio(d.diffRatio, o.thresholds);
  if (severity === null || d.diffPixels < o.minDiffPixels) return null;
  const clusters: Cluster[] = clusterMask(d.mask, {
    minSize: Math.max(1, Math.round(o.minClusterSize * d.dpr)),
    gap: Math.max(1, Math.round(d.dpr)),
  });
  const union = unionBox(clusters);
  if (union === null) return null;
  const implBox = toImplCss(union, d.match.impl.box, d.dpr);
  const designBox = toDesignRegion(implBox, d.match.impl.box, d.match.design.box);
  const pct = round1(d.diffRatio * 100);
  return {
    type: "pixel-region",
    severity,
    ...(d.match.design.role !== undefined ? { role: d.match.design.role } : {}),
    designBox,
    implBox,
    expected: { diffRatio: 0 },
    actual: { diffRatio: round1(d.diffRatio), diffPixels: d.diffPixels, clusters: clusters.length },
    message: `${pct}% of pixels differ in ${elementLabel(d.match)} (${clusters.length} region${clusters.length === 1 ? "" : "s"}, ${Math.round(implBox.w)}×${Math.round(implBox.h)}px)`,
  };
}

/** The one finding emitted instead of the channel when alignment is too weak. */
export function lowConfidenceFinding(alignment: Alignment, minConfidence: number): RawFinding {
  return {
    type: "pixel-region",
    severity: "minor",
    expected: { alignmentConfidence: minConfidence },
    actual: { alignmentConfidence: round1(alignment.confidence) },
    message: `pixel channel skipped: alignment confidence ${alignment.confidence.toFixed(2)} is below ${minConfidence} — element geometry did not line up well enough to compare pixels`,
  };
}

/**
 * Pure: pixel-region findings (unnumbered) for the eligible matches.
 * `structural` is the structural channel's output for the same pair.
 */
export function runPixelChecks(
  diffs: readonly MatchDiff[],
  structural: readonly Finding[],
  options: PixelCheckOptions = {},
): RawFinding[] {
  const o: Required<PixelCheckOptions> = { ...PIXEL_DEFAULTS, ...options };
  const out: RawFinding[] = [];
  for (const d of diffs) {
    if (!isPixelEligible(d.match, structural, o)) continue;
    const f = findingFor(d, o);
    if (f !== null) out.push(f);
  }
  return out;
}
