import type { Browser, Page } from "playwright"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { launchBrowser, openPage } from "./browser.js"
import { probeProps } from "./dc-props.js"

/**
 * The probe is a `page.evaluate` closure, so it gets a REAL browser for the
 * reason `extract.test.ts` states: a fake `Page` returning a canned probe tests
 * this module's caller and not one statement of the closure — and the closure is
 * exactly where a runtime rename bites. Every global name it depends on
 * (`__dcSetProps`, `__dcRootName`, `__dcRegistry`, `propsMeta`) is asserted here
 * against a stub runtime shaped like the real `support.js`.
 *
 * Why that matters more than it looks: every one of those names failing
 * independently used to yield `declared: []`, which the checker turned into a
 * confident, WRONG sentence — "the comp declares no props at all" — about a comp
 * that declares plenty. `registryVisible` exists to keep those apart, and it is
 * a distinction only an in-page test can prove.
 */
describe("probeProps — against a real page", () => {
  let browser: Browser

  beforeAll(async () => {
    browser = await launchBrowser()
  }, 60_000)

  afterAll(async () => {
    await browser?.close()
  })

  const withPage = async (bootstrap: string, run: (page: Page) => Promise<void>) => {
    const opened = await openPage(browser, { viewport: { width: 200, height: 100 } })
    if ("error" in opened) throw new Error(opened.error)
    await opened.page.setContent(`<body><script>${bootstrap}</script></body>`)
    try {
      await run(opened.page)
    } finally {
      await opened.ctx.close()
    }
  }

  // The shape support.js actually installs: api methods assigned onto window,
  // and `__dcRegistry` being `runtime.registry.entries` keyed by root name.
  const runtime = (root: string, propsMeta: string) => `
    window.__dcSetProps = function () {};
    window.__dcRootName = function () { return ${JSON.stringify(root)}; };
    window.__dcRegistry = { ${JSON.stringify(root)}: { propsMeta: ${propsMeta} } };
  `

  it("reads the declared prop names off the root's registry entry", async () => {
    await withPage(
      runtime("messages", "{ selAd: { default: 1 }, openAm: { default: false } }"),
      async (page) => {
        expect(await probeProps(page)).toEqual({
          supported: true,
          root: "messages",
          registryVisible: true,
          declared: ["selAd", "openAm"],
        })
      },
    )
  })

  it("reports an unsupported runtime when __dcSetProps is absent", async () => {
    // A support.js predating prop overrides: the canvas boots, nothing else.
    await withPage(`window.__dcRootName = function () { return "messages"; };`, async (page) => {
      expect(await probeProps(page)).toEqual({
        supported: false,
        root: "",
        registryVisible: false,
        declared: [],
      })
    })
  })

  it("reports an unsupported runtime on a page that is not a dc canvas at all", async () => {
    await withPage("", async (page) => {
      expect((await probeProps(page)).supported).toBe(false)
    })
  })

  /**
   * The `dc-import` wrapper case, and the one this distinction was added for:
   * the page root is a wrapper that declares nothing and pulls the real comp in
   * as a separate registry entry, so the root's entry is MISSING rather than
   * empty. Reported as unreadable, never as "declares nothing".
   */
  it("separates a missing registry entry from an empty declaration", async () => {
    await withPage(
      `
      window.__dcSetProps = function () {};
      window.__dcRootName = function () { return "wrapper"; };
      window.__dcRegistry = { "the-real-comp": { propsMeta: { selAd: {} } } };
    `,
      async (page) => {
        expect(await probeProps(page)).toEqual({
          supported: true,
          root: "wrapper",
          registryVisible: false,
          declared: [],
        })
      },
    )
  })

  // support.js stores `propsMeta` as null on an entry that declared none, which
  // is a DIFFERENT fact from the entry being absent.
  it("treats a null propsMeta as visible-but-empty", async () => {
    await withPage(runtime("messages", "null"), async (page) => {
      expect(await probeProps(page)).toEqual({
        supported: true,
        root: "messages",
        registryVisible: true,
        declared: [],
      })
    })
  })

  it("survives a registry that is absent entirely", async () => {
    await withPage(
      `
      window.__dcSetProps = function () {};
      window.__dcRootName = function () { return "messages"; };
    `,
      async (page) => {
        expect(await probeProps(page)).toMatchObject({
          supported: true,
          registryVisible: false,
          declared: [],
        })
      },
    )
  })
})
