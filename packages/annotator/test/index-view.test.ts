import { describe, expect, it } from "vitest"

import {
  autoRetryMessage,
  classifyListError,
  CONFIDENCE_GATE,
  countMessage,
  DEFAULT_FILTER,
  errorBox,
  errorCopyText,
  escapeHtml,
  filterEntries,
  isBroken,
  matchesFilter,
  pairCard,
  pairCards,
  relativeWhen,
  sortEntries,
  SOURCE_CHIPS,
  STATE_CHIPS,
  type BrokenPair,
  type ListError,
  type PairSummary,
} from "../src/index-view.js"

// The demo root's opened pair, as /api/pairs summarises it.
const NOW = Date.parse("2026-08-28T14:22:05.000Z")
const pair = (over: Partial<PairSummary> = {}): PairSummary => ({
  dir: "onboarding-document-step",
  pair: "Onboarding — Document step",
  pass: false,
  critical: 2,
  major: 2,
  minor: 2,
  findings: 6,
  suppressed: 3,
  confidence: 0.42,
  createdAt: "2026-08-28T14:10:05.000Z",
  designSource: "figma",
  implSource: "live-url",
  implRef: "/onboarding/document",
  implPng: "onboarding-document-step/impl.png",
  delta: { introduced: 3, resolved: 1, regressions: 0 },
  openNotes: 2,
  notes: 3,
  ...over,
})

// The demo root's onboarding-liveness-step: findings.json cut off mid-write.
const broken: BrokenPair = {
  dir: "onboarding-liveness-step",
  broken: true,
  reason: "findings.json · Unexpected end of JSON input",
}

describe("pairCard (desktop — the comp's thumbnail card)", () => {
  const html = pairCard(pair(), "#/onboarding-document-step", "desktop", NOW)

  it("links a pair by the href the caller chose — a route in the app, a file when emitted", () => {
    expect(html).toContain('href="#/onboarding-document-step"')
    expect(pairCard(pair(), "onboarding-document-step/report.html", "desktop", NOW)).toContain(
      'href="onboarding-document-step/report.html"',
    )
    expect(html).toMatch(/^<a class="card" data-pair="onboarding-document-step"/)
  })

  it("puts the verdict top-left and the run state top-right of the thumbnail band", () => {
    expect(html).toContain('<span class="verdict fail">Fail</span>')
    expect(html).toContain('<span class="state analyzed">Analyzed</span>')
    const clean = pairCard(pair({ pass: true, critical: 0, major: 0, minor: 0, findings: 0 }), "#/x", "desktop", NOW)
    expect(clean).toContain('<span class="verdict pass">Pass</span>')
    expect(clean).toContain('<span class="state clean">Clean</span>')
    // A passing run that still found minor things is analyzed, not clean.
    expect(pairCard(pair({ pass: true, critical: 0, major: 0, findings: 2 }), "#/x", "desktop", NOW)).toContain(
      "Analyzed",
    )
  })

  it("shows the run's own impl screenshot, and the comp's plate when the capture has none (D6, gap 25)", () => {
    expect(html).toContain('<img class="shot" src="onboarding-document-step/impl.png"')
    const noShot = pairCard(pair({ implPng: undefined }), "#/x", "desktop", NOW)
    expect(noShot).not.toContain("<img")
    expect(noShot).toContain('<div class="plate"><i class="b1"></i><i class="b2"></i><i class="b3"></i></div>')
  })

  it("names the design source, and the impl route in mono", () => {
    // The label in its own span, as the comp's runtime renders an interpolation — the chip border stays the chip's.
    expect(html).toContain('<span class="src"><span class="msi" aria-hidden="true">design_services</span><span>Figma</span></span>')
    expect(html).toContain('<span class="route mono">/onboarding/document</span>')
    expect(pairCard(pair({ designSource: "dc-html" }), "#/x", "desktop", NOW)).toContain("auto_awesome</span><span>Claude Design</span>")
    // A source the comp never drew is still named, never hidden.
    expect(pairCard(pair({ designSource: "sketch" }), "#/x", "desktop", NOW)).toContain("description</span><span>sketch</span>")
  })

  it("draws severity dot-badges only for non-zero counts, and the comment count always", () => {
    expect(html).toContain('<span class="badge critical"><i class="dot"></i>Critical 2</span>')
    expect(html).toContain('<span class="badge major"><i class="dot"></i>Major 2</span>')
    expect(html).toContain('<span class="badge minor"><i class="dot"></i>Minor 2</span>')
    expect(html).toContain("chat_bubble</span>3</span>")
    const quiet = pairCard(pair({ critical: 0, major: 0, minor: 0, findings: 0, notes: 0 }), "#/x", "desktop", NOW)
    expect(quiet).toContain('<span class="badge none">No findings</span>')
    expect(quiet).not.toContain("Critical 0")
    expect(quiet).toContain("chat_bubble</span>0</span>")
  })

  it("reads the delta as a direction (gap 1): diverging, converging, steady — or a first run", () => {
    expect(html).toContain('<span class="trend diverging"><span class="msi" aria-hidden="true">trending_up</span>Diverging</span>')
    expect(html).toContain('<span class="delta mono">+3 new / −1 resolved</span>')
    const conv = pairCard(pair({ delta: { introduced: 1, resolved: 4, regressions: 0 } }), "#/x", "desktop", NOW)
    expect(conv).toContain("trending_down</span>Converging")
    const steady = pairCard(pair({ delta: { introduced: 2, resolved: 2, regressions: 0 } }), "#/x", "desktop", NOW)
    expect(steady).toContain("trending_flat</span>Steady")
    // No previous run: say so, do not pretend +0 / −0.
    const first = pairCard(pair({ delta: undefined }), "#/x", "desktop", NOW)
    expect(first).toContain('<span class="delta mono">first run</span>')
    expect(first).not.toContain('class="trend')
  })

  it("prints when the run finished relative to the clock it is given", () => {
    expect(html).toContain('<span class="when">12 min ago</span>')
  })

  it("warns under the confidence gate as a state, never as a number to rank by (gap 2)", () => {
    expect(html).toContain('warning</span>Positions unreliable · <span class="pct">42%</span> anchor match</div>')
    expect(pairCard(pair({ confidence: CONFIDENCE_GATE }), "#/x", "desktop", NOW)).not.toContain("Positions unreliable")
    expect(html).not.toContain("0.42")
  })

  it("escapes the pair name, dir, route and image path — a run dir name is not trusted markup", () => {
    const h = pairCard(
      pair({ dir: 'a"b', pair: "<b>x</b>", implRef: "<i>", implPng: 'a"b/impl.png' }),
      "#/a",
      "desktop",
      NOW,
    )
    expect(h).not.toContain("<b>x</b>")
    expect(h).not.toContain("<i>")
    expect(h).toContain('data-pair="a&quot;b"')
    expect(h).toContain('src="a&quot;b/impl.png"')
    expect(escapeHtml("</script>")).toBe("&lt;/script&gt;")
  })
})

describe("pairCard (mobile — the comp's row list)", () => {
  const html = pairCard(pair(), "#/onboarding-document-step", "mobile", NOW)

  it("is a row: tile, then name + verdict, source + badges + comments, trend + delta", () => {
    expect(html).toContain('<img class="tile" src="onboarding-document-step/impl.png"')
    expect(html).toContain('<div class="col"><div class="crow name-row"><span class="name">Onboarding — Document step</span><span class="verdict fail">Fail</span></div>')
    expect(html).toContain('<div class="crow cmeta"><span class="src">')
    expect(html).toContain("Diverging</span>")
    expect(html).toContain('Positions unreliable · <span class="pct">42%</span> anchor match')
  })

  it("draws no state pill, no route and no when — the comp's row has none", () => {
    expect(html).not.toContain('class="state')
    expect(html).not.toContain('class="route')
    expect(html).not.toContain('class="when"')
  })

  it("uses the plate as the tile when there is no capture", () => {
    expect(pairCard(pair({ implPng: undefined }), "#/x", "mobile", NOW)).toContain('class="tile plate"')
  })
})

describe("a pair whose findings.json could not be read", () => {
  it("is listed as a degraded card with the reason, not dropped from the list", () => {
    const html = pairCard(broken, "#/onboarding-liveness-step", "desktop", NOW)
    expect(html).toContain('class="card broken"')
    expect(html).toContain("broken_image")
    expect(html).toContain("onboarding-liveness-step")
    expect(html).toContain("Couldn’t read this run")
    expect(html).toContain('<span class="tech mono">findings.json · Unexpected end of JSON input</span>')
    // Only the directory is known: no route line.
    expect(html).not.toContain('class="route')
    expect(isBroken(broken)).toBe(true)
    expect(isBroken(pair())).toBe(false)
  })

  it("has nothing to open — a div, no link, so a tap cannot land on a report that does not exist", () => {
    for (const layout of ["desktop", "mobile"] as const) {
      const html = pairCard(broken, "#/onboarding-liveness-step", layout, NOW)
      expect(html).not.toContain("href=")
      expect(html).toMatch(/^<div class="card broken"/)
    }
  })

  it("shows what could still be read off the broken file — the pair's name and route", () => {
    const named = { ...broken, pair: "Onboarding — Liveness step", implRef: "/onboarding/liveness" }
    const desktop = pairCard(named, "", "desktop", NOW)
    expect(desktop).toContain('<span class="name">Onboarding — Liveness step</span>')
    expect(desktop).toContain('<span class="route mono">/onboarding/liveness</span>')
    expect(desktop).toContain('data-pair="onboarding-liveness-step"')
    // The comp's mobile row has no route.
    expect(pairCard(named, "", "mobile", NOW)).not.toContain('class="route')
  })

  it("is a dashed row on mobile with the same reason", () => {
    const html = pairCard(broken, "", "mobile", NOW)
    expect(html).toContain('<div class="tile"><span class="msi" aria-hidden="true">broken_image</span></div>')
    expect(html).toContain("findings.json · Unexpected end of JSON input")
  })

  it("escapes the reason — it quotes whatever the parser said about a file on disk", () => {
    const html = pairCard({ ...broken, reason: "findings.json · <b>x</b>" }, "", "desktop", NOW)
    expect(html).not.toContain("<b>x</b>")
  })

  it("keeps its place among the cards and counts toward the total", () => {
    const html = pairCards([pair(), broken, pair({ dir: "b", pair: "b" })], (p) => "#/" + p.dir, "desktop", NOW)
    expect(html.match(/class="card( broken)?"/g)).toHaveLength(3)
    expect(countMessage(filterEntries([pair(), broken], DEFAULT_FILTER).length, 2)).toBe("2 of 2 comparisons")
  })
})

describe("sortEntries", () => {
  it("lists the newest run first, keeps ties in dir order, and puts a run with no readable time last", () => {
    const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
    const sorted = sortEntries([
      pair({ dir: "button", createdAt: at(40 * 60_000) }),
      broken,
      pair({ dir: "login", createdAt: at(60 * 60_000) }),
      pair({ dir: "confirm-modal", createdAt: at(0) }),
      pair({ dir: "onboarding-document-step", createdAt: at(12 * 60_000) }),
      pair({ dir: "selection-card", createdAt: at(40 * 60_000) }),
    ])
    expect(sorted.map((e) => e.dir)).toEqual([
      "confirm-modal",
      "onboarding-document-step",
      "button",
      "selection-card",
      "login",
      "onboarding-liveness-step",
    ])
  })

  it("keeps a broken run in its place when its createdAt could be salvaged off the cut file", () => {
    const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
    const sorted = sortEntries([
      pair({ dir: "login", createdAt: at(60 * 60_000) }),
      { ...broken, createdAt: at(30 * 60_000) },
      pair({ dir: "button", createdAt: at(10 * 60_000) }),
    ])
    expect(sorted.map((e) => e.dir)).toEqual(["button", "onboarding-liveness-step", "login"])
  })

  it("does not lose a run whose createdAt cannot be parsed — it sorts with the unreadable ones", () => {
    const sorted = sortEntries([pair({ dir: "odd", createdAt: "?" }), pair({ dir: "ok" })])
    expect(sorted.map((e) => e.dir)).toEqual(["ok", "odd"])
  })
})

describe("relativeWhen", () => {
  it("speaks the comp's vocabulary against the given clock", () => {
    const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
    expect(relativeWhen(at(20_000), NOW)).toBe("just now")
    expect(relativeWhen(at(12 * 60_000), NOW)).toBe("12 min ago")
    expect(relativeWhen(at(60 * 60_000), NOW)).toBe("1 h ago")
    expect(relativeWhen(at(2 * 3_600_000 + 5_000), NOW)).toBe("2 h ago")
    expect(relativeWhen(at(24 * 3_600_000), NOW)).toBe("yesterday")
    expect(relativeWhen(at(3 * 24 * 3_600_000), NOW)).toBe("3 d ago")
  })

  it("prints an unparseable timestamp as-is rather than NaN", () => {
    expect(relativeWhen("not a date", NOW)).toBe("not a date")
  })
})

describe("the filter row", () => {
  const entries = [
    pair(),
    pair({ dir: "button", pair: "Button", implRef: "ds/Button", designSource: "dc-html", pass: false, critical: 1, major: 0, minor: 1, confidence: 0.96, notes: 0, delta: { introduced: 1, resolved: 2, regressions: 0 } }),
    pair({ dir: "stepper", pair: "Stepper", implRef: "ds/Stepper", pass: true, critical: 0, major: 0, minor: 0, findings: 0, confidence: 0.94, notes: 0, delta: { introduced: 0, resolved: 3, regressions: 0 } }),
    broken,
  ]
  const dirs = (f: Partial<typeof DEFAULT_FILTER>) =>
    filterEntries(entries, { ...DEFAULT_FILTER, ...f }).map((e) => e.dir)

  it("offers the comp's chips minus Pending — refdiff has no run-in-progress state (gap 24)", () => {
    expect(SOURCE_CHIPS.map((c) => c.label)).toEqual(["Both sources", "Figma", "Claude Design"])
    expect(STATE_CHIPS.map((c) => c.label)).toEqual([
      "Any state",
      "Failing",
      "Critical",
      "Diverging",
      "Low confidence",
      "Has comments",
    ])
  })

  it("shows everything, the unreadable run included, under the defaults", () => {
    expect(dirs({})).toEqual(["onboarding-document-step", "button", "stepper", "onboarding-liveness-step"])
  })

  it("filters by the design source", () => {
    expect(dirs({ source: "dc-html" })).toEqual(["button"])
    expect(dirs({ source: "figma" })).toEqual(["onboarding-document-step", "stepper"])
  })

  it("searches the name and the route, case-insensitively", () => {
    expect(dirs({ query: "DS/" })).toEqual(["button", "stepper"])
    expect(dirs({ query: "document" })).toEqual(["onboarding-document-step"])
    // The unreadable run has only its dir name to search by.
    expect(dirs({ query: "liveness" })).toEqual(["onboarding-liveness-step"])
  })

  it("filters by state in refdiff's terms", () => {
    expect(dirs({ state: "fail" })).toEqual(["onboarding-document-step", "button"])
    expect(dirs({ state: "critical" })).toEqual(["onboarding-document-step", "button"])
    expect(dirs({ state: "diverging" })).toEqual(["onboarding-document-step"])
    expect(dirs({ state: "lowconf" })).toEqual(["onboarding-document-step"])
    expect(dirs({ state: "comments" })).toEqual(["onboarding-document-step"])
  })

  it("lists a broken run only under Any state — it has no state to filter by", () => {
    for (const state of ["fail", "critical", "diverging", "lowconf", "comments"] as const) {
      expect(matchesFilter(broken, { ...DEFAULT_FILTER, state })).toBe(false)
    }
    expect(matchesFilter(broken, { ...DEFAULT_FILTER, source: "figma" })).toBe(false)
  })

  it("treats a first run as not diverging — there is nothing to diverge from", () => {
    expect(matchesFilter(pair({ delta: undefined }), { ...DEFAULT_FILTER, state: "diverging" })).toBe(false)
  })
})

describe("the list-load error box (plan, section C)", () => {
  const err = (over: Partial<ListError> = {}): ListError => ({
    kind: "server",
    tech: "Failed to fetch · /api/pairs · 14:22:05",
    root: "/root/refdiff/fixtures/demo-root",
    restartCommand: "refdiff-annotator /root/refdiff/fixtures/demo-root --serve --port 7379",
    retries: 3,
    secs: 30,
    copied: false,
    ...over,
  })

  it("server gone: names the real error, the out root, and offers the restart command", () => {
    const html = errorBox(err())
    expect(html).toContain('data-kind="server"')
    expect(html).toContain("power_off")
    expect(html).toContain("Can’t reach the annotator")
    expect(html).toContain("Failed to fetch · /api/pairs · 14:22:05")
    expect(html).toContain("/root/refdiff/fixtures/demo-root")
    expect(html).toContain("content_copy</span>Copy restart command")
    expect(html).toContain('id="lib-retry"')
    expect(html).toContain("Retried 3× · next attempt in 30s")
    expect(errorCopyText(err())).toBe("refdiff-annotator /root/refdiff/fixtures/demo-root --serve --port 7379")
  })

  it("endpoint errored: a different headline, and the out root path to copy", () => {
    const e = err({ kind: "endpoint", tech: "HTTP 500 · /api/pairs · 14:22:05" })
    const html = errorBox(e)
    expect(html).toContain('data-kind="endpoint"')
    expect(html).toContain("The pair list couldn’t be read")
    expect(html).toContain("HTTP 500 · /api/pairs · 14:22:05")
    expect(html).toContain("Copy out root path")
    expect(errorCopyText(e)).toBe("/root/refdiff/fixtures/demo-root")
  })

  it("acknowledges a copy, and counts the retries down", () => {
    expect(errorBox(err({ copied: true }))).toContain("check</span>Copied")
    expect(autoRetryMessage(4, 7)).toBe("Retried 4× · next attempt in 7s")
  })

  it("classifies a network-layer failure as the server gone, anything with a response as the endpoint", () => {
    expect(classifyListError(new TypeError("Failed to fetch"))).toBe("server")
    expect(classifyListError(new Error("HTTP 500"))).toBe("endpoint")
    expect(classifyListError(new SyntaxError("Unexpected end of JSON input"))).toBe("endpoint")
  })

  it("escapes what it quotes — the error text and the root are not trusted markup", () => {
    expect(errorBox(err({ tech: "<b>x</b>", root: "<i>" }))).not.toMatch(/<b>x<\/b>|<i>/)
  })
})
