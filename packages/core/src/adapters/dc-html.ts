/**
 * Claude Design `.dc.html` capture adapter (effectful edge).
 *
 * Serves the comp directory over http, lets the dc-runtime hydrate (React
 * from unpkg), addresses a frame by element id falling back to
 * data-screen-label, then screenshots the frame AND extracts its DOM
 * element tree — the canvas is HTML, so this is the richest ref source.
 *
 * Degraded input hard-stops: unresolved frame, unhydrated mustaches or an
 * empty render is a typed CaptureError, never a "successful" screenshot
 * (the old uctoinak harness shipped exactly that failure).
 */

import type { Capture, CaptureError, DcHtmlSource } from "../pipeline.js"
import type { CaptureScope } from "../types.js"
import type { Browser, Page } from "playwright"

import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { err, ok, type Result } from "../result.js"
import {
  captureUntilStable,
  closeQuietly,
  FREEZE_CSS,
  openPage,
  serveDir,
  waitForFonts,
} from "./browser.js"
import { extractElementTree } from "./extract.js"
import { CANVAS_SLACK, isFluidFrame, pickLargestChild, type ScopeCandidate } from "./scope.js"

/**
 * Resolve the node to capture inside the frame, in priority order:
 *
 *  1. an explicit selector (typed error when it matches nothing),
 *  2. the element carrying `data-screen-label` — the comp author's own
 *     "this is the screen" marker, which sits either on the frame or on its
 *     single child depending on how the comp was written,
 *  3. the largest direct child by area,
 *  4. the frame itself when nothing is big enough to be UI.
 *
 * (2) exists because (3) cannot tell "the frame WRAPS the screen" from "the
 * frame IS the screen": on the latter it descends one level too far and keeps
 * only the biggest column. On uctoinak's set that silently cropped the app's
 * 232px sidebar out of three desktop comps — the design pane simply had no
 * sidebar, and every element to its right was offset by a third of the frame.
 * The chosen node is tagged with `data-vc-scope` so a stable selector
 * addresses it afterwards.
 */
export async function resolveScope(
  page: Page,
  frameSelector: string,
  scope: string | undefined,
): Promise<Result<CaptureScope, "scope-not-found">> {
  if (scope !== undefined) {
    const selector = `${frameSelector} ${scope}`
    if ((await page.locator(selector).count()) === 0) return err("scope-not-found")
    await page
      .locator(selector)
      .first()
      .evaluate((el) => el.setAttribute("data-vc-scope", ""))
    return ok({ mode: "explicit", selector: `${frameSelector} [data-vc-scope]` })
  }

  // The screen marker beats the area heuristic: it is authored, not inferred.
  const labelled = await page.evaluate((sel: string) => {
    const frame = document.querySelector(sel)
    if (!frame) return "none"
    if (frame.hasAttribute("data-screen-label")) return "frame"
    const inner = frame.querySelectorAll("[data-screen-label]")
    // Two labelled screens in one frame is ambiguous — let the area rule decide.
    return inner.length === 1 ? "descendant" : "none"
  }, frameSelector)
  if (labelled === "frame") {
    return ok({ mode: "screen-label", selector: frameSelector })
  }
  if (labelled === "descendant") {
    await page
      .locator(`${frameSelector} [data-screen-label]`)
      .first()
      .evaluate((el) => el.setAttribute("data-vc-scope", ""))
    return ok({ mode: "screen-label", selector: `${frameSelector} [data-vc-scope]` })
  }

  const candidates: ScopeCandidate[] = await page.evaluate((sel: string) => {
    const frame = document.querySelector(sel)
    if (!frame) return []
    return Array.from(frame.children).flatMap((child, index) => {
      const tag = child.tagName.toLowerCase()
      if (tag === "script" || tag === "style" || tag === "template") return []
      const r = child.getBoundingClientRect()
      return [{ index, w: r.width, h: r.height }]
    })
  }, frameSelector)

  const best = pickLargestChild(candidates)
  if (!best) return ok({ mode: "frame", selector: frameSelector, candidates: candidates.length })

  await page.evaluate(
    ({ sel, index }: { sel: string; index: number }) => {
      document.querySelector(sel)?.children[index]?.setAttribute("data-vc-scope", "")
    },
    { sel: frameSelector, index: best.index },
  )
  return ok({
    mode: "largest-child",
    selector: `${frameSelector} > [data-vc-scope]`,
    candidates: candidates.length,
  })
}

/** Attribute-selector value: only the quote and the backslash need escaping. */
function attrValue(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

/** A frame is addressed by element id first, data-screen-label second. */
export function frameSelectors(frame: string): [string, string] {
  const value = attrValue(frame)
  return [`[id="${value}"]`, `[data-screen-label="${value}"]`]
}

const HYDRATION_TIMEOUT_MS = 8_000
const DPR = 2

export interface DcHtmlCaptureOptions {
  /** Where to write the frame screenshot. */
  pngPath: string
  /** Provenance string for the capture/report; defaults to file#frame. */
  ref?: string
}

/**
 * Capture one frame of a `.dc.html` canvas: screenshot + element tree.
 * The caller owns the browser (so a run reuses one instance across sides).
 */
export async function captureDcHtml(
  browser: Browser,
  source: DcHtmlSource,
  { pngPath, ref }: DcHtmlCaptureOptions,
): Promise<Result<Capture, CaptureError>> {
  const identity = ref ?? `${source.file}#${source.frame}`
  const server = await serveDir(source.dir)
  const viewportWidth = source.viewport?.width ?? 1440
  // Wider than the frame so the canvas never reflows a FIXED frame; a fluid frame
  // is detected after hydration and the window snapped back to the exact viewport.
  const canvas = { width: viewportWidth + CANVAS_SLACK, height: source.viewport?.height ?? 1000 }
  let fluid = false
  const opened = await openPage(browser, {
    viewport: canvas,
    deviceScaleFactor: DPR,
  })
  if ("error" in opened) {
    // The static server is already up; releasing its port is this path's job.
    await closeQuietly(() => server.close())
    return err({ kind: "capture-failed", ref: identity, detail: opened.error })
  }
  const { ctx, page } = opened
  const url = `${server.origin}/${encodeURIComponent(source.file)}`

  // Load, wait for fonts, find the frame, gate on hydration. Called twice for
  // a fluid comp: once on the slack canvas (to learn it is fluid), then again
  // at the exact pair viewport — see below.
  const load = async (): Promise<Result<string, CaptureError>> => {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 })
    } catch (e) {
      return err({
        kind: "navigation-failed",
        ref: identity,
        url,
        detail: e instanceof Error ? e.message : String(e),
      })
    }

    // Fonts must be ready or serif text reflows after the shot.
    await waitForFonts(page)

    // Resolve the frame by id, then by screen label.
    let selector: string | null = null
    for (const candidate of frameSelectors(source.frame)) {
      if ((await page.locator(candidate).count()) > 0) {
        selector = candidate
        break
      }
    }
    if (!selector) {
      return err({
        kind: "frame-not-found",
        ref: identity,
        frame: source.frame,
        file: source.file,
      })
    }

    // Hydration gate: template mustaches still present after the timeout
    // mean the dc-runtime never ran (offline, unpkg unreachable) — a typed
    // error, never a silent screenshot of the raw template.
    try {
      await page.waitForFunction(
        (sel: string) => {
          const el = document.querySelector(sel)
          if (!el) return false
          return !/\{\{[^}]*\}\}/.test((el as HTMLElement).innerText)
        },
        selector,
        { timeout: HYDRATION_TIMEOUT_MS },
      )
    } catch {
      return err({
        kind: "hydration-failed",
        ref: identity,
        detail: `template mustaches still present in "${selector}" after ${HYDRATION_TIMEOUT_MS}ms — dc-runtime did not hydrate (network/CDN?)`,
      })
    }
    return ok(selector)
  }

  try {
    const first = await load()
    if (!first.ok) return first
    let selector = first.value

    // A fluid comp (full-bleed page, no fixed frame size) has grown into the
    // canvas slack and is now CANVAS_SLACK wider than the impl viewport. Snap
    // the window to the pair's exact viewport so both sides render at the same
    // width and height — and RELOAD there, not just resize: a comp's own
    // mount-time logic (a canvas that fits its artboard once, on load) has
    // already run against the slack width, and a resize alone leaves its
    // layout where a 120px-wider window put it (the RefDiff Comparison Tool
    // measured its zoom at 75% against the app's 67% for exactly that reason).
    const frameWidth = await page
      .locator(selector)
      .first()
      .evaluate((el) => el.getBoundingClientRect().width)
    fluid = isFluidFrame(frameWidth, canvas.width)
    if (fluid && source.viewport) {
      await page.setViewportSize({ width: source.viewport.width, height: source.viewport.height })
      const second = await load()
      if (!second.ok) return second
      selector = second.value
    }

    await page.addStyleTag({ content: FREEZE_CSS })

    // Scope: the component inside the artboard, not the artboard.
    const scoped = await resolveScope(page, selector, source.scope)
    if (!scoped.ok) {
      return err({
        kind: "scope-not-found",
        ref: identity,
        frame: source.frame,
        scope: source.scope ?? "",
      })
    }
    const scope: CaptureScope = fluid ? { ...scoped.value, fluid: true } : scoped.value

    const locator = page.locator(scope.selector).first()
    await locator.scrollIntoViewIfNeeded()

    // Settle the pixels first, then extract, so the element tree describes
    // exactly the state the screenshot shows.
    const { png } = await captureUntilStable(() => locator.screenshot())

    const extraction = await extractElementTree(page, scope.selector)
    if (!extraction) {
      return err({ kind: "frame-not-found", ref: identity, frame: source.frame, file: source.file })
    }
    if (extraction.elements.length === 0 || extraction.height < 8) {
      return err({
        kind: "blank-render",
        ref: identity,
        detail: `frame "${source.frame}" scope "${scope.selector}" (${scope.mode}${scope.fluid ? ", fluid frame" : ""}) rendered no visible leaf elements (${extraction.width}x${extraction.height})`,
      })
    }

    await mkdir(dirname(pngPath), { recursive: true })
    await writeFile(pngPath, png)

    return ok({
      side: "design",
      source: "dc-html",
      ref: identity,
      pngPath,
      width: extraction.width,
      height: extraction.height,
      dpr: DPR,
      elements: extraction.elements,
      scope,
    })
  } catch (e) {
    return err({
      kind: "capture-failed",
      ref: identity,
      detail: e instanceof Error ? e.message : String(e),
    })
  } finally {
    // Independently guarded: an unguarded ctx.close() throw would also skip
    // server.close(), leaking the static server's port for the rest of the run.
    await closeQuietly(() => ctx.close())
    await closeQuietly(() => server.close())
  }
}
