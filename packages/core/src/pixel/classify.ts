/**
 * Pixel-region sub-classification (pure).
 *
 * A `pixel-region` finding that only says "N% differ" leaves the model to
 * look at the crops. Over the two crops the diff edge already holds in
 * memory (design resampled onto the impl grid at the best shift, and the
 * impl element) plus the diff mask, this stage computes a small signal set —
 * edge structure, chroma, luminance, where the differing pixels sit — and
 * maps it onto a code-actionable `changeKind`:
 *
 *   color         same shape, different color (recolor / opacity)
 *   hue-rotation  color, and the hue flipped (both sides saturated)
 *   shape         both sides have structure and the edges do not line up
 *   added         structure in the implementation only
 *   removed       structure in the design only
 *   stroke        the difference hugs the element's perimeter (outline/border)
 *   noise         small, along shared edges — rasterization / resample residue
 *
 * Signal set after @blazediff/interpret-native (evaluated, not adopted — see
 * architecture.md "Open decisions"); thresholds calibrated on the DS Button
 * set (research.md "pixel channel"). Nothing here decides severity.
 */

import type { DiffMask } from "./cluster.js";

/** RGBA raster, row-major, 4 bytes per pixel. */
export interface RawImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export type ChangeKind = "color" | "hue-rotation" | "shape" | "added" | "removed" | "stroke" | "noise";

export interface RegionSignals {
  /** Differing pixels / all pixels. */
  diffRatio: number;
  /**
   * Exact Dice overlap of the two edge maps (after the diff's shift search);
   * 1 = same structure. Measured on the DS Button icons: same glyph through
   * the 24→21px resample 0.90–0.95, a different glyph 0.27–0.45.
   */
  edgeCorrelation: number;
  /** Edge pixels / area inside the (dilated) differing region, per side. */
  edgeDensityDesign: number;
  edgeDensityImpl: number;
  /** Share of differing pixels within 1px of an edge on either side. */
  edgeAdjacentRatio: number;
  /** Mean Euclidean RGB distance (0..1) over differing pixels. */
  meanColorDelta: number;
  /** Mean impl − design luminance (−1..1) over differing pixels. */
  meanDy: number;
  /** Cosine between the mean YIQ chroma vectors; 1 when either side is grey. */
  chromaCos: number;
  satDesign: number;
  satImpl: number;
  /** Share of differing pixels in the outer 15 % band of the box. */
  perimeterRatio: number;
}

export interface ClassifyOptions {
  /** Luminance step (0..255) that makes an edge. */
  edgeThreshold?: number;
  /** Edge correlation at/above which the two sides have the same structure. */
  sameStructure?: number;
  /** `noise` needs this share of differing pixels hugging shared edges … */
  noiseEdgeAdjacent?: number;
  /** … and a diff ratio below this. */
  noiseMaxRatio?: number;
  /** One side's edge density must exceed the other's by this factor for added/removed. */
  asymmetryFactor?: number;
  /** The flat side must be below this edge density for added/removed. */
  flatDensity?: number;
  /** `stroke` needs this share of differing pixels in the perimeter band. */
  strokePerimeter?: number;
  /** Chroma magnitude (0..255 scale) under which a side counts as grey. */
  minSaturation?: number;
}

export const CLASSIFY_DEFAULTS: Required<ClassifyOptions> = {
  edgeThreshold: 24,
  sameStructure: 0.7,
  noiseEdgeAdjacent: 0.8,
  noiseMaxRatio: 0.1,
  asymmetryFactor: 3,
  flatDensity: 0.02,
  strokePerimeter: 0.7,
  minSaturation: 8,
};

const lum = (d: Uint8Array, i: number): number => 0.299 * d[i]! + 0.587 * d[i + 1]! + 0.114 * d[i + 2]!;

/** Binary edge map: luminance step above `t` to the right or downward neighbour. */
function edgeMap(img: RawImage, t: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const l = lum(data, i);
      const dx = x + 1 < w ? Math.abs(lum(data, i + 4) - l) : 0;
      const dy = y + 1 < h ? Math.abs(lum(data, i + w * 4) - l) : 0;
      if (Math.max(dx, dy) > t) out[y * w + x] = 1;
    }
  }
  return out;
}

/** 3×3 dilation of a binary map. */
function dilate(map: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (map[y * w + x] === 0) continue;
      for (let yy = Math.max(0, y - 1); yy <= Math.min(h - 1, y + 1); yy++) {
        for (let xx = Math.max(0, x - 1); xx <= Math.min(w - 1, x + 1); xx++) out[yy * w + xx] = 1;
      }
    }
  }
  return out;
}

const count = (map: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < map.length; i++) n += map[i]!;
  return n;
};

/** Pure: the signal set for one differing region. */
export function regionSignals(
  design: RawImage,
  impl: RawImage,
  mask: DiffMask,
  options: Pick<ClassifyOptions, "edgeThreshold" | "minSaturation"> = {},
): RegionSignals {
  const t = options.edgeThreshold ?? CLASSIFY_DEFAULTS.edgeThreshold;
  const minSat = options.minSaturation ?? CLASSIFY_DEFAULTS.minSaturation;
  const w = Math.min(design.width, impl.width, mask.width);
  const h = Math.min(design.height, impl.height, mask.height);
  const area = w * h;

  const ed = edgeMap(design, t);
  const ei = edgeMap(impl, t);
  const edD = dilate(ed, design.width, design.height);
  const eiD = dilate(ei, impl.width, impl.height);

  // Region = the differing pixels, dilated by 1. Every structure signal is
  // measured INSIDE it: edges the two sides share outside the region (an
  // unchanged outer ring around a swapped glyph) say nothing about the change.
  const maskD = dilate(mask.data, mask.width, mask.height);
  const band = Math.max(1, Math.round(0.15 * Math.min(w, h)));

  // Exact Dice over the edge maps inside the region. A 1px tolerance was
  // tried and rejected: at 42 native px two different circular glyphs
  // overlap 0.80 with it.
  let edN = 0;
  let eiN = 0;
  let both = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (maskD[y * mask.width + x] !== 1) continue;
      const a = ed[y * design.width + x] === 1;
      const b = ei[y * impl.width + x] === 1;
      if (a) edN++;
      if (b) eiN++;
      if (a && b) both++;
    }
  }
  const edgeCorrelation = edN + eiN === 0 ? 1 : (2 * both) / (edN + eiN);

  let diff = 0;
  let regionArea = 0;
  let edInRegion = 0;
  let eiInRegion = 0;
  let adjacent = 0;
  let perimeter = 0;
  let colorDelta = 0;
  let dy = 0;
  let iD = 0;
  let qD = 0;
  let iI = 0;
  let qI = 0;
  let satD = 0;
  let satI = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const mi = y * mask.width + x;
      if (maskD[mi] === 1) {
        regionArea++;
        edInRegion += ed[y * design.width + x]!;
        eiInRegion += ei[y * impl.width + x]!;
      }
      if (mask.data[mi] !== 1) continue;
      diff++;
      if (edD[y * design.width + x] === 1 || eiD[y * impl.width + x] === 1) adjacent++;
      if (x < band || y < band || x >= w - band || y >= h - band) perimeter++;
      const a = (y * design.width + x) * 4;
      const b = (y * impl.width + x) * 4;
      const dr = design.data[a]!;
      const dg = design.data[a + 1]!;
      const db = design.data[a + 2]!;
      const ir = impl.data[b]!;
      const ig = impl.data[b + 1]!;
      const ib = impl.data[b + 2]!;
      colorDelta += Math.sqrt((dr - ir) ** 2 + (dg - ig) ** 2 + (db - ib) ** 2) / 441.673;
      dy += (lum(impl.data, b) - lum(design.data, a)) / 255;
      // YIQ chroma
      const di = 0.596 * dr - 0.274 * dg - 0.322 * db;
      const dq = 0.211 * dr - 0.523 * dg + 0.312 * db;
      const ii = 0.596 * ir - 0.274 * ig - 0.322 * ib;
      const iq = 0.211 * ir - 0.523 * ig + 0.312 * ib;
      iD += di;
      qD += dq;
      iI += ii;
      qI += iq;
      satD += Math.hypot(di, dq);
      satI += Math.hypot(ii, iq);
    }
  }
  const n = Math.max(1, diff);
  const magD = Math.hypot(iD, qD) / n;
  const magI = Math.hypot(iI, qI) / n;
  const chromaCos =
    magD < minSat || magI < minSat ? 1 : (iD * iI + qD * qI) / (Math.hypot(iD, qD) * Math.hypot(iI, qI));

  return {
    diffRatio: area === 0 ? 0 : diff / area,
    edgeCorrelation,
    edgeDensityDesign: regionArea === 0 ? 0 : edInRegion / regionArea,
    edgeDensityImpl: regionArea === 0 ? 0 : eiInRegion / regionArea,
    edgeAdjacentRatio: adjacent / n,
    meanColorDelta: colorDelta / n,
    meanDy: dy / n,
    chromaCos,
    satDesign: satD / n,
    satImpl: satI / n,
    perimeterRatio: perimeter / n,
  };
}

/** Pure: the change kind for a signal set. Order matters; see the module doc. */
export function classifyChange(s: RegionSignals, options: ClassifyOptions = {}): ChangeKind {
  const o = { ...CLASSIFY_DEFAULTS, ...options };
  const sameStructure = s.edgeCorrelation >= o.sameStructure;
  if (sameStructure && s.edgeAdjacentRatio >= o.noiseEdgeAdjacent && s.diffRatio < o.noiseMaxRatio) return "noise";
  // A difference that hugs the perimeter is the outline — whether it changed
  // or appeared (so before the one-sided test).
  if (s.perimeterRatio >= o.strokePerimeter && s.diffRatio < 0.5) return "stroke";
  // A one-sided structure: the other side is flat where this one has edges.
  const dD = s.edgeDensityDesign;
  const dI = s.edgeDensityImpl;
  if (!sameStructure && dD >= o.asymmetryFactor * dI && dI < o.flatDensity && dD > 0) return "removed";
  if (!sameStructure && dI >= o.asymmetryFactor * dD && dD < o.flatDensity && dI > 0) return "added";
  if (sameStructure) {
    return s.chromaCos < 0 && s.satDesign >= o.minSaturation && s.satImpl >= o.minSaturation
      ? "hue-rotation"
      : "color";
  }
  return "shape";
}

export function classifyRegion(
  design: RawImage,
  impl: RawImage,
  mask: DiffMask,
  options: ClassifyOptions = {},
): { kind: ChangeKind; signals: RegionSignals } {
  const signals = regionSignals(design, impl, mask, options);
  return { kind: classifyChange(signals, options), signals };
}

/** Message fragment per kind — code-actionable, no numbers the caller does not add. */
export function describeChange(kind: ChangeKind, s: RegionSignals): string {
  const shade = s.meanDy > 0.05 ? ", lighter" : s.meanDy < -0.05 ? ", darker" : "";
  switch (kind) {
    case "color":
      return `recolored (same shape${shade})`;
    case "hue-rotation":
      return "recolored to a different hue (same shape)";
    case "shape":
      return (
        "shape differs (edges do not line up — a different glyph or drawing)" +
        (s.edgeAdjacentRatio < 0.7 ? ", and the fill around it is recolored" : "")
      );
    case "added":
      return "content present in the implementation only";
    case "removed":
      return "content present in the design only";
    case "stroke":
      return "outline/stroke differs (the difference hugs the perimeter)";
    case "noise":
      return "rasterization residue along shared edges (same shape, same color)";
  }
}
