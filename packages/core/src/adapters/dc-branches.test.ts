import type { BranchRecord } from "./dc-branches.js"

import { describe, expect, it } from "vitest"

import { branchCoverage, describeBranchCoverage } from "./dc-branches.js"

const branch = (name: string, index: number, descendants: number[]): BranchRecord => ({
  name,
  index,
  descendants,
})

// A string title, like every other describe in this repo: the ~60 existing blocks pass one, and
// most carry context a bare symbol name cannot. The four blocks added in 1.5.0 were the only
// function-reference form in the tree.
describe("branchCoverage — which conditional arms the comp actually drew", () => {
  it("reproduces the witness: two of five row renderers never true", () => {
    // messages.dc.html frame 2e — `sel` opens t1, whose rows are day / req / msg.
    const branches = [
      branch("r.isDay", 300, [301]),
      branch("r.isSys", 304, [305, 306]),
      branch("r.isReq", 310, [311, 312]),
      branch("r.isMsg", 320, [321]),
      branch("r.isDoc", 328, [329, 330]),
    ]

    const coverage = branchCoverage(branches, [301, 311, 312, 321])

    expect(coverage).toEqual({ total: 5, uncovered: ["r.isSys", "r.isDoc"] })
    expect(describeBranchCoverage(coverage)).toBe(
      "5 conditional branches, 2 never true in this captured state: r.isSys, r.isDoc",
    )
  })

  it("covers a condition when ANY of its sc-ifs ran — a row renderer repeats per twin", () => {
    const branches = [branch("r.isReq", 310, [311]), branch("r.isReq", 419, [420])]

    expect(branchCoverage(branches, [420]).uncovered).toEqual([])
  })

  it("keeps a condition uncovered while every one of its sc-ifs stayed false", () => {
    const branches = [branch("r.isDoc", 328, [329]), branch("r.isDoc", 441, [442])]

    expect(branchCoverage(branches, [999]).uncovered).toEqual(["r.isDoc"])
  })

  it("ignores a branch that can never be observed", () => {
    // An empty `<sc-if>` renders nothing when true either, so calling it
    // uncovered would be a permanent false positive.
    expect(branchCoverage([branch("empty", 1, []), branch("r.isDay", 2, [3])], [3])).toEqual({
      total: 1,
      uncovered: [],
    })
  })

  it("says nothing when every branch drew, or when there are none", () => {
    expect(describeBranchCoverage({ total: 4, uncovered: [] })).toBeNull()
    expect(describeBranchCoverage({ total: 0, uncovered: [] })).toBeNull()
  })

  it("elides a long list rather than printing forty names", () => {
    const uncovered = Array.from({ length: 11 }, (_, i) => `c${i}`)
    expect(describeBranchCoverage({ total: 20, uncovered })).toBe(
      "20 conditional branches, 11 never true in this captured state: c0, c1, c2, c3, c4, c5, c6, c7 (+3 more)",
    )
  })
})
