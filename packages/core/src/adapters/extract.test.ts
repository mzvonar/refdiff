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

/**
 * The AFFORDANCE measurement, in a real browser — because that is the only place it exists.
 *
 * This release's headline number is a false-positive fix: "6 of the first 9 corpus findings were
 * false positives on `<button aria-label><svg aria-hidden/></button>`", cured by measuring
 * reachability from the nearest CONTROL at or above the element rather than from the element
 * itself. That fix lives entirely in `controlFor` / `isAriaHidden` inside the `page.evaluate`
 * closure, and nothing tested it: `checks.test.ts` exercises `affordanceFindings` with
 * hand-written `affordance` objects, so it never reaches this code. Reverting `controlFor` to
 * `isControl(el) ? el : null` left every test green while the channel went back to reporting
 * each icon button as dead design.
 */
describe("extractElementTree — affordance", () => {
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

  /** The exact shape that produced the 6-of-9 false positives. */
  it("calls the glyph inside an icon button INTERACTIVE and not hidden", async () => {
    const elements = await capture(
      `<button aria-label="Nahrať" style="width:40px;height:40px;cursor:pointer">
         <svg width="16" height="16" aria-hidden="true"><rect width="16" height="16"/></svg>
       </button>`,
    )

    const glyph = elements.find((e) => e.id.startsWith("svg-") || e.id.startsWith("rect-"))
    expect(glyph).toBeDefined()
    // Reachability is measured from the BUTTON, not from the glyph: the glyph is not itself a
    // control and carries aria-hidden, and reading either off the element alone is what made
    // every icon button report as dead design.
    expect(glyph?.affordance?.interactive).toBe(true)
    expect(glyph?.affordance?.hidden).toBe(false)
  })

  it("calls a bare aria-hidden span with no owning control hidden and not interactive", async () => {
    const elements = await capture(
      `<span aria-hidden="true" style="display:block;width:40px;height:40px">×</span>`,
    )

    const span = elements.find((e) => e.text === "×")
    expect(span?.affordance?.interactive).toBe(false)
    expect(span?.affordance?.hidden).toBe(true)
  })

  it("calls plain text neither interactive nor hidden", async () => {
    const elements = await capture(`<p style="margin:0">Zoznam správ</p>`)
    const text = elements.find((e) => e.text === "Zoznam správ")

    expect(text?.affordance?.interactive).toBe(false)
    expect(text?.affordance?.hidden).toBe(false)
  })

  /**
   * `cursor` INHERITS, so a leaf inside a `cursor:pointer` row reports `pointer: true` whether
   * or not anything was declared on it — the docblock used to claim otherwise and call that a
   * safeguard. Pinned so the true behaviour is on the record: it is harmless only because a
   * finding needs `pointer && !interactive`, and this leaf's `interactive` comes from the same
   * ancestor the cursor came from.
   */
  it("inherits `pointer` onto a leaf inside a clickable row, alongside interactive", async () => {
    const elements = await capture(
      `<button style="cursor:pointer;width:200px"><span>Uložiť</span></button>`,
    )
    const label = elements.find((e) => e.text === "Uložiť")

    expect(label?.affordance?.pointer).toBe(true)
    expect(label?.affordance?.interactive).toBe(true)
  })
})

/**
 * The CONTAINER channel's input, in a real browser.
 *
 * `containers` is produced by ~45 lines inside the same `page.evaluate` closure, and
 * `containers.test.ts` hand-builds `ElementNode`s with a `borderSides` map — so the extraction
 * rule that produces them was pinned by nothing, and its failure mode is SILENCE: narrow the
 * admission loop back to `Top` and the channel pairs nothing, reports nothing and exits 0,
 * which is indistinguishable from a clean pair.
 */
describe("extractElementTree — containers", () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await launchBrowser()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const containersOf = async (markup: string) => {
    const opened = await openPage(browser, { viewport: { width: 400, height: 400 } })
    if ("error" in opened) throw new Error(opened.error)
    await opened.page.setContent(
      `<body style="margin:0"><div id="root" style="width:400px">${markup}</div></body>`,
    )
    const tree = await extractElementTree(opened.page, "#root")
    await opened.ctx.close()
    return tree?.containers ?? []
  }

  /** The witness the whole channel exists for: a bottom-border-only row wrapper. */
  const ROWS = `
    <div style="border-bottom:1px solid #f2eadd;height:60px;display:flex;gap:8px">
      <span style="width:34px">A</span><span>Prvý riadok</span>
    </div>
    <div style="border-bottom:1px solid #f2eadd;height:60px;display:flex;gap:8px">
      <span style="width:34px">B</span><span>Druhý riadok</span>
    </div>`

  it("admits a wrapper that paints on the BOTTOM side only", async () => {
    const containers = await containersOf(ROWS)
    const rows = containers.filter(
      (c) => (c.style?.borderSides as Record<string, unknown> | undefined)?.bottom !== undefined,
    )

    expect(rows).toHaveLength(2)
    // `paintsDecoration` reads the TOP side; admission here deliberately checks all four, which
    // is the entire reason a row separator is visible to this channel at all.
    for (const row of rows) {
      expect((row.style?.borderSides as Record<string, unknown>).top).toBeUndefined()
    }
  })

  /**
   * The counterpart the channel needs in order to see an ABSENCE. An undecorated row wrapper
   * used to be dropped by a `paints` gate, so "the comp draws a separator and the impl draws
   * none" produced no impl container, nothing paired, and the run was silent. The one
   * production run that appeared to validate the channel only fired because that impl row
   * happened to carry a border-radius.
   */
  it("admits an UNDECORATED wrapper, so an absence has something to pair with", async () => {
    const containers = await containersOf(`
      <div style="height:60px;display:flex;gap:8px">
        <span style="width:34px">A</span><span>Prvý riadok</span>
      </div>
      <div style="height:60px;display:flex;gap:8px">
        <span style="width:34px">B</span><span>Druhý riadok</span>
      </div>`)

    expect(containers.length).toBeGreaterThanOrEqual(2)
    // …and it paints nothing, which is exactly the value the presence-flip checks compare.
    const undecorated = containers.filter((c) => Object.keys(c.style ?? {}).length === 0)
    expect(undecorated.length).toBeGreaterThanOrEqual(2)
  })

  it("gives containers their own id space, so element ids do not shift", async () => {
    const containers = await containersOf(ROWS)
    // Container ids are `c:<tag>-<n>` numbered from zero, independent of the element counter.
    // Sharing that counter renumbered every element downstream of the first container — ids
    // that reach elements.json and the annotator, which resolves a saved note by elementId.
    const numbers = containers.map((c) => Number(c.id.replace(/^c:[a-z]+-/, "")))

    expect(Math.min(...numbers)).toBe(0)
    expect(new Set(numbers).size).toBe(numbers.length)
  })
})
