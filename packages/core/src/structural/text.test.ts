import { describe, expect, it } from "vitest"

import { normalizeForComparison, normalizeForMatching } from "./text.js"

describe("typographic folding", () => {
  /**
   * The case that forced this: comps draw "−412,80 €" (U+2212), `Intl.NumberFormat` renders
   * "-412,80 €" for sk-SK (U+002D) — CLDR's call, and it differs by locale (sv/fi/lt already use
   * U+2212). Compared raw, every money row read as copy drift AND stopped being an anchor, which
   * cost `client-pending-accountant-desktop` 0.55 → 0.35 confidence, under the pixel gate.
   */
  it("treats the two minus glyphs as the same mark", () => {
    expect(normalizeForComparison("−412,80 €")).toBe(normalizeForComparison("-412,80 €"))
    expect(normalizeForMatching("−412,80 €")).toBe(normalizeForMatching("-412,80 €"))
  })

  it("still reports a MISSING sign — that is semantics, not typography", () => {
    expect(normalizeForComparison("−850,00 €")).not.toBe(normalizeForComparison("850,00 €"))
  })

  it("folds every occurrence, not just a leading one", () => {
    expect(normalizeForComparison("−5 … −7")).toBe("-5 … -7")
  })

  it("leaves an en dash and an em dash alone — those carry meaning", () => {
    expect(normalizeForComparison("2020–2024")).not.toBe(normalizeForComparison("2020-2024"))
    expect(normalizeForComparison("a — b")).not.toBe(normalizeForComparison("a - b"))
  })
})

describe("whitespace and case", () => {
  it("collapses runs of whitespace, including NBSP and the narrow spaces", () => {
    expect(normalizeForComparison("Čaká na   akciu\n")).toBe("Čaká na akciu")
    expect(normalizeForComparison("412,80 €")).toBe("412,80 €")
  })

  it("matching is case-insensitive: the two sides differ in text-transform", () => {
    expect(normalizeForMatching("ČAKÁ NA VLASTNÍKA")).toBe(
      normalizeForMatching("Čaká na vlastníka"),
    )
  })

  it("the text-content CHECK stays case-sensitive: a re-cased label is copy drift", () => {
    expect(normalizeForComparison("Potvrdiť")).not.toBe(normalizeForComparison("POTVRDIŤ"))
  })
})
