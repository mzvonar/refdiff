import type { ElementNode, Finding } from "../types.js"

import { describe, expect, it } from "vitest"

import {
  containersOf,
  describeRegions,
  groupByRegion,
  DEFAULT_MAX_CONTAINER_SHARE,
} from "./regions.js"

const el = (id: string, x: number, y: number, w: number, h: number, role = "surface"): ElementNode => ({
  id,
  box: { x, y, w, h },
  role,
})

const at = (id: string, x: number, y: number, severity: Finding["severity"] = "major"): Finding => ({
  id,
  mark: Number(id.slice(1)),
  type: "position",
  severity,
  implBox: { x, y, w: 10, h: 10 },
  message: "shifted",
})

// The measured shape of the pair that motivated this: a 1360×820 frame with two
// canvas panes and a 320px rail, the rail holding two thirds of the findings.
const FRAME = { x: 0, y: 0, w: 1360, h: 820 }
const rail = el("rail", 1039, 86, 321, 734)
const canvas = el("canvas", 542, 86, 498, 734)
const work = el("work", 45, 86, 995, 734)
const chip = el("chip", 1052, 505, 99, 19)

describe("containersOf", () => {
  it("takes painted containers between a chip and most of the frame, largest first", () => {
    const got = containersOf([chip, rail, canvas, work], FRAME)
    expect(got.map((e) => e.id)).toEqual(["work", "canvas", "rail"])
  })

  it("refuses a container that covers most of the frame — the whole page is not a place", () => {
    const whole = el("frame", 0, 0, 1360, 820)
    expect(containersOf([whole, rail], FRAME).map((e) => e.id)).toEqual(["rail"])
    // Two side-by-side panes are about half each and must still qualify.
    expect((canvas.box.w * canvas.box.h) / (FRAME.w * FRAME.h)).toBeLessThan(DEFAULT_MAX_CONTAINER_SHARE)
  })

  it("ignores anything carrying text — a labelled box is an element, not a region", () => {
    const labelled: ElementNode = { ...el("titled", 100, 100, 300, 300), text: "Findings" }
    expect(containersOf([labelled], FRAME)).toEqual([])
  })
})

describe("groupByRegion", () => {
  const containers = containersOf([chip, rail, canvas, work], FRAME)

  it("groups under the SMALLEST container that holds the box, not the first", () => {
    // Every one of these sits inside `work` as well; the pane is the answer.
    const findings = [at("f1", 1100, 200), at("f2", 1100, 300), at("f3", 600, 200), at("f4", 600, 300)]
    const { groups, elsewhere } = groupByRegion(findings, containers)
    expect(groups.map((g) => [g.role, g.box.x, g.findings])).toEqual([
      ["surface", 1039, 2],
      ["surface", 542, 2],
    ])
    expect(elsewhere).toBe(0)
  })

  it("orders by size of the group, and counts severities inside it", () => {
    const findings = [
      at("f1", 1100, 200, "critical"),
      at("f2", 1100, 300, "major"),
      at("f3", 1100, 400, "minor"),
      at("f4", 600, 200),
      at("f5", 600, 300),
    ]
    const { groups } = groupByRegion(findings, containers)
    expect(groups[0]).toMatchObject({ findings: 3, critical: 1, major: 1, minor: 1, ids: ["f1", "f2", "f3"] })
    expect(groups[1]).toMatchObject({ findings: 2 })
  })

  it("folds a lone finding and a boxless one into `elsewhere`", () => {
    const boxless: Finding = { id: "f9", mark: 9, type: "alignment", severity: "minor", message: "fit" }
    const { groups, elsewhere } = groupByRegion(
      [at("f1", 1100, 200), at("f2", 1100, 300), at("f3", 600, 200), boxless, at("f4", 5, 5)],
      containers,
    )
    // The rail's two group; the canvas's single one, the boxless note and the
    // one outside every container do not.
    expect(groups.map((g) => g.findings)).toEqual([2])
    expect(elsewhere).toBe(3)
  })

  it("uses the IMPL box, so a design-only finding groups with the rest", () => {
    const designOnly: Finding = {
      id: "f1",
      mark: 1,
      type: "missing-element",
      severity: "critical",
      designBox: { x: 1100, y: 200, w: 10, h: 10 },
      message: "gone",
    }
    const { groups } = groupByRegion([designOnly, at("f2", 1100, 300)], containers)
    expect(groups.map((g) => [g.box.x, g.findings])).toEqual([[1039, 2]])
  })
})

describe("describeRegions", () => {
  it("is silent when nothing groups", () => {
    expect(describeRegions({ groups: [], elsewhere: 7 })).toEqual([])
  })

  it("names the place, the count and the severities", () => {
    const lines = describeRegions({
      groups: [{ box: { x: 1039, y: 86, w: 321, h: 734 }, role: "surface", findings: 49, critical: 12, major: 30, minor: 7, ids: [] }],
      elsewhere: 3,
    })
    expect(lines[0]).toContain("49 findings in surface at (1039, 86) 321×734 — 12 critical, 30 major, 7 minor")
    // Not "chrome": on a panned canvas most of these are off-frame content.
    expect(lines[1]).toContain("3 in no single region")
  })

  it("caps the list and says how much the tail holds", () => {
    const g = (n: number, i: number) => ({
      box: { x: i, y: 0, w: 100, h: 100 },
      role: "surface",
      findings: n,
      critical: 0,
      major: n,
      minor: 0,
      ids: [],
    })
    const lines = describeRegions({ groups: [g(9, 1), g(8, 2), g(7, 3), g(6, 4), g(5, 5), g(4, 6), g(3, 7), g(2, 8)], elsewhere: 0 }, 6)
    expect(lines).toHaveLength(7)
    expect(lines[6]).toContain("5 findings in 2 smaller region(s)")
  })
})
