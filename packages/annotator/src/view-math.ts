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

/** How much the run's fit stretches the design vertically; 1 = not at all. */
export function aspectStretch(a: VAlignment): number {
  const sy = a.scaleY ?? a.scale
  return a.scale === 0 ? 1 : sy / a.scale
}

/**
 * CSS `transform` for the DESIGN mark layer. Finding boxes are baked into world space through the
 * run's own (possibly anisotropic) alignment, so locking the aspect has to undo that stretch on the
 * design side only — otherwise the marks float off the image they annotate.
 */
export function designLayerTransform(view: View, a: VAlignment, aspectLock: boolean): string {
  const base = worldLayerTransform(view)
  const sy = a.scaleY ?? a.scale
  if (!aspectLock || sy === a.scale || sy === 0) return base
  const k = a.scale / sy
  return `${base} translate(0px, ${a.offsetY * (1 - k)}px) scale(1, ${k})`
}

/** Zoom so `world` fits inside a pane of `pane` px with `pad` px of margin, centred. */
export function fitView(world: VBox, pane: Size, pad = 16): View {
  const availW = Math.max(1, pane.w - 2 * pad)
  const availH = Math.max(1, pane.h - 2 * pad)
  const z = Math.min(availW / Math.max(1e-6, world.w), availH / Math.max(1e-6, world.h))
  return {
    z,
    tx: pad + (availW - world.w * z) / 2 - world.x * z,
    ty: pad + (availH - world.h * z) / 2 - world.y * z,
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

/**
 * Centre `box` in the pane at a zoom that shows it with context: at least
 * `minZoom`, at most what fits the box into a third of the pane.
 */
export function focusView(box: VBox, pane: Size, current: View, minZoom = 1): View {
  const fit = fitView(box, pane, Math.min(pane.w, pane.h) / 3)
  const z = Math.max(minZoom, Math.min(fit.z, Math.max(current.z, minZoom)))
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  return { z, tx: pane.w / 2 - cx * z, ty: pane.h / 2 - cy * z }
}

/** Screen point in a pane → world point. */
export function screenToWorld(view: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - view.tx) / view.z, y: (py - view.ty) / view.z }
}
