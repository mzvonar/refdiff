import { describe, expect, it } from "vitest"

import {
  DEFAULT_FILTER,
  LONE_NAV_LABEL,
  groupEntries,
  lastVisitedKey,
  libraryTable,
  navCounts,
  navFilter,
  navGroupOf,
  navRetarget,
  navSection,
  navSeverity,
  parseLastVisited,
  sortEntries,
  swipeOutcome,
  visitedMark,
  type BrokenPair,
  type PairEntry,
  type PairSummary,
} from "../src/index-view.js"

/**
 * Item navigation (RefDiff Navigation spec, 2026-09-26): the comparator's prev / next switcher
 * and the Library's just-visited trail. The root below is the demo root's shape in miniature — a
 * variant set, lone items around it, a screen measured at two widths, and a run that cannot be
 * read — because each of those is a case the ORDER or the GROUP could get wrong.
 */

const NOW = Date.parse("2026-09-26T12:00:00.000Z")

const summary = (dir: string, over: Partial<PairSummary> = {}): PairSummary => ({
  dir,
  pair: dir,
  pass: true,
  critical: 0,
  major: 0,
  minor: 0,
  findings: 0,
  suppressed: 0,
  confidence: 1,
  createdAt: "2026-09-26T11:00:00.000Z",
  designSource: "figma",
  implSource: "live-url",
  implRef: "/" + dir,
  implPng: dir + "/impl.png",
  openNotes: 0,
  notes: 0,
  ...over,
})

const broken: BrokenPair = { dir: "liveness", broken: true, reason: "findings.json · cut off" }

// Lone items A..D with a set between them in the alphabet, as ds-button sits among the demo
// root's twelve. `onboarding` stands for an entry measured at two widths: its Library item is the
// widest dir, and `onboarding-mobile` is the narrower width the comparator can be showing.
const ROOT: PairEntry[] = [
  summary("button", { pair: "Button", critical: 1 }),
  summary("confirm", { pair: "Confirm modal" }),
  summary("ds-chip--a", { pair: "ds-chip--a", major: 2 }),
  summary("ds-chip--b", { pair: "ds-chip--b", minor: 1 }),
  summary("ds-chip--c", { pair: "ds-chip--c" }),
  broken,
  summary("onboarding", {
    pair: "Onboarding",
    critical: 3,
    widths: [
      { viewport: "desktop", width: 1440, height: 900, dir: "onboarding" },
      { viewport: "mobile", width: 390, height: 844, dir: "onboarding-mobile" },
    ],
    breakpoint: { entry: "onboarding", viewport: "desktop", width: 1440, height: 900 },
  }),
  summary("stepper", { pair: "Stepper", major: 1 }),
]

const groups = groupEntries(sortEntries(ROOT))

describe("navGroupOf — which items the comparator steps through", () => {
  it("steps through a SET's own cells, never past them, under the set's Library label", () => {
    const g = navGroupOf(groups, "ds-chip--b")
    expect(g).not.toBeNull()
    expect(g!.set).toBe(true)
    expect(g!.rowId).toBe("ds-chip")
    expect(g!.label).toBe("ds-chip")
    expect(g!.items.map((i) => i.dir)).toEqual(["ds-chip--a", "ds-chip--b", "ds-chip--c"])
    expect(g!.index).toBe(1)
  })

  it("treats every item that belongs to NO set as ONE group, `Library`, in Library order", () => {
    // Repo owner's call: a 1 / 1 switcher on each lone item would be dead chrome.
    const g = navGroupOf(groups, "onboarding")!
    expect(g.label).toBe(LONE_NAV_LABEL)
    expect(g.set).toBe(false)
    // The set is skipped, and so is the unreadable run — it has no report to open.
    expect(g.items.map((i) => i.dir)).toEqual(["button", "confirm", "onboarding", "stepper"])
    expect(g.index).toBe(2)
    // The TRAIL marks the item's own Library row, not the navigation group.
    expect(g.rowId).toBe("onboarding")
  })

  it("finds the open item at a narrower width, and says which widths it has", () => {
    const g = navGroupOf(groups, "onboarding-mobile")!
    expect(g.index).toBe(2)
    expect(g.items[2]!.dirs).toEqual(["onboarding", "onboarding-mobile"])
    expect(g.items[2]!.vps).toEqual(["desktop", "mobile"])
    expect(g.items[2]!.href).toBe("#/onboarding")
  })

  it("follows the Library's FILTER: next is the next row the reader would have tapped", () => {
    const critical = groupEntries(sortEntries(ROOT), { ...DEFAULT_FILTER, state: "critical" })
    const g = navGroupOf(critical, "onboarding")!
    // Only the lone items the filter kept are steps.
    expect(g.items.map((i) => i.dir)).toEqual(["button", "onboarding"])
    // A dir the filter hides is not in any group — the caller then retries unfiltered.
    expect(navGroupOf(critical, "stepper")).toBeNull()
  })

  it("keeps the group across a switch, and moves the trail's ROW with a lone item", () => {
    // Driving the app: document step -> review step recorded the DOCUMENT step's row, so the
    // Library marked the item the reader had left.
    const lone = navGroupOf(groups, "button")!
    const moved = navRetarget(lone, "stepper")!
    expect(moved.index).toBe(3)
    expect(moved.rowId).toBe("stepper")
    expect(moved.items).toBe(lone.items)
    // A set's cells share the set's row.
    expect(navRetarget(navGroupOf(groups, "ds-chip--a")!, "ds-chip--c")).toMatchObject({
      index: 2,
      rowId: "ds-chip",
    })
    expect(navRetarget(lone, "ds-chip--a")).toBeNull()
  })

  it("names a set's cells by their variant props when the set index gave them", () => {
    const g = navGroupOf(
      groups,
      "ds-chip--a",
      "",
      new Map([["ds-chip--a", "Filter · md · Hover"]]),
    )!
    expect(g.items[0]!.name).toBe("Filter · md · Hover")
    expect(g.items[1]!.name).toBe("ds-chip--b")
  })

  it("carries the worst severity and the capture for the list and the preview", () => {
    const g = navGroupOf(groups, "button")!
    expect(g.items.map((i) => i.sev)).toEqual(["critical", "clean", "critical", "major"])
    expect(g.items[0]!.thumb).toBe("button/impl.png")
  })
})

describe("the switcher's list", () => {
  const g = navGroupOf(groups, "button")!

  it("filters by name AND the one severity chip, keeping each item's real index", () => {
    expect(navFilter(g.items, "", "all").map((r) => r.index)).toEqual([0, 1, 2, 3])
    expect(navFilter(g.items, "", "critical").map((r) => r.item.dir)).toEqual([
      "button",
      "onboarding",
    ])
    expect(navFilter(g.items, "  STEP ", "all").map((r) => r.index)).toEqual([3])
    expect(navFilter(g.items, "step", "critical")).toEqual([])
  })

  it("counts the chips over the whole group, so a count does not move as the reader types", () => {
    expect(navCounts(g.items)).toEqual({ critical: 2, major: 1, minor: 0, clean: 1 })
  })

  it("sections a set's rows by their props less the last one; lone names have none", () => {
    expect(navSection("Primary · md · Hover")).toBe("Primary · md")
    expect(navSection("Onboarding — Document step")).toBe("")
    expect(navSection("Primary · md")).toBe("")
  })

  it("reads a run's severity as its worst finding", () => {
    expect(navSeverity(summary("x", { minor: 3, major: 1 }))).toBe("major")
    expect(navSeverity(summary("x"))).toBe("clean")
  })
})

describe("the just-visited trail", () => {
  it("is keyed per served root", () => {
    expect(lastVisitedKey("/a/root")).not.toBe(lastVisitedKey("/b/root"))
  })

  it("parses only a whole record, and nothing else", () => {
    const ok = { groupId: "ds-chip", itemId: "ds-chip--b", at: NOW }
    expect(parseLastVisited(JSON.stringify(ok))).toEqual(ok)
    expect(parseLastVisited(null)).toBeNull()
    expect(parseLastVisited("{not json")).toBeNull()
    expect(parseLastVisited(JSON.stringify({ ...ok, itemId: "" }))).toBeNull()
    expect(parseLastVisited(JSON.stringify({ ...ok, at: "yesterday" }))).toBeNull()
    expect(parseLastVisited(JSON.stringify([ok]))).toBeNull()
  })

  it("marks the group and the item, with the item's position and the trail's age", () => {
    const m = visitedMark(
      groups,
      { groupId: "ds-chip", itemId: "ds-chip--c", at: NOW - 120_000 },
      NOW,
    )
    expect(m).toEqual({ groupId: "ds-chip", itemId: "ds-chip--c", position: 2, age: "2 min ago" })
  })

  it("marks the group ALONE when its item is gone or filtered out — and nothing when the group is", () => {
    const gone = visitedMark(groups, { groupId: "ds-chip", itemId: "ds-chip--z", at: NOW }, NOW)
    expect(gone).toMatchObject({ groupId: "ds-chip", itemId: null, position: -1 })
    expect(
      visitedMark(groups, { groupId: "ds-gone", itemId: "ds-gone--a", at: NOW }, NOW),
    ).toBeNull()
    expect(visitedMark(groups, null, NOW)).toBeNull()
  })

  it("marks the Library item for a trail left at a narrower width", () => {
    const m = visitedMark(
      groups,
      { groupId: "onboarding", itemId: "onboarding-mobile", at: NOW },
      NOW,
    )
    expect(m).toMatchObject({ itemId: "onboarding", position: 0, age: "just now" })
  })
})

describe("libraryTable with a trail", () => {
  const open = new Set(["ds-chip"])
  const setMark = { groupId: "ds-chip", itemId: "ds-chip--b", position: 1, age: "just now" }

  it("gives the set's row the bar, bg2 and the TINTED tag, and its card the outline", () => {
    const html = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "desktop",
      NOW,
      open,
      new Set(),
      new Map(),
      "",
      setMark,
    )
    expect(html).toContain('<div class="lrow open visited" data-group="ds-chip"')
    expect(html).toContain(
      '<div class="lnline"><span class="lname">ds-chip</span><span class="lvis-group"><span class="msi" aria-hidden="true">my_location</span>Just visited</span></div>',
    )
    expect(html).toContain('<div class="lgcard visited" data-group="ds-chip">')
  })

  it("fills the item's tag with its age and turns Compare into Reopen", () => {
    const html = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "desktop",
      NOW,
      open,
      new Set(),
      new Map(),
      "",
      setMark,
    )
    expect(html).toContain('<a class="lcell visited" data-pair="ds-chip--b"')
    expect(html).toContain(
      '<span class="lvis-item"><span class="msi" aria-hidden="true">my_location</span>Just visited · just now</span>',
    )
    expect(html.match(/Reopen/g)).toHaveLength(1)
    // The set's other cells keep Compare.
    expect(html.match(/<div class="lgo">Compare</g)).toHaveLength(2)
    expect(html).toContain('<div class="lgo">Reopen<')
  })

  it("leaves every untagged row's DOM exactly as it was", () => {
    const plain = libraryTable(groups, (p) => "#/" + p.dir, "desktop", NOW, open)
    const marked = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "desktop",
      NOW,
      open,
      new Set(),
      new Map(),
      "",
      setMark,
    )
    expect(plain).not.toContain("visited")
    expect(plain).not.toContain("lnline")
    // Outside the marked group nothing moved.
    const tail = (h: string) => h.slice(h.indexOf('data-group="onboarding"'))
    expect(tail(marked)).toBe(tail(plain))
  })

  it("gives a LONE item's row the item treatment — it is the item", () => {
    const m = { groupId: "stepper", itemId: "stepper", position: 0, age: "just now" }
    const html = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "desktop",
      NOW,
      new Set(),
      new Set(),
      new Map(),
      "",
      m,
    )
    expect(html).toContain('<a class="lrow flat lrow-link visited-item" data-group="stepper"')
    expect(html).toContain('<span class="lsheet-label">Reopen</span>')
    const phone = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "mobile",
      NOW,
      new Set(),
      new Set(),
      new Map(),
      "",
      m,
    )
    expect(phone).toContain('<span class="msi" aria-hidden="true">replay</span>')
  })

  it("swaps the phone row's chevron for the accent replay glyph", () => {
    const html = libraryTable(
      groups,
      (p) => "#/" + p.dir,
      "mobile",
      NOW,
      open,
      new Set(),
      new Map(),
      "",
      setMark,
    )
    expect(html).toContain('<span class="msi go" aria-hidden="true">replay</span>')
    expect(
      html.match(/<span class="msi go" aria-hidden="true">chevron_right<\/span>/g),
    ).toHaveLength(2)
  })
})

describe("swipeOutcome — the phone's two-finger item swipe", () => {
  it("peeks past 40px and commits past 80px; fingers moving LEFT bring the next item", () => {
    expect(swipeOutcome(-30, 0, 1, true, true)).toEqual({
      swiping: true,
      step: 1,
      peek: false,
      commit: false,
    })
    expect(swipeOutcome(-50, 5, 1, true, true)).toEqual({
      swiping: true,
      step: 1,
      peek: true,
      commit: false,
    })
    expect(swipeOutcome(-90, 5, 1, true, true)).toEqual({
      swiping: true,
      step: 1,
      peek: true,
      commit: true,
    })
    expect(swipeOutcome(90, 5, 1, true, true)).toMatchObject({ step: -1, commit: true })
  })

  it("is not a swipe when the fingers zoom or travel mostly vertically — that stays a pinch or pan", () => {
    expect(swipeOutcome(-120, 0, 1.4, true, true)).toMatchObject({
      swiping: false,
      step: 0,
      commit: false,
    })
    expect(swipeOutcome(-120, 80, 1, true, true)).toMatchObject({ swiping: false, step: 0 })
  })

  it("rubber-bands at a group end: still a swipe (so it springs back), but nothing to open", () => {
    expect(swipeOutcome(-120, 0, 1, true, false)).toEqual({
      swiping: true,
      step: 0,
      peek: false,
      commit: false,
    })
    expect(swipeOutcome(120, 0, 1, false, true)).toEqual({
      swiping: true,
      step: 0,
      peek: false,
      commit: false,
    })
  })
})
