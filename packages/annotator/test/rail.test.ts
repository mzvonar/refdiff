import { describe, expect, it } from "vitest"

import { aggregateCount, formatValue, instanceChipLabel, propRows, railSummary, SUPPRESSED_LABEL } from "../src/rail.js"

describe("propRows — the comps' `prop expected → actual` line from a finding's values", () => {
  it("prints one row per differing key, in CSS spelling, with px on the px keys", () => {
    expect(propRows({ backgroundColor: "#4F46E5" }, { backgroundColor: "#6366F1" })).toEqual([
      { prop: "background-color", expected: "#4F46E5", actual: "#6366F1" },
    ])
    expect(propRows({ fontSize: 28 }, { fontSize: 24 })).toEqual([{ prop: "font-size", expected: "28px", actual: "24px" }])
    expect(propRows({ borderRadius: 12 }, { borderRadius: 6 })).toEqual([{ prop: "border-radius", expected: "12px", actual: "6px" }])
    // fontWeight is unitless; a ΔE or a ratio too.
    expect(propRows({ fontWeight: 700 }, { fontWeight: 400 })).toEqual([{ prop: "font-weight", expected: "700", actual: "400" }])
    expect(propRows({ diffRatio: 0 }, { diffRatio: 0.0312 })).toEqual([{ prop: "diff-ratio", expected: "0", actual: "0.03" }])
  })

  it("leaves out keys both sides agree on — `axis` beside a gap is context, not a delta", () => {
    // The demo pair's f5 (spacing): only the moving value is a row.
    expect(propRows({ gap: 24, axis: "x" }, { gap: 16, axis: "x" }, "spacing")).toEqual([{ prop: "gap", expected: "24px", actual: "16px" }])
  })

  it("shows a position finding as the shift, in the message's own vocabulary, and a size finding as width/height", () => {
    // The demo pair's g2: the row baseline moved 23px down — the comps' `translateY 0px → 23px`.
    expect(propRows({ x: 36, y: 380 }, { x: 36, y: 403 }, "position")).toEqual([{ prop: "translateY", expected: "0px", actual: "23px" }])
    expect(propRows({ x: 10, y: 5 }, { x: 4.5, y: 5 }, "position")).toEqual([{ prop: "translateX", expected: "0px", actual: "-5.5px" }])
    expect(propRows({ x: 1, y: 1 }, { x: 1, y: 1 }, "position")).toEqual([])
    expect(propRows({ w: 680, h: 740 }, { w: 665, h: 740 }, "size")).toEqual([{ prop: "width", expected: "680px", actual: "665px" }])
  })

  it("yields nothing for a finding with no values, and a dash for a one-sided key", () => {
    expect(propRows(undefined, undefined)).toEqual([])
    expect(propRows({ text: "Front side of ID" }, undefined)).toEqual([{ prop: "text", expected: "Front side of ID", actual: "—" }])
    expect(formatValue("w", 430.4)).toBe("430.4px")
    expect(formatValue("w", undefined)).toBe("—")
  })
})

describe("rail summary + instance chip", () => {
  it("counts findings and comments, singular when one, and names pending saves", () => {
    expect(railSummary(8, 3)).toBe("8 findings · 3 comments")
    expect(railSummary(1, 1)).toBe("1 finding · 1 comment")
    // Section C: a failed save shows through a COLLAPSED rail.
    expect(railSummary(8, 3, 1)).toBe("8 findings · 3 comments · 1 unsaved")
  })

  it("counts an aggregate's members once each — the primary is members[0], not an extra", () => {
    const listed = [{ instances: 14 }, { instances: 5 }, {}, {}, {}, {}, {}, {}]
    expect(instanceChipLabel(false, listed)).toBe("Primary only · 8")
    // 6 singles + 14 + 5: the comp's demo says 27 because its `inst` list repeats the primary.
    expect(instanceChipLabel(true, listed)).toBe("All instances · 25")
    expect(aggregateCount(listed)).toBe(2)
    expect(aggregateCount([{ instances: 1 }, {}])).toBe(0)
    expect(SUPPRESSED_LABEL(3)).toBe("3 suppressed by policy rules")
  })
})
