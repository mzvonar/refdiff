/**
 * Pure view geometry for the split-screen viewer.
 *
 * Everything is expressed in ONE world space: impl CSS px (the aligned frame
 * that every `Finding` box already uses). The impl PNG maps into it through
 * its DPR only; the design PNG maps through its DPR and then the design→impl
 * `Alignment` (offset + per-axis scale). A single `View { z, tx, ty }`
 * (screen = world · z + t) is shared by both panes, so panning or zooming one
 * side moves the other by construction — that is what "synced" means here.
 *
 * This module is compiled to plain JS with no imports and embedded verbatim
 * into report.html (see render.ts), so keep it free of runtime dependencies.
 */

/** Minimal structural copies of the core types (this file must not import at runtime). */
export interface VBox {
  x: number
  y: number
  w: number
  h: number
}

export interface VAlignment {
  scale: number
  scaleY?: number
  offsetX: number
  offsetY: number
}

export interface View {
  /** World → screen zoom factor. */
  z: number
  tx: number
  ty: number
}

export interface Size {
  w: number
  h: number
}

/** How much of each pane edge lies under a panel drawn over the pane, in px. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export const IDENTITY_ALIGNMENT: VAlignment = { scale: 1, offsetX: 0, offsetY: 0 }

/** Design CSS px → world (impl CSS px). */
export function designToWorld(
  p: { x: number; y: number },
  a: VAlignment,
): { x: number; y: number } {
  return { x: p.x * a.scale + a.offsetX, y: p.y * (a.scaleY ?? a.scale) + a.offsetY }
}

/** World → design CSS px (inverse of `designToWorld`). */
export function worldToDesign(
  p: { x: number; y: number },
  a: VAlignment,
): { x: number; y: number } {
  return { x: (p.x - a.offsetX) / a.scale, y: (p.y - a.offsetY) / (a.scaleY ?? a.scale) }
}

/** The world-space box the design image covers (its CSS size through the alignment). */
export function designWorldBox(designCss: Size, a: VAlignment): VBox {
  return {
    x: a.offsetX,
    y: a.offsetY,
    w: designCss.w * a.scale,
    h: designCss.h * (a.scaleY ?? a.scale),
  }
}

export function unionBoxes(boxes: readonly VBox[]): VBox {
  const first = boxes[0]
  if (!first) return { x: 0, y: 0, w: 0, h: 0 }
  let x0 = first.x
  let y0 = first.y
  let x1 = first.x + first.w
  let y1 = first.y + first.h
  for (const b of boxes) {
    x0 = Math.min(x0, b.x)
    y0 = Math.min(y0, b.y)
    x1 = Math.max(x1, b.x + b.w)
    y1 = Math.max(y1, b.y + b.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * The design capture's RAW CSS size, undoing the run's normalization.
 *
 * `designWorldBox` and `designToWorld` map RAW design px into world px, so
 * feeding them `report.design.width` (already raw × `alignment.scale`) applies
 * the scale twice: the world box came out 1728×1495 for a 1280×1107 pair, so
 * "Fit" solved for a third more space than the content occupies and then
 * looked like it did nothing, because the view already was that fit.
 */
export function rawDesignSize(design: { width: number; height: number }, a: VAlignment): Size {
  const sx = a.scale > 0 ? a.scale : 1
  const sy = (a.scaleY ?? a.scale) > 0 ? (a.scaleY ?? a.scale) : 1
  return { w: design.width / sx, h: design.height / sy }
}

/**
 * Native PNG px per RAW design CSS px — the divisor `designImageTransform`
 * needs, and NOT `naturalWidth / report.design.width`.
 *
 * `design.width` is the capture already normalized onto the impl (raw CSS ×
 * `alignment.scale`, applied by `normalize` and `alignStructural`), while the
 * PNG is the raw capture. Inferring the ratio from it therefore returns
 * dpr / scale, and the design image renders `scale`× off — it did, on 40 of
 * uctoinak's 41 pairs. Runs that record `design.dpr` state it directly;
 * older reports recover it exactly by multiplying the scale back in.
 */
export function designCaptureDpr(
  naturalWidth: number,
  design: { width: number; dpr?: number },
  alignmentScale: number,
): number {
  if (design.dpr && design.dpr > 0) return design.dpr
  if (!naturalWidth || !design.width) return 1
  const scale = alignmentScale > 0 ? alignmentScale : 1
  return (naturalWidth * scale) / design.width
}

/**
 * CSS `transform` for the design PNG element: native px → design CSS px (÷dpr)
 * → world (alignment) → screen (view). CSS composes right-to-left.
 */
export function designImageTransform(view: View, a: VAlignment, dpr: number): string {
  const sx = a.scale / dpr
  const sy = (a.scaleY ?? a.scale) / dpr
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z}) translate(${a.offsetX}px, ${a.offsetY}px) scale(${sx}, ${sy})`
}

/** CSS `transform` for the impl PNG element: native px → world (÷dpr) → screen. */
export function implImageTransform(view: View, dpr: number): string {
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z / dpr})`
}

/** CSS `transform` for a layer whose children are laid out in world units (marks). */
export function worldLayerTransform(view: View): string {
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`
}

/**
 * The alignment to PROJECT the design with. `aspectLock` drops the per-axis stretch.
 *
 * The aligner fits x and y independently, which is right for finding where things are and wrong for
 * looking at the reference: on this corpus it stretches designs by up to +53 % vertically, and no
 * one can judge proportion or type against that. Locking the aspect uses the x scale for both axes,
 * so the design reads as drawn — at the cost of not lining up vertically with the impl, which is
 * the trade a person makes deliberately when they want to LOOK at the design.
 */
export function projectionAlignment(a: VAlignment, aspectLock: boolean): VAlignment {
  if (!aspectLock) return a
  return { scale: a.scale, scaleY: a.scale, offsetX: a.offsetX, offsetY: a.offsetY }
}

/**
 * How the design frame is REGISTERED onto the impl for display.
 *
 * `anchors` is the run's own measured fit — where the matched strings say the design landed. It is
 * the truth about the comparison and the wrong answer surprisingly often: the fit is a regression
 * over anchors, so on a page whose two sides differ structurally it can offset the whole frame by
 * tens of px (and its intercept is fitted against a per-axis STRETCH the display refuses to show,
 * which drags the isotropic projection further off). The corner modes are the manual fallback a
 * person reaches for when the fit reads wrong: register the frames by an edge instead, and read the
 * difference off the other edge.
 *
 * Every mode is isotropic — none of them reintroduces the stretch (architecture.md, "The UI never
 * stretches the reference").
 */
export type AlignMode = "anchors" | "width" | "left" | "right"

export const ALIGN_MODES: readonly AlignMode[] = ["anchors", "width", "left", "right"]

/** The comps' menu labels (RefDiff Comparison Tool, `ALIGN`). */
export const ALIGN_LABELS: Record<AlignMode, string> = {
  anchors: "Anchors",
  width: "Width",
  left: "Top left",
  right: "Top right",
}

/** Material Symbols ligature per mode, as the comps draw them. */
export const ALIGN_ICONS: Record<AlignMode, string> = {
  anchors: "hub",
  width: "width",
  left: "north_west",
  right: "north_east",
}

/**
 * The menu's one-line description per mode. The comps' copy, except `width`:
 * the comp promises "panning stays independent per pane" and this viewer's
 * width mode is a registration on the one shared view (the lock button is
 * what makes panning independent), so that clause is not repeated here.
 */
export const ALIGN_DESCRIPTIONS: Record<AlignMode, string> = {
  anchors:
    "Locks the views on matched UI elements — corresponding parts stay aligned even when sizes drift.",
  width: "Matches zoom so both refs render at the same width, top-left corners together.",
  left: "Locks both views to a shared top-left origin — classic overlay for left-aligned layouts.",
  right: "Locks views by the top-right corner — useful for right-aligned or RTL layouts.",
}

/**
 * The display alignment for `mode`: design RAW CSS px → world (impl CSS px).
 *
 * - `anchors` — the run's fit, aspect-locked.
 * - `width`   — scale the frame to the impl's width, corners at the origin (the two corner modes
 *               coincide once the widths match, so this is the one "scaled" registration).
 * - `left`    — 1:1, top-left corner.
 * - `right`   — 1:1, top-RIGHT corner: what you want when the frames differ by a left-hand rail.
 */
export function displayAlignment(
  mode: AlignMode,
  run: VAlignment,
  rawDesign: Size,
  impl: Size,
): VAlignment {
  if (mode === "anchors") return projectionAlignment(run, true)
  if (mode === "width") {
    const scale = rawDesign.w > 0 ? impl.w / rawDesign.w : 1
    return { scale, scaleY: scale, offsetX: 0, offsetY: 0 }
  }
  const offsetX = mode === "right" ? impl.w - rawDesign.w : 0
  return { scale: 1, scaleY: 1, offsetX, offsetY: 0 }
}

/** How much the run's fit stretches the design vertically; 1 = not at all. */
export function aspectStretch(a: VAlignment): number {
  const sy = a.scaleY ?? a.scale
  return a.scale === 0 ? 1 : sy / a.scale
}

/**
 * Per-axis map from RUN world space (where every finding box and annotation shape lives, baked
 * through the run's alignment) into the world space the design is DRAWN in.
 *
 * `world_run = run(d)` and `world_shown = display(d)`, so `world_shown = k·world_run + t` with
 * `k = display.scale / run.scale` and `t = display.offset − k·run.offset`. Identity when the two
 * agree; identity too when a degenerate run scale would divide by zero.
 */
export function alignRemap(
  run: VAlignment,
  display: VAlignment,
): { kx: number; tx: number; ky: number; ty: number } {
  const axis = (
    runScale: number,
    runOffset: number,
    dispScale: number,
    dispOffset: number,
  ): [number, number] => {
    if (runScale === 0) return [1, 0]
    const k = dispScale / runScale
    return [k, dispOffset - k * runOffset]
  }
  const [kx, tx] = axis(run.scale, run.offsetX, display.scale, display.offsetX)
  const [ky, ty] = axis(
    run.scaleY ?? run.scale,
    run.offsetY,
    display.scaleY ?? display.scale,
    display.offsetY,
  )
  return { kx, tx, ky, ty }
}

/**
 * CSS `transform` for the DESIGN mark layer. Finding boxes are baked into world space through the
 * run's own (possibly anisotropic) alignment, so any display alignment that differs from it — the
 * aspect lock, or a corner registration the reader chose — has to be applied to the design side's
 * marks as well, otherwise they float off the image they annotate.
 */
export function designLayerTransform(view: View, run: VAlignment, display: VAlignment): string {
  const base = worldLayerTransform(view)
  const { kx, tx, ky, ty } = alignRemap(run, display)
  if (kx === 1 && ky === 1 && tx === 0 && ty === 0) return base
  return `${base} translate(${tx}px, ${ty}px) scale(${kx}, ${ky})`
}

/** RUN world point → the point the design layer draws it at (the inverse is `worldFromShown`). */
export function shownFromWorld(
  p: { x: number; y: number },
  run: VAlignment,
  display: VAlignment,
): { x: number; y: number } {
  const { kx, tx, ky, ty } = alignRemap(run, display)
  return { x: p.x * kx + tx, y: p.y * ky + ty }
}

/** Where the design layer draws → RUN world: what a pointer on the design pane means. */
export function worldFromShown(
  p: { x: number; y: number },
  run: VAlignment,
  display: VAlignment,
): { x: number; y: number } {
  const { kx, tx, ky, ty } = alignRemap(run, display)
  return { x: kx === 0 ? p.x : (p.x - tx) / kx, y: ky === 0 ? p.y : (p.y - ty) / ky }
}

/**
 * The pane's edges hidden under panels drawn OVER it. The phone's rail is a
 * bottom sheet on top of the canvas (44px closed, 52% open), so a fit into the
 * whole pane centres the frame under the sheet. A panel counts only when it is
 * anchored along a pane edge across that edge's full length; a floating pill
 * (the phone's tool strip, the zoom pill) overlaps a corner and is ignored —
 * pills are meant to sit over the canvas. A panel outside the pane (the
 * desktop rail, a flex sibling) or hidden (0×0) contributes nothing. Screen px.
 */
export function paneInsets(pane: VBox, panels: VBox[], eps = 1): Insets {
  const out = { ...NO_INSETS }
  const pr = pane.x + pane.w
  const pb = pane.y + pane.h
  for (const p of panels) {
    const r = p.x + p.w
    const b = p.y + p.h
    const overlaps = p.w > 0 && p.h > 0 && p.x < pr && r > pane.x && p.y < pb && b > pane.y
    if (!overlaps) continue
    const spansW = p.x <= pane.x + eps && r >= pr - eps
    const spansH = p.y <= pane.y + eps && b >= pb - eps
    if (spansW && b >= pb - eps) out.bottom = Math.max(out.bottom, pb - Math.max(p.y, pane.y))
    if (spansW && p.y <= pane.y + eps) out.top = Math.max(out.top, Math.min(b, pb) - pane.y)
    if (spansH && r >= pr - eps) out.right = Math.max(out.right, pr - Math.max(p.x, pane.x))
    if (spansH && p.x <= pane.x + eps) out.left = Math.max(out.left, Math.min(r, pr) - pane.x)
  }
  return out
}

/**
 * Zoom so `world` fits inside a pane of `pane` px with `pad` px of margin,
 * centred in the part of the pane that `inset` leaves visible (see paneInsets).
 */
export function fitView(world: VBox, pane: Size, pad = 24, maxZoom = 1.6, inset: Insets = NO_INSETS): View {
  // The comps' fit: 24px of air round the artboard, never blown up past 1.6× —
  // a small component fitted at 4× is a blur, not a reference.
  const availW = Math.max(1, pane.w - inset.left - inset.right - 2 * pad)
  const availH = Math.max(1, pane.h - inset.top - inset.bottom - 2 * pad)
  const z = Math.min(maxZoom, availW / Math.max(1e-6, world.w), availH / Math.max(1e-6, world.h))
  return {
    z,
    tx: inset.left + pad + (availW - world.w * z) / 2 - world.x * z,
    ty: inset.top + pad + (availH - world.h * z) / 2 - world.y * z,
  }
}

/** Zoom by `factor` keeping the world point under screen (px, py) fixed. */
export function zoomAt(
  view: View,
  factor: number,
  px: number,
  py: number,
  min = 0.05,
  max = 40,
): View {
  const z = Math.min(max, Math.max(min, view.z * factor))
  const f = z / view.z
  return { z, tx: px - (px - view.tx) * f, ty: py - (py - view.ty) * f }
}

export function panBy(view: View, dx: number, dy: number): View {
  return { z: view.z, tx: view.tx + dx, ty: view.ty + dy }
}

/** Two fingers, reduced to what a pinch is made of: their span and their midpoint, in pane px. */
export interface Pinch {
  dist: number
  x: number
  y: number
}

/**
 * The pinch the currently tracked pointers describe, relative to a pane's top-left `origin`.
 *
 * Fingers past the first two are ignored rather than refused: a third finger landing mid-gesture
 * must not stop the zoom dead, which is how a three-fingered grab used to read.
 */
export function pinchOf(
  points: readonly { x: number; y: number }[],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): Pinch | null {
  if (points.length < 2) return null
  const [a, b] = points as [{ x: number; y: number }, { x: number; y: number }]
  return {
    dist: Math.hypot(a.x - b.x, a.y - b.y),
    x: (a.x + b.x) / 2 - origin.x,
    y: (a.y + b.y) / 2 - origin.y,
  }
}

/**
 * The view after the fingers moved from `prev` to `next`: zoom by the change in span about the
 * midpoint, then pan by the midpoint's own travel — a pinch is a zoom AND a drag, and dropping the
 * second half makes the frame swim away from under the fingers.
 *
 * A zero span (both fingers reported on one point, which a coalesced touch does produce) would
 * divide to Infinity and put NaN into the transform, killing the view for the rest of the session;
 * it zooms by 1 instead.
 */
export function pinchView(view: View, prev: Pinch, next: Pinch): View {
  const factor = prev.dist > 0 && next.dist > 0 ? next.dist / prev.dist : 1
  return panBy(zoomAt(view, factor, next.x, next.y), next.x - prev.x, next.y - prev.y)
}

/** Air around a focused element: enough to see what it sits next to. */
export const FOCUS_CONTEXT_PX = 70
/**
 * An element smaller than this is focused as if it were this big. THIS is the
 * limit that matters: without it a 0×0 comment anchor or a 14px badge divides
 * into an absurd magnification, and the cap alone would put every small thing
 * at the ceiling.
 */
export const FOCUS_MIN_BOX_PX = 60
/** …and the ceiling, so a point lands at 220% rather than 500%. */
export const FOCUS_MAX_ZOOM = 2.2

/**
 * Centre `box` in the visible part of the pane (see paneInsets) at a zoom that
 * SHOWS it: the element plus `FOCUS_CONTEXT_PX` of air on each side, treating
 * anything under `FOCUS_MIN_BOX_PX` as that size, capped at `FOCUS_MAX_ZOOM`.
 * Bigger than the pane → it zooms OUT, because you asked for that element and
 * should see all of it.
 *
 * It deliberately does NOT depend on the current zoom. It used to: the zoom was
 * clamped to `max(current.z, 1)` over a fit that padded by a third of the pane
 * on every side, and the two together meant it never magnified anything —
 * measured on a 496×734 pane, selecting ANY element from 100% left you at 100%,
 * and from a whole-page 50% it stepped to a flat 100% whether the element was a
 * 14px badge or a 608px dropzone. Re-centring did all the work and a badge
 * stayed a speck. The comps' own focusOn is this rule, and it is what the numbers
 * now agree with: a point 220%, a 200×48 button 146%, a heading 87%, a
 * full-page box 60%.
 *
 * The insets bound the ZOOM as well as the centring, which is where this parts
 * company with the comps: they size from the pane's full height and ignore their
 * own bottom sheet, so an element can be scaled to fit space that is behind it.
 * Cost of being right: the phone lands at ~115% where the comp draws 123%.
 */
export function focusView(box: VBox, pane: Size, inset: Insets = NO_INSETS): View {
  const vw = Math.max(1, pane.w - inset.left - inset.right)
  const vh = Math.max(1, pane.h - inset.top - inset.bottom)
  const w = Math.max(box.w, FOCUS_MIN_BOX_PX) + 2 * FOCUS_CONTEXT_PX
  const h = Math.max(box.h, FOCUS_MIN_BOX_PX) + 2 * FOCUS_CONTEXT_PX
  const z = Math.min(vw / w, vh / h, FOCUS_MAX_ZOOM)
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return { z, tx: inset.left + vw / 2 - cx * z, ty: inset.top + vh / 2 - cy * z }
}

/** Screen point in a pane → world point. */
export function screenToWorld(view: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - view.tx) / view.z, y: (py - view.ty) / view.z }
}
