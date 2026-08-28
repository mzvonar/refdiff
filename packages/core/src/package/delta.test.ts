import type { ComparisonReport, Finding } from "../types.js"

import { describe, expect, it } from "vitest"

import { boxDistance, diffFindings, diffReports, emptyLedger, recordResolved } from "./delta.js"

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
})

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
  artifacts: { designPng: "d", implPng: "i" },
})

describe("diffReports", () => {
  it("yields an empty delta for the same findings even when renumbered", () => {
    const prev = report([
      finding("f1"),
      finding("f2", {
        type: "position",
        expected: { x: 1, y: 2 },
        actual: { x: 3, y: 4 },
        designBox: { x: 200, y: 200, w: 10, h: 10 },
      }),
    ])
    const next = report([
      finding("f1", {
        type: "position",
        expected: { x: 1, y: 2 },
        actual: { x: 3, y: 4 },
        designBox: { x: 202, y: 201, w: 10, h: 10 },
      }),
      finding("f2", { designBox: { x: 11, y: 9, w: 100, h: 20 } }),
    ])
    expect(diffReports(prev, next)).toEqual({
      previousRun: "2026-08-26T10:00:00.000Z",
      resolved: [],
      introduced: [],
    })
  })

  it("lists resolved ids from the previous run and introduced ids from the new one", () => {
    const prev = report([
      finding("f1"),
      finding("f2", { designBox: { x: 10, y: 300, w: 100, h: 20 } }),
    ])
    const next = report([
      finding("f1", { designBox: { x: 10, y: 300, w: 100, h: 20 } }),
      finding("f2", { type: "border", expected: { borderWidth: 0 }, actual: { borderWidth: 1 } }),
    ])
    expect(diffReports(prev, next)).toEqual({
      previousRun: "2026-08-26T10:00:00.000Z",
      resolved: ["f1"],
      introduced: ["f2"],
    })
  })

  it("does not pair the same finding at a different place", () => {
    const { resolved, introduced } = diffFindings(
      [finding("f1")],
      [finding("f1", { designBox: { x: 10, y: 40, w: 100, h: 20 } })],
    )
    expect(resolved).toEqual(["f1"])
    expect(introduced).toEqual(["f1"])
  })

  it("pairs one-to-one when several identical findings share a key", () => {
    const prev = [finding("f1"), finding("f2", { designBox: { x: 10, y: 60, w: 100, h: 20 } })]
    const next = [
      finding("f1"),
      finding("f2"),
      finding("f3", { designBox: { x: 10, y: 60, w: 100, h: 20 } }),
    ]
    expect(diffFindings(prev, next)).toEqual({ resolved: [], introduced: ["f2"] })
  })

  it("treats a changed value as resolved + introduced (different identity)", () => {
    const prev = [finding("f1")]
    const next = [finding("f1", { actual: { color: "#1b1b1b" } })]
    expect(diffFindings(prev, next)).toEqual({ resolved: ["f1"], introduced: ["f1"] })
  })

  it("measures boxes per edge and treats missing boxes as unrelated", () => {
    expect(boxDistance({ x: 0, y: 0, w: 10, h: 10 }, { x: 2, y: 0, w: 10, h: 10 })).toBe(2)
    expect(boxDistance({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 0, w: 16, h: 10 })).toBe(6)
    expect(boxDistance(undefined, { x: 0, y: 0, w: 1, h: 1 })).toBe(Infinity)
    expect(boxDistance(undefined, undefined)).toBe(0)
  })
})

describe("identity by text (findings that know their element)", () => {
  const pos = (id: string, x: number, y: number, text = "−219,00 €"): Finding =>
    finding(id, {
      type: "position",
      role: "text",
      text,
      designBox: { x, y, w: 60, h: 16 },
      implBox: { x: x + 3, y: y + 20, w: 60, h: 16 },
      expected: { x, y },
      actual: { x: x + 3, y: y + 20 },
      message: `"${text}" is offset`,
    })

  it("keeps a position finding's identity when the alignment moves every box and value", () => {
    const prev = report([pos("f1", 100, 200)])
    const next = report([pos("f1", 107.2, 193.5)]) // alignment shifted (7.2, −6.5)
    expect(diffReports(prev, next)).toMatchObject({ resolved: [], introduced: [] })
  })

  it("pairs same-text candidates by the nearest box (three amount rows)", () => {
    const prev = report([pos("f1", 100, 200), pos("f2", 100, 260), pos("f3", 100, 320)])
    const next = report([pos("f1", 106, 326), pos("f2", 106, 206)]) // the middle row's finding is gone
    expect(diffReports(prev, next)).toEqual({
      previousRun: prev.createdAt,
      resolved: ["f2"],
      introduced: [],
    })
  })

  it("still identifies a text finding when the values changed (same finding, still there)", () => {
    const prev = report([pos("f1", 100, 200)])
    const next = report([
      { ...pos("f1", 100, 200), actual: { x: 100, y: 240 }, message: "moved more" },
    ])
    expect(diffReports(prev, next)).toMatchObject({ resolved: [], introduced: [] })
  })

  it("distinguishes different texts and keeps geometry-only identity for textless findings", () => {
    const prev = report([pos("f1", 100, 200, "−84,20 €")])
    expect(diffReports(prev, report([pos("f1", 100, 200, "−96,30 €")]))).toMatchObject({
      resolved: ["f1"],
      introduced: ["f1"],
    })
    const icon = finding("f1", {
      type: "position",
      role: "icon",
      expected: { x: 10, y: 10 },
      actual: { x: 12, y: 18 },
      designBox: { x: 10, y: 10, w: 16, h: 16 },
      implBox: { x: 12, y: 18, w: 16, h: 16 },
    })
    const moved = {
      ...icon,
      designBox: { x: 40, y: 10, w: 16, h: 16 },
      implBox: { x: 42, y: 18, w: 16, h: 16 },
    }
    expect(diffReports(report([icon]), report([moved]))).toMatchObject({
      resolved: ["f1"],
      introduced: ["f1"],
    })
  })

  it("identifies a missing-element by its text across an alignment shift", () => {
    const missing = (id: string, y: number): Finding =>
      finding(id, {
        type: "missing-element",
        role: "text",
        text: "Karta · 12. 7.",
        designBox: { x: 136, y, w: 63, h: 14 },
        message: "missing",
      })
    const { expected: _e, actual: _a, ...m1 } = missing("f1", 547)
    const { expected: _e2, actual: _a2, ...m2 } = missing("f1", 555.8)
    expect(diffReports(report([m1]), report([m2]))).toMatchObject({ resolved: [], introduced: [] })
  })

  it("carries the text into the ledger so a regression is recognised after a shift", () => {
    const prev = report([pos("f1", 100, 200)])
    const gone = report([])
    const ledger = recordResolved(emptyLedger("p"), prev, diffReports(prev, gone), gone.createdAt)
    expect(ledger.entries[0]).toMatchObject({ text: "−219,00 €" })
    const back = report([pos("f1", 130, 170)])
    expect(diffReports(gone, back, {}, ledger).regressions).toEqual(["f1"])
  })
})

describe("resolved ledger", () => {
  const ink = finding("f1")
  const shift = finding("f2", {
    type: "position",
    expected: { x: 1, y: 2 },
    actual: { x: 3, y: 4 },
    designBox: { x: 200, y: 200, w: 10, h: 10 },
  })

  it("records what a run resolved, once per finding", async () => {
    const { emptyLedger, recordResolved } = await import("./delta.js")
    const prev = report([ink, shift])
    const l1 = recordResolved(emptyLedger("p"), prev, { resolved: ["f1"] }, "t1")
    expect(l1.entries).toHaveLength(1)
    expect(l1.entries[0]).toMatchObject({ message: "ink", resolvedAt: "t1", box: ink.designBox })
    // Resolved again later (after a regression): same entry, newer timestamp.
    const l2 = recordResolved(l1, report([ink]), { resolved: ["f1"] }, "t2")
    expect(l2.entries).toHaveLength(1)
    expect(l2.entries[0]?.resolvedAt).toBe("t2")
  })

  it("flags an introduced finding that an earlier run had resolved", async () => {
    const { emptyLedger, recordResolved, diffReports } = await import("./delta.js")
    const run1 = report([ink, shift], "t1")
    const run2 = report([shift], "t2") // ink fixed
    const ledger = recordResolved(emptyLedger("p"), run1, diffReports(run1, run2), "t2")
    const run3 = report([shift, finding("f9", { designBox: { x: 12, y: 8, w: 100, h: 20 } })], "t3") // ink back
    const delta = diffReports(run2, run3, {}, ledger)
    expect(delta.introduced).toEqual(["f9"])
    expect(delta.regressions).toEqual(["f9"])
  })

  it("does not call a genuinely new finding a regression", async () => {
    const { emptyLedger, diffReports } = await import("./delta.js")
    const delta = diffReports(report([ink]), report([ink, shift]), {}, emptyLedger("p"))
    expect(delta.introduced).toEqual(["f2"])
    expect(delta.regressions).toBeUndefined()
  })

  it("parses a ledger file and rejects a foreign pair's", async () => {
    const { parseLedger } = await import("./delta.js")
    const raw = { pair: "p", entries: [{ key: "k", message: "m", resolvedAt: "t" }, { junk: 1 }] }
    expect(parseLedger(raw, "p").entries).toHaveLength(1)
    expect(parseLedger(raw, "other").entries).toEqual([])
    expect(parseLedger("nope", "p").entries).toEqual([])
  })
})
