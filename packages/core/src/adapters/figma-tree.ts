/**
 * Pure mapping: Figma node subtree → leaf `ElementNode[]` in CSS px relative
 * to the root's `absoluteBoundingBox` (Figma units ARE CSS px at scale 1),
 * plus the GIGO quality score. Mirrors `adapters/extract.ts` for the DOM:
 * same leaf notion, same style vocabulary, same decoration hoisting, so the
 * structural channel sees no difference between a `.dc.html` frame and a
 * Figma frame.
 */

import type { ElementNode } from "../types.js";
import type { DesignQuality } from "../pipeline.js";
import type { FigmaNode, FigmaPaint, FigmaVariablesResponse } from "./figma-api.js";

/** Variable id → human name, from `/variables/local` when the plan has it. */
export type VariableIndex = Readonly<Record<string, string>>;

export function indexVariables(v: FigmaVariablesResponse | undefined): VariableIndex {
  if (!v) return {};
  return Object.fromEntries(Object.values(v.meta.variables).map((x) => [x.id, x.name]));
}

const round = (n: number): number => Math.round(n * 100) / 100;

const VECTOR_TYPES = new Set([
  "VECTOR",
  "BOOLEAN_OPERATION",
  "STAR",
  "LINE",
  "ELLIPSE",
  "REGULAR_POLYGON",
  "RECTANGLE",
]);
const CONTAINER_TYPES = new Set(["FRAME", "GROUP", "INSTANCE", "COMPONENT", "COMPONENT_SET", "SECTION"]);

/** Icon heuristic: a container whose descendants are all vector shapes, no bigger than this. */
const MAX_ICON_PX = 64;

/**
 * Figma colors are 0..1 floats; paint opacity multiplies alpha, and so does
 * the LAYER opacity of the node and its ancestors (`opacity`, passed in as
 * the product) — a State=Disabled variant drawn at layer opacity 0.3 is
 * `rgba(…, 0.3)`, the same statement the DOM side makes for `opacity: .3`.
 * Emitted like the DOM side (`rgb()`/`rgba()`).
 */
export function paintToCss(p: FigmaPaint, opacity = 1): string | undefined {
  if (p.type !== "SOLID" || p.visible === false || !p.color) return undefined;
  const a = round((p.color.a ?? 1) * (p.opacity ?? 1) * opacity);
  if (a <= 0) return undefined;
  const c = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 255);
  const rgb = `${c(p.color.r)}, ${c(p.color.g)}, ${c(p.color.b)}`;
  return a >= 1 ? `rgb(${rgb})` : `rgba(${rgb}, ${a})`;
}

/** First visible solid paint of a paint list. */
const firstSolid = (paints: readonly FigmaPaint[] | undefined): FigmaPaint | undefined =>
  paints?.find((p) => p.type === "SOLID" && p.visible !== false && paintToCss(p) !== undefined);

function cornerRadius(n: FigmaNode, w: number, h: number): number | undefined {
  const raw = n.rectangleCornerRadii?.[0] ?? n.cornerRadius;
  if (raw === undefined || !Number.isFinite(raw) || raw <= 0) return undefined;
  // Same clamp as the browser applies: a pill radius is half the shorter side.
  return round(Math.min(raw, Math.min(w, h) / 2));
}

interface Decoration {
  backgroundColor?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
}

function decorationOf(n: FigmaNode, w: number, h: number, isText: boolean, opacity = 1): Decoration {
  const out: Decoration = {};
  // A text node's fills are its glyph color, not a background.
  if (!isText) {
    const bg = firstSolid(n.fills);
    const css = bg ? paintToCss(bg, opacity) : undefined;
    if (css) out.backgroundColor = css;
  }
  const radius = cornerRadius(n, w, h);
  if (radius !== undefined) out.borderRadius = radius;
  const stroke = firstSolid(n.strokes);
  const sw = n.strokeWeight ?? 0;
  if (stroke && sw > 0) {
    out.borderWidth = round(sw);
    const css = paintToCss(stroke, opacity);
    if (css) out.borderColor = css;
  }
  return out;
}

/** Effective layer opacity of a node: its own times every ancestor's (the captured root included). */
const effectiveOpacity = (chain: readonly FigmaNode[]): number =>
  round(chain.reduce((a, x) => a * (x.opacity ?? 1), 1));

/**
 * Figma renders `style.textCase` over the raw `characters` the way CSS
 * `text-transform` renders over the DOM text — the design says "label" and
 * shows LABEL. Both adapters emit what is SHOWN, so a matching pair matches.
 */
export function applyTextCase(text: string, textCase: string | undefined): string {
  switch (textCase) {
    case "UPPER":
      return text.toUpperCase();
    case "LOWER":
      return text.toLowerCase();
    case "TITLE":
      return text.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase());
    default:
      return text;
  }
}

const paints = (d: Decoration): boolean =>
  d.backgroundColor !== undefined || d.borderWidth !== undefined || d.borderRadius !== undefined;

const isVisible = (n: FigmaNode): boolean => n.visible !== false && (n.opacity ?? 1) > 0;

/** True when every visible descendant is a vector shape (an icon's internals). */
function allVectors(n: FigmaNode): boolean {
  const kids = (n.children ?? []).filter(isVisible);
  if (kids.length === 0) return false;
  return kids.every((k) => VECTOR_TYPES.has(k.type) || (CONTAINER_TYPES.has(k.type) && allVectors(k)));
}

/** Names of the variables/styles a node's color or typography is bound to. */
function tokensOf(n: FigmaNode, vars: VariableIndex): Record<string, string> {
  const out: Record<string, string> = {};
  const name = (id: string): string => vars[id] ?? id;
  const fillVar = n.fills?.[0]?.boundVariables?.color?.id;
  if (fillVar) out[n.type === "TEXT" ? "color" : "backgroundColor"] = name(fillVar);
  const strokeVar = n.strokes?.[0]?.boundVariables?.color?.id;
  if (strokeVar) out["borderColor"] = name(strokeVar);
  const bv = n.boundVariables ?? {};
  for (const [key, prop] of [
    ["fontSize", "fontSize"],
    ["fontFamily", "fontFamily"],
    ["fontWeight", "fontWeight"],
    ["lineHeight", "lineHeight"],
    ["topLeftRadius", "borderRadius"],
  ] as const) {
    const v = bv[key] as { id?: string } | { id?: string }[] | undefined;
    const id = Array.isArray(v) ? v[0]?.id : v?.id;
    if (id) out[prop] = name(id);
  }
  if (n.styles?.["fill"]) out[n.type === "TEXT" ? "color" : "backgroundColor"] ??= `style:${n.styles["fill"]}`;
  if (n.styles?.["text"]) out["typography"] = `style:${n.styles["text"]}`;
  if (n.styles?.["stroke"]) out["borderColor"] ??= `style:${n.styles["stroke"]}`;
  return out;
}

export interface FigmaMapping {
  elements: ElementNode[];
  quality: DesignQuality;
  width: number;
  height: number;
}

type FigmaRect = { x: number; y: number; width: number; height: number };

/** A small all-vector node — what `walk` emits as role `icon`. */
const isIconLike = (n: FigmaNode): boolean => {
  const b = n.absoluteBoundingBox;
  if (!b || Math.max(b.width, b.height) > MAX_ICON_PX) return false;
  return VECTOR_TYPES.has(n.type) || allVectors(n);
};

/**
 * The box a leaf is measured by. TEXT nodes whose WIDTH is not their own
 * (`textAutoResize` HEIGHT/NONE/TRUNCATE — a fill-width or fixed box) take
 * their horizontal extent from the glyph-ink `absoluteRenderBounds`: the DOM
 * side measures text by its glyph rects, and a 724px "responsive width" box
 * around 255px of glyphs is layout, not text size. Vertical extent stays the
 * layout box (line-height), the closer analogue of the DOM's content-area
 * rect. Hugging text keeps its layout box on both axes (S9 measurement).
 */
export function textBox(n: FigmaNode): FigmaRect | undefined {
  const b = n.absoluteBoundingBox;
  if (!b) return undefined;
  if (n.type !== "TEXT") return b;
  const mode = n.style?.textAutoResize ?? "WIDTH_AND_HEIGHT";
  const r = n.absoluteRenderBounds;
  if (mode === "WIDTH_AND_HEIGHT" || !r || r.width <= 0) return b;
  return { x: r.x, y: b.y, width: r.width, height: b.height };
}

/**
 * Map a node subtree to leaves. Leaves: TEXT; vector shapes; childless
 * containers that paint something; containers whose descendants are all
 * vectors (→ `icon`). Invisible, fully transparent and zero-area nodes are
 * skipped. Decoration (background/border/radius) hoists from a single-child
 * ancestor chain exactly like the DOM extraction does.
 */
export function figmaTreeToElements(root: FigmaNode, vars: VariableIndex = {}): FigmaMapping {
  const rb = root.absoluteBoundingBox ?? { x: 0, y: 0, width: 0, height: 0 };
  const out: ElementNode[] = [];
  let seq = 0;
  let leaves = 0;
  let bound = 0;
  let instances = 0;
  let detached = 0;

  const emit = (n: FigmaNode, role: string, ancestors: readonly FigmaNode[]) => {
    const b = textBox(n);
    if (!b) return;
    const isText = n.type === "TEXT";
    const text = isText ? applyTextCase((n.characters ?? "").replace(/\s+/g, " ").trim(), n.style?.textCase) : "";
    if (isText && text === "") return;

    const style: NonNullable<ElementNode["style"]> = {};
    const opacity = effectiveOpacity([...ancestors, n]);
    if (isText) {
      const fill = firstSolid(n.fills);
      const css = fill ? paintToCss(fill, opacity) : undefined;
      if (css) style.color = css;
      const s = n.style ?? {};
      if (s.fontFamily) style.fontFamily = s.fontFamily;
      if (s.fontSize !== undefined) style.fontSize = round(s.fontSize);
      if (s.lineHeightPx !== undefined && s.lineHeightUnit !== "INTRINSIC_%") style.lineHeight = round(s.lineHeightPx);
      if (s.fontWeight !== undefined) style.fontWeight = s.fontWeight;
    }

    // Decoration: the node's own, else hoisted from the nearest ancestor of
    // which it is the only visible child (a TEXT inside a one-child FRAME
    // that paints a fill/stroke is a labelled pill — same as
    // <button><span>⋯</span></button> on the DOM side).
    let deco = decorationOf(n, b.width, b.height, isText, opacity);
    // The root itself counts: when the captured node IS the button (one Figma
    // variant COMPONENT) its fill/radius belong to the lone label, otherwise
    // that paint would vanish from the comparison altogether. Icon siblings
    // do not break the chain: `[icon] LABEL` inside a filled frame is still a
    // labelled control — the DOM side emits the <button> itself as the text
    // leaf with its own paint, so the label must carry it here too (S11: 29
    // of 41 Button cells reported "radius 0" for the design otherwise).
    if (!paints(deco)) {
      for (let i = ancestors.length - 1; i >= 0; i--) {
        const parent = ancestors[i]!;
        const onPath = i === ancestors.length - 1 ? n : ancestors[i + 1]!;
        const siblings = (parent.children ?? []).filter(isVisible).filter((c) => c !== onPath);
        if (!siblings.every(isIconLike)) break;
        const pb = parent.absoluteBoundingBox;
        if (!pb) break;
        const pd = decorationOf(parent, pb.width, pb.height, false, effectiveOpacity(ancestors.slice(0, i + 1)));
        if (paints(pd)) {
          deco = pd;
          break;
        }
      }
    }
    Object.assign(style, deco);
    if (opacity < 1) style.opacity = opacity;

    const token = tokensOf(n, vars);
    const node: ElementNode = {
      id: `${n.type.toLowerCase()}-${seq++}`,
      box: { x: round(b.x - rb.x), y: round(b.y - rb.y), w: round(b.width), h: round(b.height) },
      role,
      ...(isText ? { text } : {}),
      ...(Object.keys(style).length > 0 ? { style } : {}),
      ...(Object.keys(token).length > 0 ? { token } : {}),
    };
    out.push(node);
    leaves++;
    const hasColorOrType = isText || deco.backgroundColor !== undefined || deco.borderColor !== undefined;
    if (
      hasColorOrType &&
      ["color", "backgroundColor", "borderColor", "typography", "fontSize", "fontFamily"].some((k) => k in token)
    ) {
      bound++;
    }
  };

  const walk = (n: FigmaNode, ancestors: readonly FigmaNode[]) => {
    const isRoot = n === root;
    if (!isRoot && !isVisible(n)) return;
    const b = n.absoluteBoundingBox;
    if (!isRoot && b && (b.width < 0.5 || b.height < 0.5)) return;
    if (n.type === "INSTANCE") {
      instances++;
      if (!n.componentId) detached++;
    }
    const kids = (n.children ?? []).filter(isVisible);

    if (!isRoot) {
      if (n.type === "TEXT") return emit(n, "text", ancestors);
      if (VECTOR_TYPES.has(n.type)) {
        const role = n.type === "RECTANGLE" || n.type === "ELLIPSE" ? "box" : "icon";
        return emit(n, role, ancestors);
      }
      if (CONTAINER_TYPES.has(n.type)) {
        if (kids.length === 0) {
          // A childless frame is a box only when it paints something.
          if (b && paints(decorationOf(n, b.width, b.height, false, effectiveOpacity([...ancestors, n])))) {
            emit(n, "box", ancestors);
          }
          return;
        }
        if (b && Math.max(b.width, b.height) <= MAX_ICON_PX && allVectors(n)) return emit(n, "icon", ancestors);
      } else if (kids.length === 0) {
        // SLICE, unknown leaf types with a box: treat as image-ish content.
        if (b) emit(n, "image", ancestors);
        return;
      }
    }
    const next = [...ancestors, n];
    for (const k of kids) walk(k, next);
  };

  walk(root, []);

  const boundShare = leaves === 0 ? 0 : bound / leaves;
  const detachedShare = instances === 0 ? 0 : detached / instances;
  const quality: DesignQuality = {
    score: round(boundShare * (1 - 0.5 * detachedShare)),
    leaves,
    bound,
    instances,
    detached,
  };
  return { elements: out, quality, width: round(rb.width), height: round(rb.height) };
}
