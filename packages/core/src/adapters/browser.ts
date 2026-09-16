/**
 * Shared browser/network plumbing for capture adapters (effectful edge).
 *
 * `.dc.html` canvases render with full fidelity only when the dc-runtime
 * can load React from unpkg, so the browser needs network access and the
 * files must be served over http (file:// breaks the runtime's fetch).
 */

import type { Bleed } from "../types.js"
import type { AddressInfo } from "node:net"

import { readFile } from "node:fs/promises"
import http from "node:http"
import { extname, join, normalize, resolve, sep } from "node:path"
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright"

import { bleedClip, NO_BLEED } from "../geometry.js"
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
  // `null`, not `undefined`, is how a caller asks for a LIVE clock: an explicitly
  // passed `undefined` re-triggers a default parameter, so the escape hatch would
  // silently do nothing. A test pins that.
  fixedTime: Date | null = FROZEN_CLOCK,
): Promise<{ ctx: BrowserContext; page: Page } | { error: string }> {
  try {
    // Pinned the same way and for the same reason as the clock below: a
    // capture parameter the HOST decides is not a measurement parameter.
    // Caller-supplied values win — a pair whose comp is drawn for another
    // market sets its own on the manifest entry.
    const ctx = await browser.newContext({
      ...options,
      timezoneId: options?.timezoneId ?? CAPTURE_TIMEZONE,
      locale: options?.locale ?? CAPTURE_LOCALE,
    })
    const page = await ctx.newPage()
    // Before the caller navigates — every adapter opens its page here and goes
    // to the URL afterwards, which is what makes this the one site that cannot
    // be forgotten.
    if (fixedTime !== null) await page.clock.setFixedTime(fixedTime)
    return { ctx, page }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * The instant every capture believes it is, so a surface that renders RELATIVE
 * TIME renders the same thing tomorrow. Time is frozen for the same reason
 * `FREEZE_CSS` below freezes animation: a capture that moves on its own is not
 * a measurement.
 *
 * Measured 2026-09-16, and this is why it exists: `refdiff-library-groups-desktop`
 * went `matched` 197 → 196 and 560 → 561 findings **overnight, with nothing
 * edited**. That corpus's implementation is the annotator serving
 * `fixtures/demo-root`, whose Library page prints the AGE of the runs it holds;
 * midnight turned `20 d ago` into `19 d ago`, the narrower label reflowed its
 * row, two elements moved ~13 px and one pairing was lost. The uctoinak2 pairs
 * have the same shape (`"August 2026 · uzávierka o 9 dní"`).
 *
 * That is exactly the signature `docs/plan-divergent-matching.md` step 2 calls a
 * REGRESSION — `matched` falling while `d-only`/`i-only` rise — manufactured by
 * the calendar. A guard that produces it on its own teaches a reader to explain
 * the real thing away.
 *
 * **`ignore.textPatterns` is not an alternative and must not be offered as one.**
 * Policy runs long after matching (`cli.ts`: match ~556, `applyPolicy` ~643) and
 * `matchingStats` reads the RAW match result, so an ignore rule hides the finding
 * about `19 d ago` while the reflow still costs the pairing.
 *
 * `setFixedTime` rather than `clock.install`: it pins what `Date.now()` and
 * `new Date()` READ while leaving timers running, so a page that polls, animates
 * or debounces still behaves — only its rendered dates stop moving.
 *
 * **The instant is 2026-09-15T12:00:00Z because that is the day
 * `docs/baseline-matching-2026-09-15.md` was measured**, so the committed
 * baseline stays the reproducible one. It is deliberately NOT tuned to whatever
 * makes a comp agree: picking the instant to minimise findings would be cooking
 * the measurement this workstream exists to keep honest. Changing it re-dates
 * every pair at once, so it is a re-baseline, never a tweak.
 */
export const FROZEN_CLOCK = new Date("2026-09-15T12:00:00Z")

/**
 * The zone and locale every capture renders in, unless a pair says otherwise.
 *
 * `FROZEN_CLOCK` above freezes WHEN a capture believes it is. These freeze the
 * two things that decide what that instant LOOKS LIKE. Without them the clock is
 * pinned for reproducibility while the zone rendering it is an accident of the
 * machine — a comp compared in Bratislava and the same comp compared on a UTC CI
 * box disagree by two hours on every timestamp, with nothing in the report saying
 * so and a `matched` drop that reads exactly like a regression (see FROZEN_CLOCK
 * for the measured version of that failure: `20 d ago` → `19 d ago` cost a
 * pairing overnight). For any app that localises dates, and `uctoinak2`'s whole
 * corpus does, the captured zone is a measurement parameter exactly as the
 * viewport is.
 *
 * UTC and en-US specifically, and for the same reason the frozen instant is the
 * day a baseline was measured rather than whatever makes a comp agree: they are
 * what an unconfigured Linux capture box already produces, so pinning them moves
 * no existing measurement (verified 2026-09-16 on the devbox — a default context
 * and a pinned one returned identical `navigator.language`, `navigator.languages`,
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` and `toLocaleString()`). The
 * change is that ANOTHER machine now measures the same thing. Picking a market
 * zone as the default would be choosing one corpus's answer for every corpus.
 *
 * A pair whose comp is drawn for a market overrides both on its manifest entry
 * (`timezoneId` / `locale`, see `configuring.md`), which is the level that can
 * know: it is a property of the COMPONENT's data, not of the machine.
 *
 * Changing either of these re-dates every pair at once, so it is a re-baseline,
 * never a tweak.
 */
export const CAPTURE_TIMEZONE = "UTC"
export const CAPTURE_LOCALE = "en-US"

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
