import { describe, expect, it } from "vitest";

import { aggregate } from "./aggregate.js";
import type { Box, Finding, Severity } from "../types.js";

let n = 0;
const box = (y: number): Box => ({ x: 10, y, w: 80, h: 16 });

const finding = (
  partial: Partial<Finding> & Pick<Finding, "type">,
  sides: { design?: boolean; impl?: boolean } = { design: true, impl: true },
): Finding => {
  n += 1;
  return {
    id: `f${n}`,
    mark: n,
    severity: "minor",
    message: `finding ${n}`,
    ...(sides.design ? { designBox: box(n * 20) } : {}),
    ...(sides.impl ? { implBox: box(n * 20) } : {}),
    ...partial,
  };
};

const color = (expected: string, actual: string, severity: Severity = "major"): Finding =>
  finding({
    type: "color",
    severity,
    expected: { color: expected },
    actual: { color: actual },
    message: `text color is ${actual}, design says ${expected}`,
  });

const position = (dx: number, dy: number, severity: Severity = "minor"): Finding =>
  finding({
    type: "position",
    severity,
    expected: { x: 100, y: 200 },
    actual: { x: 100 + dx, y: 200 + dy },
  });

const size = (dw: number, dh: number): Finding =>
  finding({ type: "size", expected: { w: 50, h: 20 }, actual: { w: 50 + dw, h: 20 + dh } });

const radius = (expected: number, actual: number): Finding =>
  finding({
    type: "border-radius",
    expected: { borderRadius: expected },
    actual: { borderRadius: actual },
  });

const typography = (expected: Record<string, string | number>, actual: Record<string, string | number>): Finding =>
  finding({ type: "typography", expected, actual });

const missing = (): Finding =>
  finding({ type: "missing-element", severity: "critical" }, { design: true });
const extra = (): Finding => finding({ type: "extra-element" }, { impl: true });

const pixel = (changeKind: string, diffRatio: number): Finding =>
  finding({
    type: "pixel-region",
    role: "icon",
    severity: "major",
    expected: { diffRatio: 0 },
    actual: { diffRatio, diffPixels: Math.round(diffRatio * 1000), clusters: 1, changeKind },
  });

describe("aggregate pixel regions", () => {
  it("groups pixel regions on (role, changeKind), not on the per-instance ratio", () => {
    const out = aggregate([pixel("shape", 0.2), pixel("shape", 0.25), pixel("shape", 0.31), pixel("color", 0.3)]);
    expect(out).toHaveLength(2);
    const shape = out.find((f) => f.actual?.["changeKind"] === "shape")!;
    expect(shape.instances).toBe(3);
    expect(out.find((f) => f.actual?.["changeKind"] === "color")!.instances).toBeUndefined();
  });
});

describe("aggregate", () => {
  it("collapses ≥3 identical color deltas into one finding with every member box", () => {
    const input = [color("#1a1a1a", "#2c2419"), color("#1a1a1a", "#2c2419"), color("#1a1a1a", "#2c2419")];
    const out = aggregate(input);
    expect(out).toHaveLength(1);
    const [agg] = out;
    expect(agg!.instances).toBe(3);
    expect(agg!.members).toEqual(input.map((f) => ({ designBox: f.designBox, implBox: f.implBox })));
    expect(agg!.designBox).toEqual(input[0]!.designBox);
    expect(agg!.message).toBe("text color is #2c2419, design says #1a1a1a ×3");
  });

  it("keys color groups on the (expected, actual) pair", () => {
    const out = aggregate([
      color("#1a1a1a", "#2c2419"),
      color("#1a1a1a", "#2c2419"),
      color("#1a1a1a", "#2c2419"),
      color("#00ff00", "#c8a000"),
      color("#00ff00", "#c8a000"),
      color("#00ff00", "#c8a000"),
      color("#1a1a1a", "#333333"),
    ]);
    expect(out.map((f) => [f.expected!["color"], f.actual!["color"], f.instances])).toEqual([
      ["#1a1a1a", "#2c2419", 3],
      ["#00ff00", "#c8a000", 3],
      ["#1a1a1a", "#333333", undefined],
    ]);
  });

  it("clusters position deltas within ±2px on the dominant axis", () => {
    const out = aggregate([position(0, -23), position(1, -22), position(-1, -24), position(0, -40)]);
    expect(out).toHaveLength(2);
    expect(out[0]!.instances).toBe(3);
    expect(out[1]!.instances).toBeUndefined();
    expect(out[1]!.actual).toEqual({ x: 100, y: 160 });
  });

  it("treats a row shift with alignment residue on the other axis as one cause", () => {
    // The real doc-detail action row: dy ≈ -24 throughout, dx drifting -1.5…-8.6.
    const row = [
      position(-1.5, -23.1),
      position(-4.6, -25.3),
      position(-7.8, -23.6),
      position(-5.5, -24.2),
      position(-8.6, -23.4),
    ];
    const out = aggregate([...row, position(-2, 16.5), position(-2, 20.6)]);
    expect(out.map((f) => f.instances)).toEqual([5, undefined, undefined]);
  });

  it("does not merge shifts of opposite direction", () => {
    const out = aggregate([position(0, -23), position(0, -23), position(0, 23), position(0, 23)]);
    expect(out).toHaveLength(4);
  });

  it("clusters size deltas the same way", () => {
    const out = aggregate([size(0, 6), size(0, 7), size(1, 6), size(20, 0)]);
    expect(out.map((f) => f.instances)).toEqual([3, undefined]);
  });

  it("groups border-radius by the radius pair and typography by its deltas", () => {
    const out = aggregate([
      radius(4, 9999),
      radius(4, 9999),
      radius(4, 9999),
      radius(8, 4),
      typography({ fontSize: 14 }, { fontSize: 16 }),
      typography({ fontSize: 14 }, { fontSize: 16 }),
      typography({ fontSize: 14 }, { fontSize: 16 }),
      typography({ fontWeight: 600 }, { fontWeight: 500 }),
    ]);
    expect(out.map((f) => [f.type, f.instances])).toEqual([
      ["border-radius", 3],
      ["border-radius", undefined],
      ["typography", 3],
      ["typography", undefined],
    ]);
  });

  it("respects minInstances", () => {
    const two = [color("#000", "#111"), color("#000", "#111")];
    expect(aggregate(two)).toHaveLength(2);
    expect(aggregate(two, { minInstances: 2 })).toHaveLength(1);
    expect(aggregate([...two, color("#000", "#111")], { minInstances: 4 })).toHaveLength(3);
  });

  it("takes the max severity of the members and re-sorts by severity", () => {
    const out = aggregate([
      color("#000", "#111", "minor"),
      missing(),
      color("#000", "#111", "major"),
      color("#000", "#111", "minor"),
    ]);
    expect(out.map((f) => [f.type, f.severity])).toEqual([
      ["missing-element", "critical"],
      ["color", "major"],
    ]);
  });

  it("renumbers ids and marks after collapsing", () => {
    const out = aggregate([position(0, -23), color("#000", "#111"), position(0, -23), position(0, -23), radius(1, 9)]);
    expect(out.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
    expect(out.map((f) => f.mark)).toEqual([1, 2, 3]);
  });

  it("never aggregates presence or text-content findings", () => {
    const input = [
      missing(),
      missing(),
      missing(),
      extra(),
      extra(),
      extra(),
      finding({ type: "text-content", expected: { text: "a" }, actual: { text: "b" } }),
      finding({ type: "text-content", expected: { text: "a" }, actual: { text: "b" } }),
      finding({ type: "text-content", expected: { text: "a" }, actual: { text: "b" } }),
    ];
    const out = aggregate(input);
    expect(out).toHaveLength(input.length);
    expect(out.every((f) => f.instances === undefined && f.members === undefined)).toBe(true);
  });

  it("does not mutate its input", () => {
    const input = [color("#000", "#111"), color("#000", "#111"), color("#000", "#111")];
    const snapshot = JSON.parse(JSON.stringify(input));
    aggregate(input);
    expect(input).toEqual(snapshot);
  });

  it("is a no-op on an empty list", () => {
    expect(aggregate([])).toEqual([]);
  });
});
