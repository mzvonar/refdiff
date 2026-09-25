import type { ElementNode } from "../types.js"
import type { Browser } from "playwright"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { launchBrowser, openPage } from "./browser.js"
import { extractElementTree } from "./extract.js"

/**
 * `isOccluded` lives inside the `page.evaluate` closure, so it gets a REAL
 * browser for the reason `dc-props.browser.test.ts` states: a canned `Page`
 * would test this module's caller and not one statement of the closure. Here it
 * is stronger than usual — the whole function is a question only a live layout
 * engine can answer. `document.elementFromPoint` has no jsdom equivalent worth
 * asserting against, and the failure mode being guarded (a filter that silently
 * deletes real findings) is invisible to every other kind of test.
 */
describe("extractElementTree — occlusion", () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await launchBrowser()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const capture = async (markup: string): Promise<ElementNode[]> => {
    const opened = await openPage(browser, { viewport: { width: 400, height: 300 } })
    if ("error" in opened) throw new Error(opened.error)
    await opened.page.setContent(
      `<body style="margin:0"><div id="root" style="width:400px;height:300px;position:relative">${markup}</div></body>`,
    )
    const tree = await extractElementTree(opened.page, "#root")
    await opened.ctx.close()
    return tree?.elements ?? []
  }

  const byText = (els: readonly ElementNode[], text: string): ElementNode => {
    const hit = els.find((e) => e.text === text)
    if (!hit) throw new Error(`no element carrying "${text}" in ${els.map((e) => e.text)}`)
    return hit
  }

  /**
   * The shape this exists for: a full-screen takeover over page chrome. Nothing
   * below it hides ITSELF — `display`, `visibility` and `opacity` are all
   * untouched — so the self-visibility filter passes every one of them through.
   */
  it("marks elements painted over by a full-screen overlay, and not the overlay itself", async () => {
    const els = await capture(`
      <nav style="position:absolute;inset:0 0 auto 0;height:60px;background:#eee">
        <span style="font-size:14px">Chrome nav</span>
      </nav>
      <div style="position:absolute;inset:0;background:#fff;z-index:5">
        <span style="font-size:14px">Takeover body</span>
      </div>
    `)
    expect(byText(els, "Chrome nav").occluded).toBe(true)
    expect(byText(els, "Takeover body").occluded).toBe(false)
  })

  it("leaves an ordinary page untouched — measured, and not occluded", async () => {
    const els = await capture(
      `<p style="margin:0;font-size:14px">Alpha</p><p style="margin:0;font-size:14px">Beta</p>`,
    )
    // Explicit `false`, not absent: these WERE hit-tested and are on screen.
    expect(byText(els, "Alpha").occluded).toBe(false)
    expect(byText(els, "Beta").occluded).toBe(false)
  })

  /**
   * The blind spot, pinned so it cannot be mistaken for a measurement. Sample
   * points outside the viewport have no answer, so an element below the fold is
   * `undefined` rather than `false` — "scrolled out of view" is not "painted
   * over". On a FULL-PAGE capture that is most of the page, and the detection is
   * largely inert there.
   */
  it("says nothing about an element outside the viewport", async () => {
    const els = await capture(
      `<p style="margin:0;font-size:14px">Visible</p>
       <p style="position:absolute;top:2000px;margin:0;font-size:14px">Far below</p>`,
    )
    expect(byText(els, "Visible").occluded).toBe(false)
    expect("occluded" in byText(els, "Far below")).toBe(false)
  })

  /**
   * Fail-open guard. A `pointer-events:none` element is skipped by hit-testing,
   * which would report whatever is BEHIND it — so the scrim doing the covering
   * would itself look covered. Wrong here costs a deleted finding.
   *
   * The answer is ABSENT rather than `false`, which is a different claim and is
   * kept distinct deliberately: `false` asserts "measured, and on screen", while
   * a missing key says "this adapter cannot tell" — the same contract
   * `affordance` uses, and what lets `dropOccluded` act on `true` alone.
   */
  it("never calls a pointer-events:none element occluded, and does not claim it is visible", async () => {
    const els = await capture(`
      <div style="position:absolute;inset:0;background:#fff">
        <span style="font-size:14px">Under</span>
      </div>
      <div style="position:absolute;inset:0;z-index:5;pointer-events:none">
        <span style="font-size:14px;pointer-events:none">Scrim label</span>
      </div>
    `)
    expect("occluded" in byText(els, "Scrim label")).toBe(false)
  })

  /**
   * PARTIAL cover is not cover. A sticky header over the top of a long paragraph
   * still leaves most of it readable, and calling that occluded would drop text
   * the reader can plainly see. Five sample points exist for this case alone.
   *
   * The text WRAPS on purpose. A single-line span's box is one line tall, so an
   * overlay reaching it covers all of it — the element that is "partly covered"
   * in the obvious markup is the wrapper, and hit-testing runs on the text's own
   * ink box, not the wrapper's. Getting this wrong is what the first draft of
   * this test did.
   */
  it("keeps a text block only partly covered", async () => {
    const els = await capture(`
      <p style="position:absolute;top:100px;left:0;width:150px;margin:0;font-size:14px;line-height:18px">Wrapping row of text that runs to several lines in a narrow column</p>
      <div style="position:absolute;top:0;left:0;width:400px;height:125px;background:#fff;z-index:5"></div>
    `)
    const row = els.find((e) => (e.text ?? "").startsWith("Wrapping row"))
    expect(row?.occluded).toBe(false)
  })
})
