import type { Browser, Locator, Page } from "playwright"

import { describe, expect, it, vi } from "vitest"

import {
  CAPTURE_LOCALE,
  CAPTURE_TIMEZONE,
  closeQuietly,
  FROZEN_CLOCK,
  openPage,
  withGround,
} from "./browser.js"

describe("openPage", () => {
  const asBrowser = (newContext: unknown): Browser => ({ newContext }) as unknown as Browser
  /** Every real page has `clock`; the mock needs it because `openPage` now uses it. */
  const mockPage = (): { id: string; clock: { setFixedTime: ReturnType<typeof vi.fn> } } => ({
    id: "page",
    clock: { setFixedTime: vi.fn(async () => {}) },
  })

  it("returns the context and page when the browser is healthy", async () => {
    const page = mockPage()
    const ctx = { newPage: vi.fn(async () => page) }
    const result = await openPage(
      asBrowser(async () => ctx),
      { viewport: { width: 10, height: 10 } },
    )
    expect(result).toEqual({ ctx, page })
  })

  /**
   * A surface that renders RELATIVE TIME re-renders differently tomorrow, and that moves
   * `matched`, not merely the findings — measured overnight on
   * `refdiff-library-groups-desktop`: `20 d ago` → `19 d ago` reflowed a row and cost one
   * pairing, 197 → 196, with nothing edited. See `FROZEN_CLOCK` for why an `ignore` rule
   * cannot substitute.
   *
   * Pinned HERE rather than in each adapter because `openPage` is the single seam all
   * three go through: storybook, live-url and dc-html each open their page with it and
   * navigate afterwards, so a new adapter inherits the frozen clock without knowing it
   * exists.
   */
  it("freezes the clock before the caller can navigate", async () => {
    const page = mockPage()
    const ctx = { newPage: vi.fn(async () => page) }
    await openPage(
      asBrowser(async () => ctx),
      {},
    )
    expect(page.clock.setFixedTime).toHaveBeenCalledWith(FROZEN_CLOCK)
  })

  /**
   * Time was frozen for reproducibility while the ZONE that renders that frozen
   * instant stayed an accident of the machine — so the same pair on a Bratislava
   * laptop and on a UTC CI box disagreed by two hours on every timestamp, with
   * nothing in the report saying so. Pinned at the same seam as the clock, for
   * the same reason: `openPage` is the one site all three adapters go through.
   */
  it("pins the timezone and locale the capture renders in", async () => {
    const page = mockPage()
    const seen: unknown[] = []
    await openPage(
      asBrowser(async (options: unknown) => {
        seen.push(options)
        return { newPage: vi.fn(async () => page) }
      }),
      { viewport: { width: 10, height: 10 } },
    )
    expect(seen[0]).toMatchObject({
      viewport: { width: 10, height: 10 },
      timezoneId: CAPTURE_TIMEZONE,
      locale: CAPTURE_LOCALE,
    })
  })

  /**
   * A comp drawn for another market is the case the default cannot serve, and
   * the manifest entry is the level that knows. Caller wins, or the override is
   * decoration.
   */
  it("lets a caller override the pinned zone and locale", async () => {
    const page = mockPage()
    const seen: unknown[] = []
    await openPage(
      asBrowser(async (options: unknown) => {
        seen.push(options)
        return { newPage: vi.fn(async () => page) }
      }),
      { timezoneId: "Europe/Bratislava", locale: "sk-SK" },
    )
    expect(seen[0]).toMatchObject({ timezoneId: "Europe/Bratislava", locale: "sk-SK" })
  })

  /**
   * `null` is the opt-out, not `undefined`. Written the other way round first, and this
   * test failed: an explicitly-passed `undefined` re-triggers the default parameter, so
   * the escape hatch froze the clock anyway while reading as though it did not.
   */
  it("leaves the clock live when a caller passes null", async () => {
    const page = mockPage()
    const ctx = { newPage: vi.fn(async () => page) }
    await openPage(
      asBrowser(async () => ctx),
      {},
      null,
    )
    expect(page.clock.setFixedTime).not.toHaveBeenCalled()
  })

  /**
   * The regression: one browser serves a whole set, and chromium can be killed
   * mid-run under memory pressure. Adapters open their context BEFORE their try
   * block, so this throw escaped the adapter entirely and ended the run at pair
   * 17 of 41 — losing every remaining pair AND the set summary.
   */
  it("returns an error value instead of throwing when the browser is dead", async () => {
    const dead = asBrowser(async () => {
      throw new Error("Target page, context or browser has been closed")
    })
    const result = await openPage(dead, {})
    expect(result).toEqual({ error: "Target page, context or browser has been closed" })
  })

  it("also catches a failure from newPage, after the context opened", async () => {
    const ctx = {
      newPage: async () => {
        throw new Error("browser has been closed")
      },
    }
    const result = await openPage(
      asBrowser(async () => ctx),
      {},
    )
    expect(result).toEqual({ error: "browser has been closed" })
  })
})

describe("closeQuietly", () => {
  it("awaits a cleanup that succeeds", async () => {
    const close = vi.fn(async () => "closed")
    await expect(closeQuietly(close)).resolves.toBeUndefined()
    expect(close).toHaveBeenCalledOnce()
  })

  it("swallows a rejecting cleanup instead of propagating", async () => {
    const close = vi.fn(async () => {
      throw new Error(
        "Protocol error (Target.disposeBrowserContext): Failed to find context with id ABC",
      )
    })
    await expect(closeQuietly(close)).resolves.toBeUndefined()
  })

  it("swallows a synchronous throw from the cleanup thunk", async () => {
    await expect(
      closeQuietly(() => {
        throw new Error("browser already gone")
      }),
    ).resolves.toBeUndefined()
  })

  /**
   * The regression this exists for: a `finally` cleanup runs AFTER `catch` has
   * produced the typed error, so an unguarded throw there replaces the returned
   * value and escapes the adapter — one dead context crashed a whole 41-pair run.
   */
  it("lets the value from catch survive a failing cleanup in finally", async () => {
    const capture = async (): Promise<string> => {
      try {
        throw new Error("navigation failed")
      } catch {
        return "typed-error"
      } finally {
        await closeQuietly(async () => {
          throw new Error("Failed to find context with id ABC")
        })
      }
    }
    await expect(capture()).resolves.toBe("typed-error")
  })

  it("runs later cleanups even when an earlier one throws", async () => {
    const closeServer = vi.fn(async () => undefined)
    await closeQuietly(async () => {
      throw new Error("context gone")
    })
    await closeQuietly(closeServer)
    expect(closeServer).toHaveBeenCalledOnce()
  })
})

/**
 * `withGround` marks the captured node's ancestry, shoots, and takes the
 * marking back off. Verified end to end against a real Storybook on
 * 2026-09-10 (the shot came back RGBA, 95.1% transparent, and every ancestor's
 * computed `backgroundColor` was identical before and after) — what is worth
 * unit-testing is the part a real browser makes hard to observe: that the
 * revert happens on EVERY path.
 */
describe("withGround", () => {
  const fakes = () => {
    const calls: string[] = []
    const page = {
      evaluate: vi.fn(async () => {
        calls.push("revert")
      }),
    } as unknown as Page
    const locator = {
      evaluate: vi.fn(async () => {
        calls.push("apply")
      }),
    } as unknown as Locator
    return { calls, page, locator }
  }

  it("leaves the page untouched and shoots the composite when ground is kept", async () => {
    const { calls, page, locator } = fakes()
    const png = await withGround(page, locator, "keep", async (omitBackground) => {
      calls.push(`shoot(omitBackground=${omitBackground})`)
      return "png"
    })
    expect(png).toBe("png")
    expect(calls).toEqual(["shoot(omitBackground=false)"])
  })

  it("applies, shoots with an alpha channel, then reverts", async () => {
    const { calls, page, locator } = fakes()
    await withGround(page, locator, "transparent", async (omitBackground) => {
      calls.push(`shoot(omitBackground=${omitBackground})`)
      return "png"
    })
    expect(calls).toEqual(["apply", "shoot(omitBackground=true)", "revert"])
  })

  /**
   * The regression this exists for. Every adapter extracts its element tree
   * from the page AFTER the shot, so a `return await shoot()` that skips the
   * revert on failure does not lose a screenshot — it writes
   * `backgroundColor: transparent` onto every ancestor in `elements.json`,
   * with no failure signature anywhere. The shot's own error must still be the
   * one that reaches the adapter.
   */
  it("reverts even when the shot throws, and re-throws the shot's error", async () => {
    const { calls, page, locator } = fakes()
    await expect(
      withGround(page, locator, "transparent", async () => {
        calls.push("shoot")
        throw new Error("Timeout 30000ms exceeded")
      }),
    ).rejects.toThrow("Timeout 30000ms exceeded")
    expect(calls).toEqual(["apply", "shoot", "revert"])
  })

  /**
   * And when the revert ITSELF fails, that is the error worth having: the page
   * is left mutated and the extraction that follows would measure it. It
   * outranks the shot's error deliberately.
   */
  it("surfaces a failed revert over the shot's own error", async () => {
    const { page, locator } = fakes()
    ;(page.evaluate as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Execution context was destroyed"),
    )
    await expect(
      withGround(page, locator, "transparent", async () => {
        throw new Error("Timeout 30000ms exceeded")
      }),
    ).rejects.toThrow("Execution context was destroyed")
  })
})
