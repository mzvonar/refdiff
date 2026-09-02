import { describe, expect, it } from "vitest"

import type { Finding } from "./types.js"

import { applyPolicy } from "./policy.js"

/**
 * A `textPatterns` entry may be scoped to a role, so one word cannot excuse two
 * unrelated elements.
 *
 * The real-world case, 2026-09-02: an artboard-vocabulary pattern listed
 * `Review` — a word inside the captured artboard AND the label of the delta
 * strip's Review button. One pattern silenced both, and an 84px shift of the
 * button went with it, unreported.
 */
const f = (over: Partial<Finding>): Finding =>
  ({ id: "f1", type: "position", severity: "major", mark: 1, message: "m", ...over }) as Finding

describe("role-scoped textPatterns", () => {
  it("a bare string still matches any role (unchanged behaviour)", () => {
    const r = applyPolicy([f({ text: "Review", role: "text" }), f({ text: "Review", role: "box" })], {
      textPatterns: ["^Review$"],
    })
    expect(r.kept).toHaveLength(0)
    expect(r.suppressed).toHaveLength(2)
  })

  it("an object entry only excuses its own role", () => {
    const r = applyPolicy([f({ text: "Review", role: "box" }), f({ text: "Review", role: "text" })], {
      textPatterns: [{ pattern: "^Review$", role: "box" }],
    })
    expect(r.kept.map((k) => k.role)).toEqual(["text"])
    expect(r.suppressed.map((s) => s.role)).toEqual(["box"])
  })

  it("names the role in the rule, so the report says which entry hit", () => {
    const r = applyPolicy([f({ text: "Review", role: "box" })], {
      textPatterns: [{ pattern: "^Review$", role: "box" }],
    })
    expect(r.suppressed[0]?.rule).toBe("^Review$ @box")
  })

  it("type scope separates 'this string is absent' from 'its geometry is uninteresting'", () => {
    // The axis the 2026-09-02 incident actually turned on. Role scoping could not
    // separate these: BOTH the artboard label and the delta strip's button were
    // role "text". The artboard rule wanted the 24 missing-elements and silently
    // took 3 position + 1 spacing finding about a real control with it.
    const policy = {
      textPatterns: [
        { pattern: "^Review$", types: ["missing-element", "extra-element", "text-content"] as const },
      ],
    }
    const r = applyPolicy(
      [
        f({ id: "absent", type: "missing-element", text: "Review", role: "text" }),
        f({ id: "moved", type: "position", text: "Review", role: "text" }),
      ],
      policy as never,
    )
    // applyPolicy renumbers ids (f1…/s1…), so assert on what the findings ARE.
    expect(r.suppressed.map((x) => x.type)).toEqual(["missing-element"])
    // The shift stays VISIBLE — this is the whole point.
    expect(r.kept.map((x) => x.type)).toEqual(["position"])
    expect(r.suppressed[0]?.rule).toBe("^Review$ :missing-element/extra-element/text-content")
  })

  it("a positive control: an unmatched string is kept whatever the scope", () => {
    // Without this the assertions above pass on a policy that suppresses nothing.
    const r = applyPolicy([f({ text: "Continue", role: "box" })], {
      textPatterns: [{ pattern: "^Review$", role: "box" }],
    })
    expect(r.kept).toHaveLength(1)
    expect(r.suppressed).toHaveLength(0)
  })
})
