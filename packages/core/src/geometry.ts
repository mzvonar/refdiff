/**
 * Box geometry shared by packaging and the pixel channel (pure).
 *
 * Boxes live in impl CSS px (the aligned frame). The design PNG is at its
 * ORIGINAL scale, so going from an aligned box to design pixels means
 * inverting the total design→impl transform first, then scaling by the
 * design DPR.
 */

import type { Alignment, Bleed, Box } from "./types.js";

/** No margin captured around the element — the shape every pre-bleed capture has. */
export const NO_BLEED: Bleed = { top: 0, right: 0, bottom: 0, left: 0 };

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
 *
 * `bleed` is the margin the capture kept AROUND the element, in that side's own
 * RAW CSS px — so it is added after the /scale, which is where raw design px
 * live. Element boxes never move: bleed shifts the PNG under them, and this is
 * the only place that shift is applied on the design side.
 */
export function toDesignNative(
  box: Box,
  alignment: Alignment,
  dpr: number,
  bleed: Bleed = NO_BLEED,
): Box {
  const sx = alignment.scale;
  const sy = alignment.scaleY ?? alignment.scale;
  return {
    x: (((box.x - alignment.offsetX) / sx) + bleed.left) * dpr,
    y: (((box.y - alignment.offsetY) / sy) + bleed.top) * dpr,
    w: (box.w / sx) * dpr,
    h: (box.h / sy) * dpr,
  };
}

/** Impl CSS px box → native pixels of the impl PNG (world px ARE impl CSS px). */
export const toImplNative = (box: Box, dpr: number, bleed: Bleed = NO_BLEED): Box =>
  scaleBox({ x: box.x + bleed.left, y: box.y + bleed.top, w: box.w, h: box.h }, dpr);

/** The PNG's own CSS size: the element, plus whatever margin was captured around it. */
export const bleedOutset = (size: { width: number; height: number }, bleed: Bleed = NO_BLEED) => ({
  width: size.width + bleed.left + bleed.right,
  height: size.height + bleed.top + bleed.bottom,
});

/** True when nothing was captured beyond the element — the fast path, and the default. */
export const isNoBleed = (b: Bleed | undefined): boolean =>
  b === undefined || (b.top === 0 && b.right === 0 && b.bottom === 0 && b.left === 0);

/**
 * The screenshot clip for `box` grown by `requested` px, and the margin that
 * actually fits — the pure half of `--bleed`.
 *
 * Each side is capped by the room between the element and the page edge, so an
 * element flush against the viewport's left keeps its top/right/bottom margin
 * and loses only the left. That asymmetry is why `Bleed` has four numbers: the
 * PNG's origin is `(-left, -top)` in element space, and a single number would
 * make it a guess exactly when the clamp bit.
 *
 * The amounts are INTEGER CSS px and the clip's ORIGIN IS FLOORED, and that pair
 * is what makes bleed free: Playwright's element screenshot expands to whole CSS
 * pixels (measured — a 109.40625 px node at dpr 2 comes back 222 native, i.e.
 * floor(x) to ceil(x+w)), so an unfloored clip would start the PNG a fraction of
 * a pixel earlier and shift every crop taken from it. `floor(x - n) === floor(x) - n`
 * for integer n, so `clip.x + bleed.left` lands on exactly the pixel the element
 * shot started from, and a crop through `toImplNative` reads the same bytes it
 * read before. Verified against a real capture: the inner window of a bled shot
 * is byte-identical to the unbled one, and the DS stroke set's 24 pairs report
 * the same 145 findings either way, messages and pixel ratios included.
 *
 * The far edge is CEILED for the same reason — it is the other half of the
 * element shot's convention. Nothing crops from the right margin, so this only
 * keeps the PNG a whole number of CSS px wide.
 */
export function bleedClip(
  box: Box,
  requested: number,
  page: { width: number; height: number },
): { clip: Box; bleed: Bleed } {
  if (!(requested > 0)) return { clip: box, bleed: NO_BLEED };
  const room = (available: number) => Math.max(0, Math.floor(Math.min(requested, available)));
  const bleed: Bleed = {
    left: room(box.x),
    top: room(box.y),
    right: room(page.width - (box.x + box.w)),
    bottom: room(page.height - (box.y + box.h)),
  };
  const x = Math.floor(box.x - bleed.left);
  const y = Math.floor(box.y - bleed.top);
  return {
    clip: {
      x,
      y,
      w: Math.ceil(box.x + box.w + bleed.right) - x,
      h: Math.ceil(box.y + box.h + bleed.bottom) - y,
    },
    bleed,
  };
}
