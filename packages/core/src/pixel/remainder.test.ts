import { describe, expect, it } from "vitest"

import { remainderFinding } from "./checks.js"

/**
 * The whole-frame backstop. It exists because the two channels share one blind
 * spot: the per-match channel diffs only INSIDE matched boxes, and matching is
 * driven by an element model that extracts leaves — so a container's surface
 * (background, border, radius, width) is never matched and never diffed.
 *
 * Measured case, 2026-09-02: a control that should have been a floating pill
 * (223x29, rounded, shadowed) shipped as a full-width bar with a background and
 * a bottom border. Every label inside it matched and compared clean. Zero
 * findings.
 */
const rem = (
  diffRatio: number,
  clusters: { x: number; y: number; w: number; h: number; px: number }[],
) => ({
  diffRatio,
  diffPixels: clusters.reduce((n, c) => n + c.px, 0),
  clusters: clusters.map((c) => ({ box: { x: c.x, y: c.y, w: c.w, h: c.h }, pixels: c.px })),
})

describe("remainderFinding", () => {
  it("reports unexplained difference and says WHERE", () => {
    const f = remainderFinding(rem(0.031, [{ x: 0, y: 45, w: 390, h: 35, px: 4000 }]))
    expect(f?.type).toBe("pixel-region")
    expect(f?.role).toBe("frame")
    expect(f?.severity).toBe("major")
    expect(f?.message).toContain("OUTSIDE every matched element")
    // The reader needs the coordinates, not just a percentage.
    expect(f?.message).toContain("390×35 at (0, 45)")
    expect(f?.actual?.["unexplainedDiffRatio"]).toBe(0.031)
    expect(f?.regions).toHaveLength(1)
  })

  it("stays quiet below the floor — two correct rasterisations always disagree somewhere", () => {
    // A backstop that fires on every clean run is a backstop nobody reads.
    expect(remainderFinding(rem(0.001, [{ x: 1, y: 1, w: 4, h: 4, px: 8 }]))).toBeUndefined()
  })

  it("is quiet when nothing clustered, whatever the ratio claims", () => {
    expect(remainderFinding(rem(0.5, []))).toBeUndefined()
  })

  it("is minor for a small surface and major for a large one", () => {
    expect(remainderFinding(rem(0.006, [{ x: 0, y: 0, w: 20, h: 20, px: 300 }]))?.severity).toBe(
      "minor",
    )
    expect(remainderFinding(rem(0.09, [{ x: 0, y: 0, w: 300, h: 90, px: 9000 }]))?.severity).toBe(
      "major",
    )
  })

  // Ranking by size alone buried the one thing this finding is best at saying.
  // The witness is `messages-owner-mobile`'s missing phone-rail hairline: five
  // ~350×1 strips at an 87px pitch, each smaller than the rasterisation blob
  // that used to take all three "largest:" slots.
  it("leads with an evenly-spaced RUN, not the largest blob", () => {
    const f = remainderFinding(
      rem(0.056, [
        { x: 20, y: 500, w: 147, h: 57, px: 4000 },
        { x: 20, y: 214, w: 351, h: 1, px: 351 },
        { x: 20, y: 301, w: 351, h: 1, px: 351 },
        { x: 20, y: 388, w: 351, h: 1, px: 351 },
        { x: 20, y: 475, w: 351, h: 1, px: 351 },
        { x: 20, y: 562, w: 351, h: 1, px: 351 },
      ]),
    )

    expect(f?.message).toContain("5 regions of 351×1 repeating every 87px vertically")
    // The blob is still named — it is just no longer the headline.
    expect(f?.message).toContain("largest single region 147×57 at (20, 500)")
    expect(f?.actual?.["repeatedCount"]).toBe(5)
    expect(f?.actual?.["repeatedPitch"]).toBe(87)
    // `regions` carries the RUN, so the crops a reader opens are the strips.
    expect(f?.regions?.map((r) => r.y)).toEqual([214, 301, 388, 475, 562])
  })

  it("falls back to largest-first when nothing repeats", () => {
    const f = remainderFinding(
      rem(0.031, [
        { x: 0, y: 45, w: 390, h: 35, px: 4000 },
        { x: 600, y: 700, w: 20, h: 20, px: 200 },
      ]),
    )

    expect(f?.message).toContain("largest: 390×35 at (0, 45)")
    expect(f?.actual?.["repeatedCount"]).toBeUndefined()
  })

  it("caps the regions it carries but counts them all", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0, w: 10, h: 10, px: 100 - i }))
    const f = remainderFinding(rem(0.05, many))
    expect(f?.regions).toHaveLength(6)
    expect(f?.actual?.["regions"]).toBe(9)
    expect(f?.message).toContain("9 region(s)")
  })
})
