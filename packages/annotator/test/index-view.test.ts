import { describe, expect, it } from "vitest"

import {
  CONFIDENCE_GATE,
  DEFAULT_FILTER,
  SOURCE_CHIPS,
  STATE_CHIPS,
  autoRetryMessage,
  cellsShown,
  classifyListError,
  countMessage,
  entryIdOf,
  errorBox,
  errorCopyText,
  escapeHtml,
  filterEntries,
  cellRow,
  filterExplainer,
  groupEntries,
  groupRow,
  groupRunSpan,
  groupWhen,
  isBroken,
  isFilterActive,
  isFoldable,
  libraryTable,
  matchesFilter,
  moreRow,
  openGroups,
  pairCard,
  pairCards,
  relativeWhen,
  sortEntries,
  staleCells,
  ROW_CAP,
  type BrokenPair,
  type LibraryGroup,
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
    expect(countMessage(filterEntries([pair(), broken], DEFAULT_FILTER).length, 2, 2, 2)).toBe("2 cells in 2 groups")
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
    // The Library-groups comp RENAMED two of them, and both renames changed
    // what the filter means — see STATE_CHIPS' own note.
    expect(STATE_CHIPS.map((c) => c.label)).toEqual([
      "Any state",
      "Failing",
      "Critical",
      "Regressed",
      "Stale cells",
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
    expect(dirs({ state: "comments" })).toEqual(["onboarding-document-step"])
  })

  // `Regressed` is NOT the retired `Diverging`. Both of these entries diverge
  // (`introduced > resolved`); only the one whose delta carries a REGRESSION —
  // a finding an earlier run had resolved and this one found again — matches.
  it("filters by a fix come undone, not by a divergence", () => {
    const diverging = pair({ dir: "d", delta: { introduced: 3, resolved: 1, regressions: 0 } })
    const regressed = pair({ dir: "r", delta: { introduced: 3, resolved: 1, regressions: 2 } })
    expect(filterEntries([diverging, regressed], { ...DEFAULT_FILTER, state: "regressed" }).map((e) => e.dir)).toEqual(["r"])
  })

  // `Stale cells` is NOT the retired `Low confidence`: it is a per-GROUP run
  // property, so a low-confidence cell at its group's newest run does not match
  // and a confident cell behind its group's newest does.
  it("filters by staleness within the group, never by confidence", () => {
    const entries = [
      cell("ds-alert--a", { run: 4, confidence: 0.1 }),
      cell("ds-alert--b", { run: 3, confidence: 0.99 }),
    ]
    expect(filterEntries(entries, { ...DEFAULT_FILTER, state: "stale" }).map((e) => e.dir)).toEqual(["ds-alert--b"])
  })

  it("lists a broken run only under Any state — it has no state to filter by", () => {
    for (const state of ["fail", "critical", "regressed", "stale", "comments"] as const) {
      expect(matchesFilter(broken, { ...DEFAULT_FILTER, state })).toBe(false)
    }
    expect(matchesFilter(broken, { ...DEFAULT_FILTER, source: "figma" })).toBe(false)
  })

  it("treats a first run as not regressed — there is nothing to have come undone", () => {
    expect(matchesFilter(pair({ delta: undefined }), { ...DEFAULT_FILTER, state: "regressed" })).toBe(false)
  })
})

/* ---------------------------------------------------- the derived groups -- */

// The shape a real variant set has on disk: `${entryId}--${slug}`. The counts
// are the DS root's five biggest entries, measured 2026-09-04 — 157 of its 194
// pairs live in five of its fourteen groups, which is the case this exists for.
const cell = (dir: string, over: Partial<PairSummary> = {}): PairSummary =>
  pair({ dir, pair: dir, ...over })

describe("entryIdOf — the split that makes the tree free", () => {
  it("takes the FIRST `--` only, so a slug may carry more of them", () => {
    expect(entryIdOf("ds-button-fill--state-default_variant-default")).toBe("ds-button-fill")
    expect(entryIdOf("a--b--c")).toBe("a")
    // Malformed but grouped under the prefix it does name, rather than vanishing.
    expect(entryIdOf("a--")).toBe("a")
  })

  it("calls a pair id with no `--` a lone item — the annotator's own eight are that shape", () => {
    expect(entryIdOf("refdiff-library-desktop")).toBeNull()
    expect(entryIdOf("onboarding-document-step")).toBeNull()
    expect(entryIdOf("")).toBeNull()
  })

  it("calls an id that STARTS with `--` a lone item too: there is no entry to name", () => {
    expect(entryIdOf("--orphan")).toBeNull()
    expect(entryIdOf("--")).toBeNull()
  })
})

describe("groupEntries", () => {
  const ds = [
    cell("ds-button-fill--state-default_variant-default"),
    cell("ds-button-fill--state-hover_variant-default"),
    cell("ds-button-fill--state-focus_variant-default"),
    cell("ds-alert--color-error_aligned-left_type-text"),
    cell("ds-alert--color-info_aligned-left_type-text"),
    cell("ds-chip--size-md"),
  ]

  it("folds a flat list into one group per entry, keeping every cell", () => {
    const groups = groupEntries(ds)
    expect(groups.map((g) => [g.id, g.cells.length, g.total])).toEqual([
      ["ds-button-fill", 3, 3],
      ["ds-alert", 2, 2],
      ["ds-chip", 1, 1],
    ])
    expect(cellsShown(groups)).toBe(ds.length)
  })

  it("orders groups by their FIRST cell, so a sorted list puts the newest run's set first", () => {
    const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()
    const sorted = sortEntries([
      cell("ds-alert--a", { createdAt: at(3 * 3_600_000) }),
      cell("ds-checkbox--a", { createdAt: at(30 * 60_000) }),
      cell("ds-alert--b", { createdAt: at(3 * 3_600_000 + 1000) }),
      cell("ds-checkbox--b", { createdAt: at(31 * 60_000) }),
    ])
    expect(groupEntries(sorted).map((g) => g.id)).toEqual(["ds-checkbox", "ds-alert"])
    // Cells keep the order they arrived in — newest first, within the group too.
    expect(groupEntries(sorted)[0]?.cells.map((c) => c.dir)).toEqual(["ds-checkbox--a", "ds-checkbox--b"])
  })

  it("lists a lone item as its own group, and such a group can never hold anything else", () => {
    const groups = groupEntries([cell("ds-alert--a"), pair(), broken])
    expect(groups.map((g) => [g.id, g.set, g.total])).toEqual([
      ["ds-alert", true, 1],
      ["onboarding-document-step", false, 1],
      ["onboarding-liveness-step", false, 1],
    ])
    // The invariant the renderer leans on: not a set ⇒ exactly one cell.
    for (const g of groups) expect(g.set || g.total === 1).toBe(true)
  })

  it("groups an unreadable run by its dir like any other — it is never dropped", () => {
    const groups = groupEntries([cell("ds-alert--a"), { ...broken, dir: "ds-alert--b" }])
    expect(groups).toHaveLength(1)
    expect(groups[0]?.cells.map((c) => c.dir)).toEqual(["ds-alert--a", "ds-alert--b"])
    expect(groups[0]?.roll.broken).toBe(1)
  })

  it("rolls up the severities of the cells it shows, and counts the cells whose fix came undone", () => {
    const groups = groupEntries([
      cell("ds-alert--a", { critical: 1, major: 2, minor: 3, delta: { introduced: 1, resolved: 0, regressions: 1 } }),
      cell("ds-alert--b", { critical: 0, major: 1, minor: 0, delta: { introduced: 4, resolved: 9, regressions: 2 } }),
      cell("ds-alert--c", { critical: 0, major: 0, minor: 0, delta: undefined }),
    ])
    expect(groups[0]?.roll).toEqual({ critical: 1, major: 3, minor: 3, regressed: 2, broken: 0 })
  })

  it("counts a regression, not a divergence: a diverging cell with no undone fix is not regressed", () => {
    // The `Diverging` chip's introduced > resolved — visible on the card's own
    // trend already. `regressed` is delta.regressions, which no card can show.
    const groups = groupEntries([cell("ds-alert--a", { delta: { introduced: 9, resolved: 0, regressions: 0 } })])
    expect(groups[0]?.roll.regressed).toBe(0)
  })

  it("applies the filter INSIDE a group, remembers what the group held, and drops a group with no match", () => {
    const entries = [
      cell("ds-alert--a", { pass: false, critical: 2 }),
      cell("ds-alert--b", { pass: true, critical: 0, major: 0, minor: 0, findings: 0 }),
      cell("ds-chip--a", { pass: true, critical: 0, major: 0, minor: 0, findings: 0 }),
    ]
    const groups = groupEntries(entries, { ...DEFAULT_FILTER, state: "fail" })
    expect(groups.map((g) => [g.id, g.cells.length, g.total])).toEqual([["ds-alert", 1, 2]])
    // The head row counts CELLS and names the groups they sit in.
    expect(countMessage(cellsShown(groups), entries.length, groups.length, 2)).toBe(
      "1 of 3 cells · 1 of 2 groups",
    )
    // Nothing matches anywhere: no groups at all, which is the empty state.
    expect(groupEntries(entries, { ...DEFAULT_FILTER, query: "nothing" })).toEqual([])
  })

  it("rolls up only what it shows, so a header's numbers reconcile with the cards under it", () => {
    const groups = groupEntries(
      [
        cell("ds-alert--a", { critical: 5, major: 0, minor: 0 }),
        cell("ds-alert--b", { critical: 0, major: 0, minor: 0, findings: 0, pass: true }),
      ],
      { ...DEFAULT_FILTER, state: "fail" },
    )
    expect(groups[0]?.roll.critical).toBe(5)
    expect(groups[0]?.cells).toHaveLength(1)
  })
})

describe("the collapse decision (plan, open question 3: always collapsed)", () => {
  const groups = groupEntries([
    cell("ds-checkbox--a"),
    cell("ds-checkbox--b"),
    cell("ds-chip--only"),
    pair(),
  ])
  const ids = (s: Set<string>) => [...s].sort()

  it("folds a set of more than one cell, and never a set of one or a lone item", () => {
    expect(groups.map((g) => [g.id, isFoldable(g)])).toEqual([
      ["ds-checkbox", true],
      ["ds-chip", false],
      ["onboarding-document-step", false],
    ])
  })

  it("starts every foldable group COLLAPSED — no cell-count threshold", () => {
    expect(ids(openGroups(groups, DEFAULT_FILTER))).toEqual([])
  })

  it("expands everything that survives an ACTIVE filter — the reader has already narrowed", () => {
    expect(isFilterActive(DEFAULT_FILTER)).toBe(false)
    expect(isFilterActive({ ...DEFAULT_FILTER, query: "  " })).toBe(false)
    for (const f of [{ query: "hover" }, { source: "figma" }, { state: "fail" as const }]) {
      expect(isFilterActive({ ...DEFAULT_FILTER, ...f })).toBe(true)
      expect(ids(openGroups(groups, { ...DEFAULT_FILTER, ...f }))).toEqual(["ds-checkbox"])
    }
  })

  it("lets an explicit toggle win in both directions, over either default", () => {
    const opened = { opened: new Set(["ds-checkbox"]), closed: new Set<string>() }
    expect(ids(openGroups(groups, DEFAULT_FILTER, opened))).toEqual(["ds-checkbox"])
    const closed = { opened: new Set<string>(), closed: new Set(["ds-checkbox"]) }
    expect(ids(openGroups(groups, { ...DEFAULT_FILTER, query: "a" }, closed))).toEqual([])
  })

  it("never offers a group of one to be toggled, whatever the reader clicked before", () => {
    const t = { opened: new Set(["ds-chip", "onboarding-document-step"]), closed: new Set<string>() }
    expect(ids(openGroups(groups, DEFAULT_FILTER, t))).toEqual([])
  })

  it("keeps a group foldable when the filter leaves ONE match inside it", () => {
    // Otherwise the header naming the set a match came from would vanish
    // exactly when the reader is searching for it — `total` is why it does not.
    const one = groupEntries(
      [cell("ds-checkbox--a", { notes: 1 }), cell("ds-checkbox--b", { notes: 0 })],
      { ...DEFAULT_FILTER, state: "comments" },
    )
    expect(one[0]?.cells).toHaveLength(1)
    expect(isFoldable(one[0] as LibraryGroup)).toBe(true)
    expect(ids(openGroups(one, { ...DEFAULT_FILTER, state: "comments" }))).toEqual(["ds-checkbox"])
  })
})

describe("groupWhen — the vintage span, in the cards' own words", () => {
  const at = (msAgo: number) => new Date(NOW - msAgo).toISOString()

  it("says one thing when a whole set ran in one go", () => {
    // Measured: one `compare` spreads its stamps over ~a minute (66s across
    // ds-checkbox's 45 cells), which is one bucket once an hour has passed.
    expect(groupWhen([cell("a--1", { createdAt: at(3 * 3_600_000) }), cell("a--2", { createdAt: at(3 * 3_600_000 + 66_000) })], NOW)).toBe("3 h ago")
  })

  it("shows oldest → newest when a subset re-run mixed vintages", () => {
    expect(groupWhen([cell("a--1", { createdAt: at(4 * 3_600_000) }), cell("a--2", { createdAt: at(30_000) })], NOW)).toBe("4 h ago → just now")
  })

  it("shows the span a fresh set really has while its cells straddle a minute", () => {
    // Deliberate, and it decays: the two cells WERE measured a minute apart,
    // and an hour later both read "1 h ago" and the span goes away by itself.
    // The alternative — a tolerance that calls a minute "one run" — needs a
    // number that a slower set breaks, and it fails toward hiding a mix.
    expect(groupWhen([cell("a--1", { createdAt: at(12 * 60_000) }), cell("a--2", { createdAt: at(11 * 60_000) })], NOW)).toBe("12 min ago → 11 min ago")
    expect(groupWhen([cell("a--1", { createdAt: at(72 * 60_000) }), cell("a--2", { createdAt: at(71 * 60_000) })], NOW)).toBe("1 h ago")
  })

  it("ignores a stamp that cannot be read, and says nothing when none can", () => {
    expect(groupWhen([cell("a--1", { createdAt: "?" }), cell("a--2", { createdAt: at(30_000) })], NOW)).toBe("just now")
    expect(groupWhen([cell("a--1", { createdAt: "?" })], NOW)).toBe("")
    expect(groupWhen([], NOW)).toBe("")
    expect(groupWhen([broken], NOW)).toBe("")
  })
})

describe("groupRunSpan — the Measured column, computed WITHIN a group", () => {
  it("reports the range and how many cells are behind its top end", () => {
    const span = groupRunSpan([cell("a--1", { run: 9 }), cell("a--2", { run: 10 }), cell("a--3", { run: 9 })])
    expect(span).toEqual({ min: 9, max: 10, stale: 2, mixed: true })
  })

  it("is not mixed when a whole set ran in one go", () => {
    const span = groupRunSpan([cell("a--1", { run: 2 }), cell("a--2", { run: 2 })])
    expect(span).toEqual({ min: 2, max: 2, stale: 0, mixed: false })
  })

  // A dir written before runs were numbered has no ordinal. Inventing an r0
  // would print a confident number over a result that was never counted.
  it("says nothing rather than inventing an ordinal, and ignores the cells that have none", () => {
    expect(groupRunSpan([cell("a--1", { run: undefined })])).toEqual({
      min: undefined,
      max: undefined,
      stale: 0,
      mixed: false,
    })
    expect(groupRunSpan([cell("a--1", { run: undefined }), cell("a--2", { run: 5 })])).toEqual({
      min: 5,
      max: 5,
      stale: 0,
      mixed: false,
    })
  })

  it("never compares across groups — the DS root's r2 set is not stale against another's r10", () => {
    // Measured 2026-09-04: ds-button-icon's eleven cells all sit at r2 while
    // ds-button-fill is at r9/r10. A global newest would call all eleven stale.
    const entries = [
      cell("ds-button-icon--a", { run: 2 }),
      cell("ds-button-icon--b", { run: 2 }),
      cell("ds-button-fill--a", { run: 9 }),
      cell("ds-button-fill--b", { run: 10 }),
    ]
    expect([...staleCells(entries)]).toEqual(["ds-button-fill--a"])
  })

  it("calls a lone item its own group of one, so it is never stale", () => {
    expect([...staleCells([cell("solo", { run: 1 }), cell("other", { run: 9 })])]).toEqual([])
  })
})

/* ------------------------------------------------- the comp's six columns -- */

// A group as groupEntries builds one, so the renderers are exercised on the
// real shape rather than on a literal that could drift from it.
const grp = (dir: string, over: Partial<PairSummary> = {}, n = 3): LibraryGroup => {
  const cells = Array.from({ length: n }, (_, k) => cell(dir + "--" + k, over))
  const [g] = groupEntries(cells)
  return g as LibraryGroup
}

describe("groupRow — the comp's six columns", () => {
  it("draws the entry, its cell count, the roll-up and the Measured span", () => {
    const g = grp("ds-button-fill", { critical: 1, major: 2, minor: 0, run: 10 })
    const html = groupRow(g, false, "desktop", NOW)
    expect(html).toContain('<span class="lname">ds-button-fill</span>')
    expect(html).toContain('<div class="lcount mono">3 cells</div>')
    // dot + COUNT in the severity colour, which is what the comp draws — not
    // the card's "Critical 3" word-and-number badge.
    expect(html).toContain('<span class="rb critical" title="Critical 3"><i class="dot"></i>3</span>')
    expect(html).toContain('<span class="rb major" title="Major 6"><i class="dot"></i>6</span>')
    expect(html).not.toContain('class="rb minor"')
    expect(html).toContain('<span class="lrun-flat mono">r10</span>')
  })

  it("says Clean in the roll-up when a set has no findings at all", () => {
    const g = grp("ds-tabs", { critical: 0, major: 0, minor: 0, findings: 0, pass: true })
    expect(groupRow(g, false, "desktop", NOW)).toContain('<span class="rb clean" title="No findings">Clean</span>')
  })

  it("says how many of the set the filter left, not how many it holds", () => {
    const cells = [
      cell("ds-alert--a", { pass: false, critical: 2 }),
      cell("ds-alert--b", { pass: true, critical: 0, major: 0, minor: 0, findings: 0 }),
    ]
    const [g] = groupEntries(cells, { ...DEFAULT_FILTER, state: "fail" })
    const html = groupRow(g as LibraryGroup, false, "desktop", NOW)
    expect(html).toContain('<div class="lcount mono">1 of 2</div>')
    expect(html).not.toContain("2 cells")
  })

  it("draws the span with a history glyph on the older end when the group mixes vintages", () => {
    const g = groupEntries([cell("ds-x--a", { run: 45 }), cell("ds-x--b", { run: 47 })])[0] as LibraryGroup
    const html = groupRow(g, false, "desktop", NOW)
    expect(html).toContain('<span class="lrun old"><span class="msi" aria-hidden="true">history</span>r45</span>')
    expect(html).toContain("arrow_right_alt")
    expect(html).toContain('<span class="lrun new">r47</span>')
    expect(html).toContain("1 stale")
  })

  it("surfaces a fix come undone, and a run nobody could read", () => {
    const g = groupEntries([
      cell("ds-alert--a", { delta: { introduced: 0, resolved: 0, regressions: 2 } }),
      { ...broken, dir: "ds-alert--b" },
    ])[0] as LibraryGroup
    const html = groupRow(g, false, "desktop", NOW)
    expect(html).toContain("1 regressed")
    expect(html).toContain("1 unreadable")
  })

  // The chunk-1 constraint, inverted by this comp: the sheet link was a SIBLING
  // of a <button>, because an anchor inside a button is invalid. Here it is one
  // of the row's six columns, so the row cannot be a button at all.
  it("is a div with role=button, so the Open-sheet anchor can nest legally", () => {
    const html = groupRow(grp("ds-button-fill"), true, "desktop", NOW)
    expect(html).toContain('<div class="lrow open" data-group="ds-button-fill" role="button" tabindex="0" aria-expanded="true"')
    expect(html).not.toContain("<button")
    const row = html.slice(html.indexOf('class="lrow'))
    expect(row.indexOf('class="lsheet"')).toBeGreaterThan(-1)
    expect(row.slice(0, row.indexOf('class="lsheet"'))).not.toContain("</div></div></div>")
  })

  it("routes the sheet button to the entry's sheet, encoded, and names it for a screen reader", () => {
    expect(groupRow(grp("ds-button-fill"), false, "desktop", NOW)).toContain('href="#/set/ds-button-fill"')
    expect(groupRow(grp("a/b c"), false, "desktop", NOW)).toContain('href="#/set/a%2Fb%20c"')
    expect(groupRow(grp("ds-chip"), false, "desktop", NOW)).toContain('aria-label="Open ds-chip as a variant sheet"')
  })

  // A lone item is one comparison that happens to sit in the same table. It is
  // not a variant set, so there is no sheet to open and nothing to expand.
  it("offers no sheet and no toggle for a lone item", () => {
    const g = groupEntries([cell("refdiff-library-desktop")])[0] as LibraryGroup
    const html = groupRow(g, false, "desktop", NOW)
    expect(html).not.toContain("lsheet")
    expect(html).not.toContain("role=\"button\"")
    expect(html).toContain('class="lrow flat"')
    expect(html).toContain('class="caret-gap"')
  })

  // Chunk 1 rotated ONE glyph because chevron_right was not in the icon subset;
  // re-running icon-subset.mjs for these comps put it there (101 -> 112).
  it("swaps the caret GLYPH rather than rotating one", () => {
    expect(groupRow(grp("a"), true, "desktop", NOW)).toContain('<span class="msi caret" aria-hidden="true">expand_more</span>')
    expect(groupRow(grp("a"), false, "desktop", NOW)).toContain('<span class="msi caret" aria-hidden="true">chevron_right</span>')
  })

  it("escapes the entry id — it comes from a directory on disk", () => {
    const html = groupRow(grp('x"><script>'), false, "desktop", NOW)
    expect(html).not.toContain("<script>")
    expect(html).toContain("&quot;")
  })
})

describe("cellRow — the sub-rows are CELLS, not chunk 1's cards", () => {
  const span = { min: 45, max: 47, stale: 1, mixed: true }

  it("draws a verdict dot, the capture at 34x24, the name, its badge and Compare", () => {
    const html = cellRow(cell("ds-x--a", { run: 47, critical: 1 }), "#/ds-x--a", span, "desktop", NOW)
    expect(html).toContain('<i class="vdot critical" aria-hidden="true"></i>')
    expect(html).toContain('<div class="lcthumb"><img src="onboarding-document-step/impl.png"')
    expect(html).toContain('<span class="cb critical">Critical</span>')
    expect(html).toContain("Compare")
    expect(html).toContain("chevron_right")
    expect(html).toContain('href="#/ds-x--a"')
  })

  it("rings the dot green and says No findings when the cell is clean", () => {
    const c = cell("ds-x--b", { critical: 0, major: 0, minor: 0, findings: 0, pass: true })
    const html = cellRow(c, "#", span, "desktop", NOW)
    expect(html).toContain('<i class="vdot clean" aria-hidden="true"></i>')
    expect(html).toContain('<span class="cb none">No findings</span>')
  })

  // The comp names a cell by its VARIANT PROPS, which only the set index knows.
  it("names a cell by its variant props when the set index is loaded, and by the pair id when it is not", () => {
    const c = cell("ds-button--tone-primary_size-sm_state-default", { pair: "ds-button — tone=Primary" })
    const names = new Map([[c.dir, "Primary · sm · Default"]])
    expect(cellRow(c, "#", span, "desktop", NOW, names)).toContain(">Primary · sm · Default<")
    expect(cellRow(c, "#", span, "desktop", NOW)).toContain("ds-button — tone=Primary")
  })

  it("pills a run behind the group's newest, and leaves the newest plain", () => {
    const behind = cellRow(cell("ds-x--a", { run: 45 }), "#", span, "desktop", NOW)
    expect(behind).toContain('class="lrun old"')
    expect(behind).toContain("Measured in run r45")
    expect(behind).toContain("2 runs behind")
    expect(cellRow(cell("ds-x--b", { run: 47 }), "#", span, "desktop", NOW)).toContain('class="lrun new"')
  })

  it("lists an unreadable cell with its reason and nothing to open", () => {
    const html = cellRow(broken, "", span, "desktop", NOW)
    expect(html).toContain('class="lcell broken"')
    expect(html).not.toContain("<a ")
    expect(html).toContain("findings.json · Unexpected end of JSON input")
  })
})

describe("libraryTable", () => {
  const href = (p: PairSummary) => "#/" + p.dir

  it("draws the comp's six column headers, in order, above the card", () => {
    const html = libraryTable([grp("ds-alert")], href, "desktop", NOW)
    expect(html.indexOf('class="lthead"')).toBeLessThan(html.indexOf('class="ltable"'))
    expect([...html.matchAll(/<span>([^<]*)<\/span>/g)].slice(0, 6).map((m) => m[1])).toEqual([
      "Component set",
      "Source",
      "Cells",
      "Findings roll-up",
      "Measured",
      "",
    ])
  })

  // The same decision chunk 1 made for the card grid: on a 194-cell root a
  // collapsed Library is 194 lazy images the browser never has to make.
  it("draws NO sub-rows while a group is collapsed", () => {
    const html = libraryTable([grp("ds-alert")], href, "desktop", NOW, new Set())
    expect(html).toContain('class="lrow')
    expect(html).not.toContain('class="lcell"')
  })

  it("draws one sub-row per cell when the group is open", () => {
    const html = libraryTable([grp("ds-alert")], href, "desktop", NOW, new Set(["ds-alert"]))
    expect(html.match(/class="lcell"/g)).toHaveLength(3)
  })

  it("caps an open group at ten rows and offers the rest", () => {
    const g = grp("ds-checkbox", {}, 45)
    const html = libraryTable([g], href, "desktop", NOW, new Set(["ds-checkbox"]))
    expect(ROW_CAP).toBe(10)
    expect(html.match(/class="lcell"/g)).toHaveLength(10)
    expect(html).toContain("Show 35 more")
    const all = libraryTable([g], href, "desktop", NOW, new Set(["ds-checkbox"]), new Set(["ds-checkbox"]))
    expect(all.match(/class="lcell"/g)).toHaveLength(45)
    expect(all).not.toContain("Show ")
  })

  it("mixes sets and lone items in one table, in the order the groups came", () => {
    const html = libraryTable(
      groupEntries([cell("ds-alert--a"), cell("ds-alert--b"), cell("stepper")]),
      href,
      "desktop",
      NOW,
    )
    expect(html.match(/class="lgcard"/g)).toHaveLength(2)
    expect(html.indexOf("ds-alert")).toBeLessThan(html.indexOf("stepper"))
  })

  it("never expands a group of one, whatever the caller passed", () => {
    const html = libraryTable(groupEntries([cell("stepper")]), href, "desktop", NOW, new Set(["stepper"]))
    expect(html).not.toContain('class="lcell"')
  })

  // The phone comp is one rounded card per group, so there is no table head and
  // no bg1 wrapper — the cards ARE the list.
  it("drops the table chrome on the phone and keeps the group cards", () => {
    const html = libraryTable([grp("ds-alert")], href, "mobile", NOW, new Set(["ds-alert"]))
    expect(html).not.toContain('class="lthead"')
    expect(html).not.toContain('class="ltable"')
    expect(html).toContain('class="lgcard"')
    expect(html).toContain('class="lrhead"')
  })

  it("escapes the group id in the wrapper it keys by", () => {
    const html = libraryTable([grp('a"><script>')], href, "desktop", NOW)
    expect(html).not.toContain("<script>")
  })
})

describe("moreRow / filterExplainer", () => {
  it("names how many rows the cap is hiding", () => {
    expect(moreRow(grp("ds-checkbox"), 35)).toContain("Show 35 more")
    expect(moreRow(grp("ds-checkbox"), 35)).toContain('data-more="ds-checkbox"')
  })

  // The comp's own sentence, and it CONFIRMS chunk 1's filter design rather
  // than describing a new one.
  it("explains the filter semantics only while a filter is active", () => {
    expect(filterExplainer(DEFAULT_FILTER)).toBe("")
    const html = filterExplainer({ ...DEFAULT_FILTER, state: "fail" })
    expect(html).toContain("Filters apply to cells.")
    expect(html).toContain("Groups with no matching cell are hidden")
    expect(html).toContain('id="lib-clear"')
    expect(html).toContain("filter_alt")
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
