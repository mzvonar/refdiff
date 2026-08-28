import type { Page } from "playwright"

import { describe, expect, it } from "vitest"

import { resolveScope } from "./dc-html.js"

/**
 * A Page stand-in: `evaluate` returns queued results in call order, `locator`
 * reports a match count and records the elements the caller tagged.
 */
function fakePage(evaluations: unknown[], locatorCount = 1) {
  const queue = [...evaluations]
  const tagged: string[] = []
  const page = {
    evaluate: async () => queue.shift(),
    locator: (selector: string) => ({
      count: async () => locatorCount,
      first: () => ({
        evaluate: async () => {
          tagged.push(selector)
        },
      }),
    }),
  } as unknown as Page
  return { page, tagged, left: () => queue.length }
}

const FRAME = '[id="2a"]'

describe("resolveScope", () => {
  it("an explicit selector wins over every heuristic", async () => {
    const { page, tagged } = fakePage([])
    const result = await resolveScope(page, FRAME, ".modal")
    expect(result).toEqual({
      ok: true,
      value: { mode: "explicit", selector: `${FRAME} [data-vc-scope]` },
    })
    expect(tagged).toEqual([`${FRAME} .modal`])
  })

  it("an explicit selector that matches nothing is a typed error, not a fallback", async () => {
    const { page } = fakePage([], 0)
    expect(await resolveScope(page, FRAME, ".missing")).toEqual({
      ok: false,
      error: "scope-not-found",
    })
  })

  /**
   * org-detail.dc.html#2a: the frame IS the screen (a flex row of a 232px
   * sidebar and the content). The area heuristic kept only the content and
   * dropped the sidebar, so the design side had no navigation at all.
   */
  it("stops at the frame when the frame carries data-screen-label", async () => {
    const { page, left } = fakePage(["frame"])
    expect(await resolveScope(page, FRAME, undefined)).toEqual({
      ok: true,
      value: { mode: "screen-label", selector: FRAME },
    })
    expect(left()).toBe(0) // the area heuristic never ran
  })

  /** documents.dc.html#8a: `<div id="8a">` merely wraps the labelled screen. */
  it("descends to a single labelled descendant and tags it", async () => {
    const { page, tagged } = fakePage(["descendant"])
    expect(await resolveScope(page, FRAME, undefined)).toEqual({
      ok: true,
      value: { mode: "screen-label", selector: `${FRAME} [data-vc-scope]` },
    })
    expect(tagged).toEqual([`${FRAME} [data-screen-label]`])
  })

  it("falls back to the largest child when no marker settles it", async () => {
    // "none" covers both an unlabelled frame and two labelled screens in one
    // frame, where picking either would be a guess.
    const { page } = fakePage([
      "none",
      [
        { index: 0, w: 480, h: 22 },
        { index: 1, w: 800, h: 1020 },
      ],
      undefined,
    ])
    expect(await resolveScope(page, FRAME, undefined)).toEqual({
      ok: true,
      value: { mode: "largest-child", selector: `${FRAME} > [data-vc-scope]`, candidates: 2 },
    })
  })

  it("falls back to the frame when nothing inside is big enough to be UI", async () => {
    const { page } = fakePage(["none", [{ index: 0, w: 120, h: 22 }]])
    expect(await resolveScope(page, FRAME, undefined)).toEqual({
      ok: true,
      value: { mode: "frame", selector: FRAME, candidates: 1 },
    })
  })
})
