/**
 * Box geometry shared by packaging and the pixel channel (pure).
 *
 * Boxes live in impl CSS px (the aligned frame). The design PNG is at its
 * ORIGINAL scale, so going from an aligned box to design pixels means
 * inverting the total design→impl transform first, then scaling by the
 * design DPR.
 */

import type { Alignment, Box } from "./types.js";

export const scaleBox = (box: Box, s: number): Box => ({
  x: box.x * s,
  y: box.y * s,
  w: box.w * s,
  h: box.h * s,
});

export const padBox = (box: Box, p: number): Box => ({
  x: box.x - p,
  y: box.y - p,
  w: box.w + 2 * p,
  h: box.h + 2 * p,
});

/** Integer-clamps a box into [0, width) × [0, height); null when nothing remains. */
export function clampBox(box: Box, width: number, height: number): Box | null {
  const x = Math.max(0, Math.floor(box.x));
  const y = Math.max(0, Math.floor(box.y));
  const w = Math.min(Math.ceil(box.x + box.w), width) - x;
  const h = Math.min(Math.ceil(box.y + box.h), height) - y;
  if (x >= width || y >= height || w < 1 || h < 1) return null;
  return { x, y, w, h };
}

/**
 * Aligned (impl CSS px) box → native pixels of the design PNG: undo the
 * design→impl offset and per-axis scale, then apply the design DPR.
 */
export function toDesignNative(box: Box, alignment: Alignment, dpr: number): Box {
  const sx = alignment.scale;
  const sy = alignment.scaleY ?? alignment.scale;
  return {
    x: ((box.x - alignment.offsetX) / sx) * dpr,
    y: ((box.y - alignment.offsetY) / sy) * dpr,
    w: (box.w / sx) * dpr,
    h: (box.h / sy) * dpr,
  };
}

/** Impl CSS px box → native pixels of the impl PNG. */
export const toImplNative = (box: Box, dpr: number): Box => scaleBox(box, dpr);
