/**
 * Pixel diff edge (effectful: reads PNGs via sharp).
 *
 * For every matched pair, crop the design element (via the inverse alignment
 * transform, at design native resolution) and the impl element (impl native
 * resolution), resample the design crop onto the impl crop's pixel grid, and
 * run an anti-aliasing-aware pixelmatch. The result per match is a binary
 * diff mask plus the diff ratio — pure data the pixel checks stage turns
 * into findings. Nothing here decides severity.
 *
 * Elements are compared INSIDE their own boxes (not at a shared frame
 * location) so a positional offset — already a structural finding — does not
 * make every pixel differ.
 */

import pixelmatch from "pixelmatch";
import sharp, { type Sharp } from "sharp";

import { clampBox, padBox, toDesignNative, toImplNative } from "../geometry.js";
import type { AlignedPair, ElementMatch } from "../pipeline.js";
import type { Box } from "../types.js";
import type { DiffMask } from "./cluster.js";
import type { MatchDiff } from "./checks.js";

export interface DiffOptions {
  /** pixelmatch per-pixel threshold (0..1, YIQ distance). Default 0.1. */
  threshold?: number;
  /** Elements smaller than this (impl native px, either side) are skipped. Default 4. */
  minBoxPx?: number;
  /**
   * Gaussian sigma applied to BOTH crops after resampling (0 = off). The
   * design side is resampled onto the impl grid, so thin strokes land on
   * different sub-pixels; a light blur makes the comparison about shapes,
   * not rasterization phase.
   */
  blur?: number;
  /**
   * Translation tolerance in impl native px: the design crop is compared at
   * every integer offset within ±shift and the best (fewest differing
   * pixels) is kept. Absorbs the sub-pixel phase left by resampling the
   * design onto the impl grid, which otherwise flags every 1px stroke.
   */
  shift?: number;
}

/**
 * shift 2: on doc-detail (design ×0.94) it cut identical-content ratios by
 * ~30–50% on icons; blur did not help consistently and stays off.
 */
export const DIFF_DEFAULTS: Required<DiffOptions> = { threshold: 0.1, minBoxPx: 4, blur: 0, shift: 2 };

interface Raw {
  data: Buffer;
  width: number;
  height: number;
}

/** Native-px crop of a PNG as RGBA, optionally resampled to `resize`. */
async function rawCrop(
  png: Sharp,
  box: Box,
  blur: number,
  resize?: { width: number; height: number },
): Promise<Raw | null> {
  const meta = await png.metadata();
  const clamped = clampBox(box, meta.width ?? 0, meta.height ?? 0);
  if (!clamped) return null;
  let pipeline = png
    .clone()
    .extract({ left: clamped.x, top: clamped.y, width: clamped.w, height: clamped.h });
  if (resize && (resize.width !== clamped.w || resize.height !== clamped.h)) {
    pipeline = pipeline.resize(resize.width, resize.height, { fit: "fill" });
  }
  if (blur > 0) pipeline = pipeline.blur(blur);
  const { data, info } = await pipeline.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Diff one matched pair; null when either crop is empty/degenerate. */
async function diffMatch(
  designPng: Sharp,
  implPng: Sharp,
  pair: AlignedPair,
  match: ElementMatch,
  o: Required<DiffOptions>,
): Promise<MatchDiff | null> {
  const { design, impl, alignment } = pair;
  const implNative = toImplNative(match.impl.box, impl.dpr);
  if (implNative.w < o.minBoxPx || implNative.h < o.minBoxPx) return null;
  const implRaw = await rawCrop(implPng, implNative, o.blur);
  if (!implRaw) return null;
  const { width, height } = implRaw;

  // Design crop with a `shift` px margin (in impl native px, mapped into
  // design px through the alignment scale), resampled so that the impl box
  // corresponds to its central width×height window.
  const s = o.shift;
  const marginCss = s / impl.dpr;
  const designBox = padBox(match.design.box, marginCss);
  const designRaw = await rawCrop(
    designPng,
    toDesignNative(designBox, alignment, design.dpr),
    o.blur,
    { width: width + 2 * s, height: height + 2 * s },
  );
  if (!designRaw || designRaw.width !== width + 2 * s || designRaw.height !== height + 2 * s) return null;

  let best: { diffPixels: number; out: Uint8Array } | null = null;
  const window = new Uint8Array(width * height * 4);
  for (let dy = -s; dy <= s; dy++) {
    for (let dx = -s; dx <= s; dx++) {
      copyWindow(designRaw, s + dx, s + dy, width, height, window);
      const out = new Uint8Array(width * height * 4);
      const diffPixels = pixelmatch(window, implRaw.data, out, width, height, {
        threshold: o.threshold,
        includeAA: false,
        diffMask: true,
      });
      if (best === null || diffPixels < best.diffPixels) best = { diffPixels, out };
      if (diffPixels === 0) break;
    }
    if (best?.diffPixels === 0) break;
  }
  const { diffPixels, out } = best!;
  // diffMask output is transparent except on differing pixels.
  const data = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i++) data[i] = out[i * 4 + 3]! > 0 ? 1 : 0;
  const mask: DiffMask = { width, height, data };
  return { match, mask, diffRatio: diffPixels / (width * height), diffPixels, dpr: impl.dpr };
}

/** Copy the width×height RGBA window at (x0, y0) of `src` into `dst`. */
function copyWindow(src: Raw, x0: number, y0: number, width: number, height: number, dst: Uint8Array): void {
  for (let y = 0; y < height; y++) {
    const from = ((y0 + y) * src.width + x0) * 4;
    dst.set(src.data.subarray(from, from + width * 4), y * width * 4);
  }
}

/** Effectful edge: per-match AA-aware diffs for the whole pair. */
export async function diffMatches(
  pair: AlignedPair,
  matches: readonly ElementMatch[],
  options: DiffOptions = {},
): Promise<MatchDiff[]> {
  const o: Required<DiffOptions> = { ...DIFF_DEFAULTS, ...options };
  const designPng = sharp(pair.design.pngPath);
  const implPng = sharp(pair.impl.pngPath);
  const out: MatchDiff[] = [];
  for (const m of matches) {
    const d = await diffMatch(designPng, implPng, pair, m, o);
    if (d) out.push(d);
  }
  return out;
}

/**
 * Effectful edge: paint every match's diff mask (red) onto a transparent
 * canvas the size of the impl PNG and write it — the report's
 * `artifacts.diffMask`.
 */
export async function writeDiffMask(
  pair: AlignedPair,
  diffs: readonly MatchDiff[],
  outPath: string,
): Promise<void> {
  const meta = await sharp(pair.impl.pngPath).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  const canvas = new Uint8Array(width * height * 4);
  for (const d of diffs) {
    const origin = toImplNative(d.match.impl.box, d.dpr);
    const ox = Math.max(0, Math.floor(origin.x));
    const oy = Math.max(0, Math.floor(origin.y));
    for (let y = 0; y < d.mask.height; y++) {
      const cy = oy + y;
      if (cy >= height) break;
      for (let x = 0; x < d.mask.width; x++) {
        const cx = ox + x;
        if (cx >= width) break;
        if (d.mask.data[y * d.mask.width + x] === 0) continue;
        const i = (cy * width + cx) * 4;
        canvas[i] = 225;
        canvas[i + 1] = 29;
        canvas[i + 2] = 72;
        canvas[i + 3] = 255;
      }
    }
  }
  await sharp(Buffer.from(canvas), { raw: { width, height, channels: 4 } })
    .png()
    .toFile(outPath);
}
