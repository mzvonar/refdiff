import type { ElementNode, Finding, MatchingStats, SuppressedFinding } from "../types.js"

import { describe, expect, it } from "vitest"

import {
  containersOf,
  describeRegions,
  describeUnmatched,
  groupByRegion,
  groupUnmatched,
  DEFAULT_MAX_CONTAINER_SHARE,
} from "./regions.js"

const el = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  role = "surface",
): ElementNode => ({
  id,
  box: { x, y, w, h },
  role,
})

const at = (
  id: string,
  x: number,
  y: number,
  severity: Finding["severity"] = "major",
): Finding => ({
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
    expect((canvas.box.w * canvas.box.h) / (FRAME.w * FRAME.h)).toBeLessThan(
      DEFAULT_MAX_CONTAINER_SHARE,
    )
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
    const findings = [
      at("f1", 1100, 200),
      at("f2", 1100, 300),
      at("f3", 600, 200),
      at("f4", 600, 300),
    ]
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
    expect(groups[0]).toMatchObject({
      findings: 3,
      critical: 1,
      major: 1,
      minor: 1,
      ids: ["f1", "f2", "f3"],
    })
    expect(groups[1]).toMatchObject({ findings: 2 })
  })

  it("folds a lone finding and a boxless one into `elsewhere`", () => {
    const boxless: Finding = {
      id: "f9",
      mark: 9,
      type: "alignment",
      severity: "minor",
      message: "fit",
    }
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
      groups: [
        {
          box: { x: 1039, y: 86, w: 321, h: 734 },
          role: "surface",
          findings: 49,
          critical: 12,
          major: 30,
          minor: 7,
          ids: [],
        },
      ],
      elsewhere: 3,
    })
    expect(lines[0]).toContain(
      "49 findings in surface at (1039, 86) 321×734 — 12 critical, 30 major, 7 minor",
    )
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
    const lines = describeRegions(
      {
        groups: [g(9, 1), g(8, 2), g(7, 3), g(6, 4), g(5, 5), g(4, 6), g(3, 7), g(2, 8)],
        elsewhere: 0,
      },
      6,
    )
    expect(lines).toHaveLength(7)
    expect(lines[6]).toContain("5 findings in 2 smaller region(s)")
  })
})

describe("groupUnmatched", () => {
  // The witness's mechanism, minimised: the comp draws its rail on the RIGHT,
  // the implementation has one on the LEFT and nothing at all where the comp's
  // is. Both trees are in impl world space (alignStructural maps the design
  // side), so the two rails are directly comparable — and a comp element inside
  // the comp's rail is inside NO impl container.
  const IMPL_FRAME = { x: 0, y: 0, w: 1000, h: 800 }
  const DESIGN_FRAME = { x: 0, y: 0, w: 1000, h: 800 }
  const implRail = el("impl-rail", 0, 0, 300, 800)
  const compRail = el("comp-rail", 600, 0, 300, 800)

  const missing = (id: string, x: number, y: number): Finding => ({
    id,
    mark: Number(id.slice(1)),
    type: "missing-element",
    severity: "critical",
    designBox: { x, y, w: 40, h: 20 },
    message: "no counterpart",
  })
  const extra = (id: string, x: number, y: number): Finding => ({
    id,
    mark: Number(id.slice(1)),
    type: "extra-element",
    severity: "major",
    implBox: { x, y, w: 40, h: 20 },
    message: "the design does not have it",
  })

  const stats = (designOnly: number, implOnly: number): MatchingStats => ({
    designLeaves: designOnly + 10,
    implLeaves: implOnly + 10,
    matched: 10,
    matchedVia: { text: 6, slot: 0, geometry: 4 },
    designOnly,
    implOnly,
    vetoed: 0,
  })

  const run = (
    findings: readonly Finding[],
    matching: MatchingStats,
    suppressed: readonly SuppressedFinding[] = [],
  ) => {
    const got = groupUnmatched({
      findings,
      suppressed,
      matching,
      design: { elements: [compRail, implRail], frame: DESIGN_FRAME },
      impl: { elements: [implRail], frame: IMPL_FRAME },
    })
    if (got === undefined) throw new Error("expected a map")
    return got
  }

  it("places a comp element by the COMP's containers, where the impl's place nothing", () => {
    const findings = [missing("f1", 620, 100), missing("f2", 620, 200)]
    const { design } = run(findings, stats(2, 0))
    expect(design.byRegion.groups.map((g) => [g.box.x, g.findings])).toEqual([[600, 2]])
    expect(design.byRegion.elsewhere).toBe(0)
    // The instrument this replaces, on the same two findings: byRegion draws its
    // containers from the impl tree, which has nothing at x 620.
    expect(groupByRegion(findings, containersOf([implRail], IMPL_FRAME)).elsewhere).toBe(2)
  })

  it("keeps a container holding ONE element — completeness, not orientation", () => {
    // groupByRegion folds a lone finding into `elsewhere` (minGroup 2); a comp
    // column with exactly one element in it is the divergence being hunted.
    const { design } = run([missing("f1", 620, 100)], stats(1, 0))
    expect(design.byRegion.groups).toHaveLength(1)
    expect(design.byRegion.elsewhere).toBe(0)
  })

  it("reads only the presence findings, and each side only its own type", () => {
    const shifted: Finding = {
      id: "f9",
      mark: 9,
      type: "position",
      severity: "major",
      implBox: { x: 50, y: 50, w: 40, h: 20 },
      designBox: { x: 620, y: 50, w: 40, h: 20 },
      message: "shifted",
    }
    const { design, impl } = run(
      [missing("f1", 620, 100), extra("f2", 50, 100), shifted],
      stats(1, 1),
    )
    expect(design.reported).toBe(1)
    expect(impl.reported).toBe(1)
    expect(impl.byRegion.groups.map((g) => [g.box.x, g.findings])).toEqual([[0, 1]])
  })

  it("splits the matcher's count into the three populations, which always add up", () => {
    const hidden: SuppressedFinding = {
      ...missing("f8", 620, 300),
      suppressedBy: "text-pattern",
      rule: "/\\d+ d ago/",
    }
    // 5 design leaves left over: 2 reported, 1 suppressed by policy, 2 never
    // raised because they are under `minElementSize` — the gap the headline used
    // to print away.
    const { design } = run([missing("f1", 620, 100), missing("f2", 620, 200)], stats(5, 0), [
      hidden,
    ])
    expect(design).toMatchObject({ elements: 5, reported: 2, suppressed: 1, belowFloor: 2 })
    expect(design.reported + design.suppressed + design.belowFloor).toBe(design.elements)
  })

  it("never lets a stale count drive `belowFloor` negative", () => {
    const { design } = run([missing("f1", 620, 100), missing("f2", 620, 200)], stats(1, 0))
    expect(design.belowFloor).toBe(0)
  })

  it("has no map when there are no matcher counts to place a population against", () => {
    // A report written before the matcher reported itself. Substituting the
    // REPORTED count for `elements` would be the 38-vs-37 defect with its sign
    // flipped: a map that silently claims the list is the whole population.
    const got = groupUnmatched({
      findings: [missing("f1", 620, 100)],
      suppressed: [],
      design: { elements: [compRail], frame: DESIGN_FRAME },
      impl: { elements: [implRail], frame: IMPL_FRAME },
    })
    expect(got).toBeUndefined()
  })

  it("has no map when the two sides matched everything", () => {
    expect(
      groupUnmatched({
        findings: [],
        suppressed: [],
        matching: stats(0, 0),
        design: { elements: [compRail], frame: DESIGN_FRAME },
        impl: { elements: [implRail], frame: IMPL_FRAME },
      }),
    ).toBeUndefined()
  })

  it("keeps an EMPTY map — placing none of them is a result, not a missing field", () => {
    // The comp element sits in no container of either side. The old byRegion
    // shape would drop the field; here the reader must still be told that 1
    // element is unmatched and that the map could not place it.
    const { design } = run([missing("f1", 950, 100)], stats(1, 0))
    expect(design.byRegion).toEqual({ groups: [], elsewhere: 1 })
  })
})

describe("describeUnmatched", () => {
  const side = (over: Partial<Parameters<typeof describeUnmatched>[0]> = {}) => ({
    elements: 2,
    reported: 2,
    suppressed: 0,
    belowFloor: 0,
    byRegion: {
      groups: [
        {
          box: { x: 600, y: 0, w: 300, h: 800 },
          role: "surface",
          findings: 2,
          critical: 2,
          major: 0,
          minor: 0,
          ids: ["f1", "f2"],
        },
      ],
      elsewhere: 0,
    },
    ...over,
  })

  it("says nothing when the side has nothing unmatched", () => {
    expect(
      describeUnmatched(
        side({ elements: 0, reported: 0, byRegion: { groups: [], elsewhere: 0 } }),
        "x",
      ),
    ).toEqual([])
  })

  it("names both populations when they differ, and where the listed ones are", () => {
    const lines = describeUnmatched(
      side({ elements: 4, reported: 2, suppressed: 1, belowFloor: 1 }),
      "design element(s) with no counterpart",
    )
    expect(lines[0]).toBe(
      "  4 design element(s) with no counterpart (2 listed below, 1 suppressed by policy, 1 under the reporting floor):",
    )
    expect(lines[1]).toContain("2 in surface at (600, 0) 300×800")
  })

  it("says so plainly when every one of them is in the list", () => {
    expect(describeUnmatched(side(), "design element(s)")[0]).toBe(
      "  2 design element(s) (all 2 listed below):",
    )
  })

  it("reports its OWN miss rate rather than letting a short list read as a short problem", () => {
    const lines = describeUnmatched(
      side({ byRegion: { groups: [], elsewhere: 2 } }),
      "design element(s)",
    )
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain("2 in no container of that side — this map does not place them")
  })
})
