import { describe, expect, it } from "vitest"

import {
  FRAME_COVERAGE,
  causeGroups,
  cellCountLabel,
  cellSeverity,
  census,
  galleryCells,
  isFrameLevel,
  markStale,
  pruneToOccupied,
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

describe("causeGroups", () => {
  const f = (
    id: string,
    cell: string,
    type: string,
    severity: "critical" | "major" | "minor",
    expected?: Record<string, unknown>,
    actual?: Record<string, unknown>,
    message = "",
  ) => ({ id, cell, type, role: "text", severity, message, ...(expected ? { expected } : {}), ...(actual ? { actual } : {}) })

  const TYPO_E = { fontFamily: "Oswald", fontWeight: "500" }
  const TYPO_A = { fontFamily: "Montserrat", fontWeight: "700" }

  it("groups by the CAUSE and counts distinct CELLS, not findings", () => {
    const { recurring, oneOffs } = causeGroups([
      f("1", "a", "typography", "major", TYPO_E, TYPO_A),
      f("2", "b", "typography", "major", TYPO_E, TYPO_A),
      // same cell, same cause: a second finding, NOT a second cell
      f("3", "b", "typography", "major", TYPO_E, TYPO_A),
      f("4", "c", "border", "minor", { borderWidth: "1" }, { borderWidth: "2" }),
    ])
    expect(recurring).toHaveLength(1)
    expect(recurring[0]!.cells).toEqual(["a", "b"])
    expect(recurring[0]!.findingIds).toEqual(["1", "2", "3"])
    expect(oneOffs.map((c) => c.type)).toEqual(["border"])
  })

  // The distinction summary.json's groups cannot make, and the reason this is
  // computed rather than reused: same type, role and severity, different cause.
  it("tells two different colour drifts apart", () => {
    const { recurring } = causeGroups([
      f("1", "a", "color", "critical", { backgroundColor: "#4F46E5" }, { backgroundColor: "#6366F1" }),
      f("2", "b", "color", "critical", { backgroundColor: "#4F46E5" }, { backgroundColor: "#6366F1" }),
      f("3", "c", "color", "critical", { color: "#111" }, { color: "#222" }),
      f("4", "d", "color", "critical", { color: "#111" }, { color: "#222" }),
    ])
    expect(recurring).toHaveLength(2)
    expect(new Set(recurring.map((c) => c.key)).size).toBe(2)
  })

  // Text is NOT in the key: the same cause lands on many cells with a different
  // element text in each, which is exactly what makes it recurring.
  it("groups across differing messages, keeping one as the sample", () => {
    const { recurring } = causeGroups([
      f("1", "a", "typography", "major", TYPO_E, TYPO_A, 'the "LABEL" typeface differs'),
      f("2", "b", "typography", "major", TYPO_E, TYPO_A, 'the "GHOST" typeface differs'),
    ])
    expect(recurring).toHaveLength(1)
    expect(recurring[0]!.sample).toBe('the "LABEL" typeface differs')
  })

  it("renders the property and values the way the comp's rows read", () => {
    const { recurring } = causeGroups([
      f("1", "a", "typography", "major", TYPO_E, TYPO_A),
      f("2", "b", "typography", "major", TYPO_E, TYPO_A),
    ])
    expect(recurring[0]!.property).toBe("font-family, font-weight")
    expect(recurring[0]!.expected).toBe("Oswald 500")
    expect(recurring[0]!.actual).toBe("Montserrat 700")
  })

  it("orders by how many cells carry it, then by severity", () => {
    const { recurring } = causeGroups([
      f("1", "a", "border", "minor", { w: 1 }, { w: 2 }),
      f("2", "b", "border", "minor", { w: 1 }, { w: 2 }),
      f("3", "a", "color", "critical", { c: 1 }, { c: 2 }),
      f("4", "b", "color", "critical", { c: 1 }, { c: 2 }),
      f("5", "c", "color", "critical", { c: 1 }, { c: 2 }),
    ])
    expect(recurring.map((c) => c.type)).toEqual(["color", "border"])
    expect(recurring.map((c) => c.cells.length)).toEqual([3, 2])
  })

  it("ignores a finding with no cell — it is not on the sheet", () => {
    const { recurring, oneOffs } = causeGroups([
      { id: "x", type: "color", severity: "minor" },
      undefined,
    ])
    expect(recurring).toEqual([])
    expect(oneOffs).toEqual([])
  })

  it("labels the count in the comp's words", () => {
    expect(cellCountLabel(36)).toBe("36 cells")
    expect(cellCountLabel(1)).toBe("1 cell")
  })
})

describe("pruneToOccupied", () => {
  const sparse = (): GSetIndex => ({
    entryId: "s",
    setName: "*S",
    createdAt: "2026-09-04T10:00:00.000Z",
    // 3 x 3 = 9 combinations; the set has 3 children, all in one row
    axes: axes({ tone: ["Primary", "Secondary", "Danger"], State: ["Default", "Hover", "Focus"] }),
    pairs: [
      { slug: "a", dir: "s--a", props: { tone: "Primary", State: "Default" } },
      { slug: "b", dir: "s--b", props: { tone: "Primary", State: "Hover" } },
    ],
    skipped: [
      { nodeId: "1", name: "x", reason: "only: …", props: { tone: "Primary", State: "Focus" } },
    ],
    gallery: { columns: "State" },
  })

  // The correction: a real Figma set is SPARSE, so the cross-product is not the
  // expectation. Measured on the DS, ds-select-field defines 196 combinations
  // and has 64 children — 132 "absent" cells nobody ever drew.
  it("drops rows the set never populates", () => {
    const set = sparse()
    const full = ok(resolveGallery(set.axes, set.gallery))
    expect(full.rowTuples).toHaveLength(3)
    const pruned = pruneToOccupied(set, full)
    expect(pruned.rowTuples).toEqual([["Primary"]])
    expect(pruned.columns.options).toEqual(["Default", "Hover", "Focus"])

    // …and the census follows: 9 cells with 6 absent becomes 3 with none.
    expect(census(galleryCells(set, full, []))).toMatchObject({ total: 9, absent: 6 })
    expect(census(galleryCells(set, pruned, []))).toMatchObject({ total: 3, absent: 0 })
  })

  it("drops columns too, and keeps the axes' order in what survives", () => {
    const set = sparse()
    set.pairs = [{ slug: "a", dir: "s--a", props: { tone: "Danger", State: "Focus" } }]
    set.skipped = []
    const pruned = pruneToOccupied(set, ok(resolveGallery(set.axes, set.gallery)))
    expect(pruned.columns.options).toEqual(["Focus"])
    expect(pruned.rowTuples).toEqual([["Danger"]])
  })

  // The check that this does not simply hide absence: where the cross-product
  // WAS the expectation, pruning barely moves it (ds-alert went 9 -> 1).
  it("leaves a genuine hole inside an occupied row alone", () => {
    const set = sparse()
    set.pairs = [
      { slug: "a", dir: "s--a", props: { tone: "Primary", State: "Default" } },
      // Primary/Hover is a real HOLE: its row and its column are both occupied
      { slug: "c", dir: "s--c", props: { tone: "Secondary", State: "Hover" } },
    ]
    set.skipped = []
    const pruned = pruneToOccupied(set, ok(resolveGallery(set.axes, set.gallery)))
    expect(pruned.columns.options).toEqual(["Default", "Hover"])
    expect(pruned.rowTuples).toEqual([["Primary"], ["Secondary"]])
    const c = census(galleryCells(set, pruned, []))
    expect(c).toMatchObject({ total: 4, absent: 2 })
  })

  it("drops a row AXIS whose every option went, so it stops taking gutter", () => {
    const set: GSetIndex = {
      ...sparse(),
      axes: axes({ tone: ["Primary", "Danger"], size: ["sm", "lg"], State: ["Default", "Hover"] }),
      pairs: [{ slug: "a", dir: "s--a", props: { tone: "Primary", size: "sm", State: "Default" } }],
      skipped: [],
      gallery: { columns: "State", rows: "tone" },
    }
    const pruned = pruneToOccupied(set, ok(resolveGallery(set.axes, set.gallery)))
    expect(pruned.rows.map((r) => r.property)).toEqual(["tone", "size"])
    expect(pruned.rows.map((r) => r.options)).toEqual([["Primary"], ["sm"]])
    expect(pruned.rowTuples).toEqual([["Primary", "sm"]])
  })

  it("is a no-op on an empty set rather than pruning everything away", () => {
    const set = { ...sparse(), pairs: [], skipped: [] }
    const full = ok(resolveGallery(set.axes, set.gallery))
    expect(pruneToOccupied(set, full)).toEqual(full)
  })

  it("carries the resolver's warnings through", () => {
    const set = sparse()
    set.axes = axes({ tone: ["Primary"], State: ["Default"] }, "child-names")
    const full = ok(resolveGallery(set.axes, set.gallery))
    expect(full.warnings.length).toBeGreaterThan(0)
    expect(pruneToOccupied(set, full).warnings).toEqual(full.warnings)
  })
})
