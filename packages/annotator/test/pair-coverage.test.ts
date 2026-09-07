import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * Every comp in design/refdiff/ must be named by a pair in the manifest, and
 * every pair must name a comp that is on disk.
 *
 * The real-world case, twice on 2026-09-02: a comp was fetched into
 * design/refdiff/ and reported as "the new mobile layout is available", while
 * nothing had registered it as a pair — so `compare` never captured it and the
 * annotator Library never showed it, because the Library only lists run dirs.
 * The same shape in the other direction had already bitten the consuming repo:
 * three manifest entries pointed at Figma nodes that had been deleted, and the
 * staleness surfaced only when someone asked why a card was missing.
 * "The design exists" and "the pair is measured" are different facts; this is
 * the check that stops the first being reported as the second.
 */

/**
 * Comps that are deliberately NOT a pair, each with the reason.
 *
 * `RefDiff Mobile.dc.html` used to be here — the designer's phone-frame
 * showcase. The design project reused that NAME for the renamed toolbar comp on
 * 2026-09-04 and deleted the showcase, so the file at that name now has two
 * pairs and the waiver would have been a false statement about a real screen.
 * The kind of waiver that has to be re-read whenever its file moves, not only
 * when its reason changes.
 */
/**
 * Comps on disk whose every pair is `disabled` — declared, deliberately not
 * measured. Asserted exactly, so this list moving is a deliberate edit.
 */
const DISABLED_COMPS: string[] = [
  // The two `refdiff-library-*` pairs. Chunk 5 rebuilt the Library as the
  // six-column table `RefDiff Library Groups.dc.html` draws, so this comp's card
  // grid is a surface the app no longer has: the pairs went 18 -> 489 findings
  // at confidence 0.88 -> 0.14 and 16 -> 335 at 1.00 -> 0.67, the desktop one
  // below the 0.5 gate where its findings stop meaning much. Kept rather than
  // deleted at the repo owner's call (2026-09-07) so the comp and its two pair
  // declarations survive if the card grid is ever wanted back.
  "RefDiff Library.dc.html",
]

const UNPAIRED_BY_DESIGN = new Map<string, string>([
  // Both Gallery comps were here until chunk 3 stubbed the sheet and registered
  // `refdiff-gallery-desktop` / `-mobile`. The waivers went in the SAME change,
  // per their own instruction — a waiver that outlives its comp is a statement
  // about a real screen that nobody re-reads. `staleWaivers` catches the other
  // direction (a waiver whose FILE is gone); nothing but this discipline catches
  // a waiver whose file gained a pair, because the map is consulted only for
  // comps with no pair.
])

export interface PairCoverage {
  /** On disk, no pair names it at all, and not allow-listed. */
  unpaired: string[]
  /** Named by a pair, but not on disk. */
  missing: string[]
  /** Allow-listed but no longer on disk — the waiver outlived its comp. */
  staleWaivers: string[]
  /**
   * On disk and DECLARED, but every pair naming it is `disabled` — so nothing
   * measures it.
   *
   * Its own bucket rather than a pass, because "declared" and "measured" are
   * the two facts this whole guard exists to keep apart, and a disabled pair
   * satisfies the first while failing the second. Counting it as paired would
   * put a silent hole in exactly the check that was written to close one. The
   * real-dir test asserts this list EXACTLY, so disabling or re-enabling a pair
   * has to be a deliberate edit here — a `contains` assertion would pass on an
   * empty list, which is indistinguishable from a clean tree.
   */
  unmeasured: string[]
}

/**
 * Pure: compare the comps on disk against the files the manifest names.
 *
 * `manifestFiles` is EVERY pair's comp, disabled ones included; `enabledFiles`
 * is the subset that a run would actually capture. Passing the same list twice
 * is the no-disabled-pairs case.
 */
export function pairCoverage(
  comps: readonly string[],
  manifestFiles: readonly string[],
  allowed: ReadonlySet<string>,
  enabledFiles: readonly string[] = manifestFiles,
): PairCoverage {
  const named = new Set(manifestFiles)
  const measured = new Set(enabledFiles)
  const onDisk = new Set(comps)
  return {
    unpaired: comps.filter((c) => !named.has(c) && !allowed.has(c)).sort(),
    missing: [...named].filter((f) => !onDisk.has(f)).sort(),
    staleWaivers: [...allowed].filter((a) => !onDisk.has(a)).sort(),
    unmeasured: comps.filter((c) => named.has(c) && !measured.has(c)).sort(),
  }
}

const designDir = fileURLToPath(new URL("../../../design/refdiff/", import.meta.url))
const manifestUrl = new URL("../../../design/refdiff.manifest.mjs", import.meta.url)

describe("pairCoverage", () => {
  // The scanner runs against synthetic inputs on every build, so the guard has
  // a failure demonstration that needs no working-tree mutation. Without these
  // the assertions below could only ever be seen passing.
  it("names a comp that no pair references", () => {
    const r = pairCoverage(["A.dc.html", "B.dc.html"], ["A.dc.html"], new Set())
    expect(r.unpaired).toEqual(["B.dc.html"])
    expect(r.missing).toEqual([])
  })

  it("names a pair whose comp is not on disk", () => {
    const r = pairCoverage(["A.dc.html"], ["A.dc.html", "Gone.dc.html"], new Set())
    expect(r.missing).toEqual(["Gone.dc.html"])
    expect(r.unpaired).toEqual([])
  })

  it("honours the waiver, and reports a waiver that outlived its comp", () => {
    const allowed = new Set(["Showcase.dc.html", "Deleted.dc.html"])
    const r = pairCoverage(["A.dc.html", "Showcase.dc.html"], ["A.dc.html"], allowed)
    expect(r.unpaired).toEqual([])
    expect(r.staleWaivers).toEqual(["Deleted.dc.html"])
  })

  // A filter-based "this set is empty" assertion is indistinguishable from an
  // over-filtering predicate that returns nothing for every input, so the
  // positive control above is what gives the clean-tree cases below meaning.
  it("is clean when every comp has a pair", () => {
    const r = pairCoverage(["A.dc.html"], ["A.dc.html"], new Set())
    expect(r).toEqual({ unpaired: [], missing: [], staleWaivers: [], unmeasured: [] })
  })

  // A disabled pair keeps its comp OUT of `unpaired` — the declaration is still
  // there — and puts it in `unmeasured`, which is the honest description.
  it("calls a comp whose only pair is disabled unmeasured, not unpaired", () => {
    const r = pairCoverage(["A.dc.html", "B.dc.html"], ["A.dc.html", "B.dc.html"], new Set(), ["A.dc.html"])
    expect(r.unpaired).toEqual([])
    expect(r.missing).toEqual([])
    expect(r.unmeasured).toEqual(["B.dc.html"])
  })

  // Two pairs can name one comp — the desktop and mobile halves do. Disabling
  // ONE of them leaves the comp measured, so it is not unmeasured.
  it("keeps a comp measured while any one of its pairs is enabled", () => {
    const r = pairCoverage(["A.dc.html"], ["A.dc.html", "A.dc.html"], new Set(), ["A.dc.html"])
    expect(r.unmeasured).toEqual([])
  })
})

describe("the real design dir", () => {
  it("has a pair for every comp, and a comp for every pair", async () => {
    const comps = (await readdir(designDir)).filter((f) => f.endsWith(".dc.html"))
    // Guard the guard: an empty comp list would make every assertion below
    // vacuous, which is how a moved design dir reads as all-green.
    expect(comps.length).toBeGreaterThan(2)

    const { manifest } = (await import(manifestUrl.href)) as {
      manifest: { id: string; disabled?: string | boolean; design: { file?: string } }[]
    }
    const named = manifest.flatMap((p) => (p.design.file ? [p.design.file] : []))
    const enabled = manifest.flatMap((p) => (p.design.file && !p.disabled ? [p.design.file] : []))
    expect(named.length).toBeGreaterThan(0)

    const r = pairCoverage(comps, named, new Set(UNPAIRED_BY_DESIGN.keys()), enabled)
    expect(r.unpaired, "comps with no pair — add one to design/refdiff.manifest.mjs, or waive it in UNPAIRED_BY_DESIGN with the reason").toEqual([])
    expect(r.missing, "pairs naming a comp that is not on disk — re-fetch it with DesignSync, or drop the pair").toEqual([])
    expect(r.staleWaivers, "UNPAIRED_BY_DESIGN entries whose comp is gone — drop the waiver").toEqual([])
    // EXACT, never `contains`: an empty list is indistinguishable from a clean
    // tree, so disabling or re-enabling a pair has to be an edit here.
    expect(r.unmeasured, "comps whose every pair is disabled — re-enable one, or retire the comp").toEqual(
      DISABLED_COMPS,
    )
  })
})
