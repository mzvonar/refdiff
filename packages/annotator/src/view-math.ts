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
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VAlignment {
  scale: number;
  scaleY?: number;
  offsetX: number;
  offsetY: number;
}

export interface View {
  /** World → screen zoom factor. */
  z: number;
  tx: number;
  ty: number;
}

export interface Size {
  w: number;
  h: number;
}

export const IDENTITY_ALIGNMENT: VAlignment = { scale: 1, offsetX: 0, offsetY: 0 };

/** Design CSS px → world (impl CSS px). */
export function designToWorld(p: { x: number; y: number }, a: VAlignment): { x: number; y: number } {
  return { x: p.x * a.scale + a.offsetX, y: p.y * (a.scaleY ?? a.scale) + a.offsetY };
}

/** World → design CSS px (inverse of `designToWorld`). */
export function worldToDesign(p: { x: number; y: number }, a: VAlignment): { x: number; y: number } {
  return { x: (p.x - a.offsetX) / a.scale, y: (p.y - a.offsetY) / (a.scaleY ?? a.scale) };
}

/** The world-space box the design image covers (its CSS size through the alignment). */
export function designWorldBox(designCss: Size, a: VAlignment): VBox {
  return { x: a.offsetX, y: a.offsetY, w: designCss.w * a.scale, h: designCss.h * (a.scaleY ?? a.scale) };
}

export function unionBoxes(boxes: readonly VBox[]): VBox {
  const first = boxes[0];
  if (!first) return { x: 0, y: 0, w: 0, h: 0 };
  let x0 = first.x;
  let y0 = first.y;
  let x1 = first.x + first.w;
  let y1 = first.y + first.h;
  for (const b of boxes) {
    x0 = Math.min(x0, b.x);
    y0 = Math.min(y0, b.y);
    x1 = Math.max(x1, b.x + b.w);
    y1 = Math.max(y1, b.y + b.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * CSS `transform` for the design PNG element: native px → design CSS px (÷dpr)
 * → world (alignment) → screen (view). CSS composes right-to-left.
 */
export function designImageTransform(view: View, a: VAlignment, dpr: number): string {
  const sx = a.scale / dpr;
  const sy = (a.scaleY ?? a.scale) / dpr;
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z}) translate(${a.offsetX}px, ${a.offsetY}px) scale(${sx}, ${sy})`;
}

/** CSS `transform` for the impl PNG element: native px → world (÷dpr) → screen. */
export function implImageTransform(view: View, dpr: number): string {
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z / dpr})`;
}

/** CSS `transform` for a layer whose children are laid out in world units (marks). */
export function worldLayerTransform(view: View): string {
  return `translate(${view.tx}px, ${view.ty}px) scale(${view.z})`;
}

/** Zoom so `world` fits inside a pane of `pane` px with `pad` px of margin, centred. */
export function fitView(world: VBox, pane: Size, pad = 16): View {
  const availW = Math.max(1, pane.w - 2 * pad);
  const availH = Math.max(1, pane.h - 2 * pad);
  const z = Math.min(availW / Math.max(1e-6, world.w), availH / Math.max(1e-6, world.h));
  return {
    z,
    tx: pad + (availW - world.w * z) / 2 - world.x * z,
    ty: pad + (availH - world.h * z) / 2 - world.y * z,
  };
}

/** Zoom by `factor` keeping the world point under screen (px, py) fixed. */
export function zoomAt(view: View, factor: number, px: number, py: number, min = 0.05, max = 40): View {
  const z = Math.min(max, Math.max(min, view.z * factor));
  const f = z / view.z;
  return { z, tx: px - (px - view.tx) * f, ty: py - (py - view.ty) * f };
}

export function panBy(view: View, dx: number, dy: number): View {
  return { z: view.z, tx: view.tx + dx, ty: view.ty + dy };
}

/**
 * Centre `box` in the pane at a zoom that shows it with context: at least
 * `minZoom`, at most what fits the box into a third of the pane.
 */
export function focusView(box: VBox, pane: Size, current: View, minZoom = 1): View {
  const fit = fitView(box, pane, Math.min(pane.w, pane.h) / 3);
  const z = Math.max(minZoom, Math.min(fit.z, Math.max(current.z, minZoom)));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { z, tx: pane.w / 2 - cx * z, ty: pane.h / 2 - cy * z };
}

/** Screen point in a pane → world point. */
export function screenToWorld(view: View, px: number, py: number): { x: number; y: number } {
  return { x: (px - view.tx) / view.z, y: (py - view.ty) / view.z };
}
