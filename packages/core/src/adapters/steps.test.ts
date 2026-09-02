import { describe, expect, it, vi } from "vitest"

import { describeStep, readStep, readSteps, runSteps, stepsOnOneSide, type StepPage } from "./steps.js"

describe("readStep", () => {
  it("reads the four shapes", () => {
    expect(readStep({ click: "#a" })).toEqual({ click: "#a" })
    expect(readStep({ clickText: "12 Retake" })).toEqual({ clickText: "12 Retake" })
    expect(readStep({ press: "Escape" })).toEqual({ press: "Escape" })
    expect(readStep({ wait: 300 })).toEqual({ wait: 300 })
  })

  it("rejects what it cannot run rather than guessing", () => {
    // An empty selector matches everything; a negative wait is a typo. Both would
    // capture SOME state and call it the requested one.
    expect(readStep({ click: "" })).toBeUndefined()
    expect(readStep({ wait: -1 })).toBeUndefined()
    expect(readStep({ hover: "#a" })).toBeUndefined()
    expect(readStep("click #a")).toBeUndefined()
  })

  it("counts what it dropped, so a typo is visible", () => {
    const r = readSteps([{ click: "#a" }, { nope: 1 }, { wait: 10 }])
    expect(r.steps).toHaveLength(2)
    expect(r.dropped).toBe(1)
  })
})

describe("stepsOnOneSide", () => {
  it("flags the shape that reports 'selected vs not selected'", () => {
    // Driving the comp into its selected state and capturing the app in its
    // default one produces a confident report about nothing.
    expect(stepsOnOneSide([{ click: "#a" }], undefined)).toBe(true)
    expect(stepsOnOneSide(undefined, [{ click: "#a" }])).toBe(true)
    expect(stepsOnOneSide([{ click: "#a" }], [{ click: "#b" }])).toBe(false)
    expect(stepsOnOneSide(undefined, undefined)).toBe(false)
    expect(stepsOnOneSide([], [])).toBe(false)
  })
})

const page = (counts: Record<string, number>): StepPage & { clicks: string[] } => {
  const clicks: string[] = []
  return {
    clicks,
    locator: (sel: string) => ({
      count: async () => counts[sel] ?? 0,
      first: () => ({ click: async () => { clicks.push(sel) } }),
    }),
    keyboard: { press: async (k: string) => { clicks.push("key:" + k) } },
    waitForTimeout: async () => {},
    evaluate: (async () => true) as StepPage["evaluate"],
  }
}

describe("runSteps", () => {
  it("runs them in order", async () => {
    const p = page({ "#a": 1, "#b": 1 })
    expect(await runSteps(p, [{ click: "#a" }, { press: "Escape" }, { click: "#b" }])).toBeUndefined()
    expect(p.clicks).toEqual(["#a", "key:Escape", "#b"])
  })

  it("HARD-STOPS on a missing target instead of capturing the default state", async () => {
    // The whole point: a silent fallback would photograph a different state than
    // the pair claims and go green doing it.
    const p = page({ "#a": 1 })
    const err = await runSteps(p, [{ click: "#a" }, { click: "#gone" }])
    expect(err).toEqual({ kind: "step-target-not-found", index: 1, step: { click: "#gone" } })
    // And it stops there — no steps after the failure ran.
    expect(p.clicks).toEqual(["#a"])
  })

  it("reports a thrown click as step-failed with its index", async () => {
    const p = page({ "#a": 1 })
    p.locator = (sel: string) => ({
      count: async () => 1,
      first: () => ({ click: async () => { throw new Error("intercepted by overlay") } }),
    })
    const err = await runSteps(p, [{ click: "#a" }])
    expect(err).toMatchObject({ kind: "step-failed", index: 0, detail: "intercepted by overlay" })
  })

  it("does not settle when there is nothing to do", async () => {
    const p = page({})
    const settle = vi.fn(async () => {})
    p.waitForTimeout = settle
    expect(await runSteps(p, [])).toBeUndefined()
    expect(settle).not.toHaveBeenCalled()
  })
})

describe("describeStep", () => {
  it("is readable in a log line", () => {
    expect(describeStep({ click: "#a" })).toBe("click #a")
    expect(describeStep({ clickText: "12 Retake" })).toBe('clickText "12 Retake"')
    expect(describeStep({ wait: 300 })).toBe("wait 300ms")
  })
})
