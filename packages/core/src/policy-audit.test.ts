import { describe, expect, it } from "vitest"

import type { SuppressedFinding } from "./types.js"

import { hiddenMovement, movementPx } from "./policy-audit.js"

const f = (over: Partial<SuppressedFinding>): SuppressedFinding =>
  ({
    id: "f1",
    type: "position",
    severity: "major",
    mark: 1,
    message: "m",
    suppressedBy: "text-pattern",
    rule: "^(Review|Continue)$",
    ...over,
  }) as SuppressedFinding

describe("movementPx", () => {
  it("is the largest single AXIS, not the diagonal", () => {
    // A pure-x shift is what the real miss looked like (77px across, 0 down); a
    // hypot would read the same number here but under-report a mixed shift
    // against a threshold a person chose in px.
    expect(movementPx(f({ expected: { x: 26, y: 82 }, actual: { x: 110, y: 82 } }))).toBe(84)
    expect(movementPx(f({ type: "size", expected: { w: 84, h: 14 }, actual: { w: 161, h: 14 } }))).toBe(77)
    expect(movementPx(f({ type: "spacing", expected: { gap: 24 }, actual: { gap: 8 } }))).toBe(16)
  })

  it("ignores non-geometric types and unpaired values", () => {
    expect(movementPx(f({ type: "color", expected: { color: "a" }, actual: { color: "b" } }))).toBeUndefined()
    expect(movementPx(f({ type: "text-content", expected: { text: "a" }, actual: { text: "b" } }))).toBeUndefined()
    // A finding with no numbers on one side describes nothing measurable.
    expect(movementPx(f({ expected: { x: 1 }, actual: {} }))).toBeUndefined()
  })
})

describe("hiddenMovement", () => {
  it("names a text rule that hid a large shift, with the narrower tool", () => {
    const out = hiddenMovement([
      f({ id: "big", expected: { x: 26 }, actual: { x: 110 } }),
      f({ id: "small", expected: { x: 26 }, actual: { x: 29 } }),
    ])
    expect(out.map((h) => h.id)).toEqual(["big"])
    expect(out[0]?.px).toBe(84)
    expect(out[0]?.rule).toBe("^(Review|Continue)$")
    expect(out[0]?.advice).toContain("dataSlots")
  })

  it("leaves ACCEPTED deviations alone", () => {
    // An accepted rule is built from the measurement and lapses when either
    // value changes — a person already read the number. Reporting it as hidden
    // would train the reader to ignore this list.
    const out = hiddenMovement([
      f({ id: "acc", suppressedBy: "accepted", rule: "reviewed", expected: { x: 0 }, actual: { x: 300 } }),
    ])
    expect(out).toEqual([])
  })

  it("flags a role or region rule too, but without the dataSlots advice", () => {
    // Those do not hide text, so the advice would be wrong; the shift is still
    // worth naming.
    const out = hiddenMovement([
      f({ id: "r", suppressedBy: "role", rule: "backdrop", expected: { y: 0 }, actual: { y: 40 } }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]?.advice).toBeUndefined()
  })

  it("sorts worst first and honours the threshold", () => {
    const out = hiddenMovement(
      [
        f({ id: "a", expected: { x: 0 }, actual: { x: 20 } }),
        f({ id: "b", expected: { x: 0 }, actual: { x: 90 } }),
        f({ id: "c", expected: { x: 0 }, actual: { x: 30 } }),
      ],
      25,
    )
    expect(out.map((h) => h.id)).toEqual(["b", "c"])
  })
})
