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

import type { NormalizedPair, AlignedPair } from "../pipeline.js";
import type { ElementNode } from "../types.js";

const MIN_ANCHORS = 3;
const MIN_TEXT_LENGTH = 3;
/** Anchor separation below which a pairwise slope is too noisy to use. */
const MIN_SEPARATION = 24;
/** Sane bounds for an estimated axis scale; outside → translation-only. */
const SCALE_MIN = 0.5;
const SCALE_MAX = 2;
/** Residual (px) within which an anchor counts as agreeing with the fit. */
const AGREE_PX = 10;
/** An axis fit is applied only when its median |residual| is below this. */
const AXIS_RESIDUAL_MAX = 12;

const normText = (t: string): string => t.replace(/\s+/g, " ").trim().toLowerCase();

/** Map of normalized text → element, keeping only texts unique on that side. */
function uniqueTextIndex(elements: readonly ElementNode[]): Map<string, ElementNode> {
  const buckets = new Map<string, ElementNode[]>();
  for (const el of elements) {
    if (el.text === undefined) continue;
    const key = normText(el.text);
    if (key.length < MIN_TEXT_LENGTH) continue;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(el);
    else buckets.set(key, [el]);
  }
  const unique = new Map<string, ElementNode>();
  for (const [key, els] of buckets) if (els.length === 1) unique.set(key, els[0]!);
  return unique;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

interface AxisFit {
  scale: number;
  offset: number;
}

/**
 * Theil–Sen: x' = scale·x + offset from paired 1-D samples. Falls back to
 * identity when the fit doesn't actually explain the anchors — axes are
 * judged independently, since one axis often aligns cleanly (vertical flow)
 * while the other reflects a real layout difference.
 */
function fitAxis(design: readonly number[], impl: readonly number[]): AxisFit {
  const slopes: number[] = [];
  for (let i = 0; i < design.length; i++) {
    for (let j = i + 1; j < design.length; j++) {
      const span = design[j]! - design[i]!;
      if (Math.abs(span) < MIN_SEPARATION) continue;
      slopes.push((impl[j]! - impl[i]!) / span);
    }
  }
  let scale = slopes.length >= MIN_ANCHORS ? median(slopes) : 1;
  if (scale < SCALE_MIN || scale > SCALE_MAX) scale = 1;
  const offset = median(design.map((d, i) => impl[i]! - scale * d));
  const medianResidual = median(design.map((d, i) => Math.abs(scale * d + offset - impl[i]!)));
  if (medianResidual > AXIS_RESIDUAL_MAX) return { scale: 1, offset: 0 };
  return { scale, offset };
}

export interface TransformEstimate {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
  /** Number of unique-text anchor pairs the estimate rests on. */
  anchors: number;
  /** 0..1 — fraction of anchors the fit explains, damped for few anchors. */
  confidence: number;
}

const IDENTITY: TransformEstimate = {
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
  anchors: 0,
  confidence: 0,
};

/**
 * Estimate the per-axis similarity transform mapping design element centers
 * onto impl element centers. Identity with confidence 0 when there are too
 * few anchors.
 */
export function estimateTransform(
  design: readonly ElementNode[],
  impl: readonly ElementNode[],
): TransformEstimate {
  const designIdx = uniqueTextIndex(design);
  const implIdx = uniqueTextIndex(impl);
  const dX: number[] = [];
  const dY: number[] = [];
  const iX: number[] = [];
  const iY: number[] = [];
  for (const [key, d] of designIdx) {
    const i = implIdx.get(key);
    if (!i) continue;
    dX.push(d.box.x + d.box.w / 2);
    dY.push(d.box.y + d.box.h / 2);
    iX.push(i.box.x + i.box.w / 2);
    iY.push(i.box.y + i.box.h / 2);
  }
  const anchors = dX.length;
  if (anchors < MIN_ANCHORS) return { ...IDENTITY, anchors };

  const x = fitAxis(dX, iX);
  const y = fitAxis(dY, iY);

  const agreeing = dX.filter(
    (dx, i) =>
      Math.abs(x.scale * dx + x.offset - iX[i]!) <= AGREE_PX &&
      Math.abs(y.scale * dY[i]! + y.offset - iY[i]!) <= AGREE_PX,
  ).length;
  const confidence = (agreeing / anchors) * Math.min(1, anchors / 8);

  return {
    scaleX: x.scale,
    scaleY: y.scale,
    offsetX: x.offset,
    offsetY: y.offset,
    anchors,
    confidence,
  };
}

/**
 * Pure stage: maps design elements into impl space via the anchor-estimated
 * transform and records the TOTAL design→impl transform (normalization
 * scale folded in) as `alignment`. Axes that couldn't be fitted stay at
 * identity (estimateTransform already guarantees that), and the confidence
 * says how well the anchors are explained.
 */
export function alignStructural(pair: NormalizedPair): AlignedPair {
  const t = estimateTransform(pair.design.elements, pair.impl.elements);

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
      : pair.design;

  const scale = pair.designScale * t.scaleX;
  const scaleY = pair.designScale * t.scaleY;
  return {
    ...pair,
    design,
    alignment: {
      scale,
      ...(scaleY !== scale ? { scaleY } : {}),
      offsetX: t.offsetX,
      offsetY: t.offsetY,
      confidence: t.confidence,
    },
  };
}
