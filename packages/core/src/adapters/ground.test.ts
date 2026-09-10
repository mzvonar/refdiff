import { describe, expect, it } from "vitest"

import { DEFAULT_GROUND, GROUND_ATTR, GROUND_CSS, readGround } from "./ground.js"

describe("readGround", () => {
  // The KDoc names exactly two accepted values; this is that list driven
  // through the real reader, one row per vector, so a widened or narrowed
  // parser cannot pass while the documentation still reads true.
  it.each(["transparent", "keep"] as const)("accepts %s", (v) => {
    expect(readGround(v)).toBe(v)
  })

  // `undefined` is the important reject: it is what an entry with no `ground`
  // key produces, and it must be distinguishable from an explicit value so the
  // three-tier resolver can fall through to the next tier rather than pinning
  // the default at the first one.
  it.each([undefined, null, "", "Transparent", "TRANSPARENT", "none", "opaque", true, 0, {}])(
    "rejects %o",
    (v) => {
      expect(readGround(v)).toBeUndefined()
    },
  )
})

describe("the ground rule", () => {
  it("defaults to transparent", () => {
    expect(DEFAULT_GROUND).toBe("transparent")
  })

  /**
   * The rule removes the GROUND and says so. Border and shadow are deliberately
   * out — they paint at the ancestor's own edge — and a later edit that widens
   * this should widen `ground.ts`'s comment in the same change, not quietly.
   */
  it("neutralises background paint through the marker attribute, and nothing else", () => {
    expect(GROUND_CSS).toContain(`[${GROUND_ATTR}]`)
    expect(GROUND_CSS).toContain("background:transparent !important")
    expect(GROUND_CSS).toContain("background-image:none !important")
    expect(GROUND_CSS).not.toContain("border")
    expect(GROUND_CSS).not.toContain("box-shadow")
  })
})
