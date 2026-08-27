import { describe, expect, it } from "vitest";

import type { ComparisonReport, Finding } from "../types.js";
import { renderSummary, setGroupKey, summarizeReports } from "./summary.js";

const finding = (id: string, partial: Partial<Finding> = {}): Finding => ({
  id,
  mark: Number(id.slice(1)),
  type: "color",
  severity: "major",
  designBox: { x: 10, y: 10, w: 100, h: 20 },
  expected: { color: "rgb(26, 26, 26)" },
  actual: { color: "rgb(44, 36, 25)" },
  message: "ink",
  role: "text",
  ...partial,
});

const report = (pair: string, findings: Finding[], extra: Partial<ComparisonReport> = {}): ComparisonReport => ({
  pair,
  createdAt: "2026-08-27T10:00:00.000Z",
  design: { source: "figma", ref: "a", width: 788, height: 56 },
  impl: { source: "storybook", ref: "b", width: 792, height: 50 },
  alignment: { scale: 1, offsetX: 0, offsetY: 0, confidence: 0 },
  findings,
  suppressed: [],
  policy: {},
  verdict: { pass: findings.every((f) => f.severity === "minor"), failThreshold: "major" },
  artifacts: { overlay: "o", designPng: "d", implPng: "i" },
  ...extra,
});

const size = (id: string, w: number, aw: number): Finding =>
  finding(id, {
    type: "size",
    expected: { w, h: 19 },
    actual: { w: aw, h: 15 },
    message: `"msg" renders ${aw}×15, design says ${w}×19`,
  });

describe("setGroupKey", () => {
  it("groups categorical findings on exact values and metric ones coarsely", () => {
    expect(setGroupKey(finding("f1"))).toBe(setGroupKey(finding("f2", { designBox: { x: 0, y: 0, w: 1, h: 1 } })));
    expect(setGroupKey(finding("f1"))).not.toBe(setGroupKey(finding("f2", { actual: { color: "rgb(0, 0, 0)" } })));
    expect(setGroupKey(size("f1", 692, 302))).toBe(setGroupKey(size("f2", 500, 200)));
    expect(setGroupKey(finding("f1", { type: "spacing", expected: { gap: 8, axis: "horizontal" }, actual: { gap: 416, axis: "horizontal" } }))).not.toBe(
      setGroupKey(finding("f2", { type: "spacing", expected: { gap: 8, axis: "vertical" }, actual: { gap: 4, axis: "vertical" } })),
    );
  });
});

describe("summarizeReports", () => {
  const reports = [
    { dir: "alert--info", report: report("alert--info", [size("f1", 692, 302), finding("f2", { severity: "minor" })]) },
    {
      dir: "alert--success",
      report: report("alert--success", [size("f1", 500, 200), finding("f2", { severity: "major", instances: 3 })], {
        delta: { previousRun: "x", introduced: ["f2"], resolved: ["f9", "f8"], regressions: ["f2"] },
      }),
    },
    { dir: "alert--compact", report: report("alert--compact", [finding("f1", { severity: "minor", type: "border-radius", expected: { radius: 0 }, actual: { radius: 5 } })]) },
  ];

  it("yields one row per run with counts, verdict, confidence and delta", () => {
    const s = summarizeReports(reports);
    expect(s.runs.map((r) => [r.dir, r.findings, r.instances, r.pass, r.delta])).toEqual([
      ["alert--info", 2, 2, false, undefined],
      ["alert--success", 2, 4, false, { introduced: 1, resolved: 2, regressions: 1 }],
      ["alert--compact", 1, 1, true, undefined],
    ]);
    expect(s.totals).toEqual({
      pairs: 3,
      pass: 1,
      fail: 2,
      findings: 5,
      instances: 7,
      suppressed: 0,
      introduced: 1,
      resolved: 2,
      regressions: 1,
    });
  });

  it("groups the same cause across pairs, worst severity first, with the value spread", () => {
    const s = summarizeReports(reports);
    expect(s.groups.map((g) => [g.type, g.severity, g.pairs, g.findings, g.instances])).toEqual([
      ["size", "major", ["alert--info", "alert--success"], 2, 2],
      ["color", "major", ["alert--info", "alert--success"], 2, 4],
      ["border-radius", "minor", ["alert--compact"], 1, 1],
    ]);
    expect(s.groups[0]).toMatchObject({ range: "w 500..692→200..302, h 19→15", sample: '"msg" renders 302×15, design says 692×19' });
    expect(s.groups[1]).toMatchObject({ expected: { color: "rgb(26, 26, 26)" }, actual: { color: "rgb(44, 36, 25)" } });
    expect(s.groups[1]!.range).toBeUndefined();
  });

  it("renders a header line, one table row per run and one per cause", () => {
    const text = renderSummary(summarizeReports(reports), { title: "t" });
    expect(text).toContain("# t");
    expect(text).toContain("3 pairs: 1 PASS / 2 FAIL — 5 findings covering 7 instances, 0 suppressed; delta +1 / −2, 1 REGRESSION(S)");
    expect(text).toMatch(/\| alert--success\s+\| FAIL\s+\|\s+2 \(0\/2\/0\) \|\s+4 \|\s+0 \| 0\.00 \| \+1\/−2 R1 \|/);
    expect(text).toContain("| major | size | text | 2/3 | 2 | w 500..692→200..302, h 19→15 |");
    expect(text).toContain("| major | color | text | 2/3 | 2 (×4) | color=rgb(26, 26, 26) → color=rgb(44, 36, 25) |");
  });

  it("is empty-safe", () => {
    const s = summarizeReports([]);
    expect(s.totals.pairs).toBe(0);
    expect(renderSummary(s)).toContain("0 pairs: 0 PASS / 0 FAIL");
  });
});
