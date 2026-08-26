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

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Browser } from "playwright";

import type { Capture, CaptureError, DcHtmlSource } from "../pipeline.js";
import { err, ok, type Result } from "../result.js";
import {
  captureUntilStable,
  FREEZE_CSS,
  serveDir,
  waitForFonts,
} from "./browser.js";
import { extractElementTree } from "./extract.js";

/** Attribute-selector value: only the quote and the backslash need escaping. */
function attrValue(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** A frame is addressed by element id first, data-screen-label second. */
export function frameSelectors(frame: string): [string, string] {
  const value = attrValue(frame);
  return [`[id="${value}"]`, `[data-screen-label="${value}"]`];
}

const HYDRATION_TIMEOUT_MS = 8_000;
const DPR = 2;

export interface DcHtmlCaptureOptions {
  /** Where to write the frame screenshot. */
  pngPath: string;
  /** Provenance string for the capture/report; defaults to file#frame. */
  ref?: string;
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
  const identity = ref ?? `${source.file}#${source.frame}`;
  const server = await serveDir(source.dir);
  const viewportWidth = source.viewport?.width ?? 1440;
  const ctx = await browser.newContext({
    // Wider than the frame so the canvas never reflows the target frame.
    viewport: { width: viewportWidth + 120, height: source.viewport?.height ?? 1000 },
    deviceScaleFactor: DPR,
  });
  const page = await ctx.newPage();
  const url = `${server.origin}/${encodeURIComponent(source.file)}`;

  try {
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    } catch (e) {
      return err({
        kind: "navigation-failed",
        ref: identity,
        url,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // Fonts must be ready or serif text reflows after the shot.
    await waitForFonts(page);

    // Resolve the frame by id, then by screen label.
    let selector: string | null = null;
    for (const candidate of frameSelectors(source.frame)) {
      if ((await page.locator(candidate).count()) > 0) {
        selector = candidate;
        break;
      }
    }
    if (!selector) {
      return err({
        kind: "frame-not-found",
        ref: identity,
        frame: source.frame,
        file: source.file,
      });
    }

    // Hydration gate: template mustaches still present after the timeout
    // mean the dc-runtime never ran (offline, unpkg unreachable) — a typed
    // error, never a silent screenshot of the raw template.
    try {
      await page.waitForFunction(
        (sel: string) => {
          const el = document.querySelector(sel);
          if (!el) return false;
          return !/\{\{[^}]*\}\}/.test((el as HTMLElement).innerText);
        },
        selector,
        { timeout: HYDRATION_TIMEOUT_MS },
      );
    } catch {
      return err({
        kind: "hydration-failed",
        ref: identity,
        detail: `template mustaches still present in "${selector}" after ${HYDRATION_TIMEOUT_MS}ms — dc-runtime did not hydrate (network/CDN?)`,
      });
    }

    await page.addStyleTag({ content: FREEZE_CSS });

    const locator = page.locator(selector).first();
    await locator.scrollIntoViewIfNeeded();

    // Settle the pixels first, then extract, so the element tree describes
    // exactly the state the screenshot shows.
    const { png } = await captureUntilStable(() => locator.screenshot());

    const extraction = await extractElementTree(page, selector);
    if (!extraction) {
      return err({ kind: "frame-not-found", ref: identity, frame: source.frame, file: source.file });
    }
    if (extraction.elements.length === 0 || extraction.height < 8) {
      return err({
        kind: "blank-render",
        ref: identity,
        detail: `frame "${source.frame}" resolved but rendered no visible leaf elements (${extraction.width}x${extraction.height})`,
      });
    }

    await mkdir(dirname(pngPath), { recursive: true });
    await writeFile(pngPath, png);

    return ok({
      side: "design",
      source: "dc-html",
      ref: identity,
      pngPath,
      width: extraction.width,
      height: extraction.height,
      dpr: DPR,
      elements: extraction.elements,
    });
  } catch (e) {
    return err({
      kind: "capture-failed",
      ref: identity,
      detail: e instanceof Error ? e.message : String(e),
    });
  } finally {
    await ctx.close();
    await server.close();
  }
}
