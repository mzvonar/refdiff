import type { ElementMatch } from "../pipeline.js"
import type { Box, ElementNode } from "../types.js"

import { describe, expect, it } from "vitest"

import { pairContainers, runContainerChecks } from "./containers.js"

const FRAME: Box = { x: 0, y: 0, w: 390, h: 900 }

const leaf = (id: string, x: number, y: number): ElementNode => ({
  id,
  box: { x, y, w: 40, h: 14 },
  role: "text",
  text: id,
})

const container = (
  id: string,
  box: Box,
  style: NonNullable<ElementNode["style"]> = {},
): ElementNode => ({ id, box, role: "container", style })

const match = (design: ElementNode, impl: ElementNode): ElementMatch => ({
  design,
  impl,
  gamma: 0,
  via: "text",
})

/** Two rail rows, each holding an avatar label and a title, paired leaf-for-leaf. */
const railMatches = (): ElementMatch[] => [
  match(leaf("av1", 24, 220), leaf("av1", 24, 220)),
  match(leaf("t1", 70, 220), leaf("t1", 70, 220)),
  match(leaf("av2", 24, 310), leaf("av2", 24, 310)),
  match(leaf("t2", 70, 310), leaf("t2", 70, 310)),
]

describe("pairContainers — identification by matched-leaf set", () => {
  it("pairs two containers holding the same matched leaves", () => {
    const matches = railMatches()
    const d = container("d-row1", { x: 20, y: 205, w: 350, h: 80 })
    const i = container("i-row1", { x: 20, y: 203, w: 350, h: 84 })

    const pairs = pairContainers(
      { containers: [d], frame: FRAME },
      { containers: [i], frame: FRAME },
      matches,
    )

    expect(pairs).toHaveLength(1)
    expect(pairs[0]?.design.id).toBe("d-row1")
    expect(pairs[0]?.impl.id).toBe("i-row1")
    expect(pairs[0]?.leaves).toBe(2)
  })

  it("refuses an AMBIGUOUS key — nested wrappers around the same content", () => {
    // Picking one of two wrappers with the same leaf set is a coin toss that
    // decides which box a border finding names.
    const matches = railMatches()
    const outer = container("d-outer", { x: 18, y: 203, w: 354, h: 84 })
    const inner = container("d-inner", { x: 20, y: 205, w: 350, h: 80 })
    const i = container("i-row1", { x: 20, y: 205, w: 350, h: 80 })

    expect(
      pairContainers(
        { containers: [outer, inner], frame: FRAME },
        { containers: [i], frame: FRAME },
        matches,
      ),
    ).toEqual([])
  })

  it("will not identify a container by a SINGLE leaf", () => {
    const matches = [match(leaf("only", 24, 220), leaf("only", 24, 220))]
    const d = container("d", { x: 20, y: 205, w: 350, h: 40 })
    const i = container("i", { x: 20, y: 205, w: 350, h: 40 })

    expect(
      pairContainers({ containers: [d], frame: FRAME }, { containers: [i], frame: FRAME }, matches),
    ).toEqual([])
  })

  it("skips page chrome — a wrapper holding nearly the whole frame", () => {
    const matches = railMatches()
    const d = container("d-page", { x: 0, y: 0, w: 390, h: 890 })
    const i = container("i-page", { x: 0, y: 0, w: 390, h: 890 })

    expect(
      pairContainers({ containers: [d], frame: FRAME }, { containers: [i], frame: FRAME }, matches),
    ).toEqual([])
  })

  it("pairs each row separately when the rows hold different leaves", () => {
    const matches = railMatches()
    const pairs = pairContainers(
      {
        containers: [
          container("d-row1", { x: 20, y: 205, w: 350, h: 60 }),
          container("d-row2", { x: 20, y: 295, w: 350, h: 60 }),
        ],
        frame: FRAME,
      },
      {
        containers: [
          container("i-row1", { x: 20, y: 205, w: 350, h: 60 }),
          container("i-row2", { x: 20, y: 295, w: 350, h: 60 }),
        ],
        frame: FRAME,
      },
      matches,
    )

    expect(pairs.map((p) => [p.design.id, p.impl.id])).toEqual([
      ["d-row1", "i-row1"],
      ["d-row2", "i-row2"],
    ])
  })
})

describe("runContainerChecks — what a paired wrapper reports", () => {
  const railBox = { x: 20, y: 205, w: 350, h: 60 }

  it("reports the witness: the comp's row separator that the impl does not draw", () => {
    // messages-owner-mobile: `<div …border-bottom:1px solid #f2eadd>` around an
    // avatar and a text block. Neither side's LEAF model has the div, and the
    // whole rule reached the old report as a 198-region pixel blob.
    const { findings, pairs } = runContainerChecks(
      {
        containers: [
          container("d-row", railBox, {
            borderSides: { bottom: { width: 1, color: "rgb(242, 234, 221)", style: "solid" } },
          }),
        ],
        frame: FRAME,
      },
      { containers: [container("i-row", railBox, {})], frame: FRAME },
      railMatches(),
    )

    expect(pairs).toBe(1)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe("border")
    expect(findings[0]?.severity).toBe("major")
    expect(findings[0]?.message).toContain("no border-bottom, design has one")
    expect(findings[0]?.message).toContain("2 matched leaves")
  })

  it("is SIDE-AWARE — a top border where the design puts a bottom one is two findings", () => {
    // The leaf model reads the top side only, so `divide-y` (border-top on each
    // child) against a comp's `border-bottom` looked identical to it.
    const { findings } = runContainerChecks(
      {
        containers: [
          container("d-row", railBox, {
            borderSides: { bottom: { width: 1, color: "rgb(242, 234, 221)", style: "solid" } },
          }),
        ],
        frame: FRAME,
      },
      {
        containers: [
          container("i-row", railBox, {
            borderSides: { top: { width: 1, color: "rgb(242, 234, 221)", style: "solid" } },
          }),
        ],
        frame: FRAME,
      },
      railMatches(),
    )

    expect(findings.map((f) => f.message)).toEqual([
      expect.stringContaining("a border-top the design does not have"),
      expect.stringContaining("no border-bottom, design has one"),
    ])
  })

  it("reports a container's background and radius", () => {
    const { findings } = runContainerChecks(
      {
        containers: [
          container("d", railBox, { backgroundColor: "rgb(255, 253, 249)", borderRadius: 16 }),
        ],
        frame: FRAME,
      },
      {
        containers: [
          container("i", railBox, { backgroundColor: "rgb(220, 200, 180)", borderRadius: 4 }),
        ],
        frame: FRAME,
      },
      railMatches(),
    )

    expect(findings.map((f) => f.type).sort()).toEqual(["border-radius", "color"])
  })

  it("stays quiet when the two containers paint the same thing", () => {
    const style = {
      backgroundColor: "rgb(255, 253, 249)",
      borderSides: { bottom: { width: 1, color: "rgb(242, 234, 221)", style: "solid" } },
    }
    const { findings, pairs } = runContainerChecks(
      { containers: [container("d", railBox, style)], frame: FRAME },
      { containers: [container("i", railBox, style)], frame: FRAME },
      railMatches(),
    )

    expect(pairs).toBe(1)
    expect(findings).toEqual([])
  })

  it("says nothing when a side cannot answer — a Figma capture has no DOM", () => {
    expect(
      runContainerChecks(
        { frame: FRAME },
        { containers: [container("i", railBox, {})], frame: FRAME },
        railMatches(),
      ),
    ).toEqual({ findings: [], pairs: 0 })
  })

  /**
   * A PRESENCE FLIP on the background — the comp paints a panel, the implementation paints
   * none. The border check handled this case explicitly from the start; the background check
   * required both sides to be defined, so the whole class was silent. "A panel background" is
   * one of the three things architecture.md advertises this channel for.
   *
   * The distinction that makes the fix safe is the one the module already relies on:
   * `runContainerChecks` returns early when a side has no container LIST, so inside a formed
   * pair an absent `backgroundColor` means "paints none", never "cannot tell".
   */
  it("reports a background the design paints and the implementation drops", () => {
    const { findings, pairs } = runContainerChecks(
      {
        containers: [container("d", railBox, { backgroundColor: "rgb(255, 253, 249)" })],
        frame: FRAME,
      },
      { containers: [container("i", railBox, {})], frame: FRAME },
      railMatches(),
    )

    expect(pairs).toBe(1)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.type).toBe("color")
    expect(findings[0]?.actual).toMatchObject({ backgroundColor: "rgba(0, 0, 0, 0)" })
  })

  it("reports a background the implementation paints and the design does not", () => {
    const { findings } = runContainerChecks(
      { containers: [container("d", railBox, {})], frame: FRAME },
      {
        containers: [container("i", railBox, { backgroundColor: "rgb(220, 200, 180)" })],
        frame: FRAME,
      },
      railMatches(),
    )

    expect(findings.map((f) => f.type)).toStrictEqual(["color"])
  })

  // The other half, so the flip above cannot be satisfied by an implementation that simply
  // reports every undefined background: two wrappers that both paint nothing agree.
  it("stays quiet when NEITHER side paints a background", () => {
    const { findings, pairs } = runContainerChecks(
      { containers: [container("d", railBox, {})], frame: FRAME },
      { containers: [container("i", railBox, {})], frame: FRAME },
      railMatches(),
    )

    expect(pairs).toBe(1)
    expect(findings).toEqual([])
  })
})
