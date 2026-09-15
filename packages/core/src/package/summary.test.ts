import type { ComparisonReport, Finding, MatchingStats } from "../types.js"

import { describe, expect, it } from "vitest"

import { formatAlignment, renderSummary, setGroupKey, summarizeReports } from "./summary.js"

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
})

const report = (
  pair: string,
  findings: Finding[],
  extra: Partial<ComparisonReport> = {},
): ComparisonReport => ({
  pair,
  createdAt: "2026-08-27T10:00:00.000Z",
  design: { source: "figma", ref: "a", width: 788, height: 56 },
  impl: { source: "storybook", ref: "b", width: 792, height: 50 },
  alignment: { scale: 1, offsetX: 0, offsetY: 0, confidence: 0 },
  findings,
  suppressed: [],
  policy: {},
  verdict: { pass: findings.every((f) => f.severity === "minor"), failThreshold: "major" },
  artifacts: { designPng: "d", implPng: "i" },
  ...extra,
})

const size = (id: string, w: number, aw: number): Finding =>
  finding(id, {
    type: "size",
    expected: { w, h: 19 },
    actual: { w: aw, h: 15 },
    message: `"msg" renders ${aw}×15, design says ${w}×19`,
  })

describe("setGroupKey", () => {
  it("groups categorical findings on exact values and metric ones coarsely", () => {
    expect(setGroupKey(finding("f1"))).toBe(
      setGroupKey(finding("f2", { designBox: { x: 0, y: 0, w: 1, h: 1 } })),
    )
    expect(setGroupKey(finding("f1"))).not.toBe(
      setGroupKey(finding("f2", { actual: { color: "rgb(0, 0, 0)" } })),
    )
    expect(setGroupKey(size("f1", 692, 302))).toBe(setGroupKey(size("f2", 500, 200)))
    expect(
      setGroupKey(
        finding("f1", {
          type: "spacing",
          expected: { gap: 8, axis: "horizontal" },
          actual: { gap: 416, axis: "horizontal" },
        }),
      ),
    ).not.toBe(
      setGroupKey(
        finding("f2", {
          type: "spacing",
          expected: { gap: 8, axis: "vertical" },
          actual: { gap: 4, axis: "vertical" },
        }),
      ),
    )
  })
})

describe("summarizeReports", () => {
  const reports = [
    {
      dir: "alert--info",
      report: report("alert--info", [size("f1", 692, 302), finding("f2", { severity: "minor" })]),
    },
    {
      dir: "alert--success",
      report: report(
        "alert--success",
        [size("f1", 500, 200), finding("f2", { severity: "major", instances: 3 })],
        {
          delta: {
            previousRun: "x",
            introduced: ["f2"],
            resolved: ["f9", "f8"],
            regressions: ["f2"],
          },
        },
      ),
    },
    {
      dir: "alert--compact",
      report: report("alert--compact", [
        finding("f1", {
          severity: "minor",
          type: "border-radius",
          expected: { radius: 0 },
          actual: { radius: 5 },
        }),
      ]),
    },
  ]

  it("yields one row per run with counts, verdict, confidence and delta", () => {
    const s = summarizeReports(reports)
    expect(s.runs.map((r) => [r.dir, r.findings, r.instances, r.pass, r.delta])).toEqual([
      ["alert--info", 2, 2, false, undefined],
      ["alert--success", 2, 4, false, { introduced: 1, resolved: 2, regressions: 1 }],
      ["alert--compact", 1, 1, true, undefined],
    ])
    expect(s.totals).toEqual({
      pairs: 3,
      pass: 1,
      fail: 2,
      findings: 5,
      instances: 7,
      suppressed: 0,
      // These fixtures build findings by hand, with no pairing behind them —
      // nothing to vouch for and nothing to doubt.
      unverified: 0,
      introduced: 1,
      resolved: 2,
      regressions: 1,
    })
  })

  it("groups the same cause across pairs, worst severity first, with the value spread", () => {
    const s = summarizeReports(reports)
    expect(s.groups.map((g) => [g.type, g.severity, g.pairs, g.findings, g.instances])).toEqual([
      ["size", "major", ["alert--info", "alert--success"], 2, 2],
      ["color", "major", ["alert--info", "alert--success"], 2, 4],
      ["border-radius", "minor", ["alert--compact"], 1, 1],
    ])
    expect(s.groups[0]).toMatchObject({
      range: "w 500..692→200..302, h 19→15",
      sample: '"msg" renders 302×15, design says 692×19',
    })
    expect(s.groups[1]).toMatchObject({
      expected: { color: "rgb(26, 26, 26)" },
      actual: { color: "rgb(44, 36, 25)" },
    })
    expect(s.groups[1]!.range).toBeUndefined()
  })

  it("renders a header line, one table row per run and one per cause", () => {
    const text = renderSummary(summarizeReports(reports), { title: "t" })
    expect(text).toContain("# t")
    expect(text).toContain(
      "3 pairs: 1 PASS / 2 FAIL — 5 findings covering 7 instances, 0 suppressed; delta +1 / −2, 1 REGRESSION(S)",
    )
    expect(text).toMatch(
      /\| alert--success\s+\| FAIL\s+\|\s+2 \(0\/2\/0\) \|\s+4 \|\s+0 \|\s+0 \| 0\.00 \| 1 \/ 0,0\s+\| \+1\/−2 R1 \|/,
    )
    expect(text).toContain("| major | size | text | 2/3 | 2 | w 500..692→200..302, h 19→15 |")
    expect(text).toContain(
      "| major | color | text | 2/3 | 2 (×4) | color=rgb(26, 26, 26) → color=rgb(44, 36, 25) |",
    )
  })

  it("is empty-safe", () => {
    const s = summarizeReports([])
    expect(s.totals.pairs).toBe(0)
    expect(renderSummary(s)).toContain("0 pairs: 0 PASS / 0 FAIL")
  })

  it("counts findings whose pairing nothing vouches for, apart from the total", () => {
    // A set summary that reports 3 findings without saying one of them rests on a
    // pairing formed by geometry alone is the report this instrument exists to stop
    // a reader from trusting — see `isUnverified` in structural/checks.ts.
    const s = summarizeReports([
      {
        dir: "weak",
        report: report("weak", [
          finding("f1", { via: "text", gamma: 0 }),
          finding("f2", { via: "geometry", gamma: 98.7, unverified: true }),
          finding("f3", { type: "missing-element", severity: "critical" }),
        ]),
      },
    ])
    expect(s.runs[0]).toMatchObject({
      findings: 3,
      unverified: 1,
      via: { text: 1, slot: 0, geometry: 1 },
    })
    expect(s.totals.unverified).toBe(1)
    const text = renderSummary(s)
    expect(text).toContain("1 of 3 findings are UNVERIFIED")
    expect(text).toContain(
      "pairing evidence across the set: 1 by text, 0 by slot, 1 by geometry, 1 resting on no pair",
    )
    // …and the per-pair table grows a column for it rather than burying it in prose.
    expect(text).toContain("| unver |")
  })

  it("says nothing about provenance when no finding is flagged", () => {
    expect(renderSummary(summarizeReports(reports))).not.toContain("UNVERIFIED")
  })
})

describe("the matching table — the corpus baseline's own instrument", () => {
  const matching = (over: Partial<MatchingStats> = {}): MatchingStats => ({
    designLeaves: 80,
    implLeaves: 106,
    matched: 42,
    matchedVia: { text: 33, slot: 1, geometry: 8 },
    designOnly: 38,
    implOnly: 64,
    vetoed: 0,
    ...over,
  })

  it("carries the matcher's counts per pair and totals only the pairs that recorded them", () => {
    // The second pair predates `ComparisonReport.matching`. Folding it in as
    // zeros would say the corpus matched nothing there, which is a different
    // claim from not having measured it — the reason the field is optional.
    const s = summarizeReports([
      { dir: "witness", report: report("witness", [], { matching: matching() }) },
      { dir: "old", report: report("old", []) },
    ])
    expect(s.runs[0]!.matching).toEqual(matching())
    expect(s.runs[1]!.matching).toBeUndefined()
    expect(s.matching).toEqual({ ...matching(), pairs: 1 })

    const text = renderSummary(s)
    expect(text).toContain("| pair    | design | impl | matched | text | slot | geom |")
    expect(text).toMatch(/\| witness \|\s+80 \|\s+106 \|\s+42 \|\s+33 \|\s+1 \|\s+8 \|\s+38 \|/)
    expect(text).toContain("1 of 2 pair(s) predate this record and are omitted")
    // `old` keeps its row in the RUN table above — it is a real pair with real
    // findings. It is only the matching table it has nothing to say in.
    expect(text).toMatch(/^\| old /m)
    expect(text.slice(text.indexOf("Matching —"))).not.toMatch(/^\| old /m)
  })

  it("is absent entirely when no report recorded any matching", () => {
    const s = summarizeReports([{ dir: "old", report: report("old", [finding("f1")]) }])
    expect(s.matching).toBeUndefined()
    expect(renderSummary(s)).not.toContain("| matched |")
  })

  it("breaks each pair's findings down by type, with the presence types first", () => {
    // What a matching change MOVES: refusing a pair replaces one property
    // finding with one missing-element and one extra-element, so the severity
    // split alone cannot see it happen.
    const s = summarizeReports([
      {
        dir: "witness",
        report: report("witness", [
          finding("f1"),
          finding("f2", { type: "missing-element", severity: "critical" }),
          finding("f3", { type: "extra-element", severity: "critical" }),
          finding("f4", { type: "missing-element", severity: "critical" }),
        ]),
      },
    ])
    expect(s.runs[0]!.types).toEqual({ color: 1, "missing-element": 2, "extra-element": 1 })
    const text = renderSummary(s)
    expect(text).toContain("Findings by type:")
    expect(text).toContain("| pair    | miss | extra | color | all |")
    expect(text).toMatch(/\| witness \|\s+2 \|\s+1 \|\s+1 \|\s+4 \|/)
  })
})

describe("the align column — the transform beside the confidence", () => {
  it("prints the identity as `1 / 0,0` and a non-identity fit to the digit that matters", () => {
    expect(formatAlignment({ scale: 1, offsetX: 0, offsetY: 0 })).toBe("1 / 0,0")
    expect(formatAlignment({ scale: 1.00175, offsetX: -0.54, offsetY: -1.98 })).toBe(
      "1.002 / −0.5,−2.0",
    )
    expect(formatAlignment({ scale: 1, scaleY: 0.9966, offsetX: 0, offsetY: 0.24 })).toBe(
      "1×0.997 / 0,0.2",
    )
    expect(formatAlignment({ scale: 1.0003, offsetX: 0.04, offsetY: -0.04 })).toBe("1 / 0,0")
  })

  it("carries the transform into summary.json and the table, and groups the identity note as ONE cause across pairs", () => {
    const note = (id: string): Finding => {
      const {
        designBox: _b,
        role: _r,
        ...boxless
      } = finding(id, {
        type: "alignment",
        severity: "minor",
        expected: { scale: 1, offsetX: 0, offsetY: 0 },
        actual: { scale: 1.00175, offsetX: -0.54, offsetY: -1.98 },
        message: "alignment is not the identity",
      })
      return boxless
    }
    const reports = [
      {
        dir: "a",
        report: report("a", [note("f1")], {
          alignment: { scale: 1.00175, offsetX: -0.54, offsetY: -1.98, confidence: 0.9 },
        }),
      },
      {
        dir: "b",
        report: report(
          "b",
          [{ ...note("f1"), actual: { scale: 1, scaleY: 1.00067, offsetX: 0, offsetY: -0.52 } }],
          {
            alignment: { scale: 1, scaleY: 1.00067, offsetX: 0, offsetY: -0.52, confidence: 0.9 },
          },
        ),
      },
    ]
    const s = summarizeReports(reports)
    expect(s.runs[0]?.alignment).toEqual({ scale: 1.00175, offsetX: -0.54, offsetY: -1.98 })
    expect(s.runs[1]?.alignment).toEqual({ scale: 1, scaleY: 1.00067, offsetX: 0, offsetY: -0.52 })
    expect(s.groups.map((g) => [g.type, g.pairs])).toEqual([["alignment", ["a", "b"]]])
    const text = renderSummary(s)
    expect(text).toContain("| align")
    expect(text).toMatch(/\| a\s+\| PASS\s+\|.*\| 0\.90 \| 1\.002 \/ −0\.5,−2\.0 \| -\s+\|/)
    expect(text).toMatch(/\| b\s+\| PASS\s+\|.*\| 0\.90 \| 1×1\.001 \/ 0,−0\.5\s+\| -\s+\|/)
  })
})
