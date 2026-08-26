/**
 * Manifest support (pure): the uctoinak `manifest.mjs` shape plus an
 * optional `ignore` policy per pair, turned into typed pair specs the CLI
 * can run. Loading the file is the CLI's effect; validating it is here.
 */

import type { DcHtmlSource, StorybookSource, Viewport } from "./pipeline.js";
import { err, ok, type Result } from "./result.js";
import type { IgnorePolicy } from "./types.js";

/** One runnable pair: a design frame against a storybook story. */
export interface PairSpec {
  id: string;
  title?: string;
  design: Omit<DcHtmlSource, "dir">;
  impl: Omit<StorybookSource, "url">;
  ignore?: IgnorePolicy;
}

export type ManifestError =
  | { kind: "not-an-array"; detail: string }
  | { kind: "invalid-entry"; index: number; detail: string };

export interface ManifestParse {
  pairs: PairSpec[];
  /** Entries this tool can't run yet (live app captures), with the reason. */
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

/**
 * Validate a loaded manifest value (the module's `manifest` or default
 * export). Storybook pairs become specs; live-app pairs are listed as
 * skipped rather than dropped.
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
    const design = entry["design"];
    const app = entry["app"];
    if (!isRecord(design) || typeof design["file"] !== "string" || typeof design["frame"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: `${id}: design needs { file, frame }` });
    }
    if (!isRecord(app) || typeof app["source"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: `${id}: app needs { source }` });
    }
    if (app["source"] !== "storybook") {
      skipped.push({ id, reason: `app.source "${app["source"]}" not supported yet (storybook only)` });
      continue;
    }
    if (typeof app["storyId"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: `${id}: storybook app needs storyId` });
    }
    const viewport = readViewport(app["viewport"]);
    const ignore = readPolicy(entry["ignore"]);
    const scope = ignore?.scope ?? (typeof design["scope"] === "string" ? design["scope"] : undefined);
    pairs.push({
      id,
      ...(typeof entry["title"] === "string" ? { title: entry["title"] } : {}),
      design: {
        kind: "dc-html",
        file: design["file"],
        frame: design["frame"],
        ...(scope !== undefined ? { scope } : {}),
        ...(viewport ? { viewport } : {}),
      },
      impl: {
        kind: "storybook",
        storyId: app["storyId"],
        ...(viewport ? { viewport } : {}),
        ...(app["overlay"] === true ? { overlay: true } : {}),
      },
      ...(ignore ? { ignore } : {}),
    });
  }
  return ok({ pairs, skipped });
}
