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
import { chromium, type Browser, type BrowserContext, type Page } from "playwright"

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

/** Waits for document.fonts.ready with a hard cap so a hung font fetch can't stall a run. */
export async function waitForFonts(page: Page, timeoutMs = 10_000): Promise<void> {
  await Promise.race([
    page.evaluate(() => document.fonts.ready.then(() => undefined)),
    new Promise<void>((r) => setTimeout(r, timeoutMs)),
  ])
}
