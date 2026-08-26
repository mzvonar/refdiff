/**
 * DOM element-tree extraction, shared by every HTML-backed adapter.
 *
 * Runs inside the page (the callback is serialized by page.evaluate), walks
 * the subtree under a root selector and returns leaf elements — boxes in CSS
 * px relative to the root's origin plus the computed styles the typed checks
 * consume. GVT: 94% of design violations affect leaf components only.
 */

import type { Page } from "playwright";

import type { ElementNode } from "../types.js";

interface RawExtraction {
  width: number;
  height: number;
  elements: ElementNode[];
}

export interface ExtractOptions {
  /**
   * Use the viewport as the coordinate origin and dimensions instead of the
   * root's own box — for overlay captures (portaled dialogs) where the shot
   * is the viewport and the root (<body>) can have zero height.
   */
  viewportOrigin?: boolean;
}

/**
 * Extract the leaf element tree under `rootSelector`.
 * Returns null when the root doesn't exist.
 */
export async function extractElementTree(
  page: Page,
  rootSelector: string,
  { viewportOrigin = false }: ExtractOptions = {},
): Promise<RawExtraction | null> {
  const raw = await page.evaluate((arg: { sel: string; viewportOrigin: boolean }) => {
    const root = document.querySelector(arg.sel);
    if (!root) return null;
    const rootBox = root.getBoundingClientRect();
    const rootRect = arg.viewportOrigin
      ? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
      : { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height };

    const round = (n: number) => Math.round(n * 100) / 100;

    const pxOrUndef = (v: string): number | undefined => {
      const n = parseFloat(v);
      return Number.isFinite(n) ? round(n) : undefined;
    };

    const radiusPx = (v: string, rect: DOMRect): number | undefined => {
      // Computed border-radius can be "8px", "50%", or "8px 8px" (x/y radii).
      const first = v.split(" ")[0] ?? "";
      const n = parseFloat(first);
      if (!Number.isFinite(n)) return undefined;
      if (first.endsWith("%")) return round((n / 100) * Math.min(rect.width, rect.height));
      return round(n);
    };

    const hasAlpha = (color: string): boolean => {
      const m = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/.exec(color);
      if (!m) return color !== "transparent";
      return m[1] === undefined || parseFloat(m[1]) > 0;
    };

    const firstFontFamily = (v: string): string =>
      (v.split(",")[0] ?? v).trim().replace(/^["']|["']$/g, "");

    const out: Array<Record<string, unknown>> = [];
    let seq = 0;

    const emit = (el: Element, rect: DOMRect, cs: CSSStyleDeclaration, ownText: string) => {
      const tag = el.tagName.toLowerCase();
      const isImage = tag === "img" || tag === "picture" || tag === "video";
      const isIcon = tag === "svg";
      const role = ownText ? "text" : isImage ? "image" : isIcon ? "icon" : "box";

      const style: Record<string, unknown> = {};
      if (ownText) {
        style["color"] = cs.color;
        style["fontFamily"] = firstFontFamily(cs.fontFamily);
        style["fontSize"] = pxOrUndef(cs.fontSize);
        const lh = pxOrUndef(cs.lineHeight);
        if (cs.lineHeight !== "normal" && lh !== undefined) style["lineHeight"] = lh;
        const fw = parseInt(cs.fontWeight, 10);
        if (Number.isFinite(fw)) style["fontWeight"] = fw;
      }
      if (hasAlpha(cs.backgroundColor)) style["backgroundColor"] = cs.backgroundColor;
      const radius = radiusPx(cs.borderTopLeftRadius, rect);
      if (radius !== undefined && radius > 0) style["borderRadius"] = radius;
      const bw = pxOrUndef(cs.borderTopWidth);
      if (bw !== undefined && bw > 0 && cs.borderTopStyle !== "none") {
        style["borderWidth"] = bw;
        style["borderColor"] = cs.borderTopColor;
      }

      const node: Record<string, unknown> = {
        id: `${tag}-${seq++}`,
        box: {
          x: round(rect.x - rootRect.x),
          y: round(rect.y - rootRect.y),
          w: round(rect.width),
          h: round(rect.height),
        },
        role,
      };
      if (ownText) node["text"] = ownText;
      if (Object.keys(style).length > 0) node["style"] = style;
      out.push(node);
    };

    const walk = (el: Element, isRoot: boolean) => {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0)
        return;
      const rect = el.getBoundingClientRect();
      // Zero size hides the element itself but NOT its children — portal
      // wrappers and overflowing containers have no box of their own while
      // hosting fixed/absolute content. Descend; just never emit.
      const zeroSize = rect.width < 1 || rect.height < 1;

      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "link" || tag === "noscript") return;
      // SVGs are atomic icons — never descend into their internals.
      const treatAsLeaf = tag === "svg" || tag === "img" || tag === "video" || tag === "canvas";
      const elementChildren = treatAsLeaf ? [] : Array.from(el.children);

      const ownText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();

      // Leaves always emit; containers emit only when they carry direct text
      // (mixed content like <p>Total <b>12</b></p>). The root never emits,
      // nor do sub-visible boxes (≤2px in BOTH dimensions — the sr-only
      // clip pattern; real hairlines are thin in only one axis).
      const subVisible = rect.width <= 2 && rect.height <= 2;
      if (!isRoot && !zeroSize && !subVisible && (elementChildren.length === 0 || ownText))
        emit(el, rect, cs, ownText);
      for (const child of elementChildren) walk(child, false);
    };

    walk(root, true);
    return {
      width: round(rootRect.width),
      height: round(rootRect.height),
      elements: out,
    };
  }, { sel: rootSelector, viewportOrigin });

  return raw as RawExtraction | null;
}
