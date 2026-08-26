import { describe, expect, it } from "vitest";

import type { ComparisonReport, Finding } from "../types.js";
import { boxDistance, diffFindings, diffReports } from "./delta.js";

const finding = (id: string, partial: Partial<Finding> = {}): Finding => ({
  id,
  mark: Number(id.slice(1)),
  type: "color",
  severity: "major",
  designBox: { x: 10, y: 10, w: 100, h: 20 },
  expected: { color: "#1a1a1a" },
  actual: { color: "#2c2419" },
  message: "ink",
  ...partial,
});

const report = (findings: Finding[], createdAt = "2026-08-26T10:00:00.000Z"): ComparisonReport => ({
  pair: "p",
  createdAt,
  design: { source: "dc-html", ref: "a", width: 760, height: 740 },
  impl: { source: "storybook", ref: "b", width: 760, height: 740 },
  alignment: { scale: 1, offsetX: 0, offsetY: 0, confidence: 1 },
  findings,
  suppressed: [],
  policy: {},
  verdict: { pass: false, failThreshold: "major" },
  artifacts: { overlay: "o", designPng: "d", implPng: "i" },
});

describe("diffReports", () => {
  it("yields an empty delta for the same findings even when renumbered", () => {
    const prev = report([finding("f1"), finding("f2", { type: "position", expected: { x: 1, y: 2 }, actual: { x: 3, y: 4 }, designBox: { x: 200, y: 200, w: 10, h: 10 } })]);
    const next = report([
      finding("f1", { type: "position", expected: { x: 1, y: 2 }, actual: { x: 3, y: 4 }, designBox: { x: 202, y: 201, w: 10, h: 10 } }),
      finding("f2", { designBox: { x: 11, y: 9, w: 100, h: 20 } }),
    ]);
    expect(diffReports(prev, next)).toEqual({
      previousRun: "2026-08-26T10:00:00.000Z",
      resolved: [],
      introduced: [],
    });
  });

  it("lists resolved ids from the previous run and introduced ids from the new one", () => {
    const prev = report([finding("f1"), finding("f2", { designBox: { x: 10, y: 300, w: 100, h: 20 } })]);
    const next = report([
      finding("f1", { designBox: { x: 10, y: 300, w: 100, h: 20 } }),
      finding("f2", { type: "border", expected: { borderWidth: 0 }, actual: { borderWidth: 1 } }),
    ]);
    expect(diffReports(prev, next)).toEqual({
      previousRun: "2026-08-26T10:00:00.000Z",
      resolved: ["f1"],
      introduced: ["f2"],
    });
  });

  it("does not pair the same finding at a different place", () => {
    const { resolved, introduced } = diffFindings(
      [finding("f1")],
      [finding("f1", { designBox: { x: 10, y: 40, w: 100, h: 20 } })],
    );
    expect(resolved).toEqual(["f1"]);
    expect(introduced).toEqual(["f1"]);
  });

  it("pairs one-to-one when several identical findings share a key", () => {
    const prev = [finding("f1"), finding("f2", { designBox: { x: 10, y: 60, w: 100, h: 20 } })];
    const next = [finding("f1"), finding("f2"), finding("f3", { designBox: { x: 10, y: 60, w: 100, h: 20 } })];
    expect(diffFindings(prev, next)).toEqual({ resolved: [], introduced: ["f2"] });
  });

  it("treats a changed value as resolved + introduced (different identity)", () => {
    const prev = [finding("f1")];
    const next = [finding("f1", { actual: { color: "#1b1b1b" } })];
    expect(diffFindings(prev, next)).toEqual({ resolved: ["f1"], introduced: ["f1"] });
  });

  it("measures boxes per edge and treats missing boxes as unrelated", () => {
    expect(boxDistance({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 0, w: 10, h: 10 })).toBe(2);
    expect(boxDistance({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 16, h: 10 })).toBe(6);
    expect(boxDistance(undefined, { x: 0, y: 0, w: 1, h: 1 })).toBe(Infinity);
    expect(boxDistance(undefined, undefined)).toBe(0);
  });
});
