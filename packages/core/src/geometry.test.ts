import { describe, expect, it } from "vitest";

import {
  bleedClip,
  bleedOutset,
  clampBox,
  isNoBleed,
  NO_BLEED,
  toDesignNative,
  toImplNative,
} from "./geometry.js";

describe("toDesignNative", () => {
  it("inverts offset and per-axis scale, then applies the design dpr", () => {
    const box = toDesignNative(
      { x: 103, y: 25, w: 50, h: 20 },
      { scale: 0.5, scaleY: 2, offsetX: 3, offsetY: 5, confidence: 1 },
      2,
    );
    expect(box).toEqual({ x: 400, y: 20, w: 200, h: 20 });
  });

  it("falls back to `scale` for the y axis", () => {
    expect(
      toDesignNative({ x: 10, y: 10, w: 10, h: 10 }, { scale: 2, offsetX: 0, offsetY: 0, confidence: 1 }, 1),
    ).toEqual({ x: 5, y: 5, w: 5, h: 5 });
  });

  it("is the identity at scale 1 / offset 0 / dpr 1", () => {
    const b = { x: 1.5, y: 2.5, w: 3, h: 4 };
    expect(toDesignNative(b, { scale: 1, offsetX: 0, offsetY: 0, confidence: 1 }, 1)).toEqual(b);
  });
});

describe("toImplNative / clampBox", () => {
  it("scales by dpr", () => {
    expect(toImplNative({ x: 1, y: 2, w: 3, h: 4 }, 2)).toEqual({ x: 2, y: 4, w: 6, h: 8 });
  });

  it("clamps to the image and returns null when nothing remains", () => {
    expect(clampBox({ x: -2.5, y: 1.2, w: 5, h: 5 }, 10, 4)).toEqual({ x: 0, y: 1, w: 3, h: 3 });
    expect(clampBox({ x: 20, y: 0, w: 5, h: 5 }, 10, 10)).toBeNull();
  });
});

// --- --bleed ------------------------------------------------------------
// The whole feature in one sentence: the PNG grows, the coordinates do not.
// A capture made with bleed keeps `b` px of margin around its node, so paint
// OUTSIDE the box — a focus ring, an offset outline, a drop shadow — is in the
// picture instead of clipped off it. Element boxes stay relative to the node's
// own origin, so the only thing that moves is where the PNG's (0, 0) sits, and
// these two functions are where that shift is applied for anything READING a
// PNG. (The annotator's image transforms are the same shift for anything
// DRAWING one; view-math.test.ts pins those.)
describe("bleed", () => {
  const B = { top: 4, right: 6, bottom: 8, left: 10 };

  it("shifts an impl box into the PNG by the left/top margin, in CSS px before dpr", () => {
    expect(toImplNative({ x: 1, y: 2, w: 3, h: 4 }, 2, B)).toEqual({ x: 22, y: 12, w: 6, h: 8 });
    // Size is untouched: the element is the same element, only further in.
    expect(toImplNative({ x: 0, y: 0, w: 3, h: 4 }, 2, B).w).toBe(6);
  });

  it("adds the design margin AFTER undoing the alignment, where raw design px live", () => {
    const a = { scale: 2, offsetX: 0, offsetY: 0, confidence: 1 };
    // 20 impl px → 10 raw design px; +10 left → 20; ×dpr 2 → 40.
    expect(toDesignNative({ x: 20, y: 8, w: 10, h: 10 }, a, 2, B).x).toBe(40);
    // Scaling the bleed by the alignment instead would land on 60 — the
    // double-count `normalize` is commented against.
    expect(toDesignNative({ x: 20, y: 8, w: 10, h: 10 }, a, 2, B).y).toBe(16);
  });

  it("is the identity when no bleed was captured, on both sides", () => {
    const a = { scale: 1.5, offsetX: 3, offsetY: 4, confidence: 1 };
    const b = { x: 12, y: 9, w: 4, h: 5 };
    expect(toImplNative(b, 2, NO_BLEED)).toEqual(toImplNative(b, 2));
    expect(toDesignNative(b, a, 2, NO_BLEED)).toEqual(toDesignNative(b, a, 2));
    expect(isNoBleed(NO_BLEED)).toBe(true);
    expect(isNoBleed(undefined)).toBe(true);
    expect(isNoBleed(B)).toBe(false);
  });

  it("bleedClip grows the box by the asked-for margin when there is room", () => {
    const { clip, bleed } = bleedClip({ x: 100, y: 60, w: 40, h: 20 }, 8, { width: 800, height: 600 });
    expect(bleed).toEqual({ top: 8, right: 8, bottom: 8, left: 8 });
    expect(clip).toEqual({ x: 92, y: 52, w: 56, h: 36 });
  });

  it("clamps PER SIDE, which is why Bleed has four numbers", () => {
    // Flush against the left edge and 3px from the top: those two sides shrink,
    // the other two do not. A single number could not describe this, and the
    // PNG's origin would become a guess exactly when the clamp bit.
    const { clip, bleed } = bleedClip({ x: 0, y: 3, w: 40, h: 20 }, 8, { width: 44, height: 600 });
    expect(bleed).toEqual({ top: 3, right: 4, bottom: 8, left: 0 });
    expect(clip).toEqual({ x: 0, y: 0, w: 44, h: 31 });
  });

  // THE invariant, and the one that makes bleed free rather than cheap. A crop
  // through toImplNative starts at `clip.x + bleed.left`; Playwright's element
  // screenshot starts at floor(box.x) (measured: a 109.40625px node at dpr 2
  // comes back 222 native = floor(x)..ceil(x+w)). Equal means the same bytes.
  it("puts the element's origin on the SAME pixel the element shot started from", () => {
    const box = { x: 334.78125, y: 434, w: 109.40625, h: 40 };
    for (const px of [1, 4, 8, 24]) {
      const { clip, bleed } = bleedClip(box, px, { width: 1400, height: 900 });
      expect(clip.x + bleed.left).toBe(Math.floor(box.x));
      expect(clip.y + bleed.top).toBe(Math.floor(box.y));
      // …and the PNG is whole CSS px, as the element shot's is.
      expect(Number.isInteger(clip.w)).toBe(true);
      expect(Number.isInteger(clip.h)).toBe(true);
    }
  });

  it("asks for nothing and gets nothing", () => {
    const box = { x: 100, y: 60, w: 40, h: 20 };
    const { clip, bleed } = bleedClip(box, 0, { width: 800, height: 600 });
    expect(bleed).toEqual(NO_BLEED);
    expect(clip).toEqual(box);
  });

  it("bleedOutset is the PNG's own CSS size", () => {
    expect(bleedOutset({ width: 40, height: 20 }, B)).toEqual({ width: 56, height: 32 });
    expect(bleedOutset({ width: 40, height: 20 })).toEqual({ width: 40, height: 20 });
  });
});
