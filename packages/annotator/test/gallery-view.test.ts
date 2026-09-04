import { describe, expect, it } from "vitest"

import {
  FRAME_COVERAGE,
  census,
  cellSeverity,
  galleryCells,
  isFrameLevel,
  markStale,
  resolveGallery,
  runSpan,
} from "../src/gallery-view.js"
import type { GAxes, GCell, GPairSummary, GSetIndex } from "../src/gallery-view.js"

const axes = (
  properties: Record<string, string[]>,
  source: GAxes["source"] = "definitions",
): GAxes => ({ source, properties })

// The Gallery comp's own set: tone x size down the rows, state across.
const BUTTON = axes({
  tone: ["Primary", "Secondary", "Tertiary", "Danger"],
  size: ["sm", "md", "lg"],
  State: ["Default", "Hover", "Active", "Focus", "Disabled"],
})

const ok = <T,>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`)
  return r.value
}

describe("resolveGallery", () => {
  it("with no declaration takes the axes' own order: first across, the rest down", () => {
    const r = ok(resolveGallery(BUTTON))
    expect(r.columns.property).toBe("tone")
    expect(r.rows.map((a) => a.property)).toEqual(["size", "State"])
    // rows are the cross-product, outermost slowest
    expect(r.rowTuples).toHaveLength(3 * 5)
    expect(r.rowTuples[0]).toEqual(["sm", "Default"])
    expect(r.rowTuples[1]).toEqual(["sm", "Hover"])
    expect(r.rowTuples[5]).toEqual(["md", "Default"])
    expect(r.warnings).toEqual([])
  })

  it("honours columns and lets rows name which axis leads the nesting", () => {
    const r = ok(resolveGallery(BUTTON, { columns: "State", rows: "tone" }))
    expect(r.columns.options).toEqual(["Default", "Hover", "Active", "Focus", "Disabled"])
    expect(r.rows.map((a) => a.property)).toEqual(["tone", "size"])
    expect(r.rowTuples).toHaveLength(12)
    expect(r.rowTuples[0]).toEqual(["Primary", "sm"])
    expect(r.rowTuples[3]).toEqual(["Secondary", "sm"])
  })

  // THE decision, both halves. A shape-breaking name refuses; a cosmetic one warns.
  it("REFUSES a columns/rows name the set does not define, and names the ones it does", () => {
    const bad = resolveGallery(BUTTON, { columns: "Stat" })
    expect(bad.ok).toBe(false)
    if (bad.ok) throw new Error("unreachable")
    expect(bad.error).toContain('names "Stat"')
    // the reader's one need: what DOES exist
    expect(bad.error).toContain('"tone"')
    expect(bad.error).toContain('"State"')

    expect(resolveGallery(BUTTON, { rows: "nope" }).ok).toBe(false)
    // and one property cannot be both axes
    const both = resolveGallery(BUTTON, { columns: "tone", rows: "tone" })
    expect(both.ok).toBe(false)
    if (both.ok) throw new Error("unreachable")
    expect(both.error).toContain("cannot be both axes")
  })

  it("drops an order option no cell carries, and WARNS instead of opening an empty track", () => {
    const r = ok(
      resolveGallery(BUTTON, { columns: "State", order: { State: ["Focus", "Nonsense", "Default"] } }),
    )
    // pinned first, in the pinned order; the rest follow in the axes' order
    expect(r.columns.options).toEqual(["Focus", "Default", "Hover", "Active", "Disabled"])
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain('pins "Nonsense"')
    expect(r.warnings[0]).toContain("dropped")
  })

  it("treats PARTIAL pinning as the documented use, not a warning", () => {
    const r = ok(resolveGallery(BUTTON, { columns: "State", order: { State: ["Focus"] } }))
    expect(r.columns.options).toEqual(["Focus", "Default", "Hover", "Active", "Disabled"])
    expect(r.warnings).toEqual([])
  })

  it("applies labels, and warns about a label for something the set does not carry", () => {
    const r = ok(
      resolveGallery(BUTTON, {
        columns: "State",
        labels: { State: { Disabled: "Off", "Focus on text": "Focus" }, nope: { a: "b" } },
      }),
    )
    expect(r.columns.labels).toEqual(["Default", "Hover", "Active", "Focus", "Off"])
    expect(r.warnings.some((w) => w.includes('labels "Focus on text"'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('names "nope"'))).toBe(true)
    // …but the grid is still correct — a cosmetic miss never refuses
    expect(r.columns.options).toHaveLength(5)
  })

  // The reason `variantAxes` returns its source at all: traversal order read as
  // the designer's is the "looks fine but is wrong" state, and a sheet is where
  // someone would read it as intent.
  it("warns that a child-names sheet is ordered by traversal, and pinning silences it", () => {
    const fallback = axes({ tone: ["Primary", "Danger"], State: ["Hover", "Default"] }, "child-names")
    const r = ok(resolveGallery(fallback))
    expect(r.warnings).toHaveLength(1)
    expect(r.warnings[0]).toContain("CHILD-NAME traversal order")
    expect(r.warnings[0]).toContain('"tone"')
    expect(r.warnings[0]).toContain('"State"')

    const pinned = ok(
      resolveGallery(fallback, {
        order: { tone: ["Primary", "Danger"], State: ["Default", "Hover"] },
      }),
    )
    expect(pinned.warnings).toEqual([])
    expect(pinned.columns.options).toEqual(["Primary", "Danger"])

    // a definitions-sourced set never gets it
    expect(ok(resolveGallery(BUTTON)).warnings).toEqual([])
  })

  it("refuses a set with no variant properties at all", () => {
    const r = resolveGallery(axes({}))
    expect(r.ok).toBe(false)
  })
})

describe("galleryCells", () => {
  const set = (over: Partial<GSetIndex> = {}): GSetIndex => ({
    entryId: "btn",
    setName: "*Button",
    createdAt: "2026-09-04T10:00:00.000Z",
    axes: axes({ tone: ["Primary", "Danger"], State: ["Default", "Hover"] }),
    pairs: [
      { slug: "a", dir: "btn--a", props: { tone: "Primary", State: "Default" } },
      { slug: "b", dir: "btn--b", props: { tone: "Primary", State: "Hover" } },
    ],
    skipped: [
      {
        nodeId: "1:2",
        name: "tone=Danger, State=Hover",
        reason: "impl exports no hover story for tone=danger",
        props: { tone: "Danger", State: "Hover" },
      },
    ],
    ...over,
  })
  const summaries: GPairSummary[] = [
    { dir: "btn--a", critical: 1, major: 0, minor: 2, findings: 3, run: 9 },
    { dir: "btn--b", critical: 0, major: 0, minor: 0, findings: 0, run: 10, pass: true },
  ]

  const cellsOf = (s: GSetIndex, pairs: GPairSummary[]) =>
    galleryCells(s, ok(resolveGallery(s.axes, s.gallery)), pairs)

  // Total over the AXES: the cross-product is the authority, so the hole nobody
  // declared is emitted rather than omitted.
  it("is total over the cross-product — every cell gets one of the four kinds", () => {
    const cells = cellsOf(set(), summaries)
    expect(cells).toHaveLength(4)
    expect(census(cells)).toEqual({ measured: 2, skipped: 1, absent: 1, pending: 0, total: 4 })
    const absent = cells.find((c) => c.kind === "absent")!
    expect(absent.props).toEqual({ tone: "Danger", State: "Default" })
    expect(absent.pairDir).toBeUndefined()
    const skipped = cells.find((c) => c.kind === "skipped")!
    expect(skipped.reason).toContain("no hover story")
  })

  // A cell declared as a pair whose run dir is missing was expanded and EXPECTED.
  // Calling it `absent` would say "nobody declared this", which is false.
  it("calls a declared pair with no readable report PENDING, never absent", () => {
    const cells = cellsOf(set(), [summaries[0]!])
    const pending = cells.find((c) => c.kind === "pending")!
    expect(pending.pairDir).toBe("btn--b")
    expect(pending.reason).toContain("btn--b")
    expect(census(cells).absent).toBe(1)
    expect(census(cells).pending).toBe(1)
  })

  it("places each cell at its resolved row and column", () => {
    const cells = cellsOf(set(), summaries)
    const at = (row: number, col: number) => cells.find((c) => c.row === row && c.col === col)!
    // no declaration: columns = tone (first), rows = State
    expect(at(0, 0).props).toEqual({ tone: "Primary", State: "Default" })
    expect(at(1, 1).props).toEqual({ tone: "Danger", State: "Hover" })
  })

  it("keys a cell by its options, not by its position", () => {
    const a = cellsOf(set(), summaries)
    const swapped = set({ gallery: { columns: "State" } })
    const b = galleryCells(swapped, ok(resolveGallery(swapped.axes, swapped.gallery)), summaries)
    const key = (cs: GCell[], props: Record<string, string>) =>
      cs.find((c) => c.props.tone === props.tone && c.props.State === props.State)!.key
    // the grid transposed; the identity did not move
    expect(key(a, { tone: "Danger", State: "Hover" })).toBe(key(b, { tone: "Danger", State: "Hover" }))
  })
})

describe("staleness and the census", () => {
  const measured = (dir: string, run: number): GCell => ({
    key: dir,
    props: {},
    row: 0,
    col: 0,
    kind: "measured",
    pairDir: dir,
    summary: { dir, run },
  })

  // The trap the plan names: a global newest would mark all eleven
  // ds-button-icon cells stale against a run they were never behind.
  it("reads the newest run PER SET, so a uniformly older sheet is not stale", () => {
    const uniform = markStale([measured("a", 2), measured("b", 2), measured("c", 2)])
    expect(uniform.every((c) => c.stale === false)).toBe(true)
    expect(runSpan(uniform)).toEqual({ min: 2, max: 2 })

    const mixed = markStale([measured("a", 9), measured("b", 10)])
    expect(mixed.map((c) => c.stale)).toEqual([true, false])
    expect(runSpan(mixed)).toEqual({ min: 9, max: 10 })
  })

  it("a run-less sheet has no span and no stale cells", () => {
    const cells = markStale([{ key: "x", props: {}, row: 0, col: 0, kind: "absent" }])
    expect(cells[0]!.stale).toBeUndefined()
    expect(runSpan(cells)).toBeNull()
  })

  it("badges a cell with its worst severity, and nothing when it is clean", () => {
    expect(cellSeverity({ ...measured("a", 1), summary: { dir: "a", critical: 1, major: 4 } })).toBe("critical")
    expect(cellSeverity({ ...measured("a", 1), summary: { dir: "a", major: 2, minor: 9 } })).toBe("major")
    expect(cellSeverity({ ...measured("a", 1), summary: { dir: "a", minor: 1 } })).toBe("minor")
    expect(cellSeverity({ ...measured("a", 1), summary: { dir: "a", pass: true } })).toBeNull()
    expect(cellSeverity({ key: "x", props: {}, row: 0, col: 0, kind: "absent" })).toBeNull()
  })
})

describe("isFrameLevel", () => {
  // pixel-region/frame fires on 194/194 DS pairs and its box IS the frame, so
  // as a box it paints every cell solid. The test is geometric, not by type.
  it("calls a box covering most of its cell frame-level", () => {
    const cell = { w: 200, h: 100 }
    expect(isFrameLevel({ w: 200, h: 100 }, cell)).toBe(true)
    expect(isFrameLevel({ w: 190, h: 96 }, cell)).toBe(true)
    expect(isFrameLevel({ w: 40, h: 16 }, cell)).toBe(false)
    // exactly at the threshold counts
    expect(isFrameLevel({ w: 200, h: 100 * FRAME_COVERAGE }, cell)).toBe(true)
  })

  it("is false for a zero-sized cell rather than dividing by it", () => {
    expect(isFrameLevel({ w: 10, h: 10 }, { w: 0, h: 0 })).toBe(false)
  })
})
