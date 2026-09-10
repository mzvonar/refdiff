/**
 * Shared browser/network plumbing for capture adapters (effectful edge).
 *
 * `.dc.html` canvases render with full fidelity only when the dc-runtime
 * can load React from unpkg, so the browser needs network access and the
 * files must be served over http (file:// breaks the runtime's fetch).
 */

import type { AddressInfo } from "node:net"

import { readFile } from "node:fs/promises"
import http from "node:http"
import { extname, join, normalize, resolve, sep } from "node:path"
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright"

import { bleedClip, NO_BLEED } from "../geometry.js"
import type { Bleed } from "../types.js"
import { DEFAULT_GROUND, GROUND_ATTR, GROUND_CSS, GROUND_STYLE_ID, type Ground } from "./ground.js"

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
}

export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({ args: ["--no-sandbox"] })
}

export interface StaticServer {
  origin: string
  close: () => Promise<void>
}

export interface ServeDirOptions {
  /** TCP port; 0 (default) = ephemeral. */
  port?: number
  /** Bind address; default 127.0.0.1 (0.0.0.0 to reach it from another device). */
  host?: string
  /**
   * Zero-dependency API hook: called before static serving; return true when
   * the request was handled (the annotator mounts `/api/annotations` here).
   */
  handle?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean>
}

/** Serve `rootDir` (default: ephemeral localhost port), with path containment. */
export function serveDir(rootDir: string, options: ServeDirOptions = {}): Promise<StaticServer> {
  const { port: wantedPort = 0, host = "127.0.0.1", handle } = options
  const rootResolved = resolve(rootDir)
  const server = http.createServer(async (req, res) => {
    if (handle) {
      try {
        if (await handle(req, res)) return
      } catch (e) {
        res.writeHead(500, { "Content-Type": "text/plain" })
        res.end(e instanceof Error ? e.message : String(e))
        return
      }
    }
    try {
      const url = new URL(req.url ?? "/", "http://localhost")
      const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\]|\.\.[/\\])+/, "")
      const filePath = join(rootResolved, rel)
      // Containment: stripping leading `../` alone doesn't stop a path that
      // normalizes to escape rootDir (e.g. `/../../etc/passwd`).
      const fileResolved = resolve(filePath)
      if (fileResolved !== rootResolved && !fileResolved.startsWith(rootResolved + sep)) {
        res.writeHead(403)
        res.end("forbidden")
        return
      }
      const body = await readFile(fileResolved)
      res.writeHead(200, {
        "Content-Type": MIME[extname(fileResolved)] ?? "application/octet-stream",
      })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end("not found")
    }
  })
  return new Promise((resolveServer) => {
    server.listen(wantedPort, host, () => {
      const { port } = server.address() as AddressInfo
      resolveServer({
        origin: `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      })
    })
  })
}

export async function isReachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "GET", signal: AbortSignal.timeout(2500) })
    return res.status < 500
  } catch {
    return false
  }
}

/**
 * Run a cleanup step that must never replace the result being returned.
 *
 * Every adapter closes its context in a `finally`, which runs AFTER the `catch`
 * has already turned the failure into a typed `err(...)`. A throwing close
 * (`Failed to find context with id …`, seen when the browser died mid-capture
 * under memory pressure) overwrites that return value and propagates uncaught —
 * turning one bad pair into a crashed run that loses every other pair's report.
 * A cleanup failure is unactionable by then: the capture verdict is decided.
 */
export async function closeQuietly(close: () => Promise<unknown>): Promise<void> {
  try {
    await close()
  } catch {
    /* verdict already decided; a dead context cannot change it */
  }
}

/**
 * `newContext` + `newPage` as a value, never a throw.
 *
 * Adapters open their context BEFORE their try block, so on a browser that died
 * earlier in the run (chromium killed under memory pressure) this throws
 * "Target page, context or browser has been closed" straight past the adapter
 * and ends the whole set — losing every remaining pair and the summary. The
 * caller turns the failure into that pair's typed `capture-failed` instead.
 */
export async function openPage(
  browser: Browser,
  options: Parameters<Browser["newContext"]>[0],
): Promise<{ ctx: BrowserContext; page: Page } | { error: string }> {
  try {
    const ctx = await browser.newContext(options)
    return { ctx, page: await ctx.newPage() }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/** CSS injected before every capture so animations never smear a shot. */
export const FREEZE_CSS = `
*, *::before, *::after {
  animation: none !important;
  transition: none !important;
  caret-color: transparent !important;
}
html { scroll-behavior: auto !important; }
`

/**
 * Screenshot the target repeatedly until two consecutive shots are
 * byte-identical (or attempts run out) — settles late images, spinners the
 * freeze CSS can't stop, and font swaps.
 */
export async function captureUntilStable(
  shoot: () => Promise<Buffer>,
  { attempts = 4, intervalMs = 250 }: { attempts?: number; intervalMs?: number } = {},
): Promise<{ png: Buffer; stable: boolean }> {
  let prev = await shoot()
  for (let i = 0; i < attempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs))
    const next = await shoot()
    if (next.equals(prev)) return { png: next, stable: true }
    prev = next
  }
  return { png: prev, stable: false }
}

/**
 * Mark the captured node's ANCESTRY so `GROUND_CSS` stops it painting, run the
 * shot, then take the marking back off. See `ground.ts` for what this buys and
 * why the halfway version buys nothing.
 *
 * Exported for its test: the case worth protecting is a shot that THROWS with
 * the page still marked.
 */
export async function withGround<T>(
  page: Page,
  locator: Locator,
  ground: Ground,
  shoot: (omitBackground: boolean) => Promise<T>,
): Promise<T> {
  if (ground === "keep") return shoot(false)

  await locator.evaluate(
    (el, { attr, id, css }) => {
      for (let p = el.parentElement; p; p = p.parentElement) p.setAttribute(attr, "")
      const style = document.createElement("style")
      style.id = id
      style.textContent = css
      document.head.append(style)
    },
    { attr: GROUND_ATTR, id: GROUND_STYLE_ID, css: GROUND_CSS },
  )

  let outcome: { ok: true; value: T } | { ok: false; error: unknown }
  try {
    outcome = { ok: true, value: await shoot(true) }
  } catch (error) {
    outcome = { ok: false, error }
  }

  // Deliberately NOT `closeQuietly`. Every adapter extracts its element tree
  // from this page NEXT, so a revert that did not happen is not a spent
  // cleanup — it is `backgroundColor: transparent` on every ancestor in
  // `elements.json`, with a screenshot that looks perfect. That failure has to
  // be loud, and it outranks the shot's own error when both go wrong.
  await page.evaluate(
    ({ attr, id }) => {
      document.getElementById(id)?.remove()
      for (const el of document.querySelectorAll(`[${attr}]`)) el.removeAttribute(attr)
    },
    { attr: GROUND_ATTR, id: GROUND_STYLE_ID },
  )

  if (!outcome.ok) throw outcome.error
  return outcome.value
}

/**
 * Shoot one element, optionally keeping `bleed` px of whatever is painted around
 * it (a focus ring, an offset outline, a drop shadow) — the effectful half of
 * `--bleed`; `bleedClip` is the pure half and owns the clamping.
 *
 * With no bleed this is `locator.screenshot()`; with bleed it becomes a CLIPPED
 * page shot, which does not scroll for you,
 * so the element is scrolled into view and re-measured first. A locator with no
 * box (display:none, detached) falls back to the plain element shot rather than
 * inventing a clip — the caller's own blank-render check is what should speak.
 *
 * `ground` (default `transparent`) decides whether the paint BEHIND the node is
 * in the picture. **It is `keep`, not the no-bleed path, that reproduces the
 * pre-2026-09-10 shot byte for byte** — and it does so because `omitBackground`
 * is then omitted from the call rather than passed as `false`, so the request is
 * the one this adapter always made. (That sentence used to be attached to the
 * no-bleed path, where it stopped being true the moment a default ground
 * existed.)
 */
export async function shootElement(
  page: Page,
  locator: Locator,
  requested = 0,
  ground: Ground = DEFAULT_GROUND,
): Promise<{ png: Buffer; bleed: Bleed; stable: boolean }> {
  return withGround(page, locator, ground, async (omitBackground) => {
    const clear = omitBackground ? { omitBackground: true } : {}
    if (requested > 0) {
      await locator.scrollIntoViewIfNeeded().catch(() => undefined)
      const box = await locator.boundingBox()
      const size = page.viewportSize()
      if (box && size) {
        const { clip, bleed } = bleedClip(
          { x: box.x, y: box.y, w: box.width, h: box.height },
          requested,
          size,
        )
        const { png, stable } = await captureUntilStable(() =>
          page.screenshot({
            clip: { x: clip.x, y: clip.y, width: clip.w, height: clip.h },
            ...clear,
          }),
        )
        return { png, bleed, stable }
      }
    }
    const { png, stable } = await captureUntilStable(() => locator.screenshot({ ...clear }))
    return { png, bleed: NO_BLEED, stable }
  })
}

/** Waits for document.fonts.ready with a hard cap so a hung font fetch can't stall a run. */
export async function waitForFonts(page: Page, timeoutMs = 10_000): Promise<void> {
  await Promise.race([
    page.evaluate(() => document.fonts.ready.then(() => undefined)),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ])
}
