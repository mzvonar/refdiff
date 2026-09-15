import type { Alignment, MatchingStats } from "../types.js"

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { MIN_AXIS_CONFIDENCE, MIN_MATCH_RATE, pairPhase } from "./phase.js"

const alignment = (confidence: number, confidenceX?: number, confidenceY?: number): Alignment => ({
  scale: 1,
  offsetX: 0,
  offsetY: 0,
  confidence,
  ...(confidenceX !== undefined ? { confidenceX } : {}),
  ...(confidenceY !== undefined ? { confidenceY } : {}),
  basis: "anchors",
})

/** `matched` split so the three totals stay consistent, as `MatchingStats` requires. */
const matching = (
  designLeaves: number,
  implLeaves: number,
  matched: number,
  text = 0,
  slot = 0,
): MatchingStats => ({
  designLeaves,
  implLeaves,
  matched,
  matchedVia: { text, slot, geometry: matched - text - slot },
  designOnly: designLeaves - matched,
  implOnly: implLeaves - matched,
  vetoed: 0,
})

describe("pairPhase", () => {
  it("computes the three signals off `matching` and the alignment", () => {
    // 71 of min(97, 78) = 0.910…; 27 of 71 text = 0.380…
    const p = pairPhase(alignment(0, 0.82, 0.06), matching(97, 78, 71, 27, 3))
    expect(p.matchRate).toBeCloseTo(0.9103, 4)
    expect(p.textShare).toBeCloseTo(0.3803, 4)
    expect(p.axisConfidence).toBe(0.82)
  })

  // The derivation's central case (plan step 4). `tx-picker-owner-mobile` matches 91% of its
  // leaves at JOINT confidence 0.00, because the joint score counts an anchor only when both
  // axes land it: 17 anchors, 14 agreeing on X, 1 on Y, 0 on both. Reading the joint score
  // would call the corpus's best-corresponding Storybook component pairs `reconcile`, which
  // is the exact harm the plan exists to prevent.
  it("reads the BETTER-fitting axis, not the joint confidence", () => {
    const p = pairPhase(alignment(0, 0.82, 0.06), matching(97, 78, 71, 27, 3))
    expect(p.phase).toBe("polish")
    expect(p.axisConfidence).toBe(0.82)
  })

  it("falls back to the joint score when the per-axis ones predate the report", () => {
    // `confidenceX`/`confidenceY` are optional. The joint score is a lower bound on both,
    // so the fallback can only be conservative — never invents confidence that was not there.
    const p = pairPhase(alignment(0.6), matching(50, 50, 45, 30))
    expect(p.axisConfidence).toBe(0.6)
    expect(p.phase).toBe("polish")
  })

  describe("the four cases the plan named — any rule must get all of them right", () => {
    it("`today-owner-desktop`: over the confidence floor, worst match rate in the corpus", () => {
      const p = pairPhase(alignment(0.5, 0.5, 0.5), matching(42, 36, 11, 4, 1))
      expect(p.matchRate).toBeCloseTo(0.3056, 4)
      expect(p.phase).toBe("reconcile")
    })

    it("`messages-owner-desktop`: confidence 0.07, but only 68% of leaves matched", () => {
      const p = pairPhase(alignment(0.07, 0.07, 0.07), matching(65, 77, 44, 21))
      expect(p.matchRate).toBeCloseTo(0.6769, 4)
      expect(p.phase).toBe("reconcile")
    })

    it("the witness `messages-accountant-desktop` is reconcile", () => {
      const p = pairPhase(alignment(0.07, 0.5, 0.07), matching(80, 106, 42, 19, 1))
      expect(p.matchRate).toBeCloseTo(0.525, 4)
      expect(p.phase).toBe("reconcile")
      // The headline a reconcile pair leads with is the INVENTORY, not the 225 findings.
      expect(p.reason).toContain("reconcile structure first")
      expect(p.reason).toContain("38 design-only")
    })

    it("`refdiff-library-groups-mobile` stays polish at text share 0.19", () => {
      // The named casualty of a ratio test, and the reason `textShare` must not gate:
      // a repeated-content grid proves few pairings by text and is still the polish
      // loop's home ground.
      const p = pairPhase(alignment(0.85, 1, 0.85), matching(432, 297, 232, 45))
      expect(p.textShare).toBeCloseTo(0.194, 3)
      expect(p.phase).toBe("polish")
    })
  })

  describe("the two floors", () => {
    it("is polish exactly AT both floors, and reconcile just under either", () => {
      const at = pairPhase(alignment(0, MIN_AXIS_CONFIDENCE, 0), matching(100, 100, 70))
      expect(at.matchRate).toBe(MIN_MATCH_RATE)
      expect(at.phase).toBe("polish")

      expect(pairPhase(alignment(0, MIN_AXIS_CONFIDENCE, 0), matching(100, 100, 69)).phase).toBe(
        "reconcile",
      )
      expect(pairPhase(alignment(0, 0.49, 0.49), matching(100, 100, 70)).phase).toBe("reconcile")
    })

    it("names WHICH floor failed, because the two mean different work", () => {
      // Same things, nothing lines up vs. different things — a reader acts differently on each.
      const noAxis = pairPhase(alignment(0, 0.3, 0.2), matching(100, 100, 90))
      expect(noAxis.reason).toContain("NEITHER axis fits")

      const noRate = pairPhase(alignment(0, 0.9, 0.9), matching(100, 100, 30))
      expect(noRate.reason).toContain("leaves matched")
      expect(noRate.reason).not.toContain("NEITHER axis")
    })
  })

  it("survives a pair the matcher offered nothing, without dividing by zero", () => {
    const p = pairPhase(alignment(0), matching(0, 0, 0))
    expect(p.matchRate).toBe(0)
    expect(p.textShare).toBe(0)
    expect(p.phase).toBe("reconcile")
  })
})

/**
 * The plan's hardest rule about this feature: "Never implement a phase as a GATE on the
 * existing pipeline. Report it; a phase label that silently withheld findings is the same
 * bug one level up." Nothing in `pairPhase`'s own behaviour can pin that — it is a claim
 * about the REST of the tree, so it is checked as one.
 *
 * Reporting seams are allowed to read the label (that is what they are for); the comparison
 * pipeline is not. `structural/checks.ts` is the one that would hurt most: it already takes
 * `alignmentConfidence`, so adding a phase argument there is a one-line change that reads
 * like an improvement and would quietly stop emitting findings on divergent pairs.
 */
describe("the phase is REPORTED, never enforced", () => {
  const srcRoot = fileURLToPath(new URL("..", import.meta.url))
  /** Files whose job IS the label: it is declared, derived, or rendered in each. */
  const REPORTING_SEAMS = new Set([
    "types.ts",
    "cli.ts",
    "package/package-for-model.ts",
    "package/summary.ts",
    "structural/phase.ts",
  ])

  const sources = (): string[] => {
    const out: string[] = []
    const walk = (dir: string, prefix: string): void => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        if (e.isDirectory()) walk(join(dir, e.name), rel)
        else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(rel)
      }
    }
    walk(srcRoot, "")
    return out
  }

  /**
   * Code-level references only. Deliberately wider than "reads `report.phase`" — the two
   * literals catch a hand-rolled re-derivation that never touches the type — but narrow
   * enough to ignore the word in prose, which `pixel/diff.ts` uses for RASTERIZATION phase
   * and sub-pixel phase. (It caught those first, which is how we know it is not vacuous.)
   */
  const MENTIONS = /\bPairPhase\b|\bPhaseName\b|\bpairPhase\b|\.phase\b|"reconcile"|"polish"/

  it("is mentioned nowhere outside the reporting seams", () => {
    const offenders = sources()
      .filter((f) => !REPORTING_SEAMS.has(f))
      .filter((f) => MENTIONS.test(readFileSync(join(srcRoot, f), "utf8")))
    expect(offenders).toEqual([])
  })

  // Guard case: the assertion above passes trivially if the walk finds nothing, or if the
  // pattern stops matching. Pin both by checking it FIRES on a seam we know mentions it.
  it("would catch a violation — the same check flags a file that does mention it", () => {
    const seams = sources().filter(
      (f) => REPORTING_SEAMS.has(f) && MENTIONS.test(readFileSync(join(srcRoot, f), "utf8")),
    )
    expect(seams).toEqual([...REPORTING_SEAMS].sort())
  })
})
