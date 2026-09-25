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

import type { ElementNode } from "../types.js"
import type { Page } from "playwright"

interface RawExtraction {
  width: number
  height: number
  elements: ElementNode[]
  /**
   * PAINTING CONTAINERS, for the container channel only — never merged into
   * `elements`. See the list's own note inside the walk for why they are kept
   * apart and why their admission rule is wider than a surface's.
   */
  containers: ElementNode[]
}

export interface ExtractOptions {
  /**
   * Use the viewport as the coordinate origin and dimensions instead of the
   * root's own box — for overlay captures (portaled dialogs) where the shot
   * is the viewport and the root (<body>) can have zero height.
   */
  viewportOrigin?: boolean
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
  const raw = await page.evaluate(
    (arg: { sel: string; viewportOrigin: boolean }) => {
      const root = document.querySelector(arg.sel)
      if (!root) return null
      const rootBox = root.getBoundingClientRect()
      const rootRect = arg.viewportOrigin
        ? { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }
        : { x: rootBox.x, y: rootBox.y, width: rootBox.width, height: rootBox.height }

      const round = (n: number) => Math.round(n * 100) / 100

      const pxOrUndef = (v: string): number | undefined => {
        const n = parseFloat(v)
        return Number.isFinite(n) ? round(n) : undefined
      }

      const radiusPx = (v: string, rect: DOMRect): number | undefined => {
        // Computed border-radius can be "8px", "50%", or "8px 8px" (x/y radii).
        // Pill radii ("9999px") are clamped by the browser to half the shorter
        // side — report the effective radius, not the declared one.
        const first = v.split(" ")[0] ?? ""
        const n = parseFloat(first)
        if (!Number.isFinite(n)) return undefined
        const maxRadius = Math.min(rect.width, rect.height) / 2
        if (first.endsWith("%"))
          return round(Math.min((n / 100) * Math.min(rect.width, rect.height), maxRadius))
        return round(Math.min(n, maxRadius))
      }

      const hasAlpha = (color: string): boolean => {
        const m = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*([\d.]+)\s*)?\)/.exec(color)
        if (!m) return color !== "transparent"
        return m[1] === undefined || parseFloat(m[1]) > 0
      }

      const firstFontFamily = (v: string): string =>
        (v.split(",")[0] ?? v).trim().replace(/^["']|["']$/g, "")

      /**
       * The USED line-height in px — including when the computed value is the
       * keyword `normal`.
       *
       * `getComputedStyle().lineHeight` returns the STRING "normal" whenever the
       * author wrote a `font:` shorthand without a ratio, which is how every
       * `.dc.html` comp is authored; a Tailwind implementation emits explicit px.
       * Dropping the property on the `normal` side left `structural/checks.ts`'s
       * line-height comparison — which requires the value on BOTH sides — silently
       * never running. Measured over the four `messages-*` run dirs on 2026-09-16:
       * 11 of 202 design text nodes carried it, against 194 of 194 implementation
       * ones. The leading difference hiding there was absorbed by the alignment fit
       * as a whole-page `scaleY 1.10`, which reads as "the layouts disagree
       * vertically" and names no element; deriving it by hand cost a session.
       *
       * `normal` is not a number, but it IS measurable: one line in a hidden probe
       * carrying the same font resolves to exactly the used value. Keyed on the
       * whole font signature — the full family LIST, so fallbacks resolve the way
       * the real element's do — and cached, because a page has few distinct fonts
       * and many text nodes.
       */
      const usedNormal = new Map<string, number | undefined>()
      let probe: HTMLElement | undefined
      const usedLineHeight = (cs: CSSStyleDeclaration): number | undefined => {
        if (cs.lineHeight !== "normal") return pxOrUndef(cs.lineHeight)
        const stretch = cs.getPropertyValue("font-stretch")
        const key = [cs.fontFamily, cs.fontSize, cs.fontWeight, cs.fontStyle, stretch].join("|")
        if (usedNormal.has(key)) return usedNormal.get(key)
        if (!probe) {
          // `fixed` so the probe cannot extend the scrollable area — an absolutely
          // positioned one can, and then the capture is of a page this measurement
          // changed. `visibility:hidden` lays out without painting.
          probe = document.createElement("div")
          probe.setAttribute("aria-hidden", "true")
          probe.style.cssText =
            "position:fixed;top:0;left:0;visibility:hidden;white-space:pre;margin:0;padding:0;border:0"
          document.body.appendChild(probe)
        }
        probe.style.fontFamily = cs.fontFamily
        probe.style.fontSize = cs.fontSize
        probe.style.fontWeight = cs.fontWeight
        probe.style.fontStyle = cs.fontStyle
        probe.style.setProperty("font-stretch", stretch)
        probe.style.lineHeight = "normal"
        probe.textContent = "Ag"
        const h = round(probe.getBoundingClientRect().height)
        const value = h > 0 ? h : undefined
        usedNormal.set(key, value)
        return value
      }

      // CSS `opacity` fades the whole element (and its subtree); the computed
      // colors do not carry it. Fold the effective opacity (product down the
      // ancestor chain from the root) into the alpha of every emitted color,
      // the way the Figma adapter folds paint opacity — a `disabled:opacity-50`
      // button then reports rgba(…, 0.5), not its full-strength background.
      const withOpacity = (color: string, opacity: number): string => {
        if (opacity >= 1) return color
        const fold = (a: string | undefined): number =>
          Math.round(
            (a === undefined ? 1 : a.endsWith("%") ? parseFloat(a) / 100 : parseFloat(a)) *
              opacity *
              1000,
          ) / 1000
        // Legacy comma syntax: rgb(r, g, b) / rgba(r, g, b, a).
        const legacy =
          /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.%]+)\s*)?\)$/.exec(color)
        if (legacy) return `rgba(${legacy[1]}, ${legacy[2]}, ${legacy[3]}, ${fold(legacy[4])})`
        // CSS Color 4 space syntax with an optional slash alpha — Chrome emits
        // `oklab(l a b / .4)` / `color(srgb …)` for Tailwind v4 alpha colors.
        const modern = /^([a-z-]+)\((.*?)(?:\s*\/\s*([\d.%]+))?\s*\)$/.exec(color)
        if (modern) return `${modern[1]}(${modern[2]} / ${fold(modern[3])})`
        return color
      }

      const out: Array<Record<string, unknown>> = []
      let seq = 0
      // The container list numbers itself. `seq` identifies ELEMENTS, and those ids are written
      // to `elements.json` and resolved by the annotator; letting containers consume from it
      // shifted every element id downstream of the first painting container on every capture.
      let cseq = 0

      // The glyph-ink box of an element's own text nodes: a block-level cell
      // and a shrink-wrapped span rendering the same string must measure the
      // same, otherwise every label reports a bogus size difference.
      const inkBox = (el: Element): DOMRect | undefined => {
        let union: DOMRect | undefined
        for (const n of Array.from(el.childNodes)) {
          if (n.nodeType !== Node.TEXT_NODE || !(n.textContent ?? "").trim()) continue
          const range = document.createRange()
          range.selectNodeContents(n)
          for (const r of Array.from(range.getClientRects())) {
            if (r.width < 0.5 || r.height < 0.5) continue
            union = union
              ? new DOMRect(
                  Math.min(union.x, r.x),
                  Math.min(union.y, r.y),
                  Math.max(union.right, r.right) - Math.min(union.x, r.x),
                  Math.max(union.bottom, r.bottom) - Math.min(union.y, r.y),
                )
              : DOMRect.fromRect(r)
          }
        }
        return union
      }

      const rootArea = rootRect.width * rootRect.height

      const paintsDecoration = (s: CSSStyleDeclaration, rect: DOMRect): boolean => {
        const bw = parseFloat(s.borderTopWidth)
        const hasBorder =
          Number.isFinite(bw) && bw > 0 && s.borderTopStyle !== "none" && hasAlpha(s.borderTopColor)
        const r = radiusPx(s.borderTopLeftRadius, rect)
        return hasAlpha(s.backgroundColor) || hasBorder || (r !== undefined && r > 0)
      }
      /** A drop shadow the eye reads as elevation — "none" is the CSS default. */
      const shadowOf = (s: CSSStyleDeclaration): string | undefined => {
        const v = (s.boxShadow || "").trim()
        return v === "" || v === "none" ? undefined : v
      }

      /**
       * The element whose background/border/radius visually belong to `el`:
       * `el` itself when it paints any, else the nearest ancestor (below the
       * root) reached through a chain of single-child, textless wrappers that
       * paints some. Otherwise `el` (undecorated).
       */
      /** An svg, or a small textless wrapper around nothing but svg — what `emit` reports as an icon. */
      const isIconLike = (e: Element): boolean => {
        if (e.tagName.toLowerCase() === "svg") return true
        if ((e.textContent ?? "").trim() !== "" || e.querySelector("svg") === null) return false
        const r = e.getBoundingClientRect()
        return (
          Math.max(r.width, r.height) <= 64 &&
          Array.from(e.querySelectorAll("*")).every(
            (d) =>
              d.namespaceURI === "http://www.w3.org/2000/svg" ||
              (d.textContent ?? "").trim() === "",
          )
        )
      }

      const decorationSource = (
        el: Element,
        rect: DOMRect,
        cs: CSSStyleDeclaration,
      ): { cs: CSSStyleDeclaration; rect: DOMRect; el: Element } => {
        if (paintsDecoration(cs, rect)) return { cs, rect, el }
        let node: Element = el
        for (;;) {
          const parent = node.parentElement
          // The root may donate too (a captured `selector` node that IS the
          // painted button around a lone label) — same rule as the Figma side,
          // including icon siblings: `<div class="alert"><svg/><p>msg</p></div>`
          // gives its border/radius to the message, as the Figma frame does.
          if (!parent) break
          const siblings = Array.from(parent.children).filter((c) => c !== node)
          if (!siblings.every(isIconLike)) break
          const ownText = Array.from(parent.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
          )
          if (ownText) break
          const pcs = getComputedStyle(parent)
          const pRect = parent.getBoundingClientRect()
          if (paintsDecoration(pcs, pRect)) return { cs: pcs, rect: pRect, el: parent }
          node = parent
        }
        return { cs, rect, el }
      }

      const AFFORDANCE_ROOT_STOP = root

      /** Is this node itself a control a keyboard can reach? */
      const isControl = (node: Element): boolean => {
        const tag = node.tagName.toLowerCase()
        if (tag === "button" || tag === "select" || tag === "textarea" || tag === "input")
          return true
        // An <a> is a control only WITH an href — a bare anchor is a named spot.
        if (tag === "a" && node.hasAttribute("href")) return true
        if (tag === "summary" || tag === "label") return true
        const tabindex = node.getAttribute("tabindex")
        if (tabindex !== null && Number.parseInt(tabindex, 10) >= 0) return true
        // `contenteditable` is the composer case: a div you can type into.
        return node.getAttribute("contenteditable") === "true"
      }

      /**
       * The nearest control at or above this element, or null.
       *
       * Walks UP on purpose. The clickable thing is almost always a wrapper —
       * `<button><svg/></button>`, `<a><span>Zobraziť</span></a>` — and the
       * element the matcher paired is the glyph inside it, which carries no
       * semantics of its own. Stopping at the element itself would report every
       * correctly-built icon button as dead.
       */
      const controlFor = (el: Element): Element | null => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          if (isControl(node)) return node
          if (node === AFFORDANCE_ROOT_STOP) break
        }
        return null
      }

      /**
       * Present to the eye, absent to everything else — measured FROM THE
       * CONTROL, not from the element the matcher happened to pair.
       *
       * That distinction is the whole correctness of this check.
       * `<button aria-label="Nahrať"><svg aria-hidden/></button>` is the
       * RECOMMENDED way to build an icon button: the glyph is decorative and the
       * button carries the name. Asking "is this glyph in the a11y tree" answers
       * "no" and is a false positive; asking "is the control that owns it
       * reachable" answers "yes", which is the truth. Measured the first time
       * this ran against a real pair: six of its nine affordance findings were
       * exactly this pattern, all of them correct code.
       *
       * With no control at all, the element's own subtree is the right thing to
       * ask about — there is nothing else to ask about, and an `aria-hidden`
       * decorative span is then genuinely invisible to everything but a mouse.
       */
      const isAriaHidden = (el: Element, control: Element | null): boolean => {
        for (let node: Element | null = control ?? el; node; node = node.parentElement) {
          if (node.getAttribute("aria-hidden") === "true") return true
          if (node.hasAttribute("inert")) return true
          if (node === AFFORDANCE_ROOT_STOP) break
        }
        return false
      }

      /**
       * `cursor` is the signal that works on BOTH sides of a dc-html pair, which
       * is why it is the design-side test rather than the handler.
       *
       * The comps write `onClick="{{ … }}"` alongside `cursor:pointer` on the same
       * element; the dc runtime turns the first into a React handler that leaves
       * no attribute in the rendered DOM, while the second survives into the
       * computed style. So the comp's own statement "this is clickable" IS the
       * cursor, and reading it needs no knowledge of the runtime.
       *
       * `pointer` is read from `getComputedStyle`, and `cursor` is an INHERITED
       * property — so this is not, and cannot be, "the element's own declaration".
       * Every leaf inside a `cursor:pointer` row reports `pointer: true`, whether
       * or not anything was declared on it. The comment here used to claim the
       * opposite and describe that as a safeguard; it never was one.
       *
       * That is survivable only because `pointer` alone decides nothing: a finding
       * needs `pointer && !interactive`, and `interactive` walks up to the nearest
       * real control. The inherited `pointer` on a glyph inside a <button> is
       * paired with `interactive: true` from that same button and produces nothing.
       * What `pointer` is actually load-bearing for is the design side, where the
       * comp declares `cursor:pointer` on the thing it considers clickable.
       */
      const affordanceOf = (el: Element, cs: CSSStyleDeclaration) => {
        const control = controlFor(el)
        return {
          pointer: cs.cursor === "pointer",
          interactive: control !== null,
          hidden: isAriaHidden(el, control),
        }
      }

      /**
       * Is this element PAINTED OVER by something else?
       *
       * The visibility filter in `walk` asks only whether an element hid ITSELF
       * (`display:none`, `visibility:hidden`, `opacity:0`). A full-screen overlay
       * — a phone thread takeover, a modal, a drawer — hides nothing: everything
       * underneath keeps `display:block; visibility:visible; opacity:1` and is
       * merely covered. Those elements are extracted, matched and reported, and
       * because the two sides of a pair cover DIFFERENT things (a comp's thread
       * arm covers its own rail; an implementation's takeover covers the app
       * chrome) the ghosts never pair with each other. The result is a pile of
       * missing/extra findings about pixels no one can see, which also drags the
       * matched ratio down far enough to force the reconcile phase.
       *
       * Hit-testing is the only thing in the platform that answers "what is on
       * top here" — no CSS property does. Five points rather than one, so a
       * PARTIALLY covered element (a row half under a sticky header) still counts
       * as visible: occluded means every sampled point belongs to something else.
       *
       * Returns UNDEFINED where the hit test cannot speak, which is a different
       * claim from `false` and is kept distinct for the same reason `affordance`
       * is omitted rather than defaulted — only an explicit `true` is ever acted
       * on, so "cannot tell" must not arrive as "not occluded":
       *
       * - `pointer-events: none`. Hit-testing then reports whatever is BEHIND the
       *   element, so a decorative overlay would look occluded when it is the
       *   thing doing the occluding. A wrong `true` silently deletes a real
       *   finding.
       * - Nothing sampleable. Every sample point outside the viewport means no
       *   answer at all — "scrolled out of view" is not "painted over". This is
       *   the case to keep in mind on a FULL-PAGE capture, where the viewport is
       *   a window onto a much taller page and most elements fall outside it: the
       *   detection is largely inert there, and silently so. Measured on one
       *   viewport-sized phone pair: 13 visible, 12 occluded, 28 unsampleable.
       *
       * An ancestor or descendant coming back is NOT occlusion: the point is
       * inside this element's own subtree, which is what being on top looks like
       * for a text leaf inside its own wrapper.
       */
      const isOccluded = (
        el: Element,
        cs: CSSStyleDeclaration,
        r: DOMRect,
      ): boolean | undefined => {
        if (cs.pointerEvents === "none") return undefined
        if (r.width < 1 || r.height < 1) return undefined
        const points: [number, number][] = [
          [0.5, 0.5],
          [0.15, 0.15],
          [0.85, 0.15],
          [0.15, 0.85],
          [0.85, 0.85],
        ]
        let tested = 0
        let covered = 0
        for (const [fx, fy] of points) {
          const x = r.x + r.width * fx
          const y = r.y + r.height * fy
          if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) continue
          const top = document.elementFromPoint(x, y)
          if (top === null) continue
          tested++
          if (top === el || el.contains(top) || top.contains(el)) continue
          covered++
        }
        return tested === 0 ? undefined : covered === tested
      }

      const emit = (
        el: Element,
        elRect: DOMRect,
        cs: CSSStyleDeclaration,
        ownText: string,
        opacity: number,
        isSurface = false,
      ) => {
        const tag = el.tagName.toLowerCase()
        const isImage = tag === "img" || tag === "picture" || tag === "video"
        const isIcon = tag === "svg"
        // A shape INSIDE an svg (never the svg itself, which is the icon case).
        const isSvgShape = el.namespaceURI === SVG_NS && tag !== "svg"
        // A childless, textless box covering (almost) the whole capture is a
        // backdrop/scrim, whose extent is the viewport's, not the design's.
        const isBackdrop =
          !ownText &&
          !isImage &&
          !isIcon &&
          rootArea > 0 &&
          (elRect.width * elRect.height) / rootArea >= 0.9
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
                    : "box"
        const rect = (ownText && inkBox(el)) || elRect

        const style: Record<string, unknown> = {}
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
            style["color"] = withOpacity(
              cs.fill !== "none" && hasAlpha(cs.fill) ? cs.fill : cs.color,
              opacity,
            )
            style["fontFamily"] = firstFontFamily(cs.fontFamily)
            style["fontSize"] = pxOrUndef(cs.fontSize)
            const fw = parseInt(cs.fontWeight, 10)
            if (Number.isFinite(fw)) style["fontWeight"] = fw
          } else if (cs.fill.startsWith("rgb") && hasAlpha(cs.fill)) {
            style["backgroundColor"] = withOpacity(cs.fill, opacity)
          } else if (cs.fill !== "none" && cs.fill !== "") {
            // A PAINT SERVER, not a colour: `url("#hatch-critical")`, a gradient.
            // It belongs nowhere near backgroundColor — colorDelta cannot parse it
            // (it would silently return undefined and compare nothing), and it
            // would sit in presenceIdentity as a suppression key made of an
            // element id. Captured, so a reader sees the shape is patterned, and
            // NOT compared: comparing paint servers is its own decision, still open.
            style["backgroundImage"] = cs.fill
          }
          const sw = pxOrUndef(cs.strokeWidth)
          if (cs.stroke !== "none" && hasAlpha(cs.stroke) && sw !== undefined && sw > 0) {
            style["borderWidth"] = sw
            style["borderColor"] = withOpacity(cs.stroke, opacity)
            // A dash array IS a dashed border; anything else is solid.
            style["borderStyle"] =
              cs.strokeDasharray !== "" && cs.strokeDasharray !== "none" ? "dashed" : "solid"
          }
          const rx = pxOrUndef(el.getAttribute("rx") ?? "")
          if (rx !== undefined && rx > 0) style["borderRadius"] = rx
          const shadow = shadowOf(cs)
          if (shadow !== undefined) style["boxShadow"] = shadow
          const shapeNode: Record<string, unknown> = {
            id: `${tag}-${seq++}`,
            box: {
              x: round(rect.x - rootRect.x),
              y: round(rect.y - rootRect.y),
              w: round(rect.width),
              h: round(rect.height),
            },
            role,
          }
          if (ownText) shapeNode["text"] = ownText
          if (Object.keys(style).length > 0) shapeNode["style"] = style
          shapeNode["affordance"] = affordanceOf(el, cs)
          const shapeOccluded = isOccluded(el, cs, rect)
          if (shapeOccluded !== undefined) shapeNode["occluded"] = shapeOccluded
          out.push(shapeNode)
          return
        }
        if (ownText) {
          style["color"] = withOpacity(cs.color, opacity)
          style["fontFamily"] = firstFontFamily(cs.fontFamily)
          style["fontSize"] = pxOrUndef(cs.fontSize)
          const lh = usedLineHeight(cs)
          if (lh !== undefined) style["lineHeight"] = lh
          const fw = parseInt(cs.fontWeight, 10)
          if (Number.isFinite(fw)) style["fontWeight"] = fw
        }
        // Decoration (background, border, radius) comes from the leaf itself
        // or, when the leaf paints none, from the nearest ancestor of which it
        // is the ONLY child: a <button><span>⋯</span></button> and a bordered
        // <div>⋯</div> are the same bordered pill, and one side's markup must
        // not decide whether the border is "missing".
        const { cs: dcs, rect: dRect, el: donor } = decorationSource(el, elRect, cs)
        // A container whose paint was HOISTED onto this leaf must not also emit as a
        // surface: the difference is already comparable here, and emitting both would
        // report every pill twice. figma-tree.test.ts pins the same rule on the Figma
        // side ("Container with children and decoration is not itself a leaf").
        if (donor !== el) claimed.add(donor)
        if (hasAlpha(dcs.backgroundColor))
          style["backgroundColor"] = withOpacity(dcs.backgroundColor, opacity)
        const radius = radiusPx(dcs.borderTopLeftRadius, dRect)
        if (radius !== undefined && radius > 0) style["borderRadius"] = radius
        const bw = pxOrUndef(dcs.borderTopWidth)
        // A transparent border (Tailwind `border border-transparent`) paints nothing.
        if (
          bw !== undefined &&
          bw > 0 &&
          dcs.borderTopStyle !== "none" &&
          hasAlpha(dcs.borderTopColor)
        ) {
          style["borderWidth"] = bw
          style["borderColor"] = withOpacity(dcs.borderTopColor, opacity)
          // Dashed vs solid is a design decision, and only this side can be wrong
          // about it: on an element with no visible border the value is "none" and
          // says nothing, so it is set only where a border paints.
          style["borderStyle"] = dcs.borderTopStyle
        }
        if (opacity < 1) style["opacity"] = Math.round(opacity * 1000) / 1000
        // Elevation is design: a floating pill and a flush bar differ by it and by
        // nothing else measurable. Captured for every element, not just surfaces.
        const shadow = shadowOf(dcs)
        if (shadow !== undefined) style["boxShadow"] = shadow

        const node: Record<string, unknown> = {
          id: `${tag}-${seq++}`,
          box: {
            x: round(rect.x - rootRect.x),
            y: round(rect.y - rootRect.y),
            w: round(rect.width),
            h: round(rect.height),
          },
          role,
        }
        if (ownText) node["text"] = ownText
        if (Object.keys(style).length > 0) node["style"] = style
        // Always set, never conditional on being true: the affordance check has
        // to tell "not clickable" from "this adapter does not know", and an
        // omitted key is how the Figma side says the latter.
        node["affordance"] = affordanceOf(el, cs)
        // Same contract, same reason: absent means "this adapter cannot tell",
        // which is NOT the same claim as `false`. Two sources of absence — the
        // Figma side has no hit test at all, and a DOM element can be
        // unsampleable (outside the viewport, or pointer-events:none). The
        // pipeline only ever drops an explicit `true`.
        const occluded = isOccluded(el, cs, rect)
        if (occluded !== undefined) node["occluded"] = occluded
        out.push(node)
      }

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
        ].join("|")

      // ---- SVG content -----------------------------------------------------
      // An <svg> used to be atomic at any size, so anything drawn inside a large
      // one was invisible to the structural channel: a mark layer, a chart, an
      // overlay. Measured cost: a dashed, hatched footprint shipped painting
      // NOTHING (an inherited opacity:0) through a converged loop and 497 green
      // tests, because no channel could pair it and the only evidence was a crop.
      // The FIGMA side already descends — a RECTANGLE emits as `box`, other
      // vectors as `icon`, and only a small all-vector container collapses — so
      // descending here makes the two adapters agree rather than diverge.
      const SVG_NS = "http://www.w3.org/2000/svg"
      /** Icon-sized: atomic, exactly as the Figma side's MAX_ICON_PX. */
      const SVG_ATOMIC_PX = 64
      /**
       * A large svg holding more shapes than this is a DRAWING, not a set of
       * elements: collapse it to one icon. Same judgement as the icon rule at a
       * different scale, and it keeps the matcher's candidate pass (design ×
       * impl) from exploding on an illustration.
       */
      const SVG_SHAPE_CAP = 24
      const SVG_GEOMETRY = new Set([
        "rect",
        "circle",
        "ellipse",
        "line",
        "polyline",
        "polygon",
        "path",
      ])
      /** Never rendered, so never extracted — this is where a <pattern> or a clip lives. */
      const SVG_NON_RENDERING = new Set([
        "defs",
        "clippath",
        "mask",
        "pattern",
        "marker",
        "symbol",
        "lineargradient",
        "radialgradient",
        "filter",
        "title",
        "desc",
        "metadata",
      ])
      const svgPaints = (cs: CSSStyleDeclaration): boolean =>
        (cs.fill !== "none" && hasAlpha(cs.fill)) ||
        (cs.stroke !== "none" && hasAlpha(cs.stroke) && (pxOrUndef(cs.strokeWidth) ?? 0) > 0)
      /** The painting geometry inside an svg, big enough to be an element of its own. */
      const svgShapesIn = (svg: Element): Element[] =>
        Array.from(svg.querySelectorAll("*")).filter((e) => {
          if (e.namespaceURI !== SVG_NS) return false
          const t = e.tagName.toLowerCase()
          if (!SVG_GEOMETRY.has(t) && t !== "text") return false
          if (e.closest("defs, clipPath, mask, pattern, marker, symbol") !== null) return false
          const r = e.getBoundingClientRect()
          if (Math.max(r.width, r.height) < 8) return false
          return t === "text" ? (e.textContent ?? "").trim() !== "" : svgPaints(getComputedStyle(e))
        })
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
        const shapes = svgShapesIn(svg)
        if (shapes.length === 0 || shapes.length > SVG_SHAPE_CAP) return false
        return shapes.some((e) => {
          const r = e.getBoundingClientRect()
          return Math.max(r.width, r.height) > SVG_ATOMIC_PX
        })
      }

      /**
       * The CONTAINER channel's own list (see `structural/containers.ts`).
       *
       * A parallel list, never merged into `out`: the leaf model, the matcher,
       * the pixel channel and every count in the report are keyed on
       * `elements`, and adding hundreds of wrappers to it would move every
       * pair's numbers for a channel that pairs by matched-leaf identity and
       * needs none of them.
       *
       * The admission rule is deliberately WIDER than `isSurface`'s: a
       * container qualifies on paint on ANY side, because the commonest
       * container rule of all is a row separator — `border-bottom` and nothing
       * else — which `paintsDecoration` (top side only) reads as unpainted.
       * Measured on `messages-owner-mobile`: 45 design elements, exactly ONE of
       * them a surface, and the comp's five hairline-separated rail rows in
       * neither side's tree.
       */
      const containers: Record<string, unknown>[] = []

      /** Containers whose paint a descendant leaf already carries (hoisted). */
      const claimed = new Set<Element>()
      /** Painting containers, emitted AFTER the walk so `claimed` is complete. */
      const surfaceCandidates: {
        el: Element
        rect: DOMRect
        cs: CSSStyleDeclaration
        opacity: number
      }[] = []
      /** Container-channel candidates, deferred for the same reason as `surfaceCandidates`. */
      const containerCandidates: {
        el: Element
        tag: string
        box: { x: number; y: number; w: number; h: number }
        style: Record<string, unknown>
      }[] = []

      const walk = (
        el: Element,
        isRoot: boolean,
        inheritedOpacity: number,
        enclosing?: { box: DOMRect; key: string },
      ) => {
        const cs = getComputedStyle(el)
        const ownOpacity = parseFloat(cs.opacity)
        if (cs.display === "none" || cs.visibility === "hidden" || ownOpacity === 0) return
        const opacity = inheritedOpacity * (Number.isFinite(ownOpacity) ? ownOpacity : 1)
        const rect = el.getBoundingClientRect()
        // Zero size hides the element itself but NOT its children — portal
        // wrappers and overflowing containers have no box of their own while
        // hosting fixed/absolute content. Descend; just never emit.
        const zeroSize = rect.width < 1 || rect.height < 1

        const tag = el.tagName.toLowerCase()
        if (tag === "script" || tag === "style" || tag === "link" || tag === "noscript") return
        if (el.namespaceURI === SVG_NS && SVG_NON_RENDERING.has(tag)) return
        // An svg is an atomic icon while it is icon-sized or too dense to be a set
        // of elements; a large sparse one (a mark layer, a diagram, a chart) is
        // walked, and its shapes emit with their own paint — see svgShapesIn.
        const treatAsLeaf =
          (tag === "svg" && !descendSvg(el)) || tag === "img" || tag === "video" || tag === "canvas"
        const elementChildren = treatAsLeaf ? [] : Array.from(el.children)

        const rawText = Array.from(el.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? "")
          .join("")
          .replace(/\s+/g, " ")
          .trim()
        // Emit what is SHOWN: `text-transform` is part of the rendered text the
        // same way Figma's `textCase` is (the Figma adapter applies that one).
        const ownText =
          cs.textTransform === "uppercase"
            ? rawText.toUpperCase()
            : cs.textTransform === "lowercase"
              ? rawText.toLowerCase()
              : cs.textTransform === "capitalize"
                ? rawText.replace(
                    /(^|\s)(\S)/g,
                    (_, sp: string, ch: string) => sp + ch.toUpperCase(),
                  )
                : rawText

        // Leaves always emit; containers emit only when they carry direct text
        // (mixed content like <p>Total <b>12</b></p>). The root never emits,
        // nor do sub-visible boxes (≤2px in BOTH dimensions — the sr-only
        // clip pattern; real hairlines are thin in only one axis).
        const subVisible = rect.width <= 2 && rect.height <= 2

        // …and a container that PAINTS emits as a surface. Without this, design
        // that lives only on a container — a background, a border, a radius, a
        // shadow, a width — is invisible to the whole harness: not a leaf, so
        // never extracted; never extracted, so never matched; never matched, so
        // the pixel channel never diffs it either.
        const isContainer = elementChildren.length > 0 && !ownText
        const key = paintKey(cs, rect)
        // Big enough to be a surface rather than a rule or a divider, and not a
        // repeat of the enclosing surface's own paint over (almost) the same box.
        const sameAsEnclosing =
          enclosing !== undefined &&
          enclosing.key === key &&
          Math.abs(enclosing.box.width - rect.width) <= 2 &&
          Math.abs(enclosing.box.height - rect.height) <= 2
        const isSurface =
          isContainer &&
          (paintsDecoration(cs, rect) || shadowOf(cs) !== undefined) &&
          rect.width >= 8 &&
          rect.height >= 8 &&
          !sameAsEnclosing

        // The container channel's parallel list — paint on ANY side, so a
        // bottom-border row separator is visible to it.
        if (!isRoot && !zeroSize && isContainer && rect.width >= 16 && rect.height >= 16) {
          const sides: Record<string, { width: number; color: string; style: string }> = {}
          for (const side of ["Top", "Right", "Bottom", "Left"] as const) {
            const w = pxOrUndef(cs[`border${side}Width`])
            const st = cs[`border${side}Style`]
            const col = cs[`border${side}Color`]
            if (w !== undefined && w > 0 && st !== "none" && hasAlpha(col)) {
              sides[side.toLowerCase()] = { width: w, color: withOpacity(col, opacity), style: st }
            }
          }
          const bg = hasAlpha(cs.backgroundColor)
            ? withOpacity(cs.backgroundColor, opacity)
            : undefined
          const radius = radiusPx(cs.borderTopLeftRadius, rect)
          const shadow = shadowOf(cs)
          // NO `paints` gate. It used to be one, and it made the channel blind to the single
          // case it exists for: "the comp draws a separator on every rail row and the impl draws
          // none". In that scenario the impl's wrapper is an undecorated <div> — transparent
          // background, every border `none`, radius 0, no shadow — so it never entered this list,
          // `pairContainers` found no counterpart for the design key, and the run was SILENT.
          //
          // The one production run that appeared to validate the channel
          // (`messages-owner-desktop`) only fired because that particular impl row happened to
          // carry `border-radius: 16.8px`; the missing separator rode in on the radius. Strip the
          // radius and the identical defect reports nothing.
          //
          // Emitting unpainted containers costs a map entry each: `pairContainers` still bounds
          // what is COMPARED (≥2 matched leaves, ≤70% of the frame, unique key), and `style` is
          // simply `{}` for a wrapper that paints nothing — which is exactly the value the
          // presence-flip checks need in order to see an absence at all.
          const style: Record<string, unknown> = {}
          if (bg !== undefined) style["backgroundColor"] = bg
          if (Object.keys(sides).length > 0) style["borderSides"] = sides
          if (radius !== undefined && radius > 0) style["borderRadius"] = radius
          if (shadow !== undefined) style["boxShadow"] = shadow
          // DEFERRED, exactly like `surfaceCandidates` below and for the same reason: whether a
          // descendant leaf has already taken this wrapper's paint (`decorationSource` hoisting)
          // is only known once its subtree has been walked. Pushing straight into `containers`
          // compared the same border twice — once on the leaf that inherited it and once on the
          // container — and the container channel has no "never duplicates a structural finding"
          // rule of its own to catch it.
          containerCandidates.push({
            el,
            tag,
            box: {
              x: round(rect.x - rootRect.x),
              y: round(rect.y - rootRect.y),
              w: round(rect.width),
              h: round(rect.height),
            },
            style,
          })
        }

        if (!isRoot && !zeroSize && !subVisible && (elementChildren.length === 0 || ownText))
          emit(el, rect, cs, ownText, opacity)
        // Deferred: whether this container's paint is claimed by a leaf is only known
        // once its whole subtree has been walked.
        if (!isRoot && !zeroSize && !subVisible && isSurface)
          surfaceCandidates.push({ el, rect, cs, opacity })

        const nextEnclosing = isSurface ? { box: rect, key } : enclosing
        for (const child of elementChildren) walk(child, false, opacity, nextEnclosing)
      }

      walk(root, true, 1)
      for (const c of surfaceCandidates) {
        if (claimed.has(c.el)) continue
        emit(c.el, c.rect, c.cs, "", c.opacity, true)
      }
      for (const c of containerCandidates) {
        if (claimed.has(c.el)) continue
        containers.push({
          id: `c:${c.tag}-${cseq++}`,
          box: c.box,
          role: "container",
          style: c.style,
        })
      }
      // The line-height probe leaves the DOM as it found it: the screenshot is
      // taken after extraction on some paths, and a stray node in the capture
      // would be a difference the harness itself introduced.
      probe?.remove()
      return {
        width: round(rootRect.width),
        height: round(rootRect.height),
        elements: out,
        containers,
      }
    },
    { sel: rootSelector, viewportOrigin },
  )

  return raw as RawExtraction | null
}
