/**
 * Manifest support (pure): the uctoinak `manifest.mjs` shape plus an
 * optional `ignore` policy per pair, turned into typed pair specs the CLI
 * can run. Loading the file is the CLI's effect; validating it is here.
 *
 * Design entries: `{ file, frame, scope? }` (dc-html) or
 * `{ kind: "figma", fileKey, nodeId, scale?, version?, minQuality? }`.
 * App entries: `{ source: "storybook", storyId, overlay?, selector?, viewport? }` or
 * `{ source: "live", route | url, role?, viewport?, selector?, waitFor? }`.
 */

import type { DcHtmlSource, FigmaSource, LiveUrlSource, StorybookSource, Viewport } from "./pipeline.js";
import { err, ok, type Result } from "./result.js";
import type { IgnorePolicy } from "./types.js";

export type DesignSpec = Omit<DcHtmlSource, "dir"> | FigmaSource;

/** Live entries carry a route; the CLI supplies the origin (and auth). */
export interface LiveSpec extends Omit<LiveUrlSource, "url" | "auth"> {
  /** Absolute URL, or a path to prefix with the CLI's `--app-url`. */
  route: string;
  /** Auth role hint (the CLI's auth hook decides what it means). */
  role?: string;
}

export type ImplSpec = Omit<StorybookSource, "url"> | LiveSpec;

/** One runnable pair: a design frame against an implementation. */
export interface PairSpec {
  id: string;
  title?: string;
  design: DesignSpec;
  impl: ImplSpec;
  ignore?: IgnorePolicy;
}

export type ManifestError =
  | { kind: "not-an-array"; detail: string }
  | { kind: "invalid-entry"; index: number; detail: string };

export interface ManifestParse {
  pairs: PairSpec[];
  /** Entries this tool can't run, with the reason. */
  skipped: { id: string; reason: string }[];
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function readViewport(v: unknown): Viewport | undefined {
  if (!isRecord(v)) return undefined;
  const { width, height } = v;
  return typeof width === "number" && typeof height === "number" ? { width, height } : undefined;
}

function readPolicy(v: unknown): IgnorePolicy | undefined {
  if (!isRecord(v)) return undefined;
  const out: IgnorePolicy = {};
  if (Array.isArray(v["textPatterns"])) out.textPatterns = v["textPatterns"].map(String);
  if (Array.isArray(v["roles"])) out.roles = v["roles"].map(String);
  if (Array.isArray(v["regions"])) {
    out.regions = v["regions"].flatMap((r: unknown) =>
      isRecord(r) &&
      typeof r["x"] === "number" &&
      typeof r["y"] === "number" &&
      typeof r["w"] === "number" &&
      typeof r["h"] === "number"
        ? [{ x: r["x"], y: r["y"], w: r["w"], h: r["h"] }]
        : [],
    );
  }
  if (typeof v["scope"] === "string") out.scope = v["scope"];
  if (typeof v["dataSlots"] === "boolean") out.dataSlots = v["dataSlots"];
  return out;
}

function readDesign(
  design: unknown,
  scope: string | undefined,
  viewport: Viewport | undefined,
): Result<DesignSpec, string> {
  if (!isRecord(design)) return err("design must be an object");
  if (design["kind"] === "figma") {
    if (typeof design["fileKey"] !== "string" || typeof design["nodeId"] !== "string") {
      return err('figma design needs { kind: "figma", fileKey, nodeId }');
    }
    return ok({
      kind: "figma",
      fileKey: design["fileKey"],
      nodeId: design["nodeId"].replace("-", ":"),
      ...(typeof design["scale"] === "number" ? { scale: design["scale"] } : {}),
      ...(typeof design["version"] === "string" ? { version: design["version"] } : {}),
      ...(typeof design["minQuality"] === "number" ? { minQuality: design["minQuality"] } : {}),
    });
  }
  if (typeof design["file"] !== "string" || typeof design["frame"] !== "string") {
    return err('design needs { file, frame } or { kind: "figma", fileKey, nodeId }');
  }
  return ok({
    kind: "dc-html",
    file: design["file"],
    frame: design["frame"],
    ...(scope !== undefined ? { scope } : {}),
    ...(viewport ? { viewport } : {}),
  });
}

function readImpl(app: unknown, viewport: Viewport | undefined): Result<ImplSpec, string> {
  if (!isRecord(app) || typeof app["source"] !== "string") return err("app needs { source }");
  if (app["source"] === "storybook") {
    if (typeof app["storyId"] !== "string") return err("storybook app needs storyId");
    return ok({
      kind: "storybook",
      storyId: app["storyId"],
      ...(viewport ? { viewport } : {}),
      ...(app["overlay"] === true ? { overlay: true } : {}),
      ...(typeof app["selector"] === "string" ? { selector: app["selector"] } : {}),
    });
  }
  if (app["source"] === "live" || app["source"] === "live-url") {
    const route = app["route"] ?? app["url"];
    if (typeof route !== "string") return err("live app needs route (or url)");
    return ok({
      kind: "live-url",
      route,
      ...(typeof app["role"] === "string" ? { role: app["role"] } : {}),
      ...(viewport ? { viewport } : {}),
      ...(typeof app["selector"] === "string" ? { selector: app["selector"] } : {}),
      ...(typeof app["waitFor"] === "string" ? { waitFor: app["waitFor"] } : {}),
      ...(app["fullPage"] === true ? { fullPage: true } : {}),
    });
  }
  return err(`app.source "${String(app["source"])}" not supported (storybook | live)`);
}

/**
 * Validate a loaded manifest value (the module's `manifest` or default
 * export). Unsupported app sources are listed as skipped rather than dropped.
 */
export function parseManifest(raw: unknown): Result<ManifestParse, ManifestError> {
  if (!Array.isArray(raw)) {
    return err({ kind: "not-an-array", detail: `expected an array, got ${typeof raw}` });
  }
  const pairs: PairSpec[] = [];
  const skipped: ManifestParse["skipped"] = [];
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || typeof entry["id"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: "entry needs a string `id`" });
    }
    const id = entry["id"];
    const app = entry["app"];
    const viewport = isRecord(app) ? readViewport(app["viewport"]) : undefined;
    const ignore = readPolicy(entry["ignore"]);
    const design = entry["design"];
    const scope =
      ignore?.scope ?? (isRecord(design) && typeof design["scope"] === "string" ? design["scope"] : undefined);

    const d = readDesign(design, scope, viewport);
    if (!d.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${d.error}` });
    if (!isRecord(app) || typeof app["source"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: `${id}: app needs { source }` });
    }
    if (app["source"] !== "storybook" && app["source"] !== "live" && app["source"] !== "live-url") {
      skipped.push({ id, reason: `app.source "${String(app["source"])}" not supported (storybook | live)` });
      continue;
    }
    const i = readImpl(app, viewport);
    if (!i.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${i.error}` });

    pairs.push({
      id,
      ...(typeof entry["title"] === "string" ? { title: entry["title"] } : {}),
      design: d.value,
      impl: i.value,
      ...(ignore ? { ignore } : {}),
    });
  }
  return ok({ pairs, skipped });
}
