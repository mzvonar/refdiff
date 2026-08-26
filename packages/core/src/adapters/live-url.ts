/**
 * Live-URL implementation-side capture adapter (effectful edge).
 *
 * Authenticates the browser context (storage state or a session POST),
 * navigates, and — the part the old harness lacked — checks the CONTENT of
 * what arrived: a 4xx/5xx status, a redirect to a login page, or a 2xx
 * "page not found / something went wrong" page are typed CaptureErrors,
 * never a captured screenshot. Extraction reuses `extractElementTree`
 * (ink-box text measurement; overlays that portal to <body> are covered by
 * capturing the viewport when no `selector` is given).
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Browser, BrowserContext } from "playwright";

import type { Capture, CaptureError, LiveAuth, LiveUrlSource } from "../pipeline.js";
import { err, ok, type Result } from "../result.js";
import { captureUntilStable, FREEZE_CSS, waitForFonts } from "./browser.js";
import { extractElementTree } from "./extract.js";

const DPR = 2;
const NAV_TIMEOUT_MS = 30_000;
const SELECTOR_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------- pure -- */

export const LOGIN_PATH_RE = /\/(login|log-in|sign-?in|signin|auth|sso|onboarding)(\/|\?|$)/i;

const ERROR_TITLE_RE =
  /\b(404|not found|page not found|stránka sa nenašla|nenájden[áé]|something went wrong|niečo sa pokazilo|application error|internal server error|unexpected error|access denied|forbidden|unauthori[sz]ed)\b/i;

/** What the page contains, as far as error detection cares. */
export interface PageSignals {
  finalUrl: string;
  title: string;
  /** Text of the first h1/h2 (or the body's first 200 chars). */
  heading: string;
  /** Whole visible text, whitespace-collapsed. */
  bodyText: string;
  hasPasswordField: boolean;
}

export type PageVerdict =
  | { kind: "ok" }
  | { kind: "login"; finalUrl: string }
  | { kind: "error-page"; detail: string };

/**
 * Pure classification of a loaded page. A login page = a login-ish path, or
 * a password field on a page that is not the one we asked for. An error page
 * = an error phrase in the title/heading, or a very short body that is
 * mostly such a phrase (Next.js/Nuxt default error pages).
 */
export function classifyPage(requestedUrl: string, s: PageSignals): PageVerdict {
  const requestedPath = safePath(requestedUrl);
  const finalPath = safePath(s.finalUrl);
  if (LOGIN_PATH_RE.test(finalPath) && !LOGIN_PATH_RE.test(requestedPath)) {
    return { kind: "login", finalUrl: s.finalUrl };
  }
  if (s.hasPasswordField && finalPath !== requestedPath) return { kind: "login", finalUrl: s.finalUrl };

  const inTitle = ERROR_TITLE_RE.exec(s.title)?.[0];
  if (inTitle) return { kind: "error-page", detail: `title "${s.title}" (matched "${inTitle}")` };
  const inHeading = ERROR_TITLE_RE.exec(s.heading)?.[0];
  if (inHeading) return { kind: "error-page", detail: `heading "${s.heading.slice(0, 80)}" (matched "${inHeading}")` };
  if (s.bodyText.length < 300) {
    const inBody = ERROR_TITLE_RE.exec(s.bodyText)?.[0];
    if (inBody) return { kind: "error-page", detail: `near-empty page says "${s.bodyText.slice(0, 120)}"` };
  }
  return { kind: "ok" };
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/* ---------------------------------------------------------- effects -- */

export interface LiveUrlCaptureOptions {
  pngPath: string;
  ref?: string;
}

async function authenticate(ctx: BrowserContext, auth: LiveAuth | undefined): Promise<Result<void, string>> {
  if (!auth || auth.kind === "storage-state") return ok(undefined); // applied at context creation
  try {
    const res = await ctx.request.post(auth.url, {
      headers: { "content-type": "application/json", ...(auth.headers ?? {}) },
      data: auth.body ?? {},
    });
    if (!res.ok()) return err(`POST ${auth.url} → HTTP ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return ok(undefined);
  } catch (e) {
    return err(`POST ${auth.url} failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function captureLiveUrl(
  browser: Browser,
  source: LiveUrlSource,
  { pngPath, ref }: LiveUrlCaptureOptions,
): Promise<Result<Capture, CaptureError>> {
  const identity = ref ?? `live:${source.url}`;
  const viewport = source.viewport ?? { width: 1280, height: 900 };
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: DPR,
    ...(source.auth?.kind === "storage-state" ? { storageState: source.auth.path } : {}),
  });
  const page = await ctx.newPage();

  try {
    const authed = await authenticate(ctx, source.auth);
    if (!authed.ok) return err({ kind: "auth-failed", ref: identity, detail: authed.error });

    let status: number | undefined;
    try {
      const res = await page.goto(source.url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT_MS });
      status = res?.status();
    } catch (e) {
      const detail = e instanceof Error ? e.message : String(e);
      return err(
        /net::ERR_CONNECTION_REFUSED|ENOTFOUND|ECONNREFUSED/.test(detail)
          ? { kind: "unreachable", ref: identity, url: source.url, detail }
          : { kind: "navigation-failed", ref: identity, url: source.url, detail },
      );
    }
    if (status !== undefined && status >= 400) {
      return err({ kind: "http-error", ref: identity, url: source.url, status });
    }

    if (source.waitFor) {
      try {
        await page.waitForSelector(source.waitFor, { timeout: SELECTOR_TIMEOUT_MS });
      } catch {
        return err({ kind: "selector-not-found", ref: identity, selector: source.waitFor });
      }
    }

    // Content-level detection: what did we actually land on?
    const signals: PageSignals = await page.evaluate(() => ({
      finalUrl: location.href,
      title: document.title,
      heading: (document.querySelector("h1, h2, [role=heading]") as HTMLElement | null)?.innerText.trim() ?? "",
      bodyText: document.body.innerText.replace(/\s+/g, " ").trim(),
      hasPasswordField: document.querySelector('input[type="password"]') !== null,
    }));
    const verdict = classifyPage(source.url, signals);
    if (verdict.kind === "login") {
      return err({ kind: "login-redirect", ref: identity, url: source.url, finalUrl: verdict.finalUrl });
    }
    if (verdict.kind === "error-page") {
      return err({ kind: "error-page", ref: identity, url: source.url, detail: verdict.detail });
    }

    await waitForFonts(page);
    await page.addStyleTag({ content: FREEZE_CSS });

    const rootSelector = source.selector ?? "body";
    if (source.selector && (await page.locator(source.selector).count()) === 0) {
      return err({ kind: "selector-not-found", ref: identity, selector: source.selector });
    }

    // Settle pixels first, extract second (tree must describe the shot).
    let png: Buffer;
    if (source.selector) {
      const root = page.locator(source.selector).first();
      await root.scrollIntoViewIfNeeded();
      ({ png } = await captureUntilStable(() => root.screenshot()));
    } else {
      ({ png } = await captureUntilStable(() => page.screenshot({ fullPage: source.fullPage ?? false })));
    }

    const extraction = await extractElementTree(page, rootSelector, { viewportOrigin: !source.selector });
    if (!extraction || extraction.elements.length === 0 || extraction.height < 20) {
      return err({ kind: "blank-render", ref: identity, detail: `${source.url} rendered no visible leaf elements` });
    }

    await mkdir(dirname(pngPath), { recursive: true });
    await writeFile(pngPath, png);

    let width = extraction.width;
    let height = extraction.height;
    if (!source.selector) {
      width = viewport.width;
      height = source.fullPage ? await page.evaluate(() => document.documentElement.scrollHeight) : viewport.height;
    }

    return ok({
      side: "impl",
      source: "live-url",
      ref: identity,
      pngPath,
      width,
      height,
      dpr: DPR,
      elements: extraction.elements,
    });
  } catch (e) {
    return err({ kind: "capture-failed", ref: identity, detail: e instanceof Error ? e.message : String(e) });
  } finally {
    await ctx.close();
  }
}
