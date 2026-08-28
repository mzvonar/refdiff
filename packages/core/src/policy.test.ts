import type { Finding } from "./types.js"

import { describe, expect, it } from "vitest"

import { applyPolicy, mergePolicies } from "./policy.js"

const finding = (id: string, partial: Partial<Finding>): Finding => ({
  id,
  mark: 0,
  type: "position",
  severity: "minor",
  message: "",
  ...partial,
})

const missing = (id: string, text: string, box = { x: 10, y: 10, w: 60, h: 14 }): Finding =>
  finding(id, {
    type: "missing-element",
    severity: "critical",
    role: "text",
    designBox: box,
    message: `design "${text}" (60×14) has no counterpart in the implementation`,
  })

const textDiff = (id: string, expected: string, actual: string): Finding =>
  finding(id, {
    type: "text-content",
    severity: "minor",
    role: "text",
    designBox: { x: 10, y: 50, w: 60, h: 14 },
    implBox: { x: 10, y: 50, w: 198, h: 14 },
    expected: { text: expected },
    actual: { text: actual },
    message: `text reads "${actual}", design says "${expected}"`,
  })

describe("applyPolicy", () => {
  it("keeps everything under an empty policy, renumbered", () => {
    const { kept, suppressed } = applyPolicy([missing("f9", "Alza"), textDiff("f3", "a", "b")])
    expect(kept.map((f) => f.id)).toEqual(["f1", "f2"])
    expect(kept.map((f) => f.mark)).toEqual([1, 2])
    expect(suppressed).toEqual([])
  })

  /**
   * The default is deliberately NOISY. Which strings are data is a per-pair
   * judgement; a harness that assumes it centrally goes quiet about copy
   * regressions — on one uctoinak page every one of the 9 pairs the blanket
   * rule called "data" was static copy.
   */
  it("does NOT treat differing text as data unless asked to", () => {
    const drift = [textDiff("f1", "Potvrdiť →", "Návrh")]
    expect(applyPolicy(drift).kept.map((f) => f.type)).toEqual(["text-content"])
    expect(applyPolicy(drift, {}).kept).toHaveLength(1)
    expect(applyPolicy(drift, { dataSlots: false }).kept).toHaveLength(1)
    // …and opting in is what silences it.
    expect(applyPolicy(drift, { dataSlots: true }).kept).toEqual([])
  })

  describe("narrowed data slots — ignore data by shape, still compare copy", () => {
    const MONEY = "^[0-9  ]+,[0-9]{2}\\s*€$"
    const money = { dataSlots: { patterns: [MONEY] } }

    it("suppresses a pair whose text still looks like data on both sides", () => {
      const { kept, suppressed } = applyPolicy([textDiff("f1", "412,00 €", "84,20 €")], money)
      expect(kept).toEqual([])
      expect(suppressed[0]!.suppressedBy).toBe("data-slot")
      expect(suppressed[0]!.rule).toBe(`data shape ${MONEY}`)
    })

    /**
     * MIXED slots — part static copy, part dynamic — are the case a whole-string
     * match cannot serve. The shape is masked out and the REMAINDER compared, so
     * the label drifts and the date churn are separated.
     */
    describe("a slot that is partly copy and partly data", () => {
      const DATE = "\\d{1,2}\\. \\d{1,2}\\. \\d{4}"
      const dates = { dataSlots: { patterns: [DATE] } }

      it("REPORTS the copy drift while ignoring the date", () => {
        const { kept, suppressed } = applyPolicy(
          [textDiff("f1", "Blok · 12. 7. 2026", "Doklad · 12. 7. 2026")],
          dates,
        )
        expect(kept.map((f) => f.type)).toEqual(["text-content"])
        expect(suppressed).toEqual([])
      })

      it("still suppresses when ONLY the date moved", () => {
        const { kept, suppressed } = applyPolicy(
          [textDiff("f1", "Blok · 12. 7. 2026", "Blok · 11. 7. 2026")],
          dates,
        )
        expect(kept).toEqual([])
        expect(suppressed[0]!.suppressedBy).toBe("data-slot")
      })

      it("REPORTS when the copy drifts AND the date moves", () => {
        const { kept } = applyPolicy(
          [textDiff("f1", "Blok · 12. 7. 2026", "Doklad · 9. 7. 2026")],
          dates,
        )
        expect(kept.map((f) => f.type)).toEqual(["text-content"])
      })

      it("REPORTS when the dynamic half stops being a date", () => {
        const { kept } = applyPolicy(
          [textDiff("f1", "Blok · 12. 7. 2026", "Doklad · nedávno")],
          dates,
        )
        expect(kept.map((f) => f.type)).toEqual(["text-content"])
      })

      it("masks EVERY occurrence, not just the first", () => {
        const { kept } = applyPolicy(
          [textDiff("f1", "1. 1. 2026 – 31. 1. 2026", "1. 2. 2026 – 28. 2. 2026")],
          dates,
        )
        expect(kept).toEqual([])
      })

      // The blanket rule cannot make any of these distinctions.
      it("is exactly what dataSlots:true cannot do", () => {
        const drift = [textDiff("f1", "Blok · 12. 7. 2026", "Doklad · 12. 7. 2026")]
        expect(applyPolicy(drift, { dataSlots: true }).kept).toEqual([])
        expect(applyPolicy(drift, dates).kept).toHaveLength(1)
      })
    })

    it("REPORTS a copy difference that does not have the data shape", () => {
      const { kept, suppressed } = applyPolicy([textDiff("f1", "Potvrdiť →", "Návrh")], money)
      expect(kept.map((f) => f.type)).toEqual(["text-content"])
      expect(suppressed).toEqual([])
    })

    /**
     * The drift case this form exists for: a slot that held an amount now holds
     * static copy. `dataSlots: true` still calls that "matched pair, differing
     * text" and swallows it forever; requiring the shape on BOTH sides makes the
     * rule lapse the moment one side stops being data.
     */
    it("REPORTS a slot restructured from data into static copy", () => {
      const drifted = [textDiff("f1", "412,00 €", "Zľava uplatnená")]
      expect(applyPolicy(drifted, money).kept.map((f) => f.type)).toEqual(["text-content"])
      // …and the blanket form is exactly what would have hidden it.
      expect(applyPolicy(drifted, { dataSlots: true }).kept).toEqual([])
    })

    it("still compares position and colour on a suppressed data pair", () => {
      const position = finding("f2", {
        type: "position",
        message: `"84,20 €" is offset by (7, 0.5)px from the design position`,
      })
      const colour = finding("f3", { type: "color", message: `"84,20 €" text color differs` })
      const { kept, suppressed } = applyPolicy(
        [textDiff("f1", "412,00 €", "84,20 €"), position, colour],
        money,
      )
      expect(kept.map((f) => f.type)).toEqual(["position", "color"])
      expect(suppressed.map((f) => f.type)).toEqual(["text-content"])
    })

    it("differs from textPatterns, which suppress geometry about the same string too", () => {
      const position = finding("f2", {
        type: "position",
        message: `"84,20 €" is offset by (7, 0.5)px from the design position`,
      })
      const { kept } = applyPolicy([textDiff("f1", "412,00 €", "84,20 €"), position], {
        dataSlots: false,
        textPatterns: [MONEY],
      })
      expect(kept).toEqual([])
    })

    it("does not suppress when a side carries no text", () => {
      const noActual = finding("f1", {
        type: "text-content",
        expected: { text: "412,00 €" },
        message: "text missing",
      })
      expect(applyPolicy([noActual], money).kept).toHaveLength(1)
    })
  })

  it("data-slot rule suppresses text-content only, other checks survive", () => {
    const position = finding("f2", {
      type: "position",
      designBox: { x: 10, y: 50, w: 60, h: 14 },
      implBox: { x: 30, y: 50, w: 198, h: 14 },
      message: `"Alza.sk s.r.o." is offset by (20, 0)px from the design position`,
    })
    const { kept, suppressed } = applyPolicy(
      [textDiff("f1", "Alza.sk s.r.o.", "Slovak Telekom, a.s."), position],
      { dataSlots: true },
    )
    expect(kept.map((f) => f.type)).toEqual(["position"])
    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]!.type).toBe("text-content")
    expect(suppressed[0]!.suppressedBy).toBe("data-slot")
    expect(suppressed[0]!.id).toBe("s1")
    // the original finding is intact in the suppressed list — never dropped
    expect(suppressed[0]!.expected).toEqual({ text: "Alza.sk s.r.o." })
  })

  it("text patterns match the element label and both compared strings", () => {
    const { kept, suppressed } = applyPolicy(
      [
        missing("f1", "FA-2026-0341"),
        missing("f2", "Extrahované údaje"),
        textDiff("f3", "1 249,00 €", "45,60 €"),
      ],
      { textPatterns: ["^FA-\\d{4}-\\d+$", "\\d+,\\d{2} €"] },
    )
    expect(kept.map((f) => f.message)).toEqual([
      'design "Extrahované údaje" (60×14) has no counterpart in the implementation',
    ])
    expect(suppressed.map((s) => s.rule)).toEqual(["^FA-\\d{4}-\\d+$", "\\d+,\\d{2} €"])
    expect(suppressed.every((s) => s.suppressedBy === "text-pattern")).toBe(true)
  })

  it("text patterns see the element's FULL label, not the message's truncated quote", () => {
    // The RefDiff Comparison Tool comp renders its artboard as live DOM; the sentence
    // "Choose a document type and upload a clear photo of it." (54 chars) is quoted in the
    // message as "Choose a document type and upload a clea…", so an anchored pattern for the
    // whole sentence never hit and the finding stayed visible.
    const sentence = "Choose a document type and upload a clear photo of it."
    const f = finding("f1", {
      type: "missing-element",
      severity: "critical",
      role: "text",
      text: sentence,
      designBox: { x: 593, y: 281, w: 258, h: 13 },
      message: 'design "Choose a document type and upload a clea…" (258×13) has no counterpart in the implementation',
    })
    const { kept, suppressed } = applyPolicy([f], { textPatterns: [`^${sentence.replace(".", "\\.")}$`] })
    expect(kept).toHaveLength(0)
    expect(suppressed).toHaveLength(1)
    expect(suppressed[0]!.suppressedBy).toBe("text-pattern")
  })

  it("regions suppress findings whose box sits inside them (impl space)", () => {
    const inside = missing("f1", "1a", { x: 0, y: -20, w: 25, h: 16 })
    const outside = missing("f2", "Detail", { x: 60, y: 60, w: 60, h: 14 })
    const { kept, suppressed } = applyPolicy([inside, outside], {
      regions: [{ x: -10, y: -40, w: 800, h: 40 }],
    })
    expect(kept).toHaveLength(1)
    expect(kept[0]!.message).toContain("Detail")
    expect(suppressed[0]!.suppressedBy).toBe("region")
  })

  it("roles suppress by element role", () => {
    const icon = finding("f1", {
      type: "extra-element",
      role: "icon",
      implBox: { x: 0, y: 0, w: 16, h: 16 },
      message: "implementation renders icon at (0, 0)",
    })
    const { kept, suppressed } = applyPolicy([icon, missing("f2", "x")], { roles: ["icon"] })
    expect(kept).toHaveLength(1)
    expect(suppressed[0]!.rule).toBe("icon")
  })

  it("does not mutate its input", () => {
    const input = [textDiff("f1", "a", "b")]
    const snapshot = JSON.stringify(input)
    applyPolicy(input, { dataSlots: true })
    expect(JSON.stringify(input)).toBe(snapshot)
  })
})

describe("mergePolicies", () => {
  it("concatenates lists and lets later scalars win", () => {
    const merged = mergePolicies(
      { textPatterns: ["a"], scope: ".x", dataSlots: false },
      undefined,
      { textPatterns: ["b"], dataSlots: true },
    )
    expect(merged).toEqual({ textPatterns: ["a", "b"], scope: ".x", dataSlots: true })
  })
})

describe("accepted deviations", () => {
  const ink = {
    id: "f1",
    mark: 1,
    type: "color" as const,
    severity: "major" as const,
    role: "text",
    designBox: { x: 0, y: 0, w: 10, h: 10 },
    expected: { color: "rgb(26, 26, 26)" },
    actual: { color: "rgb(44, 36, 25)" },
    message: "ink",
  }
  const rule = {
    type: "color" as const,
    expected: { color: "rgb(26, 26, 26)" },
    actual: { color: "rgb(44, 36, 25)" },
    reason: "app ink token; the comp is the outlier",
  }

  it("suppresses a finding whose type and listed values match, keeping the reason", () => {
    const { kept, suppressed } = applyPolicy([ink], { accepted: [rule] })
    expect(kept).toEqual([])
    expect(suppressed[0]).toMatchObject({ suppressedBy: "accepted", rule: rule.reason })
  })

  it("narrows a pixel-region acceptance to one changeKind", () => {
    const swap = {
      ...ink,
      type: "pixel-region" as const,
      role: "icon",
      expected: { diffRatio: 0 },
      actual: { diffRatio: 0.2, diffPixels: 400, clusters: 1, changeKind: "shape" },
      message: "glyph",
    }
    const placeholder = {
      type: "pixel-region" as const,
      role: "icon",
      changeKind: "shape",
      reason: "story placeholder icon",
    }
    expect(applyPolicy([swap], { accepted: [placeholder] }).suppressed[0]).toMatchObject({
      rule: placeholder.reason,
    })
    // A recolor of the same icon is NOT the accepted deviation.
    const recolor = { ...swap, actual: { ...swap.actual, changeKind: "color" } }
    expect(applyPolicy([recolor], { accepted: [placeholder] }).kept).toHaveLength(1)
    // Without the key, any pixel difference on icons would be accepted — the blind form.
    expect(
      applyPolicy([recolor], { accepted: [{ type: "pixel-region", role: "icon", reason: "any" }] })
        .kept,
    ).toHaveLength(0)
  })

  // Decision D6 on the Library pairs: the card thumbnail is the run's own
  // impl.png where the comp draws a grey plate with three bars; the extra <img>
  // is accepted, and the plate's bars sit inside it — textless boxes the
  // same decision covers. A label inside the region is NOT covered.
  describe("contents: true — the accepted element's insides", () => {
    type Boxes = Pick<Finding, "designBox" | "implBox">
    const textless = (
      id: string,
      type: Finding["type"],
      role: string,
      boxes: Boxes,
      values: Pick<Finding, "expected" | "actual"> = {},
      message = id,
    ): Finding => ({ id, mark: 0, type, severity: "major", role, message, ...boxes, ...values })
    const tile = textless("tile", "extra-element", "image", { implBox: { x: 17, y: 160, w: 274.5, h: 131 } })
    const bar = (id: string, y: number, h: number): Finding =>
      textless(id, "missing-element", "box", { designBox: { x: 82.91, y, w: 142.69, h } })
    const numeral: Finding = {
      ...textless("numeral", "missing-element", "text", { designBox: { x: 100, y: 200, w: 8, h: 12 } }),
      text: "1",
    }
    const outside = bar("outside", 400, 12)
    const d6 = { type: "extra-element" as const, role: "image", contents: true as const, reason: "D6: the thumbnail is the run's own impl.png" }

    it("suppresses the textless findings inside the accepted element, visibly, as '<reason> (inside)'", () => {
      const { kept, suppressed } = applyPolicy(
        [tile, bar("b1", 202, 61.3), bar("b2", 189, 7), bar("b3", 269, 12), numeral, outside],
        { accepted: [d6] },
      )
      expect(suppressed.map((s) => [s.message, s.rule])).toEqual([
        ["tile", d6.reason],
        ["b1", `${d6.reason} (inside)`],
        ["b2", `${d6.reason} (inside)`],
        ["b3", `${d6.reason} (inside)`],
      ])
      expect(suppressed.every((s) => s.suppressedBy === "accepted")).toBe(true)
      // Boxes only: the numeral inside the region and the bar outside it stay.
      expect(kept.map((f) => f.message)).toEqual(["numeral", "outside"])
    })

    it("excuses nothing extra without the flag, and nothing when the rule itself hit nothing", () => {
      const { contents: _c, ...plain } = d6
      expect(applyPolicy([tile, bar("b1", 202, 61.3)], { accepted: [plain] }).kept).toHaveLength(1)
      expect(applyPolicy([bar("b1", 202, 61.3)], { accepted: [d6] }).kept).toHaveLength(1)
    })

    it("uses both boxes of a PAIRED accepted finding as the region and needs every box of a candidate inside it", () => {
      // The mobile Library: the plate is matched to the tile — a size finding
      // on the pair, its bars inside the impl box but not the design box.
      const pair: Boxes = { designBox: { x: 32, y: 287, w: 34, h: 26 }, implBox: { x: 27, y: 273, w: 44, h: 56 } }
      const plate = textless("plate", "size", "box", pair, { expected: { w: 34, h: 26 }, actual: { w: 44, h: 56 } })
      const topBar = textless("topBar", "missing-element", "box", { designBox: { x: 32, y: 279, w: 23.8, h: 5 } })
      const shifted = textless("shifted", "position", "box", pair, { expected: { x: 32, y: 287 }, actual: { x: 27, y: 273 } })
      const straddling = textless("taller", "position", "box", { ...pair, implBox: { x: 27, y: 273, w: 44, h: 80 } })
      const rule = { type: "size" as const, role: "box", expected: { w: 34, h: 26 }, actual: { w: 44, h: 56 }, contents: true as const, reason: "D6 mobile" }
      const { kept, suppressed } = applyPolicy([plate, topBar, shifted, straddling], { accepted: [rule] })
      expect(suppressed.map((s) => s.rule)).toEqual(["D6 mobile", "D6 mobile (inside)", "D6 mobile (inside)"])
      expect(kept.map((f) => f.message)).toEqual(["taller"])
    })
  })

  it("does not accept a different value, type, or a partial mismatch", () => {
    expect(
      applyPolicy([{ ...ink, actual: { color: "rgb(0, 0, 0)" } }], { accepted: [rule] }).kept,
    ).toHaveLength(1)
    expect(applyPolicy([{ ...ink, type: "border" }], { accepted: [rule] }).kept).toHaveLength(1)
    expect(applyPolicy([{ ...ink, actual: {} }], { accepted: [rule] }).kept).toHaveLength(1)
  })

  it("matches on the listed keys only (a type-wide acceptance needs no values)", () => {
    const { kept } = applyPolicy([ink], {
      accepted: [{ type: "color", reason: "all colors reviewed" }],
    })
    expect(kept).toEqual([])
  })

  it("narrows by role when the rule names one (a boxless missing-element has no values to match)", () => {
    const { expected: _e, actual: _a, ...boxless } = ink
    const ring = { ...boxless, type: "missing-element" as const, role: "box", message: "ring" }
    const rule = {
      type: "missing-element" as const,
      role: "box",
      reason: "focus ring is a CSS outline",
    }
    expect(applyPolicy([ring], { accepted: [rule] }).suppressed[0]).toMatchObject({
      suppressedBy: "accepted",
      rule: rule.reason,
    })
    expect(applyPolicy([{ ...ring, role: "text" }], { accepted: [rule] }).kept).toHaveLength(1)
    expect(
      applyPolicy([ring], { accepted: [{ type: rule.type, reason: rule.reason }] }).kept,
    ).toEqual([])
  })

  it("concatenates accepted rules when merging policies", () => {
    const merged = mergePolicies(
      { accepted: [rule] },
      { accepted: [{ type: "spacing", reason: "x" }] },
    )
    expect(merged.accepted).toHaveLength(2)
  })
})
