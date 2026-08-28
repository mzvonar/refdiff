import type { Browser } from "playwright"

import { describe, expect, it, vi } from "vitest"

import { closeQuietly, openPage } from "./browser.js"

describe("openPage", () => {
  const asBrowser = (newContext: unknown): Browser => ({ newContext }) as unknown as Browser

  it("returns the context and page when the browser is healthy", async () => {
    const page = { id: "page" }
    const ctx = { newPage: vi.fn(async () => page) }
    const result = await openPage(
      asBrowser(async () => ctx),
      { viewport: { width: 10, height: 10 } },
    )
    expect(result).toEqual({ ctx, page })
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
