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
 * `componentPropertyDefinitions` when present, else by the child names.
 */

import type { FigmaNode } from "./figma-api.js";
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

export interface VariantExpansion {
  setId: string;
  setName: string;
  pairs: VariantPair[];
  skipped: { nodeId: string; name: string; reason: string }[];
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

/** The VARIANT properties a set defines, from its definitions or (fallback) its children's names. */
export function variantProperties(set: FigmaNode): Record<string, string[]> {
  const defs = set.componentPropertyDefinitions ?? {};
  const fromDefs = Object.entries(defs).filter(([, d]) => d.type === "VARIANT" && Array.isArray(d.variantOptions));
  if (fromDefs.length > 0) {
    return Object.fromEntries(fromDefs.map(([name, d]) => [name, [...(d.variantOptions ?? [])]]));
  }
  const seen: Record<string, Set<string>> = {};
  for (const child of set.children ?? []) {
    for (const [k, v] of Object.entries(parseVariantName(child.name))) (seen[k] ??= new Set()).add(v);
  }
  return Object.fromEntries(Object.entries(seen).map(([k, s]) => [k, [...s]]));
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
      skipped.push({ nodeId: v.id, name: v.name, reason: `only: ${filtered[0]} ∉ [${filtered[1].join(", ")}]` });
      continue;
    }
    const omitted = (config.omit ?? []).find((partial) => matchesPartial(props, partial));
    if (omitted) {
      skipped.push({ nodeId: v.id, name: v.name, reason: `omit: ${JSON.stringify(omitted)}` });
      continue;
    }
    const selector = renderSelector(config.selector, props, maps);
    if (!selector.ok) {
      skipped.push({ nodeId: v.id, name: v.name, reason: selector.error });
      continue;
    }
    pairs.push({ nodeId: v.id, name: v.name, props, selector: selector.value, slug: slugify(props) });
  }
  return ok({ setId: set.id, setName: set.name, pairs, skipped });
}
