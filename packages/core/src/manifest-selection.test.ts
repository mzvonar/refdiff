import { describe, expect, it } from "vitest"

import { parseManifest, planSelection } from "./manifest.js"

/**
 * `--` is set-expansion syntax BY CONVENTION only. A hand-written manifest may
 * spell a pair id with one, and the annotator's library rewards it — it groups
 * by the text before the first `--`, which is the only way to get groups out of
 * a flat pair list. These pin that such an id stays addressable: it was not, and
 * the run died with "no runnable pairs selected" while the id sat in the
 * manifest, plainly visible.
 */
describe("planSelection — a manifest pair id containing `--`", () => {
  const parsed = parseManifest([
    {
      id: "messages-owner--mobile",
      design: { file: "d.dc.html", frame: "2f" },
      app: { source: "live", route: "/o/m" },
    },
    {
      id: "messages-owner--desktop",
      design: { file: "d.dc.html", frame: "2e" },
      app: { source: "live", route: "/o/d" },
    },
    {
      id: "messages-accountant--mobile",
      design: { file: "d.dc.html", frame: "1d" },
      app: { source: "live", route: "/a/m" },
    },
    {
      id: "plain",
      design: { file: "d.dc.html", frame: "g" },
      app: { source: "live", route: "/p" },
    },
  ])
  const pairs = parsed.ok ? parsed.value.pairs : []

  it("selects the pair whose id IS the selector, not an entry that does not exist", () => {
    const plan = planSelection(pairs, ["messages-owner--mobile"])
    expect(plan.specs.map((p) => p.id)).toStrictEqual(["messages-owner--mobile"])
  })

  it("tracks it as a DIRECT id, not as a variant-cell selector", () => {
    const plan = planSelection(pairs, ["messages-owner--mobile"])
    expect(plan.directIds).toStrictEqual(new Set(["messages-owner--mobile"]))
    // It used to ride along in cellSelectors and survive the post-expansion
    // filter only because that filter happens to test `wanted.has(p.id)` —
    // true today, silently false the moment the filter is rewritten.
    expect(plan.cellSelectors).toStrictEqual([])
    expect(plan.wholeEntries).toStrictEqual(new Set())
  })

  it("mixes with an ordinary id in one run", () => {
    const plan = planSelection(pairs, ["messages-accountant--mobile", "plain"])
    expect(plan.specs.map((p) => p.id)).toStrictEqual(["messages-accountant--mobile", "plain"])
    expect(plan.wholeEntries).toStrictEqual(new Set(["plain"]))
    expect(plan.directIds).toStrictEqual(new Set(["messages-accountant--mobile"]))
    expect(plan.cellSelectors).toStrictEqual([])
  })

  it("does NOT invent an entry from the shared prefix", () => {
    // `messages-owner` is not a manifest id. Those two pairs GROUP under that
    // name in the annotator, but grouping is a display concern and the CLI has
    // never selected on it.
    expect(planSelection(pairs, ["messages-owner"]).specs).toStrictEqual([])
  })

  it("leaves a genuine set-cell selector alone", () => {
    // No manifest pair is named this, so it stays a cell selector for the
    // post-expansion filter — the behaviour real sets depend on.
    const plan = planSelection(pairs, ["ds-button--state-hover_size-sm"])
    expect(plan.cellSelectors).toStrictEqual(["ds-button--state-hover_size-sm"])
    expect(plan.directIds).toStrictEqual(new Set())
    expect(plan.wholeEntries).toStrictEqual(new Set())
  })

  it("returns every pair when nothing is named", () => {
    expect(planSelection(pairs, undefined).specs).toHaveLength(4)
  })

  /**
   * The regression the first draft of this file caught. Routing every exact id
   * match through `directIds` broke naming a SET entry whole: the entry was
   * selected, then none of the `<entry>--<cell>` pairs it expanded into matched
   * `directIds`, so the run measured nothing. Only the AMBIGUOUS shape — an id
   * that contains `--` — is redirected; a selector without one stays an entry
   * name, which is what the post-expansion filter tests `entryOf(p.id)` against.
   */
  it("keeps a `--`-free id in wholeEntries so a set entry still expands", () => {
    const plan = planSelection(pairs, ["plain"])
    expect(plan.wholeEntries).toStrictEqual(new Set(["plain"]))
    expect(plan.directIds).toStrictEqual(new Set())
  })
})
