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
  design: { width: number; dpr?: number; bleed?: VBleed },
  alignmentScale: number,
): number {
  if (design.dpr && design.dpr > 0) return design.dpr
  if (!naturalWidth || !design.width) return 1
  const scale = alignmentScale > 0 ? alignmentScale : 1
  // The PNG is the RAW capture plus its bleed margin, so the raw CSS width the
  // ratio is against is (width / scale + left + right), scaled back up.
  const outset = (bleedOf(design).left + bleedOf(design).right) * scale
  return (naturalWidth * scale) / (design.width + outset)
}

/**
 * Margin captured around a side's node, in that side's own CSS px. A capture
 * made before `--bleed`, or one that asked for none, has no field and reads as
 * zero — which is the identity for every use below.
 */
export interface VBleed {
  top: number
  right: number
  bottom: number
  left: number
}
const ZERO_BLEED: VBleed = { top: 0, right: 0, bottom: 0, left: 0 }
export const bleedOf = (side: { bleed?: VBleed } | undefined): VBleed => side?.bleed ?? ZERO_BLEED

/**
 * Where a side's PNG starts, in that side's own CSS px: `(-left, -top)`.
 *
 * Every consumer that DRAWS a capture needs this and nothing else. The element
 * boxes, the alignment and every finding stay exactly where they were — bleed
 * moves the picture under them, never them.
 */
export const bleedOrigin = (side: { bleed?: VBleed } | undefined): { x: number; y: number } => {
  const b = bleedOf(side)
  // `|| 0` normalises -0, which negating a zero produces and which reads back as
  // "translate(-0px)" in a transform and as a failed toEqual in a test.
  return { x: -b.left || 0, y: -b.top || 0 }
}

/**
 * CSS `transform` for the design PNG element: native px → design CSS px (÷dpr)
 * → world (alignment) → screen (view). CSS composes right-to-left.
 */
export function designImageTransform(
  view: View,
  a: VAlignment,
  dpr: number,
  bleed: VBleed = ZERO_BLEED,
): string {
  const sx = a.scale
  const sy = a.scaleY ?? a.scale
  const base = `translate(${view.tx}px, ${view.ty}px) scale(${view.z}) translate(${a.offsetX}px, ${a.offsetY}px)`
  // The bleed shift is in RAW DESIGN CSS px, so it goes AFTER the alignment
  // scale and BEFORE the ÷dpr — which is why this chain splits what used to be
  // one scale(sx/dpr) into two. With no bleed the two forms are identical.
  const o = bleedOrigin({ bleed })
  return `${base} scale(${sx}, ${sy}) translate(${o.x}px, ${o.y}px) scale(${1 / dpr})`
}

/** CSS `transform` for the impl PNG element: native px → world (÷dpr) → screen. */
export function implImageTransform(view: View, dpr: number, bleed: VBleed = ZERO_BLEED): string {
  const base = `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`
  // World px ARE impl CSS px, so the shift is applied in world space directly.
  const o = bleedOrigin({ bleed })
  return `${base} translate(${o.x}px, ${o.y}px) scale(${1 / dpr})`
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
 * The pane's edges hidden under panels drawn OVER it, so a fit can solve for the part of the canvas
 * that is actually VISIBLE rather than for the pane.
 *
 * Each overlapping panel is cleared by insetting exactly ONE edge — the one that costs the least
 * AREA (its extent from that edge × the pane's extent along it). That one rule covers every shape
 * of chrome this app draws: a full-width bottom sheet reads as a bottom inset, a full-height strip
 * as a left or right one, and a floating pill as an inset on the edge it hugs, because a 223×29
 * pill at the top-left costs 45px of height against 231px of width — so the top gives way and the
 * canvas keeps its width. Panels are assumed to be edge-anchored chrome; one floating dead-centre
 * would still take its cheapest edge, which is the best a fit can do and a strange thing to draw.
 *
 * A panel outside the pane (the desktop rail, a flex sibling) or hidden (0×0) contributes nothing.
 * Screen px.
 *
 * Until 2026-09-03 a panel counted only when it SPANNED its edge, on the reasoning that a pill is
 * meant to sit over the canvas. It is — but the base fit then solved for space BEHIND the pills, so
 * every fit put the artboard's top rows under the floating Show control and its bottom under the
 * tool strip. Fitting the visible canvas is the whole job of a fit, and the zoom follows from the
 * same insets (see fitView), not just the centring.
 */
export function paneInsets(pane: VBox, panels: VBox[], eps = 1): Insets {
  const out = { ...NO_INSETS }
  const pr = pane.x + pane.w
  const pb = pane.y + pane.h
  for (const p of panels) {
    const r = p.x + p.w
    const b = p.y + p.h
    const overlaps =
      p.w > 0 && p.h > 0 && p.x < pr - eps && r > pane.x + eps && p.y < pb - eps && b > pane.y + eps
    if (!overlaps) continue
    // What clearing this panel costs on each edge: how deep the inset has to be, and how much of
    // the pane that depth sweeps. Cheapest area wins; ties go to the first, which is top/bottom —
    // a landscape pane loses height more happily than width.
    const options: { edge: keyof Insets; px: number; along: number }[] = [
      { edge: "top", px: Math.min(b, pb) - pane.y, along: pane.w },
      { edge: "bottom", px: pb - Math.max(p.y, pane.y), along: pane.w },
      { edge: "left", px: Math.min(r, pr) - pane.x, along: pane.h },
      { edge: "right", px: pr - Math.max(p.x, pane.x), along: pane.h },
    ]
    let best = options[0]!
    for (const o of options) if (o.px * o.along < best.px * best.along) best = o
    out[best.edge] = Math.max(out[best.edge], best.px)
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

/* ------------------------------------------------- the variant sheet ----- */

/**
 * A GALLERY is one variant set drawn as a grid of pair views.
 *
 * The whole point of this section is that it adds no second geometry. A pair
 * view maps `Finding.implBox` — impl CSS px — straight into the world above;
 * a gallery maps the same boxes into the same world after ONE translation per
 * cell. So `cellOrigin` is the entire difference between the two surfaces, and
 * the pair view is the degenerate case: one cell, no gutter, origin (0, 0).
 * That identity is asserted in the tests, because it is the thing that keeps
 * one renderer honest for both — the moment a sheet needs its own projection,
 * findings and notes stop being expressible in pair coordinates and every
 * `annotations.md` written so far becomes unreadable.
 *
 * Cells differ wildly in size (a button 76×40, a checkbox row 120×20, an alert
 * ~1300×72), so a uniform cell would either crop the alert or pad the button
 * into a speck. Column width and row height are therefore the MAX over that
 * column and that row — of both sides, since a cell whose impl is wider than
 * its design must show both.
 */
export interface GalleryCellInput {
  /** Stable identity — the cell's option values, not its position. */
  key: string
  row: number
  col: number
  /**
   * The run dir, when this cell became a pair. Absent is meaningful: a skipped
   * or never-declared cell occupies its place in the grid and has nothing to
   * draw, which is precisely what the sheet exists to show.
   */
  pairDir?: string
  /**
   * The cell's content size — the max of its design and impl frames, in impl
   * CSS px. Absent for a cell that was never measured; `minCell` then sizes it,
   * because a zero-width column would collapse its own header.
   */
  size?: Size
}

export interface GalleryCell extends GalleryCellInput {
  /**
   * The cell's CONTENT box in sheet world space — where its screenshot goes and
   * what a finding's box is relative to.
   *
   * CENTRED in the track, because the comp is: every cell is a flex box with
   * `alignItems: center, justifyContent: center` in a fixed 176x96. Anchoring
   * content at the track's corner instead offsets every cell by half its own
   * slack, which is content-size-dependent and therefore absorbed by NO single
   * alignment — measured as the pair's vertical confidence stuck at 0.40 against
   * 0.71 horizontal while the fit reported a clean identity.
   */
  rect: VBox
  /** The full track box — the slot, which is what a cell's outline draws. */
  track: VBox
}

/** One column header or row label, with the span it heads. */
export interface GalleryTick {
  index: number
  /** Offset along the axis, in sheet world px. */
  at: number
  extent: number
}

export interface GalleryLayout {
  cells: GalleryCell[]
  columns: GalleryTick[]
  rows: GalleryTick[]
  /** Column widths and row heights as solved, in grid order. */
  colWidths: number[]
  rowHeights: number[]
  /** The sheet's whole box, gutters included — what `fitView` is given. */
  world: VBox
}

export interface GalleryLayoutInput {
  cells: readonly GalleryCellInput[]
  /** Grid extent, declared rather than inferred — see `galleryLayout`. */
  rows: number
  columns: number
  /** Size for a cell with nothing measured in it. */
  minCell?: Size
  /** Air inside each cell, around its content. */
  pad?: number
  /** Width of the row-label column and height of the column-header row. */
  gutter?: Size
}

/**
 * The MINIMUM cell, and it reconciles two rules that looked opposed.
 *
 * The plan sizes tracks from content — "row height / column width from the max
 * of both sides per row/column" — because cells differ wildly on a real design
 * system: a button 76x40, a checkbox row 120x20, an alert ~1300x72, and a
 * uniform cell either crops the alert or shrinks the button to a speck. The
 * Gallery comp, whose subject is a Button sheet, draws a FIXED 176x96.
 *
 * Both are right about their own case, so the minimum IS the comp's cell and
 * growth is the plan's rule: 152 + 2x12 of padding = 176 across, 72 + 24 = 96
 * down. A Button sheet then lands exactly on the comp's grid while an alert
 * still gets its 1300. Measured: the pair's vertical alignment confidence was
 * stuck at 0.40 against 0.71 horizontal — a systematic row-rhythm difference,
 * which is what a wrong track height looks like and what no per-element finding
 * shows.
 *
 * Change these together with `GALLERY_PAD`: it is the SUM that has to equal the
 * comp's cell, and a reader who edits one will not think to check the other.
 */
export const GALLERY_MIN_CELL: Size = { w: 152, h: 72 }
export const GALLERY_PAD = 12
/** The comp's label column (LW) and header row (LH), verbatim. */
export const GALLERY_GUTTER: Size = { w: 118, h: 30 }

/**
 * Where a cell's own coordinate space begins, in sheet world px.
 *
 * This is the composition the whole surface rests on: a finding at
 * `implBox = { x, y }` in the pair view is at `implBox + cellOrigin(row, col)`
 * on the sheet, and a note authored on the sheet subtracts the same offset to
 * be stored in the pair's own coordinates. Nothing else translates.
 *
 * Takes the SOLVED widths so it cannot disagree with `galleryLayout` about
 * where a cell starts — passing the inputs again and re-solving is how two
 * copies of a layout drift apart.
 */
export function cellOrigin(
  colWidths: readonly number[],
  rowHeights: readonly number[],
  row: number,
  col: number,
  pad = GALLERY_PAD,
  gutter: Size = GALLERY_GUTTER,
): { x: number; y: number } {
  let x = gutter.w
  for (let c = 0; c < col; c++) x += colWidths[c] ?? 0
  let y = gutter.h
  for (let r = 0; r < row; r++) y += rowHeights[r] ?? 0
  return { x: x + pad, y: y + pad }
}

/** One side of a cell as its report records it: the capture's frame and its margin. */
export interface CellSide {
  width: number
  height: number
  bleed?: VBleed
}

/** Where one side of a cell is drawn: the element frame, and the PNG around it. */
export interface CellPlacement {
  /** The capture's own frame — what a slot outline hugs. */
  box: VBox
  /**
   * The picture, ESTIMATED as the frame plus whatever margin `--bleed` captured.
   * Good enough to lay out before the image has loaded, and up to ~1.2px wrong —
   * see `cellPngBox`, which is the size to use once it has.
   */
  png: VBox
  /** The registration scale applied to this side; 1 on the impl, always. */
  scale: number
  scaleY: number
}

/**
 * The picture's TRUE css box, once the image has loaded — its OWN pixels, rather
 * than the frame-plus-bleed the layout guessed.
 *
 * A browser clips an element screenshot to whole DEVICE pixels, so a fractional
 * element width comes back rounded outward: a 106.81px button with 8px of bleed
 * is 122.81 css px of content and a 124 css px PNG. Stretching that picture into
 * the 122.81 box scales it by 0.99 — every mark inside drifts by up to the 1.19px
 * of excess, worst at the far edge. Measured on one corpus: 54 of 416 captures,
 * every one of them a fractional width.
 *
 * The origin does NOT move: it stays the element origin minus the bleed, so the
 * excess lands on the right and the bottom, which is where the outward rounding
 * put it. That is also exactly what the pair view does (`designImageTransform`
 * scales the natural pixels by 1/dpr), so the two surfaces place one capture the
 * same way — the property the whole gallery section rests on.
 */
export function cellPngBox(at: CellPlacement, natural: Size, dpr: number): VBox {
  const d = dpr > 0 ? dpr : 1
  return {
    x: at.png.x,
    y: at.png.y,
    w: (natural.w / d) * at.scale,
    h: (natural.h / d) * at.scaleY,
  }
}

/** `box` grown by a bleed expressed in that side's own CSS px, hence the scale. */
function withBleed(box: VBox, b: VBleed, sx: number, sy: number): VBox {
  return {
    x: box.x - b.left * sx,
    y: box.y - b.top * sy,
    w: box.w + (b.left + b.right) * sx,
    h: box.h + (b.top + b.bottom) * sy,
  }
}

/**
 * Where a cell's two captures land on a sheet, under the reader's align mode.
 *
 * A sheet is not one registration but N of them, and this is where they are
 * decided. The sheet's own `report.alignment` is the identity — the world IS
 * the grid — so feeding the align pill the sheet's alignment made all four
 * modes collapse onto each other and the control did nothing at all. Each CELL
 * still has a design and an impl that can be registered against each other, and
 * that is what the reader is asking for: `left` puts every cell's design at its
 * own cell origin, `right` registers each by its own top-right, `width` scales
 * each design to its own impl's width, `anchors` keeps each cell's measured fit.
 *
 * The impl side never moves: world px ARE impl CSS px, which is what makes one
 * renderer serve both surfaces (see `cellOrigin`).
 *
 * Two details that a corpus of same-size captures cannot show, so they are
 * asserted rather than observed:
 *
 * - `anchors` is ASPECT-LOCKED, like the pair view's. The run fits x and y
 *   independently; drawing the design under that stretch is fine for locating a
 *   box and wrong for looking at a reference, and a reader cannot tell a
 *   stretched reference from a badly-drawn one. The sheet used to take
 *   `design.height` verbatim, stretch included.
 * - the design's bleed is in RAW design CSS px, so it is scaled by the
 *   registration; the impl's is already world px. The sheet used to add both
 *   unscaled to an already-scaled width, which is exact only while the scale is
 *   1 — as it is on all 208 pairs of the corpus this was found on.
 */
export function cellPlacement(
  mode: AlignMode,
  rect: { x: number; y: number },
  design: CellSide,
  impl: CellSide,
  run: VAlignment,
): { design: CellPlacement; impl: CellPlacement } {
  const implBox: VBox = { x: rect.x, y: rect.y, w: impl.width, h: impl.height }
  const raw = rawDesignSize(design, run)
  const d = displayAlignment(mode, run, raw, { w: impl.width, h: impl.height })
  const sx = d.scale
  const sy = d.scaleY ?? d.scale
  const designBox: VBox = {
    x: rect.x + d.offsetX,
    y: rect.y + d.offsetY,
    w: raw.w * sx,
    h: raw.h * sy,
  }
  return {
    design: { box: designBox, png: withBleed(designBox, bleedOf(design), sx, sy), scale: sx, scaleY: sy },
    impl: { box: implBox, png: withBleed(implBox, bleedOf(impl), 1, 1), scale: 1, scaleY: 1 },
  }
}

/**
 * Solve a sheet: per-column widths, per-row heights, every cell's rect, and
 * the world box that holds the lot.
 *
 * `rows` / `columns` are DECLARED, not inferred from the cells, and that is
 * load-bearing: the axes decide the grid's extent, and a set whose last column
 * skipped every one of its cells still has that column. Inferring the extent
 * from the cells present would silently drop it — the absence the set index
 * exists to make visible would become invisible again in the one surface built
 * to show it.
 *
 * Out-of-range cells are dropped rather than growing the grid, for the same
 * reason: the axes are the authority on shape, so a cell outside them is a
 * resolver bug and quietly widening the sheet would hide it.
 */
export function galleryLayout(input: GalleryLayoutInput): GalleryLayout {
  const pad = input.pad ?? GALLERY_PAD
  const gutter = input.gutter ?? GALLERY_GUTTER
  const min = input.minCell ?? GALLERY_MIN_CELL
  const nCols = Math.max(0, input.columns)
  const nRows = Math.max(0, input.rows)

  const inGrid = input.cells.filter(
    (c) => c.row >= 0 && c.row < nRows && c.col >= 0 && c.col < nCols,
  )

  const colWidths = new Array<number>(nCols).fill(min.w + 2 * pad)
  const rowHeights = new Array<number>(nRows).fill(min.h + 2 * pad)
  for (const c of inGrid) {
    const w = Math.max(c.size?.w ?? 0, min.w) + 2 * pad
    const h = Math.max(c.size?.h ?? 0, min.h) + 2 * pad
    colWidths[c.col] = Math.max(colWidths[c.col]!, w)
    rowHeights[c.row] = Math.max(rowHeights[c.row]!, h)
  }

  const columns: GalleryTick[] = []
  let x = gutter.w
  for (let i = 0; i < nCols; i++) {
    columns.push({ index: i, at: x, extent: colWidths[i]! })
    x += colWidths[i]!
  }
  const rows: GalleryTick[] = []
  let y = gutter.h
  for (let i = 0; i < nRows; i++) {
    rows.push({ index: i, at: y, extent: rowHeights[i]! })
    y += rowHeights[i]!
  }

  const cells = inGrid.map((c) => {
    const o = cellOrigin(colWidths, rowHeights, c.row, c.col, pad, gutter)
    const track = {
      x: o.x,
      y: o.y,
      w: colWidths[c.col]! - 2 * pad,
      h: rowHeights[c.row]! - 2 * pad,
    }
    // The content's own size, CENTRED in its track. A cell with no measured size
    // (skipped, absent) fills its track: there is nothing to centre, and a
    // zero-size content box would give its findings — if any ever arrive — an
    // origin at the track's middle rather than its corner.
    const cw = Math.min(c.size?.w ?? track.w, track.w)
    const ch = Math.min(c.size?.h ?? track.h, track.h)
    return {
      ...c,
      track,
      rect: {
        x: track.x + (track.w - cw) / 2,
        y: track.y + (track.h - ch) / 2,
        w: cw,
        h: ch,
      },
    }
  })

  return { cells, columns, rows, colWidths, rowHeights, world: { x: 0, y: 0, w: x, h: y } }
}

/**
 * Project a pair-space box onto the sheet — the one operation findings and
 * notes need, in both directions (`unprojectCellBox` is its inverse).
 */
export function projectCellBox(box: VBox, cell: GalleryCell): VBox {
  return { x: box.x + cell.rect.x, y: box.y + cell.rect.y, w: box.w, h: box.h }
}

/** Sheet-space box → the pair's own coordinates, for storing a note. */
export function unprojectCellBox(box: VBox, cell: GalleryCell): VBox {
  return { x: box.x - cell.rect.x, y: box.y - cell.rect.y, w: box.w, h: box.h }
}
