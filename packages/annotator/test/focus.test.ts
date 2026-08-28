import { describe, expect, it } from "vitest"

import {
  boxIntersectsRect,
  emptyFocus,
  focusDigest,
  handleAt,
  handlePoints,
  parseFocusSet,
  rectFromCorners,
  resizeRect,
} from "../src/focus.js"

const REGION = { x: 100, y: 100, w: 200, h: 100 }

describe("rectFromCorners", () => {
  it("normalises a drag made in any direction", () => {
    const downRight = rectFromCorners({ x: 10, y: 10 }, { x: 40, y: 30 })
    const upLeft = rectFromCorners({ x: 40, y: 30 }, { x: 10, y: 10 })
    expect(downRight).toEqual({ x: 10, y: 10, w: 30, h: 20 })
    expect(upLeft).toEqual(downRight)
  })
})

describe("boxIntersectsRect", () => {
  it("no region means everything is in scope", () => {
    expect(boxIntersectsRect({ x: 0, y: 0, w: 1, h: 1 }, null)).toBe(true)
  })

  it("a box with no geometry cannot be inside a region", () => {
    expect(boxIntersectsRect(undefined, REGION)).toBe(false)
  })

  it("counts overlap, not containment — a half-in row is in scope", () => {
    expect(boxIntersectsRect({ x: 90, y: 110, w: 20, h: 10 }, REGION)).toBe(true)
    expect(boxIntersectsRect({ x: 150, y: 120, w: 10, h: 10 }, REGION)).toBe(true)
  })

  it("edge contact is not overlap", () => {
    expect(boxIntersectsRect({ x: 60, y: 110, w: 40, h: 10 }, REGION)).toBe(false)
    expect(boxIntersectsRect({ x: 300, y: 110, w: 40, h: 10 }, REGION)).toBe(false)
  })
})

describe("resizeRect", () => {
  it("drags a corner and leaves the opposite one anchored", () => {
    const resized = resizeRect(REGION, "se", { x: 400, y: 260 })
    expect(resized).toEqual({ x: 100, y: 100, w: 300, h: 160 })
    const nw = resizeRect(REGION, "nw", { x: 50, y: 60 })
    expect(nw).toEqual({ x: 50, y: 60, w: 250, h: 140 })
  })

  it("moves by the centre", () => {
    expect(resizeRect(REGION, "move", { x: 500, y: 500 })).toEqual({
      x: 400,
      y: 450,
      w: 200,
      h: 100,
    })
  })

  /**
   * Dragging a corner past its opposite would otherwise invert the rectangle to a negative size —
   * the handles land on top of each other and the region can no longer be grabbed at all.
   */
  it("never collapses past the minimum, so the handles stay reachable", () => {
    const crushed = resizeRect(REGION, "se", { x: 0, y: 0 }, 8)
    expect(crushed.w).toBe(8)
    expect(crushed.h).toBe(8)
    expect(crushed.x).toBe(100)
    const crushedNw = resizeRect(REGION, "nw", { x: 9999, y: 9999 }, 8)
    expect(crushedNw.w).toBe(8)
    expect(crushedNw.h).toBe(8)
  })
})

describe("handleAt", () => {
  it("finds each corner and the move grip within the hit radius", () => {
    expect(handleAt(REGION, { x: 100, y: 100 }, 10)).toBe("nw")
    expect(handleAt(REGION, { x: 300, y: 200 }, 10)).toBe("se")
    expect(handleAt(REGION, { x: 200, y: 150 }, 10)).toBe("move")
  })

  it("misses cleanly so a drag inside the region still pans the canvas", () => {
    expect(handleAt(REGION, { x: 160, y: 120 }, 10)).toBeNull()
    expect(handleAt(null, { x: 100, y: 100 }, 10)).toBeNull()
  })

  it("places five handles: four corners and the centre", () => {
    expect(handlePoints(REGION).map((h) => h.handle)).toEqual(["nw", "ne", "se", "sw", "move"])
  })
})

describe("parseFocusSet", () => {
  it("round-trips a region", () => {
    const set = {
      version: 1,
      pair: "p",
      region: REGION,
      label: "content",
      updatedAt: "2026-08-28T00:00:00.000Z",
    }
    expect(parseFocusSet(set, "p")).toEqual({ ok: true, value: set })
  })

  it("treats a malformed region as no region rather than failing", () => {
    const parsed = parseFocusSet(
      { version: 1, pair: "p", region: { x: "a", y: 1, w: 2, h: 3 } },
      "p",
    )
    expect(parsed.ok).toBe(true)
    expect(parsed.value.region).toBeNull()
  })

  it("refuses another pair's region", () => {
    expect(parseFocusSet({ version: 1, pair: "other", region: REGION }, "p").ok).toBe(false)
  })

  it("survives junk", () => {
    expect(parseFocusSet(null, "p").ok).toBe(false)
    expect(parseFocusSet({}, "p").value.region).toBeNull()
  })
})

describe("focusDigest", () => {
  const findings = [
    {
      mark: 1,
      key: "k1",
      message: "inside",
      severity: "critical",
      implBox: { x: 150, y: 120, w: 10, h: 10 },
    },
    {
      mark: 2,
      key: "k2",
      message: "outside",
      severity: "minor",
      implBox: { x: 900, y: 900, w: 10, h: 10 },
    },
    {
      mark: 3,
      key: "k3",
      message: "aggregate with one instance inside",
      severity: "major",
      implBox: { x: 900, y: 20, w: 10, h: 10 },
      members: [
        { implBox: { x: 900, y: 20, w: 10, h: 10 } },
        { implBox: { x: 180, y: 130, w: 10, h: 10 } },
      ],
    },
  ]

  it("hands over the rectangle AND the findings inside it", () => {
    const set = { ...emptyFocus("p"), region: REGION, label: "content" }
    const digest = focusDigest(set, findings)
    expect(digest).toContain("**content**")
    expect(digest).toContain("x 100, y 100, 200×100")
    expect(digest).toContain("2 of 3 findings")
    expect(digest).toContain("#1 inside")
    expect(digest).toContain("#3 aggregate with one instance inside")
    expect(digest).not.toContain("#2 outside")
    // The point of the file: what is NOT in scope is stated, not left to inference.
    expect(digest).toContain("deliberately out of scope")
  })

  it("says plainly when nothing is focused", () => {
    expect(focusDigest(emptyFocus("p"), findings)).toContain("whole capture is in scope")
  })
})
