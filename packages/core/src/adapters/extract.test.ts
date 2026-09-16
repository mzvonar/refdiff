import type { MatchResult } from "../pipeline.js"
import type { ElementNode } from "../types.js"
import type { Browser } from "playwright"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { runTypedChecks } from "../structural/checks.js"
import { launchBrowser, openPage } from "./browser.js"
import { extractElementTree } from "./extract.js"

/**
 * The one adapter test in this package that drives a REAL browser.
 *
 * `extract.ts` is a `page.evaluate` closure: every line of it runs in the page,
 * so a fake `Page` returning canned results tests the caller and not one
 * statement of the thing that was wrong. The rule "unit-test the pure stage, not
 * the adapter" (CLAUDE.md) has no pure stage to offer here — the defect WAS the
 * measurement never being taken.
 */
describe("extractElementTree — line-height", () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await launchBrowser()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const capture = async (markup: string): Promise<ElementNode[]> => {
    const opened = await openPage(browser, { viewport: { width: 400, height: 200 } })
    if ("error" in opened) throw new Error(opened.error)
    await opened.page.setContent(
      `<body style="margin:0"><div id="root" style="width:400px">${markup}</div></body>`,
    )
    const tree = await extractElementTree(opened.page, "#root")
    await opened.ctx.close()
    return tree?.elements ?? []
  }

  const textNode = (elements: readonly ElementNode[], text: string): ElementNode => {
    const hit = elements.find((e) => e.text === text)
    if (!hit) throw new Error(`no element carrying "${text}" in ${JSON.stringify(elements)}`)
    return hit
  }

  /** A `.dc.html` comp: a `font:` shorthand, so the computed value is the keyword. */
  const COMP = `<p style="font:400 13px 'Nimbus Sans', sans-serif;margin:0;color:#111">Zoznam správ</p>`
  /** The implementation: Tailwind-shaped, explicit px leading — here 1.5×. */
  const IMPL = `<p style="font-family:'Nimbus Sans', sans-serif;font-size:13px;font-weight:400;line-height:19.5px;margin:0;color:#111">Zoznam správ</p>`

  /**
   * The gap that cost a session on `messages-accountant-desktop` (2026-09-16):
   * the comp's rows are drawn at the font's normal leading and the implementation
   * inherited the page's 1.5, and NO finding said so. `getComputedStyle` reports
   * the keyword "normal" for the comp side, extraction dropped the property, and
   * `checks.ts` needs it on both sides — so the check silently never ran and the
   * whole difference was absorbed by the alignment fit as a page-wide `scaleY`.
   *
   * Red without the fix: the comp element carries no `lineHeight`, so the pair
   * agrees on family, size and weight and produces no `typography` finding at all.
   */
  it("resolves `normal` to its used value, so a comp authored with `font:` is comparable", async () => {
    const design = textNode(await capture(COMP), "Zoznam správ")
    const impl = textNode(await capture(IMPL), "Zoznam správ")

    // The used value is the font's own metric and differs by machine; what is
    // pinned is that it was MEASURED, and that it is the tighter of the two.
    const designLineHeight = design.style?.lineHeight
    expect(typeof designLineHeight).toBe("number")
    expect(designLineHeight as number).toBeGreaterThan(0)
    expect(designLineHeight as number).toBeLessThan(19.5 - 1.5)
    expect(impl.style?.lineHeight).toBe(19.5)

    const match: MatchResult = {
      matches: [{ design, impl, gamma: 0, via: "text" }],
      designOnly: [],
      implOnly: [],
    }
    const typography = runTypedChecks(match).filter((f) => f.type === "typography")
    expect(typography).toHaveLength(1)
    expect(typography[0]!.message).toContain("line-height")
    expect(typography[0]!.actual?.["lineHeight"]).toBe(19.5)
    expect(typography[0]!.expected?.["lineHeight"]).toBe(designLineHeight)
  }, 60_000)

  /**
   * The other half of the same rule: two sides that both say `normal` agree.
   * Without this, "always emit a number" could have been satisfied by emitting a
   * constant, and every `leading-normal` implementation would report drift.
   */
  it("reports no typography drift when both sides leave the leading at normal", async () => {
    const design = textNode(await capture(COMP), "Zoznam správ")
    const impl = textNode(
      await capture(
        `<p style="font-family:'Nimbus Sans', sans-serif;font-size:13px;font-weight:400;line-height:normal;margin:0;color:#111">Zoznam správ</p>`,
      ),
      "Zoznam správ",
    )
    expect(design.style?.lineHeight).toBe(impl.style?.lineHeight)
    const match: MatchResult = {
      matches: [{ design, impl, gamma: 0, via: "text" }],
      designOnly: [],
      implOnly: [],
    }
    expect(runTypedChecks(match).filter((f) => f.type === "typography")).toEqual([])
  }, 60_000)

  /**
   * The probe is appended to `document.body` to be measured. Some capture paths
   * screenshot AFTER extraction, so a probe left behind would be a difference the
   * harness introduced into its own measurement.
   */
  it("leaves no probe node behind in the page", async () => {
    const opened = await openPage(browser, { viewport: { width: 400, height: 200 } })
    if ("error" in opened) throw new Error(opened.error)
    await opened.page.setContent(`<body style="margin:0"><div id="root">${COMP}</div></body>`)
    await extractElementTree(opened.page, "#root")
    expect(await opened.page.evaluate(() => document.body.children.length)).toBe(1)
    await opened.ctx.close()
  }, 60_000)
})
