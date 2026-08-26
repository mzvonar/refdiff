import { describe, expect, it } from "vitest";

import type { ElementNode } from "../types.js";
import { gamma, matchElements } from "./match.js";

const el = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text?: string,
): ElementNode => ({
  id,
  box: { x, y, w, h },
  ...(text !== undefined ? { text } : {}),
});

describe("gamma", () => {
  it("is the manhattan distance over x, y, w, h", () => {
    expect(gamma(el("a", 0, 0, 10, 10), el("b", 3, 4, 12, 8))).toBe(3 + 4 + 2 + 2);
  });
});

describe("matchElements", () => {
  it("pairs nearest neighbors and reports the leftovers", () => {
    const design = [el("d1", 0, 0, 100, 20), el("d2", 0, 50, 100, 20), el("d3", 0, 500, 40, 40)];
    const impl = [el("i1", 2, 1, 100, 20), el("i2", 1, 52, 98, 20)];

    const result = matchElements(design, impl);

    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((m) => [m.design.id, m.impl.id])).toEqual([
      ["d1", "i1"],
      ["d2", "i2"],
    ]);
    expect(result.designOnly.map((e) => e.id)).toEqual(["d3"]);
    expect(result.implOnly).toEqual([]);
  });

  it("never pairs elements beyond maxGamma", () => {
    const result = matchElements([el("d1", 0, 0, 10, 10)], [el("i1", 200, 200, 10, 10)], {
      maxGamma: 100,
    });
    expect(result.matches).toEqual([]);
    expect(result.designOnly).toHaveLength(1);
    expect(result.implOnly).toHaveLength(1);
  });

  it("assigns greedily from the globally smallest gamma", () => {
    // i1 is close to both d1 and d2, but closest to d2 — d2 must win it.
    const design = [el("d1", 0, 0, 10, 10), el("d2", 6, 0, 10, 10)];
    const impl = [el("i1", 5, 0, 10, 10)];
    const result = matchElements(design, impl);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.design.id).toBe("d2");
    expect(result.designOnly.map((e) => e.id)).toEqual(["d1"]);
  });

  it("pairs value slots width-blind when texts differ (slot pass)", () => {
    // Design shrink-wraps "Alza.sk s.r.o." (68px), impl stretches its cell to
    // the column (198px): γ = 130 > 100, yet same anchor and line height.
    const design = [el("d1", 280, 389, 68, 14, "Alza.sk s.r.o.")];
    const impl = [el("i1", 281, 390, 198, 14, "Slovak Telekom, a.s.")];
    const result = matchElements(design, impl);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.via).toBe("slot");
    expect(result.designOnly).toEqual([]);
    expect(result.implOnly).toEqual([]);
  });

  it("slot pass never pairs non-text or far-apart elements", () => {
    // 60px apart vertically AND 250px wider: γ = 310 (no geometry match),
    // slot distance 60 > 40 (no slot match either).
    const farText = matchElements([el("d1", 0, 0, 50, 14, "a")], [el("i1", 0, 60, 300, 14, "b")]);
    expect(farText.matches).toEqual([]);
    const boxes = matchElements([el("d1", 0, 0, 50, 14)], [el("i1", 0, 0, 300, 14)]);
    expect(boxes.matches).toEqual([]);
    const disabled = matchElements(
      [el("d1", 0, 0, 50, 14, "a")],
      [el("i1", 0, 0, 300, 14, "b")],
      { slotMaxGamma: 0 },
    );
    expect(disabled.matches).toEqual([]);
  });

  it("breaks gamma ties on matching text", () => {
    // Two identical boxes; the impl element carries d2's text.
    const design = [el("d1", 0, 0, 50, 10, "alpha"), el("d2", 0, 0, 50, 10, "beta")];
    const impl = [el("i1", 0, 0, 50, 10, "beta")];
    const result = matchElements(design, impl);
    expect(result.matches[0]!.design.id).toBe("d2");
  });
});
