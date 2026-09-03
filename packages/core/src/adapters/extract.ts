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

    // CSS `opacity` fades the whole element (and its subtree); the computed
    // colors do not carry it. Fold the effective opacity (product down the
    // ancestor chain from the root) into the alpha of every emitted color,
    // the way the Figma adapter folds paint opacity — a `disabled:opacity-50`
    // button then reports rgba(…, 0.5), not its full-strength background.
    const withOpacity = (color: string, opacity: number): string => {
      if (opacity >= 1) return color;
      const fold = (a: string | undefined): number =>
        Math.round((a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a)) * opacity * 1000) / 1000;
      // Legacy comma syntax: rgb(r, g, b) / rgba(r, g, b, a).
      const legacy = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.%]+)\s*)?\)$/.exec(color);
      if (legacy) return `rgba(${legacy[1]}, ${legacy[2]}, ${legacy[3]}, ${fold(legacy[4])})`;
      // CSS Color 4 space syntax with an optional slash alpha — Chrome emits
      // `oklab(l a b / .4)` / `color(srgb …)` for Tailwind v4 alpha colors.
      const modern = /^([a-z-]+)\((.*?)(?:\s*\/\s*([\d.%]+))?\s*\)$/.exec(color);
      if (modern) return `${modern[1]}(${modern[2]} / ${fold(modern[3])})`;
      return color;
    };

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
    /** A drop shadow the eye reads as elevation — "none" is the CSS default. */
    const shadowOf = (s: CSSStyleDeclaration): string | undefined => {
      const v = (s.boxShadow || "").trim();
      return v === "" || v === "none" ? undefined : v;
    };

    /**
     * The element whose background/border/radius visually belong to `el`:
     * `el` itself when it paints any, else the nearest ancestor (below the
     * root) reached through a chain of single-child, textless wrappers that
     * paints some. Otherwise `el` (undecorated).
     */
    /** An svg, or a small textless wrapper around nothing but svg — what `emit` reports as an icon. */
    const isIconLike = (e: Element): boolean => {
      if (e.tagName.toLowerCase() === "svg") return true;
      if ((e.textContent ?? "").trim() !== "" || e.querySelector("svg") === null) return false;
      const r = e.getBoundingClientRect();
      return Math.max(r.width, r.height) <= 64 && Array.from(e.querySelectorAll("*")).every((d) => d.namespaceURI === "http://www.w3.org/2000/svg" || (d.textContent ?? "").trim() === "");
    };

    const decorationSource = (
      el: Element,
      rect: DOMRect,
      cs: CSSStyleDeclaration,
    ): { cs: CSSStyleDeclaration; rect: DOMRect; el: Element } => {
      if (paintsDecoration(cs, rect)) return { cs, rect, el };
      let node: Element = el;
      for (;;) {
        const parent = node.parentElement;
        // The root may donate too (a captured `selector` node that IS the
        // painted button around a lone label) — same rule as the Figma side,
        // including icon siblings: `<div class="alert"><svg/><p>msg</p></div>`
        // gives its border/radius to the message, as the Figma frame does.
        if (!parent) break;
        const siblings = Array.from(parent.children).filter((c) => c !== node);
        if (!siblings.every(isIconLike)) break;
        const ownText = Array.from(parent.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
        );
        if (ownText) break;
        const pcs = getComputedStyle(parent);
        const pRect = parent.getBoundingClientRect();
        if (paintsDecoration(pcs, pRect)) return { cs: pcs, rect: pRect, el: parent };
        node = parent;
      }
      return { cs, rect, el };
    };

    const emit = (
      el: Element,
      elRect: DOMRect,
      cs: CSSStyleDeclaration,
      ownText: string,
      opacity: number,
      isSurface = false,
    ) => {
      const tag = el.tagName.toLowerCase();
      const isImage = tag === "img" || tag === "picture" || tag === "video";
      const isIcon = tag === "svg";
      // A shape INSIDE an svg (never the svg itself, which is the icon case).
      const isSvgShape = el.namespaceURI === SVG_NS && tag !== "svg";
      // A childless, textless box covering (almost) the whole capture is a
      // backdrop/scrim, whose extent is the viewport's, not the design's.
      const isBackdrop =
        !ownText && !isImage && !isIcon && rootArea > 0 && (elRect.width * elRect.height) / rootArea >= 0.9;
      // "surface": a CONTAINER that paints. Its own children carry the text, so
      // it is not a leaf and was never emitted before — which made a bar vs a
      // floating pill (background, border, radius, shadow, width) invisible to
      // both channels at once. Kept a distinct role so a pair can switch it off
      // with `roles: ["surface"]` and so the checks can be read separately.
      const role = ownText
        ? "text"
        : isImage
          ? "image"
          : isIcon
            ? "icon"
            : isSvgShape
              ? // Its own role, like `surface` before it: a channel that makes new
                // things visible makes new noise, and a pair needs to be able to
                // switch it off (`roles: ["shape"]`) without switching off every
                // box. Nothing in the matcher or the checks reads a role except
                // `backdrop`, so this costs no pairing quality. The FIGMA side
                // keeps emitting its vectors as `box` / `icon` — that channel is
                // years older and its noise is not new; a Figma pair switching
                // `shape` off therefore silences the DOM side only.
                "shape"
              : isBackdrop
                ? "backdrop"
                : isSurface
                  ? "surface"
                  : "box";
      const rect = (ownText && inkBox(el)) || elRect;

      const style: Record<string, unknown> = {};
      // An SVG shape's design IS its paint, and it is a different vocabulary:
      // `fill` where HTML says background, `stroke` where HTML says border,
      // `stroke-dasharray` where HTML says border-style, `rx` where HTML says
      // border-radius. Mapped onto the HTML names — the same mapping the FIGMA
      // adapter already does from `fills` / `strokes` / `strokeDashes`, because
      // Figma's model is vector paint too, so all three sides end up comparable.
      // It also SKIPS the decoration hoisting below: a shape that paints nothing
      // is not asking its ancestors for a background, and walking up from inside
      // an overlay would hand it the pane's.
      if (isSvgShape) {
        if (ownText) {
          style["color"] = withOpacity(cs.fill !== "none" && hasAlpha(cs.fill) ? cs.fill : cs.color, opacity);
          style["fontFamily"] = firstFontFamily(cs.fontFamily);
          style["fontSize"] = pxOrUndef(cs.fontSize);
          const fw = parseInt(cs.fontWeight, 10);
          if (Number.isFinite(fw)) style["fontWeight"] = fw;
        } else if (cs.fill.startsWith("rgb") && hasAlpha(cs.fill)) {
          style["backgroundColor"] = withOpacity(cs.fill, opacity);
        } else if (cs.fill !== "none" && cs.fill !== "") {
          // A PAINT SERVER, not a colour: `url("#hatch-critical")`, a gradient.
          // It belongs nowhere near backgroundColor — colorDelta cannot parse it
          // (it would silently return undefined and compare nothing), and it
          // would sit in presenceIdentity as a suppression key made of an
          // element id. Captured, so a reader sees the shape is patterned, and
          // NOT compared: comparing paint servers is its own decision, still open.
          style["backgroundImage"] = cs.fill;
        }
        const sw = pxOrUndef(cs.strokeWidth);
        if (cs.stroke !== "none" && hasAlpha(cs.stroke) && sw !== undefined && sw > 0) {
          style["borderWidth"] = sw;
          style["borderColor"] = withOpacity(cs.stroke, opacity);
          // A dash array IS a dashed border; anything else is solid.
          style["borderStyle"] = cs.strokeDasharray !== "" && cs.strokeDasharray !== "none" ? "dashed" : "solid";
        }
        const rx = pxOrUndef(el.getAttribute("rx") ?? "");
        if (rx !== undefined && rx > 0) style["borderRadius"] = rx;
        const shadow = shadowOf(cs);
        if (shadow !== undefined) style["boxShadow"] = shadow;
        const shapeNode: Record<string, unknown> = {
          id: `${tag}-${seq++}`,
          box: {
            x: round(rect.x - rootRect.x),
            y: round(rect.y - rootRect.y),
            w: round(rect.width),
            h: round(rect.height),
          },
          role,
        };
        if (ownText) shapeNode["text"] = ownText;
        if (Object.keys(style).length > 0) shapeNode["style"] = style;
        out.push(shapeNode);
        return;
      }
      if (ownText) {
        style["color"] = withOpacity(cs.color, opacity);
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
      const { cs: dcs, rect: dRect, el: donor } = decorationSource(el, elRect, cs);
      // A container whose paint was HOISTED onto this leaf must not also emit as a
      // surface: the difference is already comparable here, and emitting both would
      // report every pill twice. figma-tree.test.ts pins the same rule on the Figma
      // side ("Container with children and decoration is not itself a leaf").
      if (donor !== el) claimed.add(donor);
      if (hasAlpha(dcs.backgroundColor)) style["backgroundColor"] = withOpacity(dcs.backgroundColor, opacity);
      const radius = radiusPx(dcs.borderTopLeftRadius, dRect);
      if (radius !== undefined && radius > 0) style["borderRadius"] = radius;
      const bw = pxOrUndef(dcs.borderTopWidth);
      // A transparent border (Tailwind `border border-transparent`) paints nothing.
      if (bw !== undefined && bw > 0 && dcs.borderTopStyle !== "none" && hasAlpha(dcs.borderTopColor)) {
        style["borderWidth"] = bw;
        style["borderColor"] = withOpacity(dcs.borderTopColor, opacity);
        // Dashed vs solid is a design decision, and only this side can be wrong
        // about it: on an element with no visible border the value is "none" and
        // says nothing, so it is set only where a border paints.
        style["borderStyle"] = dcs.borderTopStyle;
      }
      if (opacity < 1) style["opacity"] = Math.round(opacity * 1000) / 1000;
      // Elevation is design: a floating pill and a flush bar differ by it and by
      // nothing else measurable. Captured for every element, not just surfaces.
      const shadow = shadowOf(dcs);
      if (shadow !== undefined) style["boxShadow"] = shadow;

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

    /**
     * A surface's paint signature: two nested wrappers that paint the SAME thing
     * over the same box are one surface to a reader, and emitting both would
     * double every finding about it.
     */
    const paintKey = (cs: CSSStyleDeclaration, rect: DOMRect): string =>
      [
        cs.backgroundColor,
        cs.borderTopWidth,
        cs.borderTopColor,
        cs.borderTopStyle,
        radiusPx(cs.borderTopLeftRadius, rect) ?? 0,
        shadowOf(cs) ?? "",
      ].join("|");

    // ---- SVG content -----------------------------------------------------
    // An <svg> used to be atomic at any size, so anything drawn inside a large
    // one was invisible to the structural channel: a mark layer, a chart, an
    // overlay. Measured cost: a dashed, hatched footprint shipped painting
    // NOTHING (an inherited opacity:0) through a converged loop and 497 green
    // tests, because no channel could pair it and the only evidence was a crop.
    // The FIGMA side already descends — a RECTANGLE emits as `box`, other
    // vectors as `icon`, and only a small all-vector container collapses — so
    // descending here makes the two adapters agree rather than diverge.
    const SVG_NS = "http://www.w3.org/2000/svg";
    /** Icon-sized: atomic, exactly as the Figma side's MAX_ICON_PX. */
    const SVG_ATOMIC_PX = 64;
    /**
     * A large svg holding more shapes than this is a DRAWING, not a set of
     * elements: collapse it to one icon. Same judgement as the icon rule at a
     * different scale, and it keeps the matcher's candidate pass (design ×
     * impl) from exploding on an illustration.
     */
    const SVG_SHAPE_CAP = 24;
    const SVG_GEOMETRY = new Set(["rect", "circle", "ellipse", "line", "polyline", "polygon", "path"]);
    /** Never rendered, so never extracted — this is where a <pattern> or a clip lives. */
    const SVG_NON_RENDERING = new Set([
      "defs", "clippath", "mask", "pattern", "marker", "symbol",
      "lineargradient", "radialgradient", "filter", "title", "desc", "metadata",
    ]);
    const svgPaints = (cs: CSSStyleDeclaration): boolean =>
      (cs.fill !== "none" && hasAlpha(cs.fill)) ||
      (cs.stroke !== "none" && hasAlpha(cs.stroke) && (pxOrUndef(cs.strokeWidth) ?? 0) > 0);
    /** The painting geometry inside an svg, big enough to be an element of its own. */
    const svgShapesIn = (svg: Element): Element[] =>
      Array.from(svg.querySelectorAll("*")).filter((e) => {
        if (e.namespaceURI !== SVG_NS) return false;
        const t = e.tagName.toLowerCase();
        if (!SVG_GEOMETRY.has(t) && t !== "text") return false;
        if (e.closest("defs, clipPath, mask, pattern, marker, symbol") !== null) return false;
        const r = e.getBoundingClientRect();
        if (Math.max(r.width, r.height) < 8) return false;
        return t === "text" ? (e.textContent ?? "").trim() !== "" : svgPaints(getComputedStyle(e));
      });
    /**
     * Descend into this svg, or keep it atomic? Decided by the SHAPES, never by
     * the svg's own box: a mark layer is a 1×1 px svg with `overflow:visible`
     * whose rects are hundreds of px wide, so a container-size test called the
     * whole overlay an icon and changed nothing (measured, first attempt).
     * Descend when the content is sparse enough to enumerate AND something in
     * it is bigger than an icon; a set of small shapes is an icon, and a dense
     * set is a drawing.
     */
    const descendSvg = (svg: Element): boolean => {
      const shapes = svgShapesIn(svg);
      if (shapes.length === 0 || shapes.length > SVG_SHAPE_CAP) return false;
      return shapes.some((e) => {
        const r = e.getBoundingClientRect();
        return Math.max(r.width, r.height) > SVG_ATOMIC_PX;
      });
    };

    /** Containers whose paint a descendant leaf already carries (hoisted). */
    const claimed = new Set<Element>();
    /** Painting containers, emitted AFTER the walk so `claimed` is complete. */
    const surfaceCandidates: { el: Element; rect: DOMRect; cs: CSSStyleDeclaration; opacity: number }[] = [];

    const walk = (
      el: Element,
      isRoot: boolean,
      inheritedOpacity: number,
      enclosing?: { box: DOMRect; key: string },
    ) => {
      const cs = getComputedStyle(el);
      const ownOpacity = parseFloat(cs.opacity);
      if (cs.display === "none" || cs.visibility === "hidden" || ownOpacity === 0) return;
      const opacity = inheritedOpacity * (Number.isFinite(ownOpacity) ? ownOpacity : 1);
      const rect = el.getBoundingClientRect();
      // Zero size hides the element itself but NOT its children — portal
      // wrappers and overflowing containers have no box of their own while
      // hosting fixed/absolute content. Descend; just never emit.
      const zeroSize = rect.width < 1 || rect.height < 1;

      const tag = el.tagName.toLowerCase();
      if (tag === "script" || tag === "style" || tag === "link" || tag === "noscript") return;
      if (el.namespaceURI === SVG_NS && SVG_NON_RENDERING.has(tag)) return;
      // An svg is an atomic icon while it is icon-sized or too dense to be a set
      // of elements; a large sparse one (a mark layer, a diagram, a chart) is
      // walked, and its shapes emit with their own paint — see svgShapesIn.
      const treatAsLeaf =
        (tag === "svg" && !descendSvg(el)) || tag === "img" || tag === "video" || tag === "canvas";
      const elementChildren = treatAsLeaf ? [] : Array.from(el.children);

      const rawText = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join("")
        .replace(/\s+/g, " ")
        .trim();
      // Emit what is SHOWN: `text-transform` is part of the rendered text the
      // same way Figma's `textCase` is (the Figma adapter applies that one).
      const ownText =
        cs.textTransform === "uppercase"
          ? rawText.toUpperCase()
          : cs.textTransform === "lowercase"
            ? rawText.toLowerCase()
            : cs.textTransform === "capitalize"
              ? rawText.replace(/(^|\s)(\S)/g, (_, sp: string, ch: string) => sp + ch.toUpperCase())
              : rawText;

      // Leaves always emit; containers emit only when they carry direct text
      // (mixed content like <p>Total <b>12</b></p>). The root never emits,
      // nor do sub-visible boxes (≤2px in BOTH dimensions — the sr-only
      // clip pattern; real hairlines are thin in only one axis).
      const subVisible = rect.width <= 2 && rect.height <= 2;

      // …and a container that PAINTS emits as a surface. Without this, design
      // that lives only on a container — a background, a border, a radius, a
      // shadow, a width — is invisible to the whole harness: not a leaf, so
      // never extracted; never extracted, so never matched; never matched, so
      // the pixel channel never diffs it either.
      const isContainer = elementChildren.length > 0 && !ownText;
      const key = paintKey(cs, rect);
      // Big enough to be a surface rather than a rule or a divider, and not a
      // repeat of the enclosing surface's own paint over (almost) the same box.
      const sameAsEnclosing =
        enclosing !== undefined &&
        enclosing.key === key &&
        Math.abs(enclosing.box.width - rect.width) <= 2 &&
        Math.abs(enclosing.box.height - rect.height) <= 2;
      const isSurface =
        isContainer &&
        (paintsDecoration(cs, rect) || shadowOf(cs) !== undefined) &&
        rect.width >= 8 &&
        rect.height >= 8 &&
        !sameAsEnclosing;

      if (!isRoot && !zeroSize && !subVisible && (elementChildren.length === 0 || ownText))
        emit(el, rect, cs, ownText, opacity);
      // Deferred: whether this container's paint is claimed by a leaf is only known
      // once its whole subtree has been walked.
      if (!isRoot && !zeroSize && !subVisible && isSurface)
        surfaceCandidates.push({ el, rect, cs, opacity });

      const nextEnclosing = isSurface ? { box: rect, key } : enclosing;
      for (const child of elementChildren) walk(child, false, opacity, nextEnclosing);
    };

    walk(root, true, 1);
    for (const c of surfaceCandidates) {
      if (claimed.has(c.el)) continue;
      emit(c.el, c.rect, c.cs, "", c.opacity, true);
    }
    return {
      width: round(rootRect.width),
      height: round(rootRect.height),
      elements: out,
    };
  }, { sel: rootSelector, viewportOrigin });

  return raw as RawExtraction | null;
}
