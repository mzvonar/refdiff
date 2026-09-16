import type { Alignment, ElementNode } from "../types.js"

import { describe, expect, it } from "vitest"

import { driftWalk, formatDriftWalk } from "./drift.js"

const identity: Alignment = { scale: 1, offsetX: 0, offsetY: 0, confidence: 1 }

const el = (text: string, y: number, x = 0): ElementNode => ({
  id: `${text}-${y}`,
  box: { x, y, w: 100, h: 20 },
  text,
})

/** Map a comp-space y into impl space the way `alignStructural` does. */
const mapped = (text: string, rawY: number, a: Alignment): ElementNode =>
  el(text, rawY * (a.scaleY ?? a.scale) + a.offsetY)

describe("driftWalk", () => {
  /**
   * The case the walk exists for, and the one it was hand-written for twice.
   *
   * Three rows of a grid, each 100px tall in the comp; the implementation's row
   * is 110px because its text inherited a taller leading. The fit cannot see a
   * per-row step as three `position` findings — it absorbs it as `scaleY 1.1`
   * and names no element. Undone, the residual steps once per row, and the
   * element AT the step is the one to measure.
   */
  it("names the element where a per-repeat step hides inside a scaleY", () => {
    const alignment: Alignment = { scale: 1, scaleY: 1.1, offsetX: 0, offsetY: 0, confidence: 0.9 }
    const design = [
      mapped("Prvý riadok", 0, alignment),
      mapped("Druhý riadok", 100, alignment),
      mapped("Tretí riadok", 200, alignment),
    ]
    const impl = [el("Prvý riadok", 0), el("Druhý riadok", 110), el("Tretí riadok", 220)]

    const walk = driftWalk({ alignment, design, impl })

    expect(walk.rows.map((r) => [r.text, r.raw, r.delta])).toEqual([
      ["Prvý riadok", 0, 0],
      ["Druhý riadok", 100, 10],
      ["Tretí riadok", 200, 20],
    ])
    expect(walk.steps.map((s) => [s.at.text, s.step])).toEqual([
      ["Druhý riadok", 10],
      ["Tretí riadok", 10],
    ])
  })

  /**
   * The other shape §1a names: an OFFSET alone is one box above the anchors, and
   * the residual is then FLAT. Reporting steps here would send the reader down
   * the page looking for a repeat that does not exist.
   */
  it("reports no step when the whole page is displaced by one box", () => {
    const alignment: Alignment = { scale: 1, offsetX: 0, offsetY: 12, confidence: 0.9 }
    const design = [
      mapped("Hlavička", 0, alignment),
      mapped("Telo", 100, alignment),
      mapped("Pätička", 200, alignment),
    ]
    const impl = [el("Hlavička", 12), el("Telo", 112), el("Pätička", 212)]

    const walk = driftWalk({ alignment, design, impl })
    // Flat at a CONSTANT, not at zero: the constant is the offset the fit
    // absorbed, and reading it as "no drift" is the mistake this pins against.
    expect(walk.rows.map((r) => r.delta)).toEqual([12, 12, 12])
    expect(walk.steps).toEqual([])
    expect(formatDriftWalk(walk)).toContain("Flat")
  })

  /**
   * A 1px-per-row shortfall is the measured Library case (`.thumb`, 132 + 1 px).
   * The plateau is carried forward from the last step rather than compared with
   * the immediately preceding row precisely so this does not vanish: row to row
   * the change is 1px, and against a per-row comparison at any tolerance that
   * admits sub-pixel noise it would report nothing at all.
   */
  it("still reports a slow one-pixel-per-row slide", () => {
    const alignment: Alignment = { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.9 }
    const design = [el("a", 0), el("b", 100), el("c", 200), el("d", 300)]
    const impl = [el("a", 0), el("b", 101), el("c", 202), el("d", 303)]

    const walk = driftWalk({ alignment, design, impl })
    expect(walk.steps.length).toBeGreaterThan(0)
    expect(walk.rows.map((r) => r.delta)).toEqual([0, 1, 2, 3])
  })

  /**
   * A REPEATED label cannot anchor anything: which of the ten cards a given
   * "Figma" is, is the question the alignment could not answer either. Using it
   * would invent a pairing and print a delta that means nothing.
   */
  it("anchors only on text that is unique on BOTH sides", () => {
    const alignment: Alignment = { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.9 }
    const design = [el("Figma", 0), el("Figma", 100), el("Nastavenia", 200)]
    const impl = [el("Figma", 5), el("Figma", 105), el("Nastavenia", 260)]

    const walk = driftWalk({ alignment, design, impl })
    expect(walk.rows.map((r) => r.text)).toEqual(["Nastavenia"])
    expect(walk.rows[0]!.delta).toBe(60)
  })

  /** Whitespace differences are not a different element — the anchor rule normalises. */
  it("pairs across collapsed whitespace", () => {
    const alignment: Alignment = { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.9 }
    const walk = driftWalk({
      alignment,
      design: [el("Zoznam  správ", 0)],
      impl: [el("Zoznam správ", 4)],
    })
    expect(walk.rows).toHaveLength(1)
    expect(walk.rows[0]!.delta).toBe(4)
  })

  /**
   * The x axis is the same walk. `confidence` counts an anchor only when BOTH
   * axes land it, so a pair that reads "high y, low x" needs this one.
   */
  it("walks the x axis when asked", () => {
    const alignment: Alignment = { scale: 1.02, offsetX: 6, offsetY: 0, confidence: 0.9 }
    const design = [el("Vľavo", 0, 0 * 1.02 + 6), el("Vpravo", 0, 300 * 1.02 + 6)]
    const impl = [el("Vľavo", 0, 0), el("Vpravo", 0, 320)]

    const walk = driftWalk({ alignment, design, impl }, { axis: "x" })
    expect(walk.axis).toBe("x")
    expect(walk.scale).toBe(1.02)
    expect(walk.offset).toBe(6)
    expect(walk.rows.map((r) => r.text).sort()).toEqual(["Vpravo", "Vľavo"])
  })

  /**
   * Nothing shared means nothing to walk, and the reason is the SAME shortage
   * that caps alignment confidence — so the output says so rather than printing
   * an empty table that reads as "no drift".
   */
  it("says why it can say nothing when the sides share no unique text", () => {
    const alignment: Alignment = { scale: 1, offsetX: 0, offsetY: 0, confidence: 0 }
    const walk = driftWalk({ alignment, design: [el("Komp", 0)], impl: [el("Impl", 0)] })
    expect(walk.rows).toEqual([])
    expect(walk.unanchoredDesign).toBe(1)
    expect(walk.unanchoredImpl).toBe(1)
    expect(formatDriftWalk(walk)).toContain("nothing to walk")
  })

  it("marks the identity transform, so a flat walk is not read as a fitted one", () => {
    const walk = driftWalk({ alignment: identity, design: [el("a", 0)], impl: [el("a", 0)] })
    expect(walk.identity).toBe(true)
    expect(formatDriftWalk(walk)).toContain("the identity")
  })

  /** `scaleY` falls back to `scale`: an isotropic fit records only the one field. */
  it("uses scale for the y axis when the fit was isotropic", () => {
    const alignment: Alignment = { scale: 2, offsetX: 0, offsetY: 0, confidence: 0.9 }
    const walk = driftWalk({ alignment, design: [el("a", 200)], impl: [el("a", 100)] })
    expect(walk.scale).toBe(2)
    expect(walk.rows[0]).toMatchObject({ raw: 100, impl: 100, delta: 0 })
  })
})
