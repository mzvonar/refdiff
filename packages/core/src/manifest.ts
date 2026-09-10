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
 *
 * An entry may also declare where it BELONGS and how its cells lay out:
 * `section: "Core components/Buttons"` (a flat path, never a nested tree) and
 * `gallery: { columns?, rows?, order?, labels? }` for a variant set. The
 * module's optional second export `sections` carries order and labels for
 * those paths — see `readSections`.
 */

import type { GalleryConfig, VariantConfig } from "./adapters/figma-variants.js"
import type {
  DcHtmlSource,
  FigmaSource,
  LiveUrlSource,
  StorybookSource,
  Viewport,
} from "./pipeline.js"
import type {
  AcceptedDeviation,
  Box,
  ContentsOfRule,
  ExplainRule,
  FindingType,
  IgnorePolicy,
  TextPattern,
} from "./types.js"

import { err, ok, type Result } from "./result.js"
import { readGround, type Ground } from "./adapters/ground.js"
import { readSteps } from "./adapters/steps.js"

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
  /**
   * Where this entry belongs in the library's hierarchy — a normalized
   * section path (`"Core components/Buttons"`). Absent means unplaced, which
   * is not an error: hierarchy is opt-in per entry.
   */
  section?: string
  /** Grid layout for a variant SET's cells. Only ever set on a set entry. */
  gallery?: GalleryConfig
  /**
   * CSS px of margin to capture around BOTH sides' nodes, so paint outside the
   * box — a focus ring, an offset outline, a drop shadow — is in the picture.
   * Per entry because it is a property of the COMPONENT, not of one side: a
   * button with a focus ring has one on both sides or the pair is the finding.
   *
   * Entry-level is the ONLY level this parser reads. `DesignSpec` / `ImplSpec`
   * each carry a `bleed` that wins for their side, and nothing here populates
   * it — that override reaches a `PairSpec` built in code, never a manifest.
   *
   * **A Figma design reads it as a switch, not a distance.** The `/images`
   * endpoint takes no margin, offering the node's box or everything it paints
   * and nothing between, so any positive value means "render the node's own
   * render bounds" and the margin obtained is whatever the node has — recorded
   * per side on the capture, which is what every consumer of the PNG reads.
   * (This said "Figma ignores it" until design-side bleed landed; a pair whose
   * Figma node paints a ring outside its frame now captures it.)
   */
  bleed?: number
  /**
   * What BOTH sides do with the paint behind their node — `transparent`
   * (default) or `keep`. Per entry for the same reason as `bleed`: it is a
   * property of the COMPONENT, and a pair that neutralises one side's ground
   * and keeps the other's has re-created the asymmetry the option exists to
   * remove. Figma needs nothing: its export is ancestry-free already, which is
   * the behaviour this makes true of the browser sides. See `adapters/ground.ts`.
   */
  ground?: Ground
}

/**
 * A pair kept in the manifest but NOT measured — `disabled: "<why>"`.
 *
 * The case it exists for: a comp is superseded by a rebuild, so its pair now
 * measures the new surface against the old design and reports hundreds of
 * findings that mean nothing. Deleting the pair loses the declaration and the
 * comp's linkage; leaving it enabled trains a reader to ignore a number. This
 * is the third option — the declaration survives, nothing runs, and re-enabling
 * is deleting one key.
 *
 * **The reason is REQUIRED and `disabled: true` is refused.** A pair silently
 * not running is the worst failure this tool has (a comp with no pair reports
 * its drift nowhere), so the one thing a disabled pair must carry is why. Same
 * call as `gallery`'s empty `{}`: refused where the message can name the entry.
 *
 * It is read EARLY, before the design and impl specs are validated, so a
 * disabled pair whose impl spec has rotted does not fail the whole manifest for
 * a pair nobody runs. The consequence, stated: a typo inside a disabled entry
 * is not found until it is re-enabled. Its `design.file` is still linked,
 * because `pair-coverage` reads the raw module rather than this parse — a
 * disabled pair keeps its comp OUT of `unpaired` and puts it in `unmeasured`.
 */
export function readDisabled(raw: unknown): Result<string | undefined, string> {
  if (raw === undefined || raw === false) return ok(undefined)
  if (typeof raw !== "string") {
    return err(
      `disabled must be the REASON as a string (got ${typeof raw}) — a pair that silently does not run is the one failure that reports itself nowhere`,
    )
  }
  const reason = raw.trim()
  if (reason === "") return err("disabled needs a non-empty reason")
  return ok(reason)
}

export type ManifestError =
  | { kind: "not-an-array"; detail: string }
  | { kind: "invalid-entry"; index: number; detail: string }
  /** The module's `sections` export, which is not indexed by entry. */
  | { kind: "invalid-sections"; detail: string }

export interface ManifestParse {
  pairs: PairSpec[]
  /** Entries this tool can't run, with the reason. */
  skipped: { id: string; reason: string }[]
  /**
   * The declared section metadata, in DECLARATION ORDER — that order IS the
   * order, which is why there is no `order` field to fall out of sync with
   * it. `[]` when the manifest declares none.
   */
  sections: SectionMeta[]
}

/**
 * One node of the library hierarchy: its path, and optionally the label to
 * draw instead of the path's last segment.
 *
 * A path with NO entries is valid and deliberate — a pure grouping node, the
 * `Foundations` row in the comps: hierarchy only, nothing measured. So this
 * list is never cross-checked against the entries; an undeclared path is
 * equally valid and simply carries no label.
 */
export interface SectionMeta {
  path: string
  label?: string
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
  if (Array.isArray(v["textPatterns"])) {
    // Both shapes: "^Foo$" and { pattern: "^Foo$", role: "text" }.
    out.textPatterns = v["textPatterns"].flatMap((t: unknown): TextPattern[] => {
      if (typeof t === "string") return [t]
      if (isRecord(t) && typeof t["pattern"] === "string") {
        const types = Array.isArray(t["types"]) ? (t["types"].map(String) as FindingType[]) : undefined
        return [
          {
            pattern: t["pattern"],
            ...(typeof t["role"] === "string" ? { role: t["role"] } : {}),
            ...(types !== undefined ? { types } : {}),
          },
        ]
      }
      return []
    })
  }
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
  if (Array.isArray(v["contentsOf"]))
    out.contentsOf = v["contentsOf"].flatMap((c: unknown) => readContentsOf(c) ?? [])
  if (Array.isArray(v["explain"]))
    out.explain = v["explain"].flatMap((e: unknown) => readExplain(e) ?? [])
  return out
}

/**
 * `{ types, cause, reason, region? | within? }` — `types` non-empty and one of the two region forms
 * required. A rule with no region would explain a cause everywhere on the page, which is the shape
 * that turns an explanation into a blanket excuse.
 */
const readBox = (v: unknown): Box | undefined =>
  isRecord(v) &&
  typeof v["x"] === "number" &&
  typeof v["y"] === "number" &&
  typeof v["w"] === "number" &&
  typeof v["h"] === "number"
    ? { x: v["x"], y: v["y"], w: v["w"], h: v["h"] }
    : undefined

export function readExplain(e: unknown): ExplainRule | undefined {
  if (!isRecord(e) || typeof e["cause"] !== "string" || typeof e["reason"] !== "string")
    return undefined
  const types = e["types"]
  if (!Array.isArray(types) || types.length === 0 || types.some((t) => typeof t !== "string"))
    return undefined
  const region = isRecord(e["region"]) ? readBox(e["region"]) : undefined
  const within =
    isRecord(e["within"]) && typeof e["within"]["role"] === "string"
      ? { role: e["within"]["role"] }
      : undefined
  if (region === undefined && within === undefined) return undefined
  if (e["text"] !== undefined && typeof e["text"] !== "string") return undefined
  return {
    types: types as ExplainRule["types"],
    ...(region ? { region } : {}),
    ...(within ? { within } : {}),
    ...(typeof e["text"] === "string" ? { text: e["text"] } : {}),
    cause: e["cause"],
    reason: e["reason"],
  }
}

/**
 * `{ role, types, reason }` — every field required, and `types` non-empty. An unscoped rule would
 * forgive its container's whole interior, which is the one thing this rule must not do: the type
 * scope is the argument for why the contents belong to the container (see `ContentsOfRule`).
 * A malformed entry is DROPPED like a malformed `accepted` one, and the run then reports what the
 * rule would have excused — loud rather than silent.
 */
export function readContentsOf(c: unknown): ContentsOfRule | undefined {
  if (!isRecord(c) || typeof c["role"] !== "string" || typeof c["reason"] !== "string")
    return undefined
  const types = c["types"]
  if (!Array.isArray(types) || types.length === 0 || types.some((t) => typeof t !== "string"))
    return undefined
  return {
    role: c["role"],
    types: types as ContentsOfRule["types"],
    reason: c["reason"],
  }
}

const isValues = (v: unknown): v is Record<string, string | number> =>
  isRecord(v) && Object.values(v).every((x) => typeof x === "string" || typeof x === "number")

/** `{ type, role?, changeKind?, text?, expected?, actual?, contents?, reason }` — anything else is not an accepted deviation. */
export function readAccepted(a: unknown): AcceptedDeviation | undefined {
  if (!isRecord(a) || typeof a["type"] !== "string" || typeof a["reason"] !== "string")
    return undefined
  if (a["expected"] !== undefined && !isValues(a["expected"])) return undefined
  if (a["actual"] !== undefined && !isValues(a["actual"])) return undefined
  if (a["role"] !== undefined && typeof a["role"] !== "string") return undefined
  if (a["changeKind"] !== undefined && typeof a["changeKind"] !== "string") return undefined
  if (a["text"] !== undefined && typeof a["text"] !== "string") return undefined
  if (a["contents"] !== undefined && a["contents"] !== true) return undefined
  return {
    type: a["type"] as AcceptedDeviation["type"],
    ...(typeof a["role"] === "string" ? { role: a["role"] } : {}),
    ...(typeof a["changeKind"] === "string" ? { changeKind: a["changeKind"] } : {}),
    ...(typeof a["text"] === "string" ? { text: a["text"] } : {}),
    ...(isValues(a["expected"]) ? { expected: a["expected"] } : {}),
    ...(isValues(a["actual"]) ? { actual: a["actual"] } : {}),
    ...(a["contents"] === true ? { contents: true as const } : {}),
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

/**
 * A section path: `"/"`-separated segments, every segment trimmed.
 *
 * Normalization is not cosmetic here. The comps draw a path as `Actions /
 * Button`, so a hand-written manifest naturally carries the spaces — and
 * without trimming, `"Actions/Button"` and `"Actions / Button"` are two
 * distinct groups that RENDER IDENTICALLY. That is a silent split: the reader
 * sees two rows with the same name and no way to tell why. Trimming makes
 * them one node.
 *
 * An empty segment is rejected rather than dropped, because every way of
 * producing one is a typo with a visible consequence — a blank row (`"A//B"`,
 * `"/A"`, `"A/"`) or a node with no name at all (`""`, `"   "`).
 */
export function readSectionPath(v: unknown): Result<string, string> {
  if (typeof v !== "string") return err(`section must be a string path like "Core components/Buttons"`)
  const segments = v.split("/").map((seg) => seg.trim())
  if (segments.some((seg) => seg === "")) {
    return err(
      `section "${v}" has an empty segment — write "A" or "A/B", never "", "/A", "A/" or "A//B"`,
    )
  }
  return ok(segments.join("/"))
}

/** The segments of a normalized path, for a consumer building the tree. */
export const sectionSegments = (path: string): string[] => path.split("/")

/**
 * The module's optional `sections` export: order and labels for the paths the
 * entries name, plus any pure grouping node.
 *
 * Two shapes per row, like `textPatterns`: a bare path string when all it
 * contributes is its position, or `{ path, label? }` when it renames the node.
 * ARRAY POSITION IS THE ORDER — there is no `order` field, so nothing can
 * disagree with it.
 *
 * A malformed row FAILS the manifest rather than being dropped. Dropping is
 * safe for an `ignore` rule (the run then reports what the rule would have
 * excused — loud), and it is the opposite here: a dropped row silently loses a
 * label or a position and the library still draws, looking finished.
 */
export function readSections(v: unknown): Result<SectionMeta[], string> {
  if (v === undefined) return ok([])
  if (!Array.isArray(v)) {
    return err(`sections must be an array of "path" or { path, label? }, got ${typeof v}`)
  }
  const out: SectionMeta[] = []
  const seen = new Map<string, number>()
  for (const [i, raw] of v.entries()) {
    const source = typeof raw === "string" ? { path: raw } : raw
    if (!isRecord(source)) return err(`sections[${i}] must be a path string or { path, label? }`)
    const unknown = Object.keys(source).filter((k) => k !== "path" && k !== "label")
    if (unknown.length > 0) return err(`sections[${i}]: unknown key ${unknown.join(", ")} (path, label)`)
    const path = readSectionPath(source["path"])
    if (!path.ok) return err(`sections[${i}]: ${path.error}`)
    if (source["label"] !== undefined && typeof source["label"] !== "string") {
      return err(`sections[${i}] ("${path.value}"): label must be a string`)
    }
    const first = seen.get(path.value)
    if (first !== undefined) {
      return err(
        `sections[${i}]: "${path.value}" is already declared at sections[${first}] — ` +
          "one node cannot hold two labels or two positions",
      )
    }
    seen.set(path.value, i)
    out.push({
      path: path.value,
      ...(typeof source["label"] === "string" ? { label: source["label"] } : {}),
    })
  }
  return ok(out)
}

const GALLERY_KEYS = ["columns", "rows", "order", "labels"] as const

/**
 * `gallery: { columns?, rows?, order?, labels? }` — which variant property is
 * which axis of the grid, plus pinned option order and human labels.
 *
 * Malformed is an ERROR, never a drop, and an UNKNOWN KEY is an error too.
 * Both follow from what a dropped field does here: the grid still renders, on
 * a different axis or in a different order, and nothing says so. `gallery: {
 * colums: "State" }` would otherwise validate as "declares nothing" and
 * silently lay the sheet out however the consumer defaults — which is why an
 * EMPTY block is refused as well. Rejecting it is what turns every misspelled
 * key into a message naming the field.
 *
 * What this cannot check is `columns` / `order` naming a property or option the
 * SET actually defines: there is no Figma node here. See `GalleryConfig`.
 */
export function readGallery(v: unknown): Result<GalleryConfig | undefined, string> {
  if (v === undefined) return ok(undefined)
  if (!isRecord(v)) return err("gallery must be an object { columns?, rows?, order?, labels? }")
  const unknown = Object.keys(v).filter((k) => !(GALLERY_KEYS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    return err(`gallery: unknown key ${unknown.join(", ")} (${GALLERY_KEYS.join(", ")})`)
  }
  const out: GalleryConfig = {}
  for (const axis of ["columns", "rows"] as const) {
    if (v[axis] === undefined) continue
    if (typeof v[axis] !== "string" || v[axis] === "") {
      return err(`gallery.${axis} must be the name of a variant property`)
    }
    out[axis] = v[axis] as string
  }
  if (out.columns !== undefined && out.columns === out.rows) {
    return err(`gallery: "${out.columns}" cannot be both columns and rows`)
  }
  if (v["order"] !== undefined) {
    if (!isRecord(v["order"])) return err("gallery.order must be { property: [options] }")
    for (const [prop, options] of Object.entries(v["order"])) {
      if (!Array.isArray(options) || options.length === 0 || options.some((o) => typeof o !== "string")) {
        return err(`gallery.order.${prop} must be a non-empty array of option names`)
      }
      const dupe = options.find((o, i) => options.indexOf(o) !== i)
      if (dupe !== undefined) return err(`gallery.order.${prop} lists "${String(dupe)}" twice`)
    }
    out.order = v["order"] as Record<string, string[]>
  }
  if (v["labels"] !== undefined) {
    if (!isRecord(v["labels"]) || !Object.values(v["labels"]).every(isStringMap)) {
      return err("gallery.labels must be { property: { option: label } }")
    }
    out.labels = v["labels"] as Record<string, Record<string, string>>
  }
  if (Object.keys(out).length === 0) {
    return err(`gallery declares nothing — give it one of ${GALLERY_KEYS.join(", ")}, or drop the block`)
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
  const dSteps = readSteps(design["steps"])
  return ok({
    kind: "dc-html",
    file: design["file"],
    frame: design["frame"],
    ...(dSteps.steps.length > 0 ? { steps: dSteps.steps } : {}),
    ...(scope !== undefined ? { scope } : {}),
    ...(viewport ? { viewport } : {}),
  })
}

function readImpl(app: unknown, viewport: Viewport | undefined): Result<ImplSpec, string> {
  if (!isRecord(app) || typeof app["source"] !== "string") return err("app needs { source }")
  if (app["source"] === "storybook") {
    if (typeof app["storyId"] !== "string") return err("storybook app needs storyId")
    const aSteps = readSteps(app["steps"])
    return ok({
      kind: "storybook",
      storyId: app["storyId"],
      ...(aSteps.steps.length > 0 ? { steps: aSteps.steps } : {}),
      ...(viewport ? { viewport } : {}),
      ...(app["overlay"] === true ? { overlay: true } : {}),
      ...(typeof app["selector"] === "string" ? { selector: app["selector"] } : {}),
    })
  }
  if (app["source"] === "live" || app["source"] === "live-url") {
    const route = app["route"] ?? app["url"]
    if (typeof route !== "string") return err("live app needs route (or url)")
    const aSteps = readSteps(app["steps"])
    return ok({
      kind: "live-url",
      route,
      ...(aSteps.steps.length > 0 ? { steps: aSteps.steps } : {}),
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
 * export), and its optional `sections` export. Unsupported app sources are
 * listed as skipped rather than dropped.
 *
 * `sections` is a SECOND argument rather than a second function because the
 * two are one document: a section path an entry names and a label the
 * `sections` export gives it are the same declaration seen from two ends, and
 * a caller that could validate one without the other would eventually
 * validate only one.
 */
export function parseManifest(
  raw: unknown,
  sectionsRaw?: unknown,
): Result<ManifestParse, ManifestError> {
  if (!Array.isArray(raw)) {
    return err({ kind: "not-an-array", detail: `expected an array, got ${typeof raw}` })
  }
  const sections = readSections(sectionsRaw)
  if (!sections.ok) return err({ kind: "invalid-sections", detail: sections.error })
  const pairs: PairSpec[] = []
  const skipped: ManifestParse["skipped"] = []
  for (const [index, entry] of raw.entries()) {
    if (!isRecord(entry) || typeof entry["id"] !== "string") {
      return err({ kind: "invalid-entry", index, detail: "entry needs a string `id`" })
    }
    const id = entry["id"]
    const disabled = readDisabled(entry["disabled"])
    if (!disabled.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${disabled.error}` })
    if (disabled.value !== undefined) {
      skipped.push({ id, reason: `disabled — ${disabled.value}` })
      continue
    }
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

    let section: string | undefined
    if (entry["section"] !== undefined) {
      const p = readSectionPath(entry["section"])
      if (!p.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${p.error}` })
      section = p.value
    }
    const gallery = readGallery(entry["gallery"])
    if (!gallery.ok) return err({ kind: "invalid-entry", index, detail: `${id}: ${gallery.error}` })
    // A gallery IS a variant sheet: every field of it names a variant property,
    // so on an entry with no set there is nothing for it to describe and it can
    // only ever be a mistake — a `gallery` moved to the wrong entry, or one left
    // behind when `variants` was removed. Refused here, where the message can
    // name the entry, rather than ignored into an artifact nobody reads.
    if (gallery.value !== undefined && !(d.value.kind === "figma" && d.value.variants !== undefined)) {
      return err({
        kind: "invalid-entry",
        index,
        detail: `${id}: gallery needs design.variants — it lays out a component SET's cells`,
      })
    }

    const bleed = entry["bleed"]
    if (bleed !== undefined && !(typeof bleed === "number" && bleed >= 0 && bleed <= 200)) {
      return err({
        kind: "invalid-entry",
        index,
        detail: `${id}: bleed must be a number 0..200 (CSS px of margin around the node)`,
      })
    }

    const ground = readGround(entry["ground"])
    if (entry["ground"] !== undefined && ground === undefined) {
      return err({
        kind: "invalid-entry",
        index,
        detail: `${id}: ground must be "transparent" (default) or "keep"`,
      })
    }

    pairs.push({
      id,
      ...(typeof entry["title"] === "string" ? { title: entry["title"] } : {}),
      design: d.value,
      impl: i.value,
      ...(bleed !== undefined ? { bleed } : {}),
      ...(ground !== undefined ? { ground } : {}),
      ...(ignore ? { ignore } : {}),
      ...(section !== undefined ? { section } : {}),
      ...(gallery.value !== undefined ? { gallery: gallery.value } : {}),
    })
  }
  return ok({ pairs, skipped, sections: sections.value })
}
