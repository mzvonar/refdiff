import { describe, expect, it } from "vitest";

import { CANVAS_SLACK, isFluidFrame, pickLargestChild } from "./scope.js";

describe("isFluidFrame (full-bleed comp vs fixed artboard)", () => {
  it("a full-bleed page comp fills the padded canvas — fluid", () => {
    // RefDiff Library: viewport 1180, canvas 1300, frame measured 1300 (min-height:100vh, width:auto).
    expect(isFluidFrame(1300, 1180 + CANVAS_SLACK)).toBe(true);
  });

  it("a fixed artboard stays its own size inside the slack — not fluid", () => {
    // uctoinak doc-detail: 1200 viewport, canvas 1320, frame 1200 — must NOT be resized.
    expect(isFluidFrame(1200, 1200 + CANVAS_SLACK)).toBe(false);
    // a 680×740 component artboard on a 1440 canvas
    expect(isFluidFrame(680, 1440 + CANVAS_SLACK)).toBe(false);
  });

  it("tolerates sub-pixel and scrollbar slop at the canvas edge", () => {
    expect(isFluidFrame(1298.5, 1300)).toBe(true);
    expect(isFluidFrame(1290, 1300)).toBe(false);
  });
});

describe("pickLargestChild (scope fallback)", () => {
  it("picks the backdrop over the label strip and notes", () => {
    const picked = pickLargestChild([
      { index: 0, w: 480, h: 22 }, // label strip: "1a · Desktop — modál · demo stav: …"
      { index: 1, w: 800, h: 1020 }, // backdrop holding the modal
      { index: 2, w: 739, h: 120 }, // designer notes paragraph
    ]);
    expect(picked?.index).toBe(1);
  });

  it("returns undefined when nothing is big enough to be UI", () => {
    expect(pickLargestChild([{ index: 0, w: 120, h: 22 }])).toBeUndefined();
    expect(pickLargestChild([])).toBeUndefined();
  });

  it("resolves ties to the earlier child", () => {
    const picked = pickLargestChild([
      { index: 0, w: 400, h: 400 },
      { index: 1, w: 400, h: 400 },
    ]);
    expect(picked?.index).toBe(0);
  });
});
