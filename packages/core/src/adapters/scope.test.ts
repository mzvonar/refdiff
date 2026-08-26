import { describe, expect, it } from "vitest";

import { pickLargestChild } from "./scope.js";

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
