import { describe, expect, it } from "vitest";

import type { ElementMatch } from "../pipeline.js";
import type { ElementNode, Finding } from "../types.js";
import { finalize } from "../structural/checks.js";
import type { DiffMask } from "./cluster.js";
import {
  isPixelEligible,
  lowConfidenceFinding,
  runPixelChecks,
  severityForRatio,
  type MatchDiff,
} from "./checks.js";

const el = (id: string, partial: Partial<ElementNode> = {}): ElementNode => ({
  id,
  box: { x: 100, y: 50, w: 20, h: 20 },
  ...partial,
});

const match = (design: ElementNode, impl: ElementNode): ElementMatch => ({
  design,
  impl,
  gamma: 0,
  via: "geometry",
});

/** A dpr-2 mask over a 20×20 CSS px box with a `n`×`n` differing square at (4,4). */
const squareDiff = (m: ElementMatch, n: number, dpr = 2): MatchDiff => {
  const width = m.impl.box.w * dpr;
  const height = m.impl.box.h * dpr;
  const data = new Uint8Array(width * height);
  for (let y = 4; y < 4 + n; y++) for (let x = 4; x < 4 + n; x++) data[y * width + x] = 1;
  const mask: DiffMask = { width, height, data };
  const diffPixels = n * n;
  return { match: m, mask, diffRatio: diffPixels / (width * height), diffPixels, dpr };
};

describe("severityForRatio", () => {
  it("maps the Argos-style thresholds", () => {
    expect(severityForRatio(0.01)).toBeNull();
    expect(severityForRatio(0.05)).toBe("minor");
    expect(severityForRatio(0.149)).toBe("minor");
    expect(severityForRatio(0.15)).toBe("major");
    expect(severityForRatio(0.3)).toBe("critical");
  });
});

describe("runPixelChecks", () => {
  const m = match(el("d", { role: "icon" }), el("i"));

  it("is quiet below the minor threshold", () => {
    // 40×40 native px = 1600; 6×6 = 36 → 2.25%
    expect(runPixelChecks([squareDiff(m, 6)], [])).toEqual([]);
  });

  it("emits a pixel-region finding with the tightened region box in CSS px", () => {
    // 20×20 = 400 differing of 1600 → 25% → major
    const [f] = runPixelChecks([squareDiff(m, 20)], []);
    expect(f).toBeDefined();
    expect(f!.type).toBe("pixel-region");
    expect(f!.severity).toBe("major");
    expect(f!.role).toBe("icon");
    // mask (4,4)-(23,23) at dpr 2 → CSS (2,2) 10×10 inside the box at (100,50)
    expect(f!.implBox).toEqual({ x: 102, y: 52, w: 10, h: 10 });
    expect(f!.designBox).toEqual({ x: 102, y: 52, w: 10, h: 10 });
    expect(f!.actual).toEqual({ diffRatio: 0.3, diffPixels: 400, clusters: 1 });
    expect(f!.message).toMatch(/25% of pixels differ in icon at \(100, 50\)/);
  });

  it("maps the region into the design box when the boxes differ in size", () => {
    const shifted = match(
      el("d", { box: { x: 0, y: 0, w: 40, h: 40 } }),
      el("i", { box: { x: 100, y: 50, w: 20, h: 20 } }),
    );
    const [f] = runPixelChecks([squareDiff(shifted, 20)], []);
    expect(f!.designBox).toEqual({ x: 4, y: 4, w: 20, h: 20 });
  });

  it("does not report a pair the structural channel already covered", () => {
    const structural: Finding[] = finalize([
      {
        type: "color",
        severity: "major",
        designBox: m.design.box,
        implBox: m.impl.box,
        message: "color",
      },
    ]);
    expect(runPixelChecks([squareDiff(m, 20)], structural)).toEqual([]);
  });

  it("still reports a pair that only has a position finding", () => {
    const structural: Finding[] = finalize([
      { type: "position", severity: "major", designBox: m.design.box, implBox: m.impl.box, message: "pos" },
    ]);
    expect(runPixelChecks([squareDiff(m, 20)], structural)).toHaveLength(1);
  });

  it("skips text elements by default — element data already describes them", () => {
    const text = match(el("d", { text: "Save" }), el("i", { text: "Save" }));
    expect(isPixelEligible(text, [])).toBe(false);
    expect(isPixelEligible(text, [], { skipText: false })).toBe(true);
    expect(runPixelChecks([squareDiff(text, 20)], [])).toEqual([]);
    expect(runPixelChecks([squareDiff(text, 20)], [], { skipText: false })).toHaveLength(1);
  });

  it("skips data slots (differing text) even when text is compared", () => {
    const slot = match(el("d", { text: "Alza" }), el("i", { text: "Telekom" }));
    expect(isPixelEligible(slot, [], { skipText: false })).toBe(false);
  });

  it("skips elements below minElementSize on either side", () => {
    const small = match(el("d", { box: { x: 0, y: 0, w: 14, h: 14 } }), el("i"));
    expect(isPixelEligible(small, [])).toBe(false);
    expect(isPixelEligible(small, [], { minElementSize: 10 })).toBe(true);
    expect(isPixelEligible(m, [])).toBe(true); // 20×20 ≥ 16
  });

  it("respects minDiffPixels", () => {
    expect(runPixelChecks([squareDiff(m, 20)], [], { minDiffPixels: 401 })).toEqual([]);
  });
});

describe("lowConfidenceFinding", () => {
  it("is a single boxless minor finding carrying the measured confidence", () => {
    const f = lowConfidenceFinding(
      { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.31 },
      0.5,
    );
    expect(f.type).toBe("pixel-region");
    expect(f.severity).toBe("minor");
    expect(f.implBox).toBeUndefined();
    expect(f.actual).toEqual({ alignmentConfidence: 0.3 });
    expect(f.message).toMatch(/0\.31 is below 0\.5/);
  });
});

describe("finalize across channels", () => {
  it("numbers structural and pixel findings consistently, severity first", () => {
    const merged = finalize([
      { type: "position", severity: "minor", implBox: { x: 0, y: 0, w: 1, h: 1 }, message: "p" },
      { type: "pixel-region", severity: "critical", implBox: { x: 0, y: 9, w: 1, h: 1 }, message: "x" },
    ]);
    expect(merged.map((f) => [f.id, f.type])).toEqual([
      ["f1", "pixel-region"],
      ["f2", "position"],
    ]);
    expect(merged.map((f) => f.mark)).toEqual([1, 2]);
  });
});
