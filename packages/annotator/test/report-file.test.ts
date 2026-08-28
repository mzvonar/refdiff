import { describe, expect, it } from "vitest"

import { parseReport } from "../src/report-file.js"

const report = {
  pair: "onboarding-document-step",
  createdAt: "2026-08-28T14:10:05.000Z",
  design: { source: "figma", ref: "x", width: 680, height: 740 },
  impl: { source: "live-url", ref: "/onboarding/document", width: 680, height: 740 },
  alignment: { scale: 1, offsetX: 0, offsetY: 0, confidence: 0.42 },
  findings: [],
  verdict: { pass: true, failThreshold: "major" },
  artifacts: { designPng: "design.png", implPng: "impl.png" },
}

describe("parseReport", () => {
  it("reads a report and normalises the fields older runs did not write", () => {
    const r = parseReport(JSON.stringify(report))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.value.pair).toBe("onboarding-document-step")
    expect(r.value.suppressed).toEqual([])
    expect(r.value.policy).toEqual({})
  })

  it("turns a findings.json cut off mid-write into the reason the Library prints", () => {
    // `refdiff compare` writing the file while the list is read; the demo
    // root's deliberately broken `onboarding-liveness-step`.
    const cut = JSON.stringify(report).slice(0, 80)
    const r = parseReport(cut)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.reason).toMatch(/^findings\.json · /)
    expect(r.reason.toLowerCase()).toContain("json")
  })

  it("names the fields a wrong-shaped file is missing instead of drawing garbage", () => {
    const r = parseReport(JSON.stringify({ pair: "x", findings: [] }))
    expect(r).toEqual({
      ok: false,
      reason: "findings.json · not a ComparisonReport (missing alignment, design, impl, artifacts)",
    })
    expect(parseReport("[]")).toEqual({ ok: false, reason: "findings.json · not an object" })
    expect(parseReport("null")).toEqual({ ok: false, reason: "findings.json · not an object" })
  })
})
