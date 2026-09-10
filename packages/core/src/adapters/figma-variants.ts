/**
 * Component-set expansion (pure): one Figma COMPONENT_SET → N (variant
 * COMPONENT node ↔ story cell selector) pairs.
 *
 * The unit of a design-system comparison is one variant against one story
 * cell, never the sheet (docs/architecture.md). A story renders the matrix as
 * a grid whose cells are tagged from the same properties Figma names its
 * variants by ("State=Default, iconPlacement=none, variant=default"), so the
 * mapping is a template over those properties:
 *
 *   selector: '[data-rowkey="fill:{variant|tone}:md:{variant|label}:{iconPlacement|icons}"][data-col="{State}"]'
 *   maps:     { tone: { default: "label", success: "success", … }, icons: { none: "", left: "s", right: "e" }, … }
 *
 * `{Prop}` inserts the variant's option verbatim; `{Prop|map}` looks the
 * option up in `maps[map]`; `{PropA,PropB|map}` looks the joined options
 * ("Info,Left,Text") up — for stories whose cells are positional
 * (`:nth-child(n)`) rather than tagged. A property the set does not define is a typed
 * error (the template is wrong); an option a map does not list skips THAT
 * variant with the reason (the story has no such cell) — skipped variants
 * are returned, never dropped silently. Fed by the set's
 * `componentPropertyDefinitions` when present, else by the child names —
 * `variantAxes` says WHICH, because the two orders are not the same fact.
 */

import type { FigmaNode } from "./figma-api.js";
import type { FigmaDesignSpec, PairSpec } from "../manifest.js";
import { err, ok, type Result } from "../result.js";

export interface VariantConfig {
  /** Story cell selector template with `{Prop}` / `{Prop|map}` placeholders. */
  selector: string;
  /** Named option → impl-token maps used by `{Prop|map}`. */
  maps?: Record<string, Record<string, string>>;
  /** Keep only variants whose property is one of the listed options (AND across properties). */
  only?: Record<string, string[]>;
  /** Drop variants matching ALL properties of any listed partial (e.g. `{ variant: "label" }`). */
  omit?: Record<string, string>[];
}

export interface VariantPair {
  nodeId: string;
  /** The variant's Figma name ("State=Default, iconPlacement=none, variant=default"). */
  name: string;
  props: Record<string, string>;
  selector: string;
  /** Stable id suffix: "state-default_iconplacement-none_variant-default". */
  slug: string;
}

/**
 * WHY a declared variant was not measured, and the two answers mean opposite
 * things — which is the whole reason this is a field and not prose.
 *
 * `filtered`  the manifest narrowed the set on purpose (`only` / `omit`). The
 *             design defines the variant and we CHOSE not to measure it.
 * `unmapped`  the story has no cell for it (`renderSelector` could not resolve
 *             one). The design defines the variant and the IMPLEMENTATION does
 *             not have it.
 *
 * Measured on the DS's fourteen sets: 191 `filtered` against 90 `unmapped`. The
 * sheet used to draw all 281 with the note "Skipped · no impl cell", which is
 * a false statement about the 191 — they were never looked for. Only `unmapped`
 * is a coverage gap in the implementation; `filtered` is a scope decision.
 */
export type SkipKind = "filtered" | "unmapped";

export interface VariantExpansion {
  setId: string;
  setName: string;
  pairs: VariantPair[];
  skipped: { nodeId: string; name: string; reason: string; kind: SkipKind }[];
}

export type VariantExpandError =
  | { kind: "not-a-component-set"; nodeId: string; type: string }
  | { kind: "unknown-property"; property: string; known: string[] }
  | { kind: "unknown-map"; map: string; known: string[] }
  | { kind: "no-variants"; nodeId: string };

/** "State=Default, iconPlacement=none" → { State: "Default", iconPlacement: "none" }. */
export function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const part of name.split(",")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key) props[key] = part.slice(eq + 1).trim();
  }
  return props;
}

const PLACEHOLDER = /\{([^{}|]+)(?:\|([^{}|]+))?\}/g;

/** Which of the two sources produced a set's axes. See `variantAxes`. */
export type VariantAxesSource = "definitions" | "child-names";

export interface VariantAxes {
  source: VariantAxesSource;
  /** property → its options, in the source's order. */
  properties: Record<string, string[]>;
}

/**
 * The VARIANT properties a set defines, WITH the branch that produced them.
 *
 * Option ORDER is the designer's on the `definitions` branch only, where it
 * echoes Figma's own `componentPropertyDefinitions.variantOptions`. The
 * fallback accumulates options out of the children's names, so its order is
 * TRAVERSAL order. A consumer that labels a grid's columns in traversal order
 * while claiming the designer's is a "looks fine but is wrong" state, and the
 * only defence is that the source travels WITH the axes — so this returns
 * both and nobody has to guess which they are holding.
 */
export function variantAxes(set: FigmaNode): VariantAxes {
  const defs = set.componentPropertyDefinitions ?? {};
  const fromDefs = Object.entries(defs).filter(([, d]) => d.type === "VARIANT" && Array.isArray(d.variantOptions));
  if (fromDefs.length > 0) {
    return {
      source: "definitions",
      properties: Object.fromEntries(fromDefs.map(([name, d]) => [name, [...(d.variantOptions ?? [])]])),
    };
  }
  const seen: Record<string, Set<string>> = {};
  for (const child of set.children ?? []) {
    for (const [k, v] of Object.entries(parseVariantName(child.name))) (seen[k] ??= new Set()).add(v);
  }
  return {
    source: "child-names",
    properties: Object.fromEntries(Object.entries(seen).map(([k, s]) => [k, [...s]])),
  };
}

/** The properties alone, for a caller with no use for their provenance. */
export function variantProperties(set: FigmaNode): Record<string, string[]> {
  return variantAxes(set).properties;
}

/**
 * How a set's cells are laid out as a GRID, declared per manifest entry
 * (`gallery`) and validated by `readGallery` in manifest.ts.
 *
 * Every field names a VARIANT PROPERTY of the set, so this type lives beside
 * the axes it talks about rather than with the manifest that carries it — the
 * same split as `VariantConfig`.
 *
 * It is a DECLARATION, not a resolved layout. Nothing here can be checked
 * against the set at manifest-parse time: the parser has no Figma node, so a
 * `columns` naming a property the set does not define, or an `order` listing
 * an option that does not exist, is shape-valid and still cannot apply.
 * **Resolving these names against `VariantAxes.properties` — and deciding what
 * a name that misses means — belongs to the consumer that has the axes in
 * hand**, which is the only place the question can be answered. The set index
 * carries the declaration verbatim so that consumer gets it unaltered.
 */
export interface GalleryConfig {
  /** The property whose options become the grid's COLUMNS. */
  columns?: string;
  /** The property whose options become the grid's ROWS. */
  rows?: string;
  /**
   * Pinned option order per property, overriding the axes' own.
   *
   * This exists because the axes' order is only the designer's on the
   * `definitions` branch — see `variantAxes`. On the `child-names` fallback it
   * is traversal order, and a grid labelled in traversal order while claiming
   * the designer's is exactly the state that type warns about. Pinning is how
   * a repo states the order it means without waiting for Figma to define it.
   */
  order?: Record<string, string[]>;
  /** Human labels per property: `{ variant: { "Focus on text": "Focus" } }`. */
  labels?: Record<string, Record<string, string>>;
}

const slugify = (props: Record<string, string>): string =>
  Object.entries(props)
    .map(([k, v]) => `${k}-${v}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""))
    .join("_");

const matchesPartial = (props: Record<string, string>, partial: Record<string, string>): boolean =>
  Object.entries(partial).every(([k, v]) => props[k] === v);

/** Fill the template for one variant; `undefined` reason when a map has no entry for its option. */
function renderSelector(
  template: string,
  props: Record<string, string>,
  maps: Record<string, Record<string, string>>,
): Result<string, string> {
  let missing: string | undefined;
  const out = template.replace(PLACEHOLDER, (_m, propList: string, map: string | undefined) => {
    const names = propList.split(",").map((p) => p.trim());
    const options = names.map((n) => props[n]);
    const absent = names.find((n) => props[n] === undefined);
    if (absent !== undefined) {
      missing ??= `variant has no "${absent}" property`;
      return "";
    }
    const key = options.join(",");
    if (map === undefined) return key;
    const mapped = maps[map.trim()]?.[key];
    if (mapped === undefined) {
      missing ??= `no ${map.trim()} mapping for ${names.map((n, i) => `${n}=${options[i]}`).join(", ")} (no such story cell)`;
      return "";
    }
    return mapped;
  });
  return missing === undefined ? ok(out) : err(missing);
}

/**
 * Pure: expand a COMPONENT_SET node into per-variant pairs. Validates the
 * template against the set's properties and maps first, so a typo fails the
 * whole entry instead of skipping every variant.
 */
export function expandVariants(set: FigmaNode, config: VariantConfig): Result<VariantExpansion, VariantExpandError> {
  if (set.type !== "COMPONENT_SET") return err({ kind: "not-a-component-set", nodeId: set.id, type: set.type });
  const properties = variantProperties(set);
  const known = Object.keys(properties);
  const maps = config.maps ?? {};

  for (const m of config.selector.matchAll(PLACEHOLDER)) {
    for (const prop of m[1]!.split(",").map((p) => p.trim())) {
      if (!known.includes(prop)) return err({ kind: "unknown-property", property: prop, known });
    }
    const map = m[2]?.trim();
    if (map !== undefined && maps[map] === undefined) {
      return err({ kind: "unknown-map", map, known: Object.keys(maps) });
    }
  }
  for (const prop of Object.keys(config.only ?? {})) {
    if (!known.includes(prop)) return err({ kind: "unknown-property", property: prop, known });
  }

  const variants = (set.children ?? []).filter((c) => c.type === "COMPONENT");
  if (variants.length === 0) return err({ kind: "no-variants", nodeId: set.id });

  const pairs: VariantPair[] = [];
  const skipped: VariantExpansion["skipped"] = [];
  for (const v of variants) {
    const props = parseVariantName(v.name);
    const filtered = Object.entries(config.only ?? {}).find(([k, allowed]) => !allowed.includes(props[k] ?? ""));
    if (filtered) {
      skipped.push({ nodeId: v.id, name: v.name, reason: `only: ${filtered[0]} ∉ [${filtered[1].join(", ")}]`, kind: "filtered" });
      continue;
    }
    const omitted = (config.omit ?? []).find((partial) => matchesPartial(props, partial));
    if (omitted) {
      skipped.push({ nodeId: v.id, name: v.name, reason: `omit: ${JSON.stringify(omitted)}`, kind: "filtered" });
      continue;
    }
    const selector = renderSelector(config.selector, props, maps);
    if (!selector.ok) {
      // The only kind that says something about the IMPLEMENTATION: the design
      // declares this variant and the story has no cell to compare it against.
      skipped.push({ nodeId: v.id, name: v.name, reason: selector.error, kind: "unmapped" });
      continue;
    }
    pairs.push({ nodeId: v.id, name: v.name, props, selector: selector.value, slug: slugify(props) });
  }
  return ok({ setId: set.id, setName: set.name, pairs, skipped });
}

/**
 * One expanded variant as a runnable pair spec — the pure half of a set run.
 *
 * Extracted because this is where an entry-level setting goes missing. A SET
 * entry is not run: N specs built from it are, and anything the builder does not
 * copy is silently absent on every one of them while the same setting works
 * perfectly on a single-pair entry. `bleed` shipped with exactly that defect —
 * declared on all fourteen DS entries, present in the parse, and `undefined` in
 * all 24 reports, because this map did not carry it. `manifest.test.ts` already
 * says "every new manifest field needs a row asserting it ARRIVES"; that row has
 * to be here too, one level further on.
 *
 * `section` and `gallery` are deliberately NOT carried: they say where the SET
 * sits in the library and how its grid is laid out, and neither means anything
 * on one cell of it.
 */
export function variantSpec(
  entry: PairSpec,
  variant: { slug: string; name: string; nodeId: string; selector: string },
  design: FigmaDesignSpec,
  scale?: number,
  // A set expansion always produces a FIGMA design, so say so rather than
  // returning the DesignSpec union and making every caller narrow it back.
): PairSpec & { design: FigmaDesignSpec } {
  return {
    id: `${entry.id}--${variant.slug}`,
    title: `${entry.title ?? entry.id} — ${variant.name}`,
    design: {
      ...design,
      nodeId: variant.nodeId,
      ...(scale !== undefined && design.scale === undefined ? { scale } : {}),
    },
    impl: { ...entry.impl, selector: variant.selector },
    ...(entry.ignore ? { ignore: entry.ignore } : {}),
    ...(entry.bleed !== undefined ? { bleed: entry.bleed } : {}),
  }
}
