/**
 * Diff-mask clustering (pure): connected components over a binary mask →
 * bounding boxes. 8-connectivity, iterative flood fill (no recursion depth
 * issues on large masks). Boxes come back in mask pixel coordinates; the
 * caller maps them into CSS px.
 */

import type { Box } from "../types.js";

export interface DiffMask {
  width: number;
  height: number;
  /** width*height bytes, non-zero = differing pixel. */
  data: Uint8Array;
}

export interface Cluster {
  box: Box;
  /** Differing pixels inside the cluster (not the box area). */
  pixels: number;
}

export interface ClusterOptions {
  /** Clusters whose box is smaller than this (either side, mask px) are dropped. Default 1. */
  minSize?: number;
  /** Pixels closer than this (Chebyshev) join the same cluster. Default 1 (touching). */
  gap?: number;
}

/**
 * Connected components of the mask. `gap` > 1 bridges small breaks so a
 * dashed outline or a glyph with holes reports as one region.
 */
export function clusterMask(mask: DiffMask, options: ClusterOptions = {}): Cluster[] {
  const minSize = options.minSize ?? 1;
  const gap = options.gap ?? 1;
  const { width, height, data } = mask;
  const seen = new Uint8Array(width * height);
  const out: Cluster[] = [];
  const stack: number[] = [];

  for (let start = 0; start < data.length; start++) {
    if (data[start] === 0 || seen[start] === 1) continue;
    seen[start] = 1;
    stack.push(start);
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    while (stack.length > 0) {
      const idx = stack.pop()!;
      const x = idx % width;
      const y = (idx - x) / width;
      pixels++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const y0 = Math.max(0, y - gap);
      const y1 = Math.min(height - 1, y + gap);
      const x0 = Math.max(0, x - gap);
      const x1 = Math.min(width - 1, x + gap);
      for (let ny = y0; ny <= y1; ny++) {
        for (let nx = x0; nx <= x1; nx++) {
          const n = ny * width + nx;
          if (data[n] !== 0 && seen[n] === 0) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
    }
    const box: Box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    if (box.w >= minSize && box.h >= minSize) out.push({ box, pixels });
  }
  // Deterministic order: top-to-bottom, left-to-right.
  return out.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

/** Smallest box containing every cluster; null for none. */
export function unionBox(clusters: readonly Cluster[]): Box | null {
  if (clusters.length === 0) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of clusters) {
    x0 = Math.min(x0, c.box.x);
    y0 = Math.min(y0, c.box.y);
    x1 = Math.max(x1, c.box.x + c.box.w);
    y1 = Math.max(y1, c.box.y + c.box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
