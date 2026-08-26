import { describe, expect, it } from "vitest";

import type { Capture } from "./pipeline.js";
import { normalize, pairRefs } from "./pipeline.js";
import { all, andThen, err, isErr, isOk, map, ok } from "./result.js";

const capture = (side: "design" | "impl", width: number, height: number): Capture => ({
  side,
  source: side === "design" ? "dc-html" : "storybook",
  ref: side,
  pngPath: `/tmp/${side}.png`,
  width,
  height,
  dpr: 2,
  elements: [{ id: "e0", box: { x: 10, y: 20, w: 100, h: 50 } }],
});

describe("normalize", () => {
  it("keeps scale 1 when widths agree within epsilon", () => {
    const pair = pairRefs("p", capture("design", 760, 740), capture("impl", 761, 740));
    const n = normalize(pair);
    expect(n.designScale).toBe(1);
    expect(n.design).toBe(pair.design); // untouched, not cloned
  });

  it("rescales design geometry into impl space without mutating input", () => {
    const design = capture("design", 1520, 1480);
    const pair = pairRefs("p", design, capture("impl", 760, 740));
    const n = normalize(pair);
    expect(n.designScale).toBe(0.5);
    expect(n.design.width).toBe(760);
    expect(n.design.elements[0]!.box).toEqual({ x: 5, y: 10, w: 50, h: 25 });
    // input untouched
    expect(design.elements[0]!.box).toEqual({ x: 10, y: 20, w: 100, h: 50 });
  });
});

describe("Result", () => {
  it("maps and chains over Ok, short-circuits on Err", () => {
    expect(map(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(andThen(ok(2), (n) => err(`no ${n}`))).toEqual(err("no 2"));
    expect(map(err("boom"), (n: number) => n * 2)).toEqual(err("boom"));
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err("x"))).toBe(true);
  });

  it("all collects values or returns the first Err", () => {
    expect(all([ok(1), ok(2)])).toEqual(ok([1, 2]));
    expect(all([ok(1), err("a"), err("b")])).toEqual(err("a"));
  });
});
