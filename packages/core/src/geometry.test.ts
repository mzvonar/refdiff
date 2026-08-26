import { describe, expect, it } from "vitest";

import { clampBox, toDesignNative, toImplNative } from "./geometry.js";

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
