/**
 * Storybook implementation-side capture adapter (effectful edge).
 *
 * Opens the bare story iframe (`iframe.html?id=<storyId>&viewMode=story`),
 * waits for the story to actually mount, screenshots it and extracts the
 * DOM element tree.
 *
 * "Capture succeeded" means "a real component rendered": the Storybook
 * error overlay, an empty root, a blank render and a host still preparing
 * the story (Vite cold compile spinner) are typed CaptureErrors —
 * the documented 404-as-success failure of the old harness must be
 * impossible here.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Browser } from "playwright";

import type { Capture, CaptureError, StorybookSource } from "../pipeline.js";
import { err, ok, type Result } from "../result.js";
import {
  captureUntilStable,
  FREEZE_CSS,
  isReachable,
  waitForFonts,
} from "./browser.js";
import { extractElementTree } from "./extract.js";

const MOUNT_TIMEOUT_MS = 40_000;
const DPR = 2;
const ROOT = "#storybook-root";

export interface StorybookCaptureOptions {
  pngPath: string;
  ref?: string;
}

export async function captureStorybook(
  browser: Browser,
  source: StorybookSource,
  { pngPath, ref }: StorybookCaptureOptions,
): Promise<Result<Capture, CaptureError>> {
  const identity = ref ?? `storybook:${source.storyId}`;
  const url = `${source.url}/iframe.html?id=${encodeURIComponent(source.storyId)}&viewMode=story`;

  if (!(await isReachable(source.url))) {
    return err({
      kind: "unreachable",
      ref: identity,
      url: source.url,
      detail: "Storybook not reachable — is it running?",
    });
  }

  const viewport = source.viewport ?? { width: 1200, height: 900 };
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: DPR });
  const page = await ctx.newPage();

  try {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    } catch (e) {
      return err({
        kind: "navigation-failed",
        ref: identity,
        url,
        detail: e instanceof Error ? e.message : String(e),
      });
    }

    // Vite compiles the story on first request — wait until it mounts for
    // real (or the error overlay claims the page). While preparing, Storybook
    // sets `sb-show-preparing-story` on <body> and shows its own
    // `.sb-preparing-story > .sb-loader` spinner beside the root: that is
    // host chrome, never story content (a cold start once passed the spinner
    // off as a mounted overlay — 1 leaf element, everything "missing").
    const isPreparing = (): Promise<boolean> =>
      page.evaluate(
        () =>
          document.body.classList.contains("sb-show-preparing-story") ||
          document.body.classList.contains("sb-show-preparing-docs"),
      );
    try {
      await page.waitForFunction(
        (overlay: boolean) => {
          const body = document.body;
          if (body.classList.contains("sb-show-errordisplay")) return true;
          if (
            body.classList.contains("sb-show-preparing-story") ||
            body.classList.contains("sb-show-preparing-docs")
          ) {
            return false;
          }
          const root = document.getElementById("storybook-root");
          if (!overlay)
            return !!root && root.children.length > 0 && root.getBoundingClientRect().height > 20;
          // Overlay stories portal the dialog to <body> — a mounted root is
          // NOT enough (the portal opens a tick later); wait for visible
          // content beside the root that is not Storybook's own chrome. The
          // portal wrapper itself is 0px tall (its children are fixed-
          // positioned), so look at descendants, not just the wrapper.
          const visible = (el: Element): boolean => {
            const r = el.getBoundingClientRect();
            return r.width > 20 && r.height > 20;
          };
          return Array.from(body.children).some((el) => {
            if (el === root || el.tagName === "SCRIPT" || el.tagName === "STYLE") return false;
            if (/(^|\s)sb-/.test(el.className)) return false;
            return visible(el) || Array.from(el.querySelectorAll("*")).some(visible);
          });
        },
        source.overlay ?? false,
        { timeout: MOUNT_TIMEOUT_MS },
      );
    } catch {
      const preparing = await isPreparing().catch(() => false);
      return err(
        preparing
          ? {
              kind: "still-loading",
              ref: identity,
              detail: `Storybook was still preparing "${source.storyId}" after ${MOUNT_TIMEOUT_MS}ms (cold Vite compile?) — retry once it is warm`,
            }
          : {
              kind: "blank-render",
              ref: identity,
              detail: `story "${source.storyId}" did not mount within ${MOUNT_TIMEOUT_MS}ms (no content, no error overlay)`,
            },
      );
    }

    // A story that failed to load leaves the error overlay on <body>.
    if ((await page.locator("body.sb-show-errordisplay").count()) > 0) {
      const overlayText = await page
        .evaluate(() => document.body.innerText.replace(/\s+/g, " ").trim().slice(0, 400))
        .catch(() => "");
      return err({
        kind: "story-error",
        ref: identity,
        storyId: source.storyId,
        detail: overlayText || "Storybook error overlay shown",
      });
    }

    await waitForFonts(page);
    await page.addStyleTag({ content: FREEZE_CSS });

    // Overlay stories (dialog/sheet) portal their content to <body>, outside
    // #storybook-root — extract and shoot the whole viewport.
    // Settle the pixels FIRST, extract SECOND: the element tree must
    // describe the same state the screenshot shows.
    // A `selector` narrows the capture to one node inside the story (a cell
    // of a variant matrix) — the same contract as the live-url adapter.
    if (source.selector !== undefined && (await page.locator(source.selector).count()) === 0) {
      return err({ kind: "selector-not-found", ref: identity, selector: source.selector });
    }
    const rootSelector = source.selector ?? (source.overlay ? "body" : ROOT);
    const viewportOrigin = source.selector === undefined && (source.overlay ?? false);
    let png: Buffer;
    if (viewportOrigin) {
      ({ png } = await captureUntilStable(() => page.screenshot()));
    } else {
      const root = page.locator(rootSelector).first();
      ({ png } = await captureUntilStable(() => root.screenshot()));
    }

    const extraction = await extractElementTree(page, rootSelector, { viewportOrigin });
    if (!extraction || extraction.elements.length === 0 || extraction.height < 20) {
      return err({
        kind: "blank-render",
        ref: identity,
        detail: `story "${source.storyId}" mounted but rendered no visible leaf elements`,
      });
    }

    await mkdir(dirname(pngPath), { recursive: true });
    // For overlay shots the png is the viewport, not the (possibly taller) body.
    const width = viewportOrigin ? viewport.width : extraction.width;
    const height = viewportOrigin ? viewport.height : extraction.height;
    await writeFile(pngPath, png);

    return ok({
      side: "impl",
      source: "storybook",
      ref: identity,
      pngPath,
      width,
      height,
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
  }
}
