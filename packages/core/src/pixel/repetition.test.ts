import type { Cluster } from "./cluster.js"

import { describe, expect, it } from "vitest"

import { describeRun, repeatedRuns } from "./repetition.js"

const cluster = (x: number, y: number, w: number, h: number): Cluster => ({
  box: { x, y, w, h },
  pixels: Math.max(1, Math.round(w * h)),
})

describe("repeatedRuns — evenly-spaced runs of same-size regions", () => {
  it("finds the witness: five identical hairlines at a constant vertical pitch", () => {
    // `messages-owner-mobile`'s missing phone-rail separator, as the remainder
    // saw it: five ~350×1 strips, one per row, 87px apart — and one large blob
    // that outranks every one of them by size.
    const runs = repeatedRuns([
      cluster(20, 500, 147, 57),
      cluster(20, 214, 351, 1),
      cluster(20, 301, 351, 1),
      cluster(20, 388, 351, 1),
      cluster(20, 475, 351, 1),
      cluster(20, 562, 351, 1),
    ])

    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({ count: 5, axis: "vertical", pitch: 87, w: 351, h: 1 })
    expect(describeRun(runs[0]!)).toBe(
      "5 regions of 351×1 repeating every 87px vertically, from (20, 214)",
    )
  })

  it("tolerates sub-pixel jitter in size and pitch", () => {
    const runs = repeatedRuns([
      cluster(20, 214, 350.4, 1),
      cluster(20.8, 301.6, 351.2, 1.4),
      cluster(19.6, 388.2, 350.8, 1),
      cluster(20, 475.4, 351, 1),
    ])

    expect(runs[0]?.count).toBe(4)
    expect(runs[0]?.axis).toBe("vertical")
  })

  it("finds a horizontal run too", () => {
    const runs = repeatedRuns([
      cluster(40, 120, 32, 32),
      cluster(120, 120, 32, 32),
      cluster(200, 120, 32, 32),
      cluster(280, 120, 32, 32),
    ])

    expect(runs[0]).toMatchObject({ count: 4, axis: "horizontal", pitch: 80 })
  })

  it("does not call three same-size boxes scattered over the frame a run", () => {
    // Same size, no shared lane and no constant step — the coincidence the
    // cross-axis and pitch gates exist to reject.
    expect(
      repeatedRuns([cluster(10, 10, 30, 30), cluster(400, 133, 30, 30), cluster(90, 690, 30, 30)]),
    ).toEqual([])
  })

  // The pitch gate alone let tracked and word-spaced text through: a real
  // report led with "7 regions of 5×8 repeating every 13.2px horizontally"
  // (letters of one word) and "6 regions of 6×9 every 47.2px" (first letters of
  // successive words). Nothing 9px on its longest side is a repeated rule.
  it("rejects glyph-sized members however evenly they are spaced", () => {
    expect(
      repeatedRuns(Array.from({ length: 7 }, (_, i) => cluster(221 + i * 13.2, 499, 5, 8))),
    ).toEqual([])
    expect(
      repeatedRuns(Array.from({ length: 6 }, (_, i) => cluster(116 + i * 47.2, 588, 6, 9))),
    ).toEqual([])
  })

  it("does not call two regions a run", () => {
    expect(repeatedRuns([cluster(20, 214, 351, 1), cluster(20, 301, 351, 1)])).toEqual([])
  })

  it("returns the run up to an outlier rather than nothing", () => {
    const runs = repeatedRuns([
      cluster(20, 214, 351, 1),
      cluster(20, 301, 351, 1),
      cluster(20, 388, 351, 1),
      // Off-pitch: a sixth row that is 40px further down joins no run.
      cluster(20, 515, 351, 1),
    ])

    expect(runs[0]?.count).toBe(3)
  })

  // The first real report led with "6 regions of 7×9 repeating every 8.4px
  // horizontally" — six letters of one word, each speck as wide as the gap to
  // the next. Layout rhythm is spaced out; text and dithering are adjacent.
  it("rejects a glyph sequence: members as wide as the gap between them", () => {
    const glyphs = Array.from({ length: 6 }, (_, i) => cluster(40 + i * 8.4, 323, 7, 9))
    expect(repeatedRuns(glyphs)).toEqual([])
  })

  it("ranks the longer run first", () => {
    const runs = repeatedRuns([
      cluster(500, 10, 40, 40),
      cluster(500, 130, 40, 40),
      cluster(500, 250, 40, 40),
      cluster(20, 214, 351, 1),
      cluster(20, 301, 351, 1),
      cluster(20, 388, 351, 1),
      cluster(20, 475, 351, 1),
    ])

    expect(runs.map((r) => r.count)).toEqual([4, 3])
  })
})
