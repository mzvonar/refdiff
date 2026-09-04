import { describe, expect, it } from "vitest"

import type { Finding } from "../types.js"
import { verdictOf } from "./verdict.js"

const f = (severity: Finding["severity"], explained?: string): Finding => ({
  id: "f1",
  mark: 1,
  type: "position",
  severity,
  message: "m",
  ...(explained === undefined ? {} : { explained: { cause: explained, rule: "because" } }),
})

describe("verdictOf", () => {
  it("fails on an unexplained finding at or above the threshold", () => {
    expect(verdictOf([f("major")], "major").pass).toBe(false)
    expect(verdictOf([f("critical")], "major").pass).toBe(false)
    expect(verdictOf([f("minor")], "major").pass).toBe(true)
  })

  it("does NOT fail on an explained one, however severe — its cause is diagnosed and not ours", () => {
    expect(verdictOf([f("critical", "comp rail row order")], "major").pass).toBe(true)
    // …and one unexplained finding beside a hundred explained ones still fails the run.
    expect(verdictOf([f("critical", "comp rail row order"), f("major")], "major").pass).toBe(false)
  })
})
