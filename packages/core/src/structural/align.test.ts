import type { ElementNode } from "../types.js"

import { describe, expect, it } from "vitest"

import { alignStructural, estimateTransform } from "./align.js"

const el = (
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  text?: string,
): ElementNode => ({
  id,
  box: { x, y, w, h },
  role: text ? "text" : "box",
  ...(text ? { text } : {}),
})

describe("estimateTransform", () => {
  it("fits per-axis scale + offset from ≥3 unique-text anchors", () => {
    // Anchors must be separated on BOTH axes (≥24px) for a slope to exist.
    const design = [
      el("a", 10, 10, 50, 10, "Alpha"),
      el("b", 110, 60, 50, 10, "Bravo"),
      el("c", 210, 130, 50, 10, "Charlie"),
      el("x", 400, 400, 30, 30),
    ]
    // impl = design × 2 + (5, 7)
    const impl = [
      el("a", 25, 27, 100, 20, "Alpha"),
      el("b", 225, 127, 100, 20, "Bravo"),
      el("c", 425, 267, 100, 20, "Charlie"),
      el("y", 900, 900, 5, 5),
    ]
    const t = estimateTransform(design, impl)
    expect(t.anchors).toBe(3)
    expect(t.scaleX).toBeCloseTo(2, 5)
    expect(t.scaleY).toBeCloseTo(2, 5)
    expect(t.offsetX).toBeCloseTo(5, 5)
    expect(t.offsetY).toBeCloseTo(7, 5)
    expect(t.confidence).toBeCloseTo(3 / 8, 5)
  })

  it("uses a pure offset when EVERY design leaf is an anchor (one component vs one cell)", () => {
    // A Figma variant COMPONENT: one label, centred in a 76×40 button at (12, 12).
    const design = [el("label", 12, 12, 52, 16, "LABEL")]
    // The story cell is wider (92px) and the label is a different size: centre moves by (+8.1, −3).
    const impl = [el("label", 29.4, 8, 33.3, 19, "LABEL")]
    const t = estimateTransform(design, impl)
    expect(t.anchors).toBe(1)
    expect([t.scaleX, t.scaleY]).toEqual([1, 1])
    expect(t.offsetX).toBeCloseTo(29.4 + 33.3 / 2 - (12 + 26), 5)
    expect(t.offsetY).toBeCloseTo(8 + 9.5 - (12 + 8), 5)
    // Honest about how little it rests on: 1 anchor → 1/8.
    expect(t.confidence).toBeCloseTo(1 / 8, 5)
  })

  it("stays at identity when a page shares only an accidental word", () => {
    const design = [
      el("t", 10, 10, 60, 12, "Uložiť"),
      el("v", 300, 400, 80, 20),
      el("w", 500, 40, 80, 20, "Iné"),
    ]
    const impl = [el("t", 400, 700, 60, 12, "Uložiť"), el("v", 300, 400, 80, 20)]
    const t = estimateTransform(design, impl)
    expect(t.anchors).toBe(1)
    expect(t).toMatchObject({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, confidence: 0 })
  })

  /**
   * The real signature this exists for (uctoinak `docs-owner-desktop`): the two
   * sides line up vertically to the pixel while the horizontal packing differs,
   * because row content of different widths shifts everything across. The joint
   * confidence collapses to 0 and used to be the only number reported, which
   * reads as "unusable capture" rather than "the layouts disagree in x".
   */
  it("separates a perfect vertical fit from a broken horizontal one", () => {
    const design = [
      el("a", 100, 10, 50, 10, "Dnes"),
      el("b", 300, 60, 50, 10, "Transakcie"),
      el("c", 500, 130, 50, 10, "Prehľady"),
      el("d", 700, 200, 50, 10, "Vybrať"),
    ]
    // Same y exactly; x scattered by amounts no single scale+offset can explain.
    const impl = [
      el("a", 60, 10, 50, 10, "Dnes"),
      el("b", 340, 60, 50, 10, "Transakcie"),
      el("c", 380, 130, 50, 10, "Prehľady"),
      el("d", 90, 200, 50, 10, "Vybrať"),
    ]
    const t = estimateTransform(design, impl)
    expect(t.anchors).toBe(4)
    expect(t.confidenceY).toBeCloseTo(4 * (Math.min(1, 4 / 8) / 4), 5) // every anchor agrees in y
    expect(t.confidenceX).toBeLessThan(t.confidenceY)
    // The joint score is what gates pixels, and it can only be the weaker axis.
    expect(t.confidence).toBeLessThanOrEqual(t.confidenceX)
    expect(t.confidence).toBeLessThan(t.confidenceY)
  })

  it("reports equal joint and per-axis scores when the whole fit is clean", () => {
    const design = [
      el("a", 10, 10, 50, 10, "Alpha"),
      el("b", 110, 60, 50, 10, "Bravo"),
      el("c", 210, 130, 50, 10, "Charlie"),
    ]
    const impl = [
      el("a", 25, 27, 100, 20, "Alpha"),
      el("b", 225, 127, 100, 20, "Bravo"),
      el("c", 425, 267, 100, 20, "Charlie"),
    ]
    const t = estimateTransform(design, impl)
    expect(t.confidenceX).toBeCloseTo(t.confidence, 5)
    expect(t.confidenceY).toBeCloseTo(t.confidence, 5)
  })

  it("never lets an axis score exceed what the anchor count supports", () => {
    // 3 anchors, all agreeing on both axes → damping caps every score at 3/8.
    const design = [
      el("a", 0, 0, 40, 10, "One"),
      el("b", 0, 40, 40, 10, "Two"),
      el("c", 0, 80, 40, 10, "Three"),
    ]
    const impl = design.map((e) => ({ ...e, box: { ...e.box, x: e.box.x + 3, y: e.box.y + 3 } }))
    const t = estimateTransform(design, impl)
    expect(t.confidenceX).toBeLessThanOrEqual(3 / 8)
    expect(t.confidenceY).toBeLessThanOrEqual(3 / 8)
  })
})

describe("alignStructural on element pairs", () => {
  const capture = (elements: ElementNode[], scope?: "explicit" | "largest-child") => ({
    side: "design" as const,
    source: "figma" as const,
    ref: "r",
    pngPath: "p",
    width: 76,
    height: 40,
    dpr: 1,
    elements,
    ...(scope ? { scope: { mode: scope, selector: "s" } } : {}),
  })
  const design = [el("label", 12, 12, 52, 16, "LABEL")]
  const impl = [el("label", 29.4, 8, 33.3, 19, "LABEL")]

  it("is the identity with confidence 1 when BOTH sides captured one explicit node and anchors are too few", () => {
    const { alignment } = alignStructural({
      id: "p",
      design: capture(design, "explicit"),
      impl: { ...capture(impl, "explicit"), side: "impl", source: "storybook" },
      designScale: 1,
    })
    expect(alignment).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      confidence: 1,
      confidenceX: 1,
      confidenceY: 1,
      basis: "element-pair",
    })
  })

  it("falls back to the pure offset (basis offset) when only one side is an explicit node", () => {
    const { alignment } = alignStructural({
      id: "p",
      design: capture(design, "largest-child"),
      impl: { ...capture(impl, "explicit"), side: "impl", source: "storybook" },
      designScale: 1,
    })
    expect(alignment.basis).toBe("offset")
    expect(alignment.offsetX).toBeCloseTo(8.05, 5)
    expect(alignment.confidence).toBeCloseTo(1 / 8, 5)
  })

  it("keeps the anchor fit (basis anchors) when an element pair has ≥3 unique texts", () => {
    const d = [
      el("a", 0, 0, 40, 10, "One"),
      el("b", 0, 20, 40, 10, "Two"),
      el("c", 0, 40, 40, 10, "Three"),
    ]
    const i = d.map((e) => ({ ...e, box: { ...e.box, x: e.box.x + 5, y: e.box.y + 5 } }))
    const { alignment } = alignStructural({
      id: "p",
      design: capture(d, "explicit"),
      impl: { ...capture(i, "explicit"), side: "impl", source: "storybook" },
      designScale: 1,
    })
    expect(alignment.basis).toBe("anchors")
    expect(alignment.offsetX).toBeCloseTo(5, 5)
  })
})
