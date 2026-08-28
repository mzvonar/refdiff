import { describe, expect, it } from "vitest"

import {
  CONFIDENCE_GATE,
  escapeHtml,
  isBroken,
  pairCard,
  pairCards,
  pairsSummaryLine,
  type BrokenPair,
  type PairSummary,
} from "../src/index-view.js"

const pair = (over: Partial<PairSummary> = {}): PairSummary => ({
  dir: "docs-owner-desktop",
  pair: "docs-owner-desktop",
  pass: false,
  critical: 6,
  major: 30,
  minor: 27,
  findings: 63,
  suppressed: 23,
  confidence: 0.66,
  createdAt: "2026-08-27T18:18:33.308Z",
  designSource: "dc-html",
  implSource: "live-url",
  openNotes: 0,
  notes: 0,
  ...over,
})

describe("pairCard", () => {
  it("links a pair by the href the caller chose — a route in the app, a file when emitted", () => {
    expect(pairCard(pair(), "#/docs-owner-desktop")).toContain('href="#/docs-owner-desktop"')
    expect(pairCard(pair(), "docs-owner-desktop/report.html")).toContain(
      'href="docs-owner-desktop/report.html"',
    )
  })

  it("carries the numbers a reader picks a pair by", () => {
    const html = pairCard(pair(), "#/x")
    expect(html).toContain('<span class="n critical">6</span>')
    expect(html).toContain('<span class="n major">30</span>')
    expect(html).toContain("63 findings · 23 suppressed")
    expect(html).toContain("confidence 0.66")
    expect(html).toContain(">FAIL<")
    expect(pairCard(pair({ pass: true }), "#/x")).toContain(">PASS<")
  })

  it("flags a pair under the confidence gate, where the findings stop meaning much", () => {
    expect(pairCard(pair({ confidence: 0.13 }), "#/x")).toContain('class="kv conf weak"')
    expect(pairCard(pair({ confidence: CONFIDENCE_GATE }), "#/x")).toContain('class="kv conf"')
  })

  it("shows open notes only when there are any", () => {
    expect(pairCard(pair({ openNotes: 1 }), "#/x")).toContain(">1 note<")
    expect(pairCard(pair({ openNotes: 3 }), "#/x")).toContain(">3 notes<")
    expect(pairCard(pair(), "#/x")).not.toContain('notes">')
  })

  it("escapes the pair name and dir — a run dir name is not trusted markup", () => {
    const html = pairCard(pair({ dir: 'a"b', pair: "<b>x</b>" }), "#/a")
    expect(html).not.toContain("<b>x</b>")
    expect(html).toContain('data-pair="a&quot;b"')
    expect(escapeHtml("</script>")).toBe("&lt;/script&gt;")
  })
})

describe("a pair whose findings.json could not be read", () => {
  // The demo root's onboarding-liveness-step: findings.json cut off mid-write.
  const broken: BrokenPair = {
    dir: "onboarding-liveness-step",
    broken: true,
    reason: "findings.json · Unexpected end of JSON input",
  }

  it("is listed as a degraded card with the reason, not dropped from the list", () => {
    const html = pairCard(broken, "#/onboarding-liveness-step")
    expect(html).toContain('class="card broken"')
    expect(html).toContain("onboarding-liveness-step")
    expect(html).toContain("Couldn't read this run")
    expect(html).toContain("findings.json · Unexpected end of JSON input")
    expect(isBroken(broken)).toBe(true)
    expect(isBroken(pair())).toBe(false)
  })

  it("has nothing to open — no link, so a tap cannot land on a report that does not exist", () => {
    expect(pairCard(broken, "#/onboarding-liveness-step")).not.toContain("href=")
  })

  it("escapes the reason — it quotes whatever the parser said about a file on disk", () => {
    const html = pairCard({ ...broken, reason: "findings.json · <b>x</b>" }, "")
    expect(html).not.toContain("<b>x</b>")
  })

  it("counts in the summary line and keeps its place among the cards", () => {
    const html = pairCards([pair(), broken, pair({ dir: "b", pair: "b" })], (p) => "#/" + p.dir)
    expect(html.match(/class="card( broken)?"/g)).toHaveLength(3)
    expect(pairsSummaryLine([pair(), broken])).toBe(
      "1 failing · 0 under the 0.50 confidence gate · 1 unreadable",
    )
  })
})

describe("pairCards / pairsSummaryLine", () => {
  it("renders one card per pair", () => {
    const html = pairCards([pair(), pair({ dir: "b", pair: "b" })], (p) => "#/" + p.dir)
    expect(html.match(/class="card"/g)).toHaveLength(2)
  })

  it("summarises what is failing, untrustworthy and waiting", () => {
    const line = pairsSummaryLine([
      pair(),
      pair({ pass: true, confidence: 0.13 }),
      pair({ pass: true, openNotes: 2 }),
    ])
    expect(line).toBe("1 failing · 1 under the 0.50 confidence gate · 2 open notes")
  })

  it("drops the note clause when nothing is open", () => {
    expect(pairsSummaryLine([pair({ pass: true })])).toBe(
      "0 failing · 0 under the 0.50 confidence gate",
    )
  })
})
