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
const rem = (diffRatio: number, clusters: { x: number; y: number; w: number; h: number; px: number }[]) => ({
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
    expect(remainderFinding(rem(0.006, [{ x: 0, y: 0, w: 20, h: 20, px: 300 }]))?.severity).toBe("minor")
    expect(remainderFinding(rem(0.09, [{ x: 0, y: 0, w: 300, h: 90, px: 9000 }]))?.severity).toBe("major")
  })

  it("caps the regions it carries but counts them all", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ x: i, y: 0, w: 10, h: 10, px: 100 - i }))
    const f = remainderFinding(rem(0.05, many))
    expect(f?.regions).toHaveLength(6)
    expect(f?.actual?.["regions"]).toBe(9)
    expect(f?.message).toContain("9 region(s)")
  })
})
