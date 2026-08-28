/**
 * Manifest support (pure): the uctoinak `manifest.mjs` shape plus an
 * optional `ignore` policy per pair, turned into typed pair specs the CLI
 * can run. Loading the file is the CLI's effect; validating it is here.
 *
 * Design entries: `{ file, frame, scope? }` (dc-html) or
 * `{ kind: "figma", fileKey, nodeId, scale?, version?, minQuality?, variants? }`
 * where `variants: { selector, maps?, only?, omit? }` expands a COMPONENT_SET.
 * App entries: `{ source: "storybook", storyId, overlay?, selector?, viewport? }` or
 * `{ source: "live", route | url, role?, viewport?, selector?, waitFor? }`.
 */

import type { VariantConfig } from "./adapters/figma-variants.js"
import type {
  DcHtmlSource,
  FigmaSource,
  LiveUrlSource,
  StorybookSource,
  Viewport,
} from "./pipeline.js"
import type { AcceptedDeviation, IgnorePolicy } from "./types.js"

import { err, ok, type Result } from "./result.js"

/**
 * A figma design may carry `variants`: the node is a COMPONENT_SET and the
 * CLI expands the entry into one pair per variant COMPONENT, each against
 * the story cell its selector template names (see adapters/figma-variants.ts).
 */
export type FigmaDesignSpec = FigmaSource & { variants?: VariantConfig }

export type DesignSpec = Omit<DcHtmlSource, "dir"> | FigmaDesignSpec

/** Live entries carry a route; the CLI supplies the origin (and auth). */
export interface LiveSpec extends Omit<LiveUrlSource, "url" | "auth"> {
  /** Absolute URL, or a path to prefix with the CLI's `--app-url`. */
  route: string
  /** Auth role hint (the CLI's auth hook decides what it means). */
  role?: string
}

export type ImplSpec = Omit<StorybookSource, "url"> | LiveSpec

/** One runnable pair: a design frame against an implementation. */
export interface PairSpec {
  id: string
  title?: string
  design: DesignSpec
  impl: ImplSpec
  ignore?: IgnorePolicy
}

export type ManifestError =
  | { kind: "not-an-array"; detail: string }
  | { kind: "invalid-entry"; index: number; detail: string }

export interface ManifestParse {
  pairs: PairSpec[]
  /** Entries this tool can't run, with the reason. */
  skipped: { id: string; reason: string }[]
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

function readViewport(v: unknown): Viewport | undefined {
  if (!isRecord(v)) return undefined
  const { width, height } = v
  return typeof width === "number" && typeof height === "number" ? { width, height } : undefined
}

function readPolicy(v: unknown): IgnorePolicy | undefined {
  if (!isRecord(v)) return undefined
  const out: IgnorePolicy = {}
  if (Array.isArray(v["textPatterns"])) out.textPatterns = v["textPatterns"].map(String)
  if (Array.isArray(v["roles"])) out.roles = v["roles"].map(String)
  if (Array.isArray(v["regions"])) {
    out.regions = v["regions"].flatMap((r: unknown) =>
      isRecord(r) &&
      typeof r["x"] === "number" &&
      typeof r["y"] === "number" &&
      typeof r["w"] === "number" &&
      typeof r["h"] === "number"
        ? [{ x: r["x"], y: r["y"], w: r["w"], h: r["h"] }]
        : [],
    )
  }
  if (typeof v["scope"] === "string") out.scope = v["scope"]
  if (typeof v["dataSlots"] === "boolean") out.dataSlots = v["dataSlots"]
  // Narrowed form: { dataSlots: { patterns: ["^\\d+,\\d{2}\\s*€$"] } } — only pairs
  // whose text still has one of these shapes on both sides count as data.
  else if (isRecord(v["dataSlots"]) && Array.isArray(v["dataSlots"]["patterns"])) {
    out.dataSlots = { patterns: v["dataSlots"]["patterns"].map(String) }
  }
  if (Array.isArray(v["accepted"]))
    out.accepted = v["accepted"].flatMap((a: unknown) => readAccepted(a) ?? [])
  return out
}

const isValues = (v: unknown): v is Record<string, string | number> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === "string" || typeof x === "number")

/** `{ type, role?, changeKind?, text?, expected?, actual?, reason }` — anything else is not an accepted deviation. */
export function readAccepted(a: unknown): AcceptedDeviation | undefined {
  if (!isRecord(a) || typeof a["type"] !== "string" || typeof a["reason"] !== "string")
    return undefined
  if (a["expected"] !== undefined && !isValues(a["expected"])) return undefined
  if (a["actual"] !== undefined && !isValues(a["actual"])) return undefined
  if (a["role"] !== undefined && typeof a["role"] !== "string") return undefined
  if (a["changeKind"] !== undefined && typeof a["changeKind"] !== "string") return undefined
  if (a["text"] !== undefined && typeof a["text"] !== "string") return undefined
  return {
    type: a["type"] as AcceptedDeviation["type"],
    ...(typeof a["role"] === "string" ? { role: a["role"] } : {}),
    ...(typeof a["changeKind"] === "string" ? { changeKind: a["changeKind"] } : {}),
    ...(typeof a["text"] === "string" ? { text: a["text"] } : {}),
    ...(isValues(a["expected"]) ? { expected: a["expected"] } : {}),
    ...(isValues(a["actual"]) ? { actual: a["actual"] } : {}),
    reason: a["reason"],
  }
}

const isStringMap = (v: unknown): v is Record<string, string> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === "string")

/** `variants: { selector, maps?, only?, omit? }`; absent → undefined; malformed → error. */
export function readVariants(v: unknown): Result<VariantConfig | undefined, string> {
  if (v === undefined) return ok(undefined)
  if (!isRecord(v) || typeof v["selector"] !== "string")
    return err("variants needs { selector: string }")
  const out: VariantConfig = { selector: v["selector"] }
  if (v["maps"] !== undefined) {
    if (!isRecord(v["maps"]) || !Object.values(v["maps"]).every(isStringMap)) {
      return err("variants.maps must be { name: { option: token } }")
    }
    out.maps = v["maps"] as Record<string, Record<string, string>>
  }
  if (v["only"] !== undefined) {
    if (
      !isRecord(v["only"]) ||
      !Object.values(v["only"]).every(
        (a) => Array.isArray(a) && a.every((x) => typeof x === "string"),
      )
    ) {
      return err("variants.only must be { property: [options] }")
    }
    out.only = v["only"] as Record<string, string[]>
  }
  if (v["omit"] !== undefined) {
    if (!Array.isArray(v["omit"]) || !v["omit"].every(isStringMap))
      return err("variants.omit must be [{ property: option }]")
    out.omit = v["omit"] as Record<string, string>[]
  }
  return ok(out)
}

function readDesign(
  design: unknown,
  scope: string | undefined,
  viewport: Viewport | undefined,
): Result<DesignSpec, string> {
  if (!isRecord(design)) return err("design must be an object")
  if (design["kind"] === "figma") {
    if (typeof design["fileKey"] !== "string" || typeof design["nodeId"] !== "string") {
      return err('figma design needs { kind: "figma", fileKey, nodeId }')
    }
    const variants = readVariants(design["variants"])
    if (!variants.ok) return err(variants.error)
    return ok({
      kind: "figma",
      fileKey: design["fileKey"],
      nodeId: design["nodeId"].replace("-", ":"),
      ...(typeof design["scale"] === "number" ? { scale: design["scale"] } : {}),
      ...(typeof design["version"] === "string" ? { version: design["version"] } : {}),
      ...(typeof design["minQuality"] === "number" ? { minQuality: design["minQuality"] } : {}),
      ...(variants.value !== undefined ? { variants: variants.value } : {}),
    })
  }
  if (typeof design["file"] !== "string" || typeof design["frame"] !== "string") {
    return err('design needs { file, frame } or { kind: "figma", fileKey, nodeId }')
  }
  return ok({
    kind: "dc-html",
    file: design["file"],
    frame: design["frame"],
    ...(scope !== undefined ? { scope } : {}),
    ...(viewport ? { viewport } : {}),
  })
}

function readImpl(app: unknown, viewport: Viewport | undefined): Result<ImplSpec, string> {
  if (!isRecord(app) || typeof app["source"] !== "string") return err("app needs { source }")
  if (app["source"] === "storybook") {
    if (typeof app["storyId"] !== "string") return err("storybook app needs storyId")
    return ok({
      kind: "storybook",
      storyId: app["storyId"],
      ...(viewport ? { viewport } : {}),
      ...(app["overlay"] === true ? { overlay: true } : {}),
      ...(typeof app["selector"] === "string" ? { selector: app["selector"] } : {}),
    })
  }
  if (app["source"] === "live" || app["source"] === "live-url") {
    const route = app["route"] ?? app["url"]
    if (typeof route !== "string") return err("live app needs route (or url)")
    return ok({
      kind: "live-url",
      route,
      ...(typeof app["role"] === "string" ? { role: app["role"] } : {}),
      ...(viewport ? { viewport } : {}),
      ...(typeof app["selector"] === "string" ? { selector: app["selector"] } : {}),
      ...(typeof app["waitFor"] === "string" ? { waitFor: app["waitFor"] } : {}),
      ...(app["fullPage"] === true ? { fullPage: true } : {}),
    })
  }
  return err(`app.source "${String(app["source"])}" not supported (storybook | live)`)
}

/**
 * Validate a loaded manifest value (the module's `manifest` or default
 * export). Unsupported app sources are listed as skipped rather than dropped.
 */
export function parseManifest(raw: unknown): Result<ManifestParse, ManifestError> {
  if (!Array.isArray(raw)) {
    return err({ kind: "not-an-array", detail: `expected an array, got ${typeof raw}` })
  }
  const pairs: PairSpec[] = []
  const skipped: ManifestParse["skipped"] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || typeof entry["id"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: "entry needs a string `id`" })
    }
    const id = entry["id"]
    const app = entry["app"]
    const viewport = isRecord(app) ? readViewport(app["viewport"]) : undefined
    const ignore = readPolicy(entry["ignore"])
    const design = entry["design"]
    const scope =
      ignore?.scope ??
      (isRecord(design) && typeof design["scope"] === "string" ? design["scope"] : undefined)

    const d = readDesign(design, scope, viewport)
    if (!d.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${d.error}` })
    if (!isRecord(app) || typeof app["source"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: `${id}: app needs { source }` })
    }
    if (app["source"] !== "storybook" && app["source"] !== "live" && app["source"] !== "live-url") {
      skipped.push({
        id,
        reason: `app.source "${String(app["source"])}" not supported (storybook | live)`,
      })
      continue
    }
    const i = readImpl(app, viewport)
    if (!i.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${i.error}` })

    pairs.push({
      id,
      ...(typeof entry["title"] === "string" ? { title: entry["title"] } : {}),
      design: d.value,
      impl: i.value,
      ...(ignore ? { ignore } : {}),
    })
  }
  return ok({ pairs, skipped })
}
