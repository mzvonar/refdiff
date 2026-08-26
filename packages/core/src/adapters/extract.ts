/**
 * DOM element-tree extraction, shared by every HTML-backed adapter.
 *
 * Runs inside the page (the callback is serialized by page.evaluate), walks
 * the subtree under a root selector and returns leaf elements — boxes in CSS
 * px relative to the root's origin plus the computed styles the typed checks
 * consume. GVT: 94% of design violations affect leaf components only.
 *
 * Text leaves are measured by their glyph-ink box (text-run client rects),
 * not the element box — a block-width table cell and a shrink-wrapped span
 * carrying the same label are the same thing visually.
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
      // Pill radii ("9999px") are clamped by the browser to half the shorter
      // side — report the effective radius, not the declared one.
      const first = v.split(" ")[0] ?? "";
      const n = parseFloat(first);
      if (!Number.isFinite(n)) return undefined;
      const maxRadius = Math.min(rect.width, rect.height) / 2;
      if (first.endsWith("%")) return round(Math.min((n / 100) * Math.min(rect.width, rect.height), maxRadius));
      return round(Math.min(n, maxRadius));
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

    // The glyph-ink box of an element's own text nodes: a block-level cell
    // and a shrink-wrapped span rendering the same string must measure the
    // same, otherwise every label reports a bogus size difference.
    const inkBox = (el: Element): DOMRect | undefined => {
      let union: DOMRect | undefined;
      for (const n of Array.from(el.childNodes)) {
        if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const r of Array.from(range.getClientRects())) {
          if (r.width < 0.5 || r.height < 0.5) continue;
          union = union
            ? new DOMRect(
                Math.min(union.x, r.x),
                Math.min(union.y, r.y),
                Math.max(union.right, r.right) - Math.min(union.x, r.x),
                Math.max(union.bottom, r.bottom) - Math.min(union.y, r.y),
              )
            : DOMRect.fromRect(r);
        }
      }
      return union;
    };

    const rootArea = rootRect.width * rootRect.height;

    const paintsDecoration = (s: CSSStyleDeclaration, rect: DOMRect): boolean => {
      const bw = parseFloat(s.borderTopWidth);
      const hasBorder = Number.isFinite(bw) && bw > 0 && s.borderTopStyle !== "none" && hasAlpha(s.borderTopColor);
      const r = radiusPx(s.borderTopLeftRadius, rect);
      return hasAlpha(s.backgroundColor) || hasBorder || (r !== undefined && r > 0);
    };

    /**
     * The element whose background/border/radius visually belong to `el`:
     * `el` itself when it paints any, else the nearest ancestor (below the
     * root) reached through a chain of single-child, textless wrappers that
     * paints some. Otherwise `el` (undecorated).
     */
    const decorationSource = (
      el: Element,
      rect: DOMRect,
      cs: CSSStyleDeclaration,
    ): { cs: CSSStyleDeclaration; rect: DOMRect } => {
      if (paintsDecoration(cs, rect)) return { cs, rect };
      let node: Element = el;
      for (;;) {
        const parent = node.parentElement;
        if (!parent || parent === root || parent.children.length !== 1) break;
        const ownText = Array.from(parent.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
        );
        if (ownText) break;
        const pcs = getComputedStyle(parent);
        const pRect = parent.getBoundingClientRect();
        if (paintsDecoration(pcs, pRect)) return { cs: pcs, rect: pRect };
        node = parent;
      }
      return { cs, rect };
    };

    const emit = (el: Element, elRect: DOMRect, cs: CSSStyleDeclaration, ownText: string) => {
      const tag = el.tagName.toLowerCase();
      const isImage = tag === "img" || tag === "picture" || tag === "video";
      const isIcon = tag === "svg";
      // A childless, textless box covering (almost) the whole capture is a
      // backdrop/scrim, whose extent is the viewport's, not the design's.
      const isBackdrop =
        !ownText && !isImage && !isIcon && rootArea > 0 && (elRect.width * elRect.height) / rootArea >= 0.9;
      const role = ownText ? "text" : isImage ? "image" : isIcon ? "icon" : isBackdrop ? "backdrop" : "box";
      const rect = (ownText && inkBox(el)) || elRect;

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
      // Decoration (background, border, radius) comes from the leaf itself
      // or, when the leaf paints none, from the nearest ancestor of which it
      // is the ONLY child: a <button><span>⋯</span></button> and a bordered
      // <div>⋯</div> are the same bordered pill, and one side's markup must
      // not decide whether the border is "missing".
      const { cs: dcs, rect: dRect } = decorationSource(el, elRect, cs);
      if (hasAlpha(dcs.backgroundColor)) style["backgroundColor"] = dcs.backgroundColor;
      const radius = radiusPx(dcs.borderTopLeftRadius, dRect);
      if (radius !== undefined && radius > 0) style["borderRadius"] = radius;
      const bw = pxOrUndef(dcs.borderTopWidth);
      // A transparent border (Tailwind `border border-transparent`) paints nothing.
      if (bw !== undefined && bw > 0 && dcs.borderTopStyle !== "none" && hasAlpha(dcs.borderTopColor)) {
        style["borderWidth"] = bw;
        style["borderColor"] = dcs.borderTopColor;
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
